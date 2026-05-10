<?php
declare(strict_types=1);

require_once __DIR__ . '/functions.php';

$authUser = current_user();

if (!$authUser) {
    redirect_to('login.php');
}

$currentScript = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
$sensitiveScripts = array('relatorio.php', 'diagnostico.php', 'diagnostico-publico.php', 'exportar.php');

if (!in_array($currentScript, $sensitiveScripts, true)) {
    clear_sensitive_area_access();
}

refresh_expired_credits();
