<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

cotacao_require_user();

$slug = trim((string) ($_GET['bloco'] ?? ''));
$block = cotacao_block_by_slug($slug);

if (!$block) {
    http_response_code(404);
    echo 'Bloco nao encontrado.';
    exit;
}

$filters = array(
    'q' => trim((string) ($_GET['q'] ?? '')),
    'categoria' => trim((string) ($_GET['categoria'] ?? '')),
    'cor' => trim((string) ($_GET['cor'] ?? '')),
    'vencedor' => trim((string) ($_GET['vencedor'] ?? '')),
);
$suppliers = cotacao_suppliers((int) $block['id']);
$items = cotacao_sheet_items((int) $block['id'], $filters);
$prices = cotacao_item_prices($items);
$filename = 'cotacao-' . preg_replace('/[^a-z0-9_-]+/i', '-', (string) $block['slug']) . '-' . date('Ymd-His') . '.csv';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$out = fopen('php://output', 'wb');
fwrite($out, "\xEF\xBB\xBF");

$header = array('EAN', 'Produto', 'Quantidade', 'Unidade', 'Categoria', 'Cor', 'Tipo');
foreach ($suppliers as $supplier) {
    $header[] = (string) $supplier['nome'];
}
$header[] = 'Resultado';
$header[] = 'Status';
$header[] = 'Observacao';
fputcsv($out, $header, ';');

foreach ($items as $item) {
    $row = array(
        (string) $item['ean'],
        (string) $item['produto'],
        cotacao_price_format($item['quantidade']),
        (string) $item['unidade'],
        (string) $item['categoria'],
        (string) ($item['cor'] ?? ''),
        cotacao_priority_label((string) $item['prioridade']),
    );

    foreach ($suppliers as $supplier) {
        $supplierId = (int) $supplier['id'];
        $row[] = cotacao_price_format($prices[(int) $item['id']][$supplierId] ?? null);
    }

    $row[] = cotacao_winner_text($item);
    $row[] = cotacao_status_label((string) $item['status']);
    $row[] = (string) $item['observacao'];
    fputcsv($out, $row, ';');
}

fclose($out);
exit;
