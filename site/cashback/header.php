<?php
$pageTitle = $pageTitle ?? APP_NAME;
$currentFile = basename($_SERVER['SCRIPT_NAME'] ?? '');
$flash = get_flash();
$user = current_user();
$currentClientId = isset($_GET['cliente_id']) ? max(0, (int) $_GET['cliente_id']) : 0;
$dashboardQuery = $currentClientId > 0 ? '?cliente_id=' . $currentClientId : '';
$navItems = array(
    'dashboard.php' . $dashboardQuery . '#busca' => 'Balcao',
    'dashboard.php' . $dashboardQuery . '#cadastro' => 'Novo cliente',
    'dashboard.php' . $dashboardQuery . '#resgate' => 'Compra Cashback',
    'mensagens.php' => 'Mensagens',
    'relatorio.php' => 'Configuracao e Relatorio',
    'diagnostico.php' => 'Diagnostico',
);
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo e($pageTitle); ?> - <?php echo e(APP_NAME); ?></title>
    <meta name="wfwc-csrf" content="<?php echo e(csrf_token()); ?>">
    <link rel="icon" type="image/svg+xml" href="<?php echo e(app_url('favicon.svg')); ?>">
    <link rel="alternate icon" href="<?php echo e(app_url('favicon.png')); ?>">
    <link rel="apple-touch-icon" href="<?php echo e(app_url('apple-touch-icon.png')); ?>">
    <link rel="stylesheet" href="<?php echo e(app_url('styles.css')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/styles.css')); ?>">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517g">
</head>
<body>
<img class="cashback-screen-runner" src="<?php echo e(app_url('mario.gif')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/mario.gif')); ?>" alt="" aria-hidden="true" data-cashback-runner>
<header class="topbar">
    <div class="brand-wrap">
        <img class="brand-logo" src="<?php echo e(app_url('logo-wimifarma.svg')); ?>" alt="Wimifarma">
        <strong class="brand">Cashback</strong>
    </div>
    <nav class="nav">
        <?php foreach ($navItems as $file => $label) : ?>
            <?php $isAbsolute = strpos((string) $file, '/') === 0; ?>
            <?php $navWithoutHash = strtok($file, '#') ?: $file; ?>
            <?php $navFile = strtok($navWithoutHash, '?') ?: $navWithoutHash; ?>
            <?php $hasHash = strpos($file, '#') !== false; ?>
            <?php $sectionTarget = $hasHash ? (string) parse_url($file, PHP_URL_FRAGMENT) : ''; ?>
            <?php $isActive = ($currentFile === $navFile && !$hasHash) || ($currentFile === $navFile && in_array($navFile, array('diagnostico.php', 'mensagens.php'), true)); ?>
            <a class="<?php echo $isActive ? 'active' : ''; ?>" href="<?php echo e($isAbsolute ? (string) $file : app_url($file)); ?>"<?php echo $sectionTarget !== '' ? ' data-section-link="' . e($sectionTarget) . '"' : ''; ?>><?php echo e($label); ?></a>
        <?php endforeach; ?>
        <a href="<?php echo e(app_url('logout.php')); ?>">Sair</a>
    </nav>
</header>

<main class="container">
    <div class="page-heading">
        <div>
            <span class="kicker">Operacao real</span>
            <h1><?php echo e($pageTitle); ?></h1>
        </div>
        <div class="user-pill">Usuario: <?php echo e($user['username'] ?? ''); ?></div>
    </div>

    <?php if (!empty($flash['message'])) : ?>
        <div class="alert <?php echo e($flash['type'] ?? 'info'); ?>">
            <?php echo e($flash['message']); ?>
        </div>
    <?php endif; ?>
