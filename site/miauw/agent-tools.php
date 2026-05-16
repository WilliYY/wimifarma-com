<?php
declare(strict_types=1);

$miauwAgentToolsBufferLevel = ob_get_level();
ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_agent_tools_json(int $status, array $payload): void
{
    global $miauwAgentToolsBufferLevel;

    while (ob_get_level() > $miauwAgentToolsBufferLevel) {
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

function miauw_agent_tools_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';

    return is_string($value) ? trim($value) : '';
}

function miauw_agent_tools_token_valid(string $received): bool
{
    $expected = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    if ($expected === '') {
        $expected = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
    }

    return $received !== '' && $expected !== '' && hash_equals($expected, $received);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    miauw_agent_tools_json(405, array(
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
    miauw_agent_tools_json(503, array(
        'ok' => false,
        'error' => 'internal_token_not_configured',
        'message' => 'Ponte interna do agente sem token configurado.',
    ));
}

$receivedToken = miauw_agent_tools_header('X-Miauw-Agent-Token');
if ($receivedToken === '') {
    $receivedToken = miauw_agent_tools_header('X-Miauw-Internal-Token');
}

if (!miauw_agent_tools_token_valid($receivedToken)) {
    miauw_agent_tools_json(401, array(
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
    miauw_agent_tools_json(413, array(
        'ok' => false,
        'error' => 'payload_too_large',
        'message' => 'Payload grande demais.',
    ));
}

$body = $rawBody !== '' ? json_decode($rawBody, true) : null;
if (!is_array($body)) {
    miauw_agent_tools_json(400, array(
        'ok' => false,
        'error' => 'invalid_json',
        'message' => 'JSON invalido.',
    ));
}

$tool = trim((string) ($body['tool'] ?? ''));
$args = is_array($body['args'] ?? null) ? $body['args'] : array();
$traceId = miauw_substr(trim((string) ($body['trace_id'] ?? '')), 0, 80);

if (!function_exists('miauw_agent_node_read_tool_allowed') || !miauw_agent_node_read_tool_allowed($tool)) {
    miauw_agent_tools_json(403, array(
        'ok' => false,
        'error' => 'tool_not_allowed',
        'message' => 'Tool nao liberada para leitura pelo agente.',
        'writes_enabled' => false,
    ));
}

try {
    $result = miauw_agent_node_read_tool_result($tool, $args, $traceId);
    miauw_agent_tools_json(200, $result);
} catch (Throwable $error) {
    $message = function_exists('miauw_diagnostic_redact_string')
        ? miauw_diagnostic_redact_string($error->getMessage())
        : 'Falha interna ao executar tool.';

    miauw_agent_tools_json(500, array(
        'ok' => false,
        'error' => 'tool_execution_failed',
        'message' => $message,
        'writes_enabled' => false,
    ));
}
