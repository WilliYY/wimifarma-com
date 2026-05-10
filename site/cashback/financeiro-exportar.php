<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/financeiro-funcoes.php';

$type = (string) ($_GET['tipo'] ?? 'mensal');
$month = max(1, min(12, (int) ($_GET['mes'] ?? date('n'))));
$year = max(2020, min(2100, (int) ($_GET['ano'] ?? date('Y'))));
$date = financeiro_valid_date($_GET['data'] ?? null, date('Y-m-d'));

function financeiro_csv_download(string $filename, array $headers, array $rows): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, $headers, ';');

    foreach ($rows as $row) {
        fputcsv($out, financeiro_csv_safe_row($row), ';');
    }

    fclose($out);
    exit;
}

function financeiro_csv_safe_row(array $row): array
{
    return array_map(static function ($value) {
        $value = (string) $value;

        if ($value !== '' && preg_match('/^[=\-+@]/', ltrim($value))) {
            return "'" . $value;
        }

        return $value;
    }, $row);
}

if ($type === 'dia') {
    $closing = financeiro_fetch_by_date($date);

    if (!$closing) {
        $closing = array(
            'data_fechamento' => $date,
            'status' => 'aberto',
            'caixa_fisico' => 0,
            'cartao_total' => 0,
            'pix_banco_total' => 0,
            'pix_maquininha_total' => 0,
            'pix_correto_total' => 0,
            'sangria_total' => 0,
            'retirada_caixa' => 0,
            'abertura_sistema' => 0,
            'ajustes' => 0,
            'total_conferido' => 0,
            'sobra_falta' => 0,
            'justificativa' => '',
        );
    }

    financeiro_audit('exportar_dia_csv', 'financeiro_fechamentos', isset($closing['id']) ? (int) $closing['id'] : null, null, array('data' => $date));
    financeiro_csv_download(
        'financeiro-fechamento-' . $date . '.csv',
        array('Data', 'Status', 'Caixa fisico', 'Cartao C/D', 'PIX banco', 'PIX maquininha', 'PIX correto', 'Sangria', 'Retirada caixa', 'Abertura sistema', 'Ajustes', 'Total conferido', 'Sobra/Falta', 'Justificativa'),
        array(array(
            br_date($closing['data_fechamento']),
            financeiro_status_label((string) $closing['status']),
            number_format((float) $closing['caixa_fisico'], 2, ',', '.'),
            number_format((float) $closing['cartao_total'], 2, ',', '.'),
            number_format((float) $closing['pix_banco_total'], 2, ',', '.'),
            number_format((float) $closing['pix_maquininha_total'], 2, ',', '.'),
            number_format((float) $closing['pix_correto_total'], 2, ',', '.'),
            number_format((float) $closing['sangria_total'], 2, ',', '.'),
            number_format((float) $closing['retirada_caixa'], 2, ',', '.'),
            number_format((float) $closing['abertura_sistema'], 2, ',', '.'),
            number_format((float) $closing['ajustes'], 2, ',', '.'),
            number_format((float) $closing['total_conferido'], 2, ',', '.'),
            number_format((float) $closing['sobra_falta'], 2, ',', '.'),
            (string) ($closing['justificativa'] ?? ''),
        ))
    );
}

$closings = financeiro_month_closings($month, $year);
$rows = array();

foreach (financeiro_month_days($month, $year) as $day) {
    $row = $closings[$day] ?? array();
    $rows[] = array(
        br_date($day),
        $row ? financeiro_status_label((string) $row['status']) : 'Sem fechamento',
        number_format((float) ($row['caixa_fisico'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['cartao_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['pix_banco_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['pix_maquininha_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['pix_correto_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['sangria_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['retirada_caixa'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['abertura_sistema'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['ajustes'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['total_conferido'] ?? 0), 2, ',', '.'),
        number_format((float) ($row['sobra_falta'] ?? 0), 2, ',', '.'),
        (string) ($row['justificativa'] ?? ''),
        (string) ($row['responsavel_nome'] ?? ''),
    );
}

financeiro_audit('exportar_mes_csv', 'financeiro_fechamentos', null, null, array('mes' => $month, 'ano' => $year));
financeiro_csv_download(
    sprintf('financeiro-%04d-%02d.csv', $year, $month),
    array('Data', 'Status', 'Caixa fisico', 'Cartao C/D', 'PIX banco', 'PIX maquininha', 'PIX correto', 'Sangria', 'Retirada caixa', 'Abertura sistema', 'Ajustes', 'Total conferido', 'Sobra/Falta', 'Justificativa', 'Responsavel'),
    $rows
);
