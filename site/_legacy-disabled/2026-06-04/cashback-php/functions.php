<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function send_security_headers(): void
{
    if (headers_sent()) {
        return;
    }

    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(self), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'self'; form-action 'self';");

    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}

send_security_headers();

function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function app_url(string $path = ''): string
{
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

    if ($base === '' || $base === '.') {
        $base = '';
    }

    return $base . '/' . ltrim($path, '/');
}

function redirect_to(string $path): void
{
    header('Location: ' . app_url($path));
    exit;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Tente novamente.');
        redirect_to('dashboard.php');
    }
}

function set_flash(string $type, string $message): void
{
    $_SESSION['flash'] = array('type' => $type, 'message' => $message);
}

function get_flash(): array
{
    $flash = $_SESSION['flash'] ?? array();
    unset($_SESSION['flash']);

    return is_array($flash) ? $flash : array();
}

function login_rate_limit_username(?string $username = null): string
{
    $candidate = $username;

    if ($candidate === null) {
        $candidate = $_POST['username'] ?? '';
    }

    return strtolower(trim((string) $candidate));
}

function login_rate_limit_client_ip(): string
{
    $candidates = array();

    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $forwarded = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
        $candidates[] = trim((string) ($forwarded[0] ?? ''));
    }

    $candidates[] = (string) ($_SERVER['HTTP_X_REAL_IP'] ?? '');
    $candidates[] = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

    foreach ($candidates as $candidate) {
        if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }
    }

    return 'unknown';
}

function login_rate_limit_identity(?string $username = null): array
{
    $normalizedUsername = login_rate_limit_username($username);
    $clientIp = login_rate_limit_client_ip();

    return array(
        'scope' => 'internal-login',
        'identity_hash' => hash('sha256', $clientIp . '|' . $normalizedUsername),
        'username_hash' => hash('sha256', $normalizedUsername),
        'ip_address' => $clientIp,
    );
}

function internal_auth_uses_core(): bool
{
    return defined('INTERNAL_AUTH_PROVIDER') && INTERNAL_AUTH_PROVIDER === 'core';
}

function internal_auth_mysql_fallback_enabled(): bool
{
    return defined('INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED') && INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED === true;
}

function internal_auth_normalize_user(array $user, string $source): array
{
    return array(
        'id' => (int) $user['id'],
        'username' => (string) $user['username'],
        'display_name' => (string) ($user['display_name'] ?? ''),
        'role' => (string) ($user['role'] ?? 'user'),
        'active' => !empty($user['active']) && $user['active'] !== 'f',
        'auth_source' => $source,
    );
}

function internal_auth_password_ok(?array $user, string $password): bool
{
    if (!$user) {
        return false;
    }

    $hash = (string) ($user['password_hash'] ?? '');
    return $hash !== '' && password_verify($password, $hash);
}

function internal_auth_fetch_core_by_username(string $username): ?array
{
    $stmt = core_auth_db()->prepare(
        'SELECT id, username, display_name, password_hash, role, active
           FROM core_users
          WHERE username_normalized = ?
            AND active = true
          LIMIT 1'
    );
    $stmt->execute(array(strtolower(trim($username))));
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function internal_auth_fetch_core_by_id(int $id): ?array
{
    $stmt = core_auth_db()->prepare(
        'SELECT id, username, display_name, role, active
           FROM core_users
          WHERE id = ?
            AND active = true
          LIMIT 1'
    );
    $stmt->execute(array($id));
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function internal_auth_fetch_mysql_by_username(string $username): ?array
{
    $stmt = db()->prepare('SELECT * FROM wf_users WHERE username = ? AND active = 1 LIMIT 1');
    $stmt->execute(array($username));
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function internal_auth_fetch_mysql_by_id(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, username, role, active FROM wf_users WHERE id = ? AND active = 1 LIMIT 1');
    $stmt->execute(array($id));
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function internal_authenticate_user(string $username, string $password): ?array
{
    if (internal_auth_uses_core()) {
        try {
            $user = internal_auth_fetch_core_by_username($username);
            if ($user && internal_auth_password_ok($user, $password)) {
                return internal_auth_normalize_user($user, 'core');
            }
        } catch (Throwable $error) {
            if (!internal_auth_mysql_fallback_enabled()) {
                throw $error;
            }
        }

        if (!internal_auth_mysql_fallback_enabled()) {
            return null;
        }
    }

    $user = internal_auth_fetch_mysql_by_username($username);
    if ($user && internal_auth_password_ok($user, $password)) {
        return internal_auth_normalize_user($user, 'mysql');
    }

    return null;
}

function login_rate_limit_wait_seconds(?string $username = null): int
{
    $blockedUntil = (int) ($_SESSION['login_blocked_until'] ?? 0);
    $sessionWait = max(0, $blockedUntil - time());

    if (internal_auth_uses_core()) {
        try {
            $identity = login_rate_limit_identity($username);
            $stmt = core_auth_db()->prepare(
                'SELECT blocked_until
                   FROM core_login_rate_limits
                  WHERE rate_key = ?
                  LIMIT 1'
            );
            $stmt->execute(array($identity['identity_hash']));
            $blockedAt = $stmt->fetchColumn();

            if ($blockedAt) {
                $databaseWait = max(0, strtotime((string) $blockedAt) - time());
                return max($sessionWait, $databaseWait);
            }

            return $sessionWait;
        } catch (Throwable $error) {
            if (!internal_auth_mysql_fallback_enabled()) {
                return $sessionWait;
            }
        }
    }

    try {
        $identity = login_rate_limit_identity($username);
        $stmt = db()->prepare(
            'SELECT blocked_until
             FROM wf_login_rate_limits
             WHERE scope = ? AND identity_hash = ?
             LIMIT 1'
        );
        $stmt->execute(array($identity['scope'], $identity['identity_hash']));
        $blockedAt = $stmt->fetchColumn();

        if ($blockedAt) {
            $databaseWait = max(0, strtotime((string) $blockedAt) - time());
            return max($sessionWait, $databaseWait);
        }
    } catch (Throwable $error) {
        return $sessionWait;
    }

    return $sessionWait;
}

function register_login_failure(?string $username = null): void
{
    $now = time();
    $attempts = $_SESSION['login_attempts'] ?? array();
    $attempts = is_array($attempts) ? $attempts : array();
    $attempts = array_values(array_filter($attempts, static function ($timestamp) use ($now): bool {
        return is_numeric($timestamp) && ($now - (int) $timestamp) <= 900;
    }));
    $attempts[] = $now;

    $_SESSION['login_attempts'] = $attempts;

    if (count($attempts) >= 5) {
        $_SESSION['login_blocked_until'] = $now + 600;
    }

    if (internal_auth_uses_core()) {
        try {
            $identity = login_rate_limit_identity($username);
            $stmt = core_auth_db()->prepare(
                "INSERT INTO core_login_rate_limits
                    (rate_key, username_normalized, ip_hash, attempts_count, window_started_at, blocked_until, updated_at)
                 VALUES
                    (?, ?, ?, 1, NOW(), NULL, NOW())
                 ON CONFLICT (rate_key) DO UPDATE SET
                    username_normalized = EXCLUDED.username_normalized,
                    ip_hash = EXCLUDED.ip_hash,
                    attempts_count = CASE
                        WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1
                        ELSE core_login_rate_limits.attempts_count + 1
                    END,
                    window_started_at = CASE
                        WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN NOW()
                        ELSE core_login_rate_limits.window_started_at
                    END,
                    blocked_until = CASE
                        WHEN (
                            CASE
                                WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1
                                ELSE core_login_rate_limits.attempts_count + 1
                            END
                        ) >= 5 THEN NOW() + INTERVAL '10 minutes'
                        ELSE core_login_rate_limits.blocked_until
                    END,
                    updated_at = NOW()"
            );
            $stmt->execute(array(
                $identity['identity_hash'],
                login_rate_limit_username($username),
                hash('sha256', $identity['ip_address']),
            ));
            return;
        } catch (Throwable $error) {
            if (!internal_auth_mysql_fallback_enabled()) {
                return;
            }
        }
    }

    try {
        $identity = login_rate_limit_identity($username);
        $stmt = db()->prepare(
            "INSERT INTO wf_login_rate_limits
                (scope, identity_hash, username_hash, ip_address, failed_count, first_failed_at, last_failed_at, blocked_until)
             VALUES
                (?, ?, ?, ?, 1, NOW(), NOW(), NULL)
             ON DUPLICATE KEY UPDATE
                username_hash = VALUES(username_hash),
                ip_address = VALUES(ip_address),
                failed_count = IF(last_failed_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), 1, failed_count + 1),
                first_failed_at = IF(last_failed_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), NOW(), first_failed_at),
                last_failed_at = NOW(),
                blocked_until = IF(
                    IF(last_failed_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), 1, failed_count + 1) >= 5,
                    DATE_ADD(NOW(), INTERVAL 10 MINUTE),
                    blocked_until
                )"
        );
        $stmt->execute(array(
            $identity['scope'],
            $identity['identity_hash'],
            $identity['username_hash'],
            $identity['ip_address'],
        ));
    } catch (Throwable $error) {
        // O limitador por sessao continua ativo se o banco nao puder registrar a falha.
    }
}

function clear_login_rate_limit(?string $username = null): void
{
    unset($_SESSION['login_attempts'], $_SESSION['login_blocked_until']);

    if (internal_auth_uses_core()) {
        try {
            $identity = login_rate_limit_identity($username);
            $stmt = core_auth_db()->prepare('DELETE FROM core_login_rate_limits WHERE rate_key = ?');
            $stmt->execute(array($identity['identity_hash']));
            return;
        } catch (Throwable $error) {
            if (!internal_auth_mysql_fallback_enabled()) {
                return;
            }
        }
    }

    try {
        $identity = login_rate_limit_identity($username);
        $stmt = db()->prepare('DELETE FROM wf_login_rate_limits WHERE scope = ? AND identity_hash = ?');
        $stmt->execute(array($identity['scope'], $identity['identity_hash']));
    } catch (Throwable $error) {
        // Limpeza do limitador nao deve bloquear login valido.
    }
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $userId = (int) $_SESSION['user_id'];

    if (internal_auth_uses_core()) {
        try {
            $user = internal_auth_fetch_core_by_id($userId);
            return $user ? internal_auth_normalize_user($user, 'core') : null;
        } catch (Throwable $error) {
            if (!internal_auth_mysql_fallback_enabled()) {
                return null;
            }
        }
    }

    $user = internal_auth_fetch_mysql_by_id($userId);
    return $user ? internal_auth_normalize_user($user, 'mysql') : null;
}

function require_sensitive_area_access(string $title): void
{
    if (!current_user()) {
        redirect_to('login.php');
    }

    $sessionKey = 'sensitive_area_unlocked_' . strtolower((string) preg_replace('/[^a-z0-9]+/i', '_', $title));

    if (!empty($_SESSION[$sessionKey])) {
        return;
    }

    $error = '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'unlock_sensitive_area') {
        verify_csrf();

        if (hash_equals('wimifarma', (string) ($_POST['access_password'] ?? ''))) {
            $_SESSION[$sessionKey] = true;
            log_action('area_sensivel_liberada', 'system', null, 'Acesso liberado para ' . $title . '.');
            header('Location: ' . ($_SERVER['REQUEST_URI'] ?? app_url('dashboard.php#busca')));
            exit;
        }

        $error = 'Senha incorreta.';
    }

    ?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo e($title); ?> - <?php echo e(APP_NAME); ?></title>
    <link rel="icon" type="image/png" href="<?php echo e(app_url('favicon.png')); ?>">
    <link rel="stylesheet" href="<?php echo e(app_url('styles.css')); ?>?v=<?php echo e((string) filemtime(__DIR__ . '/styles.css')); ?>">
</head>
<body class="login-shell">
    <main class="login-card">
        <img class="login-logo" src="<?php echo e(app_url('logo-wimifarma.svg')); ?>" alt="Wimifarma">
        <span class="kicker">Area protegida</span>
        <h1><?php echo e($title); ?></h1>
        <p>Digite a senha interna para abrir esta area.</p>

        <?php if ($error !== '') : ?>
            <div class="alert error"><?php echo e($error); ?></div>
        <?php endif; ?>

        <form method="post" class="form-grid">
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="unlock_sensitive_area">
            <label>
                <span>Senha</span>
                <input type="password" name="access_password" required autofocus autocomplete="current-password">
            </label>
            <button type="submit" class="btn primary full">Entrar</button>
            <a class="btn full" href="<?php echo e(app_url('dashboard.php#busca')); ?>">Voltar ao balcao</a>
        </form>
    </main>
</body>
</html><?php
    exit;
}

function clear_sensitive_area_access(): void
{
    foreach (array_keys($_SESSION) as $key) {
        if (strpos((string) $key, 'sensitive_area_unlocked_') === 0) {
            unset($_SESSION[$key]);
        }
    }
}

function require_role(array $roles): void
{
    $user = current_user();

    if (!$user || !in_array($user['role'], $roles, true)) {
        set_flash('error', 'Seu usuario nao tem permissao para esta acao.');
        redirect_to('dashboard.php');
    }
}

function money_to_decimal($value): float
{
    if (is_int($value) || is_float($value)) {
        return round((float) $value, 2);
    }

    $value = trim((string) $value);
    $value = str_replace(array('R$', ' '), '', $value);

    if (strpos($value, ',') !== false && strpos($value, '.') !== false) {
        $value = str_replace('.', '', $value);
        $value = str_replace(',', '.', $value);
    } elseif (strpos($value, ',') !== false) {
        $value = str_replace(',', '.', $value);
    }

    return round((float) $value, 2);
}

function br_money($value): string
{
    return 'R$ ' . number_format((float) $value, 2, ',', '.');
}

function br_date($value, bool $withTime = false): string
{
    if (!$value) {
        return '-';
    }

    $timestamp = strtotime((string) $value);

    if (!$timestamp) {
        return '-';
    }

    return date($withTime ? 'd/m/Y H:i' : 'd/m/Y', $timestamp);
}

function digits_only($value): string
{
    return preg_replace('/\D+/', '', (string) $value) ?: '';
}

function format_phone($phone): string
{
    $digits = digits_only($phone);

    if (strlen($digits) === 11) {
        return '(' . substr($digits, 0, 2) . ') ' . substr($digits, 2, 5) . '-' . substr($digits, 7);
    }

    if (strlen($digits) === 10) {
        return '(' . substr($digits, 0, 2) . ') ' . substr($digits, 2, 4) . '-' . substr($digits, 6);
    }

    return $phone ? (string) $phone : 'Sem telefone';
}

function get_setting(string $key, $default = null)
{
    $stmt = db()->prepare('SELECT valor FROM wf_settings WHERE chave = ? LIMIT 1');
    $stmt->execute(array($key));
    $value = $stmt->fetchColumn();

    return $value === false ? $default : $value;
}

function set_setting(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO wf_settings (chave, valor, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()'
    );
    $stmt->execute(array($key, $value));
}

function maintenance_mode_enabled(): bool
{
    try {
        return (string) get_setting('maintenance_enabled', '0') === '1';
    } catch (Throwable $error) {
        error_log('Wimifarma Cashback maintenance check failed: ' . $error->getMessage());
        return false;
    }
}

function set_maintenance_mode(bool $enabled): void
{
    set_setting('maintenance_enabled', $enabled ? '1' : '0');
    set_setting($enabled ? 'maintenance_started_at' : 'maintenance_finished_at', date('Y-m-d H:i:s'));
}

function guard_maintenance_mode(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }

    $script = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $allowed = array('manutencao.php', 'logout.php');

    if (in_array($script, $allowed, true)) {
        return;
    }

    if (!maintenance_mode_enabled()) {
        return;
    }

    redirect_to('manutencao.php');
}

function setting_float(string $key, float $default, float $min, float $max): float
{
    $value = (float) get_setting($key, $default);

    if ($value < $min || $value > $max) {
        return $default;
    }

    return $value;
}

function setting_int(string $key, int $default, int $min, int $max): int
{
    $value = (int) get_setting($key, $default);

    if ($value < $min || $value > $max) {
        return $default;
    }

    return $value;
}

function cashback_percent(): float
{
    return setting_float('cashback_percent', 5.0, 0.0, 100.0);
}

function cashback_validity_days(): int
{
    return setting_int('cashback_validity_days', 45, 1, 3650);
}

function redeem_multiplier(): float
{
    return setting_float('redeem_multiplier', 4.0, 1.0, 20.0);
}

function expiration_alert_days(): int
{
    return setting_int('expiration_alert_days', 10, 1, 365);
}

function active_client_exists(int $clientId): bool
{
    if ($clientId <= 0) {
        return false;
    }

    $stmt = db()->prepare("SELECT id FROM wf_clientes WHERE id = ? AND status = 'ativo' LIMIT 1");
    $stmt->execute(array($clientId));

    return (bool) $stmt->fetchColumn();
}

function normalize_attendant_id(?int $attendantId): ?int
{
    if (!$attendantId || $attendantId <= 0) {
        return null;
    }

    $stmt = db()->prepare("SELECT id FROM wf_atendentes WHERE id = ? AND status = 'ativo' LIMIT 1");
    $stmt->execute(array($attendantId));

    if (!$stmt->fetchColumn()) {
        throw new InvalidArgumentException('Atendente invalido ou inativo.');
    }

    return $attendantId;
}

function log_action(string $action, ?string $entityType = null, ?int $entityId = null, string $message = ''): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO wf_logs (user_id, action, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            $_SESSION['user_id'] ?? null,
            $action,
            $entityType,
            $entityId,
            $message,
        ));
    } catch (Throwable $error) {
        // Log nao deve impedir uma venda ou cadastro.
    }
}

function refresh_expired_credits(): void
{
    db()->exec(
        "UPDATE wf_cashback_creditos
         SET status = 'expirado'
         WHERE status = 'ativo'
           AND valor_restante > 0
           AND expires_at < CURDATE()"
    );
}

function balance_for_client(int $clientId): array
{
    refresh_expired_credits();

    $stmt = db()->prepare(
        "SELECT
            COALESCE(SUM(valor_original), 0) AS total_gerado,
            COALESCE(SUM(CASE WHEN status = 'ativo' AND expires_at >= CURDATE() THEN valor_restante ELSE 0 END), 0) AS saldo_disponivel,
            COALESCE(SUM(CASE WHEN status = 'expirado' THEN valor_restante ELSE 0 END), 0) AS saldo_expirado,
            COALESCE(SUM(CASE WHEN status = 'ativo' AND expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY) THEN valor_restante ELSE 0 END), 0) AS saldo_expirando,
            MIN(CASE WHEN status = 'ativo' AND valor_restante > 0 AND expires_at >= CURDATE() THEN expires_at ELSE NULL END) AS proximo_vencimento
         FROM wf_cashback_creditos
         WHERE cliente_id = ?"
    );
    $stmt->execute(array(expiration_alert_days(), $clientId));
    $credit = $stmt->fetch() ?: array();

    $usedStmt = db()->prepare('SELECT COALESCE(SUM(valor_resgatado), 0) FROM wf_resgates WHERE cliente_id = ?');
    $usedStmt->execute(array($clientId));

    return array(
        'total_gerado' => (float) ($credit['total_gerado'] ?? 0),
        'saldo_disponivel' => (float) ($credit['saldo_disponivel'] ?? 0),
        'saldo_expirado' => (float) ($credit['saldo_expirado'] ?? 0),
        'saldo_expirando' => (float) ($credit['saldo_expirando'] ?? 0),
        'saldo_usado' => (float) $usedStmt->fetchColumn(),
        'proximo_vencimento' => $credit['proximo_vencimento'] ?? null,
    );
}

function clientes_options(): array
{
    return db()->query("SELECT id, nome, telefone FROM wf_clientes WHERE status = 'ativo' ORDER BY nome ASC")->fetchAll();
}

function atendentes_options(): array
{
    return db()->query("SELECT id, nome FROM wf_atendentes WHERE status = 'ativo' ORDER BY nome ASC")->fetchAll();
}

function whatsapp_link(string $phone, string $message): string
{
    $digits = digits_only($phone);

    if ($digits === '') {
        return '';
    }

    if (strlen($digits) <= 11 && strpos($digits, '55') !== 0) {
        $digits = '55' . $digits;
    }

    return 'https://wa.me/' . $digits . '?text=' . rawurlencode($message);
}

function schema_column_exists(string $table, string $column): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?'
    );
    $stmt->execute(array($table, $column));

    return (int) $stmt->fetchColumn() > 0;
}

function schema_table_exists(string $table): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?'
    );
    $stmt->execute(array($table));

    return (int) $stmt->fetchColumn() > 0;
}

function ensure_schema_updates(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    $done = true;

    if (!schema_table_exists('wf_users') || !schema_table_exists('wf_compras')) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_login_rate_limits (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            scope VARCHAR(40) NOT NULL,
            identity_hash CHAR(64) NOT NULL,
            username_hash CHAR(64) NOT NULL,
            ip_address VARCHAR(64) NULL,
            failed_count INT UNSIGNED NOT NULL DEFAULT 0,
            first_failed_at DATETIME NOT NULL,
            last_failed_at DATETIME NOT NULL,
            blocked_until DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_wf_login_rate_identity (scope, identity_hash),
            KEY idx_wf_login_rate_blocked (blocked_until),
            KEY idx_wf_login_rate_last_failed (last_failed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_whatsapp_mensagens (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            cliente_id INT UNSIGNED NULL,
            compra_id INT UNSIGNED NULL,
            credito_id INT UNSIGNED NULL,
            campanha VARCHAR(40) NOT NULL,
            dedupe_key VARCHAR(191) NOT NULL,
            cliente_nome VARCHAR(180) NOT NULL,
            telefone VARCHAR(20) NULL,
            mensagem TEXT NOT NULL,
            status ENUM('pendente', 'aberta', 'copiada', 'enviada', 'cancelada') NOT NULL DEFAULT 'pendente',
            due_date DATE NULL,
            opened_at DATETIME NULL,
            copied_at DATETIME NULL,
            sent_at DATETIME NULL,
            user_id INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_wf_whatsapp_dedupe (dedupe_key),
            KEY idx_wf_whatsapp_cliente (cliente_id),
            KEY idx_wf_whatsapp_compra (compra_id),
            KEY idx_wf_whatsapp_status (status, campanha),
            KEY idx_wf_whatsapp_due (due_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (!schema_column_exists('wf_compras', 'valor_bruto')) {
        db()->exec('ALTER TABLE wf_compras ADD COLUMN valor_bruto DECIMAL(10,2) NULL AFTER atendente_id');
        db()->exec('UPDATE wf_compras SET valor_bruto = valor_total WHERE valor_bruto IS NULL');
    }

    if (!schema_column_exists('wf_compras', 'desconto_cashback')) {
        db()->exec('ALTER TABLE wf_compras ADD COLUMN desconto_cashback DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER valor_bruto');
    }

    if (!schema_column_exists('wf_compras', 'valor_cobrado')) {
        db()->exec('ALTER TABLE wf_compras ADD COLUMN valor_cobrado DECIMAL(10,2) NULL AFTER desconto_cashback');
        db()->exec('UPDATE wf_compras SET valor_cobrado = valor_total WHERE valor_cobrado IS NULL');
    }

    if (!schema_column_exists('wf_compras', 'resgate_id')) {
        db()->exec('ALTER TABLE wf_compras ADD COLUMN resgate_id INT UNSIGNED NULL AFTER valor_cobrado');
    }
}

function whatsapp_status_label(string $status): string
{
    $labels = array(
        'pendente' => 'Pendente',
        'aberta' => 'Aberta no WhatsApp',
        'copiada' => 'Texto copiado',
        'enviada' => 'Marcada como enviada',
        'cancelada' => 'Cancelada',
    );

    return $labels[$status] ?? ucfirst($status);
}

function whatsapp_campaign_label(string $campaign): string
{
    $labels = array(
        'compra' => 'Compra',
        'recompra' => 'Recompra',
        'aniversario' => 'Aniversario',
        'expiracao' => 'Expiracao',
        'generico' => 'Generico',
    );

    return $labels[$campaign] ?? ucfirst($campaign);
}

function save_whatsapp_message(
    string $campaign,
    string $dedupeKey,
    ?int $clientId,
    ?int $purchaseId,
    ?int $creditId,
    string $clientName,
    string $phone,
    string $message,
    ?string $dueDate = null
): array {
    $stmt = db()->prepare(
        "INSERT INTO wf_whatsapp_mensagens
            (cliente_id, compra_id, credito_id, campanha, dedupe_key, cliente_nome, telefone, mensagem, due_date, user_id)
         VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            cliente_id = VALUES(cliente_id),
            compra_id = VALUES(compra_id),
            credito_id = VALUES(credito_id),
            cliente_nome = VALUES(cliente_nome),
            telefone = VALUES(telefone),
            mensagem = CASE WHEN status = 'pendente' THEN VALUES(mensagem) ELSE mensagem END,
            due_date = VALUES(due_date)"
    );
    $stmt->execute(array(
        $clientId,
        $purchaseId,
        $creditId,
        $campaign,
        $dedupeKey,
        $clientName,
        digits_only($phone) ?: null,
        $message,
        $dueDate,
        $_SESSION['user_id'] ?? null,
    ));

    $select = db()->prepare('SELECT * FROM wf_whatsapp_mensagens WHERE dedupe_key = ? LIMIT 1');
    $select->execute(array($dedupeKey));

    return $select->fetch() ?: array();
}

function birthday_days_until(?string $birthDate): ?array
{
    if (!$birthDate) {
        return null;
    }

    $timestamp = strtotime($birthDate);

    if (!$timestamp) {
        return null;
    }

    $today = new DateTimeImmutable('today');
    $monthDay = date('m-d', $timestamp);
    $target = DateTimeImmutable::createFromFormat('Y-m-d', $today->format('Y') . '-' . $monthDay);

    if (!$target) {
        return null;
    }

    if ($target < $today) {
        $target = $target->modify('+1 year');
    }

    return array(
        'date' => $target->format('Y-m-d'),
        'days' => (int) $today->diff($target)->format('%a'),
    );
}

try {
    ensure_schema_updates();
} catch (Throwable $error) {
    /*
     * Nunca derrube o sistema inteiro durante uma migracao automatica.
     * Se a HostGator negar CREATE/ALTER ou o banco estiver temporariamente
     * indisponivel, a tela de diagnostico/publica consegue mostrar o problema.
     */
    error_log('Wimifarma Cashback schema update failed: ' . $error->getMessage());
}

guard_maintenance_mode();
