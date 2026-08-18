<?php
/**
 * Dashboard figures.
 *
 * Returns every (event type, day) count for a date range in a single grouped query —
 * one round trip regardless of how long the range is.
 */

require_once __DIR__ . '/lib/bootstrap.php';

const MAX_RANGE_DAYS = 400;

requireAdmin();

$from = isset($_GET['from']) ? (string) $_GET['from'] : '';
$to   = isset($_GET['to']) ? (string) $_GET['to'] : '';

function isDateKey($value)
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    list($y, $m, $d) = array_map('intval', explode('-', $value));
    return checkdate($m, $d, $y);
}

if (!isDateKey($from) || !isDateKey($to)) {
    fail('Dates must look like 2026-08-17.');
}
if ($from > $to) {
    fail('The start date is after the end date.');
}

$spanDays = (strtotime($to) - strtotime($from)) / 86400 + 1;
if ($spanDays > MAX_RANGE_DAYS) {
    fail('That range is too long — please choose ' . MAX_RANGE_DAYS . ' days or fewer.');
}

$stmt = db()->prepare(
    'SELECT event_type, date_key, COUNT(*) AS n
       FROM analytics_events
      WHERE date_key BETWEEN ? AND ?
   GROUP BY event_type, date_key'
);
$stmt->execute(array($from, $to));

// Shaped as { eventType: { "2026-08-17": 12, … } }. Days with no events are simply
// absent; the dashboard already treats a missing day as zero.
$series = array();
foreach ($stmt->fetchAll() as $row) {
    $series[$row['event_type']][$row['date_key']] = (int) $row['n'];
}

ok(array('series' => $series));
