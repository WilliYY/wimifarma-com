<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (current_user()) {
    header('Location: /cotacao/');
    exit;
}

function cotacao_login_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('Sessao expirada. Atualize a pagina e tente novamente.');
    }
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        cotacao_login_verify_csrf();
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
                log_action('login_cotacao', 'user', (int) $user['id'], 'Login cotacao realizado.');
                header('Location: /cotacao/');
                exit;
            }

            register_login_failure();
            log_action('login_cotacao_falha', 'user', null, 'Tentativa de login cotacao falhou para usuario: ' . $username);
            $error = 'Usuario ou senha incorretos.';
        }
    } catch (Throwable $exception) {
        $error = 'Nao foi possivel acessar a cotacao agora.';
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login Cotacao - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/cotacao/favicon.svg">
    <link rel="alternate icon" href="/cotacao/favicon.png">
    <link rel="stylesheet" href="/cotacao/styles.css?v=<?php echo e(COTACAO_VERSION); ?>">
    <script src="/cotacao/app.js?v=<?php echo e(COTACAO_VERSION); ?>" defer></script>
    <script src="/cotacao/login-runner.js?v=<?php echo e(COTACAO_VERSION); ?>" defer></script>
</head>
<body class="cotacao-login-body">
    <img class="login-screen-runner login-cat-runner" src="/cotacao/assets/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
    <main class="cotacao-login-card">
        <img src="/cotacao/logo-wimifarma.svg" alt="Wimifarma">
        <span class="kicker">Wimifarma Cotacao</span>
        <h1>Acesso da equipe</h1>
        <p>Entre para comparar distribuidoras, precos e prioridades de compra.</p>

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
            <button class="btn primary" type="submit">Entrar na cotacao</button>
        </form>
    </main>
</body>
</html>
