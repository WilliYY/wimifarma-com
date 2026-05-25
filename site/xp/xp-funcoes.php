<?php
declare(strict_types=1);

const XP_POINTS_PER_THOUSAND_REAIS = 2500;
const XP_FIRST_LEVEL_REQUIREMENT = 30000;
const XP_UPLOAD_MAX_BYTES = 3145728;
const XP_TRACK_BASE_LEVELS = 20;
const XP_TRACK_DYNAMIC_LEVELS = 20;
const XP_ADMIN_SYSTEM_KEY = 'adm';

function xp_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_xp_employees (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(180) NOT NULL,
            photo_path VARCHAR(255) NULL,
            status ENUM('ativo', 'inativo') NOT NULL DEFAULT 'ativo',
            system_key VARCHAR(32) NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_xp_employees_status_name (status, name),
            KEY idx_xp_employees_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    xp_ensure_column(
        'wf_xp_employees',
        'system_key',
        'ALTER TABLE wf_xp_employees ADD COLUMN system_key VARCHAR(32) NULL AFTER status'
    );
    xp_ensure_index(
        'wf_xp_employees',
        'ux_xp_employees_system_key',
        'ALTER TABLE wf_xp_employees ADD UNIQUE KEY ux_xp_employees_system_key (system_key)'
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_xp_sales (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            employee_id BIGINT UNSIGNED NOT NULL,
            sale_date DATE NOT NULL,
            amount_cents BIGINT UNSIGNED NOT NULL,
            xp_points BIGINT UNSIGNED NOT NULL,
            note VARCHAR(255) NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            deleted_by INT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY idx_xp_sales_employee_date (employee_id, sale_date),
            KEY idx_xp_sales_date (sale_date),
            KEY idx_xp_sales_active (deleted_at, sale_date),
            CONSTRAINT fk_xp_sales_employee
                FOREIGN KEY (employee_id) REFERENCES wf_xp_employees(id)
                ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_xp_settings (
            setting_key VARCHAR(80) NOT NULL,
            setting_value TEXT NULL,
            updated_by INT UNSIGNED NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    xp_ensure_index(
        'wf_xp_sales',
        'idx_xp_sales_active_employee_date',
        'ALTER TABLE wf_xp_sales ADD INDEX idx_xp_sales_active_employee_date (deleted_at, employee_id, sale_date)'
    );

    $done = true;
}

function xp_ensure_column(string $table, string $column, string $alterSql): void
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute(array($table, $column));

    if ((int) $stmt->fetchColumn() > 0) {
        return;
    }

    db()->exec($alterSql);
}

function xp_ensure_index(string $table, string $index, string $alterSql): void
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?'
    );
    $stmt->execute(array($table, $index));

    if ((int) $stmt->fetchColumn() > 0) {
        return;
    }

    db()->exec($alterSql);
}

function xp_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /xp/login.php');
        exit;
    }

    return $user;
}

function xp_password_matches(array $user, string $password): bool
{
    $hash = (string) ($user['password_hash'] ?? '');

    return $hash !== '' && password_verify($password, $hash);
}

function xp_user_can_manage(?array $user): bool
{
    if (!$user) {
        return false;
    }

    $username = strtolower((string) ($user['username'] ?? ''));
    $role = strtolower((string) ($user['role'] ?? ''));

    return $username === 'adm' || in_array($role, array('admin', 'gerente'), true);
}

function xp_require_manager(array $user): void
{
    if (xp_user_can_manage($user)) {
        return;
    }

    throw new RuntimeException('Seu usuario nao tem permissao para alimentar o XP.');
}

function xp_redirect_home(): void
{
    header('Location: /xp/');
    exit;
}

function xp_clean_text(string $value, int $limit): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? $value);

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($value, 'UTF-8') > $limit ? mb_substr($value, 0, $limit, 'UTF-8') : $value;
    }

    return strlen($value) > $limit ? substr($value, 0, $limit) : $value;
}

function xp_money_to_cents($value): int
{
    if (is_int($value) || is_float($value)) {
        return max(0, (int) round(((float) $value) * 100));
    }

    $clean = trim((string) $value);
    $clean = str_replace(array('R$', ' '), '', $clean);

    if (strpos($clean, ',') !== false && strpos($clean, '.') !== false) {
        $clean = str_replace('.', '', $clean);
        $clean = str_replace(',', '.', $clean);
    } elseif (strpos($clean, ',') !== false) {
        $clean = str_replace(',', '.', $clean);
    }

    $number = (float) preg_replace('/[^0-9.\-]/', '', $clean);

    return max(0, (int) round($number * 100));
}

function xp_cents_to_money($cents): string
{
    return 'R$ ' . number_format(((int) $cents) / 100, 2, ',', '.');
}

function xp_sales_to_points(int $amountCents): int
{
    return max(0, (int) round($amountCents * XP_POINTS_PER_THOUSAND_REAIS / 100000));
}

function xp_required_for_next_level(int $level): int
{
    $level = max(1, $level);
    $extra = pow(max(0, $level - 1), 1.55) * 14000;

    return (int) max(XP_FIRST_LEVEL_REQUIREMENT, round(XP_FIRST_LEVEL_REQUIREMENT + $extra));
}

function xp_progress_from_total(int $totalXp): array
{
    $level = 1;
    $levelStart = 0;
    $remaining = max(0, $totalXp);

    while ($remaining >= xp_required_for_next_level($level) && $level < 10000) {
        $required = xp_required_for_next_level($level);
        $remaining -= $required;
        $levelStart += $required;
        $level++;
    }

    $required = xp_required_for_next_level($level);
    $percent = $required > 0 ? min(100, round(($remaining / $required) * 100, 2)) : 0;

    return array(
        'level' => $level,
        'next_level' => $level + 1,
        'level_start_xp' => $levelStart,
        'next_level_total_xp' => $levelStart + $required,
        'progress_xp' => $remaining,
        'required_xp' => $required,
        'percent' => $percent,
    );
}

function xp_number($value): string
{
    return number_format((int) $value, 0, ',', '.');
}

function xp_percent($value): string
{
    return rtrim(rtrim(number_format((float) $value, 2, ',', '.'), '0'), ',') . '%';
}

function xp_month_context(?string $month = null): array
{
    $month = is_string($month) ? trim($month) : '';

    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        $month = date('Y-m');
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $month . '-01');
    if (!$date) {
        $date = new DateTimeImmutable('first day of this month');
    }

    $start = $date->format('Y-m-01');
    $end = $date->modify('last day of this month')->format('Y-m-d');

    return array(
        'month' => $date->format('Y-m'),
        'start' => $start,
        'end' => $end,
        'label' => $date->format('m/Y'),
        'prev' => $date->modify('-1 month')->format('Y-m'),
        'next' => $date->modify('+1 month')->format('Y-m'),
    );
}

function xp_employee_initials(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return 'XP';
    }

    $parts = preg_split('/\s+/', $name) ?: array();
    $first = substr((string) ($parts[0] ?? 'X'), 0, 1);
    $last = count($parts) > 1 ? substr((string) end($parts), 0, 1) : '';

    return strtoupper($first . $last);
}

function xp_photo_url(?string $photoPath): string
{
    $photoPath = (string) $photoPath;

    if ($photoPath !== '' && preg_match('#^/xp/uploads/(funcionarios|adm)/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$#', $photoPath)) {
        return $photoPath;
    }

    return '';
}

function xp_level_asset(int $level): string
{
    if ($level % 10 === 0) {
        return '/xp/assets/nivel-10-castelo.svg?v=20260522b';
    }

    if ($level % 5 === 0) {
        return '/xp/assets/nivel-5-estrela.svg?v=20260522b';
    }

    return '/xp/assets/bloco-xp.svg?v=20260522b';
}

function xp_level_kind(int $level): string
{
    if ($level % 10 === 0) {
        return 'castle';
    }

    if ($level % 5 === 0) {
        return 'star';
    }

    return 'block';
}

function xp_level_track_bounds(array $employees): array
{
    $maxLevel = 1;

    foreach ($employees as $employee) {
        $maxLevel = max($maxLevel, (int) ($employee['progress']['level'] ?? 1));
    }

    if ($maxLevel <= XP_TRACK_BASE_LEVELS) {
        return array(1, XP_TRACK_BASE_LEVELS);
    }

    $start = max(1, $maxLevel - 8);
    $end = $start + XP_TRACK_DYNAMIC_LEVELS - 1;

    return array($start, $end);
}

function xp_progress_fill_class(array $progress): string
{
    $percent = max(0, min(100, (float) ($progress['percent'] ?? 0)));

    return 'xp-fill-p' . (string) ((int) round($percent));
}

function xp_player_data_attrs(array $player): string
{
    $progress = is_array($player['progress'] ?? null)
        ? $player['progress']
        : xp_progress_from_total((int) ($player['total_xp'] ?? 0));
    $percent = max(0, min(100, (float) ($progress['percent'] ?? 0)));
    $isAdmin = !empty($player['is_admin']);

    $attrs = array(
        'data-xp-player-name' => (string) ($player['name'] ?? 'Jogador'),
        'data-xp-player-role' => $isAdmin ? 'ADM' : 'Atendente XP',
        'data-xp-player-level' => 'Nivel ' . (string) ((int) ($progress['level'] ?? 1)) . ' -> ' . (string) ((int) ($progress['next_level'] ?? 2)),
        'data-xp-player-percent' => xp_percent($percent),
        'data-xp-player-percent-value' => number_format($percent, 2, '.', ''),
        'data-xp-player-progress' => xp_number($progress['progress_xp'] ?? 0),
        'data-xp-player-required' => xp_number($progress['required_xp'] ?? XP_FIRST_LEVEL_REQUIREMENT),
        'data-xp-player-month' => xp_number($player['month_xp'] ?? 0),
        'data-xp-player-total' => xp_number($player['total_xp'] ?? 0),
    );

    $html = '';
    foreach ($attrs as $name => $value) {
        $html .= ' ' . $name . '="' . e((string) $value) . '"';
    }

    return $html;
}

function xp_find_employee(int $id): ?array
{
    xp_ensure_schema();

    if ($id <= 0) {
        return null;
    }

    $stmt = db()->prepare(
        "SELECT * FROM wf_xp_employees
         WHERE id = ? AND status = 'ativo' AND deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute(array($id));
    $employee = $stmt->fetch();

    return $employee ?: null;
}

function xp_is_admin_employee(array $employee): bool
{
    return (string) ($employee['system_key'] ?? '') === XP_ADMIN_SYSTEM_KEY;
}

function xp_sync_admin_employee(?string $photoPath = null, ?int $userId = null): int
{
    xp_ensure_schema();

    $photoPath = xp_photo_url($photoPath) !== '' ? xp_photo_url($photoPath) : null;

    $stmt = db()->prepare('SELECT id FROM wf_xp_employees WHERE system_key = ? LIMIT 1');
    $stmt->execute(array(XP_ADMIN_SYSTEM_KEY));
    $id = (int) $stmt->fetchColumn();

    if ($id <= 0) {
        $stmt = db()->prepare(
            "SELECT id
             FROM wf_xp_employees
             WHERE UPPER(name) = 'ADM'
             ORDER BY id ASC
             LIMIT 1"
        );
        $stmt->execute();
        $id = (int) $stmt->fetchColumn();
    }

    if ($id > 0) {
        $stmt = db()->prepare(
            "UPDATE wf_xp_employees
             SET name = 'ADM',
                 photo_path = ?,
                 status = 'ativo',
                 system_key = ?,
                 deleted_at = NULL
             WHERE id = ?"
        );
        $stmt->execute(array($photoPath, XP_ADMIN_SYSTEM_KEY, $id));

        return $id;
    }

    $stmt = db()->prepare(
        "INSERT INTO wf_xp_employees (name, photo_path, status, system_key, created_by)
         VALUES ('ADM', ?, 'ativo', ?, ?)"
    );
    $stmt->execute(array($photoPath, XP_ADMIN_SYSTEM_KEY, $userId));

    return (int) db()->lastInsertId();
}

function xp_list_employees(array $monthContext): array
{
    xp_ensure_schema();

    $stmt = db()->prepare(
        "SELECT
            e.*,
            COALESCE(t.total_amount_cents, 0) AS total_amount_cents,
            COALESCE(t.total_xp, 0) AS total_xp,
            COALESCE(m.month_amount_cents, 0) AS month_amount_cents,
            COALESCE(m.month_xp, 0) AS month_xp
         FROM wf_xp_employees e
         LEFT JOIN (
            SELECT employee_id, SUM(amount_cents) AS total_amount_cents, SUM(xp_points) AS total_xp
            FROM wf_xp_sales
            WHERE deleted_at IS NULL
            GROUP BY employee_id
         ) t ON t.employee_id = e.id
         LEFT JOIN (
            SELECT employee_id, SUM(amount_cents) AS month_amount_cents, SUM(xp_points) AS month_xp
            FROM wf_xp_sales
            WHERE deleted_at IS NULL AND sale_date BETWEEN ? AND ?
            GROUP BY employee_id
         ) m ON m.employee_id = e.id
         WHERE e.status = 'ativo' AND e.deleted_at IS NULL
         ORDER BY total_xp DESC, (e.system_key = ?) ASC, e.name ASC"
    );
    $stmt->execute(array($monthContext['start'], $monthContext['end'], XP_ADMIN_SYSTEM_KEY));
    $employees = $stmt->fetchAll();

    foreach ($employees as $index => &$employee) {
        $employee['is_admin'] = xp_is_admin_employee($employee);
        if (!empty($employee['is_admin'])) {
            $employee['name'] = 'ADM';
        }
        $employee['rank'] = $index + 1;
        $employee['total_amount_cents'] = (int) ($employee['total_amount_cents'] ?? 0);
        $employee['total_xp'] = (int) ($employee['total_xp'] ?? 0);
        $employee['month_amount_cents'] = (int) ($employee['month_amount_cents'] ?? 0);
        $employee['month_xp'] = (int) ($employee['month_xp'] ?? 0);
        $employee['progress'] = xp_progress_from_total((int) $employee['total_xp']);
    }
    unset($employee);

    return $employees;
}

function xp_recent_sales(int $limit = 10): array
{
    xp_ensure_schema();

    $limit = max(1, min(50, $limit));
    $stmt = db()->prepare(
        "SELECT s.*, e.name AS employee_name
         FROM wf_xp_sales s
         INNER JOIN wf_xp_employees e ON e.id = s.employee_id
         WHERE s.deleted_at IS NULL
         ORDER BY s.sale_date DESC, s.created_at DESC, s.id DESC
         LIMIT " . $limit
    );
    $stmt->execute();

    return $stmt->fetchAll();
}

function xp_summary(array $employees): array
{
    $summary = array(
        'employee_count' => count($employees),
        'month_amount_cents' => 0,
        'month_xp' => 0,
        'total_xp' => 0,
        'top_employee' => null,
    );

    foreach ($employees as $employee) {
        $summary['month_amount_cents'] += (int) ($employee['month_amount_cents'] ?? 0);
        $summary['month_xp'] += (int) ($employee['month_xp'] ?? 0);
        $summary['total_xp'] += (int) ($employee['total_xp'] ?? 0);
    }

    if (!empty($employees)) {
        $summary['top_employee'] = $employees[0];
    }

    return $summary;
}

function xp_upload_photo(?array $file, int $userId, string $folder = 'funcionarios', string $prefix = 'funcionario'): ?string
{
    if (!$file || !isset($file['error']) || (int) $file['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if ((int) $file['error'] !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Nao consegui receber a foto. Tente outro arquivo.');
    }

    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > XP_UPLOAD_MAX_BYTES) {
        throw new InvalidArgumentException('A foto precisa ter ate 3 MB.');
    }

    $tmpName = (string) ($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        throw new InvalidArgumentException('Arquivo de foto invalido.');
    }

    $imageInfo = @getimagesize($tmpName);
    if (!$imageInfo || empty($imageInfo['mime'])) {
        throw new InvalidArgumentException('Envie uma imagem JPG, PNG ou WEBP.');
    }

    $mime = (string) $imageInfo['mime'];
    $extensions = array(
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    );

    if (!isset($extensions[$mime])) {
        throw new InvalidArgumentException('Envie uma imagem JPG, PNG ou WEBP.');
    }

    $width = (int) ($imageInfo[0] ?? 0);
    $height = (int) ($imageInfo[1] ?? 0);
    if ($width < 80 || $height < 80) {
        throw new InvalidArgumentException('A foto precisa ter pelo menos 80x80 px.');
    }

    if ($width > 6000 || $height > 6000) {
        throw new InvalidArgumentException('A foto e grande demais. Use uma imagem menor.');
    }

    $allowedFolders = array('funcionarios', 'adm');
    if (!in_array($folder, $allowedFolders, true)) {
        throw new RuntimeException('Pasta de upload invalida.');
    }

    $prefix = preg_replace('/[^a-z0-9_-]+/i', '-', $prefix) ?: 'foto';
    $uploadDir = __DIR__ . '/uploads/' . $folder;
    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Nao consegui preparar a pasta de fotos.');
    }

    if (!is_writable($uploadDir)) {
        throw new RuntimeException('Pasta de fotos sem permissao de escrita.');
    }

    $fileName = $prefix . '-' . max(0, $userId) . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $extensions[$mime];
    $targetPath = $uploadDir . '/' . $fileName;

    if (!@move_uploaded_file($tmpName, $targetPath)) {
        throw new RuntimeException('Nao consegui salvar a foto.');
    }

    @chmod($targetPath, 0644);

    return '/xp/uploads/' . $folder . '/' . $fileName;
}

function xp_setting_get(string $key, ?string $default = null): ?string
{
    xp_ensure_schema();

    $stmt = db()->prepare('SELECT setting_value FROM wf_xp_settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute(array($key));
    $value = $stmt->fetchColumn();

    return is_string($value) ? $value : $default;
}

function xp_setting_set(string $key, ?string $value, int $userId): void
{
    xp_ensure_schema();

    $stmt = db()->prepare(
        'INSERT INTO wf_xp_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()'
    );
    $stmt->execute(array($key, $value, $userId));
}

function xp_admin_profile(): array
{
    $photoPath = xp_setting_get('adm_photo_path', '');

    return array(
        'photo_path' => xp_photo_url($photoPath),
    );
}

function xp_update_admin_profile(?array $photoFile, int $userId): void
{
    $photoPath = xp_upload_photo($photoFile, $userId, 'adm', 'adm');

    if ($photoPath === null) {
        throw new InvalidArgumentException('Escolha a sua foto para a moldura ADM.');
    }

    xp_setting_set('adm_photo_path', $photoPath, $userId);
    xp_sync_admin_employee($photoPath, $userId);

    if (function_exists('log_action')) {
        log_action('xp_adm_foto_atualizada', 'xp_settings', null, 'Foto da moldura ADM do XP atualizada.');
    }
}

function xp_create_employee(string $name, ?array $photoFile, int $userId): int
{
    xp_ensure_schema();

    $name = xp_clean_text($name, 180);
    if ($name === '') {
        throw new InvalidArgumentException('Informe o nome do funcionario.');
    }

    if (strtoupper($name) === 'ADM') {
        throw new InvalidArgumentException('ADM ja existe como player de teste.');
    }

    $photoPath = xp_upload_photo($photoFile, $userId);
    $stmt = db()->prepare(
        'INSERT INTO wf_xp_employees (name, photo_path, created_by) VALUES (?, ?, ?)'
    );
    $stmt->execute(array($name, $photoPath, $userId));
    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action('xp_funcionario_criado', 'xp_employee', $id, 'Funcionario XP criado: ' . $name);
    }

    return $id;
}

function xp_update_employee(int $id, string $name, ?array $photoFile, int $userId): void
{
    xp_ensure_schema();

    $employee = xp_find_employee($id);
    if (!$employee) {
        throw new InvalidArgumentException('Funcionario nao encontrado.');
    }

    if (xp_is_admin_employee($employee)) {
        throw new InvalidArgumentException('A foto e o nome do ADM sao controlados pela moldura ADM.');
    }

    $name = xp_clean_text($name, 180);
    if ($name === '') {
        throw new InvalidArgumentException('Informe o nome do funcionario.');
    }

    $photoPath = xp_upload_photo($photoFile, $userId);
    if ($photoPath !== null) {
        $stmt = db()->prepare('UPDATE wf_xp_employees SET name = ?, photo_path = ? WHERE id = ?');
        $stmt->execute(array($name, $photoPath, $id));
    } else {
        $stmt = db()->prepare('UPDATE wf_xp_employees SET name = ? WHERE id = ?');
        $stmt->execute(array($name, $id));
    }

    if (function_exists('log_action')) {
        log_action('xp_funcionario_editado', 'xp_employee', $id, 'Funcionario XP editado: ' . $name);
    }
}

function xp_deactivate_employee(int $id): void
{
    xp_ensure_schema();

    $employee = xp_find_employee($id);
    if (!$employee) {
        throw new InvalidArgumentException('Funcionario nao encontrado.');
    }

    if (xp_is_admin_employee($employee)) {
        throw new InvalidArgumentException('O ADM e um player fixo de teste e nao pode ser excluido.');
    }

    $stmt = db()->prepare(
        "UPDATE wf_xp_employees
         SET status = 'inativo', deleted_at = NOW()
         WHERE id = ? AND status = 'ativo' AND deleted_at IS NULL"
    );
    $stmt->execute(array($id));

    if (function_exists('log_action')) {
        log_action('xp_funcionario_inativado', 'xp_employee', $id, 'Funcionario XP inativado: ' . (string) $employee['name']);
    }
}

function xp_validate_sale_date(string $date): string
{
    $date = trim($date);
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);

    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException('Informe uma data valida para a venda.');
    }

    $min = new DateTimeImmutable('2020-01-01');
    $max = (new DateTimeImmutable('tomorrow'))->setTime(23, 59, 59);
    if ($parsed < $min || $parsed > $max) {
        throw new InvalidArgumentException('A data da venda esta fora do periodo permitido.');
    }

    return $date;
}

function xp_create_sale(int $employeeId, string $saleDate, $amount, string $note, int $userId): int
{
    xp_ensure_schema();

    if (!xp_find_employee($employeeId)) {
        throw new InvalidArgumentException('Escolha um funcionario ativo.');
    }

    $saleDate = xp_validate_sale_date($saleDate);
    $amountCents = xp_money_to_cents($amount);
    if ($amountCents <= 0) {
        throw new InvalidArgumentException('Informe um valor de venda maior que zero.');
    }

    $xpPoints = xp_sales_to_points($amountCents);
    $note = xp_clean_text($note, 220);

    $stmt = db()->prepare(
        'INSERT INTO wf_xp_sales (employee_id, sale_date, amount_cents, xp_points, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($employeeId, $saleDate, $amountCents, $xpPoints, $note !== '' ? $note : null, $userId));
    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action(
            'xp_venda_lancada',
            'xp_sale',
            $id,
            'Venda XP lancada: ' . xp_cents_to_money($amountCents) . ' = ' . xp_number($xpPoints) . ' XP.'
        );
    }

    return $id;
}

function xp_delete_sale(int $id, int $userId): void
{
    xp_ensure_schema();

    if ($id <= 0) {
        throw new InvalidArgumentException('Lancamento invalido.');
    }

    $stmt = db()->prepare(
        'UPDATE wf_xp_sales
         SET deleted_at = NOW(), deleted_by = ?
         WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute(array($userId, $id));

    if ($stmt->rowCount() < 1) {
        throw new InvalidArgumentException('Lancamento nao encontrado.');
    }

    if (function_exists('log_action')) {
        log_action('xp_venda_cancelada', 'xp_sale', $id, 'Lancamento XP cancelado.');
    }
}
