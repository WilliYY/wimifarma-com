<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (!current_user()) {
    header('Location: /financeiro/login.php');
    exit;
}

financeiro_ensure_schema();

$type = (string) ($_GET['tipo'] ?? 'mensal');
$month = max(1, min(12, (int) ($_GET['mes'] ?? date('n'))));
$year = max(2020, min(2100, (int) ($_GET['ano'] ?? date('Y'))));
$date = financeiro_valid_date($_GET['data'] ?? null, date('Y-m-d'));

function fin_csv_safe_row(array $row): array
{
    return array_map(static function ($value): string {
        $value = (string) $value;

        if ($value !== '' && preg_match('/^[=\-+@]/', ltrim($value))) {
            return "'" . $value;
        }

        return $value;
    }, $row);
}

function fin_csv_download(string $filename, array $headers, array $rows): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, $headers, ';');

    foreach ($rows as $row) {
        fputcsv($out, fin_csv_safe_row($row), ';');
    }

    fclose($out);
    exit;
}

function fin_export_row(array $closing, string $fallbackDate): array
{
    return array(
        br_date((string) ($closing['data_fechamento'] ?? $fallbackDate)),
        isset($closing['status']) ? financeiro_status_label((string) $closing['status']) : 'Sem fechamento',
        number_format((float) ($closing['caixa_fisico'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['cartao_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['pix_banco_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['pix_maquininha_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['sangria_total'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['retirada_caixa'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['abertura_sistema'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['faturamento_dia'] ?? 0), 2, ',', '.'),
        (string) ($closing['faturamento_registrado_em'] ?? ''),
        number_format((float) ($closing['ajustes'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['total_conferido'] ?? 0), 2, ',', '.'),
        number_format((float) ($closing['sobra_falta'] ?? 0), 2, ',', '.'),
        (string) ($closing['justificativa'] ?? ''),
        (string) ($closing['responsavel_nome'] ?? ''),
        (string) ($closing['fechado_em'] ?? ''),
    );
}

$headers = array(
    'Data',
    'Status',
    'Caixa fisico',
    'Cartao C/D',
    'PIX banco',
    'PIX maquininha',
    'Sangria',
    'Retirada caixa',
    'Total Sistema',
    'Faturamento do dia',
    'Faturamento registrado em',
    'Ajustes',
    'Total conferido',
    'Sobra/Falta',
    'Justificativa',
    'Responsavel',
    'Fechado em',
);

if ($type === 'dia') {
    $closing = financeiro_fetch_by_date($date) ?: array('data_fechamento' => $date, 'status' => 'sem_movimento');
    financeiro_audit('exportar_dia_csv', 'financeiro_fechamentos', isset($closing['id']) ? (int) $closing['id'] : null, null, array('data' => $date));
    fin_csv_download('financeiro-fechamento-' . $date . '.csv', $headers, array(fin_export_row($closing, $date)));
}

$closings = financeiro_month_closings($month, $year);
$rows = array();

foreach (financeiro_month_days($month, $year) as $day) {
    $rows[] = fin_export_row($closings[$day] ?? array(), $day);
}

financeiro_audit('exportar_mes_csv', 'financeiro_fechamentos', null, null, array('mes' => $month, 'ano' => $year));
fin_csv_download(sprintf('financeiro-%04d-%02d.csv', $year, $month), $headers, $rows);
