#!/usr/bin/env sh
set -eu

SAMPLE="${1:-20}"
CONTEXT_LIMIT="${2:-3}"

cd "$(dirname "$0")/.."

docker exec -i \
  -e "MIAUBY_SMOKE_SAMPLE=${SAMPLE}" \
  -e "MIAUBY_SMOKE_CONTEXT_LIMIT=${CONTEXT_LIMIT}" \
  wimifarma-miauby-app \
  node --input-type=module <<'NODE'
const baseUrl = 'http://127.0.0.1:4100/miauby';
const sample = encodeURIComponent(process.env.MIAUBY_SMOKE_SAMPLE || '20');
const contextLimit = encodeURIComponent(process.env.MIAUBY_SMOKE_CONTEXT_LIMIT || '3');
const token = process.env.MIAUBY_INTERNAL_TOKEN || process.env.MIAUW_GUARDIAN_TOKEN || process.env.MIAUW_AGENT_INTERNAL_TOKEN || '';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(path, headers = {}, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, ...options });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { response, body };
}

const health = await readJson('/health');
assert(health.response.ok && health.body.ok === true, 'health_failed');
assert(health.body.write_enabled === false, 'health_must_be_read_only');
assert(health.body.write_adapter?.write_enabled === false, 'health_write_adapter_must_stay_disabled');

const unauthorized = await readJson('/api/internal/status');
assert(unauthorized.response.status === 401 || unauthorized.response.status === 503, 'internal_status_must_reject_without_token');
assert(token !== '', 'internal_token_not_configured');

const headers = { 'x-miauby-internal-token': token };
const readiness = await readJson(`/api/internal/readiness?sample=${sample}`, headers);
assert(readiness.response.ok && readiness.body.ok === true, 'readiness_failed');
assert(readiness.body.write_enabled === false, 'readiness_must_be_read_only');
assert(readiness.body.route_cutover_enabled === false, 'route_cutover_must_stay_disabled');
assert(readiness.body.public_proxy_enabled === false, 'public_proxy_must_stay_disabled');
assert(readiness.body.write_adapter?.write_enabled === false, 'readiness_write_adapter_must_stay_disabled');
assert(readiness.body.checks?.parity?.ok === true, 'parity_summary_failed');

const context = await readJson(`/api/internal/context?limit=${contextLimit}`, headers);
assert(context.response.ok && context.body.ok === true, 'context_failed');
assert(context.body.raw_payload_returned === false, 'context_must_not_return_raw_payload');
assert(Array.isArray(context.body.sections) && context.body.sections.length >= 5, 'context_sections_missing');

const canonical = await readJson(`/api/internal/canonical-context?limit=${contextLimit}&message=${encodeURIComponent('teste miauby cotacao')}`, headers);
assert(canonical.response.ok && canonical.body.ok === true, 'canonical_context_failed');
assert(canonical.body.mode === 'node_read_only_context_persona_tools', 'canonical_context_mode_invalid');
assert(canonical.body.write_enabled === false && canonical.body.writes_enabled_in_node === false, 'canonical_context_must_be_read_only');
assert(canonical.body.php_official_response === true, 'canonical_context_must_keep_php_official');
assert(canonical.body.raw_payload_returned === false, 'canonical_context_must_not_return_raw_payload');
assert(canonical.body.tool_contracts?.summary?.schemas_exported >= 10, 'canonical_tool_contracts_missing');
assert(canonical.body.style_context?.training_profile, 'canonical_training_profile_missing');
assert(canonical.body.canonical_read_model?.version === 'miauby-read-model-5a-2026-06-02', 'canonical_5a_read_model_missing');
assert(canonical.body.canonical_read_model?.mode === 'node_postgres_read_only', 'canonical_5a_read_model_mode_invalid');
assert(canonical.body.canonical_read_model?.frontend_unchanged === true, 'canonical_5a_frontend_guard_missing');
assert(canonical.body.canonical_read_model?.guards?.write_enabled === false, 'canonical_5a_write_guard_invalid');
assert(canonical.body.canonical_read_model?.guards?.openai_called === false, 'canonical_5a_must_not_call_openai');
assert(canonical.body.canonical_read_model?.guards?.tools_executed === false, 'canonical_5a_must_not_execute_tools');
assert(canonical.body.canonical_read_model?.sections?.persona?.version, 'canonical_5a_persona_missing');
assert(canonical.body.canonical_read_model?.sections?.approved_training?.selection === 'status aprovado only', 'canonical_5a_training_selection_invalid');
assert(canonical.body.canonical_read_model?.sections?.memories?.selection === 'approved_reviewed_only', 'canonical_5a_memories_selection_invalid');
assert(canonical.body.canonical_read_model?.sections?.knowledge?.selection === 'active_or_approved_only', 'canonical_5a_knowledge_selection_invalid');
assert(canonical.body.canonical_read_model?.sections?.tool_contracts?.writes_enabled_in_node === false, 'canonical_5a_tool_write_guard_invalid');
assert(Array.isArray(canonical.body.style_context?.memory_context?.items), 'canonical_memory_context_missing');
assert(Array.isArray(canonical.body.style_context?.knowledge_context?.items), 'canonical_knowledge_context_missing');

const cutover = await readJson('/api/internal/cutover', headers);
assert(cutover.response.ok && cutover.body.ok === true, 'cutover_inventory_failed');
assert(cutover.body.mode === 'cutover_inventory_read_only', 'cutover_inventory_mode_invalid');
assert(cutover.body.guards?.write_enabled === false, 'cutover_write_must_stay_disabled');
assert(cutover.body.guards?.route_cutover_enabled === false, 'cutover_route_must_stay_disabled');
assert(cutover.body.write_adapter_5b?.write_enabled === false, 'cutover_write_adapter_must_stay_disabled');
assert(Array.isArray(cutover.body.flows) && cutover.body.flows.length >= 5, 'cutover_flows_missing');

const writeAdapter = await readJson('/api/internal/write-adapter', headers);
assert(writeAdapter.response.ok && writeAdapter.body.ok === true, 'write_adapter_status_failed');
assert(writeAdapter.body.mode === 'write_adapter_prepared_disabled', 'write_adapter_mode_invalid');
assert(writeAdapter.body.write_enabled === false, 'write_adapter_must_stay_disabled');
assert(writeAdapter.body.real_write_supported === false, 'write_adapter_real_write_must_not_exist_in_5b');
assert(Array.isArray(writeAdapter.body.contracts) && writeAdapter.body.contracts.length >= 8, 'write_adapter_contracts_missing');

const writePlan = await readJson('/api/internal/write-adapter/plan', {
  ...headers,
  'content-type': 'application/json',
}, {
  method: 'POST',
  body: JSON.stringify({
    operation: 'conversation_message',
    conversation_legacy_id: 1,
    payload: {
      role: 'user',
      content_preview: 'teste seguro 5B',
      telefone: '+55 44 99999-9999',
    },
  }),
});
assert(writePlan.response.ok && writePlan.body.ok === true, 'write_adapter_plan_failed');
assert(writePlan.body.write_enabled === false, 'write_adapter_plan_must_stay_disabled');
assert(writePlan.body.real_write_supported === false, 'write_adapter_plan_real_write_must_not_exist');
assert(writePlan.body.payload_sanitized?.telefone === '[redacted]', 'write_adapter_plan_must_redact_phone');

const dryRun = await readJson('/api/internal/write-adapter/dry-run', {
  ...headers,
  'content-type': 'application/json',
}, {
  method: 'POST',
  body: JSON.stringify({
    operation: 'conversation_message',
    conversation_legacy_id: 1,
    payload: {
      role: 'user',
      content_preview: 'teste seguro 5B',
    },
  }),
});
assert(dryRun.response.status === 409 && dryRun.body.status === 'blocked_by_env', 'write_adapter_dry_run_must_stay_blocked_by_env');

console.log(JSON.stringify({
  ok: true,
  health: {
    version: health.body.version,
    mode: health.body.mode,
    latest_migration_ok: health.body.latest_migration_ok,
  },
  readiness: {
    sample_limit: readiness.body.checks.parity.sample_limit,
    tables_total: readiness.body.checks.parity.tables_total,
    count_mismatches: readiness.body.checks.parity.count_mismatches,
    sample_mismatches: readiness.body.checks.parity.sample_mismatches,
  },
  context_sections: context.body.sections.map((section) => ({
    key: section.key,
    count: section.count,
    returned: section.items.length,
  })),
  canonical_context: {
    version: canonical.body.context_version,
    mode: canonical.body.mode,
    read_model: canonical.body.canonical_read_model.version,
    tools: canonical.body.tool_contracts.summary.schemas_exported,
    training_selected: canonical.body.style_context.training_profile.examples_selected,
    memories_selected: canonical.body.canonical_read_model.sections.memories.selected,
    knowledge_selected: canonical.body.canonical_read_model.sections.knowledge.selected,
    php_official_response: canonical.body.php_official_response,
  },
  cutover: {
    mode: cutover.body.mode,
    flows: cutover.body.flows.length,
    hard_blockers: cutover.body.hard_blockers.length,
  },
  write_adapter: {
    mode: writeAdapter.body.mode,
    contracts: writeAdapter.body.contracts.length,
    dry_run_status: dryRun.body.status,
  },
}, null, 2));
NODE
