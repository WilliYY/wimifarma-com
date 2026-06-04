<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_sensitive_area_access('Diagnostico');

$pageTitle = 'Diagnostico';
$checks = array();

function add_check(array &$checks, string $name, bool $ok, string $message): void
{
    $checks[] = array(
        'name' => $name,
        'ok' => $ok,
        'message' => $message,
    );
}

try {
    db()->query('SELECT 1');
    add_check($checks, 'Conexao PDO', true, 'PHP conectou no MySQL usando config.php.');
} catch (Throwable $error) {
    add_check($checks, 'Conexao PDO', false, $error->getMessage());
}

$requiredTables = array(
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

foreach ($requiredTables as $table) {
    try {
        $count = (int) db()->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
        add_check($checks, 'Tabela ' . $table, true, $count . ' registro(s).');
    } catch (Throwable $error) {
        add_check($checks, 'Tabela ' . $table, false, 'Tabela ausente ou sem permissao: ' . $error->getMessage());
    }
}

add_check(
    $checks,
    'CSS do frontend',
    is_file(__DIR__ . '/styles.css') && is_readable(__DIR__ . '/styles.css'),
    'Arquivo esperado: /cashback/styles.css'
);

add_check(
    $checks,
    'JS do frontend',
    is_file(__DIR__ . '/app.js') && is_readable(__DIR__ . '/app.js'),
    'Arquivo esperado: /cashback/app.js'
);

add_check(
    $checks,
    'Logo Wimifarma',
    is_file(__DIR__ . '/logo-wimifarma.svg') && is_readable(__DIR__ . '/logo-wimifarma.svg'),
    'Arquivo esperado: /cashback/logo-wimifarma.svg'
);

add_check(
    $checks,
    'Favicon',
    is_file(__DIR__ . '/favicon.png') && is_readable(__DIR__ . '/favicon.png'),
    'Arquivo esperado: /cashback/favicon.png'
);

require __DIR__ . '/header.php';
?>

<section class="panel">
    <h2>Status da integracao frontend + banco</h2>
    <p>Esta tela nao cria outro frontend. Ela apenas confirma se o PHP, o MySQL, as tabelas e os arquivos visuais usados pelo frontend atual estao acessiveis.</p>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($checks as $check) : ?>
                    <tr>
                        <td><?php echo e($check['name']); ?></td>
                        <td><span class="badge <?php echo $check['ok'] ? 'ativo' : 'expirado'; ?>"><?php echo $check['ok'] ? 'OK' : 'ERRO'; ?></span></td>
                        <td><?php echo e($check['message']); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
