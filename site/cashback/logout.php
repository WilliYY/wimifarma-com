<?php
declare(strict_types=1);

require_once __DIR__ . '/functions.php';

if (current_user()) {
    log_action('logout', 'user', (int) $_SESSION['user_id'], 'Logout realizado.');
}

$_SESSION = array();

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}

session_destroy();

$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$scheme = $isHttps ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'wimifarma.com';

header('Location: ' . $scheme . '://' . $host . '/');
exit;
