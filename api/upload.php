<?php
/**
 * Media endpoint for the website editor.
 *
 * Photos and videos uploaded in /admin/ land directly in Assets/uploads/ on this
 * server, so they are live the instant the upload finishes and are served from
 * furnishcreations.in like every other image on the site.
 *
 * Auth is the admin's session, the same as every other admin endpoint — there is no
 * separate upload password to distribute or rotate.
 *
 * Actions:  POST  (multipart, field "file")  -> upload
 *           GET   ?action=list               -> list previous uploads
 *           POST  action=delete&path=…       -> delete one upload
 */

require_once __DIR__ . '/lib/bootstrap.php';

define('UPLOAD_DIR', 'Assets/uploads');
define('MAX_BYTES', 26214400); // 25 MB — matches the editor's own video limit

/**
 * Extensions the site can actually display, each mapped to the MIME type its contents
 * must really have. SVG is deliberately absent: it can carry script, and these files
 * are served from the site's own origin.
 */
function allowedTypes()
{
    return array(
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png'  => 'image/png',
        'gif'  => 'image/gif',
        'webp' => 'image/webp',
        'mp4'  => 'video/mp4',
        'webm' => 'video/webm',
        'mov'  => 'video/quicktime',
    );
}

/** Confines a caller-supplied path to Assets/uploads, defeating "../" traversal. */
function resolveUploadPath($relative)
{
    $relative = str_replace('\\', '/', trim($relative));
    if ($relative === '' || !startsWith($relative, UPLOAD_DIR . '/')) {
        return null;
    }
    $full = realpath(SITE_ROOT . '/' . $relative);
    $base = realpath(SITE_ROOT . '/' . UPLOAD_DIR);
    if ($full === false || $base === false || !startsWith($full, $base . DIRECTORY_SEPARATOR)) {
        return null;
    }
    return $full;
}

function slug($filename)
{
    $stem = preg_replace('/\.[^.]+$/', '', $filename);
    $stem = strtolower((string) $stem);
    $stem = preg_replace('/[^a-z0-9]+/', '-', $stem);
    $stem = trim((string) $stem, '-');
    $stem = substr($stem, 0, 48);
    return $stem !== '' ? $stem : 'photo';
}

/* -------------------------------------------------------------------- routes */

requireAdmin();

if (isset($_GET['action'])) {
    $action = $_GET['action'];
} elseif (isset($_POST['action'])) {
    $action = $_POST['action'];
} else {
    $action = ($_SERVER['REQUEST_METHOD'] === 'POST') ? 'upload' : 'list';
}

if ($action === 'list') {
    $allowed = allowedTypes();
    $base    = SITE_ROOT . '/' . UPLOAD_DIR;
    $files   = array();

    if (is_dir($base)) {
        $walk = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($walk as $entry) {
            if (!$entry->isFile()) {
                continue;
            }
            if (!isset($allowed[strtolower($entry->getExtension())])) {
                continue;
            }
            $relative = str_replace('\\', '/', substr($entry->getPathname(), strlen($base) + 1));
            $files[]  = array(
                'path'  => UPLOAD_DIR . '/' . $relative,
                'name'  => $entry->getFilename(),
                'size'  => $entry->getSize(),
                'mtime' => $entry->getMTime(),
            );
        }
    }

    // Newest first, which is the order the editor's media library expects.
    usort($files, function ($a, $b) {
        return $b['mtime'] - $a['mtime'];
    });
    ok(array('files' => $files));
}

if ($action === 'delete') {
    $full = resolveUploadPath(isset($_POST['path']) ? $_POST['path'] : '');
    if ($full === null) {
        fail('That path is not inside the uploads folder.');
    }
    if (is_file($full)) {
        @unlink($full);
    }
    ok(array('deleted' => true));
}

if ($action !== 'upload') {
    fail('Unknown action.');
}

/* -------------------------------------------------------------------- upload */

if (!isset($_FILES['file'])) {
    // An upload larger than post_max_size arrives with $_FILES empty and no error code,
    // so the byte count is the only signal left that this is a size problem.
    $sent = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($sent > 0) {
        fail(sprintf(
            'The file was too large for the server (sent %d MB, limit is %s). Ask the host to raise post_max_size.',
            (int) round($sent / 1048576),
            ini_get('post_max_size')
        ), 413);
    }
    fail('No file was received.');
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    switch ($file['error']) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            $reason = 'The file is larger than this server accepts (limit ' . ini_get('upload_max_filesize') . ').';
            break;
        case UPLOAD_ERR_PARTIAL:
            $reason = 'The upload was interrupted — please try again.';
            break;
        case UPLOAD_ERR_NO_TMP_DIR:
        case UPLOAD_ERR_CANT_WRITE:
            $reason = 'The server could not write the file. Check folder permissions.';
            break;
        default:
            $reason = 'Upload failed (code ' . $file['error'] . ').';
    }
    fail($reason, 400);
}

if ($file['size'] > MAX_BYTES) {
    fail(sprintf('File is %d MB. Please keep uploads under 25 MB.', (int) round($file['size'] / 1048576)));
}

$allowed = allowedTypes();
$ext     = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
if (!isset($allowed[$ext])) {
    fail('That file type is not allowed. Use JPG, PNG, WEBP, GIF, MP4, WEBM or MOV.');
}

// The extension is caller-controlled, so the real content type decides. This is what
// stops a PHP script named "photo.jpg" from ever being written into the web root.
if (class_exists('finfo')) {
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $detected = (string) $finfo->file($file['tmp_name']);
    if ($detected !== $allowed[$ext]) {
        // JPEG and MOV/MP4 each report several legitimate types across PHP builds, so
        // compare the family rather than demanding an exact string.
        $wantFamily = explode('/', $allowed[$ext]);
        $gotFamily  = explode('/', $detected);
        if ($wantFamily[0] !== $gotFamily[0]) {
            fail("That file's contents (" . $detected . ") do not match its ." . $ext . " name.");
        }
    }
} elseif (startsWith($allowed[$ext], 'image/') && getimagesize($file['tmp_name']) === false) {
    // No fileinfo extension on this host — for images, GD's parser is a good stand-in.
    fail('That file does not look like a real image.');
}

$year = date('Y');
$dir  = SITE_ROOT . '/' . UPLOAD_DIR . '/' . $year;
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    fail('Could not create the uploads folder. Check permissions on Assets/.', 500);
}

$unique   = base_convert((string) time(), 10, 36) . bin2hex(random_bytes(2));
$name     = slug((string) $file['name']) . '-' . $unique . '.' . $ext;
$fullPath = $dir . '/' . $name;

if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
    fail('Could not save the file. Check permissions on Assets/uploads.', 500);
}
@chmod($fullPath, 0644);

ok(array('path' => UPLOAD_DIR . '/' . $year . '/' . $name));
