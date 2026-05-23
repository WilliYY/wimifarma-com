<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

xp_send_no_cache_headers();

if (current_user()) {
    header('Location: /xp/');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        $error = 'Sessao expirada. Tente novamente.';
    } else {
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $waitSeconds = login_rate_limit_wait_seconds();

        if ($waitSeconds > 0) {
            $error = 'Muitas tentativas de login. Aguarde cerca de ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s).';
        } else {
            try {
                $stmt = db()->prepare('SELECT * FROM wf_users WHERE username = ? AND active = 1 LIMIT 1');
                $stmt->execute(array($username));
                $loginUser = $stmt->fetch();

                if ($loginUser && xp_password_matches($loginUser, $password)) {
                    clear_login_rate_limit();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $loginUser['id'];
                    $_SESSION['username'] = $loginUser['username'];
                    $_SESSION['role'] = $loginUser['role'];
                    log_action('login_xp', 'user', (int) $loginUser['id'], 'Login XP realizado.');
                    header('Location: /xp/');
                    exit;
                }

                register_login_failure();
                log_action('login_xp_falha', 'user', null, 'Tentativa de login XP falhou para usuario: ' . $username);
                $error = 'Usuario ou senha incorretos.';
            } catch (Throwable $loginError) {
                $error = 'Nao consegui abrir o login agora. Tente novamente em instantes.';
            }
        }
    }
}
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>XP - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/xp/styles.css?v=20260523b">
    <script src="/xp/login-runner.js?v=20260522a" defer></script>
</head>
<body class="xp-login-body">
    <img class="xp-login-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="xp-login-card">
        <img class="xp-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
        <span>Wimifarma XP</span>
        <h1>Entrar no XP</h1>
        <p>Trilha de niveis dos atendentes por vendas lancadas diariamente.</p>

        <?php if ($error !== '') : ?>
            <div class="xp-alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" class="xp-login-form">
            <?php echo csrf_field(); ?>
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username" value="<?php echo e($_POST['username'] ?? ''); ?>">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="xp-btn xp-btn-primary">Entrar</button>
        </form>
    </main>
</body>
</html>
