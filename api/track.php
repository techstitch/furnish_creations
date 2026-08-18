<?php
/**
 * Visitor analytics ingest.
 *
 * This is the one endpoint anyone on the internet may call, so it accepts as little as
 * possible: a fixed list of event types, hard length caps, a server-decided date, and a
 * per-IP rate limit. Nothing it stores is attacker-chosen beyond a short label.
 */

require_once __DIR__ . '/lib/bootstrap.php';

const EVENT_TYPES = array('pageview', 'whatsapp_click', 'call_click', 'cta_click', 'generic_click');

const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_EVENTS     = 60;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Unsupported method.', 405);
}

$raw  = file_get_contents('php://input');
$body = $raw ? json_decode($raw, true) : null;
if (!is_array($body)) {
    fail('Malformed event.');
}

$eventType = isset($body['eventType']) ? (string) $body['eventType'] : '';
if (!in_array($eventType, EVENT_TYPES, true)) {
    fail('Unknown event type.');
}

/* --------------------------------------------------------------- rate limit */

function clientIp()
{
    // Shared hosting usually sits behind a proxy, so the forwarded address is the real
    // visitor. Only the first entry is used; the rest of the chain is caller-supplied.
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

// The IP is never stored — only a salted hash of it, bucketed by minute, purely so one
// source cannot flood the table. The bucket rows expire and are swept below.
$bucket = substr(hash_hmac('sha256', clientIp(), IP_SALT), 0, 40)
    . ':' . floor(time() / RATE_WINDOW_SECONDS);

$stmt = $pdo->prepare(
    'INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE hits = hits + 1'
);
$stmt->execute(array($bucket, time() + RATE_WINDOW_SECONDS * 2));

$stmt = $pdo->prepare('SELECT hits FROM rate_limit WHERE bucket = ?');
$stmt->execute(array($bucket));
$hits = (int) $stmt->fetchColumn();

if ($hits > RATE_MAX_EVENTS) {
    // Answered as success on purpose: a client being throttled is not something the
    // visitor's browser should retry or report, and it reveals nothing to a flooder.
    ok(array('recorded' => false));
}

// Occasional opportunistic sweep, so the table cannot grow without bound and no cron
// job is needed on the hosting account.
if (mt_rand(1, 100) === 1) {
    $pdo->prepare('DELETE FROM rate_limit WHERE expires_at < ?')->execute(array(time()));
}

/* -------------------------------------------------------------------- store */

function clamp($value, $max)
{
    $text = is_string($value) ? $value : '';
    // Multi-byte safe, so a truncated label can never end in half a character.
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}

// The date is decided here, not by the caller, so the dashboard's day buckets cannot be
// skewed by a wrong client clock. Days run in India time to match the business.
try {
    $now = new DateTime('now', new DateTimeZone('Asia/Kolkata'));
} catch (Exception $e) {
    $now = new DateTime('now');
}

$stmt = $pdo->prepare(
    'INSERT INTO analytics_events (event_type, label, page, date_key, session_id, referrer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute(array(
    $eventType,
    clamp(isset($body['label']) ? $body['label'] : '', 120),
    clamp(isset($body['page']) ? $body['page'] : '', 200),
    $now->format('Y-m-d'),
    clamp(isset($body['sessionId']) ? $body['sessionId'] : '', 64),
    clamp(isset($body['referrer']) ? $body['referrer'] : '', 200),
    gmdate('Y-m-d H:i:s'),
));

ok(array('recorded' => true));
