<?php
declare(strict_types=1);

require_once __DIR__ . '/functions.php';

redirect_to(current_user() ? 'dashboard.php' : 'login.php');
