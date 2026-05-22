<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

xp_send_no_cache_headers();

if (!headers_sent()) {
    header('Content-Type: application/json; charset=UTF-8');
}

try {
    xp_ensure_schema();
    echo json_encode(array(
        'ok' => true,
        'module' => 'xp',
    'version' => '2026-05-22',
        'xp_per_1000_reais' => XP_POINTS_PER_THOUSAND_REAIS,
        'first_level_requirement' => XP_FIRST_LEVEL_REQUIREMENT,
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(array(
        'ok' => false,
        'module' => 'xp',
        'message' => 'XP indisponivel.',
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
