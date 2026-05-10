<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

$term = trim((string) ($_GET['q'] ?? $_GET['term'] ?? ''));
$digits = digits_only($term);

if ($term === '' || (strlen($term) < 2 && $digits === '')) {
    echo json_encode(array('clientes' => array()), JSON_UNESCAPED_UNICODE);
    exit;
}

$where = array("c.status = 'ativo'");
$params = array();
$searchParts = array('c.nome LIKE ?');
$params[] = '%' . $term . '%';

if ($digits !== '') {
    $searchParts[] = 'c.telefone LIKE ?';
    $params[] = '%' . $digits . '%';

    if (ctype_digit($digits)) {
        $searchParts[] = 'c.id = ?';
        $params[] = (int) $digits;
    }
}

$where[] = '(' . implode(' OR ', $searchParts) . ')';

$stmt = db()->prepare(
    'SELECT
        c.id,
        c.nome,
        c.telefone,
        c.nascimento,
        c.status,
        a.nome AS atendente_nome,
        (
            SELECT MAX(co.data_compra)
            FROM wf_compras co
            WHERE co.cliente_id = c.id
        ) AS ultima_compra_data,
        (
            SELECT co.valor_total
            FROM wf_compras co
            WHERE co.cliente_id = c.id
            ORDER BY co.data_compra DESC
            LIMIT 1
        ) AS ultima_compra_valor
     FROM wf_clientes c
     LEFT JOIN wf_atendentes a ON a.id = c.atendente_id
     WHERE ' . implode(' AND ', $where) . '
     ORDER BY
        CASE WHEN c.nome LIKE ? THEN 0 ELSE 1 END,
        c.nome ASC
     LIMIT 8'
);

$params[] = $term . '%';
$stmt->execute($params);

$clientes = array();

foreach ($stmt->fetchAll() as $cliente) {
    $saldo = balance_for_client((int) $cliente['id']);
    $clientes[] = array(
        'id' => (int) $cliente['id'],
        'nome' => $cliente['nome'],
        'telefone' => format_phone($cliente['telefone']),
        'telefone_raw' => digits_only($cliente['telefone']),
        'atendente' => $cliente['atendente_nome'] ?: 'Sem atendente',
        'saldo_disponivel' => br_money($saldo['saldo_disponivel']),
        'saldo_disponivel_raw' => round((float) $saldo['saldo_disponivel'], 2),
        'saldo_expirando' => br_money($saldo['saldo_expirando']),
        'saldo_expirando_raw' => round((float) $saldo['saldo_expirando'], 2),
        'proximo_vencimento' => $saldo['proximo_vencimento'] ? br_date($saldo['proximo_vencimento']) : '-',
        'ultima_compra' => $cliente['ultima_compra_data'] ? br_date($cliente['ultima_compra_data'], true) : 'Sem compra',
        'ultima_compra_valor' => $cliente['ultima_compra_valor'] !== null ? br_money($cliente['ultima_compra_valor']) : '-',
        'selecionar_url' => app_url('dashboard.php?cliente_id=' . (int) $cliente['id'] . '#cliente-atual'),
        'compra_url' => app_url('dashboard.php?cliente_id=' . (int) $cliente['id'] . '#resgate'),
        'resgate_url' => app_url('dashboard.php?cliente_id=' . (int) $cliente['id'] . '#resgate'),
    );
}

echo json_encode(array('clientes' => $clientes), JSON_UNESCAPED_UNICODE);
