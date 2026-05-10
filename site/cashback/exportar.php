<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_sensitive_area_access('Configuracao e Relatorio');

$tipo = (string) ($_GET['tipo'] ?? 'clientes');
$start = $_GET['start'] ?? date('Y-m-01');
$end = $_GET['end'] ?? date('Y-m-d');

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $start)) {
    $start = date('Y-m-01');
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $end)) {
    $end = date('Y-m-d');
}

$exports = array(
    'clientes' => array(
        'filename' => 'clientes',
        'headers' => array('ID', 'Nome', 'Telefone', 'Nascimento', 'Status', 'Atendente', 'Criado em', 'Observacoes'),
        'sql' => "SELECT c.id, c.nome, c.telefone, c.nascimento, c.status, COALESCE(a.nome, '') AS atendente, c.created_at, c.observacoes
                  FROM wf_clientes c
                  LEFT JOIN wf_atendentes a ON a.id = c.atendente_id
                  ORDER BY c.nome ASC",
        'params' => array(),
    ),
    'compras' => array(
        'filename' => 'compras',
        'headers' => array('ID', 'Data', 'Cliente', 'Atendente', 'Valor bruto', 'Cashback usado', 'Valor cobrado', 'Percentual', 'Cashback gerado', 'Observacoes'),
        'sql' => "SELECT co.id, co.data_compra, c.nome AS cliente, COALESCE(a.nome, '') AS atendente,
                         COALESCE(co.valor_bruto, co.valor_total) AS valor_bruto,
                         COALESCE(co.desconto_cashback, 0) AS desconto_cashback,
                         COALESCE(co.valor_cobrado, co.valor_total) AS valor_cobrado,
                         co.percentual_cashback, co.cashback_gerado, co.observacoes
                  FROM wf_compras co
                  INNER JOIN wf_clientes c ON c.id = co.cliente_id
                  LEFT JOIN wf_atendentes a ON a.id = co.atendente_id
                  WHERE DATE(co.data_compra) BETWEEN ? AND ?
                  ORDER BY co.data_compra DESC",
        'params' => array($start, $end),
    ),
    'resgates' => array(
        'filename' => 'resgates',
        'headers' => array('ID', 'Data', 'Cliente', 'Atendente', 'Valor compra', 'Cashback usado', 'Valor cobrado', 'Observacoes'),
        'sql' => "SELECT r.id, r.data_resgate, c.nome AS cliente, COALESCE(a.nome, '') AS atendente,
                         r.valor_compra, r.valor_resgatado, (r.valor_compra - r.valor_resgatado) AS valor_cobrado, r.observacoes
                  FROM wf_resgates r
                  INNER JOIN wf_clientes c ON c.id = r.cliente_id
                  LEFT JOIN wf_atendentes a ON a.id = r.atendente_id
                  WHERE DATE(r.data_resgate) BETWEEN ? AND ?
                  ORDER BY r.data_resgate DESC",
        'params' => array($start, $end),
    ),
    'creditos' => array(
        'filename' => 'creditos-cashback',
        'headers' => array('ID', 'Cliente', 'Compra ID', 'Valor original', 'Valor restante', 'Vence em', 'Status', 'Criado em'),
        'sql' => "SELECT cr.id, c.nome AS cliente, cr.compra_id, cr.valor_original, cr.valor_restante, cr.expires_at, cr.status, cr.created_at
                  FROM wf_cashback_creditos cr
                  INNER JOIN wf_clientes c ON c.id = cr.cliente_id
                  ORDER BY cr.expires_at ASC, cr.id DESC",
        'params' => array(),
    ),
    'whatsapp' => array(
        'filename' => 'todos-whats',
        'headers' => array('ID', 'Criado em', 'Campanha', 'Cliente', 'Telefone', 'Status', 'Vencimento/acao', 'Mensagem'),
        'sql' => "SELECT id, created_at, campanha, cliente_nome, telefone, status, due_date, mensagem
                  FROM wf_whatsapp_mensagens
                  ORDER BY created_at DESC, id DESC",
        'params' => array(),
    ),
    'atendentes' => array(
        'filename' => 'atendentes',
        'headers' => array('ID', 'Nome', 'Status', 'Observacoes', 'Criado em'),
        'sql' => "SELECT id, nome, status, observacoes, created_at FROM wf_atendentes ORDER BY nome ASC",
        'params' => array(),
    ),
);

if (!isset($exports[$tipo])) {
    http_response_code(404);
    echo 'Relatorio invalido.';
    exit;
}

$export = $exports[$tipo];
$stmt = db()->prepare($export['sql']);
$stmt->execute($export['params']);

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="wimifarma-' . $export['filename'] . '-' . date('Ymd-His') . '.csv"');
header('Pragma: no-cache');
header('Expires: 0');

$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");
fputcsv($out, $export['headers'], ';');

while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
    fputcsv($out, $row, ';');
}

fclose($out);
exit;
