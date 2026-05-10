<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function miauw_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    echo is_string($json) ? $json : '{"ok":false,"message":"Miauby nao conseguiu montar a resposta agora."}';
    exit;
}

function miauw_api_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        miauw_json(array('ok' => false, 'message' => 'Sessao expirada. Atualize a pagina.'), 419);
    }
}

try {
    $user = current_user();
    if (!$user) {
        miauw_json(array(
            'ok' => false,
            'auth' => false,
            'message' => 'Sessao expirada. Entre de novo para o Miauby continuar.',
        ), 401);
    }

    miauw_api_verify_csrf();
    miauw_ensure_schema();
    if (function_exists('miauw_guardian_scan')) {
        miauw_guardian_scan(false);
    }

    $action = (string) ($_POST['action'] ?? '');
    $conversationId = miauw_current_conversation_id((int) $user['id']);

    if ($action === 'send') {
        $message = trim((string) ($_POST['message'] ?? ''));
        $widgetMode = !empty($_POST['widget']);

        if ($message === '') {
            miauw_json(array('ok' => false, 'message' => 'Mensagem vazia. Ate o Miauby precisa de alguma coisa para reclamar.'), 422);
        }

        if (miauw_strlen($message) > 1200) {
            miauw_json(array('ok' => false, 'message' => 'Texto grande demais. Resume, Machado de Assis operacional.'), 422);
        }

        $pageContext = trim((string) ($_POST['page_context'] ?? ''));
        if ($pageContext !== '') {
            $messageForAi = $message . "\n\nContexto da pagina atual: " . miauw_substr($pageContext, 0, 900);
        } else {
            $messageForAi = $message;
        }
        if ($widgetMode) {
            $messageForAi .= "\n\nModo de resposta: widget compacto. Seja curto, operacional e com voz Miauby. Se estiver vago, peca so o essencial.";
        }

        miauw_add_message($conversationId, (int) $user['id'], 'user', $message);
        $reply = miauw_try_controlled_action($message, (int) $user['id'], $pageContext, $widgetMode);
        if ($reply === null) {
            $reply = miauw_generate_reply($conversationId, $messageForAi, $widgetMode);
        }
        if (function_exists('miauw_sanitize_operator_reply')) {
            $reply['text'] = miauw_sanitize_operator_reply((string) ($reply['text'] ?? ''));
        }
        if ($widgetMode && function_exists('miauw_widget_compact_reply')) {
            $reply['text'] = miauw_widget_compact_reply((string) ($reply['text'] ?? ''), $message);
        }
        miauw_add_message($conversationId, null, 'assistant', $reply['text'], $reply['model'], (bool) $reply['fallback']);
        $guardianCount = function_exists('miauw_intelligence_active_alerts') ? count(miauw_intelligence_active_alerts(30)) : 0;
        $guardianAlerts = function_exists('miauw_intelligence_public_alerts')
            ? miauw_intelligence_public_alerts(3)
            : (function_exists('miauw_intelligence_active_alerts') ? miauw_intelligence_active_alerts(3) : array());

        miauw_json(array(
            'ok' => true,
            'reply' => $reply['text'],
            'reply_parts' => function_exists('miauw_reply_parts') ? miauw_reply_parts($reply['text'], $widgetMode ? 2 : 5) : array($reply['text']),
            'fallback' => (bool) $reply['fallback'],
            'model' => $reply['model'],
            'time' => date('d/m/y H:i'),
            'guardian_alert_count' => $guardianCount,
            'guardian_alerts' => array_map(static function (array $alert): array {
                return array(
                    'id' => (int) ($alert['id'] ?? 0),
                    'title' => (string) ($alert['titulo'] ?? $alert['title'] ?? 'Alerta operacional'),
                    'severity' => (string) ($alert['severidade'] ?? $alert['severity'] ?? 'media'),
                    'module' => (string) ($alert['modulo'] ?? $alert['module'] ?? 'sistema'),
                    'message' => (string) ($alert['mensagem'] ?? $alert['message'] ?? ''),
                    'action' => (string) ($alert['acao_sugerida'] ?? $alert['action'] ?? ''),
                    'risk_score' => (int) ($alert['risco_score'] ?? $alert['risk_score'] ?? 50),
                );
            }, $guardianAlerts),
        ));
    }

    if ($action === 'clear') {
        miauw_clear_conversation($conversationId, (int) $user['id']);
        miauw_json(array('ok' => true, 'message' => 'Conversa limpa. A memoria respirou aliviada.'));
    }

    if ($action === 'dismiss_alert') {
        $role = (string) ($user['role'] ?? '');
        if (!in_array($role, array('admin', 'gerente'), true)) {
            miauw_json(array('ok' => false, 'message' => 'Seu usuario nao pode apagar alertas operacionais.'), 403);
        }

        $alertId = (int) ($_POST['alert_id'] ?? 0);
        if ($alertId <= 0 || !function_exists('miauw_intelligence_dismiss_alert')) {
            miauw_json(array('ok' => false, 'message' => 'Nao consegui apagar esse alerta agora.'), 422);
        }

        $dismissed = miauw_intelligence_dismiss_alert($alertId, (int) $user['id']);
        if (!$dismissed) {
            miauw_json(array('ok' => false, 'message' => 'Esse alerta ja sumiu ou nao esta disponivel.'), 404);
        }

        $guardianCount = function_exists('miauw_intelligence_active_alerts') ? count(miauw_intelligence_active_alerts(30)) : 0;
        miauw_json(array(
            'ok' => true,
            'message' => 'Alerta apagado da tela. Historico preservado para auditoria.',
            'guardian_alert_count' => $guardianCount,
        ));
    }

    miauw_json(array('ok' => false, 'message' => 'Acao invalida.'), 400);
} catch (Throwable $error) {
    error_log('Miauby API error: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        miauw_register_internal_error_alert('miauby', 'Erro na API do Miauby', $error, array('endpoint' => 'api.php'));
    }
    miauw_json(array('ok' => false, 'message' => 'Miauby nao conseguiu concluir agora. Registrei diagnostico interno. Acione o Codex se repetir.'), 500);
}
