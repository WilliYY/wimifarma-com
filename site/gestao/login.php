<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

gestao_send_no_cache_headers();

$currentUser = current_user();
$blockedByRole = $currentUser && !gestao_is_allowed_user($currentUser);

if ($currentUser && !$blockedByRole) {
    header('Location: /gestao/');
    exit;
}

$error = $blockedByRole ? 'Gestao e area restrita para adm, admin ou gerente. Saia e entre com o usuario certo.' : '';

if (isset($_GET['restrito'])) {
    $error = 'Gestao e area restrita para adm, admin ou gerente.';
}

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

                if ($user && gestao_password_matches($user, $password) && gestao_is_allowed_user($user)) {
                    clear_login_rate_limit();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $user['id'];
                    $_SESSION['username'] = $user['username'];
                    $_SESSION['role'] = $user['role'];
                    log_action('login_gestao', 'user', (int) $user['id'], 'Login Gestao realizado.');
                    header('Location: /gestao/');
                    exit;
                }

                register_login_failure();
                log_action('login_gestao_falha', 'user', null, 'Tentativa de login Gestao falhou para usuario: ' . $username);
                $error = 'Usuario, senha ou permissao incorretos.';
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
    <title>Gestao - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/gestao/styles.css?v=20260518a">
    <script src="/gestao/login-runner.js?v=20260518a" defer></script>
</head>
<body class="gestao-login-body">
    <img class="gestao-login-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="gestao-login-card">
        <img class="gestao-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
        <span class="gestao-kicker">Wimifarma Gestao</span>
        <h1>Acesso administrativo</h1>
        <p>Contas a pagar manuais e conferidas antes de virar total do mes.</p>

        <?php if ($error !== '') : ?>
            <div class="gestao-alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <?php if ($blockedByRole) : ?>
            <a class="gestao-btn gestao-btn-primary" href="/gestao/logout.php">Trocar usuario</a>
        <?php else : ?>
            <form method="post" class="gestao-login-form">
                <?php echo csrf_field(); ?>
                <label>
                    <span>Usuario</span>
                    <input type="text" name="username" required autofocus autocomplete="username" value="<?php echo e($_POST['username'] ?? ''); ?>">
                </label>
                <label>
                    <span>Senha</span>
                    <input type="password" name="password" required autocomplete="current-password">
                </label>
                <button type="submit" class="gestao-btn gestao-btn-primary">Entrar</button>
            </form>
        <?php endif; ?>
    </main>
</body>
</html>
