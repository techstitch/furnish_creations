<?php
/**
 * Lead form handler.
 *
 * Sends the enquiry to the business's inbox using the hosting account's own mail
 * server, and keeps a copy in the database so a mail delivery problem can never lose a
 * customer's details.
 *
 * This is a public endpoint — anyone can post to it — so it validates every field,
 * rate-limits by address, and never reflects user input back into the page.
 */

require_once __DIR__ . '/lib/bootstrap.php';

const ENQUIRY_MAX_PER_HOUR = 10;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Unsupported method.', 405);
}

$raw  = file_get_contents('php://input');
$body = $raw ? json_decode($raw, true) : null;
if (!is_array($body)) {
    // Also accept a normal form post, so the form still works if JavaScript is off.
    $body = $_POST;
}

function field($body, $key, $max)
{
    $value = isset($body[$key]) ? trim((string) $body[$key]) : '';
    // Newlines in a header-bound value are how header injection starts; strip them from
    // everything and let the body carry the free text.
    $value = str_replace(array("\r", "\n"), ' ', $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
}

$name         = field($body, 'name', 100);
$phone        = field($body, 'phone', 20);
$email        = field($body, 'email', 120);
$location     = field($body, 'location', 120);
$propertyType = field($body, 'propertyType', 40);

if ($name === '' || $phone === '') {
    fail('Please enter your name and phone number.');
}
if (!preg_match('/^[0-9+\s()-]{7,20}$/', $phone)) {
    fail('That phone number does not look right.');
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('That email address does not look right.');
}
// The form offers a fixed list; anything else means the post did not come from it.
if ($propertyType !== '' && !in_array($propertyType, array('Apartment', 'Villa', 'Office', 'Retail', 'Other'), true)) {
    fail('Please choose a property type from the list.');
}

/* ------------------------------------------------------------- rate limiting */

function enquiryIp()
{
    foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR') as $key) {
        if (!empty($_SERVER[$key])) {
            $candidate = trim(explode(',', $_SERVER[$key])[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }
    }
    return '0.0.0.0';
}

$pdo = db();
$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS enquiries (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(100) NOT NULL,
    phone         VARCHAR(20)  NOT NULL,
    email         VARCHAR(120) NOT NULL DEFAULT '',
    location      VARCHAR(120) NOT NULL DEFAULT '',
    property_type VARCHAR(40)  NOT NULL DEFAULT '',
    mailed        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL
);

$bucket = 'enq:' . substr(hash_hmac('sha256', enquiryIp(), IP_SALT), 0, 40) . ':' . floor(time() / 3600);
$stmt = $pdo->prepare(
    'INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE hits = hits + 1'
);
$stmt->execute(array($bucket, time() + 7200));
$stmt = $pdo->prepare('SELECT hits FROM rate_limit WHERE bucket = ?');
$stmt->execute(array($bucket));
if (((int) $stmt->fetchColumn()) > ENQUIRY_MAX_PER_HOUR) {
    fail('You have sent several enquiries already. Please call us instead.', 429);
}

/* -------------------------------------------------------------------- store */

// Saved before the mail is attempted, so an enquiry is never lost to a mail failure.
$stmt = $pdo->prepare(
    'INSERT INTO enquiries (name, phone, email, location, property_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)'
);
$stmt->execute(array($name, $phone, $email, $location, $propertyType, gmdate('Y-m-d H:i:s')));
$id = (int) $pdo->lastInsertId();

/* --------------------------------------------------------------------- mail */

try {
    $when = new DateTime('now', new DateTimeZone('Asia/Kolkata'));
} catch (Exception $e) {
    $when = new DateTime('now');
}

$lines = array(
    'New enquiry from the website',
    '',
    'Name:          ' . $name,
    'Phone:         ' . $phone,
    'Email:         ' . ($email !== '' ? $email : '—'),
    'Location:      ' . ($location !== '' ? $location : '—'),
    'Property type: ' . ($propertyType !== '' ? $propertyType : '—'),
    '',
    'Received:      ' . $when->format('d M Y, g:i a') . ' (India time)',
    'Reference:     #' . $id,
);

// The From address must be at this domain or the hosting's mail server will reject it
// as a forgery. The customer's address goes in Reply-To, so hitting reply still works.
$from    = 'website@' . preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'furnishcreations.in');
$headers = array(
    'From: Furnish Creations Website <' . $from . '>',
    'Content-Type: text/plain; charset=utf-8',
    'X-Mailer: PHP/' . phpversion(),
);
if ($email !== '') {
    $headers[] = 'Reply-To: ' . $email;
}

$sent = @mail(
    ENQUIRY_TO,
    'Website enquiry from ' . $name,
    implode("\n", $lines),
    implode("\r\n", $headers)
);

if ($sent) {
    $pdo->prepare('UPDATE enquiries SET mailed = 1 WHERE id = ?')->execute(array($id));
}

// The enquiry is safely stored either way, so the visitor is told it worked. A mail
// problem is the site owner's to notice, not the customer's to worry about.
ok(array('received' => true));
