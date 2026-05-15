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

miauw_eval_add('agent_status_fase8', static function (): void {
    $status = miauw_agent_public_status();

    miauw_eval_assert_same('Miauby', (string) ($status['name'] ?? ''), 'Nome publico do agente mudou.');
    miauw_eval_assert(strpos((string) ($status['version'] ?? ''), '2.0-fase8') === 0, 'Versao do agente deve apontar Fase 8.');
    miauw_eval_assert((string) ($status['policy_version'] ?? '') !== '', 'Versao de politica nao pode ficar vazia.');
    miauw_eval_assert(in_array('guardrails_bastidor', (array) ($status['features'] ?? array()), true), 'Guardrails precisam estar anunciados no status.');
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
});

miauw_eval_add('fase8_contrato_adaptador_sombra', static function (): void {
    $contract = miauw_agent_next_phase_contract();

    miauw_eval_assert_same('fase8', (string) ($contract['fase_atual'] ?? ''), 'Contrato da proxima fase deve partir da fase 8.');
    miauw_eval_assert_contains('Node.js 22', (string) ($contract['runtime'] ?? ''), 'Contrato precisa fixar runtime Node.js 22.');
    miauw_eval_assert_contains('TypeScript', (string) ($contract['runtime'] ?? ''), 'Contrato precisa preparar TypeScript.');
    miauw_eval_assert_contains('Agents SDK', (string) ($contract['sdk'] ?? ''), 'Contrato precisa citar Agents SDK como camada futura.');
    miauw_eval_assert_same('/miauw/agent', (string) ($contract['endpoint_interno'] ?? ''), 'Endpoint interno futuro mudou.');
    miauw_eval_assert_same('sombra', (string) ($contract['modo'] ?? ''), 'Fase 8 deve continuar em modo sombra.');
    miauw_eval_assert(!empty($contract['pronto_agora']['registry_skills']), 'Registry precisa estar pronto antes do servico agente.');
    miauw_eval_assert(!empty($contract['pronto_agora']['evals_locais']), 'Evals locais precisam existir antes do servico agente.');
    miauw_eval_assert(!empty($contract['pronto_agora']['scaffold_servico_sombra']), 'Scaffold do servico sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['proxy_interno']), 'Proxy interno do servico sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['adaptador_php_sombra']), 'Adaptador PHP sombra precisa estar marcado.');
    miauw_eval_assert(!empty($contract['pronto_agora']['trace_comparacao_sombra']), 'Trace de comparacao sombra precisa estar marcado.');
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

miauw_eval_add('diagnostico_fase3_payload', static function (): void {
    miauw_diagnostics_ensure_review_columns();
    $data = miauw_diagnostics_panel_data(false);

    miauw_eval_assert(isset($data['summary'], $data['memories'], $data['patterns'], $data['alerts'], $data['events']), 'Payload do diagnostico incompleto.');
    miauw_eval_assert(is_array($data['summary']['memorias'] ?? null), 'Resumo de memorias ausente.');
    miauw_eval_assert(is_array($data['summary']['padroes'] ?? null), 'Resumo de padroes ausente.');
    miauw_eval_assert(is_array($data['summary']['skills'] ?? null), 'Resumo de skills ausente no diagnostico.');
    miauw_eval_assert(is_array($data['summary']['agent_service'] ?? null), 'Resumo do servico agente ausente no diagnostico.');
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
