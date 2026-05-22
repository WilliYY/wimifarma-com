<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (current_user()) {
    log_action('logout_xp', 'user', (int) $_SESSION['user_id'], 'Logout XP realizado.');
}

unset($_SESSION['user_id'], $_SESSION['username'], $_SESSION['role']);
header('Location: /');
exit;
