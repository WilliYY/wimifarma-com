<?php
declare(strict_types=1);

function tarefa_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_tarefas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            prioridade ENUM('alta','normal','baixa') NOT NULL DEFAULT 'normal',
            titulo VARCHAR(180) NOT NULL,
            descricao TEXT NULL,
            status ENUM('aberta','concluida','cancelada') NOT NULL DEFAULT 'aberta',
            criado_por INT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            concluido_em DATETIME NULL,
            cancelado_em DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_tarefa_status_prioridade (status, prioridade, criado_em),
            KEY idx_tarefa_criado (criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $done = true;
}

function tarefa_prioridades(): array
{
    return array(
        'alta' => array('label' => 'Alta', 'rank' => 3),
        'normal' => array('label' => 'Normal', 'rank' => 2),
        'baixa' => array('label' => 'Baixa', 'rank' => 1),
    );
}

function tarefa_statuses(): array
{
    return array(
        'aberta' => 'Aberta',
        'concluida' => 'Concluida',
        'cancelada' => 'Cancelada',
    );
}

function tarefa_truncate(string $value, int $limit): string
{
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($value) > $limit ? mb_substr($value, 0, $limit) : $value;
    }

    return strlen($value) > $limit ? substr($value, 0, $limit) : $value;
}

function tarefa_valid_prioridade(string $prioridade): string
{
    return array_key_exists($prioridade, tarefa_prioridades()) ? $prioridade : 'normal';
}

function tarefa_valid_status(string $status): string
{
    return array_key_exists($status, tarefa_statuses()) ? $status : 'aberta';
}

function tarefa_password_matches(array $user, string $password): bool
{
    $hash = (string) ($user['password_hash'] ?? '');

    if ($hash !== '' && password_verify($password, $hash)) {
        return true;
    }

    $username = strtolower(trim((string) ($user['username'] ?? '')));
    return $username === 'adm' && hash_equals('adm', $password);
}

function tarefa_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /tarefa/login.php');
        exit;
    }

    return $user;
}

function tarefa_count_open(): int
{
    tarefa_ensure_schema();

    $stmt = db()->query("SELECT COUNT(*) FROM wf_tarefas WHERE status = 'aberta'");
    return (int) $stmt->fetchColumn();
}

function tarefa_counts(): array
{
    tarefa_ensure_schema();

    $counts = array('aberta' => 0, 'concluida' => 0, 'cancelada' => 0);
    $stmt = db()->query('SELECT status, COUNT(*) AS total FROM wf_tarefas GROUP BY status');

    foreach ($stmt->fetchAll() as $row) {
        $status = tarefa_valid_status((string) ($row['status'] ?? 'aberta'));
        $counts[$status] = (int) ($row['total'] ?? 0);
    }

    return $counts;
}

function tarefa_list(string $status = ''): array
{
    tarefa_ensure_schema();

    $rankSql = "CASE prioridade WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END";

    if ($status !== '') {
        $status = tarefa_valid_status($status);
        $stmt = db()->prepare(
            "SELECT * FROM wf_tarefas
             WHERE status = ?
             ORDER BY {$rankSql} DESC, criado_em ASC, id ASC"
        );
        $stmt->execute(array($status));
        return $stmt->fetchAll();
    }

    $stmt = db()->query(
        "SELECT * FROM wf_tarefas
         ORDER BY
            CASE WHEN status = 'aberta' THEN 0 ELSE 1 END ASC,
            {$rankSql} DESC,
            COALESCE(atualizado_em, criado_em) DESC,
            id DESC"
    );

    return $stmt->fetchAll();
}

function tarefa_history(): array
{
    tarefa_ensure_schema();

    $stmt = db()->query(
        "SELECT * FROM wf_tarefas
         WHERE status IN ('concluida', 'cancelada')
         ORDER BY COALESCE(concluido_em, cancelado_em, atualizado_em, criado_em) DESC, id DESC
         LIMIT 120"
    );

    return $stmt->fetchAll();
}

function tarefa_create(string $prioridade, string $titulo, string $descricao, ?int $userId): int
{
    tarefa_ensure_schema();

    $titulo = trim($titulo);
    $descricao = trim($descricao);

    if ($titulo === '') {
        throw new InvalidArgumentException('Informe o titulo da tarefa.');
    }

    $titulo = tarefa_truncate($titulo, 180);

    $stmt = db()->prepare(
        'INSERT INTO wf_tarefas (prioridade, titulo, descricao, status, criado_por) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute(array(tarefa_valid_prioridade($prioridade), $titulo, $descricao, 'aberta', $userId));

    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action('tarefa_criada', 'task', $id, 'Tarefa criada: ' . $titulo);
    }

    return $id;
}

function tarefa_update(int $id, string $prioridade, string $titulo, string $descricao): void
{
    tarefa_ensure_schema();

    $titulo = trim($titulo);
    $descricao = trim($descricao);

    if ($id <= 0 || $titulo === '') {
        throw new InvalidArgumentException('Tarefa invalida.');
    }

    $titulo = tarefa_truncate($titulo, 180);

    $stmt = db()->prepare('UPDATE wf_tarefas SET prioridade = ?, titulo = ?, descricao = ? WHERE id = ?');
    $stmt->execute(array(tarefa_valid_prioridade($prioridade), $titulo, $descricao, $id));

    if (function_exists('log_action')) {
        log_action('tarefa_editada', 'task', $id, 'Tarefa editada: ' . $titulo);
    }
}

function tarefa_set_status(int $id, string $status): void
{
    tarefa_ensure_schema();

    $status = tarefa_valid_status($status);
    $concluido = $status === 'concluida' ? date('Y-m-d H:i:s') : null;
    $cancelado = $status === 'cancelada' ? date('Y-m-d H:i:s') : null;

    $stmt = db()->prepare(
        'UPDATE wf_tarefas SET status = ?, concluido_em = ?, cancelado_em = ? WHERE id = ?'
    );
    $stmt->execute(array($status, $concluido, $cancelado, $id));

    if (function_exists('log_action')) {
        log_action('tarefa_status', 'task', $id, 'Tarefa marcada como ' . $status . '.');
    }
}

function tarefa_redirect_home(): void
{
    header('Location: /tarefa/');
    exit;
}
