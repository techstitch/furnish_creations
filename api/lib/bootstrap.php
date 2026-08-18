<?php
/**
 * Shared plumbing for every endpoint: JSON replies, the database handle, and the
 * session that identifies the admin.
 *
 * Written against PHP 7.4 so it runs on whichever version the hosting account is set
 * to; nothing here needs a newer one.
 */

require_once __DIR__ . '/../config.php';

define('SITE_ROOT', dirname(__DIR__, 2));
define('DATA_DIR', SITE_ROOT . '/data');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/* ------------------------------------------------------------------ replies */

function fail($message, $status = 400)
{
    http_response_code($status);
    echo json_encode(array('ok' => false, 'error' => $message));
    exit;
}

function ok(array $payload = array())
{
    echo json_encode(array_merge(array('ok' => true), $payload));
    exit;
}

function startsWith($haystack, $needle)
{
    return strncmp($haystack, $needle, strlen($needle)) === 0;
}

/* ----------------------------------------------------------------- database */

function db()
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    if (strpos(DB_NAME, 'REPLACE_ME') !== false) {
        fail('The database is not configured yet — fill in api/config.php.', 500);
    }

    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            array(
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            )
        );
    } catch (PDOException $e) {
        // The message can contain the username, so it is logged rather than returned.
        error_log('[fc] database connection failed: ' . $e->getMessage());
        fail('Could not reach the database. Check the details in api/config.php.', 500);
    }

    ensureSchema($pdo);
    return $pdo;
}

// Creating the tables on first use means there is no separate install step to forget,
// and re-running it is free because both statements are IF NOT EXISTS.
function ensureSchema(PDO $pdo)
{
    // Heredocs rather than quoted strings: the DDL contains SQL string literals ('') and
    // escaping those through PHP quoting is exactly the kind of thing that silently
    // breaks on edit.
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS analytics_events (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_type  VARCHAR(32)  NOT NULL,
    label       VARCHAR(120) NOT NULL DEFAULT '',
    page        VARCHAR(200) NOT NULL DEFAULT '',
    date_key    CHAR(10)     NOT NULL,
    session_id  VARCHAR(64)  NOT NULL DEFAULT '',
    referrer    VARCHAR(200) NOT NULL DEFAULT '',
    created_at  DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_type_date (event_type, date_key),
    KEY idx_date (date_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL
    );

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS rate_limit (
    bucket     VARCHAR(72)  NOT NULL,
    hits       INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at INT UNSIGNED NOT NULL,
    PRIMARY KEY (bucket),
    KEY idx_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL
    );
}


/* ------------------------------------------------------------------- sessions */

/**
 * Starts the admin session with cookie settings chosen before any session exists.
 *
 * SameSite=Strict is the primary CSRF defence: the browser simply will not attach this
 * cookie to a request originated by another site. The CSRF token below is the second
 * layer, for the older browsers that ignore SameSite.
 */
function startSession()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    // Sessions are kept in this account's own data/sessions rather than the server-wide
    // default. On shared hosting that default directory is frequently readable by every
    // account on the machine, which would put this site's login cookie within reach of
    // a neighbour. 0700 and the deny rule in data/.htaccess keep it to this site.
    $sessionDir = DATA_DIR . '/sessions';
    if (!is_dir($sessionDir)) {
        @mkdir($sessionDir, 0700, true);
    }
    if (is_dir($sessionDir) && is_writable($sessionDir)) {
        session_save_path($sessionDir);
        ini_set('session.gc_maxlifetime', (string) SESSION_LIFETIME);
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    $params = array(
        'lifetime' => 0,          // dies with the browser session; SESSION_LIFETIME does the real expiry
        'path'     => '/',
        'httponly' => true,       // JavaScript can never read it, so XSS cannot steal the login
        'secure'   => $https,
        'samesite' => 'Strict',
    );

    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params($params);
    } else {
        // Before 7.3 there is no samesite option, so it rides along on the path.
        session_set_cookie_params(0, '/; samesite=Strict', '', $https, true);
    }

    session_name('fc_admin');

    // A session that silently fails to persist looks exactly like a successful sign-in
    // followed by an instant sign-out, which is impossible to diagnose from the editor.
    // Better to say so plainly.
    if (!@session_start() || session_status() !== PHP_SESSION_ACTIVE) {
        fail('The server could not start a session. Check that data/sessions is writable.', 500);
    }
}

function sessionUser()
{
    startSession();

    if (empty($_SESSION['admin_email']) || empty($_SESSION['last_seen'])) {
        return null;
    }
    if (time() - $_SESSION['last_seen'] > SESSION_LIFETIME) {
        destroySession();
        return null;
    }

    // A session that survives a password change would outlive the credential it was
    // granted under, so it is pinned to the hash that was in force at sign-in.
    if (!isset($_SESSION['pw_fingerprint'])
        || !hash_equals($_SESSION['pw_fingerprint'], passwordFingerprint())) {
        destroySession();
        return null;
    }

    $_SESSION['last_seen'] = time();
    return $_SESSION['admin_email'];
}

function passwordFingerprint()
{
    return hash('sha256', ADMIN_PASSWORD_HASH);
}

function destroySession()
{
    startSession();
    $_SESSION = array();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/* ----------------------------------------------------------------------- CSRF */

function csrfToken()
{
    startSession();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function sentCsrfToken()
{
    if (!empty($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        return $_SERVER['HTTP_X_CSRF_TOKEN'];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'X-CSRF-Token') === 0) {
                return $value;
            }
        }
    }
    return '';
}

/* ------------------------------------------------------------- authorisation */

/**
 * Ends the request unless it comes from the signed-in admin. This is the entire
 * authorisation model for the admin endpoints — every one of them calls it first.
 */
function requireAdmin()
{
    $email = sessionUser();
    if ($email === null) {
        fail('Not signed in.', 401);
    }

    // Only state-changing requests need the CSRF token; a GET that merely reads cannot
    // be weaponised by another origin, and demanding it there would break plain links.
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        $sent = sentCsrfToken();
        if ($sent === '' || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
            fail('Your session expired or the page is stale. Reload the editor and try again.', 419);
        }
    }

    return array('email' => $email);
}

/* --------------------------------------------------------- brute-force limit */

function loginBucket()
{
    foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR') as $key) {
        if (!empty($_SERVER[$key])) {
            $candidate = trim(explode(',', $_SERVER[$key])[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                return 'login:' . substr(hash_hmac('sha256', $candidate, IP_SALT), 0, 40)
                    . ':' . floor(time() / 900);
            }
        }
    }
    return 'login:unknown:' . floor(time() / 900);
}

function loginAttemptsExceeded()
{
    $stmt = db()->prepare('SELECT hits FROM rate_limit WHERE bucket = ?');
    $stmt->execute(array(loginBucket()));
    return ((int) $stmt->fetchColumn()) >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin()
{
    $stmt = db()->prepare(
        'INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?, 1, ?)
         ON DUPLICATE KEY UPDATE hits = hits + 1'
    );
    $stmt->execute(array(loginBucket(), time() + 1800));
}

function clearFailedLogins()
{
    db()->prepare('DELETE FROM rate_limit WHERE bucket = ?')->execute(array(loginBucket()));
}
