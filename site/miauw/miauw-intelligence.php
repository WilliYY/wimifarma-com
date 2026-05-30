<?php
declare(strict_types=1);

function miauw_intelligence_schema_statements(): array
{
    return array(
        "CREATE TABLE IF NOT EXISTS miauw_alertas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            fingerprint CHAR(40) NOT NULL,
            modulo VARCHAR(40) NOT NULL,
            tipo VARCHAR(80) NOT NULL,
            severidade ENUM('info', 'baixa', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
            titulo VARCHAR(180) NOT NULL,
            mensagem TEXT NOT NULL,
            contexto LONGTEXT NULL,
            risco_score TINYINT UNSIGNED NOT NULL DEFAULT 50,
            acao_sugerida VARCHAR(255) NULL,
            status ENUM('novo', 'visto', 'resolvido', 'ignorado') NOT NULL DEFAULT 'novo',
            ocorrencias INT UNSIGNED NOT NULL DEFAULT 1,
            dismissed_by INT UNSIGNED NULL,
            dismissed_at DATETIME NULL DEFAULT NULL,
            first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NULL DEFAULT NULL,
            resolved_at DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_miauw_alerta_fingerprint (fingerprint),
            KEY idx_miauw_alerta_status (status, severidade),
            KEY idx_miauw_alerta_risco (status, risco_score),
            KEY idx_miauw_alerta_modulo (modulo, tipo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_padroes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            modulo VARCHAR(40) NOT NULL,
            tipo VARCHAR(80) NOT NULL,
            chave VARCHAR(160) NOT NULL,
            descricao TEXT NOT NULL,
            contexto LONGTEXT NULL,
            contador INT UNSIGNED NOT NULL DEFAULT 1,
            confianca DECIMAL(5,2) NOT NULL DEFAULT 0.20,
            first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_miauw_padrao_chave (modulo, tipo, chave),
            KEY idx_miauw_padrao_modulo (modulo, tipo),
            KEY idx_miauw_padrao_seen (last_seen_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_alerta_eventos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            alerta_id BIGINT UNSIGNED NULL,
            fingerprint CHAR(40) NOT NULL,
            acao VARCHAR(40) NOT NULL,
            usuario_id INT UNSIGNED NULL,
            detalhe TEXT NULL,
            expires_at DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_miauw_alerta_evento_alerta (alerta_id, created_at),
            KEY idx_miauw_alerta_evento_fingerprint (fingerprint, acao, created_at),
            KEY idx_miauw_alerta_evento_usuario (usuario_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function miauw_intelligence_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    foreach (miauw_intelligence_schema_statements() as $statement) {
        db()->exec($statement);
    }

    miauw_intelligence_ensure_alert_columns();

    $done = true;
}

function miauw_intelligence_column_exists(string $table, string $column): bool
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
        error_log('Miauby intelligence column check failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_intelligence_ensure_alert_columns(): void
{
    $updates = array(
        'risco_score' => "ALTER TABLE miauw_alertas ADD COLUMN risco_score TINYINT UNSIGNED NOT NULL DEFAULT 50 AFTER contexto",
        'acao_sugerida' => "ALTER TABLE miauw_alertas ADD COLUMN acao_sugerida VARCHAR(255) NULL AFTER risco_score",
        'dismissed_by' => "ALTER TABLE miauw_alertas ADD COLUMN dismissed_by INT UNSIGNED NULL AFTER ocorrencias",
        'dismissed_at' => "ALTER TABLE miauw_alertas ADD COLUMN dismissed_at DATETIME NULL DEFAULT NULL AFTER dismissed_by",
    );

    foreach ($updates as $column => $sql) {
        if (!miauw_intelligence_column_exists('miauw_alertas', (string) $column)) {
            db()->exec($sql);
        }
    }
}

function miauw_intelligence_expire_old_alerts(int $hours = 48): void
{
    $hours = max(1, min(720, $hours));
    try {
        db()->exec(
            "UPDATE miauw_alertas
             SET status = 'resolvido', resolved_at = NOW()
             WHERE status IN ('novo', 'visto')
               AND created_at < DATE_SUB(NOW(), INTERVAL " . (int) $hours . " HOUR)"
        );
    } catch (Throwable $error) {
        error_log('Miauby alert auto-expire failed: ' . $error->getMessage());
    }
}

function miauw_intelligence_report_system_error(string $module, string $title, string $detail = '', array $context = array()): void
{
    try {
        miauw_intelligence_ensure_schema();
        $context['subject'] = $context['subject'] ?? ($module . '-' . $title);
        if ($detail !== '') {
            $context['detalhe_hash'] = sha1($detail);
        }

        miauw_intelligence_upsert_alert(
            $module !== '' ? $module : 'sistema',
            'erro_interno_detectado',
            'alta',
            $title !== '' ? $title : 'Erro interno detectado',
            'Falha interna registrada. Revise o modulo e chame o suporte tecnico interno se repetir.',
            $context
        );
    } catch (Throwable $error) {
        error_log('Miauby system error alert failed: ' . $error->getMessage());
    }
}

function miauw_intelligence_table_exists(string $table): bool
{
    if (function_exists('miauw_skill_table_exists')) {
        return miauw_skill_table_exists($table);
    }

    try {
        $stmt = db()->prepare(
            'SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?'
        );
        $stmt->execute(array($table));

        return (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $error) {
        error_log('Miauby intelligence table check failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_intelligence_json($value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
}

function miauw_intelligence_decode_json(?string $value): array
{
    $decoded = is_string($value) && $value !== '' ? json_decode($value, true) : null;

    return is_array($decoded) ? $decoded : array();
}

function miauw_intelligence_normalized_key(string $text): string
{
    $text = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($text) : strtolower($text);
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    $text = trim($text, '-');

    return $text === '' ? 'geral' : substr($text, 0, 120);
}

function miauw_intelligence_config_get(string $key, string $default = ''): string
{
    try {
        $stmt = db()->prepare('SELECT valor FROM miauw_configuracoes WHERE chave = ? LIMIT 1');
        $stmt->execute(array($key));
        $value = $stmt->fetchColumn();

        return $value === false ? $default : (string) $value;
    } catch (Throwable $error) {
        return $default;
    }
}

function miauw_intelligence_config_set(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO miauw_configuracoes (chave, valor, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()'
    );
    $stmt->execute(array($key, $value));
}

function miauw_intelligence_fingerprint(string $module, string $type, string $subject): string
{
    return sha1($module . '|' . $type . '|' . $subject);
}

function miauw_intelligence_alert_risk_score(string $severity, array $context = array()): int
{
    $base = array(
        'info' => 18,
        'baixa' => 32,
        'media' => 54,
        'alta' => 76,
        'critica' => 92,
    );
    $score = (int) ($base[$severity] ?? 54);

    if (isset($context['dias_parado'])) {
        $score += min(18, max(0, (int) $context['dias_parado'] * 2));
    }

    if (isset($context['sobra_falta'])) {
        $diff = abs((float) $context['sobra_falta']);
        if ($diff >= 200) {
            $score += 18;
        } elseif ($diff >= 50) {
            $score += 10;
        }
    }

    if (isset($context['qtd'])) {
        $score += min(14, max(0, (int) $context['qtd'] * 3));
    }

    if (isset($context['qtd_alertas'])) {
        $score += min(16, max(0, (int) $context['qtd_alertas'] * 4));
    }

    if (isset($context['qtd_precos'])) {
        $score += min(12, max(0, (int) $context['qtd_precos'] * 3));
    }

    if (isset($context['horas_sem_vencedor'])) {
        $score += min(12, max(0, (int) floor((int) $context['horas_sem_vencedor'] / 12)));
    }

    return max(1, min(100, $score));
}

function miauw_intelligence_alert_action(string $module, string $type, array $context = array()): string
{
    if ($type === 'financeiro_divergencia_recente') {
        return 'Conferir dinheiro fisico, PIX, maquininha e sangrias antes de fechar.';
    }

    if ($type === 'financeiro_dia_aberto_antigo') {
        return 'Abrir o dia no financeiro, revisar lancamentos e concluir ou justificar.';
    }

    if ($type === 'financeiro_divergencia_recorrente') {
        return 'Separar os dias com divergencia e transformar a causa em regra de conferencia.';
    }

    if ($type === 'cotacao_encomenda_parada') {
        return 'Como passou de 1 dia, conferir produto, responsavel/cliente e vencedor; depois finalizar, marcar retirada, cancelar ou virar pedido.';
    }

    if ($type === 'cotacao_urgente_parada') {
        return 'Priorizar esse item antes de mexer em cotacao comum.';
    }

    if ($type === 'cotacao_sem_vencedor_antiga') {
        return 'Escolher vencedor quando ja existe preco, ou registrar por que a compra ficou pendente.';
    }

    if ($type === 'cotacao_duplicidade_aberta') {
        return 'Unificar os itens repetidos ou cancelar o duplicado para nao comprar duas vezes sem querer.';
    }

    if (strpos($type, 'risco_composto') !== false || $type === 'sistema_alerta_concentrado') {
        return 'Tratar o conjunto: primeiro alta/critica, depois causa repetida.';
    }

    return $module === 'financeiro'
        ? 'Validar dados, responsavel e comprovantes antes de seguir.'
        : 'Conferir origem, responsavel e proximo estado do processo.';
}

function miauw_intelligence_alert_speech(string $module, string $type, string $title, array $context = array()): string
{
    if ($type === 'cotacao_encomenda_parada') {
        return 'Cotacao: encomenda com mais de 1 dia. Confere se ja da para finalizar, virar pedido, retirada ou cancelamento.';
    }

    if ($module === 'cotacao') {
        return 'Cotacao tem alerta. Abre comigo e confere antes que vire retrabalho.';
    }

    return $title !== '' ? $title : 'Miauby tem alerta operacional para revisar.';
}

function miauw_intelligence_upsert_alert(
    string $module,
    string $type,
    string $severity,
    string $title,
    string $message,
    array $context = array()
): string {
    miauw_intelligence_ensure_schema();

    $subject = (string) ($context['subject'] ?? $title . '|' . $message);
    $fingerprint = miauw_intelligence_fingerprint($module, $type, $subject);
    $severity = in_array($severity, array('info', 'baixa', 'media', 'alta', 'critica'), true) ? $severity : 'media';
    $riskScore = miauw_intelligence_alert_risk_score($severity, $context);
    $action = miauw_intelligence_alert_action($module, $type, $context);

    $stmt = db()->prepare(
        "INSERT INTO miauw_alertas
            (fingerprint, modulo, tipo, severidade, titulo, mensagem, contexto, risco_score, acao_sugerida, status, ocorrencias, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', 1, NOW())
         ON DUPLICATE KEY UPDATE
            created_at = IF(status = 'resolvido', NOW(), created_at),
            severidade = VALUES(severidade),
            titulo = VALUES(titulo),
            mensagem = VALUES(mensagem),
            contexto = VALUES(contexto),
            risco_score = VALUES(risco_score),
            acao_sugerida = VALUES(acao_sugerida),
            dismissed_by = IF(status = 'ignorado', dismissed_by, NULL),
            dismissed_at = IF(status = 'ignorado', dismissed_at, NULL),
            status = IF(status = 'ignorado', 'ignorado', 'novo'),
            ocorrencias = ocorrencias + 1,
            last_seen_at = NOW(),
            resolved_at = IF(status = 'ignorado', resolved_at, NULL)"
    );
    $stmt->execute(array(
        $fingerprint,
        $module,
        $type,
        $severity,
        miauw_substr($title, 0, 180),
        miauw_substr($message, 0, 1200),
        miauw_intelligence_json($context),
        $riskScore,
        miauw_substr($action, 0, 255),
    ));

    return $fingerprint;
}

function miauw_intelligence_resolve_missing_alerts(array $activeFingerprints, array $types): void
{
    if (!$types) {
        return;
    }

    $params = $types;
    $typePlaceholders = implode(',', array_fill(0, count($types), '?'));
    $sql = "UPDATE miauw_alertas
            SET status = 'resolvido', resolved_at = NOW()
            WHERE status IN ('novo', 'visto', 'ignorado')
              AND tipo IN ($typePlaceholders)";

    if ($activeFingerprints) {
        $sql .= ' AND fingerprint NOT IN (' . implode(',', array_fill(0, count($activeFingerprints), '?')) . ')';
        $params = array_merge($params, $activeFingerprints);
    }

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
}

function miauw_intelligence_active_alerts(int $limit = 8, ?string $module = null): array
{
    miauw_intelligence_ensure_schema();
    miauw_intelligence_expire_old_alerts(48);
    $limit = max(1, min(30, $limit));
    $params = array();
    $where = "status IN ('novo', 'visto')";

    if ($module !== null && $module !== '') {
        $where .= ' AND modulo = ?';
        $params[] = $module;
    }

    $stmt = db()->prepare(
        "SELECT *
         FROM miauw_alertas
         WHERE $where
         ORDER BY risco_score DESC, FIELD(severidade, 'critica', 'alta', 'media', 'baixa', 'info'), last_seen_at DESC, id DESC
         LIMIT " . $limit
    );
    $stmt->execute($params);

    return $stmt->fetchAll() ?: array();
}

function miauw_intelligence_active_alert_count(?string $module = null): int
{
    miauw_intelligence_ensure_schema();
    miauw_intelligence_expire_old_alerts(48);
    $params = array();
    $where = "status IN ('novo', 'visto')";

    if ($module !== null && $module !== '') {
        $where .= ' AND modulo = ?';
        $params[] = $module;
    }

    $stmt = db()->prepare("SELECT COUNT(*) FROM miauw_alertas WHERE $where");
    $stmt->execute($params);

    return (int) $stmt->fetchColumn();
}

function miauw_intelligence_public_alert(array $alert): array
{
    $context = miauw_intelligence_decode_json((string) ($alert['contexto'] ?? ''));
    $severity = (string) ($alert['severidade'] ?? 'media');
    $action = trim((string) ($alert['acao_sugerida'] ?? ''));
    if ($action === '') {
        $action = miauw_intelligence_alert_action(
            (string) ($alert['modulo'] ?? 'geral'),
            (string) ($alert['tipo'] ?? 'geral'),
            $context
        );
    }

    $riskScore = isset($alert['risco_score'])
        ? (int) $alert['risco_score']
        : miauw_intelligence_alert_risk_score($severity, $context);
    $module = (string) ($alert['modulo'] ?? 'geral');
    $type = (string) ($alert['tipo'] ?? '');
    $title = (string) ($alert['titulo'] ?? 'Alerta');

    return array(
        'id' => (int) ($alert['id'] ?? 0),
        'fingerprint' => (string) ($alert['fingerprint'] ?? ''),
        'modulo' => $module,
        'tipo' => $type,
        'severidade' => $severity,
        'titulo' => $title,
        'mensagem' => (string) ($alert['mensagem'] ?? ''),
        'acao_sugerida' => $action,
        'comentario_balao' => miauw_intelligence_alert_speech($module, $type, $title, $context),
        'risco_score' => $riskScore,
        'ocorrencias' => (int) ($alert['ocorrencias'] ?? 1),
        'created_at' => (string) ($alert['created_at'] ?? ''),
        'first_seen_at' => (string) ($alert['first_seen_at'] ?? ''),
        'last_seen_at' => (string) ($alert['last_seen_at'] ?? ''),
    );
}

function miauw_intelligence_public_alerts(int $limit = 8, ?string $module = null): array
{
    return array_map('miauw_intelligence_public_alert', miauw_intelligence_active_alerts($limit, $module));
}

function miauw_intelligence_record_alert_event(
    ?int $alertId,
    string $fingerprint,
    string $action,
    ?int $userId = null,
    string $detail = '',
    ?string $expiresAt = null
): void {
    miauw_intelligence_ensure_schema();

    $stmt = db()->prepare(
        'INSERT INTO miauw_alerta_eventos
            (alerta_id, fingerprint, acao, usuario_id, detalhe, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array(
        $alertId,
        $fingerprint,
        miauw_substr($action, 0, 40),
        $userId,
        miauw_substr($detail, 0, 1200),
        $expiresAt,
    ));
}

function miauw_intelligence_dismiss_alert(int $alertId, int $userId): bool
{
    miauw_intelligence_ensure_schema();

    $stmt = db()->prepare(
        "SELECT id, fingerprint, titulo
         FROM miauw_alertas
         WHERE id = ?
           AND status IN ('novo', 'visto')
         LIMIT 1"
    );
    $stmt->execute(array($alertId));
    $alert = $stmt->fetch();

    if (!$alert) {
        return false;
    }

    $stmt = db()->prepare(
        "UPDATE miauw_alertas
         SET status = 'ignorado',
             dismissed_by = ?,
             dismissed_at = NOW(),
             resolved_at = NOW()
         WHERE id = ?
           AND status IN ('novo', 'visto')"
    );
    $stmt->execute(array($userId, $alertId));

    if ($stmt->rowCount() <= 0) {
        return false;
    }

    miauw_intelligence_record_alert_event(
        $alertId,
        (string) ($alert['fingerprint'] ?? ''),
        'dispensado',
        $userId,
        'Alerta apagado da tela pelo usuario. Titulo: ' . (string) ($alert['titulo'] ?? '')
    );

    if (function_exists('log_action')) {
        log_action(
            'miauw_alerta_dispensado',
            'miauw_alerta',
            $alertId,
            'Alerta apagado da tela. Fingerprint: ' . (string) ($alert['fingerprint'] ?? '')
        );
    }

    return true;
}

function miauw_intelligence_alert_line(array $alert): string
{
    $severity = strtoupper((string) ($alert['severidade'] ?? 'media'));
    $module = strtoupper((string) ($alert['modulo'] ?? 'sistema'));
    $risk = isset($alert['risco_score']) ? ' | risco ' . (int) $alert['risco_score'] . '/100' : '';
    $action = trim((string) ($alert['acao_sugerida'] ?? ''));

    return '[' . $severity . $risk . '] ' . $module . ' - ' . (string) ($alert['titulo'] ?? '') . ': ' . (string) ($alert['mensagem'] ?? '')
        . ($action !== '' ? ' Proximo: ' . $action : '');
}

function miauw_intelligence_alerts_text(int $limit = 8, ?string $module = null): string
{
    $alerts = miauw_intelligence_active_alerts($limit, $module);
    if (!$alerts) {
        return "ALERTAS ATIVOS DO MIAUBY\nNenhum alerta ativo agora.";
    }

    $lines = array('ALERTAS ATIVOS DO MIAUBY');
    foreach ($alerts as $alert) {
        $lines[] = miauw_intelligence_alert_line($alert);
    }

    return implode("\n", $lines);
}

function miauw_intelligence_record_pattern(
    string $module,
    string $type,
    string $key,
    string $description,
    array $context = array()
): void {
    miauw_intelligence_ensure_schema();

    $key = miauw_intelligence_normalized_key($key);
    $existing = null;
    $stmt = db()->prepare('SELECT contexto, contador FROM miauw_padroes WHERE modulo = ? AND tipo = ? AND chave = ? LIMIT 1');
    $stmt->execute(array($module, $type, $key));
    $existing = $stmt->fetch() ?: null;

    $mergedContext = $context;
    if ($existing) {
        $previous = miauw_intelligence_decode_json((string) ($existing['contexto'] ?? ''));
        $examples = $previous['exemplos'] ?? array();
        if (!is_array($examples)) {
            $examples = array();
        }

        $newExample = trim((string) ($context['exemplo'] ?? ''));
        if ($newExample !== '' && !in_array($newExample, $examples, true)) {
            array_unshift($examples, miauw_substr($newExample, 0, 220));
        }
        $mergedContext = array_merge($previous, $context);
        $mergedContext['exemplos'] = array_slice($examples, 0, 8);
    } elseif (!empty($context['exemplo'])) {
        $mergedContext['exemplos'] = array(miauw_substr((string) $context['exemplo'], 0, 220));
    }

    $confidence = min(0.95, 0.20 + (((int) ($existing['contador'] ?? 0) + 1) * 0.08));
    $stmt = db()->prepare(
        'INSERT INTO miauw_padroes
            (modulo, tipo, chave, descricao, contexto, contador, confianca, last_seen_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, NOW())
         ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            contexto = VALUES(contexto),
            contador = contador + 1,
            confianca = VALUES(confianca),
            last_seen_at = NOW()'
    );
    $stmt->execute(array(
        $module,
        $type,
        $key,
        miauw_substr($description, 0, 1200),
        miauw_intelligence_json($mergedContext),
        $confidence,
    ));
}

function miauw_intelligence_recent_patterns(int $limit = 6, ?string $module = null): array
{
    miauw_intelligence_ensure_schema();
    $limit = max(1, min(20, $limit));
    $params = array();
    $where = '1=1';

    if ($module !== null && $module !== '') {
        $where .= ' AND modulo = ?';
        $params[] = $module;
    }

    $stmt = db()->prepare(
        "SELECT *
         FROM miauw_padroes
         WHERE $where
         ORDER BY contador DESC, last_seen_at DESC, id DESC
         LIMIT " . $limit
    );
    $stmt->execute($params);

    return $stmt->fetchAll() ?: array();
}

function miauw_intelligence_patterns_text(int $limit = 6, ?string $module = null): string
{
    $patterns = miauw_intelligence_recent_patterns($limit, $module);
    if (!$patterns) {
        return "PADROES APRENDIDOS DO MIAUBY\nAinda sem padroes suficientes. O gato esta observando em silencio julgador.";
    }

    $lines = array('PADROES APRENDIDOS DO MIAUBY');
    foreach ($patterns as $pattern) {
        $lines[] = '- ' . strtoupper((string) $pattern['modulo'])
            . ' | ' . (string) $pattern['descricao']
            . ' | vezes: ' . (int) $pattern['contador']
            . ' | confianca: ' . number_format((float) $pattern['confianca'] * 100, 0, ',', '.') . '%';
    }

    return implode("\n", $lines);
}

function miauw_guardian_scan(bool $force = false): array
{
    miauw_intelligence_ensure_schema();
    miauw_intelligence_expire_old_alerts(48);

    $lastScan = (int) miauw_intelligence_config_get('guardian_last_scan_ts', '0');
    if (!$force && $lastScan > 0 && time() - $lastScan < 900) {
        return array(
            'scanned' => false,
            'alerts' => miauw_intelligence_active_alerts(12),
            'patterns' => miauw_intelligence_recent_patterns(8),
        );
    }

    $active = array();
    $processedTypes = array();

    $active = array_merge($active, miauw_guardian_scan_financeiro($processedTypes));
    $active = array_merge($active, miauw_guardian_scan_cotacao($processedTypes));
    $active = array_merge($active, miauw_guardian_scan_correlations($processedTypes));

    if ($processedTypes) {
        miauw_intelligence_resolve_missing_alerts(array_values(array_unique($active)), array_values(array_unique($processedTypes)));
    }

    miauw_intelligence_config_set('guardian_last_scan_ts', (string) time());

    return array(
        'scanned' => true,
        'alerts' => miauw_intelligence_active_alerts(12),
        'patterns' => miauw_intelligence_recent_patterns(8),
    );
}

function miauw_guardian_scan_financeiro(array &$processedTypes): array
{
    $fingerprints = array();
    $processedTypes = array_merge($processedTypes, array(
        'financeiro_divergencia_recente',
        'financeiro_dia_aberto_antigo',
        'financeiro_divergencia_recorrente',
    ));

    if (!function_exists('miauw_skill_financeiro_internal_configured')
        || !miauw_skill_financeiro_internal_configured()
        || !function_exists('miauw_skill_financeiro_internal_request')) {
        return $fingerprints;
    }

    try {
        $summaryResponse = miauw_skill_financeiro_internal_request('GET', '/api/internal/summary', array(), array('month' => date('Y-m')));
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $dayResponse = miauw_skill_financeiro_internal_request('GET', '/api/internal/cash-closing-status', array(), array('date' => $yesterday));
    } catch (Throwable $error) {
        error_log('Miauby guardian Financeiro scan failed: ' . $error->getMessage());
        return $fingerprints;
    }

    $summary = is_array($summaryResponse['summary'] ?? null) ? $summaryResponse['summary'] : array();
    $diffCents = (int) ($summary['difference_cents'] ?? 0);
    $diff = $diffCents / 100;
    if (abs($diffCents) > 1000) {
        $fingerprints[] = miauw_intelligence_upsert_alert(
            'financeiro',
            'financeiro_divergencia_recente',
            abs($diffCents) >= 5000 ? 'alta' : 'media',
            'Divergencia no financeiro este mes',
            'Sobra/falta acumulada de ' . miauw_skill_money($diff) . ' no Financeiro Postgres. Conferir dinheiro fisico, pix, maquininha, sangria e observacao.',
            array(
                'subject' => 'financeiro_divergencia_mes_' . date('Y_m'),
                'mes' => (string) ($summaryResponse['month'] ?? date('Y-m')),
                'sobra_falta' => $diff,
                'source' => 'financeiro_internal_summary',
            )
        );
    }

    if (is_array($dayResponse)
        && !empty($dayResponse['ok'])
        && !empty($dayResponse['closing_exists'])
        && !empty($dayResponse['should_notify'])) {
        $fingerprints[] = miauw_intelligence_upsert_alert(
            'financeiro',
            'financeiro_dia_aberto_antigo',
            'media',
            'Dia financeiro antigo ainda aberto',
            date('d/m/Y', strtotime((string) ($dayResponse['date'] ?? 'yesterday'))) . ' esta em ' . (string) ($dayResponse['status_label'] ?? 'aberto') . ' no Financeiro Postgres. Fechamento parado vira arqueologia financeira.',
            array(
                'subject' => 'financeiro_aberto_' . (string) ($dayResponse['date'] ?? $yesterday),
                'data' => (string) ($dayResponse['date'] ?? $yesterday),
                'status' => (string) ($dayResponse['status'] ?? ''),
                'source' => 'financeiro_internal_cash_closing_status',
            )
        );
    }

    $divergences = (int) ($summary['divergences'] ?? 0);
    if ($divergences >= 2) {
        $fingerprints[] = miauw_intelligence_upsert_alert(
            'financeiro',
            'financeiro_divergencia_recorrente',
            'alta',
            'Divergencia recorrente no financeiro',
            $divergences . ' dia(s) divergente(s) no mes atual. Isso pede processo, nao fe administrativa.',
            array(
                'subject' => 'financeiro_divergencia_recorrente_' . date('Y_m'),
                'qtd' => $divergences,
                'source' => 'financeiro_internal_summary',
            )
        );
        miauw_intelligence_record_pattern(
            'financeiro',
            'divergencia_recorrente',
            'divergencia-caixa-mes-atual',
            'Divergencia de caixa apareceu mais de uma vez no mes atual.',
            array('qtd' => $divergences, 'sobra_falta' => $diff)
        );
    }

    return $fingerprints;
}

function miauw_guardian_scan_cotacao(array &$processedTypes): array
{
    $fingerprints = array();
    $processedTypes = array_merge($processedTypes, array(
        'cotacao_encomenda_parada',
        'cotacao_urgente_parada',
        'cotacao_sem_vencedor_antiga',
        'cotacao_duplicidade_aberta',
    ));

    if (!function_exists('miauw_skill_cotacao_v2_internal_configured')
        || !miauw_skill_cotacao_v2_internal_configured()
        || !function_exists('miauw_skill_cotacao_v2_internal_request')) {
        return $fingerprints;
    }

    try {
        $response = miauw_skill_cotacao_v2_internal_request('GET', '/api/internal/summary');
    } catch (Throwable $error) {
        error_log('Miauby guardian Cotacao V2 scan failed: ' . $error->getMessage());
        return $fingerprints;
    }

    if (!is_array($response) || empty($response['ok']) || !is_array($response['counts'] ?? null)) {
        return $fingerprints;
    }

    $counts = $response['counts'];
    $urgentCount = (int) ($counts['urgentes'] ?? 0);
    $winnerMissing = (int) ($counts['sem_vencedor'] ?? 0);
    if ($urgentCount > 0 && $winnerMissing > 0) {
        $fingerprints[] = miauw_intelligence_upsert_alert(
            'cotacao',
            'cotacao_urgente_parada',
            'baixa',
            'Cotacao V2 com urgente aberto',
            'A Cotacao V2 tem ' . $urgentCount . ' item(ns) urgente(s) e ' . $winnerMissing . ' item(ns) sem vencedor. Conferir /cotacao/ antes de comprar no piloto automatico.',
            array(
                'subject' => 'cotacao_v2_urgentes_abertos',
                'urgentes' => $urgentCount,
                'sem_vencedor' => $winnerMissing,
                'source' => 'cotacao_v2_internal_summary',
            )
        );
    }

    return $fingerprints;
}

function miauw_guardian_scan_correlations(array &$processedTypes): array
{
    $fingerprints = array();
    $processedTypes = array_merge($processedTypes, array(
        'financeiro_risco_composto',
        'cotacao_risco_composto',
        'sistema_alerta_concentrado',
    ));

    $totalAlerts = 0;
    $criticalSignals = 0;
    foreach (array('financeiro', 'cotacao') as $module) {
        $alerts = array_values(array_filter(miauw_intelligence_active_alerts(12, $module), static function (array $alert): bool {
            $type = (string) ($alert['tipo'] ?? '');

            return strpos($type, 'risco_composto') === false && $type !== 'sistema_alerta_concentrado';
        }));
        $count = count($alerts);
        $totalAlerts += $count;

        if ($count < 2) {
            continue;
        }

        $titles = array();
        $maxRisk = 0;
        $hasHigh = false;
        foreach ($alerts as $alert) {
            $titles[] = (string) ($alert['titulo'] ?? 'Alerta');
            $maxRisk = max($maxRisk, (int) ($alert['risco_score'] ?? 50));
            if (in_array((string) ($alert['severidade'] ?? ''), array('alta', 'critica'), true)) {
                $hasHigh = true;
                $criticalSignals++;
            }
        }

        $severity = ($hasHigh && $count >= 3) || $maxRisk >= 88 ? 'critica' : 'alta';
        $fingerprints[] = miauw_intelligence_upsert_alert(
            $module,
            $module . '_risco_composto',
            $severity,
            'Risco composto em ' . $module,
            $count . ' alerta(s) ativos se cruzam no modulo. Isso nao e evento isolado; e processo pedindo revisao.',
            array(
                'subject' => $module . '_risco_composto',
                'qtd_alertas' => $count,
                'risco_maximo' => $maxRisk,
                'titulos' => array_slice($titles, 0, 6),
            )
        );

        miauw_intelligence_record_pattern(
            $module,
            'risco_composto',
            $module . '-alertas-cruzados',
            'Alertas diferentes apareceram juntos no mesmo modulo, indicando gargalo operacional.',
            array('qtd_alertas' => $count, 'titulos' => array_slice($titles, 0, 6))
        );
    }

    if ($totalAlerts >= 5 || $criticalSignals >= 2) {
        $fingerprints[] = miauw_intelligence_upsert_alert(
            'sistema',
            'sistema_alerta_concentrado',
            $criticalSignals >= 2 ? 'critica' : 'alta',
            'Concentracao de alertas operacionais',
            $totalAlerts . ' alerta(s) ativos no sistema. Priorize por risco, resolva causa raiz e nao apenas o sintoma bonitinho.',
            array(
                'subject' => 'sistema_alerta_concentrado',
                'qtd_alertas' => $totalAlerts,
                'sinais_criticos' => $criticalSignals,
            )
        );
    }

    return $fingerprints;
}

function miauw_intelligence_module_from_message(string $message): ?string
{
    if (function_exists('miauw_skill_detect_modules')) {
        $modules = miauw_skill_detect_modules($message);
        if ($modules) {
            return (string) $modules[0];
        }
    }

    return null;
}

function miauw_intelligence_wants_alerts(string $message): bool
{
    $terms = array('alerta', 'alertas', 'pendencia', 'pendencias', 'guardiao', 'fiscal automatico', 'varre', 'varrer', 'o que tem errado', 'problemas do sistema', 'tem algo errado', 'alerta para verificar');

    return function_exists('miauw_skill_has_any') ? miauw_skill_has_any($message, $terms) : false;
}

function miauw_intelligence_wants_process_validation(string $message): bool
{
    $terms = array('validar processo', 'valida processo', 'auditar processo', 'audita processo', 'auditoria', 'diagnostico', 'diagnostico operacional', 'conferir processo', 'processo certo', 'o que esta errado no processo', 'super gestor', 'gestor operacional', 'modo gestor', 'estrategia operacional');

    return function_exists('miauw_skill_has_any') ? miauw_skill_has_any($message, $terms) : false;
}

function miauw_intelligence_wants_patterns(string $message): bool
{
    $terms = array('o que aprendeu', 'o que voce aprendeu', 'padrao', 'padroes', 'aprendizado', 'como eu costumo', 'inteligencia do miauby', 'miauby aprendeu', 'inteligencia do miauw', 'miauw aprendeu');

    return function_exists('miauw_skill_has_any') ? miauw_skill_has_any($message, $terms) : false;
}

function miauw_intelligence_wants_operational_brief(string $message): bool
{
    $terms = array('inteligencia', 'camada', 'camadas', 'entrelacar', 'cruzar dados', 'cruze dados', 'gestao', 'gestor', 'estrategia', 'auditoria', 'validacao', 'validar', 'decisao', 'decidir', 'melhorar processo');

    return function_exists('miauw_skill_has_any') ? miauw_skill_has_any($message, $terms) : false;
}

function miauw_intelligence_alert_reply(bool $force = true): string
{
    $scan = miauw_guardian_scan($force);
    $alerts = $scan['alerts'] ?? array();

    if (!$alerts) {
        return 'Passei a patinha no sistema e, por enquanto, nenhum alerta ativo. Milagre operacional detectado. Nao estraga.';
    }

    $lines = array('Meu bigode apitou. Alertas ativos:');
    foreach (array_slice($alerts, 0, 6) as $alert) {
        $lines[] = '- ' . miauw_intelligence_alert_line($alert);
    }

    $lines[] = 'Proximo passo: prioriza os de ALTA/CRITICA e manda "validar processo financeiro" ou "validar processo cotacao" que eu destrincho sem passar pano.';

    return implode("\n", $lines);
}

function miauw_intelligence_process_validation_reply(string $message): string
{
    miauw_guardian_scan(false);
    $module = miauw_intelligence_module_from_message($message) ?: 'geral';
    $alerts = miauw_intelligence_active_alerts(5, $module === 'geral' ? null : $module);
    $patterns = miauw_intelligence_recent_patterns(4, $module === 'geral' ? null : $module);

    $checklists = array(
        'financeiro' => array(
            'Data correta e dia aberto para edicao.',
            'Responsavel preenchido com nome entendivel.',
            'Total Sistema informado antes de fechar.',
            'Lancamentos com categoria, valor e observacao quando houver contexto.',
            'Sobra/falta acima do limite com justificativa decente.',
            'Fechamento so depois de conferir dinheiro fisico, PIX, maquininha e sangria.',
        ),
        'cotacao' => array(
            'EAN/produto/quantidade preenchidos quando existir produto real.',
            'Categoria livre, mas legivel: encomenda, urgente, cliente ou contexto.',
            'Encomenda precisa ter produto, responsavel/cliente, data de registro automatica e status claro.',
            'Distribuidoras renomeadas corretamente no cabecalho.',
            'Preco preenchido com numero, sem texto perdido em coluna de cotacao.',
            'Vencedor conferido antes de comprar.',
            'Encomenda parada precisa virar retirada, cancelada ou pedido.',
        ),
        'cashback' => array(
            'Cliente certo, telefone conferido e dados pessoais sem exposicao boba.',
            'Compra com valor correto e atendente/responsavel rastreavel.',
            'Credito/resgate com historico e saldo coerente.',
            'Mensagem WhatsApp com telefone fora do texto principal e status acompanhado.',
        ),
        'geral' => array(
            'Toda acao precisa ter tela, dado, responsavel e resultado esperado.',
            'Toda alteracao sensivel precisa de auditoria.',
            'O sistema deve impedir erro comum, nao torcer para ninguem errar.',
            'Relatorio bom nasce de dado preenchido direito.',
        ),
    );

    $lines = array('Diagnostico Miauby: processo ' . strtoupper($module) . '.');
    if ($alerts) {
        $lines[] = 'Alertas que eu achei:';
        foreach ($alerts as $alert) {
            $lines[] = '- ' . miauw_intelligence_alert_line($alert);
        }
    } else {
        $lines[] = 'Sem alerta ativo nesse modulo agora. O gato nao odiou.';
    }

    if ($patterns) {
        $lines[] = 'Padroes que estao pesando na minha cabeca felina:';
        foreach ($patterns as $pattern) {
            $lines[] = '- ' . (string) ($pattern['descricao'] ?? $pattern['chave'] ?? 'Padrao aprendido') . ' (' . (int) ($pattern['contador'] ?? 1) . 'x).';
        }
    }

    $lines[] = 'Checklist anti-caos:';
    foreach ($checklists[$module] ?? $checklists['geral'] as $item) {
        $lines[] = '- ' . $item;
    }

    return implode("\n", $lines);
}

function miauw_intelligence_operational_brief_text(?string $module = null): string
{
    $alerts = miauw_intelligence_public_alerts(6, $module);
    $patterns = miauw_intelligence_recent_patterns(5, $module);
    $lines = array('BRIEFING OPERACIONAL ENTRELACADO DO MIAUBY');

    if ($alerts) {
        $lines[] = 'Alertas priorizados por risco:';
        foreach ($alerts as $alert) {
            $lines[] = '- Risco ' . (int) $alert['risco_score'] . '/100 | ' . strtoupper((string) $alert['modulo']) . ' | ' . (string) $alert['titulo'] . ' | Proximo: ' . (string) $alert['acao_sugerida'];
        }
    } else {
        $lines[] = 'Alertas priorizados por risco: nenhum ativo agora.';
    }

    if ($patterns) {
        $lines[] = 'Padroes recentes para cruzar com a resposta:';
        foreach ($patterns as $pattern) {
            $lines[] = '- ' . strtoupper((string) $pattern['modulo']) . ' | ' . (string) ($pattern['descricao'] ?? $pattern['chave'] ?? 'Padrao aprendido') . ' | ocorrencias: ' . (int) ($pattern['contador'] ?? 1);
        }
    }

    $lines[] = 'Regra de decisao: separar fato real de inferencia, priorizar risco alto e sugerir proximo passo auditavel.';

    return implode("\n", $lines);
}

function miauw_intelligence_patterns_reply(string $message): string
{
    $module = miauw_intelligence_module_from_message($message);
    $patterns = miauw_intelligence_recent_patterns(8, $module);

    if (!$patterns) {
        return 'Ainda nao tenho padrao suficiente nesse modulo. Sem dado, sem milagre. Usa o sistema normalmente que eu vou juntando as pistas sem virar fofoca estatistica.';
    }

    $lines = array('Miauby analisou o que vem se repetindo:');
    foreach ($patterns as $pattern) {
        $lines[] = '- ' . (string) ($pattern['descricao'] ?? $pattern['chave'] ?? 'Padrao aprendido') . ' Ocorrencias: ' . (string) (int) ($pattern['contador'] ?? 1) . '.';
    }

    $lines[] = 'Proximo passo: se isso virou rotina, transforma em campo, alerta ou regra. Processo bom nao depende da memoria de humano cansado.';

    return implode("\n", $lines);
}

function miauw_intelligence_context_for_message(string $message): string
{
    $chunks = array();

    if (miauw_intelligence_wants_alerts($message) || miauw_intelligence_wants_process_validation($message)) {
        miauw_guardian_scan(true);
    } else {
        miauw_guardian_scan(false);
    }

    $module = miauw_intelligence_module_from_message($message);

    if (miauw_intelligence_wants_alerts($message) || miauw_intelligence_wants_process_validation($message) || $module !== null) {
        $chunks[] = miauw_intelligence_alerts_text(6, $module);
    }

    if (miauw_intelligence_wants_patterns($message) || (function_exists('miauw_skill_has_any') && miauw_skill_has_any($message, array('aprendeu', 'inteligencia', 'autonomo', 'autonoma')))) {
        $chunks[] = miauw_intelligence_patterns_text(6, $module);
    }

    if (miauw_intelligence_wants_operational_brief($message)) {
        $chunks[] = miauw_intelligence_operational_brief_text($module);
    }

    if (!$chunks) {
        return '';
    }

    return "INTELIGENCIA OPERACIONAL DO MIAUBY\n" . implode("\n\n", $chunks);
}

function miauw_intelligence_diagnostic_text(string $module = ''): string
{
    miauw_guardian_scan(true);
    $module = in_array($module, array('financeiro', 'cotacao', 'cashback'), true) ? $module : '';
    $alerts = miauw_intelligence_alerts_text(8, $module !== '' ? $module : null);
    $patterns = miauw_intelligence_patterns_text(6, $module !== '' ? $module : null);

    return $alerts . "\n\n" . $patterns;
}

function miauw_intelligence_learn_financeiro_command(string $message, array $command): void
{
    $category = (string) ($command['categoria'] ?? '');
    $responsible = (string) ($command['responsavel'] ?? '');
    $obs = (string) ($command['observacao_usuario'] ?? '');
    $value = (float) ($command['valor'] ?? 0);

    if ($category === '' || $value <= 0) {
        return;
    }

    miauw_intelligence_record_pattern(
        'financeiro',
        'comando_lancamento',
        $category . '|' . miauw_intelligence_normalized_key($obs !== '' ? $obs : $message),
        'Comando interpretado como ' . $category . ' com valor e responsavel ' . ($responsible !== '' ? $responsible : 'pendente') . '.',
        array(
            'exemplo' => $message,
            'categoria' => $category,
            'valor' => $value,
            'responsavel' => $responsible,
            'observacao' => $obs,
        )
    );

    if (function_exists('miauw_memory_store')) {
        $hint = 'Quando o usuario disser algo parecido com "' . $message . '", interpretar como lancamento financeiro: categoria '
            . $category . ', valor informado na frase, responsavel '
            . ($responsible !== '' ? $responsible : 'a confirmar')
            . ($obs !== '' ? ', observacao "' . $obs . '"' : ', observacao conforme contexto')
            . '.';
        miauw_memory_store(null, 'financeiro', 'comando_' . miauw_intelligence_normalized_key($category), $hint, 'comando_financeiro', 2);
    }
}

function miauw_reply_parts(string $text, int $maxParts = 4): array
{
    $text = trim($text);
    if ($text === '') {
        return array();
    }

    $length = static function (string $value): int {
        if (function_exists('miauw_strlen')) {
            return miauw_strlen($value);
        }

        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    };

    $maxParts = max(1, min(6, $maxParts));
    if ($length($text) <= 360) {
        return array($text);
    }

    $rawParts = preg_split('/\n{2,}/', $text) ?: array();
    if (count($rawParts) <= 1) {
        $rawParts = preg_split('/(?<=[\.\!\?])\s+/u', $text) ?: array($text);
    }

    $parts = array();
    $buffer = '';
    foreach ($rawParts as $part) {
        $part = trim((string) $part);
        if ($part === '') {
            continue;
        }

        if ($buffer !== '' && $length($buffer . "\n" . $part) > 420 && count($parts) < $maxParts - 1) {
            $parts[] = $buffer;
            $buffer = $part;
        } else {
            $buffer = $buffer === '' ? $part : $buffer . "\n" . $part;
        }
    }

    if ($buffer !== '') {
        $parts[] = $buffer;
    }

    if (count($parts) > $maxParts) {
        $head = array_slice($parts, 0, $maxParts - 1);
        $tail = implode("\n", array_slice($parts, $maxParts - 1));
        $parts = array_merge($head, array($tail));
    }

    return array_values(array_filter($parts, static function ($part): bool {
        return trim((string) $part) !== '';
    }));
}
