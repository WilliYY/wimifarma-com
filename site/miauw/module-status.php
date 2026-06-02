<?php
declare(strict_types=1);

$miauwModuleStatusBufferLevel = ob_get_level();
ob_start();

require_once __DIR__ . '/bootstrap.php';

function miauw_module_status_json(int $status, array $payload): void
{
    global $miauwModuleStatusBufferLevel;

    while (ob_get_level() > $miauwModuleStatusBufferLevel) {
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

function miauw_module_status_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';

    return is_string($value) ? trim($value) : '';
}

function miauw_module_status_token_valid(string $received): bool
{
    $expected = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    if ($expected === '') {
        $expected = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
    }

    return $received !== '' && $expected !== '' && hash_equals($expected, $received);
}

function miauw_module_status_safe_text(string $value, int $limit = 220): string
{
    $value = function_exists('miauw_diagnostic_redact_string')
        ? miauw_diagnostic_redact_string($value)
        : $value;
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);

    return miauw_substr($value, 0, max(1, $limit));
}

function miauw_module_status_data_summary($data): array
{
    if (!is_array($data)) {
        return array(
            'type' => gettype($data),
            'present' => $data !== null && $data !== '',
        );
    }

    $keys = array_slice(array_map('strval', array_keys($data)), 0, 12);
    $counts = array();
    foreach ($data as $key => $value) {
        if (is_array($value)) {
            $counts[(string) $key] = count($value);
        }
    }

    return array(
        'type' => 'array',
        'present' => count($data) > 0,
        'keys' => $keys,
        'array_counts' => $counts,
    );
}

function miauw_module_status_extract_source($data, string $fallback): string
{
    if (is_array($data) && isset($data['source'])) {
        return miauw_module_status_safe_text((string) $data['source'], 80);
    }

    return $fallback;
}

function miauw_module_status_contracts_by_module(): array
{
    $contracts = function_exists('miauw_agent_tool_contract_export')
        ? miauw_agent_tool_contract_export()
        : array();
    $tools = is_array($contracts['tools'] ?? null) ? $contracts['tools'] : array();
    $byModule = array();

    foreach ($tools as $name => $tool) {
        if (!is_array($tool)) {
            continue;
        }
        $module = (string) ($tool['module'] ?? 'sistema');
        $byModule[$module][] = array(
            'name' => (string) $name,
            'level' => (string) ($tool['level'] ?? 'leitura'),
            'risk' => (string) ($tool['risk'] ?? 'baixo'),
            'node_tool_bridge_enabled' => !empty($tool['node_tool_bridge_enabled']),
            'node_read_bridge_enabled' => !empty($tool['node_read_bridge_enabled']),
            'requires_confirmation' => !empty($tool['requires_confirmation']),
        );
    }

    return $byModule;
}

function miauw_module_status_tool_info(string $contractModule, array $contractsByModule): array
{
    $tools = is_array($contractsByModule[$contractModule] ?? null) ? $contractsByModule[$contractModule] : array();
    $readTools = array();
    $writeTools = array();
    $nodeReadTools = array();
    $nodeBridgeTools = array();

    foreach ($tools as $tool) {
        $name = (string) ($tool['name'] ?? '');
        if ($name === '') {
            continue;
        }
        if ((string) ($tool['level'] ?? '') === 'leitura') {
            $readTools[] = $name;
        }
        if ((string) ($tool['level'] ?? '') === 'escrita') {
            $writeTools[] = $name;
        }
        if (!empty($tool['node_read_bridge_enabled'])) {
            $nodeReadTools[] = $name;
        }
        if (!empty($tool['node_tool_bridge_enabled'])) {
            $nodeBridgeTools[] = $name;
        }
    }

    return array(
        'tools' => array_values(array_map(static fn(array $tool): string => (string) $tool['name'], $tools)),
        'read_tools' => array_values($readTools),
        'write_tools' => array_values($writeTools),
        'node_read_bridge_tools' => array_values($nodeReadTools),
        'node_tool_bridge_tools' => array_values($nodeBridgeTools),
        'read_tool_exported' => count($nodeReadTools) > 0,
        'tool_bridge_exported' => count($nodeBridgeTools) > 0,
    );
}

function miauw_module_status_last_trace(string $module, array $tools): ?array
{
    if (!function_exists('db')) {
        return null;
    }

    $conditions = array('modulo = ?');
    $params = array($module);
    foreach ($tools as $tool) {
        $tool = preg_replace('/[^a-z0-9_\-]+/i', '', (string) $tool) ?? '';
        if ($tool === '') {
            continue;
        }
        $conditions[] = 'payload_json LIKE ?';
        $params[] = '%"tool":"' . $tool . '"%';
    }

    try {
        $stmt = db()->prepare(
            'SELECT ferramenta, modulo, status, risco, duracao_ms, erro, created_at, payload_json
             FROM miauw_tool_traces
             WHERE ' . implode(' OR ', $conditions) . '
             ORDER BY id DESC
             LIMIT 1'
        );
        $stmt->execute($params);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
    } catch (Throwable $error) {
        return array(
            'status' => 'trace_unavailable',
            'last_error' => miauw_module_status_safe_text($error->getMessage()),
        );
    }

    $payload = json_decode((string) ($row['payload_json'] ?? ''), true);
    $payloadTool = is_array($payload) ? (string) ($payload['tool'] ?? '') : '';

    return array(
        'tool' => $payloadTool !== '' ? $payloadTool : (string) ($row['ferramenta'] ?? ''),
        'module' => (string) ($row['modulo'] ?? ''),
        'status' => (string) ($row['status'] ?? ''),
        'risk' => (string) ($row['risco'] ?? ''),
        'duration_ms' => isset($row['duracao_ms']) ? (int) $row['duracao_ms'] : null,
        'last_error' => trim((string) ($row['erro'] ?? '')) !== ''
            ? miauw_module_status_safe_text((string) $row['erro'])
            : null,
        'created_at' => (string) ($row['created_at'] ?? ''),
    );
}

function miauw_module_status_check(
    string $key,
    string $label,
    string $contractModule,
    bool $readSupported,
    callable $callback,
    array $contractsByModule,
    string $sourceFallback,
    ?bool $authConfigured = null
): array {
    $toolInfo = miauw_module_status_tool_info($contractModule, $contractsByModule);
    $started = microtime(true);
    $checkedAt = date('c');
    $status = 'ok';
    $readStatus = $readSupported ? 'ok' : 'unsupported';
    $lastError = null;
    $data = null;
    $authOk = $authConfigured;
    $httpStatus = null;

    if (!$readSupported) {
        $status = 'limited';
        try {
            $data = $callback();
            if (is_array($data) && isset($data['__http_status'])) {
                $httpStatus = (int) $data['__http_status'];
                $authOk = !empty($data['__auth_ok']);
                $data = is_array($data['__body'] ?? null) ? $data['__body'] : array();
            }
            if (is_array($data) && array_key_exists('ok', $data) && empty($data['ok'])) {
                $status = 'fail';
                $lastError = miauw_module_status_safe_text((string) ($data['error'] ?? $data['message'] ?? 'Health retornou ok=false.'));
            }
        } catch (Throwable $error) {
            $status = 'fail';
            $message = $error->getMessage();
            $authOk = !preg_match('/\b(401|403|unauthorized|forbidden|token)\b/i', $message);
            $lastError = miauw_module_status_safe_text($message);
        }
    } else {
        try {
            $data = $callback();
            if (is_array($data) && isset($data['__http_status'])) {
                $httpStatus = (int) $data['__http_status'];
                $authOk = !empty($data['__auth_ok']);
                $data = is_array($data['__body'] ?? null) ? $data['__body'] : array();
            }
            if (is_array($data) && array_key_exists('ok', $data) && empty($data['ok'])) {
                $status = 'fail';
                $readStatus = 'error';
                $lastError = miauw_module_status_safe_text((string) ($data['error'] ?? $data['message'] ?? 'Endpoint retornou ok=false.'));
            }
            if ($authOk === null) {
                $authOk = true;
            }
        } catch (Throwable $error) {
            $status = 'fail';
            $readStatus = 'error';
            $message = $error->getMessage();
            $authOk = !preg_match('/\b(401|403|unauthorized|forbidden|token)\b/i', $message);
            $lastError = miauw_module_status_safe_text($message);
        }
    }

    $durationMs = (int) round((microtime(true) - $started) * 1000);
    $summary = miauw_module_status_data_summary($data);
    $lastTrace = miauw_module_status_last_trace($contractModule, $toolInfo['tools']);
    if ($lastError === null && is_array($lastTrace) && !empty($lastTrace['last_error'])) {
        $lastError = (string) $lastTrace['last_error'];
    }

    return array(
        'module' => $label,
        'key' => $key,
        'status' => $status,
        'read_status' => $readStatus,
        'read_supported' => $readSupported,
        'auth_ok' => $authOk,
        'http_status' => $httpStatus,
        'response_time_ms' => $data !== null ? $durationMs : null,
        'last_checked_at' => $checkedAt,
        'last_query_at' => $checkedAt,
        'last_error' => $lastError,
        'source' => miauw_module_status_extract_source($data, $sourceFallback),
        'data_present' => !empty($summary['present']),
        'data_summary' => $summary,
        'tool_contract' => $toolInfo,
        'last_trace' => $lastTrace,
    );
}

function miauw_module_status_http_json(string $method, string $url, array $headers = array(), ?array $payload = null): array
{
    $headers[] = 'Accept: application/json';
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => false,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
    ));

    if ($payload !== null) {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($json) ? $json : '{}');
    }

    $raw = curl_exec($ch);
    $error = curl_error($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if (!is_string($raw) || $raw === '') {
        throw new RuntimeException($error !== '' ? $error : 'Endpoint interno sem resposta.');
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Endpoint interno retornou JSON invalido.');
    }

    return array(
        '__http_status' => $httpStatus,
        '__auth_ok' => !in_array($httpStatus, array(401, 403), true),
        '__body' => $decoded,
    );
}

if (!in_array(($_SERVER['REQUEST_METHOD'] ?? ''), array('GET', 'POST'), true)) {
    miauw_module_status_json(405, array(
        'ok' => false,
        'error' => 'method_not_allowed',
        'message' => 'Use GET ou POST.',
    ));
}

$configuredToken = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
if ($configuredToken === '') {
    $configuredToken = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
}

if ($configuredToken === '') {
    miauw_module_status_json(503, array(
        'ok' => false,
        'error' => 'internal_token_not_configured',
        'message' => 'Status interno do Miauby sem token configurado.',
    ));
}

$receivedToken = miauw_module_status_header('X-Miauw-Agent-Token');
if ($receivedToken === '') {
    $receivedToken = miauw_module_status_header('X-Miauw-Internal-Token');
}

if (!miauw_module_status_token_valid($receivedToken)) {
    miauw_module_status_json(401, array(
        'ok' => false,
        'error' => 'unauthorized',
        'message' => 'Token interno invalido.',
    ));
}

if (function_exists('miauw_ensure_schema')) {
    miauw_ensure_schema();
}

$period = function_exists('miauw_skill_period_from_message')
    ? miauw_skill_period_from_message(date('m/Y'))
    : array('start' => date('Y-m-01'), 'end_exclusive' => date('Y-m-d', strtotime(date('Y-m-01') . ' +1 month')));
$contractsByModule = miauw_module_status_contracts_by_module();
$agentToken = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
$guardianToken = miauw_constant_string('MIAUW_GUARDIAN_TOKEN');
$whatsappToken = miauw_constant_string('MIAUW_WHATSAPP_INTERNAL_TOKEN');
if ($whatsappToken === '') {
    $whatsappToken = $agentToken !== '' ? $agentToken : $guardianToken;
}

$modules = array(
    miauw_module_status_check(
        'cotacao',
        'Cotacao',
        'cotacao',
        function_exists('miauw_skill_cotacao_v2_internal_request'),
        static fn() => miauw_skill_cotacao_v2_internal_request('GET', '/api/internal/summary'),
        $contractsByModule,
        'cotacao_node_postgres',
        function_exists('miauw_skill_cotacao_v2_internal_configured') ? miauw_skill_cotacao_v2_internal_configured() : null
    ),
    miauw_module_status_check(
        'financeiro',
        'Financeiro',
        'financeiro',
        function_exists('miauw_skill_financeiro_internal_request'),
        static fn() => miauw_skill_financeiro_internal_request('GET', '/api/internal/summary', array(), array('mes' => date('Y-m'))),
        $contractsByModule,
        'financeiro_node_postgres',
        function_exists('miauw_skill_financeiro_internal_configured') ? miauw_skill_financeiro_internal_configured() : null
    ),
    miauw_module_status_check(
        'gestao',
        'Gestao',
        'gestao',
        function_exists('miauw_skill_gestao_internal_request'),
        static fn() => miauw_skill_gestao_internal_request('GET', '/api/internal/summary', array(), array('mes' => date('Y-m'))),
        $contractsByModule,
        'gestao_node_postgres',
        function_exists('miauw_skill_gestao_internal_configured') ? miauw_skill_gestao_internal_configured() : null
    ),
    miauw_module_status_check(
        'pedidos',
        'Pedidos',
        'pedidos',
        true,
        static fn() => miauw_module_status_http_json('GET', 'http://wimifarma-pedidos-app:3300/pedidos/api/internal/arrival-summary?limit=3', array(
            'X-Miauw-Internal-Token: ' . $agentToken,
            'X-Miauw-Agent-Token: ' . $agentToken,
        )),
        $contractsByModule,
        'pedidos_node_postgres',
        $agentToken !== ''
    ),
    miauw_module_status_check(
        'tarefas',
        'Tarefas',
        'tarefa',
        function_exists('miauw_skill_tarefa_internal_request'),
        static fn() => miauw_skill_tarefa_internal_request('GET', '/api/internal/summary', array(), array(
            'start' => (string) ($period['start'] ?? ''),
            'end_exclusive' => (string) ($period['end_exclusive'] ?? ''),
        )),
        $contractsByModule,
        'tarefa_node_postgres',
        function_exists('miauw_skill_tarefa_internal_configured') ? miauw_skill_tarefa_internal_configured() : null
    ),
    miauw_module_status_check(
        'cashback',
        'Cashback',
        'cashback',
        function_exists('miauw_skill_cashback_internal_request'),
        static fn() => miauw_skill_cashback_internal_request('GET', '/api/internal/summary', array(), array(
            'start' => (string) ($period['start'] ?? ''),
            'end_exclusive' => (string) ($period['end_exclusive'] ?? ''),
        )),
        $contractsByModule,
        'cashback_node_postgres',
        function_exists('miauw_skill_cashback_internal_configured') ? miauw_skill_cashback_internal_configured() : null
    ),
    miauw_module_status_check(
        'codigos',
        'Codigos',
        'codigos',
        function_exists('miauw_skill_codigos_internal_request'),
        static fn() => miauw_skill_codigos_internal_request('GET', '/api/internal/summary'),
        $contractsByModule,
        'codigos_node_postgres',
        function_exists('miauw_skill_codigos_internal_configured') ? miauw_skill_codigos_internal_configured() : null
    ),
    miauw_module_status_check(
        'xp',
        'XP',
        'xp',
        false,
        static fn() => miauw_module_status_http_json('GET', 'http://wimifarma-xp-app:3600/xp/health'),
        $contractsByModule,
        'xp_health_only',
        null
    ),
    miauw_module_status_check(
        'usuarios',
        'Usuarios',
        'usuarios',
        false,
        static fn() => miauw_module_status_http_json('GET', 'http://wimifarma-usuarios-app:3900/usuarios/health'),
        $contractsByModule,
        'usuarios_health_only',
        null
    ),
    miauw_module_status_check(
        'miauby_whats',
        'Miauby Whats',
        'whatsapp',
        true,
        static fn() => miauw_module_status_http_json('POST', 'http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp/internal/integration-status', array(
            'X-Miauw-Internal-Token: ' . $whatsappToken,
            'X-Miauw-Agent-Token: ' . $agentToken,
        ), array('mode' => 'miauby_module_status')),
        $contractsByModule,
        'miauw_whatsapp_node_postgres',
        $whatsappToken !== ''
    ),
);

$summary = array(
    'total' => count($modules),
    'ok' => 0,
    'limited' => 0,
    'fail' => 0,
);
foreach ($modules as $module) {
    $status = (string) ($module['status'] ?? 'fail');
    if (!array_key_exists($status, $summary)) {
        $summary[$status] = 0;
    }
    $summary[$status]++;
}

miauw_module_status_json(200, array(
    'ok' => $summary['fail'] === 0,
    'source' => 'miauby_php_internal_module_status',
    'generated_at' => date('c'),
    'writes_enabled_in_node' => false,
    'summary' => $summary,
    'modules' => $modules,
));
