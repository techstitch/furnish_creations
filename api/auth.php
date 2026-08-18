<?php
/**
 * Sign in, sign out, and "am I still signed in?".
 *
 * There is one administrator, whose email and bcrypt password hash live in
 * api/config.php. No account can be created through this endpoint — deliberately, since
 * the site has exactly one user and a registration path would only ever be a way in.
 *
 *   POST action=login   {email, password}  -> starts a session, returns the CSRF token
 *   POST action=logout                     -> ends the session
 *   GET  ?action=me                        -> current session, or signed out
 */

require_once __DIR__ . '/lib/bootstrap.php';

function jsonBody()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return array();
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : array();
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
if ($action === '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();
    $action = isset($body['action']) ? $body['action'] : '';
} else {
    $body = array();
}

/* ---------------------------------------------------------------------- me */

if ($action === 'me') {
    $email = sessionUser();
    if ($email === null) {
        ok(array('signedIn' => false));
    }
    ok(array('signedIn' => true, 'email' => $email, 'csrf' => csrfToken()));
}

/* ------------------------------------------------------------------ logout */

if ($action === 'logout') {
    destroySession();
    ok(array('signedOut' => true));
}

/* ------------------------------------------------------------------- login */

if ($action !== 'login') {
    fail('Unknown action.');
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Unsupported method.', 405);
}

if (strpos(ADMIN_PASSWORD_HASH, 'REPLACE_ME') !== false || ADMIN_PASSWORD_HASH === '') {
    fail('No administrator password has been set yet — see api/config.php.', 500);
}

// Checked before the password is looked at, so a flood of guesses is stopped rather
// than merely answered slowly.
if (loginAttemptsExceeded()) {
    fail('Too many sign-in attempts. Please wait 15 minutes and try again.', 429);
}

$email    = isset($body['email']) ? trim((string) $body['email']) : '';
$password = isset($body['password']) ? (string) $body['password'] : '';

if ($email === '' || $password === '') {
    fail('Enter your email and password.');
}

$emailOk    = hash_equals(strtolower(ADMIN_EMAIL), strtolower($email));
$passwordOk = password_verify($password, ADMIN_PASSWORD_HASH);

// One message for both failures, and both checks always run, so neither the wording nor
// the timing reveals whether the email was the right one.
if (!$emailOk || !$passwordOk) {
    recordFailedLogin();
    // A deliberate pause makes online guessing slow even before the lockout engages.
    usleep(400000);
    fail('Wrong email or password.', 401);
}

clearFailedLogins();

startSession();
// Any session id the visitor arrived holding is discarded here, so an id planted before
// sign-in cannot become an authenticated one.
session_regenerate_id(true);

$_SESSION['admin_email']    = ADMIN_EMAIL;
$_SESSION['last_seen']      = time();
$_SESSION['pw_fingerprint'] = passwordFingerprint();

ok(array('email' => ADMIN_EMAIL, 'csrf' => csrfToken()));
