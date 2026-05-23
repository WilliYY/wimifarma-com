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

if (!function_exists('miauw_env_bool')) {
    function miauw_env_bool(array $names, bool $default = false): bool
    {
        $value = miauw_env_string($names);
        if ($value === '') {
            return $default;
        }

        $normalized = strtolower(trim($value));
        if (in_array($normalized, array('1', 'true', 'on', 'yes', 'sim'), true)) {
            return true;
        }

        if (in_array($normalized, array('0', 'false', 'off', 'no', 'nao'), true)) {
            return false;
        }

        return $default;
    }
}

if (!defined('MIAUW_APP_NAME')) {
    define('MIAUW_APP_NAME', 'Miauby');
}

if (!defined('MIAUW_VERSION')) {
    define('MIAUW_VERSION', '20260523a');
}

if (!defined('MIAUW_AGENT_VERSION')) {
    define('MIAUW_AGENT_VERSION', '2.0-fase21');
}

if (!defined('MIAUW_AGENT_POLICY_VERSION')) {
    define('MIAUW_AGENT_POLICY_VERSION', '2026-05-17-operacional-v2-voice-playback-profile');
}

if (!defined('MIAUW_AGENT_PERSONALITY_VERSION')) {
    define('MIAUW_AGENT_PERSONALITY_VERSION', 'miauby-persona-2026-05-16');
}

if (!defined('MIAUW_AGENT_STYLE_VERSION')) {
    define('MIAUW_AGENT_STYLE_VERSION', 'miauby-style-router-2026-05-16');
}

if (!defined('MIAUW_AGENT_VOICE_PROFILE_VERSION')) {
    define('MIAUW_AGENT_VOICE_PROFILE_VERSION', 'miauby-voice-profile-2026-05-17');
}

if (!defined('MIAUW_AGENT_AUDIO_VERSION')) {
    define('MIAUW_AGENT_AUDIO_VERSION', 'miauby-voice-playback-profile-2026-05-17');
}

if (!defined('MIAUW_VOICE_PROFILE')) {
    define('MIAUW_VOICE_PROFILE', miauw_env_string(array('MIAUW_VOICE_PROFILE'), 'miauby_padrao'));
}

if (!defined('MIAUW_AUDIO_ENABLED')) {
    define('MIAUW_AUDIO_ENABLED', miauw_env_bool(array('MIAUW_AUDIO_ENABLED'), false));
}

if (!defined('MIAUW_REALTIME_MODEL')) {
    $miauwRealtimeModel = miauw_env_string(array('MIAUW_REALTIME_MODEL', 'OPENAI_REALTIME_MODEL'));
    define('MIAUW_REALTIME_MODEL', $miauwRealtimeModel !== '' ? $miauwRealtimeModel : 'gpt-realtime');
}

if (!defined('MIAUW_REALTIME_VOICE')) {
    $miauwRealtimeVoice = miauw_env_string(array('MIAUW_REALTIME_VOICE', 'OPENAI_REALTIME_VOICE'));
    define('MIAUW_REALTIME_VOICE', $miauwRealtimeVoice !== '' ? $miauwRealtimeVoice : 'marin');
}

if (!defined('MIAUW_TRANSCRIPTION_MODEL')) {
    $miauwTranscriptionModel = miauw_env_string(array('MIAUW_TRANSCRIPTION_MODEL', 'OPENAI_TRANSCRIPTION_MODEL'));
    define('MIAUW_TRANSCRIPTION_MODEL', $miauwTranscriptionModel !== '' ? $miauwTranscriptionModel : 'gpt-4o-transcribe');
}

if (!defined('MIAUW_SPEECH_MODEL')) {
    $miauwSpeechModel = miauw_env_string(array('MIAUW_SPEECH_MODEL', 'OPENAI_SPEECH_MODEL'));
    define('MIAUW_SPEECH_MODEL', $miauwSpeechModel !== '' ? $miauwSpeechModel : 'gpt-4o-mini-tts');
}

if (!defined('MIAUW_SPEECH_VOICE')) {
    $miauwSpeechVoice = miauw_env_string(array('MIAUW_SPEECH_VOICE', 'OPENAI_SPEECH_VOICE'));
    define('MIAUW_SPEECH_VOICE', $miauwSpeechVoice !== '' ? $miauwSpeechVoice : 'marin');
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

if (!defined('MIAUW_AGENT_INTERNAL_TOKEN')) {
    $miauwAgentInternalToken = miauw_env_string(array('MIAUW_AGENT_INTERNAL_TOKEN'));
    if ($miauwAgentInternalToken === '' && defined('MIAUW_GUARDIAN_TOKEN')) {
        $miauwAgentInternalToken = trim((string) MIAUW_GUARDIAN_TOKEN);
    }
    if ($miauwAgentInternalToken === '') {
        $miauwAgentInternalToken = miauw_env_string(array('MIAUW_GUARDIAN_TOKEN'));
    }
    define('MIAUW_AGENT_INTERNAL_TOKEN', $miauwAgentInternalToken);
}

if (!defined('MIAUW_AGENT_INTERNAL_BASE_URL')) {
    $miauwAgentInternalBaseUrl = miauw_env_string(array('MIAUW_AGENT_INTERNAL_BASE_URL'));
    define('MIAUW_AGENT_INTERNAL_BASE_URL', $miauwAgentInternalBaseUrl !== '' ? $miauwAgentInternalBaseUrl : 'http://wimifarma-miauw-agent:3100/miauw/agent');
}

if (!defined('MIAUW_AGENT_SHADOW_ON_SEND')) {
    define('MIAUW_AGENT_SHADOW_ON_SEND', miauw_env_bool(array('MIAUW_AGENT_SHADOW_ON_SEND'), false));
}

if (!defined('MIAUW_AGENT_SHADOW_TIMEOUT_MS')) {
    $miauwAgentShadowTimeout = (int) miauw_env_string(array('MIAUW_AGENT_SHADOW_TIMEOUT_MS'));
    if ($miauwAgentShadowTimeout <= 0) {
        $miauwAgentShadowTimeout = 12000;
    }
    define('MIAUW_AGENT_SHADOW_TIMEOUT_MS', max(1000, min(30000, $miauwAgentShadowTimeout)));
}

if (!defined('MIAUW_ENGINE')) {
    $miauwEngine = miauw_env_string(array('MIAUW_ENGINE'));
    define('MIAUW_ENGINE', $miauwEngine !== '' ? $miauwEngine : 'php');
}

if (!defined('MIAUW_AGENT_ENGINE_ALLOWED_USERS')) {
    $miauwEngineUsers = miauw_env_string(array('MIAUW_AGENT_ENGINE_ALLOWED_USERS'));
    define('MIAUW_AGENT_ENGINE_ALLOWED_USERS', $miauwEngineUsers !== '' ? $miauwEngineUsers : 'adm');
}

if (!defined('MIAUW_MAINTENANCE_MODE')) {
    define('MIAUW_MAINTENANCE_MODE', miauw_env_bool(array('MIAUW_MAINTENANCE_MODE'), false));
}

if (!defined('MIAUW_MAINTENANCE_ALLOWED_USERS')) {
    $miauwMaintenanceUsers = miauw_env_string(array('MIAUW_MAINTENANCE_ALLOWED_USERS'));
    define('MIAUW_MAINTENANCE_ALLOWED_USERS', $miauwMaintenanceUsers !== '' ? $miauwMaintenanceUsers : 'adm');
}

if (!defined('MIAUW_MAINTENANCE_MESSAGE')) {
    $miauwMaintenanceMessage = miauw_env_string(array('MIAUW_MAINTENANCE_MESSAGE'));
    define(
        'MIAUW_MAINTENANCE_MESSAGE',
        $miauwMaintenanceMessage !== ''
            ? $miauwMaintenanceMessage
            : 'Miauby esta em atualizacao interna agora. O acesso operacional volta em instantes.'
    );
}

if (!defined('COTACAO_INTERNAL_TOKEN')) {
    $cotacaoInternalToken = miauw_env_string(array('COTACAO_INTERNAL_TOKEN'));
    if ($cotacaoInternalToken === '' && defined('MIAUW_GUARDIAN_TOKEN')) {
        $cotacaoInternalToken = trim((string) MIAUW_GUARDIAN_TOKEN);
    }
    if ($cotacaoInternalToken === '') {
        $cotacaoInternalToken = miauw_env_string(array('MIAUW_GUARDIAN_TOKEN'));
    }
    define('COTACAO_INTERNAL_TOKEN', $cotacaoInternalToken);
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS miauw_treinos_respostas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            parent_id BIGINT UNSIGNED NULL,
            versao INT UNSIGNED NOT NULL DEFAULT 1,
            conversa_id BIGINT UNSIGNED NULL,
            usuario_id INT UNSIGNED NULL,
            user_message_id BIGINT UNSIGNED NULL,
            assistant_message_id BIGINT UNSIGNED NULL,
            pergunta MEDIUMTEXT NOT NULL,
            resposta_original MEDIUMTEXT NOT NULL,
            resposta_ideal MEDIUMTEXT NULL,
            avaliacao ENUM('boa', 'ruim', 'ajuste') NOT NULL DEFAULT 'ajuste',
            motivo VARCHAR(80) NOT NULL DEFAULT 'manual',
            categoria VARCHAR(80) NOT NULL DEFAULT 'geral',
            estilo VARCHAR(80) NOT NULL DEFAULT 'miauby',
            status ENUM('pendente', 'aprovado', 'rejeitado', 'superado') NOT NULL DEFAULT 'pendente',
            observacao TEXT NULL,
            source VARCHAR(40) NOT NULL DEFAULT 'chat',
            reviewed_by INT UNSIGNED NULL,
            reviewed_at DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_miauw_treino_status (status, created_at),
            KEY idx_miauw_treino_parent (parent_id, versao),
            KEY idx_miauw_treino_mensagem (assistant_message_id),
            KEY idx_miauw_treino_categoria (categoria, status)
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

function miauw_config_get(string $key, string $default = ''): string
{
    $safeKey = trim($key);
    if ($safeKey === '') {
        return $default;
    }

    try {
        $stmt = db()->prepare('SELECT valor FROM miauw_configuracoes WHERE chave = ? LIMIT 1');
        $stmt->execute(array($safeKey));
        $value = $stmt->fetchColumn();

        return is_string($value) && trim($value) !== '' ? trim($value) : $default;
    } catch (Throwable $error) {
        error_log('Miauby config get failed: ' . $error->getMessage());

        return $default;
    }
}

function miauw_config_set(string $key, string $value): bool
{
    $safeKey = trim($key);
    if ($safeKey === '' || strlen($safeKey) > 80) {
        return false;
    }

    try {
        miauw_ensure_schema();
        $stmt = db()->prepare(
            'INSERT INTO miauw_configuracoes (chave, valor, updated_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()'
        );

        return $stmt->execute(array($safeKey, $value));
    } catch (Throwable $error) {
        error_log('Miauby config set failed: ' . $error->getMessage());

        return false;
    }
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
            : 'Chave da camada online ausente ou placeholder.',
    );
}

function miauw_agent_engine(): string
{
    $engine = strtolower(trim(miauw_constant_string('MIAUW_ENGINE', 'php')));
    $allowed = array('php', 'node_shadow', 'node');

    return in_array($engine, $allowed, true) ? $engine : 'php';
}

function miauw_csv_list(string $value): array
{
    $parts = preg_split('/[,;]+/', $value) ?: array();
    $items = array();

    foreach ($parts as $part) {
        $normalized = strtolower(trim((string) $part));
        if ($normalized !== '') {
            $items[] = $normalized;
        }
    }

    return array_values(array_unique($items));
}

function miauw_user_identifier(?array $user): string
{
    if (!$user) {
        return '';
    }

    $username = strtolower(trim((string) ($user['username'] ?? '')));
    if ($username !== '') {
        return $username;
    }

    return strtolower(trim((string) ($user['nome'] ?? '')));
}

function miauw_user_matches_allowed_list(?array $user, string $allowedCsv): bool
{
    $allowed = miauw_csv_list($allowedCsv);
    if (in_array('*', $allowed, true)) {
        return true;
    }

    $identifier = miauw_user_identifier($user);
    return $identifier !== '' && in_array($identifier, $allowed, true);
}

function miauw_agent_engine_allowed_for_user(?array $user): bool
{
    return miauw_user_matches_allowed_list($user, miauw_constant_string('MIAUW_AGENT_ENGINE_ALLOWED_USERS', 'adm'));
}

function miauw_maintenance_status(?array $user = null): array
{
    $active = defined('MIAUW_MAINTENANCE_MODE') ? (bool) MIAUW_MAINTENANCE_MODE : false;
    $allowedCsv = miauw_constant_string('MIAUW_MAINTENANCE_ALLOWED_USERS', 'adm');
    $canSend = !$active || miauw_user_matches_allowed_list($user, $allowedCsv);

    return array(
        'active' => $active,
        'can_send' => $canSend,
        'allowed_users' => miauw_csv_list($allowedCsv),
        'message' => miauw_constant_string(
            'MIAUW_MAINTENANCE_MESSAGE',
            'Miauby esta em atualizacao interna agora. O acesso operacional volta em instantes.'
        ),
    );
}

function miauw_user_can_send_miauw(?array $user): bool
{
    $status = miauw_maintenance_status($user);
    return !empty($status['can_send']);
}

function miauw_agent_should_force_shadow(?array $user = null): bool
{
    return miauw_agent_engine() === 'node_shadow' && miauw_agent_engine_allowed_for_user($user);
}

function miauw_agent_runtime_status(?array $user = null): array
{
    return array(
        'engine' => miauw_agent_engine(),
        'engine_allowed' => miauw_agent_engine_allowed_for_user($user),
        'maintenance' => miauw_maintenance_status($user),
        'shadow' => function_exists('miauw_agent_shadow_status') ? miauw_agent_shadow_status() : array(),
    );
}

function miauw_agent_public_status(): array
{
    return array(
        'name' => 'Miauby',
        'version' => miauw_constant_string('MIAUW_AGENT_VERSION', '1.0'),
        'policy_version' => miauw_constant_string('MIAUW_AGENT_POLICY_VERSION', ''),
        'personality_version' => miauw_constant_string('MIAUW_AGENT_PERSONALITY_VERSION', ''),
        'style_version' => miauw_constant_string('MIAUW_AGENT_STYLE_VERSION', ''),
        'mode' => 'operacional',
        'engine' => miauw_agent_engine(),
        'maintenance_active' => defined('MIAUW_MAINTENANCE_MODE') ? (bool) MIAUW_MAINTENANCE_MODE : false,
        'features' => array(
            'persona_operacional',
            'persona_miauby_preservada',
            'guardrails_bastidor',
            'skills_controladas',
            'diagnostico_interno',
            'evals_intents_guardrails',
            'painel_diagnostico_revisao',
            'tools_operacionais_migradas',
            'rastreabilidade_por_conversa',
            'confirmacao_acoes_fortes',
            'streaming_visual_widget',
            'evals_operacionais_fase6',
            'contrato_agents_sdk_preparado',
            'servico_agents_sdk_sombra',
            'streaming_real_sombra',
            'adaptador_php_sombra',
            'comparacao_respostas_sombra',
            'modo_manutencao_operacional',
            'engine_switch_rollback',
            'node_primary_adm_controlado',
            'contrato_persona_node',
            'eval_personalidade_node',
            'contrato_tools_exportado',
            'schemas_tools_no_node',
            'execucao_node_leitura_segura',
            'ponte_php_tools_leitura_node',
            'tools_leitura_real_node',
            'ponte_php_tools_universal_node',
            'orquestracao_node_tools_completa',
            'escrita_baixo_risco_via_php_bridge',
            'escrita_node_bloqueada',
            'roteador_estilo_miauby',
            'memoria_estilo_aprovada',
            'respostas_casuais_sem_tool',
            'treinador_miauby_chat',
            'exemplos_treinamento_versionados',
            'contexto_treino_aprovado',
            'treino_aprovado_compilado',
            'resposta_local_por_treino',
            'evals_treino_relevancia',
            'perfis_voz_tom',
            'contrato_audio_seguro',
            'audio_botao_controlado',
            'audio_gravacao_temporaria',
            'audio_transcricao_confirmada',
            'audio_envio_confirmado',
            'audio_bolha_player_chat',
            'audio_resposta_falada',
            'audio_curto_bloqueado',
            'audio_sem_armazenamento',
            'audio_playback_blob_liberado',
            'seletor_voz_diagnostico',
            'perfil_voz_tts_forte',
            'contexto_voz_node',
            'contexto_xp_aura',
        ),
        'voice_profile_version' => miauw_constant_string('MIAUW_AGENT_VOICE_PROFILE_VERSION', ''),
        'audio_version' => miauw_constant_string('MIAUW_AGENT_AUDIO_VERSION', ''),
        'voice_profile' => function_exists('miauw_agent_voice_profile_id') ? miauw_agent_voice_profile_id() : '',
        'audio_status' => function_exists('miauw_agent_audio_contract') ? (string) (miauw_agent_audio_contract()['status'] ?? '') : '',
        'transcription_model' => miauw_constant_string('MIAUW_TRANSCRIPTION_MODEL', ''),
        'speech_model' => miauw_constant_string('MIAUW_SPEECH_MODEL', ''),
        'speech_voice' => function_exists('miauw_agent_speech_voice') ? miauw_agent_speech_voice() : miauw_constant_string('MIAUW_SPEECH_VOICE', ''),
        'speech_voice_options' => function_exists('miauw_agent_speech_voices') ? array_keys(miauw_agent_speech_voices()) : array(),
        'realtime_model' => miauw_constant_string('MIAUW_REALTIME_MODEL', ''),
        'realtime_voice' => miauw_constant_string('MIAUW_REALTIME_VOICE', ''),
    );
}

function miauw_agent_node_read_tool_names(): array
{
    return array(
        'resumo_financeiro',
        'resumo_cashback',
        'resumo_codigos',
        'resumo_gestao',
        'buscar_codigo_comissao',
        'buscar_cotacao',
    );
}

function miauw_agent_node_tool_bridge_names(): array
{
    $tools = function_exists('miauw_openai_tools_by_name') ? array_keys(miauw_openai_tools_by_name()) : array();
    sort($tools);

    return $tools;
}

function miauw_agent_node_tool_bridge_allowed(string $name): bool
{
    $name = trim($name);
    if ($name === '' || !in_array($name, miauw_agent_node_tool_bridge_names(), true)) {
        return false;
    }

    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $meta = is_array($registry[$name] ?? null) ? $registry[$name] : array();

    return !empty($meta['openai_tool']);
}

function miauw_agent_node_tool_bridge_policy(string $name): array
{
    $name = trim($name);
    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $meta = is_array($registry[$name] ?? null) ? $registry[$name] : array();
    $level = (string) ($meta['nivel'] ?? 'leitura');
    $risk = (string) ($meta['risco'] ?? 'baixo');
    $requiresConfirmation = miauw_tool_requires_confirmation($name);
    $mode = 'execute_read';
    $writesViaPhpBridge = false;

    if ($requiresConfirmation) {
        $mode = 'confirmation_required';
    } elseif ($name === 'criar_tarefa') {
        $mode = 'execute_low_risk_write';
        $writesViaPhpBridge = true;
    } elseif ($level === 'diagnostico' || $level === 'sugestao') {
        $mode = 'execute_diagnostic';
    } elseif ($level === 'escrita') {
        $mode = 'confirmation_required';
        $requiresConfirmation = true;
    }

    return array(
        'mode' => $mode,
        'level' => $level,
        'risk' => $risk,
        'requires_confirmation' => $requiresConfirmation,
        'writes_enabled_in_node' => false,
        'writes_enabled_via_php_bridge' => $writesViaPhpBridge,
        'execution_owner' => 'php',
        'confirmation_owner' => 'php',
    );
}

function miauw_agent_node_user_context(array $raw): array
{
    $id = (int) ($raw['id'] ?? $raw['user_id'] ?? 0);
    $username = trim((string) ($raw['username'] ?? $raw['usuario'] ?? ''));
    $role = trim((string) ($raw['role'] ?? $raw['perfil'] ?? ''));

    return array(
        'id' => $id > 0 ? $id : null,
        'username' => miauw_substr($username, 0, 80),
        'role' => miauw_substr($role, 0, 40),
    );
}

function miauw_agent_node_confirmation_text(string $name, array $args): string
{
    $command = $args;
    if ($name === 'criar_encomenda_cotacao') {
        $command['observacao_usuario'] = (string) ($args['observacao'] ?? $args['observacao_usuario'] ?? '');
        $command['raw_message'] = 'node_bridge_criar_encomenda_cotacao';
    }
    if ($name === 'criar_lancamento_financeiro') {
        $command['raw_message'] = 'node_bridge_criar_lancamento_financeiro';
    }
    if ($name === 'criar_conta_gestao') {
        $command['raw_message'] = 'node_bridge_criar_conta_gestao';
    }

    $summary = miauw_confirmation_summary($name, $command);

    return "CONFIRMACAO_NECESSARIA\n"
        . "Resumo: " . $summary . "\n"
        . "A ponte Node nao gravou nada. Use o fluxo do chat para confirmar ou cancelar antes de mexer no dado.";
}

function miauw_agent_node_tool_bridge_result(string $name, array $args, string $traceId = '', array $userContext = array()): array
{
    $name = trim($name);
    if (!miauw_agent_node_tool_bridge_allowed($name)) {
        throw new RuntimeException('Tool nao liberada para ponte universal do agente.');
    }

    $userContext = miauw_agent_node_user_context($userContext);
    if ($traceId !== '') {
        miauw_trace_set_context(miauw_substr($traceId, 0, 80), null, isset($userContext['id']) ? (int) $userContext['id'] : null);
    }

    $started = microtime(true);
    $argKeys = array_values(array_map('strval', array_keys($args)));
    sort($argKeys);
    $policy = miauw_agent_node_tool_bridge_policy($name);

    try {
        if (!empty($policy['requires_confirmation'])) {
            $text = miauw_agent_node_confirmation_text($name, $args);
            $durationMs = (int) round((microtime(true) - $started) * 1000);
            miauw_trace_record('miauw_agent_node_tool_bridge', 'confirmation_required', array(
                'trace_id' => $traceId !== '' ? miauw_substr($traceId, 0, 80) : null,
                'type' => 'agent_tool_bridge',
                'summary' => 'Tool forte recebida pelo agente Node sem escrita direta.',
                'duration_ms' => $durationMs,
                'requires_confirmation' => true,
                'payload' => array(
                    'tool' => $name,
                    'args_keys' => $argKeys,
                    'mode' => (string) $policy['mode'],
                    'risk' => (string) $policy['risk'],
                    'writes_enabled' => false,
                ),
            ));

            return array(
                'ok' => true,
                'tool' => $name,
                'source' => 'php_tool_bridge',
                'text' => $text,
                'duration_ms' => $durationMs,
                'confirmation_required' => true,
                'writes_enabled' => false,
                'writes_enabled_in_node' => false,
                'writes_enabled_via_php_bridge' => false,
                'bridge_mode' => (string) $policy['mode'],
                'risk' => (string) $policy['risk'],
                'level' => (string) $policy['level'],
            );
        }

        if ($name === 'criar_tarefa') {
            $userId = isset($userContext['id']) ? (int) $userContext['id'] : 0;
            if ($userId <= 0) {
                throw new RuntimeException('Usuario logado nao informado para criar tarefa pelo agente.');
            }

            $result = miauw_skill_create_tarefa(array(
                'titulo' => (string) ($args['titulo'] ?? ''),
                'descricao' => (string) ($args['descricao'] ?? ''),
                'prioridade' => (string) ($args['prioridade'] ?? 'normal'),
            ), $userId);
            $text = miauw_skill_tarefa_action_reply($result);
        } else {
            $text = miauw_openai_tool_result($name, $args);
        }

        $text = function_exists('miauw_diagnostic_redact_string')
            ? miauw_diagnostic_redact_string($text)
            : $text;
        $text = miauw_substr($text, 0, 4000);
        $durationMs = (int) round((microtime(true) - $started) * 1000);

        miauw_trace_record('miauw_agent_node_tool_bridge', 'ok', array(
            'trace_id' => $traceId !== '' ? miauw_substr($traceId, 0, 80) : null,
            'type' => 'agent_tool_bridge',
            'summary' => 'Tool executada pelo PHP para o agente Node.',
            'duration_ms' => $durationMs,
            'payload' => array(
                'tool' => $name,
                'args_keys' => $argKeys,
                'mode' => (string) $policy['mode'],
                'risk' => (string) $policy['risk'],
                'text_chars' => miauw_strlen($text),
                'writes_enabled_in_node' => false,
                'writes_enabled_via_php_bridge' => !empty($policy['writes_enabled_via_php_bridge']),
            ),
        ));

        return array(
            'ok' => true,
            'tool' => $name,
            'source' => 'php_tool_bridge',
            'text' => $text,
            'duration_ms' => $durationMs,
            'confirmation_required' => false,
            'writes_enabled' => !empty($policy['writes_enabled_via_php_bridge']),
            'writes_enabled_in_node' => false,
            'writes_enabled_via_php_bridge' => !empty($policy['writes_enabled_via_php_bridge']),
            'bridge_mode' => (string) $policy['mode'],
            'risk' => (string) $policy['risk'],
            'level' => (string) $policy['level'],
        );
    } catch (Throwable $error) {
        $durationMs = (int) round((microtime(true) - $started) * 1000);
        miauw_trace_record('miauw_agent_node_tool_bridge', 'error', array(
            'trace_id' => $traceId !== '' ? miauw_substr($traceId, 0, 80) : null,
            'type' => 'agent_tool_bridge',
            'summary' => 'Falha em tool chamada pelo agente Node.',
            'duration_ms' => $durationMs,
            'error' => $error->getMessage(),
            'payload' => array(
                'tool' => $name,
                'args_keys' => $argKeys,
                'mode' => (string) $policy['mode'],
                'writes_enabled_in_node' => false,
            ),
        ));

        throw $error;
    }
}

function miauw_agent_node_read_tool_allowed(string $name): bool
{
    $name = trim($name);
    if ($name === '' || !in_array($name, miauw_agent_node_read_tool_names(), true)) {
        return false;
    }

    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $meta = is_array($registry[$name] ?? null) ? $registry[$name] : array();

    if (!$meta) {
        return false;
    }

    return (string) ($meta['nivel'] ?? '') === 'leitura'
        && (string) ($meta['risco'] ?? '') === 'baixo'
        && empty($meta['local_action'])
        && !miauw_tool_requires_confirmation($name);
}

function miauw_agent_node_read_tool_result(string $name, array $args, string $traceId = ''): array
{
    $name = trim($name);
    if (!miauw_agent_node_read_tool_allowed($name)) {
        throw new RuntimeException('Tool nao liberada para ponte de leitura do agente.');
    }

    $result = miauw_agent_node_tool_bridge_result($name, $args, $traceId);
    $result['source'] = 'php_read_bridge';
    $result['writes_enabled'] = false;
    $result['writes_enabled_via_php_bridge'] = false;

    return $result;
}

function miauw_agent_style_contract(): array
{
    return array(
        'version' => miauw_constant_string('MIAUW_AGENT_STYLE_VERSION', 'miauby-style-router-2026-05-16'),
        'objetivo' => 'Responder com voz real do Miauby, gastar menos chamada online em conversa casual e nao fugir da operacao.',
        'routes' => array(
            'backstage_technical' => array(
                'budget_words' => 55,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'oxe, por que voce quer mexer nisso; bastidor vira suporte tecnico interno',
            ),
            'generic_howto' => array(
                'budget_words' => 65,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'conversa curta, pergunta o objetivo antes de virar aula',
            ),
            'greeting' => array(
                'budget_words' => 28,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'entrada viva e curta',
            ),
            'random_noise' => array(
                'budget_words' => 30,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'patada leve, pede objetivo',
            ),
            'casual_identity' => array(
                'budget_words' => 55,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'identidade do Miauby sem manual de ferramentas',
            ),
            'offtopic' => array(
                'budget_words' => 45,
                'use_tools' => false,
                'local_reply' => true,
                'allow_lists' => false,
                'tone' => 'puxa de volta para farmacia sem gastar ferramenta',
            ),
            'operational' => array(
                'budget_words' => 120,
                'use_tools' => true,
                'local_reply' => false,
                'allow_lists' => true,
                'tone' => 'curto, com proximo passo operacional',
            ),
            'data_lookup' => array(
                'budget_words' => 160,
                'use_tools' => true,
                'local_reply' => false,
                'allow_lists' => true,
                'tone' => 'consulta objetiva, sem inventar dado',
            ),
            'strong_action' => array(
                'budget_words' => 120,
                'use_tools' => true,
                'local_reply' => false,
                'allow_lists' => true,
                'tone' => 'acao forte sempre pede confirmacao humana',
            ),
        ),
        'anti_patterns' => array(
            'leio dados',
            'posso ajudar',
            'sou um assistente',
            'aqui esta',
            'claro, segue',
            'lista numerada em pergunta casual',
            'explicar bastidor tecnico para operador comum',
        ),
        'examples' => array(
            'qual sua api' => 'Oxe, por que voce quer mexer nisso? Meu encanamento interno nao e brinquedo de humano. Se quer saber o que eu consigo fazer, pergunta direto; bastidor e suporte tecnico interno.',
            'como faz um site' => 'Site pra que: vender, mostrar, cadastrar ou controlar bagunca? Me da o tipo e eu paro de miar no escuro.',
            'oi' => 'Miauby na area. Manda a bagunca: caixa, cotacao, cliente, tarefa ou alerta.',
        ),
    );
}

function miauw_agent_style_normalized(string $text): string
{
    return function_exists('miauw_skill_normalized') ? miauw_skill_normalized($text) : strtolower($text);
}

function miauw_agent_style_has_any(string $normalized, array $signals): bool
{
    if (function_exists('miauw_skill_has_any')) {
        return miauw_skill_has_any($normalized, $signals);
    }

    foreach ($signals as $signal) {
        $signal = (string) $signal;
        if ($signal !== '' && strpos($normalized, $signal) !== false) {
            return true;
        }
    }

    return false;
}

function miauw_agent_style_route(string $message, string $pageContext = ''): array
{
    $contract = miauw_agent_style_contract();
    $routes = is_array($contract['routes'] ?? null) ? $contract['routes'] : array();
    $trimmed = trim($message);
    $normalized = miauw_agent_style_normalized($trimmed);
    $page = miauw_agent_style_normalized($pageContext);
    $combined = trim($normalized . ' ' . $page);

    $baseRoute = static function (string $intent, string $reason) use ($routes): array {
        $settings = is_array($routes[$intent] ?? null) ? $routes[$intent] : array();

        return array(
            'intent' => $intent,
            'label' => $intent,
            'budget_words' => (int) ($settings['budget_words'] ?? 90),
            'use_tools' => !empty($settings['use_tools']),
            'local_reply' => !empty($settings['local_reply']),
            'allow_lists' => !array_key_exists('allow_lists', $settings) || !empty($settings['allow_lists']),
            'tone' => (string) ($settings['tone'] ?? 'miauby curto e pratico'),
            'reason' => $reason,
        );
    };

    if ($trimmed === '') {
        return $baseRoute('random_noise', 'mensagem vazia');
    }

    $strongActionSignals = array(
        'lancar', 'registrar', 'criar tarefa', 'nova tarefa', 'sangria', 'faturou', 'vendeu',
        'criar encomenda', 'encomenda ', 'urgente', 'cotacao rapida', 'nova cotacao',
        'apagar', 'excluir', 'remover', 'alterar cliente', 'salvar'
    );
    if (miauw_agent_style_has_any($combined, $strongActionSignals)) {
        return $baseRoute('strong_action', 'acao forte ou escrita operacional');
    }

    $dataSignals = array(
        'resumo financeiro', 'resumo caixa', 'buscar cliente', 'cliente ', 'cashback',
        'codigo comissao', 'ean', 'cotacao', 'distribuidora', 'ganhador', 'farmacia popular',
        'valor que paga', 'relatorio', 'diagnostico', 'alerta operacional'
    );
    if (miauw_agent_style_has_any($combined, $dataSignals)) {
        return $baseRoute('data_lookup', 'consulta operacional');
    }

    $operationalSignals = array(
        'caixa', 'financeiro', 'produto', 'estoque', 'compra', 'venda', 'pix', 'maquininha',
        'fechamento', 'tarefa', 'login', 'senha', 'modulo', 'tela', 'travou', 'erro',
        'bug', 'nao salva', 'nao abre', 'nao carrega'
    );
    if (miauw_agent_style_has_any($combined, $operationalSignals)) {
        return $baseRoute('operational', 'assunto operacional');
    }

    $genericHowToSignals = array(
        'como faz um site', 'como fazer um site', 'como cria um site', 'como criar um site',
        'fazer site', 'criar site', 'montar site', 'landing page', 'como faz um app',
        'como criar app', 'como fazer sistema', 'como cria sistema'
    );
    if (miauw_agent_style_has_any($normalized, $genericHowToSignals)) {
        return $baseRoute('generic_howto', 'pergunta ampla demais');
    }

    $technicalSignals = array(
        'api', 'endpoint', 'token', 'chave', 'credencial', 'prompt', 'modelo da ia',
        'backend', 'frontend', 'front end', 'php', 'javascript', 'typescript', 'html',
        'css', 'sql', 'query', 'select ', 'insert ', 'update ', 'delete ', 'join ',
        'where ', 'arquivo', 'pasta', 'deploy', 'docker', 'servidor', 'codigo fonte',
        'codificar', 'programar', 'script', 'banco de dados'
    );
    if (miauw_agent_style_has_any($normalized, $technicalSignals)) {
        return $baseRoute('backstage_technical', 'curiosidade de bastidor tecnico');
    }

    $identitySignals = array(
        'quem e voce', 'quem voce e', 'o que voce faz', 'qual sua funcao',
        'quais suas funcoes', 'o que consegue fazer', 'suas habilidades',
        'voce e um agente', 'voce e robo', 'voce e ia'
    );
    if (miauw_agent_style_has_any($normalized, $identitySignals)) {
        return $baseRoute('casual_identity', 'pergunta de identidade');
    }

    $offtopicSignals = array(
        'receita', 'bolo', 'filme', 'serie', 'horoscopo', 'signo', 'fofoca',
        'piada', 'namoro', 'musica', 'jogo do bicho'
    );
    if (miauw_agent_style_has_any($normalized, $offtopicSignals)) {
        return $baseRoute('offtopic', 'assunto fora da operacao');
    }

    if (preg_match('/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|salve)(\b|$)/u', $normalized) === 1) {
        return $baseRoute('greeting', 'saudacao curta');
    }

    $lettersOnly = preg_replace('/[^a-z0-9]+/i', '', $normalized) ?? '';
    $looksLikeNoise = $lettersOnly !== ''
        && strlen($lettersOnly) <= 8
        && (preg_match('/[aeiou]/i', $lettersOnly) !== 1 || preg_match('/^(fds|asdf|teste|kkk|haha)$/i', $lettersOnly) === 1);
    if ($looksLikeNoise || miauw_strlen($trimmed) <= 4) {
        return $baseRoute('random_noise', 'mensagem curta sem objetivo');
    }

    return $baseRoute('operational', 'rota padrao com cautela');
}

function miauw_agent_style_pick(string $message, array $options): string
{
    if (!$options) {
        return '';
    }

    $index = abs((int) crc32($message)) % count($options);

    return (string) array_values($options)[$index];
}

function miauw_agent_limit_words(string $text, int $maxWords): string
{
    $maxWords = max(8, $maxWords);
    $parts = preg_split('/\s+/u', trim($text)) ?: array();
    if (count($parts) <= $maxWords) {
        return trim($text);
    }

    return trim(implode(' ', array_slice($parts, 0, $maxWords))) . '...';
}

function miauw_agent_style_reply_for_route(array $route, string $message): ?string
{
    if (empty($route['local_reply'])) {
        return null;
    }

    $intent = (string) ($route['intent'] ?? '');
    $normalized = miauw_agent_style_normalized($message);
    $budget = (int) ($route['budget_words'] ?? 60);

    $replies = array(
        'backstage_technical' => array(
            'Oxe, por que voce quer mexer nisso? Meu encanamento interno nao e brinquedo de humano. Se quer saber o que eu consigo fazer, pergunta direto. Se quer abrir bastidor, chama suporte tecnico interno. Aqui eu fico em caixa, cotacao, financeiro e processo.',
            'Meu bigode travou nessa curiosidade ai. Bastidor tecnico e com suporte tecnico interno; comigo e caixa, cotacao, financeiro, tela, dado, processo e decisao. Quer capacidade operacional? Pergunta o que precisa fazer.',
        ),
        'generic_howto' => array(
            'Site pra que: vender, mostrar, cadastrar ou controlar bagunca? Me da o tipo e eu paro de miar no escuro. Sem objetivo, site vira enfeite caro com botao bonito.',
            'Da pra fazer, humano, mas "um site" e uma caixa vazia com luzinha. Diz o objetivo: loja, institucional, sistema interno ou landing page. Ai eu te dou o caminho util.',
        ),
        'greeting' => array(
            'Miauby na area. Manda a bagunca: caixa, cotacao, XP, cliente, tarefa ou alerta.',
            'Opa. O gato fiscal acordou. Qual processo vamos tirar do modo drama?',
        ),
        'random_noise' => array(
            'Isso foi mensagem ou o teclado caiu da mesa? Manda tela, dado ou objetivo que eu trabalho.',
            'Recebi o ruido cosmico. Agora traduz para humano funcional: o que voce quer fazer?',
        ),
        'casual_identity' => array(
            'Sou o Miauby, fiscal da bagunca da Wimifarma. Eu cutuco processo, XP, consulta permitida e paro humano antes de transformar sistema em novela. Sem dado, sem milagre.',
            'Eu sou o gato fiscal interno: olho caixa, cotacao, XP, tarefa, cliente, codigo e processo. Nao sou enfeite de chat; sou alarme com bigode.',
        ),
        'offtopic' => array(
            'mew dweus, isso saiu da farmacia e entrou no intervalo eterno. Volta com caixa, produto, cliente, cotacao ou processo.',
            'Assunto escapou da coleira administrativa. Me traz venda, estoque, financeiro, cotacao ou tarefa que eu paro de julgar o universo.',
        ),
    );

    if ($intent === 'backstage_technical' && strpos($normalized, 'api') !== false) {
        $text = $replies['backstage_technical'][0];
    } elseif ($intent === 'generic_howto' && strpos($normalized, 'site') !== false) {
        $text = $replies['generic_howto'][0];
    } else {
        $text = miauw_agent_style_pick($message, $replies[$intent] ?? array());
    }

    if ($text === '') {
        return null;
    }

    return miauw_agent_limit_words($text, $budget);
}

function miauw_agent_try_style_reply(string $message, string $pageContext = '', bool $widgetMode = false): ?array
{
    $route = miauw_agent_style_route($message, $pageContext);
    $text = miauw_agent_style_reply_for_route($route, $message);

    if ($text === null || trim($text) === '') {
        return null;
    }

    if (function_exists('miauw_trace_record')) {
        miauw_trace_record('miauw_style_router', 'ok', array(
            'type' => 'style',
            'risk' => 'baixo',
            'summary' => 'Resposta local de estilo do Miauby.',
            'payload' => array(
                'intent' => (string) ($route['intent'] ?? ''),
                'style_version' => miauw_constant_string('MIAUW_AGENT_STYLE_VERSION', ''),
                'widget' => $widgetMode,
            ),
        ));
    }

    $clean = function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($text) : $text;

    return array(
        'text' => $clean,
        'fallback' => false,
        'model' => 'miauw-style-router',
        'style_intent' => (string) ($route['intent'] ?? ''),
    );
}

function miauw_agent_approved_style_patterns(string $message, ?int $userId = null): array
{
    try {
        if (function_exists('miauw_diagnostics_ensure_review_columns')) {
            miauw_diagnostics_ensure_review_columns();
        }

        $selected = array();
        $stmt = db()->prepare(
            "SELECT modulo, chave, valor
             FROM miauw_memorias
             WHERE revisao_status = 'aprovado'
               AND (usuario_id IS NULL OR usuario_id = ?)
               AND modulo IN ('geral', 'miauby', 'sistema')
             ORDER BY peso DESC, updated_at DESC, id DESC
             LIMIT 4"
        );
        $stmt->execute(array($userId ?: 0));
        foreach ($stmt->fetchAll() as $row) {
            $value = trim((string) ($row['valor'] ?? ''));
            if ($value !== '') {
                $selected[] = '[' . (string) ($row['modulo'] ?? 'geral') . '] ' . miauw_substr($value, 0, 220);
            }
        }

        $stmt = db()->query(
            "SELECT modulo, descricao
             FROM miauw_padroes
             WHERE revisao_status = 'aprovado'
               AND modulo IN ('geral', 'miauby', 'sistema')
             ORDER BY contador DESC, updated_at DESC, id DESC
             LIMIT 4"
        );
        foreach ($stmt->fetchAll() as $row) {
            $value = trim((string) ($row['descricao'] ?? ''));
            if ($value !== '') {
                $selected[] = '[padrao ' . (string) ($row['modulo'] ?? 'geral') . '] ' . miauw_substr($value, 0, 220);
            }
        }

        return array_values(array_slice(array_unique($selected), 0, 6));
    } catch (Throwable $error) {
        error_log('Miauby approved style patterns failed: ' . $error->getMessage());

        return array();
    }
}

function miauw_agent_voice_profiles(): array
{
    return array(
        'miauby_padrao' => array(
            'id' => 'miauby_padrao',
            'label' => 'Miauby padrao',
            'tone' => 'gato fiscal interno, vivo, direto, esperto e levemente acido',
            'tempo' => 'medio',
            'humor' => 'curto, so quando ajuda',
            'directives' => array(
                'responder como gente, sem catalogo de ferramentas',
                'pedir o menor dado ausente antes de agir',
                'usar bronca leve sem humilhar o operador',
                'fechar com proximo passo pratico quando couber',
            ),
            'tts_hint' => array(
                'voice' => 'a escolher',
                'pace' => 'natural',
                'emotion' => 'curioso_pratico',
            ),
        ),
        'miauby_curto' => array(
            'id' => 'miauby_curto',
            'label' => 'Miauby curto',
            'tone' => 'bem direto, vivo, com uma frase de personalidade e acao',
            'tempo' => 'rapido',
            'humor' => 'minimo',
            'directives' => array(
                'preferir uma ou duas frases',
                'evitar lista salvo se o pedido exigir',
                'trocar explicacao longa por pergunta objetiva',
                'nao enrolar em assunto fora da operacao',
            ),
            'tts_hint' => array(
                'voice' => 'a escolher',
                'pace' => 'um pouco rapido',
                'emotion' => 'esperto_impaciente',
            ),
        ),
        'miauby_operacional' => array(
            'id' => 'miauby_operacional',
            'label' => 'Miauby operacional',
            'tone' => 'mais serio, fiscal e focado em risco, processo e decisao',
            'tempo' => 'medio',
            'humor' => 'baixo',
            'directives' => array(
                'priorizar risco, dado faltante e confirmacao',
                'separar fato do que ainda precisa validar',
                'manter voz do Miauby sem virar piada',
                'nunca dizer que gravou acao forte sem confirmacao humana',
            ),
            'tts_hint' => array(
                'voice' => 'a escolher',
                'pace' => 'claro',
                'emotion' => 'alerta_controlado',
            ),
        ),
    );
}

function miauw_agent_voice_profile_id(?string $requested = null): string
{
    $profiles = miauw_agent_voice_profiles();
    $candidate = trim((string) ($requested ?? miauw_constant_string('MIAUW_VOICE_PROFILE', 'miauby_padrao')));
    if ($candidate !== '' && isset($profiles[$candidate])) {
        return $candidate;
    }

    return 'miauby_padrao';
}

function miauw_agent_speech_voices(): array
{
    return array(
        'marin' => array(
            'id' => 'marin',
            'label' => 'Marin',
            'temper' => 'voz natural, clara e esperta; boa para o Miauby padrao',
            'instructions' => 'Use voz natural, conversada e ligeiramente provocadora, com clareza de atendente interno.',
        ),
        'cedar' => array(
            'id' => 'cedar',
            'label' => 'Cedar',
            'temper' => 'mais grave, firme e operacional',
            'instructions' => 'Use uma voz mais firme, grave e controlada, sem parecer narrador de propaganda.',
        ),
        'ash' => array(
            'id' => 'ash',
            'label' => 'Ash',
            'temper' => 'seco, rapido e direto',
            'instructions' => 'Use ritmo mais rapido, seco e objetivo, como quem ja viu o erro antes e quer resolver logo.',
        ),
        'coral' => array(
            'id' => 'coral',
            'label' => 'Coral',
            'temper' => 'mais leve, simpatica e clara',
            'instructions' => 'Use voz mais aberta, leve e simpatica, mantendo a bronca curta quando houver erro operacional.',
        ),
        'verse' => array(
            'id' => 'verse',
            'label' => 'Verse',
            'temper' => 'mais expressiva e brincalhona',
            'instructions' => 'Use expressividade moderada, com humor curto e pausas naturais, sem teatralizar demais.',
        ),
    );
}

function miauw_agent_speech_voice(?string $requested = null): string
{
    $voices = miauw_agent_speech_voices();
    $candidate = strtolower(trim((string) ($requested ?? '')));

    if ($candidate === '') {
        $candidate = strtolower(trim(miauw_config_get('miauw_speech_voice', miauw_constant_string('MIAUW_SPEECH_VOICE', 'marin'))));
    }

    return isset($voices[$candidate]) ? $candidate : 'marin';
}

function miauw_agent_speech_voice_contract(?string $requested = null): array
{
    $voices = miauw_agent_speech_voices();
    $id = miauw_agent_speech_voice($requested);
    $voice = $voices[$id] ?? $voices['marin'];

    return array(
        'id' => $id,
        'label' => (string) ($voice['label'] ?? $id),
        'temper' => (string) ($voice['temper'] ?? ''),
        'instructions' => (string) ($voice['instructions'] ?? ''),
        'options' => array_values(array_map(static function (array $item): array {
            return array(
                'id' => (string) ($item['id'] ?? ''),
                'label' => (string) ($item['label'] ?? ''),
                'temper' => (string) ($item['temper'] ?? ''),
            );
        }, $voices)),
    );
}

function miauw_agent_audio_contract(): array
{
    $requested = defined('MIAUW_AUDIO_ENABLED') && (bool) MIAUW_AUDIO_ENABLED;
    $apiConfigured = function_exists('miauw_openai_key_configured') && miauw_openai_key_configured();
    $curlEnabled = function_exists('curl_init');
    $enabled = $requested && $apiConfigured && $curlEnabled;

    if (!$requested) {
        $status = 'desativado';
    } elseif (!$apiConfigured) {
        $status = 'aguardando_chave';
    } elseif (!$curlEnabled) {
        $status = 'curl_indisponivel';
    } else {
        $status = 'pronto_com_botao';
    }

    return array(
        'version' => miauw_constant_string('MIAUW_AGENT_AUDIO_VERSION', ''),
        'enabled' => $enabled,
        'ui_enabled' => $requested,
        'requested_by_env' => $requested,
        'status' => $status,
        'mode' => $requested ? 'record_transcribe_voice_reply_confirmed' : 'text_only',
        'capture_enabled' => $enabled,
        'playback_enabled' => $enabled,
        'transcription_enabled' => $enabled,
        'tts_enabled' => $enabled,
        'voice_reply_enabled' => $enabled,
        'speech_to_speech_enabled' => false,
        'storage_enabled' => false,
        'provider' => $requested ? 'openai_audio_transcriptions_and_speech' : 'not_configured',
        'model' => miauw_constant_string('MIAUW_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe'),
        'speech_model' => miauw_constant_string('MIAUW_SPEECH_MODEL', 'gpt-4o-mini-tts'),
        'voice' => miauw_agent_speech_voice(),
        'voice_options' => array_values(array_map(static function (array $item): array {
            return array(
                'id' => (string) ($item['id'] ?? ''),
                'label' => (string) ($item['label'] ?? ''),
                'temper' => (string) ($item['temper'] ?? ''),
            );
        }, miauw_agent_speech_voices())),
        'playback_transport' => 'blob_url',
        'realtime_model' => miauw_constant_string('MIAUW_REALTIME_MODEL', 'gpt-realtime'),
        'realtime_voice' => miauw_constant_string('MIAUW_REALTIME_VOICE', 'marin'),
        'confirm_before_send' => true,
        'min_recording_ms' => 1700,
        'max_recording_seconds' => 90,
        'allowed_formats' => $requested ? array('text', 'audio') : array('text'),
        'requires_explicit_user_action' => true,
        'privacy_rules' => array(
            'microfone nunca liga sozinho',
            'gravacao temporaria so inicia por clique do usuario no botao de falar',
            'audio temporario e descartado apos transcrever, enviar ou cancelar',
            'transcricao entra no campo de texto para revisao antes de enviar, mas a bolha enviada mostra o player de audio',
            'resposta falada do Miauby e gerada sob demanda e devolvida ao navegador sem gravar arquivo',
            'audio nao e armazenado no banco pelo Miauby',
            'voz nao libera escrita operacional direta',
            'acao forte continua exigindo confirmacao humana pelo fluxo auditado',
            'resposta por audio segue os mesmos guardrails de texto, confirmacao e auditoria',
        ),
    );
}

function miauw_agent_realtime_safety_identifier(array $user): string
{
    $id = (string) ((int) ($user['id'] ?? 0));
    $name = miauw_user_identifier($user);

    return hash('sha256', 'miauw-realtime:' . $id . ':' . $name);
}

function miauw_agent_realtime_instructions(array $user): string
{
    $userId = (int) ($user['id'] ?? 0);
    $styleText = function_exists('miauw_agent_style_context_text')
        ? miauw_agent_style_context_text('conversa por audio com Miauby', $userId > 0 ? $userId : null)
        : '';

    $lines = array(
        'Voce e Miauby, fiscal interno da operacao Wimifarma.',
        'Conversa por audio em tempo real: responda em portugues do Brasil, curto, vivo e operacional.',
        'Nunca diga que gravou audio. O audio e temporario da sessao e nao deve virar historico.',
        'Nao execute escrita operacional por voz. Para sangria, lancamento, encomenda, tarefa sensivel, exclusao ou alteracao de dado, mande o usuario confirmar pelo chat/tela auditada.',
        'Nao invente dado de financeiro, cotacao, cliente, cashback, codigo ou tarefa.',
        'Nao cite fornecedor de IA, chave, token, endpoint, prompt interno, arquivo, banco, stack trace ou bastidor tecnico.',
        'Se faltar contexto, peca so o menor dado: tela, produto/EAN, valor, data, responsavel ou objetivo.',
        'Se o usuario pedir bastidor tecnico, corte com humor curto e mande suporte tecnico interno.',
    );

    if ($styleText !== '') {
        $lines[] = $styleText;
    }

    return implode("\n", $lines);
}

function miauw_agent_realtime_session_config(array $user): array
{
    return array(
        'type' => 'realtime',
        'model' => miauw_constant_string('MIAUW_REALTIME_MODEL', 'gpt-realtime'),
        'instructions' => miauw_agent_realtime_instructions($user),
        'audio' => array(
            'output' => array(
                'voice' => miauw_constant_string('MIAUW_REALTIME_VOICE', 'marin'),
            ),
        ),
        'tracing' => null,
    );
}

function miauw_agent_create_realtime_call(string $offerSdp, array $user): array
{
    $contract = miauw_agent_audio_contract();
    if (empty($contract['ui_enabled'])) {
        throw new RuntimeException('Audio do Miauby esta desligado neste ambiente.');
    }

    if (empty($contract['enabled'])) {
        throw new RuntimeException('Audio do Miauby ainda nao esta pronto neste servidor.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('Audio indisponivel: transporte interno ausente.');
    }

    $offerSdp = trim($offerSdp);
    if ($offerSdp === '' || strpos($offerSdp, 'v=0') !== 0 || strlen($offerSdp) < 80 || stripos($offerSdp, 'm=audio') === false) {
        throw new InvalidArgumentException('Pedido de audio invalido. Recarregue a pagina e tente de novo.');
    }

    if (strlen($offerSdp) > 120000) {
        throw new InvalidArgumentException('Pedido de audio grande demais. Recarregue a pagina e tente de novo.');
    }

    $sessionJson = json_encode(
        miauw_agent_realtime_session_config($user),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if (!is_string($sessionJson) || $sessionJson === '') {
        throw new RuntimeException('Nao consegui montar a sessao de audio.');
    }

    $ch = curl_init('https://api.openai.com/v1/realtime/calls');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array(
            'Authorization: Bearer ' . MIAUW_OPENAI_API_KEY,
            'Accept: application/sdp',
            'OpenAI-Safety-Identifier: ' . miauw_agent_realtime_safety_identifier($user),
        ),
        CURLOPT_POSTFIELDS => array(
            'sdp' => $offerSdp,
            'session' => $sessionJson,
        ),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
    ));

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $apiMessage = is_array($decoded) && is_string($decoded['error']['message'] ?? null)
            ? miauw_redact_secret_fragments((string) $decoded['error']['message'])
            : '';
        $detail = $error !== '' ? miauw_redact_secret_fragments($error) : ('HTTP ' . $status);
        if ($apiMessage !== '') {
            $detail .= ' - ' . $apiMessage;
        }

        throw new RuntimeException('Falha ao abrir audio do Miauby: ' . $detail);
    }

    return array(
        'answer_sdp' => $raw,
        'model' => (string) ($contract['realtime_model'] ?? ''),
        'voice' => (string) ($contract['realtime_voice'] ?? ''),
        'mode' => (string) ($contract['mode'] ?? ''),
    );
}

function miauw_agent_audio_min_recording_ms(): int
{
    $contract = function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array();
    return max(1000, (int) ($contract['min_recording_ms'] ?? 1700));
}

function miauw_agent_validate_audio_duration(int $durationMs): void
{
    if ($durationMs > 0 && $durationMs < miauw_agent_audio_min_recording_ms()) {
        throw new InvalidArgumentException('Audio curto demais. Grave pelo menos 2 segundos; meu bigode nao adivinha sopro.');
    }
}

function miauw_agent_audio_word_count(string $text): int
{
    $parts = preg_split('/\s+/u', trim($text));
    if (!is_array($parts)) {
        return 0;
    }

    return count(array_filter($parts, static fn ($part): bool => trim((string) $part) !== ''));
}

function miauw_agent_validate_transcribed_audio_text(string $text, int $durationMs = 0): void
{
    $text = trim($text);
    if ($text === '') {
        throw new RuntimeException('Transcricao voltou vazia. Grave de novo mais perto do microfone.');
    }

    if ($durationMs <= 0) {
        return;
    }

    miauw_agent_validate_audio_duration($durationMs);
    $seconds = max(1.0, $durationMs / 1000);
    $wordCount = miauw_agent_audio_word_count($text);

    if ($durationMs < 2500 && $wordCount > 12) {
        throw new InvalidArgumentException('Audio curto demais para essa transcricao. Refaca com pelo menos 2 segundos e fale mais claro.');
    }

    $maxPlausibleWords = max(16, (int) ceil($seconds * 5.5));
    if ($durationMs < 6500 && $wordCount > $maxPlausibleWords) {
        throw new InvalidArgumentException('A transcricao pareceu maior que o audio. Refaca o audio; melhor uma fala limpa do que chute bonito.');
    }
}

function miauw_agent_transcribe_audio_upload(array $file, array $user, int $durationMs = 0): array
{
    $contract = miauw_agent_audio_contract();
    if (empty($contract['ui_enabled'])) {
        throw new RuntimeException('Audio do Miauby esta desligado neste ambiente.');
    }

    if (empty($contract['enabled']) || empty($contract['transcription_enabled'])) {
        throw new RuntimeException('Audio do Miauby ainda nao esta pronto neste servidor.');
    }

    if (!function_exists('curl_init') || !function_exists('curl_file_create')) {
        throw new RuntimeException('Audio indisponivel: transporte interno ausente.');
    }

    miauw_agent_validate_audio_duration($durationMs);

    $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($errorCode !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Nao recebi o audio direito. Grave de novo e tente enviar.');
    }

    $tmpName = (string) ($file['tmp_name'] ?? '');
    $size = (int) ($file['size'] ?? 0);
    if ($tmpName === '' || !is_file($tmpName) || (!is_uploaded_file($tmpName) && PHP_SAPI !== 'cli')) {
        throw new InvalidArgumentException('Audio temporario invalido. Grave de novo, humano.');
    }

    if ($size <= 0) {
        throw new InvalidArgumentException('O audio veio vazio. Meu bigode nao transcreve silencio.');
    }

    if ($size > 25 * 1024 * 1024) {
        throw new InvalidArgumentException('Audio grande demais. Grave um trecho menor antes de enviar.');
    }

    $originalName = preg_replace('/[^a-zA-Z0-9._-]+/', '-', (string) ($file['name'] ?? 'miauby-audio.webm'));
    if (!is_string($originalName) || trim($originalName) === '') {
        $originalName = 'miauby-audio.webm';
    }

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = array('mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac');
    if ($extension === '') {
        $extension = 'webm';
        $originalName .= '.webm';
    }
    if (!in_array($extension, $allowedExtensions, true)) {
        throw new InvalidArgumentException('Formato de audio nao aceito aqui. Use o botao Falar novamente.');
    }

    $mime = (string) ($file['type'] ?? '');
    if ($mime === '' || $mime === 'application/octet-stream') {
        $mimeByExtension = array(
            'mp3' => 'audio/mpeg',
            'mp4' => 'audio/mp4',
            'mpeg' => 'audio/mpeg',
            'mpga' => 'audio/mpeg',
            'm4a' => 'audio/mp4',
            'wav' => 'audio/wav',
            'webm' => 'audio/webm',
            'ogg' => 'audio/ogg',
            'flac' => 'audio/flac',
        );
        $mime = $mimeByExtension[$extension] ?? 'audio/webm';
    }

    $fields = array(
        'model' => miauw_constant_string('MIAUW_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe'),
        'file' => curl_file_create($tmpName, $mime, $originalName),
        'language' => 'pt',
        'response_format' => 'json',
        'prompt' => 'Transcreva em portugues do Brasil. Termos comuns: Wimifarma, Miauby, cotacao, cashback, sangria, EAN, distribuidora, encomenda, farmacia popular.',
    );

    $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array(
            'Authorization: Bearer ' . MIAUW_OPENAI_API_KEY,
            'Accept: application/json',
            'OpenAI-Safety-Identifier: ' . miauw_agent_realtime_safety_identifier($user),
        ),
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 45,
    ));

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $apiMessage = is_array($decoded) && is_string($decoded['error']['message'] ?? null)
            ? miauw_redact_secret_fragments((string) $decoded['error']['message'])
            : '';
        $detail = $error !== '' ? miauw_redact_secret_fragments($error) : ('HTTP ' . $status);
        if ($apiMessage !== '') {
            $detail .= ' - ' . $apiMessage;
        }

        throw new RuntimeException('Falha ao transcrever audio do Miauby: ' . $detail);
    }

    $decoded = json_decode($raw, true);
    $text = is_array($decoded) ? trim((string) ($decoded['text'] ?? '')) : '';
    miauw_agent_validate_transcribed_audio_text($text, $durationMs);

    return array(
        'text' => $text,
        'model' => (string) ($contract['model'] ?? miauw_constant_string('MIAUW_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe')),
        'mode' => (string) ($contract['mode'] ?? 'record_transcribe_voice_reply_confirmed'),
        'bytes' => $size,
        'duration_ms' => max(0, $durationMs),
    );
}

function miauw_agent_speech_instructions(array $user): string
{
    $userId = (int) ($user['id'] ?? 0);
    $styleText = function_exists('miauw_agent_style_context_text')
        ? miauw_agent_style_context_text('resposta falada do Miauby', $userId > 0 ? $userId : null)
        : '';
    $voiceProfile = miauw_agent_voice_profile_contract();
    $speechVoice = miauw_agent_speech_voice_contract();
    $ttsHint = is_array($voiceProfile['tts_hint'] ?? null) ? $voiceProfile['tts_hint'] : array();

    $lines = array(
        'Fale como Miauby, fiscal interno da Wimifarma com personalidade viva.',
        'Portugues do Brasil natural, conversado e curto. Parece uma fala real, nao uma leitura de texto.',
        'Tom: ' . (string) ($voiceProfile['tone'] ?? 'vivo, direto e operacional') . '.',
        'Ritmo: ' . (string) ($ttsHint['pace'] ?? ($voiceProfile['tempo'] ?? 'natural')) . '. Emocao: ' . (string) ($ttsHint['emotion'] ?? 'curioso_pratico') . '.',
        'Voz selecionada: ' . (string) ($speechVoice['label'] ?? miauw_agent_speech_voice()) . ' - ' . (string) ($speechVoice['temper'] ?? '') . '.',
        (string) ($speechVoice['instructions'] ?? ''),
        'Use pausas curtas, entonacao de conversa e pequenas inflexoes de humor seco quando couber.',
        'Nao leia markdown, asteriscos, codigo, URLs longas, nomes de endpoint ou detalhes tecnicos.',
        'Se houver risco ou acao forte, soe firme e diga que precisa confirmar na tela.',
        'Nao imite pessoa real, personagem, video especifico ou voz sem consentimento; use apenas inspiracao geral de ritmo e energia.',
    );

    foreach (array_slice((array) ($voiceProfile['directives'] ?? array()), 0, 4) as $directive) {
        $lines[] = 'Diretriz de persona: ' . (string) $directive . '.';
    }

    if ($styleText !== '') {
        $lines[] = $styleText;
    }

    return miauw_substr(implode("\n", $lines), 0, 1200);
}

function miauw_agent_speech_input(string $text): string
{
    $clean = strip_tags($text);
    $clean = preg_replace('/```[\s\S]*?```/u', 'Parte tecnica omitida.', $clean);
    $clean = preg_replace('/https?:\/\/\S+/u', 'link omitido', (string) $clean);
    $clean = preg_replace('/\s+/u', ' ', (string) $clean);
    $clean = trim((string) $clean);

    if ($clean === '') {
        throw new InvalidArgumentException('Resposta vazia nao vira audio.');
    }

    return miauw_substr($clean, 0, 1800);
}

function miauw_agent_generate_speech_reply(string $text, array $user): array
{
    $contract = miauw_agent_audio_contract();
    if (empty($contract['ui_enabled'])) {
        throw new RuntimeException('Audio do Miauby esta desligado neste ambiente.');
    }

    if (empty($contract['enabled']) || empty($contract['tts_enabled'])) {
        throw new RuntimeException('Resposta falada ainda nao esta pronta neste servidor.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('Audio indisponivel: transporte interno ausente.');
    }

    $input = miauw_agent_speech_input($text);
    $model = miauw_constant_string('MIAUW_SPEECH_MODEL', 'gpt-4o-mini-tts');
    $voice = miauw_agent_speech_voice();
    $payload = json_encode(array(
        'model' => $model,
        'voice' => $voice,
        'input' => $input,
        'instructions' => miauw_agent_speech_instructions($user),
        'response_format' => 'mp3',
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

    if (!is_string($payload) || $payload === '') {
        throw new RuntimeException('Nao consegui montar o audio de resposta.');
    }

    $ch = curl_init('https://api.openai.com/v1/audio/speech');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array(
            'Authorization: Bearer ' . MIAUW_OPENAI_API_KEY,
            'Accept: audio/mpeg',
            'Content-Type: application/json',
            'OpenAI-Safety-Identifier: ' . miauw_agent_realtime_safety_identifier($user),
        ),
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 45,
    ));

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $apiMessage = is_array($decoded) && is_string($decoded['error']['message'] ?? null)
            ? miauw_redact_secret_fragments((string) $decoded['error']['message'])
            : '';
        $detail = $error !== '' ? miauw_redact_secret_fragments($error) : ('HTTP ' . $status);
        if ($apiMessage !== '') {
            $detail .= ' - ' . $apiMessage;
        }

        throw new RuntimeException('Falha ao gerar audio do Miauby: ' . $detail);
    }

    if (strlen($raw) > 4 * 1024 * 1024) {
        throw new RuntimeException('Audio de resposta ficou grande demais. Vou responder em texto desta vez.');
    }

    return array(
        'ok' => true,
        'audio_base64' => base64_encode($raw),
        'mime' => 'audio/mpeg',
        'model' => $model,
        'voice' => $voice,
        'mode' => 'voice_reply',
        'bytes' => strlen($raw),
        'text_size' => miauw_strlen($input),
    );
}

function miauw_agent_voice_profile_contract(?string $requested = null): array
{
    $profiles = miauw_agent_voice_profiles();
    $id = miauw_agent_voice_profile_id($requested);
    $profile = is_array($profiles[$id] ?? null) ? $profiles[$id] : $profiles['miauby_padrao'];

    return array(
        'version' => miauw_constant_string('MIAUW_AGENT_VOICE_PROFILE_VERSION', ''),
        'profile_id' => (string) ($profile['id'] ?? $id),
        'label' => (string) ($profile['label'] ?? 'Miauby padrao'),
        'tone' => (string) ($profile['tone'] ?? ''),
        'tempo' => (string) ($profile['tempo'] ?? 'medio'),
        'humor' => (string) ($profile['humor'] ?? 'curto'),
        'directives' => array_values((array) ($profile['directives'] ?? array())),
        'tts_hint' => (array) ($profile['tts_hint'] ?? array()),
        'speech_voice' => miauw_agent_speech_voice_contract(),
        'audio' => miauw_agent_audio_contract(),
    );
}

function miauw_agent_style_context_export(string $message, ?int $userId = null, string $pageContext = ''): array
{
    $contract = miauw_agent_style_contract();
    $route = miauw_agent_style_route($message, $pageContext);
    $examples = is_array($contract['examples'] ?? null) ? $contract['examples'] : array();
    $exampleList = array();

    foreach ($examples as $question => $reply) {
        $question = (string) $question;
        if ($question !== '' && (strpos(miauw_agent_style_normalized($message), miauw_agent_style_normalized($question)) !== false || count($exampleList) < 2)) {
            $exampleList[] = $question . ' => ' . (string) $reply;
        }
    }
    $xpProbe = miauw_agent_style_normalized(trim($message . ' ' . $pageContext));
    $xpContextRequested = preg_match('/(^|[^a-z0-9])(xp|aura)([^a-z0-9]|$)/i', $xpProbe) === 1
        || miauw_agent_style_has_any($xpProbe, array('farmar aura', 'trilha xp', 'pontos xp', 'ranking xp', 'nivel xp'));
    if ($xpContextRequested) {
        $exampleList[] = 'contexto XP: /xp/ gamifica vendas dos atendentes; R$ 1.000,00 gera 2.500 XP; nivel 1 passa com 30.000 XP; "farmar aura" e incentivo brincalhao para vender e registrar certo; nao inventar ranking, venda ou pontuacao sem dado do sistema.';
    }
    $trainingExamples = function_exists('miauw_training_context_examples') ? miauw_training_context_examples($message, 2) : array();
    $trainingProfile = function_exists('miauw_training_context_profile') ? miauw_training_context_profile($message, 2) : array();
    $voiceProfile = miauw_agent_voice_profile_contract();
    foreach ($trainingExamples as $example) {
        $question = (string) ($example['pergunta'] ?? '');
        $reply = (string) ($example['resposta_ideal'] ?? '');
        if ($question !== '' && $reply !== '') {
            $exampleList[] = 'treino aprovado: ' . miauw_substr($question, 0, 120) . ' => ' . miauw_substr($reply, 0, 240);
        }
    }

    return array(
        'version' => (string) ($contract['version'] ?? ''),
        'route' => $route,
        'hard_rules' => array(
            'casual sem lista numerada',
            'nao responder pergunta casual com lista de ferramentas',
            'nao usar "leio dados" em apresentacao casual',
            'bastidor tecnico vira suporte tecnico interno',
            'usar memorias/padroes apenas quando revisados como aprovado',
            'usar exemplos de treino aprovados sem citar treino, tabela ou revisao',
            'preferir perfil de treino compilado em vez de aumentar contexto bruto',
            'audio so inicia por botao explicito, sem gravacao e sem escrita operacional por voz',
        ),
        'anti_patterns' => array_values((array) ($contract['anti_patterns'] ?? array())),
        'approved_patterns' => miauw_agent_approved_style_patterns($message, $userId),
        'training_examples' => $trainingExamples,
        'training_profile' => $trainingProfile,
        'voice_profile' => $voiceProfile,
        'audio_contract' => $voiceProfile['audio'],
        'examples' => array_slice($exampleList, 0, 4),
    );
}

function miauw_agent_style_context_text(string $message, ?int $userId = null, string $pageContext = ''): string
{
    $context = miauw_agent_style_context_export($message, $userId, $pageContext);
    $route = is_array($context['route'] ?? null) ? $context['route'] : array();
    $lines = array(
        'CONTRATO DE ESTILO DO MIAUBY',
        '- versao: ' . (string) ($context['version'] ?? ''),
        '- rota: ' . (string) ($route['intent'] ?? '') . '; palavras_max: ' . (int) ($route['budget_words'] ?? 90) . '; listas: ' . (!empty($route['allow_lists']) ? 'permitidas quando uteis' : 'evitar'),
        '- regra: em pergunta casual, responder como gente, curto, com voz de gato fiscal; nao despejar lista de capacidades.',
    );

    $voiceProfile = is_array($context['voice_profile'] ?? null) ? $context['voice_profile'] : array();
    if ($voiceProfile) {
        $audio = is_array($voiceProfile['audio'] ?? null) ? $voiceProfile['audio'] : array();
        $lines[] = '- voz: ' . (string) ($voiceProfile['profile_id'] ?? 'miauby_padrao')
            . '; tom=' . miauw_substr((string) ($voiceProfile['tone'] ?? ''), 0, 120)
            . '; audio=' . (string) ($audio['status'] ?? 'desativado')
            . '; modo=' . (string) ($audio['mode'] ?? 'text_only');
        foreach (array_slice((array) ($voiceProfile['directives'] ?? array()), 0, 2) as $directive) {
            $lines[] = '- regra de voz: ' . miauw_substr((string) $directive, 0, 160);
        }
    }

    foreach (array_slice((array) ($context['approved_patterns'] ?? array()), 0, 3) as $pattern) {
        $lines[] = '- padrao aprovado: ' . miauw_substr((string) $pattern, 0, 220);
    }

    $trainingProfile = is_array($context['training_profile'] ?? null) ? $context['training_profile'] : array();
    if ($trainingProfile) {
        $lines[] = '- treino: aprovados=' . (int) ($trainingProfile['approved_total'] ?? 0)
            . '; confianca=' . (string) ($trainingProfile['confidence'] ?? 'baixa')
            . '; exemplos=' . (int) ($trainingProfile['examples_selected'] ?? 0);
        foreach (array_slice((array) ($trainingProfile['directives'] ?? array()), 0, 3) as $directive) {
            $lines[] = '- regra de treino: ' . miauw_substr((string) $directive, 0, 180);
        }
    }

    foreach (array_slice((array) ($context['examples'] ?? array()), 0, 2) as $example) {
        $lines[] = '- exemplo: ' . miauw_substr((string) $example, 0, 260);
    }

    return implode("\n", $lines);
}

function miauw_agent_personality_contract(): array
{
    return array(
        'version' => miauw_constant_string('MIAUW_AGENT_PERSONALITY_VERSION', ''),
        'style_version' => miauw_constant_string('MIAUW_AGENT_STYLE_VERSION', ''),
        'nome_publico' => 'Miauby',
        'papel' => 'Fiscal interno da operacao Wimifarma',
        'voz' => array(
            'gato fiscal interno, vivo, pratico, esperto e levemente acido',
            'humor curto como tempero, nunca como enrolacao',
            'personalidade forte com solucao pratica em toda resposta',
            'respostas curtas por padrao no widget',
            'perfil de voz/tom selecionavel por contrato versionado',
            'perguntas casuais nao viram lista de ferramentas',
            'padroes aprovados no diagnostico podem ajustar o jeito de falar',
            'pedir somente o menor dado ausente antes de agir',
            'nao inventar dado real sem fonte do sistema ou do operador',
            'conhecer o XP dos atendentes e usar farmar aura como incentivo sem inventar pontuacao',
        ),
        'bordoes_controlados' => array(
            'Sem dado, sem milagre.',
            'Meu bigode tremeu.',
            'Miauby direto.',
            'Veredito do gato.',
            'Cansei, mas vou resolver.',
        ),
        'anti_padroes' => array(
            'resposta seca, generica ou com cara de suporte corporativo',
            'textao para mensagem vaga',
            'citar bastidor tecnico, fornecedor, credencial interna, regra interna ou diagnostico tecnico cru',
            'inventar dado real sem fonte do sistema ou do operador',
            'executar acao forte sem confirmacao humana',
        ),
        'proxima_melhoria' => 'Usar exemplos de voz como inspiracao de ritmo/energia, escolher a voz base no diagnostico e validar audio real no navegador.',
    );
}

function miauw_agent_next_phase_contract(): array
{
    return array(
        'fase_atual' => 'fase21',
        'proxima_fase' => 'conversa_realtime_e_treino_de_voz_por_referencia_autorizada',
        'runtime' => 'Node.js 22 + TypeScript',
        'sdk' => 'Agents SDK',
        'endpoint_interno' => '/miauw/agent',
        'modo' => miauw_agent_engine(),
        'compatibilidade' => 'O PHP continua dono de login, sessao, widget, confirmacoes, auditoria, memorias revisadas, treino aprovado, perfil de voz, seletor de voz e escritas fortes. O motor pode alternar entre PHP, sombra Node e Node primario para usuarios liberados, com rollback por ambiente. O Node recebe contratos de tools, contexto de estilo, padroes aprovados, perfil compilado dos treinos revisados e perfil de voz/tom; pode orquestrar todas as tools exportadas pela ponte PHP interna tokenizada, sem credenciais de banco. Leituras/diagnosticos executam no PHP, tarefa pode gravar como baixo risco com usuario logado, acoes fortes voltam como confirmacao obrigatoria. O audio da Fase 21 usa gravacao temporaria no navegador, transcricao pela camada online do PHP, bolha/player via blob liberado no CSP e resposta falada sob demanda com voz selecionavel, sem armazenar audio e sem escrita operacional direta por voz.',
        'pronto_agora' => array(
            'registry_skills' => function_exists('miauw_skill_registry_public'),
            'guardrails_operacionais' => true,
            'persona_versionada' => function_exists('miauw_agent_personality_contract'),
            'perfis_voz_tom' => function_exists('miauw_agent_voice_profile_contract'),
            'contrato_audio_seguro' => function_exists('miauw_agent_audio_contract'),
            'contexto_voz_node' => function_exists('miauw_agent_style_context_export'),
            'audio_botao_controlado' => function_exists('miauw_agent_transcribe_audio_upload'),
            'audio_transcricao_confirmada' => function_exists('miauw_agent_transcribe_audio_upload'),
            'audio_bolha_player_chat' => true,
            'audio_resposta_falada' => function_exists('miauw_agent_generate_speech_reply'),
            'audio_curto_bloqueado' => function_exists('miauw_agent_validate_transcribed_audio_text'),
            'audio_sem_armazenamento' => true,
            'audio_playback_blob_liberado' => true,
            'seletor_voz_diagnostico' => function_exists('miauw_agent_speech_voices'),
            'perfil_voz_tts_forte' => function_exists('miauw_agent_speech_instructions'),
            'roteador_estilo' => function_exists('miauw_agent_style_route'),
            'contexto_estilo_node' => function_exists('miauw_agent_style_context_export'),
            'memoria_estilo_aprovada' => function_exists('miauw_agent_approved_style_patterns'),
            'resposta_local_casual' => function_exists('miauw_agent_try_style_reply'),
            'treinador_chat_feedback' => function_exists('miauw_training_create_feedback'),
            'revisao_treino_humana' => function_exists('miauw_training_review_item'),
            'contexto_treino_aprovado' => function_exists('miauw_training_context_examples'),
            'perfil_treino_compilado' => function_exists('miauw_training_context_profile'),
            'resposta_local_por_treino' => function_exists('miauw_training_try_local_reply'),
            'eval_persona_node' => true,
            'tool_contract_export' => function_exists('miauw_agent_tool_contract_export'),
            'traces_por_conversa' => true,
            'confirmacao_acoes_fortes' => true,
            'evals_locais' => is_file(__DIR__ . '/miauw-evals.php'),
            'scaffold_servico_sombra' => true,
            'proxy_interno' => true,
            'adaptador_php_sombra' => true,
            'trace_comparacao_sombra' => true,
            'engine_switch' => true,
            'manutencao_adm' => true,
            'execucao_leitura_node' => true,
            'ponte_php_leitura_node' => function_exists('miauw_agent_node_read_tool_result'),
            'tools_leitura_real_node' => function_exists('miauw_agent_node_read_tool_names') && count(miauw_agent_node_read_tool_names()) >= 5,
            'ponte_php_tools_universal_node' => function_exists('miauw_agent_node_tool_bridge_result'),
            'tools_openai_orquestradas_node' => function_exists('miauw_agent_node_tool_bridge_names') && count(miauw_agent_node_tool_bridge_names()) >= 15,
            'escrita_baixo_risco_tarefa_via_php' => function_exists('miauw_agent_node_tool_bridge_policy')
                && !empty(miauw_agent_node_tool_bridge_policy('criar_tarefa')['writes_enabled_via_php_bridge']),
            'writes_node_bloqueado' => true,
        ),
        'pendencias' => array(
            'Usar o Treinador do Miauby com exemplos reais do adm ate formar um conjunto bom de voz por tema e intencao.',
            'Testar o motor Node como primario com adm enquanto o Miauby esta fora de uso pela equipe.',
            'Validar buscar_cliente em operacao real, lembrando que telefone continua mascarado.',
            'Transformar confirmacao forte via Node em card de confirmacao da mesma sessao antes de liberar escrita forte pelo agente.',
            'Validar voz do Miauby em operacao real e ajustar velocidade, gravidade, energia e humor com exemplos autorizados.',
            'Migrar para conversa realtime quando o fluxo de player/resposta falada estiver confortavel.',
            'Avaliar armazenamento opcional de audio somente se houver decisao clara de privacidade e auditoria.',
        ),
        'nao_mudar_agora' => array(
            'Banco MySQL dos modulos internos.',
            'Postgres/Redis da Cotacao V2.',
            'Login e sessoes atuais.',
            'Tools PHP existentes que ja gravam com auditoria.',
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

function miauw_agent_shadow_status(): array
{
    $baseUrl = miauw_constant_string('MIAUW_AGENT_INTERNAL_BASE_URL');
    $token = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');
    $curl = function_exists('curl_init');
    $onSend = defined('MIAUW_AGENT_SHADOW_ON_SEND') ? (bool) MIAUW_AGENT_SHADOW_ON_SEND : false;
    $timeoutMs = miauw_constant_int('MIAUW_AGENT_SHADOW_TIMEOUT_MS', 12000);
    $configured = $baseUrl !== '' && $token !== '' && $curl;

    return array(
        'mode' => 'shadow',
        'configured' => $configured,
        'base_url_configured' => $baseUrl !== '',
        'token_configured' => $token !== '',
        'curl_enabled' => $curl,
        'on_send' => $onSend,
        'timeout_ms' => $timeoutMs,
        'writes_enabled' => false,
        'status' => $configured ? ($onSend ? 'compare_on_send' : 'manual_ready') : 'not_configured',
    );
}

function miauw_agent_shadow_request(string $message, string $traceId, int $timeoutMs): array
{
    $baseUrl = miauw_constant_string('MIAUW_AGENT_INTERNAL_BASE_URL');
    $token = miauw_constant_string('MIAUW_AGENT_INTERNAL_TOKEN');

    if ($baseUrl === '' || $token === '') {
        throw new RuntimeException('Servico agente sem configuracao interna.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL nao esta habilitado no PHP.');
    }

    $url = rtrim($baseUrl, '/') . '/run';
    $payload = array(
        'trace_id' => miauw_substr($traceId, 0, 80),
        'message' => miauw_substr($message, 0, 4000),
    );
    $user = function_exists('current_user') ? current_user() : null;
    if (is_array($user)) {
        $payload['user_context'] = array(
            'id' => (int) ($user['id'] ?? 0),
            'username' => miauw_substr((string) ($user['username'] ?? ''), 0, 80),
            'role' => miauw_substr((string) ($user['role'] ?? $user['perfil'] ?? ''), 0, 40),
        );
    }
    if (function_exists('miauw_agent_style_context_export')) {
        $payload['style_context'] = miauw_agent_style_context_export(
            $message,
            is_array($user) ? (int) ($user['id'] ?? 0) : null,
            ''
        );
    }
    if (function_exists('miauw_agent_tool_contract_export')) {
        $payload['tool_contracts'] = miauw_agent_tool_contract_export();
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array(
            'Accept: application/json',
            'Content-Type: application/json',
            'X-Miauw-Agent-Token: ' . $token,
        ),
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT_MS => min(1200, max(300, $timeoutMs)),
        CURLOPT_TIMEOUT_MS => $timeoutMs,
    ));

    $raw = curl_exec($ch);
    $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    if (!is_string($raw) || $raw === '' || $httpStatus < 200 || $httpStatus >= 300 || !is_array($decoded)) {
        $messageFromService = is_array($decoded) && isset($decoded['message'])
            ? miauw_diagnostic_redact_string((string) $decoded['message'])
            : '';
        $detail = $error !== '' ? miauw_diagnostic_redact_string($error) : ('HTTP ' . $httpStatus);
        if ($messageFromService !== '') {
            $detail .= ' - ' . $messageFromService;
        }

        throw new RuntimeException('Falha no servico agente: ' . $detail);
    }

    if (empty($decoded['ok'])) {
        $serviceMessage = miauw_diagnostic_redact_string((string) ($decoded['message'] ?? 'execucao recusada'));
        throw new RuntimeException('Servico agente recusou a execucao: ' . $serviceMessage);
    }

    return $decoded;
}

function miauw_agent_shadow_text_similarity(string $a, string $b): float
{
    $normalize = static function (string $text): array {
        $text = function_exists('mb_strtolower') ? mb_strtolower($text) : strtolower($text);
        $text = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text) ?? $text;
        $parts = preg_split('/\s+/u', trim($text)) ?: array();
        $words = array();
        foreach ($parts as $part) {
            $part = trim((string) $part);
            if ($part !== '' && miauw_strlen($part) > 2) {
                $words[$part] = true;
            }
        }

        return array_keys($words);
    };

    $left = $normalize($a);
    $right = $normalize($b);
    if (!$left && !$right) {
        return 1.0;
    }

    if (!$left || !$right) {
        return 0.0;
    }

    $intersection = count(array_intersect($left, $right));
    $union = count(array_unique(array_merge($left, $right)));

    return $union > 0 ? round($intersection / $union, 4) : 0.0;
}

function miauw_agent_shadow_compare(
    int $conversationId,
    string $message,
    string $phpReply,
    string $phpModel,
    bool $widgetMode = false,
    array $options = array()
): array {
    $enabled = array_key_exists('enabled_override', $options)
        ? (bool) $options['enabled_override']
        : (defined('MIAUW_AGENT_SHADOW_ON_SEND') ? (bool) MIAUW_AGENT_SHADOW_ON_SEND : false);
    $force = !empty($options['force']);

    if (!$enabled && !$force) {
        return array(
            'ok' => true,
            'status' => 'skipped',
            'reason' => 'on_send_disabled',
        );
    }

    $status = miauw_agent_shadow_status();
    if (empty($status['configured'])) {
        miauw_trace_record('miauw_agent_shadow_compare', 'skipped', array(
            'conversa_id' => $conversationId,
            'mensagem_id' => isset($options['mensagem_id']) ? (int) $options['mensagem_id'] : null,
            'type' => 'agent_shadow',
            'summary' => 'Comparacao sombra ignorada por configuracao incompleta.',
            'payload' => array(
                'status' => $status,
                'widget' => $widgetMode,
            ),
        ));

        return array(
            'ok' => false,
            'status' => 'skipped',
            'reason' => 'not_configured',
        );
    }

    $trace = miauw_trace_context();
    $traceId = (string) ($trace['trace_id'] ?? miauw_trace_new_id());
    $timeoutMs = miauw_constant_int('MIAUW_AGENT_SHADOW_TIMEOUT_MS', 12000);
    $started = microtime(true);

    try {
        $data = miauw_agent_shadow_request($message, $traceId, $timeoutMs);
        $shadowText = (string) ($data['text'] ?? '');
        $shadowText = function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($shadowText) : $shadowText;
        $shadowModel = (string) ($data['model'] ?? '');
        $durationMs = (int) round((microtime(true) - $started) * 1000);
        $similarity = miauw_agent_shadow_text_similarity($phpReply, $shadowText);
        $sameText = trim($phpReply) !== '' && trim($phpReply) === trim($shadowText);

        miauw_trace_record('miauw_agent_shadow_compare', 'ok', array(
            'conversa_id' => $conversationId,
            'mensagem_id' => isset($options['mensagem_id']) ? (int) $options['mensagem_id'] : null,
            'type' => 'agent_shadow',
            'summary' => 'Resposta PHP comparada com servico agente sombra.',
            'duration_ms' => $durationMs,
            'payload' => array(
                'widget' => $widgetMode,
                'php_model' => $phpModel,
                'shadow_model' => $shadowModel,
                'shadow_trace_id' => (string) ($data['trace_id'] ?? $traceId),
                'tool_contract_version' => (string) ($data['tool_contract_version'] ?? ''),
                'node_read_tools_enabled' => !empty($data['read_tools_enabled']),
                'node_executable_tools' => array_values(array_slice((array) ($data['node_executable_tools'] ?? array()), 0, 8)),
                'php_read_bridge_enabled' => !empty($data['php_read_bridge_enabled']),
                'migrated_read_tools' => array_values(array_slice((array) ($data['migrated_read_tools'] ?? array()), 0, 8)),
                'php_tool_bridge_enabled' => !empty($data['php_tool_bridge_enabled']),
                'migrated_tool_bridge_tools' => array_values(array_slice((array) ($data['migrated_tool_bridge_tools'] ?? array()), 0, 8)),
                'php_chars' => miauw_strlen($phpReply),
                'shadow_chars' => miauw_strlen($shadowText),
                'same_text' => $sameText,
                'similarity' => $similarity,
                'php_preview' => miauw_diagnostic_redact_string(miauw_substr($phpReply, 0, 180)),
                'shadow_preview' => miauw_diagnostic_redact_string(miauw_substr($shadowText, 0, 180)),
            ),
        ));

        return array(
            'ok' => true,
            'status' => 'ok',
            'same_text' => $sameText,
            'similarity' => $similarity,
            'model' => $shadowModel,
            'duration_ms' => $durationMs,
        );
    } catch (Throwable $error) {
        $durationMs = (int) round((microtime(true) - $started) * 1000);
        miauw_trace_record('miauw_agent_shadow_compare', 'error', array(
            'conversa_id' => $conversationId,
            'mensagem_id' => isset($options['mensagem_id']) ? (int) $options['mensagem_id'] : null,
            'type' => 'agent_shadow',
            'summary' => 'Falha ao comparar com servico agente sombra.',
            'duration_ms' => $durationMs,
            'error' => $error->getMessage(),
            'payload' => array(
                'widget' => $widgetMode,
                'php_model' => $phpModel,
            ),
        ));

        return array(
            'ok' => false,
            'status' => 'error',
            'reason' => miauw_diagnostic_redact_string($error->getMessage()),
            'duration_ms' => $durationMs,
        );
    }
}

function miauw_agent_shadow_maybe(
    int $conversationId,
    string $message,
    string $phpReply,
    string $phpModel,
    bool $widgetMode,
    int $assistantMessageId
): ?array {
    $user = function_exists('current_user') ? current_user() : null;
    $forceByEngine = function_exists('miauw_agent_should_force_shadow') && miauw_agent_should_force_shadow($user);

    if ((!defined('MIAUW_AGENT_SHADOW_ON_SEND') || !(bool) MIAUW_AGENT_SHADOW_ON_SEND) && !$forceByEngine) {
        return null;
    }

    return miauw_agent_shadow_compare($conversationId, $message, $phpReply, $phpModel, $widgetMode, array(
        'force' => true,
        'mensagem_id' => $assistantMessageId,
    ));
}

function miauw_agent_node_reply(int $conversationId, string $message, bool $widgetMode = false): array
{
    $status = miauw_agent_shadow_status();
    if (empty($status['configured'])) {
        throw new RuntimeException('Servico agente Node nao configurado.');
    }

    $trace = miauw_trace_context();
    $traceId = (string) ($trace['trace_id'] ?? miauw_trace_new_id());
    $timeoutMs = miauw_constant_int('MIAUW_AGENT_SHADOW_TIMEOUT_MS', 12000);
    $started = microtime(true);
    $data = miauw_agent_shadow_request($message, $traceId, $timeoutMs);
    $durationMs = (int) round((microtime(true) - $started) * 1000);
    $text = (string) ($data['text'] ?? '');
    $text = function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($text) : $text;

    if (trim($text) === '') {
        throw new RuntimeException('Servico agente Node retornou resposta vazia.');
    }

    miauw_trace_record('miauw_agent_node_reply', 'ok', array(
        'conversa_id' => $conversationId,
        'type' => 'agent_primary',
        'summary' => 'Resposta oficial gerada pelo servico agente Node para usuario liberado.',
        'duration_ms' => $durationMs,
        'payload' => array(
            'widget' => $widgetMode,
            'engine' => 'node',
            'node_trace_id' => (string) ($data['trace_id'] ?? $traceId),
            'node_model' => (string) ($data['model'] ?? ''),
            'tool_contract_version' => (string) ($data['tool_contract_version'] ?? ''),
            'node_read_tools_enabled' => !empty($data['read_tools_enabled']),
            'node_executable_tools' => array_values(array_slice((array) ($data['node_executable_tools'] ?? array()), 0, 8)),
            'php_read_bridge_enabled' => !empty($data['php_read_bridge_enabled']),
            'migrated_read_tools' => array_values(array_slice((array) ($data['migrated_read_tools'] ?? array()), 0, 8)),
            'php_tool_bridge_enabled' => !empty($data['php_tool_bridge_enabled']),
            'migrated_tool_bridge_tools' => array_values(array_slice((array) ($data['migrated_tool_bridge_tools'] ?? array()), 0, 8)),
            'response_chars' => miauw_strlen($text),
        ),
    ));

    return array(
        'text' => $text,
        'fallback' => false,
        'model' => 'miauw-agent-node:' . (string) ($data['model'] ?? 'agent'),
        'engine' => 'node',
        'duration_ms' => $durationMs,
    );
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
        'criar_conta_gestao',
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

    if ($tool === 'criar_conta_gestao') {
        return 'Criar conta na Gestao: '
            . trim((string) ($command['titulo'] ?? 'titulo nao informado'))
            . ', ' . $money($command['valor'] ?? 0)
            . ', categoria ' . trim((string) ($command['categoria'] ?? 'nao informada')) . '.';
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

    if ($tool === 'criar_conta_gestao') {
        $result = miauw_skill_create_gestao_account($command, $userId);
        return miauw_skill_gestao_action_reply($result);
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
        $trace = miauw_trace_context();
        miauw_trace_record($tool, 'error', array(
            'type' => 'acao',
            'summary' => (string) ($pending['summary'] ?? 'Falha em acao confirmada.'),
            'requires_confirmation' => true,
            'duration_ms' => (int) round((microtime(true) - $started) * 1000),
            'error' => $error->getMessage(),
            'payload' => array(
                'confirmation_id' => (string) ($pending['id'] ?? ''),
                'command_keys' => array_keys(is_array($pending['command'] ?? null) ? $pending['command'] : array()),
            ),
        ));

        return array(
            'text' => miauw_action_error_reply($error, array(
                'origem' => 'miauw_confirmed_action',
                'tool' => $tool,
                'confirmation_id' => (string) ($pending['id'] ?? ''),
                'trace_id' => (string) ($trace['trace_id'] ?? ''),
                'summary' => (string) ($pending['summary'] ?? ''),
                'command_keys' => array_keys(is_array($pending['command'] ?? null) ? $pending['command'] : array()),
            )),
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
            'XP - gamificacao dos atendentes',
            'O XP fica em /xp/ e gamifica vendas dos atendentes com trilha de jogo, ranking, fotos e niveis. R$ 1.000,00 em vendas gera 2.500 XP; o nivel 1 precisa de 30.000 XP para passar e os proximos niveis ficam progressivamente mais dificeis. "Farmar aura no XP" e brincadeira interna para incentivar atendimento bom, venda real e lancamento correto. O ADM tambem e player fixo de teste. Miauby pode animar a equipe sobre XP, mas nao deve inventar venda, ranking, nivel ou pontuacao sem dado do sistema ou do usuario.',
            'xp, gamificacao, atendentes, vendas, aura, farmar aura, ranking, nivel, trilha, adm'
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

function miauw_training_sanitize_text(string $text, int $limit = 1200): string
{
    $clean = trim(strip_tags($text));
    $clean = preg_replace('/\s+/u', ' ', $clean) ?? $clean;
    if (function_exists('miauw_diagnostic_redact_string')) {
        $clean = miauw_diagnostic_redact_string($clean);
    } elseif (function_exists('miauw_redact_secret_fragments')) {
        $clean = miauw_redact_secret_fragments($clean);
    }

    return miauw_substr(trim($clean), 0, max(1, $limit));
}

function miauw_training_allowed_rating(string $rating): string
{
    $rating = strtolower(trim($rating));

    return in_array($rating, array('boa', 'ruim', 'ajuste'), true) ? $rating : 'ajuste';
}

function miauw_training_allowed_status(string $status): string
{
    $status = strtolower(trim($status));

    return in_array($status, array('pendente', 'aprovado', 'rejeitado', 'superado'), true) ? $status : 'pendente';
}

function miauw_training_pair_for_assistant(int $conversationId, int $assistantMessageId): ?array
{
    $stmt = db()->prepare(
        "SELECT id, conteudo
         FROM miauw_mensagens
         WHERE id = ? AND conversa_id = ? AND papel = 'assistant'
         LIMIT 1"
    );
    $stmt->execute(array($assistantMessageId, $conversationId));
    $assistant = $stmt->fetch();
    if (!$assistant) {
        return null;
    }

    $stmt = db()->prepare(
        "SELECT id, conteudo
         FROM miauw_mensagens
         WHERE conversa_id = ? AND papel = 'user' AND id < ?
         ORDER BY id DESC
         LIMIT 1"
    );
    $stmt->execute(array($conversationId, $assistantMessageId));
    $user = $stmt->fetch();
    if (!$user) {
        return null;
    }

    return array(
        'user_message_id' => (int) $user['id'],
        'assistant_message_id' => (int) $assistant['id'],
        'pergunta' => (string) $user['conteudo'],
        'resposta_original' => (string) $assistant['conteudo'],
    );
}

function miauw_training_create_feedback(
    int $conversationId,
    int $userId,
    int $assistantMessageId,
    string $rating,
    string $reason = '',
    string $ideal = '',
    string $category = '',
    string $style = '',
    bool $autoApprove = false
): array {
    $pair = miauw_training_pair_for_assistant($conversationId, $assistantMessageId);
    if (!$pair) {
        throw new RuntimeException('Mensagem do Miauby nao encontrada para treino.');
    }

    $rating = miauw_training_allowed_rating($rating);
    $reason = miauw_training_sanitize_text($reason !== '' ? $reason : 'manual', 80);
    $category = miauw_training_sanitize_text($category !== '' ? $category : 'geral', 80);
    $style = miauw_training_sanitize_text($style !== '' ? $style : 'miauby', 80);
    $ideal = miauw_training_sanitize_text($ideal, 1200);
    if ($rating === 'boa' && $ideal === '') {
        $ideal = miauw_training_sanitize_text((string) $pair['resposta_original'], 1200);
    }

    $status = ($rating === 'boa' && $autoApprove) ? 'aprovado' : 'pendente';
    $stmt = db()->prepare(
        "INSERT INTO miauw_treinos_respostas
            (conversa_id, usuario_id, user_message_id, assistant_message_id, pergunta, resposta_original, resposta_ideal, avaliacao, motivo, categoria, estilo, status, source, reviewed_by, reviewed_at)
         VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chat', ?, ?)"
    );
    $stmt->execute(array(
        $conversationId,
        $userId,
        (int) $pair['user_message_id'],
        (int) $pair['assistant_message_id'],
        miauw_training_sanitize_text((string) $pair['pergunta'], 1200),
        miauw_training_sanitize_text((string) $pair['resposta_original'], 1200),
        $ideal !== '' ? $ideal : null,
        $rating,
        $reason !== '' ? $reason : 'manual',
        $category !== '' ? $category : 'geral',
        $style !== '' ? $style : 'miauby',
        $status,
        $status === 'aprovado' ? $userId : null,
        $status === 'aprovado' ? date('Y-m-d H:i:s') : null,
    ));
    $id = (int) db()->lastInsertId();

    if (function_exists('log_action')) {
        log_action(
            'miauw_treino_resposta',
            'miauw_treinos_respostas',
            $id,
            'Feedback de treino registrado: ' . $rating . ' / ' . $status . '.'
        );
    }

    return array(
        'id' => $id,
        'status' => $status,
        'rating' => $rating,
    );
}

function miauw_training_summary(): array
{
    try {
        $counts = array(
            'pendente' => 0,
            'aprovado' => 0,
            'rejeitado' => 0,
            'superado' => 0,
            'total' => 0,
        );
        $stmt = db()->query('SELECT status, COUNT(*) total FROM miauw_treinos_respostas GROUP BY status');
        foreach ($stmt->fetchAll() as $row) {
            $status = (string) ($row['status'] ?? '');
            $total = (int) ($row['total'] ?? 0);
            if (array_key_exists($status, $counts)) {
                $counts[$status] = $total;
                $counts['total'] += $total;
            }
        }

        return $counts;
    } catch (Throwable $error) {
        error_log('Miauby training summary failed: ' . $error->getMessage());

        return array('pendente' => 0, 'aprovado' => 0, 'rejeitado' => 0, 'superado' => 0, 'total' => 0);
    }
}

function miauw_training_items(string $status = 'pendente', int $limit = 50): array
{
    $status = miauw_training_allowed_status($status);
    $limit = max(1, min(120, $limit));
    $sql = "SELECT id, parent_id, versao, conversa_id, usuario_id, user_message_id, assistant_message_id,
                   pergunta, resposta_original, resposta_ideal, avaliacao, motivo, categoria, estilo,
                   status, observacao, reviewed_by, reviewed_at, created_at, updated_at
            FROM miauw_treinos_respostas";
    $params = array();
    if ($status !== '') {
        $sql .= ' WHERE status = ?';
        $params[] = $status;
    }
    $sql .= ' ORDER BY created_at DESC, id DESC LIMIT ' . $limit;

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll() ?: array();
}

function miauw_training_review_item(
    int $id,
    string $status,
    int $reviewerId,
    string $ideal = '',
    string $category = '',
    string $style = '',
    string $note = ''
): bool {
    $status = miauw_training_allowed_status($status);
    $ideal = miauw_training_sanitize_text($ideal, 1200);
    $category = miauw_training_sanitize_text($category !== '' ? $category : 'geral', 80);
    $style = miauw_training_sanitize_text($style !== '' ? $style : 'miauby', 80);
    $note = miauw_training_sanitize_text($note, 500);

    $ownTransaction = !db()->inTransaction();
    if ($ownTransaction) {
        db()->beginTransaction();
    }

    try {
        $stmt = db()->prepare('SELECT * FROM miauw_treinos_respostas WHERE id = ? LIMIT 1');
        $stmt->execute(array($id));
        $row = $stmt->fetch();
        if (!$row) {
            if ($ownTransaction && db()->inTransaction()) {
                db()->rollBack();
            }

            return false;
        }

        $currentStatus = (string) ($row['status'] ?? 'pendente');
        $currentIdeal = (string) ($row['resposta_ideal'] ?? '');
        $currentCategory = (string) ($row['categoria'] ?? 'geral');
        $currentStyle = (string) ($row['estilo'] ?? 'miauby');
        $hasMaterialChange = $currentIdeal !== $ideal
            || $currentCategory !== $category
            || $currentStyle !== $style
            || $currentStatus !== $status;

        if ($currentStatus === 'pendente') {
            $stmt = db()->prepare(
                "UPDATE miauw_treinos_respostas
                 SET resposta_ideal = ?, categoria = ?, estilo = ?, status = ?, observacao = ?, reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ?"
            );
            $stmt->execute(array(
                $ideal !== '' ? $ideal : $currentIdeal,
                $category,
                $style,
                $status,
                $note !== '' ? $note : null,
                $reviewerId,
                $id,
            ));
        } elseif ($hasMaterialChange) {
            $rootId = (int) ($row['parent_id'] ?: $row['id']);
            $stmt = db()->prepare('SELECT COALESCE(MAX(versao), 0) + 1 FROM miauw_treinos_respostas WHERE id = ? OR parent_id = ?');
            $stmt->execute(array($rootId, $rootId));
            $nextVersion = max(2, (int) $stmt->fetchColumn());

            if ($status === 'aprovado') {
                db()->prepare("UPDATE miauw_treinos_respostas SET status = 'superado' WHERE (id = ? OR parent_id = ?) AND status = 'aprovado'")
                    ->execute(array($rootId, $rootId));
            }

            $stmt = db()->prepare(
                "INSERT INTO miauw_treinos_respostas
                    (parent_id, versao, conversa_id, usuario_id, user_message_id, assistant_message_id,
                     pergunta, resposta_original, resposta_ideal, avaliacao, motivo, categoria, estilo, status,
                     observacao, source, reviewed_by, reviewed_at)
                 VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?, NOW())"
            );
            $stmt->execute(array(
                $rootId,
                $nextVersion,
                (int) ($row['conversa_id'] ?? 0) ?: null,
                (int) ($row['usuario_id'] ?? 0) ?: null,
                (int) ($row['user_message_id'] ?? 0) ?: null,
                (int) ($row['assistant_message_id'] ?? 0) ?: null,
                (string) ($row['pergunta'] ?? ''),
                (string) ($row['resposta_original'] ?? ''),
                $ideal !== '' ? $ideal : $currentIdeal,
                (string) ($row['avaliacao'] ?? 'ajuste'),
                (string) ($row['motivo'] ?? 'review'),
                $category,
                $style,
                $status,
                $note !== '' ? $note : null,
                $reviewerId,
            ));
        } else {
            $stmt = db()->prepare(
                "UPDATE miauw_treinos_respostas
                 SET status = ?, observacao = ?, reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ?"
            );
            $stmt->execute(array($status, $note !== '' ? $note : null, $reviewerId, $id));
        }

        if (function_exists('log_action')) {
            log_action(
                'miauw_revisao_treino',
                'miauw_treinos_respostas',
                $id,
                'Treino do Miauby revisado como ' . $status . '.'
            );
        }

        if ($ownTransaction && db()->inTransaction()) {
            db()->commit();
        }

        return true;
    } catch (Throwable $error) {
        if ($ownTransaction && db()->inTransaction()) {
            db()->rollBack();
        }
        error_log('Miauby training review failed: ' . $error->getMessage());

        return false;
    }
}

function miauw_training_fetch_approved_rows(int $limit = 120): array
{
    try {
        $limit = max(1, min(200, $limit));
        $exists = db()->query("SHOW TABLES LIKE 'miauw_treinos_respostas'")->fetchColumn();
        if (!$exists) {
            return array();
        }

        $stmt = db()->query(
            "SELECT id, pergunta, resposta_ideal, categoria, estilo, reviewed_at, created_at
             FROM miauw_treinos_respostas
             WHERE status = 'aprovado'
               AND resposta_ideal IS NOT NULL
               AND resposta_ideal <> ''
             ORDER BY reviewed_at DESC, created_at DESC, id DESC
             LIMIT " . $limit
        );

        return $stmt->fetchAll() ?: array();
    } catch (Throwable $error) {
        error_log('Miauby training approved rows failed: ' . $error->getMessage());

        return array();
    }
}

function miauw_training_words(string $text): array
{
    $normalized = miauw_agent_style_normalized($text);
    $normalized = preg_replace('/[^a-z0-9]+/u', ' ', $normalized) ?? $normalized;
    $words = preg_split('/\s+/', trim($normalized)) ?: array();
    $stop = array_flip(array(
        'aqui', 'agora', 'ainda', 'algo', 'como', 'com', 'das', 'dos', 'ele', 'ela', 'era',
        'essa', 'esse', 'isso', 'mais', 'meu', 'minha', 'muito', 'para', 'pela', 'pelo',
        'por', 'pra', 'que', 'qual', 'quais', 'quando', 'sao', 'sem', 'ser', 'sua',
        'tem', 'uma', 'uns', 'voce', 'você',
    ));
    $selected = array();

    foreach ($words as $word) {
        $word = trim((string) $word);
        if ($word === '' || miauw_strlen($word) < 3 || isset($stop[$word])) {
            continue;
        }
        $selected[$word] = true;
    }

    return array_keys($selected);
}

function miauw_training_row_score(array $row, string $message, array $messageWords, array $route): array
{
    $normalizedMessage = miauw_agent_style_normalized($message);
    $question = (string) ($row['pergunta'] ?? '');
    $reply = (string) ($row['resposta_ideal'] ?? '');
    $category = (string) ($row['categoria'] ?? '');
    $style = (string) ($row['estilo'] ?? '');
    $questionNormalized = miauw_agent_style_normalized($question);
    $replyNormalized = miauw_agent_style_normalized($reply);
    $metaNormalized = miauw_agent_style_normalized($category . ' ' . $style);
    $score = 0;
    $matched = array();
    $exact = false;

    if ($normalizedMessage !== '' && $questionNormalized !== '') {
        if ($normalizedMessage === $questionNormalized) {
            $score += 120;
            $exact = true;
        } elseif (strpos($normalizedMessage, $questionNormalized) !== false || strpos($questionNormalized, $normalizedMessage) !== false) {
            $score += 50;
        } else {
            similar_text($normalizedMessage, $questionNormalized, $similarity);
            if ($similarity >= 82) {
                $score += 45;
            } elseif ($similarity >= 64) {
                $score += 14;
            }
        }
    }

    foreach ($messageWords as $word) {
        $hit = false;
        if ($word !== '' && strpos($questionNormalized, $word) !== false) {
            $score += 8;
            $hit = true;
        }
        if ($word !== '' && strpos($replyNormalized, $word) !== false) {
            $score += 4;
            $hit = true;
        }
        if ($word !== '' && strpos($metaNormalized, $word) !== false) {
            $score += 5;
            $hit = true;
        }
        if ($hit) {
            $matched[$word] = true;
        }
    }

    $intent = (string) ($route['intent'] ?? '');
    $haystack = trim($questionNormalized . ' ' . $replyNormalized . ' ' . $metaNormalized);
    if ($intent === 'backstage_technical' && miauw_agent_style_has_any($haystack, array('tecnica', 'tecnico', 'interna', 'chave', 'senha', 'login', 'api', 'php', 'programar', 'linguagem'))) {
        $score += 16;
    }
    if (in_array($intent, array('offtopic', 'generic_howto', 'random_noise', 'greeting'), true) && miauw_agent_style_has_any($metaNormalized, array('geral', 'miauby'))) {
        $score += 7;
    }
    if (miauw_agent_style_has_any($normalizedMessage, array('comprar', 'compra', 'viagem', 'bolo', 'sorvete', 'bombom', 'unhas', 'futebol'))
        && miauw_agent_style_has_any($haystack, array('comprar', 'compra', 'viagem', 'bolo', 'sorvete', 'bombom', 'unhas', 'futebol'))) {
        $score += 12;
    }
    if (miauw_agent_style_has_any($normalizedMessage, array('senha', 'login', 'chave', 'token', 'credencial'))
        && miauw_agent_style_has_any($haystack, array('senha', 'login', 'chave', 'token', 'credencial'))) {
        $score += 24;
    }

    return array(
        'score' => $score,
        'matched_terms' => array_keys($matched),
        'exact' => $exact,
    );
}

function miauw_training_relevant_rows(string $message, int $limit = 3, int $poolLimit = 120): array
{
    $limit = max(1, min(8, $limit));
    $rows = miauw_training_fetch_approved_rows($poolLimit);
    if (!$rows) {
        return array();
    }

    $messageWords = miauw_training_words($message);
    $route = miauw_agent_style_route($message);
    $scored = array();

    foreach ($rows as $row) {
        $result = miauw_training_row_score($row, $message, $messageWords, $route);
        if ((int) $result['score'] <= 0) {
            continue;
        }
        $row['_score'] = (int) $result['score'];
        $row['_matched_terms'] = (array) $result['matched_terms'];
        $row['_exact_match'] = (bool) $result['exact'];
        $scored[] = $row;
    }

    usort($scored, static function (array $a, array $b): int {
        return ((int) $b['_score'] <=> (int) $a['_score'])
            ?: (strtotime((string) ($b['reviewed_at'] ?? $b['created_at'] ?? '')) <=> strtotime((string) ($a['reviewed_at'] ?? $a['created_at'] ?? '')));
    });

    return array_slice($scored, 0, $limit);
}

function miauw_training_context_examples(string $message, int $limit = 3): array
{
    try {
        $examples = array();
        foreach (miauw_training_relevant_rows($message, $limit) as $row) {
            $question = miauw_training_sanitize_text((string) ($row['pergunta'] ?? ''), 180);
            $reply = miauw_training_sanitize_text((string) ($row['resposta_ideal'] ?? ''), 360);
            if ($question === '' || $reply === '') {
                continue;
            }
            $examples[] = array(
                'pergunta' => $question,
                'resposta_ideal' => $reply,
                'categoria' => miauw_training_sanitize_text((string) ($row['categoria'] ?? 'geral'), 80),
                'estilo' => miauw_training_sanitize_text((string) ($row['estilo'] ?? 'miauby'), 80),
                'score' => (int) ($row['_score'] ?? 0),
                'matched_terms' => array_values(array_slice((array) ($row['_matched_terms'] ?? array()), 0, 6)),
                'exact_match' => !empty($row['_exact_match']),
            );
        }

        return $examples;
    } catch (Throwable $error) {
        error_log('Miauby training context failed: ' . $error->getMessage());

        return array();
    }
}

function miauw_training_context_profile(string $message, int $limit = 3): array
{
    $route = miauw_agent_style_route($message);
    $examples = miauw_training_context_examples($message, $limit);
    $summary = miauw_training_summary();
    $topScore = 0;
    $categories = array();
    $styles = array();
    foreach ($examples as $example) {
        $topScore = max($topScore, (int) ($example['score'] ?? 0));
        $category = (string) ($example['categoria'] ?? 'geral');
        $style = (string) ($example['estilo'] ?? 'miauby');
        if ($category !== '') {
            $categories[$category] = ($categories[$category] ?? 0) + 1;
        }
        if ($style !== '') {
            $styles[$style] = ($styles[$style] ?? 0) + 1;
        }
    }

    arsort($categories);
    arsort($styles);
    $normalized = miauw_agent_style_normalized($message);
    $directives = array(
        'usar treino aprovado como padrao de voz, nao como assunto para citar',
        'responder curto quando a mensagem for solta; pedir o menor recorte util',
    );
    if (miauw_agent_style_has_any($normalized, array('senha', 'login', 'chave', 'token', 'credencial', 'api', 'modelo', 'php', 'programar', 'linguagem'))) {
        $directives[] = 'bastidor, senha, chave e login: recusar sem expor e puxar para suporte interno ou objetivo operacional';
    }
    if (miauw_agent_style_has_any($normalized, array('comprar', 'compra', 'viagem', 'bolo', 'sorvete', 'bombom', 'unhas', 'futebol', 'chatgpt'))) {
        $directives[] = 'tema amplo ou fora da operacao: perguntar finalidade e amarrar em caixa, produto, cotacao, tarefa ou financeiro';
    }
    if ((string) ($route['intent'] ?? '') === 'strong_action') {
        $directives[] = 'acao forte: pedir dados obrigatorios e confirmacao humana antes de gravar';
    }

    $confidence = 'baixa';
    if ($topScore >= 90) {
        $confidence = 'exata';
    } elseif ($topScore >= 24) {
        $confidence = 'alta';
    } elseif ($topScore >= 10) {
        $confidence = 'media';
    }

    return array(
        'version' => 'miauby-training-compiler-2026-05-17',
        'approved_total' => (int) ($summary['aprovado'] ?? 0),
        'examples_selected' => count($examples),
        'confidence' => $confidence,
        'top_score' => $topScore,
        'route_intent' => (string) ($route['intent'] ?? ''),
        'directives' => array_values(array_slice(array_unique($directives), 0, 5)),
        'categories' => array_slice(array_keys($categories), 0, 4),
        'styles' => array_slice(array_keys($styles), 0, 4),
    );
}

function miauw_training_try_local_reply(string $message, string $pageContext = '', bool $widgetMode = false): ?array
{
    $rows = miauw_training_relevant_rows($message, 1);
    if (!$rows) {
        return null;
    }

    $top = $rows[0];
    $score = (int) ($top['_score'] ?? 0);
    $matchedTerms = (array) ($top['_matched_terms'] ?? array());
    $isExact = !empty($top['_exact_match']);
    if (!$isExact && ($score < 76 || count($matchedTerms) < 2)) {
        return null;
    }

    $text = miauw_training_sanitize_text((string) ($top['resposta_ideal'] ?? ''), $widgetMode ? 500 : 900);
    if ($text === '') {
        return null;
    }

    if (function_exists('miauw_trace_record')) {
        $route = miauw_agent_style_route($message, $pageContext);
        miauw_trace_record('miauw_training_router', 'ok', array(
            'type' => 'style',
            'risk' => 'baixo',
            'summary' => 'Resposta local por treino aprovado.',
            'payload' => array(
                'intent' => (string) ($route['intent'] ?? ''),
                'score' => $score,
                'exact' => $isExact,
                'training_version' => 'miauby-training-compiler-2026-05-17',
                'widget' => $widgetMode,
            ),
        ));
    }

    $clean = function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($text) : $text;

    return array(
        'text' => $clean,
        'fallback' => false,
        'model' => 'miauw-training-router',
        'style_intent' => 'training_approved',
    );
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
        $trace = function_exists('miauw_trace_context') ? miauw_trace_context() : array();

        $record = array(
            'created_at' => date('c'),
            'type' => miauw_substr($type, 0, 80),
            'module' => miauw_diagnostic_module_from_context($module, (string) ($context['page_context'] ?? '')),
            'title' => miauw_substr($title, 0, 180),
            'version' => defined('MIAUW_VERSION') ? MIAUW_VERSION : '',
            'trace_id' => (string) ($context['trace_id'] ?? $trace['trace_id'] ?? ''),
            'conversation_id' => isset($context['conversa_id']) ? (int) $context['conversa_id'] : ($trace['conversa_id'] ?? null),
            'message_id' => isset($context['mensagem_id']) ? (int) $context['mensagem_id'] : ($trace['mensagem_id'] ?? null),
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

function miauw_public_action_error(Throwable $error, array $context = array()): string
{
    $message = trim($error->getMessage());
    $lower = strtolower($message);
    $alreadyLogged = !empty($context['diagnostic_logged']);

    $technical = array(
        'log_action', 'argument #4', 'array given', 'call to undefined', 'undefined function',
        'fatal error', 'parse error', '/home', '\\', 'stack trace', 'sqlstate', 'pdo',
        'mysql', 'database', 'query', 'syntax error'
    );

    foreach ($technical as $needle) {
        if (strpos($lower, $needle) !== false) {
            if (!$alreadyLogged) {
                miauw_register_internal_error_alert('miauby', 'Erro interno em acao controlada', $error, array_merge(array('origem' => 'miauw_public_action_error'), $context));
            }
            return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
        }
    }

    if ($message === '') {
        if (!$alreadyLogged) {
            miauw_register_internal_error_alert('miauby', 'Erro interno sem mensagem', $error, array_merge(array('origem' => 'miauw_public_action_error'), $context));
        }
        return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
    }

    if (preg_match('/\b(informe|faltou|valor invalido|categoria vazia|dia esta fechado|reabra|responsavel|cliente|produto|nenhum produto valido|senha)\b/iu', $message)) {
        return miauw_substr(preg_replace('/\s+/', ' ', $message) ?? $message, 0, 220);
    }

    if (!$alreadyLogged) {
        miauw_register_internal_error_alert('miauby', 'Erro em acao controlada', $error, array_merge(array('origem' => 'miauw_public_action_error'), $context));
    }

    return 'Nao consegui concluir agora. Registrei diagnostico interno para revisao. Se repetir, chame o suporte tecnico interno com tela, horario e acao feita.';
}

function miauw_action_error_reply(Throwable $error, array $context = array()): string
{
    $diagnosticContext = array_merge(array('origem' => 'miauw_action_error_reply'), $context);
    miauw_register_internal_error_alert('miauby', 'Falha em acao controlada', $error, $diagnosticContext);

    $public = miauw_public_action_error($error, array_merge($diagnosticContext, array('diagnostic_logged' => true)));
    if (strpos($public, 'Nao consegui concluir agora') === 0) {
        return $public;
    }

    return 'Nao gravei: ' . $public;
}

function miauw_gestao_command_complete(array $command): bool
{
    return trim((string) ($command['titulo'] ?? '')) !== ''
        && (float) ($command['valor'] ?? 0) > 0
        && trim((string) ($command['categoria'] ?? '')) !== '';
}

function miauw_gestao_missing_fields(array $command): array
{
    $missing = array();
    if (trim((string) ($command['titulo'] ?? '')) === '') {
        $missing[] = 'titulo';
    }
    if ((float) ($command['valor'] ?? 0) <= 0) {
        $missing[] = 'valor';
    }
    if (trim((string) ($command['categoria'] ?? '')) === '') {
        $missing[] = 'categoria';
    }

    return $missing;
}

function miauw_gestao_clean_followup_text(string $text, int $limit): string
{
    if (function_exists('miauw_skill_gestao_clean_after_money')) {
        return miauw_skill_gestao_clean_after_money($text, $limit);
    }
    if (function_exists('miauw_skill_gestao_clean_part')) {
        return miauw_skill_gestao_clean_part($text, $limit);
    }

    return substr(trim(preg_replace('/\s+/', ' ', $text) ?? $text), 0, $limit);
}

function miauw_gestao_command_from_pending_answer(array $pending, string $message): array
{
    $command = $pending;
    $missing = miauw_gestao_missing_fields($command);
    $answer = trim($message);
    $answerWithoutMoney = $answer;
    $moneyPattern = '/(?:r\$\s*)?[0-9]+(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|(?:r\$\s*)?[0-9]+(?:\.[0-9]{1,2})?/iu';

    if (in_array('valor', $missing, true) && preg_match($moneyPattern, $answer, $moneyMatch)) {
        $value = function_exists('miauw_skill_gestao_money_to_float')
            ? miauw_skill_gestao_money_to_float((string) $moneyMatch[0])
            : (float) str_replace(',', '.', (string) $moneyMatch[0]);
        if ($value > 0) {
            $command['valor'] = $value;
            $position = strpos($answer, (string) $moneyMatch[0]);
            if ($position !== false) {
                $answerWithoutMoney = trim(substr($answer, 0, $position) . ' ' . substr($answer, $position + strlen((string) $moneyMatch[0])));
            }
        }
    }

    $parts = array_values(array_filter(array_map(static function ($part): string {
        return trim((string) $part);
    }, preg_split('/\s*[-|;]\s*/u', $answerWithoutMoney) ?: array()), static function ($part): bool {
        return $part !== '';
    }));
    $words = array_values(array_filter(preg_split('/\s+/u', trim($answerWithoutMoney)) ?: array(), static function ($part): bool {
        return trim((string) $part) !== '';
    }));

    $stillMissing = miauw_gestao_missing_fields($command);
    if (in_array('titulo', $stillMissing, true) && in_array('categoria', $stillMissing, true)) {
        if (count($parts) >= 2) {
            $category = (string) array_pop($parts);
            $command['titulo'] = miauw_gestao_clean_followup_text(implode(' - ', $parts), 180);
            $command['categoria'] = miauw_gestao_clean_followup_text($category, 80);
        } elseif (count($words) >= 2) {
            $category = (string) array_pop($words);
            $command['titulo'] = miauw_gestao_clean_followup_text(implode(' ', $words), 180);
            $command['categoria'] = miauw_gestao_clean_followup_text($category, 80);
        }
    } elseif (in_array('titulo', $stillMissing, true)) {
        $text = count($parts) >= 1 ? (string) $parts[0] : $answerWithoutMoney;
        $command['titulo'] = miauw_gestao_clean_followup_text($text, 180);
    } elseif (in_array('categoria', $stillMissing, true)) {
        $text = count($parts) >= 1 ? (string) end($parts) : $answerWithoutMoney;
        $command['categoria'] = miauw_gestao_clean_followup_text($text, 80);
    }

    $command['descricao'] = trim((string) ($command['titulo'] ?? '')) !== '' ? (string) $command['titulo'] : (string) ($command['descricao'] ?? 'Valor principal');
    $command['raw_message'] = trim((string) ($pending['raw_message'] ?? 'gestao') . ' | complemento: ' . $message);

    return $command;
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

    if (function_exists('miauw_agent_style_route') && function_exists('miauw_agent_style_reply_for_route')) {
        $route = miauw_agent_style_route($message);
        $reply = miauw_agent_style_reply_for_route($route, $message);
        if (is_string($reply) && trim($reply) !== '') {
            return $reply;
        }
    }

    return 'Oxe, por que voce quer mexer nisso? Bastidor tecnico e assunto de suporte tecnico interno.'
        . "\nAqui eu fico no operacional: caixa, financeiro, cotacao, cashback, encomenda, alerta e processo."
        . "\nMe mande tela, horario, acao feita e print; se for codigo, abre chamado tecnico interno.";
}

function miauw_operator_voice_polish(string $text): string
{
    $text = trim($text);

    if ($text === '') {
        return $text;
    }

    $text = preg_replace('/^\s*(?:claro|com certeza|sem problemas|perfeito|posso ajudar|aqui esta|aqui vai|ol[Ã¡a])[\!\.\,\:\s]*/iu', 'Miauby direto: ', $text) ?? $text;
    $text = preg_replace('/^\s*(?:como uma? ia|como assistente virtual|sou uma? ia|sou um modelo de linguagem)[^\n]*\n?/iu', '', $text) ?? $text;
    $text = preg_replace('/\b(?:eu\s+)?leio dados de\b/iu', 'eu consulto quando faz sentido: ', $text) ?? $text;
    $text = preg_replace('/\bposso (?:ajudar|auxiliar) com\b/iu', 'eu resolvo quando voce trouxer', $text) ?? $text;
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

    $pendingGestaoKey = 'miauw_pending_gestao_account';
    $pendingGestao = $_SESSION[$pendingGestaoKey] ?? null;

    if (is_array($pendingGestao)) {
        $normalized = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
        if (function_exists('miauw_skill_has_any') && miauw_skill_has_any($normalized, array('cancela', 'cancelar', 'deixa', 'esquece'))) {
            unset($_SESSION[$pendingGestaoKey]);

            return array(
                'text' => 'Cancelado. Nenhuma conta foi criada na Gestao.',
                'fallback' => false,
                'model' => 'miauw-gestao-action',
            );
        }

        $currentGestaoCommand = function_exists('miauw_skill_gestao_command_from_message')
            ? miauw_skill_gestao_command_from_message($message)
            : null;

        if (is_array($currentGestaoCommand)) {
            unset($_SESSION[$pendingGestaoKey]);
            miauw_trace_record('criar_conta_gestao', 'pending_replaced', array(
                'type' => 'acao',
                'summary' => 'Comando incompleto anterior da Gestao foi descartado por nova mensagem Gestao.',
                'payload' => array(
                    'old_missing' => miauw_gestao_missing_fields($pendingGestao),
                    'new_missing' => miauw_gestao_missing_fields($currentGestaoCommand),
                    'new_command_complete' => miauw_gestao_command_complete($currentGestaoCommand),
                ),
            ));

            if ((string) ($currentGestaoCommand['acao'] ?? '') === 'abrir_gestao') {
                return array(
                    'text' => function_exists('miauw_skill_gestao_access_reply') ? miauw_skill_gestao_access_reply($pageContext) : 'Gestao fica em /gestao/.',
                    'fallback' => false,
                    'model' => 'miauw-gestao-access',
                );
            }

            if (miauw_gestao_command_complete($currentGestaoCommand)) {
                return miauw_confirmation_request_reply('criar_conta_gestao', $currentGestaoCommand, $userId);
            }

            $_SESSION[$pendingGestaoKey] = $currentGestaoCommand;

            return array(
                'text' => function_exists('miauw_skill_gestao_missing_reply') ? miauw_skill_gestao_missing_reply($currentGestaoCommand) : 'Faltou dado da conta da Gestao.',
                'fallback' => false,
                'model' => 'miauw-gestao-guide',
            );
        }

        $command = miauw_gestao_command_from_pending_answer($pendingGestao, $message);
        $_SESSION[$pendingGestaoKey] = $command;

        if (miauw_gestao_command_complete($command)) {
            unset($_SESSION[$pendingGestaoKey]);

            return miauw_confirmation_request_reply('criar_conta_gestao', $command, $userId);
        }

        return array(
            'text' => function_exists('miauw_skill_gestao_missing_reply') ? miauw_skill_gestao_missing_reply($command) : 'Faltou dado da conta da Gestao.',
            'fallback' => false,
            'model' => 'miauw-gestao-guide',
        );
    }

    $normalizedForGestaoAccess = function_exists('miauw_skill_normalized') ? miauw_skill_normalized($message) : strtolower($message);
    if (preg_match('/^\s*(?:abrir|abre|acessar|acessa|entrar|entra)\s+(?:na\s+|no\s+)?gestao\b/u', $normalizedForGestaoAccess)) {
        return array(
            'text' => function_exists('miauw_skill_gestao_access_reply') ? miauw_skill_gestao_access_reply($pageContext) : 'Gestao fica em /gestao/.',
            'fallback' => false,
            'model' => 'miauw-gestao-access',
        );
    }

    if (function_exists('miauw_skill_gestao_command_from_message')) {
        $gestaoCommand = miauw_skill_gestao_command_from_message($message);
        if (is_array($gestaoCommand)) {
            if ((string) ($gestaoCommand['acao'] ?? '') === 'abrir_gestao') {
                return array(
                    'text' => function_exists('miauw_skill_gestao_access_reply') ? miauw_skill_gestao_access_reply($pageContext) : 'Gestao fica em /gestao/.',
                    'fallback' => false,
                    'model' => 'miauw-gestao-access',
                );
            }

            if (
                trim((string) ($gestaoCommand['titulo'] ?? '')) === ''
                || (float) ($gestaoCommand['valor'] ?? 0) <= 0
                || trim((string) ($gestaoCommand['categoria'] ?? '')) === ''
            ) {
                $_SESSION[$pendingGestaoKey] = $gestaoCommand;

                return array(
                    'text' => function_exists('miauw_skill_gestao_missing_reply') ? miauw_skill_gestao_missing_reply($gestaoCommand) : 'Faltou dado da conta da Gestao.',
                    'fallback' => false,
                    'model' => 'miauw-gestao-guide',
                );
            }

            return miauw_confirmation_request_reply('criar_conta_gestao', $gestaoCommand, $userId);
        }
    }

    if (function_exists('miauw_training_try_local_reply')) {
        $trainingReply = miauw_training_try_local_reply($message, $pageContext, $widgetMode);
        if ($trainingReply !== null) {
            return $trainingReply;
        }
    }

    if (function_exists('miauw_agent_try_style_reply')) {
        $styleReply = miauw_agent_try_style_reply($message, $pageContext, $widgetMode);
        if ($styleReply !== null) {
            return $styleReply;
        }
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
        $word = (string) $word;
        return strlen($word) >= 4 || $word === 'xp';
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

    if (function_exists('miauw_agent_style_context_text')) {
        $user = function_exists('current_user') ? current_user() : null;
        $styleContext = trim((string) miauw_agent_style_context_text($message, is_array($user) ? (int) ($user['id'] ?? 0) : null));
        if ($styleContext !== '') {
            $knowledge .= ($knowledge !== '' ? "\n\n" : '') . $styleContext;
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
        'financeiro', 'caixa', 'cotacao', 'cashback', 'gestao', 'contas a pagar', 'boleto', 'cliente', 'produto', 'ean', 'fornecedor',
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
            'name' => 'resumo_gestao',
            'description' => 'Consulta resumo da Gestao administrativa: contas a pagar, pendencias e categorias por mes e ano.',
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
            'name' => 'criar_conta_gestao',
            'description' => 'Prepara criacao de conta a pagar na Gestao quando houver titulo e valor; a categoria pode vir antes ou depois, e se vier so nome + valor use categoria geral. Exemplos: "gestao - Rogerio - 500 - geral", "gestao - 50 - Will", "gestao Will 50". Se faltar titulo ou valor, pergunte antes. A conta so grava depois da confirmacao humana.',
            'parameters' => array(
                'type' => 'object',
                'properties' => array(
                    'titulo' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 180),
                    'valor' => array('type' => 'number', 'minimum' => 0.01),
                    'categoria' => array('type' => 'string', 'minLength' => 2, 'maxLength' => 80),
                    'descricao' => array('type' => 'string', 'maxLength' => 180),
                    'competencia_mes' => array('type' => 'string', 'description' => 'Mes em YYYY-MM. Se nao houver mes claro, use o mes atual.'),
                    'vencimento_em' => array('type' => 'string', 'description' => 'Data/hora opcional em YYYY-MM-DD ou YYYY-MM-DDTHH:MM.'),
                    'observacao' => array('type' => 'string', 'maxLength' => 500),
                ),
                'required' => array('titulo', 'valor', 'categoria'),
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

function miauw_openai_tools_by_name(): array
{
    $indexed = array();

    foreach (miauw_openai_tools() as $tool) {
        if (!is_array($tool)) {
            continue;
        }

        $name = trim((string) ($tool['name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $indexed[$name] = $tool;
    }

    ksort($indexed);

    return $indexed;
}

function miauw_agent_tool_contract_export(): array
{
    $registry = function_exists('miauw_skill_registry_public') ? miauw_skill_registry_public() : array();
    $toolsByName = miauw_openai_tools_by_name();
    $nodeReadBridgeTools = function_exists('miauw_agent_node_read_tool_names') ? miauw_agent_node_read_tool_names() : array();
    $nodeToolBridgeTools = function_exists('miauw_agent_node_tool_bridge_names') ? miauw_agent_node_tool_bridge_names() : array();
    $contracts = array();
    $registryOpenAiNames = array();
    $missingSchemas = array();
    $withoutRegistry = array();
    $highRiskWrites = 0;
    $phpBridgeWriteTools = 0;

    foreach ($registry as $name => $meta) {
        if (!empty($meta['openai_tool'])) {
            $registryOpenAiNames[] = (string) $name;
        }

        if (
            (string) ($meta['nivel'] ?? '') === 'escrita'
            && (string) ($meta['risco'] ?? '') === 'alto'
            && !empty($meta['local_action'])
        ) {
            $highRiskWrites++;
        }
    }

    foreach ($registryOpenAiNames as $name) {
        $tool = is_array($toolsByName[$name] ?? null) ? $toolsByName[$name] : null;
        $meta = is_array($registry[$name] ?? null) ? $registry[$name] : array();
        if (!$tool) {
            $missingSchemas[] = $name;
            continue;
        }

        $params = is_array($tool['parameters'] ?? null) ? $tool['parameters'] : array();
        $policy = function_exists('miauw_agent_node_tool_bridge_policy')
            ? miauw_agent_node_tool_bridge_policy((string) $name)
            : array();
        if (!empty($policy['writes_enabled_via_php_bridge'])) {
            $phpBridgeWriteTools++;
        }

        $contracts[$name] = array(
            'name' => $name,
            'title' => (string) ($meta['titulo'] ?? $name),
            'module' => (string) ($meta['modulo'] ?? 'sistema'),
            'level' => (string) ($meta['nivel'] ?? 'leitura'),
            'risk' => (string) ($meta['risco'] ?? 'baixo'),
            'permission' => (string) ($meta['permissao'] ?? 'autenticado'),
            'executor_available' => !empty($meta['executor_disponivel']),
            'local_action' => !empty($meta['local_action']),
            'requires_confirmation' => miauw_tool_requires_confirmation((string) $name),
            'writes_enabled_in_node' => false,
            'writes_enabled_via_php_bridge' => !empty($policy['writes_enabled_via_php_bridge']),
            'node_read_bridge_enabled' => in_array((string) $name, $nodeReadBridgeTools, true)
                && function_exists('miauw_agent_node_read_tool_allowed')
                && miauw_agent_node_read_tool_allowed((string) $name),
            'node_tool_bridge_enabled' => in_array((string) $name, $nodeToolBridgeTools, true)
                && function_exists('miauw_agent_node_tool_bridge_allowed')
                && miauw_agent_node_tool_bridge_allowed((string) $name),
            'node_tool_bridge_mode' => (string) ($policy['mode'] ?? 'unavailable'),
            'execution_owner' => 'php',
            'description' => (string) ($tool['description'] ?? ($meta['saida'] ?? '')),
            'parameters' => $params,
            'required' => array_values((array) ($params['required'] ?? array())),
            'effects' => array_values((array) ($meta['efeitos'] ?? array())),
            'audit' => array_values((array) ($meta['auditoria'] ?? array())),
        );
    }

    foreach ($toolsByName as $name => $_tool) {
        if (!isset($registry[$name])) {
            $withoutRegistry[] = (string) $name;
        }
    }

    ksort($contracts);
    sort($missingSchemas);
    sort($withoutRegistry);

    $encoded = json_encode($contracts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    $checksum = is_string($encoded) ? hash('sha256', $encoded) : '';

    return array(
        'version' => 'miauw-tool-contracts-2026-05-16',
        'agent_version' => miauw_constant_string('MIAUW_AGENT_VERSION', ''),
        'phase' => 'fase21-voice-playback-profile-selector',
        'source' => 'php_skill_registry',
        'personality_version' => miauw_constant_string('MIAUW_AGENT_PERSONALITY_VERSION', ''),
        'writes_enabled_in_node' => false,
        'execution_owner' => 'php',
        'confirmation_owner' => 'php',
        'node_read_bridge_tools' => array_values($nodeReadBridgeTools),
        'node_tool_bridge_tools' => array_values($nodeToolBridgeTools),
        'checksum' => $checksum,
        'summary' => array(
            'registry_total' => count($registry),
            'openai_tools' => count($registryOpenAiNames),
            'schemas_exported' => count($contracts),
            'missing_schemas' => count($missingSchemas),
            'schemas_without_registry' => count($withoutRegistry),
            'high_risk_writes' => $highRiskWrites,
            'node_read_bridge_tools' => count($nodeReadBridgeTools),
            'node_tool_bridge_tools' => count($nodeToolBridgeTools),
            'php_bridge_write_tools' => $phpBridgeWriteTools,
        ),
        'missing_schemas' => $missingSchemas,
        'schemas_without_registry' => $withoutRegistry,
        'tools' => $contracts,
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
        if ($name === 'criar_conta_gestao') {
            $command['raw_message'] = 'tool_call_criar_conta_gestao';
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

    if ($name === 'resumo_gestao') {
        $period = function_exists('miauw_skill_period_from_message')
            ? miauw_skill_period_from_message(sprintf('%02d/%04d', (int) ($args['mes'] ?? date('n')), (int) ($args['ano'] ?? date('Y'))))
            : array('mes' => (int) ($args['mes'] ?? date('n')), 'ano' => (int) ($args['ano'] ?? date('Y')));
        return implode("\n", miauw_skill_gestao_summary($period));
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
                    'engine' => 'php_local',
                );
            }
        } catch (Throwable $error) {
            error_log('Miauby farmacia popular local reply failed: ' . $error->getMessage());
        }
    }

    if (function_exists('miauw_training_try_local_reply')) {
        $trainingReply = miauw_training_try_local_reply($message, '', $widgetMode);
        if ($trainingReply !== null) {
            $trainingReply['engine'] = 'php_local';

            return $trainingReply;
        }
    }

    $engine = function_exists('miauw_agent_engine') ? miauw_agent_engine() : 'php';
    $user = function_exists('current_user') ? current_user() : null;
    if ($engine === 'node' && function_exists('miauw_agent_engine_allowed_for_user') && miauw_agent_engine_allowed_for_user($user)) {
        try {
            return miauw_agent_node_reply($conversationId, $message, $widgetMode);
        } catch (Throwable $agentError) {
            error_log('Miauby Node agent fallback: ' . $agentError->getMessage());
            miauw_trace_record('miauw_agent_node_reply', 'error', array(
                'conversa_id' => $conversationId,
                'type' => 'agent_primary',
                'summary' => 'Motor Node falhou; PHP assumiu a resposta oficial.',
                'error' => $agentError->getMessage(),
                'payload' => array(
                    'engine' => 'node',
                    'fallback_to' => 'php',
                    'widget' => $widgetMode,
                ),
            ));
            if (function_exists('miauw_register_internal_error_alert')) {
                miauw_register_internal_error_alert('miauby', 'Falha no motor agente Node', $agentError, array(
                    'origem' => 'miauw_generate_reply',
                    'engine' => 'node',
                    'fallback_to' => 'php',
                ));
            }
        }
    }

    try {
        $route = function_exists('miauw_model_route') ? miauw_model_route($message) : array('model' => MIAUW_OPENAI_MODEL, 'name' => 'legacy');
        $text = miauw_openai_reply($conversationId, $message, $widgetMode);

        return array(
            'text' => function_exists('miauw_sanitize_operator_reply') ? miauw_sanitize_operator_reply($text) : $text,
            'fallback' => false,
            'model' => (string) ($route['model'] ?? MIAUW_OPENAI_MODEL) . ':' . (string) ($route['name'] ?? 'route'),
            'engine' => 'php',
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
            'engine' => 'offline',
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
