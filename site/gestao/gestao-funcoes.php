<?php
declare(strict_types=1);

function gestao_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS gestao_contas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            titulo VARCHAR(180) NOT NULL,
            categoria VARCHAR(80) NOT NULL DEFAULT 'geral',
            status ENUM('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
            valor_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            competencia_mes CHAR(7) NOT NULL,
            observacao TEXT NULL,
            criado_por INT UNSIGNED NULL,
            gerado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            pago_em DATETIME NULL,
            cancelado_em DATETIME NULL,
            atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_gestao_status_competencia (status, competencia_mes),
            KEY idx_gestao_pago_em (pago_em),
            KEY idx_gestao_gerado_em (gerado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS gestao_conta_itens (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            conta_id BIGINT UNSIGNED NOT NULL,
            descricao VARCHAR(180) NOT NULL,
            valor DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            ordem INT UNSIGNED NOT NULL DEFAULT 0,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_gestao_itens_conta_ordem (conta_id, ordem, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $done = true;
}

function gestao_password_matches(array $user, string $password): bool
{
    $hash = (string) ($user['password_hash'] ?? '');

    if ($hash !== '' && password_verify($password, $hash)) {
        return true;
    }

    $username = strtolower(trim((string) ($user['username'] ?? '')));
    return $username === 'adm' && hash_equals('adm', $password);
}

function gestao_is_allowed_user(array $user): bool
{
    $username = strtolower(trim((string) ($user['username'] ?? '')));
    $role = strtolower(trim((string) ($user['role'] ?? '')));

    return $username === 'adm' || in_array($role, array('admin', 'gerente'), true);
}

function gestao_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /gestao/login.php');
        exit;
    }

    if (!gestao_is_allowed_user($user)) {
        header('Location: /gestao/login.php?restrito=1');
        exit;
    }

    return $user;
}

function gestao_redirect_home(string $month = ''): void
{
    $target = '/gestao/';
    if ($month !== '') {
        $target .= '?mes=' . rawurlencode($month);
    }

    header('Location: ' . $target);
    exit;
}

function gestao_clean_text(string $value, int $limit): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? $value);

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($value, 'UTF-8') > $limit ? mb_substr($value, 0, $limit, 'UTF-8') : $value;
    }

    return strlen($value) > $limit ? substr($value, 0, $limit) : $value;
}

function gestao_month_value(?string $value = null): string
{
    $value = trim((string) $value);

    if (preg_match('/^\d{4}-\d{2}$/', $value) === 1) {
        $date = DateTime::createFromFormat('!Y-m-d', $value . '-01');
        if ($date instanceof DateTime && $date->format('Y-m') === $value) {
            return $value;
        }
    }

    return date('Y-m');
}

function gestao_month_label(string $month): string
{
    $date = DateTime::createFromFormat('!Y-m-d', gestao_month_value($month) . '-01');

    return $date instanceof DateTime ? $date->format('m/Y') : date('m/Y');
}

function gestao_statuses(): array
{
    return array(
        'pendente' => 'Pendente',
        'pago' => 'Pago',
        'cancelado' => 'Cancelado',
    );
}

function gestao_categories(): array
{
    return array(
        'geral' => 'Geral',
        'funcionario' => 'Funcionario',
        'fornecedor' => 'Fornecedor',
        'boleto' => 'Boleto',
        'imposto' => 'Imposto',
        'comissao' => 'Comissao',
        'outro' => 'Outro',
    );
}

function gestao_valid_status(string $status): string
{
    return array_key_exists($status, gestao_statuses()) ? $status : 'pendente';
}

function gestao_valid_category(string $category): string
{
    return array_key_exists($category, gestao_categories()) ? $category : 'geral';
}

function gestao_status_label(string $status): string
{
    $statuses = gestao_statuses();

    return (string) ($statuses[gestao_valid_status($status)] ?? 'Pendente');
}

function gestao_category_label(string $category): string
{
    $categories = gestao_categories();

    return (string) ($categories[gestao_valid_category($category)] ?? 'Geral');
}

function gestao_money_input($value): string
{
    return number_format((float) $value, 2, ',', '.');
}

function gestao_post_items(array $post): array
{
    $descriptions = $post['item_descricao'] ?? array();
    $values = $post['item_valor'] ?? array();
    $descriptions = is_array($descriptions) ? $descriptions : array();
    $values = is_array($values) ? $values : array();
    $items = array();
    $max = min(max(count($descriptions), count($values)), 30);

    for ($index = 0; $index < $max; $index++) {
        $description = gestao_clean_text((string) ($descriptions[$index] ?? ''), 180);
        $amount = round(max(0, money_to_decimal($values[$index] ?? '0')), 2);

        if ($description === '' && $amount <= 0.0) {
            continue;
        }

        if ($amount <= 0.0) {
            throw new InvalidArgumentException('Cada item usado precisa ter valor maior que zero.');
        }

        if ($description === '') {
            $description = 'Valor principal';
        }

        $items[] = array(
            'descricao' => $description,
            'valor' => $amount,
        );
    }

    if (empty($items)) {
        throw new InvalidArgumentException('Informe pelo menos um item com valor.');
    }

    return $items;
}

function gestao_create_conta(array $data, array $items, ?int $userId): int
{
    gestao_ensure_schema();

    $title = gestao_clean_text((string) ($data['titulo'] ?? ''), 180);
    if ($title === '') {
        throw new InvalidArgumentException('Informe o nome ou titulo da conta.');
    }

    $category = gestao_valid_category((string) ($data['categoria'] ?? 'geral'));
    $status = gestao_valid_status((string) ($data['status'] ?? 'pendente'));
    if (!in_array($status, array('pendente', 'pago'), true)) {
        $status = 'pendente';
    }

    $month = gestao_month_value((string) ($data['competencia_mes'] ?? ''));
    $note = trim((string) ($data['observacao'] ?? ''));
    $total = 0.0;

    foreach ($items as $item) {
        $total += (float) $item['valor'];
    }

    $generatedAt = date('Y-m-d H:i:s');
    $paidAt = $status === 'pago' ? $generatedAt : null;

    db()->beginTransaction();

    try {
        $stmt = db()->prepare(
            'INSERT INTO gestao_contas (titulo, categoria, status, valor_total, competencia_mes, observacao, criado_por, gerado_em, pago_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array($title, $category, $status, round($total, 2), $month, $note, $userId, $generatedAt, $paidAt));
        $id = (int) db()->lastInsertId();

        $itemStmt = db()->prepare(
            'INSERT INTO gestao_conta_itens (conta_id, descricao, valor, ordem) VALUES (?, ?, ?, ?)'
        );

        foreach ($items as $index => $item) {
            $itemStmt->execute(array($id, $item['descricao'], round((float) $item['valor'], 2), ($index + 1) * 10));
        }

        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('gestao_conta_criada', 'gestao_conta', $id, 'Conta criada: ' . $title . ' / ' . br_money($total));
    }

    return $id;
}

function gestao_set_status(int $id, string $status): void
{
    gestao_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Conta invalida.');
    }

    $status = gestao_valid_status($status);
    $now = date('Y-m-d H:i:s');
    $paidAt = $status === 'pago' ? $now : null;
    $canceledAt = $status === 'cancelado' ? $now : null;

    $stmt = db()->prepare(
        'UPDATE gestao_contas
         SET status = ?, pago_em = ?, cancelado_em = ?
         WHERE id = ?'
    );
    $stmt->execute(array($status, $paidAt, $canceledAt, $id));

    if ($stmt->rowCount() < 1) {
        throw new InvalidArgumentException('Conta nao encontrada.');
    }

    if (function_exists('log_action')) {
        log_action('gestao_conta_status', 'gestao_conta', $id, 'Conta marcada como ' . $status . '.');
    }
}

function gestao_month_summary(string $month): array
{
    gestao_ensure_schema();
    $month = gestao_month_value($month);

    $stmt = db()->prepare(
        "SELECT
            COALESCE(SUM(CASE WHEN status = 'pago' AND DATE_FORMAT(pago_em, '%Y-%m') = ? THEN valor_total ELSE 0 END), 0) AS pago_mes,
            COALESCE(SUM(CASE WHEN status = 'pendente' AND competencia_mes = ? THEN valor_total ELSE 0 END), 0) AS pendente_mes,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' AND competencia_mes = ? THEN valor_total ELSE 0 END), 0) AS gerado_mes,
            SUM(CASE WHEN status = 'pendente' AND competencia_mes = ? THEN 1 ELSE 0 END) AS contas_pendentes
         FROM gestao_contas"
    );
    $stmt->execute(array($month, $month, $month, $month));
    $row = $stmt->fetch() ?: array();

    return array(
        'pago_mes' => (float) ($row['pago_mes'] ?? 0),
        'pendente_mes' => (float) ($row['pendente_mes'] ?? 0),
        'gerado_mes' => (float) ($row['gerado_mes'] ?? 0),
        'contas_pendentes' => (int) ($row['contas_pendentes'] ?? 0),
    );
}

function gestao_list_contas(string $month): array
{
    gestao_ensure_schema();
    $month = gestao_month_value($month);

    $stmt = db()->prepare(
        "SELECT *
         FROM gestao_contas
         WHERE competencia_mes = ? OR DATE_FORMAT(pago_em, '%Y-%m') = ?
         ORDER BY
            CASE status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END ASC,
            COALESCE(pago_em, gerado_em) DESC,
            id DESC
         LIMIT 180"
    );
    $stmt->execute(array($month, $month));
    $accounts = $stmt->fetchAll();

    if (empty($accounts)) {
        return array();
    }

    $ids = array_map(static function (array $account): int {
        return (int) ($account['id'] ?? 0);
    }, $accounts);
    $ids = array_values(array_filter($ids));

    if (empty($ids)) {
        return $accounts;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $itemStmt = db()->prepare(
        "SELECT * FROM gestao_conta_itens WHERE conta_id IN ({$placeholders}) ORDER BY conta_id ASC, ordem ASC, id ASC"
    );
    $itemStmt->execute($ids);
    $itemsByAccount = array();

    foreach ($itemStmt->fetchAll() as $item) {
        $accountId = (int) ($item['conta_id'] ?? 0);
        if (!isset($itemsByAccount[$accountId])) {
            $itemsByAccount[$accountId] = array();
        }
        $itemsByAccount[$accountId][] = $item;
    }

    foreach ($accounts as &$account) {
        $account['itens'] = $itemsByAccount[(int) ($account['id'] ?? 0)] ?? array();
    }
    unset($account);

    return $accounts;
}
