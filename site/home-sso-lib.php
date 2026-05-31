<?php
declare(strict_types=1);

const WF_HOME_SSO_COOKIE = 'WFHOME_SSO';

function wf_home_sso_base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function wf_home_sso_base64url_decode(string $value): string
{
    $padding = strlen($value) % 4;
    if ($padding > 0) {
        $value .= str_repeat('=', 4 - $padding);
    }

    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    return is_string($decoded) ? $decoded : '';
}

function wf_home_sso_secret(): string
{
    $weakValues = array(
        '',
        'adm',
        'change_me_auth_key',
        'change_me_home_sso_secret_32_chars_min',
        'dev-auth-key-change-me',
        'wimifarma_home_sso_dev_secret_change_me',
    );

    foreach (array('WIMIFARMA_HOME_SSO_SECRET', 'WP_AUTH_KEY', 'WIMIFARMA_HOME_LOGIN_PASSWORD') as $key) {
        $value = trim((string) (getenv($key) ?: ''));
        if (strlen($value) >= 16 && !in_array($value, $weakValues, true)) {
            return $value;
        }
    }

    return '';
}

function wf_home_sso_ttl_seconds(): int
{
    $ttl = (int) (getenv('WIMIFARMA_HOME_SSO_TTL_SECONDS') ?: 28800);
    return max(300, min(43200, $ttl));
}

function wf_home_sso_cookie_options(int $expires, bool $secure): array
{
    return array(
        'expires' => $expires,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    );
}

function wf_home_sso_issue(string $username, bool $secure): void
{
    if (headers_sent()) {
        return;
    }

    $secret = wf_home_sso_secret();
    $username = strtolower(trim($username));
    if ($secret === '' || $username === '' || !preg_match('/^[a-z0-9._@-]{1,80}$/', $username)) {
        return;
    }

    $now = time();
    $payload = array(
        'sub' => $username,
        'iat' => $now,
        'exp' => $now + wf_home_sso_ttl_seconds(),
        'src' => 'home',
    );
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        return;
    }

    $encodedPayload = wf_home_sso_base64url_encode($json);
    $signature = wf_home_sso_base64url_encode(hash_hmac('sha256', $encodedPayload, $secret, true));
    setcookie(WF_HOME_SSO_COOKIE, $encodedPayload . '.' . $signature, wf_home_sso_cookie_options((int) $payload['exp'], $secure));
}

function wf_home_sso_clear(bool $secure): void
{
    if (!headers_sent()) {
        setcookie(WF_HOME_SSO_COOKIE, '', wf_home_sso_cookie_options(time() - 42000, $secure));
    }
}

function wf_home_sso_read(?string $token = null): ?array
{
    $secret = wf_home_sso_secret();
    if ($secret === '') {
        return null;
    }

    $token = $token ?? (string) ($_COOKIE[WF_HOME_SSO_COOKIE] ?? '');
    $parts = explode('.', $token);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
        return null;
    }

    $expected = wf_home_sso_base64url_encode(hash_hmac('sha256', $parts[0], $secret, true));
    if (!hash_equals($expected, $parts[1])) {
        return null;
    }

    $decoded = wf_home_sso_base64url_decode($parts[0]);
    $payload = json_decode($decoded, true);
    if (!is_array($payload)) {
        return null;
    }

    $username = strtolower(trim((string) ($payload['sub'] ?? '')));
    $expiresAt = (int) ($payload['exp'] ?? 0);
    if ($username === '' || $expiresAt < time() || !preg_match('/^[a-z0-9._@-]{1,80}$/', $username)) {
        return null;
    }

    return array(
        'username' => $username,
        'expires_at' => $expiresAt,
        'issued_at' => (int) ($payload['iat'] ?? 0),
    );
}
