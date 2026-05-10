<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
}

try {
    echo json_encode(array('ok' => true, 'open' => tarefa_count_open()), JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    echo json_encode(array('ok' => false, 'open' => 0), JSON_UNESCAPED_SLASHES);
}
