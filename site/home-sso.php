<?php
declare(strict_types=1);

require_once __DIR__ . '/home-sso-lib.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

$sso = wf_home_sso_read();
if (!$sso) {
    http_response_code(401);
    echo json_encode(array('ok' => false), JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode(array(
    'ok' => true,
    'username' => $sso['username'],
    'expires_at' => $sso['expires_at'],
), JSON_UNESCAPED_SLASHES);
