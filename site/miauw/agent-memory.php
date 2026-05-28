<?php
declare(strict_types=1);

$miauwAgentMemoryBufferLevel = ob_get_level();
ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_agent_memory_json(int $status, array $payload): void
{
    global $miauwAgentMemoryBufferLevel;

    while (ob_get_level() > $miauwAgentMemoryBufferLevel) {
        ob_end_clean();
    }

    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function miauw_agent_memory_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';

    return is_string($value) ? trim($value) : '';
}

function miauw_agent_memory_token_valid(string $received): bool
{
    $expected = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    if ($expected === '') {
        $expected = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
    }

    return $received !== '' && $expected !== '' && hash_equals($expected, $received);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    miauw_agent_memory_json(405, array(
        'ok' => false,
        'error' => 'method_not_allowed',
        'message' => 'Use POST.',
    ));
}

$configuredToken = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
if ($configuredToken === '') {
    $configuredToken = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
}

if ($configuredToken === '') {
    miauw_agent_memory_json(503, array(
        'ok' => false,
        'error' => 'internal_token_not_configured',
        'message' => 'Memoria interna do agente sem token configurado.',
    ));
}

$receivedToken = miauw_agent_memory_header('X-Miauw-Agent-Token');
if ($receivedToken === '') {
    $receivedToken = miauw_agent_memory_header('X-Miauw-Internal-Token');
}

if (!miauw_agent_memory_token_valid($receivedToken)) {
    miauw_agent_memory_json(401, array(
        'ok' => false,
        'error' => 'unauthorized',
        'message' => 'Token interno invalido.',
    ));
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody)) {
    $rawBody = '';
}

if (strlen($rawBody) > 65536) {
    miauw_agent_memory_json(413, array(
        'ok' => false,
        'error' => 'payload_too_large',
        'message' => 'Payload grande demais.',
    ));
}

$body = $rawBody !== '' ? json_decode($rawBody, true) : array();
if (!is_array($body)) {
    miauw_agent_memory_json(400, array(
        'ok' => false,
        'error' => 'invalid_json',
        'message' => 'JSON invalido.',
    ));
}

$mode = strtolower(trim((string) ($body['mode'] ?? 'record')));

try {
    if (function_exists('miauw_ensure_schema')) {
        miauw_ensure_schema();
    }

    if ($mode === 'recent') {
        $message = miauw_substr(trim((string) ($body['message'] ?? '')), 0, 4000);
        $pageContext = miauw_substr(trim((string) ($body['page_context'] ?? $body['pageContext'] ?? '')), 0, 120);
        $userContext = is_array($body['user_context'] ?? null) ? $body['user_context'] : array();
        $userId = isset($userContext['id']) ? (int) $userContext['id'] : null;
        $options = is_array($body['options'] ?? null) ? $body['options'] : array();
        if (isset($userContext['contact_hash']) && !isset($options['contact_hash'])) {
            $options['contact_hash'] = (string) $userContext['contact_hash'];
        }

        miauw_agent_memory_json(200, array(
            'ok' => true,
            'memory' => function_exists('miauw_channel_context_export')
                ? miauw_channel_context_export($message, $userId, $pageContext, $options)
                : array('items' => array()),
        ));
    }

    $events = array();
    if ($mode === 'record_batch') {
        $rawEvents = is_array($body['events'] ?? null) ? $body['events'] : array();
        foreach (array_slice($rawEvents, 0, 12) as $event) {
            if (is_array($event)) {
                $events[] = $event;
            }
        }
    } else {
        $event = is_array($body['event'] ?? null) ? $body['event'] : $body;
        $events[] = $event;
    }

    $recorded = 0;
    foreach ($events as $event) {
        if (function_exists('miauw_channel_event_record') && miauw_channel_event_record($event)) {
            $recorded++;
        }
    }

    miauw_agent_memory_json(200, array(
        'ok' => true,
        'mode' => $mode,
        'recorded' => $recorded,
    ));
} catch (Throwable $error) {
    $message = function_exists('miauw_diagnostic_redact_string')
        ? miauw_diagnostic_redact_string($error->getMessage())
        : 'Falha interna ao gravar memoria.';

    miauw_agent_memory_json(500, array(
        'ok' => false,
        'error' => 'memory_failed',
        'message' => $message,
    ));
}
