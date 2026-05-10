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
    $result = function_exists('miauw_fp_update_from_official_sources')
        ? miauw_fp_update_from_official_sources()
        : array('ok' => false, 'message' => 'Modulo Farmacia Popular indisponivel.');

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $error) {
    error_log('Miauby farmacia popular cron failed: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        miauw_register_internal_error_alert('miauby', 'Erro no cron Farmacia Popular', $error, array('endpoint' => 'farmacia-popular-cron.php'));
    }
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'ok' => false,
        'message' => 'Falha ao atualizar Farmacia Popular. Valores locais foram preservados.',
        'time' => date('Y-m-d H:i:s'),
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
}
