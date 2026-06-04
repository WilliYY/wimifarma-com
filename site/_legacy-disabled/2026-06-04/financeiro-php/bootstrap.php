<?php
declare(strict_types=1);

function financeiro_cashback_base_dir(): string
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

$financeiroCashbackBaseDir = financeiro_cashback_base_dir();

require_once $financeiroCashbackBaseDir . '/functions.php';
require_once __DIR__ . '/financeiro-funcoes.php';
