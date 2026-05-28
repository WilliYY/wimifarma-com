<?php
declare(strict_types=1);

$miauwAgentContextBufferLevel = ob_get_level();
ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_agent_context_json(int $status, array $payload): void
{
    global $miauwAgentContextBufferLevel;

    while (ob_get_level() > $miauwAgentContextBufferLevel) {
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

function miauw_agent_context_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';

    return is_string($value) ? trim($value) : '';
}

function miauw_agent_context_token_valid(string $received): bool
{
    $expected = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    if ($expected === '') {
        $expected = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
    }

    return $received !== '' && $expected !== '' && hash_equals($expected, $received);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    miauw_agent_context_json(405, array(
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
    miauw_agent_context_json(503, array(
        'ok' => false,
        'error' => 'internal_token_not_configured',
        'message' => 'Contexto interno do agente sem token configurado.',
    ));
}

$receivedToken = miauw_agent_context_header('X-Miauw-Agent-Token');
if ($receivedToken === '') {
    $receivedToken = miauw_agent_context_header('X-Miauw-Internal-Token');
}

if (!miauw_agent_context_token_valid($receivedToken)) {
    miauw_agent_context_json(401, array(
        'ok' => false,
        'error' => 'unauthorized',
        'message' => 'Token interno invalido.',
    ));
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody)) {
    $rawBody = '';
}

if (strlen($rawBody) > 32768) {
    miauw_agent_context_json(413, array(
        'ok' => false,
        'error' => 'payload_too_large',
        'message' => 'Payload grande demais.',
    ));
}

$body = $rawBody !== '' ? json_decode($rawBody, true) : array();
if (!is_array($body)) {
    miauw_agent_context_json(400, array(
        'ok' => false,
        'error' => 'invalid_json',
        'message' => 'JSON invalido.',
    ));
}

$message = miauw_substr(trim((string) ($body['message'] ?? '')), 0, 4000);
$pageContext = miauw_substr(trim((string) ($body['page_context'] ?? $body['pageContext'] ?? 'whatsapp')), 0, 120);
$userContext = is_array($body['user_context'] ?? null) ? $body['user_context'] : array();
$userId = isset($userContext['id']) ? (int) $userContext['id'] : null;
$channelContextOptions = array(
    'contact_hash' => miauw_substr(trim((string) ($userContext['contact_hash'] ?? '')), 0, 64),
    'contact_mask' => miauw_substr(trim((string) ($userContext['contact_mask'] ?? '')), 0, 40),
    'channel' => miauw_substr(trim((string) ($userContext['channel'] ?? $pageContext)), 0, 40),
);

try {
    if (function_exists('miauw_ensure_schema')) {
        miauw_ensure_schema();
    }
    $styleContext = function_exists('miauw_agent_style_context_export')
        ? miauw_agent_style_context_export($message, $userId, $pageContext, $channelContextOptions)
        : array();
    $toolContracts = function_exists('miauw_agent_tool_contract_export')
        ? miauw_agent_tool_contract_export()
        : array();
    $personality = function_exists('miauw_agent_personality_contract')
        ? miauw_agent_personality_contract()
        : array();

    miauw_agent_context_json(200, array(
        'ok' => true,
        'source' => 'php_miauby_core',
        'version' => 'miauby-shared-context-2026-05-27',
        'style_context' => $styleContext,
        'channel_memory' => is_array($styleContext['channel_memory'] ?? null) ? $styleContext['channel_memory'] : array('items' => array()),
        'tool_contracts' => $toolContracts,
        'personality' => $personality,
        'writes_enabled_in_node' => false,
        'strong_actions' => 'confirmation_required',
    ));
} catch (Throwable $error) {
    $message = function_exists('miauw_diagnostic_redact_string')
        ? miauw_diagnostic_redact_string($error->getMessage())
        : 'Falha interna ao montar contexto.';

    miauw_agent_context_json(500, array(
        'ok' => false,
        'error' => 'context_export_failed',
        'message' => $message,
    ));
}
