<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$id = (int) ($_GET['id'] ?? 0);

if ($id <= 0) {
    set_flash('error', 'Cliente nao informado.');
    redirect_to('clientes.php');
}

$stmt = db()->prepare(
    "SELECT c.*, a.nome AS atendente_nome
     FROM wf_clientes c
     LEFT JOIN wf_atendentes a ON a.id = c.atendente_id
     WHERE c.id = ?
     LIMIT 1"
);
$stmt->execute(array($id));
$cliente = $stmt->fetch();

if (!$cliente) {
    set_flash('error', 'Cliente nao encontrado.');
    redirect_to('clientes.php');
}

$pageTitle = 'Historico de ' . $cliente['nome'];
$saldo = balance_for_client($id);

$stmt = db()->prepare(
    "SELECT co.*, a.nome AS atendente_nome
     FROM wf_compras co
     LEFT JOIN wf_atendentes a ON a.id = co.atendente_id
     WHERE co.cliente_id = ?
     ORDER BY co.data_compra DESC"
);
$stmt->execute(array($id));
$compras = $stmt->fetchAll();

$stmt = db()->prepare(
    "SELECT r.*, a.nome AS atendente_nome
     FROM wf_resgates r
     LEFT JOIN wf_atendentes a ON a.id = r.atendente_id
     WHERE r.cliente_id = ?
     ORDER BY r.data_resgate DESC"
);
$stmt->execute(array($id));
$resgates = $stmt->fetchAll();

$stmt = db()->prepare(
    "SELECT *
     FROM wf_cashback_creditos
     WHERE cliente_id = ?
     ORDER BY expires_at ASC, id DESC"
);
$stmt->execute(array($id));
$creditos = $stmt->fetchAll();

require __DIR__ . '/header.php';
?>

<section class="panel hero-client">
    <div>
        <span class="kicker">Cliente #<?php echo e($cliente['id']); ?></span>
        <h2><?php echo e($cliente['nome']); ?></h2>
        <p><?php echo e(format_phone($cliente['telefone'])); ?> | Status <?php echo e($cliente['status']); ?> | Atendente <?php echo e($cliente['atendente_nome'] ?: '-'); ?></p>
    </div>
    <div class="actions">
        <a class="btn primary" href="<?php echo e(app_url('compras.php?cliente_id=' . $id)); ?>">Nova compra</a>
        <a class="btn" href="<?php echo e(app_url('resgates.php?cliente_id=' . $id)); ?>">Usar cashback</a>
        <a class="btn" href="<?php echo e(app_url('clientes.php?edit=' . $id)); ?>">Editar cliente</a>
    </div>
</section>

<section class="metrics">
    <article class="metric highlight"><span>Saldo disponivel</span><strong><?php echo e(br_money($saldo['saldo_disponivel'])); ?></strong></article>
    <article class="metric"><span>Saldo expirando</span><strong><?php echo e(br_money($saldo['saldo_expirando'])); ?></strong></article>
    <article class="metric"><span>Saldo usado</span><strong><?php echo e(br_money($saldo['saldo_usado'])); ?></strong></article>
    <article class="metric"><span>Saldo expirado</span><strong><?php echo e(br_money($saldo['saldo_expirado'])); ?></strong></article>
    <article class="metric"><span>Total gerado</span><strong><?php echo e(br_money($saldo['total_gerado'])); ?></strong></article>
    <article class="metric"><span>Proximo vencimento</span><strong><?php echo e(br_date($saldo['proximo_vencimento'])); ?></strong></article>
</section>

<section class="grid two">
    <div class="panel">
        <h2>Compras do cliente</h2>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>%</th>
                        <th>Cashback</th>
                        <th>Atendente</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($compras as $compra) : ?>
                        <tr>
                            <td><?php echo e(br_date($compra['data_compra'], true)); ?></td>
                            <td><?php echo e(br_money($compra['valor_total'])); ?></td>
                            <td><?php echo e(number_format((float) $compra['percentual_cashback'], 2, ',', '.')); ?>%</td>
                            <td><?php echo e(br_money($compra['cashback_gerado'])); ?></td>
                            <td><?php echo e($compra['atendente_nome'] ?: '-'); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (!$compras) : ?><tr><td colspan="5">Nenhuma compra registrada.</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <div class="panel">
        <h2>Resgates do cliente</h2>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Compra</th>
                        <th>Usado</th>
                        <th>Atendente</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($resgates as $resgate) : ?>
                        <tr>
                            <td><?php echo e(br_date($resgate['data_resgate'], true)); ?></td>
                            <td><?php echo e(br_money($resgate['valor_compra'])); ?></td>
                            <td><?php echo e(br_money($resgate['valor_resgatado'])); ?></td>
                            <td><?php echo e($resgate['atendente_nome'] ?: '-'); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (!$resgates) : ?><tr><td colspan="4">Nenhum resgate registrado.</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</section>

<section class="panel">
    <h2>Creditos de cashback</h2>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Original</th>
                    <th>Restante</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Compra</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($creditos as $credito) : ?>
                    <tr>
                        <td>#<?php echo e($credito['id']); ?></td>
                        <td><?php echo e(br_money($credito['valor_original'])); ?></td>
                        <td><?php echo e(br_money($credito['valor_restante'])); ?></td>
                        <td><?php echo e(br_date($credito['expires_at'])); ?></td>
                        <td><span class="badge <?php echo e($credito['status']); ?>"><?php echo e($credito['status']); ?></span></td>
                        <td>#<?php echo e($credito['compra_id']); ?></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$creditos) : ?><tr><td colspan="6">Nenhum credito gerado.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
