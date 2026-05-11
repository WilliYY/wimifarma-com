<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function miauw_widget_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    echo is_string($json) ? $json : '{"ok":true,"authenticated":false,"message":"Miauby ainda nao carregou."}';
    exit;
}

try {
    $user = current_user();
    $payload = array(
        'ok' => true,
        'authenticated' => false,
        'csrf' => csrf_token(),
        'avatar' => miauw_avatar_src(),
        'login_url' => '/miauw/login.php',
        'api_ready' => trim(miauw_constant_string('MIAUW_OPENAI_API_KEY')) !== '',
    );

    if ($user) {
        $payload['authenticated'] = true;
        $payload['username'] = $user['username'] ?? '';
        $payload['messages'] = array();

        try {
            miauw_ensure_schema();
            if (function_exists('miauw_guardian_scan')) {
                miauw_guardian_scan(false);
            }

            $conversationId = miauw_current_conversation_id((int) $user['id']);

            foreach (miauw_messages($conversationId, 14) as $message) {
                $payload['messages'][] = array(
                    'role' => $message['papel'],
                    'text' => $message['conteudo'],
                    'time' => miauw_message_time((string) $message['created_at']),
                    'fallback' => !empty($message['fallback']),
                );
            }

            if (function_exists('miauw_intelligence_active_alerts')) {
                $alerts = function_exists('miauw_intelligence_public_alerts')
                    ? miauw_intelligence_public_alerts(3)
                    : miauw_intelligence_active_alerts(3);
                $payload['guardian_alert_count'] = function_exists('miauw_intelligence_active_alert_count')
                    ? miauw_intelligence_active_alert_count()
                    : count(miauw_intelligence_active_alerts(30));
                $payload['guardian_alerts'] = array_map(static function (array $alert): array {
                    return array(
                        'id' => (int) ($alert['id'] ?? 0),
                        'fingerprint' => (string) ($alert['fingerprint'] ?? ''),
                        'module' => (string) ($alert['modulo'] ?? 'sistema'),
                        'type' => (string) ($alert['tipo'] ?? ''),
                        'severity' => (string) ($alert['severidade'] ?? 'media'),
                        'title' => (string) ($alert['titulo'] ?? ''),
                        'message' => (string) ($alert['mensagem'] ?? ''),
                        'action' => (string) ($alert['acao_sugerida'] ?? ''),
                        'speech' => (string) ($alert['comentario_balao'] ?? ''),
                        'risk_score' => (int) ($alert['risco_score'] ?? 50),
                        'occurrences' => (int) ($alert['ocorrencias'] ?? 1),
                        'last_seen_at' => (string) ($alert['last_seen_at'] ?? ''),
                    );
                }, $alerts);
            }
        } catch (Throwable $innerError) {
            error_log('Miauby widget authenticated status error: ' . $innerError->getMessage());
            if (function_exists('miauw_register_internal_error_alert')) {
                try {
                    miauw_register_internal_error_alert('miauby', 'Erro ao carregar memoria do widget Miauby', $innerError, array('endpoint' => 'widget-status.php'));
                } catch (Throwable $alertError) {
                    error_log('Miauby internal alert failed after status error: ' . $alertError->getMessage());
                }
            }
            $payload['schema_warning'] = true;
            $payload['messages'][] = array(
                'role' => 'assistant',
                'text' => 'Miauby entrou, mas parte da memoria esta acordando. Tente de novo em instantes.',
                'time' => date('d/m/y H:i'),
                'fallback' => true,
            );
        }
    }

    miauw_widget_json($payload);
} catch (Throwable $error) {
    error_log('Miauby widget status error: ' . $error->getMessage());
    if (function_exists('miauw_register_internal_error_alert')) {
        try {
            miauw_register_internal_error_alert('miauby', 'Erro no status do widget Miauby', $error, array('endpoint' => 'widget-status.php'));
        } catch (Throwable $alertError) {
            error_log('Miauby internal alert failed after top-level status error: ' . $alertError->getMessage());
        }
    }
    miauw_widget_json(array(
        'ok' => true,
        'authenticated' => false,
        'csrf' => function_exists('csrf_token') ? csrf_token() : '',
        'avatar' => function_exists('miauw_avatar_src') ? miauw_avatar_src() : '/miauw/miauw.png',
        'login_url' => '/miauw/login.php',
        'api_ready' => defined('MIAUW_OPENAI_API_KEY') && trim((string) MIAUW_OPENAI_API_KEY) !== '',
        'message' => 'Miauby ainda nao carregou. Tente novamente em instantes.',
        'fallback' => true,
    ));
}
