<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/financeiro-funcoes.php';

$pageTitle = 'Financeiro';

function financeiro_redirect(array $query = array(), string $anchor = ''): void
{
    $target = 'financeiro.php';

    if ($query) {
        $target .= '?' . http_build_query($query);
    }

    if ($anchor !== '') {
        $target .= '#' . ltrim($anchor, '#');
    }

    redirect_to($target);
}

function financeiro_data_from_array(array $source): array
{
    $pixManualRaw = trim((string) ($source['pix_correto_manual'] ?? ''));

    return array(
        'responsavel_id' => isset($source['responsavel_id']) && (int) $source['responsavel_id'] > 0 ? (int) $source['responsavel_id'] : null,
        'caixa_fisico' => money_to_decimal($source['caixa_fisico'] ?? '0'),
        'cartao_total' => money_to_decimal($source['cartao_total'] ?? '0'),
        'pix_banco_total' => money_to_decimal($source['pix_banco_total'] ?? '0'),
        'pix_maquininha_total' => money_to_decimal($source['pix_maquininha_total'] ?? '0'),
        'pix_correto_manual' => $pixManualRaw === '' ? null : money_to_decimal($pixManualRaw),
        'pix_correto_justificativa' => trim((string) ($source['pix_correto_justificativa'] ?? '')),
        'sangria_total' => money_to_decimal($source['sangria_total'] ?? '0'),
        'retirada_caixa' => money_to_decimal($source['retirada_caixa'] ?? '0'),
        'abertura_sistema' => money_to_decimal($source['abertura_sistema'] ?? '0'),
        'ajustes' => money_to_decimal($source['ajustes'] ?? '0'),
        'justificativa' => trim((string) ($source['justificativa'] ?? '')),
        'observacao' => trim((string) ($source['observacao'] ?? '')),
    );
}

function financeiro_row_has_data(array $row): bool
{
    foreach (array('caixa_fisico', 'cartao_total', 'pix_banco_total', 'pix_maquininha_total', 'pix_correto_manual', 'sangria_total', 'retirada_caixa', 'abertura_sistema', 'ajustes') as $key) {
        if (abs(money_to_decimal($row[$key] ?? '0')) > 0.009) {
            return true;
        }
    }

    return trim((string) ($row['justificativa'] ?? '')) !== ''
        || trim((string) ($row['observacao'] ?? '')) !== ''
        || (int) ($row['responsavel_id'] ?? 0) > 0;
}

function financeiro_block_locked_day(array $closing): void
{
    if (financeiro_is_locked($closing)) {
        throw new RuntimeException('Este dia esta fechado. Reabra com a senha interna antes de alterar.');
    }
}

function financeiro_require_admin(array $user): void
{
    if (($user['role'] ?? '') !== 'admin') {
        throw new RuntimeException('Apenas administrador pode executar esta acao financeira.');
    }
}

function financeiro_handle_post(int $month, int $year, string $date): void
{
    verify_csrf();

    $action = (string) ($_POST['action'] ?? '');
    $currentUser = current_user();

    try {
        if ($action === 'save_month') {
            $rows = is_array($_POST['rows'] ?? null) ? $_POST['rows'] : array();
            $saved = 0;
            $skippedLocked = 0;

            db()->beginTransaction();

            foreach ($rows as $rowDate => $row) {
                if (!is_array($row)) {
                    continue;
                }

                $rowDate = financeiro_valid_date((string) $rowDate, '');

                if ($rowDate === '' || !financeiro_row_has_data($row)) {
                    continue;
                }

                $closing = financeiro_get_or_create_closing($rowDate);

                if (financeiro_is_locked($closing)) {
                    $skippedLocked++;
                    continue;
                }

                financeiro_update_manual_closing((int) $closing['id'], financeiro_data_from_array($row));
                $saved++;
            }

            db()->commit();

            $message = $saved . ' fechamento(s) salvo(s).';

            if ($skippedLocked > 0) {
                $message .= ' ' . $skippedLocked . ' dia(s) fechado(s) foram ignorados.';
            }

            set_flash('success', $message);
            financeiro_redirect(array('mes' => $month, 'ano' => $year), 'mensal');
        }

        if ($action === 'save_day') {
            $day = financeiro_valid_date($_POST['data_fechamento'] ?? $date);
            $closing = financeiro_get_or_create_closing($day);

            db()->beginTransaction();
            financeiro_update_manual_closing((int) $closing['id'], financeiro_data_from_array($_POST));
            db()->commit();

            set_flash('success', 'Fechamento do dia salvo como rascunho/conferencia.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'detalhe');
        }

        if ($action === 'close_day') {
            $day = financeiro_valid_date($_POST['data_fechamento'] ?? $date);
            $closing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($closing);

            db()->beginTransaction();
            $updated = financeiro_update_manual_closing((int) $closing['id'], financeiro_data_from_array($_POST));
            $limit = financeiro_divergence_limit();
            $status = abs((float) $updated['sobra_falta']) > $limit ? 'divergente' : 'fechado';

            $stmt = db()->prepare('UPDATE financeiro_fechamentos SET status = ?, fechado_em = NOW(), fechado_por = ? WHERE id = ?');
            $stmt->execute(array($status, $currentUser['id'] ?? null, (int) $updated['id']));
            $after = financeiro_fetch_by_id((int) $updated['id']);
            financeiro_audit('fechar_dia', 'financeiro_fechamentos', (int) $updated['id'], $updated, $after);
            db()->commit();

            set_flash($status === 'divergente' ? 'warning' : 'success', $status === 'divergente' ? 'Dia fechado como divergente. Revise a justificativa.' : 'Dia fechado com sucesso.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'detalhe');
        }

        if ($action === 'reopen_day') {
            $day = financeiro_valid_date($_POST['data_fechamento'] ?? $date);
            $password = (string) ($_POST['senha_reabertura'] ?? '');
            $closing = financeiro_fetch_by_date($day);

            if (!$closing) {
                throw new RuntimeException('Fechamento nao encontrado para reabrir.');
            }

            if (($currentUser['role'] ?? '') !== 'admin') {
                throw new RuntimeException('Apenas administrador pode reabrir dia fechado.');
            }

            if (!hash_equals('wimifarma', $password)) {
                throw new RuntimeException('Senha interna incorreta para reabrir o dia.');
            }

            $before = $closing;
            $stmt = db()->prepare("UPDATE financeiro_fechamentos SET status = 'conferencia', fechado_em = NULL, fechado_por = NULL WHERE id = ?");
            $stmt->execute(array((int) $closing['id']));
            $after = financeiro_fetch_by_id((int) $closing['id']);
            financeiro_audit('reabrir_dia', 'financeiro_fechamentos', (int) $closing['id'], $before, $after);

            set_flash('success', 'Dia reaberto para edicao.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'detalhe');
        }

        if ($action === 'save_sangria') {
            $day = financeiro_valid_date($_POST['data'] ?? $date);
            $closing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($closing);

            $valor = financeiro_post_money('valor');
            $motivo = trim((string) ($_POST['motivo'] ?? ''));

            if ($valor <= 0 || $motivo === '') {
                throw new RuntimeException('Informe valor e motivo da sangria.');
            }

            $anexo = financeiro_upload_file('anexo', 'sangrias');
            $stmt = db()->prepare(
                'INSERT INTO financeiro_sangrias
                    (fechamento_id, data, hora, valor, motivo, responsavel_id, autorizado_por, destino, observacao, status, anexo_path, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $day,
                financeiro_time_or_null($_POST['hora'] ?? null),
                $valor,
                $motivo,
                financeiro_post_int_or_null('responsavel_id'),
                trim((string) ($_POST['autorizado_por'] ?? '')) ?: null,
                trim((string) ($_POST['destino'] ?? '')) ?: null,
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                in_array((string) ($_POST['status'] ?? 'lancado'), array('lancado', 'conferido'), true) ? (string) $_POST['status'] : 'lancado',
                $anexo,
                $currentUser['id'] ?? null,
            ));
            $id = (int) db()->lastInsertId();
            $after = db()->query('SELECT * FROM financeiro_sangrias WHERE id = ' . $id)->fetch();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_sangria', 'financeiro_sangrias', $id, null, $after);

            set_flash('success', 'Sangria lancada e somada no fechamento.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'sangrias');
        }

        if ($action === 'cancel_sangria') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $stmt = db()->prepare('SELECT * FROM financeiro_sangrias WHERE id = ? LIMIT 1');
            $stmt->execute(array($id));
            $before = $stmt->fetch();

            if (!$before) {
                throw new RuntimeException('Sangria nao encontrada.');
            }

            $closing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($closing) {
                financeiro_block_locked_day($closing);
            }

            db()->prepare("UPDATE financeiro_sangrias SET status = 'cancelado' WHERE id = ?")->execute(array($id));
            if ($closing) {
                financeiro_recalculate((int) $closing['id']);
            }
            financeiro_audit('cancelar_sangria', 'financeiro_sangrias', $id, $before, array('status' => 'cancelado'));
            set_flash('success', 'Sangria cancelada.');
            financeiro_redirect(array('data' => (string) $before['data'], 'mes' => (int) date('n', strtotime((string) $before['data'])), 'ano' => (int) date('Y', strtotime((string) $before['data']))), 'sangrias');
        }

        if ($action === 'update_sangria') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $before = financeiro_fetch_entry('financeiro_sangrias', $id);

            if (!$before) {
                throw new RuntimeException('Sangria nao encontrada para edicao.');
            }

            $oldClosing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($oldClosing) {
                financeiro_block_locked_day($oldClosing);
            }

            $day = financeiro_valid_date($_POST['data'] ?? $before['data']);
            $newClosing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($newClosing);
            $valor = financeiro_post_money('valor');
            $motivo = trim((string) ($_POST['motivo'] ?? ''));

            if ($valor <= 0 || $motivo === '') {
                throw new RuntimeException('Informe valor e motivo da sangria.');
            }

            $status = in_array((string) ($_POST['status'] ?? 'lancado'), array('lancado', 'conferido', 'cancelado'), true)
                ? (string) $_POST['status']
                : 'lancado';
            $anexo = financeiro_upload_file('anexo', 'sangrias') ?: ($before['anexo_path'] ?? null);

            db()->beginTransaction();
            $stmt = db()->prepare(
                'UPDATE financeiro_sangrias
                 SET fechamento_id = ?, data = ?, hora = ?, valor = ?, motivo = ?, responsavel_id = ?,
                     autorizado_por = ?, destino = ?, observacao = ?, status = ?, anexo_path = ?
                 WHERE id = ?'
            );
            $stmt->execute(array(
                (int) $newClosing['id'],
                $day,
                financeiro_time_or_null($_POST['hora'] ?? null),
                $valor,
                $motivo,
                financeiro_post_int_or_null('responsavel_id'),
                trim((string) ($_POST['autorizado_por'] ?? '')) ?: null,
                trim((string) ($_POST['destino'] ?? '')) ?: null,
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                $status,
                $anexo,
                $id,
            ));
            financeiro_recalculate((int) $newClosing['id']);

            if ($oldClosing && (int) $oldClosing['id'] !== (int) $newClosing['id']) {
                financeiro_recalculate((int) $oldClosing['id']);
            }

            $after = financeiro_fetch_entry('financeiro_sangrias', $id);
            financeiro_audit('editar_sangria', 'financeiro_sangrias', $id, $before, $after);
            db()->commit();

            set_flash('success', 'Sangria atualizada.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'sangrias');
        }

        if ($action === 'save_maquininha') {
            $day = financeiro_valid_date($_POST['data'] ?? $date);
            $closing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($closing);

            $operadora = trim((string) ($_POST['operadora'] ?? ''));
            $tipo = (string) ($_POST['tipo'] ?? 'credito');
            $valorBruto = financeiro_post_money('valor_bruto');
            $taxa = financeiro_post_money('taxa');
            $valorLiquido = round($valorBruto - $taxa, 2);
            $tipos = array('credito', 'debito', 'voucher', 'pix_maquininha', 'outra');

            if ($operadora === '' || $valorBruto <= 0) {
                throw new RuntimeException('Informe operadora e valor bruto da maquininha.');
            }

            if (!in_array($tipo, $tipos, true)) {
                $tipo = 'credito';
            }

            $anexo = financeiro_upload_file('anexo', 'maquininhas');
            $stmt = db()->prepare(
                'INSERT INTO financeiro_maquininhas
                    (fechamento_id, data, operadora, tipo, valor_bruto, taxa, valor_liquido, bandeira, nsu, codigo_comprovante, horario, responsavel_id, observacao, status_conciliacao, anexo_path, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $day,
                $operadora,
                $tipo,
                $valorBruto,
                $taxa,
                $valorLiquido,
                trim((string) ($_POST['bandeira'] ?? '')) ?: null,
                trim((string) ($_POST['nsu'] ?? '')) ?: null,
                trim((string) ($_POST['codigo_comprovante'] ?? '')) ?: null,
                financeiro_time_or_null($_POST['horario'] ?? null),
                financeiro_post_int_or_null('responsavel_id'),
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                in_array((string) ($_POST['status_conciliacao'] ?? 'pendente'), array('pendente', 'conferido', 'divergente'), true) ? (string) $_POST['status_conciliacao'] : 'pendente',
                $anexo,
                $currentUser['id'] ?? null,
            ));
            $id = (int) db()->lastInsertId();
            $after = db()->query('SELECT * FROM financeiro_maquininhas WHERE id = ' . $id)->fetch();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_maquininha', 'financeiro_maquininhas', $id, null, $after);

            set_flash('success', 'Lancamento de maquininha salvo.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'maquininhas');
        }

        if ($action === 'cancel_maquininha') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $stmt = db()->prepare('SELECT * FROM financeiro_maquininhas WHERE id = ? LIMIT 1');
            $stmt->execute(array($id));
            $before = $stmt->fetch();

            if (!$before) {
                throw new RuntimeException('Lancamento de maquininha nao encontrado.');
            }

            $closing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($closing) {
                financeiro_block_locked_day($closing);
            }

            db()->prepare("UPDATE financeiro_maquininhas SET status_conciliacao = 'cancelado' WHERE id = ?")->execute(array($id));
            if ($closing) {
                financeiro_recalculate((int) $closing['id']);
            }
            financeiro_audit('cancelar_maquininha', 'financeiro_maquininhas', $id, $before, array('status_conciliacao' => 'cancelado'));
            set_flash('success', 'Lancamento de maquininha cancelado.');
            financeiro_redirect(array('data' => (string) $before['data'], 'mes' => (int) date('n', strtotime((string) $before['data'])), 'ano' => (int) date('Y', strtotime((string) $before['data']))), 'maquininhas');
        }

        if ($action === 'update_maquininha') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $before = financeiro_fetch_entry('financeiro_maquininhas', $id);

            if (!$before) {
                throw new RuntimeException('Lancamento de maquininha nao encontrado para edicao.');
            }

            $oldClosing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($oldClosing) {
                financeiro_block_locked_day($oldClosing);
            }

            $day = financeiro_valid_date($_POST['data'] ?? $before['data']);
            $newClosing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($newClosing);
            $operadora = trim((string) ($_POST['operadora'] ?? ''));
            $tipo = (string) ($_POST['tipo'] ?? 'credito');
            $valorBruto = financeiro_post_money('valor_bruto');
            $taxa = financeiro_post_money('taxa');
            $valorLiquido = round($valorBruto - $taxa, 2);
            $tipos = array('credito', 'debito', 'voucher', 'pix_maquininha', 'outra');

            if ($operadora === '' || $valorBruto <= 0) {
                throw new RuntimeException('Informe operadora e valor bruto da maquininha.');
            }

            if (!in_array($tipo, $tipos, true)) {
                $tipo = 'credito';
            }

            $status = in_array((string) ($_POST['status_conciliacao'] ?? 'pendente'), array('pendente', 'conferido', 'divergente', 'cancelado'), true)
                ? (string) $_POST['status_conciliacao']
                : 'pendente';
            $anexo = financeiro_upload_file('anexo', 'maquininhas') ?: ($before['anexo_path'] ?? null);

            db()->beginTransaction();
            $stmt = db()->prepare(
                'UPDATE financeiro_maquininhas
                 SET fechamento_id = ?, data = ?, operadora = ?, tipo = ?, valor_bruto = ?, taxa = ?,
                     valor_liquido = ?, bandeira = ?, nsu = ?, codigo_comprovante = ?, horario = ?,
                     responsavel_id = ?, observacao = ?, status_conciliacao = ?, anexo_path = ?
                 WHERE id = ?'
            );
            $stmt->execute(array(
                (int) $newClosing['id'],
                $day,
                $operadora,
                $tipo,
                $valorBruto,
                $taxa,
                $valorLiquido,
                trim((string) ($_POST['bandeira'] ?? '')) ?: null,
                trim((string) ($_POST['nsu'] ?? '')) ?: null,
                trim((string) ($_POST['codigo_comprovante'] ?? '')) ?: null,
                financeiro_time_or_null($_POST['horario'] ?? null),
                financeiro_post_int_or_null('responsavel_id'),
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                $status,
                $anexo,
                $id,
            ));
            financeiro_recalculate((int) $newClosing['id']);

            if ($oldClosing && (int) $oldClosing['id'] !== (int) $newClosing['id']) {
                financeiro_recalculate((int) $oldClosing['id']);
            }

            $after = financeiro_fetch_entry('financeiro_maquininhas', $id);
            financeiro_audit('editar_maquininha', 'financeiro_maquininhas', $id, $before, $after);
            db()->commit();

            set_flash('success', 'Lancamento de maquininha atualizado.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'maquininhas');
        }

        if ($action === 'save_pix') {
            $day = financeiro_valid_date($_POST['data'] ?? $date);
            $closing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($closing);

            $tipo = (string) ($_POST['tipo'] ?? 'banco');
            $valor = financeiro_post_money('valor');
            $tipos = array('banco', 'maquininha', 'divergente', 'ajuste');

            if ($valor <= 0) {
                throw new RuntimeException('Informe o valor do PIX.');
            }

            if (!in_array($tipo, $tipos, true)) {
                $tipo = 'banco';
            }

            $anexo = financeiro_upload_file('comprovante', 'pix');
            $stmt = db()->prepare(
                'INSERT INTO financeiro_pix
                    (fechamento_id, data, tipo, valor, origem, responsavel_id, comprovante_path, observacao, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array(
                (int) $closing['id'],
                $day,
                $tipo,
                $valor,
                trim((string) ($_POST['origem'] ?? '')) ?: null,
                financeiro_post_int_or_null('responsavel_id'),
                $anexo,
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                in_array((string) ($_POST['status'] ?? 'pendente'), array('pendente', 'conferido', 'divergente'), true) ? (string) $_POST['status'] : 'pendente',
                $currentUser['id'] ?? null,
            ));
            $id = (int) db()->lastInsertId();
            $after = db()->query('SELECT * FROM financeiro_pix WHERE id = ' . $id)->fetch();
            financeiro_recalculate((int) $closing['id']);
            financeiro_audit('criar_pix', 'financeiro_pix', $id, null, $after);

            set_flash('success', 'Lancamento PIX salvo.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'pix');
        }

        if ($action === 'cancel_pix') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $stmt = db()->prepare('SELECT * FROM financeiro_pix WHERE id = ? LIMIT 1');
            $stmt->execute(array($id));
            $before = $stmt->fetch();

            if (!$before) {
                throw new RuntimeException('Lancamento PIX nao encontrado.');
            }

            $closing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($closing) {
                financeiro_block_locked_day($closing);
            }

            db()->prepare("UPDATE financeiro_pix SET status = 'cancelado' WHERE id = ?")->execute(array($id));
            if ($closing) {
                financeiro_recalculate((int) $closing['id']);
            }
            financeiro_audit('cancelar_pix', 'financeiro_pix', $id, $before, array('status' => 'cancelado'));
            set_flash('success', 'Lancamento PIX cancelado.');
            financeiro_redirect(array('data' => (string) $before['data'], 'mes' => (int) date('n', strtotime((string) $before['data'])), 'ano' => (int) date('Y', strtotime((string) $before['data']))), 'pix');
        }

        if ($action === 'update_pix') {
            $id = max(0, (int) ($_POST['id'] ?? 0));
            $before = financeiro_fetch_entry('financeiro_pix', $id);

            if (!$before) {
                throw new RuntimeException('Lancamento PIX nao encontrado para edicao.');
            }

            $oldClosing = financeiro_fetch_by_id((int) $before['fechamento_id']);

            if ($oldClosing) {
                financeiro_block_locked_day($oldClosing);
            }

            $day = financeiro_valid_date($_POST['data'] ?? $before['data']);
            $newClosing = financeiro_get_or_create_closing($day);
            financeiro_block_locked_day($newClosing);
            $tipo = (string) ($_POST['tipo'] ?? 'banco');
            $valor = financeiro_post_money('valor');
            $tipos = array('banco', 'maquininha', 'divergente', 'ajuste');

            if ($valor <= 0) {
                throw new RuntimeException('Informe o valor do PIX.');
            }

            if (!in_array($tipo, $tipos, true)) {
                $tipo = 'banco';
            }

            $status = in_array((string) ($_POST['status'] ?? 'pendente'), array('pendente', 'conferido', 'divergente', 'cancelado'), true)
                ? (string) $_POST['status']
                : 'pendente';
            $anexo = financeiro_upload_file('comprovante', 'pix') ?: ($before['comprovante_path'] ?? null);

            db()->beginTransaction();
            $stmt = db()->prepare(
                'UPDATE financeiro_pix
                 SET fechamento_id = ?, data = ?, tipo = ?, valor = ?, origem = ?, responsavel_id = ?,
                     comprovante_path = ?, observacao = ?, status = ?
                 WHERE id = ?'
            );
            $stmt->execute(array(
                (int) $newClosing['id'],
                $day,
                $tipo,
                $valor,
                trim((string) ($_POST['origem'] ?? '')) ?: null,
                financeiro_post_int_or_null('responsavel_id'),
                $anexo,
                trim((string) ($_POST['observacao'] ?? '')) ?: null,
                $status,
                $id,
            ));
            financeiro_recalculate((int) $newClosing['id']);

            if ($oldClosing && (int) $oldClosing['id'] !== (int) $newClosing['id']) {
                financeiro_recalculate((int) $oldClosing['id']);
            }

            $after = financeiro_fetch_entry('financeiro_pix', $id);
            financeiro_audit('editar_pix', 'financeiro_pix', $id, $before, $after);
            db()->commit();

            set_flash('success', 'Lancamento PIX atualizado.');
            financeiro_redirect(array('data' => $day, 'mes' => (int) date('n', strtotime($day)), 'ano' => (int) date('Y', strtotime($day))), 'pix');
        }

        if ($action === 'save_config') {
            financeiro_require_admin($currentUser ?: array());

            $limit = max(0.0, money_to_decimal($_POST['limite_divergencia'] ?? '10'));
            financeiro_set_setting('limite_divergencia', number_format($limit, 2, '.', ''), 'Tolerancia maxima positiva ou negativa antes de marcar divergente.');
            financeiro_audit('alterar_configuracao', 'financeiro_configuracoes', null, null, array('limite_divergencia' => $limit));
            set_flash('success', 'Configuracao financeira salva.');
            financeiro_redirect(array('mes' => $month, 'ano' => $year), 'configuracoes');
        }

        if ($action === 'import_csv') {
            financeiro_require_admin($currentUser ?: array());

            if (empty($_FILES['arquivo_csv']) || (int) ($_FILES['arquivo_csv']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                throw new RuntimeException('Selecione um arquivo CSV exportado da planilha.');
            }

            $name = strtolower((string) ($_FILES['arquivo_csv']['name'] ?? ''));

            if (!preg_match('/\.csv$/', $name)) {
                throw new RuntimeException('Nesta versao a importacao recebe CSV. Exporte a planilha como CSV antes de importar.');
            }

            $imported = financeiro_import_csv((string) $_FILES['arquivo_csv']['tmp_name'], !empty($_POST['atualizar_existentes']));
            set_flash('success', $imported . ' fechamento(s) importado(s) do CSV.');
            financeiro_redirect(array('mes' => $month, 'ano' => $year), 'exportacoes');
        }

        throw new RuntimeException('Acao financeira invalida.');
    } catch (Throwable $error) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        set_flash('error', $error->getMessage());
        financeiro_redirect(array('data' => $date, 'mes' => $month, 'ano' => $year), 'financeiro');
    }
}

$month = max(1, min(12, (int) ($_GET['mes'] ?? date('n'))));
$year = max(2020, min(2100, (int) ($_GET['ano'] ?? date('Y'))));
$date = financeiro_valid_date($_GET['data'] ?? date('Y-m-d'));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    financeiro_handle_post($month, $year, $date);
}

$attendants = atendentes_options();
$closings = financeiro_month_closings($month, $year);
$totals = financeiro_month_totals($closings);
$selectedClosing = financeiro_fetch_by_date($date) ?: financeiro_get_or_create_closing($date);
$selectedClosing = financeiro_recalculate((int) $selectedClosing['id']);
$sangrias = financeiro_fetch_entries('financeiro_sangrias', (int) $selectedClosing['id']);
$maquininhas = financeiro_fetch_entries('financeiro_maquininhas', (int) $selectedClosing['id']);
$pixEntries = financeiro_fetch_entries('financeiro_pix', (int) $selectedClosing['id']);
$auditRows = financeiro_recent_audit(80);
$locked = financeiro_is_locked($selectedClosing);
$limit = financeiro_divergence_limit();
$currentUser = current_user();

require __DIR__ . '/header.php';
?>

<section class="finance-module" id="financeiro">
    <div class="module-switcher finance-tabs">
        <a class="active" href="#mensal" data-section-link="mensal">Fechamento mensal</a>
        <a href="#detalhe" data-section-link="detalhe">Detalhe do dia</a>
        <a href="#sangrias" data-section-link="sangrias">Sangrias</a>
        <a href="#maquininhas" data-section-link="maquininhas">Maquininhas</a>
        <a href="#pix" data-section-link="pix">PIX</a>
        <a href="#relatorios" data-section-link="relatorios">Relatorios</a>
        <a href="#exportacoes" data-section-link="exportacoes">Exportacoes</a>
        <a href="#configuracoes" data-section-link="configuracoes">Configuracoes</a>
        <a href="#auditoria" data-section-link="auditoria">Auditoria</a>
    </div>

    <div class="dashboard-cards finance-kpis">
        <article class="metric-card primary">
            <span>Total conferido</span>
            <strong><?php echo e(br_money($totals['total_conferido'])); ?></strong>
        </article>
        <article class="metric-card">
            <span>Cartao C/D</span>
            <strong><?php echo e(br_money($totals['cartao_total'])); ?></strong>
        </article>
        <article class="metric-card">
            <span>PIX correto</span>
            <strong><?php echo e(br_money($totals['pix_correto_total'])); ?></strong>
        </article>
        <article class="metric-card">
            <span>Sangrias</span>
            <strong><?php echo e(br_money($totals['sangria_total'])); ?></strong>
        </article>
        <article class="metric-card">
            <span>Sobra/Falta</span>
            <strong class="<?php echo e(financeiro_diff_class((float) $totals['sobra_falta'])); ?>"><?php echo e(br_money($totals['sobra_falta'])); ?></strong>
        </article>
        <article class="metric-card">
            <span>Divergencias</span>
            <strong><?php echo e((string) $totals['divergencias']); ?></strong>
        </article>
    </div>

    <section class="workspace-section finance-section" id="mensal">
        <div class="panel soft">
            <div class="section-title">
                <div>
                    <span class="kicker">Planilha melhorada</span>
                    <h2>Fechamento diario por mes</h2>
                    <p>Preencha a linha do dia ou abra o detalhe para sangrias, maquininhas e PIX.</p>
                </div>
                <form method="get" class="filter-form">
                    <label>
                        Mes
                        <select name="mes">
                            <?php for ($m = 1; $m <= 12; $m++) : ?>
                                <option value="<?php echo e((string) $m); ?>"<?php echo $m === $month ? ' selected' : ''; ?>><?php echo e(str_pad((string) $m, 2, '0', STR_PAD_LEFT)); ?></option>
                            <?php endfor; ?>
                        </select>
                    </label>
                    <label>
                        Ano
                        <input type="number" name="ano" value="<?php echo e((string) $year); ?>" min="2020" max="2100">
                    </label>
                    <button class="btn primary" type="submit">Atualizar</button>
                </form>
            </div>

            <form method="post" data-no-enter-submit data-confirm-submit="Salvar alteracoes do fechamento mensal?">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="save_month">
                <div class="finance-table-wrap">
                    <table class="finance-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Status</th>
                                <th>Caixa fisico</th>
                                <th>Cartao C/D</th>
                                <th>PIX banco</th>
                                <th>PIX maq.</th>
                                <th>PIX correto</th>
                                <th>Sangria</th>
                                <th>Retirada</th>
                                <th>Abertura sistema</th>
                                <th>Ajustes</th>
                                <th>Total</th>
                                <th>Sobra/Falta</th>
                                <th>Justificativa</th>
                                <th>Responsavel</th>
                                <th>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach (financeiro_month_days($month, $year) as $day) : ?>
                                <?php
                                $row = $closings[$day] ?? array();
                                $isLocked = $row && financeiro_is_locked($row);
                                $rowStatus = $row ? (string) $row['status'] : 'aberto';
                                $rowId = 'row-' . str_replace('-', '', $day);
                                ?>
                                <tr data-finance-calc data-finance-limit="<?php echo e(number_format($limit, 2, '.', '')); ?>" id="<?php echo e($rowId); ?>" class="<?php echo $isLocked ? 'is-locked' : ''; ?>">
                                    <td>
                                        <strong><?php echo e(br_date($day)); ?></strong>
                                        <input type="hidden" name="rows[<?php echo e($day); ?>][data]" value="<?php echo e($day); ?>">
                                    </td>
                                    <td><span class="finance-status status-<?php echo e($rowStatus); ?>"><?php echo e($row ? financeiro_status_label($rowStatus) : 'Sem fechamento'); ?></span></td>
                                    <?php foreach (array('caixa_fisico', 'cartao_total', 'pix_banco_total', 'pix_maquininha_total', 'pix_correto_manual', 'sangria_total', 'retirada_caixa', 'abertura_sistema') as $field) : ?>
                                        <td>
                                            <input class="money-mini" data-money data-finance-field="<?php echo e($field); ?>" <?php echo $isLocked ? 'disabled' : ''; ?> name="rows[<?php echo e($day); ?>][<?php echo e($field); ?>]" value="<?php echo e(number_format((float) ($row[$field] ?? ($field === 'pix_correto_manual' ? ($row['pix_correto_total'] ?? 0) : 0)), 2, ',', '.')); ?>">
                                        </td>
                                    <?php endforeach; ?>
                                    <td><input class="money-mini" data-money data-finance-field="ajustes" <?php echo $isLocked ? 'disabled' : ''; ?> name="rows[<?php echo e($day); ?>][ajustes]" value="<?php echo e(number_format((float) ($row['ajustes'] ?? 0), 2, ',', '.')); ?>"></td>
                                    <td><strong data-finance-total-output><?php echo e(br_money($row['total_conferido'] ?? 0)); ?></strong></td>
                                    <td><strong data-finance-diff-output class="<?php echo e(financeiro_diff_class((float) ($row['sobra_falta'] ?? 0))); ?>"><?php echo e(br_money($row['sobra_falta'] ?? 0)); ?></strong></td>
                                    <td><input class="text-mini" <?php echo $isLocked ? 'disabled' : ''; ?> name="rows[<?php echo e($day); ?>][justificativa]" value="<?php echo e((string) ($row['justificativa'] ?? '')); ?>" placeholder="Obrigatoria se houver diferenca"></td>
                                    <td>
                                        <select class="select-mini" <?php echo $isLocked ? 'disabled' : ''; ?> name="rows[<?php echo e($day); ?>][responsavel_id]">
                                            <option value="">-</option>
                                            <?php foreach ($attendants as $attendant) : ?>
                                                <option value="<?php echo e((string) $attendant['id']); ?>"<?php echo (int) ($row['responsavel_id'] ?? 0) === (int) $attendant['id'] ? ' selected' : ''; ?>><?php echo e($attendant['nome']); ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                    </td>
                                    <td class="table-actions">
                                        <a class="btn compact" href="<?php echo e(app_url('financeiro.php?data=' . $day . '&mes=' . $month . '&ano=' . $year . '#detalhe')); ?>">Abrir</a>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="2">Totais do mes</th>
                                <th><?php echo e(br_money($totals['caixa_fisico'])); ?></th>
                                <th><?php echo e(br_money($totals['cartao_total'])); ?></th>
                                <th><?php echo e(br_money($totals['pix_banco_total'])); ?></th>
                                <th><?php echo e(br_money($totals['pix_maquininha_total'])); ?></th>
                                <th><?php echo e(br_money($totals['pix_correto_total'])); ?></th>
                                <th><?php echo e(br_money($totals['sangria_total'])); ?></th>
                                <th><?php echo e(br_money($totals['retirada_caixa'])); ?></th>
                                <th><?php echo e(br_money($totals['abertura_sistema'])); ?></th>
                                <th><?php echo e(br_money($totals['ajustes'] ?? 0)); ?></th>
                                <th><?php echo e(br_money($totals['total_conferido'])); ?></th>
                                <th><?php echo e(br_money($totals['sobra_falta'])); ?></th>
                                <th colspan="3">Media sobra/falta: <?php echo e(br_money($totals['media_sobra_falta'] ?? 0)); ?></th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="form-actions">
                    <button class="btn primary" type="submit">Salvar planilha do mes</button>
                    <a class="btn" href="<?php echo e(app_url('financeiro-exportar.php?tipo=mensal&mes=' . $month . '&ano=' . $year)); ?>">Exportar CSV do mes</a>
                </div>
            </form>
        </div>
    </section>

    <section class="workspace-section finance-section" id="detalhe">
        <div class="panel soft">
            <div class="section-title">
                <div>
                    <span class="kicker">Dia selecionado</span>
                    <h2><?php echo e(br_date($date)); ?> - <?php echo e(financeiro_status_label((string) $selectedClosing['status'])); ?></h2>
                    <p>O backend recalcula tudo antes de salvar ou fechar o dia.</p>
                </div>
                <form method="get" class="filter-form">
                    <label>Data <input type="date" name="data" value="<?php echo e($date); ?>"></label>
                    <input type="hidden" name="mes" value="<?php echo e((string) $month); ?>">
                    <input type="hidden" name="ano" value="<?php echo e((string) $year); ?>">
                    <button class="btn primary" type="submit">Abrir data</button>
                </form>
            </div>

            <div class="finance-day-grid">
                <article class="finance-summary-card">
                    <span>Total conferido</span>
                    <strong><?php echo e(br_money($selectedClosing['total_conferido'])); ?></strong>
                </article>
                <article class="finance-summary-card">
                    <span>Abertura sistema</span>
                    <strong><?php echo e(br_money($selectedClosing['abertura_sistema'])); ?></strong>
                </article>
                <article class="finance-summary-card">
                    <span>Sobra/Falta</span>
                    <strong class="<?php echo e(financeiro_diff_class((float) $selectedClosing['sobra_falta'])); ?>"><?php echo e(br_money($selectedClosing['sobra_falta'])); ?></strong>
                </article>
                <article class="finance-summary-card">
                    <span>Limite divergencia</span>
                    <strong><?php echo e(br_money($limit)); ?></strong>
                </article>
            </div>

            <?php if ($locked) : ?>
                <div class="alert warning">Este dia esta fechado. Edicao bloqueada ate reabrir com senha interna.</div>
            <?php endif; ?>

            <form method="post" data-no-enter-submit data-finance-calc data-finance-limit="<?php echo e(number_format($limit, 2, '.', '')); ?>" class="finance-day-form">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
                <div class="form-grid three-cols">
                    <label>Responsavel
                        <select name="responsavel_id" <?php echo $locked ? 'disabled' : ''; ?>>
                            <option value="">Sem responsavel</option>
                            <?php foreach ($attendants as $attendant) : ?>
                                <option value="<?php echo e((string) $attendant['id']); ?>"<?php echo (int) ($selectedClosing['responsavel_id'] ?? 0) === (int) $attendant['id'] ? ' selected' : ''; ?>><?php echo e($attendant['nome']); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </label>
                    <label>Caixa fisico no fechamento
                        <input data-money data-finance-field="caixa_fisico" name="caixa_fisico" value="<?php echo e(number_format((float) $selectedClosing['caixa_fisico'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>Retirada de caixa
                        <input data-money data-finance-field="retirada_caixa" name="retirada_caixa" value="<?php echo e(number_format((float) $selectedClosing['retirada_caixa'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>Cartao C/D
                        <input data-money data-finance-field="cartao_total" name="cartao_total" value="<?php echo e(number_format((float) $selectedClosing['cartao_total'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>PIX banco
                        <input data-money data-finance-field="pix_banco_total" name="pix_banco_total" value="<?php echo e(number_format((float) $selectedClosing['pix_banco_total'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>PIX maquininha
                        <input data-money data-finance-field="pix_maquininha_total" name="pix_maquininha_total" value="<?php echo e(number_format((float) $selectedClosing['pix_maquininha_total'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>PIX correto manual
                        <input data-money data-finance-field="pix_correto_manual" name="pix_correto_manual" value="<?php echo e($selectedClosing['pix_correto_manual'] === null ? '' : number_format((float) $selectedClosing['pix_correto_manual'], 2, ',', '.')); ?>" placeholder="Vazio = banco + maquininha" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label class="full">Justificativa para PIX correto manual
                        <textarea name="pix_correto_justificativa" rows="2" placeholder="Obrigatorio quando ajustar o PIX correto manualmente" <?php echo $locked ? 'disabled' : ''; ?>><?php echo e((string) ($selectedClosing['pix_correto_justificativa'] ?? '')); ?></textarea>
                    </label>
                    <label>Sangrias
                        <input data-money data-finance-field="sangria_total" name="sangria_total" value="<?php echo e(number_format((float) $selectedClosing['sangria_total'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>Abertura sistema
                        <input data-money data-finance-field="abertura_sistema" name="abertura_sistema" value="<?php echo e(number_format((float) $selectedClosing['abertura_sistema'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label>Ajustes
                        <input data-money data-finance-field="ajustes" name="ajustes" value="<?php echo e(number_format((float) $selectedClosing['ajustes'], 2, ',', '.')); ?>" <?php echo $locked ? 'disabled' : ''; ?>>
                    </label>
                    <label class="full">Justificativa se houver sobra/falta
                        <textarea name="justificativa" rows="3" <?php echo $locked ? 'disabled' : ''; ?>><?php echo e((string) ($selectedClosing['justificativa'] ?? '')); ?></textarea>
                    </label>
                    <label class="full">Observacao livre
                        <textarea name="observacao" rows="2" <?php echo $locked ? 'disabled' : ''; ?>><?php echo e((string) ($selectedClosing['observacao'] ?? '')); ?></textarea>
                    </label>
                </div>
                <div class="charge-summary finance-live-summary">
                    <div><span>Total conferido</span><strong class="js-finance-total"><?php echo e(br_money($selectedClosing['total_conferido'])); ?></strong></div>
                    <div><span>Sobra/Falta</span><strong class="js-finance-diff <?php echo e(financeiro_diff_class((float) $selectedClosing['sobra_falta'])); ?>"><?php echo e(br_money($selectedClosing['sobra_falta'])); ?></strong></div>
                    <div><span>Status previsto</span><strong class="js-finance-status"><?php echo e(financeiro_status_label((string) $selectedClosing['status'])); ?></strong></div>
                </div>
                <div class="form-actions">
                    <?php if (!$locked) : ?>
                        <button class="btn" type="submit" name="action" value="save_day">Salvar rascunho</button>
                        <button class="btn primary" type="submit" name="action" value="close_day" data-confirm-submit="Fechar este dia? Depois disso apenas admin reabre com senha.">Fechar dia</button>
                    <?php endif; ?>
                    <a class="btn" href="<?php echo e(app_url('financeiro-exportar.php?tipo=dia&data=' . $date)); ?>">Exportar dia CSV</a>
                </div>
            </form>

            <?php if ($locked) : ?>
                <form method="post" class="finance-reopen-form" data-no-enter-submit data-confirm-submit="Reabrir este fechamento?">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="reopen_day">
                    <input type="hidden" name="data_fechamento" value="<?php echo e($date); ?>">
                    <label>Senha interna para reabrir
                        <input type="password" name="senha_reabertura" placeholder="Senha wimifarma">
                    </label>
                    <button class="btn primary" type="submit">Reabrir dia</button>
                </form>
            <?php endif; ?>
        </div>
    </section>

    <section class="workspace-section finance-section" id="sangrias">
        <div class="grid two">
            <div class="panel soft">
                <span class="kicker">Retirada controlada</span>
                <h2>Lancar sangria</h2>
                <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="save_sangria">
                    <div class="form-grid two-cols">
                        <label>Data <input type="date" name="data" value="<?php echo e($date); ?>"></label>
                        <label>Hora <input type="time" name="hora" value="<?php echo e(date('H:i')); ?>"></label>
                        <label>Valor * <input data-money name="valor" placeholder="0,00"></label>
                        <label>Motivo * <input name="motivo" placeholder="Ex: deposito, troco, retirada"></label>
                        <label>Responsavel
                            <select name="responsavel_id">
                                <option value="">Sem responsavel</option>
                                <?php foreach ($attendants as $attendant) : ?>
                                    <option value="<?php echo e((string) $attendant['id']); ?>"><?php echo e($attendant['nome']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>Autorizado por <input name="autorizado_por"></label>
                        <label>Destino <input name="destino" placeholder="Cofre, banco, gerente"></label>
                        <label>Status
                            <select name="status">
                                <option value="lancado">Lancado</option>
                                <option value="conferido">Conferido</option>
                            </select>
                        </label>
                        <label class="full">Comprovante opcional <input type="file" name="anexo" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                        <label class="full">Observacao <textarea name="observacao" rows="2"></textarea></label>
                    </div>
                    <button class="btn primary full" type="submit">Salvar sangria</button>
                </form>
            </div>
            <div class="panel soft">
                <span class="kicker">Do dia</span>
                <h2>Sangrias em <?php echo e(br_date($date)); ?></h2>
                <div class="finance-entry-list">
                    <?php if (!$sangrias) : ?>
                        <p>Nenhuma sangria lancada para este dia.</p>
                    <?php endif; ?>
                    <?php foreach ($sangrias as $entry) : ?>
                        <article class="finance-entry <?php echo $entry['status'] === 'cancelado' ? 'is-cancelled' : ''; ?>">
                            <div>
                                <strong><?php echo e(br_money($entry['valor'])); ?> - <?php echo e($entry['motivo']); ?></strong>
                                <span><?php echo e((string) $entry['hora']); ?> | <?php echo e((string) $entry['status']); ?> | <?php echo e((string) ($entry['destino'] ?? '')); ?></span>
                            </div>
                            <?php if ($entry['status'] !== 'cancelado' && !$locked) : ?>
                                <form method="post" data-confirm-submit="Cancelar esta sangria?">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="cancel_sangria">
                                    <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                    <button class="btn compact danger" type="submit">Cancelar</button>
                                </form>
                                <details class="finance-entry-edit">
                                    <summary class="btn compact">Editar</summary>
                                    <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                                        <?php echo csrf_field(); ?>
                                        <input type="hidden" name="action" value="update_sangria">
                                        <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                        <div class="form-grid two-cols">
                                            <label>Data <input type="date" name="data" value="<?php echo e((string) $entry['data']); ?>"></label>
                                            <label>Hora <input type="time" name="hora" value="<?php echo e(substr((string) $entry['hora'], 0, 5)); ?>"></label>
                                            <label>Valor * <input data-money name="valor" value="<?php echo e(number_format((float) $entry['valor'], 2, ',', '.')); ?>"></label>
                                            <label>Motivo * <input name="motivo" value="<?php echo e((string) $entry['motivo']); ?>"></label>
                                            <label>Responsavel
                                                <select name="responsavel_id">
                                                    <option value="">Sem responsavel</option>
                                                    <?php foreach ($attendants as $attendant) : ?>
                                                        <option value="<?php echo e((string) $attendant['id']); ?>"<?php echo (int) ($entry['responsavel_id'] ?? 0) === (int) $attendant['id'] ? ' selected' : ''; ?>><?php echo e($attendant['nome']); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label>Autorizado por <input name="autorizado_por" value="<?php echo e((string) ($entry['autorizado_por'] ?? '')); ?>"></label>
                                            <label>Destino <input name="destino" value="<?php echo e((string) ($entry['destino'] ?? '')); ?>"></label>
                                            <label>Status
                                                <select name="status">
                                                    <?php foreach (array('lancado' => 'Lancado', 'conferido' => 'Conferido', 'cancelado' => 'Cancelado') as $statusValue => $statusLabel) : ?>
                                                        <option value="<?php echo e($statusValue); ?>"<?php echo (string) $entry['status'] === $statusValue ? ' selected' : ''; ?>><?php echo e($statusLabel); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label class="full">Novo comprovante opcional <input type="file" name="anexo" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                                            <label class="full">Observacao <textarea name="observacao" rows="2"><?php echo e((string) ($entry['observacao'] ?? '')); ?></textarea></label>
                                        </div>
                                        <button class="btn primary compact" type="submit">Salvar edicao</button>
                                    </form>
                                </details>
                            <?php endif; ?>
                        </article>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <section class="workspace-section finance-section" id="maquininhas">
        <div class="grid two">
            <div class="panel soft">
                <span class="kicker">Cartoes e PIX maquininha</span>
                <h2>Lancar maquininha</h2>
                <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="save_maquininha">
                    <div class="form-grid two-cols">
                        <label>Data <input type="date" name="data" value="<?php echo e($date); ?>"></label>
                        <label>Horario <input type="time" name="horario" value="<?php echo e(date('H:i')); ?>"></label>
                        <label>Operadora * <input name="operadora" placeholder="Mercado Pago, Stone, Cielo"></label>
                        <label>Tipo
                            <select name="tipo">
                                <option value="credito">Credito</option>
                                <option value="debito">Debito</option>
                                <option value="voucher">Voucher</option>
                                <option value="pix_maquininha">PIX maquininha</option>
                                <option value="outra">Outra</option>
                            </select>
                        </label>
                        <label>Valor bruto * <input data-money name="valor_bruto"></label>
                        <label>Taxa <input data-money name="taxa" value="0,00"></label>
                        <label>Bandeira <input name="bandeira" placeholder="Visa, Master, Elo"></label>
                        <label>NSU/codigo <input name="nsu"></label>
                        <label>Codigo comprovante <input name="codigo_comprovante"></label>
                        <label>Responsavel
                            <select name="responsavel_id">
                                <option value="">Sem responsavel</option>
                                <?php foreach ($attendants as $attendant) : ?>
                                    <option value="<?php echo e((string) $attendant['id']); ?>"><?php echo e($attendant['nome']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>Status
                            <select name="status_conciliacao">
                                <option value="pendente">Pendente</option>
                                <option value="conferido">Conferido</option>
                                <option value="divergente">Divergente</option>
                            </select>
                        </label>
                        <label>Comprovante <input type="file" name="anexo" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                        <label class="full">Observacao <textarea name="observacao" rows="2"></textarea></label>
                    </div>
                    <button class="btn primary full" type="submit">Salvar maquininha</button>
                </form>
            </div>
            <div class="panel soft">
                <span class="kicker">Do dia</span>
                <h2>Maquininhas em <?php echo e(br_date($date)); ?></h2>
                <div class="finance-entry-list">
                    <?php if (!$maquininhas) : ?>
                        <p>Nenhum lancamento de maquininha para este dia.</p>
                    <?php endif; ?>
                    <?php foreach ($maquininhas as $entry) : ?>
                        <article class="finance-entry <?php echo $entry['status_conciliacao'] === 'cancelado' ? 'is-cancelled' : ''; ?>">
                            <div>
                                <strong><?php echo e($entry['operadora']); ?> - <?php echo e(br_money($entry['valor_bruto'])); ?></strong>
                                <span><?php echo e((string) $entry['tipo']); ?> | Taxa <?php echo e(br_money($entry['taxa'])); ?> | Liquido <?php echo e(br_money($entry['valor_liquido'])); ?></span>
                            </div>
                            <?php if ($entry['status_conciliacao'] !== 'cancelado' && !$locked) : ?>
                                <form method="post" data-confirm-submit="Cancelar este lancamento?">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="cancel_maquininha">
                                    <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                    <button class="btn compact danger" type="submit">Cancelar</button>
                                </form>
                                <details class="finance-entry-edit">
                                    <summary class="btn compact">Editar</summary>
                                    <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                                        <?php echo csrf_field(); ?>
                                        <input type="hidden" name="action" value="update_maquininha">
                                        <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                        <div class="form-grid two-cols">
                                            <label>Data <input type="date" name="data" value="<?php echo e((string) $entry['data']); ?>"></label>
                                            <label>Horario <input type="time" name="horario" value="<?php echo e(substr((string) $entry['horario'], 0, 5)); ?>"></label>
                                            <label>Operadora * <input name="operadora" value="<?php echo e((string) $entry['operadora']); ?>"></label>
                                            <label>Tipo
                                                <select name="tipo">
                                                    <?php foreach (array('credito' => 'Credito', 'debito' => 'Debito', 'voucher' => 'Voucher', 'pix_maquininha' => 'PIX maquininha', 'outra' => 'Outra') as $tipoValue => $tipoLabel) : ?>
                                                        <option value="<?php echo e($tipoValue); ?>"<?php echo (string) $entry['tipo'] === $tipoValue ? ' selected' : ''; ?>><?php echo e($tipoLabel); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label>Valor bruto * <input data-money name="valor_bruto" value="<?php echo e(number_format((float) $entry['valor_bruto'], 2, ',', '.')); ?>"></label>
                                            <label>Taxa <input data-money name="taxa" value="<?php echo e(number_format((float) $entry['taxa'], 2, ',', '.')); ?>"></label>
                                            <label>Bandeira <input name="bandeira" value="<?php echo e((string) ($entry['bandeira'] ?? '')); ?>"></label>
                                            <label>NSU/codigo <input name="nsu" value="<?php echo e((string) ($entry['nsu'] ?? '')); ?>"></label>
                                            <label>Codigo comprovante <input name="codigo_comprovante" value="<?php echo e((string) ($entry['codigo_comprovante'] ?? '')); ?>"></label>
                                            <label>Responsavel
                                                <select name="responsavel_id">
                                                    <option value="">Sem responsavel</option>
                                                    <?php foreach ($attendants as $attendant) : ?>
                                                        <option value="<?php echo e((string) $attendant['id']); ?>"<?php echo (int) ($entry['responsavel_id'] ?? 0) === (int) $attendant['id'] ? ' selected' : ''; ?>><?php echo e($attendant['nome']); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label>Status
                                                <select name="status_conciliacao">
                                                    <?php foreach (array('pendente' => 'Pendente', 'conferido' => 'Conferido', 'divergente' => 'Divergente', 'cancelado' => 'Cancelado') as $statusValue => $statusLabel) : ?>
                                                        <option value="<?php echo e($statusValue); ?>"<?php echo (string) $entry['status_conciliacao'] === $statusValue ? ' selected' : ''; ?>><?php echo e($statusLabel); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label class="full">Novo comprovante opcional <input type="file" name="anexo" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                                            <label class="full">Observacao <textarea name="observacao" rows="2"><?php echo e((string) ($entry['observacao'] ?? '')); ?></textarea></label>
                                        </div>
                                        <button class="btn primary compact" type="submit">Salvar edicao</button>
                                    </form>
                                </details>
                            <?php endif; ?>
                        </article>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <section class="workspace-section finance-section" id="pix">
        <div class="grid two">
            <div class="panel soft">
                <span class="kicker">PIX separado</span>
                <h2>Lancar PIX</h2>
                <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="save_pix">
                    <div class="form-grid two-cols">
                        <label>Data <input type="date" name="data" value="<?php echo e($date); ?>"></label>
                        <label>Tipo
                            <select name="tipo">
                                <option value="banco">PIX banco</option>
                                <option value="maquininha">PIX maquininha</option>
                                <option value="divergente">PIX divergente</option>
                                <option value="ajuste">Ajuste PIX</option>
                            </select>
                        </label>
                        <label>Valor * <input data-money name="valor"></label>
                        <label>Origem <input name="origem" placeholder="Banco, maquininha, cliente"></label>
                        <label>Responsavel
                            <select name="responsavel_id">
                                <option value="">Sem responsavel</option>
                                <?php foreach ($attendants as $attendant) : ?>
                                    <option value="<?php echo e((string) $attendant['id']); ?>"><?php echo e($attendant['nome']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>Status
                            <select name="status">
                                <option value="pendente">Pendente</option>
                                <option value="conferido">Conferido</option>
                                <option value="divergente">Divergente</option>
                            </select>
                        </label>
                        <label class="full">Comprovante <input type="file" name="comprovante" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                        <label class="full">Observacao <textarea name="observacao" rows="2"></textarea></label>
                    </div>
                    <button class="btn primary full" type="submit">Salvar PIX</button>
                </form>
            </div>
            <div class="panel soft">
                <span class="kicker">Do dia</span>
                <h2>PIX em <?php echo e(br_date($date)); ?></h2>
                <div class="finance-entry-list">
                    <?php if (!$pixEntries) : ?>
                        <p>Nenhum PIX lancado para este dia.</p>
                    <?php endif; ?>
                    <?php foreach ($pixEntries as $entry) : ?>
                        <article class="finance-entry <?php echo $entry['status'] === 'cancelado' ? 'is-cancelled' : ''; ?>">
                            <div>
                                <strong><?php echo e((string) $entry['tipo']); ?> - <?php echo e(br_money($entry['valor'])); ?></strong>
                                <span><?php echo e((string) ($entry['origem'] ?? 'Sem origem')); ?> | <?php echo e((string) $entry['status']); ?></span>
                            </div>
                            <?php if ($entry['status'] !== 'cancelado' && !$locked) : ?>
                                <form method="post" data-confirm-submit="Cancelar este PIX?">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="cancel_pix">
                                    <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                    <button class="btn compact danger" type="submit">Cancelar</button>
                                </form>
                                <details class="finance-entry-edit">
                                    <summary class="btn compact">Editar</summary>
                                    <form method="post" enctype="multipart/form-data" data-no-enter-submit>
                                        <?php echo csrf_field(); ?>
                                        <input type="hidden" name="action" value="update_pix">
                                        <input type="hidden" name="id" value="<?php echo e((string) $entry['id']); ?>">
                                        <div class="form-grid two-cols">
                                            <label>Data <input type="date" name="data" value="<?php echo e((string) $entry['data']); ?>"></label>
                                            <label>Tipo
                                                <select name="tipo">
                                                    <?php foreach (array('banco' => 'PIX banco', 'maquininha' => 'PIX maquininha', 'divergente' => 'PIX divergente', 'ajuste' => 'Ajuste PIX') as $tipoValue => $tipoLabel) : ?>
                                                        <option value="<?php echo e($tipoValue); ?>"<?php echo (string) $entry['tipo'] === $tipoValue ? ' selected' : ''; ?>><?php echo e($tipoLabel); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label>Valor * <input data-money name="valor" value="<?php echo e(number_format((float) $entry['valor'], 2, ',', '.')); ?>"></label>
                                            <label>Origem <input name="origem" value="<?php echo e((string) ($entry['origem'] ?? '')); ?>"></label>
                                            <label>Responsavel
                                                <select name="responsavel_id">
                                                    <option value="">Sem responsavel</option>
                                                    <?php foreach ($attendants as $attendant) : ?>
                                                        <option value="<?php echo e((string) $attendant['id']); ?>"<?php echo (int) ($entry['responsavel_id'] ?? 0) === (int) $attendant['id'] ? ' selected' : ''; ?>><?php echo e($attendant['nome']); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label>Status
                                                <select name="status">
                                                    <?php foreach (array('pendente' => 'Pendente', 'conferido' => 'Conferido', 'divergente' => 'Divergente', 'cancelado' => 'Cancelado') as $statusValue => $statusLabel) : ?>
                                                        <option value="<?php echo e($statusValue); ?>"<?php echo (string) $entry['status'] === $statusValue ? ' selected' : ''; ?>><?php echo e($statusLabel); ?></option>
                                                    <?php endforeach; ?>
                                                </select>
                                            </label>
                                            <label class="full">Novo comprovante opcional <input type="file" name="comprovante" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"></label>
                                            <label class="full">Observacao <textarea name="observacao" rows="2"><?php echo e((string) ($entry['observacao'] ?? '')); ?></textarea></label>
                                        </div>
                                        <button class="btn primary compact" type="submit">Salvar edicao</button>
                                    </form>
                                </details>
                            <?php endif; ?>
                        </article>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <section class="workspace-section finance-section" id="relatorios">
        <div class="panel soft">
            <span class="kicker">Indicadores financeiros</span>
            <h2>Resumo do mes</h2>
            <div class="finance-report-grid">
                <article><span>Dias fechados</span><strong><?php echo e((string) $totals['fechados']); ?></strong></article>
                <article><span>Total caixa fisico</span><strong><?php echo e(br_money($totals['caixa_fisico'])); ?></strong></article>
                <article><span>Total cartao</span><strong><?php echo e(br_money($totals['cartao_total'])); ?></strong></article>
                <article><span>Total PIX banco</span><strong><?php echo e(br_money($totals['pix_banco_total'])); ?></strong></article>
                <article><span>Total PIX maquininha</span><strong><?php echo e(br_money($totals['pix_maquininha_total'])); ?></strong></article>
                <article><span>Total sangrias</span><strong><?php echo e(br_money($totals['sangria_total'])); ?></strong></article>
                <article><span>Total sobra/falta</span><strong class="<?php echo e(financeiro_diff_class((float) $totals['sobra_falta'])); ?>"><?php echo e(br_money($totals['sobra_falta'])); ?></strong></article>
                <article><span>Media sobra/falta</span><strong><?php echo e(br_money($totals['media_sobra_falta'] ?? 0)); ?></strong></article>
            </div>
            <h3>Maiores divergencias</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Data</th><th>Status</th><th>Sobra/Falta</th><th>Justificativa</th><th>Acoes</th></tr></thead>
                    <tbody>
                        <?php
                        $rankRows = array_values($closings);
                        usort($rankRows, function ($a, $b) {
                            return abs((float) $b['sobra_falta']) <=> abs((float) $a['sobra_falta']);
                        });
                        $rankRows = array_slice($rankRows, 0, 10);
                        ?>
                        <?php if (!$rankRows) : ?>
                            <tr><td colspan="5">Nenhum fechamento no mes.</td></tr>
                        <?php endif; ?>
                        <?php foreach ($rankRows as $row) : ?>
                            <tr>
                                <td><?php echo e(br_date($row['data_fechamento'])); ?></td>
                                <td><?php echo e(financeiro_status_label((string) $row['status'])); ?></td>
                                <td><?php echo e(br_money($row['sobra_falta'])); ?></td>
                                <td><?php echo e((string) ($row['justificativa'] ?? '')); ?></td>
                                <td><a class="btn compact" href="<?php echo e(app_url('financeiro.php?data=' . $row['data_fechamento'] . '&mes=' . $month . '&ano=' . $year . '#detalhe')); ?>">Abrir</a></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </section>

    <section class="workspace-section finance-section" id="exportacoes">
        <div class="grid two">
            <div class="panel soft">
                <span class="kicker">Backup e relatorio</span>
                <h2>Exportar dados</h2>
                <p>CSV abre no Excel e mantem os dados do banco como copia de seguranca.</p>
                <div class="form-actions">
                    <a class="btn primary" href="<?php echo e(app_url('financeiro-exportar.php?tipo=mensal&mes=' . $month . '&ano=' . $year)); ?>">Baixar CSV mensal</a>
                    <a class="btn" href="<?php echo e(app_url('financeiro-exportar.php?tipo=dia&data=' . $date)); ?>">Baixar CSV do dia</a>
                    <button class="btn" type="button" onclick="window.print()">Imprimir/PDF pelo navegador</button>
                </div>
            </div>
            <div class="panel soft">
                <span class="kicker">Importacao inicial</span>
                <h2>Importar CSV da planilha antiga</h2>
                <p>Exporte o Excel como CSV antes de importar. Datas ja existentes podem ser ignoradas ou atualizadas.</p>
                <form method="post" enctype="multipart/form-data" data-no-enter-submit data-confirm-submit="Importar dados do CSV financeiro?">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="import_csv">
                    <label>Arquivo CSV <input type="file" name="arquivo_csv" accept=".csv"></label>
                    <label class="check-row"><input type="checkbox" name="atualizar_existentes" value="1"> Atualizar datas ja existentes se estiverem abertas</label>
                    <button class="btn primary full" type="submit">Importar CSV</button>
                </form>
            </div>
        </div>
    </section>

    <section class="workspace-section finance-section" id="configuracoes">
        <div class="panel soft">
            <span class="kicker">Regras de fechamento</span>
            <h2>Configuracoes financeiras</h2>
            <form method="post" data-no-enter-submit>
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="save_config">
                <div class="form-grid two-cols">
                    <label>Limite de divergencia
                        <input data-money name="limite_divergencia" value="<?php echo e(number_format($limit, 2, ',', '.')); ?>">
                    </label>
                    <label>Formula operacional
                        <input value="<?php echo e(financeiro_setting('formula_total_conferido')); ?>" disabled>
                    </label>
                </div>
                <button class="btn primary" type="submit">Salvar configuracao</button>
            </form>
        </div>
    </section>

    <section class="workspace-section finance-section" id="auditoria">
        <div class="panel soft">
            <span class="kicker">Rastreabilidade</span>
            <h2>Auditoria financeira</h2>
            <p>Ultimas alteracoes registradas no banco: criacao, edicao, cancelamento, fechamento, reabertura, importacao e configuracoes.</p>
            <div class="table-wrap finance-audit-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Usuario</th>
                            <th>Acao</th>
                            <th>Tabela</th>
                            <th>ID</th>
                            <th>IP</th>
                            <th>Novo valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!$auditRows) : ?>
                            <tr><td colspan="7">Nenhum evento financeiro auditado ainda.</td></tr>
                        <?php endif; ?>
                        <?php foreach ($auditRows as $audit) : ?>
                            <tr>
                                <td><?php echo e((string) $audit['created_at']); ?></td>
                                <td><?php echo e((string) ($audit['username'] ?? ('#' . ($audit['usuario_id'] ?? '')))); ?></td>
                                <td><?php echo e((string) $audit['acao']); ?></td>
                                <td><?php echo e((string) $audit['tabela_afetada']); ?></td>
                                <td><?php echo e((string) $audit['registro_id']); ?></td>
                                <td><?php echo e((string) ($audit['ip'] ?? '')); ?></td>
                                <td><code><?php echo e(substr((string) ($audit['valor_novo'] ?? ''), 0, 220)); ?></code></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</section>

<?php require __DIR__ . '/footer.php'; ?>
