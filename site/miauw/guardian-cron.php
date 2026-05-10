<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$isCli = PHP_SAPI === 'cli';

if (!$isCli) {
    $token = (string) ($_GET['token'] ?? '');
    $expected = defined('MIAUW_GUARDIAN_TOKEN') ? (string) MIAUW_GUARDIAN_TOKEN : '';

    if ($expected === '' || !hash_equals($expected, $token)) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Acesso negado.\n";
        exit;
    }
}

try {
    miauw_ensure_schema();
    $result = function_exists('miauw_guardian_scan')
        ? miauw_guardian_scan(true)
        : array('scanned' => false, 'alerts' => array(), 'patterns' => array());

    $payload = array(
        'ok' => true,
        'scanned' => !empty($result['scanned']),
        'alerts' => count($result['alerts'] ?? array()),
        'patterns' => count($result['patterns'] ?? array()),
        'time' => date('Y-m-d H:i:s'),
    );

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $error) {
    error_log('Miauby guardian cron failed: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        miauw_register_internal_error_alert('miauby', 'Erro no cron guardian do Miauby', $error, array('endpoint' => 'guardian-cron.php'));
    }
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('ok' => false, 'message' => 'Falha na varredura do Miauby.'), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
}
