<?php
declare(strict_types=1);

if (!function_exists('db')) {
    $sharedFunctions = __DIR__ . '/../cashback/functions.php';
    if (is_file($sharedFunctions)) {
        require_once $sharedFunctions;
    }
}

function financeiro_schema_statements(): array
{
    return array(
        "CREATE TABLE IF NOT EXISTS financeiro_fechamentos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            data_fechamento DATE NOT NULL,
            responsavel_id INT UNSIGNED NULL,
            responsavel_texto VARCHAR(160) NULL,
            status ENUM('aberto', 'conferencia', 'fechado', 'divergente', 'sem_movimento') NOT NULL DEFAULT 'aberto',
            caixa_fisico DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            cartao_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            pix_banco_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            pix_maquininha_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            pix_correto_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            pix_correto_manual DECIMAL(10,2) NULL,
            pix_correto_justificativa TEXT NULL,
            sangria_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            retirada_caixa DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            abertura_sistema DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            faturamento_dia DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            faturamento_registrado_em DATETIME NULL,
            ajustes DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            total_conferido DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            sobra_falta DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            justificativa TEXT NULL,
            observacao TEXT NULL,
            fechado_em DATETIME NULL,
            fechado_por INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_fin_fechamento_data (data_fechamento),
            KEY idx_fin_fechamento_status (status),
            KEY idx_fin_fechamento_responsavel (responsavel_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_sangrias (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            fechamento_id INT UNSIGNED NULL,
            data DATE NOT NULL,
            hora TIME NULL,
            valor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            motivo VARCHAR(140) NOT NULL,
            responsavel_id INT UNSIGNED NULL,
            autorizado_por VARCHAR(160) NULL,
            destino VARCHAR(180) NULL,
            observacao TEXT NULL,
            status ENUM('lancado', 'conferido', 'cancelado') NOT NULL DEFAULT 'lancado',
            anexo_path VARCHAR(255) NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_fin_sangria_data (data),
            KEY idx_fin_sangria_fechamento (fechamento_id),
            KEY idx_fin_sangria_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_maquininhas (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            fechamento_id INT UNSIGNED NULL,
            data DATE NOT NULL,
            operadora VARCHAR(80) NOT NULL,
            tipo ENUM('credito', 'debito', 'voucher', 'pix_maquininha', 'outra') NOT NULL DEFAULT 'credito',
            valor_bruto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            taxa DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            valor_liquido DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            bandeira VARCHAR(80) NULL,
            nsu VARCHAR(80) NULL,
            codigo_comprovante VARCHAR(120) NULL,
            horario TIME NULL,
            responsavel_id INT UNSIGNED NULL,
            observacao TEXT NULL,
            status_conciliacao ENUM('pendente', 'conferido', 'divergente', 'cancelado') NOT NULL DEFAULT 'pendente',
            anexo_path VARCHAR(255) NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_fin_maq_data (data),
            KEY idx_fin_maq_fechamento (fechamento_id),
            KEY idx_fin_maq_tipo (tipo),
            KEY idx_fin_maq_status (status_conciliacao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_pix (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            fechamento_id INT UNSIGNED NULL,
            data DATE NOT NULL,
            tipo ENUM('banco', 'maquininha', 'divergente', 'ajuste') NOT NULL DEFAULT 'banco',
            valor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            origem VARCHAR(160) NULL,
            responsavel_id INT UNSIGNED NULL,
            comprovante_path VARCHAR(255) NULL,
            observacao TEXT NULL,
            status ENUM('pendente', 'conferido', 'divergente', 'cancelado') NOT NULL DEFAULT 'pendente',
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_fin_pix_data (data),
            KEY idx_fin_pix_fechamento (fechamento_id),
            KEY idx_fin_pix_tipo (tipo),
            KEY idx_fin_pix_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            fechamento_id INT UNSIGNED NOT NULL,
            data DATE NOT NULL,
            categoria VARCHAR(120) NOT NULL,
            valor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            observacao TEXT NULL,
            status ENUM('lancado', 'cancelado') NOT NULL DEFAULT 'lancado',
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_fin_lanc_fechamento (fechamento_id),
            KEY idx_fin_lanc_data (data),
            KEY idx_fin_lanc_categoria (categoria),
            KEY idx_fin_lanc_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_auditoria (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id INT UNSIGNED NULL,
            acao VARCHAR(100) NOT NULL,
            tabela_afetada VARCHAR(100) NOT NULL,
            registro_id INT UNSIGNED NULL,
            valor_anterior LONGTEXT NULL,
            valor_novo LONGTEXT NULL,
            ip VARCHAR(80) NULL,
            user_agent VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_fin_audit_user (usuario_id),
            KEY idx_fin_audit_table (tabela_afetada, registro_id),
            KEY idx_fin_audit_action (acao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financeiro_configuracoes (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            chave VARCHAR(80) NOT NULL,
            valor TEXT NOT NULL,
            descricao VARCHAR(255) NULL,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_fin_config_chave (chave)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "INSERT INTO financeiro_configuracoes (chave, valor, descricao) VALUES
            ('limite_divergencia', '10.00', 'Tolerancia maxima positiva ou negativa antes de marcar divergente.'),
            ('formula_total_conferido', 'caixa_fisico + cartao_total + pix_correto_total + sangria_total + retirada_caixa + ajustes', 'Formula operacional padrao do fechamento.'),
            ('permitir_pix_manual', '1', 'Permite informar PIX correto manual com justificativa.')
         ON DUPLICATE KEY UPDATE chave = chave"
    );
}

function financeiro_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    foreach (financeiro_schema_statements() as $statement) {
        db()->exec($statement);
    }

    financeiro_ensure_existing_columns();
    $done = true;
}

function financeiro_column_exists(string $table, string $column): bool
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
        throw new InvalidArgumentException('Tabela invalida para verificacao de coluna.');
    }

    $columnLike = db()->quote($column);
    $stmt = db()->query("SHOW COLUMNS FROM `$table` LIKE $columnLike");

    return (bool) $stmt->fetch();
}

function financeiro_ensure_column(string $table, string $column, string $definition): void
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
        throw new InvalidArgumentException('Tabela invalida para alteracao de coluna.');
    }

    if (!financeiro_column_exists($table, $column)) {
        db()->exec("ALTER TABLE `$table` ADD COLUMN $definition");
    }
}

function financeiro_ensure_existing_columns(): void
{
    $columns = array(
        'financeiro_fechamentos' => array(
            'responsavel_id' => 'responsavel_id INT UNSIGNED NULL AFTER data_fechamento',
            'responsavel_texto' => 'responsavel_texto VARCHAR(160) NULL AFTER responsavel_id',
            'status' => "status ENUM('aberto', 'conferencia', 'fechado', 'divergente', 'sem_movimento') NOT NULL DEFAULT 'aberto' AFTER responsavel_texto",
            'caixa_fisico' => 'caixa_fisico DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER status',
            'cartao_total' => 'cartao_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER caixa_fisico',
            'pix_banco_total' => 'pix_banco_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cartao_total',
            'pix_maquininha_total' => 'pix_maquininha_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER pix_banco_total',
            'pix_correto_total' => 'pix_correto_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER pix_maquininha_total',
            'pix_correto_manual' => 'pix_correto_manual DECIMAL(10,2) NULL AFTER pix_correto_total',
            'pix_correto_justificativa' => 'pix_correto_justificativa TEXT NULL AFTER pix_correto_manual',
            'sangria_total' => 'sangria_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER pix_correto_justificativa',
            'retirada_caixa' => 'retirada_caixa DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER sangria_total',
            'abertura_sistema' => 'abertura_sistema DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER retirada_caixa',
            'faturamento_dia' => 'faturamento_dia DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER abertura_sistema',
            'faturamento_registrado_em' => 'faturamento_registrado_em DATETIME NULL AFTER faturamento_dia',
            'ajustes' => 'ajustes DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER faturamento_registrado_em',
            'total_conferido' => 'total_conferido DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER ajustes',
            'sobra_falta' => 'sobra_falta DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_conferido',
            'justificativa' => 'justificativa TEXT NULL AFTER sobra_falta',
            'observacao' => 'observacao TEXT NULL AFTER justificativa',
            'fechado_em' => 'fechado_em DATETIME NULL AFTER observacao',
            'fechado_por' => 'fechado_por INT UNSIGNED NULL AFTER fechado_em',
            'created_at' => 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER fechado_por',
            'updated_at' => 'updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
        ),
        'financeiro_sangrias' => array(
            'anexo_path' => 'anexo_path VARCHAR(255) NULL AFTER status',
            'created_by' => 'created_by INT UNSIGNED NULL AFTER anexo_path',
        ),
        'financeiro_maquininhas' => array(
            'anexo_path' => 'anexo_path VARCHAR(255) NULL AFTER status_conciliacao',
            'created_by' => 'created_by INT UNSIGNED NULL AFTER anexo_path',
        ),
        'financeiro_pix' => array(
            'created_by' => 'created_by INT UNSIGNED NULL AFTER status',
            'comprovante_path' => 'comprovante_path VARCHAR(255) NULL AFTER responsavel_id',
        ),
        'financeiro_lancamentos' => array(
            'observacao' => 'observacao TEXT NULL AFTER valor',
            'status' => "status ENUM('lancado', 'cancelado') NOT NULL DEFAULT 'lancado' AFTER observacao",
            'created_by' => 'created_by INT UNSIGNED NULL AFTER status',
        ),
    );

    foreach ($columns as $table => $tableColumns) {
        foreach ($tableColumns as $column => $definition) {
            financeiro_ensure_column($table, $column, $definition);
        }
    }

    financeiro_ensure_closing_status_enum();
}

function financeiro_ensure_closing_status_enum(): void
{
    $stmt = db()->query("SHOW COLUMNS FROM financeiro_fechamentos LIKE 'status'");
    $column = $stmt ? $stmt->fetch() : false;
    $type = is_array($column) ? strtolower((string) ($column['Type'] ?? '')) : '';

    if ($type !== '' && strpos($type, 'sem_movimento') === false) {
        db()->exec("ALTER TABLE financeiro_fechamentos MODIFY status ENUM('aberto', 'conferencia', 'fechado', 'divergente', 'sem_movimento') NOT NULL DEFAULT 'aberto'");
    }
}

function financeiro_register_system_alert(string $title, Throwable $error, array $context = array()): void
{
    try {
        $miauwIntelligence = __DIR__ . '/../miauw/miauw-intelligence.php';
        if (is_file($miauwIntelligence)) {
            require_once $miauwIntelligence;
        }
        if (function_exists('miauw_intelligence_report_system_error')) {
            miauw_intelligence_report_system_error('financeiro', $title, $error->getMessage(), $context);
        }
    } catch (Throwable $ignored) {
        error_log('Financeiro alert bridge failed: ' . $ignored->getMessage());
    }
}

function financeiro_public_error(Throwable $error): string
{
    $message = trim($error->getMessage());
    $lower = strtolower($message);
    $technical = array('sqlstate', 'pdoexception', 'stack trace', '/home', '\\home', 'c:\\', 'query', 'database', 'mysql', 'syntax error');

    foreach ($technical as $needle) {
        if (strpos($lower, $needle) !== false) {
            financeiro_register_system_alert('Erro interno no financeiro', $error, array('origem' => 'financeiro_public_error'));
            return 'Nao consegui concluir agora. O erro foi registrado para revisao. Acione o Codex se repetir.';
        }
    }

    return $message !== '' ? $message : 'Nao consegui concluir agora. O erro foi registrado para revisao. Acione o Codex se repetir.';
}

function financeiro_save_faturamento_dia(string $date, float $value, ?int $userId = null, string $source = 'manual'): array
{
    financeiro_ensure_schema();
    $date = financeiro_valid_date($date, date('Y-m-d'));
    $closing = financeiro_get_or_create_closing($date);
    $before = financeiro_fetch_by_id((int) $closing['id']) ?: $closing;
    $registeredAt = $value > 0.009 ? date('Y-m-d H:i:s') : null;
    $reopenEmptyDay = (string) ($before['status'] ?? '') === 'sem_movimento' && $value > 0.009;

    $stmt = db()->prepare(
        'UPDATE financeiro_fechamentos
         SET faturamento_dia = ?, faturamento_registrado_em = ?' . ($reopenEmptyDay ? ", status = 'conferencia', fechado_em = NULL, fechado_por = NULL" : '') . '
         WHERE id = ?'
    );
    $stmt->execute(array($value, $registeredAt, (int) $closing['id']));
    $after = financeiro_fetch_by_id((int) $closing['id']) ?: $closing;

    financeiro_audit(
        'salvar_faturamento_diario',
        'financeiro_fechamentos',
        (int) $closing['id'],
        $before,
        array(
            'data_fechamento' => $date,
            'faturamento_dia' => $value,
            'faturamento_registrado_em' => $registeredAt,
            'status' => (string) ($after['status'] ?? $before['status'] ?? ''),
            'sem_movimento_convertido' => $reopenEmptyDay,
            'origem' => $source,
            'usuario_id' => $userId,
        )
    );

    return $after;
}

function financeiro_month_divergence_highlights(int $month, int $year, int $limit = 6): array
{
    financeiro_ensure_schema();
    $limit = max(1, min(20, $limit));
    $stmt = db()->prepare(
        "SELECT data_fechamento, status, sobra_falta, justificativa, observacao, responsavel_texto
         FROM financeiro_fechamentos
         WHERE MONTH(data_fechamento) = ?
           AND YEAR(data_fechamento) = ?
           AND ABS(sobra_falta) > 0.009
         ORDER BY ABS(sobra_falta) DESC, data_fechamento ASC
         LIMIT " . (int) $limit
    );
    $stmt->execute(array($month, $year));

    return $stmt->fetchAll() ?: array();
}

function financeiro_setting(string $key, string $default = ''): string
{
    financeiro_ensure_schema();

    $stmt = db()->prepare('SELECT valor FROM financeiro_configuracoes WHERE chave = ? LIMIT 1');
    $stmt->execute(array($key));
    $value = $stmt->fetchColumn();

    return $value === false ? $default : (string) $value;
}

function financeiro_set_setting(string $key, string $value, string $description = ''): void
{
    $stmt = db()->prepare(
        'INSERT INTO financeiro_configuracoes (chave, valor, descricao, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), descricao = VALUES(descricao), updated_at = NOW()'
    );
    $stmt->execute(array($key, $value, $description));
}

function financeiro_divergence_limit(): float
{
    return max(0.0, money_to_decimal(financeiro_setting('limite_divergencia', '10.00')));
}

function financeiro_lancamento_categorias_padrao(): array
{
    return array(
        'Sangria',
        'Maquininha C/D',
        'Maquininha Pix',
        'Pix CNPJ',
        'Dinheiro Fisico',
        'Outros',
    );
}

function financeiro_audit(string $action, string $table, ?int $recordId, $before = null, $after = null): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO financeiro_auditoria
                (usuario_id, acao, tabela_afetada, registro_id, valor_anterior, valor_novo, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            $_SESSION['user_id'] ?? null,
            $action,
            $table,
            $recordId,
            $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $_SERVER['REMOTE_ADDR'] ?? null,
            substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ));
    } catch (Throwable $error) {
        error_log('Financeiro audit failed: ' . $error->getMessage());
    }
}

function financeiro_valid_date(?string $value, ?string $default = null): string
{
    $value = trim((string) $value);

    if ($value === '') {
        return $default !== null ? $default : date('Y-m-d');
    }

    foreach (array('Y-m-d', 'd/m/Y', 'd-m-Y', 'd.m.Y') as $format) {
        $date = DateTime::createFromFormat('!' . $format, $value);

        if ($date instanceof DateTime && $date->format($format) === $value) {
            return $date->format('Y-m-d');
        }
    }

    if (preg_match('/^\d+(?:[,.]\d+)?$/', $value)) {
        $serial = (float) str_replace(',', '.', $value);

        if ($serial > 20000 && $serial < 80000) {
            return (new DateTime('1899-12-30'))->modify('+' . (int) $serial . ' days')->format('Y-m-d');
        }
    }

    $timestamp = strtotime(str_replace('/', '-', $value));

    if (!$timestamp) {
        return $default !== null ? $default : date('Y-m-d');
    }

    return date('Y-m-d', $timestamp);
}

function financeiro_time_or_null(?string $value): ?string
{
    $value = trim((string) $value);

    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);

    return $timestamp ? date('H:i:s', $timestamp) : null;
}

function financeiro_post_money(string $key): float
{
    return money_to_decimal($_POST[$key] ?? '0');
}

function financeiro_nullable_money(string $key): ?float
{
    $value = trim((string) ($_POST[$key] ?? ''));

    if ($value === '') {
        return null;
    }

    return money_to_decimal($value);
}

function financeiro_post_int_or_null(string $key): ?int
{
    $value = (int) ($_POST[$key] ?? 0);

    return $value > 0 ? $value : null;
}

function financeiro_fetch_by_date(string $date): ?array
{
    financeiro_ensure_schema();

    $stmt = db()->prepare(
        'SELECT f.*,
                COALESCE(NULLIF(f.responsavel_texto, ""), a.nome, "") AS responsavel_nome,
                u.username AS fechado_por_nome
         FROM financeiro_fechamentos f
         LEFT JOIN wf_atendentes a ON a.id = f.responsavel_id
         LEFT JOIN wf_users u ON u.id = f.fechado_por
         WHERE f.data_fechamento = ?
         LIMIT 1'
    );
    $stmt->execute(array($date));
    $row = $stmt->fetch();

    return $row ?: null;
}

function financeiro_fetch_by_id(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT f.*,
                COALESCE(NULLIF(f.responsavel_texto, ""), a.nome, "") AS responsavel_nome,
                u.username AS fechado_por_nome
         FROM financeiro_fechamentos f
         LEFT JOIN wf_atendentes a ON a.id = f.responsavel_id
         LEFT JOIN wf_users u ON u.id = f.fechado_por
         WHERE f.id = ?
         LIMIT 1'
    );
    $stmt->execute(array($id));
    $row = $stmt->fetch();

    return $row ?: null;
}

function financeiro_get_or_create_closing(string $date): array
{
    $existing = financeiro_fetch_by_date($date);

    if ($existing) {
        return $existing;
    }

    $stmt = db()->prepare('INSERT INTO financeiro_fechamentos (data_fechamento, status) VALUES (?, ?)');
    $stmt->execute(array($date, 'aberto'));
    $id = (int) db()->lastInsertId();
    $created = financeiro_fetch_by_id($id) ?: array('id' => $id, 'data_fechamento' => $date, 'status' => 'aberto');

    financeiro_audit('criar_fechamento', 'financeiro_fechamentos', $id, null, $created);
    log_action('financeiro_fechamento_criado', 'financeiro_fechamento', $id, 'Fechamento criado para ' . $date);

    return $created;
}

function financeiro_is_locked(array $closing): bool
{
    // "Sem movimento" e um atalho editavel; somente fechamento final trava o caixa.
    return in_array((string) ($closing['status'] ?? ''), array('fechado', 'divergente'), true);
}

function financeiro_upload_file(string $field, string $kind): ?string
{
    if (empty($_FILES[$field]) || !is_array($_FILES[$field]) || (int) ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    $file = $_FILES[$field];

    if ((int) $file['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Falha ao receber o comprovante.');
    }

    if ((int) $file['size'] > 5 * 1024 * 1024) {
        throw new RuntimeException('Comprovante acima de 5 MB.');
    }

    $original = (string) ($file['name'] ?? '');
    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $allowed = array('pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv');

    if (!in_array($extension, $allowed, true)) {
        throw new RuntimeException('Formato de comprovante nao permitido.');
    }

    $uploadRoot = __DIR__ . '/uploads/financeiro';
    $baseDir = $uploadRoot . '/' . preg_replace('/[^a-z0-9_-]+/i', '', $kind);

    if (!is_dir($baseDir) && !mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        throw new RuntimeException('Nao foi possivel criar a pasta de comprovantes.');
    }

    $htaccess = $uploadRoot . '/.htaccess';

    $htaccessContent = "Options -Indexes\nRequire all denied\n";

    if (is_dir($uploadRoot) && (!is_file($htaccess) || (string) @file_get_contents($htaccess) !== $htaccessContent)) {
        @file_put_contents($htaccess, $htaccessContent);
    }

    $name = date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
    $target = $baseDir . '/' . $name;

    if (!move_uploaded_file((string) $file['tmp_name'], $target)) {
        throw new RuntimeException('Nao foi possivel salvar o comprovante.');
    }

    return 'uploads/financeiro/' . basename($baseDir) . '/' . $name;
}

function financeiro_sums_for_closing(int $closingId): array
{
    $cardStmt = db()->prepare(
        "SELECT
            COUNT(*) AS total_qtd,
            COALESCE(SUM(CASE WHEN status_conciliacao <> 'cancelado' THEN 1 ELSE 0 END), 0) AS qtd,
            COALESCE(SUM(CASE WHEN status_conciliacao <> 'cancelado' AND tipo IN ('credito', 'debito', 'voucher', 'outra') THEN valor_bruto ELSE 0 END), 0) AS cartao,
            COALESCE(SUM(CASE WHEN status_conciliacao <> 'cancelado' AND tipo = 'pix_maquininha' THEN valor_bruto ELSE 0 END), 0) AS pix_maquininha,
            COALESCE(SUM(CASE WHEN status_conciliacao <> 'cancelado' THEN valor_liquido ELSE 0 END), 0) AS liquido
         FROM financeiro_maquininhas
         WHERE fechamento_id = ?"
    );
    $cardStmt->execute(array($closingId));
    $card = $cardStmt->fetch() ?: array();

    $pixStmt = db()->prepare(
        "SELECT
            COUNT(*) AS total_qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN 1 ELSE 0 END), 0) AS qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND tipo = 'banco' THEN valor ELSE 0 END), 0) AS banco,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND tipo = 'maquininha' THEN valor ELSE 0 END), 0) AS maquininha,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND tipo = 'ajuste' THEN valor ELSE 0 END), 0) AS ajuste
         FROM financeiro_pix
         WHERE fechamento_id = ?"
    );
    $pixStmt->execute(array($closingId));
    $pix = $pixStmt->fetch() ?: array();

    $sangriaStmt = db()->prepare(
        "SELECT
            COUNT(*) AS total_qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN 1 ELSE 0 END), 0) AS qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN valor ELSE 0 END), 0) AS total
         FROM financeiro_sangrias
         WHERE fechamento_id = ?"
    );
    $sangriaStmt->execute(array($closingId));
    $sangria = $sangriaStmt->fetch() ?: array();

    return array(
        'maquininhas_total_qtd' => (int) ($card['total_qtd'] ?? 0),
        'maquininhas_qtd' => (int) ($card['qtd'] ?? 0),
        'cartao_total' => (float) ($card['cartao'] ?? 0),
        'pix_maquininha_maquininha' => (float) ($card['pix_maquininha'] ?? 0),
        'maquininhas_liquido' => (float) ($card['liquido'] ?? 0),
        'pix_total_qtd' => (int) ($pix['total_qtd'] ?? 0),
        'pix_qtd' => (int) ($pix['qtd'] ?? 0),
        'pix_banco_total' => (float) ($pix['banco'] ?? 0),
        'pix_maquininha_pix' => (float) ($pix['maquininha'] ?? 0),
        'pix_ajuste_total' => (float) ($pix['ajuste'] ?? 0),
        'sangrias_total_qtd' => (int) ($sangria['total_qtd'] ?? 0),
        'sangrias_qtd' => (int) ($sangria['qtd'] ?? 0),
        'sangria_total' => (float) ($sangria['total'] ?? 0),
    );
}

function financeiro_lancamentos_for_closing(int $closingId): array
{
    financeiro_ensure_schema();

    $stmt = db()->prepare(
        'SELECT *
         FROM financeiro_lancamentos
         WHERE fechamento_id = ?
         ORDER BY status ASC, created_at ASC, id ASC'
    );
    $stmt->execute(array($closingId));

    return $stmt->fetchAll();
}

function financeiro_lancamento_sums_for_closing(int $closingId): array
{
    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS total_qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN 1 ELSE 0 END), 0) AS qtd,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN valor ELSE 0 END), 0) AS total,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria = 'Dinheiro Fisico' THEN valor ELSE 0 END), 0) AS dinheiro,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria = 'Maquininha C/D' THEN valor ELSE 0 END), 0) AS cartao,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria = 'Pix CNPJ' THEN valor ELSE 0 END), 0) AS pix_banco,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria = 'Maquininha Pix' THEN valor ELSE 0 END), 0) AS pix_maquininha,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria = 'Sangria' THEN valor ELSE 0 END), 0) AS sangria,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND categoria NOT IN ('Dinheiro Fisico', 'Maquininha C/D', 'Pix CNPJ', 'Maquininha Pix', 'Sangria') THEN valor ELSE 0 END), 0) AS outros
         FROM financeiro_lancamentos
         WHERE fechamento_id = ?"
    );
    $stmt->execute(array($closingId));
    $row = $stmt->fetch() ?: array();

    return array(
        'total_qtd' => (int) ($row['total_qtd'] ?? 0),
        'qtd' => (int) ($row['qtd'] ?? 0),
        'total' => (float) ($row['total'] ?? 0),
        'dinheiro' => (float) ($row['dinheiro'] ?? 0),
        'cartao' => (float) ($row['cartao'] ?? 0),
        'pix_banco' => (float) ($row['pix_banco'] ?? 0),
        'pix_maquininha' => (float) ($row['pix_maquininha'] ?? 0),
        'sangria' => (float) ($row['sangria'] ?? 0),
        'outros' => (float) ($row['outros'] ?? 0),
    );
}

function financeiro_add_lancamento(int $closingId, string $date, string $category, float $value, string $observation = ''): int
{
    $category = trim($category);

    if ($category === '') {
        throw new RuntimeException('Informe a categoria.');
    }

    if ($value <= 0) {
        throw new RuntimeException('Informe o valor do lancamento.');
    }

    $stmt = db()->prepare(
        'INSERT INTO financeiro_lancamentos
            (fechamento_id, data, categoria, valor, observacao, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array(
        $closingId,
        $date,
        $category,
        $value,
        trim($observation),
        'lancado',
        (int) ($_SESSION['user_id'] ?? 0),
    ));
    $id = (int) db()->lastInsertId();
    financeiro_recalculate($closingId);
    financeiro_audit('criar_lancamento', 'financeiro_lancamentos', $id, null, array(
        'fechamento_id' => $closingId,
        'data' => $date,
        'categoria' => $category,
        'valor' => $value,
        'observacao' => trim($observation),
    ));

    return $id;
}

function financeiro_recalculate(int $closingId): array
{
    $closing = financeiro_fetch_by_id($closingId);

    if (!$closing) {
        throw new RuntimeException('Fechamento financeiro nao encontrado.');
    }

    $sums = financeiro_sums_for_closing($closingId);
    $generic = financeiro_lancamento_sums_for_closing($closingId);
    $hasGeneric = $generic['total_qtd'] > 0;
    $caixaFisico = $hasGeneric ? $generic['dinheiro'] : (float) $closing['caixa_fisico'];
    $cartao = $hasGeneric ? $generic['cartao'] : ($sums['maquininhas_total_qtd'] > 0 ? $sums['cartao_total'] : (float) $closing['cartao_total']);
    $pixBanco = $hasGeneric ? $generic['pix_banco'] : ($sums['pix_total_qtd'] > 0 ? $sums['pix_banco_total'] : (float) $closing['pix_banco_total']);
    $pixMaquininhaAuto = $sums['pix_maquininha_maquininha'] + $sums['pix_maquininha_pix'];
    $pixMaquininha = $hasGeneric ? $generic['pix_maquininha'] : (($sums['maquininhas_total_qtd'] + $sums['pix_total_qtd']) > 0 ? $pixMaquininhaAuto : (float) $closing['pix_maquininha_total']);
    $sangria = $hasGeneric ? $generic['sangria'] : ($sums['sangrias_total_qtd'] > 0 ? $sums['sangria_total'] : (float) $closing['sangria_total']);
    $ajustes = $hasGeneric ? $generic['outros'] : (float) $closing['ajustes'];
    $pixManual = $closing['pix_correto_manual'] === null ? null : (float) $closing['pix_correto_manual'];
    $pixCorreto = $pixManual !== null ? $pixManual : $pixBanco + $pixMaquininha + $sums['pix_ajuste_total'];

    $total = $hasGeneric
        ? round($generic['total'], 2)
        : round(
            (float) $closing['caixa_fisico'] +
            $cartao +
            $pixCorreto +
            $sangria +
            (float) $closing['retirada_caixa'] +
            (float) $closing['ajustes'],
            2
        );
    $diff = round($total - (float) $closing['abertura_sistema'], 2);

    $stmt = db()->prepare(
        'UPDATE financeiro_fechamentos
         SET caixa_fisico = ?, cartao_total = ?, pix_banco_total = ?, pix_maquininha_total = ?, pix_correto_total = ?,
             sangria_total = ?, ajustes = ?, total_conferido = ?, sobra_falta = ?
         WHERE id = ?'
    );
    $stmt->execute(array($caixaFisico, $cartao, $pixBanco, $pixMaquininha, $pixCorreto, $sangria, $ajustes, $total, $diff, $closingId));

    return financeiro_fetch_by_id($closingId) ?: $closing;
}

function financeiro_status_label(string $status): string
{
    $labels = array(
        'aberto' => 'Aberto',
        'conferencia' => 'Em conferencia',
        'fechado' => 'Fechado',
        'divergente' => 'Divergente',
        'sem_movimento' => 'Sem movimento',
    );

    return $labels[$status] ?? ucfirst($status);
}

function financeiro_diff_class(float $value): string
{
    if ($value > 0.009) {
        return 'is-positive';
    }

    if ($value < -0.009) {
        return 'is-negative';
    }

    return 'is-zero';
}

function financeiro_assert_justification(float $difference, string $justification): void
{
    if (abs($difference) > 0.009 && trim($justification) === '') {
        throw new RuntimeException('Informe uma justificativa quando houver sobra ou falta.');
    }
}

function financeiro_update_manual_closing(int $closingId, array $data): array
{
    $before = financeiro_fetch_by_id($closingId);

    if (!$before) {
        throw new RuntimeException('Fechamento nao encontrado.');
    }

    if (financeiro_is_locked($before)) {
        throw new RuntimeException('Este dia esta fechado. Reabra com senha para editar.');
    }

    if ($data['pix_correto_manual'] !== null && trim((string) $data['pix_correto_justificativa']) === '') {
        throw new RuntimeException('Informe a justificativa quando preencher PIX correto manual.');
    }

    $faturamentoDia = (float) ($data['faturamento_dia'] ?? 0);
    $faturamentoAnterior = (float) ($before['faturamento_dia'] ?? 0);
    $faturamentoRegistradoEm = $before['faturamento_registrado_em'] ?? null;

    if ($faturamentoDia <= 0.009) {
        $faturamentoRegistradoEm = null;
    } elseif (abs($faturamentoDia - $faturamentoAnterior) > 0.009 || empty($faturamentoRegistradoEm)) {
        $faturamentoRegistradoEm = date('Y-m-d H:i:s');
    }

    $stmt = db()->prepare(
        "UPDATE financeiro_fechamentos
         SET responsavel_id = ?, responsavel_texto = ?, status = 'conferencia', caixa_fisico = ?, cartao_total = ?,
             pix_banco_total = ?, pix_maquininha_total = ?, pix_correto_manual = ?,
             pix_correto_justificativa = ?, sangria_total = ?, retirada_caixa = ?,
             abertura_sistema = ?, faturamento_dia = ?, faturamento_registrado_em = ?, ajustes = ?, justificativa = ?, observacao = ?
         WHERE id = ?"
    );
    $stmt->execute(array(
        $data['responsavel_id'],
        trim((string) ($data['responsavel_texto'] ?? '')),
        $data['caixa_fisico'],
        $data['cartao_total'],
        $data['pix_banco_total'],
        $data['pix_maquininha_total'],
        $data['pix_correto_manual'],
        $data['pix_correto_justificativa'],
        $data['sangria_total'],
        $data['retirada_caixa'],
        $data['abertura_sistema'],
        $faturamentoDia,
        $faturamentoRegistradoEm,
        $data['ajustes'],
        $data['justificativa'],
        $data['observacao'],
        $closingId,
    ));

    $after = financeiro_recalculate($closingId);
    financeiro_audit('alterar_fechamento', 'financeiro_fechamentos', $closingId, $before, $after);

    return $after;
}

function financeiro_month_days(int $month, int $year): array
{
    $month = max(1, min(12, $month));
    $year = max(2020, min(2100, $year));
    $start = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
    $days = array();

    for ($day = $start; $day->format('m') === $start->format('m'); $day = $day->modify('+1 day')) {
        $days[] = $day->format('Y-m-d');
    }

    return $days;
}

function financeiro_month_closings(int $month, int $year): array
{
    financeiro_ensure_schema();

    $start = sprintf('%04d-%02d-01', $year, $month);
    $end = date('Y-m-t', strtotime($start));
    $stmt = db()->prepare(
        'SELECT f.*,
                COALESCE(NULLIF(f.responsavel_texto, ""), a.nome, "") AS responsavel_nome,
                u.username AS fechado_por_nome
         FROM financeiro_fechamentos f
         LEFT JOIN wf_atendentes a ON a.id = f.responsavel_id
         LEFT JOIN wf_users u ON u.id = f.fechado_por
         WHERE f.data_fechamento BETWEEN ? AND ?
         ORDER BY f.data_fechamento ASC'
    );
    $stmt->execute(array($start, $end));
    $rows = array();

    foreach ($stmt->fetchAll() as $row) {
        $rows[$row['data_fechamento']] = $row;
    }

    return $rows;
}

function financeiro_fetch_entries(string $table, int $closingId): array
{
    $allowed = array(
        'financeiro_sangrias' => 'id ASC',
        'financeiro_maquininhas' => 'id ASC',
        'financeiro_pix' => 'id ASC',
    );

    if (!isset($allowed[$table])) {
        return array();
    }

    $stmt = db()->prepare("SELECT * FROM {$table} WHERE fechamento_id = ? ORDER BY {$allowed[$table]}");
    $stmt->execute(array($closingId));

    return $stmt->fetchAll();
}

function financeiro_fetch_entry(string $table, int $id): ?array
{
    $allowed = array(
        'financeiro_sangrias',
        'financeiro_maquininhas',
        'financeiro_pix',
    );

    if (!in_array($table, $allowed, true)) {
        throw new RuntimeException('Tabela financeira invalida.');
    }

    $stmt = db()->prepare("SELECT * FROM `$table` WHERE id = ? LIMIT 1");
    $stmt->execute(array($id));
    $row = $stmt->fetch();

    return $row ?: null;
}

function financeiro_recent(string $table, int $limit = 12): array
{
    $allowed = array(
        'financeiro_sangrias' => 'data DESC, id DESC',
        'financeiro_maquininhas' => 'data DESC, id DESC',
        'financeiro_pix' => 'data DESC, id DESC',
    );

    if (!isset($allowed[$table])) {
        return array();
    }

    $limit = max(1, min(50, $limit));

    return db()->query("SELECT * FROM {$table} ORDER BY {$allowed[$table]} LIMIT {$limit}")->fetchAll();
}

function financeiro_recent_audit(int $limit = 80): array
{
    financeiro_ensure_schema();
    $limit = max(1, min(200, $limit));
    $stmt = db()->query(
        "SELECT a.*, u.username
         FROM financeiro_auditoria a
         LEFT JOIN wf_users u ON u.id = a.usuario_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT " . $limit
    );

    return $stmt->fetchAll();
}

function financeiro_month_totals(array $closings): array
{
    $totals = array(
        'caixa_fisico' => 0.0,
        'cartao_total' => 0.0,
        'pix_banco_total' => 0.0,
        'pix_maquininha_total' => 0.0,
        'pix_correto_total' => 0.0,
        'sangria_total' => 0.0,
        'retirada_caixa' => 0.0,
        'abertura_sistema' => 0.0,
        'ajustes' => 0.0,
        'total_conferido' => 0.0,
        'sobra_falta' => 0.0,
        'divergencias' => 0,
        'fechados' => 0,
    );

    foreach ($closings as $row) {
        foreach (array('caixa_fisico', 'cartao_total', 'pix_banco_total', 'pix_maquininha_total', 'pix_correto_total', 'sangria_total', 'retirada_caixa', 'abertura_sistema', 'ajustes', 'total_conferido', 'sobra_falta') as $key) {
            $totals[$key] += (float) ($row[$key] ?? 0);
        }

        if (($row['status'] ?? '') === 'divergente') {
            $totals['divergencias']++;
        }

        if (in_array((string) ($row['status'] ?? ''), array('fechado', 'divergente'), true)) {
            $totals['fechados']++;
        }
    }

    $totals['media_sobra_falta'] = count($closings) > 0 ? $totals['sobra_falta'] / count($closings) : 0.0;

    return $totals;
}

function financeiro_parse_csv_rows(string $path): array
{
    $content = file_get_contents($path);

    if ($content === false) {
        throw new RuntimeException('Nao foi possivel ler o CSV.');
    }

    $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
    $lines = preg_split('/\r\n|\r|\n/', trim((string) $content));

    if (!$lines || count($lines) < 2) {
        return array();
    }

    $delimiter = substr_count($lines[0], ';') >= substr_count($lines[0], ',') ? ';' : ',';
    $headers = array_map('financeiro_normalize_header', str_getcsv(array_shift($lines), $delimiter));
    $rows = array();

    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }

        $values = str_getcsv($line, $delimiter);
        $row = array();

        foreach ($headers as $index => $header) {
            $row[$header] = $values[$index] ?? '';
        }

        $rows[] = $row;
    }

    return $rows;
}

function financeiro_normalize_header(string $header): string
{
    $header = strtoupper(trim($header));
    $converted = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $header) : false;

    if ($converted !== false) {
        $header = $converted;
    }

    $header = strtr($header, array(
        'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ã' => 'A',
        'É' => 'E', 'Ê' => 'E',
        'Í' => 'I',
        'Ó' => 'O', 'Ô' => 'O', 'Õ' => 'O',
        'Ú' => 'U',
        'Ç' => 'C',
    ));
    $header = preg_replace('/[^A-Z0-9]+/', '_', $header);

    return trim((string) $header, '_');
}

function financeiro_csv_value(array $row, array $keys, string $default = ''): string
{
    foreach ($keys as $key) {
        if (isset($row[$key]) && trim((string) $row[$key]) !== '') {
            return (string) $row[$key];
        }
    }

    return $default;
}

function financeiro_import_csv(string $path, bool $updateExisting): int
{
    $rows = financeiro_parse_csv_rows($path);
    $imported = 0;

    foreach ($rows as $row) {
        $dateRaw = financeiro_csv_value($row, array('DATA'));
        $date = financeiro_valid_date($dateRaw, '');

        if ($date === '') {
            continue;
        }

        $existing = financeiro_fetch_by_date($date);

        if ($existing && !$updateExisting) {
            continue;
        }

        $closing = financeiro_get_or_create_closing($date);

        if (financeiro_is_locked($closing)) {
            continue;
        }

        $data = array(
            'responsavel_id' => null,
            'caixa_fisico' => money_to_decimal(financeiro_csv_value($row, array('APORTE_CAIXA_FECHA', 'CAIXA_FISICO'), '0')),
            'cartao_total' => money_to_decimal(financeiro_csv_value($row, array('CARTAO_C_D', 'CARTAO_CD'), '0')),
            'pix_banco_total' => money_to_decimal(financeiro_csv_value($row, array('PIX_BANCO', 'PIX_BANCO_COMPROVANTE'), '0')),
            'pix_maquininha_total' => money_to_decimal(financeiro_csv_value($row, array('PIX_MAQ', 'PIX_MAQUININHA'), '0')),
            'pix_correto_manual' => financeiro_csv_value($row, array('PIX_CORRETO'), '') === '' ? null : money_to_decimal(financeiro_csv_value($row, array('PIX_CORRETO'))),
            'pix_correto_justificativa' => '',
            'sangria_total' => money_to_decimal(financeiro_csv_value($row, array('SANGRIA'), '0')),
            'retirada_caixa' => money_to_decimal(financeiro_csv_value($row, array('RETIRADA_CAIXA'), '0')),
            'abertura_sistema' => money_to_decimal(financeiro_csv_value($row, array('ABERTURA_SISTEMA'), '0')),
            'ajustes' => 0.0,
            'justificativa' => financeiro_csv_value($row, array('JUSTIFICATIVA'), ''),
            'observacao' => 'Importado de CSV.',
        );

        try {
            db()->beginTransaction();
            financeiro_update_manual_closing((int) $closing['id'], $data);
            db()->commit();
            $imported++;
        } catch (Throwable $error) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }
            // Linhas divergentes sem justificativa continuam fora para revisao manual.
        }
    }

    financeiro_audit('importar_csv', 'financeiro_fechamentos', null, null, array('linhas_importadas' => $imported));

    return $imported;
}

try {
    financeiro_ensure_schema();
} catch (Throwable $error) {
    error_log('Financeiro schema update failed: ' . $error->getMessage());
}
