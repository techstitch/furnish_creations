<?php
/**
 * Page content storage.
 *
 * The content is one JSON document. The public site does not come through here at all —
 * it fetches data/content.json directly as a static file, which is the fastest thing the
 * server can do and needs no PHP. This endpoint exists for the editor: it is what writes
 * that file, and the only thing allowed to.
 *
 *   GET                          -> the current content (public; it is the website's own text)
 *   POST action=save-section     -> merge one section in   (admin)
 *   POST action=seed             -> replace the whole document (admin)
 */

require_once __DIR__ . '/lib/bootstrap.php';

define('CONTENT_FILE', DATA_DIR . '/content.json');

function readContent()
{
    if (!is_file(CONTENT_FILE)) {
        return null;
    }
    $raw = file_get_contents(CONTENT_FILE);
    if ($raw === false || $raw === '') {
        return null;
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : null;
}

/**
 * Writes via a temporary file and rename(), which is atomic on the same filesystem.
 * A visitor fetching content.json mid-save therefore sees either the old document or
 * the new one, never a half-written file.
 */
function writeContent(array $content)
{
    if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0755, true) && !is_dir(DATA_DIR)) {
        fail('Could not create the data folder. Check permissions on the site root.', 500);
    }

    $encoded = json_encode($content, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        fail('That content could not be encoded as JSON.', 400);
    }

    $tmp = CONTENT_FILE . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, $encoded, LOCK_EX) === false) {
        fail('Could not save. Check that the data folder is writable.', 500);
    }
    if (!rename($tmp, CONTENT_FILE)) {
        @unlink($tmp);
        fail('Could not replace the content file.', 500);
    }
    @chmod(CONTENT_FILE, 0644);
}

function jsonBody()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return array();
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : array();
}

/* ------------------------------------------------------------------- routes */

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $content = readContent();
    ok(array('content' => $content, 'seeded' => $content !== null));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Unsupported method.', 405);
}

$admin = requireAdmin();
$body  = jsonBody();
$action = isset($body['action']) ? $body['action'] : '';

if ($action === 'seed') {
    if (!isset($body['content']) || !is_array($body['content'])) {
        fail('No content supplied.');
    }
    $content = $body['content'];
    $content['meta'] = array(
        'updatedAt' => gmdate('c'),
        'updatedBy' => $admin['email'],
    );
    writeContent($content);
    ok(array('seeded' => true));
}

if ($action === 'save-section') {
    $section = isset($body['section']) ? (string) $body['section'] : '';
    // Section names become top-level JSON keys, so they are restricted to the shape the
    // editor's schema actually uses rather than accepted as free text.
    if ($section === '' || !preg_match('/^[A-Za-z][A-Za-z0-9_]{0,40}$/', $section)) {
        fail('That is not a valid section name.');
    }
    if (!array_key_exists('value', $body)) {
        fail('No value supplied.');
    }

    $content = readContent();
    if ($content === null) {
        $content = array();
    }
    $content[$section] = $body['value'];
    $content['meta'] = array(
        'updatedAt' => gmdate('c'),
        'updatedBy' => $admin['email'],
    );
    writeContent($content);
    ok(array('section' => $section));
}

fail('Unknown action.');
