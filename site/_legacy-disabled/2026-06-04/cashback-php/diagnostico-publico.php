<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

require_once __DIR__ . '/auth.php';
require_sensitive_area_access('Diagnostico publico');

function wf_diag_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function wf_diag_row(array &$rows, string $item, bool $ok, string $message): void
{
    $rows[] = array(
        'item' => $item,
        'ok' => $ok,
        'message' => $message,
    );
}

$rows = array();

try {
    $pdo = db();
    $pdo->query('SELECT 1');
    wf_diag_row($rows, 'Conexao MySQL/PDO', true, 'Conectou no banco configurado em config.php.');
} catch (Throwable $error) {
    wf_diag_row($rows, 'Conexao MySQL/PDO', false, $error->getMessage());
    $pdo = null;
}

$tables = array(
    'wf_users',
    'wf_atendentes',
    'wf_clientes',
    'wf_compras',
    'wf_cashback_creditos',
    'wf_resgates',
    'wf_resgate_itens',
    'wf_settings',
    'wf_logs',
    'wf_whatsapp_mensagens',
);

if ($pdo instanceof PDO) {
    foreach ($tables as $table) {
        try {
            $count = (int) $pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
            wf_diag_row($rows, 'Tabela ' . $table, true, $count . ' registro(s).');
        } catch (Throwable $error) {
            wf_diag_row($rows, 'Tabela ' . $table, false, $error->getMessage());
        }
    }

    foreach (array('valor_bruto', 'desconto_cashback', 'valor_cobrado', 'resgate_id') as $column) {
        try {
            $stmt = $pdo->prepare(
                'SELECT COUNT(*)
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?'
            );
            $stmt->execute(array('wf_compras', $column));
            wf_diag_row($rows, 'Coluna wf_compras.' . $column, (int) $stmt->fetchColumn() > 0, 'Coluna exigida pela versao atual.');
        } catch (Throwable $error) {
            wf_diag_row($rows, 'Coluna wf_compras.' . $column, false, $error->getMessage());
        }
    }
}

$files = array(
    'styles.css',
    'app.js',
    'logo-wimifarma.svg',
    'favicon.png',
    'header.php',
    'functions.php',
    'dashboard.php',
);

foreach ($files as $file) {
    wf_diag_row($rows, 'Arquivo ' . $file, is_file(__DIR__ . '/' . $file) && is_readable(__DIR__ . '/' . $file), 'Esperado em /cashback/' . $file);
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Diagnostico publico - Wimifarma Cashback</title>
    <link rel="icon" type="image/png" href="<?php echo wf_diag_h(app_url('favicon.png')); ?>">
    <link rel="stylesheet" href="<?php echo wf_diag_h(app_url('styles.css')); ?>?v=<?php echo wf_diag_h((string) filemtime(__DIR__ . '/styles.css')); ?>">
</head>
<body class="diagnostic-public">
    <main class="diagnostic-shell">
    <h1>Diagnostico publico Wimifarma Cashback</h1>
    <p>Esta pagina serve apenas para descobrir a causa do erro 500. Depois de corrigir, remova este arquivo do servidor.</p>
    <p>Caminho atual: <code><?php echo wf_diag_h(__DIR__); ?></code></p>
    <table class="diagnostic-table">
        <thead>
            <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Mensagem</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($rows as $row) : ?>
                <tr>
                    <td><?php echo wf_diag_h($row['item']); ?></td>
                    <td class="<?php echo $row['ok'] ? 'ok' : 'erro'; ?>"><?php echo $row['ok'] ? 'OK' : 'ERRO'; ?></td>
                    <td><?php echo wf_diag_h($row['message']); ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    </main>
</body>
</html>
