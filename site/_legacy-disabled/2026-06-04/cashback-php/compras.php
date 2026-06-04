<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'Compras';
$clientes = clientes_options();
$atendentes = atendentes_options();
$defaultPercent = cashback_percent();
$validityDays = cashback_validity_days();
$selectedClient = isset($_GET['cliente_id']) ? (int) $_GET['cliente_id'] : 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $clienteId = (int) ($_POST['cliente_id'] ?? 0);
    $atendenteId = (int) ($_POST['atendente_id'] ?? 0);
    $valorTotal = money_to_decimal($_POST['valor_total'] ?? 0);
    $percentual = money_to_decimal($_POST['percentual_cashback'] ?? $defaultPercent);
    $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

    if ($clienteId <= 0 || $valorTotal <= 0 || $percentual < 0 || $percentual > 100) {
        set_flash('error', 'Informe cliente, valor da compra e percentual valido.');
        redirect_to('compras.php');
    }

    try {
        $atendenteId = normalize_attendant_id($atendenteId);
    } catch (InvalidArgumentException $exception) {
        set_flash('error', $exception->getMessage());
        redirect_to('compras.php');
    }

    $stmt = db()->prepare("SELECT id FROM wf_clientes WHERE id = ? AND status = 'ativo' LIMIT 1");
    $stmt->execute(array($clienteId));

    if (!$stmt->fetch()) {
        set_flash('error', 'Cliente invalido ou inativo.');
        redirect_to('compras.php');
    }

    $valorCobrado = $valorTotal;
    $cashback = round($valorCobrado * ($percentual / 100), 2);
    $expiresAt = date('Y-m-d', strtotime('+' . $validityDays . ' days'));

    try {
        db()->beginTransaction();

        $stmt = db()->prepare(
            'INSERT INTO wf_compras
                (cliente_id, atendente_id, valor_bruto, desconto_cashback, valor_cobrado, valor_total, percentual_cashback, cashback_gerado, data_compra, observacoes, created_by)
             VALUES
                (?, ?, ?, 0.00, ?, ?, ?, ?, NOW(), ?, ?)'
        );
        $stmt->execute(array(
            $clienteId,
            $atendenteId,
            $valorTotal,
            $valorCobrado,
            $valorCobrado,
            $percentual,
            $cashback,
            $observacoes ?: null,
            $_SESSION['user_id'] ?? null,
        ));
        $compraId = (int) db()->lastInsertId();

        if ($cashback > 0) {
            $stmt = db()->prepare(
                'INSERT INTO wf_cashback_creditos (cliente_id, compra_id, valor_original, valor_restante, expires_at, status)
                 VALUES (?, ?, ?, ?, ?, "ativo")'
            );
            $stmt->execute(array($clienteId, $compraId, $cashback, $cashback, $expiresAt));
        }

        log_action('compra_criada', 'compra', $compraId, 'Compra registrada com cashback de ' . br_money($cashback));
        db()->commit();

        set_flash('success', 'Compra registrada. Cashback gerado: ' . br_money($cashback) . ' com validade ate ' . br_date($expiresAt) . '.');
        redirect_to('cliente-detalhe.php?id=' . $clienteId);
    } catch (Throwable $exception) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        set_flash('error', 'Erro ao registrar compra: ' . $exception->getMessage());
        redirect_to('compras.php');
    }
}

$recentes = db()->query(
    "SELECT co.*, c.nome AS cliente_nome, c.telefone, a.nome AS atendente_nome
     FROM wf_compras co
     INNER JOIN wf_clientes c ON c.id = co.cliente_id
     LEFT JOIN wf_atendentes a ON a.id = co.atendente_id
     ORDER BY co.data_compra DESC
     LIMIT 80"
)->fetchAll();

require __DIR__ . '/header.php';
?>

<section class="grid two">
    <div class="panel">
        <h2>Registrar nova compra</h2>
        <form method="post" class="form-grid" data-no-enter-submit>
            <?php echo csrf_field(); ?>
            <label>
                <span>Cliente *</span>
                <select name="cliente_id" required>
                    <option value="">Selecione</option>
                    <?php foreach ($clientes as $cliente) : ?>
                        <option value="<?php echo e($cliente['id']); ?>" <?php echo $selectedClient === (int) $cliente['id'] ? 'selected' : ''; ?>>
                            <?php echo e($cliente['nome']); ?> - <?php echo e(format_phone($cliente['telefone'])); ?>
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
                <span>Valor da compra *</span>
                <input type="text" name="valor_total" data-money required placeholder="100,00">
            </label>
            <label>
                <span>% Cashback</span>
                <input type="text" name="percentual_cashback" value="<?php echo e(number_format($defaultPercent, 2, ',', '.')); ?>">
            </label>
            <label class="full">
                <span>Observacoes</span>
                <textarea name="observacoes" rows="4"></textarea>
            </label>
            <button type="submit" class="btn primary">Salvar compra e gerar cashback</button>
        </form>
    </div>

    <div class="panel">
        <h2>Regra aplicada</h2>
        <ul class="info-list">
            <li>Cashback padrao: <strong><?php echo e(number_format($defaultPercent, 2, ',', '.')); ?>%</strong></li>
            <li>Validade padrao: <strong><?php echo e($validityDays); ?> dias</strong></li>
            <li>Persistencia: <strong>compra e credito gravados no MySQL</strong></li>
        </ul>
        <a class="btn" href="<?php echo e(app_url('clientes.php')); ?>">Cadastrar cliente</a>
    </div>
</section>

<section class="panel">
    <h2>Compras recentes</h2>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Atendente</th>
                    <th>Compra</th>
                    <th>%</th>
                    <th>Cashback</th>
                    <th>WhatsApp</th>
                    <th>Acoes</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($recentes as $compra) : ?>
                    <tr>
                        <td><?php echo e(br_date($compra['data_compra'], true)); ?></td>
                        <td><?php echo e($compra['cliente_nome']); ?></td>
                        <td><?php echo e($compra['atendente_nome'] ?: '-'); ?></td>
                        <td><?php echo e(br_money($compra['valor_total'])); ?></td>
                        <td><?php echo e(number_format((float) $compra['percentual_cashback'], 2, ',', '.')); ?>%</td>
                        <td><?php echo e(br_money($compra['cashback_gerado'])); ?></td>
                        <td><a href="<?php echo e(app_url('mensagens.php#compras-hoje')); ?>">Fila WhatsApp</a></td>
                        <td><a href="<?php echo e(app_url('cliente-detalhe.php?id=' . (int) $compra['cliente_id'])); ?>">Cliente</a></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$recentes) : ?>
                    <tr><td colspan="8">Nenhuma compra registrada.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
