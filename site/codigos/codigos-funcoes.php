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

    codigos_seed_defaults();
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

function codigos_create(string $codigo, string $ean, $preco, ?int $userId): int
{
    codigos_ensure_schema();
    [$codigo, $ean, $preco] = codigos_validate_payload($codigo, $ean, $preco);
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
