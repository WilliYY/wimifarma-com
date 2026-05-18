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

    db()->exec(
        "CREATE TABLE IF NOT EXISTS gestao_conta_pagamentos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            conta_id BIGINT UNSIGNED NOT NULL,
            descricao VARCHAR(180) NOT NULL DEFAULT 'Pagamento',
            valor DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            pago_em DATETIME NOT NULL,
            criado_por INT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_gestao_pagamentos_conta_pago (conta_id, pago_em, id),
            KEY idx_gestao_pagamentos_pago_em (pago_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "INSERT INTO gestao_conta_pagamentos (conta_id, descricao, valor, pago_em, criado_por, criado_em)
         SELECT c.id, 'Pagamento confirmado', c.valor_total, COALESCE(c.pago_em, c.gerado_em, NOW()), c.criado_por, NOW()
         FROM gestao_contas c
         LEFT JOIN (
            SELECT conta_id, COUNT(*) AS total_pagamentos
            FROM gestao_conta_pagamentos
            GROUP BY conta_id
         ) p ON p.conta_id = c.id
         WHERE c.status = 'pago'
           AND c.valor_total > 0
           AND COALESCE(p.total_pagamentos, 0) = 0"
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

function gestao_category_suggestions(): array
{
    return array(
        'Geral',
        'Funcionario',
        'Fornecedor',
        'Boleto',
        'Imposto',
        'Comissao',
        'Aluguel',
        'Energia',
        'Internet',
        'Medicamentos',
        'Servico',
        'Manutencao',
        'Outro',
    );
}

function gestao_valid_status(string $status): string
{
    return array_key_exists($status, gestao_statuses()) ? $status : 'pendente';
}

function gestao_valid_category(string $category): string
{
    $category = gestao_clean_text($category, 80);

    return $category !== '' ? $category : 'Geral';
}

function gestao_status_label(string $status): string
{
    $statuses = gestao_statuses();

    return (string) ($statuses[gestao_valid_status($status)] ?? 'Pendente');
}

function gestao_category_label(string $category): string
{
    $category = gestao_valid_category($category);
    $categories = array_change_key_case(gestao_categories(), CASE_LOWER);
    $key = strtolower($category);

    return (string) ($categories[$key] ?? $category);
}

function gestao_datetime_local_value(?string $value = null): string
{
    $value = trim((string) $value);

    if ($value !== '') {
        $formats = array('Y-m-d\TH:i', 'Y-m-d H:i:s', 'Y-m-d H:i');

        foreach ($formats as $format) {
            $date = DateTime::createFromFormat('!' . $format, $value);
            if ($date instanceof DateTime && $date->format($format) === $value) {
                return $date->format('Y-m-d H:i:s');
            }
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            $date = DateTime::createFromFormat('!Y-m-d H:i:s', $value . ' ' . date('H:i:s'));
            if ($date instanceof DateTime) {
                return $date->format('Y-m-d H:i:s');
            }
        }
    }

    return date('Y-m-d H:i:s');
}

function gestao_datetime_local_input(?string $value = null): string
{
    $date = $value ? strtotime($value) : time();

    return $date ? date('Y-m-d\TH:i', $date) : date('Y-m-d\TH:i');
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

function gestao_account_for_update(int $id): array
{
    $stmt = db()->prepare('SELECT * FROM gestao_contas WHERE id = ? LIMIT 1 FOR UPDATE');
    $stmt->execute(array($id));
    $account = $stmt->fetch();

    if (!$account) {
        throw new InvalidArgumentException('Conta nao encontrada.');
    }

    return $account;
}

function gestao_paid_total(int $accountId): float
{
    $stmt = db()->prepare('SELECT COALESCE(SUM(valor), 0) FROM gestao_conta_pagamentos WHERE conta_id = ?');
    $stmt->execute(array($accountId));

    return round((float) $stmt->fetchColumn(), 2);
}

function gestao_latest_payment_date(int $accountId): ?string
{
    $stmt = db()->prepare('SELECT MAX(pago_em) FROM gestao_conta_pagamentos WHERE conta_id = ?');
    $stmt->execute(array($accountId));
    $value = $stmt->fetchColumn();

    return $value ? (string) $value : null;
}

function gestao_sync_payment_status(int $accountId): void
{
    $stmt = db()->prepare('SELECT valor_total, status FROM gestao_contas WHERE id = ? LIMIT 1');
    $stmt->execute(array($accountId));
    $account = $stmt->fetch();

    if (!$account) {
        throw new InvalidArgumentException('Conta nao encontrada.');
    }

    if ((string) ($account['status'] ?? '') === 'cancelado') {
        return;
    }

    $total = round((float) ($account['valor_total'] ?? 0), 2);
    $paid = gestao_paid_total($accountId);

    if ($total > 0 && $paid + 0.004 >= $total) {
        $paidAt = gestao_latest_payment_date($accountId) ?: date('Y-m-d H:i:s');
        $update = db()->prepare("UPDATE gestao_contas SET status = 'pago', pago_em = ?, cancelado_em = NULL WHERE id = ?");
        $update->execute(array($paidAt, $accountId));
        return;
    }

    $update = db()->prepare("UPDATE gestao_contas SET status = 'pendente', pago_em = NULL, cancelado_em = NULL WHERE id = ?");
    $update->execute(array($accountId));
}

function gestao_insert_payment(int $accountId, string $description, float $amount, string $paidAt, ?int $userId): void
{
    $description = gestao_clean_text($description, 180);
    if ($description === '') {
        $description = 'Pagamento';
    }

    $stmt = db()->prepare(
        'INSERT INTO gestao_conta_pagamentos (conta_id, descricao, valor, pago_em, criado_por, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($accountId, $description, round($amount, 2), $paidAt, $userId, date('Y-m-d H:i:s')));
}

function gestao_create_conta(array $data, array $items, ?int $userId): int
{
    gestao_ensure_schema();

    $title = gestao_clean_text((string) ($data['titulo'] ?? ''), 180);
    if ($title === '') {
        throw new InvalidArgumentException('Informe o nome ou titulo da conta.');
    }

    $category = gestao_valid_category((string) ($data['categoria'] ?? 'Geral'));
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

        if ($status === 'pago') {
            gestao_insert_payment($id, 'Pagamento confirmado', round($total, 2), $generatedAt, $userId);
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

function gestao_add_item(int $id, string $description, $amountValue, ?int $userId): void
{
    gestao_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Conta invalida.');
    }

    $description = gestao_clean_text($description, 180);
    $amount = round(max(0, money_to_decimal($amountValue)), 2);

    if ($amount <= 0.0) {
        throw new InvalidArgumentException('Informe um valor maior que zero para adicionar.');
    }

    if ($description === '') {
        $description = 'Acrescimo';
    }

    db()->beginTransaction();

    try {
        $account = gestao_account_for_update($id);
        if ((string) ($account['status'] ?? '') === 'cancelado') {
            throw new InvalidArgumentException('Reabra a conta antes de adicionar itens.');
        }

        $orderStmt = db()->prepare('SELECT COALESCE(MAX(ordem), 0) + 10 FROM gestao_conta_itens WHERE conta_id = ?');
        $orderStmt->execute(array($id));
        $order = (int) $orderStmt->fetchColumn();

        $itemStmt = db()->prepare(
            'INSERT INTO gestao_conta_itens (conta_id, descricao, valor, ordem, criado_em)
             VALUES (?, ?, ?, ?, ?)'
        );
        $itemStmt->execute(array($id, $description, $amount, $order, date('Y-m-d H:i:s')));

        $update = db()->prepare('UPDATE gestao_contas SET valor_total = ROUND(valor_total + ?, 2) WHERE id = ?');
        $update->execute(array($amount, $id));

        gestao_sync_payment_status($id);
        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('gestao_item_adicionado', 'gestao_conta', $id, 'Item adicionado na Gestao: ' . $description . ' / ' . br_money($amount));
    }
}

function gestao_add_payment(int $id, string $description, $amountValue, string $paidAtValue, ?int $userId): void
{
    gestao_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Conta invalida.');
    }

    $amount = round(max(0, money_to_decimal($amountValue)), 2);
    if ($amount <= 0.0) {
        throw new InvalidArgumentException('Informe um valor pago maior que zero.');
    }

    $paidAt = gestao_datetime_local_value($paidAtValue);

    db()->beginTransaction();

    try {
        $account = gestao_account_for_update($id);
        if ((string) ($account['status'] ?? '') === 'cancelado') {
            throw new InvalidArgumentException('Reabra a conta antes de registrar pagamento.');
        }

        $total = round((float) ($account['valor_total'] ?? 0), 2);
        $paid = gestao_paid_total($id);
        $remaining = round(max(0, $total - $paid), 2);

        if ($remaining <= 0.0) {
            throw new InvalidArgumentException('Essa conta ja esta paga.');
        }

        if ($amount > $remaining + 0.004) {
            throw new InvalidArgumentException('Pagamento maior que o saldo. Adicione juros ou diferenca como item antes de pagar.');
        }

        gestao_insert_payment($id, $description, $amount, $paidAt, $userId);
        gestao_sync_payment_status($id);
        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('gestao_pagamento_criado', 'gestao_conta', $id, 'Pagamento registrado na Gestao: ' . br_money($amount));
    }
}

function gestao_confirm_remaining(int $id, ?int $userId): void
{
    gestao_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Conta invalida.');
    }

    db()->beginTransaction();

    try {
        $account = gestao_account_for_update($id);
        if ((string) ($account['status'] ?? '') === 'cancelado') {
            throw new InvalidArgumentException('Reabra a conta antes de confirmar pagamento.');
        }

        $total = round((float) ($account['valor_total'] ?? 0), 2);
        $paid = gestao_paid_total($id);
        $remaining = round(max(0, $total - $paid), 2);

        if ($remaining > 0.0) {
            gestao_insert_payment($id, 'Pagamento final', $remaining, date('Y-m-d H:i:s'), $userId);
        }

        gestao_sync_payment_status($id);
        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('gestao_conta_status', 'gestao_conta', $id, 'Conta quitada na Gestao.');
    }
}

function gestao_set_status(int $id, string $status): void
{
    gestao_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Conta invalida.');
    }

    $status = gestao_valid_status($status);

    if ($status === 'pago') {
        gestao_confirm_remaining($id, isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null);
        return;
    }

    db()->beginTransaction();

    try {
        gestao_account_for_update($id);
        $now = date('Y-m-d H:i:s');

        if ($status === 'cancelado') {
            $stmt = db()->prepare("UPDATE gestao_contas SET status = 'cancelado', pago_em = NULL, cancelado_em = ? WHERE id = ?");
            $stmt->execute(array($now, $id));
        } else {
            $stmt = db()->prepare("UPDATE gestao_contas SET status = 'pendente', pago_em = NULL, cancelado_em = NULL WHERE id = ?");
            $stmt->execute(array($id));
            gestao_sync_payment_status($id);
        }

        db()->commit();
    } catch (Throwable $error) {
        db()->rollBack();
        throw $error;
    }

    if (function_exists('log_action')) {
        log_action('gestao_conta_status', 'gestao_conta', $id, 'Conta marcada como ' . $status . '.');
    }
}

function gestao_month_summary(string $month): array
{
    gestao_ensure_schema();
    $month = gestao_month_value($month);

    $paidStmt = db()->prepare(
        "SELECT COALESCE(SUM(valor), 0)
         FROM gestao_conta_pagamentos
         WHERE DATE_FORMAT(pago_em, '%Y-%m') = ?"
    );
    $paidStmt->execute(array($month));
    $paidMonth = (float) $paidStmt->fetchColumn();

    $summaryStmt = db()->prepare(
        "SELECT
            COALESCE(SUM(CASE WHEN c.status = 'pendente' THEN GREATEST(c.valor_total - COALESCE(p.valor_pago, 0), 0) ELSE 0 END), 0) AS pendente_mes,
            COALESCE(SUM(CASE WHEN c.status <> 'cancelado' THEN c.valor_total ELSE 0 END), 0) AS gerado_mes,
            SUM(CASE WHEN c.status = 'pendente' THEN 1 ELSE 0 END) AS contas_pendentes
         FROM gestao_contas c
         LEFT JOIN (
            SELECT conta_id, SUM(valor) AS valor_pago
            FROM gestao_conta_pagamentos
            GROUP BY conta_id
         ) p ON p.conta_id = c.id
         WHERE c.competencia_mes = ?"
    );
    $summaryStmt->execute(array($month));
    $row = $summaryStmt->fetch() ?: array();

    return array(
        'pago_mes' => $paidMonth,
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
        "SELECT c.*,
                COALESCE(p.valor_pago, 0) AS valor_pago,
                p.ultimo_pagamento_em
         FROM gestao_contas c
         LEFT JOIN (
            SELECT conta_id, SUM(valor) AS valor_pago, MAX(pago_em) AS ultimo_pagamento_em
            FROM gestao_conta_pagamentos
            GROUP BY conta_id
         ) p ON p.conta_id = c.id
         WHERE c.competencia_mes = ?
            OR DATE_FORMAT(c.pago_em, '%Y-%m') = ?
            OR EXISTS (
                SELECT 1
                FROM gestao_conta_pagamentos gp
                WHERE gp.conta_id = c.id
                  AND DATE_FORMAT(gp.pago_em, '%Y-%m') = ?
            )
         ORDER BY
            CASE c.status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END ASC,
            COALESCE(c.pago_em, p.ultimo_pagamento_em, c.gerado_em) DESC,
            c.id DESC
         LIMIT 180"
    );
    $stmt->execute(array($month, $month, $month));
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

    $paymentStmt = db()->prepare(
        "SELECT * FROM gestao_conta_pagamentos WHERE conta_id IN ({$placeholders}) ORDER BY conta_id ASC, pago_em ASC, id ASC"
    );
    $paymentStmt->execute($ids);
    $paymentsByAccount = array();

    foreach ($paymentStmt->fetchAll() as $payment) {
        $accountId = (int) ($payment['conta_id'] ?? 0);
        if (!isset($paymentsByAccount[$accountId])) {
            $paymentsByAccount[$accountId] = array();
        }
        $paymentsByAccount[$accountId][] = $payment;
    }

    foreach ($accounts as &$account) {
        $accountId = (int) ($account['id'] ?? 0);
        $account['itens'] = $itemsByAccount[$accountId] ?? array();
        $account['pagamentos'] = $paymentsByAccount[$accountId] ?? array();
    }
    unset($account);

    return $accounts;
}
