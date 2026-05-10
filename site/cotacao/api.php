<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function cotacao_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    echo is_string($json) ? $json : '{"ok":false,"message":"Nao consegui montar a resposta da Cotacao agora."}';
    exit;
}

function cotacao_api_verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        cotacao_json(array('ok' => false, 'message' => 'Sessao expirada. Atualize a pagina.'), 419);
    }
}

function cotacao_api_block(): array
{
    $slug = trim((string) ($_POST['bloco'] ?? 'cotacao-geral'));
    $block = cotacao_block_by_slug($slug);

    if (!$block) {
        cotacao_json(array('ok' => false, 'message' => 'Cotacao nao encontrada.'), 404);
    }

    return $block;
}

function cotacao_api_require_user(): array
{
    $user = current_user();

    if (!$user) {
        cotacao_json(array('ok' => false, 'message' => 'Sessao expirada. Entre novamente na Cotacao.'), 401);
    }

    return $user;
}

function cotacao_api_row_has_content(array $row, array $prices): bool
{
    foreach (array('ean', 'produto', 'quantidade', 'categoria') as $key) {
        if (trim((string) ($row[$key] ?? '')) !== '') {
            return true;
        }
    }

    foreach ($prices as $price) {
        if (trim((string) $price) !== '') {
            return true;
        }
    }

    return false;
}

cotacao_api_require_user();
cotacao_api_verify_csrf();

try {
    cotacao_ensure_schema();
    $block = cotacao_api_block();
    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'save_row') {
        $row = array(
            'id' => (int) ($_POST['id'] ?? 0),
            'ean' => (string) ($_POST['ean'] ?? ''),
            'produto' => (string) ($_POST['produto'] ?? ''),
            'quantidade' => (string) ($_POST['quantidade'] ?? ''),
            'categoria' => (string) ($_POST['categoria'] ?? ''),
            'cor' => (string) ($_POST['cor'] ?? ''),
            'cores' => (string) ($_POST['cores'] ?? ''),
            'estilos' => (string) ($_POST['estilos'] ?? ''),
            'ordem' => (int) ($_POST['ordem'] ?? 0),
            'linha_vazia' => (string) ($_POST['linha_vazia'] ?? '0'),
            'campos' => (string) ($_POST['campos'] ?? ''),
            'precos_alterados' => (string) ($_POST['precos_alterados'] ?? ''),
        );
        $prices = is_array($_POST['precos'] ?? null) ? $_POST['precos'] : array();

        $rowId = (int) $row['id'];
        $hasPatchMeta = trim($row['campos']) !== '' || trim($row['precos_alterados']) !== '';
        $hasContent = cotacao_api_row_has_content($row, $prices);

        if (!$hasContent) {
            $row['ean'] = '';
            $row['produto'] = '';
            $row['quantidade'] = '';
            $row['categoria'] = '';
            $row['linha_vazia'] = '1';
            $row['campos'] = 'ean,produto,quantidade,categoria,cor,cores,estilos,ordem,linha_vazia,prioridade,status,observacao';
            $row['precos_alterados'] = implode(',', array_map('strval', array_keys($prices)));
            $hasPatchMeta = true;
        } else {
            $row['linha_vazia'] = '0';
            $row['campos'] = trim($row['campos']) === ''
                ? 'ordem,linha_vazia'
                : $row['campos'] . ',ordem,linha_vazia';
        }

        if ($hasContent && trim($row['produto']) === '' && ($rowId <= 0 || !$hasPatchMeta)) {
            cotacao_json(array('ok' => true, 'waiting' => true, 'message' => 'Aguardando produto.'));
        }

        $itemId = cotacao_save_item((int) $block['id'], $row, $prices);
        $savedItem = cotacao_item((int) $block['id'], $itemId);
        $winnerName = '';

        if ($savedItem && !empty($savedItem['vencedor_fornecedor_id'])) {
            $winnerStmt = db()->prepare('SELECT nome FROM cotacao_fornecedores WHERE id = ? LIMIT 1');
            $winnerStmt->execute(array((int) $savedItem['vencedor_fornecedor_id']));
            $winnerName = (string) $winnerStmt->fetchColumn();
        }

        cotacao_json(array(
            'ok' => true,
            'item_id' => $itemId,
            'ordem' => $savedItem ? (int) ($savedItem['ordem'] ?? 0) : (int) $row['ordem'],
            'linha_vazia' => $savedItem ? (int) ($savedItem['linha_vazia'] ?? 0) : (int) $row['linha_vazia'],
            'winner' => ($savedItem && $winnerName !== '') ? $winnerName . ' - ' . br_money((float) $savedItem['vencedor_preco']) : 'Sem vencedor',
            'winner_supplier_id' => $savedItem ? (int) ($savedItem['vencedor_fornecedor_id'] ?? 0) : 0,
            'encomenda_registrada_em' => $savedItem ? (string) ($savedItem['encomenda_registrada_em'] ?? '') : '',
            'encomenda_registrada_label' => $savedItem ? cotacao_order_registered_label($savedItem['encomenda_registrada_em'] ?? null) : '',
            'categories' => cotacao_categories((int) $block['id']),
            'sync' => cotacao_sync_state((int) $block['id']),
            'message' => 'Salvo.',
        ));
    }

    if ($action === 'add_empty_rows') {
        $amount = max(1, min(50, (int) ($_POST['amount'] ?? 10)));
        $created = cotacao_add_empty_rows((int) $block['id'], $amount);

        cotacao_json(array(
            'ok' => true,
            'created' => $created,
            'snapshot' => cotacao_sync_snapshot((int) $block['id']),
            'message' => $amount . ' linha(s) adicionada(s).',
        ));
    }

    if ($action === 'delete_row') {
        $itemId = (int) ($_POST['id'] ?? 0);

        if ($itemId <= 0) {
            cotacao_json(array('ok' => false, 'message' => 'Linha invalida.'), 422);
        }

        cotacao_cancel_item((int) $block['id'], $itemId);
        cotacao_json(array(
            'ok' => true,
            'categories' => cotacao_categories((int) $block['id']),
            'sync' => cotacao_sync_state((int) $block['id']),
            'message' => 'Linha excluida.',
        ));
    }

    if ($action === 'add_category') {
        $category = cotacao_add_category((int) $block['id'], (string) ($_POST['nome'] ?? ''));
        cotacao_json(array('ok' => true, 'category' => $category, 'categories' => cotacao_categories((int) $block['id']), 'sync' => cotacao_sync_state((int) $block['id'])));
    }

    if ($action === 'delete_category') {
        cotacao_delete_category((int) $block['id'], (string) ($_POST['nome'] ?? ''));
        cotacao_json(array('ok' => true, 'categories' => cotacao_categories((int) $block['id']), 'sync' => cotacao_sync_state((int) $block['id'])));
    }

    if ($action === 'add_supplier') {
        $supplier = cotacao_add_supplier((int) $block['id'], (string) ($_POST['nome'] ?? ''));
        cotacao_json(array('ok' => true, 'supplier' => $supplier, 'sync' => cotacao_sync_state((int) $block['id'])));
    }

    if ($action === 'rename_supplier') {
        $supplier = cotacao_rename_supplier((int) $block['id'], (int) ($_POST['fornecedor_id'] ?? 0), (string) ($_POST['nome'] ?? ''));
        cotacao_json(array('ok' => true, 'supplier' => $supplier, 'sync' => cotacao_sync_state((int) $block['id'])));
    }

    if ($action === 'delete_supplier') {
        cotacao_disable_supplier((int) $block['id'], (int) ($_POST['fornecedor_id'] ?? 0));
        cotacao_json(array('ok' => true, 'sync' => cotacao_sync_state((int) $block['id']), 'message' => 'Coluna removida.'));
    }

    if ($action === 'conditional_rules') {
        cotacao_json(array('ok' => true, 'rules' => cotacao_conditional_rules((int) $block['id'])));
    }

    if ($action === 'save_conditional_rule') {
        $rule = cotacao_save_conditional_rule((int) $block['id'], array(
            'id' => (int) ($_POST['id'] ?? 0),
            'coluna_chave' => (string) ($_POST['coluna_chave'] ?? ''),
            'operador' => (string) ($_POST['operador'] ?? 'contains'),
            'termo' => (string) ($_POST['termo'] ?? ''),
            'cor_fundo' => (string) ($_POST['cor_fundo'] ?? ''),
        ));

        cotacao_json(array(
            'ok' => true,
            'rule' => $rule,
            'rules' => cotacao_conditional_rules((int) $block['id']),
            'sync' => cotacao_sync_state((int) $block['id']),
            'message' => 'Condicao salva.',
        ));
    }

    if ($action === 'delete_conditional_rule') {
        $ruleId = (int) ($_POST['id'] ?? 0);

        if ($ruleId <= 0) {
            cotacao_json(array('ok' => false, 'message' => 'Regra invalida.'), 422);
        }

        cotacao_delete_conditional_rule((int) $block['id'], $ruleId);
        cotacao_json(array(
            'ok' => true,
            'rules' => cotacao_conditional_rules((int) $block['id']),
            'sync' => cotacao_sync_state((int) $block['id']),
            'message' => 'Condicao removida.',
        ));
    }

    if ($action === 'sync_filter') {
        $state = cotacao_sync_update_filter((int) $block['id'], array(
            'categoria' => (string) ($_POST['categoria'] ?? ''),
            'cor' => (string) ($_POST['cor'] ?? ''),
            'vencedor' => (string) ($_POST['vencedor'] ?? ''),
        ));

        cotacao_json(array('ok' => true, 'state' => $state, 'message' => 'Filtro sincronizado.'));
    }

    if ($action === 'sync_pull') {
        $knownVersion = max(0, (int) ($_POST['known_version'] ?? 0));
        $knownDataVersion = array_key_exists('known_data_version', $_POST)
            ? max(0, (int) ($_POST['known_data_version'] ?? 0))
            : $knownVersion;
        $knownFilterVersion = array_key_exists('known_filter_version', $_POST)
            ? max(0, (int) ($_POST['known_filter_version'] ?? 0))
            : $knownVersion;
        $knownStructureVersion = max(0, (int) ($_POST['known_structure_version'] ?? 0));
        $state = cotacao_sync_state((int) $block['id']);
        $dataChanged = $knownDataVersion <= 0 || $knownDataVersion < (int) $state['dados_versao'];
        $filterChanged = $knownFilterVersion <= 0 || $knownFilterVersion < (int) $state['filtro_versao'];
        $structureChanged = $knownStructureVersion <= 0 || $knownStructureVersion < (int) $state['estrutura_versao'];

        if (
            !$dataChanged
            && !$filterChanged
            && !$structureChanged
        ) {
            cotacao_json(array(
                'ok' => true,
                'changed' => false,
                'state' => $state,
                'message' => 'Sem alteracao.',
            ));
        }

        cotacao_json(array(
            'ok' => true,
            'changed' => true,
            'data_changed' => $dataChanged,
            'filter_changed' => $filterChanged,
            'structure_changed' => $structureChanged,
            'snapshot' => cotacao_sync_snapshot((int) $block['id']),
            'message' => 'Cotacao sincronizada.',
        ));
    }

    cotacao_json(array('ok' => false, 'message' => 'Acao invalida.'), 400);
} catch (Throwable $error) {
    $status = $error instanceof InvalidArgumentException ? 422 : 500;
    cotacao_json(array('ok' => false, 'message' => cotacao_public_error($error)), $status);
}
