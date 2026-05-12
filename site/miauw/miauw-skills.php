<?php
declare(strict_types=1);

function miauw_skill_text(string $text): string
{
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');

    return $text;
}

function miauw_skill_lower(string $text): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($text, 'UTF-8');
    }

    return strtolower($text);
}

function miauw_skill_normalized(string $text): string
{
    $lower = miauw_skill_lower($text);
    $converted = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT', $lower) : $lower;

    return is_string($converted) ? $converted : $lower;
}

function miauw_skill_has_any(string $text, array $terms): bool
{
    $lower = miauw_skill_normalized($text);

    foreach ($terms as $term) {
        if ($term !== '' && strpos($lower, miauw_skill_normalized((string) $term)) !== false) {
            return true;
        }
    }

    return false;
}

function miauw_skill_table_exists(string $table): bool
{
    try {
        if (function_exists('schema_table_exists')) {
            return schema_table_exists($table);
        }

        $stmt = db()->prepare(
            'SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?'
        );
        $stmt->execute(array($table));

        return (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $error) {
        error_log('Miauby skill table check failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_skill_column_exists(string $table, string $column): bool
{
    try {
        if (function_exists('schema_column_exists')) {
            return schema_column_exists($table, $column);
        }

        $stmt = db()->prepare(
            'SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?'
        );
        $stmt->execute(array($table, $column));

        return (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $error) {
        error_log('Miauby skill column check failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_skill_money($value): string
{
    if (function_exists('br_money')) {
        return br_money((float) $value);
    }

    return 'R$ ' . number_format((float) $value, 2, ',', '.');
}

function miauw_skill_registry(): array
{
    static $registry = null;

    if (is_array($registry)) {
        return $registry;
    }

    $registry = array(
        'resumo_financeiro' => array(
            'nome' => 'resumo_financeiro',
            'titulo' => 'Resumo financeiro',
            'modulo' => 'financeiro',
            'nivel' => 'leitura',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_financeiro_summary',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('mes', 'ano'),
            'saida' => 'Resumo textual de fechamentos, divergencias e lancamentos.',
            'auditoria' => array(),
            'efeitos' => array(),
        ),
        'resumo_cashback' => array(
            'nome' => 'resumo_cashback',
            'titulo' => 'Resumo cashback',
            'modulo' => 'cashback',
            'nivel' => 'leitura',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_cashback_summary',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('mes', 'ano'),
            'saida' => 'Resumo textual de compras, creditos, resgates e saldo ativo.',
            'auditoria' => array(),
            'efeitos' => array(),
        ),
        'resumo_cotacao' => array(
            'nome' => 'resumo_cotacao',
            'titulo' => 'Resumo cotacao',
            'modulo' => 'cotacao',
            'nivel' => 'leitura',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_cotacao_summary',
            'openai_tool' => false,
            'local_action' => false,
            'entrada' => array('mes', 'ano'),
            'saida' => 'Resumo textual de itens, urgentes, encomendas e blocos ativos.',
            'auditoria' => array(),
            'efeitos' => array(),
        ),
        'buscar_cliente' => array(
            'nome' => 'buscar_cliente',
            'titulo' => 'Buscar cliente',
            'modulo' => 'cashback',
            'nivel' => 'leitura',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_client_lookup',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('busca'),
            'saida' => 'Lista resumida com dados mascarados.',
            'auditoria' => array(),
            'efeitos' => array('nao_expor_telefone_completo'),
        ),
        'buscar_cotacao' => array(
            'nome' => 'buscar_cotacao',
            'titulo' => 'Buscar cotacao',
            'modulo' => 'cotacao',
            'nivel' => 'leitura',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_cotacao_lookup',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('busca'),
            'saida' => 'Itens encontrados por produto, EAN, categoria ou fornecedor.',
            'auditoria' => array(),
            'efeitos' => array(),
        ),
        'farmacia_popular_valor' => array(
            'nome' => 'farmacia_popular_valor',
            'titulo' => 'Farmacia Popular',
            'modulo' => 'farmacia_popular',
            'nivel' => 'leitura',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_fp_tool_result',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('produto', 'uf'),
            'saida' => 'Valor de referencia/reembolso com fonte quando disponivel.',
            'auditoria' => array(),
            'efeitos' => array('nao_substitui_conferencia_oficial'),
        ),
        'pesquisa_web_referencias' => array(
            'nome' => 'pesquisa_web_referencias',
            'titulo' => 'Pesquisa web controlada',
            'modulo' => 'externo',
            'nivel' => 'leitura',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_web_references_text',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('consulta', 'limite'),
            'saida' => 'Referencias externas com titulo, trecho e link.',
            'auditoria' => array(),
            'efeitos' => array('citar_fontes', 'nao_transformar_snippet_em_verdade'),
        ),
        'noticias_medicamentos_oficiais' => array(
            'nome' => 'noticias_medicamentos_oficiais',
            'titulo' => 'Noticias oficiais de medicamentos',
            'modulo' => 'externo',
            'nivel' => 'leitura',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_web_official_medicine_news_text',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('limite'),
            'saida' => 'Comunicados/noticias de fontes oficiais.',
            'auditoria' => array(),
            'efeitos' => array('sem_orientacao_clinica'),
        ),
        'mapa_sistema' => array(
            'nome' => 'mapa_sistema',
            'titulo' => 'Mapa do sistema',
            'modulo' => 'sistema',
            'nivel' => 'diagnostico',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_system_map_cached',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array(),
            'saida' => 'Mapa de telas, rotas, arquivos, endpoints e acoes.',
            'auditoria' => array(),
            'efeitos' => array(),
        ),
        'alertas_operacionais' => array(
            'nome' => 'alertas_operacionais',
            'titulo' => 'Alertas operacionais',
            'modulo' => 'sistema',
            'nivel' => 'diagnostico',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_intelligence_diagnostic_text',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('modulo', 'forcar_varredura'),
            'saida' => 'Alertas, riscos e pendencias detectados.',
            'auditoria' => array('miauw_alertas', 'miauw_alerta_eventos'),
            'efeitos' => array('pode_varrer_alertas'),
        ),
        'diagnostico_operacional' => array(
            'nome' => 'diagnostico_operacional',
            'titulo' => 'Diagnostico operacional',
            'modulo' => 'sistema',
            'nivel' => 'sugestao',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_intelligence_process_validation_reply',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('modulo'),
            'saida' => 'Validacao de processo com proximos passos.',
            'auditoria' => array('miauw_alertas', 'miauw_padroes'),
            'efeitos' => array('nao_altera_dados_operacionais'),
        ),
        'memoria_operacional' => array(
            'nome' => 'memoria_operacional',
            'titulo' => 'Memoria operacional',
            'modulo' => 'sistema',
            'nivel' => 'leitura',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_memory_context_for_message',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array('consulta'),
            'saida' => 'Memorias e padroes relevantes para a consulta.',
            'auditoria' => array('miauw_memorias', 'miauw_padroes'),
            'efeitos' => array('nao_expor_segredos'),
        ),
        'diagnostico_skills' => array(
            'nome' => 'diagnostico_skills',
            'titulo' => 'Diagnostico de skills',
            'modulo' => 'miauby',
            'nivel' => 'diagnostico',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_registry_diagnostics',
            'openai_tool' => true,
            'local_action' => false,
            'entrada' => array(),
            'saida' => 'Inventario seguro das skills registradas.',
            'auditoria' => array(),
            'efeitos' => array('nao_exibe_segredos'),
        ),
        'criar_tarefa' => array(
            'nome' => 'criar_tarefa',
            'titulo' => 'Criar tarefa',
            'modulo' => 'tarefa',
            'nivel' => 'escrita',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_tarefa',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('titulo', 'descricao', 'prioridade'),
            'saida' => 'Tarefa criada com status aberta.',
            'auditoria' => array('wf_tarefas', 'wf_logs'),
            'efeitos' => array('cria_registro'),
        ),
        'criar_encomenda_cotacao' => array(
            'nome' => 'criar_encomenda_cotacao',
            'titulo' => 'Criar encomenda na cotacao',
            'modulo' => 'cotacao',
            'nivel' => 'escrita',
            'risco' => 'alto',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_cotacao_encomenda',
            'openai_tool' => true,
            'local_action' => true,
            'entrada' => array('produto', 'responsavel', 'observacao'),
            'saida' => 'Item de encomenda criado na Cotacao Geral.',
            'auditoria' => array('cotacao_itens', 'cotacao_auditoria', 'wf_logs'),
            'efeitos' => array('cria_item_cotacao'),
        ),
        'criar_cotacao_urgente' => array(
            'nome' => 'criar_cotacao_urgente',
            'titulo' => 'Criar urgente na cotacao',
            'modulo' => 'cotacao',
            'nivel' => 'escrita',
            'risco' => 'alto',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_cotacao_urgente',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('produto'),
            'saida' => 'Item urgente criado na Cotacao Geral.',
            'auditoria' => array('cotacao_itens', 'cotacao_auditoria', 'miauw_alertas', 'wf_logs'),
            'efeitos' => array('cria_item_cotacao', 'cria_alerta'),
        ),
        'criar_cotacao_rapida' => array(
            'nome' => 'criar_cotacao_rapida',
            'titulo' => 'Criar cotacao rapida',
            'modulo' => 'cotacao',
            'nivel' => 'escrita',
            'risco' => 'alto',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_cotacao_rapida',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('fornecedor', 'itens'),
            'saida' => 'Fornecedor e itens com preco criados/atualizados.',
            'auditoria' => array('cotacao_fornecedores', 'cotacao_itens', 'cotacao_precos', 'cotacao_auditoria'),
            'efeitos' => array('cria_fornecedor_quando_claro', 'cria_itens_precos'),
        ),
        'criar_planilha_cotacao' => array(
            'nome' => 'criar_planilha_cotacao',
            'titulo' => 'Criar planilha de cotacao',
            'modulo' => 'cotacao',
            'nivel' => 'escrita',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_cotacao_planilha',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('nome'),
            'saida' => 'Novo bloco de cotacao criado pelo modelo existente.',
            'auditoria' => array('cotacao_blocos', 'cotacao_auditoria'),
            'efeitos' => array('cria_bloco_cotacao'),
        ),
        'criar_lancamento_financeiro' => array(
            'nome' => 'criar_lancamento_financeiro',
            'titulo' => 'Criar lancamento financeiro',
            'modulo' => 'financeiro',
            'nivel' => 'escrita',
            'risco' => 'alto',
            'permissao' => 'autenticado',
            'executor' => 'miauw_skill_create_financeiro_lancamento',
            'openai_tool' => true,
            'local_action' => true,
            'entrada' => array('categoria', 'valor', 'responsavel', 'observacao', 'data'),
            'saida' => 'Lancamento financeiro criado com auditoria.',
            'auditoria' => array('financeiro_lancamentos', 'financeiro_auditoria', 'miauw_padroes'),
            'efeitos' => array('cria_lancamento_financeiro', 'aprende_padrao_comando'),
        ),
        'registrar_memoria' => array(
            'nome' => 'registrar_memoria',
            'titulo' => 'Registrar memoria',
            'modulo' => 'miauby',
            'nivel' => 'escrita',
            'risco' => 'medio',
            'permissao' => 'autenticado',
            'executor' => 'miauw_memory_store',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('modulo', 'chave', 'valor'),
            'saida' => 'Memoria operacional resumida.',
            'auditoria' => array('miauw_memorias'),
            'efeitos' => array('nao_memorizar_segredos'),
        ),
        'analisar_padroes' => array(
            'nome' => 'analisar_padroes',
            'titulo' => 'Analisar padroes',
            'modulo' => 'miauby',
            'nivel' => 'sugestao',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_intelligence_patterns_reply',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('mensagem'),
            'saida' => 'Padroes aprendidos e sugestoes de processo.',
            'auditoria' => array('miauw_padroes'),
            'efeitos' => array('nao_altera_modulos'),
        ),
        'validar_processo' => array(
            'nome' => 'validar_processo',
            'titulo' => 'Validar processo',
            'modulo' => 'miauby',
            'nivel' => 'sugestao',
            'risco' => 'baixo',
            'permissao' => 'autenticado',
            'executor' => 'miauw_intelligence_process_validation_reply',
            'openai_tool' => false,
            'local_action' => true,
            'entrada' => array('mensagem'),
            'saida' => 'Checklist operacional e riscos.',
            'auditoria' => array('miauw_alertas', 'miauw_padroes'),
            'efeitos' => array('nao_altera_modulos'),
        ),
    );

    return $registry;
}

function miauw_skill_registry_public(): array
{
    $items = array();

    foreach (miauw_skill_registry() as $name => $skill) {
        $executor = (string) ($skill['executor'] ?? '');
        $items[$name] = array(
            'nome' => (string) ($skill['nome'] ?? $name),
            'titulo' => (string) ($skill['titulo'] ?? $name),
            'modulo' => (string) ($skill['modulo'] ?? 'sistema'),
            'nivel' => (string) ($skill['nivel'] ?? 'leitura'),
            'risco' => (string) ($skill['risco'] ?? 'baixo'),
            'permissao' => (string) ($skill['permissao'] ?? 'autenticado'),
            'executor' => $executor,
            'executor_disponivel' => $executor !== '' && function_exists($executor),
            'openai_tool' => !empty($skill['openai_tool']),
            'local_action' => !empty($skill['local_action']),
            'entrada' => array_values((array) ($skill['entrada'] ?? array())),
            'saida' => (string) ($skill['saida'] ?? ''),
            'auditoria' => array_values((array) ($skill['auditoria'] ?? array())),
            'efeitos' => array_values((array) ($skill['efeitos'] ?? array())),
        );
    }

    return $items;
}

function miauw_skill_registry_summary(): array
{
    $summary = array(
        'total' => 0,
        'por_modulo' => array(),
        'por_nivel' => array(),
        'por_risco' => array(),
        'openai_tools' => 0,
        'acoes_locais' => 0,
        'executores_indisponiveis' => array(),
    );

    foreach (miauw_skill_registry_public() as $name => $skill) {
        $summary['total']++;
        $module = (string) $skill['modulo'];
        $level = (string) $skill['nivel'];
        $risk = (string) $skill['risco'];
        $summary['por_modulo'][$module] = ($summary['por_modulo'][$module] ?? 0) + 1;
        $summary['por_nivel'][$level] = ($summary['por_nivel'][$level] ?? 0) + 1;
        $summary['por_risco'][$risk] = ($summary['por_risco'][$risk] ?? 0) + 1;

        if (!empty($skill['openai_tool'])) {
            $summary['openai_tools']++;
        }

        if (!empty($skill['local_action'])) {
            $summary['acoes_locais']++;
        }

        if (empty($skill['executor_disponivel'])) {
            $summary['executores_indisponiveis'][] = $name;
        }
    }

    ksort($summary['por_modulo']);
    ksort($summary['por_nivel']);
    ksort($summary['por_risco']);

    return $summary;
}

function miauw_skill_registry_diagnostics(): string
{
    $summary = miauw_skill_registry_summary();
    $lines = array(
        'REGISTRY DE SKILLS DO MIAUBY',
        'Total registrado: ' . (int) $summary['total'],
        'OpenAI tools: ' . (int) $summary['openai_tools'] . ' | Acoes locais: ' . (int) $summary['acoes_locais'],
        'Por nivel: ' . json_encode($summary['por_nivel'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'Por modulo: ' . json_encode($summary['por_modulo'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'Regra fixa: leitura pode resumir; sugestao pode orientar; escrita so pode alterar dados por executor controlado, validacao e auditoria.',
        'Regra fixa: Miauby nao executa SQL do usuario, nao le segredos, nao edita arquivos e nao cria automacao fora das skills registradas.',
    );

    if (!empty($summary['executores_indisponiveis'])) {
        $lines[] = 'Executores indisponiveis agora: ' . implode(', ', $summary['executores_indisponiveis']);
    } else {
        $lines[] = 'Executores: todos os registrados estao carregados neste bootstrap.';
    }

    $lines[] = 'Skills de escrita exigem dados claros. Se faltar produto, responsavel, valor, fornecedor ou categoria, perguntar antes.';

    return implode("\n", $lines);
}

function miauw_skill_period_from_message(string $message): array
{
    $lower = miauw_skill_lower($message);
    $month = (int) date('n');
    $year = (int) date('Y');
    $months = array(
        1 => array('janeiro', 'jan'),
        2 => array('fevereiro', 'fev'),
        3 => array('marco', 'março', 'mar'),
        4 => array('abril', 'abr'),
        5 => array('maio', 'mai'),
        6 => array('junho', 'jun'),
        7 => array('julho', 'jul'),
        8 => array('agosto', 'ago'),
        9 => array('setembro', 'set'),
        10 => array('outubro', 'out'),
        11 => array('novembro', 'nov'),
        12 => array('dezembro', 'dez'),
    );

    foreach ($months as $number => $names) {
        foreach ($names as $name) {
            if (preg_match('/(^|[^a-z0-9])' . preg_quote($name, '/') . '([^a-z0-9]|$)/iu', $lower)) {
                $month = $number;
                break 2;
            }
        }
    }

    if (preg_match('/\b(20[0-9]{2})\b/', $message, $match)) {
        $year = (int) $match[1];
    }

    if (preg_match('/\b(0?[1-9]|1[0-2])\s*[\/\-]\s*(20[0-9]{2})\b/', $message, $match)) {
        $month = (int) $match[1];
        $year = (int) $match[2];
    }

    if (preg_match('/\b(20[0-9]{2})\s*[\/\-]\s*(0?[1-9]|1[0-2])\b/', $message, $match)) {
        $year = (int) $match[1];
        $month = (int) $match[2];
    }

    $start = sprintf('%04d-%02d-01', $year, $month);
    $endExclusive = date('Y-m-d', strtotime($start . ' +1 month'));
    $endInclusive = date('Y-m-t', strtotime($start));

    return array(
        'month' => $month,
        'year' => $year,
        'start' => $start,
        'end_exclusive' => $endExclusive,
        'end_inclusive' => $endInclusive,
        'label' => sprintf('%02d/%04d', $month, $year),
    );
}

function miauw_skill_financeiro_summary(array $period): array
{
    if (!miauw_skill_table_exists('financeiro_fechamentos')) {
        return array();
    }

    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS dias_registrados,
            COALESCE(SUM(status = 'fechado'), 0) AS fechados,
            COALESCE(SUM(status = 'divergente'), 0) AS divergentes,
            COALESCE(SUM(status = 'conferencia'), 0) AS em_conferencia,
            COALESCE(SUM(status = 'aberto'), 0) AS abertos,
            COALESCE(SUM(total_conferido), 0) AS total_lancado,
            COALESCE(SUM(abertura_sistema), 0) AS total_sistema,
            COALESCE(SUM(sobra_falta), 0) AS sobra_falta
         FROM financeiro_fechamentos
         WHERE data_fechamento >= ? AND data_fechamento < ?"
    );
    $stmt->execute(array($period['start'], $period['end_exclusive']));
    $row = $stmt->fetch() ?: array();

    $lines = array(
        'FINANCEIRO ' . $period['label'],
        'Dias registrados: ' . (int) ($row['dias_registrados'] ?? 0),
        'Fechados: ' . (int) ($row['fechados'] ?? 0) . ', divergentes: ' . (int) ($row['divergentes'] ?? 0) . ', em conferencia: ' . (int) ($row['em_conferencia'] ?? 0) . ', abertos: ' . (int) ($row['abertos'] ?? 0),
        'Total lancado/conferido: ' . miauw_skill_money($row['total_lancado'] ?? 0),
        'Total sistema: ' . miauw_skill_money($row['total_sistema'] ?? 0),
        'Sobra/Falta acumulada: ' . miauw_skill_money($row['sobra_falta'] ?? 0),
    );

    if (miauw_skill_table_exists('financeiro_lancamentos')) {
        $stmt = db()->prepare(
            "SELECT categoria, COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS total
             FROM financeiro_lancamentos
             WHERE data >= ? AND data < ? AND status = 'lancado'
             GROUP BY categoria
             ORDER BY total DESC
             LIMIT 8"
        );
        $stmt->execute(array($period['start'], $period['end_exclusive']));
        $entries = $stmt->fetchAll();

        if ($entries) {
            $parts = array();
            foreach ($entries as $entry) {
                $parts[] = (string) $entry['categoria'] . ': ' . (int) $entry['qtd'] . ' lanc., ' . miauw_skill_money($entry['total']);
            }

            $lines[] = 'Categorias lancadas: ' . implode('; ', $parts);
        }
    }

    return $lines;
}

function miauw_skill_cashback_summary(array $period): array
{
    if (!miauw_skill_table_exists('wf_compras')) {
        return array();
    }

    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS compras,
            COALESCE(SUM(valor_total), 0) AS total_vendido,
            COALESCE(SUM(valor_cobrado), 0) AS total_cobrado,
            COALESCE(SUM(cashback_gerado), 0) AS cashback_gerado
         FROM wf_compras
         WHERE data_compra >= ? AND data_compra < ?"
    );
    $stmt->execute(array($period['start'] . ' 00:00:00', $period['end_exclusive'] . ' 00:00:00'));
    $row = $stmt->fetch() ?: array();

    $lines = array(
        'CASHBACK/VENDAS ' . $period['label'],
        'Compras registradas: ' . (int) ($row['compras'] ?? 0),
        'Total vendido registrado: ' . miauw_skill_money($row['total_vendido'] ?? 0),
        'Total cobrado registrado: ' . miauw_skill_money($row['total_cobrado'] ?? 0),
        'Cashback gerado: ' . miauw_skill_money($row['cashback_gerado'] ?? 0),
        'Observacao: o cashback registra compras e valores; nao ha item/produto vendido por unidade nessa tabela.',
    );

    if (miauw_skill_table_exists('wf_resgates')) {
        $stmt = db()->prepare(
            'SELECT COUNT(*) AS resgates, COALESCE(SUM(valor_resgatado), 0) AS total_resgatado
             FROM wf_resgates
             WHERE data_resgate >= ? AND data_resgate < ?'
        );
        $stmt->execute(array($period['start'] . ' 00:00:00', $period['end_exclusive'] . ' 00:00:00'));
        $resgate = $stmt->fetch() ?: array();
        $lines[] = 'Resgates no periodo: ' . (int) ($resgate['resgates'] ?? 0) . ', total resgatado: ' . miauw_skill_money($resgate['total_resgatado'] ?? 0);
    }

    if (miauw_skill_table_exists('wf_cashback_creditos')) {
        $stmt = db()->query(
            "SELECT
                COUNT(*) AS creditos_ativos,
                COALESCE(SUM(valor_restante), 0) AS saldo_ativo
             FROM wf_cashback_creditos
             WHERE status = 'ativo'"
        );
        $credito = $stmt->fetch() ?: array();
        $lines[] = 'Saldo ativo atual de cashback: ' . miauw_skill_money($credito['saldo_ativo'] ?? 0) . ' em ' . (int) ($credito['creditos_ativos'] ?? 0) . ' credito(s).';
    }

    return $lines;
}

function miauw_skill_tarefa_summary(array $period): array
{
    if (!miauw_skill_table_exists('wf_tarefas')) {
        return array();
    }

    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS total,
            COALESCE(SUM(status = 'aberta'), 0) AS abertas,
            COALESCE(SUM(status = 'concluida'), 0) AS concluidas,
            COALESCE(SUM(status = 'cancelada'), 0) AS canceladas,
            COALESCE(SUM(status = 'aberta' AND prioridade = 'alta'), 0) AS altas_abertas
         FROM wf_tarefas
         WHERE criado_em >= ? AND criado_em < ?"
    );
    $stmt->execute(array($period['start'] . ' 00:00:00', $period['end_exclusive'] . ' 00:00:00'));
    $row = $stmt->fetch() ?: array();

    $lines = array(
        'TAREFAS ' . $period['label'],
        'Criadas no periodo: ' . (int) ($row['total'] ?? 0),
        'Abertas: ' . (int) ($row['abertas'] ?? 0) . ', concluidas: ' . (int) ($row['concluidas'] ?? 0) . ', canceladas: ' . (int) ($row['canceladas'] ?? 0),
        'Alta prioridade ainda aberta: ' . (int) ($row['altas_abertas'] ?? 0),
    );

    $stmt = db()->query(
        "SELECT prioridade, titulo, criado_em
         FROM wf_tarefas
         WHERE status = 'aberta'
         ORDER BY CASE prioridade WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC, criado_em ASC, id ASC
         LIMIT 6"
    );
    $open = $stmt ? $stmt->fetchAll() : array();

    if ($open) {
        $lines[] = 'Abertas primeiro por prioridade:';
        foreach ($open as $task) {
            $lines[] = '- ' . strtoupper((string) ($task['prioridade'] ?? 'normal')) . ' | ' . (string) ($task['titulo'] ?? '-') . ' | criada em ' . br_date($task['criado_em'] ?? '', true);
        }
    }

    return $lines;
}

function miauw_skill_tarefa_priority_from_text(string $value): string
{
    $normalized = miauw_skill_normalized($value);

    if (preg_match('/\b(?:alta|urgente|critica|critico|grave|importante)\b/i', $normalized)) {
        return 'alta';
    }

    if (preg_match('/\b(?:baixa|leve|menor|simples)\b/i', $normalized)) {
        return 'baixa';
    }

    return 'normal';
}

function miauw_skill_tarefa_priority_label(string $priority): string
{
    if ($priority === 'alta') {
        return 'Alta';
    }

    if ($priority === 'baixa') {
        return 'Baixa';
    }

    return 'Media';
}

function miauw_skill_tarefa_clean_part(string $text, int $maxLength): string
{
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    $text = preg_replace('/[^\p{L}\p{N}\s\/\-\.\,\+\(\)]/u', '', $text) ?? '';
    $text = trim($text, " \t\n\r\0\x0B-:;,.()");

    return $text === '' ? '' : miauw_substr($text, 0, $maxLength);
}

function miauw_skill_tarefa_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);

    if (preg_match('/^\s*(?:como|onde|qual|quais|quanto|quantos|quando|por que|porque|posso|devo|explica|ensina)\b/i', $normalized)) {
        return null;
    }

    if (preg_match('/^\s*(?:ver|veja|mostrar|mostra|listar|lista|consulta|consultar|resumo|status|quadro)\s+(?:de\s+)?(?:tarefa|tarefas|pendencia|pendencias)\b/i', $normalized)
        || preg_match('/^\s*(?:tarefa|tarefas|pendencia|pendencias)\s+(?:aberta|abertas|concluida|concluidas|cancelada|canceladas|pendente|pendentes|historico|fila|prioridade)\b/i', $normalized)) {
        return null;
    }

    if (!preg_match('/^\s*(?:(?:miauby|miauw)\s+)?(?:(?:cria|criar|nova|novo|adiciona|adicionar|abre|abrir|lanca|lancar|registra|registrar)\s+)?(?:uma\s+)?(?:tarefa|tarefas|pendencia|pendenciazinha)\b/i', $normalized)) {
        return null;
    }

    $body = trim($message);
    $body = preg_replace('/^\s*(?:miauby|miauw)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:cria|criar|nova|novo|adiciona|adicionar|abre|abrir|lanca|lancar|lan.a|registra|registrar)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:uma\s+)?(?:tarefa|tarefas|pend.ncia|pendenciazinha)\s*/iu', '', $body) ?? $body;

    $priority = miauw_skill_tarefa_priority_from_text($body);
    $body = preg_replace('/^\s*(?:prioridade\s+)?(?:alta|media|m.dia|medio|m.dio|normal|baixa|urgente|critica|crit.ca|critico|crit.co|grave|leve|menor|simples)\b\s*/iu', '', $body) ?? $body;
    $body = trim($body, " \t\n\r\0\x0B-:;,.()");

    $parts = preg_split('/\s*(?:-|;|\|)\s*/u', $body) ?: array();
    $parts = array_values(array_filter(array_map(static function ($part): string {
        return trim((string) $part);
    }, $parts), static function ($part): bool {
        return $part !== '';
    }));

    $title = $parts[0] ?? '';
    $description = '';

    if (count($parts) > 1) {
        $description = implode(' - ', array_slice($parts, 1));
    }

    if ($title === '' && $body !== '') {
        $title = $body;
    }

    return array(
        'prioridade' => $priority,
        'titulo' => miauw_skill_tarefa_clean_part($title, 180),
        'descricao' => miauw_skill_tarefa_clean_part($description, 900),
        'raw_message' => $message,
    );
}

function miauw_skill_ensure_tarefa_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS wf_tarefas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            prioridade ENUM('alta','normal','baixa') NOT NULL DEFAULT 'normal',
            titulo VARCHAR(180) NOT NULL,
            descricao TEXT NULL,
            status ENUM('aberta','concluida','cancelada') NOT NULL DEFAULT 'aberta',
            criado_por INT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            concluido_em DATETIME NULL,
            cancelado_em DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_tarefa_status_prioridade (status, prioridade, criado_em),
            KEY idx_tarefa_criado (criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $done = true;
}

function miauw_skill_create_tarefa(array $command, ?int $userId): array
{
    miauw_skill_ensure_tarefa_schema();

    $title = trim((string) ($command['titulo'] ?? ''));
    $description = trim((string) ($command['descricao'] ?? ''));
    $priority = (string) ($command['prioridade'] ?? 'normal');

    if (!in_array($priority, array('alta', 'normal', 'baixa'), true)) {
        $priority = 'normal';
    }

    if ($title === '') {
        throw new RuntimeException('Titulo da tarefa nao informado.');
    }

    $stmt = db()->prepare(
        'INSERT INTO wf_tarefas (prioridade, titulo, descricao, status, criado_por) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($priority, miauw_substr($title, 0, 180), $description, 'aberta', $userId));
    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action('miauw_tarefa_criada', 'task', $id, 'Tarefa criada pelo Miauby: ' . $title);
    }

    return array(
        'id' => $id,
        'prioridade' => $priority,
        'titulo' => $title,
        'descricao' => $description,
    );
}

function miauw_skill_tarefa_action_reply(array $result): string
{
    $lines = array(
        'Tarefa criada.',
        'Nivel: ' . miauw_skill_tarefa_priority_label((string) ($result['prioridade'] ?? 'normal')),
        'Titulo: ' . (string) ($result['titulo'] ?? '-'),
    );

    if (trim((string) ($result['descricao'] ?? '')) !== '') {
        $lines[] = 'Descricao: ' . (string) $result['descricao'];
    }

    $lines[] = 'Entrou na fila por prioridade. Sem cerimonia, sem planilha paralela.';

    return implode("\n", $lines);
}

function miauw_skill_tarefa_missing_reply(array $command): string
{
    return "Faltou o titulo da tarefa.\nUse assim: tarefa media - cotar popular - losartana\nNivel aceito: alta, media ou baixa.";
}

function miauw_skill_cotacao_summary(array $period): array
{
    if (!miauw_skill_table_exists('cotacao_itens') || !miauw_skill_table_exists('cotacao_blocos')) {
        return array();
    }

    $stmt = db()->prepare(
        "SELECT
            COUNT(*) AS total,
            COALESCE(SUM(i.status = 'aberta'), 0) AS abertas,
            COALESCE(SUM(i.status = 'cotada'), 0) AS cotadas,
            COALESCE(SUM(i.status = 'pedido'), 0) AS pedidos,
            COALESCE(SUM(i.status = 'cancelada'), 0) AS canceladas,
            COALESCE(SUM(i.prioridade = 'urgente'), 0) AS urgentes,
            COALESCE(SUM(i.prioridade = 'encomenda'), 0) AS encomendas,
            COALESCE(SUM(i.vencedor_fornecedor_id IS NOT NULL), 0) AS com_vencedor
         FROM cotacao_itens i
         WHERE COALESCE(i.updated_at, i.created_at) >= ? AND COALESCE(i.updated_at, i.created_at) < ?"
    );
    $stmt->execute(array($period['start'] . ' 00:00:00', $period['end_exclusive'] . ' 00:00:00'));
    $row = $stmt->fetch() ?: array();

    $lines = array(
        'COTACAO ' . $period['label'],
        'Itens movimentados no periodo: ' . (int) ($row['total'] ?? 0),
        'Abertas: ' . (int) ($row['abertas'] ?? 0) . ', cotadas: ' . (int) ($row['cotadas'] ?? 0) . ', pedidos: ' . (int) ($row['pedidos'] ?? 0) . ', canceladas: ' . (int) ($row['canceladas'] ?? 0),
        'Com vencedor definido: ' . (int) ($row['com_vencedor'] ?? 0),
        'Prioridade urgente: ' . (int) ($row['urgentes'] ?? 0) . ', prioridade encomenda: ' . (int) ($row['encomendas'] ?? 0),
    );

    $stmt = db()->query(
        "SELECT b.nome, COUNT(i.id) AS itens
         FROM cotacao_blocos b
         LEFT JOIN cotacao_itens i ON i.bloco_id = b.id
         WHERE b.ativo = 1
         GROUP BY b.id, b.nome
         ORDER BY b.ordem ASC, b.nome ASC
         LIMIT 8"
    );
    $blocks = $stmt->fetchAll();

    if ($blocks) {
        $parts = array();
        foreach ($blocks as $block) {
            $parts[] = (string) $block['nome'] . ': ' . (int) $block['itens'] . ' item(ns)';
        }

        $lines[] = 'Blocos ativos: ' . implode('; ', $parts);
    }

    return $lines;
}

function miauw_skill_search_terms(string $message): array
{
    $normalized = preg_replace('/[^a-z0-9]+/i', ' ', miauw_skill_normalized($message)) ?? '';
    $words = preg_split('/\s+/', trim($normalized)) ?: array();
    $stop = array(
        'miauby', 'miauw', 'miau', 'quem', 'qual', 'essa', 'esse', 'isso', 'esta', 'estao', 'sobre', 'para', 'pela', 'pelo',
        'cliente', 'pessoa', 'cotacao', 'produto', 'item', 'procura', 'procure', 'procurar', 'buscar', 'busca', 'ache', 'quero', 'preciso',
        'mostra', 'mostre', 'dados', 'sistema', 'onde', 'como', 'adiciona', 'adicione', 'telefone', 'saldo'
    );
    $terms = array();

    foreach ($words as $word) {
        $word = trim((string) $word);
        if (strlen($word) < 3 || in_array($word, $stop, true)) {
            continue;
        }

        $terms[] = $word;
    }

    if (preg_match_all('/\b[0-9]{6,14}\b/', $message, $matches)) {
        foreach ($matches[0] as $digits) {
            $terms[] = (string) $digits;
        }
    }

    return array_values(array_unique(array_slice($terms, 0, 5)));
}

function miauw_skill_mask_phone(string $phone): string
{
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if (strlen($digits) < 6) {
        return $phone !== '' ? 'telefone cadastrado' : 'sem telefone';
    }

    return substr($digits, 0, 2) . '*****' . substr($digits, -4);
}

function miauw_skill_client_lookup(string $message): array
{
    if (!miauw_skill_table_exists('wf_clientes')) {
        return array();
    }

    $terms = miauw_skill_search_terms($message);
    if (!$terms) {
        return array('CLIENTES: informe nome ou telefone parcial para eu procurar sem invocar neblina administrativa.');
    }

    $where = array();
    $params = array();
    foreach ($terms as $term) {
        $where[] = '(nome LIKE ? OR telefone LIKE ?)';
        $params[] = '%' . $term . '%';
        $params[] = '%' . $term . '%';
    }

    $stmt = db()->prepare(
        'SELECT id, nome, telefone, status, created_at
         FROM wf_clientes
         WHERE ' . implode(' OR ', $where) . '
         ORDER BY updated_at DESC, id DESC
         LIMIT 5'
    );
    $stmt->execute($params);
    $clients = $stmt->fetchAll();

    if (!$clients) {
        return array('CLIENTES: nenhum cliente encontrado para "' . implode(', ', $terms) . '". Sem dado, sem milagre.');
    }

    $lines = array('CLIENTES ENCONTRADOS');
    foreach ($clients as $client) {
        $saldo = null;
        if (function_exists('balance_for_client')) {
            try {
                $saldo = balance_for_client((int) $client['id']);
            } catch (Throwable $error) {
                $saldo = null;
            }
        }

        $line = '#' . (int) $client['id'] . ' - ' . (string) $client['nome'];
        $line .= ' | telefone: ' . miauw_skill_mask_phone((string) ($client['telefone'] ?? ''));
        $line .= ' | status: ' . (string) ($client['status'] ?? '-');
        if ($saldo !== null) {
            $line .= ' | saldo cashback: ' . miauw_skill_money($saldo);
        }
        $lines[] = $line;
    }

    return $lines;
}

function miauw_skill_cotacao_lookup(string $message): array
{
    if (!miauw_skill_table_exists('cotacao_itens') || !miauw_skill_table_exists('cotacao_blocos') || !miauw_skill_table_exists('cotacao_fornecedores')) {
        return array();
    }

    $terms = miauw_skill_search_terms($message);
    if (!$terms) {
        return array('COTACAO: informe EAN, produto ou categoria para eu achar a linha certa. A planilha nao le pensamento, infelizmente.');
    }

    $where = array();
    $params = array();
    foreach ($terms as $term) {
        $where[] = '(i.ean LIKE ? OR i.produto LIKE ? OR i.categoria LIKE ?)';
        $params[] = '%' . $term . '%';
        $params[] = '%' . $term . '%';
        $params[] = '%' . $term . '%';
    }

    $orderDateSelect = miauw_skill_column_exists('cotacao_itens', 'encomenda_registrada_em')
        ? ', i.encomenda_registrada_em'
        : ", NULL AS encomenda_registrada_em";
    $stmt = db()->prepare(
        'SELECT i.id, i.ean, i.produto, i.quantidade, i.categoria, i.prioridade, i.status, i.vencedor_preco
                ' . $orderDateSelect . ',
                b.nome AS bloco_nome, f.nome AS vencedor_nome
         FROM cotacao_itens i
         LEFT JOIN cotacao_blocos b ON b.id = i.bloco_id
         LEFT JOIN cotacao_fornecedores f ON f.id = i.vencedor_fornecedor_id
         WHERE ' . implode(' OR ', $where) . '
         ORDER BY i.updated_at DESC, i.id DESC
         LIMIT 6'
    );
    $stmt->execute($params);
    $items = $stmt->fetchAll();

    if (!$items) {
        return array('COTACAO: nenhum item encontrado para "' . implode(', ', $terms) . '". Ou nao existe, ou foi cadastrado com nome de criatura mitologica.');
    }

    $lines = array('ITENS DE COTACAO ENCONTRADOS');
    foreach ($items as $item) {
        $winner = !empty($item['vencedor_nome']) ? (string) $item['vencedor_nome'] . ' por ' . miauw_skill_money($item['vencedor_preco']) : 'sem vencedor';
        $line = '#' . (int) $item['id']
            . ' | bloco: ' . (string) ($item['bloco_nome'] ?? '-')
            . ' | EAN: ' . (string) ($item['ean'] ?? '-')
            . ' | produto: ' . (string) ($item['produto'] ?? '-')
            . ' | qtd: ' . (string) ($item['quantidade'] ?? '-')
            . ' | categoria: ' . (string) ($item['categoria'] ?? '-')
            . ' | status: ' . (string) ($item['status'] ?? '-')
            . ' | vencedor: ' . $winner;
        if ((string) ($item['prioridade'] ?? '') === 'encomenda' && !empty($item['encomenda_registrada_em'])) {
            $line .= ' | registrada: ' . date('d/m/Y H:i', strtotime((string) $item['encomenda_registrada_em']));
        }
        $lines[] = $line;
    }

    return $lines;
}

function miauw_skill_clean_encomenda_part(string $text, int $maxLength): string
{
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    $text = preg_replace('/[^\p{L}\p{N}\s\/\-\.\+]/u', '', $text) ?? '';
    $text = trim($text, " \t\n\r\0\x0B-:;,.()");

    return $text === '' ? '' : miauw_substr($text, 0, $maxLength);
}

function miauw_skill_cotacao_encomenda_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);
    if (preg_match('/^\s*(?:como|onde|qual|quais|quanto|quantos|quando|por que|porque)\b/i', $normalized)) {
        return null;
    }

    if (!preg_match('/^\s*(?:(?:miauby|miauw)\s+)?(?:(?:faz|fazer|cria|criar|lanca|lancar|registrar|registra|adiciona|adicionar|coloca|colocar|bota|botar)\s+)?(?:uma\s+)?(?:encomenda|encomendar)\b/i', $normalized)) {
        return null;
    }

    $body = trim($message);
    $body = preg_replace('/^\s*(?:miauby|miauw)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:faz|fazer|cria|criar|lanca|lancar|lan.a|registrar|registra|adiciona|adicionar|coloca|colocar|bota|botar)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:uma\s+)?(?:encomendar|encomenda)\s*/iu', '', $body) ?? $body;
    $body = trim($body, " \t\n\r\0\x0B-:;,.()");

    $signals = array();
    if (preg_match_all('/\b(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/u', $body, $phoneMatches)) {
        foreach ($phoneMatches[0] as $phone) {
            $cleanPhone = miauw_skill_clean_encomenda_part((string) $phone, 30);
            if ($cleanPhone !== '') {
                $signals[] = 'telefone ' . $cleanPhone;
            }
            $body = str_replace((string) $phone, ' ', $body);
        }
    }

    if (preg_match_all('/(?:r\$\s*)?[0-9]+(?:[.,][0-9]{1,2})?\s*(?:reais|real|rs)\b/iu', $body, $moneyMatches)) {
        foreach ($moneyMatches[0] as $money) {
            $cleanMoney = miauw_skill_clean_encomenda_part((string) $money, 40);
            if ($cleanMoney !== '') {
                $signals[] = 'valor ' . $cleanMoney;
            }
            $body = str_replace((string) $money, ' ', $body);
        }
    }

    $body = trim(preg_replace('/\s+/', ' ', $body) ?? $body, " \t\n\r\0\x0B-:;,.()");

    $product = $body;
    $responsible = '';
    $note = '';

    if ($body !== '' && preg_match('/\b(?:responsavel|responsavel:|cliente|para|pra|atendente)\b\s*[:\-]?\s+(.+)$/iu', $body, $match, PREG_OFFSET_CAPTURE)) {
        $responsible = miauw_skill_clean_encomenda_part((string) $match[1][0], 70);
        $product = trim(substr($body, 0, (int) $match[0][1]));
    }

    if ($responsible === '' && preg_match('/^(.+?)\s[-\x{2013}\x{2014}]\s(.+)$/u', $body, $match)) {
        $left = miauw_skill_clean_encomenda_part((string) $match[1], 220);
        $right = miauw_skill_clean_encomenda_part((string) $match[2], 160);
        $rightWords = preg_split('/\s+/u', $right) ?: array();

        if ($right !== '' && count($rightWords) <= 4 && !preg_match('/[0-9]/', $right)) {
            $product = $left;
            $responsible = miauw_skill_clean_encomenda_part($right, 70);
        } else {
            $product = $left;
            $note = $right;
        }
    }

    $product = miauw_skill_clean_encomenda_part($product, 220);

    if ($responsible === '' && $product !== '') {
        $words = preg_split('/\s+/u', $product) ?: array();
        $words = array_values(array_filter($words, static function ($word): bool {
            return trim((string) $word) !== '';
        }));

        if (count($words) >= 2) {
            $unitWords = array('mg', 'mcg', 'ml', 'g', 'ui', 'cp', 'caps', 'capsula', 'capsulas', 'comprimido', 'comprimidos', 'gotas', 'xarope');
            $dosageEnd = -1;
            foreach ($words as $index => $word) {
                $key = miauw_skill_normalized((string) $word);
                if (preg_match('/^[0-9]+(?:[.,][0-9]+)?(?:mg|mcg|ml|g|ui)$/i', (string) $word)) {
                    $dosageEnd = (int) $index;
                    continue;
                }
                if (in_array($key, $unitWords, true) && $index > 0 && preg_match('/[0-9]/', (string) $words[$index - 1])) {
                    $dosageEnd = (int) $index;
                }
            }

            if ($dosageEnd >= 0 && $dosageEnd < count($words) - 1) {
                $responsibleWords = array_slice($words, $dosageEnd + 1);
                $productWords = array_slice($words, 0, $dosageEnd + 1);
                $responsible = miauw_skill_clean_encomenda_part(implode(' ', $responsibleWords), 70);
                $product = miauw_skill_clean_encomenda_part(implode(' ', $productWords), 220);
            } elseif ($dosageEnd >= 1 && count($words) >= 3) {
                $first = (string) $words[0];
                $rest = implode(' ', array_slice($words, 1));
                if (!preg_match('/[0-9]/', $first) && preg_match('/\b[0-9]+(?:[.,][0-9]+)?\s*(?:mg|mcg|ml|g|ui)\b/iu', $rest)) {
                    $responsible = miauw_skill_clean_encomenda_part($first, 70);
                    $product = miauw_skill_clean_encomenda_part($rest, 220);
                }
            }
        }

        if ($responsible === '' && $product !== '') {
            $words = preg_split('/\s+/u', $product) ?: array();
            $words = array_values(array_filter($words, static function ($word): bool {
                return trim((string) $word) !== '';
            }));

            if (count($words) >= 2) {
            $last = (string) end($words);
            $lastKey = miauw_skill_normalized($last);
            $notNames = array('mg', 'mcg', 'ml', 'g', 'cp', 'caps', 'capsula', 'capsulas', 'comprimido', 'comprimidos', 'caixa', 'gotas', 'xarope', 'un', 'und');
            if (!preg_match('/[0-9]/', $last) && preg_match('/\p{L}/u', $last) && !in_array($lastKey, $notNames, true)) {
                array_pop($words);
                $responsible = miauw_skill_clean_encomenda_part($last, 70);
                $product = miauw_skill_clean_encomenda_part(implode(' ', $words), 220);
            }
            }
        }
    }

    $signalText = miauw_skill_clean_encomenda_part(implode(' ', array_values(array_unique($signals))), 160);
    if ($signalText !== '') {
        $note = trim($note !== '' ? $note . ' ' . $signalText : $signalText);
    }

    return array(
        'produto' => $product,
        'responsavel' => $responsible,
        'observacao_usuario' => $note,
        'categoria_extra' => $signalText,
        'raw_message' => $message,
    );
}

function miauw_skill_create_cotacao_encomenda(array $command): array
{
    $product = miauw_skill_clean_encomenda_part((string) ($command['produto'] ?? ''), 220);
    $responsible = miauw_skill_clean_encomenda_part((string) ($command['responsavel'] ?? ''), 70);

    if ($product === '') {
        throw new RuntimeException('Informe o produto da encomenda.');
    }

    if ($responsible === '') {
        throw new RuntimeException('Informe o responsavel ou cliente da encomenda.');
    }

    $blockId = miauw_skill_cotacao_default_block_id();
    $note = miauw_skill_clean_encomenda_part((string) ($command['observacao_usuario'] ?? ''), 160);
    $categoryExtra = miauw_skill_clean_encomenda_part((string) ($command['categoria_extra'] ?? ''), 80);
    $category = miauw_substr(trim('encomenda ' . $responsible . ($categoryExtra !== '' ? ' ' . $categoryExtra : '')), 0, 80);
    $observation = 'Encomenda criada pelo Miauby. Responsavel/cliente: ' . $responsible . '.';
    if ($note !== '') {
        $observation .= ' Obs: ' . $note . '.';
    }
    $raw = miauw_skill_clean_encomenda_part((string) ($command['raw_message'] ?? ''), 160);
    if ($raw !== '') {
        $observation .= ' Comando: "' . $raw . '".';
    }

    $itemId = cotacao_save_item($blockId, array(
        'produto' => $product,
        'quantidade' => '1',
        'categoria' => $category,
        'prioridade' => 'encomenda',
        'status' => 'aberta',
        'observacao' => $observation,
    ), array());

    $item = function_exists('cotacao_item') ? cotacao_item($blockId, $itemId) : null;

    if (function_exists('log_action')) {
        log_action(
            'miauw_cotacao_encomenda_criada',
            'cotacao_itens',
            $itemId,
            json_encode(array(
                'produto' => $product,
                'responsavel' => $responsible,
                'observacao' => $note,
            ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'Encomenda criada pelo Miauby.'
        );
    }

    return array(
        'id' => $itemId,
        'produto' => $product,
        'responsavel' => $responsible,
        'categoria' => is_array($item) ? (string) ($item['categoria'] ?? ('encomenda ' . $responsible)) : 'encomenda ' . $responsible,
        'status' => is_array($item) ? (string) ($item['status'] ?? 'aberta') : 'aberta',
        'registrada_em' => is_array($item) ? (string) ($item['encomenda_registrada_em'] ?? '') : '',
        'observacao' => $observation,
    );
}

function miauw_skill_cotacao_encomenda_action_reply(array $result): string
{
    $registered = trim((string) ($result['registrada_em'] ?? ''));
    $registeredText = $registered !== '' ? date('d/m/Y H:i', strtotime($registered)) : date('d/m/Y H:i');

    return "Encomenda criada.\n"
        . "Produto: " . (string) ($result['produto'] ?? '-') . "\n"
        . "Responsavel/cliente: " . (string) ($result['responsavel'] ?? '-') . "\n"
        . "Registro: " . $registeredText . "\n"
        . "Status: " . (string) ($result['status'] ?? 'aberta') . "\n"
        . "Proximo passo: completar preco/vencedor na Cotacao Geral e baixar quando virar pedido, retirada ou cancelamento.";
}

function miauw_skill_cotacao_encomenda_missing_reply(array $command): string
{
    $product = trim((string) ($command['produto'] ?? ''));
    $responsible = trim((string) ($command['responsavel'] ?? ''));

    if ($product === '' && $responsible === '') {
        return 'Manda produto e responsavel. Modelo: `encomenda losartana 50mg Isadora`. Sem isso, vira bilhete perdido com autoestima.';
    }

    if ($product === '') {
        return 'Faltou o produto. Modelo: `encomenda losartana 50mg Isadora`. Produto sem nome vira cadastro inutil.';
    }

    return 'Faltou responsavel/cliente. Responde so o nome, tipo `Isadora`, que eu registro a encomenda sem teatro.';
}

function miauw_skill_cotacao_urgente_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);
    if (preg_match('/^\s*(?:como|onde|qual|quais|quanto|quantos|quando|por que|porque)\b/i', $normalized)) {
        return null;
    }

    if (!miauw_skill_has_any($normalized, array('em falta', 'esta em falta', 'ta em falta', 'acabou', 'sem estoque', 'falta na loja', 'precisa urgente', 'urgente na loja'))) {
        return null;
    }

    $body = trim($message);
    $body = preg_replace('/^\s*(?:miauby|miauw)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:medicamento|remedio|produto)\s+(?:tal\s+)?(?:tipo\s+)?/iu', '', $body) ?? $body;
    $body = preg_replace('/\b(?:esta|ta|tá|ficou)\s+em\s+falta\b.*$/iu', '', $body) ?? $body;
    $body = preg_replace('/\b(?:acabou|sem\s+estoque|falta\s+na\s+loja|precisa\s+urgente|urgente\s+na\s+loja)\b.*$/iu', '', $body) ?? $body;
    $product = miauw_skill_clean_encomenda_part($body, 220);

    if ($product === '' || in_array(miauw_skill_normalized($product), array('medicamento', 'remedio', 'produto'), true)) {
        return null;
    }

    return array(
        'produto' => $product,
        'raw_message' => $message,
    );
}

function miauw_skill_product_operational_category(string $product, string $mode = 'normal'): string
{
    $normalized = miauw_skill_normalized($product);

    $perfumeryTerms = array(
        'skala', 'creme cabelo', 'creme de cabelo', 'shampoo', 'condicionador', 'mascara capilar',
        'cabelo', 'tintura', 'esmalte', 'acetona', 'desodorante', 'sabonete', 'hidratante',
        'perfume', 'colonia', 'body splash', 'protetor solar', 'barbeador', 'depilatorio'
    );
    $controlledTerms = array(
        'rivotril', 'clonazepam', 'alprazolam', 'diazepam', 'zolpidem', 'fluoxetina',
        'sertralina', 'amitriptilina', 'controlado'
    );
    $medicineTerms = array(
        'mg', 'mcg', 'ml', 'ui', 'comprimido', 'comprimidos', 'capsula', 'capsulas',
        'gotas', 'xarope', 'pomada', 'spray', 'losartana', 'loratadina', 'metformina',
        'glifage', 'dipirona', 'paracetamol', 'ibuprofeno', 'ipratropio', 'salbutamol',
        'nifedipino', 'omeprazol', 'amoxicilina'
    );
    $babyTerms = array('fralda', 'pomada assadura', 'lenco umedecido', 'mamadeira', 'chupeta');

    if (miauw_skill_has_any($normalized, $controlledTerms)) {
        $base = 'controlado';
    } elseif (miauw_skill_has_any($normalized, $perfumeryTerms)) {
        $base = 'perfumaria';
    } elseif (miauw_skill_has_any($normalized, $babyTerms)) {
        $base = 'infantil';
    } elseif (miauw_skill_has_any($normalized, $medicineTerms) || preg_match('/\b\d+\s*(?:mg|mcg|ml|ui|g)\b/i', $normalized)) {
        $base = 'medicamento';
    } else {
        $base = 'geral';
    }

    $mode = miauw_skill_normalized($mode);
    if (strpos($mode, 'urgente') !== false) {
        return 'urgente ' . $base;
    }

    if (strpos($mode, 'encomenda') !== false) {
        return 'encomenda ' . $base;
    }

    if (strpos($mode, 'cotacao rapida') !== false && $base === 'geral') {
        return 'cotacao rapida';
    }

    return $base;
}

function miauw_skill_create_cotacao_urgente(array $command): array
{
    $product = miauw_skill_clean_encomenda_part((string) ($command['produto'] ?? ''), 220);
    if ($product === '') {
        throw new RuntimeException('Informe o medicamento/produto em falta.');
    }

    $blockId = miauw_skill_cotacao_default_block_id();
    $category = miauw_skill_product_operational_category($product, 'urgente');
    $observation = 'Urgente criado pelo Miauby por falta na loja.';
    $raw = miauw_skill_clean_encomenda_part((string) ($command['raw_message'] ?? ''), 160);
    if ($raw !== '') {
        $observation .= ' Comando: "' . $raw . '".';
    }

    $itemId = cotacao_save_item($blockId, array(
        'produto' => $product,
        'quantidade' => '1',
        'categoria' => $category,
        'prioridade' => 'urgente',
        'status' => 'aberta',
        'observacao' => $observation,
    ), array());

    if (function_exists('miauw_intelligence_upsert_alert')) {
        miauw_intelligence_upsert_alert(
            'cotacao',
            'cotacao_urgente_criada_por_comando',
            'alta',
            'Urgente criado pelo Miauby',
            'Medicamento em falta registrado como urgente: ' . $product . '.',
            array(
                'subject' => 'cotacao_urgente_comando_' . $itemId,
                'table' => 'cotacao_itens',
                'record_id' => $itemId,
                'produto' => $product,
                'origem' => 'miauby',
            )
        );
    }

    if (function_exists('log_action')) {
        log_action('miauw_cotacao_urgente_criado', 'cotacao_itens', $itemId, $observation);
    }

    return array(
        'id' => $itemId,
        'produto' => $product,
        'categoria' => $category,
        'status' => 'aberta',
    );
}

function miauw_skill_cotacao_urgente_action_reply(array $result): string
{
    return "Urgente criado na Cotacao Geral.\n"
        . "Produto: " . (string) ($result['produto'] ?? '-') . "\n"
        . "Categoria: " . (string) ($result['categoria'] ?? 'urgente geral') . "\n"
        . "Alerta: ativo no widget para cobrar verificacao.\n"
        . "Proximo passo: preencher distribuidora/preco e decidir vencedor.";
}

function miauw_skill_parse_money_from_text(string $text): ?float
{
    if (!preg_match('/(?:r\$\s*)?([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:reais|real)?\b/iu', $text, $match)) {
        return null;
    }

    $value = str_replace('.', '', (string) $match[1]);
    $value = str_replace(',', '.', $value);

    return is_numeric($value) ? (float) $value : null;
}

function miauw_skill_supplier_name_is_safe_for_quick_quote(string $supplier): bool
{
    $normalized = miauw_skill_normalized($supplier);

    if ($normalized === '' || strlen($normalized) < 2) {
        return false;
    }

    if (preg_match('/\b(pix|cnpj|cpf|maquininha|maq|sangria|caixa|dinheiro|cartao|debito|credito|willian|isadora|ana|responsavel)\b/i', $normalized)) {
        return false;
    }

    if (preg_match('/^\d+$/', preg_replace('/\D+/', '', $normalized) ?? '')) {
        return false;
    }

    return true;
}

function miauw_skill_cotacao_rapida_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);
    if (preg_match('/^\s*(?:como|onde|qual|quais|quanto|quantos|quando|por que|porque)\b/i', $normalized)) {
        return null;
    }

    $financeTokens = array(
        'pix', 'px', 'cnpj', 'maq', 'mpix', 'maqpix', 'maquininha', 'sang', 'sg', 'sangria',
        'dinheiro', 'caixa', 'cartao', 'credito', 'debito', 'outros', 'despesa'
    );
    if (miauw_skill_parse_money_value($message) !== null
        && miauw_skill_financeiro_category_from_message($message) !== null
        && miauw_skill_has_any($normalized, $financeTokens)
    ) {
        return null;
    }

    $body = trim($message);
    $body = preg_replace('/^\s*(?:miauby|miauw)\s+/iu', '', $body) ?? $body;
    $body = preg_replace('/^\s*(?:cotacao|cota..o|orcamento|or.amento|preco|pre.os)\s+(?:rapida\s+)?/iu', '', $body) ?? $body;

    if (!preg_match('/^([\p{L}0-9 ._-]{2,60})\s[-:]\s(.+)$/u', $body, $match)) {
        return null;
    }

    $supplier = miauw_skill_clean_encomenda_part((string) $match[1], 60);
    $itemsText = trim((string) $match[2]);
    if ($supplier === '' || $itemsText === '') {
        return null;
    }

    if (!miauw_skill_supplier_name_is_safe_for_quick_quote($supplier)) {
        return null;
    }

    $chunks = preg_split('/[;\n]+|,\s*(?=[\p{L}])/u', $itemsText) ?: array();
    $items = array();
    $pricedItems = 0;
    foreach ($chunks as $chunk) {
        $chunk = trim((string) $chunk);
        if ($chunk === '') {
            continue;
        }

        $price = miauw_skill_parse_money_from_text($chunk);
        $product = preg_replace('/(?:r\$\s*)?[0-9]+(?:[.,][0-9]{1,2})?\s*(?:reais|real)?\b/iu', '', $chunk) ?? $chunk;
        $product = miauw_skill_clean_encomenda_part($product, 180);
        if ($product === '') {
            continue;
        }

        $category = miauw_skill_product_operational_category($product, 'cotacao rapida');
        if ($price !== null && (float) $price > 0) {
            $pricedItems++;
        }
        $items[] = array(
            'produto' => $product,
            'preco' => $price,
            'categoria' => $category,
        );
    }

    if (!$items || $pricedItems <= 0) {
        return null;
    }

    return array(
        'fornecedor' => $supplier,
        'itens' => $items,
        'raw_message' => $message,
    );
}

function miauw_skill_create_cotacao_rapida(array $command): array
{
    $supplierName = miauw_skill_clean_encomenda_part((string) ($command['fornecedor'] ?? ''), 60);
    $items = is_array($command['itens'] ?? null) ? $command['itens'] : array();

    if ($supplierName === '' || !$items) {
        throw new RuntimeException('Informe distribuidora e produtos da cotacao rapida.');
    }

    $blockId = miauw_skill_cotacao_default_block_id();
    $supplier = cotacao_add_supplier($blockId, $supplierName);
    $supplierId = (int) ($supplier['id'] ?? 0);
    if ($supplierId <= 0) {
        throw new RuntimeException('Nao consegui criar/localizar a distribuidora da cotacao rapida.');
    }

    $created = array();
    foreach ($items as $item) {
        $product = miauw_skill_clean_encomenda_part((string) ($item['produto'] ?? ''), 180);
        if ($product === '') {
            continue;
        }

        $prices = array();
        if (isset($item['preco']) && $item['preco'] !== null && (float) $item['preco'] > 0) {
            $prices[$supplierId] = (string) $item['preco'];
        }

        $category = miauw_skill_product_operational_category($product, 'cotacao rapida');
        if (isset($item['categoria']) && is_string($item['categoria']) && trim($item['categoria']) !== '') {
            $category = miauw_skill_clean_encomenda_part((string) $item['categoria'], 80);
        }

        $itemId = cotacao_save_item($blockId, array(
            'produto' => $product,
            'quantidade' => '1',
            'categoria' => $category,
            'prioridade' => 'normal',
            'status' => 'aberta',
            'observacao' => 'Cotacao rapida criada pelo Miauby. Fornecedor: ' . $supplierName . '.',
        ), $prices);

        $created[] = array(
            'id' => $itemId,
            'produto' => $product,
            'preco' => isset($item['preco']) ? $item['preco'] : null,
            'categoria' => $category,
        );
    }

    if (!$created) {
        throw new RuntimeException('Nenhum produto valido na cotacao rapida.');
    }

    if (function_exists('log_action')) {
        log_action(
            'miauw_cotacao_rapida_criada',
            'cotacao_itens',
            (int) ($created[0]['id'] ?? 0),
            json_encode(array('fornecedor' => $supplierName, 'itens' => $created), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'Cotacao rapida criada pelo Miauby.'
        );
    }

    return array(
        'fornecedor' => $supplierName,
        'fornecedor_id' => $supplierId,
        'itens' => $created,
    );
}

function miauw_skill_cotacao_rapida_action_reply(array $result): string
{
    $lines = array(
        'Cotacao rapida registrada.',
        'Fornecedor: ' . (string) ($result['fornecedor'] ?? '-'),
    );

    foreach (($result['itens'] ?? array()) as $item) {
        $price = isset($item['preco']) && $item['preco'] !== null
            ? ' - ' . miauw_skill_money((float) $item['preco'])
            : ' - sem preco';
        $category = isset($item['categoria']) && (string) $item['categoria'] !== ''
            ? ' | categoria: ' . (string) $item['categoria']
            : '';
        $lines[] = '- ' . (string) ($item['produto'] ?? '-') . $price . $category;
    }

    $lines[] = 'Proximo passo: conferir vencedor e completar dados faltantes.';

    return implode("\n", $lines);
}

function miauw_skill_quick_table_reply(string $message): ?string
{
    $normalized = miauw_skill_normalized($message);
    if (!miauw_skill_has_any($normalized, array('tabela rapida', 'cria tabela', 'criar tabela', 'monta tabela', 'montar tabela'))) {
        return null;
    }

    $body = preg_replace('/^.*?(?:tabela rapida|cria tabela|criar tabela|monta tabela|montar tabela)\s*[:\-]?\s*/iu', '', $message) ?? '';
    $body = trim($body);
    $rows = array();

    foreach (preg_split('/\n+|;+/u', $body) ?: array() as $line) {
        $line = trim((string) $line);
        if ($line === '') {
            continue;
        }
        $parts = array_map('trim', preg_split('/\||,/', $line) ?: array());
        $rows[] = array_pad(array_slice($parts, 0, 4), 4, '');
    }

    $output = array(
        '| Item | Quantidade | Valor | Observacao |',
        '|---|---:|---:|---|',
    );

    if (!$rows) {
        $rows = array(
            array('', '', '', ''),
            array('', '', '', ''),
            array('', '', '', ''),
        );
    }

    foreach ($rows as $row) {
        $output[] = '| ' . implode(' | ', array_map(static function ($value): string {
            return str_replace('|', '/', (string) $value);
        }, $row)) . ' |';
    }

    return "Tabela rapida:\n" . implode("\n", $output);
}

function miauw_skill_cotacao_improvement_suggestions(string $message): ?string
{
    if (!miauw_skill_has_any($message, array('sugestao cotacao', 'sugestao de cotacao', 'sugestao na cotacao', 'sugestao de melhora na cotacao', 'melhorar cotacao', 'melhoria cotacao', 'melhorias cotacao'))) {
        return null;
    }

    return implode("\n", array(
        "SUGESTOES PARA COTACAO - veredito do Miauby",
        "1. Padronize categorias: geral, urgente, encomenda e controlado. Categoria baguncada mata filtro.",
        "2. Use cor de Produto como triagem visual: vermelho para comprar agora, azul para urgente conferido, amarelo para revisar.",
        "3. Confira linhas sem vencedor no fim do dia. Sem vencedor e item parado usando fantasia.",
        "4. Use cotacao rapida no chat: `Mauro - loratadina 5 reais, losartana 3,20` para jogar preco sem abrir ritual.",
        "5. Depois de filtrar por categoria, use o filtro de Quem ganhou para ver fornecedor dominante e negociar melhor.",
        "6. Encomenda precisa de produto, responsavel e retorno. Se passar de 1 dia parada, vira alerta operacional.",
        "7. Para compras maiores: compare preco, prazo, bonificacao, validade, giro e ruptura. Preco baixo sozinho e armadilha bonita.",
    ));
}

function miauw_skill_detect_modules(string $message): array
{
    $modules = array();

    if (miauw_skill_has_any($message, array('financeiro', 'caixa', 'fechamento', 'sangria', 'maquininha', 'pix', 'sobra', 'falta', 'total sistema', 'total lancado'))) {
        $modules[] = 'financeiro';
    }

    if (miauw_skill_has_any($message, array('cashback', 'cliente', 'clientes', 'resgate', 'credito', 'creditos', 'crédito', 'créditos', 'venda', 'vendas', 'vendeu', 'compras'))) {
        $modules[] = 'cashback';
    }

    if (miauw_skill_has_any($message, array('cotacao', 'cotação', 'ean', 'produto', 'distribuidora', 'fornecedor', 'fornecedores', 'urgente', 'encomenda', 'cotacao rapida', 'em falta', 'sem estoque', 'tabela rapida'))) {
        $modules[] = 'cotacao';
    }

    if (miauw_skill_has_any($message, array('tarefa', 'tarefas', 'pendencia', 'pendencias', 'prioridade', 'concluida', 'concluidas', 'cancelada', 'canceladas'))) {
        $modules[] = 'tarefa';
    }

    if (function_exists('miauw_fp_message_matches') && miauw_fp_message_matches($message)) {
        $modules[] = 'farmacia_popular';
    }

    return array_values(array_unique($modules));
}

function miauw_skill_wants_report(string $message): bool
{
    if (!miauw_skill_has_any($message, array('pdf', 'relatorio', 'relatório', 'exporta', 'exportar', 'gerar', 'gera', 'criar'))) {
        return false;
    }

    return miauw_skill_has_any($message, array('pdf', 'relatorio', 'relatório'));
}

function miauw_skill_financeiro_functions_loaded(): bool
{
    if (function_exists('financeiro_add_lancamento')) {
        return true;
    }

    $path = __DIR__ . '/../financeiro/financeiro-funcoes.php';
    if (!is_file($path)) {
        return false;
    }

    require_once $path;

    return function_exists('financeiro_add_lancamento');
}

function miauw_skill_cotacao_functions_loaded(): bool
{
    if (function_exists('cotacao_save_item')) {
        return true;
    }

    $path = __DIR__ . '/../cotacao/cotacao-funcoes.php';
    if (!is_file($path)) {
        return false;
    }

    require_once $path;

    return function_exists('cotacao_save_item');
}

function miauw_skill_cotacao_default_block_id(): int
{
    if (!miauw_skill_cotacao_functions_loaded()) {
        throw new RuntimeException('Cotacao indisponivel para o Miauby.');
    }

    if (function_exists('cotacao_ensure_schema')) {
        cotacao_ensure_schema();
    }

    $block = function_exists('cotacao_block_by_slug') ? cotacao_block_by_slug('cotacao-geral') : null;
    if (is_array($block) && (int) ($block['id'] ?? 0) > 0) {
        return (int) $block['id'];
    }

    $stmt = db()->query("SELECT id FROM cotacao_blocos WHERE ativo = 1 ORDER BY ordem ASC, id ASC LIMIT 1");
    $id = (int) ($stmt ? $stmt->fetchColumn() : 0);
    if ($id <= 0) {
        throw new RuntimeException('Nenhum bloco ativo de cotacao encontrado.');
    }

    return $id;
}

function miauw_skill_cotacao_planilha_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);
    if (preg_match('/^\s*(?:como|onde|qual|quais|quanto|quantos|quando|por que|porque)\b/i', $normalized)) {
        return null;
    }

    if (!preg_match('/\b(?:cria|criar|adiciona|adicionar|nova|novo)\b.*\b(?:planilha|aba|bloco|cotacao)\b/iu', $normalized)) {
        return null;
    }

    $name = $message;
    $name = preg_replace('/^\s*(?:miauby|miauw)\s+/iu', '', $name) ?? $name;
    $name = preg_replace('/\b(?:cria|criar|adiciona|adicionar|nova|novo|uma|um|planilha|aba|bloco|cotacao|para|de|do|da|igual|modelo)\b/iu', ' ', $name) ?? $name;
    $name = miauw_skill_clean_encomenda_part($name, 80);

    if ($name === '' || in_array(miauw_skill_normalized($name), array('planilha', 'aba', 'bloco', 'cotacao'), true)) {
        return null;
    }

    return array(
        'nome' => $name,
        'descricao' => 'Planilha de cotacao criada pelo Miauby com o mesmo modelo operacional da Cotacao Geral.',
    );
}

function miauw_skill_create_cotacao_planilha(array $command): array
{
    if (!miauw_skill_cotacao_functions_loaded() || !function_exists('cotacao_add_block')) {
        throw new RuntimeException('Modulo Cotacao indisponivel para criar planilha.');
    }

    $name = miauw_skill_clean_encomenda_part((string) ($command['nome'] ?? ''), 80);
    if ($name === '') {
        throw new RuntimeException('Informe o nome da nova planilha de cotacao.');
    }

    $description = miauw_skill_clean_encomenda_part((string) ($command['descricao'] ?? ''), 180);
    $block = cotacao_add_block($name, $description !== '' ? $description : 'Planilha de cotacao criada pelo Miauby.');

    return array(
        'id' => (int) ($block['id'] ?? 0),
        'nome' => (string) ($block['nome'] ?? $name),
        'slug' => (string) ($block['slug'] ?? ''),
    );
}

function miauw_skill_cotacao_planilha_action_reply(array $result): string
{
    return "Planilha de cotacao criada.\n"
        . "Nome: " . (string) ($result['nome'] ?? '-') . "\n"
        . "Modelo: igual a Cotacao Geral, com EAN, produto, quantidade, categoria, distribuidoras, vencedor, filtros e formatacao.\n"
        . "Proximo passo: abrir /cotacao/?bloco=" . (string) ($result['slug'] ?? '') . " e conferir fornecedores iniciais.";
}

function miauw_skill_parse_money_value(string $message): ?float
{
    $patterns = array(
        '/(?:r\$\s*)([0-9][0-9\.\,]*)/iu',
        '/([0-9][0-9\.\,]*)\s*(?:reais|real|rs)\b/iu',
        '/(?:valor|deu|de|foi|lancei|fiz|adicionei|registrei)\s+(?:r\$\s*)?([0-9][0-9\.\,]*)/iu',
    );

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message, $match)) {
            $value = miauw_skill_money_to_float((string) $match[1]);
            if ($value !== null && $value > 0) {
                return $value;
            }
        }
    }

    preg_match_all('/(?<![0-9\/])([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[\.,][0-9]{1,2})?)(?![0-9\/])/u', $message, $matches);
    foreach (($matches[1] ?? array()) as $candidate) {
        $value = miauw_skill_money_to_float((string) $candidate);
        if ($value !== null && $value > 0 && ($value < 2020 || $value > 2035)) {
            return $value;
        }
    }

    return null;
}

function miauw_skill_financeiro_item_words(): array
{
    return array(
        'agua', 'aguas', 'bebida', 'bebidas', 'boleto', 'boletos', 'cafe', 'cliente',
        'compra', 'compras', 'encomenda', 'encomendas', 'embalagem', 'embalagens', 'fralda',
        'fraldas', 'insumo', 'insumos', 'item', 'itens', 'lanche', 'lanches', 'limpeza',
        'material', 'materiais', 'medicamento', 'medicamentos', 'mercadoria', 'mercadorias',
        'motivo', 'pao', 'paode', 'pedido', 'pedidos', 'produto', 'produtos', 'queijo',
        'refri', 'refrigerante', 'refrigerantes', 'remedio', 'remedios', 'sabonete', 'sabonetes', 'sacola', 'sacolas',
        'bobina', 'bobinas', 'coca', 'entrega', 'entregador', 'leite', 'motoboy', 'papel',
        'soro', 'troco', 'vale', 'zero', 'dipirona', 'losartana', 'loratadina', 'metformina',
        'glifage', 'ipratropio', 'rivotril', 'nifedipino', 'flancox', 'xarope', 'pomada',
        'comprimido', 'comprimidos', 'capsula', 'capsulas', 'gotas'
    );
}

function miauw_skill_financeiro_category_words(): array
{
    return array(
        'c', 'cd', 'cnpj', 'cart', 'cartao', 'credito', 'debito', 'dinheiro', 'fisico',
        'maquina', 'maquininha', 'maq', 'maqui', 'mpix', 'maqpix', 'out', 'outro',
        'outros', 'pix', 'pixcnpj', 'px', 'sang', 'sangria', 'sg'
    );
}

function miauw_skill_financeiro_context_stop_words(): array
{
    return array_merge(
        miauw_skill_financeiro_category_words(),
        array(
            'a', 'as', 'ao', 'aos', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas',
            'no', 'nos', 'o', 'os', 'por', 'pro', 'pra', 'para', 'com', 'sem', 'r', 'rs',
            'caixa', 'real', 'reais', 'valor', 'hoje', 'ontem', 'amanha', 'fiz', 'fez', 'lancei',
            'lancar', 'lanca', 'lancamento', 'adicionei', 'adicione', 'adicionar', 'registrei',
            'registrar', 'coloca', 'coloque', 'bota', 'cria', 'criar', 'recebi', 'recebeu',
            'peguei', 'pegou', 'pego', 'foi', 'retirei', 'retirou', 'tirei', 'tirou', 'usei',
            'usou', 'paguei', 'pagou', 'pago', 'responsavel', 'feito', 'feita', 'atendente',
            'operador'
        )
    );
}

function miauw_skill_financeiro_tokenize_context(string $message): array
{
    $clean = preg_replace('/(?:r\$\s*)?[0-9][0-9\.\,]*(?:\s*(?:reais|real|rs))?/iu', ' ', $message) ?? $message;
    $clean = preg_replace('/\b[0-3]?[0-9][\/\-][0-1]?[0-9](?:[\/\-][0-9]{2,4})?\b/u', ' ', $clean) ?? $clean;
    preg_match_all('/[\p{L}\p{N}\.\-]+/u', $clean, $matches);

    $tokens = array();
    foreach (($matches[0] ?? array()) as $word) {
        $original = trim((string) $word, " \t\n\r\0\x0B-:;,.()");
        if ($original === '') {
            continue;
        }

        $normalized = trim(miauw_skill_normalized($original), " \t\n\r\0\x0B-:;,.()");
        if ($normalized === '' || preg_match('/^[0-9]+$/', $normalized)) {
            continue;
        }

        $tokens[] = array(
            'original' => $original,
            'normalized' => $normalized,
        );
    }

    return $tokens;
}

function miauw_skill_financeiro_is_item_token(string $normalized): bool
{
    return in_array($normalized, miauw_skill_financeiro_item_words(), true)
        || (bool) preg_match('/(?:mg|mcg|ml|ui|comprim|caps|gota|xarope|pomada)$/i', $normalized);
}

function miauw_skill_financeiro_visible_context_tokens(array $tokens): array
{
    $stopWords = miauw_skill_financeiro_context_stop_words();
    $visible = array();

    foreach ($tokens as $token) {
        $normalized = (string) ($token['normalized'] ?? '');
        if ($normalized === '' || in_array($normalized, $stopWords, true)) {
            continue;
        }

        $visible[] = $token;
    }

    return $visible;
}

function miauw_skill_financeiro_parts_from_visible_tokens(array $visible): array
{
    $empty = array('responsavel' => '', 'observacao' => '');
    $count = count($visible);
    if ($count === 0) {
        return $empty;
    }

    if ($count === 1) {
        $token = $visible[0];
        if (miauw_skill_financeiro_is_item_token((string) $token['normalized'])) {
            return array('responsavel' => '', 'observacao' => miauw_skill_financeiro_clean_observation((string) $token['original']));
        }

        return array('responsavel' => miauw_substr((string) $token['original'], 0, 70), 'observacao' => '');
    }

    $itemIndexes = array();
    $nameIndexes = array();
    foreach ($visible as $index => $token) {
        if (miauw_skill_financeiro_is_item_token((string) $token['normalized'])) {
            $itemIndexes[] = $index;
        } else {
            $nameIndexes[] = $index;
        }
    }

    if (!$itemIndexes) {
        return array(
            'responsavel' => miauw_substr(implode(' ', array_column($visible, 'original')), 0, 70),
            'observacao' => '',
        );
    }

    $responsibleIndex = null;
    if (count($nameIndexes) === 1) {
        $responsibleIndex = $nameIndexes[0];
    } elseif (in_array(0, $itemIndexes, true)) {
        $responsibleIndex = end($nameIndexes);
    } else {
        $responsibleIndex = $nameIndexes[0] ?? null;
    }

    if ($responsibleIndex === null) {
        return array(
            'responsavel' => '',
            'observacao' => miauw_skill_financeiro_clean_observation(implode(' ', array_column($visible, 'original'))),
        );
    }

    $responsible = (string) $visible[$responsibleIndex]['original'];
    $obsTokens = array();
    foreach ($visible as $index => $token) {
        if ($index === $responsibleIndex) {
            continue;
        }

        $obsTokens[] = (string) $token['original'];
    }

    return array(
        'responsavel' => miauw_substr($responsible, 0, 70),
        'observacao' => miauw_skill_financeiro_clean_observation(implode(' ', $obsTokens)),
    );
}

function miauw_skill_financeiro_context_parts(string $message, ?string $category, ?float $value): array
{
    $empty = array('responsavel' => '', 'observacao' => '');
    if ($category === null || $category === '' || $value === null) {
        return $empty;
    }

    $tokens = miauw_skill_financeiro_tokenize_context($message);
    if (!$tokens) {
        return $empty;
    }

    $markers = array('comprar', 'compra', 'comprou', 'pagar', 'pagou', 'pago', 'referente', 'motivo');
    $markerIndex = null;
    foreach ($tokens as $index => $token) {
        if (in_array((string) $token['normalized'], $markers, true)) {
            $markerIndex = $index;
            break;
        }
    }

    if ($markerIndex !== null) {
        $before = miauw_skill_financeiro_visible_context_tokens(array_slice($tokens, 0, $markerIndex));
        $after = miauw_skill_financeiro_visible_context_tokens(array_slice($tokens, $markerIndex + 1));
        $responsible = '';
        $observation = '';

        if ($before) {
            $beforeParts = miauw_skill_financeiro_parts_from_visible_tokens($before);
            $responsible = (string) ($beforeParts['responsavel'] ?? '');
            if ((string) ($beforeParts['observacao'] ?? '') !== '') {
                $observation = (string) $beforeParts['observacao'];
            }
        }

        if ($after) {
            $afterParts = miauw_skill_financeiro_parts_from_visible_tokens($after);
            if ($responsible === '' && (string) ($afterParts['responsavel'] ?? '') !== '') {
                $responsible = (string) $afterParts['responsavel'];
            }

            $afterObs = (string) ($afterParts['observacao'] ?? '');
            if ($afterObs === '' && (string) ($afterParts['responsavel'] ?? '') === '') {
                $afterObs = miauw_skill_financeiro_clean_observation(implode(' ', array_column($after, 'original')));
            }

            if ($afterObs !== '') {
                $observation = trim($observation . ' ' . $afterObs);
            }
        }

        return array(
            'responsavel' => miauw_substr($responsible, 0, 70),
            'observacao' => miauw_skill_financeiro_clean_observation($observation),
        );
    }

    return miauw_skill_financeiro_parts_from_visible_tokens(miauw_skill_financeiro_visible_context_tokens($tokens));
}

function miauw_skill_message_has_money(string $message): bool
{
    return miauw_skill_parse_money_value($message) !== null;
}

function miauw_skill_money_to_float(string $value): ?float
{
    $clean = strtolower(trim($value));
    $clean = str_replace(array('r$', 'rs', 'reais', 'real', ' '), '', $clean);

    if ($clean === '') {
        return null;
    }

    if (strpos($clean, ',') !== false) {
        $clean = str_replace('.', '', $clean);
        $clean = str_replace(',', '.', $clean);
    } elseif (preg_match('/^\d{1,3}(?:\.\d{3})+$/', $clean)) {
        $clean = str_replace('.', '', $clean);
    }

    if (!is_numeric($clean)) {
        return null;
    }

    return round((float) $clean, 2);
}

function miauw_skill_financeiro_date_from_message(string $message): string
{
    if (!miauw_skill_financeiro_functions_loaded() || !function_exists('financeiro_valid_date')) {
        return date('Y-m-d');
    }

    $normalized = miauw_skill_normalized($message);
    if (strpos($normalized, 'ontem') !== false) {
        return date('Y-m-d', strtotime('-1 day'));
    }

    if (preg_match('/\b([0-3]?[0-9])[\-\/]([0-1]?[0-9])(?:[\-\/]([0-9]{2,4}))?\b/u', $message, $match)) {
        $year = isset($match[3]) && $match[3] !== '' ? (int) $match[3] : (int) date('Y');
        if ($year < 100) {
            $year += 2000;
        }

        return financeiro_valid_date(sprintf('%02d/%02d/%04d', (int) $match[1], (int) $match[2], $year), date('Y-m-d'));
    }

    return financeiro_valid_date('', date('Y-m-d'));
}

function miauw_skill_financeiro_responsible_from_message(string $message): string
{
    $patterns = array(
        '/\brespons[aá]vel\s*[:\-]?\s*([\p{L}\p{N}\s\.\-]{2,70})/iu',
        '/\b(?:feito|feita)\s+por\s+([\p{L}\p{N}\s\.\-]{2,70})/iu',
        '/\bquem\s+fez\s*(?:foi|:|\-)?\s*([\p{L}\p{N}\s\.\-]{2,70})/iu',
        '/\b(?:atendente|operador|operador\s+de\s+caixa)\s*[:\-]?\s*([\p{L}\p{N}\s\.\-]{2,70})/iu',
    );

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message, $match)) {
            $responsible = trim(preg_replace('/\s+/', ' ', (string) $match[1]) ?? '');
            $responsible = preg_replace('/\b(?:obs|observacao|observação|valor|r\$|reais|real)\b.*$/iu', '', $responsible) ?? $responsible;
            $responsible = trim($responsible);

            if ($responsible !== '') {
                return miauw_substr($responsible, 0, 70);
            }
        }
    }

    return '';
}

function miauw_skill_financeiro_category_from_message(string $message): ?string
{
    $normalized = miauw_skill_normalized($message);

    $aliasPatterns = array(
        '/\b(?:maqpix|mpix|maq\s*pix|maqui\s*pix|maquina\s*pix|maquininha\s*pix|pix\s*maq|pix\s*maquininha)\b/iu' => 'Maquininha Pix',
        '/\b(?:pixcnpj|px\s*cnpj|px)\b/iu' => 'Pix CNPJ',
        '/\b(?:sang|sg)\b/iu' => 'Sangria',
        '/\b(?:out|outs)\b/iu' => 'Outros',
    );

    foreach ($aliasPatterns as $pattern => $category) {
        if (preg_match($pattern, $normalized)) {
            return $category;
        }
    }

    if (
        strpos($normalized, 'sangria') === false
        && strpos($normalized, 'caixa') !== false
        && miauw_skill_has_any($normalized, array('pegou', 'peguei', 'pego', 'retirou', 'retirei', 'tirou', 'tirei', 'usou'))
        && miauw_skill_has_any($normalized, array('comprar', 'compra', 'comprou', 'pagar', 'pagou', 'refrigerante', 'sabonete', 'fralda'))
    ) {
        return 'Outros';
    }

    $map = array(
        'maqpix' => 'Maquininha Pix',
        'mpix' => 'Maquininha Pix',
        'maq pix' => 'Maquininha Pix',
        'maqui pix' => 'Maquininha Pix',
        'maquina pix' => 'Maquininha Pix',
        'pix maq' => 'Maquininha Pix',
        'pix maquina' => 'Maquininha Pix',
        'pix máquina' => 'Maquininha Pix',
        'pix maquininha' => 'Maquininha Pix',
        'maquininha pix' => 'Maquininha Pix',
        'pix cnpj' => 'Pix CNPJ',
        'pix banco' => 'Pix CNPJ',
        'pix sem maquininha' => 'Pix CNPJ',
        'pix sem maquina' => 'Pix CNPJ',
        'cnpj' => 'Pix CNPJ',
        'pix' => 'Pix CNPJ',
        'maquininha c/d' => 'Maquininha C/D',
        'maquininha cd' => 'Maquininha C/D',
        'maq cd' => 'Maquininha C/D',
        'maq c/d' => 'Maquininha C/D',
        'cart' => 'Maquininha C/D',
        'cartao' => 'Maquininha C/D',
        'credito' => 'Maquininha C/D',
        'debito' => 'Maquininha C/D',
        'sang' => 'Sangria',
        'sangria' => 'Sangria',
        'dinheiro fisico' => 'Dinheiro Fisico',
        'dinheiro' => 'Dinheiro Fisico',
        'outros' => 'Outros',
        'outro' => 'Outros',
    );

    foreach ($map as $term => $category) {
        if (strpos($normalized, $term) !== false) {
            return $category;
        }
    }

    if (preg_match('/(?:categoria|lancei|lancar|lanca|lançar|adicionei|adicione|adicionar|registrei|registrar|fiz|coloca|coloque|bota|cria|criar)\s+(.+?)(?:\s+(?:de|valor|por|r\$|[0-9]))/iu', $message, $match)) {
        $candidate = miauw_skill_clean_category((string) $match[1]);
        if ($candidate !== '') {
            return $candidate;
        }
    }

    return null;
}

function miauw_skill_financeiro_command_hint(string $message): ?string
{
    $normalized = miauw_skill_normalized($message);
    $category = miauw_skill_financeiro_category_from_message($message);

    if (preg_match('/^\s*(como|onde|quando|qual|quais|quanto|quantos|por que|porque|posso|devo|explica|ensina)\b/iu', $normalized)) {
        return null;
    }

    $financeWords = array('pix', 'px', 'cnpj', 'maq', 'mpix', 'maqpix', 'maquininha', 'cart', 'cartao', 'credito', 'debito', 'sang', 'sg', 'sangria', 'dinheiro', 'caixa', 'out', 'outro', 'outros');
    if (!miauw_skill_has_any($message, $financeWords)) {
        return null;
    }

    if ($category === null && preg_match('/^\s*pix(?:\s+(?:r\$?\s*)?[0-9][0-9\.\,]*(?:\s*(?:reais|real|rs))?)?\s*$/iu', $normalized)) {
        return "Pix sozinho e apelido curto demais, chefe 😼\nEscolhe o caminho:\n- `pix cnpj 50 fralda responsavel Isadora`\n- `maq pix 50 responsavel Isadora`\nSem tipo de PIX, eu nao deixo o caixa virar adivinhacao.";
    }

    if ($category === null && strpos($normalized, 'pix') !== false && miauw_skill_message_has_money($message)) {
        return "Pix de qual planeta, humano?\nUse `pix cnpj 50 responsavel Isadora` ou `maq pix 50 responsavel Isadora`.\nAindaaa nao entendeuuuu? Pix tem dois caminhos aqui.";
    }

    if ($category === null) {
        return null;
    }

    if (miauw_skill_message_has_money($message)) {
        return null;
    }

    if ($category === 'Pix CNPJ') {
        return "Pix eu separo assim, sem drama:\n- `pix cnpj 50 fralda responsavel Isadora` -> Pix CNPJ\n- `maq pix 50 responsavel Isadora` -> Maquininha Pix\nManda valor + responsavel, porque dinheiro anonimo e fofoca com boleto.";
    }

    if ($category === 'Maquininha Pix') {
        return "Maq pix = Maquininha Pix. Pra eu lancar: `maq pix 500 responsavel Isadora`.\nSe for pix direto no CNPJ, escreve `pix cnpj 500 responsavel Isadora`. Aindaaa nao entendeuuuu? 😼";
    }

    return "Entendi a categoria `" . $category . "`, mas faltou valor e responsavel.\nModelo sem sofrimento: `" . strtolower($category) . " 50 responsavel Isadora`.";
}

function miauw_skill_clean_category(string $category): string
{
    $category = trim(preg_replace('/\s+/', ' ', $category) ?? '');
    $category = preg_replace('/[^\p{L}\p{N}\s\/\-\.\&]/u', '', $category) ?? '';
    $category = trim($category);

    if ($category === '') {
        return '';
    }

    return miauw_substr(ucwords($category), 0, 80);
}

function miauw_skill_financeiro_clean_observation(string $text): string
{
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    $text = preg_replace('/^(?:obs|observacao|observação)\s*[:\-]?\s*/iu', '', $text) ?? $text;
    $text = preg_replace('/\b(?:responsavel|responsavel:|feito por|feita por|quem fez|atendente|operador|caixa)\b.*$/iu', '', $text) ?? $text;
    $text = preg_replace('/^(?:para|pra|pro|por|de|do|da|dos|das|referente\s+a|compra\s+de|comprar|comprou|pagar|pagou)\s+/iu', '', $text) ?? $text;
    $text = trim($text, " \t\n\r\0\x0B-:;,.()");

    if ($text === '' || preg_match('/^(?:reais|real|rs|r\$)$/iu', $text)) {
        return '';
    }

    return miauw_substr($text, 0, 180);
}

function miauw_skill_financeiro_tail_after_money(string $message): string
{
    if (!preg_match('/(?:r\$\s*)?[0-9][0-9\.\,]*(?:\s*(?:reais|real|rs))?/iu', $message, $match, PREG_OFFSET_CAPTURE)) {
        return '';
    }

    return trim(substr($message, $match[0][1] + strlen($match[0][0])));
}

function miauw_skill_financeiro_parts_from_text(string $text): array
{
    return miauw_skill_financeiro_parts_from_visible_tokens(
        miauw_skill_financeiro_visible_context_tokens(
            miauw_skill_financeiro_tokenize_context($text)
        )
    );
}

function miauw_skill_financeiro_explicit_parts(string $message, ?string $category, ?float $value): array
{
    $empty = array('responsavel' => '', 'observacao' => '', 'explicit' => false);
    if ($category === null || $category === '' || $value === null) {
        return $empty;
    }

    $tail = miauw_skill_financeiro_tail_after_money($message);
    if ($tail === '' || !preg_match('/\s[-\x{2013}\x{2014}]\s/u', $tail)) {
        return $empty;
    }

    $pieces = preg_split('/\s[-\x{2013}\x{2014}]\s/u', $tail, 2);
    if (!$pieces || count($pieces) < 2) {
        return $empty;
    }

    $left = trim((string) $pieces[0]);
    $right = trim((string) $pieces[1]);
    if ($left === '' && $right === '') {
        return $empty;
    }

    $leftParts = miauw_skill_financeiro_parts_from_text($left);
    $responsible = (string) ($leftParts['responsavel'] ?? '');
    $leftObs = (string) ($leftParts['observacao'] ?? '');
    $rightObs = miauw_skill_financeiro_clean_observation($right);
    $observation = trim($leftObs . ($leftObs !== '' && $rightObs !== '' ? ' ' : '') . $rightObs);

    return array(
        'responsavel' => miauw_substr($responsible, 0, 70),
        'observacao' => miauw_skill_financeiro_clean_observation($observation),
        'explicit' => true,
    );
}

function miauw_skill_financeiro_user_obs_from_message(string $message): string
{
    if (preg_match('/\bobs?\.?\s*[:\-]\s*(.+)$/iu', $message, $match)) {
        return miauw_skill_financeiro_clean_observation((string) $match[1]);
    }

    $patterns = array(
        '/\b(?:para|pra)\s+comprar\s+(.+)$/iu',
        '/\b(?:comprar|comprou|compra\s+de|pagar|pagou)\s+(.+)$/iu',
        '/\b(?:referente\s+a|motivo\s*[:\-])\s*(.+)$/iu',
        '/(?:r\$\s*[0-9][0-9\.\,]*|[0-9][0-9\.\,]*\s*(?:reais|real|rs))\s+(.+)$/iu',
        '/(?<![0-9\/])(?:[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[\.,][0-9]{1,2})?)\s+([^\d].+)$/iu',
    );

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message, $match)) {
            $obs = miauw_skill_financeiro_clean_observation((string) $match[1]);
            if ($obs !== '') {
                return $obs;
            }
        }
    }

    return '';
}

function miauw_skill_financeiro_compact_parts(string $message, ?string $category, ?float $value): array
{
    $empty = array('responsavel' => '', 'observacao' => '');
    if ($category === null || $category === '' || $value === null) {
        return $empty;
    }

    if (!preg_match('/^\s*(pix(?:\s+cnpj)?|cnpj|maq\s+pix|maqui\s+pix|maquina\s+pix|maquininha\s+pix|pix\s+maq|pix\s+maquininha|cart(?:ao)?|cartão|credito|cr[eé]dito|debito|d[eé]bito|dinheiro(?:\s+fisico)?|sangria|outros?)\b/iu', $message)) {
        return $empty;
    }

    if (!preg_match('/(?:r\$\s*)?[0-9][0-9\.\,]*(?:\s*(?:reais|real|rs))?/iu', $message, $match, PREG_OFFSET_CAPTURE)) {
        return $empty;
    }

    $tail = substr($message, $match[0][1] + strlen($match[0][0]));
    $tail = miauw_skill_financeiro_clean_observation($tail);
    if ($tail === '') {
        return $empty;
    }

    $normalizedTail = miauw_skill_normalized($tail);
    if (preg_match('/\b(?:responsavel|feito por|feita por|quem fez|atendente|operador)\b/iu', $normalizedTail)) {
        return $empty;
    }

    $words = preg_split('/\s+/u', $tail) ?: array();
    $words = array_values(array_filter($words, static function ($word): bool {
        return trim((string) $word) !== '';
    }));
    $count = count($words);

    if ($count === 0) {
        return $empty;
    }

    $first = miauw_skill_normalized((string) $words[0]);
    $obsStarters = miauw_skill_financeiro_item_words();

    if ($count === 1) {
        if (in_array($first, $obsStarters, true)) {
            return array('responsavel' => '', 'observacao' => miauw_skill_financeiro_clean_observation($words[0]));
        }

        return array('responsavel' => miauw_substr($words[0], 0, 70), 'observacao' => '');
    }

    if ($count === 2 && !in_array($first, $obsStarters, true)) {
        return array('responsavel' => miauw_substr(implode(' ', $words), 0, 70), 'observacao' => '');
    }

    $responsible = (string) array_pop($words);
    $observation = miauw_skill_financeiro_clean_observation(implode(' ', $words));

    return array(
        'responsavel' => miauw_substr($responsible, 0, 70),
        'observacao' => $observation,
    );
}

function miauw_skill_financeiro_split_obs_responsible(string $observation, string $category): array
{
    $result = array('responsavel' => '', 'observacao' => $observation);
    $observation = miauw_skill_financeiro_clean_observation($observation);

    if ($observation === '' || !in_array($category, array('Outros', 'Pix CNPJ', 'Sangria', 'Maquininha Pix', 'Maquininha C/D', 'Dinheiro Fisico'), true)) {
        return $result;
    }

    $words = preg_split('/\s+/u', $observation) ?: array();
    $words = array_values(array_filter($words, static function ($word): bool {
        return trim((string) $word) !== '';
    }));

    if (count($words) < 2) {
        return $result;
    }

    $last = (string) end($words);
    $normalizedLast = miauw_skill_normalized($last);
    $productWords = array_merge(miauw_skill_financeiro_item_words(), array('cola', 'liquido'));

    if (in_array($normalizedLast, $productWords, true) || preg_match('/^[0-9]+$/', $last)) {
        return $result;
    }

    array_pop($words);
    $obs = miauw_skill_financeiro_clean_observation(implode(' ', $words));
    if ($obs === '') {
        return $result;
    }

    return array(
        'responsavel' => miauw_substr($last, 0, 70),
        'observacao' => $obs,
    );
}

function miauw_skill_financeiro_obs_from_parts(string $category, string $responsible = '', string $obs = ''): string
{
    $base = 'Miauby criou a categoria ' . $category . ' por comando interno no chat.';
    $responsible = trim($responsible);
    $obs = miauw_skill_financeiro_clean_observation($obs);

    if ($responsible !== '') {
        $base .= ' Responsavel informado: ' . miauw_substr($responsible, 0, 70) . '.';
    }

    if ($obs !== '') {
        return $base . ' Obs do usuario: ' . $obs;
    }

    return $base;
}

function miauw_skill_financeiro_obs_from_message(string $message, string $category, string $responsible = ''): string
{
    return miauw_skill_financeiro_obs_from_parts($category, $responsible, miauw_skill_financeiro_user_obs_from_message($message));
}

function miauw_skill_financeiro_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);

    if (preg_match('/^\s*(como|onde|quando|qual|quais|quanto|quantos|por que|porque|posso|devo|explica|ensina)\b/iu', $normalized)) {
        return null;
    }

    $intent = miauw_skill_has_any($message, array(
        'fiz', 'lancei', 'lanca', 'lança', 'lancar', 'lançar', 'adicionei', 'adicione', 'adicionar',
        'registrei', 'registrar', 'coloca', 'coloque', 'bota', 'cria', 'criar',
        'recebi', 'recebeu', 'peguei', 'pegou', 'foi pego', 'retirei', 'retirou', 'tirei', 'tirou',
        'usei', 'usou', 'paguei', 'pagou', 'comprar', 'comprou'
    ));

    $value = miauw_skill_parse_money_value($message);
    $category = miauw_skill_financeiro_category_from_message($message);
    $responsible = miauw_skill_financeiro_responsible_from_message($message);
    $userObservation = miauw_skill_financeiro_user_obs_from_message($message);

    if ($value === null || $category === null || $category === '') {
        return null;
    }

    $explicitParts = miauw_skill_financeiro_explicit_parts($message, $category, $value);
    $hasExplicitParts = (bool) ($explicitParts['explicit'] ?? false);
    if ($hasExplicitParts) {
        if ((string) ($explicitParts['responsavel'] ?? '') !== '') {
            $responsible = (string) $explicitParts['responsavel'];
        }
        if ((string) ($explicitParts['observacao'] ?? '') !== '') {
            $userObservation = (string) $explicitParts['observacao'];
        }
    }

    $compactParts = miauw_skill_financeiro_compact_parts($message, $category, $value);
    if (!$hasExplicitParts && $responsible === '' && (string) ($compactParts['responsavel'] ?? '') !== '') {
        $responsible = (string) $compactParts['responsavel'];
    }
    if (!$hasExplicitParts && (string) ($compactParts['observacao'] ?? '') !== '') {
        $userObservation = (string) $compactParts['observacao'];
    } elseif ($responsible !== '' && miauw_skill_normalized($userObservation) === miauw_skill_normalized($responsible)) {
        $userObservation = '';
    }

    if (!$hasExplicitParts) {
        $contextParts = miauw_skill_financeiro_context_parts($message, $category, $value);
        if ((string) ($contextParts['responsavel'] ?? '') !== '') {
            $responsible = (string) $contextParts['responsavel'];
        }
        if ((string) ($contextParts['observacao'] ?? '') !== '') {
            $userObservation = (string) $contextParts['observacao'];
        } elseif ($responsible !== '' && miauw_skill_normalized($userObservation) === miauw_skill_normalized($responsible)) {
            $userObservation = '';
        }
    }

    if ($responsible === '' && $userObservation !== '') {
        $split = miauw_skill_financeiro_split_obs_responsible($userObservation, $category);
        if ((string) ($split['responsavel'] ?? '') !== '') {
            $responsible = (string) $split['responsavel'];
            $userObservation = (string) ($split['observacao'] ?? $userObservation);
        }
    }

    if (!$intent && !miauw_skill_has_any($message, array('pix', 'px', 'cnpj', 'maq', 'mpix', 'maqpix', 'maquininha', 'cart', 'cartao', 'credito', 'debito', 'sang', 'sg', 'sangria', 'dinheiro', 'caixa', 'out', 'outro', 'outros'))) {
        return null;
    }

    return array(
        'categoria' => $category,
        'valor' => $value,
        'data' => miauw_skill_financeiro_date_from_message($message),
        'responsavel' => $responsible,
        'observacao_usuario' => $userObservation,
        'observacao' => miauw_skill_financeiro_obs_from_parts($category, $responsible, $userObservation),
    );
}

function miauw_skill_create_financeiro_lancamento(string $category, float $value, string $observation = '', ?string $date = null, string $responsible = ''): array
{
    if (!miauw_skill_financeiro_functions_loaded()) {
        throw new RuntimeException('Financeiro indisponivel para o Miauby.');
    }

    $category = miauw_skill_clean_category($category);
    if ($category === '') {
        throw new RuntimeException('Categoria vazia. Sem categoria, sem magia.');
    }

    if ($value <= 0) {
        throw new RuntimeException('Valor invalido para lancamento financeiro.');
    }

    $responsible = trim($responsible);
    if ($responsible === '') {
        throw new RuntimeException('Informe quem fez ou quem e o responsavel antes de gravar no financeiro.');
    }

    $date = function_exists('financeiro_valid_date') ? financeiro_valid_date((string) ($date ?? ''), date('Y-m-d')) : date('Y-m-d');
    $closing = financeiro_get_or_create_closing($date);

    if (financeiro_is_locked($closing)) {
        throw new RuntimeException('Esse dia esta fechado. Reabra antes de pedir para o gato mexer no caixa.');
    }

    $observation = trim($observation);
    if ($observation === '') {
        $observation = 'Miauby criou a categoria ' . $category . ' por comando interno no chat.';
    }

    if (stripos($observation, 'responsavel informado') === false && stripos($observation, 'responsável informado') === false) {
        $observation .= ' Responsavel informado: ' . miauw_substr($responsible, 0, 70) . '.';
    }

    $observation = miauw_substr($observation, 0, 300);

    $id = financeiro_add_lancamento((int) $closing['id'], $date, $category, $value, $observation);
    $updated = financeiro_fetch_by_id((int) $closing['id']) ?: $closing;

    if (function_exists('log_action')) {
        $logPayload = array(
            'data' => $date,
            'categoria' => $category,
            'valor' => $value,
            'responsavel' => $responsible,
            'observacao' => $observation,
        );
        log_action(
            'miauw_financeiro_lancamento_criado',
            'financeiro_lancamentos',
            $id,
            json_encode($logPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'Lancamento financeiro criado pelo Miauby.'
        );
    }

    return array(
        'id' => $id,
        'data' => $date,
        'categoria' => $category,
        'valor' => $value,
        'responsavel' => $responsible,
        'observacao' => $observation,
        'total_conferido' => (float) ($updated['total_conferido'] ?? 0),
        'sobra_falta' => (float) ($updated['sobra_falta'] ?? 0),
    );
}

function miauw_skill_create_financeiro_lancamento_from_message(string $message): ?array
{
    $command = miauw_skill_financeiro_command_from_message($message);
    if ($command === null) {
        return null;
    }

    return miauw_skill_create_financeiro_lancamento(
        (string) $command['categoria'],
        (float) $command['valor'],
        (string) $command['observacao'],
        (string) $command['data'],
        (string) ($command['responsavel'] ?? '')
    );
}

function miauw_skill_financeiro_action_reply(array $result): string
{
    $openers = array(
        'Aindaaa bem que voce falou claro. Lancei.',
        'Pronto, caos domesticado no caixa.',
        'Miauby assinou embaixo e o financeiro parou de gritar.',
        'Feito. O caixa piscou, mas sobreviveu.',
    );

    $text = $openers[array_rand($openers)]
        . "\n" . (string) $result['categoria'] . ': ' . miauw_skill_money((float) $result['valor'])
        . "\nResponsavel: " . (string) $result['responsavel']
        . "\nData: " . date('d/m/Y H:i', strtotime((string) $result['data'] . ' ' . date('H:i:s')))
        . "\nObs: " . (string) $result['observacao'];

    return $text;
}

function miauw_skill_financeiro_daily_revenue_command_from_message(string $message): ?array
{
    $normalized = miauw_skill_normalized($message);
    if (preg_match('/^\s*(como|onde|quando|qual|quais|quanto|quantos|por que|porque|posso|devo|explica|ensina)\b/iu', $normalized)) {
        return null;
    }

    if (!miauw_skill_has_any($message, array('vendeu', 'vendas', 'faturou', 'faturamento', 'faturamento diario', 'faturamento diario'))) {
        return null;
    }

    $defaultYear = (int) date('Y');
    $defaultMonth = (int) date('n');
    $entries = array();
    $pattern = '/(?:^|[\s,;])(?:dia\s*)?([0-3]?\d)(?:[\/\-]([0-1]?\d)(?:[\/\-](\d{2,4}))?)?\s*(?:vendeu|vendas|faturou|faturamento|=|:|\-)?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/iu';

    if (!preg_match_all($pattern, $message, $matches, PREG_SET_ORDER)) {
        return null;
    }

    foreach ($matches as $match) {
        $day = max(1, min(31, (int) ($match[1] ?? 0)));
        $month = isset($match[2]) && $match[2] !== '' ? max(1, min(12, (int) $match[2])) : $defaultMonth;
        $year = isset($match[3]) && $match[3] !== '' ? (int) $match[3] : $defaultYear;
        if ($year < 100) {
            $year += 2000;
        }

        $value = miauw_skill_money_to_float((string) ($match[4] ?? ''));
        if ($value === null || $value < 0 || !checkdate($month, $day, $year)) {
            continue;
        }

        $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
        $entries[$date] = array('data' => $date, 'valor' => $value);
    }

    if (!$entries) {
        return null;
    }

    return array(
        'entries' => array_values($entries),
        'raw_message' => $message,
    );
}

function miauw_skill_create_financeiro_faturamentos(array $command, ?int $userId = null): array
{
    if (!miauw_skill_financeiro_functions_loaded() || !function_exists('financeiro_save_faturamento_dia')) {
        throw new RuntimeException('Financeiro indisponivel para salvar faturamento diario.');
    }

    $entries = is_array($command['entries'] ?? null) ? $command['entries'] : array();
    $saved = array();

    foreach ($entries as $entry) {
        $date = (string) ($entry['data'] ?? '');
        $value = (float) ($entry['valor'] ?? 0);
        if ($date === '' || $value < 0) {
            continue;
        }

        $saved[] = financeiro_save_faturamento_dia($date, $value, $userId, 'miauby');
    }

    if (!$saved) {
        throw new RuntimeException('Nenhum faturamento diario valido para salvar.');
    }

    return array('salvos' => $saved);
}

function miauw_skill_financeiro_faturamento_action_reply(array $result): string
{
    $lines = array('Faturamento diario registrado.');
    foreach (($result['salvos'] ?? array()) as $entry) {
        $lines[] = '- ' . date('d/m/Y', strtotime((string) ($entry['data_fechamento'] ?? 'now')))
            . ': ' . miauw_skill_money((float) ($entry['faturamento_dia'] ?? 0));
    }

    $lines[] = 'O resumo do mes ja passa a considerar esses valores.';

    return implode("\n", $lines);
}

function miauw_skill_context_layers_for_message(string $message): string
{
    $lines = array();
    $normalized = miauw_skill_normalized($message);

    $dailyRevenue = miauw_skill_financeiro_daily_revenue_command_from_message($message);
    if ($dailyRevenue) {
        $parts = array();
        foreach (($dailyRevenue['entries'] ?? array()) as $entry) {
            $parts[] = date('d/m/Y', strtotime((string) $entry['data'])) . ' = ' . miauw_skill_money((float) $entry['valor']);
        }
        $lines[] = 'Camada financeiro/faturamento diario: ' . implode('; ', $parts);
    }

    $finance = miauw_skill_financeiro_command_from_message($message);
    if ($finance) {
        $lines[] = 'Camada financeiro/lancamento: categoria=' . (string) ($finance['categoria'] ?? '-')
            . '; valor=' . miauw_skill_money((float) ($finance['valor'] ?? 0))
            . '; responsavel=' . ((string) ($finance['responsavel'] ?? '') !== '' ? (string) $finance['responsavel'] : 'pendente')
            . '; observacao=' . ((string) ($finance['observacao_usuario'] ?? '') !== '' ? (string) $finance['observacao_usuario'] : '-');
    }

    $task = miauw_skill_tarefa_command_from_message($message);
    if ($task) {
        $lines[] = 'Camada tarefas/criacao: nivel=' . miauw_skill_tarefa_priority_label((string) ($task['prioridade'] ?? 'normal'))
            . '; titulo=' . ((string) ($task['titulo'] ?? '') !== '' ? (string) $task['titulo'] : 'pendente')
            . '; descricao=' . ((string) ($task['descricao'] ?? '') !== '' ? (string) $task['descricao'] : '-');
    }

    $order = miauw_skill_cotacao_encomenda_command_from_message($message);
    if ($order) {
        $orderCategory = miauw_skill_product_operational_category((string) ($order['produto'] ?? ''), 'encomenda');
        $lines[] = 'Camada cotacao/encomenda: produto=' . ((string) ($order['produto'] ?? '') !== '' ? (string) $order['produto'] : 'pendente')
            . '; responsavel/cliente=' . ((string) ($order['responsavel'] ?? '') !== '' ? (string) $order['responsavel'] : 'pendente')
            . '; categoria sugerida=' . $orderCategory;
    }

    $urgent = miauw_skill_cotacao_urgente_command_from_message($message);
    if ($urgent) {
        $urgentCategory = miauw_skill_product_operational_category((string) ($urgent['produto'] ?? ''), 'urgente');
        $lines[] = 'Camada cotacao/urgente: medicamento ou produto em falta=' . (string) ($urgent['produto'] ?? '-')
            . '; categoria sugerida=' . $urgentCategory;
    }

    $quickQuote = miauw_skill_cotacao_rapida_command_from_message($message);
    if ($quickQuote) {
        $quickCategories = array();
        foreach (($quickQuote['itens'] ?? array()) as $item) {
            $quickCategories[] = (string) ($item['produto'] ?? '-') . '=' . miauw_skill_product_operational_category((string) ($item['produto'] ?? ''), 'cotacao rapida');
        }
        $lines[] = 'Camada cotacao/rapida: distribuidora=' . (string) ($quickQuote['fornecedor'] ?? '-')
            . '; itens=' . count($quickQuote['itens'] ?? array())
            . ($quickCategories ? '; categorias=' . implode(', ', array_slice($quickCategories, 0, 4)) : '');
    }

    $newSheet = miauw_skill_cotacao_planilha_command_from_message($message);
    if ($newSheet) {
        $lines[] = 'Camada cotacao/nova planilha: nome=' . (string) ($newSheet['nome'] ?? '-') . '; modelo herdado da Cotacao Geral.';
    }

    if (preg_match('/\b[\p{L}][\p{L}\s\-]*(?:\d+\s*(?:mg|mcg|ml|g|ui)|comprimido|comprimidos|capsula|capsulas|xarope|gotas|pomada)\b/iu', $message, $match)) {
        $lines[] = 'Camada medicamento/produto provavel: ' . trim((string) $match[0]);
    } elseif (miauw_skill_has_any($normalized, array('medicamento', 'remedio', 'produto', 'em falta', 'sem estoque'))) {
        $lines[] = 'Camada medicamento/produto provavel: produto citado precisa ser separado de nome de pessoa.';
    }

    if (!$lines) {
        return '';
    }

    array_unshift($lines, 'CAMADAS INTERPRETADAS DO MIAUBY');
    $lines[] = 'Regra fixa: medicamento/produto e item operacional; pessoa e responsavel/cliente; distribuidora e fornecedor. Nao trocar essas camadas.';
    $lines[] = 'Se houver mg/ml/comprimido/capsula/gotas, favoreca produto/medicamento antes de assumir que e nome.';

    return implode("\n", $lines);
}

function miauw_skill_context_for_message(string $message): string
{
    $period = miauw_skill_period_from_message($message);
    $modules = miauw_skill_detect_modules($message);
    $wantsReport = miauw_skill_wants_report($message);
    $lookupLines = array();

    $layers = miauw_skill_context_layers_for_message($message);
    if ($layers !== '') {
        $lookupLines[] = $layers;
    }

    if (function_exists('miauw_fp_message_matches') && miauw_fp_message_matches($message)) {
        $fpContext = function_exists('miauw_fp_context_for_message') ? miauw_fp_context_for_message($message) : '';
        if ($fpContext !== '') {
            $lookupLines[] = $fpContext;
        }
    }

    if (miauw_skill_has_any($message, array('quem e', 'quem é', 'cliente', 'pessoa', 'telefone', 'saldo de'))) {
        $lookupLines = array_merge($lookupLines, miauw_skill_client_lookup($message));
    }

    if (miauw_skill_has_any($message, array('que cotacao', 'qual cotacao', 'cotacao', 'cotação', 'ean', 'produto', 'fornecedor', 'distribuidora'))) {
        $lookupLines = array_merge($lookupLines, miauw_skill_cotacao_lookup($message));
    }

    if (miauw_skill_has_any($message, array('encomenda', 'encomendas')) && !$lookupLines) {
        $lookupLines = array_merge($lookupLines, miauw_skill_cotacao_lookup($message));
    }

    if (!$modules && $wantsReport) {
        $modules = array('financeiro', 'cashback', 'cotacao', 'tarefa');
    }

    if ($lookupLines && !$modules && !$wantsReport) {
        $lines = array_values(array_filter($lookupLines, static function ($line): bool {
            return trim((string) $line) !== '';
        }));

        return "CONTEXTO VIVO DAS SKILLS DO MIAUBY\n" . implode("\n", $lines);
    }

    if (!$modules && miauw_skill_has_any($message, array('o que voce faz', 'o que você faz', 'consegue fazer', 'skills', 'agente', 'agentes', 'ferramentas'))) {
        return miauw_skill_registry_diagnostics();
    }

    if (!$modules && !$lookupLines) {
        return '';
    }

    $lines = $lookupLines;
    foreach ($modules as $module) {
        if ($module === 'financeiro') {
            $lines = array_merge($lines, miauw_skill_financeiro_summary($period));
        } elseif ($module === 'cashback') {
            $lines = array_merge($lines, miauw_skill_cashback_summary($period));
        } elseif ($module === 'cotacao') {
            $lines = array_merge($lines, miauw_skill_cotacao_summary($period));
        } elseif ($module === 'tarefa') {
            $lines = array_merge($lines, miauw_skill_tarefa_summary($period));
        } elseif ($module === 'farmacia_popular' && function_exists('miauw_fp_context_for_message') && !$lookupLines) {
            $lines[] = miauw_fp_context_for_message($message);
        }

        if ($lines) {
            $lines[] = '';
        }
    }

    $lines = array_values(array_filter($lines, static function ($line): bool {
        return trim((string) $line) !== '';
    }));

    if (!$lines) {
        return '';
    }

    $context = "CONTEXTO VIVO DAS SKILLS DO MIAUBY\nPeriodo interpretado: " . $period['label'] . "\n";
    $context .= implode("\n", $lines);

    if ($wantsReport) {
        $context .= "\nRELATORIO EM TEXTO: responda com os principais dados acima. Nao gere PDF, nao envie link e nao invente complemento.";
    }

    return $context;
}
