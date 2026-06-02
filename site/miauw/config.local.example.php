<?php
declare(strict_types=1);

/*
 * Copie este arquivo para config.local.php no servidor e coloque sua chave.
 * Nao exponha a chave no JavaScript nem em paginas publicas.
 */
define('MIAUW_OPENAI_API_KEY', 'cole_sua_chave_aqui');
define('MIAUW_OPENAI_MODEL', 'gpt-5.4-mini'); // base/fallback principal
define('MIAUW_MODEL_FAST', 'gpt-5.4-mini'); // respostas simples, custo menor
define('MIAUW_MODEL_SMART', 'gpt-5.4'); // sistema, financeiro, cotacao e pesquisa
define('MIAUW_MODEL_BOSS', 'gpt-5.4'); // auditoria, gestor, decisao e estrategia
define('MIAUW_MODEL_FALLBACK', 'gpt-5.4-mini');
define('MIAUW_MAX_OUTPUT_TOKENS', 420);
define('MIAUW_MAX_OUTPUT_TOKENS_FAST', 360);
define('MIAUW_MAX_OUTPUT_TOKENS_SMART', 720);
define('MIAUW_MAX_OUTPUT_TOKENS_BOSS', 1100);
define('MIAUW_TEMPERATURE', 0.82);
define('MIAUW_REASONING_FAST', 'low');
define('MIAUW_REASONING_SMART', 'high');
define('MIAUW_REASONING_BOSS', 'xhigh');
define('MIAUW_OPENAI_TOOLS', true);
define('MIAUW_FARMACIA_POPULAR_UF', 'PR');

/*
 * Opcional: token para executar /miauw/guardian-cron.php e
 * /miauw/farmacia-popular-cron.php pelo navegador/cron HTTP.
 * Se usar cron por CLI no cPanel, nao precisa preencher.
 */
define('MIAUW_GUARDIAN_TOKEN', 'troque_por_um_token_grande');

/*
 * Opcional: servico Miauby agente em Node/Agents SDK.
 * MIAUBY_ENGINE e MIAUW_ENGINE aceitam php, node_shadow ou node.
 * Use node somente para usuarios liberados e com rollback por env testado.
 */
// define('MIAUW_AGENT_INTERNAL_TOKEN', ''); // se vazio/omitido, use MIAUW_GUARDIAN_TOKEN ou .env
define('MIAUW_AGENT_INTERNAL_BASE_URL', 'http://wimifarma-miauw-agent:3100/miauw/agent');
define('MIAUBY_CONTEXT_SHADOW_ENABLED', false);
define('MIAUBY_CONTEXT_INTERNAL_URL', 'http://wimifarma-miauby-app:4100/miauby/api/internal/canonical-context');
define('MIAUBY_CONTEXT_SHADOW_TIMEOUT_MS', 2500);
define('MIAUBY_WRITE_SHADOW_ENABLED', false);
define('MIAUBY_WRITE_SHADOW_ALLOWED_USERS', 'adm');
define('MIAUBY_WRITE_ADAPTER_INTERNAL_URL', 'http://wimifarma-miauby-app:4100/miauby/api/internal/write-adapter/dry-run');
define('MIAUBY_WRITE_SHADOW_TIMEOUT_MS', 900);
define('MIAUW_AGENT_SHADOW_ON_SEND', false);
define('MIAUW_AGENT_SHADOW_TIMEOUT_MS', 12000);
define('MIAUBY_ENGINE', '');
define('MIAUW_ENGINE', 'php');
define('MIAUW_AGENT_ENGINE_ALLOWED_USERS', 'adm');
define('MIAUW_MAINTENANCE_MODE', false);
define('MIAUW_MAINTENANCE_ALLOWED_USERS', 'adm');
define('MIAUW_MAINTENANCE_MESSAGE', 'Miauby esta em atualizacao interna agora. O acesso operacional volta em instantes.');

/*
 * Opcional: ponte interna Miauby -> Cotacao V2. Se ficar vazio, o Miauby
 * usa MIAUW_GUARDIAN_TOKEN como token interno quando o ambiente tambem passar
 * esse valor para o container da Cotacao.
 */
// define('COTACAO_INTERNAL_TOKEN', ''); // se vazio/omitido, use MIAUW_GUARDIAN_TOKEN ou .env
define('COTACAO_INTERNAL_BASE_URL', 'http://wimifarma-cotacao-app:3000/cotacao');
