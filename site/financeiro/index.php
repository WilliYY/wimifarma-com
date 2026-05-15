<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function fin_request_wants_json(): bool
{
    return (string) ($_POST['ajax'] ?? '') === '1'
        || stripos((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') !== false
        || strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest';
}

$user = current_user();

if (!$user) {
    if (fin_request_wants_json()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array(
            'ok' => false,
            'message' => 'Sessao expirada. Entre novamente no financeiro e tente de novo.',
        ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    header('Location: /financeiro/login.php');
    exit;
}

clear_sensitive_area_access();
financeiro_ensure_schema();

function fin_url(array $query = array(), string $anchor = ''): string
{
    $url = '/financeiro/';

    if ($query) {
        $url .= '?' . http_build_query($query);
    }

    return $anchor !== '' ? $url . '#' . ltrim($anchor, '#') : $url;
}

function fin_redirect(int $year, int $month, string $date, string $anchor = 'dia'): void
{
    header('Location: ' . fin_url(array('ano' => $year, 'mes' => $month, 'data' => $date), $anchor));
    exit;
}

function fin_is_ajax(): bool
{
    return fin_request_wants_json();
}

function fin_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fin_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('Sessao expirada. Atualize a pagina e tente novamente.');
    }
}

function fin_int_or_null(string $key): ?int
{
    $value = (int) ($_POST[$key] ?? 0);

    return $value > 0 ? $value : null;
}

function fin_money(string $key): float
{
    return money_to_decimal($_POST[$key] ?? '0');
}

function fin_money_value($value): float
{
    return money_to_decimal($value ?? '0');
}

function fin_parse_faturamento_text(string $text, int $year, int $month): array
{
    $entries = array();
    if (trim($text) === '') {
        return $entries;
    }

    $pattern = '/(?:^|[\s,;])(?:dia\s*)?(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?)?\s*(?:vendeu|vendas|faturou|faturamento|=|:|-)?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/iu';
    if (!preg_match_all($pattern, $text, $matches, PREG_SET_ORDER)) {
        return $entries;
    }

    foreach ($matches as $match) {
        $day = (int) $match[1];
        $entryMonth = isset($match[2]) && $match[2] !== '' ? (int) $match[2] : $month;
        $entryYear = $year;
        if (isset($match[3]) && $match[3] !== '') {
            $entryYear = (int) $match[3];
            if ($entryYear < 100) {
                $entryYear += 2000;
            }
        }

        if (!checkdate($entryMonth, $day, $entryYear)) {
            continue;
        }

        $entries[sprintf('%04d-%02d-%02d', $entryYear, $entryMonth, $day)] = fin_money_value($match[4]);
    }

    return $entries;
}

function fin_default_date_for_month(int $year, int $month): string
{
    $lastDay = (int) date('t', strtotime(sprintf('%04d-%02d-01', $year, $month)));
    $day = 1;

    if ($year === (int) date('Y') && $month === (int) date('n')) {
        $day = min((int) date('j'), $lastDay);
    }

    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

function fin_weekday_label(string $date): string
{
    $labels = array('Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab');
    $index = (int) date('w', strtotime($date) ?: time());

    return $labels[$index] ?? '';
}

function fin_fiscal_years(): array
{
    return array(2026, 2027, 2028);
}

function fin_selected_context(): array
{
    $fiscalYears = fin_fiscal_years();
    $year = max(min($fiscalYears), min(max($fiscalYears), (int) ($_GET['ano'] ?? date('Y'))));
    $month = max(1, min(12, (int) ($_GET['mes'] ?? date('n'))));
    $defaultDate = fin_default_date_for_month($year, $month);
    $date = financeiro_valid_date($_GET['data'] ?? null, $defaultDate);
    $dateTime = strtotime($date);

    if ($dateTime !== false) {
        $dateYear = (int) date('Y', $dateTime);

        if (in_array($dateYear, $fiscalYears, true)) {
            $year = $dateYear;
            $month = (int) date('n', $dateTime);
        } else {
            $date = fin_default_date_for_month($year, $month);
        }
    }

    return array($year, $month, $date);
}

function fin_closing_data_from_post(): array
{
    return array(
        'responsavel_id' => fin_int_or_null('responsavel_id'),
        'responsavel_texto' => trim((string) ($_POST['responsavel_texto'] ?? '')),
        'caixa_fisico' => fin_money('caixa_fisico'),
        'cartao_total' => fin_money('cartao_total'),
        'pix_banco_total' => fin_money('pix_banco_total'),
        'pix_maquininha_total' => fin_money('pix_maquininha_total'),
        'pix_correto_manual' => null,
        'pix_correto_justificativa' => '',
        'sangria_total' => fin_money('sangria_total'),
        'retirada_caixa' => fin_money('retirada_caixa'),
        'abertura_sistema' => fin_money('total_sistema'),
        'faturamento_dia' => fin_money('faturamento_dia'),
        'ajustes' => fin_money('ajustes'),
        'justificativa' => trim((string) ($_POST['justificativa'] ?? '')),
        'observacao' => trim((string) ($_POST['observacao'] ?? '')),
    );
}

function fin_close_day(int $closingId, string $status): array
{
    $before = financeiro_fetch_by_id($closingId);
    $stmt = db()->prepare(
        'UPDATE financeiro_fechamentos
         SET status = ?, fechado_em = NOW(), fechado_por = ?
         WHERE id = ?'
    );
    $stmt->execute(array($status, (int) ($_SESSION['user_id'] ?? 0), $closingId));
    $after = financeiro_fetch_by_id($closingId) ?: array();
    financeiro_audit('fechar_fechamento', 'financeiro_fechamentos', $closingId, $before, $after);

    return $after;
}

function fin_default_closing(string $date): array
{
    return array(
        'id' => null,
        'data_fechamento' => $date,
        'responsavel_id' => null,
        'responsavel_texto' => '',
        'responsavel_nome' => '',
        'status' => 'aberto',
        'caixa_fisico' => 0,
        'cartao_total' => 0,
        'pix_banco_total' => 0,
        'pix_maquininha_total' => 0,
        'pix_correto_total' => 0,
        'sangria_total' => 0,
        'retirada_caixa' => 0,
        'abertura_sistema' => 0,
        'faturamento_dia' => 0,
        'faturamento_registrado_em' => null,
        'ajustes' => 0,
        'total_conferido' => 0,
        'sobra_falta' => 0,
        'justificativa' => '',
        'observacao' => '',
    );
}

function fin_selected_view(): string
{
    $view = (string) ($_GET['view'] ?? '');

    if ($view === 'relatorio') {
        return $view;
    }

    return 'caixa';
}

function fin_day_status_label(?array $closing): string
{
    if (!$closing || empty($closing['id'])) {
        return 'Aberto';
    }

    $status = (string) ($closing['status'] ?? 'aberto');

    if (in_array($status, array('fechado', 'sem_movimento'), true)) {
        return 'Fechado';
    }

    if ($status === 'divergente') {
        return 'Divergente';
    }

    return 'Aberto';
}

function fin_signed_money(float $value): string
{
    if ($value > 0.009) {
        return 'R$ +' . number_format($value, 2, ',', '.');
    }

    if ($value < -0.009) {
        return 'R$ -' . number_format(abs($value), 2, ',', '.');
    }

    return br_money(0);
}

function fin_br_datetime(?string $value): string
{
    if (!$value) {
        return '-';
    }

    $timestamp = strtotime($value);

    return $timestamp ? date('d/m/Y H:i', $timestamp) : $value;
}

function fin_entry_datetime(?string $value): string
{
    if (!$value) {
        return '-';
    }

    $timestamp = strtotime($value);

    return $timestamp ? date('d/m/y - H:i', $timestamp) : $value;
}

function fin_closing_badge_text(array $closing, string $date): string
{
    $text = br_date($date) . ' - ' . financeiro_status_label((string) ($closing['status'] ?? 'aberto'));
    $closedAt = $closing['fechado_em'] ?? null;

    if ($closedAt) {
        $timestamp = strtotime((string) $closedAt);

        if ($timestamp) {
            $text .= ' - Fechado ' . date('d/m/y H:i', $timestamp);
        }
    }

    return $text;
}

function fin_json_preview($value): string
{
    if ($value === null || $value === '') {
        return '-';
    }

    $decoded = json_decode((string) $value, true);

    if (json_last_error() === JSON_ERROR_NONE) {
        return (string) json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    return (string) $value;
}

function fin_audit_decode($value): array
{
    if ($value === null || $value === '') {
        return array();
    }

    $decoded = json_decode((string) $value, true);

    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
        return $decoded;
    }

    return array('valor' => (string) $value);
}

function fin_audit_action_label(string $action): string
{
    $labels = array(
        'alterar_fechamento' => 'Alterou fechamento',
        'criar_fechamento' => 'Criou fechamento',
        'fechar_fechamento' => 'Fechou o dia',
        'reabrir_fechamento' => 'Reabriu o dia',
        'criar_lancamento' => 'Adicionou lancamento',
        'cancelar_lancamento' => 'Removeu lancamento',
        'criar_sangria' => 'Criou sangria',
        'criar_maquininha' => 'Criou maquininha',
        'criar_pix' => 'Criou PIX',
        'importar_csv' => 'Importou CSV',
        'salvar_faturamento_diario' => 'Salvou faturamento diario',
    );

    return $labels[$action] ?? ucwords(str_replace('_', ' ', $action));
}

function fin_audit_record_label(string $table, $recordId): string
{
    $labels = array(
        'financeiro_fechamentos' => 'Fechamento',
        'financeiro_lancamentos' => 'Lancamento',
        'financeiro_sangrias' => 'Sangria',
        'financeiro_maquininhas' => 'Maquininha',
        'financeiro_pix' => 'PIX',
    );

    $label = $labels[$table] ?? $table;
    $id = (string) ($recordId ?? '');

    return $id !== '' ? $label . ' #' . $id : $label;
}

function fin_audit_field_label(string $field): string
{
    $labels = array(
        'data_fechamento' => 'Data do caixa',
        'responsavel_id' => 'ID do responsavel',
        'responsavel_texto' => 'Responsavel',
        'responsavel_nome' => 'Responsavel',
        'status' => 'Status',
        'caixa_fisico' => 'Dinheiro fisico',
        'cartao_total' => 'Cartao C/D',
        'pix_banco_total' => 'PIX CNPJ',
        'pix_maquininha_total' => 'Maquininha Pix',
        'pix_correto_total' => 'PIX conferido',
        'sangria_total' => 'Sangrias',
        'retirada_caixa' => 'Retirada de caixa',
        'abertura_sistema' => 'Total Sistema',
        'faturamento_dia' => 'Faturamento do dia',
        'ajustes' => 'Ajustes',
        'total_conferido' => 'Total lancado',
        'sobra_falta' => 'Sobra/Falta',
        'justificativa' => 'Justificativa',
        'observacao' => 'Observacao',
        'fechado_em' => 'Fechado em',
        'fechado_por' => 'Fechado por',
        'created_at' => 'Criado em',
        'updated_at' => 'Atualizado em',
        'categoria' => 'Categoria',
        'valor' => 'Valor',
        'data' => 'Data',
    );

    return $labels[$field] ?? ucwords(str_replace('_', ' ', $field));
}

function fin_audit_money_field(string $field): bool
{
    return in_array($field, array(
        'caixa_fisico', 'cartao_total', 'pix_banco_total', 'pix_maquininha_total',
        'pix_correto_total', 'sangria_total', 'retirada_caixa', 'abertura_sistema',
        'faturamento_dia', 'ajustes', 'total_conferido', 'sobra_falta', 'valor',
    ), true);
}

function fin_audit_value(string $field, $value): string
{
    if ($value === null || $value === '') {
        return '-';
    }

    if (is_bool($value)) {
        return $value ? 'Sim' : 'Nao';
    }

    if (is_array($value)) {
        return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    if (fin_audit_money_field($field) && is_numeric($value)) {
        return br_money((float) $value);
    }

    if (in_array($field, array('created_at', 'updated_at', 'fechado_em', 'faturamento_registrado_em'), true)) {
        return fin_br_datetime((string) $value);
    }

    if ($field === 'data_fechamento' || $field === 'data') {
        return br_date((string) $value);
    }

    return (string) $value;
}

function fin_audit_changes($beforeValue, $afterValue): array
{
    $before = fin_audit_decode($beforeValue);
    $after = fin_audit_decode($afterValue);
    $keys = array_values(array_unique(array_merge(array_keys($before), array_keys($after))));
    $ignored = array('user_agent');
    $changes = array();

    foreach ($keys as $key) {
        if (in_array($key, $ignored, true)) {
            continue;
        }

        $oldExists = array_key_exists($key, $before);
        $newExists = array_key_exists($key, $after);
        $oldRaw = $oldExists ? $before[$key] : null;
        $newRaw = $newExists ? $after[$key] : null;

        if (json_encode($oldRaw) === json_encode($newRaw)) {
            continue;
        }

        if (!$oldExists && ($newRaw === null || $newRaw === '')) {
            continue;
        }

        $changes[] = array(
            'label' => fin_audit_field_label((string) $key),
            'before' => fin_audit_value((string) $key, $oldRaw),
            'after' => fin_audit_value((string) $key, $newRaw),
        );
    }

    return $changes;
}

function fin_audit_summary(array $row, array $changes): string
{
    $base = fin_audit_action_label((string) ($row['acao'] ?? 'acao'))
        . ' em ' . fin_audit_record_label((string) ($row['tabela_afetada'] ?? ''), $row['registro_id'] ?? '');

    if (!$changes) {
        return $base . '. Registro salvo sem mudanca visual relevante nos campos principais.';
    }

    $labels = array_slice(array_column($changes, 'label'), 0, 4);

    return $base . ': ' . implode(', ', $labels) . (count($changes) > 4 ? ' e mais.' : '.');
}

function fin_fetch_entries(string $table, int $closingId): array
{
    $allowed = array('financeiro_sangrias', 'financeiro_maquininhas', 'financeiro_pix');

    if (!in_array($table, $allowed, true)) {
        return array();
    }

    $stmt = db()->prepare('SELECT * FROM ' . $table . ' WHERE fechamento_id = ? ORDER BY created_at DESC, id DESC');
    $stmt->execute(array($closingId));

    return $stmt->fetchAll();
}

function fin_year_summary(int $year): array
{
    $stmt = db()->prepare(
        'SELECT MONTH(data_fechamento) AS mes,
                COUNT(*) AS dias,
                COALESCE(SUM(total_conferido), 0) AS total,
                COALESCE(SUM(sobra_falta), 0) AS diferenca,
                COALESCE(SUM(CASE WHEN status = "divergente" THEN 1 ELSE 0 END), 0) AS divergentes,
                COALESCE(SUM(CASE WHEN status IN ("fechado", "divergente") THEN 1 ELSE 0 END), 0) AS fechados
         FROM financeiro_fechamentos
         WHERE YEAR(data_fechamento) = ?
         GROUP BY MONTH(data_fechamento)'
    );
    $stmt->execute(array($year));
    $rows = array();

    foreach ($stmt->fetchAll() as $row) {
        $rows[(int) $row['mes']] = $row;
    }

    return $rows;
}

function fin_month_totals(array $closings): array
{
    $totals = array(
        'total' => 0.0,
        'cartao' => 0.0,
        'pix_banco' => 0.0,
        'pix_maquininha' => 0.0,
        'sangrias' => 0.0,
        'diferenca' => 0.0,
        'divergentes' => 0,
    );

    foreach ($closings as $closing) {
        $totals['total'] += (float) ($closing['total_conferido'] ?? 0);
        $totals['cartao'] += (float) ($closing['cartao_total'] ?? 0);
        $totals['pix_banco'] += (float) ($closing['pix_banco_total'] ?? 0);
        $totals['pix_maquininha'] += (float) ($closing['pix_maquininha_total'] ?? 0);
        $totals['sangrias'] += (float) ($closing['sangria_total'] ?? 0);
        $totals['diferenca'] += (float) ($closing['sobra_falta'] ?? 0);

        if (($closing['status'] ?? '') === 'divergente') {
            $totals['divergentes']++;
        }
    }

    return $totals;
}

function fin_report_month_totals(array $closings, array $days): array
{
    $totals = array(
        'dias_mes' => count($days),
        'dias_registrados' => 0,
        'fechados' => 0,
        'divergentes' => 0,
        'total_lancado' => 0.0,
        'total_sistema' => 0.0,
        'faturamento_dia' => 0.0,
        'faturamento_registros' => 0,
        'ultimo_faturamento_em' => '',
        'sobra_falta' => 0.0,
        'maior_sobra' => 0.0,
        'maior_falta' => 0.0,
    );

    foreach ($closings as $closing) {
        $totals['dias_registrados']++;
        $status = (string) ($closing['status'] ?? 'aberto');
        $diff = (float) ($closing['sobra_falta'] ?? 0);

        $totals['total_lancado'] += (float) ($closing['total_conferido'] ?? 0);
        $totals['total_sistema'] += (float) ($closing['abertura_sistema'] ?? 0);
        $totals['faturamento_dia'] += (float) ($closing['faturamento_dia'] ?? 0);
        $totals['sobra_falta'] += $diff;

        if ((float) ($closing['faturamento_dia'] ?? 0) > 0.009) {
            $totals['faturamento_registros']++;
        }

        if (!empty($closing['faturamento_registrado_em'])) {
            $registeredAt = strtotime((string) $closing['faturamento_registrado_em']);
            $latestAt = $totals['ultimo_faturamento_em'] !== '' ? strtotime((string) $totals['ultimo_faturamento_em']) : 0;

            if ($registeredAt && $registeredAt > $latestAt) {
                $totals['ultimo_faturamento_em'] = (string) $closing['faturamento_registrado_em'];
            }
        }

        if (in_array($status, array('fechado', 'divergente', 'sem_movimento'), true)) {
            $totals['fechados']++;
        }

        if ($status === 'divergente') {
            $totals['divergentes']++;
        }

        if ($diff > $totals['maior_sobra']) {
            $totals['maior_sobra'] = $diff;
        }

        if ($diff < $totals['maior_falta']) {
            $totals['maior_falta'] = $diff;
        }
    }

    return $totals;
}

function fin_remove_entry(string $table, int $id, string $statusColumn, int $year, int $month, string $date): void
{
    $allowed = array(
        'financeiro_sangrias' => 'status',
        'financeiro_maquininhas' => 'status_conciliacao',
        'financeiro_pix' => 'status',
    );

    if (($allowed[$table] ?? '') !== $statusColumn) {
        throw new RuntimeException('Tabela financeira invalida.');
    }

    $stmt = db()->prepare('SELECT * FROM ' . $table . ' WHERE id = ? LIMIT 1');
    $stmt->execute(array($id));
    $entry = $stmt->fetch();

    if (!$entry) {
        throw new RuntimeException('Lancamento nao encontrado.');
    }

    $closing = financeiro_fetch_by_id((int) $entry['fechamento_id']);

    if (!$closing || financeiro_is_locked($closing)) {
        throw new RuntimeException('Este dia esta fechado. Reabra para remover lancamentos.');
    }

    $before = $entry;
    $update = db()->prepare('UPDATE ' . $table . ' SET ' . $statusColumn . ' = "cancelado" WHERE id = ?');
    $update->execute(array($id));
    financeiro_recalculate((int) $entry['fechamento_id']);
    financeiro_audit('cancelar_lancamento', $table, $id, $before, array('status' => 'cancelado'));
    set_flash('success', 'Lancamento removido da conferencia.');
    fin_redirect($year, $month, $date, 'dia');
}

[$year, $month, $date] = fin_selected_context();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postDate = financeiro_valid_date($_POST['data_fechamento'] ?? $date, $date);
    $postYear = (int) date('Y', strtotime($postDate));
    $postMonth = (int) date('n', strtotime($postDate));

    try {
        fin_verify_csrf();
        $action = (string) ($_POST['action'] ?? '');

        if ($action === 'save_report_faturamento_auto') {
            $reportPostYear = max(2026, min(2028, (int) ($_POST['rel_ano'] ?? $postYear)));
            $reportPostMonth = max(1, min(12, (int) ($_POST['rel_mes'] ?? $postMonth)));
            $entryDate = financeiro_valid_date($_POST['entry_date'] ?? '', '');

            if ($entryDate === '') {
                throw new RuntimeException('Dia invalido para salvar faturamento.');
            }

            if ((int) date('Y', strtotime($entryDate)) !== $reportPostYear || (int) date('n', strtotime($entryDate)) !== $reportPostMonth) {
                throw new RuntimeException('Dia fora do mes selecionado.');
            }

            $rawValue = trim((string) ($_POST['valor'] ?? ''));
            $value = $rawValue === '' ? 0.0 : fin_money_value($rawValue);
            financeiro_save_faturamento_dia($entryDate, $value, (int) ($_SESSION['user_id'] ?? 0), 'relatorio_auto');

            if (fin_is_ajax()) {
                $monthRows = financeiro_month_closings($reportPostMonth, $reportPostYear);
                $monthTotals = fin_report_month_totals($monthRows, financeiro_month_days($reportPostMonth, $reportPostYear));
                fin_json(array(
                    'ok' => true,
                    'message' => 'Faturamento salvo automaticamente.',
                    'entry_date' => $entryDate,
                    'valor' => br_money($value),
                    'total_faturamento' => br_money((float) $monthTotals['faturamento_dia']),
                    'registros' => (int) $monthTotals['faturamento_registros'],
                ));
            }

            set_flash('success', 'Faturamento salvo automaticamente.');
            header('Location: ' . fin_url(array('view' => 'relatorio', 'rel_ano' => $reportPostYear, 'rel_mes' => $reportPostMonth), 'faturamento-diario'));
            exit;
        }

        if ($action === 'close_report_empty_day') {
            $reportPostYear = max(2026, min(2028, (int) ($_POST['rel_ano'] ?? $postYear)));
            $reportPostMonth = max(1, min(12, (int) ($_POST['rel_mes'] ?? $postMonth)));
            $entryDate = financeiro_valid_date($_POST['entry_date'] ?? '', '');

            if ($entryDate === '') {
                throw new RuntimeException('Dia invalido para fechar sem movimento.');
            }

            if ((int) date('Y', strtotime($entryDate)) !== $reportPostYear || (int) date('n', strtotime($entryDate)) !== $reportPostMonth) {
                throw new RuntimeException('Dia fora do mes selecionado.');
            }

            $closing = financeiro_get_or_create_closing($entryDate);
            if (financeiro_is_locked($closing) && (string) ($closing['status'] ?? '') !== 'sem_movimento') {
                throw new RuntimeException('Este dia ja esta fechado.');
            }

            $note = 'Sem movimento.';
            financeiro_update_manual_closing((int) $closing['id'], array(
                'responsavel_id' => !empty($closing['responsavel_id']) ? (int) $closing['responsavel_id'] : null,
                'responsavel_texto' => trim((string) ($closing['responsavel_texto'] ?? '')),
                'caixa_fisico' => 0,
                'cartao_total' => 0,
                'pix_banco_total' => 0,
                'pix_maquininha_total' => 0,
                'pix_correto_manual' => null,
                'pix_correto_justificativa' => '',
                'sangria_total' => 0,
                'retirada_caixa' => 0,
                'abertura_sistema' => 0,
                'faturamento_dia' => 0,
                'ajustes' => 0,
                'justificativa' => $note,
                'observacao' => '',
            ));
            $after = fin_close_day((int) $closing['id'], 'sem_movimento');

            if (fin_is_ajax()) {
                fin_json(array(
                    'ok' => true,
                    'message' => 'Dia fechado sem movimento.',
                    'entry_date' => $entryDate,
                    'status' => financeiro_status_label((string) ($after['status'] ?? 'sem_movimento')),
                    'fechado_em' => !empty($after['fechado_em']) ? fin_entry_datetime((string) $after['fechado_em']) : '',
                    'responsavel' => trim((string) ($after['responsavel_nome'] ?? '')),
                ));
            }

            set_flash('success', 'Dia fechado sem movimento.');
            header('Location: ' . fin_url(array('view' => 'relatorio', 'rel_ano' => $reportPostYear, 'rel_mes' => $reportPostMonth), 'faturamento-diario'));
            exit;
        }

        if ($action === 'save_report_faturamento') {
            $reportPostYear = max(2026, min(2028, (int) ($_POST['rel_ano'] ?? $postYear)));
            $reportPostMonth = max(1, min(12, (int) ($_POST['rel_mes'] ?? $postMonth)));
            $saved = 0;
            $emptyDays = is_array($_POST['sem_movimento'] ?? null) ? $_POST['sem_movimento'] : array();

            $postedValues = is_array($_POST['faturamento'] ?? null) ? $_POST['faturamento'] : array();
            foreach ($postedValues as $entryDate => $entryValue) {
                $entryDate = financeiro_valid_date($entryDate, '');
                if ($entryDate === '') {
                    continue;
                }

                if (isset($emptyDays[$entryDate])) {
                    continue;
                }

                $existing = financeiro_fetch_by_date($entryDate);
                $raw = trim((string) $entryValue);
                if ($raw === '' && !$existing) {
                    continue;
                }

                financeiro_save_faturamento_dia($entryDate, fin_money_value($entryValue), (int) ($_SESSION['user_id'] ?? 0), 'relatorio');
                $saved++;
            }

            foreach ($emptyDays as $entryDate => $enabled) {
                $entryDate = financeiro_valid_date((string) $entryDate, '');
                if ($entryDate === '') {
                    continue;
                }

                if ((int) date('Y', strtotime($entryDate)) !== $reportPostYear || (int) date('n', strtotime($entryDate)) !== $reportPostMonth) {
                    continue;
                }

                $closing = financeiro_get_or_create_closing($entryDate);
                if (financeiro_is_locked($closing)) {
                    continue;
                }

                $note = 'Sem movimento.';

                financeiro_update_manual_closing((int) $closing['id'], array(
                    'responsavel_id' => !empty($closing['responsavel_id']) ? (int) $closing['responsavel_id'] : null,
                    'responsavel_texto' => trim((string) ($closing['responsavel_texto'] ?? '')),
                    'caixa_fisico' => 0,
                    'cartao_total' => 0,
                    'pix_banco_total' => 0,
                    'pix_maquininha_total' => 0,
                    'pix_correto_manual' => null,
                    'pix_correto_justificativa' => '',
                    'sangria_total' => 0,
                    'retirada_caixa' => 0,
                    'abertura_sistema' => 0,
                    'faturamento_dia' => 0,
                    'ajustes' => 0,
                    'justificativa' => $note,
                    'observacao' => '',
                ));
                fin_close_day((int) $closing['id'], 'sem_movimento');
                $saved++;
            }

            $textEntries = fin_parse_faturamento_text((string) ($_POST['faturamento_texto'] ?? ''), $reportPostYear, $reportPostMonth);
            foreach ($textEntries as $entryDate => $entryValue) {
                financeiro_save_faturamento_dia($entryDate, (float) $entryValue, (int) ($_SESSION['user_id'] ?? 0), 'relatorio_texto');
                $saved++;
            }

            set_flash('success', $saved > 0 ? $saved . ' faturamento(s) salvo(s).' : 'Nenhum faturamento novo para salvar.');
            header('Location: ' . fin_url(array('view' => 'relatorio', 'rel_ano' => $reportPostYear, 'rel_mes' => $reportPostMonth), 'faturamento-diario'));
            exit;
        }

        if ($action === 'save_day' || $action === 'close_day') {
            $closing = financeiro_get_or_create_closing($postDate);
            $updated = financeiro_update_manual_closing((int) $closing['id'], fin_closing_data_from_post());

            if ($action === 'save_day' && fin_is_ajax()) {
                fin_json(array(
                    'ok' => true,
                    'message' => 'Salvo automaticamente.',
                    'total_conferido' => br_money((float) $updated['total_conferido']),
                    'total_sistema' => br_money((float) $updated['abertura_sistema']),
                    'faturamento_registrado_em' => !empty($updated['faturamento_registrado_em']) ? fin_entry_datetime((string) $updated['faturamento_registrado_em']) : '',
                    'sobra_falta' => br_money((float) $updated['sobra_falta']),
                    'sobra_falta_raw' => (float) $updated['sobra_falta'],
                    'sobra_falta_class' => financeiro_diff_class((float) $updated['sobra_falta']),
                    'status' => financeiro_status_label((string) $updated['status']),
                ));
            }

            if ($action === 'close_day') {
                $limit = financeiro_divergence_limit();
                $status = abs((float) $updated['sobra_falta']) > $limit ? 'divergente' : 'fechado';
                fin_close_day((int) $closing['id'], $status);
                set_flash('success', $status === 'divergente' ? 'Dia fechado como divergente.' : 'Dia fechado com sucesso.');
            } else {
                set_flash('success', 'Fechamento salvo como rascunho.');
            }

            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'close_empty') {
            $closing = financeiro_get_or_create_closing($postDate);

            if (financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia ja esta fechado.');
            }

            $emptyObservation = trim((string) ($_POST['observacao_sem_movimento'] ?? ''));
            if ($emptyObservation === '') {
                $emptyObservation = 'Sem movimento.';
            }

            $data = array(
                'responsavel_id' => fin_int_or_null('responsavel_id'),
                'responsavel_texto' => trim((string) ($_POST['responsavel_texto'] ?? '')),
                'caixa_fisico' => 0,
                'cartao_total' => 0,
                'pix_banco_total' => 0,
                'pix_maquininha_total' => 0,
                'pix_correto_manual' => null,
                'pix_correto_justificativa' => '',
                'sangria_total' => 0,
                'retirada_caixa' => 0,
                'abertura_sistema' => 0,
                'faturamento_dia' => 0,
                'ajustes' => 0,
                'justificativa' => $emptyObservation,
                'observacao' => $emptyObservation,
            );
            financeiro_update_manual_closing((int) $closing['id'], $data);
            fin_close_day((int) $closing['id'], 'sem_movimento');
            set_flash('success', 'Dia fechado sem movimento.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'add_lancamento') {
            $closing = financeiro_get_or_create_closing($postDate);

            if (financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia esta fechado. Reabra para adicionar lancamentos.');
            }

            $category = trim((string) ($_POST['categoria'] ?? ''));

            financeiro_add_lancamento(
                (int) $closing['id'],
                $postDate,
                $category,
                fin_money('valor'),
                trim((string) ($_POST['observacao'] ?? ''))
            );
            set_flash('success', 'Lancamento adicionado.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'cancel_lancamento') {
            $closing = financeiro_fetch_by_date($postDate);

            if (!$closing || financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia esta fechado. Reabra para remover lancamentos.');
            }

            $id = (int) ($_POST['id'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM financeiro_lancamentos WHERE id = ? AND fechamento_id = ? LIMIT 1');
            $stmt->execute(array($id, (int) $closing['id']));
            $entry = $stmt->fetch();

            if (!$entry) {
                throw new RuntimeException('Lancamento nao encontrado.');
            }

            $update = db()->prepare('UPDATE financeiro_lancamentos SET status = "cancelado" WHERE id = ?');
            $update->execute(array($id));
            $after = $entry;
            $after['status'] = 'cancelado';
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('cancelar_lancamento', 'financeiro_lancamentos', $id, $entry, $after);
            set_flash('success', 'Lancamento removido.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'reopen_day') {
            if (($user['role'] ?? '') !== 'admin') {
                throw new RuntimeException('Apenas admin pode reabrir um dia fechado.');
            }

            if ((string) ($_POST['senha_reabertura'] ?? '') !== 'wimifarma') {
                throw new RuntimeException('Senha de reabertura incorreta.');
            }

            $closing = financeiro_fetch_by_date($postDate);

            if (!$closing) {
                throw new RuntimeException('Dia financeiro nao encontrado.');
            }

            $before = $closing;
            $stmt = db()->prepare('UPDATE financeiro_fechamentos SET status = "conferencia", fechado_em = NULL, fechado_por = NULL WHERE id = ?');
            $stmt->execute(array((int) $closing['id']));
            financeiro_audit('reabrir_fechamento', 'financeiro_fechamentos', (int) $closing['id'], $before, financeiro_fetch_by_id((int) $closing['id']));
            set_flash('success', 'Dia reaberto para ajustes.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'save_sangria') {
            $closing = financeiro_get_or_create_closing($postDate);

            if (financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia esta fechado. Reabra para lancar sangria.');
            }

            $valor = fin_money('valor');

            if ($valor <= 0) {
                throw new RuntimeException('Informe o valor da sangria.');
            }

            $stmt = db()->prepare(
                'INSERT INTO financeiro_sangrias
                    (fechamento_id, data, hora, valor, motivo, responsavel_id, autorizado_por, destino, observacao, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $postDate,
                date('H:i:s'),
                $valor,
                trim((string) ($_POST['motivo'] ?? 'Sangria')),
                fin_int_or_null('responsavel_id'),
                trim((string) ($_POST['autorizado_por'] ?? '')),
                trim((string) ($_POST['destino'] ?? '')),
                trim((string) ($_POST['observacao'] ?? '')),
                'lancado',
                (int) ($_SESSION['user_id'] ?? 0),
            ));
            $id = (int) db()->lastInsertId();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_sangria', 'financeiro_sangrias', $id, null, $_POST);
            set_flash('success', 'Sangria adicionada ao dia.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'cancel_sangria') {
            fin_remove_entry('financeiro_sangrias', (int) ($_POST['id'] ?? 0), 'status', $postYear, $postMonth, $postDate);
        }

        if ($action === 'save_maquininha') {
            $closing = financeiro_get_or_create_closing($postDate);

            if (financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia esta fechado. Reabra para lancar maquininha.');
            }

            $bruto = fin_money('valor_bruto');
            $taxa = fin_money('taxa');
            $liquido = trim((string) ($_POST['valor_liquido'] ?? '')) === '' ? max(0, $bruto - $taxa) : fin_money('valor_liquido');

            if ($bruto <= 0) {
                throw new RuntimeException('Informe o valor da maquininha.');
            }

            $stmt = db()->prepare(
                'INSERT INTO financeiro_maquininhas
                    (fechamento_id, data, operadora, tipo, valor_bruto, taxa, valor_liquido, bandeira, nsu, codigo_comprovante, horario, responsavel_id, observacao, status_conciliacao, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $postDate,
                trim((string) ($_POST['operadora'] ?? 'Outra')),
                (string) ($_POST['tipo'] ?? 'credito'),
                $bruto,
                $taxa,
                $liquido,
                trim((string) ($_POST['bandeira'] ?? '')),
                trim((string) ($_POST['nsu'] ?? '')),
                trim((string) ($_POST['codigo_comprovante'] ?? '')),
                date('H:i:s'),
                fin_int_or_null('responsavel_id'),
                trim((string) ($_POST['observacao'] ?? '')),
                'pendente',
                (int) ($_SESSION['user_id'] ?? 0),
            ));
            $id = (int) db()->lastInsertId();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_maquininha', 'financeiro_maquininhas', $id, null, $_POST);
            set_flash('success', 'Lancamento de maquininha adicionado.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'cancel_maquininha') {
            fin_remove_entry('financeiro_maquininhas', (int) ($_POST['id'] ?? 0), 'status_conciliacao', $postYear, $postMonth, $postDate);
        }

        if ($action === 'save_pix') {
            $closing = financeiro_get_or_create_closing($postDate);

            if (financeiro_is_locked($closing)) {
                throw new RuntimeException('Este dia esta fechado. Reabra para lancar PIX.');
            }

            $valor = fin_money('valor');

            if ($valor <= 0) {
                throw new RuntimeException('Informe o valor do PIX.');
            }

            $stmt = db()->prepare(
                'INSERT INTO financeiro_pix
                    (fechamento_id, data, tipo, valor, origem, responsavel_id, observacao, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $postDate,
                (string) ($_POST['tipo'] ?? 'banco'),
                $valor,
                trim((string) ($_POST['origem'] ?? '')),
                fin_int_or_null('responsavel_id'),
                trim((string) ($_POST['observacao'] ?? '')),
                'lancado',
                (int) ($_SESSION['user_id'] ?? 0),
            ));
            $id = (int) db()->lastInsertId();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_pix', 'financeiro_pix', $id, null, $_POST);
            set_flash('success', 'PIX adicionado ao dia.');
            fin_redirect($postYear, $postMonth, $postDate, 'dia');
        }

        if ($action === 'cancel_pix') {
            fin_remove_entry('financeiro_pix', (int) ($_POST['id'] ?? 0), 'status', $postYear, $postMonth, $postDate);
        }
    } catch (Throwable $error) {
        $publicMessage = financeiro_public_error($error);
        if (fin_is_ajax()) {
            fin_json(array('ok' => false, 'message' => $publicMessage), 422);
        }
        set_flash('error', $publicMessage);
        fin_redirect($postYear, $postMonth, $postDate, 'dia');
    }
}

$flash = get_flash();
$attendants = atendentes_options();
$yearSummary = fin_year_summary($year);
$monthClosings = financeiro_month_closings($month, $year);
$days = financeiro_month_days($month, $year);
$selectedClosing = financeiro_fetch_by_date($date) ?: fin_default_closing($date);
$selectedClosingId = (int) ($selectedClosing['id'] ?? 0);
$locked = $selectedClosingId > 0 && financeiro_is_locked($selectedClosing);
$monthTotals = fin_month_totals($monthClosings);
$sangrias = $selectedClosingId ? fin_fetch_entries('financeiro_sangrias', $selectedClosingId) : array();
$maquininhas = $selectedClosingId ? fin_fetch_entries('financeiro_maquininhas', $selectedClosingId) : array();
$pixEntries = $selectedClosingId ? fin_fetch_entries('financeiro_pix', $selectedClosingId) : array();
$lancamentos = $selectedClosingId ? financeiro_lancamentos_for_closing($selectedClosingId) : array();
$lancamentoCategorias = financeiro_lancamento_categorias_padrao();
$divergenceLimit = financeiro_divergence_limit();
$selectedDiff = (float) ($selectedClosing['sobra_falta'] ?? 0);
$showJustification = abs($selectedDiff) > $divergenceLimit;
$hasFreeObservation = trim((string) ($selectedClosing['observacao'] ?? '')) !== '';
$audit = db()->query(
    'SELECT a.*, u.username AS usuario_nome
     FROM financeiro_auditoria a
     LEFT JOIN wf_users u ON u.id = a.usuario_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 80'
)->fetchAll();
$months = array(1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Marco', 4 => 'Abril', 5 => 'Maio', 6 => 'Junho', 7 => 'Julho', 8 => 'Agosto', 9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro');
$view = fin_selected_view();
$fiscalYears = fin_fiscal_years();
$reportYear = max(min($fiscalYears), min(max($fiscalYears), (int) ($_GET['rel_ano'] ?? $year)));
$reportMonth = max(1, min(12, (int) ($_GET['rel_mes'] ?? $month)));
$reportYearSummary = fin_year_summary($reportYear);
$reportDays = financeiro_month_days($reportMonth, $reportYear);
$reportMonthClosings = financeiro_month_closings($reportMonth, $reportYear);
$reportTotals = fin_report_month_totals($reportMonthClosings, $reportDays);
$reportClosingsByDate = array();
foreach ($reportMonthClosings as $reportClosing) {
    $reportClosingsByDate[(string) $reportClosing['data_fechamento']] = $reportClosing;
}
$reportDivergences = financeiro_month_divergence_highlights($reportMonth, $reportYear, 6);
$pageTitle = $view === 'auditoria' ? 'Auditoria Financeira' : ($view === 'relatorio' ? 'Relatorio Financeiro' : 'Financeiro');
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo e($pageTitle); ?> - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/financeiro/favicon.svg">
    <link rel="alternate icon" href="/financeiro/favicon.png">
    <link rel="stylesheet" href="/financeiro/styles.css?v=20260507a">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260515f">
    <script src="/financeiro/app.js?v=20260507a" defer></script>
    <script src="/miauw/widget.js?v=20260515f" defer></script>
</head>
<body>
<header class="finance-topbar">
    <a class="finance-brand" href="/">
        <img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma">
        <span>Financeiro</span>
    </a>
    <nav class="finance-nav" aria-label="Navegacao financeira">
        <a class="<?php echo $view === 'caixa' ? 'active' : ''; ?>" href="/financeiro/">Caixa</a>
        <a class="<?php echo $view === 'relatorio' ? 'active' : ''; ?>" href="<?php echo e(fin_url(array('view' => 'relatorio', 'rel_ano' => $reportYear, 'rel_mes' => $reportMonth))); ?>">Relatorio</a>
        <a href="/financeiro/logout.php">Sair</a>
    </nav>
</header>

<main class="finance-shell">
    <section class="finance-hero">
        <div>
            <?php if ($view === 'auditoria') : ?>
                <span class="kicker">Operacao real financeiro</span>
                <h1>Auditoria financeira</h1>
                <p>Registro detalhado de criacoes, alteracoes, fechamentos e reaberturas do caixa.</p>
            <?php elseif ($view === 'relatorio') : ?>
                <h1>Relatorio financeiro</h1>
            <?php else : ?>
                <h1>Fechamento de caixa</h1>
            <?php endif; ?>
        </div>
        <div class="user-pill">Usuario: <?php echo e((string) $user['username']); ?></div>
    </section>

    <?php if (!empty($flash['message'])) : ?>
        <div class="notice <?php echo e((string) $flash['type']); ?>"><?php echo e((string) $flash['message']); ?></div>
    <?php endif; ?>

    <?php if ($view === 'auditoria') : ?>
        <section class="finance-card audit-card">
            <div class="section-head">
                <div>
                    <span class="kicker">Log do sistema</span>
                    <h2>Ultimas alteracoes registradas</h2>
                </div>
                <div class="soft-pill"><?php echo e((string) count($audit)); ?> registro(s) exibidos</div>
            </div>
            <div class="audit-table-wrap">
                <table class="audit-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Usuario</th>
                            <th>Acao</th>
                            <th>Registro</th>
                            <th>IP</th>
                            <th>Detalhes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($audit as $row) : ?>
                            <?php
                            $auditChanges = fin_audit_changes($row['valor_anterior'] ?? null, $row['valor_novo'] ?? null);
                            $auditSummary = fin_audit_summary($row, $auditChanges);
                            ?>
                            <tr>
                                <td class="audit-date-cell">
                                    <strong><?php echo e(fin_br_datetime((string) ($row['created_at'] ?? ''))); ?></strong>
                                </td>
                                <td><?php echo e((string) ($row['usuario_nome'] ?? $row['usuario_id'] ?? '-')); ?></td>
                                <td>
                                    <strong class="audit-action-name"><?php echo e(fin_audit_action_label((string) $row['acao'])); ?></strong>
                                    <small><?php echo e((string) $row['acao']); ?></small>
                                </td>
                                <td><?php echo e(fin_audit_record_label((string) $row['tabela_afetada'], $row['registro_id'] ?? null)); ?></td>
                                <td><?php echo e((string) ($row['ip'] ?? '-')); ?></td>
                                <td>
                                    <div class="audit-readable"><?php echo e($auditSummary); ?></div>
                                    <details class="audit-details">
                                        <summary>Ver campos</summary>
                                        <?php if ($auditChanges) : ?>
                                            <div class="audit-change-list">
                                                <?php foreach ($auditChanges as $change) : ?>
                                                    <div class="audit-change-item">
                                                        <span><?php echo e((string) $change['label']); ?></span>
                                                        <div>
                                                            <small>Antes</small>
                                                            <strong><?php echo e((string) $change['before']); ?></strong>
                                                        </div>
                                                        <div>
                                                            <small>Depois</small>
                                                            <strong><?php echo e((string) $change['after']); ?></strong>
                                                        </div>
                                                    </div>
                                                <?php endforeach; ?>
                                            </div>
                                        <?php else : ?>
                                            <p class="audit-empty-change">Nenhuma diferenca relevante detectada entre antes e depois.</p>
                                        <?php endif; ?>
                                        <details class="audit-raw">
                                            <summary>Ver bruto tecnico</summary>
                                            <strong>Antes</strong>
                                            <pre><?php echo e(fin_json_preview($row['valor_anterior'] ?? null)); ?></pre>
                                            <strong>Depois</strong>
                                            <pre><?php echo e(fin_json_preview($row['valor_novo'] ?? null)); ?></pre>
                                        </details>
                                        <?php if (!empty($row['user_agent'])) : ?>
                                            <small><?php echo e((string) $row['user_agent']); ?></small>
                                        <?php endif; ?>
                                    </details>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (!$audit) : ?>
                            <tr>
                                <td colspan="6">Nenhuma alteracao registrada ainda.</td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
    <?php elseif ($view === 'relatorio') : ?>

        <section class="finance-card report-card">
            <div class="section-head">
                <div>
                    <span class="kicker">Relatorio</span>
                    <h2>Ano <?php echo e((string) $reportYear); ?></h2>
                </div>
                <div class="soft-pill"><?php echo e($months[$reportMonth]); ?> / <?php echo e((string) $reportYear); ?></div>
            </div>

            <div class="report-year-grid">
                <?php foreach ($fiscalYears as $fiscalYear) : ?>
                    <a class="report-year-card <?php echo $fiscalYear === $reportYear ? 'active' : ''; ?>" href="<?php echo e(fin_url(array('view' => 'relatorio', 'rel_ano' => $fiscalYear, 'rel_mes' => $reportMonth))); ?>">
                        <span>Ano</span>
                        <strong><?php echo e((string) $fiscalYear); ?></strong>
                    </a>
                <?php endforeach; ?>
            </div>

            <div class="report-month-grid">
                <?php foreach ($months as $number => $name) : ?>
                    <?php $summary = $reportYearSummary[$number] ?? array('dias' => 0, 'total' => 0, 'diferenca' => 0, 'divergentes' => 0, 'fechados' => 0); ?>
                    <a class="report-month-card <?php echo $number === $reportMonth ? 'active' : ''; ?>" href="<?php echo e(fin_url(array('view' => 'relatorio', 'rel_ano' => $reportYear, 'rel_mes' => $number))); ?>">
                        <span><?php echo e(sprintf('%02d/%04d', $number, $reportYear)); ?></span>
                        <strong><?php echo e($name); ?></strong>
                        <small><?php echo e((string) (int) $summary['fechados']); ?> fechado(s)</small>
                    </a>
                <?php endforeach; ?>
            </div>
        </section>

        <section id="faturamento-diario" class="finance-card daily-revenue-card">
            <div class="section-head">
                <div>
                    <span class="kicker">Faturamento diario</span>
                    <h2>Dias de <?php echo e($months[$reportMonth]); ?></h2>
                </div>
                <div class="soft-pill"><?php echo e((string) (int) $reportTotals['faturamento_registros']); ?> lancado(s)</div>
            </div>

            <form method="post" class="daily-revenue-form" data-daily-revenue-form data-report-year="<?php echo e((string) $reportYear); ?>" data-report-month="<?php echo e((string) $reportMonth); ?>" data-no-enter-submit>
                <input type="hidden" name="csrf_token" value="<?php echo e(csrf_token()); ?>">
                <input type="hidden" name="action" value="save_report_faturamento">
                <input type="hidden" name="rel_ano" value="<?php echo e((string) $reportYear); ?>">
                <input type="hidden" name="rel_mes" value="<?php echo e((string) $reportMonth); ?>">
                <input type="hidden" name="data_fechamento" value="<?php echo e(sprintf('%04d-%02d-01', $reportYear, $reportMonth)); ?>">

                <div class="daily-revenue-layout">
                    <div class="daily-revenue-table-wrap">
                        <table class="daily-revenue-table">
                            <thead>
                                <tr>
                                    <th>Dia</th>
                                    <th>Status</th>
                                    <th>Faturamento</th>
                                    <th>Movimento</th>
                                    <th>Responsavel</th>
                                    <th>Sobra/Falta</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($reportDays as $dayDate) : ?>
                                    <?php
                                    $dayClosing = $reportClosingsByDate[$dayDate] ?? array();
                                    $dayRevenue = (float) ($dayClosing['faturamento_dia'] ?? 0);
                                    $dayDiff = (float) ($dayClosing['sobra_falta'] ?? 0);
                                    $dayStatus = (string) ($dayClosing['status'] ?? 'sem registro');
                                    $isSunday = date('w', strtotime($dayDate)) === '0';
                                    $isEmptyClose = $dayStatus === 'sem_movimento';
                                    $dayLocked = $dayClosing ? financeiro_is_locked($dayClosing) : false;
                                    $closedBy = trim((string) ($dayClosing['responsavel_nome'] ?? ''));
                                    if ($closedBy === '' && trim((string) ($dayClosing['responsavel_texto'] ?? '')) !== '') {
                                        $closedBy = trim((string) $dayClosing['responsavel_texto']);
                                    }
                                    $closedAt = !empty($dayClosing['fechado_em']) ? fin_entry_datetime((string) $dayClosing['fechado_em']) : '';
                                    ?>
                                    <tr class="<?php echo $isSunday ? 'is-sunday' : ''; ?> <?php echo $isEmptyClose ? 'is-empty-movement-selected' : ''; ?>">
                                        <td>
                                            <strong><?php echo e(date('d/m', strtotime($dayDate))); ?></strong>
                                            <small><?php echo e(fin_weekday_label($dayDate)); ?></small>
                                        </td>
                                        <td><span class="status-dot status-<?php echo e(preg_replace('/[^a-z0-9_-]/i', '-', $dayStatus)); ?>"><?php echo e($dayStatus); ?></span></td>
                                        <td>
                                            <input
                                                type="text"
                                                name="faturamento[<?php echo e($dayDate); ?>]"
                                                value="<?php echo $dayRevenue > 0.009 ? e(number_format($dayRevenue, 2, ',', '.')) : ''; ?>"
                                                inputmode="decimal"
                                                placeholder="0,00"
                                                data-revenue-date="<?php echo e($dayDate); ?>"
                                                data-daily-revenue-input
                                                <?php echo $isEmptyClose ? 'disabled' : ''; ?>>
                                        </td>
                                        <td>
                                            <button
                                                class="empty-day-button"
                                                type="button"
                                                data-empty-day="<?php echo e($dayDate); ?>"
                                                <?php echo $dayLocked ? 'disabled' : ''; ?>>
                                                <?php echo $isEmptyClose ? 'Sem movimento' : 'Fechar sem mov.'; ?>
                                            </button>
                                        </td>
                                        <td class="closed-by-cell">
                                            <strong><?php echo e($closedBy !== '' ? $closedBy : '-'); ?></strong>
                                            <small><?php echo e($closedAt !== '' ? $closedAt : '-'); ?></small>
                                        </td>
                                        <td><span class="<?php echo e(financeiro_diff_class($dayDiff)); ?>"><?php echo e(br_money($dayDiff)); ?></span></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>

                    <div class="daily-revenue-actions">
                        <div class="daily-revenue-total" data-daily-revenue-total>
                            Total digitado: <?php echo e(br_money((float) $reportTotals['faturamento_dia'])); ?>
                        </div>
                        <div class="daily-revenue-save-state" data-daily-revenue-save-state>Salva automatico ao sair do campo.</div>
                    </div>
                </div>
            </form>
            <div class="finance-dialog" data-empty-confirm hidden>
                <div class="finance-dialog-card" role="dialog" aria-modal="true" aria-labelledby="empty-confirm-title">
                    <span class="kicker">Fechar sem movimento</span>
                    <h3 id="empty-confirm-title">Confirmar dia sem movimento?</h3>
                    <p data-empty-confirm-date>Dia selecionado</p>
                    <div class="finance-dialog-actions">
                        <button class="btn ghost" type="button" data-empty-cancel>Nao</button>
                        <button class="btn primary" type="button" data-empty-confirm-yes>Sim, fechar</button>
                    </div>
                </div>
            </div>
        </section>

        <section class="finance-card report-detail-card">
            <div class="section-head">
                <div>
                    <span class="kicker">Resumo do mes</span>
                    <h2><?php echo e($months[$reportMonth]); ?> / <?php echo e((string) $reportYear); ?></h2>
                </div>
                <div class="soft-pill"><?php echo e((string) $reportTotals['dias_registrados']); ?> dia(s) com registro</div>
            </div>

            <div class="finance-metrics compact report-metrics">
                <div><span>Total lancado</span><strong><?php echo e(br_money((float) $reportTotals['total_lancado'])); ?></strong></div>
                <div><span>Total Sistema</span><strong><?php echo e(br_money((float) $reportTotals['total_sistema'])); ?></strong></div>
                <div><span>Faturamento</span><strong><?php echo e(br_money((float) $reportTotals['faturamento_dia'])); ?></strong></div>
                <div><span>Sobra/Falta</span><strong class="<?php echo e(financeiro_diff_class((float) $reportTotals['sobra_falta'])); ?>"><?php echo e(br_money((float) $reportTotals['sobra_falta'])); ?></strong></div>
                <div><span>Divergencias</span><strong><?php echo e((string) (int) $reportTotals['divergentes']); ?></strong></div>
            </div>

            <div class="report-general-grid">
                <div>
                    <span>Dias do mes</span>
                    <strong><?php echo e((string) (int) $reportTotals['dias_mes']); ?></strong>
                </div>
                <div>
                    <span>Dias fechados</span>
                    <strong><?php echo e((string) (int) $reportTotals['fechados']); ?></strong>
                </div>
                <div>
                    <span>Faturamentos lancados</span>
                    <strong><?php echo e((string) (int) $reportTotals['faturamento_registros']); ?></strong>
                </div>
                <div>
                    <span>Maior sobra</span>
                    <strong class="is-positive"><?php echo e(br_money((float) $reportTotals['maior_sobra'])); ?></strong>
                </div>
                <div>
                    <span>Maior falta</span>
                    <strong class="is-negative"><?php echo e(br_money((float) $reportTotals['maior_falta'])); ?></strong>
                </div>
            </div>

            <div class="divergence-highlights">
                <div class="section-head mini">
                    <div>
                        <span class="kicker">Maiores divergencias</span>
                        <h3>Com justificativas</h3>
                    </div>
                </div>
                <?php if ($reportDivergences) : ?>
                    <div class="divergence-highlight-list">
                        <?php foreach ($reportDivergences as $divergence) : ?>
                            <?php $diff = (float) ($divergence['sobra_falta'] ?? 0); ?>
                            <article>
                                <strong><?php echo e(date('d/m/Y', strtotime((string) $divergence['data_fechamento']))); ?> - <span class="<?php echo e(financeiro_diff_class($diff)); ?>"><?php echo e(br_money($diff)); ?></span></strong>
                                <p><?php echo e(trim((string) ($divergence['justificativa'] ?? '')) !== '' ? (string) $divergence['justificativa'] : 'Sem justificativa registrada.'); ?></p>
                                <?php if (trim((string) ($divergence['observacao'] ?? '')) !== '') : ?>
                                    <p class="divergence-observation">Obs.: <?php echo e((string) $divergence['observacao']); ?></p>
                                <?php endif; ?>
                            </article>
                        <?php endforeach; ?>
                    </div>
                <?php else : ?>
                    <p class="empty-state">Nenhuma divergencia registrada nesse mes.</p>
                <?php endif; ?>
            </div>
        </section>

    <?php else : ?>

    <div class="fiscal-overview">
        <details class="finance-card year-card collapsed-picker">
            <summary>
                <div>
                    <span class="kicker">Mes fiscal</span>
                    <h2><?php echo e((string) $year); ?> / <?php echo e($months[$month]); ?></h2>
                </div>
                <div class="year-actions">
                    <?php foreach ($fiscalYears as $fiscalYear) : ?>
                        <a class="btn <?php echo $fiscalYear === $year ? 'primary' : 'secondary'; ?>" href="<?php echo e(fin_url(array('ano' => $fiscalYear, 'mes' => $month, 'data' => fin_default_date_for_month($fiscalYear, $month)), 'calendario')); ?>"><?php echo e((string) $fiscalYear); ?></a>
                    <?php endforeach; ?>
                </div>
            </summary>
            <div class="month-grid">
                <?php foreach ($months as $number => $name) : ?>
                    <?php $summary = $yearSummary[$number] ?? array('dias' => 0, 'total' => 0, 'diferenca' => 0, 'divergentes' => 0, 'fechados' => 0); ?>
                    <a class="month-card <?php echo $number === $month ? 'active' : ''; ?>" href="<?php echo e(fin_url(array('ano' => $year, 'mes' => $number, 'data' => fin_default_date_for_month($year, $number)), 'calendario')); ?>">
                        <span><?php echo e(sprintf('%02d/%04d', $number, $year)); ?></span>
                        <strong><?php echo e($name); ?></strong>
                        <small><?php echo e((string) (int) $summary['fechados']); ?> fechado(s) | <?php echo e(br_money((float) $summary['total'])); ?></small>
                    </a>
                <?php endforeach; ?>
            </div>
        </details>

        <details id="calendario" class="finance-card day-board collapsed-picker">
            <summary>
                <div>
                    <span class="kicker">Dias de <?php echo e($months[$month]); ?></span>
                    <h2><?php echo e(br_date($date)); ?></h2>
                </div>
                <div class="soft-pill"><?php echo e((string) count($days)); ?> dias no mes</div>
            </summary>
            <div class="day-grid">
                <?php foreach ($days as $day) : ?>
                    <?php
                    $closing = $monthClosings[$day] ?? null;
                    $status = $closing['status'] ?? 'aberto';
                    $diff = (float) ($closing['sobra_falta'] ?? 0);
                    $isSunday = date('w', strtotime($day)) === '0';
                    $classes = array('day-cell', 'status-' . preg_replace('/[^a-z0-9_-]+/i', '', (string) $status));
                    if ($isSunday) {
                        $classes[] = 'is-sunday';
                    }
                    if ($day === $date) {
                        $classes[] = 'selected';
                    }
                    if ($day === date('Y-m-d')) {
                        $classes[] = 'today';
                    }
                    ?>
                    <a class="<?php echo e(implode(' ', $classes)); ?>" href="<?php echo e(fin_url(array('ano' => $year, 'mes' => $month, 'data' => $day), 'dia')); ?>">
                        <strong><?php echo e(date('d', strtotime($day))); ?></strong>
                        <span><?php echo e(fin_day_status_label($closing)); ?></span>
                        <?php if (abs($diff) >= 0.01) : ?>
                            <small class="day-diff <?php echo e(financeiro_diff_class($diff)); ?>">Diferenca</small>
                        <?php endif; ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </details>
    </div>

    <section id="dia" class="finance-card selected-day">
        <div class="section-head selected-day-head">
            <div class="day-title-line">
                <h2>Dia selecionado</h2>
                <span class="date-status-pill"><?php echo e(fin_closing_badge_text($selectedClosing, $date)); ?></span>
            </div>
            <div class="autosave-pill" data-save-status>Salvamento automatico</div>
        </div>

        <?php if ($locked) : ?>
            <div class="notice warning">Este dia esta fechado. Para editar, reabra com a senha interna.</div>
        <?php endif; ?>

        <form id="day-close-form" class="finance-form day-autosave-form" method="post" data-no-enter-submit data-autosave-day>
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="save_day">
            <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
            <input type="hidden" name="caixa_fisico" value="<?php echo e(number_format((float) $selectedClosing['caixa_fisico'], 2, ',', '.')); ?>">
            <input type="hidden" name="cartao_total" value="<?php echo e(number_format((float) $selectedClosing['cartao_total'], 2, ',', '.')); ?>">
            <input type="hidden" name="pix_banco_total" value="<?php echo e(number_format((float) $selectedClosing['pix_banco_total'], 2, ',', '.')); ?>">
            <input type="hidden" name="pix_maquininha_total" value="<?php echo e(number_format((float) $selectedClosing['pix_maquininha_total'], 2, ',', '.')); ?>">
            <input type="hidden" name="sangria_total" value="<?php echo e(number_format((float) $selectedClosing['sangria_total'], 2, ',', '.')); ?>">
            <input type="hidden" name="retirada_caixa" value="<?php echo e(number_format((float) $selectedClosing['retirada_caixa'], 2, ',', '.')); ?>">
            <input type="hidden" name="ajustes" value="<?php echo e(number_format((float) $selectedClosing['ajustes'], 2, ',', '.')); ?>">
            <input type="hidden" name="faturamento_dia" value="<?php echo e(number_format((float) ($selectedClosing['faturamento_dia'] ?? 0), 2, ',', '.')); ?>">
            <div class="form-grid top-fields">
                <label>Responsavel
                    <input name="responsavel_texto" value="<?php echo e((string) ($selectedClosing['responsavel_nome'] ?? $selectedClosing['responsavel_texto'] ?? '')); ?>" placeholder="Ex.: Isadora" <?php echo $locked ? 'disabled' : ''; ?>>
                </label>
                <label>Total Sistema
                    <input name="total_sistema" value="<?php echo e(number_format((float) $selectedClosing['abertura_sistema'], 2, ',', '.')); ?>" inputmode="decimal" placeholder="0,00" <?php echo $locked ? 'disabled' : ''; ?>>
                </label>
            </div>
        </form>

        <section class="launch-panel">
            <?php if (!$locked) : ?>
                <form class="entry-add-form" method="post" data-no-enter-submit>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="add_lancamento">
                    <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
                    <div class="form-grid entry-grid">
                        <label>Categoria
                            <select name="categoria">
                                <?php foreach ($lancamentoCategorias as $category) : ?>
                                    <option value="<?php echo e($category); ?>"><?php echo e($category); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>Valor
                            <input name="valor" inputmode="decimal" placeholder="0,00" required>
                        </label>
                        <label>Obs:
                            <input name="observacao" placeholder="Opcional">
                        </label>
                        <button class="btn secondary" type="submit">Adicionar</button>
                    </div>
                </form>
            <?php endif; ?>

            <div class="entry-list launch-list">
                <?php foreach ($lancamentos as $entry) : ?>
                    <?php if (($entry['status'] ?? '') === 'cancelado') { continue; } ?>
                    <div class="entry-row">
                        <div class="entry-content">
                            <span><?php echo e((string) $entry['categoria']); ?></span>
                            <strong><?php echo e(br_money((float) $entry['valor'])); ?></strong>
                            <small><?php echo e(fin_entry_datetime((string) ($entry['created_at'] ?? ''))); ?><?php echo trim((string) ($entry['observacao'] ?? '')) !== '' ? ' - ' . e((string) $entry['observacao']) : ''; ?></small>
                        </div>
                        <?php if (!$locked) : ?>
                            <form method="post">
                                <?php echo csrf_field(); ?>
                                <input type="hidden" name="action" value="cancel_lancamento">
                                <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
                                <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                <button class="link-danger" type="submit">Remover</button>
                            </form>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
                <?php if (!$lancamentos) : ?>
                    <div class="empty-list">Nenhum lancamento adicionado neste dia.</div>
                <?php endif; ?>
            </div>
        </section>

        <div class="finance-metrics compact result-metrics">
            <div><span>Total lancado</span><strong data-total-conferido><?php echo e(br_money((float) $selectedClosing['total_conferido'])); ?></strong></div>
            <div><span>Total Sistema</span><strong data-total-sistema><?php echo e(br_money((float) $selectedClosing['abertura_sistema'])); ?></strong></div>
            <div><span>Sobra/Falta</span><strong data-sobra-falta data-sobra-raw="<?php echo e(number_format($selectedDiff, 2, '.', '')); ?>" class="<?php echo e(financeiro_diff_class($selectedDiff)); ?>"><?php echo e(br_money($selectedDiff)); ?></strong></div>
            <div><span>Limite divergencia</span><strong><?php echo e(br_money($divergenceLimit)); ?></strong></div>
        </div>

        <div class="day-footer-actions">
            <?php if (!$locked) : ?>
            <div class="close-actions">
                <button class="btn primary" type="submit" form="day-close-form" name="action" value="close_day">Fechar dia</button>
                <button class="btn ghost" type="submit" form="day-close-form" name="action" value="close_empty" data-close-empty>Fechar sem movimento</button>
            </div>
            <?php endif; ?>
            <details class="optional-note divergence-note<?php echo $showJustification ? '' : ' is-hidden'; ?>" data-divergence-justification data-limit="<?php echo e(number_format($divergenceLimit, 2, '.', '')); ?>">
                <summary>Justificar Sobra/Falta</summary>
                <label>Justificativa
                    <textarea name="justificativa" form="day-close-form" <?php echo $locked ? 'disabled' : ''; ?>><?php echo e((string) ($selectedClosing['justificativa'] ?? '')); ?></textarea>
                </label>
            </details>
            <details class="optional-note" <?php echo $hasFreeObservation ? 'open' : ''; ?>>
                <summary>Adicionar observação</summary>
                <label>Observação livre
                    <textarea name="observacao" form="day-close-form" <?php echo $locked ? 'disabled' : ''; ?>><?php echo e((string) ($selectedClosing['observacao'] ?? '')); ?></textarea>
                </label>
            </details>
        </div>

        <?php if ($locked) : ?>
            <form class="inline-reopen" method="post" data-no-enter-submit>
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="reopen_day">
                <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
                <label>Senha para reabrir
                    <input type="password" name="senha_reabertura" placeholder="Senha interna">
                </label>
                <button class="btn danger" type="submit">Reabrir dia</button>
            </form>
        <?php endif; ?>
    </section>

    <?php endif; ?>
</main>
</body>
</html>
