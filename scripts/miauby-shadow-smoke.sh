#!/usr/bin/env sh
set -eu

SAMPLE="${1:-20}"
CONTEXT_LIMIT="${2:-3}"

cd "$(dirname "$0")/.."

docker exec \
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

async function readJson(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
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

const unauthorized = await readJson('/api/internal/status');
assert(unauthorized.response.status === 401 || unauthorized.response.status === 503, 'internal_status_must_reject_without_token');
assert(token !== '', 'internal_token_not_configured');

const headers = { 'x-miauby-internal-token': token };
const readiness = await readJson(`/api/internal/readiness?sample=${sample}`, headers);
assert(readiness.response.ok && readiness.body.ok === true, 'readiness_failed');
assert(readiness.body.write_enabled === false, 'readiness_must_be_read_only');
assert(readiness.body.route_cutover_enabled === false, 'route_cutover_must_stay_disabled');
assert(readiness.body.public_proxy_enabled === false, 'public_proxy_must_stay_disabled');
assert(readiness.body.checks?.parity?.ok === true, 'parity_summary_failed');

const context = await readJson(`/api/internal/context?limit=${contextLimit}`, headers);
assert(context.response.ok && context.body.ok === true, 'context_failed');
assert(context.body.raw_payload_returned === false, 'context_must_not_return_raw_payload');
assert(Array.isArray(context.body.sections) && context.body.sections.length >= 5, 'context_sections_missing');

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
}, null, 2));
NODE
