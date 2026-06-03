<?php
declare(strict_types=1);

require_once __DIR__ . '/home-sso-lib.php';

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hostName = preg_replace('/:\d+$/', '', $host);
$publicHosts = array('wimifarma.com', 'www.wimifarma.com');
$isPublicHost = in_array($hostName, $publicHosts, true);
$baseUrl = $isPublicHost ? 'https://wimifarma.com' : '';
$assetRoot = '/wp-content/themes/wimifarma-cashback-theme';
$homeLogoUrl = wf_home_asset('assets/img/logo-wimifarma-home-animated.gif') . '?v=20260524-visible-transparent-logo';
$homeLoginLogoUrl = $homeLogoUrl;
$homeLoginPromoVideoUrl = wf_home_asset('assets/video/login-redirecionado.mp4') . '?v=20260601-login-redirect';
$homeLoginPromoUrl = 'https://wimifarma.com.br';
$homeLoginError = '';
$homeLoginShootingStarCount = 28;
$homeLoginBubbleCount = 128;

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Served-By: wimifarma-static-home');

function wf_home_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function wf_home_url(string $path): string
{
    global $baseUrl;

    return $baseUrl . '/' . ltrim($path, '/');
}

function wf_home_asset(string $path): string
{
    global $assetRoot;

    return wf_home_url($assetRoot . '/' . ltrim($path, '/'));
}

function wf_home_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));

    return $https === 'on' || $https === '1' || $forwardedProto === 'https';
}

function wf_home_env_string(string $name, string $default = ''): string
{
    $value = getenv($name);
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    if (isset($_ENV[$name]) && is_string($_ENV[$name]) && trim($_ENV[$name]) !== '') {
        return trim($_ENV[$name]);
    }

    if (isset($_SERVER[$name]) && is_string($_SERVER[$name]) && trim($_SERVER[$name]) !== '') {
        return trim($_SERVER[$name]);
    }

    return $default;
}

function wf_home_normalize_core_username(string $username): string
{
    return strtolower(trim($username));
}

function wf_home_human_login_name(string $username): string
{
    $username = trim($username);
    if ($username === '') {
        return 'usuario';
    }

    $name = preg_replace('/[._-]+/', ' ', $username);
    $name = is_string($name) ? trim($name) : $username;
    if ($name === '') {
        return $username;
    }

    if (function_exists('mb_convert_case')) {
        return mb_convert_case($name, MB_CASE_TITLE, 'UTF-8');
    }

    return ucwords(strtolower($name));
}

function wf_home_core_pdo(): ?PDO
{
    if (!class_exists(PDO::class)) {
        return null;
    }

    $password = wf_home_env_string('CORE_POSTGRES_PASSWORD');
    if ($password === '') {
        return null;
    }

    try {
        $dsn = sprintf(
            'pgsql:host=%s;port=%s;dbname=%s',
            wf_home_env_string('CORE_POSTGRES_HOST', 'wimifarma-core-db'),
            wf_home_env_string('CORE_POSTGRES_PORT', '5432'),
            wf_home_env_string('CORE_POSTGRES_DB', 'wimifarma_core')
        );
        $pdo = new PDO(
            $dsn,
            wf_home_env_string('CORE_POSTGRES_USER', 'wimifarma_core'),
            $password,
            array(
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 2,
            )
        );
        return $pdo;
    } catch (Throwable $error) {
        return null;
    }
}

function wf_home_core_user_identity(string $username): ?array
{
    $username = wf_home_normalize_core_username($username);
    if ($username === '' || !preg_match('/^[a-z0-9._@-]{1,80}$/', $username)) {
        return null;
    }

    $pdo = wf_home_core_pdo();
    if (!$pdo) {
        return null;
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT id, username, username_normalized, display_name, role
               FROM core_users
              WHERE username_normalized = ?
                AND active = true
              LIMIT 1'
        );
        $stmt->execute(array($username));
        $row = $stmt->fetch();
    } catch (Throwable $error) {
        return null;
    }

    return is_array($row) ? $row : null;
}

function wf_home_password_verify(string $password, string $hash): bool
{
    if ($hash === '') {
        return false;
    }

    if (password_verify($password, $hash)) {
        return true;
    }

    if (preg_match('/^\$2[abxy]\$/', $hash) !== 1) {
        return false;
    }

    foreach (array('$2y$', '$2a$') as $prefix) {
        $compatibleHash = $prefix . substr($hash, 4);
        if ($compatibleHash !== $hash && password_verify($password, $compatibleHash)) {
            return true;
        }
    }

    return false;
}

function wf_home_core_user_authenticate(string $username, string $password): ?array
{
    $username = wf_home_normalize_core_username($username);
    if ($username === '' || $password === '' || !preg_match('/^[a-z0-9._@-]{1,80}$/', $username)) {
        return null;
    }

    $pdo = wf_home_core_pdo();
    if (!$pdo) {
        return null;
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT id, username, username_normalized, display_name, role, password_hash
               FROM core_users
              WHERE username_normalized = ?
                AND active = true
              LIMIT 1'
        );
        $stmt->execute(array($username));
        $row = $stmt->fetch();
    } catch (Throwable $error) {
        return null;
    }

    if (!is_array($row)) {
        return null;
    }

    $hash = (string) ($row['password_hash'] ?? '');
    if (!wf_home_password_verify($password, $hash)) {
        return null;
    }

    unset($row['password_hash']);
    return $row;
}

function wf_home_logged_user_label(string $username): string
{
    $identity = wf_home_core_user_identity($username);
    if ($identity) {
        $displayName = trim((string) ($identity['display_name'] ?? ''));
        if ($displayName !== '') {
            return $displayName;
        }

        $coreUsername = trim((string) ($identity['username'] ?? ''));
        if ($coreUsername !== '') {
            return wf_home_human_login_name($coreUsername);
        }
    }

    return wf_home_human_login_name($username);
}

function wf_home_is_core_admin(?array $identity): bool
{
    if (!$identity) {
        return false;
    }

    $username = wf_home_normalize_core_username((string) ($identity['username_normalized'] ?? $identity['username'] ?? ''));
    $role = wf_home_normalize_core_username((string) ($identity['role'] ?? ''));

    return $username === 'adm' || $role === 'admin';
}

function wf_home_module_permissions(?array $identity, array $moduleKeys): array
{
    $moduleKeys = array_values(array_unique(array_filter(array_map('strval', $moduleKeys))));
    $allowed = array_fill_keys($moduleKeys, true);

    if (!$identity || wf_home_is_core_admin($identity)) {
        return $allowed;
    }

    $userId = (int) ($identity['id'] ?? 0);
    if ($userId <= 0) {
        return $allowed;
    }

    $pdo = wf_home_core_pdo();
    if (!$pdo) {
        return $allowed;
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT module_key, can_access
               FROM core_user_module_permissions
              WHERE user_id = ?'
        );
        $stmt->execute(array($userId));
        $rows = $stmt->fetchAll();
    } catch (Throwable $error) {
        return $allowed;
    }

    if (!is_array($rows) || count($rows) === 0) {
        return $allowed;
    }

    $allowed = array_fill_keys($moduleKeys, false);
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $key = (string) ($row['module_key'] ?? '');
        if ($key !== '' && array_key_exists($key, $allowed)) {
            $rawAccess = $row['can_access'] ?? false;
            $allowed[$key] = $rawAccess === true
                || $rawAccess === 1
                || $rawAccess === '1'
                || strtolower((string) $rawAccess) === 't'
                || strtolower((string) $rawAccess) === 'true';
        }
    }

    return $allowed;
}

function wf_home_expire_cookie(string $name, string $path): void
{
    setcookie($name, '', array(
        'expires' => time() - 42000,
        'path' => $path,
        'secure' => wf_home_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));
    unset($_COOKIE[$name]);
}

function wf_home_clear_module_session_cookies(): void
{
    $cookies = array(
        'WFCASHBACK',
        'WFCOTACAOV2',
        'WFPEDIDOS',
        'WFFINANCEIRO',
        'WFTAREFA',
        'WFCODIGOS',
        'WFXP',
        'WFGESTAO',
        'WFUSUARIOS',
        'WFWCASHBACK',
    );

    foreach ($cookies as $name) {
        wf_home_expire_cookie($name, '/');
    }
}

function wf_home_send_security_headers(): void
{
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(self), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';");
    if (wf_home_is_https()) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}

wf_home_send_security_headers();

function wf_home_redirect(string $path = '/'): void
{
    header('Location: ' . wf_home_url($path), true, 302);
    exit;
}

function wf_home_bubble_style(int $index): string
{
    $size = 1.45 + (mt_rand(0, 500) / 100);
    $distance = 5.4 + (mt_rand(0, 430) / 100);
    $position = -5 + (mt_rand(0, 11000) / 100);
    $time = 7.8 + (mt_rand(0, 640) / 100);
    $delay = -1 * (($index * 0.11) + (mt_rand(0, 780) / 100));
    $drift = -1.75 + (mt_rand(0, 350) / 100);
    $swell = 0.9 + (mt_rand(0, 34) / 100);

    return sprintf(
        '--size:%.2frem;--distance:%.2frem;--position:%.2f%%;--time:%.2fs;--delay:%.2fs;--drift:%.2frem;--swell:%.2f;',
        $size,
        $distance,
        $position,
        $time,
        $delay,
        $drift,
        $swell
    );
}

function wf_home_shooting_star_style(int $index): string
{
    $left = -26 + (mt_rand(0, 12200) / 100);
    $top = -24 + (mt_rand(0, 5200) / 100);
    $distanceX = 72 + (mt_rand(0, 5800) / 100);
    $distanceY = 36 + (mt_rand(0, 3200) / 100);
    $tail = 48 + mt_rand(0, 58);
    $time = 6.2 + (mt_rand(0, 430) / 100);
    $delay = -1 * (($index * 0.68) + (mt_rand(0, 420) / 100));
    $angle = 28 + (mt_rand(0, 1400) / 100);
    $opacity = 0.28 + (mt_rand(0, 34) / 100);

    return sprintf(
        '--star-left:%.2f%%;--star-top:%.2f%%;--star-x:%.2fvw;--star-y:%.2fvh;--star-tail:%.0fpx;--star-time:%.2fs;--star-delay:%.2fs;--star-angle:%.2fdeg;--star-opacity:%.2f;',
        $left,
        $top,
        $distanceX,
        $distanceY,
        $tail,
        $time,
        $delay,
        $angle,
        $opacity
    );
}

function wf_home_visitor_counter_path(): string
{
    return __DIR__ . '/wp-content/uploads/wimifarma-runtime/home-counter.json';
}

const WF_HOME_VISITOR_COOKIE = 'WFHOME_VISITOR';
const WF_HOME_VISIT_COOKIE = 'WFHOME_VISIT';
const WF_HOME_VISIT_WINDOW_SECONDS = 1800;

function wf_home_default_visitor_counter(): array
{
    return array(
        'visitors' => 0,
        'views' => 0,
        'first_seen_at' => null,
        'updated_at' => null,
        'available' => false,
    );
}

function wf_home_normalize_visitor_counter(?array $counter): array
{
    $counter = is_array($counter) ? $counter : array();

    return array(
        'visitors' => max(0, (int) ($counter['visitors'] ?? 0)),
        'views' => max(0, (int) ($counter['views'] ?? 0)),
        'first_seen_at' => isset($counter['first_seen_at']) && is_string($counter['first_seen_at'])
            ? $counter['first_seen_at']
            : null,
        'updated_at' => isset($counter['updated_at']) && is_string($counter['updated_at'])
            ? $counter['updated_at']
            : null,
        'available' => true,
    );
}

function wf_home_read_visitor_counter(string $counterFile): array
{
    if (!is_file($counterFile)) {
        return wf_home_default_visitor_counter();
    }

    $raw = @file_get_contents($counterFile);
    if (!is_string($raw) || $raw === '') {
        return wf_home_default_visitor_counter();
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return wf_home_default_visitor_counter();
    }

    return wf_home_normalize_visitor_counter($decoded);
}

function wf_home_ensure_visitor_counter_dir(string $counterDir): bool
{
    if (!is_dir($counterDir) && !@mkdir($counterDir, 0755, true) && !is_dir($counterDir)) {
        return false;
    }

    $htaccess = $counterDir . '/.htaccess';
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, "Options -Indexes\nRequire all denied\n");
    }

    return is_dir($counterDir) && is_writable($counterDir);
}

function wf_home_should_track_visitor_counter(): bool
{
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        return false;
    }

    $userAgent = strtolower((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if ($userAgent === '') {
        return false;
    }

    foreach (array('bot', 'crawler', 'spider', 'curl', 'wget', 'powershell', 'healthcheck', 'monitor') as $needle) {
        if (strpos($userAgent, $needle) !== false) {
            return false;
        }
    }

    return true;
}

function wf_home_has_visitor_cookie(): bool
{
    $cookie = (string) ($_COOKIE[WF_HOME_VISITOR_COOKIE] ?? '');

    return preg_match('/^[a-f0-9]{32}$/', $cookie) === 1;
}

function wf_home_issue_visitor_cookie(): void
{
    $visitorId = bin2hex(random_bytes(16));
    setcookie(WF_HOME_VISITOR_COOKIE, $visitorId, array(
        'expires' => time() + 31536000,
        'path' => '/',
        'secure' => wf_home_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));
    $_COOKIE[WF_HOME_VISITOR_COOKIE] = $visitorId;
}

function wf_home_has_visit_cookie(): bool
{
    $cookie = (string) ($_COOKIE[WF_HOME_VISIT_COOKIE] ?? '');

    return preg_match('/^[a-f0-9]{32}$/', $cookie) === 1;
}

function wf_home_issue_visit_cookie(?string $visitId = null): void
{
    $visitId = is_string($visitId) && preg_match('/^[a-f0-9]{32}$/', $visitId) === 1
        ? $visitId
        : bin2hex(random_bytes(16));

    setcookie(WF_HOME_VISIT_COOKIE, $visitId, array(
        'expires' => time() + WF_HOME_VISIT_WINDOW_SECONDS,
        'path' => '/',
        'secure' => wf_home_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));
    $_COOKIE[WF_HOME_VISIT_COOKIE] = $visitId;
}

function wf_home_refresh_visit_cookie(): void
{
    $visitId = (string) ($_COOKIE[WF_HOME_VISIT_COOKIE] ?? '');
    if (preg_match('/^[a-f0-9]{32}$/', $visitId) !== 1) {
        return;
    }

    wf_home_issue_visit_cookie($visitId);
}

function wf_home_update_visitor_counter(bool $shouldTrack, bool $isNewVisitor, bool $isNewVisit): array
{
    $counterFile = wf_home_visitor_counter_path();
    $counterDir = dirname($counterFile);

    if (!$shouldTrack) {
        return wf_home_read_visitor_counter($counterFile);
    }

    if (!wf_home_ensure_visitor_counter_dir($counterDir)) {
        return wf_home_read_visitor_counter($counterFile);
    }

    $handle = @fopen($counterFile, 'c+');
    if ($handle === false) {
        return wf_home_read_visitor_counter($counterFile);
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            return wf_home_read_visitor_counter($counterFile);
        }

        rewind($handle);
        $raw = stream_get_contents($handle);
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $counter = wf_home_normalize_visitor_counter(is_array($decoded) ? $decoded : null);
        $isFirstTrackedView = $counter['views'] === 0 && $counter['visitors'] === 0;
        $hasChanges = false;

        if ($isNewVisit || $isFirstTrackedView) {
            $counter['views']++;
            $hasChanges = true;
        }
        if ($isNewVisitor || $isFirstTrackedView) {
            $counter['visitors']++;
            $hasChanges = true;
        }
        if ($hasChanges && !$counter['first_seen_at']) {
            $counter['first_seen_at'] = gmdate('c');
        }
        if ($hasChanges) {
            $counter['updated_at'] = gmdate('c');
        }

        if ($hasChanges) {
            $payload = json_encode(array(
                'visitors' => $counter['visitors'],
                'views' => $counter['views'],
                'first_seen_at' => $counter['first_seen_at'],
                'updated_at' => $counter['updated_at'],
            ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

            if (is_string($payload)) {
                ftruncate($handle, 0);
                rewind($handle);
                fwrite($handle, $payload . "\n");
                fflush($handle);
            }
        }

        flock($handle, LOCK_UN);

        return $counter;
    } finally {
        fclose($handle);
    }
}

session_name('WFHOME');
session_set_cookie_params(array(
    'lifetime' => 0,
    'path' => '/',
    'secure' => wf_home_is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
));

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if (!isset($_SESSION['wf_home_csrf']) || !is_string($_SESSION['wf_home_csrf'])) {
    $_SESSION['wf_home_csrf'] = bin2hex(random_bytes(16));
}

$homeShouldTrackVisitor = wf_home_should_track_visitor_counter();
$homeIsNewVisitor = $homeShouldTrackVisitor && !wf_home_has_visitor_cookie();
if ($homeIsNewVisitor) {
    wf_home_issue_visitor_cookie();
}
$homeIsNewVisit = $homeShouldTrackVisitor && !wf_home_has_visit_cookie();
if ($homeIsNewVisit) {
    wf_home_issue_visit_cookie();
} elseif ($homeShouldTrackVisitor) {
    wf_home_refresh_visit_cookie();
}
$homeVisitorCounter = wf_home_update_visitor_counter($homeShouldTrackVisitor, $homeIsNewVisitor, $homeIsNewVisit);
$homeVisitorCount = (int) ($homeVisitorCounter['visitors'] ?? 0);
$homeViewCount = (int) ($homeVisitorCounter['views'] ?? 0);
$homeVisitorCountLabel = number_format($homeVisitorCount, 0, ',', '.');
$homeViewCountLabel = number_format($homeViewCount, 0, ',', '.');
$homeVisitorNoun = $homeVisitorCount === 1 ? 'visitante unico' : 'visitantes unicos';
$homeViewNoun = $homeViewCount === 1 ? 'visita registrada' : 'visitas registradas';
$homeCounterStatus = $homeVisitorCount > 0
    ? 'contagem anonima'
    : 'aguardando primeiro acesso humano';

if (isset($_GET['sair'])) {
    $_SESSION = array();
    wf_home_sso_clear(wf_home_is_https());
    wf_home_clear_module_session_cookies();
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
    wf_home_redirect('/?logged_out=1');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && (string) ($_POST['wf_home_action'] ?? '') === 'login') {
    $postedCsrf = (string) ($_POST['wf_home_csrf'] ?? '');
    $user = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $normalizedUser = wf_home_normalize_core_username($user);
    $expectedUser = wf_home_normalize_core_username((string) (getenv('WIMIFARMA_HOME_LOGIN_USER') ?: 'adm'));
    $expectedPassword = (string) (getenv('WIMIFARMA_HOME_LOGIN_PASSWORD') ?: 'adm');
    $coreUser = null;

    if (!hash_equals((string) $_SESSION['wf_home_csrf'], $postedCsrf)) {
        $homeLoginError = 'Sessao expirada. Atualize e tente de novo.';
    } else {
        $coreUser = wf_home_core_user_authenticate($user, $password);
    }

    if ($homeLoginError === '' && $coreUser) {
        $sessionUser = wf_home_normalize_core_username((string) ($coreUser['username_normalized'] ?? $coreUser['username'] ?? $user));
        session_regenerate_id(true);
        $_SESSION['wf_home_authenticated'] = true;
        $_SESSION['wf_home_user'] = $sessionUser;
        $_SESSION['wf_home_login_nonce'] = bin2hex(random_bytes(8));
        $_SESSION['wf_home_csrf'] = bin2hex(random_bytes(16));
        wf_home_sso_issue($sessionUser, wf_home_is_https());
        wf_home_redirect('/');
    } elseif ($homeLoginError === '' && $expectedUser !== '' && hash_equals($expectedUser, $normalizedUser) && hash_equals($expectedPassword, $password)) {
        session_regenerate_id(true);
        $_SESSION['wf_home_authenticated'] = true;
        $_SESSION['wf_home_user'] = $expectedUser;
        $_SESSION['wf_home_login_nonce'] = bin2hex(random_bytes(8));
        $_SESSION['wf_home_csrf'] = bin2hex(random_bytes(16));
        wf_home_sso_issue($expectedUser, wf_home_is_https());
        wf_home_redirect('/');
    } elseif ($homeLoginError === '') {
        $homeLoginError = 'Login ou senha invalidos.';
    }
}

$homeAuthenticated = !empty($_SESSION['wf_home_authenticated']);
if ($homeAuthenticated && !empty($_SESSION['wf_home_user']) && is_string($_SESSION['wf_home_user'])) {
    if (empty($_SESSION['wf_home_login_nonce']) || !is_string($_SESSION['wf_home_login_nonce'])) {
        $_SESSION['wf_home_login_nonce'] = bin2hex(random_bytes(8));
    }
    wf_home_sso_issue($_SESSION['wf_home_user'], wf_home_is_https());
}

if (!$homeAuthenticated):
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Entrar - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="<?php echo wf_home_e(wf_home_asset('assets/img/favicon.svg')); ?>">
    <link rel="preload" as="image" href="<?php echo wf_home_e($homeLoginLogoUrl); ?>">
    <style>
        * {
            box-sizing: border-box;
        }

        @property --footer-background {
            syntax: "<color>";
            inherits: true;
            initial-value: #0e8fa0;
        }

        html {
            min-height: 100%;
            min-height: 100dvh;
            overflow-x: hidden;
            background: #06b6d4;
        }

        body {
            min-height: 100vh;
            min-height: 100svh;
            min-height: 100dvh;
            margin: 0;
            display: grid;
            grid-template-rows: minmax(0, 1fr) 4.9rem auto;
            grid-template-areas: "main" "." "footer";
            overflow-x: hidden;
            background:
                radial-gradient(circle at 28% 20%, rgba(255, 241, 196, 0.16), transparent 24rem),
                radial-gradient(circle at 72% 18%, rgba(237, 85, 101, 0.18), transparent 22rem),
                linear-gradient(145deg, #06b6d4 0%, #0891b2 52%, #0e7490 100%);
            color: #f8fafc;
            font-family: "Segoe UI", "Open Sans", Arial, sans-serif;
        }

        .wf-login-main {
            grid-area: main;
            position: relative;
            min-height: 0;
            display: grid;
            place-items: center;
            padding: clamp(18px, 4vh, 36px) 18px 0;
            isolation: isolate;
        }

        .wf-login-layout {
            position: relative;
            z-index: 1;
            width: min(1180px, calc(100vw - 44px));
            min-height: min(530px, calc(100vw - 44px));
            display: grid;
            place-items: center;
        }

        .wf-login-sky {
            position: absolute;
            inset: 0 0 auto;
            z-index: 0;
            height: min(70vh, 620px);
            height: min(70dvh, 620px);
            overflow: hidden;
            contain: layout paint;
            pointer-events: none;
            transform: translateZ(0);
        }

        .wf-login-shooting-star {
            position: absolute;
            top: var(--star-top, -8%);
            left: var(--star-left, 50%);
            width: var(--star-tail, 72px);
            height: 2px;
            border-radius: 999px;
            opacity: 0;
            background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(244, 253, 255, 0.95));
            box-shadow: 0 0 7px rgba(255, 255, 255, 0.54);
            transform: translate3d(0, 0, 0) rotate(var(--star-angle, 34deg)) scaleX(0);
            transform-origin: right center;
            animation: wf-login-shooting-star var(--star-time, 5.8s) ease-in-out infinite;
            animation-delay: var(--star-delay, 0s);
            will-change: transform, opacity;
        }

        .wf-login-shooting-star::before,
        .wf-login-shooting-star::after {
            content: "";
            position: absolute;
            top: calc(50% - 1px);
            right: 0;
            width: 18px;
            height: 2px;
            border-radius: 999px;
            opacity: 0;
            background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(247, 253, 255, 0.96), rgba(255, 255, 255, 0));
            animation: wf-login-star-shine var(--star-time, 5.8s) ease-in-out infinite;
            animation-delay: var(--star-delay, 0s);
            will-change: opacity;
        }

        .wf-login-shooting-star::before {
            transform: translateX(50%) rotate(45deg);
        }

        .wf-login-shooting-star::after {
            transform: translateX(50%) rotate(-45deg);
        }

        .wf-login-ring {
            position: relative;
            z-index: 2;
            width: min(530px, calc(100vw - 44px));
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wf-login-ring i {
            position: absolute;
            inset: 0;
            border: 2px solid rgba(255, 255, 255, 0.82);
            transition: border-color 0.5s ease, filter 0.5s ease, border-width 0.5s ease;
        }

        .wf-login-ring i:nth-child(1) {
            border-radius: 38% 62% 63% 37% / 41% 44% 56% 59%;
            animation: wf-login-spin 6s linear infinite;
        }

        .wf-login-ring i:nth-child(2) {
            border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
            animation: wf-login-spin 4s linear infinite;
        }

        .wf-login-ring i:nth-child(3) {
            border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
            animation: wf-login-spin-reverse 10s linear infinite;
        }

        .wf-login-ring:hover i,
        .wf-login-ring:focus-within i {
            border-width: 6px;
            border-color: var(--clr);
            filter: drop-shadow(0 0 20px var(--clr));
        }

        .wf-login-card {
            position: absolute;
            width: min(306px, 74vw);
            min-height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .wf-login-logo {
            width: min(420px, 76vw);
            height: auto;
            max-height: 120px;
            display: block;
            object-fit: contain;
            filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
        }

        .wf-login-only {
            margin-top: -8px;
            color: #ffe4ec;
            font-size: 0.9rem;
            font-weight: 850;
            letter-spacing: 0.03em;
        }

        .wf-login-title {
            margin: 0;
            color: #ffffff;
            font-size: clamp(1.58rem, 4.6vw, 1.92rem);
            font-weight: 950;
            line-height: 1;
            text-align: center;
        }

        .wf-login-input {
            width: 100%;
            display: block;
            border: 2px solid rgba(255, 255, 255, 0.88);
            border-radius: 999px;
            padding: 11px 18px;
            background: rgba(255, 255, 255, 0.04);
            color: #ffffff;
            font: inherit;
            font-size: 1.08rem;
            font-weight: 800;
            outline: none;
            box-shadow: none;
        }

        .wf-login-input::placeholder {
            color: rgba(255, 255, 255, 0.72);
        }

        .wf-login-input:focus {
            border-color: #fff172;
            box-shadow: 0 0 0 4px rgba(255, 241, 114, 0.12);
        }

        .wf-login-submit {
            width: 100%;
            border: 0;
            border-radius: 999px;
            padding: 12px 18px;
            background: linear-gradient(45deg, #ed5565, #fff172);
            color: #3b0717;
            font: inherit;
            font-size: 1.08rem;
            font-weight: 950;
            cursor: pointer;
            box-shadow: 0 18px 34px rgba(237, 85, 101, 0.22);
            transition: transform 160ms ease, filter 160ms ease;
        }

        .wf-login-submit:hover,
        .wf-login-submit:focus-visible {
            transform: translateY(-2px);
            filter: saturate(1.08);
            outline: 0;
        }

        .wf-login-error {
            width: 100%;
            margin: 0;
            border: 1px solid rgba(255, 255, 255, 0.34);
            border-radius: 999px;
            padding: 9px 14px;
            background: rgba(237, 85, 101, 0.16);
            color: #fff1f2;
            font-size: 0.84rem;
            font-weight: 850;
            text-align: center;
        }

        .wf-login-links {
            width: 100%;
            display: flex;
            justify-content: center;
            gap: 10px;
            color: rgba(255, 255, 255, 0.74);
            font-size: 0.82rem;
            font-weight: 800;
            text-align: center;
        }

        .wf-login-promo {
            position: absolute;
            top: 50%;
            left: calc(50% + min(25vw, 285px));
            z-index: 1;
            width: clamp(240px, 22vw, 420px);
            display: grid;
            gap: 10px;
            align-items: center;
            color: #ffffff;
            text-decoration: none;
            transform: translateY(-50%);
        }

        .wf-login-promo-video {
            width: 100%;
            height: auto;
            display: block;
            border: 2px solid rgba(255, 255, 255, 0.54);
            border-radius: 26px;
            background: #130d2b;
            box-shadow: 0 24px 54px rgba(8, 3, 24, 0.34);
            overflow: hidden;
        }

        .wf-login-promo-link {
            justify-self: center;
            border-radius: 999px;
            padding: 7px 14px;
            background: rgba(255, 255, 255, 0.13);
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.83rem;
            font-weight: 900;
            line-height: 1.2;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
            backdrop-filter: blur(6px);
        }

        .wf-login-promo:hover .wf-login-promo-video,
        .wf-login-promo:focus-visible .wf-login-promo-video {
            border-color: rgba(255, 241, 114, 0.9);
            box-shadow: 0 28px 62px rgba(8, 3, 24, 0.42), 0 0 0 4px rgba(255, 241, 114, 0.16);
        }

        .wf-login-promo:focus-visible {
            outline: 0;
        }

        .wf-login-footer {
            --footer-background: #0e8fa0;
            z-index: 1;
            position: relative;
            grid-area: footer;
            min-height: 12.15rem;
            display: grid;
            overflow: visible;
            background-color: var(--footer-background);
            animation: wf-footer-background-cycle 52s ease-in-out infinite -13s;
            contain: layout;
            isolation: isolate;
        }

        .wf-login-bubbles {
            position: absolute;
            top: -6.6rem;
            left: -3rem;
            right: -3rem;
            height: 12.4rem;
            overflow: visible;
            contain: layout;
            filter: url("#wf-login-blob");
            backface-visibility: hidden;
            pointer-events: none;
            transform: translateZ(0);
        }

        .wf-login-bubbles::before,
        .wf-login-bubbles::after {
            content: "";
            position: absolute;
            background-color: var(--footer-background);
            will-change: transform;
        }

        .wf-login-bubbles::before {
            left: -2rem;
            right: -2rem;
            bottom: -1.1rem;
            height: 6.3rem;
            border-radius: 999px 999px 0 0;
            transform: translate3d(0, 0, 0);
        }

        .wf-login-bubbles::after {
            left: -8rem;
            right: -8rem;
            bottom: 1.5rem;
            height: 4.8rem;
            border-radius: 48% 52% 42% 58% / 64% 58% 42% 36%;
            animation: wf-liquid-sway 13.5s ease-in-out infinite;
            transform: translate3d(0, 0, 0) scaleY(1);
            transform-origin: center bottom;
        }

        .wf-login-bubble {
            position: absolute;
            left: var(--position, 50%);
            bottom: 0.74rem;
            width: var(--size, 4rem);
            height: var(--size, 4rem);
            background-color: var(--footer-background);
            border-radius: 100%;
            animation: wf-bubble-rise var(--time, 8s) cubic-bezier(0.42, 0, 0.24, 1) infinite var(--delay, 0s);
            transform: translate3d(-50%, 0.7rem, 0) scale(1.02, 0.82);
            transform-origin: center bottom;
        }

        .wf-login-footer-content {
            position: relative;
            z-index: 2;
            display: grid;
            grid-template-columns: minmax(16rem, 0.88fr) minmax(26rem, 1.15fr) minmax(12.5rem, 0.56fr);
            gap: clamp(1.25rem, 2.4vw, 2.35rem);
            align-items: center;
            width: 100%;
            margin-top: -1px;
            padding: 1.65rem max(2rem, calc((100vw - 1120px) / 2)) 1.05rem;
            background: transparent;
            color: #210915;
        }

        .wf-login-footer-content b,
        .wf-login-footer-content a,
        .wf-login-footer-content p,
        .wf-login-footer-content span {
            color: #270817;
            text-decoration: none;
        }

        .wf-login-footer-content b {
            display: block;
            color: #210814;
            font-size: 0.76rem;
            letter-spacing: 0.18em;
            line-height: 1.15;
            text-transform: uppercase;
        }

        .wf-login-footer-content p {
            margin: 0;
            font-size: 0.84rem;
            font-weight: 750;
            line-height: 1.45;
        }

        .wf-login-footer-groups,
        .wf-login-footer-content > div:has(> .wf-login-footer-image) {
            display: none;
        }

        .wf-login-footer-brand {
            display: grid;
            align-content: start;
            gap: 0.68rem;
            max-width: 20rem;
        }

        .wf-login-footer-logo {
            width: min(260px, 72vw);
            height: auto;
            display: block;
            filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.16));
        }

        .wf-login-whatsapp {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.55rem;
            width: fit-content;
            min-height: 38px;
            border-radius: 999px;
            padding: 0 1.15rem;
            background: #ffffff;
            color: #1f2937;
            font-size: 0.82rem;
            font-weight: 900;
            text-decoration: none;
            box-shadow: 0 16px 30px rgba(70, 5, 25, 0.16);
            transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .wf-login-whatsapp:hover,
        .wf-login-whatsapp:focus-visible {
            transform: translateY(-2px);
            box-shadow: 0 22px 34px rgba(70, 5, 25, 0.2);
            outline: 0;
        }

        .wf-login-whatsapp svg,
        .wf-login-footer-contact svg,
        .wf-login-whatsapp-float svg {
            flex: 0 0 auto;
        }

        .wf-login-whatsapp svg {
            color: #21b85b;
            filter: drop-shadow(0 2px 4px rgba(33, 184, 91, 0.18));
        }

        .wf-login-footer-info {
            display: grid;
            grid-template-columns: minmax(8.4rem, 0.5fr) minmax(16rem, 1fr);
            gap: clamp(1.1rem, 2vw, 1.85rem);
            align-items: start;
        }

        .wf-login-footer-nav {
            display: grid;
            align-content: start;
            gap: 0.5rem;
        }

        .wf-login-footer-nav a {
            display: block;
            width: fit-content;
            font-weight: 850;
        }

        .wf-login-footer-contact {
            display: grid;
            align-content: start;
            gap: 0.5rem;
            max-width: 27rem;
        }

        .wf-login-footer-contact-row {
            display: flex;
            align-items: flex-start;
            gap: 0.58rem;
            font-weight: 780;
            line-height: 1.35;
        }

        .wf-login-footer-contact-row span {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .wf-login-footer-contact-row svg {
            color: #ffd23f;
            margin-top: 0.08rem;
        }

        .wf-login-footer-note {
            border-top: 1px solid rgba(39, 8, 23, 0.16);
            max-width: 25rem;
            padding-top: 0.52rem;
        }

        .wf-login-visitor-counter {
            justify-self: end;
            min-width: 12.35rem;
            display: grid;
            gap: 0.52rem;
            border: 1px solid rgba(255, 255, 255, 0.28);
            border-radius: 8px;
            padding: 0.72rem 0.86rem;
            background:
                linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08)),
                rgba(255, 255, 255, 0.1);
            color: #210814;
            box-shadow: 0 16px 34px rgba(4, 55, 64, 0.12);
            backdrop-filter: blur(6px);
        }

        .wf-login-visitor-counter b {
            color: #270817;
            font-size: 0.72rem;
            font-weight: 950;
            letter-spacing: 0;
            line-height: 1.18;
            text-transform: uppercase;
        }

        .wf-login-counter-main {
            display: flex;
            align-items: flex-end;
            gap: 0.68rem;
        }

        .wf-login-visitor-counter strong {
            color: #ffffff;
            font-size: 2.15rem;
            font-weight: 950;
            line-height: 1;
            text-shadow: 0 8px 18px rgba(4, 55, 64, 0.24);
        }

        .wf-login-visitor-counter span {
            color: #270817;
            font-size: 0.78rem;
            font-weight: 850;
            line-height: 1.3;
        }

        .wf-login-counter-main span {
            max-width: 5.9rem;
            padding-bottom: 0.18rem;
        }

        .wf-login-counter-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.45rem;
            color: rgba(39, 8, 23, 0.86);
            font-size: 0.7rem;
            font-weight: 850;
            line-height: 1.3;
        }

        .wf-login-counter-meta span {
            border-radius: 999px;
            padding: 0.28rem 0.52rem;
            background: rgba(255, 255, 255, 0.18);
            font-size: inherit;
        }

        .wf-login-counter-meta small {
            color: rgba(39, 8, 23, 0.78);
            font-size: inherit;
            font-weight: 850;
        }

        .wf-login-footer-image {
            display: none;
        }

        .wf-login-footer-image + p {
            display: none;
        }

        .wf-login-whatsapp-float {
            position: fixed;
            right: 1.65rem;
            bottom: 1.35rem;
            z-index: 4;
            width: 58px;
            height: 58px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.72);
            background:
                radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.38), transparent 0 25%),
                linear-gradient(145deg, #2fed76 0%, #1ebc59 54%, #0f9f49 100%);
            color: #ffffff;
            box-shadow: 0 18px 36px rgba(21, 128, 61, 0.36), inset 0 -6px 14px rgba(6, 95, 70, 0.22);
            text-decoration: none;
            transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .wf-login-whatsapp-float:hover,
        .wf-login-whatsapp-float:focus-visible {
            transform: translateY(-3px) scale(1.03);
            box-shadow: 0 22px 42px rgba(21, 128, 61, 0.44), inset 0 -6px 14px rgba(6, 95, 70, 0.2);
            outline: 0;
        }

        .wf-login-runner {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 4;
            width: clamp(70px, 8vw, 118px);
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 18px 26px rgba(16, 4, 28, 0.24));
            transform: translate3d(var(--login-runner-x, 14vw), var(--login-runner-y, 58vh), 0) scaleX(var(--login-runner-dir, 1));
            will-change: transform;
        }

        .wf-login-svg-filter {
            position: fixed;
            top: 100vh;
            left: 0;
            width: 0;
            height: 0;
        }

        @keyframes wf-login-spin {
            to {
                transform: rotate(360deg);
            }
        }

        @keyframes wf-login-spin-reverse {
            from {
                transform: rotate(360deg);
            }
            to {
                transform: rotate(0deg);
            }
        }

        @keyframes wf-footer-background-cycle {
            0%, 100% {
                --footer-background: #0e8fa0;
            }
            12.5% {
                --footer-background: #148b55;
            }
            25% {
                --footer-background: #7c8f19;
            }
            37.5% {
                --footer-background: #c78019;
            }
            50% {
                --footer-background: #c03568;
            }
            62.5% {
                --footer-background: #8b4fd1;
            }
            75% {
                --footer-background: #315fd1;
            }
            87.5% {
                --footer-background: #0f7fbb;
            }
        }

        @keyframes wf-liquid-sway {
            0%, 100% {
                transform: translate3d(-1.2%, 0.18rem, 0) scale3d(1.03, 0.96, 1);
            }
            34% {
                transform: translate3d(1.35%, -0.22rem, 0) scale3d(0.985, 1.06, 1);
            }
            68% {
                transform: translate3d(-0.35%, 0.08rem, 0) scale3d(1.02, 1.015, 1);
            }
        }

        @keyframes wf-bubble-rise {
            0% {
                transform: translate3d(-50%, 0.75rem, 0) scale3d(1.08, 0.78, 1);
            }
            28% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * 0.22)), calc(var(--distance, 10rem) * -0.31), 0) scale3d(calc(var(--swell, 1) * 1.08), 0.94, 1);
            }
            58% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * -0.18)), calc(var(--distance, 10rem) * -0.64), 0) scale3d(calc(var(--swell, 1) * 0.98), 1.04, 1);
            }
            82% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * 0.42)), calc(var(--distance, 10rem) * -0.86), 0) scale3d(0.78, 0.78, 1);
            }
            100% {
                transform: translate3d(calc(-50% + var(--drift, 0rem)), calc(var(--distance, 10rem) * -1), 0) scale3d(0.18, 0.18, 1);
            }
        }

        @keyframes wf-bubble-rise-mobile {
            0% {
                transform: translate3d(-50%, 0.55rem, 0) scale3d(0.88, 0.7, 1);
            }
            36% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * 0.18)), -2.5rem, 0) scale3d(0.86, 0.82, 1);
            }
            72% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * -0.14)), -4.7rem, 0) scale3d(0.76, 0.86, 1);
            }
            100% {
                transform: translate3d(calc(-50% + (var(--drift, 0rem) * 0.28)), -6.15rem, 0) scale3d(0.14, 0.14, 1);
            }
        }

        @keyframes wf-login-shooting-star {
            0% {
                opacity: 0;
                transform: translate3d(0, 0, 0) rotate(var(--star-angle, 34deg)) scaleX(0);
            }
            12% {
                opacity: var(--star-opacity, 0.58);
            }
            36% {
                opacity: var(--star-opacity, 0.58);
                transform: translate3d(0, 0, 0) rotate(var(--star-angle, 34deg)) scaleX(1);
            }
            100% {
                opacity: 0;
                transform: translate3d(var(--star-x, 32vw), var(--star-y, 28vh), 0) rotate(var(--star-angle, 34deg)) scaleX(0);
            }
        }

        @keyframes wf-login-star-shine {
            0%, 18%, 100% {
                opacity: 0;
            }
            36% {
                opacity: 0.84;
            }
        }

        @media (max-width: 1080px) {
            .wf-login-promo {
                display: none;
            }
        }

        @media (max-width: 980px) {
            .wf-login-footer-content {
                grid-template-columns: minmax(0, 1fr) minmax(12rem, auto);
                gap: 1.15rem 1.65rem;
            }

            .wf-login-footer-info {
                grid-column: 1 / -1;
                grid-template-columns: minmax(8.4rem, 0.48fr) minmax(16rem, 1fr);
            }

            .wf-login-visitor-counter {
                align-self: start;
            }
        }

        @media (max-width: 720px) {
            .wf-login-shooting-star:nth-child(n+12) {
                display: none;
            }
        }

        @media (max-width: 820px) {
            body {
                grid-template-rows: minmax(0, auto) clamp(7.35rem, 27vw, 8.2rem) auto;
                padding-left: env(safe-area-inset-left);
                padding-right: env(safe-area-inset-right);
                overflow-x: clip;
            }

            .wf-login-main,
            .wf-login-footer {
                overflow-x: clip;
            }

            .wf-login-bubbles {
                top: -4.45rem;
                left: -1.75rem;
                right: -1.75rem;
                height: 8.85rem;
            }

            .wf-login-bubbles::before {
                bottom: -0.85rem;
                height: 4.8rem;
            }

            .wf-login-bubbles::after {
                left: -4rem;
                right: -4rem;
                bottom: 1.25rem;
                height: 3.6rem;
            }

            .wf-login-bubble {
                animation:
                    wf-bubble-rise-mobile var(--time, 8s) cubic-bezier(0.42, 0, 0.24, 1) infinite var(--delay, 0s);
            }

            .wf-login-whatsapp {
                min-height: 42px;
                padding: 0 1rem;
            }

            .wf-login-layout {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: clamp(12px, 2.4vh, 20px);
                min-height: auto;
            }

            .wf-login-ring {
                flex: 0 0 auto;
            }

            .wf-login-promo {
                position: relative;
                top: auto;
                left: auto;
                z-index: 1;
                width: min(360px, calc(100vw - 44px));
                display: grid;
                gap: 8px;
                transform: none;
            }

            .wf-login-promo-video {
                border-radius: 20px;
                box-shadow: 0 14px 30px rgba(8, 3, 24, 0.28);
            }

            .wf-login-promo-link {
                padding: 6px 13px;
                font-size: 0.8rem;
            }
        }

        @media (max-width: 720px) {
            .wf-login-main {
                padding: max(22px, env(safe-area-inset-top)) 14px 0;
            }

            .wf-login-layout {
                width: min(100%, calc(100vw - 28px));
            }

            .wf-login-card {
                width: min(300px, 78vw);
                gap: 13px;
            }

            .wf-login-footer-content {
                grid-template-columns: 1fr;
                gap: 0.85rem;
                place-items: center;
                padding: 1.2rem max(1rem, env(safe-area-inset-right)) calc(1.15rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
                text-align: center;
            }

            .wf-login-footer-brand,
            .wf-login-footer-info,
            .wf-login-footer-nav,
            .wf-login-footer-contact,
            .wf-login-visitor-counter {
                justify-items: center;
                width: 100%;
            }

            .wf-login-visitor-counter {
                justify-self: center;
                text-align: center;
                width: min(100%, 20rem);
                min-width: 0;
                padding: 0.66rem 0.78rem;
            }

            .wf-login-footer-info {
                grid-template-columns: 1fr;
                gap: 0.78rem;
            }

            .wf-login-footer-brand {
                max-width: min(20rem, 100%);
                gap: 0.56rem;
            }

            .wf-login-footer-logo {
                width: min(220px, 62vw);
            }

            .wf-login-footer-content p {
                font-size: 0.78rem;
                line-height: 1.36;
            }

            .wf-login-footer-nav,
            .wf-login-footer-contact {
                gap: 0.42rem;
            }

            .wf-login-footer-note {
                padding-top: 0.42rem;
            }

            .wf-login-visitor-counter strong {
                font-size: 2rem;
            }

            .wf-login-counter-main,
            .wf-login-counter-meta {
                justify-content: center;
            }

            .wf-login-counter-main span {
                max-width: none;
            }

            .wf-login-footer-contact-row {
                justify-content: center;
                flex-wrap: wrap;
                gap: 0.45rem;
            }

            .wf-login-footer-content p,
            .wf-login-footer-contact-row span {
                max-width: min(19.5rem, calc(100vw - 2.3rem));
            }

            .wf-login-whatsapp-float {
                display: none;
            }

            .wf-login-runner {
                display: none;
            }
        }

        @media (max-width: 420px) {
            .wf-login-layout {
                width: min(360px, calc(100vw - 34px));
                min-height: min(360px, calc(100vw - 34px));
            }

            .wf-login-ring {
                width: min(360px, calc(100vw - 34px));
            }

            .wf-login-card {
                width: min(296px, calc(100vw - 58px));
                gap: 9px;
            }

            .wf-login-logo {
                width: min(340px, 72vw);
                max-height: 92px;
            }

            .wf-login-input,
            .wf-login-submit {
                min-height: 46px;
                padding: 11px 16px;
                font-size: 1rem;
            }

            .wf-login-promo {
                width: min(322px, calc(100vw - 48px));
                gap: 7px;
            }

            .wf-login-promo-video {
                border-radius: 18px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
            }

            .wf-login-footer,
            .wf-login-bubbles::before,
            .wf-login-bubbles::after,
            .wf-login-bubble {
                animation: none !important;
            }

            .wf-login-bubble {
                width: var(--size, 4rem);
                height: var(--size, 4rem);
                bottom: 2.8rem;
                transform: translate3d(-50%, 0, 0) scale(0.82);
            }
        }
    </style>
</head>
<body>
    <main class="wf-login-main">
        <div class="wf-login-sky" aria-hidden="true">
            <?php for ($i = 0; $i < $homeLoginShootingStarCount; $i++): ?>
                <span class="wf-login-shooting-star" style="<?php echo wf_home_e(wf_home_shooting_star_style($i)); ?>"></span>
            <?php endfor; ?>
        </div>
        <div class="wf-login-layout">
            <form class="wf-login-ring" method="post" action="<?php echo wf_home_e(wf_home_url('/')); ?>" autocomplete="off" novalidate>
                <i style="--clr:#00ff0a;" aria-hidden="true"></i>
                <i style="--clr:#ff0057;" aria-hidden="true"></i>
                <i style="--clr:#fffd44;" aria-hidden="true"></i>
                <div class="wf-login-card">
                    <img class="wf-login-logo" src="<?php echo wf_home_e($homeLoginLogoUrl); ?>" alt="Wimifarma" width="1560" height="622">
                    <span class="wf-login-only">Apenas funcion&aacute;rios</span>
                    <h1 class="wf-login-title">Login</h1>
                    <?php if ($homeLoginError !== ''): ?>
                        <p class="wf-login-error"><?php echo wf_home_e($homeLoginError); ?></p>
                    <?php endif; ?>
                    <input type="hidden" name="wf_home_action" value="login">
                    <input type="hidden" name="wf_home_csrf" value="<?php echo wf_home_e((string) $_SESSION['wf_home_csrf']); ?>">
                    <input class="wf-login-input" type="text" name="username" placeholder="Login" autocomplete="username" required autofocus>
                    <input class="wf-login-input" type="password" name="password" placeholder="Senha" autocomplete="current-password" required>
                    <button class="wf-login-submit" type="submit">Entrar</button>
                    <div class="wf-login-links" aria-hidden="true">
                        <span>Wimifarma</span>
                        <span>&middot;</span>
                        <span>Acesso interno</span>
                    </div>
                </div>
            </form>
            <a class="wf-login-promo" href="<?php echo wf_home_e($homeLoginPromoUrl); ?>" aria-label="Abrir wimifarma.com.br">
                <video class="wf-login-promo-video" src="<?php echo wf_home_e($homeLoginPromoVideoUrl); ?>" autoplay muted loop playsinline preload="metadata"></video>
                <span class="wf-login-promo-link">wimifarma.com.br</span>
            </a>
        </div>
    </main>

    <footer class="wf-login-footer">
        <div class="wf-login-bubbles" aria-hidden="true">
            <?php for ($i = 0; $i < $homeLoginBubbleCount; $i++): ?>
                <span class="wf-login-bubble" style="<?php echo wf_home_e(wf_home_bubble_style($i)); ?>"></span>
            <?php endfor; ?>
        </div>
        <div class="wf-login-footer-content">
            <div class="wf-login-footer-brand">
                <img class="wf-login-footer-logo" src="<?php echo wf_home_e($homeLoginLogoUrl); ?>" alt="Wimifarma">
                <p>Atendimento local pelo WhatsApp para medicamentos, Farmacia Popular e entrega.</p>
                <a class="wf-login-whatsapp" href="https://wa.me/5544984134971" target="_blank" rel="noopener">
                    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M16.04 3.2c-7.05 0-12.78 5.67-12.78 12.65 0 2.23.6 4.41 1.73 6.32L3.2 28.8l6.82-1.78a12.9 12.9 0 0 0 6.02 1.5c7.05 0 12.78-5.67 12.78-12.65S23.09 3.2 16.04 3.2Zm0 23.1c-1.88 0-3.72-.5-5.33-1.44l-.38-.22-4.05 1.06 1.08-3.9-.25-.4a10.33 10.33 0 0 1-1.63-5.55c0-5.75 4.74-10.43 10.56-10.43S26.6 10.1 26.6 15.85 21.86 26.3 16.04 26.3Zm5.78-7.82c-.32-.16-1.88-.92-2.17-1.03-.29-.1-.5-.16-.71.16-.21.31-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.56-.94-.83-1.58-1.86-1.76-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.61-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.22 3.36 5.38 4.71.75.32 1.34.51 1.8.65.76.24 1.45.21 1.99.13.61-.09 1.88-.76 2.14-1.5.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.61-.37Z"/>
                    </svg>
                    <span>Chamar no WhatsApp</span>
                </a>
            </div>
            <div class="wf-login-footer-info">
                <nav class="wf-login-footer-nav" aria-label="Navegacao">
                    <b>Navegacao</b>
                    <a href="<?php echo wf_home_e(wf_home_url('/')); ?>">Farmacia Popular</a>
                    <a href="<?php echo wf_home_e(wf_home_url('/')); ?>">Sobre</a>
                    <a href="https://wa.me/5544984134971" target="_blank" rel="noopener">Contato</a>
                </nav>
                <div class="wf-login-footer-contact">
                    <b>Atendimento</b>
                    <div class="wf-login-footer-contact-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/>
                            <circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        <span>Avenida Minas Gerais, 2263 - Ivate, Parana</span>
                    </div>
                    <div class="wf-login-footer-contact-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v2.25a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.4 2 2 0 0 1 4.11 1.2h2.25a2 2 0 0 1 2 1.72c.12.9.33 1.79.62 2.63a2 2 0 0 1-.45 2.11L7.58 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.84.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>
                        </svg>
                        <span>(44) 98413-4971</span>
                    </div>
                    <p class="wf-login-footer-note">Pedidos e disponibilidade sempre sob confirmacao da equipe.</p>
                </div>
            </div>
            <div class="wf-login-visitor-counter" aria-label="Contador de acessos do site">
                <b>Acessos do site</b>
                <div class="wf-login-counter-main">
                    <strong><?php echo wf_home_e($homeVisitorCountLabel); ?></strong>
                    <span><?php echo wf_home_e($homeVisitorNoun); ?></span>
                </div>
                <div class="wf-login-counter-meta">
                    <span><?php echo wf_home_e($homeViewCountLabel . ' ' . $homeViewNoun); ?></span>
                    <small><?php echo wf_home_e($homeCounterStatus); ?></small>
                </div>
            </div>
        </div>
    </footer>
    <a class="wf-login-whatsapp-float" href="https://wa.me/5544984134971" target="_blank" rel="noopener" aria-label="Chamar no WhatsApp">
        <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M16.04 3.2c-7.05 0-12.78 5.67-12.78 12.65 0 2.23.6 4.41 1.73 6.32L3.2 28.8l6.82-1.78a12.9 12.9 0 0 0 6.02 1.5c7.05 0 12.78-5.67 12.78-12.65S23.09 3.2 16.04 3.2Zm0 23.1c-1.88 0-3.72-.5-5.33-1.44l-.38-.22-4.05 1.06 1.08-3.9-.25-.4a10.33 10.33 0 0 1-1.63-5.55c0-5.75 4.74-10.43 10.56-10.43S26.6 10.1 26.6 15.85 21.86 26.3 16.04 26.3Zm5.78-7.82c-.32-.16-1.88-.92-2.17-1.03-.29-.1-.5-.16-.71.16-.21.31-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.56-.94-.83-1.58-1.86-1.76-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.61-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.22 3.36 5.38 4.71.75.32 1.34.51 1.8.65.76.24 1.45.21 1.99.13.61-.09 1.88-.76 2.14-1.5.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.61-.37Z"/>
        </svg>
    </a>
    <img class="wf-login-runner" src="<?php echo wf_home_e(wf_home_url('/cashback/gato-hapy.gif')); ?>" alt="" aria-hidden="true" data-login-runner>
    <svg class="wf-login-svg-filter" aria-hidden="true" focusable="false">
        <defs>
            <filter id="wf-login-blob">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"></feGaussianBlur>
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob"></feColorMatrix>
            </filter>
        </defs>
    </svg>
    <?php if (isset($_GET['logged_out'])): ?>
    <script>
        (function () {
            'use strict';

            function clearStorage(storage, prefixes) {
                if (!storage) {
                    return;
                }
                try {
                    for (var index = storage.length - 1; index >= 0; index -= 1) {
                        var key = storage.key(index) || '';
                        if (prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; })) {
                            storage.removeItem(key);
                        }
                    }
                } catch (error) {
                    // Storage may be unavailable in restricted browser modes.
                }
            }

            clearStorage(window.sessionStorage, [
                'miauw_home_greeting_state_v2_',
                'miauw_widget_',
                'wf_home_'
            ]);
            clearStorage(window.localStorage, [
                'miauw_home_speech_last_',
                'miauw_widget_',
                'wf_home_'
            ]);
        }());
    </script>
    <?php endif; ?>
    <script>
        (function () {
            'use strict';

            function clamp(value, min, max) {
                return Math.max(min, Math.min(max, value));
            }

            function initLoginRunners() {
                var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-login-runner]'));

                if (nodes.length === 0 || !window.requestAnimationFrame) {
                    return;
                }

                var pointer = {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                    active: false
                };

                var states = nodes.map(function (node, index) {
                    return {
                        node: node,
                        x: clamp(window.innerWidth * (0.12 + index * 0.18), 18, Math.max(18, window.innerWidth - 150)),
                        y: clamp(window.innerHeight * 0.6, 78, Math.max(78, window.innerHeight - 140)),
                        vx: index % 2 === 0 ? 0.58 : -0.66,
                        vy: index % 2 === 0 ? -0.28 : 0.34,
                        phase: Math.random() * Math.PI * 2
                    };
                });

                function place(state) {
                    state.node.style.setProperty('--login-runner-x', state.x.toFixed(1) + 'px');
                    state.node.style.setProperty('--login-runner-y', state.y.toFixed(1) + 'px');
                    state.node.style.setProperty('--login-runner-dir', state.vx < 0 ? '-1' : '1');
                }

                states.forEach(place);
                if (reducedMotion) {
                    return;
                }

                window.addEventListener('pointermove', function (event) {
                    pointer.x = event.clientX;
                    pointer.y = event.clientY;
                    pointer.active = true;
                }, { passive: true });

                window.addEventListener('pointerleave', function () {
                    pointer.active = false;
                });

                var lastTick = performance.now();

                function tick(now) {
                    var dt = Math.min(32, now - lastTick) / 16.67;
                    lastTick = now;

                    states.forEach(function (state, index) {
                        var rect = state.node.getBoundingClientRect();
                        var width = rect.width || 100;
                        var height = rect.height || 96;
                        var centerX = state.x + width / 2;
                        var centerY = state.y + height / 2;
                        var dx = centerX - pointer.x;
                        var dy = centerY - pointer.y;
                        var distance = Math.max(1, Math.hypot(dx, dy));

                        if (pointer.active && distance < 210) {
                            var flee = (210 - distance) / 210;
                            state.vx += (dx / distance) * flee * 0.72;
                            state.vy += (dy / distance) * flee * 0.72;
                        } else {
                            state.vx += Math.cos(now / 900 + state.phase) * 0.014 * dt;
                            state.vy += Math.sin(now / 1100 + state.phase + index) * 0.014 * dt;
                        }

                        state.vx = clamp(state.vx * 0.992, -2.25, 2.25);
                        state.vy = clamp(state.vy * 0.992, -1.9, 1.9);
                        state.x += state.vx * dt;
                        state.y += state.vy * dt;

                        var maxX = Math.max(12, window.innerWidth - width - 12);
                        var maxY = Math.max(68, window.innerHeight - height - 12);

                        if (state.x < 12 || state.x > maxX) {
                            state.vx *= -0.86;
                            state.x = clamp(state.x, 12, maxX);
                        }

                        if (state.y < 68 || state.y > maxY) {
                            state.vy *= -0.86;
                            state.y = clamp(state.y, 68, maxY);
                        }

                        place(state);
                    });

                    window.requestAnimationFrame(tick);
                }

                window.requestAnimationFrame(tick);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initLoginRunners);
            } else {
                initLoginRunners();
            }
        }());
    </script>
</body>
</html>
<?php
exit;
endif;

$homeUserLogin = $homeAuthenticated && !empty($_SESSION['wf_home_user']) && is_string($_SESSION['wf_home_user'])
    ? strtolower(trim((string) $_SESSION['wf_home_user']))
    : '';
$homeUserIdentity = $homeUserLogin !== '' ? wf_home_core_user_identity($homeUserLogin) : null;
$homeUserLabel = $homeUserLogin !== '' ? wf_home_logged_user_label($homeUserLogin) : '';
$homeGreetingSessionKey = $homeUserLogin !== ''
    ? substr(hash('sha256', $homeUserLogin . '|' . (string) ($_SESSION['wf_home_login_nonce'] ?? '')), 0, 24)
    : '';

$modules = array(
    array(
        'module_key' => 'cashback',
        'name' => 'Cashback',
        'label' => 'Clientes',
        'description' => 'Compras, creditos, saldos e resgates.',
        'href' => '/cashback/',
        'accent' => 'blue',
    ),
    array(
        'name' => 'Cotação',
        'label' => 'Compras',
        'description' => 'Itens, fornecedores, precos e ganhadores.',
        'module_key' => 'cotacao',
        'href' => '/cotacao/',
        'accent' => 'green',
    ),
    array(
        'name' => 'Pedidos',
        'label' => 'Chegadas',
        'description' => 'Pedidos para chegar, boletos e historico.',
        'module_key' => 'pedidos',
        'href' => '/pedidos/',
        'accent' => 'wine',
        'order_badge' => true,
    ),
    array(
        'name' => 'Financeiro',
        'label' => 'Caixa diario',
        'description' => 'Fechamento, sangrias, PIX e maquininhas.',
        'module_key' => 'financeiro',
        'href' => '/financeiro/',
        'accent' => 'amber',
    ),
    array(
        'name' => 'Tarefas',
        'label' => 'Equipe',
        'description' => 'Prioridades, lembretes e conclusoes.',
        'module_key' => 'tarefa',
        'href' => '/tarefa/',
        'accent' => 'rose',
        'task_badge' => true,
    ),
    array(
        'name' => 'Códigos',
        'label' => 'Itens',
        'description' => 'Codigos, EAN, precos e comissoes.',
        'module_key' => 'codigos',
        'href' => '/codigos/',
        'accent' => 'teal',
    ),
    array(
        'name' => 'XP',
        'label' => 'Ranking',
        'description' => 'Niveis, vendas, fotos e XP mensal.',
        'module_key' => 'xp',
        'href' => '/xp/',
        'accent' => 'gold',
        'xp_frame' => true,
    ),
    array(
        'name' => 'Gestão',
        'label' => 'Contas',
        'description' => 'Contas a pagar, pagos do mes e recorrencias.',
        'module_key' => 'gestao',
        'href' => '/gestao/',
        'accent' => 'wine',
    ),
    array(
        'name' => 'Miauby',
        'label' => 'Fiscal interno',
        'description' => 'Chat, diagnostico e apoio da equipe.',
        'module_key' => 'miauw',
        'href' => '/miauby/',
        'accent' => 'violet',
    ),
    array(
        'name' => 'Miauby Whats',
        'label' => 'Canal interno',
        'description' => 'Fila, Evolution, automacoes e eventos.',
        'module_key' => 'miauw_whatsapp',
        'href' => '/miauby/whatsapp/',
        'accent' => 'teal',
        'home_class' => 'is-whatsapp-card',
    ),
    array(
        'name' => 'Usuários',
        'label' => 'Acessos',
        'description' => 'Logins, permissoes, WhatsApp e historico.',
        'module_key' => 'usuarios',
        'href' => '/usuarios/',
        'accent' => 'blue',
        'home_class' => 'is-users-card',
    ),
);
$homeModulePermissions = wf_home_module_permissions(
    $homeUserIdentity,
    array_map(static fn (array $module): string => (string) ($module['module_key'] ?? ''), $modules)
);
$modules = array_values(array_filter(
    $modules,
    static fn (array $module): bool => (bool) ($homeModulePermissions[(string) ($module['module_key'] ?? '')] ?? true)
));
$homeCanUseMiauw = (bool) ($homeModulePermissions['miauw'] ?? true);
$homeCanUseXp = (bool) ($homeModulePermissions['xp'] ?? true);
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="<?php echo wf_home_e(wf_home_asset('assets/img/favicon.svg')); ?>">
    <link rel="preload" as="image" href="<?php echo wf_home_e($homeLogoUrl); ?>">
    <style>
        * {
            box-sizing: border-box;
        }

        html {
            min-height: 100%;
            background: #f6f8fb;
        }

        body {
            min-height: 100%;
            margin: 0;
            color: #111827;
            background: #f6f8fb;
            font-family: "Segoe UI", Arial, sans-serif;
            overflow-x: hidden;
        }

        a {
            color: inherit;
        }

        .wf-page {
            position: relative;
            min-height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr;
            isolation: isolate;
            overflow-x: hidden;
        }

        .wf-backdrop {
            position: fixed;
            inset: 0;
            z-index: -2;
            overflow: hidden;
            background: #d9ecfb;
        }

        .wf-backdrop video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 1;
            filter: none;
        }

        .wf-backdrop::after {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
        }

        .wf-header {
            position: relative;
            z-index: 3;
            padding: 28px 0 12px;
        }

        .wf-shell {
            width: min(1180px, calc(100% - 40px));
            margin: 0 auto;
        }

        .wf-header-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
        }

        .wf-brand {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: clamp(320px, 32vw, 520px);
            max-width: 86vw;
            text-decoration: none;
            line-height: 0;
        }

        .wf-brand img {
            display: block;
            width: 100%;
            height: auto;
            aspect-ratio: 1560 / 622;
            filter: drop-shadow(0 10px 18px rgba(15, 23, 42, 0.22));
        }

        .wf-home-logout {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            border: 1px solid rgba(255, 255, 255, 0.78);
            border-radius: 999px;
            padding: 0 18px;
            background: rgba(255, 255, 255, 0.16);
            color: #ffffff;
            font-size: 0.9rem;
            font-weight: 900;
            text-decoration: none;
            text-shadow: 0 1px 10px rgba(15, 23, 42, 0.3);
            box-shadow: 0 12px 24px rgba(15, 23, 42, 0.1);
            backdrop-filter: blur(8px);
        }

        .wf-home-logout:hover,
        .wf-home-logout:focus-visible {
            background: rgba(168, 15, 67, 0.88);
            outline: 0;
        }

        .wf-access {
            display: grid;
            gap: 16px;
            align-items: start;
        }

        .wf-access.has-xp-profile {
            grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
        }

        .wf-user-xp {
            display: flex;
            justify-content: flex-start;
            min-width: 0;
            margin: 0 0 14px;
        }

        .wf-user-xp[hidden] {
            display: none;
        }

        .wf-access.has-xp-profile .wf-user-xp {
            grid-column: 1;
            grid-row: 1;
            margin: 0;
        }

        .wf-access.has-xp-profile .wf-modules {
            grid-column: 2;
            grid-row: 1;
        }

        .wf-user-xp-card {
            width: min(430px, 100%);
            min-height: 104px;
            display: grid;
            grid-template-columns: 74px minmax(0, 1fr);
            gap: 13px;
            align-items: center;
            padding: 12px 14px;
            border: 1px solid rgba(255, 211, 84, 0.76);
            border-radius: 8px;
            background:
                linear-gradient(135deg, rgba(44, 24, 92, 0.92), rgba(17, 24, 39, 0.88)),
                rgba(17, 24, 39, 0.88);
            color: #ffffff;
            text-decoration: none;
            box-shadow: 0 18px 34px rgba(15, 23, 42, 0.18);
            backdrop-filter: blur(6px);
        }

        .wf-user-xp-avatar {
            width: 64px;
            height: 64px;
            display: grid;
            place-items: center;
            border: 2px solid #facc15;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.12);
            color: #fef3c7;
            font-size: 0.85rem;
            font-weight: 950;
            overflow: hidden;
            box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.16);
        }

        .wf-user-xp-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .wf-user-xp-main {
            min-width: 0;
        }

        .wf-user-xp-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-width: 0;
        }

        .wf-user-xp-top strong {
            min-width: 0;
            overflow: hidden;
            color: #ffffff;
            font-size: 1.04rem;
            font-weight: 950;
            line-height: 1.1;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wf-user-xp-rank {
            flex: 0 0 auto;
            border-radius: 999px;
            padding: 5px 9px;
            background: #facc15;
            color: #431407;
            font-size: 0.76rem;
            font-weight: 950;
            line-height: 1;
        }

        .wf-user-xp-level {
            display: block;
            margin-top: 3px;
            color: #dbeafe;
            font-size: 0.8rem;
            font-weight: 850;
            line-height: 1.25;
        }

        .wf-user-xp-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
            margin-top: 8px;
            color: #fff7ed;
            font-size: 0.78rem;
            font-weight: 850;
        }

        .wf-user-xp-stats span {
            white-space: nowrap;
        }

        .wf-user-xp-bar {
            height: 10px;
            margin-top: 10px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.18);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
        }

        .wf-user-xp-fill {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #f59e0b, #fde047);
            box-shadow: 0 0 12px rgba(250, 204, 21, 0.45);
        }

        .wf-main {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            padding: clamp(22px, 5vh, 64px) 0 clamp(104px, 14vh, 180px);
        }

        .wf-visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        .wf-runners {
            position: fixed;
            inset: 0;
            z-index: 1;
            pointer-events: none;
            overflow: hidden;
        }

        .wf-runner {
            position: absolute;
            left: 0;
            top: 0;
            height: auto;
            pointer-events: none;
            opacity: 0.98;
            filter: drop-shadow(0 16px 24px rgba(15, 23, 42, 0.18));
            transform: translate3d(var(--wf-runner-x, 16vw), var(--wf-runner-y, 58vh), 0) scaleX(var(--wf-runner-dir, 1));
            will-change: transform;
        }

        .wf-runner.is-nyan {
            width: clamp(178px, 21vw, 340px);
        }

        .wf-runner.is-duck {
            width: clamp(112px, 12vw, 190px);
        }

        .wf-runner.is-dragon {
            width: clamp(62px, 7vw, 122px);
        }

        .wf-modules {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 14px;
            align-items: stretch;
        }

        .wf-modules[data-card-count="1"] {
            grid-template-columns: minmax(0, 220px);
        }

        .wf-modules[data-card-count="2"] {
            grid-template-columns: repeat(2, minmax(0, 220px));
        }

        .wf-modules[data-card-count="3"] {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .wf-modules[data-card-count="4"] {
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .wf-modules[data-card-count="6"] {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .wf-modules[data-card-count="7"],
        .wf-modules[data-card-count="8"] {
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .wf-card {
            --card-accent: #2563eb;
            --card-accent-soft: rgba(37, 99, 235, 0.1);
            position: relative;
            min-height: 178px;
            display: grid;
            grid-template-rows: auto auto minmax(2.9em, 1fr) auto;
            gap: 9px;
            overflow: hidden;
            padding: 17px 17px 15px;
            border: 1px solid rgba(203, 213, 225, 0.84);
            border-radius: 8px;
            background:
                linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94)),
                rgba(255, 255, 255, 0.94);
            backdrop-filter: blur(5px);
            color: #0f172a;
            text-decoration: none;
            box-shadow: 0 14px 30px rgba(15, 23, 42, 0.07);
            isolation: isolate;
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .wf-card:hover,
        .wf-card:focus-visible {
            transform: translateY(-3px);
            border-color: var(--card-accent);
            background:
                linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(248, 250, 252, 0.98)),
                var(--card-accent-soft);
            box-shadow: 0 20px 42px rgba(15, 23, 42, 0.11);
            outline: 0;
        }

        .wf-card-mark {
            width: 42px;
            height: 9px;
            border-radius: 999px;
            background: var(--card-accent);
            box-shadow: 0 8px 18px var(--card-accent-soft);
            transition: width 160ms ease, transform 160ms ease;
        }

        .wf-card:hover .wf-card-mark,
        .wf-card:focus-visible .wf-card-mark {
            width: 54px;
            transform: translateX(2px);
        }

        .wf-card[data-accent="blue"] {
            --card-accent: #2563eb;
            --card-accent-soft: rgba(37, 99, 235, 0.12);
        }

        .wf-card[data-accent="green"] {
            --card-accent: #16a34a;
            --card-accent-soft: rgba(22, 163, 74, 0.13);
        }

        .wf-card[data-accent="amber"] {
            --card-accent: #d97706;
            --card-accent-soft: rgba(217, 119, 6, 0.15);
        }

        .wf-card[data-accent="rose"] {
            --card-accent: #e11d48;
            --card-accent-soft: rgba(225, 29, 72, 0.13);
        }

        .wf-card[data-accent="violet"] {
            --card-accent: #7c3aed;
            --card-accent-soft: rgba(124, 58, 237, 0.13);
        }

        .wf-card[data-accent="teal"] {
            --card-accent: #0f766e;
            --card-accent-soft: rgba(15, 118, 110, 0.13);
        }

        .wf-card[data-accent="wine"] {
            --card-accent: #a80f43;
            --card-accent-soft: rgba(168, 15, 67, 0.14);
        }

        .wf-card[data-accent="gold"] {
            --card-accent: #f59e0b;
            --card-accent-soft: rgba(245, 158, 11, 0.16);
        }

        .wf-card.is-xp-card {
            border: 14px solid transparent;
            border-image: url("/xp/assets/moldura-card-home.svg?v=20260522d") 104 / 26px / 5px stretch;
            background:
                linear-gradient(rgba(255, 253, 237, 0.95), rgba(255, 253, 237, 0.95)) padding-box,
                linear-gradient(135deg, rgba(255, 246, 199, 0.94), rgba(255, 253, 237, 0.98)) border-box;
            padding: 16px 18px 18px;
            box-shadow: 0 18px 38px rgba(120, 78, 6, 0.12);
        }

        .wf-card.is-xp-card::before,
        .wf-card.is-xp-card::after {
            content: "";
            position: absolute;
            z-index: 1;
            pointer-events: none;
        }

        .wf-card.is-xp-card::before {
            inset: 14px;
            border-radius: 7px;
            background: rgba(255, 253, 238, 0.58);
        }

        .wf-card.is-xp-card::after {
            display: none;
        }

        .wf-card.is-xp-card > * {
            position: relative;
            z-index: 2;
        }

        .wf-card h2 {
            margin: 0;
            color: #0f172a;
            font-size: clamp(1.12rem, 1.38vw, 1.35rem);
            line-height: 1.08;
            letter-spacing: 0;
            overflow-wrap: anywhere;
        }

        .wf-card p {
            margin: 0;
            color: #475569;
            font-size: 0.9rem;
            font-weight: 720;
            line-height: 1.34;
        }

        .wf-card b {
            width: fit-content;
            min-height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(148, 163, 184, 0.5);
            border-radius: 999px;
            padding: 0 12px;
            background: rgba(255, 255, 255, 0.72);
            color: #0f172a;
            font-size: 0.82rem;
            font-weight: 950;
            line-height: 1;
            box-shadow: 0 10px 22px rgba(15, 23, 42, 0.05);
            transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .wf-card:hover b,
        .wf-card:focus-visible b {
            border-color: var(--card-accent);
            background: var(--card-accent);
            color: #ffffff;
        }

        .wf-card-badge {
            position: absolute;
            top: 14px;
            right: 14px;
            min-width: 32px;
            height: 28px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 0 9px;
            background: #dc2626;
            color: #ffffff;
            font-size: 0.82rem;
            font-style: normal;
            font-weight: 950;
            line-height: 1;
            box-shadow: 0 10px 22px rgba(220, 38, 38, 0.26);
        }

        .wf-card-badge[hidden] {
            display: none;
        }

        .wf-card-badge.is-calm {
            background: #16a34a;
            box-shadow: 0 10px 22px rgba(22, 163, 74, 0.22);
        }

        @media (max-width: 1040px) {
            .wf-header-inner {
                justify-content: center;
                flex-direction: column;
            }

            .wf-access,
            .wf-access.has-xp-profile {
                grid-template-columns: minmax(0, 1fr);
            }

            .wf-access.has-xp-profile .wf-user-xp,
            .wf-access.has-xp-profile .wf-modules {
                grid-column: auto;
                grid-row: auto;
            }

            .wf-modules {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .wf-modules[data-card-count] {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .wf-user-xp,
            .wf-access.has-xp-profile .wf-user-xp {
                justify-content: flex-start;
            }

            .wf-user-xp-card {
                width: min(430px, 100%);
            }
        }

        @media (max-width: 640px) {
            .wf-shell {
                width: min(100% - 18px, 1180px);
            }

            .wf-main {
                padding: 16px 0 84px;
            }

            .wf-header-inner {
                gap: 8px;
            }

            .wf-home-logout {
                min-height: 36px;
                padding: 0 15px;
                font-size: 0.8rem;
            }

            .wf-runner.is-nyan {
                width: clamp(150px, 52vw, 260px);
            }

            .wf-runner.is-duck {
                width: clamp(94px, 30vw, 150px);
            }

            .wf-runner.is-dragon {
                width: clamp(54px, 19vw, 92px);
            }

            .wf-modules {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .wf-user-xp-card {
                grid-template-columns: 58px minmax(0, 1fr);
                gap: 10px;
                min-height: 92px;
                padding: 10px 11px;
            }

            .wf-user-xp-avatar {
                width: 52px;
                height: 52px;
                border-radius: 15px;
            }

            .wf-user-xp-top strong {
                font-size: 0.94rem;
            }

            .wf-user-xp-stats {
                gap: 4px 10px;
                font-size: 0.72rem;
            }

            .wf-card {
                min-height: 144px;
                gap: 7px;
                padding: 12px 11px;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
            }

            .wf-card:hover,
            .wf-card:focus-visible {
                transform: translateY(-2px);
            }

            .wf-card-mark {
                width: 32px;
                height: 7px;
            }

            .wf-card h2 {
                font-size: clamp(0.98rem, 5.5vw, 1.16rem);
                line-height: 1.08;
                overflow-wrap: anywhere;
            }

            .wf-card p {
                display: -webkit-box;
                min-height: 2.2em;
                overflow: hidden;
                color: #526174;
                font-size: 0.74rem;
                line-height: 1.18;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }

            .wf-card b {
                min-height: 29px;
                padding: 0 10px;
                font-size: 0.74rem;
            }

            .wf-card-badge {
                top: 10px;
                right: 10px;
                min-width: 26px;
                height: 24px;
                padding: 0 7px;
                font-size: 0.72rem;
            }

            .wf-card.is-xp-card {
                border-width: 11px;
                border-image-width: 20px;
                border-image-outset: 0;
                padding: 12px 12px 13px;
            }

            .wf-card.is-xp-card::before {
                inset: 11px;
            }
        }

        @media (max-width: 360px) {
            .wf-modules {
                gap: 8px;
            }

            .wf-card {
                min-height: 132px;
                padding: 11px 10px;
            }

            .wf-card p {
                display: none;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
    <?php if ($homeCanUseMiauw): ?>
    <link rel="stylesheet" href="<?php echo wf_home_e(wf_home_url('/miauw/widget.css?v=20260603-home-jokes')); ?>">
    <?php endif; ?>
</head>
<body
    data-miauw-home-greeting="1"
    data-miauw-user-name="<?php echo wf_home_e($homeUserLabel); ?>"
    data-miauw-user-login="<?php echo wf_home_e($homeUserLogin); ?>"
    data-miauw-user-key="<?php echo wf_home_e($homeGreetingSessionKey); ?>"
    data-wf-home-user-login="<?php echo wf_home_e($homeUserLogin); ?>"
>
<div class="wf-page">
    <div class="wf-backdrop" aria-hidden="true">
        <video autoplay muted loop playsinline preload="metadata">
            <source src="<?php echo wf_home_e(wf_home_asset('assets/video/looping.mp4')); ?>" type="video/mp4">
        </video>
    </div>

    <div class="wf-runners" aria-hidden="true">
        <img class="wf-runner is-nyan" data-wf-runner="nyan" src="<?php echo wf_home_e(wf_home_asset('assets/img/nyan.gif')); ?>" alt="">
        <img class="wf-runner is-duck" data-wf-runner="duck" src="<?php echo wf_home_e(wf_home_asset('assets/img/pato.gif')); ?>" alt="">
        <img class="wf-runner is-dragon" data-wf-runner="dragon" src="<?php echo wf_home_e(wf_home_asset('assets/img/toothless.gif')); ?>" alt="">
    </div>

    <header class="wf-header">
        <div class="wf-shell wf-header-inner">
            <a class="wf-brand" href="<?php echo wf_home_e(wf_home_url('/')); ?>" aria-label="Wimifarma">
                <img src="<?php echo wf_home_e($homeLogoUrl); ?>" alt="Wimifarma" width="1560" height="622">
            </a>
            <a class="wf-home-logout" href="<?php echo wf_home_e(wf_home_url('/?sair=1')); ?>">Sair</a>
        </div>
    </header>

    <main class="wf-main">
        <div class="wf-shell wf-access" data-wf-access>
            <h1 class="wf-visually-hidden">Wimifarma</h1>

            <?php if ($homeCanUseXp): ?>
            <section class="wf-user-xp" data-wf-xp-profile hidden aria-live="polite"></section>
            <?php endif; ?>

            <section class="wf-modules" aria-label="Sistemas Wimifarma" data-card-count="<?php echo (int) count($modules); ?>">
                <?php foreach ($modules as $module): ?>
                    <?php
                    $cardClasses = array('wf-card');
                    if (!empty($module['xp_frame'])) {
                        $cardClasses[] = 'is-xp-card';
                    }
                    if (!empty($module['home_class'])) {
                        $cardClasses[] = (string) $module['home_class'];
                    }
                    ?>
                    <a class="<?php echo wf_home_e(implode(' ', $cardClasses)); ?>" href="<?php echo wf_home_e(wf_home_url($module['href'])); ?>" data-accent="<?php echo wf_home_e($module['accent']); ?>" data-module-card="<?php echo wf_home_e((string) ($module['module_key'] ?? '')); ?>">
                        <i class="wf-card-mark" aria-hidden="true"></i>
                        <?php if (!empty($module['task_badge'])): ?>
                            <em class="wf-card-badge" data-wf-task-badge hidden aria-label="Tarefas abertas"></em>
                        <?php endif; ?>
                        <?php if (!empty($module['order_badge'])): ?>
                            <em class="wf-card-badge is-calm" data-wf-order-badge hidden aria-label="Pedidos aguardando chegada"></em>
                        <?php endif; ?>
                        <h2><?php echo wf_home_e($module['name']); ?></h2>
                        <p><?php echo wf_home_e($module['description']); ?></p>
                        <b>Abrir</b>
                    </a>
                <?php endforeach; ?>
            </section>
        </div>
    </main>
</div>
<script>
    (function () {
        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function initHomeRunners() {
            var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-wf-runner]'));

            if (reducedMotion || nodes.length === 0) {
                return;
            }

            var pointer = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                active: false
            };

            var startingPoints = {
                nyan: { x: 0.12, y: 0.26, vx: 0.58, vy: -0.28 },
                duck: { x: 0.62, y: 0.34, vx: -0.66, vy: 0.34 },
                dragon: { x: 0.74, y: 0.58, vx: 0.58, vy: -0.28 }
            };

            var states = nodes.map(function (node, index) {
                var kind = node.getAttribute('data-wf-runner') || 'runner';
                var start = startingPoints[kind] || {
                    x: 0.16 + (index * 0.18),
                    y: 0.58 - (index * 0.2),
                    vx: index % 2 === 0 ? 0.58 : -0.66,
                    vy: index % 2 === 0 ? -0.28 : 0.34
                };

                return {
                    node: node,
                    x: clamp(window.innerWidth * start.x, 18, Math.max(18, window.innerWidth - 160)),
                    y: clamp(window.innerHeight * start.y, 72, Math.max(72, window.innerHeight - 160)),
                    vx: start.vx,
                    vy: start.vy,
                    phase: Math.random() * Math.PI * 2
                };
            });

            window.addEventListener('pointermove', function (event) {
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                pointer.active = true;
            }, { passive: true });

            window.addEventListener('pointerleave', function () {
                pointer.active = false;
            }, { passive: true });

            window.addEventListener('blur', function () {
                pointer.active = false;
            });

            var lastTick = performance.now();

            function tick(now) {
                var dt = Math.min(32, now - lastTick) / 16.67;
                lastTick = now;

                states.forEach(function (state, index) {
                    var rect = state.node.getBoundingClientRect();
                    var width = rect.width || 140;
                    var height = rect.height || 120;
                    var centerX = state.x + (width / 2);
                    var centerY = state.y + (height / 2);
                    var dx = centerX - pointer.x;
                    var dy = centerY - pointer.y;
                    var distance = Math.max(1, Math.hypot(dx, dy));

                    if (pointer.active && distance < 220) {
                        var flee = (220 - distance) / 220;
                        state.vx += (dx / distance) * flee * 0.76;
                        state.vy += (dy / distance) * flee * 0.76;
                    } else {
                        state.vx += Math.cos((now / 900) + state.phase) * 0.014 * dt;
                        state.vy += Math.sin((now / 1100) + state.phase + index) * 0.014 * dt;
                    }

                    state.vx = clamp(state.vx * 0.992, -2.25, 2.25);
                    state.vy = clamp(state.vy * 0.992, -1.9, 1.9);
                    state.x += state.vx * dt;
                    state.y += state.vy * dt;

                    var maxX = Math.max(12, window.innerWidth - width - 12);
                    var maxY = Math.max(68, window.innerHeight - height - 12);

                    if (state.x < 12 || state.x > maxX) {
                        state.vx *= -0.86;
                        state.x = clamp(state.x, 12, maxX);
                    }

                    if (state.y < 68 || state.y > maxY) {
                        state.vy *= -0.86;
                        state.y = clamp(state.y, 68, maxY);
                    }

                    state.node.style.setProperty('--wf-runner-x', state.x.toFixed(1) + 'px');
                    state.node.style.setProperty('--wf-runner-y', state.y.toFixed(1) + 'px');
                    state.node.style.setProperty('--wf-runner-dir', state.vx < 0 ? '-1' : '1');
                });

                window.requestAnimationFrame(tick);
            }

            window.requestAnimationFrame(tick);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initHomeRunners);
        } else {
            initHomeRunners();
        }
    }());
</script>
<script>
    (function () {
        function initTaskBadge() {
            var badge = document.querySelector('[data-wf-task-badge]');

            if (!badge || !window.fetch) {
                return;
            }

            fetch('<?php echo wf_home_e(wf_home_url('/tarefa/badge.php')); ?>', {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('badge unavailable');
                }

                return response.json();
            }).then(function (payload) {
                var open = Number(payload && payload.open ? payload.open : 0);

                if (!Number.isFinite(open) || open <= 0) {
                    badge.hidden = true;
                    return;
                }

                badge.textContent = open > 99 ? '99+' : String(open);
                badge.setAttribute('aria-label', open === 1 ? '1 tarefa aberta' : String(open) + ' tarefas abertas');
                badge.hidden = false;
            }).catch(function () {
                badge.hidden = true;
            });
        }

        function initOrderBadge() {
            var badge = document.querySelector('[data-wf-order-badge]');

            if (!badge || !window.fetch) {
                return;
            }

            fetch('<?php echo wf_home_e(wf_home_url('/pedidos/api/badge')); ?>', {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('order badge unavailable');
                }

                return response.json();
            }).then(function (payload) {
                var rawCount = payload && typeof payload.awaiting_arrival !== 'undefined'
                    ? payload.awaiting_arrival
                    : (payload && typeof payload.count !== 'undefined' ? payload.count : (payload && payload.arriving_today));
                var count = Number(rawCount || 0);
                if (!Number.isFinite(count) || count < 0) {
                    count = 0;
                }

                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.toggle('is-calm', count === 0);
                badge.setAttribute('aria-label', count === 1 ? '1 pedido aguardando chegada' : String(count) + ' pedidos aguardando chegada');
                badge.hidden = false;
            }).catch(function () {
                badge.hidden = true;
            });
        }

        function initXpProfileCard() {
            var holder = document.querySelector('[data-wf-xp-profile]');

            if (!holder || !window.fetch) {
                return;
            }

            var access = holder.closest('[data-wf-access]');
            var currentHomeUser = String((document.body && document.body.dataset && document.body.dataset.wfHomeUserLogin) || '').trim().toLowerCase();
            var endpoints = [
                '<?php echo wf_home_e(wf_home_url('/usuarios/api/me/xp-card')); ?>',
                '<?php echo wf_home_e(wf_home_url('/xp/api/me/xp-card')); ?>'
            ];
            var loading = false;

            function escapeHtml(value) {
                return String(value == null ? '' : value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            function formatNumber(value) {
                var number = Number(value || 0);
                if (!Number.isFinite(number)) {
                    number = 0;
                }
                return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number);
            }

            function initials(name, fallback) {
                var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
                if (!parts.length) {
                    return fallback || 'XP';
                }
                return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
            }

            function hide() {
                holder.hidden = true;
                holder.innerHTML = '';
                if (access) {
                    access.classList.remove('has-xp-profile');
                }
            }

            function payloadBelongsToCurrentUser(payload) {
                if (!currentHomeUser || !payload || !payload.user || !payload.user.username) {
                    return true;
                }
                return String(payload.user.username || '').trim().toLowerCase() === currentHomeUser;
            }

            function render(payload) {
                var xp = payload && payload.xp;
                if (!xp) {
                    hide();
                    return;
                }

                var progress = xp.progress || {};
                var percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
                var name = String(xp.name || (xp.is_admin ? 'ADM' : 'Funcionario'));
                var rank = xp.is_admin ? 'ADM' : '#' + formatNumber(xp.rank || 0);
                var photo = /^\/xp\/uploads\/(funcionarios|adm)\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(String(xp.photo_url || ''))
                    ? String(xp.photo_url)
                    : '';
                var avatar = photo
                    ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" loading="lazy" decoding="async">'
                    : '<span>' + escapeHtml(xp.is_admin ? 'ADM' : initials(name, 'XP')) + '</span>';

                holder.innerHTML =
                    '<a class="wf-user-xp-card" href="<?php echo wf_home_e(wf_home_url('/xp/')); ?>" aria-label="Abrir XP de ' + escapeHtml(name) + '">' +
                        '<div class="wf-user-xp-avatar">' + avatar + '</div>' +
                        '<div class="wf-user-xp-main">' +
                            '<div class="wf-user-xp-top"><strong>' + escapeHtml(name) + '</strong><span class="wf-user-xp-rank">' + escapeHtml(rank) + '</span></div>' +
                            '<span class="wf-user-xp-level">Nivel ' + escapeHtml(progress.level || 1) + ' -> ' + escapeHtml(progress.next_level || 2) + ' · ' + escapeHtml(percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })) + '%</span>' +
                            '<div class="wf-user-xp-stats"><span>Mes ' + escapeHtml(formatNumber(xp.month_xp)) + '</span><span>Total ' + escapeHtml(formatNumber(xp.total_xp)) + ' XP</span></div>' +
                            '<div class="wf-user-xp-bar" aria-hidden="true"><i class="wf-user-xp-fill" style="width: ' + escapeHtml(percent.toFixed(2)) + '%"></i></div>' +
                        '</div>' +
                    '</a>';
                holder.hidden = false;
                if (access) {
                    access.classList.add('has-xp-profile');
                }
            }

            function fetchEndpoint(index) {
                if (index >= endpoints.length) {
                    hide();
                    return Promise.resolve();
                }

                return fetch(endpoints[index], {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: {
                        'Accept': 'application/json',
                        'X-Wimifarma-Home-User': currentHomeUser
                    }
                }).then(function (response) {
                    if (response.status === 401 || response.status === 403 || response.status === 404) {
                        return fetchEndpoint(index + 1);
                    }
                    if (!response.ok) {
                        throw new Error('xp profile unavailable');
                    }
                    return response.json().then(function (payload) {
                        if (payload && payload.xp && payloadBelongsToCurrentUser(payload)) {
                            render(payload);
                            return undefined;
                        }
                        return fetchEndpoint(index + 1);
                    });
                }).catch(function () {
                    return fetchEndpoint(index + 1);
                });
            }

            function load() {
                if (loading) {
                    return;
                }
                loading = true;
                fetchEndpoint(0).finally(function () {
                    loading = false;
                });
            }

            load();
            window.setInterval(load, 20000);
            window.addEventListener('focus', load);
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden) {
                    load();
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initTaskBadge();
                initOrderBadge();
                initXpProfileCard();
            });
        } else {
            initTaskBadge();
            initOrderBadge();
            initXpProfileCard();
        }
    }());
</script>
<?php if ($homeCanUseMiauw): ?>
<script src="<?php echo wf_home_e(wf_home_url('/miauw/widget.js?v=20260603-home-10s')); ?>" defer></script>
<?php endif; ?>
</body>
</html>
