<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'Resgates';
$clientes = clientes_options();
$atendentes = atendentes_options();
$multiplier = redeem_multiplier();
$selectedClient = isset($_GET['cliente_id']) ? (int) $_GET['cliente_id'] : 0;
$selectedBalance = $selectedClient > 0 ? balance_for_client($selectedClient) : null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $clienteId = (int) ($_POST['cliente_id'] ?? 0);
    $atendenteId = (int) ($_POST['atendente_id'] ?? 0);
    $valorCompra = money_to_decimal($_POST['valor_compra'] ?? 0);
    $valorResgate = money_to_decimal($_POST['valor_resgate'] ?? 0);
    $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

    if ($clienteId <= 0 || $valorCompra <= 0 || $valorResgate <= 0) {
        set_flash('error', 'Informe cliente, valor da compra atual e valor de cashback a usar.');
        redirect_to('resgates.php');
    }

    if (!active_client_exists($clienteId)) {
        set_flash('error', 'Cliente invalido ou inativo.');
        redirect_to('resgates.php');
    }

    try {
        $atendenteId = normalize_attendant_id($atendenteId);
    } catch (InvalidArgumentException $exception) {
        set_flash('error', $exception->getMessage());
        redirect_to('resgates.php?cliente_id=' . $clienteId);
    }

    $balance = balance_for_client($clienteId);
    $minPurchase = round($valorResgate * $multiplier, 2);

    if ($valorResgate > $balance['saldo_disponivel']) {
        set_flash('error', 'Saldo insuficiente. Disponivel: ' . br_money($balance['saldo_disponivel']) . '.');
        redirect_to('resgates.php?cliente_id=' . $clienteId);
    }

    if ($valorCompra < $minPurchase) {
        set_flash('error', 'Uso bloqueado. Para usar ' . br_money($valorResgate) . ', a compra precisa ser de no minimo ' . br_money($minPurchase) . '.');
        redirect_to('resgates.php?cliente_id=' . $clienteId);
    }

    try {
        db()->beginTransaction();

        $stmt = db()->prepare(
            'INSERT INTO wf_resgates (cliente_id, atendente_id, valor_compra, valor_resgatado, data_resgate, observacoes, created_by)
             VALUES (?, ?, ?, ?, NOW(), ?, ?)'
        );
        $stmt->execute(array(
            $clienteId,
            $atendenteId,
            $valorCompra,
            $valorResgate,
            $observacoes ?: null,
            $_SESSION['user_id'] ?? null,
        ));
        $resgateId = (int) db()->lastInsertId();

        $remaining = $valorResgate;
        $stmt = db()->prepare(
            "SELECT id, valor_restante
             FROM wf_cashback_creditos
             WHERE cliente_id = ?
               AND status = 'ativo'
               AND valor_restante > 0
               AND expires_at >= CURDATE()
             ORDER BY expires_at ASC, id ASC
             FOR UPDATE"
        );
        $stmt->execute(array($clienteId));
        $credits = $stmt->fetchAll();

        foreach ($credits as $credit) {
            if ($remaining <= 0) {
                break;
            }

            $available = (float) $credit['valor_restante'];
            $used = min($available, $remaining);
            $newBalance = round($available - $used, 2);
            $newStatus = $newBalance <= 0 ? 'usado' : 'ativo';

            $update = db()->prepare('UPDATE wf_cashback_creditos SET valor_restante = ?, status = ? WHERE id = ?');
            $update->execute(array(max($newBalance, 0), $newStatus, (int) $credit['id']));

            $item = db()->prepare('INSERT INTO wf_resgate_itens (resgate_id, credito_id, valor_utilizado) VALUES (?, ?, ?)');
            $item->execute(array($resgateId, (int) $credit['id'], $used));

            $remaining = round($remaining - $used, 2);
        }

        if ($remaining > 0.009) {
            throw new RuntimeException('Saldo disponivel mudou durante o resgate. Tente novamente.');
        }

        log_action('resgate_criado', 'resgate', $resgateId, 'Resgate de ' . br_money($valorResgate) . ' registrado.');
        db()->commit();

        set_flash('success', 'Resgate registrado: ' . br_money($valorResgate) . '.');
        redirect_to('cliente-detalhe.php?id=' . $clienteId);
    } catch (Throwable $exception) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        set_flash('error', 'Erro ao registrar resgate: ' . $exception->getMessage());
        redirect_to('resgates.php?cliente_id=' . $clienteId);
    }
}

$recentes = db()->query(
    "SELECT r.*, c.nome AS cliente_nome, a.nome AS atendente_nome
     FROM wf_resgates r
     INNER JOIN wf_clientes c ON c.id = r.cliente_id
     LEFT JOIN wf_atendentes a ON a.id = r.atendente_id
     ORDER BY r.data_resgate DESC
     LIMIT 80"
)->fetchAll();

require __DIR__ . '/header.php';
?>

<section class="grid two">
    <div class="panel">
        <h2>Usar cashback do cliente</h2>
        <form method="get" class="form-grid">
            <label>
                <span>Consultar saldo do cliente</span>
                <select name="cliente_id" data-auto-submit>
                    <option value="">Selecione</option>
                    <?php foreach ($clientes as $cliente) : ?>
                        <option value="<?php echo e($cliente['id']); ?>" <?php echo $selectedClient === (int) $cliente['id'] ? 'selected' : ''; ?>>
                            <?php echo e($cliente['nome']); ?> - <?php echo e(format_phone($cliente['telefone'])); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
        </form>

        <?php if ($selectedBalance) : ?>
            <div class="balance-box">
                <span>Saldo disponivel</span>
                <strong><?php echo e(br_money($selectedBalance['saldo_disponivel'])); ?></strong>
                <small>Expirando: <?php echo e(br_money($selectedBalance['saldo_expirando'])); ?> | Proximo vencimento: <?php echo e(br_date($selectedBalance['proximo_vencimento'])); ?></small>
            </div>
        <?php endif; ?>

        <form method="post" class="form-grid" data-no-enter-submit>
            <?php echo csrf_field(); ?>
            <label>
                <span>Cliente *</span>
                <select name="cliente_id" required>
                    <option value="">Selecione</option>
                    <?php foreach ($clientes as $cliente) : ?>
                        <option value="<?php echo e($cliente['id']); ?>" <?php echo $selectedClient === (int) $cliente['id'] ? 'selected' : ''; ?>>
                            <?php echo e($cliente['nome']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                <span>Atendente</span>
                <select name="atendente_id">
                    <option value="">Sem atendente</option>
                    <?php foreach ($atendentes as $atendente) : ?>
                        <option value="<?php echo e($atendente['id']); ?>"><?php echo e($atendente['nome']); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                <span>Valor da compra atual *</span>
                <input type="text" name="valor_compra" data-money required placeholder="40,00">
            </label>
            <label>
                <span>Cashback a usar *</span>
                <input type="text" name="valor_resgate" data-money required placeholder="10,00">
            </label>
            <label class="full">
                <span>Observacoes</span>
                <textarea name="observacoes" rows="4"></textarea>
            </label>
            <button type="submit" class="btn primary">Validar regra e registrar resgate</button>
        </form>
    </div>

    <div class="panel">
        <h2>Regra de uso</h2>
        <p>O cliente so pode usar cashback se a compra atual for no minimo <strong><?php echo e(number_format($multiplier, 0, ',', '.')); ?>x</strong> o valor resgatado.</p>
        <ul class="info-list">
            <li>Usar R$ 10,00 exige compra minima de R$ 40,00.</li>
            <li>O sistema consome primeiro os creditos que vencem antes.</li>
            <li>O resgate e feito em transacao MySQL para proteger o saldo.</li>
        </ul>
    </div>
</section>

<section class="panel">
    <h2>Resgates recentes</h2>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Atendente</th>
                    <th>Compra atual</th>
                    <th>Usado</th>
                    <th>Acoes</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($recentes as $resgate) : ?>
                    <tr>
                        <td><?php echo e(br_date($resgate['data_resgate'], true)); ?></td>
                        <td><?php echo e($resgate['cliente_nome']); ?></td>
                        <td><?php echo e($resgate['atendente_nome'] ?: '-'); ?></td>
                        <td><?php echo e(br_money($resgate['valor_compra'])); ?></td>
                        <td><?php echo e(br_money($resgate['valor_resgatado'])); ?></td>
                        <td><a href="<?php echo e(app_url('cliente-detalhe.php?id=' . (int) $resgate['cliente_id'])); ?>">Ver cliente</a></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$recentes) : ?>
                    <tr><td colspan="6">Nenhum resgate registrado.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
