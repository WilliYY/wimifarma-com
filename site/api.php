<?php
declare(strict_types=1);

// Compatibilidade para copias antigas que ainda apontem para /api.php.
// A API real da Cotacao fica em /cotacao/api.php.
require __DIR__ . '/cotacao/api.php';
