<?php
declare(strict_types=1);

define('COTACAO_APP_NAME', 'Wimifarma Cotacao');
define('COTACAO_VERSION', '20260512b');

function cotacao_align_icon(string $align): string
{
    $paths = array(
        'left' => '<path d="M4 6h16M4 10h11M4 14h16M4 18h9"/>',
        'center' => '<path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>',
        'right' => '<path d="M4 6h16M9 10h11M4 14h16M11 18h9"/>',
    );

    $path = $paths[$align] ?? $paths['left'];

    return '<svg class="align-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' . $path . '</svg>';
}

function cotacao_schema_statements(): array
{
    return array(
        "CREATE TABLE IF NOT EXISTS cotacao_blocos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            nome VARCHAR(120) NOT NULL,
            slug VARCHAR(140) NOT NULL,
            descricao VARCHAR(255) NULL,
            origem VARCHAR(120) NULL,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            ordem INT NOT NULL DEFAULT 100,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cotacao_bloco_slug (slug),
            KEY idx_cotacao_bloco_ativo (ativo, ordem)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_fornecedores (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            nome VARCHAR(120) NOT NULL,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            ordem INT NOT NULL DEFAULT 100,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cotacao_fornecedor_bloco_nome (bloco_id, nome),
            KEY idx_cotacao_fornecedor_bloco (bloco_id, ativo, ordem)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_categorias (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            nome VARCHAR(100) NOT NULL,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            ordem INT NOT NULL DEFAULT 100,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cotacao_categoria_bloco_nome (bloco_id, nome),
            KEY idx_cotacao_categoria_bloco (bloco_id, ativo, ordem)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_itens (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            ean VARCHAR(40) NULL,
            produto VARCHAR(220) NOT NULL,
            quantidade DECIMAL(10,2) NOT NULL DEFAULT 1.00,
            unidade VARCHAR(20) NOT NULL DEFAULT 'un',
            categoria VARCHAR(80) NOT NULL DEFAULT 'geral',
            cor VARCHAR(20) NOT NULL DEFAULT '',
            cores LONGTEXT NULL,
            estilos LONGTEXT NULL,
            ordem INT NOT NULL DEFAULT 0,
            linha_vazia TINYINT(1) NOT NULL DEFAULT 0,
            prioridade ENUM('normal', 'encomenda', 'urgente', 'reposicao', 'outro') NOT NULL DEFAULT 'normal',
            status ENUM('aberta', 'cotada', 'pedido', 'cancelada') NOT NULL DEFAULT 'aberta',
            observacao TEXT NULL,
            encomenda_registrada_em DATETIME NULL DEFAULT NULL,
            vencedor_fornecedor_id INT UNSIGNED NULL,
            vencedor_preco DECIMAL(10,2) NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_cotacao_item_bloco (bloco_id, status, prioridade),
            KEY idx_cotacao_item_ordem (bloco_id, status, ordem, id),
            KEY idx_cotacao_item_produto (produto),
            KEY idx_cotacao_item_vencedor (vencedor_fornecedor_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_precos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            item_id INT UNSIGNED NOT NULL,
            fornecedor_id INT UNSIGNED NOT NULL,
            preco DECIMAL(10,2) NULL,
            prazo VARCHAR(80) NULL,
            observacao VARCHAR(255) NULL,
            updated_by INT UNSIGNED NULL,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cotacao_preco_item_fornecedor (item_id, fornecedor_id),
            KEY idx_cotacao_preco_fornecedor (fornecedor_id),
            KEY idx_cotacao_preco_preco (preco)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_auditoria (
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
            KEY idx_cotacao_audit_user (usuario_id),
            KEY idx_cotacao_audit_table (tabela_afetada, registro_id),
            KEY idx_cotacao_audit_action (acao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_regras_formatacao (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            coluna_chave VARCHAR(80) NOT NULL,
            coluna_indice INT NOT NULL DEFAULT 0,
            operador ENUM('contains', 'not_contains', 'equals', 'starts_with', 'ends_with', 'empty', 'not_empty') NOT NULL DEFAULT 'contains',
            termo VARCHAR(180) NOT NULL DEFAULT '',
            cor_fundo VARCHAR(20) NOT NULL DEFAULT '',
            cor_texto VARCHAR(20) NOT NULL DEFAULT '',
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            ordem INT NOT NULL DEFAULT 100,
            created_by INT UNSIGNED NULL,
            updated_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_cotacao_regra_bloco (bloco_id, ativo, ordem),
            KEY idx_cotacao_regra_coluna (bloco_id, coluna_chave, ativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_presencas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            client_id VARCHAR(80) NOT NULL,
            usuario_id INT UNSIGNED NULL,
            usuario_nome VARCHAR(120) NOT NULL DEFAULT '',
            cor VARCHAR(20) NOT NULL DEFAULT '#2563eb',
            item_id INT UNSIGNED NULL,
            row_order INT NULL,
            col_key VARCHAR(80) NOT NULL DEFAULT '',
            col_label VARCHAR(120) NOT NULL DEFAULT '',
            filtro_categoria VARCHAR(255) NOT NULL DEFAULT '',
            filtro_cor VARCHAR(20) NOT NULL DEFAULT '',
            filtro_vencedor VARCHAR(40) NOT NULL DEFAULT '',
            editando TINYINT(1) NOT NULL DEFAULT 0,
            ultima_atividade DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cotacao_presenca_client (bloco_id, client_id),
            KEY idx_cotacao_presenca_bloco (bloco_id, ultima_atividade),
            KEY idx_cotacao_presenca_item (bloco_id, item_id, col_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_sync_estado (
            bloco_id INT UNSIGNED NOT NULL,
            versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            dados_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            filtro_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            estrutura_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            filtro_categoria VARCHAR(255) NOT NULL DEFAULT '',
            filtro_cor VARCHAR(20) NOT NULL DEFAULT '',
            filtro_vencedor VARCHAR(40) NOT NULL DEFAULT '',
            updated_by INT UNSIGNED NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (bloco_id),
            KEY idx_cotacao_sync_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS cotacao_eventos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            bloco_id INT UNSIGNED NOT NULL,
            tipo VARCHAR(60) NOT NULL DEFAULT 'dados',
            escopo ENUM('dados', 'filtro', 'estrutura') NOT NULL DEFAULT 'dados',
            item_id INT UNSIGNED NULL,
            fornecedor_id INT UNSIGNED NULL,
            campo VARCHAR(80) NULL,
            valor_anterior LONGTEXT NULL,
            valor_novo LONGTEXT NULL,
            versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            dados_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            filtro_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            estrutura_versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
            client_id VARCHAR(80) NOT NULL DEFAULT '',
            usuario_id INT UNSIGNED NULL,
            payload_json LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_cotacao_eventos_bloco_id (bloco_id, id),
            KEY idx_cotacao_eventos_escopo (bloco_id, escopo, id),
            KEY idx_cotacao_eventos_item (item_id),
            KEY idx_cotacao_eventos_usuario (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "INSERT INTO cotacao_blocos (nome, slug, descricao, origem, ordem) VALUES
            ('Cotacao Geral', 'cotacao-geral', 'Medicamentos, produtos e pedidos gerais.', 'sistema', 10),
            ('Medicamentos', 'medicamentos', 'Cotacoes por EAN, produto, laboratorio e distribuidora.', 'sistema', 20),
            ('Encomenda', 'encomenda', 'Itens encomendados por cliente ou balcao.', 'sistema', 30),
            ('Urgente', 'urgente', 'Cotacoes que precisam de decisao rapida.', 'sistema', 40),
            ('2025 - DEZEMBRO', '2025-dezembro', 'Bloco criado a partir da aba do arquivo enviado.', 'CAIXA FINANCEIRO.xlsx', 80),
            ('2026 - FEV - DEZ', '2026-fev-dez', 'Bloco criado a partir da aba do arquivo enviado.', 'CAIXA FINANCEIRO.xlsx', 90)
         ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao), origem = VALUES(origem), ordem = VALUES(ordem), ativo = 1"
    );
}

function cotacao_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    foreach (cotacao_schema_statements() as $statement) {
        db()->exec($statement);
    }

    cotacao_seed_default_suppliers();
    cotacao_ensure_item_visual_columns();
    cotacao_ensure_sync_rows();
    cotacao_disable_legacy_category_trigger_rules();
    cotacao_disable_default_category_trigger_rules();
    cotacao_sync_categories_from_items();
    $done = true;
}

function cotacao_disable_legacy_category_trigger_rules(): void
{
    $stmt = db()->prepare(
        "SELECT id, bloco_id, coluna_chave, coluna_indice, operador, termo, cor_fundo, cor_texto, ativo, ordem
         FROM cotacao_regras_formatacao
         WHERE ativo = 1
           AND coluna_chave = 'categoria'
           AND operador IN ('contains', 'equals', 'starts_with', 'ends_with')
           AND LOWER(TRIM(termo)) IN ('urgente', 'urgencia', 'urgência', 'encomenda')
         ORDER BY bloco_id ASC, id ASC"
    );
    $stmt->execute();
    $rules = $stmt->fetchAll() ?: array();

    if (!$rules) {
        return;
    }

    $ids = array_values(array_unique(array_map(static function (array $rule): int {
        return (int) $rule['id'];
    }, $rules)));

    if (!$ids) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $params = array_merge(array($_SESSION['user_id'] ?? null), $ids);
    $update = db()->prepare(
        "UPDATE cotacao_regras_formatacao
         SET ativo = 0, updated_by = ?, updated_at = NOW()
         WHERE id IN ($placeholders)"
    );
    $update->execute($params);

    $rulesByBlock = array();
    foreach ($rules as $rule) {
        $blockId = (int) ($rule['bloco_id'] ?? 0);
        if ($blockId <= 0) {
            continue;
        }
        $rulesByBlock[$blockId][] = $rule;
    }

    foreach ($rulesByBlock as $blockId => $disabledRules) {
        $state = cotacao_sync_touch((int) $blockId, 'dados');
        cotacao_record_event(
            (int) $blockId,
            'regras_atualizadas',
            'dados',
            array(
                'rules' => cotacao_conditional_rules((int) $blockId),
                'legacy_disabled_rule_ids' => array_map(static function (array $rule): int {
                    return (int) $rule['id'];
                }, $disabledRules),
            ),
            null,
            null,
            null,
            $disabledRules,
            cotacao_conditional_rules((int) $blockId),
            $state
        );
    }
}

function cotacao_disable_default_category_trigger_rules(): void
{
    $stmt = db()->prepare(
        "SELECT id, bloco_id, coluna_chave, coluna_indice, operador, termo, cor_fundo, cor_texto, ativo, ordem
         FROM cotacao_regras_formatacao
         WHERE ativo = 1
           AND coluna_chave = 'categoria'
           AND operador IN ('contains', 'equals', 'starts_with', 'ends_with')
           AND LOWER(TRIM(termo)) = 'geral'
         ORDER BY bloco_id ASC, id ASC"
    );
    $stmt->execute();
    $rules = $stmt->fetchAll() ?: array();

    if (!$rules) {
        return;
    }

    $ids = array_values(array_unique(array_map(static function (array $rule): int {
        return (int) $rule['id'];
    }, $rules)));

    if (!$ids) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $params = array_merge(array($_SESSION['user_id'] ?? null), $ids);
    $update = db()->prepare(
        "UPDATE cotacao_regras_formatacao
         SET ativo = 0, updated_by = ?, updated_at = NOW()
         WHERE id IN ($placeholders)"
    );
    $update->execute($params);

    $rulesByBlock = array();
    foreach ($rules as $rule) {
        $blockId = (int) ($rule['bloco_id'] ?? 0);
        if ($blockId <= 0) {
            continue;
        }
        $rulesByBlock[$blockId][] = $rule;
    }

    foreach ($rulesByBlock as $blockId => $disabledRules) {
        $state = cotacao_sync_touch((int) $blockId, 'dados');
        cotacao_record_event(
            (int) $blockId,
            'regras_atualizadas',
            'dados',
            array(
                'rules' => cotacao_conditional_rules((int) $blockId),
                'default_disabled_rule_ids' => array_map(static function (array $rule): int {
                    return (int) $rule['id'];
                }, $disabledRules),
            ),
            null,
            null,
            null,
            $disabledRules,
            cotacao_conditional_rules((int) $blockId),
            $state
        );
    }
}

function cotacao_ensure_item_visual_columns(): void
{
    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'cor')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN cor VARCHAR(20) NOT NULL DEFAULT '' AFTER categoria");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'cores')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN cores LONGTEXT NULL AFTER cor");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'estilos')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN estilos LONGTEXT NULL AFTER cores");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'versoes')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN versoes LONGTEXT NULL AFTER estilos");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_precos', 'versao')) {
        db()->exec("ALTER TABLE cotacao_precos ADD COLUMN versao BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER observacao");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'encomenda_registrada_em')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN encomenda_registrada_em DATETIME NULL DEFAULT NULL AFTER observacao");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'ordem')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN ordem INT NOT NULL DEFAULT 0 AFTER estilos");
    }

    if (function_exists('schema_column_exists') && !schema_column_exists('cotacao_itens', 'linha_vazia')) {
        db()->exec("ALTER TABLE cotacao_itens ADD COLUMN linha_vazia TINYINT(1) NOT NULL DEFAULT 0 AFTER ordem");
    }

    if (function_exists('schema_column_exists') && schema_column_exists('cotacao_itens', 'ordem')) {
        $needsOrderBackfill = (int) db()->query('SELECT COUNT(*) FROM cotacao_itens WHERE ordem IS NULL OR ordem = 0')->fetchColumn();
        if ($needsOrderBackfill > 0) {
            db()->exec('UPDATE cotacao_itens SET ordem = id * 10 WHERE ordem IS NULL OR ordem = 0');
        }
    }

    if (cotacao_schema_index_missing('cotacao_itens', 'idx_cotacao_item_ordem')) {
        db()->exec('CREATE INDEX idx_cotacao_item_ordem ON cotacao_itens (bloco_id, status, ordem, id)');
    }
}

function cotacao_schema_index_missing(string $table, string $index): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?'
    );
    $stmt->execute(array($table, $index));

    return (int) $stmt->fetchColumn() === 0;
}

function cotacao_ensure_sync_rows(?int $blockId = null): void
{
    if ($blockId !== null && $blockId > 0) {
        $stmt = db()->prepare(
            'INSERT IGNORE INTO cotacao_sync_estado (bloco_id, updated_by)
             VALUES (?, ?)'
        );
        $stmt->execute(array($blockId, $_SESSION['user_id'] ?? null));
        return;
    }

    db()->exec(
        'INSERT IGNORE INTO cotacao_sync_estado (bloco_id)
         SELECT id FROM cotacao_blocos WHERE ativo = 1'
    );
}

function cotacao_seed_default_suppliers(): void
{
    $blocks = db()->query('SELECT id FROM cotacao_blocos WHERE ativo = 1')->fetchAll();
    $stmt = db()->prepare(
        'INSERT INTO cotacao_fornecedores (bloco_id, nome, ordem)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nome = nome'
    );

    foreach ($blocks as $block) {
        for ($index = 1; $index <= 6; $index++) {
            $stmt->execute(array((int) $block['id'], 'Distribuidora ' . $index, $index * 10));
        }
    }
}

function cotacao_seed_default_categories(): void
{
    $blocks = db()->query('SELECT id FROM cotacao_blocos WHERE ativo = 1')->fetchAll();
    $categories = array('geral', 'medicamentos');
    $stmt = db()->prepare(
        'INSERT INTO cotacao_categorias (bloco_id, nome, ordem)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nome = nome'
    );

    foreach ($blocks as $block) {
        foreach ($categories as $index => $category) {
            $stmt->execute(array((int) $block['id'], $category, ($index + 1) * 10));
        }
    }
}

function cotacao_color_options(): array
{
    return array(
        '' => 'Sem cor',
        '#b91c1c' => 'Vermelho forte',
        '#ef4444' => 'Vermelho vivo',
        '#f87171' => 'Vermelho medio',
        '#fecaca' => 'Vermelho claro',
        '#c2410c' => 'Laranja forte',
        '#f97316' => 'Laranja vivo',
        '#fb923c' => 'Laranja medio',
        '#fed7aa' => 'Laranja claro',
        '#a16207' => 'Amarelo forte',
        '#eab308' => 'Amarelo vivo',
        '#facc15' => 'Amarelo medio',
        '#fde68a' => 'Amarelo claro',
        '#15803d' => 'Verde forte',
        '#22c55e' => 'Verde vivo',
        '#4ade80' => 'Verde medio',
        '#bbf7d0' => 'Verde claro',
        '#0369a1' => 'Azul petroleo forte',
        '#0ea5e9' => 'Azul petroleo vivo',
        '#38bdf8' => 'Azul petroleo medio',
        '#bae6fd' => 'Azul petroleo claro',
        '#1d4ed8' => 'Azul forte',
        '#3b82f6' => 'Azul vivo',
        '#60a5fa' => 'Azul medio',
        '#bfdbfe' => 'Azul claro',
        '#6d28d9' => 'Roxo forte',
        '#8b5cf6' => 'Roxo vivo',
        '#a78bfa' => 'Roxo medio',
        '#ddd6fe' => 'Roxo claro',
        '#be185d' => 'Rosa forte',
        '#ec4899' => 'Rosa vivo',
        '#f472b6' => 'Rosa medio',
        '#fbcfe8' => 'Rosa claro',
        '#374151' => 'Cinza forte',
        '#6b7280' => 'Cinza vivo',
        '#9ca3af' => 'Cinza medio',
        '#e5e7eb' => 'Cinza claro',
    );
}

function cotacao_legacy_color_options(): array
{
    return array(
        '#991b1b' => 'Vermelho antigo forte',
        '#fca5a5' => 'Vermelho antigo medio',
        '#fee2e2' => 'Vermelho antigo claro',
        '#9a3412' => 'Laranja antigo forte',
        '#fdba74' => 'Laranja antigo medio',
        '#ffedd5' => 'Laranja antigo claro',
        '#854d0e' => 'Amarelo antigo forte',
        '#fef3c7' => 'Amarelo antigo claro',
        '#166534' => 'Verde antigo forte',
        '#86efac' => 'Verde antigo medio',
        '#dcfce7' => 'Verde antigo claro',
        '#1e3a8a' => 'Azul antigo forte',
        '#2563eb' => 'Azul antigo vivo',
        '#93c5fd' => 'Azul antigo medio',
        '#dbeafe' => 'Azul antigo claro',
        '#581c87' => 'Roxo antigo forte',
        '#a855f7' => 'Roxo antigo vivo',
        '#c4b5fd' => 'Roxo antigo medio',
        '#ede9fe' => 'Roxo antigo claro',
        '#9d174d' => 'Rosa antigo forte',
        '#f9a8d4' => 'Rosa antigo medio',
        '#fce7f3' => 'Rosa antigo claro',
        '#111827' => 'Cinza antigo forte',
        '#d1d5db' => 'Cinza antigo medio',
        '#f3f4f6' => 'Cinza antigo claro',
        '#fce8e6' => 'Vermelho claro',
        '#fdd663' => 'Amarelo',
        '#fef7e0' => 'Amarelo claro',
        '#e6f4ea' => 'Verde claro',
        '#b7e1cd' => 'Verde',
        '#d2e3fc' => 'Azul',
        '#e8f0fe' => 'Azul claro',
        '#f3e8fd' => 'Roxo claro',
        '#eadcff' => 'Lilás',
        '#f8bbd0' => 'Rosa',
        '#f4c7c3' => 'Vermelho',
        '#fce4d6' => 'Laranja claro',
        '#f1f3f4' => 'Cinza claro',
    );
}

function cotacao_allowed_color_options(): array
{
    return cotacao_color_options() + cotacao_legacy_color_options();
}

function cotacao_conditional_operator_options(): array
{
    return array(
        'contains' => 'Texto contem',
        'not_contains' => 'Texto nao contem',
        'equals' => 'Texto e exatamente',
        'starts_with' => 'Texto comeca com',
        'ends_with' => 'Texto termina com',
        'empty' => 'Celula vazia',
        'not_empty' => 'Celula preenchida',
    );
}

function cotacao_conditional_text_color(string $color): string
{
    if (!preg_match('/^#([0-9a-f]{6})$/i', $color, $match)) {
        return '';
    }

    $hex = $match[1];
    $red = hexdec(substr($hex, 0, 2));
    $green = hexdec(substr($hex, 2, 2));
    $blue = hexdec(substr($hex, 4, 2));
    $luminance = ($red * 299 + $green * 587 + $blue * 114) / 1000;

    return $luminance < 145 ? '#ffffff' : '#202124';
}

function cotacao_text_slice(string $text, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return (string) mb_substr($text, $start, $length, 'UTF-8');
    }

    return substr($text, $start, $length);
}

function cotacao_conditional_column_options(int $blockId): array
{
    $options = array(
        'ean' => array('key' => 'ean', 'index' => 0, 'label' => 'EAN'),
        'produto' => array('key' => 'produto', 'index' => 1, 'label' => 'Produto'),
        'quantidade' => array('key' => 'quantidade', 'index' => 2, 'label' => 'Quantidade'),
        'categoria' => array('key' => 'categoria', 'index' => 3, 'label' => 'Categoria'),
    );

    $suppliers = cotacao_suppliers($blockId, true);

    foreach ($suppliers as $supplierIndex => $supplier) {
        $key = 'supplier-' . (int) $supplier['id'];
        $options[$key] = array(
            'key' => $key,
            'index' => $supplierIndex + 4,
            'label' => (string) $supplier['nome'],
        );
    }

    $options['vencedor'] = array(
        'key' => 'vencedor',
        'index' => count($suppliers) + 4,
        'label' => 'Quem ganhou',
    );

    return $options;
}

function cotacao_conditional_column_label(int $blockId, string $columnKey): string
{
    $options = cotacao_conditional_column_options($blockId);

    return (string) ($options[$columnKey]['label'] ?? $columnKey);
}

function cotacao_conditional_rules(int $blockId): array
{
    $stmt = db()->prepare(
        'SELECT *
         FROM cotacao_regras_formatacao
         WHERE bloco_id = ?
           AND ativo = 1
         ORDER BY ordem ASC, id ASC'
    );
    $stmt->execute(array($blockId));
    $rules = array();

    foreach ($stmt->fetchAll() ?: array() as $rule) {
        $rules[] = cotacao_conditional_rule_public($blockId, $rule);
    }

    return $rules;
}

function cotacao_conditional_rule_public(int $blockId, array $rule): array
{
    $columnKey = (string) ($rule['coluna_chave'] ?? '');
    $background = cotacao_color_value((string) ($rule['cor_fundo'] ?? ''));
    $textColor = (string) ($rule['cor_texto'] ?? '');
    if ($textColor === '') {
        $textColor = cotacao_conditional_text_color($background);
    }

    return array(
        'id' => (int) ($rule['id'] ?? 0),
        'column_key' => $columnKey,
        'column_index' => (int) ($rule['coluna_indice'] ?? 0),
        'column_label' => cotacao_conditional_column_label($blockId, $columnKey),
        'operator' => (string) ($rule['operador'] ?? 'contains'),
        'term' => (string) ($rule['termo'] ?? ''),
        'background' => $background,
        'text_color' => $textColor,
    );
}

function cotacao_save_conditional_rule(int $blockId, array $data): array
{
    $id = max(0, (int) ($data['id'] ?? 0));
    $columns = cotacao_conditional_column_options($blockId);
    $operators = cotacao_conditional_operator_options();
    $columnKey = trim((string) ($data['coluna_chave'] ?? ''));
    $operator = trim((string) ($data['operador'] ?? 'contains'));
    $term = trim((string) ($data['termo'] ?? ''));
    $background = cotacao_color_value((string) ($data['cor_fundo'] ?? ''));

    if (!isset($columns[$columnKey])) {
        throw new InvalidArgumentException('Coluna invalida para condicao.');
    }

    if (!isset($operators[$operator])) {
        throw new InvalidArgumentException('Operador de condicao invalido.');
    }

    if (!in_array($operator, array('empty', 'not_empty'), true) && $term === '') {
        throw new InvalidArgumentException('Informe a palavra ou texto da condicao.');
    }

    if ($background === '') {
        throw new InvalidArgumentException('Escolha uma cor para a condicao.');
    }

    $term = cotacao_text_slice($term, 0, 180);
    $column = $columns[$columnKey];
    $textColor = cotacao_conditional_text_color($background);
    $before = null;

    if ($id > 0) {
        $stmt = db()->prepare('SELECT * FROM cotacao_regras_formatacao WHERE id = ? AND bloco_id = ? LIMIT 1');
        $stmt->execute(array($id, $blockId));
        $before = $stmt->fetch() ?: null;
        if (!$before) {
            throw new InvalidArgumentException('Regra de condicao nao encontrada.');
        }
    }

    if ($id > 0) {
        $stmt = db()->prepare(
            'UPDATE cotacao_regras_formatacao
             SET coluna_chave = ?, coluna_indice = ?, operador = ?, termo = ?, cor_fundo = ?, cor_texto = ?, ativo = 1, updated_by = ?, updated_at = NOW()
             WHERE id = ? AND bloco_id = ?'
        );
        $stmt->execute(array(
            $columnKey,
            (int) $column['index'],
            $operator,
            $term,
            $background,
            $textColor,
            $_SESSION['user_id'] ?? null,
            $id,
            $blockId,
        ));
    } else {
        $orderStmt = db()->prepare('SELECT COALESCE(MAX(ordem), 0) + 10 FROM cotacao_regras_formatacao WHERE bloco_id = ?');
        $orderStmt->execute(array($blockId));
        $order = (int) $orderStmt->fetchColumn();
        $stmt = db()->prepare(
            'INSERT INTO cotacao_regras_formatacao
                (bloco_id, coluna_chave, coluna_indice, operador, termo, cor_fundo, cor_texto, ativo, ordem, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
        );
        $stmt->execute(array(
            $blockId,
            $columnKey,
            (int) $column['index'],
            $operator,
            $term,
            $background,
            $textColor,
            $order,
            $_SESSION['user_id'] ?? null,
            $_SESSION['user_id'] ?? null,
        ));
        $id = (int) db()->lastInsertId();
    }

    $stmt = db()->prepare('SELECT * FROM cotacao_regras_formatacao WHERE id = ? AND bloco_id = ? LIMIT 1');
    $stmt->execute(array($id, $blockId));
    $saved = $stmt->fetch() ?: array();
    cotacao_audit($before ? 'atualizar_regra_condicional' : 'criar_regra_condicional', 'cotacao_regras_formatacao', $id, $before, $saved);
    $state = cotacao_sync_touch($blockId, 'dados');
    cotacao_record_event($blockId, 'regras_atualizadas', 'dados', array(
        'rules' => cotacao_conditional_rules($blockId),
    ), null, null, null, $before, $saved, $state);

    return cotacao_conditional_rule_public($blockId, $saved);
}

function cotacao_delete_conditional_rule(int $blockId, int $id): void
{
    $stmt = db()->prepare('SELECT * FROM cotacao_regras_formatacao WHERE id = ? AND bloco_id = ? AND ativo = 1 LIMIT 1');
    $stmt->execute(array($id, $blockId));
    $before = $stmt->fetch() ?: null;

    if (!$before) {
        throw new InvalidArgumentException('Regra de condicao nao encontrada.');
    }

    $stmt = db()->prepare(
        'UPDATE cotacao_regras_formatacao
         SET ativo = 0, updated_by = ?, updated_at = NOW()
         WHERE id = ? AND bloco_id = ?'
    );
    $stmt->execute(array($_SESSION['user_id'] ?? null, $id, $blockId));
    cotacao_audit('desativar_regra_condicional', 'cotacao_regras_formatacao', $id, $before, array('ativo' => 0));
    $state = cotacao_sync_touch($blockId, 'dados');
    cotacao_record_event($blockId, 'regras_atualizadas', 'dados', array(
        'rules' => cotacao_conditional_rules($blockId),
    ), null, null, null, $before, array('ativo' => 0), $state);
}

function cotacao_color_value(string $color): string
{
    $color = strtolower(trim($color));

    return array_key_exists($color, cotacao_allowed_color_options()) ? $color : '';
}

function cotacao_color_filter_value(string $color): string
{
    $color = strtolower(trim($color));

    if ($color === 'sem') {
        return 'sem';
    }

    return cotacao_color_value($color);
}

function cotacao_cell_colors_array($value): array
{
    $raw = is_array($value) ? $value : json_decode((string) $value, true);

    if (!is_array($raw)) {
        return array();
    }

    $colors = array();

    foreach ($raw as $key => $color) {
        $key = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $key);
        $color = cotacao_color_value((string) $color);

        if ($key !== '' && $color !== '') {
            $colors[$key] = $color;
        }
    }

    return $colors;
}

function cotacao_cell_colors_json($value): string
{
    $colors = cotacao_cell_colors_array($value);

    return $colors ? json_encode($colors, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
}

function cotacao_cell_color(array $colors, string $key): string
{
    return cotacao_color_value((string) ($colors[$key] ?? ''));
}

function cotacao_cell_styles_array($value): array
{
    $raw = is_array($value) ? $value : json_decode((string) $value, true);

    if (!is_array($raw)) {
        return array();
    }

    $styles = array();

    foreach ($raw as $key => $style) {
        $key = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $key);

        if ($key === '' || !is_array($style)) {
            continue;
        }

        $clean = array();

        if (!empty($style['bold'])) {
            $clean['bold'] = 1;
        }

        if (!empty($style['underline'])) {
            $clean['underline'] = 1;
        }

        $size = (int) ($style['size'] ?? 0);
        if ($size >= 8 && $size <= 36) {
            $clean['size'] = $size;
        }

        $align = (string) ($style['align'] ?? '');
        if (in_array($align, array('left', 'center', 'right'), true)) {
            $clean['align'] = $align;
        }

        if ($clean) {
            $styles[$key] = $clean;
        }
    }

    return $styles;
}

function cotacao_cell_styles_json($value): string
{
    $styles = cotacao_cell_styles_array($value);

    return $styles ? json_encode($styles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
}

function cotacao_cell_style_attrs(array $styles, string $key): string
{
    $style = $styles[$key] ?? array();
    $attrs = '';

    if (!empty($style['bold'])) {
        $attrs .= ' data-bold="1"';
    }

    if (!empty($style['underline'])) {
        $attrs .= ' data-underline="1"';
    }

    if (!empty($style['size'])) {
        $size = max(8, min(36, (int) $style['size']));
        $attrs .= ' data-font-size="' . htmlspecialchars((string) $size, ENT_QUOTES, 'UTF-8') . '"';
        $attrs .= ' style="--cell-font-size: ' . htmlspecialchars((string) $size, ENT_QUOTES, 'UTF-8') . 'px;"';
    }

    if (!empty($style['align'])) {
        $attrs .= ' data-align="' . htmlspecialchars((string) $style['align'], ENT_QUOTES, 'UTF-8') . '"';
    }

    return $attrs;
}

function cotacao_order_registered_label(?string $registeredAt): string
{
    $registeredAt = trim((string) $registeredAt);
    if ($registeredAt === '') {
        return '';
    }

    $timestamp = strtotime($registeredAt);
    if ($timestamp === false) {
        return $registeredAt;
    }

    return date('d/m/Y H:i', $timestamp);
}

function cotacao_order_registered_attrs(?string $registeredAt): string
{
    $registeredAt = trim((string) $registeredAt);
    $label = cotacao_order_registered_label($registeredAt);

    if ($registeredAt === '' || $label === '') {
        return '';
    }

    return ' data-order-registered-at="' . htmlspecialchars($registeredAt, ENT_QUOTES, 'UTF-8') . '"'
        . ' data-order-registered-label="' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '"';
}

function cotacao_sync_categories_from_items(): void
{
    db()->exec(
        "INSERT IGNORE INTO cotacao_categorias (bloco_id, nome, ordem)
         SELECT bloco_id, categoria, 100
         FROM cotacao_itens
         WHERE categoria IS NOT NULL
           AND categoria <> ''"
    );
}

function cotacao_slugify(string $value): string
{
    $value = trim($value);
    $converted = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) : false;

    if ($converted !== false) {
        $value = $converted;
    }

    $value = strtolower((string) preg_replace('/[^a-zA-Z0-9]+/', '-', $value));
    $value = trim($value, '-');

    return $value !== '' ? $value : 'bloco-' . date('YmdHis');
}

function cotacao_url(array $params = array(), string $fragment = ''): string
{
    $query = $params ? '?' . http_build_query($params) : '';
    $suffix = $fragment !== '' ? '#' . rawurlencode($fragment) : '';

    return '/cotacao/' . $query . $suffix;
}

function cotacao_redirect(array $params = array(), string $fragment = ''): void
{
    header('Location: ' . cotacao_url($params, $fragment));
    exit;
}

function cotacao_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /cotacao/login.php');
        exit;
    }

    return $user;
}

function cotacao_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Atualize a pagina e tente novamente.');
        cotacao_redirect();
    }
}

function cotacao_audit(string $action, string $table, ?int $recordId, $before, $after): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO cotacao_auditoria
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
        // Auditoria nao deve bloquear o trabalho no balcao.
    }
}

function cotacao_report_system_error(string $title, Throwable $error, array $context = array()): void
{
    try {
        $miauwIntelligence = __DIR__ . '/../miauw/miauw-intelligence.php';
        if (is_file($miauwIntelligence)) {
            require_once $miauwIntelligence;
        }

        if (function_exists('miauw_intelligence_report_system_error')) {
            miauw_intelligence_report_system_error('cotacao', $title, $error->getMessage(), $context);
        }
    } catch (Throwable $ignored) {
        error_log('Cotacao alert bridge failed: ' . $ignored->getMessage());
    }
}

function cotacao_public_error(Throwable $error): string
{
    $message = trim($error->getMessage());

    if ($error instanceof InvalidArgumentException && $message !== '') {
        return $message;
    }

    cotacao_report_system_error('Erro interno na cotacao', $error, array('origem' => 'cotacao_public_error'));

    return 'Nao consegui concluir na cotacao agora. Registrei alerta interno. Acione o Codex se repetir.';
}

function cotacao_sync_filter_payload(array $payload): array
{
    $category = trim((string) ($payload['categoria'] ?? $payload['category'] ?? ''));
    $category = substr($category, 0, 255);

    $color = cotacao_color_value((string) ($payload['cor'] ?? $payload['productColor'] ?? $payload['product_color'] ?? ''));

    $winner = trim((string) ($payload['vencedor'] ?? $payload['winner'] ?? ''));
    if ($winner !== '' && $winner !== 'sem' && !ctype_digit($winner)) {
        $winner = '';
    }

    return array(
        'categoria' => $category,
        'cor' => $color,
        'vencedor' => substr($winner, 0, 40),
    );
}

function cotacao_sync_last_event_id(int $blockId): int
{
    try {
        $stmt = db()->prepare('SELECT COALESCE(MAX(id), 0) FROM cotacao_eventos WHERE bloco_id = ?');
        $stmt->execute(array($blockId));

        return (int) $stmt->fetchColumn();
    } catch (Throwable $error) {
        return 0;
    }
}

function cotacao_event_client_id(): string
{
    $clientId = (string) ($_POST['client_id'] ?? ($_SERVER['HTTP_X_COTACAO_CLIENT_ID'] ?? ''));
    $clientId = preg_replace('/[^a-zA-Z0-9:_-]/', '', trim($clientId)) ?: '';

    return substr($clientId, 0, 80);
}

function cotacao_event_json($payload): string
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    return is_string($json) ? $json : '{}';
}

function cotacao_event_decode(?string $json): array
{
    if (!$json) {
        return array();
    }

    $payload = json_decode($json, true);

    return is_array($payload) ? $payload : array();
}

function cotacao_record_event(
    int $blockId,
    string $type,
    string $scope,
    array $payload,
    ?int $itemId = null,
    ?int $supplierId = null,
    ?string $field = null,
    $before = null,
    $after = null,
    ?array $state = null
): int {
    $scope = in_array($scope, array('dados', 'filtro', 'estrutura'), true) ? $scope : 'dados';
    $type = substr(preg_replace('/[^a-zA-Z0-9:_-]/', '', $type) ?: 'dados', 0, 60);
    $state = $state ?: cotacao_sync_state($blockId);

    $stmt = db()->prepare(
        'INSERT INTO cotacao_eventos
            (bloco_id, tipo, escopo, item_id, fornecedor_id, campo, valor_anterior, valor_novo,
             versao, dados_versao, filtro_versao, estrutura_versao, client_id, usuario_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array(
        $blockId,
        $type,
        $scope,
        $itemId && $itemId > 0 ? $itemId : null,
        $supplierId && $supplierId > 0 ? $supplierId : null,
        $field !== null ? substr($field, 0, 80) : null,
        $before === null ? null : cotacao_event_json($before),
        $after === null ? null : cotacao_event_json($after),
        (int) ($state['versao'] ?? 1),
        (int) ($state['dados_versao'] ?? 1),
        (int) ($state['filtro_versao'] ?? 1),
        (int) ($state['estrutura_versao'] ?? 1),
        cotacao_event_client_id(),
        $_SESSION['user_id'] ?? null,
        cotacao_event_json($payload),
    ));

    return (int) db()->lastInsertId();
}

function cotacao_event_public(array $event): array
{
    return array(
        'id' => (int) ($event['id'] ?? 0),
        'tipo' => (string) ($event['tipo'] ?? ''),
        'escopo' => (string) ($event['escopo'] ?? 'dados'),
        'item_id' => (int) ($event['item_id'] ?? 0),
        'fornecedor_id' => (int) ($event['fornecedor_id'] ?? 0),
        'campo' => (string) ($event['campo'] ?? ''),
        'versao' => (int) ($event['versao'] ?? 0),
        'dados_versao' => (int) ($event['dados_versao'] ?? 0),
        'filtro_versao' => (int) ($event['filtro_versao'] ?? 0),
        'estrutura_versao' => (int) ($event['estrutura_versao'] ?? 0),
        'client_id' => (string) ($event['client_id'] ?? ''),
        'usuario_id' => (int) ($event['usuario_id'] ?? 0),
        'payload' => cotacao_event_decode($event['payload_json'] ?? null),
        'created_at' => $event['created_at'] ?? null,
    );
}

function cotacao_sync_events_since(int $blockId, int $sinceEventId, int $limit = 200): array
{
    $limit = max(1, min(500, $limit));
    $stmt = db()->prepare(
        'SELECT *
         FROM cotacao_eventos
         WHERE bloco_id = ?
           AND id > ?
         ORDER BY id ASC
         LIMIT ' . $limit
    );
    $stmt->execute(array($blockId, max(0, $sinceEventId)));

    return array_map('cotacao_event_public', $stmt->fetchAll());
}

function cotacao_sync_events_response(int $blockId, array $input): array
{
    $knownVersion = max(0, (int) ($input['known_version'] ?? 0));
    $knownDataVersion = array_key_exists('known_data_version', $input)
        ? max(0, (int) ($input['known_data_version'] ?? 0))
        : $knownVersion;
    $knownFilterVersion = array_key_exists('known_filter_version', $input)
        ? max(0, (int) ($input['known_filter_version'] ?? 0))
        : $knownVersion;
    $knownStructureVersion = max(0, (int) ($input['known_structure_version'] ?? 0));
    $sinceEventId = max(0, (int) ($input['known_event_id'] ?? $input['since_event_id'] ?? 0));
    $state = cotacao_sync_state($blockId);
    $dataChanged = $knownDataVersion <= 0 || $knownDataVersion < (int) $state['dados_versao'];
    $filterChanged = $knownFilterVersion <= 0 || $knownFilterVersion < (int) $state['filtro_versao'];
    $structureChanged = $knownStructureVersion <= 0 || $knownStructureVersion < (int) $state['estrutura_versao'];

    if (!$dataChanged && !$filterChanged && !$structureChanged) {
        return array(
            'ok' => true,
            'changed' => false,
            'state' => $state,
            'events' => array(),
            'message' => 'Sem alteracao.',
        );
    }

    if ($structureChanged || $sinceEventId <= 0) {
        return array(
            'ok' => true,
            'changed' => true,
            'requires_snapshot' => true,
            'data_changed' => $dataChanged,
            'filter_changed' => $filterChanged,
            'structure_changed' => $structureChanged,
            'state' => $state,
            'events' => array(),
            'message' => 'Snapshot necessario.',
        );
    }

    $events = cotacao_sync_events_since($blockId, $sinceEventId, 250);
    $lastEvent = $events ? $events[count($events) - 1] : null;
    $lastEventId = $lastEvent ? (int) ($lastEvent['id'] ?? 0) : $sinceEventId;
    $hasStructureEvent = array_filter($events, static function (array $event): bool {
        return ($event['escopo'] ?? '') === 'estrutura';
    });

    if (!$events || $hasStructureEvent || ($lastEventId < (int) ($state['evento_id'] ?? 0) && count($events) >= 250)) {
        return array(
            'ok' => true,
            'changed' => true,
            'requires_snapshot' => true,
            'data_changed' => $dataChanged,
            'filter_changed' => $filterChanged,
            'structure_changed' => $structureChanged || (bool) $hasStructureEvent,
            'state' => $state,
            'events' => $events,
            'message' => 'Snapshot necessario.',
        );
    }

    return array(
        'ok' => true,
        'changed' => true,
        'requires_snapshot' => false,
        'data_changed' => $dataChanged,
        'filter_changed' => $filterChanged,
        'structure_changed' => false,
        'state' => $state,
        'events' => $events,
        'message' => 'Eventos incrementais sincronizados.',
    );
}

function cotacao_sync_state(int $blockId): array
{
    cotacao_ensure_sync_rows($blockId);
    $stmt = db()->prepare('SELECT * FROM cotacao_sync_estado WHERE bloco_id = ? LIMIT 1');
    $stmt->execute(array($blockId));
    $state = $stmt->fetch();

    if (!$state) {
        return array(
            'versao' => 1,
            'dados_versao' => 1,
            'filtro_versao' => 1,
            'estrutura_versao' => 1,
            'evento_id' => cotacao_sync_last_event_id($blockId),
            'filtro_categoria' => '',
            'filtro_cor' => '',
            'filtro_vencedor' => '',
            'updated_at' => null,
        );
    }

    return array(
        'versao' => (int) ($state['versao'] ?? 1),
        'dados_versao' => (int) ($state['dados_versao'] ?? 1),
        'filtro_versao' => (int) ($state['filtro_versao'] ?? 1),
        'estrutura_versao' => (int) ($state['estrutura_versao'] ?? 1),
        'evento_id' => cotacao_sync_last_event_id($blockId),
        'filtro_categoria' => (string) ($state['filtro_categoria'] ?? ''),
        'filtro_cor' => (string) ($state['filtro_cor'] ?? ''),
        'filtro_vencedor' => (string) ($state['filtro_vencedor'] ?? ''),
        'updated_at' => $state['updated_at'] ?? null,
    );
}

function cotacao_sync_touch(int $blockId, string $scope = 'dados'): array
{
    cotacao_ensure_sync_rows($blockId);
    $scope = in_array($scope, array('dados', 'filtro', 'estrutura'), true) ? $scope : 'dados';

    $dadosDelta = $scope === 'dados' ? 1 : 0;
    $filtroDelta = $scope === 'filtro' ? 1 : 0;
    $estruturaDelta = $scope === 'estrutura' ? 1 : 0;

    $stmt = db()->prepare(
        'UPDATE cotacao_sync_estado
         SET versao = versao + 1,
             dados_versao = dados_versao + ?,
             filtro_versao = filtro_versao + ?,
             estrutura_versao = estrutura_versao + ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE bloco_id = ?'
    );
    $stmt->execute(array($dadosDelta, $filtroDelta, $estruturaDelta, $_SESSION['user_id'] ?? null, $blockId));

    return cotacao_sync_state($blockId);
}

function cotacao_sync_update_filter(int $blockId, array $payload): array
{
    cotacao_ensure_sync_rows($blockId);
    $filter = cotacao_sync_filter_payload($payload);
    $stmt = db()->prepare(
        'UPDATE cotacao_sync_estado
         SET versao = versao + 1,
             filtro_versao = filtro_versao + 1,
             filtro_categoria = ?,
             filtro_cor = ?,
             filtro_vencedor = ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE bloco_id = ?'
    );
    $stmt->execute(array(
        $filter['categoria'],
        $filter['cor'],
        $filter['vencedor'],
        $_SESSION['user_id'] ?? null,
        $blockId,
    ));

    cotacao_audit('sincronizar_filtro', 'cotacao_sync_estado', $blockId, null, $filter);
    $state = cotacao_sync_state($blockId);
    cotacao_record_event($blockId, 'filtro_atualizado', 'filtro', array('filter' => $filter), null, null, null, null, $filter, $state);

    return cotacao_sync_state($blockId);
}

function cotacao_sync_suppliers_payload(int $blockId): array
{
    return array_map(static function (array $supplier): array {
        return array(
            'id' => (int) ($supplier['id'] ?? 0),
            'nome' => (string) ($supplier['nome'] ?? ''),
            'ordem' => (int) ($supplier['ordem'] ?? 0),
        );
    }, cotacao_suppliers($blockId, true));
}

function cotacao_sync_item_payload(array $item, array $pricesByItem = array()): array
{
    $itemId = (int) ($item['id'] ?? 0);
    $itemPrices = array();

    foreach (($pricesByItem[$itemId] ?? array()) as $supplierId => $price) {
        $itemPrices[(string) $supplierId] = cotacao_price_format($price);
    }

    if (!empty($item['linha_vazia'])) {
        $itemPrices = array();
    }

    return array(
        'id' => $itemId,
        'ordem' => (int) ($item['ordem'] ?? 0),
        'linha_vazia' => (int) ($item['linha_vazia'] ?? 0),
        'ean' => !empty($item['linha_vazia']) ? '' : (string) ($item['ean'] ?? ''),
        'produto' => !empty($item['linha_vazia']) ? '' : (string) ($item['produto'] ?? ''),
        'quantidade' => !empty($item['linha_vazia']) ? '' : cotacao_price_format($item['quantidade'] ?? ''),
        'categoria' => !empty($item['linha_vazia']) ? '' : (string) ($item['categoria'] ?? ''),
        'cor' => cotacao_color_value((string) ($item['cor'] ?? '')),
        'cores' => cotacao_cell_colors_array($item['cores'] ?? ''),
        'estilos' => cotacao_cell_styles_array($item['estilos'] ?? ''),
        'precos' => $itemPrices,
        'winner' => cotacao_winner_text($item),
        'winner_supplier_id' => (int) ($item['vencedor_fornecedor_id'] ?? 0),
        'encomenda_registrada_em' => (string) ($item['encomenda_registrada_em'] ?? ''),
        'encomenda_registrada_label' => cotacao_order_registered_label($item['encomenda_registrada_em'] ?? null),
    );
}

function cotacao_sync_item_payload_by_id(int $blockId, int $itemId): ?array
{
    $item = cotacao_item($blockId, $itemId);

    if (!$item || (string) ($item['status'] ?? '') === 'cancelada') {
        return null;
    }

    return cotacao_sync_item_payload($item, cotacao_item_prices(array($item)));
}

function cotacao_sync_items_payload(int $blockId): array
{
    $items = cotacao_sheet_items($blockId, array());
    $prices = cotacao_item_prices($items);
    $payload = array();

    foreach ($items as $item) {
        $payload[] = cotacao_sync_item_payload($item, $prices);
    }

    return $payload;
}

function cotacao_sync_snapshot(int $blockId): array
{
    return array(
        'state' => cotacao_sync_state($blockId),
        'suppliers' => cotacao_sync_suppliers_payload($blockId),
        'items' => cotacao_sync_items_payload($blockId),
        'categories' => cotacao_categories($blockId),
        'rules' => cotacao_conditional_rules($blockId),
        'server_time' => date('Y-m-d H:i:s'),
    );
}

function cotacao_presence_color(int $userId, string $clientId): string
{
    $palette = array('#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#0f766e');
    $seed = $userId > 0 ? (string) $userId : $clientId;
    $index = abs((int) crc32($seed !== '' ? $seed : 'cotacao')) % count($palette);

    return $palette[$index];
}

function cotacao_presence_text($value, int $max): string
{
    $text = trim((string) $value);
    $text = preg_replace('/\s+/', ' ', $text) ?: '';

    return substr($text, 0, max(1, $max));
}

function cotacao_presence_client_id(string $clientId): string
{
    $clientId = preg_replace('/[^a-zA-Z0-9:_-]/', '', trim($clientId)) ?: '';
    if ($clientId === '') {
        $session = function_exists('session_id') ? session_id() : '';
        $clientId = 'session-' . substr(hash('sha256', $session !== '' ? $session : uniqid('cotacao', true)), 0, 18);
    }

    return substr($clientId, 0, 80);
}

function cotacao_presence_payload(array $payload): array
{
    $filter = cotacao_sync_filter_payload(array(
        'categoria' => $payload['categoria'] ?? $payload['filter_category'] ?? $payload['category'] ?? '',
        'cor' => $payload['cor'] ?? $payload['filter_color'] ?? $payload['product_color'] ?? $payload['productColor'] ?? '',
        'vencedor' => $payload['vencedor'] ?? $payload['filter_winner'] ?? $payload['winner'] ?? '',
    ));

    $itemId = max(0, (int) ($payload['item_id'] ?? 0));
    $rowOrderRaw = $payload['row_order'] ?? null;
    $rowOrder = is_numeric($rowOrderRaw) ? (int) $rowOrderRaw : null;
    $colKey = preg_replace('/[^a-zA-Z0-9:_-]/', '', trim((string) ($payload['col_key'] ?? ''))) ?: '';

    return array(
        'client_id' => cotacao_presence_client_id((string) ($payload['client_id'] ?? '')),
        'item_id' => $itemId > 0 ? $itemId : null,
        'row_order' => $rowOrder,
        'col_key' => substr($colKey, 0, 80),
        'col_label' => cotacao_presence_text($payload['col_label'] ?? '', 120),
        'filtro_categoria' => $filter['categoria'],
        'filtro_cor' => $filter['cor'],
        'filtro_vencedor' => $filter['vencedor'],
        'editando' => !empty($payload['editando']) || !empty($payload['editing']) ? 1 : 0,
    );
}

function cotacao_presence_cleanup(int $blockId): void
{
    $stmt = db()->prepare('DELETE FROM cotacao_presencas WHERE bloco_id = ? AND ultima_atividade < DATE_SUB(NOW(), INTERVAL 45 SECOND)');
    $stmt->execute(array($blockId));
}

function cotacao_presence_ping(int $blockId, array $user, array $payload): array
{
    cotacao_presence_cleanup($blockId);
    $presence = cotacao_presence_payload($payload);
    $userId = (int) ($user['id'] ?? 0);
    $userName = cotacao_presence_text($user['username'] ?? $user['nome'] ?? 'Usuario', 120);
    $color = cotacao_presence_color($userId, $presence['client_id']);

    $stmt = db()->prepare(
        'INSERT INTO cotacao_presencas
            (bloco_id, client_id, usuario_id, usuario_nome, cor, item_id, row_order, col_key, col_label, filtro_categoria, filtro_cor, filtro_vencedor, editando, ultima_atividade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            usuario_id = VALUES(usuario_id),
            usuario_nome = VALUES(usuario_nome),
            cor = VALUES(cor),
            item_id = VALUES(item_id),
            row_order = VALUES(row_order),
            col_key = VALUES(col_key),
            col_label = VALUES(col_label),
            filtro_categoria = VALUES(filtro_categoria),
            filtro_cor = VALUES(filtro_cor),
            filtro_vencedor = VALUES(filtro_vencedor),
            editando = VALUES(editando),
            ultima_atividade = NOW(),
            updated_at = NOW()'
    );
    $stmt->execute(array(
        $blockId,
        $presence['client_id'],
        $userId > 0 ? $userId : null,
        $userName,
        $color,
        $presence['item_id'],
        $presence['row_order'],
        $presence['col_key'],
        $presence['col_label'],
        $presence['filtro_categoria'],
        $presence['filtro_cor'],
        $presence['filtro_vencedor'],
        $presence['editando'],
    ));

    return cotacao_presence_list($blockId, $presence['client_id']);
}

function cotacao_presence_list(int $blockId, string $selfClientId = ''): array
{
    cotacao_presence_cleanup($blockId);
    $selfClientId = cotacao_presence_client_id($selfClientId);
    $stmt = db()->prepare(
        'SELECT *
         FROM cotacao_presencas
         WHERE bloco_id = ?
           AND ultima_atividade >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
         ORDER BY ultima_atividade DESC, id DESC
         LIMIT 30'
    );
    $stmt->execute(array($blockId));
    $users = array();

    foreach (($stmt->fetchAll() ?: array()) as $row) {
        $clientId = (string) ($row['client_id'] ?? '');
        $users[] = array(
            'client_id' => $clientId,
            'self' => $selfClientId !== '' && hash_equals($selfClientId, $clientId),
            'name' => (string) ($row['usuario_nome'] ?? 'Usuario'),
            'color' => (string) ($row['cor'] ?? '#2563eb'),
            'item_id' => isset($row['item_id']) ? (int) $row['item_id'] : null,
            'row_order' => isset($row['row_order']) ? (int) $row['row_order'] : null,
            'col_key' => (string) ($row['col_key'] ?? ''),
            'col_label' => (string) ($row['col_label'] ?? ''),
            'filters' => array(
                'category' => (string) ($row['filtro_categoria'] ?? ''),
                'productColor' => (string) ($row['filtro_cor'] ?? ''),
                'winner' => (string) ($row['filtro_vencedor'] ?? ''),
            ),
            'editing' => !empty($row['editando']),
            'last_seen' => (string) ($row['ultima_atividade'] ?? ''),
        );
    }

    return array(
        'total' => count($users),
        'users' => $users,
        'server_time' => date('Y-m-d H:i:s'),
    );
}

function cotacao_blocks(): array
{
    return db()->query(
        "SELECT b.*,
            (SELECT COUNT(*) FROM cotacao_itens i WHERE i.bloco_id = b.id AND i.status <> 'cancelada') AS total_itens,
            (SELECT COUNT(*) FROM cotacao_itens i WHERE i.bloco_id = b.id AND i.status = 'cotada') AS total_cotados
         FROM cotacao_blocos b
         WHERE b.ativo = 1
         ORDER BY b.ordem ASC, b.nome ASC"
    )->fetchAll();
}

function cotacao_block_by_slug(string $slug): ?array
{
    $stmt = db()->prepare('SELECT * FROM cotacao_blocos WHERE slug = ? AND ativo = 1 LIMIT 1');
    $stmt->execute(array($slug));
    $block = $stmt->fetch();

    return $block ?: null;
}

function cotacao_add_block(string $name, string $description): array
{
    $name = trim($name);

    if ($name === '') {
        throw new InvalidArgumentException('Informe o nome do bloco.');
    }

    $slugBase = cotacao_slugify($name);
    $slug = $slugBase;
    $suffix = 2;

    while (cotacao_block_by_slug($slug)) {
        $slug = $slugBase . '-' . $suffix;
        $suffix++;
    }

    $stmt = db()->prepare(
        'INSERT INTO cotacao_blocos (nome, slug, descricao, origem, ordem)
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($name, $slug, trim($description), 'manual', 100));
    $id = (int) db()->lastInsertId();
    cotacao_audit('criar_bloco', 'cotacao_blocos', $id, null, array('nome' => $name, 'slug' => $slug));

    for ($index = 1; $index <= 6; $index++) {
        cotacao_add_supplier($id, 'Distribuidora ' . $index, false);
    }

    return cotacao_block_by_slug($slug) ?: array('id' => $id, 'slug' => $slug, 'nome' => $name);
}

function cotacao_suppliers(int $blockId, bool $activeOnly = true): array
{
    $sql = 'SELECT * FROM cotacao_fornecedores WHERE bloco_id = ?';

    if ($activeOnly) {
        $sql .= ' AND ativo = 1';
    }

    $sql .= ' ORDER BY ordem ASC, id ASC';
    $stmt = db()->prepare($sql);
    $stmt->execute(array($blockId));

    return $stmt->fetchAll();
}

function cotacao_add_supplier(int $blockId, string $name, bool $audit = true): array
{
    $name = trim($name);

    db()->beginTransaction();

    try {
        $lock = db()->prepare('SELECT id FROM cotacao_fornecedores WHERE bloco_id = ? FOR UPDATE');
        $lock->execute(array($blockId));
        $lock->fetchAll();

        if ($name === '') {
            $name = cotacao_next_supplier_name($blockId);
        }

        $existing = cotacao_supplier_by_name($blockId, $name);
        if ($existing) {
            $structureChanged = false;

            if ((int) $existing['ativo'] !== 1) {
                $order = ((int) db()->query('SELECT COALESCE(MAX(ordem), 0) FROM cotacao_fornecedores WHERE bloco_id = ' . (int) $blockId)->fetchColumn()) + 10;
                $stmt = db()->prepare('UPDATE cotacao_fornecedores SET ativo = 1, ordem = ?, updated_at = NOW() WHERE id = ? AND bloco_id = ?');
                $stmt->execute(array($order, (int) $existing['id'], $blockId));

                if ($audit) {
                    cotacao_audit('reativar_fornecedor', 'cotacao_fornecedores', (int) $existing['id'], $existing, array('ativo' => 1, 'ordem' => $order));
                }

                $existing = cotacao_supplier($blockId, (int) $existing['id']) ?: $existing;
                $structureChanged = true;
            }

            db()->commit();

            if ($structureChanged) {
                cotacao_sync_touch($blockId, 'estrutura');
            }

            $existing['already_exists'] = true;
            return $existing;
        }

        $order = ((int) db()->query('SELECT COALESCE(MAX(ordem), 0) FROM cotacao_fornecedores WHERE bloco_id = ' . (int) $blockId)->fetchColumn()) + 10;
        $stmt = db()->prepare(
            'INSERT INTO cotacao_fornecedores (bloco_id, nome, ordem, created_by, ativo)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE ativo = 1, ordem = VALUES(ordem), updated_at = NOW()'
        );
        $stmt->execute(array($blockId, $name, $order, $_SESSION['user_id'] ?? null));

        if ($audit) {
            cotacao_audit('adicionar_fornecedor', 'cotacao_fornecedores', null, null, array('bloco_id' => $blockId, 'nome' => $name));
        }

        $supplier = cotacao_supplier_by_name($blockId, $name);
        db()->commit();
        cotacao_sync_touch($blockId, 'estrutura');

        return $supplier ?: array('id' => 0, 'bloco_id' => $blockId, 'nome' => $name, 'ordem' => $order, 'ativo' => 1);
    } catch (Throwable $error) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        throw $error;
    }
}

function cotacao_next_supplier_name(int $blockId): string
{
    $stmt = db()->prepare('SELECT nome FROM cotacao_fornecedores WHERE bloco_id = ?');
    $stmt->execute(array($blockId));

    $used = array();
    $maxNumber = 0;

    foreach ($stmt->fetchAll() as $row) {
        $name = trim((string) ($row['nome'] ?? ''));
        if ($name === '') {
            continue;
        }

        $used[strtolower($name)] = true;

        if (preg_match('/^distribuidora\s+(\d+)$/i', $name, $matches)) {
            $maxNumber = max($maxNumber, (int) $matches[1]);
        }
    }

    for ($number = max(1, $maxNumber + 1); $number <= 999; $number++) {
        $candidate = 'Distribuidora ' . $number;
        if (!isset($used[strtolower($candidate)])) {
            return $candidate;
        }
    }

    return 'Distribuidora ' . date('His');
}

function cotacao_disable_supplier(int $blockId, int $supplierId): void
{
    db()->beginTransaction();

    try {
        $stmt = db()->prepare('SELECT * FROM cotacao_fornecedores WHERE id = ? AND bloco_id = ? LIMIT 1 FOR UPDATE');
        $stmt->execute(array($supplierId, $blockId));
        $before = $stmt->fetch() ?: null;

        if (!$before) {
            throw new InvalidArgumentException('Distribuidora nao encontrada.');
        }

        if ((int) $before['ativo'] !== 1) {
            throw new InvalidArgumentException('Distribuidora ja esta removida.');
        }

        $activeStmt = db()->prepare('SELECT id FROM cotacao_fornecedores WHERE bloco_id = ? AND ativo = 1 FOR UPDATE');
        $activeStmt->execute(array($blockId));
        $activeSuppliers = $activeStmt->fetchAll();

        if (count($activeSuppliers) <= 1) {
            throw new InvalidArgumentException('Mantenha pelo menos uma distribuidora na cotacao.');
        }

        $stmt = db()->prepare('UPDATE cotacao_fornecedores SET ativo = 0, updated_at = NOW() WHERE id = ? AND bloco_id = ?');
        $stmt->execute(array($supplierId, $blockId));
        cotacao_audit('desativar_fornecedor', 'cotacao_fornecedores', $supplierId, $before, array('ativo' => 0));
        cotacao_recalculate_winners_for_supplier($blockId, $supplierId);
        db()->commit();
        cotacao_sync_touch($blockId, 'estrutura');
    } catch (Throwable $error) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        throw $error;
    }
}

function cotacao_supplier(int $blockId, int $supplierId): ?array
{
    $stmt = db()->prepare('SELECT * FROM cotacao_fornecedores WHERE id = ? AND bloco_id = ? LIMIT 1');
    $stmt->execute(array($supplierId, $blockId));
    $supplier = $stmt->fetch();

    return $supplier ?: null;
}

function cotacao_supplier_by_name(int $blockId, string $name): ?array
{
    $stmt = db()->prepare('SELECT * FROM cotacao_fornecedores WHERE bloco_id = ? AND nome = ? LIMIT 1');
    $stmt->execute(array($blockId, trim($name)));
    $supplier = $stmt->fetch();

    return $supplier ?: null;
}

function cotacao_archive_inactive_supplier_name(int $blockId, array $supplier, string $wantedName): ?string
{
    if ((int) ($supplier['ativo'] ?? 1) === 1) {
        return null;
    }

    $supplierId = (int) ($supplier['id'] ?? 0);
    if ($supplierId <= 0) {
        return null;
    }

    $base = trim($wantedName) . ' (removida #' . $supplierId . ')';
    $base = substr($base, 0, 112);
    $candidate = $base;
    $suffix = 1;

    while (true) {
        $existing = cotacao_supplier_by_name($blockId, $candidate);
        if (!$existing || (int) $existing['id'] === $supplierId) {
            break;
        }

        $tail = ' ' . (++$suffix);
        $candidate = substr($base, 0, 120 - strlen($tail)) . $tail;
    }

    $stmt = db()->prepare('UPDATE cotacao_fornecedores SET nome = ?, updated_at = NOW() WHERE id = ? AND bloco_id = ? AND ativo = 0');
    $stmt->execute(array($candidate, $supplierId, $blockId));
    cotacao_audit('arquivar_nome_fornecedor_invisivel', 'cotacao_fornecedores', $supplierId, $supplier, array('nome' => $candidate));

    return $candidate;
}

function cotacao_rename_supplier(int $blockId, int $supplierId, string $name): array
{
    $name = trim($name);

    if ($name === '') {
        throw new InvalidArgumentException('Informe o nome da distribuidora.');
    }

    $before = cotacao_supplier($blockId, $supplierId);

    if (!$before) {
        throw new InvalidArgumentException('Distribuidora nao encontrada.');
    }

    $existing = cotacao_supplier_by_name($blockId, $name);
    if ($existing && (int) $existing['id'] !== $supplierId) {
        if ((int) $existing['ativo'] !== 1) {
            cotacao_archive_inactive_supplier_name($blockId, $existing, $name);
        } else {
            throw new InvalidArgumentException('Essa distribuidora ja existe nesta cotacao. Use a coluna existente ou escolha outro nome.');
        }
    }

    $stmt = db()->prepare('UPDATE cotacao_fornecedores SET nome = ?, updated_at = NOW() WHERE id = ? AND bloco_id = ?');
    $stmt->execute(array($name, $supplierId, $blockId));
    cotacao_audit('renomear_fornecedor', 'cotacao_fornecedores', $supplierId, $before, array('nome' => $name));
    cotacao_sync_touch($blockId, 'estrutura');

    $supplier = cotacao_supplier($blockId, $supplierId);

    return $supplier ?: array('id' => $supplierId, 'nome' => $name);
}

function cotacao_category_normalize(string $name): string
{
    return strtolower(trim($name));
}

function cotacao_add_category(int $blockId, string $name, bool $touchSync = true): array
{
    $name = cotacao_category_normalize($name);

    if ($name === '') {
        throw new InvalidArgumentException('Informe a categoria.');
    }

    $existingStmt = db()->prepare('SELECT * FROM cotacao_categorias WHERE bloco_id = ? AND nome = ? LIMIT 1');
    $existingStmt->execute(array($blockId, $name));
    $existing = $existingStmt->fetch();

    if ($existing && (int) $existing['ativo'] === 1) {
        return array('nome' => $name, 'ordem' => (int) $existing['ordem']);
    }

    $order = ((int) db()->query('SELECT COALESCE(MAX(ordem), 0) FROM cotacao_categorias WHERE bloco_id = ' . (int) $blockId)->fetchColumn()) + 10;

    if ($existing) {
        $stmt = db()->prepare('UPDATE cotacao_categorias SET ativo = 1, ordem = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute(array($order, (int) $existing['id']));
    } else {
        $stmt = db()->prepare(
            'INSERT INTO cotacao_categorias (bloco_id, nome, ordem, created_by, ativo)
             VALUES (?, ?, ?, ?, 1)'
        );
        $stmt->execute(array($blockId, $name, $order, $_SESSION['user_id'] ?? null));
    }

    cotacao_audit('adicionar_categoria', 'cotacao_categorias', null, null, array('bloco_id' => $blockId, 'nome' => $name));
    if ($touchSync) {
        cotacao_sync_touch($blockId, 'dados');
    }

    return array('nome' => $name, 'ordem' => $order);
}

function cotacao_delete_category(int $blockId, string $name): void
{
    $name = cotacao_category_normalize($name);

    if ($name === '') {
        throw new InvalidArgumentException('Informe a categoria.');
    }

    $stmt = db()->prepare('UPDATE cotacao_categorias SET ativo = 0, updated_at = NOW() WHERE bloco_id = ? AND nome = ?');
    $stmt->execute(array($blockId, $name));
    cotacao_audit('excluir_categoria', 'cotacao_categorias', null, array('nome' => $name), array('ativo' => 0));
    cotacao_sync_touch($blockId, 'dados');
}

function cotacao_priorities(): array
{
    return array(
        'normal' => 'Normal',
        'encomenda' => 'Encomenda',
        'urgente' => 'Urgente',
        'reposicao' => 'Reposicao',
        'outro' => 'Outro',
    );
}

function cotacao_statuses(): array
{
    return array(
        'aberta' => 'Aberta',
        'cotada' => 'Cotada',
        'pedido' => 'Pedido',
        'cancelada' => 'Cancelada',
    );
}

function cotacao_valid_choice(string $value, array $choices, string $default): string
{
    return array_key_exists($value, $choices) ? $value : $default;
}

function cotacao_csv_token_map($value, ?array $allowed = null): array
{
    $raw = is_array($value) ? implode(',', array_map('strval', $value)) : (string) $value;
    $parts = preg_split('/\s*,\s*/', $raw) ?: array();
    $tokens = array();

    foreach ($parts as $part) {
        $part = trim((string) $part);
        if ($part === '') {
            continue;
        }

        if ($allowed !== null && !isset($allowed[$part])) {
            continue;
        }

        $tokens[$part] = true;
    }

    return $tokens;
}

function cotacao_save_item_patch_fields(array $data): array
{
    return cotacao_csv_token_map($data['campos'] ?? $data['fields'] ?? '', array(
        'ean' => true,
        'produto' => true,
        'quantidade' => true,
        'categoria' => true,
        'cor' => true,
        'cores' => true,
        'estilos' => true,
        'ordem' => true,
        'linha_vazia' => true,
        'unidade' => true,
        'prioridade' => true,
        'status' => true,
        'observacao' => true,
    ));
}

function cotacao_save_item_patch_prices(array $data): array
{
    $tokens = cotacao_csv_token_map($data['precos_alterados'] ?? $data['prices_changed'] ?? '');
    $prices = array();

    foreach (array_keys($tokens) as $supplierId) {
        $supplierId = (int) $supplierId;
        if ($supplierId > 0) {
            $prices[$supplierId] = true;
        }
    }

    return $prices;
}

function cotacao_item_sync_field_names(): array
{
    return array(
        'ean',
        'produto',
        'quantidade',
        'categoria',
        'cor',
        'cores',
        'estilos',
        'ordem',
        'linha_vazia',
        'unidade',
        'prioridade',
        'status',
        'observacao',
    );
}

function cotacao_update_item_versions(int $itemId, array $changedFields, array $changedPrices, array $state): void
{
    if ($itemId <= 0) {
        return;
    }

    $version = max(1, (int) ($state['dados_versao'] ?? $state['versao'] ?? 1));
    $stmt = db()->prepare('SELECT versoes FROM cotacao_itens WHERE id = ? LIMIT 1');
    $stmt->execute(array($itemId));
    $versions = cotacao_event_decode((string) $stmt->fetchColumn());

    foreach ($changedFields as $field) {
        $field = (string) $field;
        if ($field !== '') {
            $versions[$field] = $version;
        }
    }

    $update = db()->prepare('UPDATE cotacao_itens SET versoes = ? WHERE id = ?');
    $update->execute(array(cotacao_event_json($versions), $itemId));

    if ($changedPrices) {
        $priceVersion = db()->prepare('UPDATE cotacao_precos SET versao = ? WHERE item_id = ? AND fornecedor_id = ?');
        foreach (array_keys($changedPrices) as $supplierId) {
            $supplierId = (int) $supplierId;
            if ($supplierId > 0) {
                $priceVersion->execute(array($version, $itemId, $supplierId));
            }
        }
    }
}

function cotacao_claim_item_order(int $blockId, int $requestedOrder, int $currentItemId = 0): int
{
    $requestedOrder = max(1, $requestedOrder);

    $stmt = db()->prepare(
        "SELECT id, ordem
         FROM cotacao_itens
         WHERE bloco_id = ?
           AND status <> 'cancelada'
         ORDER BY ordem ASC, id ASC
         FOR UPDATE"
    );
    $stmt->execute(array($blockId));
    $used = array();
    $nextGreater = 0;

    foreach ($stmt->fetchAll() as $row) {
        $rowId = (int) ($row['id'] ?? 0);
        if ($rowId === $currentItemId) {
            continue;
        }

        $order = (int) ($row['ordem'] ?? 0);
        if ($order <= 0) {
            continue;
        }

        $used[$order] = true;
        if ($order > $requestedOrder && ($nextGreater === 0 || $order < $nextGreater)) {
            $nextGreater = $order;
        }
    }

    if (!isset($used[$requestedOrder])) {
        return $requestedOrder;
    }

    $upperBound = $nextGreater > $requestedOrder ? $nextGreater - 1 : $requestedOrder + 1000;
    for ($candidate = $requestedOrder + 1; $candidate <= $upperBound; $candidate++) {
        if (!isset($used[$candidate])) {
            return $candidate;
        }
    }

    $maxOrder = $used ? max(array_keys($used)) : $requestedOrder;
    return $maxOrder + 1000;
}

function cotacao_save_item(int $blockId, array $data, array $prices): int
{
    $id = max(0, (int) ($data['id'] ?? 0));
    $before = $id > 0 ? cotacao_item($blockId, $id) : null;
    $produto = trim((string) ($data['produto'] ?? ''));
    $lineEmpty = in_array((string) ($data['linha_vazia'] ?? $data['keep_empty'] ?? '0'), array('1', 'true', 'sim'), true);
    $rawCategory = trim((string) ($data['categoria'] ?? ''));
    $rawQuantity = trim((string) ($data['quantidade'] ?? ''));
    $requestedOrder = (int) ($data['ordem'] ?? 0);
    if ($before && $requestedOrder <= 0) {
        $requestedOrder = (int) ($before['ordem'] ?? 0);
    }
    $orderValue = max(1, $requestedOrder ?: (int) ($before['ordem'] ?? 0));

    if ($produto === '' && !$before && !$lineEmpty) {
        throw new InvalidArgumentException('Informe o produto.');
    }

    $payload = array(
        'ean' => trim((string) ($data['ean'] ?? '')),
        'produto' => $produto,
        'quantidade' => $lineEmpty && $rawQuantity === '' ? 1.00 : max(0.01, money_to_decimal($data['quantidade'] ?? '1')),
        'unidade' => trim((string) ($data['unidade'] ?? 'un')) ?: 'un',
        'categoria' => $lineEmpty ? $rawCategory : $rawCategory,
        'cor' => cotacao_color_value((string) ($data['cor'] ?? '')),
        'cores' => cotacao_cell_colors_json($data['cores'] ?? ''),
        'estilos' => cotacao_cell_styles_json($data['estilos'] ?? ''),
        'ordem' => $orderValue,
        'linha_vazia' => $lineEmpty ? 1 : 0,
        'prioridade' => cotacao_valid_choice((string) ($data['prioridade'] ?? 'normal'), cotacao_priorities(), 'normal'),
        'status' => cotacao_valid_choice((string) ($data['status'] ?? 'aberta'), cotacao_statuses(), 'aberta'),
        'observacao' => trim((string) ($data['observacao'] ?? '')),
    );

    $patchFields = $before ? cotacao_save_item_patch_fields($data) : array();
    $patchPrices = $before ? cotacao_save_item_patch_prices($data) : array();
    $hasPatchMeta = $before && (array_key_exists('campos', $data) || array_key_exists('fields', $data) || array_key_exists('precos_alterados', $data) || array_key_exists('prices_changed', $data));
    $applyPatchMeta = static function (array $payload, array $before, array $patchFields): array {
        $preserveMap = array(
            'ean' => 'ean',
            'produto' => 'produto',
            'quantidade' => 'quantidade',
            'unidade' => 'unidade',
            'categoria' => 'categoria',
            'cor' => 'cor',
            'cores' => 'cores',
            'estilos' => 'estilos',
            'ordem' => 'ordem',
            'linha_vazia' => 'linha_vazia',
            'prioridade' => 'prioridade',
            'status' => 'status',
            'observacao' => 'observacao',
        );

        foreach ($preserveMap as $field => $sourceKey) {
            if (!isset($patchFields[$field])) {
                $payload[$field] = $before[$sourceKey] ?? $payload[$field];
            }
        }

        $payload['quantidade'] = max(0.01, (float) ($payload['quantidade'] ?? 1));
        $payload['cor'] = cotacao_color_value((string) ($payload['cor'] ?? ''));
        $payload['cores'] = cotacao_cell_colors_json($payload['cores'] ?? '');
        $payload['estilos'] = cotacao_cell_styles_json($payload['estilos'] ?? '');
        $payload['ordem'] = max(1, (int) ($payload['ordem'] ?? ($before['ordem'] ?? 1)));
        $payload['linha_vazia'] = !empty($payload['linha_vazia']) ? 1 : 0;
        $payload['prioridade'] = cotacao_valid_choice((string) ($payload['prioridade'] ?? 'normal'), cotacao_priorities(), 'normal');
        $payload['status'] = cotacao_valid_choice((string) ($payload['status'] ?? 'aberta'), cotacao_statuses(), 'aberta');
        return $payload;
    };

    if ($before && $hasPatchMeta) {
        $payload = $applyPatchMeta($payload, $before, $patchFields);
    }

    $payload['produto'] = trim((string) ($payload['produto'] ?? ''));
    $hasDraftContent = trim((string) ($payload['ean'] ?? '')) !== ''
        || trim((string) ($payload['categoria'] ?? '')) !== ''
        || trim((string) ($data['quantidade'] ?? '')) !== ''
        || trim((string) ($payload['cor'] ?? '')) !== ''
        || trim((string) ($payload['cores'] ?? '')) !== ''
        || trim((string) ($payload['estilos'] ?? '')) !== ''
        || array_filter($prices, static function ($price): bool {
            return trim((string) $price) !== '';
        }) !== array();

    if ($payload['produto'] === '' && !$before && empty($payload['linha_vazia']) && !$hasDraftContent) {
        throw new InvalidArgumentException('Informe o produto.');
    }

    db()->beginTransaction();

    try {
        if ($id > 0 && $before) {
            $lockStmt = db()->prepare('SELECT * FROM cotacao_itens WHERE id = ? AND bloco_id = ? LIMIT 1 FOR UPDATE');
            $lockStmt->execute(array($id, $blockId));
            $lockedBefore = $lockStmt->fetch();

            if (!$lockedBefore) {
                throw new InvalidArgumentException('Item nao encontrado.');
            }

            $before = $lockedBefore;

            if ($hasPatchMeta) {
                $payload = $applyPatchMeta($payload, $before, $patchFields);
                $payload['produto'] = trim((string) ($payload['produto'] ?? ''));
            }
        }

        $requestedOrder = (int) ($payload['ordem'] ?? 0);
        $beforeOrder = $before ? (int) ($before['ordem'] ?? 0) : 0;
        if ($before && $requestedOrder <= 0 && $beforeOrder > 0) {
            $payload['ordem'] = $beforeOrder;
        } elseif (!$before || $beforeOrder <= 0 || $requestedOrder !== $beforeOrder) {
            $payload['ordem'] = cotacao_claim_item_order($blockId, $requestedOrder, $id);
        } else {
            $payload['ordem'] = $beforeOrder;
        }

        if (!empty($payload['linha_vazia'])) {
            $payload['ean'] = '';
            $payload['produto'] = '';
            $payload['quantidade'] = 1.00;
            $payload['categoria'] = '';
            $payload['prioridade'] = 'normal';
            $payload['status'] = 'aberta';
            $payload['observacao'] = '';
            $payload['encomenda_registrada_em'] = null;
        } else {
            $isOrder = (string) ($payload['prioridade'] ?? 'normal') === 'encomenda';
            $wasOrder = $before ? (string) ($before['prioridade'] ?? 'normal') === 'encomenda' : false;
            $payload['encomenda_registrada_em'] = $isOrder
                ? ($wasOrder ? (trim((string) ($before['encomenda_registrada_em'] ?? '')) ?: date('Y-m-d H:i:s')) : date('Y-m-d H:i:s'))
                : null;

            if (trim((string) $payload['categoria']) !== '') {
                cotacao_add_category($blockId, $payload['categoria'], false);
            }
        }

        if ($id > 0 && $before) {
            $stmt = db()->prepare(
                'UPDATE cotacao_itens
                 SET ean = ?, produto = ?, quantidade = ?, unidade = ?, categoria = ?, cor = ?, cores = ?, estilos = ?, ordem = ?, linha_vazia = ?, prioridade = ?, status = ?, observacao = ?, encomenda_registrada_em = ?, updated_at = NOW()
                 WHERE id = ? AND bloco_id = ?'
            );
            $stmt->execute(array(
                $payload['ean'],
                $payload['produto'],
                $payload['quantidade'],
                $payload['unidade'],
                $payload['categoria'],
                $payload['cor'],
                $payload['cores'],
                $payload['estilos'],
                $payload['ordem'],
                $payload['linha_vazia'],
                $payload['prioridade'],
                $payload['status'],
                $payload['observacao'],
                $payload['encomenda_registrada_em'],
                $id,
                $blockId,
            ));
        } else {
            $stmt = db()->prepare(
                'INSERT INTO cotacao_itens
                    (bloco_id, ean, produto, quantidade, unidade, categoria, cor, cores, estilos, ordem, linha_vazia, prioridade, status, observacao, encomenda_registrada_em, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                $blockId,
                $payload['ean'],
                $payload['produto'],
                $payload['quantidade'],
                $payload['unidade'],
                $payload['categoria'],
                $payload['cor'],
                $payload['cores'],
                $payload['estilos'],
                $payload['ordem'],
                $payload['linha_vazia'],
                $payload['prioridade'],
                $payload['status'],
                $payload['observacao'],
                $payload['encomenda_registrada_em'],
                $_SESSION['user_id'] ?? null,
            ));
            $id = (int) db()->lastInsertId();
        }

        foreach ($prices as $supplierId => $priceValue) {
            if ($hasPatchMeta && !isset($patchPrices[(int) $supplierId])) {
                continue;
            }

            $supplier = cotacao_supplier($blockId, (int) $supplierId);

            if (!$supplier || (int) $supplier['ativo'] !== 1) {
                continue;
            }

            $priceText = trim((string) $priceValue);
            $price = $priceText === '' ? null : money_to_decimal($priceText);
            $stmt = db()->prepare(
                'INSERT INTO cotacao_precos (item_id, fornecedor_id, preco, updated_by)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE preco = VALUES(preco), updated_by = VALUES(updated_by), updated_at = NOW()'
            );
            $stmt->execute(array($id, (int) $supplierId, $price, $_SESSION['user_id'] ?? null));
        }

        cotacao_update_winner($id);
        db()->commit();
    } catch (Throwable $error) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        throw $error;
    }

    cotacao_audit($before ? 'atualizar_item' : 'criar_item', 'cotacao_itens', $id, $before, $payload);
    $state = cotacao_sync_touch($blockId, 'dados');
    $changedFields = ($before && $hasPatchMeta) ? array_keys($patchFields) : cotacao_item_sync_field_names();
    $changedPrices = ($before && $hasPatchMeta) ? $patchPrices : array_fill_keys(array_map('intval', array_keys($prices)), true);
    cotacao_update_item_versions($id, $changedFields, $changedPrices, $state);
    $savedItem = cotacao_sync_item_payload_by_id($blockId, $id);
    cotacao_record_event($blockId, $before ? 'item_atualizado' : 'item_criado', 'dados', array(
        'item' => $savedItem,
        'changed_fields' => array_values($changedFields),
        'changed_prices' => array_values(array_map('intval', array_keys($changedPrices))),
    ), $id, null, null, $before, $savedItem, $state);

    return $id;
}

function cotacao_add_empty_rows(int $blockId, int $amount): array
{
    $amount = max(1, min(50, $amount));
    cotacao_ensure_sync_rows($blockId);

    $insertedIds = array();
    $insertedOrders = array();

    db()->beginTransaction();

    try {
        $lockStmt = db()->prepare('SELECT bloco_id FROM cotacao_sync_estado WHERE bloco_id = ? LIMIT 1 FOR UPDATE');
        $lockStmt->execute(array($blockId));

        if (!$lockStmt->fetchColumn()) {
            throw new InvalidArgumentException('Cotacao sem controle de sincronizacao.');
        }

        $orderStmt = db()->prepare(
            "SELECT ordem
             FROM cotacao_itens
             WHERE bloco_id = ?
               AND status <> 'cancelada'
             ORDER BY ordem DESC, id DESC
             LIMIT 1
             FOR UPDATE"
        );
        $orderStmt->execute(array($blockId));
        $maxOrder = max(0, (int) $orderStmt->fetchColumn());

        $insertStmt = db()->prepare(
            'INSERT INTO cotacao_itens
                (bloco_id, ean, produto, quantidade, unidade, categoria, cor, cores, estilos, ordem, linha_vazia, prioridade, status, observacao, encomenda_registrada_em, created_by)
             VALUES (?, \'\', \'\', 1.00, \'un\', \'\', \'\', NULL, NULL, ?, 1, \'normal\', \'aberta\', \'\', NULL, ?)'
        );

        for ($i = 1; $i <= $amount; $i++) {
            $order = $maxOrder + ($i * 1000);
            $insertStmt->execute(array($blockId, $order, $_SESSION['user_id'] ?? null));
            $insertedIds[] = (int) db()->lastInsertId();
            $insertedOrders[] = $order;
        }

        $state = cotacao_sync_touch($blockId, 'dados');
        db()->commit();
    } catch (Throwable $error) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        throw $error;
    }

    cotacao_audit('criar_linhas_vazias', 'cotacao_itens', null, null, array(
        'quantidade' => $amount,
        'ids' => $insertedIds,
        'ordens' => $insertedOrders,
    ));

    $items = array();
    foreach ($insertedIds as $insertedId) {
        $item = cotacao_sync_item_payload_by_id($blockId, (int) $insertedId);
        if ($item) {
            $items[] = $item;
        }
    }
    cotacao_record_event($blockId, 'linhas_criadas', 'dados', array(
        'amount' => $amount,
        'items' => $items,
    ), null, null, null, null, array('ids' => $insertedIds), $state ?? null);

    return array(
        'amount' => $amount,
        'ids' => $insertedIds,
        'orders' => $insertedOrders,
    );
}

function cotacao_item(int $blockId, int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM cotacao_itens WHERE id = ? AND bloco_id = ? LIMIT 1');
    $stmt->execute(array($id, $blockId));
    $item = $stmt->fetch();

    return $item ?: null;
}

function cotacao_update_winner(int $itemId): void
{
    $emptyStmt = db()->prepare('SELECT linha_vazia FROM cotacao_itens WHERE id = ? LIMIT 1');
    $emptyStmt->execute(array($itemId));
    if ((int) $emptyStmt->fetchColumn() === 1) {
        $update = db()->prepare(
            "UPDATE cotacao_itens
             SET vencedor_fornecedor_id = NULL, vencedor_preco = NULL,
                 status = CASE WHEN status = 'cancelada' THEN status ELSE 'aberta' END,
                 updated_at = NOW()
             WHERE id = ?"
        );
        $update->execute(array($itemId));
        return;
    }

    $stmt = db()->prepare(
        'SELECT cp.fornecedor_id, cp.preco
         FROM cotacao_precos cp
         INNER JOIN cotacao_fornecedores f ON f.id = cp.fornecedor_id
         WHERE cp.item_id = ?
           AND f.ativo = 1
           AND cp.preco IS NOT NULL
           AND cp.preco > 0
         ORDER BY cp.preco ASC, f.ordem ASC, f.id ASC
         LIMIT 1'
    );
    $stmt->execute(array($itemId));
    $winner = $stmt->fetch();

    if ($winner) {
        $update = db()->prepare(
            "UPDATE cotacao_itens
             SET vencedor_fornecedor_id = ?, vencedor_preco = ?,
                 status = CASE WHEN status = 'cancelada' THEN status WHEN status = 'pedido' THEN status ELSE 'cotada' END,
                 updated_at = NOW()
             WHERE id = ?"
        );
        $update->execute(array((int) $winner['fornecedor_id'], (float) $winner['preco'], $itemId));
        return;
    }

    $update = db()->prepare(
        "UPDATE cotacao_itens
         SET vencedor_fornecedor_id = NULL, vencedor_preco = NULL,
             status = CASE WHEN status IN ('cancelada', 'pedido') THEN status ELSE 'aberta' END,
             updated_at = NOW()
         WHERE id = ?"
    );
    $update->execute(array($itemId));
}

function cotacao_recalculate_winners_for_supplier(int $blockId, int $supplierId): void
{
    $stmt = db()->prepare(
        'SELECT DISTINCT i.id
         FROM cotacao_itens i
         LEFT JOIN cotacao_precos cp ON cp.item_id = i.id AND cp.fornecedor_id = ?
         WHERE i.bloco_id = ?
           AND i.status <> "cancelada"
           AND (i.vencedor_fornecedor_id = ? OR cp.fornecedor_id IS NOT NULL)'
    );
    $stmt->execute(array($supplierId, $blockId, $supplierId));

    foreach ($stmt->fetchAll() as $row) {
        cotacao_update_winner((int) $row['id']);
    }
}

function cotacao_cancel_item(int $blockId, int $id): void
{
    $before = cotacao_item($blockId, $id);

    if (!$before) {
        throw new InvalidArgumentException('Item nao encontrado.');
    }

    $stmt = db()->prepare("UPDATE cotacao_itens SET status = 'cancelada', updated_at = NOW() WHERE id = ? AND bloco_id = ?");
    $stmt->execute(array($id, $blockId));
    cotacao_audit('cancelar_item', 'cotacao_itens', $id, $before, array('status' => 'cancelada'));
    $state = cotacao_sync_touch($blockId, 'dados');
    cotacao_update_item_versions($id, array('status'), array(), $state);
    cotacao_record_event($blockId, 'item_cancelado', 'dados', array(
        'item_id' => $id,
        'ordem' => (int) ($before['ordem'] ?? 0),
    ), $id, null, 'status', $before, array('status' => 'cancelada'), $state);
}

function cotacao_item_prices(array $items): array
{
    if (!$items) {
        return array();
    }

    $ids = array_map(static function (array $item): int {
        return (int) $item['id'];
    }, $items);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare("SELECT item_id, fornecedor_id, preco FROM cotacao_precos WHERE item_id IN ($placeholders)");
    $stmt->execute($ids);
    $prices = array();

    foreach ($stmt->fetchAll() as $row) {
        $prices[(int) $row['item_id']][(int) $row['fornecedor_id']] = $row['preco'];
    }

    return $prices;
}

function cotacao_sheet_items(int $blockId, array $filters): array
{
    $where = array("i.bloco_id = ?", "i.status <> 'cancelada'");
    $params = array($blockId);

    $q = trim((string) ($filters['q'] ?? ''));
    if ($q !== '') {
        $where[] = '(i.ean LIKE ? OR i.produto LIKE ? OR i.observacao LIKE ?)';
        $term = '%' . $q . '%';
        array_push($params, $term, $term, $term);
    }

    $categoryFilterValue = trim((string) ($filters['categoria'] ?? ''));
    $categoryTerms = cotacao_category_filter_terms($categoryFilterValue);
    if ($categoryTerms) {
        $categoryWhere = array();
        foreach ($categoryTerms as $term) {
            $categoryWhere[] = 'LOWER(i.categoria) LIKE ?';
            $params[] = '%' . $term . '%';
        }
        $where[] = '(' . implode(' OR ', $categoryWhere) . ')';
    }

    $cor = cotacao_color_filter_value((string) ($filters['cor'] ?? ''));
    if ($cor === 'sem') {
        $where[] = "(i.cor IS NULL OR i.cor = '') AND (i.cores IS NULL OR i.cores = '' OR i.cores = '{}')";
    } elseif ($cor !== '') {
        $colorWhere = array('i.cor = ?', 'i.cores LIKE ?');
        array_push($params, $cor, '%' . $cor . '%');

        $where[] = '(' . implode(' OR ', $colorWhere) . ')';
    }

    $vencedor = trim((string) ($filters['vencedor'] ?? ''));
    if ($vencedor === 'sem') {
        $where[] = 'i.vencedor_fornecedor_id IS NULL';
    } elseif (ctype_digit($vencedor)) {
        $where[] = 'i.vencedor_fornecedor_id = ?';
        $params[] = (int) $vencedor;
    }

    $sql = 'SELECT i.*, f.nome AS vencedor_nome
            FROM cotacao_itens i
            LEFT JOIN cotacao_fornecedores f ON f.id = i.vencedor_fornecedor_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY i.ordem ASC, i.id ASC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

function cotacao_filter_text(string $value): string
{
    $value = trim($value);
    $lower = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    $plain = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $lower) : false;

    return trim((string) ($plain !== false ? $plain : $lower));
}

function cotacao_category_filter_terms($value): array
{
    $raw = is_array($value) ? implode(',', array_map('strval', $value)) : (string) $value;
    $raw = str_replace(array('+', ';', '|'), ',', $raw);
    $parts = preg_split('/\s*,\s*/', $raw) ?: array();
    $terms = array();

    foreach ($parts as $part) {
        $part = cotacao_filter_text((string) $part);
        if ($part !== '') {
            $terms[$part] = true;
        }
    }

    return array_keys($terms);
}

function cotacao_categories(int $blockId): array
{
    $stmt = db()->prepare(
        "SELECT categoria AS nome
         FROM cotacao_itens
         WHERE bloco_id = ?
           AND status <> 'cancelada'
           AND categoria IS NOT NULL
           AND TRIM(categoria) <> ''
         ORDER BY categoria ASC"
    );
    $stmt->execute(array($blockId));

    $categories = array();
    foreach ($stmt->fetchAll() as $row) {
        $name = trim((string) ($row['nome'] ?? ''));
        if ($name !== '') {
            $categories[cotacao_filter_text($name)] = $name;
        }
    }

    ksort($categories);

    return array_values($categories);
}

function cotacao_items(int $blockId, array $filters): array
{
    $where = array('i.bloco_id = ?');
    $params = array($blockId);

    $q = trim((string) ($filters['q'] ?? ''));
    if ($q !== '') {
        $where[] = '(i.ean LIKE ? OR i.produto LIKE ? OR i.observacao LIKE ?)';
        $term = '%' . $q . '%';
        array_push($params, $term, $term, $term);
    }

    $categoryFilterValue = trim((string) ($filters['categoria'] ?? ''));
    $categoryTerms = cotacao_category_filter_terms($categoryFilterValue);
    if ($categoryTerms) {
        $categoryWhere = array();
        foreach ($categoryTerms as $term) {
            $categoryWhere[] = 'LOWER(i.categoria) LIKE ?';
            $params[] = '%' . $term . '%';
        }
        $where[] = '(' . implode(' OR ', $categoryWhere) . ')';
    }

    $cor = cotacao_color_filter_value((string) ($filters['cor'] ?? ''));
    if ($cor === 'sem') {
        $where[] = "(i.cor IS NULL OR i.cor = '') AND (i.cores IS NULL OR i.cores = '' OR i.cores = '{}')";
    } elseif ($cor !== '') {
        $colorWhere = array('i.cor = ?', 'i.cores LIKE ?');
        array_push($params, $cor, '%' . $cor . '%');

        $where[] = '(' . implode(' OR ', $colorWhere) . ')';
    }

    $status = trim((string) ($filters['status'] ?? ''));
    if ($status !== '' && array_key_exists($status, cotacao_statuses())) {
        $where[] = 'i.status = ?';
        $params[] = $status;
    }

    $vencedor = trim((string) ($filters['vencedor'] ?? ''));
    if ($vencedor === 'sem') {
        $where[] = 'i.vencedor_fornecedor_id IS NULL';
    } elseif (ctype_digit($vencedor)) {
        $where[] = 'i.vencedor_fornecedor_id = ?';
        $params[] = (int) $vencedor;
    }

    $sql = 'SELECT i.*, f.nome AS vencedor_nome
            FROM cotacao_itens i
            LEFT JOIN cotacao_fornecedores f ON f.id = i.vencedor_fornecedor_id
            WHERE ' . implode(' AND ', $where) . "
            ORDER BY FIELD(i.prioridade, 'urgente', 'encomenda', 'reposicao', 'normal', 'outro'),
                     FIELD(i.status, 'aberta', 'cotada', 'pedido', 'cancelada'),
                     i.updated_at DESC,
                     i.id DESC
            LIMIT 400";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

function cotacao_stats(int $blockId): array
{
    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS total,
            SUM(status = 'aberta') AS abertas,
            SUM(status = 'cotada') AS cotadas,
            SUM(status = 'pedido') AS pedidos,
            SUM(status = 'cancelada') AS canceladas
         FROM cotacao_itens
         WHERE bloco_id = ?"
    );
    $stmt->execute(array($blockId));
    $row = $stmt->fetch() ?: array();

    return array(
        'total' => (int) ($row['total'] ?? 0),
        'abertas' => (int) ($row['abertas'] ?? 0),
        'cotadas' => (int) ($row['cotadas'] ?? 0),
        'pedidos' => (int) ($row['pedidos'] ?? 0),
        'canceladas' => (int) ($row['canceladas'] ?? 0),
    );
}

function cotacao_price_format($value): string
{
    if ($value === null || $value === '') {
        return '';
    }

    return number_format((float) $value, 2, ',', '.');
}

function cotacao_winner_text(array $item): string
{
    if (empty($item['vencedor_fornecedor_id']) || empty($item['vencedor_nome'])) {
        return 'Sem vencedor';
    }

    return (string) $item['vencedor_nome'] . ' - ' . br_money((float) $item['vencedor_preco']);
}

function cotacao_status_label(string $status): string
{
    $statuses = cotacao_statuses();

    return $statuses[$status] ?? $status;
}

function cotacao_priority_label(string $priority): string
{
    $priorities = cotacao_priorities();

    return $priorities[$priority] ?? $priority;
}

try {
    cotacao_ensure_schema();
} catch (Throwable $error) {
    error_log('Cotacao schema update failed: ' . $error->getMessage());
}
