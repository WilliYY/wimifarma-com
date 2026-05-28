<?php
declare(strict_types=1);

ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_json(array $payload, int $status = 200): void
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

    if ($action === 'audio_transcribe') {
        $traceId = function_exists('miauw_trace_new_id') ? miauw_trace_new_id() : bin2hex(random_bytes(8));
        if (function_exists('miauw_trace_set_context')) {
            miauw_trace_set_context($traceId, $conversationId, (int) $user['id'], null);
        }

        $maintenance = function_exists('miauw_maintenance_status') ? miauw_maintenance_status($user) : array('active' => false, 'can_send' => true);
        if (function_exists('miauw_user_can_send_miauw') && !miauw_user_can_send_miauw($user)) {
            miauw_json(array(
                'ok' => false,
                'message' => (string) ($maintenance['message'] ?? 'Miauby esta em atualizacao interna agora.'),
                'maintenance' => $maintenance,
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ), 423);
        }

        $audioFile = is_array($_FILES['audio'] ?? null) ? $_FILES['audio'] : array();
        $durationMs = max(0, (int) ($_POST['duration_ms'] ?? 0));
        if (function_exists('miauw_trace_record')) {
            miauw_trace_record('miauw_audio_transcribe', 'received', array(
                'type' => 'audio',
                'summary' => 'Audio temporario recebido para transcricao confirmada.',
                'payload' => array(
                    'bytes' => (int) ($audioFile['size'] ?? 0),
                    'duration_ms' => $durationMs,
                    'mode' => 'record_transcribe_voice_reply_confirmed',
                ),
            ));
        }

        try {
            $audio = miauw_agent_transcribe_audio_upload($audioFile, $user, $durationMs);
            if (function_exists('miauw_trace_record')) {
                miauw_trace_record('miauw_audio_transcribe', 'ok', array(
                    'type' => 'audio',
                    'summary' => 'Audio transcrito para rascunho revisavel, sem armazenar arquivo.',
                    'payload' => array(
                        'model' => (string) ($audio['model'] ?? ''),
                        'mode' => (string) ($audio['mode'] ?? ''),
                        'bytes' => (int) ($audio['bytes'] ?? 0),
                        'duration_ms' => (int) ($audio['duration_ms'] ?? $durationMs),
                        'text_size' => miauw_strlen((string) ($audio['text'] ?? '')),
                    ),
                ));
            }

            miauw_json(array(
                'ok' => true,
                'text' => (string) ($audio['text'] ?? ''),
                'model' => (string) ($audio['model'] ?? ''),
                'mode' => (string) ($audio['mode'] ?? ''),
                'duration_ms' => (int) ($audio['duration_ms'] ?? $durationMs),
                'trace_id' => $traceId,
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ));
        } catch (Throwable $error) {
            if (function_exists('miauw_trace_record')) {
                miauw_trace_record('miauw_audio_transcribe', 'blocked', array(
                    'type' => 'audio',
                    'summary' => 'Audio do Miauby nao foi transcrito.',
                    'error' => $error->getMessage(),
                    'payload' => array(
                        'contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
                    ),
                ));
            }

            miauw_json(array(
                'ok' => false,
                'message' => 'Nao consegui transcrever esse audio agora. Permita o microfone, grave de novo e me mande sem pressa.',
                'detail' => $error instanceof InvalidArgumentException ? $error->getMessage() : '',
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ), 422);
        }
    }

    if ($action === 'audio_session') {
        $traceId = function_exists('miauw_trace_new_id') ? miauw_trace_new_id() : bin2hex(random_bytes(8));
        if (function_exists('miauw_trace_set_context')) {
            miauw_trace_set_context($traceId, $conversationId, (int) $user['id'], null);
        }

        $maintenance = function_exists('miauw_maintenance_status') ? miauw_maintenance_status($user) : array('active' => false, 'can_send' => true);
        if (function_exists('miauw_user_can_send_miauw') && !miauw_user_can_send_miauw($user)) {
            miauw_json(array(
                'ok' => false,
                'message' => (string) ($maintenance['message'] ?? 'Miauby esta em atualizacao interna agora.'),
                'maintenance' => $maintenance,
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ), 423);
        }

        miauw_json(array(
            'ok' => false,
            'message' => 'Atualize a pagina: o audio agora grava, transcreve e espera voce apertar Enviar ou Cancelar.',
            'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
        ), 409);

        $sdp = (string) ($_POST['sdp'] ?? '');
        if (function_exists('miauw_trace_record')) {
            miauw_trace_record('miauw_audio_session', 'received', array(
                'type' => 'audio',
                'summary' => 'Pedido de audio recebido pelo Miauby.',
                'payload' => array(
                    'sdp_bytes' => strlen($sdp),
                    'mode' => 'realtime_webrtc',
                ),
            ));
        }

        try {
            $audio = miauw_agent_create_realtime_call($sdp, $user);
            if (function_exists('miauw_trace_record')) {
                miauw_trace_record('miauw_audio_session', 'ok', array(
                    'type' => 'audio',
                    'summary' => 'Sessao de audio criada sem armazenar audio.',
                    'payload' => array(
                        'model' => (string) ($audio['model'] ?? ''),
                        'voice' => (string) ($audio['voice'] ?? ''),
                        'mode' => (string) ($audio['mode'] ?? ''),
                    ),
                ));
            }

            miauw_json(array(
                'ok' => true,
                'answer_sdp' => (string) ($audio['answer_sdp'] ?? ''),
                'model' => (string) ($audio['model'] ?? ''),
                'voice' => (string) ($audio['voice'] ?? ''),
                'mode' => (string) ($audio['mode'] ?? ''),
                'trace_id' => $traceId,
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ));
        } catch (Throwable $error) {
            if (function_exists('miauw_trace_record')) {
                miauw_trace_record('miauw_audio_session', 'blocked', array(
                    'type' => 'audio',
                    'summary' => 'Audio do Miauby nao iniciou.',
                    'error' => $error->getMessage(),
                    'payload' => array(
                        'contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
                    ),
                ));
            }

            miauw_json(array(
                'ok' => false,
                'message' => 'Nao consegui abrir o audio agora. Meu bigode nao vai fingir: revise permissao do microfone e configuracao interna.',
                'audio_contract' => function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array(),
            ), 422);
        }
    }

    if ($action === 'send') {
        $message = trim((string) ($_POST['message'] ?? ''));
        $widgetMode = !empty($_POST['widget']);
        $voiceReplyRequested = !empty($_POST['voice_reply']);
        $inputMode = trim((string) ($_POST['input_mode'] ?? 'text'));
        $silentConfirmation = !empty($_POST['silent_confirmation'])
            && preg_match('/^\s*(?:confirmar|confirma|confirmo|cancelar|cancela)\s+[0-9a-f]{8}\s*$/iu', $message) === 1;

        if ($message === '') {
            miauw_json(array('ok' => false, 'message' => 'Mensagem vazia. Ate o Miauby precisa de alguma coisa para reclamar.'), 422);
        }

        if (miauw_strlen($message) > 1200) {
            miauw_json(array('ok' => false, 'message' => 'Texto grande demais. Resume, Machado de Assis operacional.'), 422);
        }

        $maintenance = function_exists('miauw_maintenance_status') ? miauw_maintenance_status($user) : array('active' => false, 'can_send' => true);
        if (function_exists('miauw_user_can_send_miauw') && !miauw_user_can_send_miauw($user)) {
            miauw_json(array(
                'ok' => false,
                'message' => (string) ($maintenance['message'] ?? 'Miauby esta em atualizacao interna agora.'),
                'maintenance' => $maintenance,
                'agent_status' => function_exists('miauw_agent_public_status') ? miauw_agent_public_status() : array(),
                'agent_runtime' => function_exists('miauw_agent_runtime_status') ? miauw_agent_runtime_status($user) : array(),
            ), 423);
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

        $traceId = function_exists('miauw_trace_new_id') ? miauw_trace_new_id() : bin2hex(random_bytes(8));
        $userMessageId = $silentConfirmation
            ? null
            : miauw_add_message($conversationId, (int) $user['id'], 'user', $message);
        if (function_exists('miauw_trace_set_context')) {
            miauw_trace_set_context($traceId, $conversationId, (int) $user['id'], $userMessageId);
        }
        if (function_exists('miauw_trace_record')) {
            miauw_trace_record('api_send', 'received', array(
                'type' => 'request',
                'summary' => 'Mensagem recebida pelo Miauby.',
                'payload' => array(
                    'widget' => $widgetMode,
                    'page_context' => $pageContext !== '',
                    'input_mode' => $inputMode === 'audio' ? 'audio' : 'text',
                    'voice_reply' => $voiceReplyRequested,
                    'silent_confirmation' => $silentConfirmation,
                    'message_size' => miauw_strlen($message),
                ),
            ));
        }
        if (function_exists('miauw_channel_event_record')) {
            miauw_channel_event_record(array(
                'event_uid' => $userMessageId !== null ? 'internal:user:' . $userMessageId : 'internal:user:' . $traceId,
                'channel' => 'internal',
                'direction' => 'inbound',
                'role' => 'user',
                'usuario_id' => (int) $user['id'],
                'conversation_id' => $conversationId,
                'trace_id' => $traceId,
                'module_key' => 'miauw',
                'intent' => $widgetMode ? 'widget_chat' : 'internal_chat',
                'engine' => 'miauw',
                'status' => $silentConfirmation ? 'silent_confirmation' : 'received',
                'message_preview' => $message,
                'metadata' => array(
                    'widget' => $widgetMode,
                    'page_context' => $pageContext !== '',
                    'input_mode' => $inputMode === 'audio' ? 'audio' : 'text',
                    'voice_reply' => $voiceReplyRequested,
                ),
            ));
        }

        $reply = miauw_try_controlled_action($message, (int) $user['id'], $pageContext, $widgetMode, $conversationId, $traceId);
        if ($reply === null && $silentConfirmation) {
            $reply = array(
                'text' => 'Essa confirmacao expirou ou nao esta mais disponivel. Gere a acao de novo para eu confirmar sem misturar dados.',
                'fallback' => false,
                'model' => 'miauw-confirmacao',
            );
        }
        if ($reply === null) {
            $reply = miauw_generate_reply($conversationId, $messageForAi, $widgetMode);
        }
        if (function_exists('miauw_sanitize_operator_reply')) {
            $reply['text'] = miauw_sanitize_operator_reply((string) ($reply['text'] ?? ''));
        }
        if ($widgetMode && function_exists('miauw_widget_compact_reply')) {
            $reply['text'] = miauw_widget_compact_reply((string) ($reply['text'] ?? ''), $message);
        }
        $assistantMessageId = miauw_add_message($conversationId, null, 'assistant', $reply['text'], $reply['model'], (bool) $reply['fallback']);
        $shadowCompare = !$silentConfirmation && function_exists('miauw_agent_shadow_maybe')
            ? miauw_agent_shadow_maybe(
                $conversationId,
                $messageForAi,
                (string) ($reply['text'] ?? ''),
                (string) ($reply['model'] ?? ''),
                $widgetMode,
                $assistantMessageId
            )
            : null;
        $confirmation = is_array($reply['confirmation'] ?? null)
            ? $reply['confirmation']
            : (function_exists('miauw_current_confirmation_response') ? miauw_current_confirmation_response() : null);

        $replyAudio = null;
        $replyAudioError = '';
        if ($voiceReplyRequested && !is_array($confirmation) && function_exists('miauw_agent_generate_speech_reply')) {
            try {
                $replyAudio = miauw_agent_generate_speech_reply((string) ($reply['text'] ?? ''), $user);
                if (function_exists('miauw_trace_record')) {
                    miauw_trace_record('miauw_audio_speech', 'ok', array(
                        'type' => 'audio',
                        'summary' => 'Resposta falada gerada sob demanda, sem armazenar arquivo.',
                        'mensagem_id' => $assistantMessageId,
                        'payload' => array(
                            'model' => (string) ($replyAudio['model'] ?? ''),
                            'voice' => (string) ($replyAudio['voice'] ?? ''),
                            'bytes' => (int) ($replyAudio['bytes'] ?? 0),
                            'text_size' => (int) ($replyAudio['text_size'] ?? 0),
                        ),
                    ));
                }
            } catch (Throwable $audioError) {
                $replyAudioError = $audioError instanceof InvalidArgumentException ? $audioError->getMessage() : 'Nao consegui gerar a voz agora.';
                if (function_exists('miauw_trace_record')) {
                    miauw_trace_record('miauw_audio_speech', 'blocked', array(
                        'type' => 'audio',
                        'summary' => 'Resposta falada nao foi gerada; texto segue disponivel.',
                        'mensagem_id' => $assistantMessageId,
                        'error' => $audioError->getMessage(),
                    ));
                }
            }
        }

        if (function_exists('miauw_trace_record')) {
            miauw_trace_record('api_send', 'ok', array(
                'type' => 'request',
                'summary' => 'Resposta entregue pelo Miauby.',
                'mensagem_id' => $assistantMessageId,
                'payload' => array(
                    'model' => (string) ($reply['model'] ?? ''),
                    'engine' => (string) ($reply['engine'] ?? ''),
                    'fallback' => (bool) ($reply['fallback'] ?? false),
                    'requires_confirmation' => is_array($confirmation),
                    'voice_reply' => $voiceReplyRequested,
                    'voice_reply_audio' => is_array($replyAudio),
                    'silent_confirmation' => $silentConfirmation,
                    'agent_shadow' => is_array($shadowCompare) ? array(
                        'status' => (string) ($shadowCompare['status'] ?? ''),
                        'similarity' => isset($shadowCompare['similarity']) ? (float) $shadowCompare['similarity'] : null,
                        'duration_ms' => isset($shadowCompare['duration_ms']) ? (int) $shadowCompare['duration_ms'] : null,
                    ) : null,
                ),
            ));
        }
        if (function_exists('miauw_channel_event_record')) {
            miauw_channel_event_record(array(
                'event_uid' => 'internal:assistant:' . $assistantMessageId,
                'channel' => 'internal',
                'direction' => 'outbound',
                'role' => 'assistant',
                'usuario_id' => (int) $user['id'],
                'conversation_id' => $conversationId,
                'trace_id' => $traceId,
                'module_key' => 'miauw',
                'intent' => is_array($confirmation) ? 'confirmation_required' : ($widgetMode ? 'widget_chat' : 'internal_chat'),
                'engine' => (string) ($reply['engine'] ?? $reply['model'] ?? 'miauw'),
                'status' => (bool) ($reply['fallback'] ?? false) ? 'fallback' : 'ok',
                'message_preview' => $message,
                'reply_preview' => (string) ($reply['text'] ?? ''),
                'metadata' => array(
                    'model' => (string) ($reply['model'] ?? ''),
                    'fallback' => (bool) ($reply['fallback'] ?? false),
                    'requires_confirmation' => is_array($confirmation),
                    'voice_reply_audio' => is_array($replyAudio),
                ),
            ));
        }
        $guardianCount = function_exists('miauw_intelligence_active_alert_count')
            ? miauw_intelligence_active_alert_count()
            : (function_exists('miauw_intelligence_active_alerts') ? count(miauw_intelligence_active_alerts(30)) : 0);
        $guardianAlerts = function_exists('miauw_intelligence_public_alerts')
            ? miauw_intelligence_public_alerts(3)
            : (function_exists('miauw_intelligence_active_alerts') ? miauw_intelligence_active_alerts(3) : array());

        miauw_json(array(
            'ok' => true,
            'reply' => $reply['text'],
            'reply_parts' => function_exists('miauw_reply_parts') ? miauw_reply_parts($reply['text'], $widgetMode ? 2 : 5) : array($reply['text']),
            'fallback' => (bool) $reply['fallback'],
            'model' => $reply['model'],
            'engine' => (string) ($reply['engine'] ?? ''),
            'trace_id' => $traceId,
            'user_message_id' => $userMessageId,
            'silent_confirmation' => $silentConfirmation,
            'assistant_message_id' => $assistantMessageId,
            'reply_audio' => $replyAudio,
            'reply_audio_error' => $replyAudioError,
            'confirmation' => $confirmation,
            'agent_status' => function_exists('miauw_agent_public_status') ? miauw_agent_public_status() : array(
                'name' => 'Miauby',
                'version' => defined('MIAUW_VERSION') ? MIAUW_VERSION : '',
            ),
            'agent_runtime' => function_exists('miauw_agent_runtime_status') ? miauw_agent_runtime_status($user) : array(),
            'maintenance' => $maintenance,
            'time' => date('d/m/y H:i'),
            'guardian_alert_count' => $guardianCount,
            'guardian_alerts' => array_map(static function (array $alert): array {
                return array(
                    'id' => (int) ($alert['id'] ?? 0),
                    'title' => (string) ($alert['titulo'] ?? $alert['title'] ?? 'Alerta operacional'),
                    'severity' => (string) ($alert['severidade'] ?? $alert['severity'] ?? 'media'),
                    'module' => (string) ($alert['modulo'] ?? $alert['module'] ?? 'sistema'),
                    'type' => (string) ($alert['tipo'] ?? $alert['type'] ?? ''),
                    'message' => (string) ($alert['mensagem'] ?? $alert['message'] ?? ''),
                    'action' => (string) ($alert['acao_sugerida'] ?? $alert['action'] ?? ''),
                    'speech' => (string) ($alert['comentario_balao'] ?? $alert['speech'] ?? ''),
                    'risk_score' => (int) ($alert['risco_score'] ?? $alert['risk_score'] ?? 50),
                );
            }, $guardianAlerts),
        ));
    }

    if ($action === 'train_feedback') {
        $assistantMessageId = (int) ($_POST['assistant_message_id'] ?? 0);
        if ($assistantMessageId <= 0) {
            miauw_json(array('ok' => false, 'message' => 'Nao achei esse balao para treinar.'), 422);
        }

        $rating = (string) ($_POST['rating'] ?? 'ajuste');
        $reason = (string) ($_POST['reason'] ?? '');
        $ideal = (string) ($_POST['ideal'] ?? '');
        $category = (string) ($_POST['category'] ?? '');
        $style = (string) ($_POST['style'] ?? '');
        $autoApprove = function_exists('miauw_diagnostics_can_review')
            && miauw_diagnostics_can_review($user)
            && strtolower(trim($rating)) === 'boa';

        $result = miauw_training_create_feedback(
            $conversationId,
            (int) $user['id'],
            $assistantMessageId,
            $rating,
            $reason,
            $ideal,
            $category,
            $style,
            $autoApprove
        );

        miauw_json(array(
            'ok' => true,
            'id' => (int) ($result['id'] ?? 0),
            'status' => (string) ($result['status'] ?? 'pendente'),
            'rating' => (string) ($result['rating'] ?? ''),
            'message' => ((string) ($result['status'] ?? 'pendente')) === 'aprovado'
                ? 'Treino aprovado. Meu bigode anotou esse jeito.'
                : 'Treino guardado para revisao. Nada foi apagado.',
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

        $guardianCount = function_exists('miauw_intelligence_active_alert_count')
            ? miauw_intelligence_active_alert_count()
            : (function_exists('miauw_intelligence_active_alerts') ? count(miauw_intelligence_active_alerts(30)) : 0);
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
    miauw_json(array('ok' => false, 'message' => 'Miauby nao conseguiu concluir agora. Registrei diagnostico interno. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.'), 500);
}
