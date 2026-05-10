<?php
declare(strict_types=1);

if (!defined('MIAUW_FARMACIA_POPULAR_UF')) {
    define('MIAUW_FARMACIA_POPULAR_UF', 'PR');
}

if (!defined('MIAUW_FARMACIA_POPULAR_SOURCE_BVS')) {
    define('MIAUW_FARMACIA_POPULAR_SOURCE_BVS', 'https://bvsms.saude.gov.br/bvs/saudelegis/gm/2025/prt8407_10_11_2025.html');
}

if (!defined('MIAUW_FARMACIA_POPULAR_SOURCE_GOV')) {
    define('MIAUW_FARMACIA_POPULAR_SOURCE_GOV', 'https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/legislacao');
}

function miauw_fp_default_uf(): string
{
    $uf = strtoupper(trim((string) MIAUW_FARMACIA_POPULAR_UF));

    return preg_match('/^[A-Z]{2}$/', $uf) ? $uf : 'PR';
}

function miauw_fp_key(string $text): string
{
    $text = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($text) : strtolower($text);
    $text = strtolower($text);
    $text = preg_replace('/[^a-z0-9]+/i', ' ', $text) ?? $text;
    $text = preg_replace('/([0-9])([a-z])/i', '$1 $2', $text) ?? $text;
    $text = preg_replace('/([a-z])([0-9])/i', '$1 $2', $text) ?? $text;

    return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
}

function miauw_fp_money(float $value): string
{
    return function_exists('miauw_skill_money') ? miauw_skill_money($value) : 'R$ ' . number_format($value, 2, ',', '.');
}

function miauw_fp_parse_money_value(string $value): ?float
{
    $value = trim(html_entity_decode(strip_tags($value), ENT_QUOTES, 'UTF-8'));
    if ($value === '' || $value === '-' || $value === '--') {
        return null;
    }

    $clean = preg_replace('/[^\d,.\-]/', '', $value) ?? '';
    if ($clean === '') {
        return null;
    }

    if (strpos($clean, ',') !== false) {
        $clean = str_replace('.', '', $clean);
        $clean = str_replace(',', '.', $clean);
    }

    return is_numeric($clean) ? (float) $clean : null;
}

function miauw_fp_http_get(string $url): string
{
    if (function_exists('curl_init')) {
        $request = static function () use ($url): array {
            $ch = curl_init($url);
            curl_setopt_array($ch, array(
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 25,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_USERAGENT => 'Wimifarma Miauby/1.0',
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ));
            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            return array($body, $status, $error);
        };

        [$body, $status, $error] = $request();

        if (is_string($body) && $body !== '' && $status >= 200 && $status < 400) {
            return $body;
        }

        throw new RuntimeException('Falha ao consultar fonte oficial: HTTP ' . $status . ($error !== '' ? ' - ' . $error : ''));
    }

    $context = stream_context_create(array(
        'http' => array(
            'timeout' => 25,
            'header' => "User-Agent: Wimifarma Miauby/1.0\r\n",
        ),
    ));
    $body = @file_get_contents($url, false, $context);
    if (!is_string($body) || $body === '') {
        throw new RuntimeException('Falha ao consultar fonte oficial.');
    }

    return $body;
}

function miauw_fp_upsert_value(array $row): bool
{
    $uf = strtoupper(trim((string) ($row['uf'] ?? miauw_fp_default_uf())));
    $principio = trim((string) ($row['principio_ativo'] ?? ''));
    $apresentacao = trim((string) ($row['apresentacao'] ?? ''));
    $valor = (float) ($row['valor_referencia'] ?? 0);

    if ($uf === '' || $principio === '' || $apresentacao === '' || $valor <= 0) {
        return false;
    }

    $sourceTitle = trim((string) ($row['fonte_titulo'] ?? 'Ministerio da Saude'));
    $sourceUrl = trim((string) ($row['fonte_url'] ?? ''));
    $vigencia = trim((string) ($row['vigencia_inicio'] ?? ''));
    $unidade = trim((string) ($row['valor_unidade'] ?? 'unidade'));
    $observacao = trim((string) ($row['observacao'] ?? ''));
    $produtoChave = miauw_fp_key($principio . ' ' . $apresentacao . ' ' . ($row['aliases'] ?? ''));
    $fingerprint = sha1($uf . '|' . miauw_fp_key($principio) . '|' . miauw_fp_key($apresentacao));

    $stmt = db()->prepare(
        'INSERT INTO miauw_farmacia_popular_valores
            (uf, principio_ativo, apresentacao, produto_chave, valor_referencia, valor_unidade, fonte_titulo, fonte_url, vigencia_inicio, observacao, fingerprint, ativo, atualizado_em)
         VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE
            principio_ativo = VALUES(principio_ativo),
            apresentacao = VALUES(apresentacao),
            produto_chave = VALUES(produto_chave),
            valor_referencia = VALUES(valor_referencia),
            valor_unidade = VALUES(valor_unidade),
            fonte_titulo = VALUES(fonte_titulo),
            fonte_url = VALUES(fonte_url),
            vigencia_inicio = VALUES(vigencia_inicio),
            observacao = VALUES(observacao),
            ativo = 1,
            atualizado_em = NOW()'
    );

    return $stmt->execute(array(
        $uf,
        $principio,
        $apresentacao,
        $produtoChave,
        $valor,
        $unidade !== '' ? $unidade : 'unidade',
        $sourceTitle !== '' ? $sourceTitle : 'Ministerio da Saude',
        $sourceUrl,
        $vigencia !== '' ? $vigencia : null,
        $observacao,
        $fingerprint,
    ));
}

function miauw_fp_seed_defaults(): int
{
    $items = array(
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Cloridrato de metformina 500 mg',
            'apresentacao' => '1 (um) comprimido',
            'valor_referencia' => 0.15,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'metformina glifage glifage xr',
            'observacao' => 'Valor de referencia do Programa Farmacia Popular para UF PR.',
        ),
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Cloridrato de metformina 500 mg - acao prolongada',
            'apresentacao' => '1 (um) comprimido',
            'valor_referencia' => 0.25,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'metformina glifage glifage xr acao prolongada',
            'observacao' => 'Valor de referencia do Programa Farmacia Popular para UF PR.',
        ),
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Cloridrato de metformina 850 mg',
            'apresentacao' => '1 (um) comprimido',
            'valor_referencia' => 0.17,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'metformina glifage',
            'observacao' => 'Valor de referencia do Programa Farmacia Popular para UF PR.',
        ),
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Glibenclamida 5 mg',
            'apresentacao' => '1 (um) comprimido',
            'valor_referencia' => 0.09,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'glibenclamida',
            'observacao' => 'Valor de referencia do Programa Farmacia Popular para UF PR.',
        ),
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Dapagliflozina 10 mg',
            'apresentacao' => '1 (um) comprimido',
            'valor_referencia' => 2.57,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'dapagliflozina forxiga xigduo',
            'observacao' => 'Valor de referencia atualizado para UF PR a partir de 01/02/2026.',
        ),
        array(
            'uf' => 'PR',
            'principio_ativo' => 'Fralda geriatrica',
            'apresentacao' => '1 (uma) unidade',
            'valor_referencia' => 1.70,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'aliases' => 'fralda geriatrica fralda',
            'observacao' => 'Valor de referencia atualizado para UF PR a partir de 01/02/2026.',
        ),
    );

    $count = 0;
    foreach ($items as $item) {
        if (miauw_fp_upsert_value($item)) {
            $count++;
        }
    }

    return $count;
}

function miauw_fp_parse_bvs_rows(string $html, string $uf): array
{
    if (!class_exists('DOMDocument')) {
        return array();
    }

    $ufCodes = array('AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO');
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    if (!$loaded) {
        return array();
    }

    $rows = array();
    $xpath = new DOMXPath($dom);
    $prIndex = null;
    $firstUfIndex = null;

    foreach ($xpath->query('//tr') as $tr) {
        $cells = array();
        foreach ($tr->childNodes as $cell) {
            if (!in_array(strtolower($cell->nodeName), array('td', 'th'), true)) {
                continue;
            }

            $text = trim(preg_replace('/\s+/', ' ', $cell->textContent) ?? '');
            $cells[] = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        }

        if (!$cells) {
            continue;
        }

        $upperCells = array_map(static function (string $cell): string {
            return strtoupper(trim($cell));
        }, $cells);
        $ufHits = array_intersect($upperCells, $ufCodes);
        if ($ufHits) {
            foreach ($upperCells as $index => $cell) {
                if (in_array($cell, $ufCodes, true)) {
                    $firstUfIndex = $firstUfIndex === null ? $index : min($firstUfIndex, $index);
                }

                if ($cell === $uf) {
                    $prIndex = $index;
                }
            }
            continue;
        }

        if ($prIndex === null || $firstUfIndex === null || !array_key_exists($prIndex, $cells)) {
            continue;
        }

        $value = miauw_fp_parse_money_value((string) $cells[$prIndex]);
        if ($value === null || $value <= 0) {
            continue;
        }

        $descriptorCells = array_values(array_filter(array_slice($cells, 0, $firstUfIndex), static function ($cell): bool {
            return trim((string) $cell) !== '';
        }));

        if (count($descriptorCells) < 2) {
            continue;
        }

        $principio = trim((string) $descriptorCells[0]);
        $apresentacao = trim(implode(' ', array_slice($descriptorCells, 1)));
        if ($principio === '' || $apresentacao === '') {
            continue;
        }

        $key = miauw_fp_key($principio . ' ' . $apresentacao);
        if ($key === '' || strpos($key, 'valor referencia') !== false || strpos($key, 'programa farmacia') !== false) {
            continue;
        }

        $rows[] = array(
            'uf' => $uf,
            'principio_ativo' => $principio,
            'apresentacao' => $apresentacao,
            'valor_referencia' => $value,
            'fonte_titulo' => 'Portaria GM/MS 8.407/2025 - Anexo, com redacao da Portaria GM/MS 9.210/2025',
            'fonte_url' => MIAUW_FARMACIA_POPULAR_SOURCE_BVS,
            'vigencia_inicio' => '2026-02-01',
            'observacao' => 'Linha importada da tabela oficial BVS/MS para UF ' . $uf . '.',
        );
    }

    return $rows;
}

function miauw_fp_update_from_official_sources(): array
{
    if (function_exists('miauw_ensure_schema')) {
        miauw_ensure_schema();
    }

    $logId = 0;
    try {
        $stmt = db()->prepare(
            'INSERT INTO miauw_farmacia_popular_atualizacoes (status, fonte_url, mensagem, itens, started_at)
             VALUES (?, ?, ?, 0, NOW())'
        );
        $stmt->execute(array('parcial', MIAUW_FARMACIA_POPULAR_SOURCE_BVS, 'Atualizacao iniciada.'));
        $logId = (int) db()->lastInsertId();
    } catch (Throwable $error) {
        error_log('Miauby farmacia popular update log failed: ' . $error->getMessage());
    }

    $uf = miauw_fp_default_uf();
    $seeded = miauw_fp_seed_defaults();
    $imported = 0;
    $messages = array();

    try {
        $html = miauw_fp_http_get(MIAUW_FARMACIA_POPULAR_SOURCE_BVS);
        $rows = miauw_fp_parse_bvs_rows($html, $uf);
        foreach ($rows as $row) {
            if (miauw_fp_upsert_value($row)) {
                $imported++;
            }
        }

        $messages[] = $imported > 0
            ? 'Tabela oficial BVS/MS importada para UF ' . $uf . '.'
            : 'Fonte oficial consultada, mas nenhuma linha nova foi reconhecida automaticamente.';
    } catch (Throwable $error) {
        error_log('Miauby farmacia popular BVS update failed: ' . $error->getMessage());
        $messages[] = 'Nao foi possivel importar automaticamente a tabela BVS/MS agora; valores locais foram preservados.';
    }

    $overrides = miauw_fp_seed_defaults();
    $total = $imported + $overrides;
    $status = $imported > 0 ? 'ok' : 'parcial';
    $message = implode(' ', $messages) . ' Bases essenciais PR conferidas: ' . $seeded . '.';

    try {
        if ($logId > 0) {
            $stmt = db()->prepare(
                'UPDATE miauw_farmacia_popular_atualizacoes
                 SET status = ?, mensagem = ?, itens = ?, finished_at = NOW()
                 WHERE id = ?'
            );
            $stmt->execute(array($status, $message, $total, $logId));
        }
    } catch (Throwable $error) {
        error_log('Miauby farmacia popular update finish log failed: ' . $error->getMessage());
    }

    return array(
        'ok' => true,
        'status' => $status,
        'uf' => $uf,
        'imported' => $imported,
        'seeded' => $seeded,
        'items' => $total,
        'message' => $message,
        'time' => date('Y-m-d H:i:s'),
    );
}

function miauw_fp_message_matches(string $message): bool
{
    $key = miauw_fp_key($message);
    $terms = array(
        'farmacia popular',
        'programa farmacia',
        'valor referencia',
        'valor de referencia',
        'reembolso farmacia',
        'quanto paga',
        'quantos paga',
        'glifage',
        'metformina',
        'glibenclamida',
        'dapagliflozina',
        'forxiga',
        'xigduo',
        'fralda geriatrica',
    );

    foreach ($terms as $term) {
        if (strpos($key, miauw_fp_key($term)) !== false) {
            return true;
        }
    }

    return false;
}

function miauw_fp_extract_search(string $message): string
{
    $key = miauw_fp_key($message);
    $key = str_replace('glifage xr', 'metformina acao prolongada', $key);
    $key = str_replace('glifage', 'metformina', $key);
    $key = str_replace(array('forxiga', 'xigduo'), 'dapagliflozina', $key);

    $phrases = array(
        'programa farmacia popular',
        'farmacia popular',
        'valor de referencia',
        'valor referencia',
        'quanto paga',
        'quantos paga',
        'quanto o governo paga',
        'no parana',
        'parana',
        'no pr',
        'uf pr',
        'reembolso',
    );

    foreach ($phrases as $phrase) {
        $key = str_replace(miauw_fp_key($phrase), ' ', $key);
    }

    $key = preg_replace('/\b(o|a|os|as|do|da|dos|das|de|em|na|no|para|por|paga|valor|referencia|medicamento|remedio)\b/', ' ', $key) ?? $key;

    return trim(preg_replace('/\s+/', ' ', $key) ?? $key);
}

function miauw_fp_lookup(string $message, ?string $uf = null, int $limit = 8): array
{
    if (function_exists('miauw_ensure_schema')) {
        miauw_ensure_schema();
    }

    miauw_fp_seed_defaults();

    $uf = strtoupper(trim((string) ($uf ?: miauw_fp_default_uf())));
    if (!preg_match('/^[A-Z]{2}$/', $uf)) {
        $uf = miauw_fp_default_uf();
    }

    $needle = miauw_fp_extract_search($message);
    if ($needle === '' && !miauw_fp_message_matches($message)) {
        return array();
    }

    $tokens = array_values(array_filter(explode(' ', $needle), static function ($token): bool {
        return strlen($token) >= 2;
    }));
    $numbers = array_values(array_filter($tokens, static function ($token): bool {
        return preg_match('/^\d+$/', $token) === 1;
    }));

    $stmt = db()->prepare(
        'SELECT id, uf, principio_ativo, apresentacao, produto_chave, valor_referencia, valor_unidade, fonte_titulo, fonte_url, vigencia_inicio, atualizado_em, observacao
         FROM miauw_farmacia_popular_valores
         WHERE uf = ? AND ativo = 1
         ORDER BY principio_ativo ASC, apresentacao ASC
         LIMIT 800'
    );
    $stmt->execute(array($uf));
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: array();

    $scored = array();
    foreach ($rows as $row) {
        $haystack = miauw_fp_key((string) ($row['produto_chave'] ?? '') . ' ' . (string) ($row['principio_ativo'] ?? '') . ' ' . (string) ($row['apresentacao'] ?? ''));
        $score = 0;

        if ($needle !== '' && strpos($haystack, $needle) !== false) {
            $score += 12;
        }

        foreach ($tokens as $token) {
            if (strpos($haystack, $token) !== false) {
                $score += preg_match('/^\d+$/', $token) ? 5 : 3;
            }
        }

        foreach ($numbers as $number) {
            if (preg_match('/(^|[^0-9])' . preg_quote($number, '/') . '([^0-9]|$)/', $haystack)) {
                $score += 8;
            }
        }

        if ($score <= 0 && miauw_fp_message_matches($message)) {
            if (strpos($haystack, 'metformina') !== false && strpos(miauw_fp_key($message), 'glifage') !== false) {
                $score = 6;
            }
        }

        if ($score > 0) {
            $row['_score'] = $score;
            $scored[] = $row;
        }
    }

    usort($scored, static function (array $a, array $b): int {
        $scoreCompare = (int) ($b['_score'] ?? 0) <=> (int) ($a['_score'] ?? 0);
        if ($scoreCompare !== 0) {
            return $scoreCompare;
        }

        return strcmp((string) ($a['principio_ativo'] ?? ''), (string) ($b['principio_ativo'] ?? ''));
    });

    return array_slice($scored, 0, max(1, $limit));
}

function miauw_fp_recent_update_line(): string
{
    try {
        $stmt = db()->query(
            'SELECT status, mensagem, finished_at, started_at
             FROM miauw_farmacia_popular_atualizacoes
             ORDER BY id DESC
             LIMIT 1'
        );
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
        if (!$row) {
            return 'Atualizacao automatica: ainda sem execucao registrada.';
        }

        $time = (string) ($row['finished_at'] ?: $row['started_at'] ?: '');
        return 'Ultima atualizacao automatica: ' . (string) $row['status'] . ($time !== '' ? ' em ' . date('d/m/Y H:i', strtotime($time)) : '') . '.';
    } catch (Throwable $error) {
        return 'Atualizacao automatica: status indisponivel agora.';
    }
}

function miauw_fp_context_for_message(string $message, ?string $uf = null): string
{
    if (!miauw_fp_message_matches($message)) {
        return '';
    }

    $uf = strtoupper(trim((string) ($uf ?: miauw_fp_default_uf())));
    $rows = miauw_fp_lookup($message, $uf, 6);
    $lines = array(
        'FARMACIA POPULAR - VALOR DE REFERENCIA',
        'UF usada: ' . $uf . ' (Parana).',
        'Regra: responda como valor de referencia/reembolso do programa, nao como preco de venda da farmacia.',
    );

    if (!$rows) {
        $lines[] = 'Nao achei medicamento/apresentacao local com esse texto. Peca o principio ativo e a apresentacao, tipo `metformina 500mg` ou `dapagliflozina 10mg`.';
        $lines[] = miauw_fp_recent_update_line();

        return implode("\n", $lines);
    }

    foreach ($rows as $row) {
        $vigencia = (string) ($row['vigencia_inicio'] ?? '');
        $fonte = trim((string) ($row['fonte_titulo'] ?? 'Fonte oficial'));
        $lines[] = '- ' . (string) $row['principio_ativo'] . ' ' . (string) $row['apresentacao']
            . ': ' . miauw_fp_money((float) $row['valor_referencia'])
            . ' por ' . (string) ($row['valor_unidade'] ?: 'unidade')
            . ($vigencia !== '' ? ' (vigencia ' . date('d/m/Y', strtotime($vigencia)) . ')' : '')
            . '. Fonte: ' . $fonte . '.';
    }

    $lines[] = 'Nota: nome comercial como Glifage precisa bater no cadastro com metformina e apresentacao correta.';
    $lines[] = miauw_fp_recent_update_line();

    return implode("\n", $lines);
}

function miauw_fp_tool_result(string $produto, ?string $uf = null): string
{
    $produto = trim($produto);
    if ($produto === '') {
        return 'Informe produto/principio ativo e apresentacao. Exemplo: metformina 500mg.';
    }

    return miauw_fp_context_for_message('farmacia popular ' . $produto, $uf ?: miauw_fp_default_uf());
}

function miauw_fp_reply_for_message(string $message, ?string $uf = null): string
{
    if (!miauw_fp_message_matches($message)) {
        return '';
    }

    $uf = strtoupper(trim((string) ($uf ?: miauw_fp_default_uf())));
    $rows = miauw_fp_lookup($message, $uf, 5);

    if (!$rows) {
        return "Farmacia Popular PR consultada.\n"
            . "Nao achei esse produto/apresentacao na base local. Me mande principio ativo e apresentacao, tipo `metformina 500mg` ou `dapagliflozina 10mg`. Sem isso eu viro oraculo barato, e farmacia nao merece esse teatro.";
    }

    $lines = array(
        'Farmacia Popular PR: valor de referencia/reembolso, nao preco de venda.',
    );

    foreach ($rows as $row) {
        $vigencia = (string) ($row['vigencia_inicio'] ?? '');
        $lines[] = '- ' . (string) $row['principio_ativo'] . ' ' . (string) $row['apresentacao']
            . ': ' . miauw_fp_money((float) $row['valor_referencia'])
            . ($vigencia !== '' ? ' desde ' . date('d/m/Y', strtotime($vigencia)) : '');
    }

    if (strpos(miauw_fp_key($message), 'glifage') !== false) {
        $lines[] = 'Glifage e nome comercial: confira se o cadastro/apresentacao esta como metformina, principalmente se for XR/acao prolongada.';
    }

    $lines[] = 'Fonte: tabela oficial Ministerio da Saude/BVS salva no Miauby.';

    return implode("\n", $lines);
}
