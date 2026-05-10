<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (current_user()) {
    header('Location: /miauw/');
    exit;
}

function miauw_login_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('Sessao expirada. Atualize a pagina e tente novamente.');
    }
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        miauw_login_verify_csrf();
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');

        if ($username === '' || $password === '') {
            $error = 'Informe usuario e senha.';
        } else {
            $stmt = db()->prepare('SELECT * FROM wf_users WHERE username = ? AND active = 1 LIMIT 1');
            $stmt->execute(array($username));
            $user = $stmt->fetch();
            $passwordOk = $user ? miauw_password_matches($user, $password) : false;
            $waitSeconds = login_rate_limit_wait_seconds();

            if ($waitSeconds > 0 && !$passwordOk) {
                $error = 'Muitas tentativas de login. Aguarde cerca de ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s).';
            } elseif ($user && $passwordOk) {
                clear_login_rate_limit();
                session_regenerate_id(true);
                $_SESSION['user_id'] = (int) $user['id'];
                $_SESSION['username'] = $user['username'];
                log_action('login_miauw', 'user', (int) $user['id'], 'Login Miauby realizado.');
                header('Location: /miauw/');
                exit;
            }

            register_login_failure();
            log_action('login_miauw_falha', 'user', null, 'Tentativa de login Miauby falhou para usuario: ' . $username);
            $error = 'Usuario ou senha incorretos.';
        }
    } catch (Throwable $exception) {
        $error = $exception instanceof RuntimeException
            ? $exception->getMessage()
            : 'Nao foi possivel acordar o Miauby agora.';
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login Miauby - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/miauw/favicon.svg">
    <link rel="alternate icon" href="/miauw/favicon.png">
    <link rel="stylesheet" href="/miauw/styles.css?v=<?php echo e(MIAUW_VERSION); ?>">
    <script src="/miauw/app.js?v=<?php echo e(MIAUW_VERSION); ?>" defer></script>
</head>
<body class="miauw-login-body">
    <main class="miauw-login-card">
        <div class="login-brand">
            <img class="brand-logo" src="/miauw/logo-wimifarma.svg" alt="Wimifarma">
            <img class="miauw-face" src="<?php echo e(miauw_avatar_src()); ?>" alt="Miauby">
        </div>
        <span class="kicker">Assistente interno</span>
        <h1>Miauby esta acordado. O caos que lute.</h1>
        <p>Entre para pedir ajuda, criar ideias, reclamar com classe ou xingar com contexto.</p>

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
            <button class="btn primary" type="submit">Entrar no Miauby</button>
        </form>
    </main>
</body>
</html>
