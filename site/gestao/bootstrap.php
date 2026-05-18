<?php
declare(strict_types=1);

require_once __DIR__ . '/../cashback/functions.php';
require_once __DIR__ . '/gestao-funcoes.php';

function gestao_send_no_cache_headers(): void
{
    if (headers_sent()) {
        return;
    }

    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}
