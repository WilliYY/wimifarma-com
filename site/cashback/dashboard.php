<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'Balcao';
$defaultPercent = cashback_percent();
$validityDays = cashback_validity_days();
$multiplier = redeem_multiplier();

$start = $_GET['start'] ?? date('Y-m-01');
$end = $_GET['end'] ?? date('Y-m-d');
$search = trim((string) ($_GET['q'] ?? ''));
$selectedClientId = isset($_GET['cliente_id']) ? (int) $_GET['cliente_id'] : 0;

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $start)) {
    $start = date('Y-m-01');
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $end)) {
    $end = date('Y-m-d');
}

function dashboard_redirect(?int $clientId, string $anchor): void
{
    $target = 'dashboard.php';

    if ($clientId && $clientId > 0) {
        $target .= '?cliente_id=' . $clientId;
    }

    redirect_to($target . '#' . ltrim($anchor, '#'));
}

function dashboard_create_purchase_credit(
    int $clienteId,
    ?int $atendenteId,
    float $valorBruto,
    float $descontoCashback,
    ?int $resgateId,
    float $percentual,
    string $observacoes,
    int $validityDays
): array {
    $valorCobrado = round(max($valorBruto - $descontoCashback, 0), 2);
    $cashback = round($valorCobrado * ($percentual / 100), 2);
    $expiresAt = date('Y-m-d', strtotime('+' . $validityDays . ' days'));

    $stmt = db()->prepare(
        'INSERT INTO wf_compras
            (cliente_id, atendente_id, valor_bruto, desconto_cashback, valor_cobrado, resgate_id, valor_total, percentual_cashback, cashback_gerado, data_compra, observacoes, created_by)
         VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
    );
    $stmt->execute(array(
        $clienteId,
        $atendenteId,
        $valorBruto,
        $descontoCashback,
        $valorCobrado,
        $resgateId,
        $valorCobrado,
        $percentual,
        $cashback,
        $observacoes !== '' ? $observacoes : null,
        $_SESSION['user_id'] ?? null,
    ));
    $compraId = (int) db()->lastInsertId();
    $creditoId = null;

    if ($cashback > 0) {
        $stmt = db()->prepare(
            'INSERT INTO wf_cashback_creditos (cliente_id, compra_id, valor_original, valor_restante, expires_at, status)
             VALUES (?, ?, ?, ?, ?, "ativo")'
        );
        $stmt->execute(array($clienteId, $compraId, $cashback, $cashback, $expiresAt));
        $creditoId = (int) db()->lastInsertId();
    }

    $stmt = db()->prepare('SELECT nome, telefone FROM wf_clientes WHERE id = ? LIMIT 1');
    $stmt->execute(array($clienteId));
    $cliente = $stmt->fetch();

    if ($cliente) {
        $mensagem = 'Oi ' . $cliente['nome'] . ', obrigado pela compra na Wimifarma! '
            . 'Voce recebeu ' . br_money($cashback) . ' de cashback. '
            . 'Ele fica valido ate ' . br_date($expiresAt) . '.';

        save_whatsapp_message(
            'compra',
            'compra-' . $compraId,
            $clienteId,
            $compraId,
            $creditoId,
            (string) $cliente['nome'],
            (string) ($cliente['telefone'] ?? ''),
            $mensagem,
            date('Y-m-d')
        );
    }

    return array(
        'compra_id' => $compraId,
        'cashback' => $cashback,
        'expires_at' => $expiresAt,
        'valor_cobrado' => $valorCobrado,
    );
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'save_attendant') {
        set_flash('error', 'Cadastro de atendente fica em Configuracao e Relatorio, area protegida pela senha interna.');
        dashboard_redirect(null, 'cadastro');
    }

    if ($action === 'save_client') {
        $nome = trim((string) ($_POST['nome'] ?? ''));
        $telefone = digits_only($_POST['telefone'] ?? '');
        $nascimento = trim((string) ($_POST['nascimento'] ?? ''));
        $observacoes = trim((string) ($_POST['observacoes'] ?? ''));
        $atendenteId = (int) ($_POST['atendente_id'] ?? 0);
        $valorInicial = money_to_decimal($_POST['valor_compra_inicial'] ?? 0);
        $percentualInicial = money_to_decimal($_POST['percentual_cashback_inicial'] ?? $defaultPercent);

        if ($nome === '') {
            set_flash('error', 'Informe o nome do cliente.');
            dashboard_redirect(null, 'cadastro');
        }

        if ($nascimento !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $nascimento)) {
            set_flash('error', 'Data de nascimento invalida.');
            dashboard_redirect(null, 'cadastro');
        }

        if ($valorInicial < 0 || $percentualInicial < 0 || $percentualInicial > 100) {
            set_flash('error', 'Informe um valor de compra e percentual validos.');
            dashboard_redirect(null, 'cadastro');
        }

        try {
            $atendenteId = normalize_attendant_id($atendenteId);
        } catch (InvalidArgumentException $exception) {
            set_flash('error', $exception->getMessage());
            dashboard_redirect(null, 'cadastro');
        }

        try {
            db()->beginTransaction();

            $stmt = db()->prepare(
                'INSERT INTO wf_clientes (nome, telefone, nascimento, observacoes, status, atendente_id) VALUES (?, ?, ?, ?, "ativo", ?)'
            );
            $stmt->execute(array($nome, $telefone ?: null, $nascimento ?: null, $observacoes ?: null, $atendenteId));
            $id = (int) db()->lastInsertId();

            log_action('cliente_criado', 'cliente', $id, 'Cliente criado pela operacao de balcao: ' . $nome);

            $message = 'Cliente cadastrado e selecionado: ' . $nome . '.';

            if ($valorInicial > 0) {
                $purchase = dashboard_create_purchase_credit(
                    $id,
                    $atendenteId,
                    $valorInicial,
                    0.0,
                    null,
                    $percentualInicial,
                    'Compra inicial registrada junto ao cadastro.' . ($observacoes !== '' ? ' ' . $observacoes : ''),
                    $validityDays
                );

                log_action('compra_inicial_criada', 'compra', (int) $purchase['compra_id'], 'Compra inicial no cadastro com cashback de ' . br_money($purchase['cashback']));
                $message .= ' Compra inicial registrada. Valor a cobrar: ' . br_money($purchase['valor_cobrado']) . '. Cashback gerado: ' . br_money($purchase['cashback']) . '.';
            }

            db()->commit();
            set_flash('success', $message);
            dashboard_redirect($id, $valorInicial > 0 ? 'cliente-atual' : 'cadastro');
        } catch (Throwable $exception) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }

            set_flash('error', 'Erro ao cadastrar cliente: ' . $exception->getMessage());
            dashboard_redirect(null, 'cadastro');
        }
    }

    if ($action === 'save_purchase') {
        $clienteId = (int) ($_POST['cliente_id'] ?? 0);
        $atendenteId = (int) ($_POST['atendente_id'] ?? 0);
        $valorTotal = money_to_decimal($_POST['valor_total'] ?? 0);
        $percentual = money_to_decimal($_POST['percentual_cashback'] ?? $defaultPercent);
        $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

        if ($clienteId <= 0 || $valorTotal <= 0 || $percentual < 0 || $percentual > 100) {
            set_flash('error', 'Selecione o cliente e informe valor/percentual validos.');
            dashboard_redirect($clienteId > 0 ? $clienteId : null, 'resgate');
        }

        try {
            $atendenteId = normalize_attendant_id($atendenteId);
        } catch (InvalidArgumentException $exception) {
            set_flash('error', $exception->getMessage());
            dashboard_redirect($clienteId > 0 ? $clienteId : null, 'resgate');
        }

        $stmt = db()->prepare("SELECT id FROM wf_clientes WHERE id = ? AND status = 'ativo' LIMIT 1");
        $stmt->execute(array($clienteId));

        if (!$stmt->fetch()) {
            set_flash('error', 'Cliente invalido ou inativo.');
            dashboard_redirect(null, 'busca');
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

            log_action('compra_criada', 'compra', $compraId, 'Compra registrada no balcao com cashback de ' . br_money($cashback));
            db()->commit();

            set_flash('success', 'Compra registrada. Cashback gerado: ' . br_money($cashback) . ' com validade ate ' . br_date($expiresAt) . '.');
            dashboard_redirect($clienteId, 'cliente-atual');
        } catch (Throwable $exception) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }

            set_flash('error', 'Erro ao registrar compra: ' . $exception->getMessage());
            dashboard_redirect($clienteId, 'resgate');
        }
    }

    if ($action === 'save_redeem') {
        $clienteId = (int) ($_POST['cliente_id'] ?? 0);
        $atendenteId = (int) ($_POST['atendente_id'] ?? 0);
        $valorCompra = money_to_decimal($_POST['valor_compra'] ?? 0);
        $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

        if ($clienteId <= 0 || $valorCompra <= 0) {
            set_flash('error', 'Informe cliente e valor da compra atual.');
            dashboard_redirect($clienteId > 0 ? $clienteId : null, 'resgate');
        }

        if (!active_client_exists($clienteId)) {
            set_flash('error', 'Cliente invalido ou inativo.');
            dashboard_redirect(null, 'busca');
        }

        try {
            $atendenteId = normalize_attendant_id($atendenteId);
        } catch (InvalidArgumentException $exception) {
            set_flash('error', $exception->getMessage());
            dashboard_redirect($clienteId, 'resgate');
        }

        try {
            db()->beginTransaction();

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
            $saldoTravado = 0.0;

            foreach ($credits as $credit) {
                $saldoTravado += (float) $credit['valor_restante'];
            }

            $maxPelaRegra = floor(($valorCompra / $multiplier) * 100) / 100;
            $valorResgate = round(min($saldoTravado, $maxPelaRegra), 2);

            $valorCobrado = round(max($valorCompra - $valorResgate, 0), 2);
            $percentualNovo = $defaultPercent;
            $novoCashback = round($valorCobrado * ($percentualNovo / 100), 2);
            $expiresAt = date('Y-m-d', strtotime('+' . $validityDays . ' days'));
            $resgateId = null;

            if ($valorResgate > 0) {
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
            }

            $compraObservacoes = $valorResgate > 0
                ? trim('Compra com uso de cashback. ' . $observacoes)
                : $observacoes;

            $stmt = db()->prepare(
                'INSERT INTO wf_compras
                    (cliente_id, atendente_id, valor_bruto, desconto_cashback, valor_cobrado, resgate_id, valor_total, percentual_cashback, cashback_gerado, data_compra, observacoes, created_by)
                 VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
            );
            $stmt->execute(array(
                $clienteId,
                $atendenteId,
                $valorCompra,
                $valorResgate,
                $valorCobrado,
                $resgateId,
                $valorCobrado,
                $percentualNovo,
                $novoCashback,
                $compraObservacoes !== '' ? $compraObservacoes : null,
                $_SESSION['user_id'] ?? null,
            ));
            $compraId = (int) db()->lastInsertId();
            $creditoId = null;

            if ($novoCashback > 0) {
                $stmt = db()->prepare(
                    'INSERT INTO wf_cashback_creditos (cliente_id, compra_id, valor_original, valor_restante, expires_at, status)
                     VALUES (?, ?, ?, ?, ?, "ativo")'
                );
                $stmt->execute(array($clienteId, $compraId, $novoCashback, $novoCashback, $expiresAt));
                $creditoId = (int) db()->lastInsertId();
            }

            $stmt = db()->prepare('SELECT nome, telefone FROM wf_clientes WHERE id = ? LIMIT 1');
            $stmt->execute(array($clienteId));
            $cliente = $stmt->fetch();

            if ($cliente) {
                $mensagem = 'Oi ' . $cliente['nome'] . ', obrigado pela compra na Wimifarma! ';

                if ($valorResgate > 0) {
                    $mensagem .= 'Hoje voce usou ' . br_money($valorResgate) . ' de cashback e pagou ' . br_money($valorCobrado) . '. ';
                } else {
                    $mensagem .= 'Sua compra foi registrada no valor de ' . br_money($valorCobrado) . '. ';
                }

                $mensagem .= 'Voce recebeu ' . br_money($novoCashback) . ' de novo cashback, valido ate ' . br_date($expiresAt) . '.';

                save_whatsapp_message(
                    'compra',
                    'compra-' . $compraId,
                    $clienteId,
                    $compraId,
                    $creditoId,
                    (string) $cliente['nome'],
                    (string) ($cliente['telefone'] ?? ''),
                    $mensagem,
                    date('Y-m-d')
                );
            }

            if ($resgateId !== null) {
                log_action('resgate_criado', 'resgate', $resgateId, 'Resgate registrado no balcao: ' . br_money($valorResgate));
            }

            log_action('compra_cashback_criada', 'compra', $compraId, 'Valor cobrado ' . br_money($valorCobrado) . ' e novo cashback ' . br_money($novoCashback));
            db()->commit();

            if ($valorResgate > 0) {
                set_flash('success', 'Cashback usado: ' . br_money($valorResgate) . '. Valor a cobrar: ' . br_money($valorCobrado) . '. Novo cashback gerado: ' . br_money($novoCashback) . '.');
            } else {
                set_flash('success', 'Compra registrada sem uso de cashback. Valor a cobrar: ' . br_money($valorCobrado) . '. Novo cashback gerado: ' . br_money($novoCashback) . '.');
            }
            dashboard_redirect($clienteId, 'cliente-atual');
        } catch (Throwable $exception) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }

            set_flash('error', 'Erro ao registrar Compra Cashback: ' . $exception->getMessage());
            dashboard_redirect($clienteId, 'resgate');
        }
    }
}

$clientes = clientes_options();
$atendentes = atendentes_options();

$searchParams = array();
$searchSql = "SELECT c.*, a.nome AS atendente_nome
              FROM wf_clientes c
              LEFT JOIN wf_atendentes a ON a.id = c.atendente_id";

if ($search !== '') {
    $searchSql .= ' WHERE c.nome LIKE ? OR c.telefone LIKE ? OR c.id = ?';
    $searchParams[] = '%' . $search . '%';
    $searchParams[] = '%' . digits_only($search) . '%';
    $searchParams[] = ctype_digit($search) ? (int) $search : 0;
}

$searchSql .= ' ORDER BY c.created_at DESC LIMIT 12';
$stmt = db()->prepare($searchSql);
$stmt->execute($searchParams);
$searchResults = $stmt->fetchAll();

$selectedClient = null;
$selectedBalance = null;
$selectedPurchases = array();
$selectedResgates = array();
$selectedCredits = array();

if ($selectedClientId > 0) {
    $stmt = db()->prepare(
        "SELECT c.*, a.nome AS atendente_nome
         FROM wf_clientes c
         LEFT JOIN wf_atendentes a ON a.id = c.atendente_id
         WHERE c.id = ?
         LIMIT 1"
    );
    $stmt->execute(array($selectedClientId));
    $selectedClient = $stmt->fetch() ?: null;

    if ($selectedClient) {
        $selectedBalance = balance_for_client($selectedClientId);

        $stmt = db()->prepare(
            "SELECT co.*, a.nome AS atendente_nome
             FROM wf_compras co
             LEFT JOIN wf_atendentes a ON a.id = co.atendente_id
             WHERE co.cliente_id = ?
             ORDER BY co.data_compra DESC
             LIMIT 8"
        );
        $stmt->execute(array($selectedClientId));
        $selectedPurchases = $stmt->fetchAll();

        $stmt = db()->prepare(
            "SELECT r.*, a.nome AS atendente_nome
             FROM wf_resgates r
             LEFT JOIN wf_atendentes a ON a.id = r.atendente_id
             WHERE r.cliente_id = ?
             ORDER BY r.data_resgate DESC
             LIMIT 8"
        );
        $stmt->execute(array($selectedClientId));
        $selectedResgates = $stmt->fetchAll();

        $stmt = db()->prepare(
            "SELECT *
             FROM wf_cashback_creditos
             WHERE cliente_id = ?
             ORDER BY expires_at ASC, id DESC
             LIMIT 8"
        );
        $stmt->execute(array($selectedClientId));
        $selectedCredits = $stmt->fetchAll();
    }
}

require __DIR__ . '/header.php';
?>

<section class="balcao-grid">
    <div class="balcao-main">
        <section id="busca" class="panel section-block workspace-section">
            <div class="section-title">
                <div>
                    <span class="kicker">Consulta rapida</span>
                    <h2>Buscar cliente por nome, telefone ou ID</h2>
                </div>
            </div>

            <form method="get" action="<?php echo e(app_url('dashboard.php#busca')); ?>" class="search-row live-search-wrap">
                <?php if ($selectedClientId > 0) : ?>
                    <input type="hidden" name="cliente_id" value="<?php echo e($selectedClientId); ?>">
                <?php endif; ?>
                <input type="search" name="q" value="<?php echo e($search); ?>" placeholder="Digite nome, telefone ou ID interno" data-live-client-search data-results="#live-client-results" autocomplete="off" autofocus>
                <button type="submit" class="btn primary">Buscar</button>
                <a class="btn" href="<?php echo e(app_url('dashboard.php' . ($selectedClientId > 0 ? '?cliente_id=' . $selectedClientId : '') . '#busca')); ?>">Limpar</a>
                <div id="live-client-results" class="live-client-results" hidden></div>
            </form>

            <div class="client-results">
                <?php foreach ($searchResults as $client) : ?>
                    <?php $clientBalance = balance_for_client((int) $client['id']); ?>
                    <article class="client-result <?php echo $selectedClientId === (int) $client['id'] ? 'is-selected' : ''; ?>">
                        <div>
                            <strong><?php echo e($client['nome']); ?></strong>
                            <span>#<?php echo e($client['id']); ?> | <?php echo e(format_phone($client['telefone'])); ?> | <?php echo e($client['atendente_nome'] ?: 'Sem atendente'); ?></span>
                        </div>
                        <div class="result-balance">
                            <span>Disponivel</span>
                            <strong><?php echo e(br_money($clientBalance['saldo_disponivel'])); ?></strong>
                        </div>
                        <div class="result-actions">
                            <a class="btn primary" href="<?php echo e(app_url('dashboard.php?cliente_id=' . (int) $client['id'] . '#cliente-atual')); ?>">Selecionar</a>
                            <a class="btn" href="<?php echo e(app_url('dashboard.php?cliente_id=' . (int) $client['id'] . '#resgate')); ?>">Compra Cashback</a>
                            <a class="btn" href="<?php echo e(app_url('cliente-detalhe.php?id=' . (int) $client['id'])); ?>">Historico completo</a>
                        </div>
                    </article>
                <?php endforeach; ?>
                <?php if (!$searchResults) : ?>
                    <p>Nenhum cliente encontrado. Use o cadastro rapido abaixo.</p>
                <?php endif; ?>
            </div>
        </section>

        <section id="cliente-atual" class="panel section-block workspace-section">
            <div class="section-title">
                <div>
                    <span class="kicker">Cliente selecionado</span>
                    <h2><?php echo $selectedClient ? e($selectedClient['nome']) : 'Nenhum cliente selecionado'; ?></h2>
                </div>
                <?php if ($selectedClient) : ?>
                    <a class="btn" href="<?php echo e(app_url('cliente-detalhe.php?id=' . (int) $selectedClient['id'])); ?>">Abrir historico completo</a>
                <?php endif; ?>
            </div>

            <?php if ($selectedClient && $selectedBalance) : ?>
                <div class="selected-client-strip">
                    <span>#<?php echo e($selectedClient['id']); ?></span>
                    <span><?php echo e(format_phone($selectedClient['telefone'])); ?></span>
                    <span>Atendente: <?php echo e($selectedClient['atendente_nome'] ?: '-'); ?></span>
                    <span>Status: <?php echo e($selectedClient['status']); ?></span>
                </div>

                <div class="metrics compact">
                    <article class="metric highlight"><span>Saldo disponivel</span><strong><?php echo e(br_money($selectedBalance['saldo_disponivel'])); ?></strong></article>
                    <article class="metric"><span>Expirando</span><strong><?php echo e(br_money($selectedBalance['saldo_expirando'])); ?></strong></article>
                    <article class="metric"><span>Usado</span><strong><?php echo e(br_money($selectedBalance['saldo_usado'])); ?></strong></article>
                    <article class="metric"><span>Total gerado</span><strong><?php echo e(br_money($selectedBalance['total_gerado'])); ?></strong></article>
                    <article class="metric"><span>Proximo vencimento</span><strong><?php echo e(br_date($selectedBalance['proximo_vencimento'])); ?></strong></article>
                </div>

                <div class="quick-actions">
                    <a class="btn primary" href="#resgate" data-section-link="resgate">Compra Cashback</a>
                    <a class="btn" href="<?php echo e(app_url('clientes.php?edit=' . (int) $selectedClient['id'])); ?>">Editar dados</a>
                </div>

                <div class="client-history-grid">
                    <section class="history-panel">
                        <div class="mini-heading">
                            <span class="kicker">Historico</span>
                            <h3>Ultimas compras</h3>
                        </div>
                        <?php if ($selectedPurchases) : ?>
                            <div class="history-list">
                                <?php foreach ($selectedPurchases as $purchase) : ?>
                                    <article>
                                        <strong><?php echo e(br_date($purchase['data_compra'], true)); ?></strong>
                                        <span>Compra: <?php echo e(br_money($purchase['valor_bruto'] ?? $purchase['valor_total'])); ?> | Pago: <?php echo e(br_money($purchase['valor_cobrado'] ?? $purchase['valor_total'])); ?></span>
                                        <span>Cashback usado: <?php echo e(br_money($purchase['desconto_cashback'] ?? 0)); ?> | Gerado: <?php echo e(br_money($purchase['cashback_gerado'])); ?></span>
                                    </article>
                                <?php endforeach; ?>
                            </div>
                        <?php else : ?>
                            <p class="muted">Nenhuma compra registrada para este cliente.</p>
                        <?php endif; ?>
                    </section>

                    <section class="history-panel">
                        <div class="mini-heading">
                            <span class="kicker">Uso de cashback</span>
                            <h3>Resgates recentes</h3>
                        </div>
                        <?php if ($selectedResgates) : ?>
                            <div class="history-list">
                                <?php foreach ($selectedResgates as $redeem) : ?>
                                    <article>
                                        <strong><?php echo e(br_date($redeem['data_resgate'], true)); ?></strong>
                                        <span>Compra: <?php echo e(br_money($redeem['valor_compra'])); ?> | Usado: <?php echo e(br_money($redeem['valor_resgatado'])); ?></span>
                                        <span>Atendente: <?php echo e($redeem['atendente_nome'] ?: '-'); ?></span>
                                    </article>
                                <?php endforeach; ?>
                            </div>
                        <?php else : ?>
                            <p class="muted">Nenhum cashback usado ainda.</p>
                        <?php endif; ?>
                    </section>
                </div>
            <?php else : ?>
                <p>Busque um cliente acima ou cadastre um novo para liberar a operacao de Compra Cashback.</p>
            <?php endif; ?>
        </section>

        <section id="resgate" class="panel section-block workspace-section">
            <div class="section-title">
                <div>
                    <span class="kicker">Compra Cashback</span>
                    <h2>Registrar compra, aplicar cashback e gerar novo saldo</h2>
                </div>
                <span class="soft-pill">Uso automatico pela regra <?php echo e(number_format($multiplier, 0, ',', '.')); ?>x</span>
            </div>

            <form method="post" action="<?php echo e(app_url('dashboard.php#resgate')); ?>" class="form-grid two-cols" data-no-enter-submit data-redeem-form data-multiplier="<?php echo e($multiplier); ?>" data-default-percent="<?php echo e($defaultPercent); ?>" data-available-balance="<?php echo e($selectedBalance ? (string) round((float) $selectedBalance['saldo_disponivel'], 2) : '0'); ?>">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="save_redeem">
                <div class="client-picker full" data-client-picker-root>
                <label>
                    <span>Cliente *</span>
                    <input type="search" value="<?php echo $selectedClient ? e($selectedClient['nome'] . ' - ' . format_phone($selectedClient['telefone'])) : ''; ?>" placeholder="Digite nome ou telefone do cliente" data-client-picker data-results="#redeem-client-results" data-target="#redeem-client-id" data-selected="#redeem-selected-client" autocomplete="off" required>
                    <input type="hidden" id="redeem-client-id" name="cliente_id" value="<?php echo e($selectedClientId > 0 ? $selectedClientId : ''); ?>">
                </label>
                <div id="redeem-client-results" class="live-client-results picker-results" hidden></div>
                <div id="redeem-selected-client" class="selected-client-note" data-balance="<?php echo e($selectedBalance ? (string) round((float) $selectedBalance['saldo_disponivel'], 2) : '0'); ?>">
                    <?php if ($selectedClient && $selectedBalance) : ?>
                        Selecionado: <?php echo e($selectedClient['nome']); ?> | Saldo disponivel <?php echo e(br_money($selectedBalance['saldo_disponivel'])); ?>
                    <?php else : ?>
                        Nenhum cliente selecionado.
                    <?php endif; ?>
                </div>
                </div>
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
                    <span>Cashback aplicado automaticamente</span>
                    <input type="text" name="valor_resgate" data-money readonly required placeholder="0,00">
                </label>
                <div class="charge-summary full">
                    <div><span>Cashback aplicado</span><strong class="js-redeem-auto"><?php echo e(br_money(0)); ?></strong></div>
                    <div><span>Valor a cobrar</span><strong class="js-amount-charged"><?php echo e(br_money(0)); ?></strong></div>
                    <div><span>Novo cashback previsto</span><strong class="js-new-cashback"><?php echo e(br_money(0)); ?></strong></div>
                </div>
                <div class="live-preview full js-redeem-preview">Busque o cliente e informe a compra. O sistema calcula sozinho se usa cashback, quanto cobrar e quanto gerar novamente.</div>
                <button type="submit" class="btn primary full">Registrar Compra Cashback</button>
            </form>
        </section>

        <section id="cadastro" class="panel section-block workspace-section">
            <div class="section-title">
                <div>
                    <span class="kicker">Cadastro rapido</span>
                    <h2>Novo cliente com compra inicial opcional</h2>
                </div>
                <span class="soft-pill">Atendentes: Configuracao e Relatorio</span>
            </div>

            <form method="post" action="<?php echo e(app_url('dashboard.php#cadastro')); ?>" class="form-grid two-cols" data-no-enter-submit data-initial-purchase-form data-default-percent="<?php echo e($defaultPercent); ?>">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="save_client">
                <h3 class="full">Dados do cliente</h3>
                <label>
                    <span>Nome *</span>
                    <input type="text" name="nome" required placeholder="Nome do cliente">
                </label>
                <label>
                    <span>Telefone</span>
                    <input type="text" name="telefone" inputmode="numeric" placeholder="11999999999">
                </label>
                <label>
                    <span>Data de nascimento</span>
                    <input type="date" name="nascimento">
                </label>
                <label>
                    <span>Atendente responsavel</span>
                    <select name="atendente_id">
                        <option value="">Sem atendente</option>
                        <?php foreach ($atendentes as $atendente) : ?>
                            <option value="<?php echo e($atendente['id']); ?>"><?php echo e($atendente['nome']); ?></option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <h3 class="full">Compra no cadastro (opcional)</h3>
                <label>
                    <span>Valor que o cliente vai gastar agora</span>
                    <input type="text" name="valor_compra_inicial" data-money placeholder="100,00">
                </label>
                <label>
                    <span>% Cashback</span>
                    <input type="text" name="percentual_cashback_inicial" value="<?php echo e(number_format($defaultPercent, 2, ',', '.')); ?>">
                </label>
                <div class="charge-summary full compact-summary">
                    <div><span>Valor a cobrar</span><strong class="js-initial-charge"><?php echo e(br_money(0)); ?></strong></div>
                    <div><span>Cashback gerado</span><strong class="js-initial-cashback"><?php echo e(br_money(0)); ?></strong></div>
                    <div><span>Validade</span><strong><?php echo e($validityDays); ?> dias</strong></div>
                </div>
                <div class="live-preview full js-initial-preview">Se o cliente ja estiver comprando, informe o valor para cadastrar e registrar tudo em uma vez.</div>
                <button type="submit" class="btn primary full">Cadastrar cliente</button>
            </form>
        </section>
    </div>

    <aside class="balcao-side">
        <section class="panel sticky-panel">
            <span class="kicker">Resumo do cliente</span>
            <?php if ($selectedClient && $selectedBalance) : ?>
                <h2><?php echo e($selectedClient['nome']); ?></h2>
                <div class="balance-box">
                    <span>Saldo disponivel</span>
                    <strong><?php echo e(br_money($selectedBalance['saldo_disponivel'])); ?></strong>
                    <small>Expirando: <?php echo e(br_money($selectedBalance['saldo_expirando'])); ?></small>
                </div>
                <a class="btn primary" href="#resgate" data-section-link="resgate">Compra Cashback</a>
            <?php else : ?>
                <h2>Selecione um cliente</h2>
                <p>Use a busca para puxar saldo, compras, vencimentos e abrir a Compra Cashback.</p>
            <?php endif; ?>
        </section>
    </aside>
</section>

<?php require __DIR__ . '/footer.php'; ?>
