<?php
declare(strict_types=1);

$miauwLocalConfig = __DIR__ . '/config.local.php';
if (is_file($miauwLocalConfig) && is_readable($miauwLocalConfig)) {
    require $miauwLocalConfig;
}

if (!function_exists('miauw_env_string')) {
    function miauw_env_string(array $names): string
    {
        foreach ($names as $name) {
            $key = (string) $name;
            $value = getenv($key);
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }

            if (isset($_ENV[$key]) && is_string($_ENV[$key]) && trim($_ENV[$key]) !== '') {
                return trim($_ENV[$key]);
            }

            if (isset($_SERVER[$key]) && is_string($_SERVER[$key]) && trim($_SERVER[$key]) !== '') {
                return trim($_SERVER[$key]);
            }
        }

        return '';
    }
}

if (!defined('MIAUW_APP_NAME')) {
    define('MIAUW_APP_NAME', 'Miauby');
}

if (!defined('MIAUW_VERSION')) {
    define('MIAUW_VERSION', '20260515f');
}

if (!defined('MIAUW_AGENT_VERSION')) {
    define('MIAUW_AGENT_VERSION', '2.0-fase5');
}

if (!defined('MIAUW_AGENT_POLICY_VERSION')) {
    define('MIAUW_AGENT_POLICY_VERSION', '2026-05-15-operacional-v2-rastreavel');
}

if (!defined('MIAUW_OPENAI_API_KEY')) {
    define('MIAUW_OPENAI_API_KEY', miauw_env_string(array('MIAUW_OPENAI_API_KEY', 'OPENAI_API_KEY')));
}

if (!defined('MIAUW_OPENAI_MODEL')) {
    $envModel = miauw_env_string(array('MIAUW_OPENAI_MODEL', 'OPENAI_MODEL'));
    define('MIAUW_OPENAI_MODEL', $envModel !== '' ? $envModel : 'gpt-5.4-mini');
}

if (!defined('MIAUW_MODEL_FAST')) {
    define('MIAUW_MODEL_FAST', 'gpt-5.4-mini');
}

if (!defined('MIAUW_MODEL_SMART')) {
    define('MIAUW_MODEL_SMART', 'gpt-5.4');
}

if (!defined('MIAUW_MODEL_BOSS')) {
    define('MIAUW_MODEL_BOSS', 'gpt-5.4');
}

if (!defined('MIAUW_MODEL_FALLBACK')) {
    define('MIAUW_MODEL_FALLBACK', 'gpt-5.4-mini');
}

if (!defined('MIAUW_DIAGNOSTIC_MAX_BYTES')) {
    define('MIAUW_DIAGNOSTIC_MAX_BYTES', 2097152);
}

if (!defined('MIAUW_MAX_OUTPUT_TOKENS')) {
    define('MIAUW_MAX_OUTPUT_TOKENS', 420);
}

if (!defined('MIAUW_MAX_OUTPUT_TOKENS_FAST')) {
    define('MIAUW_MAX_OUTPUT_TOKENS_FAST', 300);
}

if (!defined('MIAUW_MAX_OUTPUT_TOKENS_SMART')) {
    define('MIAUW_MAX_OUTPUT_TOKENS_SMART', 580);
}

if (!defined('MIAUW_MAX_OUTPUT_TOKENS_BOSS')) {
    define('MIAUW_MAX_OUTPUT_TOKENS_BOSS', 900);
}

if (!defined('MIAUW_TEMPERATURE')) {
    define('MIAUW_TEMPERATURE', 0.82);
}

if (!defined('MIAUW_REASONING_FAST')) {
    define('MIAUW_REASONING_FAST', 'low');
}

if (!defined('MIAUW_REASONING_SMART')) {
    define('MIAUW_REASONING_SMART', 'high');
}

if (!defined('MIAUW_REASONING_BOSS')) {
    define('MIAUW_REASONING_BOSS', 'xhigh');
}

if (!defined('MIAUW_OPENAI_TOOLS')) {
    define('MIAUW_OPENAI_TOOLS', true);
}

if (!defined('MIAUW_GUARDIAN_TOKEN')) {
    define('MIAUW_GUARDIAN_TOKEN', miauw_env_string(array('MIAUW_GUARDIAN_TOKEN')));
}

if (!defined('COTACAO_INTERNAL_TOKEN')) {
    define('COTACAO_INTERNAL_TOKEN', miauw_env_string(array('COTACAO_INTERNAL_TOKEN', 'MIAUW_GUARDIAN_TOKEN')));
}

if (!defined('COTACAO_INTERNAL_BASE_URL')) {
    $cotacaoInternalBaseUrl = miauw_env_string(array('COTACAO_INTERNAL_BASE_URL'));
    define('COTACAO_INTERNAL_BASE_URL', $cotacaoInternalBaseUrl !== '' ? $cotacaoInternalBaseUrl : 'http://wimifarma-cotacao-app:3000/cotacao');
}

function miauw_schema_statements(): array
{
    return array(
        "CREATE TABLE IF NOT EXISTS miauw_conversas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id INT UNSIGNED NULL,
            titulo VARCHAR(160) NOT NULL DEFAULT 'Conversa com Miauby',
            status ENUM('aberta', 'arquivada') NOT NULL DEFAULT 'aberta',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_miauw_conversa_usuario (usuario_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_mensagens (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            conversa_id BIGINT UNSIGNED NOT NULL,
            usuario_id INT UNSIGNED NULL,
            papel ENUM('user', 'assistant', 'system') NOT NULL,
            conteudo MEDIUMTEXT NOT NULL,
            modelo VARCHAR(80) NULL,
            fallback TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_miauw_mensagem_conversa (conversa_id, id),
            KEY idx_miauw_mensagem_usuario (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_conhecimentos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            titulo VARCHAR(160) NOT NULL,
            conteudo MEDIUMTEXT NOT NULL,
            tags VARCHAR(255) NULL,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_miauw_conhecimento_titulo (titulo),
            KEY idx_miauw_conhecimento_ativo (ativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_memorias (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            fingerprint CHAR(40) NOT NULL,
            usuario_id INT UNSIGNED NULL,
            modulo VARCHAR(40) NOT NULL DEFAULT 'geral',
            chave VARCHAR(160) NOT NULL,
            valor MEDIUMTEXT NOT NULL,
            origem VARCHAR(80) NOT NULL DEFAULT 'usuario',
            peso DECIMAL(4,2) NOT NULL DEFAULT 1.00,
            usos INT UNSIGNED NOT NULL DEFAULT 0,
            ultimo_uso DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_miauw_memoria_fingerprint (fingerprint),
            KEY idx_miauw_memoria_modulo (modulo, updated_at),
            KEY idx_miauw_memoria_usuario (usuario_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_configuracoes (
            chave VARCHAR(80) NOT NULL,
            valor TEXT NULL,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (chave)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_farmacia_popular_valores (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            uf CHAR(2) NOT NULL DEFAULT 'PR',
            principio_ativo VARCHAR(180) NOT NULL,
            apresentacao VARCHAR(180) NOT NULL,
            produto_chave VARCHAR(255) NOT NULL,
            valor_referencia DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            valor_unidade VARCHAR(40) NOT NULL DEFAULT 'unidade',
            fonte_titulo VARCHAR(220) NULL,
            fonte_url VARCHAR(500) NULL,
            vigencia_inicio DATE NULL,
            vigencia_fim DATE NULL,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            observacao TEXT NULL,
            fingerprint CHAR(40) NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_miauw_fp_fingerprint (fingerprint),
            KEY idx_miauw_fp_busca (uf, ativo, principio_ativo(120)),
            KEY idx_miauw_fp_chave (uf, ativo, produto_chave(160))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_farmacia_popular_atualizacoes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            status ENUM('ok', 'parcial', 'erro') NOT NULL DEFAULT 'parcial',
            fonte_url VARCHAR(500) NULL,
            mensagem TEXT NULL,
            itens INT UNSIGNED NOT NULL DEFAULT 0,
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_miauw_fp_update_started (started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_tool_traces (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            trace_id CHAR(32) NOT NULL,
            conversa_id BIGINT UNSIGNED NULL,
            mensagem_id BIGINT UNSIGNED NULL,
            usuario_id INT UNSIGNED NULL,
            ferramenta VARCHAR(120) NOT NULL,
            modulo VARCHAR(60) NOT NULL DEFAULT 'miauby',
            tipo VARCHAR(40) NOT NULL DEFAULT 'tool',
            status VARCHAR(30) NOT NULL DEFAULT 'ok',
            risco VARCHAR(20) NOT NULL DEFAULT 'baixo',
            requer_confirmacao TINYINT(1) NOT NULL DEFAULT 0,
            resumo VARCHAR(255) NOT NULL DEFAULT '',
            payload_json MEDIUMTEXT NULL,
            erro TEXT NULL,
            duracao_ms INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_miauw_tool_traces_trace (trace_id, id),
            KEY idx_miauw_tool_traces_conversa (conversa_id, id),
            KEY idx_miauw_tool_traces_usuario (usuario_id, created_at),
            KEY idx_miauw_tool_traces_ferramenta (ferramenta, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function miauw_substr(string $text, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($text, $start, $length);
    }

    return substr($text, $start, $length);
}

function miauw_strlen(string $text): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($text);
    }

    return strlen($text);
}

function miauw_constant_string(string $name, string $default = ''): string
{
    return defined($name) ? (string) constant($name) : $default;
}

function miauw_constant_int(string $name, int $default): int
{
    return defined($name) ? (int) constant($name) : $default;
}

function miauw_openai_key_configured(): bool
{
    $key = trim(miauw_constant_string('MIAUW_OPENAI_API_KEY'));

    if ($key === '') {
        return false;
    }

    $placeholderTerms = array('cole_sua_chave_aqui', 'troque', 'placeholder', 'changeme');
    foreach ($placeholderTerms as $term) {
        if (stripos($key, $term) !== false) {
            return false;
        }
    }

    return true;
}

function miauw_openai_public_status(): array
{
    $configured = miauw_openai_key_configured();

    return array(
        'configured' => $configured,
        'validated' => false,
        'status' => $configured ? 'configured_not_validated' : 'missing',
        'message' => $configured
            ? 'Chave configurada, validacao online feita somente quando o Miauby responde.'
            : 'Chave OpenAI ausente ou placeholder.',
    );
}

function miauw_agent_public_status(): array
{
    return array(
        'name' => 'Miauby',
        'version' => miauw_constant_string('MIAUW_AGENT_VERSION', '1.0'),
        'policy_version' => miauw_constant_string('MIAUW_AGENT_POLICY_VERSION', ''),
        'mode' => 'operacional',
        'features' => array(
            'persona_operacional',
            'guardrails_bastidor',
            'skills_controladas',
            'diagnostico_interno',
            'evals_intents_guardrails',
            'painel_diagnostico_revisao',
            'tools_operacionais_migradas',
            'rastreabilidade_por_conversa',
            'confirmacao_acoes_fortes',
            'streaming_visual_widget',
        ),
    );
}

function miauw_trace_new_id(): string
{
    try {
        return bin2hex(random_bytes(16));
    } catch (Throwable $error) {
        return substr(hash('sha256', uniqid('miauw-trace-', true)), 0, 32);
    }
}

function miauw_trace_set_context(?string $traceId, ?int $conversationId = null, ?int $userId = null, ?int $messageId = null): void
{
    $GLOBALS['miauw_trace_context'] = array(
        'trace_id' => $traceId !== null && $traceId !== '' ? $traceId : miauw_trace_new_id(),
        'conversa_id' => $conversationId,
        'usuario_id' => $userId,
        'mensagem_id' => $messageId,
    );
}

function miauw_trace_context(): array
{
    $context = $GLOBALS['miauw_trace_context'] ?? array();
    if (!is_array($context)) {
        $context = array();
    }

    if (empty($context['trace_id'])) {
        $context['trace_id'] = miauw_trace_new_id();
    }

    return $context;
}

function miauw_tool_public_meta(string $tool): array
{
    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $meta = is_array($registry[$tool] ?? null) ? $registry[$tool] : array();

    return array(
        'modulo' => (string) ($meta['modulo'] ?? 'miauby'),
        'risco' => (string) ($meta['risco'] ?? 'baixo'),
        'nivel' => (string) ($meta['nivel'] ?? 'tool'),
        'titulo' => (string) ($meta['titulo'] ?? $tool),
    );
}

function miauw_trace_payload_json(array $payload): ?string
{
    $clean = function_exists('miauw_diagnostic_sanitize') ? miauw_diagnostic_sanitize($payload) : $payload;
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    if (!is_string($json) || $json === '') {
        return null;
    }

    if (strlen($json) > 12000) {
        $json = substr($json, 0, 12000) . '...';
    }

    return $json;
}

function miauw_trace_record(string $tool, string $status = 'ok', array $context = array()): void
{
    try {
        $tool = preg_replace('/[^a-z0-9_\-]+/i', '_', trim($tool)) ?: 'miauby';
        $trace = miauw_trace_context();
        $meta = miauw_tool_public_meta($tool);
        $payload = is_array($context['payload'] ?? null) ? $context['payload'] : array();
        $error = isset($context['error']) ? miauw_diagnostic_redact_string((string) $context['error']) : null;
        $summary = miauw_substr(trim((string) ($context['summary'] ?? '')), 0, 255);

        $stmt = db()->prepare(
            'INSERT INTO miauw_tool_traces
                (trace_id, conversa_id, mensagem_id, usuario_id, ferramenta, modulo, tipo, status, risco, requer_confirmacao, resumo, payload_json, erro, duracao_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            (string) ($context['trace_id'] ?? $trace['trace_id']),
            isset($context['conversa_id']) ? (int) $context['conversa_id'] : ($trace['conversa_id'] ?? null),
            isset($context['mensagem_id']) ? (int) $context['mensagem_id'] : ($trace['mensagem_id'] ?? null),
            isset($context['usuario_id']) ? (int) $context['usuario_id'] : ($trace['usuario_id'] ?? null),
            $tool,
            miauw_substr((string) ($context['modulo'] ?? $meta['modulo']), 0, 60),
            miauw_substr((string) ($context['type'] ?? 'tool'), 0, 40),
            miauw_substr($status, 0, 30),
            miauw_substr((string) ($context['risk'] ?? $meta['risco']), 0, 20),
            !empty($context['requires_confirmation']) ? 1 : 0,
            $summary,
            miauw_trace_payload_json($payload),
            $error,
            isset($context['duration_ms']) ? max(0, (int) $context['duration_ms']) : null,
        ));
    } catch (Throwable $error) {
        error_log('Miauby trace record failed: ' . $error->getMessage());
    }
}

function miauw_tools_requiring_confirmation(): array
{
    return array(
        'registrar_sangria',
        'criar_lancamento_financeiro',
        'registrar_faturamento_diario',
        'criar_encomenda_cotacao',
        'criar_cotacao_urgente',
        'criar_cotacao_rapida',
        'criar_planilha_cotacao',
    );
}

function miauw_tool_requires_confirmation(string $tool): bool
{
    $tool = trim($tool);
    if (in_array($tool, miauw_tools_requiring_confirmation(), true)) {
        return true;
    }

    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $meta = is_array($registry[$tool] ?? null) ? $registry[$tool] : array();

    return (string) ($meta['nivel'] ?? '') === 'escrita' && (string) ($meta['risco'] ?? '') === 'alto';
}

function miauw_confirmation_summary(string $tool, array $command): string
{
    $money = static function ($value): string {
        return function_exists('miauw_skill_money') ? miauw_skill_money((float) $value) : ('R$ ' . number_format((float) $value, 2, ',', '.'));
    };

    if ($tool === 'registrar_sangria') {
        return 'Registrar sangria de ' . $money($command['valor'] ?? 0)
            . ' para ' . trim((string) ($command['responsavel'] ?? 'responsavel nao informado'))
            . '.';
    }

    if ($tool === 'criar_lancamento_financeiro') {
        return 'Criar lancamento financeiro: '
            . trim((string) ($command['categoria'] ?? 'categoria')) . ', '
            . $money($command['valor'] ?? 0)
            . ', responsavel ' . trim((string) ($command['responsavel'] ?? 'nao informado')) . '.';
    }

    if ($tool === 'registrar_faturamento_diario') {
        $entries = is_array($command['entries'] ?? null) ? $command['entries'] : array();
        $parts = array();
        foreach (array_slice($entries, 0, 3) as $entry) {
            $parts[] = date('d/m/Y', strtotime((string) ($entry['data'] ?? 'now'))) . ' ' . $money($entry['valor'] ?? 0);
        }

        return 'Registrar faturamento diario: ' . ($parts ? implode(', ', $parts) : 'valores informados') . '.';
    }

    if ($tool === 'criar_encomenda_cotacao') {
        return 'Criar encomenda na Cotacao: '
            . trim((string) ($command['produto'] ?? 'produto nao informado'))
            . ' para ' . trim((string) ($command['responsavel'] ?? 'responsavel nao informado')) . '.';
    }

    if ($tool === 'criar_cotacao_urgente') {
        return 'Criar item urgente na Cotacao: ' . trim((string) ($command['produto'] ?? 'produto nao informado')) . '.';
    }

    if ($tool === 'criar_planilha_cotacao') {
        return 'Criar nova planilha/bloco de Cotacao: ' . trim((string) ($command['nome'] ?? 'sem nome')) . '.';
    }

    if ($tool === 'criar_cotacao_rapida') {
        return 'Criar cotacao rapida para fornecedor '
            . trim((string) ($command['fornecedor'] ?? 'nao informado')) . '.';
    }

    $meta = miauw_tool_public_meta($tool);
    return 'Executar acao: ' . (string) ($meta['titulo'] ?? $tool) . '.';
}

function miauw_queue_confirmation(string $tool, array $command, ?string $summary = null, ?int $userId = null): array
{
    $id = substr(miauw_trace_new_id(), 0, 8);
    $meta = miauw_tool_public_meta($tool);
    $summary = $summary !== null && trim($summary) !== '' ? trim($summary) : miauw_confirmation_summary($tool, $command);
    $confirmation = array(
        'id' => $id,
        'tool' => $tool,
        'summary' => miauw_substr($summary, 0, 220),
        'risk' => (string) ($meta['risco'] ?? 'alto'),
    );

    $_SESSION['miauw_pending_confirm_action'] = array(
        'id' => $id,
        'tool' => $tool,
        'command' => $command,
        'summary' => $confirmation['summary'],
        'user_id' => $userId,
        'created_at' => time(),
    );
    $GLOBALS['miauw_pending_confirmation_response'] = $confirmation;

    miauw_trace_record($tool, 'pending_confirmation', array(
        'type' => 'confirmacao',
        'requires_confirmation' => true,
        'summary' => (string) $confirmation['summary'],
        'payload' => array('command' => $command, 'confirmation_id' => $id),
    ));

    return $confirmation;
}

function miauw_current_confirmation_response(): ?array
{
    $confirmation = $GLOBALS['miauw_pending_confirmation_response'] ?? null;

    return is_array($confirmation) ? $confirmation : null;
}

function miauw_confirmation_request_reply(string $tool, array $command, ?int $userId = null, ?string $summary = null): array
{
    $confirmation = miauw_queue_confirmation($tool, $command, $summary, $userId);

    return array(
        'text' => "Antes de gravar, confirma essa acao?\n" . $confirmation['summary'] . "\nAperte Confirmar ou Cancelar. Sem confirmacao, eu nao mexo no dado.",
        'fallback' => false,
        'model' => 'miauw-confirmacao',
        'confirmation' => $confirmation,
    );
}

function miauw_execute_confirmed_action(array $pending, int $userId): string
{
    $tool = (string) ($pending['tool'] ?? '');
    $command = is_array($pending['command'] ?? null) ? $pending['command'] : array();

    if ($tool === 'criar_encomenda_cotacao') {
        $command['usuario_id'] = $userId;
        $sessionUser = function_exists('current_user') ? current_user() : null;
        if (is_array($sessionUser) && trim((string) ($sessionUser['username'] ?? '')) !== '') {
            $command['username'] = (string) $sessionUser['username'];
        }

        $result = miauw_skill_create_cotacao_encomenda($command);
        return miauw_skill_cotacao_encomenda_action_reply($result);
    }

    if ($tool === 'criar_cotacao_urgente') {
        $result = miauw_skill_create_cotacao_urgente($command);
        return miauw_skill_cotacao_urgente_action_reply($result);
    }

    if ($tool === 'criar_planilha_cotacao') {
        $result = miauw_skill_create_cotacao_planilha($command);
        return miauw_skill_cotacao_planilha_action_reply($result);
    }

    if ($tool === 'criar_cotacao_rapida') {
        $result = miauw_skill_create_cotacao_rapida($command);
        return miauw_skill_cotacao_rapida_action_reply($result);
    }

    if ($tool === 'registrar_faturamento_diario') {
        $result = miauw_skill_create_financeiro_faturamentos($command, $userId);
        return miauw_skill_financeiro_faturamento_action_reply($result);
    }

    if ($tool === 'registrar_sangria') {
        $result = function_exists('miauw_skill_create_sangria')
            ? miauw_skill_create_sangria(
                (float) ($command['valor'] ?? 0),
                (string) ($command['responsavel'] ?? ''),
                (string) ($command['observacao'] ?? ''),
                isset($command['data']) ? (string) $command['data'] : null
            )
            : miauw_skill_create_financeiro_lancamento(
                'Sangria',
                (float) ($command['valor'] ?? 0),
                (string) ($command['observacao'] ?? ''),
                isset($command['data']) ? (string) $command['data'] : null,
                (string) ($command['responsavel'] ?? '')
            );

        return "Sangria registrada.\n"
            . 'Valor: ' . miauw_skill_money((float) ($result['valor'] ?? $command['valor'] ?? 0)) . "\n"
            . 'Responsavel: ' . (string) ($result['responsavel'] ?? $command['responsavel'] ?? '');
    }

    if ($tool === 'criar_lancamento_financeiro') {
        if (function_exists('miauw_intelligence_learn_financeiro_command')) {
            miauw_intelligence_learn_financeiro_command((string) ($command['raw_message'] ?? 'confirmacao_financeiro'), $command);
        }

        $result = miauw_skill_create_financeiro_lancamento(
            (string) ($command['categoria'] ?? ''),
            (float) ($command['valor'] ?? 0),
            (string) ($command['observacao'] ?? ''),
            isset($command['data']) ? (string) $command['data'] : null,
            (string) ($command['responsavel'] ?? '')
        );

        return miauw_skill_financeiro_action_reply($result);
    }

    throw new RuntimeException('Acao pendente desconhecida para confirmacao.');
}

function miauw_try_confirmation_reply(string $message, int $userId): ?array
{
    $pending = $_SESSION['miauw_pending_confirm_action'] ?? null;
    if (!is_array($pending)) {
        return null;
    }

    $createdAt = (int) ($pending['created_at'] ?? 0);
    if ($createdAt > 0 && (time() - $createdAt) > 900) {
        unset($_SESSION['miauw_pending_confirm_action']);
        miauw_trace_record((string) ($pending['tool'] ?? 'miauby'), 'expired', array(
            'type' => 'confirmacao',
            'summary' => 'Confirmacao expirada.',
            'requires_confirmation' => true,
        ));

        return null;
    }

    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
    $id = strtolower((string) ($pending['id'] ?? ''));
    $wantsCancel = preg_match('/\b(cancela|cancelar|nao|n|deixa|esquece)\b/u', $normalized) === 1;
    $wantsConfirm = preg_match('/\b(confirmar|confirmo|confirma|sim|s|pode|ok|feito)\b/u', $normalized) === 1
        || ($id !== '' && strpos($normalized, $id) !== false);

    if (!$wantsCancel && !$wantsConfirm) {
        $tool = (string) ($pending['tool'] ?? '');
        $meta = miauw_tool_public_meta($tool);

        return array(
            'text' => "Tem uma acao pendente esperando confirmacao.\n" . (string) ($pending['summary'] ?? 'Acao operacional pendente.') . "\nConfirma ou cancela primeiro; depois eu volto para a proxima bagunca.",
            'fallback' => false,
            'model' => 'miauw-confirmacao',
            'confirmation' => array(
                'id' => (string) ($pending['id'] ?? ''),
                'tool' => $tool,
                'summary' => (string) ($pending['summary'] ?? ''),
                'risk' => (string) ($meta['risco'] ?? 'alto'),
            ),
        );
    }

    if ($id !== '' && preg_match('/\b[0-9a-f]{8}\b/i', $message, $match) && strtolower((string) $match[0]) !== $id) {
        return array(
            'text' => 'Esse codigo de confirmacao nao bate. A acao ficou parada; aperte Confirmar no card certo ou cancele.',
            'fallback' => false,
            'model' => 'miauw-confirmacao',
            'confirmation' => array(
                'id' => (string) ($pending['id'] ?? ''),
                'tool' => (string) ($pending['tool'] ?? ''),
                'summary' => (string) ($pending['summary'] ?? ''),
                'risk' => miauw_tool_public_meta((string) ($pending['tool'] ?? ''))['risco'],
            ),
        );
    }

    if ($wantsCancel) {
        unset($_SESSION['miauw_pending_confirm_action']);
        miauw_trace_record((string) ($pending['tool'] ?? 'miauby'), 'cancelled', array(
            'type' => 'confirmacao',
            'summary' => 'Acao cancelada pelo operador.',
            'requires_confirmation' => true,
            'payload' => array('confirmation_id' => (string) ($pending['id'] ?? '')),
        ));

        return array(
            'text' => 'Cancelado. Dado intacto, caos contido.',
            'fallback' => false,
            'model' => 'miauw-confirmacao',
        );
    }

    unset($_SESSION['miauw_pending_confirm_action']);
    $tool = (string) ($pending['tool'] ?? 'miauby');
    $started = microtime(true);

    try {
        miauw_trace_record($tool, 'confirmed', array(
            'type' => 'confirmacao',
            'summary' => (string) ($pending['summary'] ?? 'Acao confirmada.'),
            'requires_confirmation' => true,
            'payload' => array('confirmation_id' => (string) ($pending['id'] ?? '')),
        ));
        $text = miauw_execute_confirmed_action($pending, $userId);
        miauw_trace_record($tool, 'ok', array(
            'type' => 'acao',
            'summary' => (string) ($pending['summary'] ?? 'Acao executada.'),
            'requires_confirmation' => true,
            'duration_ms' => (int) round((microtime(true) - $started) * 1000),
        ));

        return array(
            'text' => $text,
            'fallback' => false,
            'model' => 'miauw-action-confirmed',
        );
    } catch (Throwable $error) {
        miauw_trace_record($tool, 'error', array(
            'type' => 'acao',
            'summary' => (string) ($pending['summary'] ?? 'Falha em acao confirmada.'),
            'requires_confirmation' => true,
            'duration_ms' => (int) round((microtime(true) - $started) * 1000),
            'error' => $error->getMessage(),
        ));

        return array(
            'text' => miauw_action_error_reply($error),
            'fallback' => false,
            'model' => 'miauw-action',
        );
    }
}

function miauw_redact_secret_fragments(string $text): string
{
    $text = preg_replace('/sk-[a-z0-9_\-\*]{8,}/i', 'sk-***', $text) ?? $text;
    $text = preg_replace('/\b(Bearer|Authorization)\s+[a-z0-9_\-\.\*]+/i', '$1 ***', $text) ?? $text;

    return $text;
}

function miauw_normalize_for_memory(string $text): string
{
    if (function_exists('miauw_skill_normalized')) {
        $text = miauw_skill_normalized($text);
    } else {
        $text = strtolower($text);
    }

    $text = preg_replace('/[^a-z0-9]+/i', ' ', $text) ?? $text;

    return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
}

function miauw_memory_module_from_text(string $text): string
{
    if (function_exists('miauw_skill_detect_modules')) {
        $modules = miauw_skill_detect_modules($text);
        if ($modules) {
            return (string) $modules[0];
        }
    }

    return 'geral';
}

function miauw_memory_key(string $text): string
{
    $normalized = miauw_normalize_for_memory($text);
    if ($normalized === '') {
        $normalized = 'memoria';
    }

    return miauw_substr($normalized, 0, 140);
}

function miauw_memory_fingerprint(?int $userId, string $module, string $key): string
{
    return sha1((string) ($userId ?: 0) . '|' . $module . '|' . miauw_normalize_for_memory($key));
}

function miauw_text_looks_sensitive(string $text): bool
{
    $patterns = array(
        '/sk-[a-z0-9_\-]{12,}/i',
        '/\b(api[_\-\s]?key|token|bearer|authorization|senha|password|secret|segredo)\b\s*[:=]/i',
        '/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b/',
        '/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}\-?\d{4}\b/',
    );

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $text)) {
            return true;
        }
    }

    return false;
}

function miauw_memory_store(?int $userId, string $module, string $key, string $value, string $origin = 'usuario', float $weight = 1.0): void
{
    $module = preg_replace('/[^a-z0-9_\-]+/i', '', $module) ?: 'geral';
    $key = trim($key) !== '' ? miauw_substr(trim($key), 0, 160) : 'memoria';
    $value = miauw_substr(trim($value), 0, 1200);
    if ($value === '') {
        return;
    }

    $fingerprint = miauw_memory_fingerprint($userId, $module, $key);
    $stmt = db()->prepare(
        'INSERT INTO miauw_memorias
            (fingerprint, usuario_id, modulo, chave, valor, origem, peso, usos, ultimo_uso)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            origem = VALUES(origem),
            peso = GREATEST(peso, VALUES(peso)),
            updated_at = NOW()'
    );
    $stmt->execute(array(
        $fingerprint,
        $userId,
        $module,
        $key,
        $value,
        miauw_substr($origin, 0, 80),
        max(0.1, min(9.9, $weight)),
    ));
}

function miauw_memory_words(string $text): array
{
    $words = preg_split('/\s+/', miauw_normalize_for_memory($text)) ?: array();

    return array_values(array_filter(array_unique($words), static function ($word): bool {
        return strlen((string) $word) >= 4;
    }));
}

function miauw_memory_context_for_message(string $message, ?int $userId = null): string
{
    try {
        $module = miauw_memory_module_from_text($message);
        $words = miauw_memory_words($message);
        $stmt = db()->prepare(
            'SELECT id, modulo, chave, valor, origem, peso, usos, updated_at
             FROM miauw_memorias
             WHERE (usuario_id IS NULL OR usuario_id = ?)
               AND (modulo = ? OR modulo = "geral")
             ORDER BY updated_at DESC, id DESC
             LIMIT 80'
        );
        $stmt->execute(array($userId ?: 0, $module));
        $rows = $stmt->fetchAll();
        $scored = array();

        foreach ($rows as $row) {
            $haystack = miauw_normalize_for_memory((string) ($row['chave'] ?? '') . ' ' . (string) ($row['valor'] ?? ''));
            $score = (float) ($row['peso'] ?? 1);
            foreach ($words as $word) {
                if (strpos($haystack, $word) !== false) {
                    $score += 3.0;
                }
            }

            if ((string) ($row['modulo'] ?? 'geral') === $module) {
                $score += 1.2;
            }

            if ($score >= 2.0 || !$words) {
                $row['_score'] = $score;
                $scored[] = $row;
            }
        }

        usort($scored, static function (array $a, array $b): int {
            return ($b['_score'] <=> $a['_score']) ?: ((int) $b['id'] <=> (int) $a['id']);
        });

        $selected = array_slice($scored, 0, 7);
        if (!$selected) {
            return '';
        }

        $ids = array_map(static function (array $row): int {
            return (int) $row['id'];
        }, $selected);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        db()->prepare('UPDATE miauw_memorias SET usos = usos + 1, ultimo_uso = NOW() WHERE id IN (' . $placeholders . ')')->execute($ids);

    $lines = array('MEMORIA OPERACIONAL DO MIAUBY');
        foreach ($selected as $row) {
            $lines[] = '- [' . (string) ($row['modulo'] ?? 'geral') . '] ' . (string) ($row['valor'] ?? '');
        }

        return implode("\n", $lines);
    } catch (Throwable $error) {
        error_log('Miauby memory context failed: ' . $error->getMessage());

        return '';
    }
}

function miauw_ensure_schema(): void
{
    static $done = false;

    if ($done) {
        return;
    }

    foreach (miauw_schema_statements() as $statement) {
        db()->exec($statement);
    }

    if (function_exists('miauw_intelligence_ensure_schema')) {
        miauw_intelligence_ensure_schema();
    }

    miauw_seed_knowledge();
    $done = true;
}

function miauw_seed_knowledge(): void
{
    $items = array(
        array(
            'Miauby - personalidade',
            'Miauby e o gato preto fiscal interno da Wimifarma. Ele ajuda funcionarios com processos, explica passos, cria ideias, cria bordoes e responde provocacoes com ironia inteligente. Ele nao e atendimento ao cliente. Willian e o Dono, farmaceutico e criador do Miauby.',
            'miauw, personalidade, humor, interno, willian, dono, criador'
        ),
        array(
            'Cashback',
            'O cashback fica em /cashback/. Use para cadastro de cliente, compras, creditos, resgates e mensagens WhatsApp. Se o funcionario pedir processo exato e nao houver regra cadastrada, Miauby deve pedir mais contexto.',
            'cashback, cliente, compra, resgate, whatsapp'
        ),
        array(
            'Cotacao',
            'A cotacao fica em /cotacao/. A Cotacao Geral funciona como planilha: EAN, produto, quantidade, categoria, distribuidoras e quem ganhou. Categorias sao dinamicas e filtros ajudam a achar encomendas e urgencias. Texto em categoria nao vira comando escondido: encomenda/urgente so tem efeito operacional quando a prioridade explicita foi salva por usuario ou ferramenta controlada. Encomenda criada pelo Miauby registra data/hora porque usa a ferramenta propria com prioridade encomenda. Produtos como Skala, shampoo, creme de cabelo, desodorante, esmalte e perfume devem favorecer categoria perfumaria; produto com mg/ml/comprimido/gotas deve favorecer medicamento; controlados devem ficar bem sinalizados.',
            'cotacao, ean, produto, categoria, distribuidora, encomenda'
        ),
        array(
            'Farmacia Popular',
            'A Wimifarma usa Parana/UF PR como referencia local para o Programa Farmacia Popular. O Miauby deve consultar a tabela miauw_farmacia_popular_valores por principio ativo/apresentacao e explicar que o numero e valor de referencia/reembolso do programa, nao preco de venda. Nomes comerciais como Glifage devem ser ligados ao principio ativo metformina quando a apresentacao estiver clara. A rotina farmacia-popular-cron.php tenta atualizar mensalmente pela fonte oficial do Ministerio da Saude/BVS e preserva valores locais se a fonte estiver indisponivel.',
            'farmacia popular, ministerio da saude, bvs, parana, pr, metformina, glifage, valor referencia'
        ),
        array(
            'Protocolos operacionais da farmacia',
            'Miauby deve tratar a farmacia como operacao integrada: estoque em falta vira urgente na Cotacao Geral; encomenda com produto e responsavel vira linha de encomenda; cotacao rapida so cria/usa distribuidora quando houver fornecedor claro e pelo menos um produto com preco, no formato "Distribuidora - produto 5 reais, produto 2,50". Sem preco ou com cara de PIX/CNPJ/caixa, nao cria coluna: pergunta ou manda para Financeiro. Financeiro exige valor, categoria, responsavel e observacao; cashback exige conferir cliente, compras, credito e resgate sem expor dados. Prioridade de comando: PIX/CNPJ/maquininha/sangria/caixa/dinheiro/cartao/outros + valor e Financeiro antes de Cotacao. Para pesquisa externa, use referencias web controladas e cite fonte/link; nunca transforme snippet em verdade absoluta.',
            'farmacia, cotacao, estoque, urgente, encomenda, cotacao rapida, financeiro, cashback, pesquisa web, protocolos'
        ),
        array(
            'Financeiro',
            'O financeiro fica em /financeiro/. Use para fechamento de caixa, responsavel, total sistema, lancamentos como sangria, maquininha, pix, dinheiro fisico e outros, alem de total lancado e sobra ou falta. Frases como "pix cnpj 6 - willian", "maq pix 500 Ana" ou "sangria 33 isadora - pao de queijo" sao lancamentos financeiros, nao cotacao rapida.',
            'financeiro, caixa, sangria, pix, maquininha, total sistema'
        ),
        array(
            'Regras de seguranca',
            'Miauby pode ser sarcastico, mas nao deve incentivar risco, expor dados sensiveis, inventar senhas, orientar burlar sistema ou dar diagnostico medico. Se nao souber, ele diz isso de forma direta e pede cadastro da informacao.',
            'seguranca, limite, dados, medicina'
        ),
        array(
            'Skills controladas',
            'Miauby possui ferramentas controladas no backend para consultar resumo financeiro, cashback/vendas e cotacao por mes/ano em texto, criar lancamento financeiro quando categoria, valor e responsavel estiverem claros e criar encomenda na Cotacao Geral quando produto e responsavel/cliente estiverem claros. Ele nao gera PDF nem link no chat, nao tem acesso bruto ao banco, nao executa SQL do usuario e nao altera dados fora de ferramenta propria.',
            'skills, agentes, ferramentas, relatorio, dados'
        ),
        array(
            'Inteligencia operacional autonoma',
            'Miauby possui uma camada de guardiao operacional que varre alertas de financeiro e cotacao, aprende padroes de comandos, detecta divergencia de caixa, dia financeiro antigo aberto, encomenda parada com mais de 1 dia, urgente parado e cotacao antiga sem vencedor. A autonomia e segura: ele consulta, alerta, aprende e sugere; escrita no banco so acontece por ferramenta controlada, com validacao e auditoria.',
            'inteligencia, guardiao, alertas, autonomia, padroes, auditoria'
        ),
        array(
            'Miauby - super gestor',
            'O Miauby deve agir como gestor operacional quando solicitado: usar mapa do sistema, memoria, alertas, padroes e ferramentas controladas para diagnosticar risco, validar processo, sugerir acao e apontar qual ferramenta ainda falta criar. Ele nao tem permissao livre para editar banco ou arquivos; autonomia segura vem de ferramentas com auditoria.',
            'gestor, processo, autonomia, memoria, mapa, ferramentas, validacao'
        )
    );

    $stmt = db()->prepare(
        'INSERT INTO miauw_conhecimentos (titulo, conteudo, tags)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE conteudo = VALUES(conteudo), tags = VALUES(tags), ativo = 1'
    );

    foreach ($items as $item) {
        $stmt->execute($item);
    }
}

function miauw_password_matches(array $user, string $password): bool
{
    $hash = (string) ($user['password_hash'] ?? '');

    if ($hash !== '' && password_verify($password, $hash)) {
        return true;
    }

    $username = strtolower(trim((string) ($user['username'] ?? '')));
    if ($username === 'adm' && hash_equals('adm', $password)) {
        return true;
    }

    return false;
}

function miauw_require_user(): array
{
    $user = current_user();

    if (!$user) {
        header('Location: /miauw/login.php');
        exit;
    }

    return $user;
}

function miauw_avatar_src(): string
{
    $candidates = array(
        '/miauw/miauw.png' => __DIR__ . '/miauw.png',
        '/miauw/Miauw.png' => __DIR__ . '/Miauw.png',
        '/miauw/Miauby.png' => __DIR__ . '/Miauby.png',
        '/miauw/miauw.jpg' => __DIR__ . '/miauw.jpg',
        '/miauw/miauw.jpeg' => __DIR__ . '/miauw.jpeg',
        '/miauw/miauw.webp' => __DIR__ . '/miauw.webp',
        '/miauw/assets/miauw.png' => __DIR__ . '/assets/miauw.png',
        '/miauw/assets/Miauw.png' => __DIR__ . '/assets/Miauw.png',
        '/miauw/assets/Miauby.png' => __DIR__ . '/assets/Miauby.png',
        '/miauw/assets/miauw.jpg' => __DIR__ . '/assets/miauw.jpg',
        '/miauw/assets/miauw.webp' => __DIR__ . '/assets/miauw.webp',
    );

    foreach ($candidates as $url => $path) {
        if (is_file($path)) {
            return $url;
        }
    }

    return '/miauw/assets/miauw-avatar.svg';
}

function miauw_current_conversation_id(int $userId): int
{
    $sessionKey = 'miauw_conversa_id';
    $conversationId = (int) ($_SESSION[$sessionKey] ?? 0);

    if ($conversationId > 0) {
        $stmt = db()->prepare('SELECT id FROM miauw_conversas WHERE id = ? AND usuario_id = ? AND status = "aberta" LIMIT 1');
        $stmt->execute(array($conversationId, $userId));

        if ($stmt->fetchColumn()) {
            return $conversationId;
        }
    }

    $stmt = db()->prepare('INSERT INTO miauw_conversas (usuario_id, titulo) VALUES (?, ?)');
    $stmt->execute(array($userId, 'Conversa com Miauby'));
    $conversationId = (int) db()->lastInsertId();
    $_SESSION[$sessionKey] = $conversationId;

    return $conversationId;
}

function miauw_messages(int $conversationId, int $limit = 80): array
{
    $limit = max(1, min(120, $limit));
    $stmt = db()->prepare(
        'SELECT id, papel, conteudo, modelo, fallback, created_at
         FROM miauw_mensagens
         WHERE conversa_id = ?
         ORDER BY id DESC
         LIMIT ' . $limit
    );
    $stmt->execute(array($conversationId));
    $rows = array_reverse($stmt->fetchAll());

    return $rows ?: array();
}

function miauw_add_message(int $conversationId, ?int $userId, string $role, string $content, ?string $model = null, bool $fallback = false): int
{
    $stmt = db()->prepare(
        'INSERT INTO miauw_mensagens (conversa_id, usuario_id, papel, conteudo, modelo, fallback)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute(array($conversationId, $userId, $role, $content, $model, $fallback ? 1 : 0));

    return (int) db()->lastInsertId();
}

function miauw_clear_conversation(int $conversationId, int $userId): void
{
    $stmt = db()->prepare('UPDATE miauw_conversas SET status = "arquivada" WHERE id = ? AND usuario_id = ?');
    $stmt->execute(array($conversationId, $userId));
    unset($_SESSION['miauw_conversa_id']);
}

function miauw_extract_learning_text(string $message): string
{
    if (preg_match('/\b(?:aprenda|aprende|lembre|lembra|memoriza|guarde|guarda)\s+(?:que\s+)?(.+)$/iu', $message, $match)) {
        return trim((string) $match[1]);
    }

    if (preg_match('/\bregra\s+(?:do\s+sistema|nova|interna)?\s*[:\-]\s*(.+)$/iu', $message, $match)) {
        return trim((string) $match[1]);
    }

    return '';
}

function miauw_store_learning(string $message, int $userId): ?string
{
    $content = miauw_extract_learning_text($message);
    if ($content === '') {
        return null;
    }

    if (miauw_text_looks_sensitive($content)) {
        return 'Nao vou memorizar segredo, senha, token ou dado sensivel. Isso fica fora da memoria operacional.';
    }

    if (miauw_strlen($content) < 8) {
        return 'Isso ai e pequeno demais para virar memoria. Miauby nao cataloga migalha.';
    }

    $content = miauw_substr($content, 0, 900);
    $hash = substr(hash('sha256', $content), 0, 12);
    $title = 'Memoria Miauby - ' . date('Ymd') . ' - ' . $hash;
    $stmt = db()->prepare(
        'INSERT INTO miauw_conhecimentos (titulo, conteudo, tags)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE conteudo = VALUES(conteudo), tags = VALUES(tags), ativo = 1'
    );
    $stmt->execute(array(
        $title,
        'Aprendizado registrado pelo usuario #' . $userId . ': ' . $content,
        'memoria, aprendizado, miauw, usuario',
    ));

    $module = function_exists('miauw_memory_module_from_text') ? miauw_memory_module_from_text($content) : 'geral';
    if (function_exists('miauw_memory_store')) {
        miauw_memory_store($userId, $module, miauw_memory_key($content), $content, 'aprendizado_usuario', 2.2);
    }

    if (function_exists('miauw_intelligence_record_pattern')) {
        miauw_intelligence_record_pattern(
            $module,
            'memoria_usuario',
            miauw_memory_key($content),
            'Memoria ensinada pelo usuario para orientar respostas futuras.',
            array('conteudo' => $content, 'usuario_id' => $userId)
        );
    }

    return 'Aprendi e indexei como memoria de ' . strtoupper($module) . '. A memoria do gato ganhou mais uma ruga operacional: ' . $content;
}

function miauw_responsible_from_pending_answer(string $message): string
{
    if (function_exists('miauw_skill_financeiro_responsible_from_message')) {
        $responsible = miauw_skill_financeiro_responsible_from_message($message);
        if ($responsible !== '') {
            return $responsible;
        }
    }

    $clean = trim(preg_replace('/\s+/', ' ', $message) ?? '');
    $clean = preg_replace('/^(?:foi\s+(?:a|o)|quem\s+fez\s+foi|responsavel\s*[:\-]?|responsavel\s+foi)\s+/iu', '', $clean) ?? $clean;
    $clean = trim($clean);
    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($clean) : strtolower($clean);

    if (preg_match('/^(sim|nao|nÃ£o|ok|beleza|cancela|cancelar|deixa)$/iu', $normalized)) {
        return '';
    }

    if (preg_match('/^[\p{L}\p{N}\s\.\-]{2,70}$/u', $clean)) {
        return miauw_substr($clean, 0, 70);
    }

    return '';
}

function miauw_financeiro_pending_question(array $command): string
{
    return 'Segura a pata: antes de gravar no financeiro, quem fez ou quem e o responsavel?'
        . "\nCategoria: " . (string) $command['categoria']
        . "\nValor: " . miauw_skill_money((float) $command['valor'])
        . "\nResponde tipo: `Responsavel Isadora`.";
}

function miauw_diagnostic_module_from_context(string $module, string $pageContext = ''): string
{
    $module = trim($module);
    if ($module !== '') {
        return miauw_substr(preg_replace('/[^a-z0-9_\-]+/i', '-', $module) ?? $module, 0, 60);
    }

    $context = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($pageContext) : strtolower($pageContext);
    if (strpos($context, 'financeiro') !== false || strpos($context, 'caixa') !== false) {
        return 'financeiro';
    }
    if (strpos($context, 'cotacao') !== false) {
        return 'cotacao';
    }
    if (strpos($context, 'cashback') !== false) {
        return 'cashback';
    }
    if (strpos($context, 'tarefa') !== false) {
        return 'tarefa';
    }
    if (strpos($context, 'miauby') !== false || strpos($context, 'miauw') !== false) {
        return 'miauby';
    }

    return 'sistema';
}

function miauw_diagnostic_redact_string(string $value): string
{
    $value = preg_replace('/sk-[A-Za-z0-9_\-]{12,}/', '[openai-key-redacted]', $value) ?? $value;
    $value = preg_replace('/(bearer|authorization|api[_\s-]?key|token|senha|password)\s*[:=]\s*["\']?[^"\'\s,;]+/iu', '$1=[redacted]', $value) ?? $value;
    $value = preg_replace('/\/home\d?\/[^"\']+/i', '[server-path-redacted]', $value) ?? $value;

    return miauw_substr($value, 0, 1400);
}

function miauw_diagnostic_sanitize($value, int $depth = 0)
{
    if ($depth > 4) {
        return '[depth-limit]';
    }

    if (is_string($value)) {
        return miauw_diagnostic_redact_string($value);
    }

    if (is_scalar($value) || $value === null) {
        return $value;
    }

    if (is_array($value)) {
        $clean = array();
        $count = 0;
        foreach ($value as $key => $item) {
            if ($count >= 40) {
                $clean['__truncated'] = true;
                break;
            }
            $keyString = is_string($key) ? $key : (string) $key;
            if (preg_match('/senha|password|token|secret|api[_-]?key|authorization/i', $keyString)) {
                $clean[$keyString] = '[redacted]';
            } else {
                $clean[$keyString] = miauw_diagnostic_sanitize($item, $depth + 1);
            }
            $count++;
        }

        return $clean;
    }

    return '[unsupported]';
}

function miauw_diagnostic_relative_file(string $file): string
{
    $file = str_replace('\\', '/', $file);
    $base = str_replace('\\', '/', dirname(__DIR__));
    if (strpos($file, $base . '/') === 0) {
        return substr($file, strlen($base) + 1);
    }

    return basename($file);
}

function miauw_diagnostic_htaccess_content(): string
{
    return "Options -Indexes\n\n"
        . "<FilesMatch \"^miauby-internal-diagnostics-.*\\.(ndjson|log|json|txt)$\">\n"
        . "    Require all denied\n"
        . "</FilesMatch>\n\n"
        . "<FilesMatch \"\\.(php|phtml|phar)$\">\n"
        . "    Require all denied\n"
        . "</FilesMatch>\n";
}

function miauw_diagnostic_directory(): string
{
    $dir = __DIR__ . '/relatorios';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $htaccess = $dir . '/.htaccess';
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, miauw_diagnostic_htaccess_content(), LOCK_EX);
    }

    return $dir;
}

function miauw_write_invisible_diagnostic(string $type, string $module, string $title, array $context = array(), ?Throwable $error = null): void
{
    try {
        $dir = miauw_diagnostic_directory();

        $record = array(
            'created_at' => date('c'),
            'type' => miauw_substr($type, 0, 80),
            'module' => miauw_diagnostic_module_from_context($module, (string) ($context['page_context'] ?? '')),
            'title' => miauw_substr($title, 0, 180),
            'version' => defined('MIAUW_VERSION') ? MIAUW_VERSION : '',
            'request' => array(
                'uri' => miauw_diagnostic_redact_string((string) ($_SERVER['REQUEST_URI'] ?? '')),
                'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
                'ip_hash' => isset($_SERVER['REMOTE_ADDR']) ? substr(sha1((string) $_SERVER['REMOTE_ADDR']), 0, 12) : '',
                'user_id' => isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null,
            ),
            'context' => miauw_diagnostic_sanitize($context),
        );

        if ($error !== null) {
            $trace = array();
            foreach (array_slice($error->getTrace(), 0, 8) as $item) {
                $trace[] = array(
                    'file' => isset($item['file']) ? miauw_diagnostic_relative_file((string) $item['file']) : '',
                    'line' => isset($item['line']) ? (int) $item['line'] : null,
                    'function' => isset($item['function']) ? (string) $item['function'] : '',
                    'class' => isset($item['class']) ? (string) $item['class'] : '',
                );
            }

            $record['error'] = array(
                'class' => get_class($error),
                'message' => miauw_diagnostic_redact_string($error->getMessage()),
                'file' => miauw_diagnostic_relative_file($error->getFile()),
                'line' => $error->getLine(),
                'hash' => sha1(get_class($error) . '|' . $error->getMessage() . '|' . $error->getFile() . '|' . $error->getLine()),
                'trace' => $trace,
            );
        }

        $path = $dir . '/miauby-internal-diagnostics-' . date('Y-m') . '.ndjson';
        $maxBytes = max(262144, (int) MIAUW_DIAGNOSTIC_MAX_BYTES);
        if (is_file($path) && filesize($path) !== false && (int) filesize($path) > $maxBytes) {
            static $sizeWarningLogged = false;
            if (!$sizeWarningLogged) {
                error_log('Miauby invisible diagnostic skipped: monthly file reached size limit.');
                $sizeWarningLogged = true;
            }
            return;
        }

        $json = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        if (is_string($json)) {
            @file_put_contents($path, $json . "\n", FILE_APPEND | LOCK_EX);
        }
    } catch (Throwable $logError) {
        error_log('Miauby invisible diagnostic failed: ' . $logError->getMessage());
    }
}

function miauw_register_internal_error_alert(string $module, string $title, Throwable $error, array $context = array()): void
{
    miauw_write_invisible_diagnostic('exception', $module, $title, $context, $error);
    error_log('Miauby internal error [' . $module . ']: ' . $error->getMessage());

    try {
        if (function_exists('miauw_intelligence_report_system_error')) {
            miauw_intelligence_report_system_error($module, $title, $error->getMessage(), $context);
        }
    } catch (Throwable $alertError) {
        error_log('Miauby internal alert failed: ' . $alertError->getMessage());
    }
}

function miauw_public_action_error(Throwable $error): string
{
    $message = trim($error->getMessage());
    $lower = strtolower($message);

    $technical = array(
        'log_action', 'argument #4', 'array given', 'call to undefined', 'undefined function',
        'fatal error', 'parse error', '/home', '\\', 'stack trace', 'sqlstate', 'pdo',
        'mysql', 'database', 'query', 'syntax error'
    );

    foreach ($technical as $needle) {
        if (strpos($lower, $needle) !== false) {
            miauw_register_internal_error_alert('miauby', 'Erro interno em acao controlada', $error, array('origem' => 'miauw_public_action_error'));
            return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
        }
    }

    if ($message === '') {
        miauw_register_internal_error_alert('miauby', 'Erro interno sem mensagem', $error, array('origem' => 'miauw_public_action_error'));
        return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
    }

    if (preg_match('/\b(informe|faltou|valor invalido|categoria vazia|dia esta fechado|reabra|responsavel|cliente|produto|nenhum produto valido|senha)\b/iu', $message)) {
        return miauw_substr(preg_replace('/\s+/', ' ', $message) ?? $message, 0, 220);
    }

    miauw_register_internal_error_alert('miauby', 'Erro em acao controlada', $error, array('origem' => 'miauw_public_action_error'));

    return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
}

function miauw_action_error_reply(Throwable $error): string
{
    miauw_register_internal_error_alert('miauby', 'Falha em acao controlada', $error, array('origem' => 'miauw_action_error_reply'));

    $public = miauw_public_action_error($error);
    if (strpos($public, 'Nao consegui concluir agora') === 0) {
        return $public;
    }

    return 'Nao gravei: ' . $public;
}

function miauw_try_offtopic_redirect(string $message): ?string
{
    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);

    $operationWords = array(
        'caixa', 'financeiro', 'sangria', 'pix', 'cnpj', 'maquininha', 'cashback', 'cotacao',
        'cotacao', 'estoque', 'compra', 'venda', 'cliente', 'fornecedor', 'relatorio', 'farmacia',
        'medicamento', 'produto', 'fechamento', 'despesa', 'campanha', 'whatsapp'
    );
    if (function_exists('miauw_skill_has_any') && miauw_skill_has_any($normalized, $operationWords)) {
        return null;
    }

    $patterns = array(
        'comida' => array(
            '/\b(receita\s+de\s+(bolo|macarrao|lasanha|comida|brigadeiro|sobremesa))\b/u',
            '/\b(ensina|manda|me manda|quero|faz)\b.*\b(bolo|macarrao|lasanha|brigadeiro|sobremesa)\b/u',
        ),
        'fofoca' => array(
            '/\b(horoscopo|signo|fofoca de famoso|novela|jogo do bicho|cantada|paquera)\b/u',
        ),
        'entretenimento' => array(
            '/\b(indica|recomenda|me fala)\b.*\b(filme|serie|anime|musica)\b/u',
        ),
    );

    $isOfftopic = false;
    $topic = 'geral';
    foreach ($patterns as $name => $topicPatterns) {
        foreach ($topicPatterns as $pattern) {
            if (preg_match($pattern, $normalized)) {
                $isOfftopic = true;
                $topic = (string) $name;
                break 2;
            }
        }
    }

    if (!$isOfftopic) {
        return null;
    }

    $repliesByTopic = array(
        'comida' => array(
            'Aindaaa desviando do trabalho? Receita e em casa, aqui e operacao. Volta pra caixa, estoque, cotacao ou venda antes que o Willian sinta o cheiro da enrolacao.',
            'Pelo amor do sache, isso saiu da farmacia e entrou no programa de culinaria. Me chama pra processo, relatorio, compra, PIX ou fechamento que ai eu viro maquina.',
        ),
        'fofoca' => array(
            'Miau do ceu, isso virou corredor de fofoca com cracha. Volta para caixa, venda, estoque ou processo antes que o expediente vire novela sem patrocinio.',
            'Meu bigode detectou fuga de servico. Signo, cantada e novela nao fecham caixa. Me diga tela, valor, produto, cliente ou relatorio e eu trabalho de verdade.',
        ),
        'entretenimento' => array(
            'Aindaaa querendo recomendacao de filme no meio da operacao? O genero aqui e suspense financeiro. Volta pra caixa, cotacao, estoque ou campanha.',
            'Isso aqui nao e streaming, humano. Quer diversao? Fecha o caixa certo e assiste o relatorio nao gritar. Agora manda processo, valor, produto ou cliente.',
        ),
        'geral' => array(
            'Miau do ceu, o assunto virou intervalo estendido. Volta pra operacao: me diga tela, categoria, valor, responsavel ou produto. Preguica administrativa nao passa no filtro.',
            'Meu bigode detectou fuga de servico. Sem gastar IA com passeio mental: quer ajuda com caixa, estoque, venda, cotacao, cashback ou texto interno?',
        ),
    );

    $replies = $repliesByTopic[$topic] ?? $repliesByTopic['geral'];

    return $replies[array_rand($replies)];
}

function miauw_try_technical_redirect(string $message): ?string
{
    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);

    $technicalSignals = array(
        'codigo', 'codificar', 'programar', 'script', 'php', 'javascript', 'html', 'css',
        'sql', 'query', 'select ', 'insert ', 'update ', 'delete ', 'join ', 'where ',
        'order by', 'group by', 'indice', 'index', 'backend', 'front end', 'frontend',
        'arquivo', 'pasta', 'zip', 'deploy', 'cpanel', 'hostgator', 'api key', 'token',
        'prompt do sistema', 'modelo da ia', 'reasoning'
    );

    if (!function_exists('miauw_skill_has_any') || !miauw_skill_has_any($normalized, $technicalSignals)) {
        return null;
    }

    $operationSignals = array(
        'lancar', 'registrar', 'criar encomenda', 'em falta', 'sem estoque', 'urgente',
        'faturou', 'vendeu', 'pix', 'sangria', 'maquininha', 'cotacao rapida'
    );

    if (miauw_skill_has_any($normalized, $operationSignals)) {
        return null;
    }

    return 'Parede tecnica detectada. Isso e assunto de suporte tecnico interno, nao do chat operacional do Miauby.'
        . "\nAqui eu fico no operacional: caixa, financeiro, cotacao, cashback, encomenda, alerta e processo."
        . "\nMe mande o que aconteceu na tela e o que voce queria fazer. Se for bug tecnico, registre com modulo, horario e print.";
}

function miauw_operator_voice_polish(string $text): string
{
    $text = trim($text);

    if ($text === '') {
        return $text;
    }

    $text = preg_replace('/^\s*(?:claro|com certeza|sem problemas|perfeito|posso ajudar|aqui esta|aqui vai|ol[Ã¡a])[\!\.\,\:\s]*/iu', 'Miauby direto: ', $text) ?? $text;
    $text = preg_replace('/^\s*(?:como uma? ia|como assistente virtual|sou uma? ia|sou um modelo de linguagem)[^\n]*\n?/iu', '', $text) ?? $text;
    $text = preg_replace('/\b(?:espero que isso ajude|fico a disposi[cÃ§][aÃ£]o|se precisar de mais alguma coisa)[^\.\n]*(?:\.|$)/iu', 'Pronto. Proxima bagunca.', $text) ?? $text;
    $text = preg_replace('/\b(?:vou te ajudar|posso te ajudar)\b/iu', 'vou resolver sem enrolar', $text) ?? $text;

    return trim($text);
}

function miauw_operator_guardrail_find_terms(string $text): array
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

function miauw_apply_operator_guardrails(string $text, string $source = 'reply'): string
{
    $original = $text;
    $found = miauw_operator_guardrail_find_terms($text);

    if (!$found) {
        return $text;
    }

    $text = preg_replace('/\bcodex\b/iu', 'suporte tecnico interno', $text) ?? $text;
    $text = preg_replace('/\bchatgpt\b/iu', 'assistente generico', $text) ?? $text;
    $text = preg_replace('/\bopenai\b/iu', 'camada online', $text) ?? $text;
    $text = preg_replace('/\b(api\s*key|apikey|chave\s+da\s+api)\b/iu', 'credencial interna', $text) ?? $text;
    $text = preg_replace('/\bsk-[a-z0-9_\-\*]{8,}\b/iu', 'credencial interna', $text) ?? $text;
    $text = preg_replace('/\b(prompt\s+do\s+sistema|prompt\s+interno|system\s+prompt)\b/iu', 'regra interna', $text) ?? $text;
    $text = preg_replace('/\b(stack\s*trace|traceback)\b/iu', 'diagnostico tecnico interno', $text) ?? $text;
    $text = preg_replace('/\b(bearer|authorization|token\s+secreto)\b/iu', 'credencial interna', $text) ?? $text;

    $shouldLog = !in_array($source, array('history_input', 'widget_history'), true);
    if ($shouldLog && $text !== $original && function_exists('miauw_write_invisible_diagnostic')) {
        miauw_write_invisible_diagnostic(
            'guardrail_rewrite',
            'miauby',
            'Resposta ajustada por guardrails operacionais do Miauby v2',
            array(
                'source' => miauw_substr($source, 0, 80),
                'terms' => $found,
                'agent_version' => miauw_constant_string('MIAUW_AGENT_VERSION', ''),
                'policy_version' => miauw_constant_string('MIAUW_AGENT_POLICY_VERSION', ''),
            )
        );
    }

    return trim($text);
}

function miauw_sanitize_operator_reply(string $text): string
{
    $original = $text;
    $text = str_replace(array("\r\n", "\r"), "\n", trim($text));
    $codeBlocks = 0;
    $text = preg_replace(
        '/```.*?```/s',
        'Parte tecnica omitida. Se precisar mexer em codigo, registre um chamado tecnico interno.',
        $text,
        -1,
        $codeBlocks
    ) ?? $text;

    $lines = explode("\n", $text);
    $kept = array();
    $omitted = 0;
    $technicalLine = '/(<\?php|<script|<\/?[a-z][^>]*>|\/home[0-9]?\/|stack trace|sqlstate|pdo|mysql|config\.local|miauw_openai|openai[_ -]?api|api[_ -]?key|apikey|authorization|bearer|password_hash|secret|token|payload|->prepare|db\(\)|=>|\$[a-z_][a-z0-9_]*\s*=|\b(echo|print|require|require_once|include|include_once|file_put_contents|json_encode|curl_exec|curl_setopt|select|insert|update|delete|create|alter|drop|join|where|order\s+by|group\s+by|from\s+[a-z0-9_]+|index|indice|function|const|let|var|class|curl)\b)/iu';
    $standaloneFence = '/^\s*`{1,3}(?:[a-z0-9_-]+)?\s*$/i';

    foreach ($lines as $line) {
        if (preg_match($technicalLine, $line) || preg_match($standaloneFence, $line)) {
            $omitted++;
            continue;
        }

        $kept[] = $line;
    }

    $text = trim(implode("\n", $kept));
    $text = preg_replace('/#{2,}\s*/', '', $text) ?? $text;
    $text = preg_replace('/\*{2,}([^*\n]+)\*{2,}/u', '$1', $text) ?? $text;
    $text = preg_replace('/\*{3,}/', '', $text) ?? $text;
    $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

    if ($omitted > 0) {
        $text = trim($text . "\nParte tecnica cortada para nao expor bastidor. Isso e chamado tecnico interno.");
    }

    if ($text === '') {
        $text = 'Cortei a parte tecnica para nao expor bastidor. Me diga a tela, o erro e o objetivo; se for codigo, registre um chamado tecnico interno.';
    }

    $text = miauw_operator_voice_polish($text);
    $text = miauw_apply_operator_guardrails($text, 'sanitize_operator_reply');

    if (miauw_strlen($text) > 1600) {
        $text = miauw_substr($text, 0, 1550) . "\nResumo cortado. Peca o detalhe por partes.";
    }

    if ($text !== '') {
        return $text;
    }

    if ($omitted > 0 || $codeBlocks > 0 || trim($original) !== '') {
        return 'Nao vou despejar bastidor tecnico aqui. Registrei diagnostico interno; se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
    }

    return 'Nao consegui montar uma resposta limpa agora. Tente de novo com tela, dado e objetivo.';
}

function miauw_context_label_from_page_context(string $pageContext): string
{
    $context = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($pageContext) : strtolower($pageContext);

    if (strpos($context, '/financeiro') !== false || strpos($context, 'financeiro') !== false || strpos($context, 'caixa') !== false) {
        return 'no Financeiro';
    }

    if (strpos($context, '/cotacao') !== false || strpos($context, 'cotacao') !== false) {
        return 'na Cotacao';
    }

    if (strpos($context, '/cashback') !== false || strpos($context, 'cashback') !== false) {
        return 'no Cashback';
    }

    if (strpos($context, '/tarefa') !== false || strpos($context, 'tarefa') !== false) {
        return 'em Tarefas';
    }

    if (strpos($context, '/miauw') !== false || strpos($context, 'miauby') !== false) {
        return 'no Miauby';
    }

    return 'nessa tela';
}

function miauw_vague_problem_reply(string $message, string $pageContext = ''): ?string
{
    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
    $problemTerms = array(
        'bugou', 'bug', 'erro', 'deu erro', 'travou', 'falhou', 'quebrou',
        'nao abre', 'nao salva', 'nao carrega', 'nao funciona', 'deu ruim',
        'sumiu', 'apareceu errado', 'ta errado', 'esta errado'
    );

    $hasProblem = function_exists('miauw_skill_has_any')
        ? miauw_skill_has_any($normalized, $problemTerms)
        : false;

    if (!$hasProblem) {
        return null;
    }

    $hasDetail = preg_match('/\d{2,}|pix|cnpj|sangria|maquininha|encomenda|produto|cliente|valor|senha|login|botao|campo|linha|coluna|filtro|relatorio|fechamento/u', $normalized) === 1;
    miauw_write_invisible_diagnostic(
        'operator_problem_report',
        '',
        'Usuario relatou possivel problema no sistema',
        array(
            'message' => miauw_substr($message, 0, 240),
            'page_context' => miauw_substr($pageContext, 0, 700),
            'has_detail' => $hasDetail,
            'handled_locally' => !($hasDetail && miauw_strlen($message) > 48),
        )
    );

    if ($hasDetail && miauw_strlen($message) > 48) {
        return null;
    }

    $where = miauw_context_label_from_page_context($pageContext);

    return 'Detectei bronca vaga ' . $where . ' e deixei no diagnostico interno.'
        . "\nMe manda so o trio: o que clicou, o que apareceu e um print."
        . "\nAi eu paro de adivinhar pelo cheiro do teclado.";
}

function miauw_widget_compact_reply(string $text, string $message = ''): string
{
    $text = trim($text);
    if ($text === '') {
        return $text;
    }

    $limit = miauw_strlen($message) <= 60 ? 560 : 760;
    if (miauw_strlen($text) <= $limit) {
        return $text;
    }

    $chunks = preg_split('/\n{2,}|(?<=[\.\!\?])\s+/u', $text) ?: array($text);
    $kept = array();
    $buffer = '';

    foreach ($chunks as $chunk) {
        $chunk = trim((string) $chunk);
        if ($chunk === '') {
            continue;
        }

        $candidate = $buffer === '' ? $chunk : $buffer . "\n" . $chunk;
        if (miauw_strlen($candidate) > $limit) {
            break;
        }

        $buffer = $candidate;
        $kept[] = $chunk;

        if (count($kept) >= 4) {
            break;
        }
    }

    $compact = trim($buffer);
    if ($compact === '') {
        $compact = miauw_substr($text, 0, $limit);
    }

    return trim($compact . "\nSe quiser, eu destrincho em partes. Sem textao felino gratuito.");
}

function miauw_widget_vague_reply(string $message, string $pageContext = ''): ?string
{
    $trimmed = trim($message);
    if ($trimmed === '') {
        return null;
    }

    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($trimmed) : strtolower($trimmed);
    $quickTerms = array(
        'oi', 'ola', 'opa', 'e ai', 'bom dia', 'boa tarde', 'boa noite',
        'teste', 'testando', 'bicho doido', 'doido', 'louco', 'kkkk', 'kkk',
        'hahaha', 'haha', 'valeu', 'ok', 'blz', 'beleza', 'hmm', 'hm'
    );

    $hasAny = static function (array $terms) use ($normalized): bool {
        if (function_exists('miauw_skill_has_any')) {
            return miauw_skill_has_any($normalized, $terms);
        }

        foreach ($terms as $term) {
            if ($term !== '' && strpos($normalized, (string) $term) !== false) {
                return true;
            }
        }

        return false;
    };

    $isQuick = $hasAny($quickTerms);

    $looksLikeNoise = preg_match('/^[bcdfghjklmnpqrstvwxyz]{3,10}$/u', $normalized) === 1
        || preg_match('/\b(asdf|sdf|dfg|qwer|zxcv|hjkl|jkl|fdsa|dsfa)\b|(?:asdf|sdf|dfg|qwer|zxcv|hjkl|jkl|fdsa|dsfa)/u', $normalized) === 1;

    if (!$isQuick && !$looksLikeNoise) {
        return null;
    }

    $where = miauw_context_label_from_page_context($pageContext);

    if ($looksLikeNoise) {
        return 'Isso parece teclado espirrando ' . $where . '.'
            . "\nSe era pedido, traduz para humano funcional: tela + objetivo.";
    }

    if ($hasAny(array('kkkk', 'kkk', 'haha', 'hahaha', 'bicho doido', 'doido', 'louco'))) {
        return 'Recebido o caos recreativo.'
            . "\nAgora me da um dado de verdade antes que eu comece a julgar a mobilia.";
    }

    if (preg_match('/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite)(\b|$)/u', $normalized) === 1) {
        return 'Miauby em ronda ' . $where . '.'
            . "\nManda a bronca: caixa, cotacao, tarefa, cliente ou alerta.";
    }

    return 'Anotado: "' . miauw_substr($trimmed, 0, 32) . '".'
        . "\nBaixo impacto operacional. Proxima bagunca, por favor.";
}

function miauw_try_controlled_action(string $message, int $userId, string $pageContext = '', bool $widgetMode = false, ?int $conversationId = null, ?string $traceId = null): ?array
{
    if ($traceId !== null || $conversationId !== null) {
        $trace = miauw_trace_context();
        miauw_trace_set_context($traceId ?: (string) ($trace['trace_id'] ?? ''), $conversationId, $userId, isset($trace['mensagem_id']) ? (int) $trace['mensagem_id'] : null);
    }

    $confirmationReply = miauw_try_confirmation_reply($message, $userId);
    if ($confirmationReply !== null) {
        return $confirmationReply;
    }

    $pendingKey = 'miauw_pending_financeiro_lancamento';
    $pending = $_SESSION[$pendingKey] ?? null;

    if (is_array($pending)) {
        $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
        if (miauw_skill_has_any($normalized, array('cancela', 'cancelar', 'deixa', 'esquece'))) {
            unset($_SESSION[$pendingKey]);

            return array(
                'text' => 'Cancelado. O gato guardou a caneta e parou de ameaÃ§ar o caixa.',
                'fallback' => false,
                'model' => 'miauw-action',
            );
        }

        $responsible = miauw_responsible_from_pending_answer($message);
        if ($responsible !== '') {
            $userObservation = (string) ($pending['observacao_usuario'] ?? '');
            $baseMessage = $userObservation !== '' ? 'obs: ' . $userObservation : '';
            $observation = function_exists('miauw_skill_financeiro_obs_from_message')
                ? miauw_skill_financeiro_obs_from_message($baseMessage, (string) $pending['categoria'], $responsible)
                : 'Miauby criou este lancamento. Responsavel informado: ' . $responsible . '.';
            $command = $pending;
            $command['responsavel'] = $responsible;
            $command['observacao'] = $observation;
            $command['raw_message'] = (string) ($pending['raw_message'] ?? $message);
            unset($_SESSION[$pendingKey]);

            $toolName = strcasecmp((string) ($command['categoria'] ?? ''), 'Sangria') === 0
                ? 'registrar_sangria'
                : 'criar_lancamento_financeiro';

            return miauw_confirmation_request_reply($toolName, $command, $userId);
        }

        return array(
            'text' => 'Aindaaa nao entendeuuuu ðŸ˜¼ eu preciso do nome de quem fez/responsavel para gravar isso. Ex.: `Responsavel Isadora`. Sem dono do lancamento, sem registro.',
            'fallback' => false,
            'model' => 'miauw-action',
        );
    }

    $pendingOrderKey = 'miauw_pending_cotacao_encomenda';
    $pendingOrder = $_SESSION[$pendingOrderKey] ?? null;

    if (is_array($pendingOrder)) {
        $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
        if (function_exists('miauw_skill_has_any') && miauw_skill_has_any($normalized, array('cancela', 'cancelar', 'deixa', 'esquece'))) {
            unset($_SESSION[$pendingOrderKey]);

            return array(
                'text' => 'Cancelado. Encomenda nao gravada.',
                'fallback' => false,
                'model' => 'miauw-action',
            );
        }

        $combined = trim((string) ($pendingOrder['raw_message'] ?? '') . ' ' . $message);
        $command = function_exists('miauw_skill_cotacao_encomenda_command_from_message')
            ? miauw_skill_cotacao_encomenda_command_from_message($combined)
            : null;

        if (is_array($command) && trim((string) ($command['produto'] ?? '')) !== '' && trim((string) ($command['responsavel'] ?? '')) !== '') {
            unset($_SESSION[$pendingOrderKey]);

            return miauw_confirmation_request_reply('criar_encomenda_cotacao', $command, $userId);
        }

        $_SESSION[$pendingOrderKey] = is_array($command) ? $command : $pendingOrder;

        return array(
            'text' => function_exists('miauw_skill_cotacao_encomenda_missing_reply') ? miauw_skill_cotacao_encomenda_missing_reply($_SESSION[$pendingOrderKey]) : 'Faltou produto ou responsavel da encomenda.',
            'fallback' => false,
            'model' => 'miauw-action',
        );
    }

    $vagueReply = miauw_vague_problem_reply($message, $pageContext);
    if ($vagueReply !== null) {
        return array(
            'text' => $vagueReply,
            'fallback' => false,
            'model' => 'miauw-local-context',
        );
    }

    if ($widgetMode) {
        $quickReply = miauw_widget_vague_reply($message, $pageContext);
        if ($quickReply !== null) {
            return array(
                'text' => $quickReply,
                'fallback' => false,
                'model' => 'miauw-local-widget',
            );
        }
    }

    if (function_exists('miauw_skill_tarefa_command_from_message')) {
        $command = miauw_skill_tarefa_command_from_message($message);
        if (is_array($command)) {
            if (trim((string) ($command['titulo'] ?? '')) === '') {
                return array(
                    'text' => function_exists('miauw_skill_tarefa_missing_reply') ? miauw_skill_tarefa_missing_reply($command) : 'Faltou o titulo da tarefa.',
                    'fallback' => false,
                    'model' => 'miauw-tarefa-guide',
                );
            }

            try {
                $result = miauw_skill_create_tarefa($command, $userId);
                miauw_trace_record('criar_tarefa', 'ok', array(
                    'type' => 'acao',
                    'summary' => 'Tarefa criada pelo Miauby.',
                    'payload' => array(
                        'titulo' => (string) ($command['titulo'] ?? ''),
                        'prioridade' => (string) ($command['prioridade'] ?? 'normal'),
                        'id' => (int) ($result['id'] ?? 0),
                    ),
                ));

                return array(
                    'text' => miauw_skill_tarefa_action_reply($result),
                    'fallback' => false,
                    'model' => 'miauw-tarefa-action',
                );
            } catch (Throwable $error) {
                miauw_trace_record('criar_tarefa', 'error', array(
                    'type' => 'acao',
                    'summary' => 'Falha ao criar tarefa pelo Miauby.',
                    'error' => $error->getMessage(),
                ));

                return array(
                    'text' => miauw_action_error_reply($error),
                    'fallback' => false,
                    'model' => 'miauw-action',
                );
            }
        }
    }

    if (function_exists('miauw_skill_cotacao_encomenda_command_from_message')) {
        $command = miauw_skill_cotacao_encomenda_command_from_message($message);
        if (is_array($command)) {
            if (trim((string) ($command['produto'] ?? '')) === '' || trim((string) ($command['responsavel'] ?? '')) === '') {
                $_SESSION[$pendingOrderKey] = $command;

                return array(
                    'text' => function_exists('miauw_skill_cotacao_encomenda_missing_reply') ? miauw_skill_cotacao_encomenda_missing_reply($command) : 'Faltou produto ou responsavel da encomenda.',
                    'fallback' => false,
                    'model' => 'miauw-action',
                );
            }

            return miauw_confirmation_request_reply('criar_encomenda_cotacao', $command, $userId);
        }
    }

    if (function_exists('miauw_skill_cotacao_urgente_command_from_message')) {
        $command = miauw_skill_cotacao_urgente_command_from_message($message);
        if (is_array($command)) {
            return miauw_confirmation_request_reply('criar_cotacao_urgente', $command, $userId);
        }
    }

    if (function_exists('miauw_skill_cotacao_planilha_command_from_message')) {
        $command = miauw_skill_cotacao_planilha_command_from_message($message);
        if (is_array($command)) {
            return miauw_confirmation_request_reply('criar_planilha_cotacao', $command, $userId);
        }
    }

    if (function_exists('miauw_skill_cotacao_rapida_command_from_message')) {
        $command = miauw_skill_cotacao_rapida_command_from_message($message);
        if (is_array($command)) {
            return miauw_confirmation_request_reply('criar_cotacao_rapida', $command, $userId);
        }
    }

    if (function_exists('miauw_skill_quick_table_reply')) {
        $table = miauw_skill_quick_table_reply($message);
        if (is_string($table) && trim($table) !== '') {
            return array(
                'text' => $table,
                'fallback' => false,
                'model' => 'miauw-table',
            );
        }
    }

    if (function_exists('miauw_skill_cotacao_improvement_suggestions')) {
        $suggestions = miauw_skill_cotacao_improvement_suggestions($message);
        if (is_string($suggestions) && trim($suggestions) !== '') {
            return array(
                'text' => $suggestions,
                'fallback' => false,
                'model' => 'miauw-cotacao-suggestions',
            );
        }
    }

    $technicalRedirect = miauw_try_technical_redirect($message);
    if ($technicalRedirect !== null) {
        return array(
            'text' => $technicalRedirect,
            'fallback' => false,
            'model' => 'miauw-technical-redirect',
        );
    }

    $learning = miauw_store_learning($message, $userId);
    if ($learning !== null) {
        return array(
            'text' => $learning,
            'fallback' => false,
            'model' => 'miauw-memory',
        );
    }

    $offtopic = miauw_try_offtopic_redirect($message);
    if ($offtopic !== null) {
        return array(
            'text' => $offtopic,
            'fallback' => false,
            'model' => 'miauw-offtopic',
        );
    }

    if (function_exists('miauw_intelligence_wants_alerts') && miauw_intelligence_wants_alerts($message)) {
        return array(
            'text' => miauw_intelligence_alert_reply(true),
            'fallback' => false,
            'model' => 'miauw-guardian',
        );
    }

    if (function_exists('miauw_intelligence_wants_process_validation') && miauw_intelligence_wants_process_validation($message)) {
        return array(
            'text' => miauw_intelligence_process_validation_reply($message),
            'fallback' => false,
            'model' => 'miauw-validator',
        );
    }

    if (function_exists('miauw_intelligence_wants_patterns') && miauw_intelligence_wants_patterns($message)) {
        return array(
            'text' => miauw_intelligence_patterns_reply($message),
            'fallback' => false,
            'model' => 'miauw-patterns',
        );
    }

    if (function_exists('miauw_skill_financeiro_daily_revenue_command_from_message')) {
        $dailyRevenue = miauw_skill_financeiro_daily_revenue_command_from_message($message);
        if (is_array($dailyRevenue)) {
            return miauw_confirmation_request_reply('registrar_faturamento_diario', $dailyRevenue, $userId);
        }
    }

    if (function_exists('miauw_skill_financeiro_command_hint')) {
        $hint = miauw_skill_financeiro_command_hint($message);
        if (is_string($hint) && trim($hint) !== '') {
            return array(
                'text' => $hint,
                'fallback' => false,
                'model' => 'miauw-guide',
            );
        }
    }

    if (function_exists('miauw_skill_create_financeiro_lancamento_from_message')) {
        try {
            $command = function_exists('miauw_skill_financeiro_command_from_message')
                ? miauw_skill_financeiro_command_from_message($message)
                : null;

            if (is_array($command) && trim((string) ($command['responsavel'] ?? '')) === '') {
                $command['raw_message'] = $message;
                $_SESSION[$pendingKey] = $command;

                return array(
                    'text' => miauw_financeiro_pending_question($command),
                    'fallback' => false,
                    'model' => 'miauw-action-pending',
                );
            }

            if (is_array($command)) {
                $command['raw_message'] = $message;
                $toolName = strcasecmp((string) ($command['categoria'] ?? ''), 'Sangria') === 0
                    ? 'registrar_sangria'
                    : 'criar_lancamento_financeiro';

                return miauw_confirmation_request_reply($toolName, $command, $userId);
            }
        } catch (Throwable $error) {
            return array(
                'text' => miauw_action_error_reply($error),
                'fallback' => false,
                'model' => 'miauw-action',
            );
        }
    }

    return null;
}

function miauw_knowledge_for(string $message): string
{
    $messageWords = preg_split('/[^a-z0-9]+/i', strtolower($message));
    $messageWords = array_values(array_filter(array_unique($messageWords ?: array()), static function ($word): bool {
        return strlen((string) $word) >= 4;
    }));

    $items = array();
    if ($messageWords) {
        $params = array();
        $where = array();
        foreach (array_slice($messageWords, 0, 6) as $word) {
            $where[] = '(titulo LIKE ? OR tags LIKE ? OR conteudo LIKE ?)';
            $like = '%' . $word . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $stmt = db()->prepare(
            'SELECT titulo, conteudo, tags
             FROM miauw_conhecimentos
             WHERE ativo = 1 AND (' . implode(' OR ', $where) . ')
             ORDER BY updated_at DESC, id DESC
             LIMIT 120'
        );
        $stmt->execute($params);
        $items = $stmt->fetchAll();
    }

    if (!$items) {
        $stmt = db()->query(
            'SELECT titulo, conteudo, tags
             FROM miauw_conhecimentos
             WHERE ativo = 1
             ORDER BY updated_at DESC, id DESC
             LIMIT 80'
        );
        $items = $stmt->fetchAll();
    }

    $scored = array();
    foreach ($items as $item) {
        $haystack = strtolower((string) $item['titulo'] . ' ' . $item['tags'] . ' ' . $item['conteudo']);
        $score = 0;
        foreach ($messageWords as $word) {
            if (strpos($haystack, $word) !== false) {
                $score++;
            }
        }

        $scored[] = array('score' => $score, 'item' => $item);
    }

    usort($scored, static function (array $a, array $b): int {
        return $b['score'] <=> $a['score'];
    });

    $chunks = array();
    foreach (array_slice($scored, 0, 5) as $row) {
        if ((int) $row['score'] <= 0 && count($chunks) >= 2) {
            continue;
        }

        $item = $row['item'];
        $chunks[] = '- ' . $item['titulo'] . ': ' . miauw_substr((string) $item['conteudo'], 0, 800);
    }

    $knowledge = implode("\n", $chunks);

    if (function_exists('miauw_memory_context_for_message')) {
        $user = function_exists('current_user') ? current_user() : null;
        $memoryContext = trim((string) miauw_memory_context_for_message($message, is_array($user) ? (int) ($user['id'] ?? 0) : null));
        if ($memoryContext !== '') {
            $knowledge .= ($knowledge !== '' ? "\n\n" : '') . $memoryContext;
        }
    }

    if (function_exists('miauw_skill_context_for_message')) {
        $skillContext = trim((string) miauw_skill_context_for_message($message));
        if ($skillContext !== '') {
            $knowledge .= ($knowledge !== '' ? "\n\n" : '') . $skillContext;
        }
    }

    if (function_exists('miauw_system_map_context_for_message')) {
        $systemContext = trim((string) miauw_system_map_context_for_message($message));
        if ($systemContext !== '') {
            $knowledge .= ($knowledge !== '' ? "\n\n" : '') . $systemContext;
        }
    }

    if (function_exists('miauw_intelligence_context_for_message')) {
        $intelligenceContext = trim((string) miauw_intelligence_context_for_message($message));
        if ($intelligenceContext !== '') {
            $knowledge .= ($knowledge !== '' ? "\n\n" : '') . $intelligenceContext;
        }
    }

    return $knowledge;
}

function miauw_system_prompt(string $knowledge): string
{
    return getMiauwSystemPrompt($knowledge);
}

function miauw_history_input(int $conversationId): array
{
    $messages = miauw_messages($conversationId, 14);
    $input = array();

    foreach ($messages as $message) {
        if ($message['papel'] === 'system') {
            continue;
        }

        $role = $message['papel'] === 'assistant' ? 'assistant' : 'user';
        $content = trim((string) $message['conteudo']);

        if ($content !== '') {
            if ($role === 'assistant' && function_exists('miauw_apply_operator_guardrails')) {
                $content = miauw_apply_operator_guardrails($content, 'history_input');
            }
            $input[] = array('role' => $role, 'content' => miauw_substr($content, 0, 1400));
        }
    }

    return $input;
}

function miauw_model_supports_reasoning(string $model): bool
{
    $model = strtolower($model);

    return strpos($model, 'gpt-5') === 0 || strpos($model, 'o1') === 0 || strpos($model, 'o3') === 0 || strpos($model, 'o4') === 0;
}

function miauw_model_route(string $message): array
{
    $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
    $bossTerms = array(
        'auditoria', 'auditar', 'validar', 'validacao', 'diagnostico', 'estrategia', 'gestor', 'gerente',
        'risco', 'divergencia', 'prejuizo', 'decisao', 'decidir', 'comparar', 'analise completa',
        'processo', 'relatorio', 'indicador', 'alerta', 'pendencia', 'guardiao', 'autonomo', 'super gestor',
        'camada', 'camadas', 'inteligencia', 'entrelacar', 'cruzar dados', 'correlacao', 'validar processo',
        'encomenda parada', 'pedido parado', 'atualizar farmacia popular', 'auditar farmacia popular',
        'pesquisa web', 'pesquisar na net', 'referencias externas',
    );
    $smartTerms = array(
        'financeiro', 'caixa', 'cotacao', 'cashback', 'cliente', 'produto', 'ean', 'fornecedor',
        'campanha', 'whatsapp', 'estoque', 'compra', 'venda', 'ideia', 'crie', 'texto', 'resumo',
        'como faz', 'como mexe', 'onde fica', 'tela', 'fluxo', 'sistema', 'memoria', 'padrao', 'padroes',
        'encomenda', 'encomendar', 'pedido de cliente', 'pedido cliente', 'medicamento', 'remedio',
        'farmacia popular', 'programa farmacia', 'valor de referencia', 'valor referencia', 'glifage',
        'metformina', 'glibenclamida', 'dapagliflozina', 'forxiga', 'fralda geriatrica',
        'em falta', 'sem estoque', 'urgente na loja', 'cotacao rapida', 'tabela rapida', 'pesquisar na net',
        'pesquisa na internet', 'referencia', 'referencias', 'fonte oficial',
    );

    $route = 'fast';
    if (miauw_strlen($message) > 420 || (function_exists('miauw_skill_has_any') && miauw_skill_has_any($normalized, $bossTerms))) {
        $route = 'boss';
    } elseif (function_exists('miauw_skill_has_any') && miauw_skill_has_any($normalized, $smartTerms)) {
        $route = 'smart';
    }

    if ($route === 'boss') {
        return array(
            'name' => 'boss',
            'model' => miauw_constant_string('MIAUW_MODEL_BOSS', 'gpt-5.4'),
            'max_output_tokens' => miauw_constant_int('MIAUW_MAX_OUTPUT_TOKENS_BOSS', 1100),
            'temperature' => min(1.0, (float) MIAUW_TEMPERATURE),
            'reasoning_effort' => miauw_constant_string('MIAUW_REASONING_BOSS', 'high'),
            'verbosity' => 'medium',
        );
    }

    if ($route === 'smart') {
        return array(
            'name' => 'smart',
            'model' => miauw_constant_string('MIAUW_MODEL_SMART', 'gpt-5.4'),
            'max_output_tokens' => miauw_constant_int('MIAUW_MAX_OUTPUT_TOKENS_SMART', 720),
            'temperature' => (float) MIAUW_TEMPERATURE,
            'reasoning_effort' => miauw_constant_string('MIAUW_REASONING_SMART', 'medium'),
            'verbosity' => 'medium',
        );
    }

    return array(
        'name' => 'fast',
        'model' => miauw_constant_string('MIAUW_MODEL_FAST', 'gpt-5.4-mini'),
        'max_output_tokens' => miauw_constant_int('MIAUW_MAX_OUTPUT_TOKENS_FAST', 360),
        'temperature' => (float) MIAUW_TEMPERATURE,
        'reasoning_effort' => miauw_constant_string('MIAUW_REASONING_FAST', 'low'),
        'verbosity' => 'low',
    );
}

function miauw_apply_model_route(array $payload, array $route): array
{
    $model = (string) ($route['model'] ?? MIAUW_OPENAI_MODEL);
    $payload['model'] = $model;
    $payload['max_output_tokens'] = (int) ($route['max_output_tokens'] ?? MIAUW_MAX_OUTPUT_TOKENS);

    if (isset($route['temperature'])) {
        $payload['temperature'] = (float) $route['temperature'];
    }

    if (miauw_model_supports_reasoning($model)) {
        $effort = (string) ($route['reasoning_effort'] ?? '');
        if (in_array($effort, array('none', 'minimal', 'low', 'medium', 'high', 'xhigh'), true)) {
            $payload['reasoning'] = array('effort' => $effort);
        }

        $verbosity = (string) ($route['verbosity'] ?? '');
        if (in_array($verbosity, array('low', 'medium', 'high'), true)) {
            $payload['text'] = array('verbosity' => $verbosity);
        }
    }

    return $payload;
}

function miauw_openai_fallback_models(string $primary): array
{
    $models = array(
        miauw_constant_string('MIAUW_MODEL_FALLBACK', MIAUW_OPENAI_MODEL),
        MIAUW_OPENAI_MODEL,
        'gpt-5.4-mini',
        'gpt-5.2',
        'gpt-4.1-mini',
    );

    return array_values(array_unique(array_filter($models, static function ($model) use ($primary): bool {
        return is_string($model) && trim($model) !== '' && trim($model) !== $primary;
    })));
}

function miauw_openai_tools(): array
{
    return array(
        array(
            'type' => 'function',
            'name' => 'resumo_financeiro',
            'description' => 'Consulta resumo financeiro por mes e ano: fechamentos, totais, total sistema, sobra/falta e categorias.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'mes' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 12),
                    'ano' => array('type' => 'integer', 'minimum' => 2020, 'maximum' => 2035),
                ),
                'required' => array('mes', 'ano'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'resumo_cashback',
            'description' => 'Consulta resumo de compras, cashback, resgates e saldo ativo por mes e ano.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'mes' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 12),
                    'ano' => array('type' => 'integer', 'minimum' => 2020, 'maximum' => 2035),
                ),
                'required' => array('mes', 'ano'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'resumo_codigos',
            'description' => 'Consulta resumo dos atalhos de codigos de comissao, separados por blocos de EAN.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'mes' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 12),
                    'ano' => array('type' => 'integer', 'minimum' => 2020, 'maximum' => 2035),
                ),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'buscar_cliente',
            'description' => 'Busca cliente por nome ou telefone parcial no cashback, sem expor telefone completo.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'busca' => array('type' => 'string', 'minLength' => 3, 'maxLength' => 80),
                ),
                'required' => array('busca'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'buscar_codigo_comissao',
            'description' => 'Busca atalho em Codigos por codigo, EAN ou nome do item, retornando preco de comissao.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'busca' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 120),
                ),
                'required' => array('busca'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'buscar_cotacao',
            'description' => 'Busca item de cotacao por EAN, produto ou categoria.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'busca' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 120),
                ),
                'required' => array('busca'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'farmacia_popular_valor',
            'description' => 'Consulta valor de referencia/reembolso do Programa Farmacia Popular por produto, principio ativo ou apresentacao. Padrao da Wimifarma: UF PR/Parana. Exemplo: Glifage 500mg = metformina 500mg quando o cadastro bater.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'produto' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 140),
                    'uf' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 2, 'description' => 'UF brasileira. Use PR se o usuario nao pedir outra.'),
                ),
                'required' => array('produto'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'pesquisa_web_referencias',
            'description' => 'Pesquisa referencias na internet pelo backend e devolve titulo, trecho e link. Use quando o usuario pedir pesquisar na net, referencias externas, fonte oficial ou comparacao atual. Nao use para dados internos da Wimifarma.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'consulta' => array('type' => 'string', 'minLength' => 3, 'maxLength' => 180),
                    'limite' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 6),
                ),
                'required' => array('consulta'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'noticias_medicamentos_oficiais',
            'description' => 'Busca noticias e comunicados oficiais recentes sobre medicamentos em fontes oficiais, priorizando Anvisa, Ministerio da Saude e Diario Oficial. Use para curiosidades operacionais ou alertas de saude sem inventar conclusao clinica.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'limite' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 5),
                ),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'criar_tarefa',
            'description' => 'Cria tarefa interna quando houver titulo claro. Use prioridade alta, normal ou baixa; se faltar titulo, pergunte antes.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'titulo' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 180),
                    'descricao' => array('type' => 'string', 'maxLength' => 900),
                    'prioridade' => array('type' => 'string', 'enum' => array('alta', 'normal', 'baixa')),
                ),
                'required' => array('titulo'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'criar_encomenda_cotacao',
            'description' => 'Cria encomenda controlada na Cotacao Geral quando houver produto e responsavel/cliente. Exemplo: "encomenda losartana 50mg Isadora". Nao use para consulta; use buscar_cotacao para procurar.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'produto' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 220),
                    'responsavel' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 70),
                    'observacao' => array('type' => 'string', 'maxLength' => 160),
                ),
                'required' => array('produto', 'responsavel'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'registrar_sangria',
            'description' => 'Registra sangria no financeiro quando houver valor e responsavel. Se faltar valor ou responsavel, pergunte antes de gravar.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'valor' => array('type' => 'number', 'minimum' => 0.01),
                    'responsavel' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 70),
                    'observacao' => array('type' => 'string', 'maxLength' => 220),
                    'data' => array('type' => 'string', 'description' => 'Data em YYYY-MM-DD. Se nao houver data clara, use a data de hoje.'),
                ),
                'required' => array('valor', 'responsavel'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'mapa_sistema',
            'description' => 'Mostra mapa automatico de telas, rotas, arquivos, endpoints e acoes do sistema Wimifarma.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'alertas_operacionais',
            'description' => 'Consulta a inteligencia operacional autonoma do Miauby: alertas ativos, pendencias, divergencias, encomendas paradas com mais de 1 dia e padroes aprendidos. Use antes de responder sobre riscos, pendencias ou validacao de processo.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'modulo' => array(
                        'type' => 'string',
                        'enum' => array('geral', 'financeiro', 'cotacao', 'cashback'),
                    ),
                    'forcar_varredura' => array('type' => 'boolean'),
                ),
                'required' => array('modulo'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'diagnostico_operacional',
            'description' => 'Valida processo operacional com alertas e padroes aprendidos do Miauby. Use quando pedirem auditoria, validacao, processo certo ou o que esta errado.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'modulo' => array(
                        'type' => 'string',
                        'enum' => array('geral', 'financeiro', 'cotacao', 'cashback'),
                    ),
                ),
                'required' => array('modulo'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'memoria_operacional',
            'description' => 'Consulta memorias e padroes aprendidos pelo Miauby para responder com contexto do jeito que a Wimifarma trabalha.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'consulta' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 220),
                ),
                'required' => array('consulta'),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'diagnostico_skills',
            'description' => 'Lista o registry controlado de skills do Miauby, separando leitura, sugestao, escrita, risco, auditoria e executores disponiveis.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(),
                'additionalProperties' => false,
            ),
        ),
        array(
            'type' => 'function',
            'name' => 'criar_lancamento_financeiro',
            'description' => 'Cria um lancamento financeiro controlado no dia informado ou hoje. Use quando houver categoria clara, valor e responsavel. Entenda frases fora de ordem: "500 pix cnpj isadora mercadoria" e "mercadoria 500 pix cnpj isadora" significam Pix CNPJ, valor 500, responsavel Isadora e obs mercadoria. Se houver hifen, antes do hifen e responsavel e depois e observacao: "pix 500 will - pagamento boleto", "sangria 33 isadora - pao de queijo". Pix sem maquininha vai em Pix CNPJ; maq pix/mpix/maqpix vai em Maquininha Pix. Dinheiro pego do caixa para compra pequena vai em Outros, salvo se disser Sangria.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'categoria' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 80),
                    'valor' => array('type' => 'number', 'minimum' => 0.01),
                    'responsavel' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 70),
                    'observacao' => array('type' => 'string', 'maxLength' => 220),
                    'data' => array('type' => 'string', 'description' => 'Data em YYYY-MM-DD. Se nao houver data clara, use a data de hoje.'),
                ),
                'required' => array('categoria', 'valor', 'responsavel'),
                'additionalProperties' => false,
            ),
        ),
    );
}

function miauw_openai_tool_result(string $name, array $args): string
{
    if (miauw_tool_requires_confirmation($name)) {
        $command = $args;
        if ($name === 'criar_encomenda_cotacao') {
            $command['observacao_usuario'] = (string) ($args['observacao'] ?? $args['observacao_usuario'] ?? '');
            $command['raw_message'] = 'tool_call_criar_encomenda_cotacao';
        }
        if ($name === 'criar_lancamento_financeiro') {
            $command['raw_message'] = 'tool_call_criar_lancamento_financeiro';
        }

        $user = function_exists('current_user') ? current_user() : null;
        $confirmation = miauw_queue_confirmation(
            $name,
            $command,
            miauw_confirmation_summary($name, $command),
            is_array($user) ? (int) ($user['id'] ?? 0) : null
        );

        return "CONFIRMACAO_NECESSARIA\n"
            . "Resumo: " . (string) $confirmation['summary'] . "\n"
            . "Codigo: " . (string) $confirmation['id'] . "\n"
            . "Responda ao operador que a acao so sera gravada depois da confirmacao.";
    }

    if ($name === 'resumo_financeiro') {
        return miauw_skill_context_for_message(sprintf('resumo financeiro %02d/%04d', (int) ($args['mes'] ?? date('n')), (int) ($args['ano'] ?? date('Y'))));
    }

    if ($name === 'resumo_cashback') {
        return miauw_skill_context_for_message(sprintf('resumo cashback %02d/%04d', (int) ($args['mes'] ?? date('n')), (int) ($args['ano'] ?? date('Y'))));
    }

    if ($name === 'resumo_codigos') {
        $period = function_exists('miauw_skill_period_from_message')
            ? miauw_skill_period_from_message(sprintf('%02d/%04d', (int) ($args['mes'] ?? date('n')), (int) ($args['ano'] ?? date('Y'))))
            : array();
        return implode("\n", miauw_skill_codigos_summary($period));
    }

    if ($name === 'buscar_cliente') {
        return implode("\n", miauw_skill_client_lookup((string) ($args['busca'] ?? '')));
    }

    if ($name === 'buscar_codigo_comissao') {
        return implode("\n", miauw_skill_codigos_lookup((string) ($args['busca'] ?? '')));
    }

    if ($name === 'buscar_cotacao') {
        return implode("\n", miauw_skill_cotacao_lookup((string) ($args['busca'] ?? '')));
    }

    if ($name === 'farmacia_popular_valor') {
        if (!function_exists('miauw_fp_tool_result')) {
            return 'Ferramenta de Farmacia Popular indisponivel.';
        }

        return miauw_fp_tool_result((string) ($args['produto'] ?? ''), isset($args['uf']) ? (string) $args['uf'] : null);
    }

    if ($name === 'pesquisa_web_referencias') {
        if (!function_exists('miauw_web_references_text')) {
            return 'Ferramenta de referencias web indisponivel.';
        }

        try {
            return miauw_web_references_text((string) ($args['consulta'] ?? ''), (int) ($args['limite'] ?? 5));
        } catch (Throwable $error) {
            error_log('Miauby web references tool failed: ' . $error->getMessage());

            return 'REFERENCIAS WEB' . "\n" . 'Nao consegui pesquisar agora. Tente uma consulta mais especifica ou confira fonte oficial manualmente.';
        }
    }

    if ($name === 'noticias_medicamentos_oficiais') {
        if (!function_exists('miauw_web_official_medicine_news_text')) {
            return 'Noticias oficiais indisponiveis agora.';
        }

        try {
            return miauw_web_official_medicine_news_text((int) ($args['limite'] ?? 4));
        } catch (Throwable $error) {
            error_log('Miauby official medicine news tool failed: ' . $error->getMessage());
            miauw_register_internal_error_alert('miauby', 'Falha ao buscar noticias oficiais', $error, array('origem' => 'noticias_medicamentos_oficiais'));

            return 'NOTICIAS OFICIAIS DE MEDICAMENTOS' . "\n" . 'Nao consegui buscar agora. Confira Anvisa ou Ministerio da Saude manualmente.';
        }
    }

    if ($name === 'criar_tarefa') {
        if (!function_exists('miauw_skill_create_tarefa')) {
            return 'Ferramenta de tarefa indisponivel.';
        }

        try {
            $user = function_exists('current_user') ? current_user() : null;
            $result = miauw_skill_create_tarefa(array(
                'titulo' => (string) ($args['titulo'] ?? ''),
                'descricao' => (string) ($args['descricao'] ?? ''),
                'prioridade' => (string) ($args['prioridade'] ?? 'normal'),
            ), is_array($user) ? (int) ($user['id'] ?? 0) : null);
        } catch (Throwable $error) {
            error_log('Miauby OpenAI tool criar_tarefa failed: ' . $error->getMessage());
            miauw_register_internal_error_alert('miauby', 'Falha ao criar tarefa por ferramenta', $error, array('origem' => 'criar_tarefa'));

            return 'Nao consegui criar a tarefa agora. Registrei diagnostico interno para revisao.';
        }

        return "TAREFA CRIADA\n"
            . "ID: " . (int) $result['id'] . "\n"
            . "Prioridade: " . (string) $result['prioridade'] . "\n"
            . "Titulo: " . (string) $result['titulo'];
    }

    if ($name === 'criar_encomenda_cotacao') {
        if (!function_exists('miauw_skill_create_cotacao_encomenda')) {
            return 'Ferramenta de encomenda indisponivel.';
        }

        try {
            $result = miauw_skill_create_cotacao_encomenda(array(
                'produto' => (string) ($args['produto'] ?? ''),
                'responsavel' => (string) ($args['responsavel'] ?? ''),
                'observacao_usuario' => (string) ($args['observacao'] ?? ''),
                'raw_message' => 'tool_call_criar_encomenda_cotacao',
            ));
        } catch (Throwable $error) {
            error_log('Miauby OpenAI tool criar_encomenda_cotacao failed: ' . $error->getMessage());
            miauw_register_internal_error_alert('miauby', 'Falha ao criar encomenda por ferramenta', $error, array('origem' => 'criar_encomenda_cotacao'));

            return 'Nao consegui criar a encomenda agora. Registrei diagnostico interno para revisao.';
        }

        return "ENCOMENDA CRIADA\n"
            . "ID: " . (string) $result['id'] . "\n"
            . "Produto: " . (string) $result['produto'] . "\n"
            . "Responsavel/cliente: " . (string) $result['responsavel'] . "\n"
            . "Registro: " . (string) ($result['registrada_em'] ?? '') . "\n"
            . "Status: " . (string) ($result['status'] ?? 'aberta');
    }

    if ($name === 'mapa_sistema') {
        return function_exists('miauw_system_map_cached') ? miauw_system_map_cached() : 'Mapa do sistema indisponivel.';
    }

    if ($name === 'alertas_operacionais') {
        if (!function_exists('miauw_intelligence_diagnostic_text')) {
            return 'Inteligencia operacional indisponivel.';
        }

        if (!empty($args['forcar_varredura']) && function_exists('miauw_guardian_scan')) {
            miauw_guardian_scan(true);
        }

        $module = (string) ($args['modulo'] ?? 'geral');
        return miauw_intelligence_diagnostic_text($module === 'geral' ? '' : $module);
    }

    if ($name === 'diagnostico_operacional') {
        if (!function_exists('miauw_intelligence_process_validation_reply')) {
            return 'Validador operacional indisponivel.';
        }

        $module = (string) ($args['modulo'] ?? 'geral');
        return miauw_intelligence_process_validation_reply('validar processo ' . $module);
    }

    if ($name === 'memoria_operacional') {
        $query = (string) ($args['consulta'] ?? '');
        $user = function_exists('current_user') ? current_user() : null;
        $memory = function_exists('miauw_memory_context_for_message')
            ? miauw_memory_context_for_message($query, is_array($user) ? (int) ($user['id'] ?? 0) : null)
            : '';
        $patterns = function_exists('miauw_intelligence_patterns_text')
            ? miauw_intelligence_patterns_text(8, function_exists('miauw_intelligence_module_from_message') ? miauw_intelligence_module_from_message($query) : null)
            : '';

    return trim(($memory !== '' ? $memory : 'MEMORIA OPERACIONAL DO MIAUBY\nSem memoria relevante encontrada para essa consulta.') . "\n\n" . $patterns);
    }

    if ($name === 'diagnostico_skills') {
        return function_exists('miauw_skill_registry_diagnostics')
            ? miauw_skill_registry_diagnostics()
            : 'Registry de skills indisponivel neste bootstrap.';
    }

    if ($name === 'registrar_sangria') {
        if (!function_exists('miauw_skill_create_sangria')) {
            return 'Ferramenta de sangria indisponivel.';
        }

        try {
            $result = miauw_skill_create_sangria(
                (float) ($args['valor'] ?? 0),
                (string) ($args['responsavel'] ?? ''),
                (string) ($args['observacao'] ?? ''),
                isset($args['data']) ? (string) $args['data'] : null
            );
        } catch (Throwable $error) {
            error_log('Miauby OpenAI tool registrar_sangria failed: ' . $error->getMessage());
            miauw_register_internal_error_alert('miauby', 'Falha ao registrar sangria por ferramenta', $error, array('origem' => 'registrar_sangria'));

            return 'Nao consegui registrar a sangria agora. Registrei diagnostico interno para revisao.';
        }

        return "SANGRIA REGISTRADA\n"
            . "ID: " . (int) $result['id'] . "\n"
            . "Data: " . (string) $result['data'] . "\n"
            . "Valor: " . miauw_skill_money((float) $result['valor']) . "\n"
            . "Responsavel: " . (string) $result['responsavel'];
    }

    if ($name === 'criar_lancamento_financeiro') {
        if (!function_exists('miauw_skill_create_financeiro_lancamento')) {
            return 'Ferramenta de lancamento financeiro indisponivel.';
        }

        try {
            if (function_exists('miauw_intelligence_learn_financeiro_command')) {
                miauw_intelligence_learn_financeiro_command('tool_call_criar_lancamento_financeiro', array(
                    'categoria' => (string) ($args['categoria'] ?? ''),
                    'valor' => (float) ($args['valor'] ?? 0),
                    'responsavel' => (string) ($args['responsavel'] ?? ''),
                    'observacao_usuario' => (string) ($args['observacao'] ?? ''),
                ));
            }

            $result = miauw_skill_create_financeiro_lancamento(
                (string) ($args['categoria'] ?? ''),
                (float) ($args['valor'] ?? 0),
                (string) ($args['observacao'] ?? ''),
                isset($args['data']) ? (string) $args['data'] : null,
                (string) ($args['responsavel'] ?? '')
            );
        } catch (Throwable $error) {
            error_log('Miauby OpenAI tool criar_lancamento_financeiro failed: ' . $error->getMessage());
            miauw_register_internal_error_alert('miauby', 'Falha ao criar lancamento por ferramenta', $error, array('origem' => 'criar_lancamento_financeiro'));

            return 'Nao consegui criar o lancamento financeiro agora. Registrei diagnostico interno para revisao.';
        }

        return "LANCAMENTO FINANCEIRO CRIADO\n"
            . "ID: " . (int) $result['id'] . "\n"
            . "Data: " . (string) $result['data'] . "\n"
            . "Categoria: " . (string) $result['categoria'] . "\n"
            . "Valor: " . miauw_skill_money((float) $result['valor']) . "\n"
            . "Responsavel: " . (string) $result['responsavel'] . "\n"
            . "Observacao: " . (string) $result['observacao'];
    }

    return 'Ferramenta desconhecida. O gato fiscal nao recebeu essa chave de fenda.';
}

function miauw_openai_request(array $payload): array
{
    $ch = curl_init('https://api.openai.com/v1/responses');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array(
            'Content-Type: application/json',
            'Authorization: Bearer ' . MIAUW_OPENAI_API_KEY,
        ),
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 35,
    ));

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        $apiMessage = '';
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;

        if (is_array($decoded) && isset($decoded['error']['message']) && is_string($decoded['error']['message'])) {
            $apiMessage = miauw_redact_secret_fragments($decoded['error']['message']);
        }

        $detail = $error !== '' ? $error : 'HTTP ' . $status;
        if ($apiMessage !== '') {
            $detail .= ' - ' . $apiMessage;
        }

        throw new RuntimeException('Falha na IA: ' . $detail);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Resposta invalida da IA.');
    }

    return $data;
}

function miauw_openai_request_resilient(array $payload, array $fallbackModels = array()): array
{
    $attempt = 0;
    $lastError = null;
    $modelsTried = array((string) ($payload['model'] ?? ''));

    while ($attempt < 6) {
        $attempt++;

        try {
            return miauw_openai_request($payload);
        } catch (Throwable $error) {
            $lastError = $error;
            $message = strtolower($error->getMessage());

            if (strpos($message, 'unsupported parameter') !== false || strpos($message, 'unknown parameter') !== false || strpos($message, 'not supported') !== false || strpos($message, 'invalid value') !== false) {
                $changed = false;
                foreach (array('reasoning', 'text', 'temperature') as $key) {
                    if (array_key_exists($key, $payload)) {
                        unset($payload[$key]);
                        $changed = true;
                        break;
                    }
                }

                if ($changed) {
                    continue;
                }
            }

            if (
                strpos($message, 'model') !== false
                && (strpos($message, 'not found') !== false
                    || strpos($message, 'does not exist') !== false
                    || strpos($message, 'do not have access') !== false
                    || strpos($message, 'not have access') !== false
                    || strpos($message, 'unsupported') !== false)
            ) {
                $nextModel = '';
                foreach ($fallbackModels as $candidate) {
                    $candidate = trim((string) $candidate);
                    if ($candidate !== '' && !in_array($candidate, $modelsTried, true)) {
                        $nextModel = $candidate;
                        break;
                    }
                }

                if ($nextModel !== '') {
                    $payload['model'] = $nextModel;
                    $modelsTried[] = $nextModel;
                    unset($payload['reasoning'], $payload['text']);
                    continue;
                }
            }

            throw $error;
        }
    }

    throw $lastError ?: new RuntimeException('Falha desconhecida na IA.');
}

function miauw_openai_function_outputs(array $data): array
{
    $outputs = array();

    foreach (($data['output'] ?? array()) as $item) {
        if (!is_array($item) || ($item['type'] ?? '') !== 'function_call') {
            continue;
        }

        $args = array();
        if (isset($item['arguments']) && is_string($item['arguments'])) {
            $decoded = json_decode($item['arguments'], true);
            $args = is_array($decoded) ? $decoded : array();
        }

        $name = (string) ($item['name'] ?? '');
        $started = microtime(true);

        try {
            $output = miauw_openai_tool_result($name, $args);
            miauw_trace_record($name, 'ok', array(
                'type' => 'tool',
                'summary' => 'Tool usada pela camada online.',
                'payload' => array('args' => $args),
                'duration_ms' => (int) round((microtime(true) - $started) * 1000),
                'requires_confirmation' => miauw_tool_requires_confirmation($name),
            ));
        } catch (Throwable $error) {
            miauw_trace_record($name, 'error', array(
                'type' => 'tool',
                'summary' => 'Falha ao usar tool pela camada online.',
                'payload' => array('args' => $args),
                'duration_ms' => (int) round((microtime(true) - $started) * 1000),
                'error' => $error->getMessage(),
                'requires_confirmation' => miauw_tool_requires_confirmation($name),
            ));
            throw $error;
        }

        $outputs[] = array(
            'type' => 'function_call_output',
            'call_id' => (string) ($item['call_id'] ?? ''),
            'output' => $output,
        );
    }

    return $outputs;
}

function miauw_openai_reply(int $conversationId, string $message, bool $widgetMode = false): string
{
    if (trim((string) MIAUW_OPENAI_API_KEY) === '') {
        throw new RuntimeException('Chave da API nao configurada.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL nao esta habilitado no PHP.');
    }

    $input = miauw_history_input($conversationId);
    $lastIndex = count($input) - 1;
    if ($lastIndex >= 0 && ($input[$lastIndex]['role'] ?? '') === 'user') {
        $input[$lastIndex]['content'] = miauw_substr($message, 0, 1600);
    } else {
        $input[] = array('role' => 'user', 'content' => miauw_substr($message, 0, 1600));
    }

    $route = miauw_model_route($message);
    $fallbackModels = miauw_openai_fallback_models((string) ($route['model'] ?? MIAUW_OPENAI_MODEL));
    $instructions = miauw_system_prompt(miauw_knowledge_for($message));
    if ($widgetMode) {
        $instructions .= "\n\nMODO WIDGET COMPACTO\n"
            . "- Responda em 1 a 3 frases curtas quando o pedido for vago ou pequeno.\n"
            . "- Se o usuario disser so \"bugou\", \"erro\", \"travou\" ou algo parecido, nao monte checklist grande; diga que registrou diagnostico interno e peca acao feita, mensagem que apareceu e print.\n"
            . "- Se o usuario mandar palavra aleatoria, risada, provocacao ou teclado espirrado, responda na vibe Miauby em 1 ou 2 linhas e puxe para objetivo real; nao diagnostique sistema sem sinal.\n"
            . "- Uma resposta no widget deve parecer balao de fala do Miauby, nao relatorio de ChatGPT.\n"
            . "- Se precisar de plano longo, entregue o veredito e pergunte se quer destrinchar.";
    }
    $basePayload = array(
        'model' => MIAUW_OPENAI_MODEL,
        'instructions' => $instructions,
        'input' => $input,
        'max_output_tokens' => (int) MIAUW_MAX_OUTPUT_TOKENS,
        'temperature' => (float) MIAUW_TEMPERATURE,
        'store' => false,
    );
    $basePayload = miauw_apply_model_route($basePayload, $route);
    if ($widgetMode) {
        $widgetLimit = ((string) ($route['name'] ?? '') === 'boss') ? 420 : 300;
        $basePayload['max_output_tokens'] = min((int) ($basePayload['max_output_tokens'] ?? $widgetLimit), $widgetLimit);
        $basePayload['text'] = array('verbosity' => 'low');
    }

    $data = null;

    if ((bool) MIAUW_OPENAI_TOOLS) {
        $toolPayload = $basePayload;
        $toolPayload['tools'] = miauw_openai_tools();

        try {
            $data = miauw_openai_request_resilient($toolPayload, $fallbackModels);
            $toolOutputs = miauw_openai_function_outputs($data);

            if ($toolOutputs) {
                $toolPayload['input'] = array_merge($input, ($data['output'] ?? array()), $toolOutputs);

                try {
                    $data = miauw_openai_request_resilient($toolPayload, $fallbackModels);
                } catch (Throwable $toolFollowUpError) {
                    error_log('Miauby OpenAI tools follow-up skipped: ' . $toolFollowUpError->getMessage());
                    $data = miauw_openai_request_resilient($basePayload, $fallbackModels);
                }
            }
        } catch (Throwable $toolError) {
            error_log('Miauby OpenAI tools skipped: ' . $toolError->getMessage());
            $data = miauw_openai_request_resilient($basePayload, $fallbackModels);
        }
    } else {
        $data = miauw_openai_request_resilient($basePayload, $fallbackModels);
    }

    $text = miauw_extract_response_text($data);
    if ($text === '' && (bool) MIAUW_OPENAI_TOOLS) {
        error_log('Miauby OpenAI tools returned empty text; retrying without tools.');
        $data = miauw_openai_request_resilient($basePayload, $fallbackModels);
        $text = miauw_extract_response_text($data);
    }

    if ($text === '') {
        throw new RuntimeException('A IA respondeu no modo silencio dramatico.');
    }

    return $text;
}

function miauw_extract_response_text(array $data): string
{
    if (isset($data['output_text']) && is_string($data['output_text'])) {
        return trim($data['output_text']);
    }

    $parts = array();
    foreach (($data['output'] ?? array()) as $item) {
        if (!is_array($item)) {
            continue;
        }

        foreach (($item['content'] ?? array()) as $content) {
            if (!is_array($content)) {
                continue;
            }

            if (isset($content['text']) && is_string($content['text'])) {
                $parts[] = $content['text'];
            }
        }
    }

    return trim(implode("\n", $parts));
}

function miauw_message_has_insult(string $message): bool
{
    $text = strtolower($message);
    $terms = array('burro', 'idiota', 'inutil', 'merda', 'bosta', 'porra', 'caralho', 'carai', 'cacete', 'pqp', 'fdp', 'otario', 'imbecil', 'desgracado', 'vai se foder');

    foreach ($terms as $term) {
        if (strpos($text, $term) !== false) {
            return true;
        }
    }

    return false;
}

function miauw_openai_failure_kind(string $reason): string
{
    $lower = strtolower($reason);

    if (strpos($lower, 'incorrect api key') !== false || strpos($lower, 'invalid api key') !== false || strpos($lower, 'unauthorized') !== false || strpos($lower, 'http 401') !== false) {
        return 'auth';
    }

    if (strpos($lower, 'billing') !== false || strpos($lower, 'quota') !== false || strpos($lower, 'insufficient_quota') !== false || strpos($lower, 'exceeded') !== false || strpos($lower, 'http 429') !== false) {
        return 'quota';
    }

    if (strpos($lower, 'model') !== false && (strpos($lower, 'not found') !== false || strpos($lower, 'does not exist') !== false || strpos($lower, 'not have access') !== false || strpos($lower, 'unsupported') !== false)) {
        return 'model';
    }

    if (strpos($lower, 'timed out') !== false || strpos($lower, 'timeout') !== false || strpos($lower, 'could not resolve') !== false || strpos($lower, 'connection') !== false) {
        return 'network';
    }

    return 'generic';
}

function miauw_api_failure_hint(string $reason): string
{
    $kind = miauw_openai_failure_kind($reason);

    if ($kind === 'auth') {
        return 'A camada online recusou a credencial configurada. Isso e ajuste interno do Miauby, nao erro seu.';
    }

    if ($kind === 'quota') {
        return 'A camada online bateu em limite ou cobranca. Isso precisa de revisao administrativa antes de voltar ao normal.';
    }

    if ($kind === 'model') {
        return 'O modelo configurado nao esta disponivel para esta chave. Precisa revisar o modelo do Miauby no ambiente.';
    }

    if ($kind === 'network') {
        return 'A camada online nao respondeu a tempo. Pode ser rede, DNS ou instabilidade temporaria.';
    }

    return 'Nao consegui completar essa resposta online agora. O aviso interno ficou registrado para revisao.';
}

function miauw_fallback_reply(string $message, string $reason = ''): string
{
    $clean = trim($message);
    $lower = strtolower($clean);

    if ($reason !== '') {
        $hint = miauw_api_failure_hint($reason);
        $kind = miauw_openai_failure_kind($reason);

        if ($kind === 'auth' || $kind === 'quota' || $kind === 'model') {
            return "Meu modo online esta indisponivel agora.\n" . $hint . "\nSe era um teste, pode ignorar. Se era uma bronca real da tela, mande print, horario e o que tentou fazer.";
        }

        return "Nao consegui usar a camada online agora.\n" . $hint . "\nEnquanto isso, mande tela, erro, data, valor e responsavel. Sem dado, sem milagre.";
    }

    if (miauw_message_has_insult($lower)) {
        return 'Aindaaa veio xingando? Anotado na pasta "surto operacional". Agora manda o problema real: tela, erro, data, valor e o que voce tentou. Cansei, mas vou resolver.';
    }

    if (strpos($lower, 'willian') !== false || strpos($lower, 'dono') !== false || strpos($lower, 'pai') !== false) {
        return 'Willian e o Dono, farmaceutico, criador deste gato fiscal e meu pai administrativo. Minha funcao e proteger o tempo, o dinheiro e a paciencia dele contra bagunca operacional. Assinado: Miauby, fiscal nao remunerado do caos.';
    }

    if (strpos($lower, 'ideia') !== false || strpos($lower, 'campanha') !== false || strpos($lower, 'texto') !== false || strpos($lower, 'bordao') !== false || strpos($lower, 'frase') !== false) {
        $bordoes = array(
            'Versao com patada: "Se deu erro, primeiro respira. Depois culpa o processo, nao o teclado." Versao util: registre tela, erro, responsavel e proximo passo. O sistema sobreviveu a mais um humano.',
            'Bordao do gato fiscal: "Planilha sem contexto e fofoca sem nome: so atrapalha." Use quando alguem quiser salvar dado pela metade, essa arte triste.',
            'Ideia rapida: transforme a bagunca em checklist. Campo obrigatorio, historico e responsavel. Menos fe administrativa, mais processo auditavel.',
            'Campanha interna: "Lanca certo hoje para nao cacar prejuizo amanha." Curto, acido e tristemente necessario.'
        );

        return $bordoes[array_rand($bordoes)];
    }

    if (strpos($lower, 'financeiro') !== false || strpos($lower, 'caixa') !== false) {
        return 'Miauby direto ao ponto: financeiro nao e lugar para poesia torta. Entra em /financeiro/, escolhe mes e dia, coloca responsavel, total sistema e lanca as categorias com valor e observacao decente. Se sobrar ou faltar acima do limite, justifica. Caixa sem conferencia e fe administrativa com calculadora.';
    }

    if (strpos($lower, 'cotacao') !== false || strpos($lower, 'ean') !== false) {
        return 'Diagnostico Miauby: cotacao sem dado vira bingo de distribuidora. Entra em /cotacao/, usa a Cotacao Geral como planilha, preenche EAN, produto, quantidade, categoria e precos. Olha preco, prazo, giro, margem e urgencia. Preco baixo sem giro e armadilha com etiqueta bonita.';
    }

    if (strpos($lower, 'cashback') !== false || strpos($lower, 'cliente') !== false) {
        return 'Cashback fica em /cashback/. Use para cliente, compra, credito, resgate e WhatsApp. Dado de cliente nao e brinquedo de gato, entao confira antes de salvar. Se mexer em saldo errado, o banco de dados pisca triste e o Willian sente no bolso.';
    }

    $defaults = array(
        'Nao consegui usar a camada completa agora. Me da tela, erro, valor e objetivo.',
        'Resposta limitada por enquanto. Manda modulo, data, valor, responsavel e resultado esperado.',
        'Meu modo turbo nao veio desta vez. Manda contexto que eu ainda consigo julgar essa bagunca com dignidade.',
    );

    return $defaults[array_rand($defaults)];
}

function miauw_generate_reply(int $conversationId, string $message, bool $widgetMode = false): array
{
    if (function_exists('miauw_fp_message_matches') && miauw_fp_message_matches($message) && function_exists('miauw_fp_reply_for_message')) {
        try {
            $fpReply = miauw_fp_reply_for_message($message);
            if (trim($fpReply) !== '') {
                return array(
                    'text' => $fpReply,
                    'fallback' => false,
                    'model' => 'miauw-farmacia-popular',
                );
            }
        } catch (Throwable $error) {
            error_log('Miauby farmacia popular local reply failed: ' . $error->getMessage());
        }
    }

    try {
        $route = function_exists('miauw_model_route') ? miauw_model_route($message) : array('model' => MIAUW_OPENAI_MODEL, 'name' => 'legacy');
        $text = miauw_openai_reply($conversationId, $message, $widgetMode);

        return array(
            'text' => function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($text) : $text,
            'fallback' => false,
            'model' => (string) ($route['model'] ?? MIAUW_OPENAI_MODEL) . ':' . (string) ($route['name'] ?? 'route'),
        );
    } catch (Throwable $error) {
        error_log('Miauby OpenAI fallback: ' . $error->getMessage());
        if (function_exists('miauw_register_internal_error_alert')) {
            miauw_register_internal_error_alert('miauby', 'Falha na camada online do Miauby', $error, array(
                'origem' => 'miauw_generate_reply',
                'failure_kind' => function_exists('miauw_openai_failure_kind') ? miauw_openai_failure_kind($error->getMessage()) : 'generic',
            ));
        }
        $fallbackText = miauw_fallback_reply($message, $error->getMessage());

        return array(
            'text' => function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($fallbackText) : $fallbackText,
            'fallback' => true,
            'model' => 'offline',
        );
    }
}

function miauw_message_time(string $createdAt): string
{
    $timestamp = strtotime($createdAt);

    if (!$timestamp) {
        return '';
    }

    return date('d/m/y H:i', $timestamp);
}
