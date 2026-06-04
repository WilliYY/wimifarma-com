<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

set_flash('info', 'Cadastro de atendentes agora fica em Configuracao e Relatorio.');
redirect_to('relatorio.php#atendentes');
