<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

tarefa_send_no_cache_headers();

if (current_user()) {
    header('Location: /tarefa/');
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

        if ($username === '' || $password === '') {
            $error = 'Informe usuario e senha.';
        } else {
            try {
                $stmt = db()->prepare('SELECT * FROM wf_users WHERE username = ? AND active = 1 LIMIT 1');
                $stmt->execute(array($username));
                $user = $stmt->fetch();
                $passwordOk = $user ? tarefa_password_matches($user, $password) : false;
                $waitSeconds = login_rate_limit_wait_seconds();

                if ($waitSeconds > 0 && !$passwordOk) {
                    $error = 'Muitas tentativas de login. Aguarde cerca de ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s).';
                } elseif ($user && $passwordOk) {
                    clear_login_rate_limit();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $user['id'];
                    $_SESSION['username'] = $user['username'];
                    $_SESSION['role'] = $user['role'];
                    log_action('login_tarefa', 'user', (int) $user['id'], 'Login Tarefas realizado.');
                    header('Location: /tarefa/');
                    exit;
                } else {
                    register_login_failure();
                    $error = 'Usuario ou senha incorretos.';
                }
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
    <title>Tarefas - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/tarefa/favicon.svg">
    <link rel="stylesheet" href="/tarefa/styles.css?v=20260507b">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517j">
    <script src="/miauw/widget.js?v=20260517j" defer></script>
</head>
<body class="task-login-body">
    <img class="login-screen-runner login-cat-runner" src="/tarefa/assets/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="task-login-card">
        <img class="task-login-logo" src="/tarefa/logo-wimifarma.svg" alt="Wimifarma">
        <span class="task-kicker">Wimifarma tarefas</span>
        <h1>Acesso das tarefas</h1>
        <p>Prioridade aberta primeiro. Bagunca riscada vai para o historico.</p>

        <?php if ($error !== '') : ?>
            <div class="task-alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" class="task-login-form">
            <?php echo csrf_field(); ?>
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="task-btn task-btn-primary">Entrar nas tarefas</button>
        </form>
    </main>

    <script src="/tarefa/login-runner.js?v=20260506a" defer></script>
</body>
</html>
