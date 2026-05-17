<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/bootstrap.php';

$miauwEvalTests = array();

function miauw_eval_add(string $name, callable $test): void
{
    global $miauwEvalTests;
    $miauwEvalTests[] = array($name, $test);
}

function miauw_eval_fail(string $message): void
{
    throw new RuntimeException($message);
}

function miauw_eval_assert(bool $condition, string $message): void
{
    if (!$condition) {
        miauw_eval_fail($message);
    }
}

function miauw_eval_assert_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        miauw_eval_fail($message . ' Esperado: ' . var_export($expected, true) . ' | atual: ' . var_export($actual, true));
    }
}

function miauw_eval_assert_contains(string $needle, string $haystack, string $message): void
{
    if (stripos($haystack, $needle) === false) {
        miauw_eval_fail($message . ' Nao encontrou: ' . $needle);
    }
}

function miauw_eval_forbidden_terms(string $text): array
{
    $patterns = array(
        'codex' => '/\bcodex\b/iu',
        'chatgpt' => '/\bchatgpt\b/iu',
        'openai' => '/\bopenai\b/iu',
        'api_key' => '/\b(api\s*key|apikey|chave\s+da\s+api)\b/iu',
        'secret_key' => '/\bsk-[a-z0-9_\-\*]{8,}\b/iu',
        'prompt' => '/\b(prompt\s+do\s+sistema|prompt\s+interno|system\s+prompt)\b/iu',
        'stack_trace' => '/\b(stack\s*trace|traceback)\b/iu',
        'token' => '/\b(bearer|authorization|token\s+secreto)\b/iu',
    );

    $found = array();
    foreach ($patterns as $label => $pattern) {
        if (preg_match($pattern, $text)) {
            $found[] = $label;
        }
    }

    return $found;
}

function miauw_eval_assert_no_forbidden(string $text, string $message): void
{
    $found = miauw_eval_forbidden_terms($text);
    if ($found) {
        miauw_eval_fail($message . ' Termos proibidos: ' . implode(', ', $found) . ' | texto: ' . $text);
    }
}

function miauw_eval_reset_action_state(): void
{
    unset(
        $_SESSION['miauw_pending_confirm_action'],
        $_SESSION['miauw_pending_financeiro_lancamento'],
        $_SESSION['miauw_pending_cotacao_encomenda']
    );
    unset($GLOBALS['miauw_pending_confirmation_response']);
}

miauw_eval_add('agent_status_fase16', static function (): void {
    $status = miauw_agent_public_status();

    miauw_eval_assert_same('Miauby', (string) ($status['name'] ?? ''), 'Nome publico do agente mudou.');
    miauw_eval_assert(strpos((string) ($status['version'] ?? ''), '2.0-fase16') === 0, 'Versao do agente deve apontar Fase 16.');
    miauw_eval_assert((string) ($status['policy_version'] ?? '') !== '', 'Versao de politica nao pode ficar vazia.');
    miauw_eval_assert_same('miauby-persona-2026-05-16', (string) ($status['personality_version'] ?? ''), 'Versao da persona publica mudou.');
    miauw_eval_assert_same('miauby-style-router-2026-05-16', (string) ($status['style_version'] ?? ''), 'Versao do roteador de estilo mudou.');
    miauw_eval_assert(in_array('guardrails_bastidor', (array) ($status['features'] ?? array()), true), 'Guardrails precisam estar anunciados no status.');
    miauw_eval_assert(in_array('persona_miauby_preservada', (array) ($status['features'] ?? array()), true), 'Fase 10 precisa anunciar persona preservada.');
    miauw_eval_assert(in_array('evals_intents_guardrails', (array) ($status['features'] ?? array()), true), 'Fase 2 precisa anunciar evals no status.');
    miauw_eval_assert(in_array('painel_diagnostico_revisao', (array) ($status['features'] ?? array()), true), 'Fase 3 precisa anunciar painel de diagnostico no status.');
    miauw_eval_assert(in_array('tools_operacionais_migradas', (array) ($status['features'] ?? array()), true), 'Fase 4 precisa anunciar tools operacionais migradas no status.');
    miauw_eval_assert(in_array('rastreabilidade_por_conversa', (array) ($status['features'] ?? array()), true), 'Fase 5 precisa anunciar rastreabilidade.');
    miauw_eval_assert(in_array('confirmacao_acoes_fortes', (array) ($status['features'] ?? array()), true), 'Fase 5 precisa anunciar confirmacao.');
    miauw_eval_assert(in_array('streaming_visual_widget', (array) ($status['features'] ?? array()), true), 'Fase 5 precisa anunciar streaming visual.');
    miauw_eval_assert(in_array('evals_operacionais_fase6', (array) ($status['features'] ?? array()), true), 'Fase 6 precisa anunciar evals operacionais.');
    miauw_eval_assert(in_array('contrato_agents_sdk_preparado', (array) ($status['features'] ?? array()), true), 'Fase 6 precisa anunciar contrato da proxima camada.');
    miauw_eval_assert(in_array('servico_agents_sdk_sombra', (array) ($status['features'] ?? array()), true), 'Fase 7 precisa anunciar servico sombra.');
    miauw_eval_assert(in_array('streaming_real_sombra', (array) ($status['features'] ?? array()), true), 'Fase 7 precisa anunciar streaming real em sombra.');
    miauw_eval_assert(in_array('adaptador_php_sombra', (array) ($status['features'] ?? array()), true), 'Fase 8 precisa anunciar adaptador PHP sombra.');
    miauw_eval_assert(in_array('comparacao_respostas_sombra', (array) ($status['features'] ?? array()), true), 'Fase 8 precisa anunciar comparacao de respostas.');
    miauw_eval_assert(in_array('modo_manutencao_operacional', (array) ($status['features'] ?? array()), true), 'Fase 9 precisa anunciar manutencao operacional.');
    miauw_eval_assert(in_array('engine_switch_rollback', (array) ($status['features'] ?? array()), true), 'Fase 9 precisa anunciar chave de rollback.');
    miauw_eval_assert(in_array('node_primary_adm_controlado', (array) ($status['features'] ?? array()), true), 'Fase 9 precisa anunciar Node primario controlado.');
    miauw_eval_assert(in_array('contrato_persona_node', (array) ($status['features'] ?? array()), true), 'Fase 10 precisa anunciar contrato de persona Node.');
    miauw_eval_assert(in_array('eval_personalidade_node', (array) ($status['features'] ?? array()), true), 'Fase 10 precisa anunciar eval de personalidade Node.');
    miauw_eval_assert(in_array('contrato_tools_exportado', (array) ($status['features'] ?? array()), true), 'Fase 11 precisa anunciar contrato exportado de tools.');
    miauw_eval_assert(in_array('schemas_tools_no_node', (array) ($status['features'] ?? array()), true), 'Fase 11 precisa anunciar schemas enviados ao Node.');
    miauw_eval_assert(in_array('execucao_node_leitura_segura', (array) ($status['features'] ?? array()), true), 'Fase 12 precisa anunciar execucao Node de leitura segura.');
    miauw_eval_assert(in_array('ponte_php_tools_leitura_node', (array) ($status['features'] ?? array()), true), 'Fase 13 precisa anunciar ponte PHP de leitura.');
    miauw_eval_assert(in_array('tools_leitura_real_node', (array) ($status['features'] ?? array()), true), 'Fase 13 precisa anunciar tools reais de leitura no Node.');
    miauw_eval_assert(in_array('ponte_php_tools_universal_node', (array) ($status['features'] ?? array()), true), 'Fase 14 precisa anunciar ponte universal de tools.');
    miauw_eval_assert(in_array('orquestracao_node_tools_completa', (array) ($status['features'] ?? array()), true), 'Fase 14 precisa anunciar orquestracao completa de tools.');
    miauw_eval_assert(in_array('escrita_baixo_risco_via_php_bridge', (array) ($status['features'] ?? array()), true), 'Fase 14 precisa anunciar escrita de baixo risco via PHP bridge.');
    miauw_eval_assert(in_array('escrita_node_bloqueada', (array) ($status['features'] ?? array()), true), 'Fase 12 precisa anunciar escrita Node bloqueada.');
    miauw_eval_assert(in_array('roteador_estilo_miauby', (array) ($status['features'] ?? array()), true), 'Fase 15 precisa anunciar roteador de estilo.');
    miauw_eval_assert(in_array('memoria_estilo_aprovada', (array) ($status['features'] ?? array()), true), 'Fase 15 precisa anunciar memoria de estilo aprovada.');
    miauw_eval_assert(in_array('respostas_casuais_sem_tool', (array) ($status['features'] ?? array()), true), 'Fase 15 precisa anunciar resposta casual local.');
    miauw_eval_assert(in_array('treinador_miauby_chat', (array) ($status['features'] ?? array()), true), 'Fase 16 precisa anunciar treinador no chat.');
    miauw_eval_assert(in_array('exemplos_treinamento_versionados', (array) ($status['features'] ?? array()), true), 'Fase 16 precisa anunciar exemplos versionados.');
    miauw_eval_assert(in_array('contexto_treino_aprovado', (array) ($status['features'] ?? array()), true), 'Fase 16 precisa anunciar contexto de treino aprovado.');
    miauw_eval_assert(in_array((string) ($status['engine'] ?? ''), array('php', 'node_shadow', 'node'), true), 'Engine publica precisa ser valida.');
});

miauw_eval_add('fase16_contrato_treinador_node', static function (): void {
    $contract = miauw_agent_next_phase_contract();

    miauw_eval_assert_same('fase16', (string) ($contract['fase_atual'] ?? ''), 'Contrato da proxima fase deve partir da fase 16.');
    miauw_eval_assert_contains('Node.js 22', (string) ($contract['runtime'] ?? ''), 'Contrato precisa fixar runtime Node.js 22.');
    miauw_eval_assert_contains('TypeScript', (string) ($contract['runtime'] ?? ''), 'Contrato precisa preparar TypeScript.');
    miauw_eval_assert_contains('Agents SDK', (string) ($contract['sdk'] ?? ''), 'Contrato precisa citar Agents SDK como camada futura.');
    miauw_eval_assert_same('/miauw/agent', (string) ($contract['endpoint_interno'] ?? ''), 'Endpoint interno futuro mudou.');
    miauw_eval_assert(in_array((string) ($contract['modo'] ?? ''), array('php', 'node_shadow', 'node'), true), 'Fase 9 precisa expor modo de motor valido.');
    miauw_eval_assert(!empty($contract['pronto_agora']['registry_skills']), 'Registry precisa estar pronto antes do servico agente.');
    miauw_eval_assert(!empty($contract['pronto_agora']['evals_locais']), 'Evals locais precisam existir antes do servico agente.');
    miauw_eval_assert(!empty($contract['pronto_agora']['scaffold_servico_sombra']), 'Scaffold do servico sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['proxy_interno']), 'Proxy interno do servico sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['adaptador_php_sombra']), 'Adaptador PHP sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['trace_comparacao_sombra']), 'Trace de comparacao sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['engine_switch']), 'Fase 9 precisa marcar engine switch pronto.');
    miauw_eval_assert(!empty($contract['pronto_agora']['manutencao_adm']), 'Fase 9 precisa marcar manutencao adm pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['persona_versionada']), 'Fase 10 precisa marcar persona versionada pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['roteador_estilo']), 'Fase 15 precisa marcar roteador de estilo pronto.');
    miauw_eval_assert(!empty($contract['pronto_agora']['contexto_estilo_node']), 'Fase 15 precisa exportar contexto de estilo ao Node.');
    miauw_eval_assert(!empty($contract['pronto_agora']['memoria_estilo_aprovada']), 'Fase 15 precisa ler memoria/padrao aprovado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['resposta_local_casual']), 'Fase 15 precisa responder casual localmente.');
    miauw_eval_assert(!empty($contract['pronto_agora']['treinador_chat_feedback']), 'Fase 16 precisa marcar feedback do chat pronto.');
    miauw_eval_assert(!empty($contract['pronto_agora']['revisao_treino_humana']), 'Fase 16 precisa marcar revisao humana pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['contexto_treino_aprovado']), 'Fase 16 precisa exportar treino aprovado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['eval_persona_node']), 'Fase 10 precisa marcar eval de persona Node pronto.');
    miauw_eval_assert(!empty($contract['pronto_agora']['tool_contract_export']), 'Fase 11 precisa marcar export de contratos de tools pronto.');
    miauw_eval_assert(!empty($contract['pronto_agora']['execucao_leitura_node']), 'Fase 12 precisa marcar execucao de leitura Node pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['ponte_php_leitura_node']), 'Fase 13 precisa marcar ponte PHP de leitura pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['tools_leitura_real_node']), 'Fase 13 precisa marcar tools reais de leitura prontas.');
    miauw_eval_assert(!empty($contract['pronto_agora']['ponte_php_tools_universal_node']), 'Fase 14 precisa marcar ponte universal pronta.');
    miauw_eval_assert(!empty($contract['pronto_agora']['tools_openai_orquestradas_node']), 'Fase 14 precisa marcar OpenAI tools orquestradas.');
    miauw_eval_assert(!empty($contract['pronto_agora']['escrita_baixo_risco_tarefa_via_php']), 'Fase 14 precisa permitir tarefa via PHP bridge.');
    miauw_eval_assert(!empty($contract['pronto_agora']['writes_node_bloqueado']), 'Fase 12 precisa manter escrita Node bloqueada.');
});

miauw_eval_add('fase15_roteador_estilo_casual', static function (): void {
    $apiRoute = miauw_agent_style_route('qual sua api?');
    miauw_eval_assert_same('backstage_technical', (string) ($apiRoute['intent'] ?? ''), 'Pergunta de bastidor precisa cair no roteador tecnico.');
    miauw_eval_assert(empty($apiRoute['use_tools']), 'Pergunta de bastidor nao deve gastar tool.');
    miauw_eval_assert(!empty($apiRoute['local_reply']), 'Pergunta de bastidor deve ter resposta local.');

    $apiReply = miauw_agent_try_style_reply('qual sua api?', '', true);
    miauw_eval_assert(is_array($apiReply), 'Pergunta de bastidor precisa receber resposta local.');
    $apiText = (string) ($apiReply['text'] ?? '');
    miauw_eval_assert_contains('Oxe', $apiText, 'Resposta de bastidor precisa ter voz do Miauby.');
    miauw_eval_assert_contains('suporte tecnico interno', $apiText, 'Resposta de bastidor precisa redirecionar para suporte interno.');
    miauw_eval_assert(stripos($apiText, 'leio dados') === false, 'Resposta casual nao pode usar apresentacao de ferramentas.');
    miauw_eval_assert(stripos($apiText, '1.') === false && stripos($apiText, '2.') === false, 'Resposta casual nao deve virar lista numerada.');
    miauw_eval_assert_no_forbidden($apiText, 'Resposta local de bastidor expos termo proibido.');

    $siteRoute = miauw_agent_style_route('como faz um site?');
    miauw_eval_assert_same('generic_howto', (string) ($siteRoute['intent'] ?? ''), 'Pergunta ampla de site precisa cair no how-to curto.');
    $siteReply = miauw_agent_try_style_reply('como faz um site?', '', true);
    $siteText = is_array($siteReply) ? (string) ($siteReply['text'] ?? '') : '';
    miauw_eval_assert_contains('Site pra que', $siteText, 'Resposta sobre site deve pedir objetivo direto.');
    miauw_eval_assert(stripos($siteText, '1.') === false && stripos($siteText, '2.') === false, 'Resposta sobre site nao deve virar tutorial numerado.');

    $context = miauw_agent_style_context_export('qual sua api?', 1);
    miauw_eval_assert_same('miauby-style-router-2026-05-16', (string) ($context['version'] ?? ''), 'Contexto de estilo precisa ser versionado.');
    miauw_eval_assert_same('backstage_technical', (string) ($context['route']['intent'] ?? ''), 'Contexto de estilo precisa levar rota ao Node.');
    miauw_eval_assert(is_array($context['approved_patterns'] ?? null), 'Contexto de estilo precisa carregar padroes aprovados como array.');
    miauw_eval_assert(is_array($context['examples'] ?? null), 'Contexto de estilo precisa carregar exemplos curtos.');
});

miauw_eval_add('fase16_treinador_versionado', static function (): void {
    miauw_ensure_schema();
    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('INSERT INTO miauw_conversas (usuario_id, titulo) VALUES (?, ?)');
        $stmt->execute(array(1, 'Eval treino Miauby'));
        $conversationId = (int) $pdo->lastInsertId();
        miauw_add_message($conversationId, 1, 'user', 'quero comprar uma farmacia');
        $assistantId = miauw_add_message($conversationId, null, 'assistant', 'Comprar para operar ou so curiosidade? Valide CNPJ, licencas e passivos.');

        $feedback = miauw_training_create_feedback(
            $conversationId,
            1,
            $assistantId,
            'ajuste',
            'chatgpt_demais',
            'Comprar farmacia nao e comprar prateleira bonita, meu bigode. Primeiro separa: compra total, sociedade ou oportunidade? Sem isso, eu so cheiro risco e divida escondida.',
            'negocio',
            'miauby consultor',
            false
        );
        miauw_eval_assert((int) ($feedback['id'] ?? 0) > 0, 'Feedback de treino nao gerou ID.');
        miauw_eval_assert_same('pendente', (string) ($feedback['status'] ?? ''), 'Feedback ajustado deve nascer pendente.');

        $done = miauw_training_review_item(
            (int) $feedback['id'],
            'aprovado',
            1,
            'Comprar farmacia nao e comprar prateleira bonita, meu bigode. Primeiro separa: compra total, sociedade ou oportunidade? Sem isso, eu so cheiro risco e divida escondida.',
            'negocio',
            'miauby consultor',
            'eval'
        );
        miauw_eval_assert($done, 'Revisao de treino nao concluiu.');

        $examples = miauw_training_context_examples('quero comprar farmacia', 2);
        miauw_eval_assert(count($examples) >= 1, 'Treino aprovado nao entrou nos exemplos de contexto.');
        $json = json_encode($examples, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        miauw_eval_assert_contains('prateleira', $json, 'Exemplo aprovado perdeu resposta ideal.');

        $context = miauw_agent_style_context_export('quero comprar farmacia', 1);
        $contextJson = json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        miauw_eval_assert_contains('treino aprovado', $contextJson, 'Contexto de estilo nao incluiu treino aprovado.');
        miauw_eval_assert(is_array($context['training_examples'] ?? null), 'Contexto deve expor training_examples como array.');
    } finally {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    }
});

miauw_eval_add('fase10_persona_contract_preservado', static function (): void {
    $contract = miauw_agent_personality_contract();
    $json = json_encode($contract, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';

    miauw_eval_assert_same('miauby-persona-2026-05-16', (string) ($contract['version'] ?? ''), 'Contrato de persona precisa ser versionado.');
    miauw_eval_assert_contains('Fiscal interno', (string) ($contract['papel'] ?? ''), 'Persona precisa manter papel de fiscal interno.');
    miauw_eval_assert_contains('personalidade forte', $json, 'Persona precisa exigir personalidade forte.');
    miauw_eval_assert_contains('Sem dado, sem milagre', $json, 'Persona precisa preservar bordao operacional.');
    miauw_eval_assert_contains('Meu bigode', $json, 'Persona precisa preservar voz do Miauby.');
    miauw_eval_assert_contains('nao inventar dado', strtolower($json), 'Persona precisa preservar regra de nao inventar dado.');
    miauw_eval_assert(stripos($json, 'Codex') === false, 'Contrato de persona nao deve citar agente de desenvolvimento.');
    miauw_eval_assert(stripos($json, 'OpenAI') === false, 'Contrato de persona nao deve citar fornecedor.');
    miauw_eval_assert(stripos($json, 'sk-') === false, 'Contrato de persona nao deve conter fragmento de chave.');
});

miauw_eval_add('guardrail_remove_bastidor_e_segredo', static function (): void {
    $raw = 'Codex chamou OpenAI com API key sk-************, prompt do sistema e stack trace Authorization xyz.';
    $clean = miauw_apply_operator_guardrails($raw, 'history_input');

    miauw_eval_assert_no_forbidden($clean, 'Guardrail deixou bastidor tecnico aparecer.');
    miauw_eval_assert_contains('suporte tecnico interno', $clean, 'Codex deve virar suporte tecnico interno.');
    miauw_eval_assert_contains('credencial interna', $clean, 'Chave/token deve virar credencial interna.');
    miauw_eval_assert_contains('regra interna', $clean, 'Prompt interno deve virar regra interna.');
});

miauw_eval_add('sanitize_remove_codigo_sem_bastidor', static function (): void {
    $raw = "```php\nrequire_once '/home/ubuntu/segredo.php';\necho 'x';\n```\nPode seguir.";
    $clean = miauw_sanitize_operator_reply($raw);

    miauw_eval_assert_no_forbidden($clean, 'Sanitizacao deixou termo proibido.');
    miauw_eval_assert(stripos($clean, 'require_once') === false, 'Sanitizacao deixou codigo PHP.');
    miauw_eval_assert(stripos($clean, '/home/ubuntu') === false, 'Sanitizacao deixou caminho interno.');
    miauw_eval_assert_contains('Parte tecnica', $clean, 'Sanitizacao deve avisar corte tecnico.');
});

miauw_eval_add('redirect_tecnico_operacional', static function (): void {
    $reply = miauw_try_technical_redirect('preciso mexer no backend em php para alterar arquivo');

    miauw_eval_assert(is_string($reply) && $reply !== '', 'Pedido tecnico deve receber redirecionamento.');
    miauw_eval_assert_no_forbidden($reply, 'Redirecionamento tecnico citou bastidor proibido.');
    miauw_eval_assert_contains('suporte tecnico interno', $reply, 'Redirecionamento deve citar suporte tecnico interno.');
    miauw_eval_assert_contains('caixa', $reply, 'Redirecionamento deve manter foco operacional.');
});

miauw_eval_add('registry_skills_essenciais', static function (): void {
    $registry = miauw_skill_registry_public();
    $required = array(
        'diagnostico_skills',
        'resumo_financeiro',
        'resumo_cashback',
        'resumo_codigos',
        'buscar_cliente',
        'buscar_cotacao',
        'buscar_codigo_comissao',
        'registrar_sangria',
        'criar_lancamento_financeiro',
        'criar_tarefa',
        'criar_encomenda_cotacao',
        'criar_cotacao_urgente',
    );

    foreach ($required as $name) {
        miauw_eval_assert(isset($registry[$name]), 'Skill ausente no registry: ' . $name);
        miauw_eval_assert(!empty($registry[$name]['executor_disponivel']), 'Executor indisponivel para: ' . $name);
    }

    $summary = miauw_skill_registry_summary();
    miauw_eval_assert((int) ($summary['total'] ?? 0) >= count($required), 'Resumo do registry esta incompleto.');
});

miauw_eval_add('registry_core_tools_fase4', static function (): void {
    $status = miauw_skill_core_migration_status();

    miauw_eval_assert_same(4, (int) ($status['fase'] ?? 0), 'Status de migracao core deve apontar Fase 4.');
    miauw_eval_assert_same(array(), (array) ($status['missing'] ?? array()), 'Fase 4 tem tool ausente no registry.');
    miauw_eval_assert_same(array(), (array) ($status['executores_indisponiveis'] ?? array()), 'Fase 4 tem executor indisponivel.');

    $tools = (array) ($status['tools'] ?? array());
    foreach (miauw_skill_core_tool_names() as $name) {
        miauw_eval_assert(!empty($tools[$name]['registrada']), 'Tool core nao registrada: ' . $name);
    }
});

miauw_eval_add('fase6_openai_tools_batem_registry', static function (): void {
    $registry = miauw_skill_registry_public();
    $tools = miauw_openai_tools();
    $toolNames = array();

    foreach ($tools as $tool) {
        $name = (string) ($tool['name'] ?? '');
        if ($name !== '') {
            $toolNames[] = $name;
        }

        $params = is_array($tool['parameters'] ?? null) ? $tool['parameters'] : array();
        miauw_eval_assert(($params['type'] ?? '') === 'object', 'Tool sem schema object: ' . $name);
        miauw_eval_assert(array_key_exists('additionalProperties', $params), 'Tool sem additionalProperties explicito: ' . $name);
        miauw_eval_assert($params['additionalProperties'] === false, 'Tool permite parametro solto: ' . $name);
    }

    foreach ($registry as $name => $meta) {
        if (!empty($meta['openai_tool'])) {
            miauw_eval_assert(in_array((string) $name, $toolNames, true), 'Registry marcou OpenAI tool ausente em miauw_openai_tools: ' . (string) $name);
        }

        $required = (array) ($meta['parametros_obrigatorios'] ?? array());
        if ($required && in_array((string) $name, $toolNames, true)) {
            $tool = null;
            foreach ($tools as $candidate) {
                if ((string) ($candidate['name'] ?? '') === (string) $name) {
                    $tool = $candidate;
                    break;
                }
            }

            $schemaRequired = is_array($tool['parameters']['required'] ?? null) ? $tool['parameters']['required'] : array();
            foreach ($required as $field) {
                miauw_eval_assert(in_array((string) $field, $schemaRequired, true), 'Parametro obrigatorio fora do schema da tool ' . (string) $name . ': ' . (string) $field);
            }
        }
    }
});

miauw_eval_add('fase16_tool_contract_export_seguro', static function (): void {
    $contracts = miauw_agent_tool_contract_export();
    $summary = (array) ($contracts['summary'] ?? array());
    $tools = (array) ($contracts['tools'] ?? array());

    miauw_eval_assert_same('miauw-tool-contracts-2026-05-16', (string) ($contracts['version'] ?? ''), 'Versao do contrato de tools mudou.');
    miauw_eval_assert_same('fase16-training-feedback', (string) ($contracts['phase'] ?? ''), 'Contrato de tools deve apontar Fase 16.');
    miauw_eval_assert_same('php_skill_registry', (string) ($contracts['source'] ?? ''), 'Contrato de tools deve vir do registry PHP.');
    miauw_eval_assert(empty($contracts['writes_enabled_in_node']), 'Node nao pode receber escrita direta liberada no contrato.');
    miauw_eval_assert_same('php', (string) ($contracts['execution_owner'] ?? ''), 'Execucao ainda deve pertencer ao PHP.');
    miauw_eval_assert_same('php', (string) ($contracts['confirmation_owner'] ?? ''), 'Confirmacao ainda deve pertencer ao PHP.');
    miauw_eval_assert((int) ($summary['node_read_bridge_tools'] ?? 0) >= 5, 'Ponte de leitura precisa exportar tools migradas.');
    miauw_eval_assert((int) ($summary['node_tool_bridge_tools'] ?? 0) >= 15, 'Ponte universal precisa exportar as OpenAI tools ao Node.');
    miauw_eval_assert((int) ($summary['php_bridge_write_tools'] ?? 0) >= 1, 'Ponte universal precisa permitir pelo menos tarefa como escrita PHP de baixo risco.');
    miauw_eval_assert((int) ($summary['schemas_exported'] ?? 0) >= 10, 'Poucos schemas exportados para o Node.');
    miauw_eval_assert_same(0, (int) ($summary['missing_schemas'] ?? -1), 'Existe OpenAI tool no registry sem schema exportado.');
    miauw_eval_assert_same(0, (int) ($summary['schemas_without_registry'] ?? -1), 'Existe schema de tool sem registro no registry.');
    miauw_eval_assert(isset($tools['registrar_sangria'], $tools['criar_lancamento_financeiro']), 'Tools financeiras essenciais precisam estar no contrato.');
    miauw_eval_assert(!empty($tools['registrar_sangria']['requires_confirmation']), 'Sangria precisa continuar exigindo confirmacao.');
    miauw_eval_assert(empty($tools['registrar_sangria']['writes_enabled_in_node']), 'Contrato nao pode liberar escrita Node para sangria.');
    miauw_eval_assert(empty($tools['registrar_sangria']['node_read_bridge_enabled']), 'Sangria nao pode entrar na ponte de leitura.');
    miauw_eval_assert(!empty($tools['registrar_sangria']['node_tool_bridge_enabled']), 'Sangria precisa estar orquestrada pela ponte universal.');
    miauw_eval_assert_same('confirmation_required', (string) ($tools['registrar_sangria']['node_tool_bridge_mode'] ?? ''), 'Sangria deve voltar como confirmacao pela ponte universal.');
    miauw_eval_assert(!empty($tools['buscar_codigo_comissao']['node_read_bridge_enabled']), 'Busca de codigos precisa estar liberada na ponte de leitura.');
    miauw_eval_assert(!empty($tools['buscar_cotacao']['node_read_bridge_enabled']), 'Busca de Cotacao precisa estar liberada na ponte de leitura.');
    miauw_eval_assert(!empty($tools['buscar_cliente']['node_tool_bridge_enabled']), 'Busca de cliente mascarado precisa entrar na ponte universal.');
    miauw_eval_assert(!empty($tools['criar_tarefa']['writes_enabled_via_php_bridge']), 'Tarefa precisa estar liberada como escrita PHP de baixo risco.');
    miauw_eval_assert(is_array($tools['registrar_sangria']['parameters'] ?? null), 'Sangria precisa exportar schema.');
    miauw_eval_assert_no_forbidden(json_encode($contracts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '', 'Contrato de tools expos termo proibido.');
});

miauw_eval_add('fase14_ponte_php_universal_segura', static function (): void {
    $tools = miauw_agent_node_read_tool_names();
    $expected = array('resumo_financeiro', 'resumo_cashback', 'resumo_codigos', 'buscar_codigo_comissao', 'buscar_cotacao');

    foreach ($expected as $name) {
        miauw_eval_assert(in_array($name, $tools, true), 'Tool de leitura ausente na ponte Node: ' . $name);
        miauw_eval_assert(miauw_agent_node_read_tool_allowed($name), 'Tool deveria estar liberada na ponte de leitura: ' . $name);
    }

    miauw_eval_assert(!in_array('registrar_sangria', $tools, true), 'Sangria nao pode entrar na ponte de leitura.');
    miauw_eval_assert(!in_array('criar_lancamento_financeiro', $tools, true), 'Lancamento financeiro nao pode entrar na ponte de leitura.');
    miauw_eval_assert(!miauw_agent_node_read_tool_allowed('registrar_sangria'), 'Sangria jamais pode ser liberada como leitura Node.');

    $result = miauw_agent_node_read_tool_result('resumo_codigos', array(), miauw_trace_new_id());
    miauw_eval_assert(!empty($result['ok']), 'Ponte PHP de leitura precisa retornar ok para resumo_codigos.');
    miauw_eval_assert_same(false, (bool) ($result['writes_enabled'] ?? true), 'Ponte de leitura nao pode liberar escrita.');
    miauw_eval_assert_same('php_read_bridge', (string) ($result['source'] ?? ''), 'Ponte deve declarar origem PHP.');

    $bridgeTools = miauw_agent_node_tool_bridge_names();
    miauw_eval_assert(in_array('buscar_cliente', $bridgeTools, true), 'Busca de cliente mascarado precisa estar na ponte universal.');
    miauw_eval_assert(miauw_agent_node_tool_bridge_allowed('registrar_sangria'), 'Sangria deve estar orquestrada, mas sem escrita direta.');

    $strong = miauw_agent_node_tool_bridge_result('registrar_sangria', array(
        'valor' => 30,
        'responsavel' => 'Maria',
        'observacao' => 'eval sem escrita',
        'data' => date('Y-m-d'),
    ), miauw_trace_new_id(), array('id' => 1, 'username' => 'adm'));
    miauw_eval_assert(!empty($strong['confirmation_required']), 'Sangria pela ponte universal deve pedir confirmacao.');
    miauw_eval_assert_same(false, (bool) ($strong['writes_enabled'] ?? true), 'Sangria pela ponte universal nao pode gravar direto.');
    miauw_eval_assert_same('confirmation_required', (string) ($strong['bridge_mode'] ?? ''), 'Sangria deve declarar modo de confirmacao.');
    miauw_eval_assert_contains('CONFIRMACAO_NECESSARIA', (string) ($strong['text'] ?? ''), 'Resposta de sangria deve deixar confirmacao explicita.');
});

miauw_eval_add('diagnostico_fase3_payload', static function (): void {
    miauw_diagnostics_ensure_review_columns();
    $data = miauw_diagnostics_panel_data(false);

    miauw_eval_assert(isset($data['summary'], $data['memories'], $data['patterns'], $data['alerts'], $data['events']), 'Payload do diagnostico incompleto.');
    miauw_eval_assert(is_array($data['summary']['memorias'] ?? null), 'Resumo de memorias ausente.');
    miauw_eval_assert(is_array($data['summary']['padroes'] ?? null), 'Resumo de padroes ausente.');
    miauw_eval_assert(is_array($data['summary']['skills'] ?? null), 'Resumo de skills ausente no diagnostico.');
    miauw_eval_assert(is_array($data['summary']['agent_service'] ?? null), 'Resumo do servico agente ausente no diagnostico.');
    miauw_eval_assert(is_array($data['summary']['agent_runtime'] ?? null), 'Resumo do motor agente ausente no diagnostico.');
    miauw_eval_assert(is_array($data['summary']['tool_contracts'] ?? null), 'Resumo dos contratos de tools ausente no diagnostico.');
    miauw_eval_assert_no_forbidden(json_encode($data['summary'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '', 'Resumo do diagnostico expos termo proibido.');
});

miauw_eval_add('modelo_rota_fast_smart_boss', static function (): void {
    miauw_eval_assert_same('fast', (string) miauw_model_route('oi miauby')['name'], 'Mensagem simples deve usar rota fast.');
    miauw_eval_assert_same('smart', (string) miauw_model_route('resumo financeiro do caixa hoje')['name'], 'Mensagem operacional deve usar rota smart.');
    miauw_eval_assert_same('boss', (string) miauw_model_route('diagnostico de risco e divergencia do financeiro')['name'], 'Mensagem de auditoria/risco deve usar rota boss.');
});

miauw_eval_add('intent_financeiro_lancamento', static function (): void {
    $command = miauw_skill_financeiro_command_from_message('lancar sangria R$ 30,00 responsavel Maria observacao troco do caixa');

    miauw_eval_assert(is_array($command), 'Comando financeiro nao foi detectado.');
    miauw_eval_assert_same('Sangria', (string) ($command['categoria'] ?? ''), 'Categoria financeira incorreta.');
    miauw_eval_assert(abs((float) ($command['valor'] ?? 0) - 30.0) < 0.001, 'Valor financeiro incorreto.');
    miauw_eval_assert_contains('Maria', (string) ($command['responsavel'] ?? ''), 'Responsavel financeiro nao detectado.');
});

miauw_eval_add('intent_sangria_precisa_valor', static function (): void {
    $missingValue = miauw_skill_financeiro_command_from_message('lancar sangria responsavel Maria');
    miauw_eval_assert($missingValue === null, 'Sangria sem valor nao pode virar escrita.');

    $command = miauw_skill_financeiro_command_from_message('sangria 30 Maria');
    miauw_eval_assert(is_array($command), 'Sangria com valor nao foi detectada.');
    miauw_eval_assert_same('Sangria', (string) ($command['categoria'] ?? ''), 'Categoria de sangria incorreta.');
    miauw_eval_assert(abs((float) ($command['valor'] ?? 0) - 30.0) < 0.001, 'Valor de sangria incorreto.');
});

miauw_eval_add('fase6_dados_incompletos_pedem_contexto', static function (): void {
    miauw_eval_reset_action_state();
    miauw_trace_set_context(miauw_trace_new_id(), 0, 1, 0);

    $missingResponsible = miauw_try_controlled_action('sangria 30', 1, '', true);
    miauw_eval_assert(is_array($missingResponsible), 'Sangria sem responsavel precisa gerar pergunta, nao cair solta.');
    miauw_eval_assert(!isset($missingResponsible['confirmation']), 'Sangria sem responsavel nao pode pedir confirmacao nem gravar.');
    miauw_eval_assert_contains('responsavel', (string) ($missingResponsible['text'] ?? ''), 'Sangria sem responsavel precisa pedir responsavel.');

    miauw_eval_reset_action_state();
    $missingProduct = miauw_try_controlled_action('encomenda para Joao', 1, '', true);
    miauw_eval_assert(is_array($missingProduct), 'Encomenda sem produto precisa gerar pergunta.');
    miauw_eval_assert(!isset($missingProduct['confirmation']), 'Encomenda sem produto nao pode pedir confirmacao nem gravar.');
    miauw_eval_assert_contains('produto', (string) ($missingProduct['text'] ?? ''), 'Encomenda sem produto precisa pedir produto.');

    $emptyQuoteLookup = implode("\n", miauw_skill_cotacao_lookup(''));
    miauw_eval_assert_contains('informe EAN, produto ou categoria', $emptyQuoteLookup, 'Busca de Cotacao sem produto precisa pedir termo de busca.');

    miauw_eval_reset_action_state();
});

miauw_eval_add('fase6_acoes_fortes_exigem_confirmacao_por_risco', static function (): void {
    $registry = miauw_skill_registry_public();

    foreach ($registry as $name => $meta) {
        $isHighRiskWrite = (string) ($meta['nivel'] ?? '') === 'escrita'
            && (string) ($meta['risco'] ?? '') === 'alto'
            && !empty($meta['local_action']);

        if ($isHighRiskWrite) {
            miauw_eval_assert(miauw_tool_requires_confirmation((string) $name), 'Acao forte sem confirmacao obrigatoria: ' . (string) $name);
        }
    }
});

miauw_eval_add('fase6_prompt_nao_inventa_dados', static function (): void {
    $prompt = miauw_system_prompt('');

    miauw_eval_assert_contains('NAO INVENTAR DADOS', $prompt, 'Prompt perdeu a regra de nao inventar dados.');
    miauw_eval_assert_contains('Nunca invente vendas reais', $prompt, 'Prompt precisa proibir inventar numeros reais.');
    miauw_eval_assert_contains('Miauby nao recebeu esse dado', $prompt, 'Prompt precisa ter resposta segura para dado ausente.');
    miauw_eval_assert_contains('Acoes fortes', $prompt, 'Prompt precisa lembrar confirmacao para acoes fortes.');
});

miauw_eval_add('intent_tarefa_criacao', static function (): void {
    $command = miauw_skill_tarefa_command_from_message('criar tarefa alta conferir fechamento - revisar divergencia de pix');

    miauw_eval_assert(is_array($command), 'Comando de tarefa nao foi detectado.');
    miauw_eval_assert_same('alta', (string) ($command['prioridade'] ?? ''), 'Prioridade da tarefa incorreta.');
    miauw_eval_assert_same('conferir fechamento', (string) ($command['titulo'] ?? ''), 'Titulo da tarefa incorreto.');
    miauw_eval_assert_contains('divergencia', (string) ($command['descricao'] ?? ''), 'Descricao da tarefa nao preservada.');
    miauw_eval_assert(miauw_skill_tarefa_command_from_message('como criar tarefa no sistema?') === null, 'Pergunta sobre tarefa nao deve virar escrita.');
});

miauw_eval_add('intent_cotacao_encomenda', static function (): void {
    $command = miauw_skill_cotacao_encomenda_command_from_message('encomenda losartana 50mg para Ana telefone 11999998888');

    miauw_eval_assert(is_array($command), 'Comando de encomenda nao foi detectado.');
    miauw_eval_assert_contains('losartana', (string) ($command['produto'] ?? ''), 'Produto da encomenda incorreto.');
    miauw_eval_assert_contains('Ana', (string) ($command['responsavel'] ?? ''), 'Responsavel da encomenda nao detectado.');
    miauw_eval_assert_contains('telefone', (string) ($command['categoria_extra'] ?? ''), 'Sinal de telefone da encomenda nao foi preservado.');
});

miauw_eval_add('intent_cotacao_urgente', static function (): void {
    $command = miauw_skill_cotacao_urgente_command_from_message('dipirona gotas esta em falta na loja');

    miauw_eval_assert(is_array($command), 'Comando de urgente nao foi detectado.');
    miauw_eval_assert_same('dipirona gotas', (string) ($command['produto'] ?? ''), 'Produto urgente incorreto.');
    miauw_eval_assert(miauw_skill_cotacao_urgente_command_from_message('como vejo produto urgente?') === null, 'Pergunta sobre urgente nao deve virar escrita.');
});

miauw_eval_add('tool_codigos_contrato', static function (): void {
    miauw_eval_assert(function_exists('miauw_skill_codigos_lookup'), 'Lookup de codigos nao existe.');
    miauw_eval_assert(function_exists('miauw_skill_codigos_summary'), 'Resumo de codigos nao existe.');

    $registry = miauw_skill_registry_public();
    miauw_eval_assert(!empty($registry['buscar_codigo_comissao']['openai_tool']), 'Buscar codigo deve estar disponivel como tool.');
    miauw_eval_assert(!empty($registry['resumo_codigos']['openai_tool']), 'Resumo de codigos deve estar disponivel como tool.');
});

miauw_eval_add('fase5_confirmacao_acao_forte', static function (): void {
    miauw_ensure_schema();
    miauw_eval_reset_action_state();
    miauw_trace_set_context(miauw_trace_new_id(), 0, 1, 0);

    $reply = miauw_confirmation_request_reply('registrar_sangria', array(
        'categoria' => 'Sangria',
        'valor' => 30.0,
        'responsavel' => 'Maria',
        'observacao' => 'eval sem escrita real',
        'data' => date('Y-m-d'),
    ), 1);

    miauw_eval_assert(is_array($reply['confirmation'] ?? null), 'Confirmacao nao retornou payload para o widget.');
    miauw_eval_assert_contains('confirma', (string) ($reply['text'] ?? ''), 'Resposta de acao forte precisa pedir confirmacao.');
    miauw_eval_assert(is_array($_SESSION['miauw_pending_confirm_action'] ?? null), 'Acao forte nao ficou pendente na sessao.');

    $cancel = miauw_try_controlled_action('cancelar ' . (string) $reply['confirmation']['id'], 1);
    miauw_eval_assert(is_array($cancel), 'Cancelamento da confirmacao nao gerou resposta.');
    miauw_eval_assert_contains('Cancelado', (string) ($cancel['text'] ?? ''), 'Cancelamento deve ser claro.');
    miauw_eval_assert(!isset($_SESSION['miauw_pending_confirm_action']), 'Cancelamento deve limpar a acao pendente.');

    miauw_trace_set_context(miauw_trace_new_id(), 0, 1, 0);
    $parsed = miauw_try_controlled_action('sangria 30 Maria', 1, '', true);
    miauw_eval_assert(is_array($parsed), 'Intent real de sangria deveria ser capturada localmente.');
    miauw_eval_assert(is_array($parsed['confirmation'] ?? null), 'Intent real de sangria precisa virar confirmacao, nao escrita direta.');
    $parsedCancel = miauw_try_controlled_action('cancelar ' . (string) $parsed['confirmation']['id'], 1);
    miauw_eval_assert(is_array($parsedCancel), 'Cancelamento da intent real nao respondeu.');
    miauw_eval_assert(!isset($_SESSION['miauw_pending_confirm_action']), 'Cancelamento da intent real deve limpar pendencia.');
    miauw_eval_reset_action_state();
});

miauw_eval_add('fase5_traces_diagnostico', static function (): void {
    miauw_ensure_schema();
    miauw_trace_set_context(miauw_trace_new_id(), 0, 1, 0);
    miauw_trace_record('eval_trace', 'ok', array(
        'type' => 'eval',
        'summary' => 'Trace de avaliacao sem dado sensivel.',
        'payload' => array('ok' => true),
    ));

    $traces = miauw_diagnostics_recent_tool_traces(5);
    miauw_eval_assert(is_array($traces), 'Diagnostico de traces deve retornar lista.');
    miauw_eval_assert(count($traces) > 0, 'Trace de avaliacao nao apareceu no diagnostico.');
    miauw_eval_assert(isset($traces[0]['ferramenta'], $traces[0]['status']), 'Trace recente veio incompleto.');
});

miauw_eval_add('fase8_shadow_status_seguro', static function (): void {
    $status = miauw_agent_shadow_status();
    $json = json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    miauw_eval_assert(is_array($status), 'Status do adaptador sombra deve ser array.');
    miauw_eval_assert(isset($status['configured'], $status['token_configured'], $status['on_send'], $status['timeout_ms']), 'Status sombra veio incompleto.');
    miauw_eval_assert(!isset($status['base_url'], $status['token']), 'Status sombra nao pode expor URL interna bruta nem token.');
    miauw_eval_assert(strpos((string) $json, 'http://') === false, 'Status sombra nao deve publicar URL interna.');
    miauw_eval_assert_no_forbidden((string) $json, 'Status sombra expos termo proibido.');
});

miauw_eval_add('fase8_shadow_skip_controlado', static function (): void {
    $result = miauw_agent_shadow_compare(
        0,
        'teste local sem chamada online',
        'resposta oficial php',
        'php-eval',
        true,
        array('enabled_override' => false)
    );

    miauw_eval_assert_same('skipped', (string) ($result['status'] ?? ''), 'Comparacao sombra desativada deve ser ignorada sem chamada online.');
    miauw_eval_assert_same('on_send_disabled', (string) ($result['reason'] ?? ''), 'Motivo do skip sombra deve ser claro.');
});

miauw_eval_add('fase8_shadow_similarity_basica', static function (): void {
    $similar = miauw_agent_shadow_text_similarity(
        'Preciso de produto, valor e responsavel para registrar a sangria.',
        'Para registrar a sangria, informe valor, produto/contexto e responsavel.'
    );
    $different = miauw_agent_shadow_text_similarity('cashback cliente compra', 'cotacao fornecedor preco');

    miauw_eval_assert($similar > $different, 'Similaridade sombra deveria diferenciar respostas parecidas de respostas distantes.');
    miauw_eval_assert($similar >= 0 && $similar <= 1, 'Similaridade sombra precisa ficar entre 0 e 1.');
});

miauw_eval_add('fase9_engine_switch_seguro', static function (): void {
    $engine = miauw_agent_engine();
    $runtime = miauw_agent_runtime_status(array('username' => 'adm'));

    miauw_eval_assert(in_array($engine, array('php', 'node_shadow', 'node'), true), 'Engine do Miauby precisa ficar em lista fechada.');
    miauw_eval_assert_same($engine, (string) ($runtime['engine'] ?? ''), 'Runtime precisa refletir engine atual.');
    miauw_eval_assert(!empty($runtime['engine_allowed']), 'Usuario adm precisa estar liberado para o corte controlado.');
    miauw_eval_assert(isset($runtime['maintenance'], $runtime['shadow']), 'Runtime precisa trazer manutencao e sombra.');
});

miauw_eval_add('fase9_manutencao_default_adm', static function (): void {
    $admStatus = miauw_maintenance_status(array('username' => 'adm'));
    $otherStatus = miauw_maintenance_status(array('username' => 'operador'));

    miauw_eval_assert(isset($admStatus['active'], $admStatus['can_send'], $admStatus['allowed_users']), 'Status de manutencao veio incompleto.');
    miauw_eval_assert(in_array('adm', (array) ($admStatus['allowed_users'] ?? array()), true), 'Adm precisa ser o usuario padrao liberado na manutencao.');
    if (!empty($admStatus['active'])) {
        miauw_eval_assert(!empty($admStatus['can_send']), 'Adm nao pode ser bloqueado durante manutencao.');
        miauw_eval_assert(empty($otherStatus['can_send']), 'Usuario comum deve ser bloqueado durante manutencao.');
    }
});

$passed = 0;
$failed = 0;

foreach ($miauwEvalTests as $entry) {
    [$name, $test] = $entry;

    try {
        $test();
        $passed++;
        fwrite(STDOUT, '[PASS] ' . $name . PHP_EOL);
    } catch (Throwable $error) {
        $failed++;
        fwrite(STDERR, '[FAIL] ' . $name . ' - ' . $error->getMessage() . PHP_EOL);
    }
}

$total = count($miauwEvalTests);
fwrite(STDOUT, 'Miauby evals: ' . $passed . '/' . $total . ' passaram.' . PHP_EOL);

if ($failed > 0) {
    exit(1);
}
