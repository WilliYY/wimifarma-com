<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

/*
 * Bootstrap PHP compartilhado por legados remanescentes, principalmente o
 * Miauby interno. O Cashback oficial roda em apps/cashback (Node/Postgres).
 * Nao adicionar regras operacionais de Cashback ou consultas de tabelas
 * historicas de migracao aqui.
 */

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
        'rate_key' => hash('sha256', $clientIp . '|' . $normalizedUsername),
        'username_normalized' => $normalizedUsername,
        'ip_hash' => hash('sha256', $clientIp),
    );
}

function internal_auth_uses_core(): bool
{
    return true;
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

function internal_authenticate_user(string $username, string $password): ?array
{
    $user = internal_auth_fetch_core_by_username($username);

    if ($user && internal_auth_password_ok($user, $password)) {
        return internal_auth_normalize_user($user, 'core');
    }

    return null;
}

function login_rate_limit_wait_seconds(?string $username = null): int
{
    $blockedUntil = (int) ($_SESSION['login_blocked_until'] ?? 0);
    $sessionWait = max(0, $blockedUntil - time());

    try {
        $identity = login_rate_limit_identity($username);
        $stmt = core_auth_db()->prepare(
            'SELECT blocked_until
               FROM core_login_rate_limits
              WHERE rate_key = ?
              LIMIT 1'
        );
        $stmt->execute(array($identity['rate_key']));
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
            $identity['rate_key'],
            $identity['username_normalized'],
            $identity['ip_hash'],
        ));
    } catch (Throwable $error) {
        // O limitador por sessao continua ativo se o core nao puder registrar.
    }
}

function clear_login_rate_limit(?string $username = null): void
{
    unset($_SESSION['login_attempts'], $_SESSION['login_blocked_until']);

    try {
        $identity = login_rate_limit_identity($username);
        $stmt = core_auth_db()->prepare('DELETE FROM core_login_rate_limits WHERE rate_key = ?');
        $stmt->execute(array($identity['rate_key']));
    } catch (Throwable $error) {
        // Limpeza do limitador nao deve bloquear login valido.
    }
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $user = internal_auth_fetch_core_by_id((int) $_SESSION['user_id']);
    return $user ? internal_auth_normalize_user($user, 'core') : null;
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

function log_action(string $action, ?string $entityType = null, ?int $entityId = null, string $message = ''): void
{
    try {
        if (!schema_table_exists('miauw_tool_traces')) {
            return;
        }

        $tool = preg_replace('/[^a-z0-9_\-]+/i', '_', trim($action)) ?: 'legacy_log';
        $summary = trim($message);
        if ($summary === '') {
            $summary = $entityType ? $entityType : $tool;
        }

        $payload = json_encode(array(
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'message' => $message,
            'source' => 'shared_php_bootstrap',
        ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);

        $stmt = db()->prepare(
            'INSERT INTO miauw_tool_traces
                (trace_id, usuario_id, ferramenta, modulo, tipo, status, risco, resumo, payload_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            bin2hex(random_bytes(16)),
            $_SESSION['user_id'] ?? null,
            substr($tool, 0, 120),
            'miauby',
            'legacy_log',
            'ok',
            'baixo',
            substr($summary, 0, 255),
            is_string($payload) ? $payload : null,
        ));
    } catch (Throwable $error) {
        // Log compartilhado nunca deve interromper login, treino ou resposta.
    }
}
