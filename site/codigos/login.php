<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

codigos_send_no_cache_headers();

if (current_user()) {
    header('Location: /codigos/');
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
                $user = $stmt->fetch();

                if ($user && codigos_password_matches($user, $password)) {
                    clear_login_rate_limit();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $user['id'];
                    $_SESSION['username'] = $user['username'];
                    $_SESSION['role'] = $user['role'];
                    log_action('login_codigos', 'user', (int) $user['id'], 'Login Codigos realizado.');
                    header('Location: /codigos/');
                    exit;
                }

                register_login_failure();
                log_action('login_codigos_falha', 'user', null, 'Tentativa de login Codigos falhou para usuario: ' . $username);
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
    <title>Codigos - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/codigos/styles.css?v=20260514a">
    <script src="/codigos/login-runner.js?v=20260514a" defer></script>
</head>
<body class="codes-login-body">
    <img class="login-screen-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="codes-login-card">
        <img class="codes-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
        <span class="codes-kicker">Wimifarma Codigos</span>
        <h1>Acesso dos códigos</h1>
        <p>Lista rapida para codigo, EAN e preco de itens com comissao diferente.</p>

        <?php if ($error !== '') : ?>
            <div class="codes-alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" class="codes-login-form">
            <?php echo csrf_field(); ?>
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username" value="<?php echo e($_POST['username'] ?? ''); ?>">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="codes-btn codes-btn-primary">Entrar</button>
        </form>
    </main>
</body>
</html>
