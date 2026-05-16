<?php
declare(strict_types=1);

function miauw_diagnostics_can_review(array $user): bool
{
    $role = (string) ($user['role'] ?? '');
    $username = strtolower((string) ($user['username'] ?? ''));

    return in_array($role, array('admin', 'gerente'), true) || $username === 'adm';
}

function miauw_diagnostics_column_exists(string $table, string $column): bool
{
    try {
        $stmt = db()->prepare(
            'SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?'
        );
        $stmt->execute(array($table, $column));

        return (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $error) {
        error_log('Miauby diagnostics column check failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_diagnostics_ensure_review_columns(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    miauw_ensure_schema();
    if (function_exists('miauw_intelligence_ensure_schema')) {
        miauw_intelligence_ensure_schema();
    }

    $updates = array(
        'miauw_memorias' => array(
            'revisao_status' => "ALTER TABLE miauw_memorias ADD COLUMN revisao_status ENUM('pendente', 'aprovado', 'ignorado') NOT NULL DEFAULT 'pendente' AFTER ultimo_uso",
            'reviewed_by' => "ALTER TABLE miauw_memorias ADD COLUMN reviewed_by INT UNSIGNED NULL AFTER revisao_status",
            'reviewed_at' => "ALTER TABLE miauw_memorias ADD COLUMN reviewed_at DATETIME NULL DEFAULT NULL AFTER reviewed_by",
        ),
        'miauw_padroes' => array(
            'revisao_status' => "ALTER TABLE miauw_padroes ADD COLUMN revisao_status ENUM('pendente', 'aprovado', 'ignorado') NOT NULL DEFAULT 'pendente' AFTER confianca",
            'reviewed_by' => "ALTER TABLE miauw_padroes ADD COLUMN reviewed_by INT UNSIGNED NULL AFTER revisao_status",
            'reviewed_at' => "ALTER TABLE miauw_padroes ADD COLUMN reviewed_at DATETIME NULL DEFAULT NULL AFTER reviewed_by",
        ),
    );

    foreach ($updates as $table => $columns) {
        foreach ($columns as $column => $sql) {
            if (!miauw_diagnostics_column_exists((string) $table, (string) $column)) {
                db()->exec($sql);
            }
        }
    }

    $done = true;
}

function miauw_diagnostics_safe_text(string $text, int $limit = 260): string
{
    $text = strip_tags($text);
    $text = str_replace(array("\r\n", "\r"), "\n", $text);
    $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
    $text = function_exists('miauw_redact_secret_fragments') ? miauw_redact_secret_fragments($text) : $text;
    $text = function_exists('miauw_apply_operator_guardrails') ? miauw_apply_operator_guardrails($text, 'history_input') : $text;
    $text = preg_replace('/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b/u', '[cpf]', $text) ?? $text;
    $text = preg_replace('/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}\-?\d{4}\b/u', '[telefone]', $text) ?? $text;
    $text = preg_replace('/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/iu', '[email]', $text) ?? $text;

    if (function_exists('miauw_substr')) {
        return miauw_substr($text, 0, $limit);
    }

    return substr($text, 0, $limit);
}

function miauw_diagnostics_review_counts(string $table): array
{
    miauw_diagnostics_ensure_review_columns();

    $counts = array('pendente' => 0, 'aprovado' => 0, 'ignorado' => 0);
    $stmt = db()->query(
        "SELECT revisao_status, COUNT(*) AS total
         FROM " . $table . "
         GROUP BY revisao_status"
    );

    foreach (($stmt ? $stmt->fetchAll() : array()) as $row) {
        $status = (string) ($row['revisao_status'] ?? 'pendente');
        if (isset($counts[$status])) {
            $counts[$status] = (int) $row['total'];
        }
    }

    return $counts;
}

function miauw_diagnostics_recent_memories(int $limit = 12, string $status = 'pendente'): array
{
    miauw_diagnostics_ensure_review_columns();
    $limit = max(1, min(40, $limit));
    $status = in_array($status, array('pendente', 'aprovado', 'ignorado', 'todos'), true) ? $status : 'pendente';
    $params = array();
    $where = '1=1';

    if ($status !== 'todos') {
        $where .= ' AND revisao_status = ?';
        $params[] = $status;
    }

    $stmt = db()->prepare(
        "SELECT id, usuario_id, modulo, chave, valor, origem, peso, usos, ultimo_uso, revisao_status, reviewed_at, updated_at, created_at
         FROM miauw_memorias
         WHERE $where
         ORDER BY FIELD(revisao_status, 'pendente', 'aprovado', 'ignorado'), updated_at DESC, id DESC
         LIMIT " . $limit
    );
    $stmt->execute($params);

    $rows = $stmt->fetchAll() ?: array();
    return array_map(static function (array $row): array {
        return array(
            'id' => (int) ($row['id'] ?? 0),
            'modulo' => (string) ($row['modulo'] ?? 'geral'),
            'chave' => miauw_diagnostics_safe_text((string) ($row['chave'] ?? ''), 100),
            'valor' => miauw_diagnostics_safe_text((string) ($row['valor'] ?? ''), 320),
            'origem' => miauw_diagnostics_safe_text((string) ($row['origem'] ?? ''), 60),
            'peso' => (float) ($row['peso'] ?? 1),
            'usos' => (int) ($row['usos'] ?? 0),
            'status' => (string) ($row['revisao_status'] ?? 'pendente'),
            'updated_at' => (string) ($row['updated_at'] ?? $row['created_at'] ?? ''),
            'reviewed_at' => (string) ($row['reviewed_at'] ?? ''),
        );
    }, $rows);
}

function miauw_diagnostics_recent_patterns(int $limit = 12, string $status = 'pendente'): array
{
    miauw_diagnostics_ensure_review_columns();
    $limit = max(1, min(40, $limit));
    $status = in_array($status, array('pendente', 'aprovado', 'ignorado', 'todos'), true) ? $status : 'pendente';
    $params = array();
    $where = '1=1';

    if ($status !== 'todos') {
        $where .= ' AND revisao_status = ?';
        $params[] = $status;
    }

    $stmt = db()->prepare(
        "SELECT id, modulo, tipo, chave, descricao, contador, confianca, revisao_status, reviewed_at, last_seen_at, updated_at, created_at
         FROM miauw_padroes
         WHERE $where
         ORDER BY FIELD(revisao_status, 'pendente', 'aprovado', 'ignorado'), contador DESC, last_seen_at DESC, id DESC
         LIMIT " . $limit
    );
    $stmt->execute($params);

    $rows = $stmt->fetchAll() ?: array();
    return array_map(static function (array $row): array {
        return array(
            'id' => (int) ($row['id'] ?? 0),
            'modulo' => (string) ($row['modulo'] ?? 'geral'),
            'tipo' => (string) ($row['tipo'] ?? ''),
            'chave' => miauw_diagnostics_safe_text((string) ($row['chave'] ?? ''), 100),
            'descricao' => miauw_diagnostics_safe_text((string) ($row['descricao'] ?? ''), 340),
            'contador' => (int) ($row['contador'] ?? 0),
            'confianca' => (float) ($row['confianca'] ?? 0),
            'status' => (string) ($row['revisao_status'] ?? 'pendente'),
            'last_seen_at' => (string) ($row['last_seen_at'] ?? $row['updated_at'] ?? $row['created_at'] ?? ''),
            'reviewed_at' => (string) ($row['reviewed_at'] ?? ''),
        );
    }, $rows);
}

function miauw_diagnostics_recent_internal_events(int $limit = 10): array
{
    $limit = max(1, min(30, $limit));
    $file = function_exists('miauw_diagnostic_directory')
        ? miauw_diagnostic_directory() . '/miauby-internal-diagnostics-' . date('Y-m') . '.ndjson'
        : '';

    if ($file === '' || !is_file($file) || !is_readable($file)) {
        return array();
    }

    $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || !$lines) {
        return array();
    }

    $items = array();
    foreach (array_reverse(array_slice($lines, -($limit * 3))) as $line) {
        $decoded = json_decode((string) $line, true);
        if (!is_array($decoded)) {
            continue;
        }

        $error = is_array($decoded['error'] ?? null) ? $decoded['error'] : array();
        $items[] = array(
            'created_at' => (string) ($decoded['created_at'] ?? ''),
            'type' => miauw_diagnostics_safe_text((string) ($decoded['type'] ?? 'diagnostico'), 60),
            'module' => miauw_diagnostics_safe_text((string) ($decoded['module'] ?? 'miauby'), 60),
            'title' => miauw_diagnostics_safe_text((string) ($decoded['title'] ?? 'Evento interno'), 180),
            'error_class' => miauw_diagnostics_safe_text((string) ($error['class'] ?? ''), 90),
            'error_hash' => miauw_diagnostics_safe_text((string) ($error['hash'] ?? ''), 45),
        );

        if (count($items) >= $limit) {
            break;
        }
    }

    return $items;
}

function miauw_diagnostics_message_stats(): array
{
    miauw_ensure_schema();
    $stmt = db()->query(
        "SELECT
            COUNT(*) AS total,
            SUM(papel = 'user') AS usuarios,
            SUM(papel = 'assistant') AS assistente,
            SUM(fallback = 1) AS fallback
         FROM miauw_mensagens
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    $row = $stmt ? ($stmt->fetch() ?: array()) : array();

    return array(
        'total' => (int) ($row['total'] ?? 0),
        'usuarios' => (int) ($row['usuarios'] ?? 0),
        'assistente' => (int) ($row['assistente'] ?? 0),
        'fallback' => (int) ($row['fallback'] ?? 0),
    );
}

function miauw_diagnostics_recent_tool_traces(int $limit = 10): array
{
    miauw_ensure_schema();
    $limit = max(1, min(30, $limit));

    try {
        $stmt = db()->query(
            'SELECT trace_id, ferramenta, modulo, tipo, status, risco, requer_confirmacao, resumo, duracao_ms, created_at
             FROM miauw_tool_traces
             ORDER BY id DESC
             LIMIT ' . $limit
        );
        $rows = $stmt ? $stmt->fetchAll() : array();
    } catch (Throwable $error) {
        error_log('Miauby diagnostics tool trace failed: ' . $error->getMessage());
        return array();
    }

    return array_map(static function (array $row): array {
        return array(
            'trace_id' => miauw_diagnostics_safe_text((string) ($row['trace_id'] ?? ''), 32),
            'ferramenta' => miauw_diagnostics_safe_text((string) ($row['ferramenta'] ?? ''), 120),
            'modulo' => miauw_diagnostics_safe_text((string) ($row['modulo'] ?? ''), 60),
            'tipo' => miauw_diagnostics_safe_text((string) ($row['tipo'] ?? ''), 40),
            'status' => miauw_diagnostics_safe_text((string) ($row['status'] ?? ''), 30),
            'risco' => miauw_diagnostics_safe_text((string) ($row['risco'] ?? ''), 20),
            'confirmacao' => !empty($row['requer_confirmacao']),
            'resumo' => miauw_diagnostics_safe_text((string) ($row['resumo'] ?? ''), 220),
            'duracao_ms' => isset($row['duracao_ms']) ? (int) $row['duracao_ms'] : null,
            'created_at' => (string) ($row['created_at'] ?? ''),
        );
    }, $rows ?: array());
}

function miauw_diagnostics_trace_stats(): array
{
    miauw_ensure_schema();

    try {
        $stmt = db()->query(
            "SELECT
                COUNT(*) AS total,
                SUM(status = 'error') AS erros,
                SUM(requer_confirmacao = 1) AS confirmacoes,
                SUM(status = 'pending_confirmation') AS pendentes
             FROM miauw_tool_traces
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
        );
        $row = $stmt ? ($stmt->fetch() ?: array()) : array();
    } catch (Throwable $error) {
        error_log('Miauby diagnostics trace stats failed: ' . $error->getMessage());
        $row = array();
    }

    return array(
        'total' => (int) ($row['total'] ?? 0),
        'erros' => (int) ($row['erros'] ?? 0),
        'confirmacoes' => (int) ($row['confirmacoes'] ?? 0),
        'pendentes' => (int) ($row['pendentes'] ?? 0),
    );
}

function miauw_diagnostics_agent_service_status(): array
{
    $baseUrl = defined('MIAUW_AGENT_INTERNAL_BASE_URL') ? (string) MIAUW_AGENT_INTERNAL_BASE_URL : '';
    $status = array(
        'configured' => $baseUrl !== '',
        'reachable' => false,
        'status' => 'not_checked',
        'mode' => 'shadow',
        'http_status' => 0,
        'agent_version' => '',
        'phase' => '',
        'runtime' => '',
        'api_configured' => false,
        'internal_access_configured' => defined('MIAUW_AGENT_INTERNAL_TOKEN') && trim((string) MIAUW_AGENT_INTERNAL_TOKEN) !== '',
        'writes_enabled' => false,
    );

    if ($baseUrl === '' || !function_exists('curl_init')) {
        $status['status'] = 'unavailable';
        return $status;
    }

    $url = rtrim($baseUrl, '/') . '/health';
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT_MS => 350,
        CURLOPT_TIMEOUT_MS => 900,
        CURLOPT_HTTPHEADER => array('Accept: application/json'),
    ));

    $raw = curl_exec($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $status['http_status'] = $httpStatus;

    if (!is_string($raw) || $raw === '' || $httpStatus < 200 || $httpStatus >= 300) {
        $status['status'] = $error !== '' ? 'offline' : 'http_' . $httpStatus;
        return $status;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        $status['status'] = 'invalid_json';
        return $status;
    }

    $status['reachable'] = true;
    $status['status'] = !empty($decoded['ok']) ? 'ok' : 'degraded';
    $status['service_version'] = miauw_diagnostics_safe_text((string) ($decoded['service_version'] ?? ''), 40);
    $status['agent_version'] = miauw_diagnostics_safe_text((string) ($decoded['agent_version'] ?? ''), 40);
    $status['phase'] = miauw_diagnostics_safe_text((string) ($decoded['phase'] ?? ''), 40);
    $status['personality_version'] = miauw_diagnostics_safe_text((string) ($decoded['personality_version'] ?? ''), 80);
    $status['runtime'] = miauw_diagnostics_safe_text((string) ($decoded['runtime'] ?? ''), 40);
    $status['api_configured'] = !empty($decoded['api_configured']);
    $status['writes_enabled'] = !empty($decoded['writes_enabled']);

    return $status;
}

function miauw_diagnostics_summary(bool $runScan = true): array
{
    miauw_diagnostics_ensure_review_columns();

    if ($runScan && function_exists('miauw_guardian_scan')) {
        try {
            miauw_guardian_scan(false);
        } catch (Throwable $error) {
            error_log('Miauby diagnostics scan failed: ' . $error->getMessage());
        }
    }

    $memoryCounts = miauw_diagnostics_review_counts('miauw_memorias');
    $patternCounts = miauw_diagnostics_review_counts('miauw_padroes');
    $skillSummary = function_exists('miauw_skill_registry_summary') ? miauw_skill_registry_summary() : array();
    $toolContracts = function_exists('miauw_agent_tool_contract_export') ? miauw_agent_tool_contract_export() : array();
    $activeAlerts = function_exists('miauw_intelligence_active_alert_count') ? miauw_intelligence_active_alert_count() : 0;

    return array(
        'agent' => function_exists('miauw_agent_public_status') ? miauw_agent_public_status() : array(),
        'personality' => function_exists('miauw_agent_personality_contract') ? miauw_agent_personality_contract() : array(),
        'next_phase' => function_exists('miauw_agent_next_phase_contract') ? miauw_agent_next_phase_contract() : array(),
        'agent_service' => miauw_diagnostics_agent_service_status(),
        'agent_shadow' => function_exists('miauw_agent_shadow_status') ? miauw_agent_shadow_status() : array(),
        'agent_runtime' => function_exists('miauw_agent_runtime_status') ? miauw_agent_runtime_status(function_exists('current_user') ? current_user() : null) : array(),
        'tool_contracts' => array(
            'version' => (string) ($toolContracts['version'] ?? ''),
            'phase' => (string) ($toolContracts['phase'] ?? ''),
            'checksum' => (string) ($toolContracts['checksum'] ?? ''),
            'summary' => is_array($toolContracts['summary'] ?? null) ? $toolContracts['summary'] : array(),
        ),
        'api' => function_exists('miauw_openai_public_status') ? miauw_openai_public_status() : array(),
        'models' => array(
            'fast' => defined('MIAUW_MODEL_FAST') ? MIAUW_MODEL_FAST : '',
            'smart' => defined('MIAUW_MODEL_SMART') ? MIAUW_MODEL_SMART : '',
            'boss' => defined('MIAUW_MODEL_BOSS') ? MIAUW_MODEL_BOSS : '',
        ),
        'skills' => $skillSummary,
        'alertas_ativos' => (int) $activeAlerts,
        'memorias' => $memoryCounts,
        'padroes' => $patternCounts,
        'mensagens_24h' => miauw_diagnostics_message_stats(),
        'traces_24h' => miauw_diagnostics_trace_stats(),
        'diagnosticos_recentes' => count(miauw_diagnostics_recent_internal_events(20)),
    );
}

function miauw_diagnostics_panel_data(bool $runScan = true): array
{
    return array(
        'summary' => miauw_diagnostics_summary($runScan),
        'memories' => miauw_diagnostics_recent_memories(12, 'pendente'),
        'patterns' => miauw_diagnostics_recent_patterns(12, 'pendente'),
        'alerts' => function_exists('miauw_intelligence_public_alerts') ? miauw_intelligence_public_alerts(8) : array(),
        'events' => miauw_diagnostics_recent_internal_events(8),
        'traces' => miauw_diagnostics_recent_tool_traces(10),
    );
}

function miauw_diagnostics_review_item(string $kind, int $id, string $status, int $userId): bool
{
    miauw_diagnostics_ensure_review_columns();
    $status = in_array($status, array('pendente', 'aprovado', 'ignorado'), true) ? $status : '';
    if ($id <= 0 || $status === '') {
        return false;
    }

    if ($kind === 'memoria') {
        $table = 'miauw_memorias';
        $entity = 'miauw_memorias';
    } elseif ($kind === 'padrao') {
        $table = 'miauw_padroes';
        $entity = 'miauw_padroes';
    } else {
        return false;
    }

    $stmt = db()->prepare(
        "UPDATE $table
         SET revisao_status = ?,
             reviewed_by = ?,
             reviewed_at = NOW()
         WHERE id = ?"
    );
    $stmt->execute(array($status, $userId, $id));

    if ($stmt->rowCount() > 0 && function_exists('log_action')) {
        log_action('miauw_revisao_' . $kind, $entity, $id, 'Status de revisao: ' . $status);
    }

    return $stmt->rowCount() > 0;
}
