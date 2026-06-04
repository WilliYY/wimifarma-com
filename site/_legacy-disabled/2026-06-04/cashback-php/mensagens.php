<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'WhatsApp';
$validityDays = cashback_validity_days();
$alertDays = expiration_alert_days();
$today = date('Y-m-d');
$tomorrow = date('Y-m-d', strtotime('+1 day'));
$returnDays = max(1, (int) ($_GET['return_days'] ?? 30));

function personalized_message(string $template, string $name): string
{
    $message = trim(str_replace(array('{nome}', '{{nome}}'), $name, $template));

    if ($message === '') {
        return '';
    }

    if (stripos($message, $name) === false) {
        $message = 'Oi ' . $name . ', ' . lcfirst($message);
    }

    return $message;
}

function short_message(string $message, int $limit = 110): string
{
    if (function_exists('mb_strimwidth')) {
        return mb_strimwidth($message, 0, $limit, '...', 'UTF-8');
    }

    return strlen($message) > $limit ? substr($message, 0, $limit - 3) . '...' : $message;
}

function add_pending_message(array &$bucket, array $message): void
{
    if (($message['status'] ?? '') === 'pendente') {
        $bucket[] = $message;
    }
}

function message_card(array $message, string $subtitle): string
{
    $wa = whatsapp_link((string) ($message['telefone'] ?? ''), (string) $message['mensagem']);

    ob_start();
    ?>
    <article class="message-card" data-whatsapp-card data-message-id="<?php echo e($message['id']); ?>">
        <div class="message-card-head">
            <div>
                <strong><?php echo e($message['cliente_nome']); ?></strong>
                <span><?php echo e($subtitle); ?></span>
            </div>
            <span class="soft-pill"><?php echo e(whatsapp_campaign_label((string) $message['campanha'])); ?></span>
        </div>
        <p><?php echo e($message['mensagem']); ?></p>
        <div class="message-actions">
            <?php if ($wa) : ?>
                <a class="btn primary" href="<?php echo e($wa); ?>" target="_blank" rel="noopener" data-whatsapp-send data-message-id="<?php echo e($message['id']); ?>">Abrir WhatsApp</a>
            <?php else : ?>
                <span class="soft-pill">Sem telefone</span>
            <?php endif; ?>
            <button class="btn" type="button" data-copy-message="<?php echo e($message['mensagem']); ?>" data-message-id="<?php echo e($message['id']); ?>">Copiar texto</button>
            <button class="btn danger" type="button" data-cancel-message data-message-id="<?php echo e($message['id']); ?>">Excluir da fila</button>
        </div>
    </article>
    <?php
    return (string) ob_get_clean();
}

$comprasHoje = array();
$stmt = db()->prepare(
    'SELECT
        c.id,
        c.nome,
        c.telefone,
        COUNT(co.id) AS compras,
        COALESCE(SUM(COALESCE(co.valor_cobrado, co.valor_total)), 0) AS total_cobrado,
        COALESCE(SUM(co.cashback_gerado), 0) AS cashback_total,
        MAX(co.data_compra) AS ultima_compra,
        MAX(cr.expires_at) AS validade
     FROM wf_compras co
     INNER JOIN wf_clientes c ON c.id = co.cliente_id
     LEFT JOIN wf_cashback_creditos cr ON cr.compra_id = co.id
     WHERE co.data_compra >= ?
       AND co.data_compra < ?
       AND (co.observacoes IS NULL OR co.observacoes NOT LIKE \'Saldo importado sistema antigo CSV.%\')
     GROUP BY c.id, c.nome, c.telefone
     ORDER BY ultima_compra DESC'
);
$stmt->execute(array($today . ' 00:00:00', $tomorrow . ' 00:00:00'));

foreach ($stmt->fetchAll() as $row) {
    $validade = $row['validade'] ?: date('Y-m-d', strtotime('+' . $validityDays . ' days'));
    $messageText = 'Oi ' . $row['nome'] . ', obrigado pela compra na Wimifarma! Voce recebeu ' . br_money($row['cashback_total']) . ' de cashback. Seu cashback vale ate ' . br_date($validade) . '.';
    $message = save_whatsapp_message(
        'compra',
        'compra_hoje:' . (int) $row['id'] . ':' . $today,
        (int) $row['id'],
        null,
        null,
        (string) $row['nome'],
        (string) ($row['telefone'] ?? ''),
        $messageText,
        $today
    );
    $message['subtitle'] = (int) $row['compras'] . ' compra(s) hoje | Cobrado ' . br_money($row['total_cobrado']) . ' | Cashback ' . br_money($row['cashback_total']);
    add_pending_message($comprasHoje, $message);
}

$retornoClientes = array();
$stmt = db()->prepare(
    "SELECT
        c.id,
        c.nome,
        c.telefone,
        COALESCE(SUM(cr.valor_restante), 0) AS saldo,
        MIN(cr.expires_at) AS proximo_vencimento,
        (
            SELECT MAX(co.data_compra)
            FROM wf_compras co
            WHERE co.cliente_id = c.id
        ) AS ultima_compra
     FROM wf_clientes c
     INNER JOIN wf_cashback_creditos cr ON cr.cliente_id = c.id
     WHERE c.status = 'ativo'
       AND cr.status = 'ativo'
       AND cr.valor_restante > 0
       AND cr.expires_at >= CURDATE()
       AND NOT EXISTS (
            SELECT 1
            FROM wf_whatsapp_mensagens wm
            WHERE wm.cliente_id = c.id
              AND wm.campanha = 'recompra'
              AND wm.status IN ('aberta', 'copiada', 'enviada')
              AND wm.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       )
     GROUP BY c.id, c.nome, c.telefone
     HAVING ultima_compra IS NULL OR ultima_compra < DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY proximo_vencimento ASC
     LIMIT 80"
);
$stmt->execute(array($returnDays));

foreach ($stmt->fetchAll() as $row) {
    $messageText = 'Oi ' . $row['nome'] . ', voce tem ' . br_money($row['saldo']) . ' de cashback disponivel na Wimifarma. Seu proximo vencimento e ' . br_date($row['proximo_vencimento']) . '. Passe na loja para aproveitar.';
    $message = save_whatsapp_message(
        'recompra',
        'recompra:' . (int) $row['id'] . ':' . $today,
        (int) $row['id'],
        null,
        null,
        (string) $row['nome'],
        (string) ($row['telefone'] ?? ''),
        $messageText,
        $today
    );
    $message['subtitle'] = 'Saldo ' . br_money($row['saldo']) . ' | Ultima compra: ' . br_date($row['ultima_compra'], true);
    add_pending_message($retornoClientes, $message);
}

$birthdays = array();
$stmt = db()->query(
    "SELECT id, nome, telefone, nascimento
     FROM wf_clientes
     WHERE status = 'ativo'
       AND nascimento IS NOT NULL
     ORDER BY nome ASC"
);

foreach ($stmt->fetchAll() as $row) {
    $birthday = birthday_days_until((string) $row['nascimento']);

    if (!$birthday || $birthday['days'] > 5) {
        continue;
    }

    $daysText = $birthday['days'] === 0 ? 'hoje e seu aniversario' : 'faltam ' . $birthday['days'] . ' dia(s) para seu aniversario';
    $messageText = 'Oi ' . $row['nome'] . ', ' . $daysText . '! A Wimifarma preparou uma acao especial para voce: 10% de cashback aqui na loja. Esperamos voce.';
    $message = save_whatsapp_message(
        'aniversario',
        'aniversario:' . (int) $row['id'] . ':' . $birthday['date'],
        (int) $row['id'],
        null,
        null,
        (string) $row['nome'],
        (string) ($row['telefone'] ?? ''),
        $messageText,
        $birthday['date']
    );
    $message['subtitle'] = ucfirst($daysText) . ' | Data: ' . br_date($birthday['date']);
    add_pending_message($birthdays, $message);
}

$expirando = array();
$stmt = db()->prepare(
    "SELECT
        c.id,
        c.nome,
        c.telefone,
        COALESCE(SUM(cr.valor_restante), 0) AS saldo_expirando,
        MIN(cr.expires_at) AS data_limite,
        COUNT(cr.id) AS creditos
     FROM wf_cashback_creditos cr
     INNER JOIN wf_clientes c ON c.id = cr.cliente_id
     WHERE c.status = 'ativo'
       AND cr.status = 'ativo'
       AND cr.valor_restante > 0
       AND cr.expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
     GROUP BY c.id, c.nome, c.telefone
     ORDER BY data_limite ASC"
);
$stmt->execute(array($alertDays));

foreach ($stmt->fetchAll() as $row) {
    $messageText = 'Oi ' . $row['nome'] . ', seu cashback de ' . br_money($row['saldo_expirando']) . ' na Wimifarma expira ate ' . br_date($row['data_limite']) . '. Aproveite antes do vencimento.';
    $message = save_whatsapp_message(
        'expiracao',
        'expiracao:' . (int) $row['id'] . ':' . $row['data_limite'],
        (int) $row['id'],
        null,
        null,
        (string) $row['nome'],
        (string) ($row['telefone'] ?? ''),
        $messageText,
        (string) $row['data_limite']
    );
    $message['subtitle'] = br_money($row['saldo_expirando']) . ' vencendo | Data limite: ' . br_date($row['data_limite']);
    add_pending_message($expirando, $message);
}

$todosWhats = db()->query(
    "SELECT *
     FROM wf_whatsapp_mensagens
     ORDER BY created_at DESC, id DESC
     LIMIT 200"
)->fetchAll();

require __DIR__ . '/header.php';
?>

<section class="metrics compact">
    <article class="metric highlight"><span>Compraram hoje</span><strong><?php echo e(count($comprasHoje)); ?></strong></article>
    <article class="metric"><span>Recompra</span><strong><?php echo e(count($retornoClientes)); ?></strong></article>
    <article class="metric"><span>Aniversarios em ate 5 dias</span><strong><?php echo e(count($birthdays)); ?></strong></article>
    <article class="metric"><span>Expirando em ate <?php echo e($alertDays); ?> dias</span><strong><?php echo e(count($expirando)); ?></strong></article>
</section>

<nav class="anchor-bar" aria-label="Atalhos de mensagens">
    <a class="btn primary" href="#compras-hoje">Compras de hoje</a>
    <a class="btn" href="#retorno">Recompra</a>
    <a class="btn" href="#aniversarios">Aniversarios</a>
    <a class="btn" href="#expiracao">Expiracao</a>
    <a class="btn" href="#todos-whats">Todos Whats</a>
</nav>

<section id="compras-hoje" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Obrigado pela compra</span>
            <h2>Clientes que compraram hoje</h2>
        </div>
        <span class="soft-pill">Validade atual: <?php echo e($validityDays); ?> dias</span>
    </div>
    <div class="message-grid">
        <?php foreach ($comprasHoje as $row) : ?>
            <?php echo message_card($row, (string) $row['subtitle']); ?>
        <?php endforeach; ?>
        <?php if (!$comprasHoje) : ?>
            <p>Nenhuma mensagem pendente para compra de hoje.</p>
        <?php endif; ?>
    </div>
</section>

<section id="retorno" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Retorno e recompra</span>
            <h2>Clientes com saldo e sem compra recente</h2>
        </div>
        <span class="soft-pill">Filtro: <?php echo e($returnDays); ?> dias</span>
    </div>
    <div class="message-grid">
        <?php foreach ($retornoClientes as $row) : ?>
            <?php echo message_card($row, (string) $row['subtitle']); ?>
        <?php endforeach; ?>
        <?php if (!$retornoClientes) : ?>
            <p>Nenhum cliente no criterio de recompra agora.</p>
        <?php endif; ?>
    </div>
</section>

<section id="aniversarios" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Aniversario</span>
            <h2>Clientes com aniversario em ate 5 dias</h2>
        </div>
    </div>
    <div class="message-grid">
        <?php foreach ($birthdays as $row) : ?>
            <?php echo message_card($row, (string) $row['subtitle']); ?>
        <?php endforeach; ?>
        <?php if (!$birthdays) : ?>
            <p>Nenhum aniversario nos proximos 5 dias.</p>
        <?php endif; ?>
    </div>
</section>

<section id="expiracao" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Expiracao</span>
            <h2>Cashback vencendo em ate <?php echo e($alertDays); ?> dias</h2>
        </div>
    </div>
    <div class="message-grid">
        <?php foreach ($expirando as $row) : ?>
            <?php echo message_card($row, (string) $row['subtitle']); ?>
        <?php endforeach; ?>
        <?php if (!$expirando) : ?>
            <p>Nenhum cashback vencendo no periodo configurado.</p>
        <?php endif; ?>
    </div>
</section>

<section id="todos-whats" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Historico salvo</span>
            <h2>Todos Whats</h2>
        </div>
        <span class="soft-pill"><?php echo e(count($todosWhats)); ?> ultimos registros</span>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($todosWhats as $row) : ?>
                    <tr>
                        <td><?php echo e(br_date($row['created_at'], true)); ?></td>
                        <td><?php echo e(whatsapp_campaign_label((string) $row['campanha'])); ?></td>
                        <td><?php echo e($row['cliente_nome']); ?><br><small><?php echo e(format_phone($row['telefone'])); ?></small></td>
                        <td><span class="badge"><?php echo e(whatsapp_status_label((string) $row['status'])); ?></span></td>
                        <td><?php echo e(short_message((string) $row['mensagem'])); ?></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$todosWhats) : ?>
                    <tr><td colspan="5">Nenhum WhatsApp salvo ainda.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
