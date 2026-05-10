<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function miauw_widget_alerts_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    echo is_string($json) ? $json : '{"ok":false,"message":"Nao consegui montar alertas agora."}';
    exit;
}

function miauw_widget_alerts_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        miauw_widget_alerts_json(array(
            'ok' => false,
            'csrf' => csrf_token(),
            'message' => 'Sessao renovada. Tente apagar de novo.',
        ), 419);
    }
}

function miauw_widget_alerts_can_dismiss(array $user): bool
{
    $role = (string) ($user['role'] ?? '');
    $username = strtolower((string) ($user['username'] ?? ''));

    return in_array($role, array('admin', 'gerente'), true) || $username === 'adm';
}

function miauw_widget_alerts_age_label(array $alert): string
{
    $date = (string) ($alert['last_seen_at'] ?? $alert['created_at'] ?? $alert['first_seen_at'] ?? '');
    $timestamp = $date !== '' ? strtotime($date) : false;

    if (!$timestamp) {
        $occurrences = (int) ($alert['ocorrencias'] ?? 1);
        return $occurrences > 1 ? $occurrences . ' ocorrencias' : 'alerta ativo';
    }

    $seconds = max(0, time() - $timestamp);
    if ($seconds < 3600) {
        $minutes = max(1, (int) floor($seconds / 60));
        return 'visto ha ' . $minutes . ' min';
    }

    if ($seconds < 86400) {
        $hours = max(1, (int) floor($seconds / 3600));
        return 'visto ha ' . $hours . ' h';
    }

    $days = max(1, (int) floor($seconds / 86400));
    return 'visto ha ' . $days . ' dia(s)';
}

function miauw_widget_alerts_payload(array $user): array
{
    miauw_ensure_schema();
    if (function_exists('miauw_guardian_scan')) {
        miauw_guardian_scan(false);
    }

    $alerts = function_exists('miauw_intelligence_public_alerts')
        ? miauw_intelligence_public_alerts(20)
        : array();
    $count = function_exists('miauw_intelligence_active_alerts')
        ? count(miauw_intelligence_active_alerts(30))
        : count($alerts);

    $mapped = array_map(static function (array $alert): array {
        return array(
            'id' => (int) ($alert['id'] ?? 0),
            'fingerprint' => (string) ($alert['fingerprint'] ?? ''),
            'modulo' => (string) ($alert['modulo'] ?? 'sistema'),
            'tipo' => (string) ($alert['tipo'] ?? ''),
            'severidade' => (string) ($alert['severidade'] ?? 'media'),
            'titulo' => (string) ($alert['titulo'] ?? 'Alerta operacional'),
            'mensagem' => (string) ($alert['mensagem'] ?? ''),
            'acao_sugerida' => (string) ($alert['acao_sugerida'] ?? ''),
            'risco_score' => (int) ($alert['risco_score'] ?? 50),
            'ocorrencias' => (int) ($alert['ocorrencias'] ?? 1),
            'last_seen_at' => (string) ($alert['last_seen_at'] ?? ''),
            'age_label' => miauw_widget_alerts_age_label($alert),
        );
    }, $alerts);

    return array(
        'ok' => true,
        'authenticated' => true,
        'csrf' => csrf_token(),
        'count' => $count,
        'alerts' => $mapped,
        'can_dismiss' => miauw_widget_alerts_can_dismiss($user),
    );
}

try {
    $user = current_user();
    if (!$user) {
        miauw_widget_alerts_json(array(
            'ok' => false,
            'auth' => false,
            'csrf' => csrf_token(),
            'message' => 'Entre no Miauby para ver os alertas.',
        ), 401);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        miauw_widget_alerts_verify_csrf();
        $action = (string) ($_POST['action'] ?? '');

        if ($action !== 'dismiss') {
            miauw_widget_alerts_json(array('ok' => false, 'csrf' => csrf_token(), 'message' => 'Acao invalida.'), 400);
        }

        if (!miauw_widget_alerts_can_dismiss($user)) {
            miauw_widget_alerts_json(array('ok' => false, 'csrf' => csrf_token(), 'message' => 'Seu usuario nao pode apagar alertas.'), 403);
        }

        $alertId = (int) ($_POST['alert_id'] ?? 0);
        if ($alertId <= 0 || !function_exists('miauw_intelligence_dismiss_alert')) {
            miauw_widget_alerts_json(array('ok' => false, 'csrf' => csrf_token(), 'message' => 'Alerta invalido.'), 422);
        }

        if (!miauw_intelligence_dismiss_alert($alertId, (int) $user['id'])) {
            miauw_widget_alerts_json(array('ok' => false, 'csrf' => csrf_token(), 'message' => 'Esse alerta ja saiu da fila.'), 404);
        }
    }

    miauw_widget_alerts_json(miauw_widget_alerts_payload($user));
} catch (Throwable $error) {
    error_log('Miauby widget alerts error: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        try {
            miauw_register_internal_error_alert('miauby', 'Erro no painel de alertas do widget', $error, array('endpoint' => 'widget-alerts.php'));
        } catch (Throwable $alertError) {
            error_log('Miauby alert registration failed after widget alerts error: ' . $alertError->getMessage());
        }
    }
    miauw_widget_alerts_json(array(
        'ok' => false,
        'csrf' => function_exists('csrf_token') ? csrf_token() : '',
        'message' => 'Nao consegui carregar alertas agora. Tente de novo em instantes.',
    ), 500);
}
