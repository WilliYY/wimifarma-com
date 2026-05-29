<?php
declare(strict_types=1);

function codigos_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_codigos_comissao (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            codigo VARCHAR(180) NOT NULL,
            ean VARCHAR(80) NOT NULL,
            preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            ordem INT UNSIGNED NOT NULL DEFAULT 0,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_por INT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            apagado_em DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_codigos_comissao_ativo_ordem (ativo, ordem, id),
            KEY idx_codigos_comissao_codigo (codigo),
            KEY idx_codigos_comissao_ean (ean)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_codigos_blocos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            group_key VARCHAR(16) NOT NULL,
            label VARCHAR(80) NOT NULL,
            ordem INT UNSIGNED NOT NULL DEFAULT 0,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            criado_por INT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_codigos_blocos_group_key (group_key),
            KEY idx_codigos_blocos_ativo_ordem (ativo, ordem, group_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    codigos_seed_defaults();
    codigos_seed_default_groups();
    codigos_sync_groups_from_items();
    $done = true;
}

function codigos_seed_defaults(): void
{
    $count = (int) db()->query('SELECT COUNT(*) FROM wf_codigos_comissao')->fetchColumn();
    if ($count > 0) {
        return;
    }

    $defaults = array(
        array('KIT GRIPE', '20 001', 36.90),
        array('INJETAVEL 1X', '20 002', 35.00),
        array('INJETAVEL 2X', '20 003', 60.00),
        array('AZITRO 3 CP', '20 004', 30.00),
        array('AZITRO 5 CP', '20 005', 35.00),
        array('AZITRO SUSP (TODOS)', '20 006', 49.99),
        array('RIFAMICINA', '20 007', 35.00),
        array('KIT RESSACA', '20 008', 20.00),
        array('OTOLÓGICO', '20 009', 35.00),
        array('OFTÁLMICO', '20 010', 35.00),
        array('LEVOFLOXACINO 500 MG', '20 011', 65.00),
        array('LEVOFLOXACINO 750 MG', '20 012', 75.00),
        array('QUADRIDERM (SIM / GEN)', '20 013', 45.00),
        array('CIPROFLOXACINO', '20 014', 45.00),
        array('CEFALEXINA', '20 015', 29.99),
        array('CEFALEXINA SUSP', '20 016', 49.99),
        array('AMOXILINA 500 - 21CP', '20 017', 39.99),
        array('AMOX / CLAV 875/125 - 14CP', '20 018', 89.90),
        array('AMOXILINA SUSP (TODAS)', '20 019', 56.90),
        array('METRONIDAZOL (TODAS MG)', '20 020', 45.99),
        array('SULFAMET + TRIME (COMP E SUSP)', '20 021', 39.99),
        array('NORFLOXACINO 400MG - 14 CP', '20 022', 45.00),
        array('CREME MÃO', '40 001', 19.99),
        array('WIMI COMPLEX B', '40 002', 59.90),
    );

    $stmt = db()->prepare(
        'INSERT INTO wf_codigos_comissao (codigo, ean, preco, ordem, criado_por) VALUES (?, ?, ?, ?, NULL)'
    );

    foreach ($defaults as $index => $row) {
        $stmt->execute(array($row[0], $row[1], $row[2], ($index + 1) * 10));
    }
}

function codigos_seed_default_groups(): void
{
    $stmt = db()->prepare(
        "INSERT INTO wf_codigos_blocos (group_key, label, ordem, criado_por)
         VALUES (?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE label = VALUES(label), ativo = 1"
    );

    foreach (array(array('20', 10), array('40', 20)) as $defaultGroup) {
        [$group, $order] = $defaultGroup;
        $stmt->execute(array($group, codigos_group_label($group), $order));
    }
}

function codigos_sync_groups_from_items(): void
{
    $stmt = db()->prepare(
        "INSERT INTO wf_codigos_blocos (group_key, label, ordem, criado_por)
         VALUES (?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE ativo = 1"
    );
    $existingOrder = (int) db()->query('SELECT COALESCE(MAX(ordem), 20) FROM wf_codigos_blocos')->fetchColumn();
    $seen = array();

    foreach (db()->query('SELECT ean FROM wf_codigos_comissao WHERE ativo = 1') as $row) {
        $group = codigos_group_key((string) ($row['ean'] ?? ''));
        if ($group === 'outros' || isset($seen[$group])) {
            continue;
        }

        $seen[$group] = true;
        $existingOrder += 10;
        $stmt->execute(array($group, codigos_group_label($group), $existingOrder));
    }
}

function codigos_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /codigos/login.php');
        exit;
    }

    return $user;
}

function codigos_password_matches(array $user, string $password): bool
{
    $hash = (string) ($user['password_hash'] ?? '');

    return $hash !== '' && password_verify($password, $hash);
}

function codigos_redirect_home(): void
{
    header('Location: /codigos/');
    exit;
}

function codigos_clean_text(string $value, int $limit): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? $value);

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($value, 'UTF-8') > $limit ? mb_substr($value, 0, $limit, 'UTF-8') : $value;
    }

    return strlen($value) > $limit ? substr($value, 0, $limit) : $value;
}

function codigos_price_to_decimal($value): float
{
    $price = money_to_decimal($value);

    return round(max(0, $price), 2);
}

function codigos_price_input($value): string
{
    return number_format((float) $value, 2, ',', '.');
}

function codigos_ean_prefix(string $ean): string
{
    $digits = preg_replace('/\D+/', '', $ean) ?? '';

    return substr($digits, 0, 2);
}

function codigos_normalize_group_key(string $value): string
{
    $digits = preg_replace('/\D+/', '', $value) ?? '';

    return strlen($digits) >= 2 ? substr($digits, 0, 2) : '';
}

function codigos_group_key(string $ean): string
{
    $prefix = codigos_ean_prefix($ean);

    if (preg_match('/^\d{2}$/', $prefix) === 1) {
        return $prefix;
    }

    return 'outros';
}

function codigos_is_valid_group_key(string $group): bool
{
    return $group === 'outros' || preg_match('/^\d{2}$/', $group) === 1;
}

function codigos_group_label(string $group): string
{
    if (preg_match('/^\d{2}$/', $group) === 1) {
        return 'EAN ' . $group;
    }

    return 'Outros';
}

function codigos_default_ean_placeholder(string $group): string
{
    if (preg_match('/^\d{2}$/', $group) === 1) {
        return $group . ' 000';
    }

    return 'EAN';
}

function codigos_group_payload(string $group): array
{
    return array(
        'key' => $group,
        'label' => codigos_group_label($group),
        'placeholder' => codigos_default_ean_placeholder($group),
        'can_delete' => codigos_can_delete_group($group),
    );
}

function codigos_group_delete_password(): string
{
    return wf_env_string('CODIGOS_GROUP_DELETE_PASSWORD', 'wimifarma');
}

function codigos_is_protected_group(string $group): bool
{
    return in_array($group, array('20', '40', 'outros'), true);
}

function codigos_can_delete_group(string $group): bool
{
    return preg_match('/^\d{2}$/', $group) === 1 && !codigos_is_protected_group($group);
}

function codigos_saved_group_keys(): array
{
    codigos_ensure_schema();

    $keys = array();
    $stmt = db()->query(
        "SELECT group_key FROM wf_codigos_blocos
         WHERE ativo = 1
         ORDER BY ordem ASC, group_key ASC"
    );

    foreach ($stmt as $row) {
        $group = (string) ($row['group_key'] ?? '');
        if (preg_match('/^\d{2}$/', $group) === 1) {
            $keys[] = $group;
        }
    }

    return $keys;
}

function codigos_save_group(string $group, ?int $userId, bool $log): string
{
    codigos_ensure_schema();
    $group = codigos_normalize_group_key($group);

    if (preg_match('/^\d{2}$/', $group) !== 1) {
        throw new InvalidArgumentException('Informe um EAN com 2 digitos.');
    }

    $exists = db()->prepare('SELECT id FROM wf_codigos_blocos WHERE group_key = ? LIMIT 1');
    $exists->execute(array($group));
    $id = (int) $exists->fetchColumn();

    if ($id > 0) {
        $stmt = db()->prepare('UPDATE wf_codigos_blocos SET label = ?, ativo = 1 WHERE id = ?');
        $stmt->execute(array(codigos_group_label($group), $id));
        return $group;
    }

    $nextOrder = (int) db()->query('SELECT COALESCE(MAX(ordem), 20) + 10 FROM wf_codigos_blocos')->fetchColumn();
    $stmt = db()->prepare(
        'INSERT INTO wf_codigos_blocos (group_key, label, ordem, criado_por) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute(array($group, codigos_group_label($group), $nextOrder, $userId));

    if ($log && function_exists('log_action')) {
        log_action('codigo_bloco_criado', 'codigo', null, 'Bloco ' . codigos_group_label($group) . ' criado.');
    }

    return $group;
}

function codigos_create_group(string $group, ?int $userId): string
{
    return codigos_save_group($group, $userId, true);
}

function codigos_ensure_group_for_ean(string $ean, ?int $userId): void
{
    $group = codigos_group_key($ean);

    if ($group !== 'outros') {
        codigos_save_group($group, $userId, false);
    }
}

function codigos_group_items(array $items): array
{
    $groups = array();

    foreach (codigos_saved_group_keys() as $group) {
        $groups[$group] = array();
    }

    foreach ($items as $item) {
        $group = codigos_group_key((string) ($item['ean'] ?? ''));
        if (!isset($groups[$group])) {
            $groups[$group] = array();
        }
        $groups[$group][] = $item;
    }

    return $groups;
}

function codigos_ordered_group_keys(array $groups): array
{
    $keys = array_unique(array_merge(codigos_saved_group_keys(), array_keys($groups)));
    $numeric = array();

    foreach ($keys as $key) {
        $key = (string) $key;
        if ($key === 'outros') {
            continue;
        }

        if (preg_match('/^\d{2}$/', $key) === 1) {
            $numeric[] = $key;
        }
    }

    usort($numeric, static function (string $left, string $right): int {
        if ($left === '20') {
            return $right === '20' ? 0 : -1;
        }
        if ($right === '20') {
            return 1;
        }
        if ($left === '40') {
            return $right === '40' ? 0 : -1;
        }
        if ($right === '40') {
            return 1;
        }

        return (int) $left <=> (int) $right;
    });

    return $numeric;
}

function codigos_validate_payload(string $codigo, string $ean, $preco): array
{
    $codigo = codigos_clean_text($codigo, 180);
    $ean = codigos_clean_text($ean, 80);
    $preco = codigos_price_to_decimal($preco);

    if ($codigo === '') {
        throw new InvalidArgumentException('Informe o codigo.');
    }

    if ($ean === '') {
        throw new InvalidArgumentException('Informe o EAN.');
    }

    if ($preco <= 0) {
        throw new InvalidArgumentException('Informe um preco maior que zero.');
    }

    return array($codigo, $ean, $preco);
}

function codigos_list(string $search = ''): array
{
    codigos_ensure_schema();
    $search = trim($search);

    if ($search !== '') {
        $like = '%' . $search . '%';
        $stmt = db()->prepare(
            "SELECT * FROM wf_codigos_comissao
             WHERE ativo = 1 AND (codigo LIKE ? OR ean LIKE ?)
             ORDER BY ordem ASC, id ASC"
        );
        $stmt->execute(array($like, $like));
        return $stmt->fetchAll();
    }

    $stmt = db()->query(
        'SELECT * FROM wf_codigos_comissao WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
    );

    return $stmt->fetchAll();
}

function codigos_count_active(): int
{
    codigos_ensure_schema();

    return (int) db()->query('SELECT COUNT(*) FROM wf_codigos_comissao WHERE ativo = 1')->fetchColumn();
}

function codigos_find(int $id): ?array
{
    codigos_ensure_schema();

    if ($id <= 0) {
        return null;
    }

    $stmt = db()->prepare('SELECT * FROM wf_codigos_comissao WHERE id = ? AND ativo = 1 LIMIT 1');
    $stmt->execute(array($id));
    $item = $stmt->fetch();

    return $item ?: null;
}

function codigos_group_ids(string $group): array
{
    $ids = array();

    foreach (codigos_list() as $item) {
        if (codigos_group_key((string) ($item['ean'] ?? '')) === $group) {
            $ids[] = (int) ($item['id'] ?? 0);
        }
    }

    return array_values(array_filter($ids, static function (int $id): bool {
        return $id > 0;
    }));
}

function codigos_reorder_group(string $group, array $orderedIds): void
{
    codigos_ensure_schema();

    if (!codigos_is_valid_group_key($group)) {
        throw new InvalidArgumentException('Grupo invalido.');
    }

    $currentIds = codigos_group_ids($group);
    if (empty($currentIds)) {
        return;
    }

    $currentSet = array_fill_keys($currentIds, true);
    $seen = array();
    $finalIds = array();

    foreach ($orderedIds as $id) {
        $id = (int) $id;
        if ($id > 0 && isset($currentSet[$id]) && !isset($seen[$id])) {
            $seen[$id] = true;
            $finalIds[] = $id;
        }
    }

    foreach ($currentIds as $id) {
        if (!isset($seen[$id])) {
            $finalIds[] = $id;
        }
    }

    $pdo = db();
    $stmt = $pdo->prepare('UPDATE wf_codigos_comissao SET ordem = ? WHERE id = ? AND ativo = 1');

    $pdo->beginTransaction();
    try {
        foreach ($finalIds as $index => $id) {
            $stmt->execute(array(($index + 1) * 10, $id));
        }
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('codigo_comissao_reordenado', 'codigo', null, 'Grupo ' . $group . ' reordenado.');
    }
}

function codigos_create(string $codigo, string $ean, $preco, ?int $userId): int
{
    codigos_ensure_schema();
    [$codigo, $ean, $preco] = codigos_validate_payload($codigo, $ean, $preco);
    codigos_ensure_group_for_ean($ean, $userId);
    $nextOrder = (int) db()->query('SELECT COALESCE(MAX(ordem), 0) + 10 FROM wf_codigos_comissao')->fetchColumn();

    $stmt = db()->prepare(
        'INSERT INTO wf_codigos_comissao (codigo, ean, preco, ordem, criado_por) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($codigo, $ean, $preco, $nextOrder, $userId));
    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action('codigo_comissao_criado', 'codigo', $id, 'Codigo criado: ' . $codigo . ' / ' . $ean);
    }

    return $id;
}

function codigos_update(int $id, string $codigo, string $ean, $preco): void
{
    codigos_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Codigo invalido.');
    }

    [$codigo, $ean, $preco] = codigos_validate_payload($codigo, $ean, $preco);
    codigos_ensure_group_for_ean($ean, null);

    $exists = db()->prepare('SELECT id FROM wf_codigos_comissao WHERE id = ? AND ativo = 1 LIMIT 1');
    $exists->execute(array($id));
    if (!$exists->fetchColumn()) {
        throw new InvalidArgumentException('Codigo nao encontrado.');
    }

    $stmt = db()->prepare(
        'UPDATE wf_codigos_comissao SET codigo = ?, ean = ?, preco = ? WHERE id = ? AND ativo = 1'
    );
    $stmt->execute(array($codigo, $ean, $preco, $id));

    if (function_exists('log_action')) {
        log_action('codigo_comissao_editado', 'codigo', $id, 'Codigo editado: ' . $codigo . ' / ' . $ean);
    }
}

function codigos_delete(int $id): void
{
    codigos_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Codigo invalido.');
    }

    $stmt = db()->prepare(
        'UPDATE wf_codigos_comissao SET ativo = 0, apagado_em = NOW() WHERE id = ? AND ativo = 1'
    );
    $stmt->execute(array($id));

    if ($stmt->rowCount() < 1) {
        throw new InvalidArgumentException('Codigo nao encontrado.');
    }

    if (function_exists('log_action')) {
        log_action('codigo_comissao_apagado', 'codigo', $id, 'Codigo apagado da lista operacional.');
    }
}

function codigos_delete_group(string $group, string $password): int
{
    codigos_ensure_schema();
    $group = codigos_normalize_group_key($group);

    if (!codigos_can_delete_group($group)) {
        throw new InvalidArgumentException('Este bloco nao pode ser apagado.');
    }

    if (!hash_equals(codigos_group_delete_password(), $password)) {
        throw new InvalidArgumentException('Senha incorreta para excluir a tabela.');
    }

    $ids = codigos_group_ids($group);
    $pdo = db();
    $block = $pdo->prepare('SELECT id FROM wf_codigos_blocos WHERE group_key = ? AND ativo = 1 LIMIT 1');
    $block->execute(array($group));
    $blockId = (int) $block->fetchColumn();

    if ($blockId <= 0 && empty($ids)) {
        throw new InvalidArgumentException('Bloco nao encontrado.');
    }

    $deletedItems = 0;
    $pdo->beginTransaction();

    try {
        $deactivateBlock = $pdo->prepare('UPDATE wf_codigos_blocos SET ativo = 0 WHERE group_key = ? AND ativo = 1');
        $deactivateBlock->execute(array($group));

        if (!empty($ids)) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $deleteItems = $pdo->prepare(
                'UPDATE wf_codigos_comissao SET ativo = 0, apagado_em = NOW() WHERE ativo = 1 AND id IN (' . $placeholders . ')'
            );
            $deleteItems->execute($ids);
            $deletedItems = $deleteItems->rowCount();
        }

        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action(
            'codigo_bloco_apagado',
            'codigo',
            $blockId > 0 ? $blockId : null,
            'Bloco ' . codigos_group_label($group) . ' apagado com ' . $deletedItems . ' codigo(s).'
        );
    }

    return $deletedItems;
}
