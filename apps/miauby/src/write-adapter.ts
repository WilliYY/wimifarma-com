import crypto from 'node:crypto';
import type { Pool } from 'pg';

export type MiaubyWriteOperation =
  | 'conversation_message'
  | 'conversation_open'
  | 'tool_trace'
  | 'memory'
  | 'knowledge'
  | 'training_example'
  | 'alert'
  | 'alert_event'
  | 'pattern'
  | 'setting'
  | 'farmacia_popular_value'
  | 'farmacia_popular_update';

export type MiaubyWriteRisk = 'baixo' | 'medio' | 'alto';

export type MiaubyWriteContract = {
  operation: MiaubyWriteOperation;
  target_table: string;
  legacy_source_table: string;
  owner_when_cutover: 'apps/miauby';
  current_official_owner: 'site/miauw PHP';
  risk: MiaubyWriteRisk;
  required_fields: string[];
  idempotency_scope: string[];
  audit_events: string[];
  rollback: {
    type: 'env_only' | 'soft_delete_or_supersede';
    steps: string[];
  };
};

export type MiaubyWriteAdapterEnv = {
  MIAUBY_WRITES_ENABLED?: string;
  MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED?: string;
  MIAUBY_WRITE_ADAPTER_AUDIT_ENABLED?: string;
  MIAUBY_WRITE_ADAPTER_REAL_MESSAGE_ENABLED?: string;
  MIAUBY_WRITE_ADAPTER_REAL_CONVERSATION_ENABLED?: string;
};

export type MiaubyWriteIntentInput = {
  operation?: unknown;
  idempotency_key?: unknown;
  actor?: unknown;
  conversation_legacy_id?: unknown;
  payload?: unknown;
  metadata?: unknown;
};

export type MiaubyWritePlan = {
  ok: boolean;
  mode: 'write_adapter_5c_plan';
  phase: 'Miauby Etapa 5C';
  write_enabled: boolean;
  dry_run_enabled: boolean;
  real_write_supported: boolean;
  real_write_operation_enabled: boolean;
  operation: MiaubyWriteOperation;
  target_table: string;
  idempotency_key: string;
  request_checksum: string;
  validation_errors: string[];
  payload_sanitized: Record<string, unknown>;
  metadata_sanitized: Record<string, unknown>;
  contract: MiaubyWriteContract;
  rollback_plan: MiaubyWriteContract['rollback'];
};

const writeContracts: MiaubyWriteContract[] = [
  {
    operation: 'conversation_message',
    target_table: 'miauby_messages',
    legacy_source_table: 'miauw_mensagens',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['role', 'content_preview'],
    idempotency_scope: ['operation', 'conversation_legacy_id', 'role', 'content_preview'],
    audit_events: ['write_intent_planned', 'message_shadow_write'],
    rollback: {
      type: 'env_only',
      steps: ['MIAUBY_WRITES_ENABLED=false', 'MIAUW_ENGINE=php', 'manter miauw_mensagens como fonte oficial'],
    },
  },
  {
    operation: 'conversation_open',
    target_table: 'miauby_conversations',
    legacy_source_table: 'miauw_conversas',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['title'],
    idempotency_scope: ['operation', 'actor.user_legacy_id', 'title'],
    audit_events: ['write_intent_planned', 'conversation_shadow_write'],
    rollback: {
      type: 'env_only',
      steps: ['MIAUBY_WRITES_ENABLED=false', 'MIAUW_ENGINE=php', 'manter miauw_conversas como fonte oficial'],
    },
  },
  {
    operation: 'tool_trace',
    target_table: 'miauby_tool_traces',
    legacy_source_table: 'miauw_tool_traces',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['tool', 'status'],
    idempotency_scope: ['operation', 'trace_id', 'tool', 'status'],
    audit_events: ['write_intent_planned', 'tool_trace_shadow_write'],
    rollback: {
      type: 'env_only',
      steps: ['MIAUBY_WRITES_ENABLED=false', 'MIAUW_ENGINE=php', 'manter miauw_tool_traces como fonte oficial'],
    },
  },
  {
    operation: 'memory',
    target_table: 'miauby_memories',
    legacy_source_table: 'miauw_memorias',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'alto',
    required_fields: ['content_preview', 'status'],
    idempotency_scope: ['operation', 'content_preview', 'status'],
    audit_events: ['write_intent_planned', 'memory_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['marcar memoria como ignorada/superada', 'MIAUBY_WRITES_ENABLED=false', 'revalidar pacote canonico'],
    },
  },
  {
    operation: 'knowledge',
    target_table: 'miauby_knowledge',
    legacy_source_table: 'miauw_conhecimentos',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'alto',
    required_fields: ['title', 'content_preview'],
    idempotency_scope: ['operation', 'title'],
    audit_events: ['write_intent_planned', 'knowledge_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['desativar conhecimento', 'MIAUBY_WRITES_ENABLED=false', 'revalidar contexto canonico'],
    },
  },
  {
    operation: 'training_example',
    target_table: 'miauby_training_examples',
    legacy_source_table: 'miauw_treinos_respostas',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'alto',
    required_fields: ['question', 'ideal_reply', 'status'],
    idempotency_scope: ['operation', 'question', 'ideal_reply'],
    audit_events: ['write_intent_planned', 'training_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['marcar treino como rejeitado/superado', 'MIAUBY_WRITES_ENABLED=false', 'rodar smoke do pacote canonico'],
    },
  },
  {
    operation: 'alert',
    target_table: 'miauby_alerts',
    legacy_source_table: 'miauw_alertas',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['title', 'status'],
    idempotency_scope: ['operation', 'title', 'status'],
    audit_events: ['write_intent_planned', 'alert_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['dispensar/arquivar alerta', 'MIAUBY_WRITES_ENABLED=false', 'conferir diagnostico'],
    },
  },
  {
    operation: 'alert_event',
    target_table: 'miauby_alert_events',
    legacy_source_table: 'miauw_alerta_eventos',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['event', 'status'],
    idempotency_scope: ['operation', 'alert_legacy_id', 'event', 'status'],
    audit_events: ['write_intent_planned', 'alert_event_shadow_write'],
    rollback: {
      type: 'env_only',
      steps: ['MIAUBY_WRITES_ENABLED=false', 'MIAUW_ENGINE=php', 'preservar evento como auditoria historica'],
    },
  },
  {
    operation: 'pattern',
    target_table: 'miauby_patterns',
    legacy_source_table: 'miauw_padroes',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'alto',
    required_fields: ['pattern', 'status'],
    idempotency_scope: ['operation', 'module', 'pattern'],
    audit_events: ['write_intent_planned', 'pattern_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['marcar padrao como ignorado/superado', 'MIAUBY_WRITES_ENABLED=false', 'revalidar persona/contexto'],
    },
  },
  {
    operation: 'setting',
    target_table: 'miauby_settings',
    legacy_source_table: 'miauw_configuracoes',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'alto',
    required_fields: ['key', 'value'],
    idempotency_scope: ['operation', 'key'],
    audit_events: ['write_intent_planned', 'setting_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['restaurar valor anterior por auditoria', 'MIAUBY_WRITES_ENABLED=false', 'conferir configuracoes PHP'],
    },
  },
  {
    operation: 'farmacia_popular_value',
    target_table: 'miauby_farmacia_popular_values',
    legacy_source_table: 'miauw_farmacia_popular_valores',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['product', 'value'],
    idempotency_scope: ['operation', 'product', 'uf'],
    audit_events: ['write_intent_planned', 'farmacia_popular_value_shadow_write'],
    rollback: {
      type: 'soft_delete_or_supersede',
      steps: ['restaurar valor anterior por historico', 'MIAUBY_WRITES_ENABLED=false', 'rodar validacao de farmacia popular'],
    },
  },
  {
    operation: 'farmacia_popular_update',
    target_table: 'miauby_farmacia_popular_updates',
    legacy_source_table: 'miauw_farmacia_popular_atualizacoes',
    owner_when_cutover: 'apps/miauby',
    current_official_owner: 'site/miauw PHP',
    risk: 'medio',
    required_fields: ['status'],
    idempotency_scope: ['operation', 'source_url', 'status', 'started_at'],
    audit_events: ['write_intent_planned', 'farmacia_popular_update_shadow_write'],
    rollback: {
      type: 'env_only',
      steps: ['MIAUBY_WRITES_ENABLED=false', 'MIAUW_ENGINE=php', 'manter historico como auditoria'],
    },
  },
];

function envBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).trim().toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return [
    'token',
    'secret',
    'senha',
    'password',
    'apikey',
    'authorization',
    'cookie',
    'session',
    'payload',
    'raw',
    'stack',
    'audio',
    'media',
    'midia',
    'telefone',
    'phone',
    'whatsapp',
    'celular',
    'numero',
  ].some((needle) => normalized.includes(needle));
}

function sanitizeString(value: string): string {
  let text = value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[secret-redacted]')
    .replace(/(\+?55)?\D?\d{2}\D?\d{4,5}\D?\d{4}/g, '[telefone-redacted]');

  if (/\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,600}\b(FROM|INTO|SET|WHERE)\b/i.test(text)) {
    return '[sql-redacted]';
  }
  if (/stack trace|fatal error|uncaught exception/i.test(text)) {
    return '[stack-redacted]';
  }
  if (text.length > 4000) {
    text = `${text.slice(0, 4000)}...[truncated]`;
  }
  return text;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (isSensitiveKey(key)) return '[redacted]';
  if (Buffer.isBuffer(value)) return `[binary:${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(`${key}_${index}`, item));
  if (typeof value === 'object') return sanitizeRecord(value as Record<string, unknown>);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizeString(value);
  return value;
}

function sanitizeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function canonicalString(value: unknown, max = 180): string {
  if (value === undefined || value === null) return '';
  return sanitizeString(String(value)).replace(/\s+/g, ' ').trim().slice(0, max);
}

function operationContract(operation: string): MiaubyWriteContract | null {
  return writeContracts.find((contract) => contract.operation === operation) || null;
}

function requiredValue(payload: Record<string, unknown>, field: string): boolean {
  const value = payload[field];
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function actorFromInput(value: unknown): { actor_user_id: number | null; actor_username: string | null } {
  if (!isRecord(value)) return { actor_user_id: null, actor_username: null };
  const userId = Number(value.user_legacy_id ?? value.user_id ?? value.id ?? 0);
  return {
    actor_user_id: Number.isFinite(userId) && userId > 0 ? Math.trunc(userId) : null,
    actor_username: canonicalString(value.username ?? value.login ?? value.name, 80) || null,
  };
}

export function writeAdapterFlags(env: MiaubyWriteAdapterEnv = process.env) {
  const writesEnabled = envBool(env.MIAUBY_WRITES_ENABLED, false);
  const realMessageEnabled = writesEnabled && envBool(env.MIAUBY_WRITE_ADAPTER_REAL_MESSAGE_ENABLED, false);
  const realConversationEnabled = writesEnabled && envBool(env.MIAUBY_WRITE_ADAPTER_REAL_CONVERSATION_ENABLED, false);
  const enabledOperations = [
    realMessageEnabled ? 'conversation_message' : '',
    realConversationEnabled ? 'conversation_open' : '',
  ].filter(Boolean);

  return {
    write_enabled: enabledOperations.length > 0,
    requested_write_enabled: writesEnabled,
    dry_run_enabled: envBool(env.MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED, false),
    audit_enabled: envBool(env.MIAUBY_WRITE_ADAPTER_AUDIT_ENABLED, true),
    real_write_supported: enabledOperations.length > 0,
    real_message_write_enabled: realMessageEnabled,
    real_conversation_write_enabled: realConversationEnabled,
    real_write_operations: enabledOperations,
    blocked_reason: writesEnabled
      ? enabledOperations.length > 0
        ? ''
        : 'real_write_specific_operation_flag_disabled'
      : 'MIAUBY_WRITES_ENABLED=false',
  };
}

export function buildWriteAdapterStatus(env: MiaubyWriteAdapterEnv = process.env) {
  const flags = writeAdapterFlags(env);
  return {
    ok: true,
    service: 'miauby',
    phase: flags.write_enabled ? 'Miauby Etapa 7A' : 'Miauby Etapa 5C',
    mode: flags.write_enabled
      ? 'controlled_dual_write_message_cutover'
      : flags.dry_run_enabled
        ? 'shadow_write_dry_run_controlled'
        : 'shadow_write_dry_run_blocked',
    version: 'miauby-write-adapter-7a-2026-06-04',
    official_response_owner: 'site/miauw PHP',
    official_write_owner: flags.write_enabled ? 'site/miauw PHP + apps/miauby Postgres controlled dual-write' : 'site/miauw PHP',
    route_cutover_enabled: false,
    public_proxy_enabled: false,
    ...flags,
    schema: {
      intent_table: 'miauby_write_intents',
      audit_table: 'miauby_write_audit_events',
      migration_owner: 'apps/miauby/src/shadow-migrate.ts',
    },
    real_write_guard: {
      endpoint: '/miauby/api/internal/write-adapter/commit',
      supported_operations: ['conversation_message', 'conversation_open'],
      requires: [
        'MIAUBY_WRITES_ENABLED=true',
        'MIAUBY_WRITE_ADAPTER_REAL_MESSAGE_ENABLED=true para mensagens',
        'MIAUBY_WRITE_ADAPTER_REAL_CONVERSATION_ENABLED=true para conversas',
        'PHP continua gravando MySQL antes de chamar o adaptador',
      ],
    },
    guarantees: [
      'nao troca /miauw/',
      'nao troca resposta oficial',
      'nao escreve em tabelas de dominio quando MIAUBY_WRITES_ENABLED=false',
      'escrita real so existe para conversa/mensagem e exige flag especifica por operacao',
      'dry-run registra apenas intencao/auditoria quando MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true',
      'idempotencia diferencia duplicidade segura de divergencia por checksum',
      'nao executa tools',
      'payloads sao sanitizados antes de plano/dry-run',
      'rollback imediato por MIAUBY_WRITES_ENABLED=false e MIAUW_ENGINE=php',
    ],
    contracts: writeContracts,
  };
}

export function planWriteIntent(input: MiaubyWriteIntentInput, env: MiaubyWriteAdapterEnv = process.env): MiaubyWritePlan {
  const operation = canonicalString(input.operation, 80) as MiaubyWriteOperation;
  const contract = operationContract(operation);
  if (!contract) {
    const fallback = writeContracts[0];
    return {
      ok: false,
      mode: 'write_adapter_5c_plan',
      phase: 'Miauby Etapa 5C',
      write_enabled: false,
      dry_run_enabled: writeAdapterFlags(env).dry_run_enabled,
      real_write_supported: false,
      real_write_operation_enabled: false,
      operation: fallback.operation,
      target_table: fallback.target_table,
      idempotency_key: '',
      request_checksum: '',
      validation_errors: ['operation_not_supported'],
      payload_sanitized: {},
      metadata_sanitized: {},
      contract: fallback,
      rollback_plan: fallback.rollback,
    };
  }

  const actor = actorFromInput(input.actor);
  const flags = writeAdapterFlags(env);
  const payload = sanitizeRecord(isRecord(input.payload) ? input.payload : {});
  const metadata = sanitizeRecord(isRecord(input.metadata) ? input.metadata : {});
  const validationErrors = contract.required_fields.filter((field) => !requiredValue(payload, field)).map((field) => `missing_required:${field}`);
  const conversationId = Number(input.conversation_legacy_id ?? 0);
  const normalizedConversationId = Number.isFinite(conversationId) && conversationId > 0 ? Math.trunc(conversationId) : null;
  const requestChecksum = sha256({
    operation: contract.operation,
    actor,
    conversation_legacy_id: normalizedConversationId,
    payload,
    metadata,
  });
  const explicitKey = canonicalString(input.idempotency_key, 160);
  const idempotencyKey = explicitKey || `miauby:${contract.operation}:${requestChecksum.slice(0, 32)}`;

  return {
    ok: validationErrors.length === 0,
    mode: 'write_adapter_5c_plan',
    phase: 'Miauby Etapa 5C',
    write_enabled: flags.write_enabled,
    dry_run_enabled: flags.dry_run_enabled,
    real_write_supported: flags.real_write_supported,
    real_write_operation_enabled:
      (contract.operation === 'conversation_message' && flags.real_message_write_enabled) ||
      (contract.operation === 'conversation_open' && flags.real_conversation_write_enabled),
    operation: contract.operation,
    target_table: contract.target_table,
    idempotency_key: idempotencyKey,
    request_checksum: requestChecksum,
    validation_errors: validationErrors,
    payload_sanitized: payload,
    metadata_sanitized: {
      ...metadata,
      actor_user_id: actor.actor_user_id,
      actor_username: actor.actor_username,
      conversation_legacy_id: normalizedConversationId,
    },
    contract,
    rollback_plan: contract.rollback,
  };
}

function pgIdent(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}

export function writeAdapterSchemaSql(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS miauby_write_intents (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      operation TEXT NOT NULL,
      target_table TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'miauby_write_adapter_5c',
      actor_user_id BIGINT,
      actor_username TEXT,
      conversation_legacy_id BIGINT,
      request_checksum TEXT NOT NULL,
      payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      dry_run BOOLEAN NOT NULL DEFAULT true,
      writes_enabled_at_request BOOLEAN NOT NULL DEFAULT false,
      rollback_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_miauby_write_intents_operation_status
      ON miauby_write_intents (operation, status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_miauby_write_intents_actor
      ON miauby_write_intents (actor_user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS miauby_write_audit_events (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      operation TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id BIGINT,
      actor_username TEXT,
      status TEXT NOT NULL,
      dry_run BOOLEAN NOT NULL DEFAULT true,
      writes_enabled_at_request BOOLEAN NOT NULL DEFAULT false,
      payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_miauby_write_audit_events_key
      ON miauby_write_audit_events (idempotency_key, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_miauby_write_audit_events_operation
      ON miauby_write_audit_events (operation, event_type, created_at DESC)`,
  ];
}

export async function ensureWriteAdapterSchema(pool: Pool): Promise<void> {
  for (const sql of writeAdapterSchemaSql()) {
    await pool.query(sql);
  }
}

async function ensureShadowRecordTable(pool: Pool, tableName: 'miauby_conversations' | 'miauby_messages'): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${pgIdent(tableName)} (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT NOT NULL UNIQUE,
      legacy_source_key TEXT NOT NULL,
      source_table TEXT NOT NULL,
      user_legacy_id BIGINT,
      conversation_legacy_id BIGINT,
      role TEXT,
      status TEXT,
      content_preview TEXT,
      payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_checksum TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${pgIdent(`idx_${tableName}_source_created`)}
      ON ${pgIdent(tableName)} (source_table, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${pgIdent(`idx_${tableName}_conversation`)}
      ON ${pgIdent(tableName)} (conversation_legacy_id, created_at DESC)
  `);
}

function numberFromPayload(plan: MiaubyWritePlan, keys: string[]): number | null {
  for (const key of keys) {
    const value = plan.payload_sanitized[key] ?? plan.metadata_sanitized[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }
  return null;
}

function targetSourceForPlan(plan: MiaubyWritePlan): {
  tableName: 'miauby_conversations' | 'miauby_messages';
  sourceTable: 'miauw_conversas' | 'miauw_mensagens';
  legacyId: number;
  legacySourceKey: string;
  userLegacyId: number | null;
  conversationLegacyId: number | null;
  role: string | null;
  status: string | null;
  contentPreview: string | null;
} | null {
  if (plan.operation === 'conversation_message') {
    const legacyId = numberFromPayload(plan, ['legacy_mysql_id', 'id', 'message_legacy_id']);
    if (legacyId === null) return null;
    const conversationId = Number(plan.metadata_sanitized.conversation_legacy_id ?? plan.payload_sanitized.conversa_id ?? 0);
    return {
      tableName: 'miauby_messages',
      sourceTable: 'miauw_mensagens',
      legacyId,
      legacySourceKey: `miauw_mensagens:id:${legacyId}`,
      userLegacyId: numberFromPayload(plan, ['usuario_id', 'user_legacy_id', 'actor_user_id']),
      conversationLegacyId: Number.isFinite(conversationId) && conversationId > 0 ? Math.trunc(conversationId) : null,
      role: canonicalString(plan.payload_sanitized.role ?? plan.payload_sanitized.papel, 80) || null,
      status: canonicalString(plan.payload_sanitized.status, 80) || null,
      contentPreview: canonicalString(
        plan.payload_sanitized.content_preview ?? plan.payload_sanitized.conteudo ?? plan.payload_sanitized.message,
        700,
      ) || null,
    };
  }

  if (plan.operation === 'conversation_open') {
    const legacyId = numberFromPayload(plan, ['legacy_mysql_id', 'id', 'conversation_legacy_id']);
    if (legacyId === null) return null;
    return {
      tableName: 'miauby_conversations',
      sourceTable: 'miauw_conversas',
      legacyId,
      legacySourceKey: `miauw_conversas:id:${legacyId}`,
      userLegacyId: numberFromPayload(plan, ['usuario_id', 'user_legacy_id', 'actor_user_id']),
      conversationLegacyId: legacyId,
      role: null,
      status: canonicalString(plan.payload_sanitized.status, 80) || 'aberta',
      contentPreview: canonicalString(
        plan.payload_sanitized.title ?? plan.payload_sanitized.titulo ?? plan.payload_sanitized.content_preview,
        700,
      ) || null,
    };
  }

  return null;
}

async function upsertShadowRecord(pool: Pool, plan: MiaubyWritePlan): Promise<{ ok: boolean; status: string; target_table?: string }> {
  const target = targetSourceForPlan(plan);
  if (target === null) {
    return { ok: false, status: 'missing_legacy_target' };
  }

  await ensureShadowRecordTable(pool, target.tableName);
  await pool.query(
    `INSERT INTO ${pgIdent(target.tableName)} (
       legacy_mysql_id, legacy_source_key, source_table, user_legacy_id, conversation_legacy_id,
       role, status, content_preview, payload_sanitized, source_checksum,
       created_at, updated_at, migrated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9::jsonb, $10,
       NOW(), NOW(), NOW()
     )
     ON CONFLICT (legacy_mysql_id) DO UPDATE SET
       legacy_source_key = EXCLUDED.legacy_source_key,
       source_table = EXCLUDED.source_table,
       user_legacy_id = EXCLUDED.user_legacy_id,
       conversation_legacy_id = EXCLUDED.conversation_legacy_id,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       content_preview = EXCLUDED.content_preview,
       payload_sanitized = EXCLUDED.payload_sanitized,
       source_checksum = EXCLUDED.source_checksum,
       updated_at = NOW(),
       migrated_at = NOW()`,
    [
      target.legacyId,
      target.legacySourceKey,
      target.sourceTable,
      target.userLegacyId,
      target.conversationLegacyId,
      target.role,
      target.status,
      target.contentPreview,
      JSON.stringify(plan.payload_sanitized),
      sha256(plan.payload_sanitized),
    ],
  );

  return { ok: true, status: 'target_upserted', target_table: target.tableName };
}

export async function recordWriteAdapterDryRun(pool: Pool, input: MiaubyWriteIntentInput, env: MiaubyWriteAdapterEnv = process.env) {
  const flags = writeAdapterFlags(env);
  const plan = planWriteIntent(input, env);
  if (!plan.ok) {
    return { ok: false, status: 'validation_failed', plan };
  }
  if (!flags.dry_run_enabled) {
    return { ok: false, status: 'blocked_by_env', blocked_reason: 'MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false', plan };
  }

  const actorUserId = Number(plan.metadata_sanitized.actor_user_id ?? 0);
  const conversationId = Number(plan.metadata_sanitized.conversation_legacy_id ?? 0);
  const actorUsername = canonicalString(plan.metadata_sanitized.actor_username, 80) || null;

  const insertResult = await pool.query<{ status: string }>(
    `INSERT INTO miauby_write_intents (
       idempotency_key, operation, target_table, actor_user_id, actor_username, conversation_legacy_id,
       request_checksum, payload_sanitized, metadata_sanitized, status, dry_run,
       writes_enabled_at_request, rollback_plan, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8::jsonb, $9::jsonb, 'dry_run_recorded', true,
       false, $10::jsonb, NOW()
     )
     ON CONFLICT (idempotency_key) DO UPDATE SET
       status = CASE
         WHEN miauby_write_intents.request_checksum = EXCLUDED.request_checksum THEN 'dry_run_duplicate'
         ELSE 'dry_run_divergence'
       END,
       updated_at = NOW()
     RETURNING status`,
    [
      plan.idempotency_key,
      plan.operation,
      plan.target_table,
      Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorUsername,
      Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
      plan.request_checksum,
      JSON.stringify(plan.payload_sanitized),
      JSON.stringify(plan.metadata_sanitized),
      JSON.stringify(plan.rollback_plan),
    ],
  );

  const recordedStatus = String(insertResult.rows[0]?.status || 'dry_run_recorded');

  await pool.query(
    `INSERT INTO miauby_write_audit_events (
       idempotency_key, operation, event_type, actor_user_id, actor_username, status,
       dry_run, writes_enabled_at_request, payload_sanitized, metadata_sanitized
     ) VALUES ($1, $2, $3, $4, $5, $6, true, false, $7::jsonb, $8::jsonb)`,
    [
      plan.idempotency_key,
      plan.operation,
      recordedStatus,
      Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorUsername,
      recordedStatus === 'dry_run_divergence' ? 'divergence' : 'ok',
      JSON.stringify(plan.payload_sanitized),
      JSON.stringify(plan.metadata_sanitized),
    ],
  );

  return {
    ok: recordedStatus !== 'dry_run_divergence',
    status: recordedStatus,
    divergence_detected: recordedStatus === 'dry_run_divergence',
    real_write_executed: false,
    plan,
  };
}

export async function recordWriteAdapterCommit(pool: Pool, input: MiaubyWriteIntentInput, env: MiaubyWriteAdapterEnv = process.env) {
  const plan = planWriteIntent(input, env);
  if (!plan.ok) {
    return { ok: false, status: 'validation_failed', real_write_executed: false, plan };
  }
  if (!plan.real_write_operation_enabled) {
    return {
      ok: false,
      status: 'blocked_by_env',
      blocked_reason: 'MIAUBY_WRITES_ENABLED=true e flag especifica da operacao sao obrigatorios',
      real_write_executed: false,
      plan,
    };
  }
  if (!['conversation_message', 'conversation_open'].includes(plan.operation)) {
    return { ok: false, status: 'real_write_operation_not_supported', real_write_executed: false, plan };
  }

  await ensureWriteAdapterSchema(pool);

  const actorUserId = Number(plan.metadata_sanitized.actor_user_id ?? 0);
  const conversationId = Number(plan.metadata_sanitized.conversation_legacy_id ?? 0);
  const actorUsername = canonicalString(plan.metadata_sanitized.actor_username, 80) || null;

  const insertResult = await pool.query<{ status: string }>(
    `INSERT INTO miauby_write_intents (
       idempotency_key, operation, target_table, actor_user_id, actor_username, conversation_legacy_id,
       request_checksum, payload_sanitized, metadata_sanitized, status, dry_run,
       writes_enabled_at_request, rollback_plan, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8::jsonb, $9::jsonb, 'real_write_recorded', false,
       true, $10::jsonb, NOW()
     )
     ON CONFLICT (idempotency_key) DO UPDATE SET
       status = CASE
         WHEN miauby_write_intents.request_checksum <> EXCLUDED.request_checksum THEN 'real_write_divergence'
         WHEN miauby_write_intents.status IN ('real_write_recorded', 'real_write_duplicate') THEN 'real_write_duplicate'
         ELSE 'real_write_recorded'
       END,
       dry_run = false,
       writes_enabled_at_request = true,
       updated_at = NOW()
     RETURNING status`,
    [
      plan.idempotency_key,
      plan.operation,
      plan.target_table,
      Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorUsername,
      Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
      plan.request_checksum,
      JSON.stringify(plan.payload_sanitized),
      JSON.stringify(plan.metadata_sanitized),
      JSON.stringify(plan.rollback_plan),
    ],
  );

  const recordedStatus = String(insertResult.rows[0]?.status || 'real_write_recorded');
  let targetResult: { ok: boolean; status: string; target_table?: string } = { ok: false, status: 'not_attempted' };
  if (recordedStatus !== 'real_write_divergence') {
    targetResult = await upsertShadowRecord(pool, plan);
  }

  await pool.query(
    `INSERT INTO miauby_write_audit_events (
       idempotency_key, operation, event_type, actor_user_id, actor_username, status,
       dry_run, writes_enabled_at_request, payload_sanitized, metadata_sanitized
     ) VALUES ($1, $2, $3, $4, $5, $6, false, true, $7::jsonb, $8::jsonb)`,
    [
      plan.idempotency_key,
      plan.operation,
      targetResult.ok ? recordedStatus : targetResult.status,
      Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorUsername,
      recordedStatus === 'real_write_divergence' || !targetResult.ok ? 'error' : 'ok',
      JSON.stringify(plan.payload_sanitized),
      JSON.stringify({
        ...plan.metadata_sanitized,
        target_table: targetResult.target_table || plan.target_table,
        target_status: targetResult.status,
      }),
    ],
  );

  const ok = recordedStatus !== 'real_write_divergence' && targetResult.ok;
  return {
    ok,
    status: ok ? recordedStatus : targetResult.status,
    divergence_detected: recordedStatus === 'real_write_divergence',
    real_write_executed: ok,
    target_status: targetResult.status,
    target_table: targetResult.target_table || plan.target_table,
    plan,
  };
}
