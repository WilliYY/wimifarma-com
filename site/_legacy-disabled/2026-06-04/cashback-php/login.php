<?php
declare(strict_types=1);

require_once __DIR__ . '/functions.php';

if (current_user()) {
    redirect_to('dashboard.php#busca');
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $waitSeconds = login_rate_limit_wait_seconds($username);

    if ($waitSeconds > 0) {
        $error = 'Muitas tentativas de login. Aguarde cerca de ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s).';
    } else {
        try {
            $user = internal_authenticate_user($username, $password);

            if ($user) {
                clear_login_rate_limit($username);
                session_regenerate_id(true);
                $_SESSION['user_id'] = (int) $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['auth_provider'] = $user['auth_source'] ?? INTERNAL_AUTH_PROVIDER;
                log_action('login', 'user', (int) $user['id'], 'Login realizado com sucesso.');
                redirect_to('dashboard.php#busca');
            }

            register_login_failure($username);
            log_action('login_falha', 'user', null, 'Tentativa de login falhou para usuario: ' . $username);
            $error = 'Usuario ou senha incorretos.';
        } catch (Throwable $exception) {
            $error = 'Nao foi possivel conectar ao login interno. Confira o core de usuarios.';
        }
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login - Wimifarma Cashback</title>
    <link rel="icon" type="image/png" href="<?php echo e(app_url('favicon.png')); ?>">
    <link rel="apple-touch-icon" href="<?php echo e(app_url('apple-touch-icon.png')); ?>">
    <link rel="stylesheet" href="<?php echo e(app_url('styles.css')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/styles.css')); ?>">
    <script src="<?php echo e(app_url('login-runner.js')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/login-runner.js')); ?>" defer></script>
</head>
<body class="login-body">
    <img class="login-screen-runner login-cat-runner" src="<?php echo e(app_url('gato-hapy.gif')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/gato-hapy.gif')); ?>" alt="" aria-hidden="true" data-login-runner>
    <main class="login-card">
        <img class="login-logo" src="<?php echo e(app_url('logo-wimifarma.svg')); ?>" alt="Wimifarma">
        <span class="kicker">Wimifarma Cashback</span>
        <h1>Acesso da equipe</h1>
        <p>Entre para cadastrar clientes, registrar compras e controlar cashback em tempo real.</p>

        <?php if ($error !== '') : ?>
            <div class="alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" action="login.php" class="form-grid">
            <?php echo csrf_field(); ?>
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autocomplete="username" value="<?php echo e($_POST['username'] ?? ''); ?>">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password" value="">
            </label>
            <button type="submit" class="btn primary">Entrar</button>
        </form>
    </main>
</body>
</html>
