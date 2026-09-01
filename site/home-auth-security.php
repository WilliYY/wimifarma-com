<?php
declare(strict_types=1);

const WF_HOME_LOGIN_WINDOW_SECONDS = 900;
const WF_HOME_LOGIN_BLOCK_SECONDS = 600;
const WF_HOME_LOGIN_PAIR_ATTEMPTS = 5;
const WF_HOME_LOGIN_USER_ATTEMPTS = 10;
const WF_HOME_LOGIN_IP_ATTEMPTS = 30;

function wf_home_login_client_ip(): string
{
    $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    $remote = $remote !== '' && filter_var($remote, FILTER_VALIDATE_IP) ? $remote : 'unknown';

    if (wf_home_is_trusted_proxy($remote)) {
        $realIp = trim((string) ($_SERVER['HTTP_X_REAL_IP'] ?? ''));
        if ($realIp !== '' && filter_var($realIp, FILTER_VALIDATE_IP)) {
            return $realIp;
        }

        $forwarded = array_reverse(array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))));
        foreach ($forwarded as $candidate) {
            if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }
    }

    return $remote;
}

function wf_home_is_trusted_proxy(string $remoteIp): bool
{
    if ($remoteIp === 'unknown' || !filter_var($remoteIp, FILTER_VALIDATE_IP)) {
        return false;
    }

    return filter_var(
        $remoteIp,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) === false;
}

function wf_home_login_rate_identities(string $username): array
{
    $username = strtolower(trim($username));
    if (preg_match('/^[a-z0-9._@-]{1,80}$/', $username) !== 1) {
        $username = '-';
    }

    $clientIp = wf_home_login_client_ip();
    $ipHash = hash('sha256', $clientIp);

    return array(
        array(
            'rate_key' => hash('sha256', 'home|pair|' . $ipHash . '|' . $username),
            'username_normalized' => $username,
            'ip_hash' => $ipHash,
            'attempt_limit' => WF_HOME_LOGIN_PAIR_ATTEMPTS,
            'clear_on_success' => true,
        ),
        array(
            'rate_key' => hash('sha256', 'home|user|' . $username),
            'username_normalized' => $username,
            'ip_hash' => null,
            'attempt_limit' => WF_HOME_LOGIN_USER_ATTEMPTS,
            'clear_on_success' => true,
        ),
        array(
            'rate_key' => hash('sha256', 'home|ip|' . $ipHash),
            'username_normalized' => null,
            'ip_hash' => $ipHash,
            'attempt_limit' => WF_HOME_LOGIN_IP_ATTEMPTS,
            'clear_on_success' => false,
        ),
    );
}

function wf_home_login_session_limit(string $rateKey): array
{
    $limits = $_SESSION['wf_home_login_limits'] ?? array();
    $limits = is_array($limits) ? $limits : array();
    $limit = $limits[$rateKey] ?? array();

    return is_array($limit) ? $limit : array();
}

function wf_home_login_store_session_limit(string $rateKey, array $limit): void
{
    $limits = $_SESSION['wf_home_login_limits'] ?? array();
    $limits = is_array($limits) ? $limits : array();
    $limits[$rateKey] = $limit;

    if (count($limits) > 24) {
        uasort($limits, static function ($left, $right): int {
            return ((int) ($left['updated_at'] ?? 0)) <=> ((int) ($right['updated_at'] ?? 0));
        });
        $limits = array_slice($limits, -24, null, true);
    }

    $_SESSION['wf_home_login_limits'] = $limits;
}

function wf_home_login_wait_seconds(string $username): int
{
    $identities = wf_home_login_rate_identities($username);
    $pair = $identities[0];
    $sessionLimit = wf_home_login_session_limit((string) $pair['rate_key']);
    $sessionWait = max(0, (int) ($sessionLimit['blocked_until'] ?? 0) - time());

    try {
        $pdo = wf_home_core_pdo();
        if (!$pdo) {
            return $sessionWait;
        }

        $keys = array_column($identities, 'rate_key');
        $stmt = $pdo->prepare(
            'SELECT blocked_until
               FROM core_login_rate_limits
              WHERE rate_key IN (?, ?, ?)
                AND blocked_until > NOW()
              ORDER BY blocked_until DESC
              LIMIT 1'
        );
        $stmt->execute($keys);
        $blockedAt = $stmt->fetchColumn();
        $databaseWait = $blockedAt ? max(0, strtotime((string) $blockedAt) - time()) : 0;

        return max($sessionWait, $databaseWait);
    } catch (Throwable $error) {
        return $sessionWait;
    }
}

function wf_home_register_login_failure(string $username): int
{
    $identities = wf_home_login_rate_identities($username);
    $pair = $identities[0];
    $rateKey = (string) $pair['rate_key'];
    $now = time();
    $sessionLimit = wf_home_login_session_limit($rateKey);
    $attempts = $sessionLimit['attempts'] ?? array();
    $attempts = is_array($attempts) ? $attempts : array();
    $attempts = array_values(array_filter($attempts, static function ($timestamp) use ($now): bool {
        return is_numeric($timestamp) && ($now - (int) $timestamp) <= WF_HOME_LOGIN_WINDOW_SECONDS;
    }));
    $attempts[] = $now;
    $sessionBlockedUntil = count($attempts) >= WF_HOME_LOGIN_PAIR_ATTEMPTS
        ? $now + WF_HOME_LOGIN_BLOCK_SECONDS
        : (int) ($sessionLimit['blocked_until'] ?? 0);

    wf_home_login_store_session_limit($rateKey, array(
        'attempts' => $attempts,
        'blocked_until' => $sessionBlockedUntil,
        'updated_at' => $now,
    ));

    $databaseWait = 0;
    $pdo = null;
    try {
        $pdo = wf_home_core_pdo();
        if (!$pdo) {
            return max(0, $sessionBlockedUntil - $now);
        }

        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
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
                    ) >= ? THEN NOW() + INTERVAL '10 minutes'
                    WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN NULL
                    ELSE core_login_rate_limits.blocked_until
                END,
                updated_at = NOW()
             RETURNING blocked_until"
        );

        foreach ($identities as $identity) {
            $stmt->execute(array(
                $identity['rate_key'],
                $identity['username_normalized'],
                $identity['ip_hash'],
                $identity['attempt_limit'],
            ));
            $blockedAt = $stmt->fetchColumn();
            if ($blockedAt) {
                $databaseWait = max($databaseWait, max(0, strtotime((string) $blockedAt) - $now));
            }
        }

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
    }

    return max(max(0, $sessionBlockedUntil - $now), $databaseWait);
}

function wf_home_clear_login_rate_limit(string $username): void
{
    $identities = wf_home_login_rate_identities($username);
    $clearable = array_values(array_filter($identities, static function ($identity): bool {
        return !empty($identity['clear_on_success']);
    }));
    $keys = array_column($clearable, 'rate_key');

    $limits = $_SESSION['wf_home_login_limits'] ?? array();
    if (is_array($limits)) {
        foreach ($keys as $rateKey) {
            unset($limits[$rateKey]);
        }
        $_SESSION['wf_home_login_limits'] = $limits;
    }

    try {
        $pdo = wf_home_core_pdo();
        if (!$pdo || count($keys) !== 2) {
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM core_login_rate_limits WHERE rate_key IN (?, ?)');
        $stmt->execute($keys);
    } catch (Throwable $error) {
        // Um login ja validado nao deve falhar apenas porque a limpeza do limitador falhou.
    }
}

function wf_home_audit_auth_event(string $action, string $username, ?array $coreUser = null, array $metadata = array()): void
{
    try {
        $pdo = wf_home_core_pdo();
        if (!$pdo) {
            return;
        }

        $normalizedUsername = strtolower(trim($username));
        $identity = wf_home_login_rate_identities($username)[0];
        $metadata['username_normalized'] = preg_match('/^[a-z0-9._@-]{1,80}$/', $normalizedUsername) === 1
            ? $normalizedUsername
            : '-';
        $metadata['ip_hash'] = $identity['ip_hash'];
        $encodedMetadata = json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare(
            'INSERT INTO core_audit_logs
                (actor_user_id, action, entity_type, entity_id, detail, metadata)
             VALUES
                (?, ?, ?, ?, ?, CAST(? AS jsonb))'
        );
        $stmt->execute(array(
            isset($coreUser['id']) ? (int) $coreUser['id'] : null,
            $action,
            'home_auth',
            isset($coreUser['id']) ? (string) $coreUser['id'] : null,
            'Evento de autenticacao da Home.',
            is_string($encodedMetadata) ? $encodedMetadata : '{}',
        ));
    } catch (Throwable $error) {
        // Auditoria e importante, mas indisponibilidade dela nao derruba a Home.
    }
}
