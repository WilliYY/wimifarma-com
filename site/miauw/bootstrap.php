<?php
declare(strict_types=1);

function miauw_cashback_base_dir(): string
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

$miauwCashbackBaseDir = miauw_cashback_base_dir();

require_once $miauwCashbackBaseDir . '/functions.php';

function miauw_send_security_headers(): void
{
    if (PHP_SAPI === 'cli' || headers_sent()) {
        return;
    }

    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'self'; form-action 'self';", true);
}

miauw_send_security_headers();

require_once __DIR__ . '/miauw-personality.php';
require_once __DIR__ . '/miauw-skills.php';
require_once __DIR__ . '/miauw-system-map.php';
require_once __DIR__ . '/miauw-intelligence.php';
require_once __DIR__ . '/miauw-farmacia-popular.php';
require_once __DIR__ . '/miauw-web-research.php';
require_once __DIR__ . '/miauw-funcoes.php';
require_once __DIR__ . '/miauw-diagnostics.php';
