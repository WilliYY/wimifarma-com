<?php
declare(strict_types=1);

ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_widget_auth_json(array $payload, int $status = 200): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    echo is_string($json) ? $json : '{"ok":false,"message":"Nao consegui montar resposta de login agora."}';
    exit;
}

function miauw_widget_auth_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        miauw_widget_auth_json(array(
            'ok' => false,
            'csrf' => csrf_token(),
            'message' => 'Sessao renovada. Tente entrar de novo.',
        ), 419);
    }
}

try {
    miauw_widget_auth_verify_csrf();

    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if ($username === '' || $password === '') {
        miauw_widget_auth_json(array('ok' => false, 'message' => 'Informe usuario e senha para abrir o Miauby.'), 422);
    }

    $user = internal_authenticate_user($username, $password);
    $waitSeconds = login_rate_limit_wait_seconds($username);

    if ($waitSeconds > 0 && !$user) {
        miauw_widget_auth_json(array(
            'ok' => false,
            'message' => 'Muitas tentativas. Aguarde ' . max(1, (int) ceil($waitSeconds / 60)) . ' minuto(s). O gato tambem sabe bloquear bagunca.',
        ), 429);
    }

    if (!$user) {
        register_login_failure($username);
        miauw_widget_auth_json(array('ok' => false, 'message' => 'Usuario ou senha incorretos. O bigode detectou erro humano.'), 401);
    }

    clear_login_rate_limit($username);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['auth_provider'] = $user['auth_source'] ?? INTERNAL_AUTH_PROVIDER;
    log_action('login_miauw_widget', 'user', (int) $user['id'], 'Login Miauby widget realizado.');
    $schemaWarning = false;
    try {
        miauw_ensure_schema();
    } catch (Throwable $schemaError) {
        $schemaWarning = true;
        error_log('Miauby schema after widget auth failed: ' . $schemaError->getMessage());
        if (function_exists('miauw_register_internal_error_alert')) {
            try {
                miauw_register_internal_error_alert('miauby', 'Erro ao preparar Miauby apos login', $schemaError, array('endpoint' => 'widget-auth.php'));
            } catch (Throwable $alertError) {
                error_log('Miauby internal alert failed after auth schema error: ' . $alertError->getMessage());
            }
        }
    }

    miauw_widget_auth_json(array(
        'ok' => true,
        'message' => $schemaWarning ? 'Login feito. Algumas memorias do Miauby vao acordar em instantes.' : 'Login feito. O gato fiscal entrou no turno.',
        'csrf' => csrf_token(),
        'username' => $user['username'],
        'schema_warning' => $schemaWarning,
    ));
} catch (Throwable $error) {
    error_log('Miauby widget auth error: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        try {
            miauw_register_internal_error_alert('miauby', 'Erro no login do widget Miauby', $error, array('endpoint' => 'widget-auth.php'));
        } catch (Throwable $alertError) {
            error_log('Miauby internal alert failed after widget auth error: ' . $alertError->getMessage());
        }
    }
    miauw_widget_auth_json(array('ok' => false, 'message' => 'Nao consegui logar agora. Registrei diagnostico interno para revisao.'), 500);
}
