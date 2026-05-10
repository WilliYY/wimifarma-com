<?php
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

/*
 * Em ambiente local, crie um arquivo config.local.php nesta mesma pasta.
 * Esse arquivo nao deve ser enviado para producao.
 */
$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    require $localConfig;
}

if (!function_exists('wf_env_string')) {
    function wf_env_string(string $name, string $default = ''): string
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
}

/*
 * Dados do banco MySQL no Oracle/Docker.
 */
if (!defined('DB_HOST')) {
    define('DB_HOST', wf_env_string('WIMIFARMA_DB_HOST', 'wimifarma-com-db'));
}
if (!defined('DB_NAME')) {
    define('DB_NAME', wf_env_string('WIMIFARMA_APP_DB_NAME', 'wimifarma_app'));
}
if (!defined('DB_USER')) {
    define('DB_USER', wf_env_string('WIMIFARMA_DB_USER', 'wimifarma_user'));
}
if (!defined('DB_PASS')) {
    define('DB_PASS', wf_env_string('WIMIFARMA_DB_PASSWORD', 'wimifarma_dev_pass'));
}

define('APP_NAME', 'Wimifarma Cashback');
define('APP_VERSION', '2.0.0');

$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$cookiePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
$cookiePath = $cookiePath === '' ? '/' : $cookiePath . '/';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('WFWCASHBACK');

    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array(
            'lifetime' => 0,
            'path' => $cookiePath,
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ));
    } else {
        session_set_cookie_params(0, $cookiePath, '', $isHttps, true);
    }

    session_start();
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';

    $pdo = new PDO(
        $dsn,
        DB_USER,
        DB_PASS,
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        )
    );

    return $pdo;
}

function bootstrap_default_admin(): void
{
    if (!defined('ALLOW_DEFAULT_ADMIN_BOOTSTRAP') || ALLOW_DEFAULT_ADMIN_BOOTSTRAP !== true) {
        return;
    }

    try {
        $count = (int) db()->query('SELECT COUNT(*) FROM wf_users')->fetchColumn();

        if ($count > 0) {
            return;
        }

        $stmt = db()->prepare(
            'INSERT INTO wf_users (username, password_hash, role, active) VALUES (?, ?, ?, 1)'
        );
        $stmt->execute(array('adm', password_hash('adm', PASSWORD_DEFAULT), 'admin'));
    } catch (Throwable $error) {
        /*
         * Se o banco ainda nao foi importado, a tela de login vai mostrar erro
         * de conexao. Nao interrompemos aqui para facilitar diagnostico.
         */
    }
}

bootstrap_default_admin();
