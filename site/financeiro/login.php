<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (current_user()) {
    header('Location: /financeiro/');
    exit;
}

function fin_login_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('Sessao expirada. Atualize a pagina e tente novamente.');
    }
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        fin_login_verify_csrf();
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $waitSeconds = login_rate_limit_wait_seconds();

        if ($waitSeconds > 0) {
            $error = 'Muitas tentativas de login. Aguarde cerca de ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s).';
        } else {
            $stmt = db()->prepare('SELECT * FROM wf_users WHERE username = ? AND active = 1 LIMIT 1');
            $stmt->execute(array($username));
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password_hash'])) {
                clear_login_rate_limit();
                session_regenerate_id(true);
                $_SESSION['user_id'] = (int) $user['id'];
                $_SESSION['username'] = $user['username'];
                log_action('login_financeiro', 'user', (int) $user['id'], 'Login financeiro realizado.');
                header('Location: /financeiro/');
                exit;
            }

            register_login_failure();
            $error = 'Usuario ou senha incorretos.';
        }
    } catch (Throwable $exception) {
        $error = 'Nao foi possivel acessar o financeiro agora.';
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login Financeiro - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/financeiro/favicon.svg">
    <link rel="alternate icon" href="/financeiro/favicon.png">
    <link rel="stylesheet" href="/financeiro/styles.css?v=20260504d">
    <script src="/financeiro/app.js?v=20260504d" defer></script>
    <script src="/financeiro/login-runner.js?v=20260504d" defer></script>
</head>
<body class="finance-login-body">
    <img class="login-screen-runner login-cat-runner" src="/financeiro/assets/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
    <main class="finance-login-card">
        <img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma">
        <span class="kicker">Wimifarma Financeiro</span>
        <h1>Acesso do caixa</h1>
        <p>Entre para fechar o caixa, conferir sangrias, maquininhas e PIX.</p>

        <?php if ($error !== '') : ?>
            <div class="notice error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" data-no-enter-submit>
            <?php echo csrf_field(); ?>
            <label>Usuario
                <input type="text" name="username" required autocomplete="username" value="<?php echo e($_POST['username'] ?? ''); ?>">
            </label>
            <label>Senha
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button class="btn primary" type="submit">Entrar no financeiro</button>
        </form>
    </main>
</body>
</html>
