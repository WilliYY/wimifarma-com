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

miauw_eval_add('agent_status_fase4', static function (): void {
    $status = miauw_agent_public_status();

    miauw_eval_assert_same('Miauby', (string) ($status['name'] ?? ''), 'Nome publico do agente mudou.');
    miauw_eval_assert(strpos((string) ($status['version'] ?? ''), '2.0') === 0, 'Versao do agente deve estar na familia 2.0.');
    miauw_eval_assert((string) ($status['policy_version'] ?? '') !== '', 'Versao de politica nao pode ficar vazia.');
    miauw_eval_assert(in_array('guardrails_bastidor', (array) ($status['features'] ?? array()), true), 'Guardrails precisam estar anunciados no status.');
    miauw_eval_assert(in_array('evals_intents_guardrails', (array) ($status['features'] ?? array()), true), 'Fase 2 precisa anunciar evals no status.');
    miauw_eval_assert(in_array('painel_diagnostico_revisao', (array) ($status['features'] ?? array()), true), 'Fase 3 precisa anunciar painel de diagnostico no status.');
    miauw_eval_assert(in_array('tools_operacionais_migradas', (array) ($status['features'] ?? array()), true), 'Fase 4 precisa anunciar tools operacionais migradas no status.');
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

miauw_eval_add('diagnostico_fase3_payload', static function (): void {
    miauw_diagnostics_ensure_review_columns();
    $data = miauw_diagnostics_panel_data(false);

    miauw_eval_assert(isset($data['summary'], $data['memories'], $data['patterns'], $data['alerts'], $data['events']), 'Payload do diagnostico incompleto.');
    miauw_eval_assert(is_array($data['summary']['memorias'] ?? null), 'Resumo de memorias ausente.');
    miauw_eval_assert(is_array($data['summary']['padroes'] ?? null), 'Resumo de padroes ausente.');
    miauw_eval_assert(is_array($data['summary']['skills'] ?? null), 'Resumo de skills ausente no diagnostico.');
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
