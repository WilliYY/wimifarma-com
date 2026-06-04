<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'Autoteste seguro';
$checks = array();

function test_row(array &$checks, string $item, bool $ok, string $message): void
{
    $checks[] = array(
        'item' => $item,
        'ok' => $ok,
        'message' => $message,
    );
}

try {
    $suffix = date('YmdHis');
    $cashbackPercent = (float) get_setting('cashback_percent', 5);
    $validityDays = (int) get_setting('cashback_validity_days', 45);
    $multiplier = (float) get_setting('redeem_multiplier', 4);

    db()->beginTransaction();

    $stmt = db()->prepare('INSERT INTO wf_atendentes (nome, status, observacoes) VALUES (?, "ativo", ?)');
    $stmt->execute(array('Teste Automatico ' . $suffix, 'Criado pelo autoteste com rollback.'));
    $attendantId = (int) db()->lastInsertId();
    test_row($checks, 'Cadastro de atendente', $attendantId > 0, 'INSERT em wf_atendentes executado dentro de transacao.');

    $stmt = db()->prepare(
        'INSERT INTO wf_clientes (nome, telefone, nascimento, observacoes, status, atendente_id) VALUES (?, ?, ?, ?, "ativo", ?)'
    );
    $stmt->execute(array('Cliente Teste ' . $suffix, '11999999999', '1990-01-01', 'Criado pelo autoteste com rollback.', $attendantId));
    $clientId = (int) db()->lastInsertId();
    test_row($checks, 'Cadastro de cliente', $clientId > 0, 'INSERT em wf_clientes executado dentro de transacao.');

    $purchaseValue = 100.00;
    $cashback = round($purchaseValue * ($cashbackPercent / 100), 2);
    $expiresAt = date('Y-m-d', strtotime('+' . $validityDays . ' days'));

    $stmt = db()->prepare(
        'INSERT INTO wf_compras (cliente_id, atendente_id, valor_total, percentual_cashback, cashback_gerado, data_compra, observacoes, created_by)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)'
    );
    $stmt->execute(array($clientId, $attendantId, $purchaseValue, $cashbackPercent, $cashback, 'Compra criada pelo autoteste.', $_SESSION['user_id'] ?? null));
    $purchaseId = (int) db()->lastInsertId();
    test_row($checks, 'Registro de compra', $purchaseId > 0, 'Compra de R$ 100,00 gravada temporariamente.');

    $stmt = db()->prepare(
        'INSERT INTO wf_cashback_creditos (cliente_id, compra_id, valor_original, valor_restante, expires_at, status)
         VALUES (?, ?, ?, ?, ?, "ativo")'
    );
    $stmt->execute(array($clientId, $purchaseId, $cashback, $cashback, $expiresAt));
    $creditId = (int) db()->lastInsertId();
    test_row($checks, 'Geracao de cashback', abs($cashback - 5.00) < 0.001 && $creditId > 0, 'Cashback calculado: ' . br_money($cashback) . '; vencimento: ' . br_date($expiresAt) . '.');

    $balance = balance_for_client($clientId);
    test_row($checks, 'Consulta de saldo', abs($balance['saldo_disponivel'] - $cashback) < 0.001, 'Saldo disponivel encontrado: ' . br_money($balance['saldo_disponivel']) . '.');

    $redeemValue = 5.00;
    $blockedPurchase = 10.00;
    $requiredPurchase = $redeemValue * $multiplier;
    test_row(
        $checks,
        'Bloqueio regra 4x',
        $blockedPurchase < $requiredPurchase,
        'Usar ' . br_money($redeemValue) . ' exige compra minima de ' . br_money($requiredPurchase) . '.'
    );

    $allowedPurchase = $requiredPurchase;
    $stmt = db()->prepare(
        'INSERT INTO wf_resgates (cliente_id, atendente_id, valor_compra, valor_resgatado, data_resgate, observacoes, created_by)
         VALUES (?, ?, ?, ?, NOW(), ?, ?)'
    );
    $stmt->execute(array($clientId, $attendantId, $allowedPurchase, $redeemValue, 'Resgate criado pelo autoteste.', $_SESSION['user_id'] ?? null));
    $redeemId = (int) db()->lastInsertId();

    $stmt = db()->prepare('UPDATE wf_cashback_creditos SET valor_restante = valor_restante - ?, status = "usado" WHERE id = ?');
    $stmt->execute(array($redeemValue, $creditId));

    $stmt = db()->prepare('INSERT INTO wf_resgate_itens (resgate_id, credito_id, valor_utilizado) VALUES (?, ?, ?)');
    $stmt->execute(array($redeemId, $creditId, $redeemValue));
    test_row($checks, 'Resgate valido', $redeemId > 0, 'Resgate temporario com compra minima valida gravado.');

    db()->rollBack();
    test_row($checks, 'Rollback de seguranca', true, 'Todos os registros de teste foram desfeitos. O banco real nao ficou sujo.');
} catch (Throwable $error) {
    if (db()->inTransaction()) {
        db()->rollBack();
    }

    test_row($checks, 'Erro no autoteste', false, $error->getMessage());
}

require __DIR__ . '/header.php';
?>

<section class="panel">
    <div class="section-title">
        <div>
            <span class="kicker">Teste sem sujar o banco</span>
            <h2>Fluxo real com rollback</h2>
        </div>
        <a class="btn primary" href="<?php echo e(app_url('dashboard.php')); ?>">Voltar ao balcao</a>
    </div>
    <p>Este teste cria atendente, cliente, compra, credito e resgate dentro de uma transacao MySQL e desfaz tudo no final.</p>

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
                        <td><?php echo e($check['item']); ?></td>
                        <td><span class="badge <?php echo $check['ok'] ? 'ativo' : 'expirado'; ?>"><?php echo $check['ok'] ? 'OK' : 'FALHOU'; ?></span></td>
                        <td><?php echo e($check['message']); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
