<?php
declare(strict_types=1);

$miauwAgentActionsBufferLevel = ob_get_level();
ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_agent_actions_json(int $status, array $payload): void
{
    global $miauwAgentActionsBufferLevel;

    while (ob_get_level() > $miauwAgentActionsBufferLevel) {
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

function miauw_agent_actions_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';

    return is_string($value) ? trim($value) : '';
}

function miauw_agent_actions_token_valid(string $received): bool
{
    $expected = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    if ($expected === '') {
        $expected = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
    }

    return $received !== '' && $expected !== '' && hash_equals($expected, $received);
}

function miauw_agent_actions_allowlist(): array
{
    $raw = miauw_env_string(array('MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST'));
    if ($raw === '') {
        $raw = 'registrar_sangria,criar_lancamento_financeiro,criar_conta_gestao';
    }

    $items = preg_split('/[,\s;]+/', $raw) ?: array();
    $allowed = array();
    foreach ($items as $item) {
        $tool = trim((string) $item);
        if ($tool !== '') {
            $allowed[$tool] = true;
        }
    }

    return $allowed;
}

function miauw_agent_actions_tool_allowed(string $tool): bool
{
    $allowed = miauw_agent_actions_allowlist();

    return isset($allowed[$tool]);
}

function miauw_agent_actions_clean_responsible(string $value): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? '');
    $value = preg_replace('/\b(?:responsavel|resp|feito por|feita por|quem fez|operador|caixa)\b/iu', ' ', $value) ?? $value;
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? '');

    return $value === '' ? '' : miauw_substr($value, 0, 70);
}

function miauw_agent_actions_user_context(array $body): array
{
    $context = $body['user_context'] ?? array();
    return is_array($context) ? $context : array();
}

function miauw_agent_actions_context_user_id(array $context): int
{
    if (function_exists('miauw_user_context_id')) {
        return miauw_user_context_id($context);
    }

    foreach (array('id', 'usuario_id', 'user_id') as $key) {
        $value = (int) ($context[$key] ?? 0);
        if ($value > 0) {
            return $value;
        }
    }

    return 0;
}

function miauw_agent_actions_context_username(array $context): string
{
    if (function_exists('miauw_user_context_username')) {
        return miauw_user_context_username($context);
    }

    $username = trim((string) ($context['username'] ?? ''));
    if ($username === '' || str_starts_with(strtolower($username), 'whatsapp:')) {
        return '';
    }

    return miauw_substr($username, 0, 80);
}

function miauw_agent_actions_resolve_actor(array $context, string $manualResponsible = ''): array
{
    if (function_exists('miauw_resolve_responsible_actor')) {
        return miauw_resolve_responsible_actor(array(
            'user_context' => $context,
            'manual' => $manualResponsible,
            'prefer_session' => false,
        ));
    }

    $username = miauw_agent_actions_context_username($context);
    return array(
        'user_id' => miauw_agent_actions_context_user_id($context) ?: null,
        'username' => $username,
        'display_name' => $username,
        'source' => $username !== '' ? 'context' : 'unidentified',
        'identified' => $username !== '',
    );
}

function miauw_agent_actions_confirmation(string $tool, array $command, ?string $summary = null): array
{
    $meta = function_exists('miauw_tool_public_meta') ? miauw_tool_public_meta($tool) : array();
    $summary = $summary !== null && trim($summary) !== ''
        ? trim($summary)
        : (function_exists('miauw_confirmation_summary') ? miauw_confirmation_summary($tool, $command) : 'Acao operacional pendente.');

    return array(
        'ok' => true,
        'status' => 'confirmation_required',
        'confirmation' => array(
            'tool' => $tool,
            'summary' => miauw_substr($summary, 0, 500),
            'risk' => (string) ($meta['risco'] ?? 'alto'),
            'command' => $command,
        ),
    );
}

function miauw_agent_actions_prepare_financeiro(string $message, array $userContext = array()): ?array
{
    if (!function_exists('miauw_skill_financeiro_command_from_message')) {
        return null;
    }

    $command = miauw_skill_financeiro_command_from_message($message);
    if (!is_array($command)) {
        return null;
    }

    $contextUserId = miauw_agent_actions_context_user_id($userContext);
    $contextUsername = miauw_agent_actions_context_username($userContext);
    $command['responsavel'] = miauw_agent_actions_clean_responsible((string) ($command['responsavel'] ?? ''));
    $actor = miauw_agent_actions_resolve_actor($userContext, (string) ($command['responsavel'] ?? ''));
    if (function_exists('miauw_apply_responsible_actor_to_command')) {
        $command = miauw_apply_responsible_actor_to_command($command, $actor, true);
    } elseif ($command['responsavel'] === '' && trim((string) ($actor['display_name'] ?? '')) !== '') {
        $command['responsavel'] = (string) $actor['display_name'];
    }
    if ($contextUserId > 0 && !isset($command['usuario_id'])) {
        $command['usuario_id'] = $contextUserId;
    }
    if ($contextUsername !== '' && !isset($command['username'])) {
        $command['username'] = $contextUsername;
    }
    $command['raw_message'] = 'whatsapp_action_prepare_financeiro: ' . miauw_substr($message, 0, 260);

    $missing = array();
    if (trim((string) ($command['categoria'] ?? '')) === '') {
        $missing[] = 'categoria';
    }
    if ((float) ($command['valor'] ?? 0) <= 0) {
        $missing[] = 'valor';
    }
    if (trim((string) ($command['responsavel'] ?? '')) === '') {
        $missing[] = 'responsavel';
    }

    if ($missing) {
        $text = function_exists('miauw_financeiro_pending_question')
            ? miauw_financeiro_pending_question($command)
            : 'Faltou ' . implode(', ', $missing) . ' para preparar a acao.';

        return array(
            'ok' => true,
            'status' => 'needs_input',
            'text' => $text,
            'missing' => $missing,
        );
    }

    $tool = strcasecmp((string) ($command['categoria'] ?? ''), 'Sangria') === 0
        ? 'registrar_sangria'
        : 'criar_lancamento_financeiro';

    if (!miauw_agent_actions_tool_allowed($tool)) {
        return null;
    }

    return miauw_agent_actions_confirmation($tool, $command);
}

function miauw_agent_actions_prepare_gestao(string $message): ?array
{
    if (!function_exists('miauw_skill_gestao_command_from_message')) {
        return null;
    }

    $command = miauw_skill_gestao_command_from_message($message);
    if (!is_array($command)) {
        return null;
    }

    if ((string) ($command['acao'] ?? '') === 'abrir_gestao') {
        return array(
            'ok' => true,
            'status' => 'needs_input',
            'text' => function_exists('miauw_skill_gestao_access_reply') ? miauw_skill_gestao_access_reply('whatsapp') : 'Gestao fica em /gestao/.',
        );
    }

    $complete = function_exists('miauw_gestao_command_complete')
        ? miauw_gestao_command_complete($command)
        : (
            trim((string) ($command['titulo'] ?? '')) !== ''
            && (float) ($command['valor'] ?? 0) > 0
            && trim((string) ($command['categoria'] ?? '')) !== ''
        );

    if (!$complete) {
        return array(
            'ok' => true,
            'status' => 'needs_input',
            'text' => function_exists('miauw_skill_gestao_missing_reply') ? miauw_skill_gestao_missing_reply($command) : 'Faltou dado da conta da Gestao.',
        );
    }

    if (!miauw_agent_actions_tool_allowed('criar_conta_gestao')) {
        return null;
    }

    $command['raw_message'] = 'whatsapp_action_prepare_gestao: ' . miauw_substr($message, 0, 260);

    return miauw_agent_actions_confirmation('criar_conta_gestao', $command);
}

function miauw_agent_actions_prepare(string $message, array $userContext = array()): array
{
    $message = trim($message);
    if ($message === '') {
        return array('ok' => true, 'status' => 'no_action');
    }

    $gestao = miauw_agent_actions_prepare_gestao($message);
    if (is_array($gestao)) {
        return $gestao;
    }

    $financeiro = miauw_agent_actions_prepare_financeiro($message, $userContext);
    if (is_array($financeiro)) {
        return $financeiro;
    }

    return array('ok' => true, 'status' => 'no_action');
}

function miauw_agent_actions_execute(array $body): array
{
    if (!MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED) {
        miauw_agent_actions_json(403, array(
            'ok' => false,
            'error' => 'whatsapp_confirmed_actions_disabled',
            'message' => 'Execucao confirmada por WhatsApp esta desligada neste ambiente.',
        ));
    }

    $tool = trim((string) ($body['tool'] ?? ''));
    $command = is_array($body['command'] ?? null) ? $body['command'] : array();
    $summary = trim((string) ($body['summary'] ?? ''));
    $confirmationId = miauw_substr(trim((string) ($body['confirmation_id'] ?? '')), 0, 12);

    if ($tool === '' || !function_exists('miauw_tool_requires_confirmation') || !miauw_tool_requires_confirmation($tool)) {
        miauw_agent_actions_json(400, array(
            'ok' => false,
            'error' => 'invalid_tool',
            'message' => 'Tool invalida para confirmacao por WhatsApp.',
        ));
    }

    if (!miauw_agent_actions_tool_allowed($tool)) {
        miauw_agent_actions_json(403, array(
            'ok' => false,
            'error' => 'tool_not_allowed_for_whatsapp',
            'message' => 'Essa tool nao esta liberada para execucao por WhatsApp.',
        ));
    }

    $traceId = miauw_substr(trim((string) ($body['trace_id'] ?? '')), 0, 80);
    $userContext = miauw_agent_actions_user_context($body);
    $contextUserId = miauw_agent_actions_context_user_id($userContext);
    $contextUsername = miauw_agent_actions_context_username($userContext);
    $actor = miauw_agent_actions_resolve_actor($userContext, (string) ($command['responsavel'] ?? ''));
    if (function_exists('miauw_apply_responsible_actor_to_command')) {
        $command = miauw_apply_responsible_actor_to_command($command, $actor, true);
    }
    $userId = $contextUserId > 0 ? $contextUserId : (int) MIAUW_WHATSAPP_ACTOR_USER_ID;
    if ($userId > 0) {
        $command['usuario_id'] = $userId;
        $command['actor_user_id'] = $userId;
    }
    if ($contextUsername !== '') {
        $command['username'] = $contextUsername;
    }
    if ($traceId !== '' && function_exists('miauw_trace_set_context')) {
        miauw_trace_set_context($traceId, null, $userId);
    }

    $pending = array(
        'id' => $confirmationId !== '' ? $confirmationId : substr(miauw_trace_new_id(), 0, 8),
        'tool' => $tool,
        'command' => $command,
        'summary' => $summary !== '' ? $summary : (function_exists('miauw_confirmation_summary') ? miauw_confirmation_summary($tool, $command) : 'Acao confirmada pelo WhatsApp.'),
        'user_id' => $userId,
        'created_at' => time(),
    );

    $text = miauw_execute_confirmed_action($pending, $userId);

    return array(
        'ok' => true,
        'status' => 'executed',
        'text' => $text,
    );
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    miauw_agent_actions_json(405, array(
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
    miauw_agent_actions_json(503, array(
        'ok' => false,
        'error' => 'internal_token_not_configured',
        'message' => 'Endpoint interno de acoes sem token configurado.',
    ));
}

$receivedToken = miauw_agent_actions_header('X-Miauw-Agent-Token');
if ($receivedToken === '') {
    $receivedToken = miauw_agent_actions_header('X-Miauw-Internal-Token');
}

if (!miauw_agent_actions_token_valid($receivedToken)) {
    miauw_agent_actions_json(401, array(
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
    miauw_agent_actions_json(413, array(
        'ok' => false,
        'error' => 'payload_too_large',
        'message' => 'Payload grande demais.',
    ));
}

$body = $rawBody !== '' ? json_decode($rawBody, true) : null;
if (!is_array($body)) {
    miauw_agent_actions_json(400, array(
        'ok' => false,
        'error' => 'invalid_json',
        'message' => 'JSON invalido.',
    ));
}

$mode = trim((string) ($body['mode'] ?? 'prepare'));

try {
    if ($mode === 'prepare') {
        miauw_agent_actions_json(200, miauw_agent_actions_prepare((string) ($body['message'] ?? ''), miauw_agent_actions_user_context($body)));
    }

    if ($mode === 'execute') {
        miauw_agent_actions_json(200, miauw_agent_actions_execute($body));
    }

    miauw_agent_actions_json(400, array(
        'ok' => false,
        'error' => 'invalid_mode',
        'message' => 'Modo invalido.',
    ));
} catch (Throwable $error) {
    $message = function_exists('miauw_diagnostic_redact_string')
        ? miauw_diagnostic_redact_string($error->getMessage())
        : 'Falha interna em acao do WhatsApp.';

    miauw_agent_actions_json(500, array(
        'ok' => false,
        'error' => 'whatsapp_action_failed',
        'message' => $message,
    ));
}
