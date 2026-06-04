<?php
declare(strict_types=1);

require_once __DIR__ . '/functions.php';

$error = '';
$isMaintenance = maintenance_mode_enabled();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'disable_maintenance') {
    verify_csrf();

    if (hash_equals('wimifarma', (string) ($_POST['maintenance_password'] ?? ''))) {
        set_maintenance_mode(false);
        log_action('manutencao_desativada', 'system', null, 'Modo manutencao desativado pela tela publica de manutencao.');
        redirect_to(current_user() ? 'dashboard.php#busca' : 'login.php');
    }

    $error = 'Senha incorreta. O sistema continua em manutencao.';
}
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Manutencao - <?php echo e(APP_NAME); ?></title>
    <link rel="icon" type="image/png" href="<?php echo e(app_url('favicon.png')); ?>">
    <link rel="stylesheet" href="<?php echo e(app_url('styles.css')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/styles.css')); ?>">
</head>
<body class="maintenance-page">
    <main class="maintenance-shell">
        <section class="maintenance-copy">
            <img class="maintenance-brand" src="<?php echo e(app_url('logo-wimifarma.svg')); ?>" alt="Wimifarma">
            <span class="kicker">Modo tecnico ativo</span>
            <h1>Cashback em manutencao.</h1>
            <p>Estamos ajustando o sistema para o balcao continuar rapido, seguro e sem bugs para a equipe.</p>

            <form method="post" class="maintenance-unlock">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="disable_maintenance">
                <label>
                    <span>Retirar da manutencao</span>
                    <input type="password" name="maintenance_password" placeholder="Digite a senha interna" required autofocus>
                </label>
                <button class="btn primary full" type="submit">Liberar sistema</button>
                <?php if ($error !== '') : ?>
                    <div class="alert error"><?php echo e($error); ?></div>
                <?php endif; ?>
                <?php if (!$isMaintenance) : ?>
                    <div class="alert success">O modo manutencao ja esta desativado.</div>
                    <a class="btn full" href="<?php echo e(app_url(current_user() ? 'dashboard.php#busca' : 'login.php')); ?>">Voltar ao sistema</a>
                <?php endif; ?>
            </form>
        </section>

        <section class="maintenance-visual" aria-label="Tecnico da farmacia ajustando o sistema">
            <div class="maintenance-orbit orbit-one"></div>
            <div class="maintenance-orbit orbit-two"></div>
            <div class="maintenance-cube cube-one">PHP</div>
            <div class="maintenance-cube cube-two">SQL</div>
            <div class="maintenance-console">
                <span></span>
                <span></span>
                <span></span>
                <strong>Wimifarma Cashback</strong>
                <p>Revisando caixa, clientes e saldos...</p>
            </div>
            <div class="maintenance-avatar">
                <img src="<?php echo e(app_url('site-icon-512.png')); ?>" alt="">
            </div>
        </section>
    </main>
</body>
</html>
