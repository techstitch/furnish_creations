<?php
/**
 * Server configuration. This file is never served over the web (see api/.htaccess) —
 * it holds the database password and the admin password hash.
 *
 * Fill in the four database values from cPanel → MySQL® Databases after you create the
 * database and user there. Everything else is already correct for this project.
 */

// If api/config.local.php exists it is loaded first and its values win. That is how a
// copy of the site running on your own computer points at a test database, and it is
// why those settings can never reach the live server: the file is excluded from the
// upload bundle and from git. On the real hosting it simply does not exist.
if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}

/* ---- Database (cPanel → MySQL® Databases) ---------------------------------- */
// cPanel prefixes both the database and the username with your account name, e.g.
// "furnish_cms" and "furnish_admin" — copy them exactly as cPanel shows them.
defined('DB_HOST') || define('DB_HOST', 'localhost');
defined('DB_NAME') || define('DB_NAME', 'REPLACE_ME_database');
defined('DB_USER') || define('DB_USER', 'REPLACE_ME_username');
defined('DB_PASS') || define('DB_PASS', 'REPLACE_ME_password');

/* ---- The one administrator -------------------------------------------------- */
// The password is stored only as a bcrypt hash — the password itself appears nowhere on
// the server, so a copy of this file does not let anyone sign in.
//
// To change the password, run this anywhere PHP is available:
//
//   php -r "echo password_hash('your new password', PASSWORD_DEFAULT), PHP_EOL;"
//
// and paste the result below. The old password stops working immediately.
defined('ADMIN_EMAIL') || define('ADMIN_EMAIL', 'mohsinxaifi@gmail.com');
defined('ADMIN_PASSWORD_HASH') || define(
    'ADMIN_PASSWORD_HASH',
    '$2y$10$PTDwNX0oAJA.8yvSahaOyu4l4a/0uy8xElbajFRTAZRZCZ2KFhjjm'
);

/* ---- Where lead-form enquiries are emailed ---------------------------------- */
// Any address you can read. Every enquiry is also saved in the database, so nothing is
// lost even if mail delivery fails.
defined('ENQUIRY_TO') || define('ENQUIRY_TO', 'mohsinxaifi@gmail.com');

/* ---- Sessions ---------------------------------------------------------------- */
// How long a signed-in session lasts without activity, in seconds. Eight hours means a
// working day without re-entering the password.
defined('SESSION_LIFETIME') || define('SESSION_LIFETIME', 28800);

// Sign-in attempts allowed from one address per 15 minutes before it is locked out.
defined('LOGIN_MAX_ATTEMPTS') || define('LOGIN_MAX_ATTEMPTS', 8);

/* ---- Privacy ---------------------------------------------------------------- */
// Visitor IPs are only ever stored as a salted hash, and only to rate-limit abuse of
// the public tracking endpoint. Change this to any random string; it never leaves here.
defined('IP_SALT') || define('IP_SALT', 'fc-9c41a7e2b85d43f1-change-me-if-you-like');
