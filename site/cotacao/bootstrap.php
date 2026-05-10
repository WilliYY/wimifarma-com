<?php
declare(strict_types=1);

function cotacao_cashback_base_dir(): string
{
    $candidates = array(
        __DIR__ . '/../cashback',
        __DIR__ . '/../wimifarma-cashback',
    );

    foreach ($candidates as $candidate) {
        if (is_file($candidate . '/functions.php')) {
            return $candidate;
        }
    }

    throw new RuntimeException('Nao foi possivel localizar os arquivos compartilhados do cashback.');
}

$cotacaoCashbackBaseDir = cotacao_cashback_base_dir();

require_once $cotacaoCashbackBaseDir . '/functions.php';
require_once __DIR__ . '/cotacao-funcoes.php';

function cotacao_send_security_headers(): void
{
    if (headers_sent()) {
        return;
    }

    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';");
}

cotacao_send_security_headers();
