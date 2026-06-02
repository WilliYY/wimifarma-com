#!/usr/bin/env sh
set -eu

EXPECTED_ENGINE="${1:-}"
RUN_AGENT="${MIAUBY_NODE_CUTOVER_RUN_AGENT:-false}"

cd "$(dirname "$0")/.."

docker exec -i \
  -e "MIAUBY_NODE_CUTOVER_EXPECT_ENGINE=${EXPECTED_ENGINE}" \
  wimifarma-com-web \
  php <<'PHP'
<?php
declare(strict_types=1);

require_once '/var/www/html/miauw/bootstrap.php';

function smoke_fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function smoke_assert(bool $condition, string $message): void
{
    if (!$condition) {
        smoke_fail($message);
    }
}

$expectedEngine = trim((string) getenv('MIAUBY_NODE_CUTOVER_EXPECT_ENGINE'));
$adm = array('id' => 1, 'username' => 'adm', 'role' => 'admin');
$operador = array('id' => 999999, 'username' => 'operador_smoke', 'role' => 'operador');

$public = function_exists('miauw_agent_public_status') ? miauw_agent_public_status() : array();
$admRuntime = function_exists('miauw_agent_runtime_status') ? miauw_agent_runtime_status($adm) : array();
$operatorRuntime = function_exists('miauw_agent_runtime_status') ? miauw_agent_runtime_status($operador) : array();
$engine = (string) ($admRuntime['engine'] ?? '');

smoke_assert(in_array($engine, array('php', 'node_shadow', 'node'), true), 'engine_invalid');
if ($expectedEngine !== '') {
    smoke_assert($engine === $expectedEngine, 'engine_expected_' . $expectedEngine . '_got_' . $engine);
}

smoke_assert(!empty($admRuntime['engine_allowed']), 'adm_must_be_allowed');
smoke_assert(empty($operatorRuntime['engine_allowed']), 'operator_smoke_must_not_be_allowed_by_default');
smoke_assert(($admRuntime['write_owner'] ?? '') === 'php_mysql', 'write_owner_must_stay_php_mysql');
smoke_assert(($admRuntime['route_cutover_enabled'] ?? true) === false, 'route_cutover_must_stay_disabled');
smoke_assert(($admRuntime['public_proxy_enabled'] ?? true) === false, 'public_proxy_must_stay_disabled');
smoke_assert(($admRuntime['node_failure_fallback_owner'] ?? '') === 'php', 'node_failure_must_fallback_to_php');

if ($engine === 'node') {
    smoke_assert(($admRuntime['official_response_owner'] ?? '') === 'node', 'adm_official_owner_must_be_node');
    smoke_assert(($operatorRuntime['official_response_owner'] ?? '') === 'php', 'operator_official_owner_must_stay_php');
    smoke_assert(($admRuntime['node_primary_active_for_user'] ?? false) === true, 'adm_node_primary_must_be_active');
    smoke_assert(($operatorRuntime['node_primary_active_for_user'] ?? true) === false, 'operator_node_primary_must_be_inactive');
} elseif ($engine === 'node_shadow') {
    smoke_assert(($admRuntime['official_response_owner'] ?? '') === 'php', 'node_shadow_must_keep_php_official');
    smoke_assert(($admRuntime['node_shadow_active_for_user'] ?? false) === true, 'adm_node_shadow_must_be_active');
} else {
    smoke_assert(($admRuntime['official_response_owner'] ?? '') === 'php', 'php_engine_must_keep_php_official');
}

echo json_encode(array(
    'ok' => true,
    'public_engine' => $public['engine'] ?? '',
    'adm' => array(
        'engine' => $admRuntime['engine'] ?? '',
        'engine_allowed' => $admRuntime['engine_allowed'] ?? false,
        'official_response_owner' => $admRuntime['official_response_owner'] ?? '',
        'write_owner' => $admRuntime['write_owner'] ?? '',
        'node_primary_active_for_user' => $admRuntime['node_primary_active_for_user'] ?? false,
        'node_shadow_active_for_user' => $admRuntime['node_shadow_active_for_user'] ?? false,
    ),
    'operator_smoke' => array(
        'engine_allowed' => $operatorRuntime['engine_allowed'] ?? false,
        'official_response_owner' => $operatorRuntime['official_response_owner'] ?? '',
        'node_primary_active_for_user' => $operatorRuntime['node_primary_active_for_user'] ?? false,
    ),
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), PHP_EOL;
PHP

if [ "$RUN_AGENT" = "true" ]; then
  docker exec -i wimifarma-miauw-agent node --input-type=module <<'NODE'
const token = process.env.MIAUW_AGENT_INTERNAL_TOKEN || process.env.MIAUW_GUARDIAN_TOKEN || '';
if (!token) {
  throw new Error('agent_internal_token_not_configured');
}

const response = await fetch('http://127.0.0.1:3100/miauw/agent/run', {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-miauw-agent-token': token,
  },
  body: JSON.stringify({
    trace_id: `cutover-smoke-${Date.now()}`,
    message: 'responda apenas: smoke node ok',
    user_context: { id: 1, username: 'adm', role: 'admin' },
  }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok !== true || typeof body.text !== 'string' || body.text.trim() === '') {
  throw new Error(`agent_run_failed_${response.status}_${body.error || body.message || 'unknown'}`);
}
console.log(JSON.stringify({
  ok: true,
  mode: body.mode,
  model: body.model,
  text_preview: body.text.slice(0, 120),
  duration_ms: body.duration_ms,
}, null, 2));
NODE
fi
