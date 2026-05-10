<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

unset($_SESSION['user_id'], $_SESSION['username'], $_SESSION['role']);
header('Location: /');
exit;
