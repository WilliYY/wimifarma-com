import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { Pool, type PoolClient } from 'pg';
import { buildCanonicalToolContracts } from './tool-contracts.js';

type MysqlRow = RowDataPacket & Record<string, unknown>;

type SourceTable = {
  source: string;
  target: string;
  previewFields: string[];
};

type ShadowReadSection = SourceTable & {
  key: string;
  label: string;
};

const env = process.env;
const serviceVersion = '0.5.0';
const port = Number(env.PORT || 4100);
const basePath = `/${String(env.BASE_PATH || '/miauby').replace(/^\/+|\/+$/g, '')}`;

const sourceTables: SourceTable[] = [
  { source: 'miauw_conversas', target: 'miauby_conversations', previewFields: ['titulo', 'title', 'resumo', 'summary'] },
  { source: 'miauw_mensagens', target: 'miauby_messages', previewFields: ['mensagem', 'message', 'conteudo', 'content', 'texto', 'resposta', 'pergunta'] },
  { source: 'miauw_treinos_respostas', target: 'miauby_training_examples', previewFields: ['pergunta', 'resposta', 'prompt', 'completion', 'texto'] },
  { source: 'miauw_memorias', target: 'miauby_memories', previewFields: ['memoria', 'memory', 'conteudo', 'resumo', 'texto'] },
  { source: 'miauw_conhecimentos', target: 'miauby_knowledge', previewFields: ['titulo', 'conteudo', 'texto', 'resumo'] },
  { source: 'miauw_alertas', target: 'miauby_alerts', previewFields: ['titulo', 'descricao', 'mensagem', 'status'] },
  { source: 'miauw_alerta_eventos', target: 'miauby_alert_events', previewFields: ['evento', 'descricao', 'mensagem', 'status'] },
  { source: 'miauw_padroes', target: 'miauby_patterns', previewFields: ['padrao', 'descricao', 'exemplo', 'status'] },
  { source: 'miauw_tool_traces', target: 'miauby_tool_traces', previewFields: ['tool', 'trace_id', 'acao', 'status', 'erro'] },
  { source: 'miauw_configuracoes', target: 'miauby_settings', previewFields: ['chave', 'key', 'nome', 'valor', 'value'] },
  { source: 'miauw_farmacia_popular_valores', target: 'miauby_farmacia_popular_values', previewFields: ['produto', 'nome', 'ean', 'valor'] },
  { source: 'miauw_farmacia_popular_atualizacoes', target: 'miauby_farmacia_popular_updates', previewFields: ['origem', 'status', 'resumo', 'mensagem'] },
];

const readSections: ShadowReadSection[] = [
  { key: 'training_examples', label: 'Treinos aprovados/revisaveis', source: 'miauw_treinos_respostas', target: 'miauby_training_examples', previewFields: [] },
  { key: 'memories', label: 'Memorias revisadas', source: 'miauw_memorias', target: 'miauby_memories', previewFields: [] },
  { key: 'knowledge', label: 'Conhecimentos operacionais', source: 'miauw_conhecimentos', target: 'miauby_knowledge', previewFields: [] },
  { key: 'alerts', label: 'Alertas', source: 'miauw_alertas', target: 'miauby_alerts', previewFields: [] },
  { key: 'patterns', label: 'Padroes', source: 'miauw_padroes', target: 'miauby_patterns', previewFields: [] },
  { key: 'tool_traces', label: 'Traces recentes', source: 'miauw_tool_traces', target: 'miauby_tool_traces', previewFields: [] },
  { key: 'settings', label: 'Configuracoes nao secretas', source: 'miauw_configuracoes', target: 'miauby_settings', previewFields: [] },
];

type CutoverFlow = {
  key: string;
  status: 'legacy_official' | 'shadow_ready' | 'blocked_until_contract';
  current_owner: string;
  current_storage: string[];
  shadow_storage: string[];
  next_step: string;
  validation: string[];
};

const cutoverFlows: CutoverFlow[] = [
  {
    key: 'chat_messages',
    status: 'legacy_official',
    current_owner: 'site/miauw/api.php?action=send',
    current_storage: ['miauw_conversas', 'miauw_mensagens', 'miauw_tool_traces', 'miauw_channel_events fallback'],
    shadow_storage: ['miauby_conversations', 'miauby_messages', 'miauby_tool_traces'],
    next_step: 'criar adaptador de escrita do Miauby Node desligado por env, mantendo PHP como fonte oficial ate paridade de mensagem e trace',
    validation: ['mensagem do operador', 'resposta do assistente', 'trace sanitizado', 'fallback PHP quando Node falhar'],
  },
  {
    key: 'training_review',
    status: 'legacy_official',
    current_owner: 'site/miauw/treino.php',
    current_storage: ['miauw_treinos_respostas', 'wf_logs legado curto quando usado'],
    shadow_storage: ['miauby_training_examples'],
    next_step: 'migrar contrato de revisao/aprovacao para endpoint Node tokenizado antes de trocar a tela',
    validation: ['aprovar treino', 'rejeitar treino', 'criar ajuste', 'nao duplicar parent_id/status'],
  },
  {
    key: 'memory_and_knowledge',
    status: 'legacy_official',
    current_owner: 'site/miauw/miauw-funcoes.php',
    current_storage: ['miauw_memorias', 'miauw_conhecimentos'],
    shadow_storage: ['miauby_memories', 'miauby_knowledge'],
    next_step: 'separar leitura e escrita de memoria/conhecimento em contratos pequenos antes do corte',
    validation: ['memoria revisavel', 'conhecimento ativo', 'redacao de segredo/telefone', 'uso sem payload bruto'],
  },
  {
    key: 'alerts_patterns',
    status: 'legacy_official',
    current_owner: 'site/miauw/miauw-intelligence.php',
    current_storage: ['miauw_alertas', 'miauw_alerta_eventos', 'miauw_padroes', 'miauw_configuracoes'],
    shadow_storage: ['miauby_alerts', 'miauby_alert_events', 'miauby_patterns', 'miauby_settings'],
    next_step: 'migrar diagnostico/alertas como leitura Node primeiro, depois escrita com auditoria equivalente',
    validation: ['alerta criado', 'alerta dispensado', 'padrao revisado', 'diagnostico sem stack/SQL bruto'],
  },
  {
    key: 'tool_contracts',
    status: 'blocked_until_contract',
    current_owner: 'site/miauw/agent-context.php e site/miauw/agent-tools.php',
    current_storage: ['contratos PHP em runtime', 'miauw_tool_traces'],
    shadow_storage: ['miauby_tool_traces'],
    next_step: 'versionar contratos de tools no Node/Postgres sem liberar escrita direta em bancos de modulos',
    validation: ['tools de leitura', 'confirmacao de escrita forte', 'auditoria por modulo dono', 'token interno obrigatorio'],
  },
  {
    key: 'strong_actions',
    status: 'blocked_until_contract',
    current_owner: 'site/miauw/agent-actions.php',
    current_storage: ['pendencias/execucao via PHP bridge', 'auditoria nos modulos donos'],
    shadow_storage: ['miauby_tool_traces'],
    next_step: 'manter execucao no modulo dono; Node apenas prepara contrato e respeita confirmacao humana',
    validation: ['SIM/NAO nao executa sem pendencia', 'acao expirada nao grava', 'rollback por MIAUW_ENGINE=php'],
  },
  {
    key: 'farmacia_popular',
    status: 'shadow_ready',
    current_owner: 'site/miauw/miauw-farmacia-popular.php e cron dedicado',
    current_storage: ['miauw_farmacia_popular_valores', 'miauw_farmacia_popular_atualizacoes'],
    shadow_storage: ['miauby_farmacia_popular_values', 'miauby_farmacia_popular_updates'],
    next_step: 'migrar leitura para Node antes de mover o cron de atualizacao',
    validation: ['valores por UF/produto', 'historico de atualizacao', 'sem download bruto em resposta publica'],
  },
];

const mysqlPool = mysql.createPool({
  host: env.MYSQL_HOST || '127.0.0.1',
  port: Number(env.MYSQL_PORT || 3306),
  database: env.MYSQL_DATABASE || 'wimifarma_app',
  user: env.MYSQL_USER || 'wimifarma_user',
  password: env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 4,
  charset: 'utf8mb4',
  dateStrings: true,
});

const pgPool = new Pool({
  host: env.MIAUBY_POSTGRES_HOST || env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.MIAUBY_POSTGRES_PORT || env.POSTGRES_PORT || 5432),
  database: env.MIAUBY_POSTGRES_DB || env.POSTGRES_DB || 'wimifarma_miauby',
  user: env.MIAUBY_POSTGRES_USER || env.POSTGRES_USER || 'wimifarma_miauby',
  password: env.MIAUBY_POSTGRES_PASSWORD || env.POSTGRES_PASSWORD || '',
  max: 6,
});

function assertIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`unsafe identifier: ${value}`);
  }
  return value;
}

function mysqlIdent(value: string): string {
  return `\`${assertIdentifier(value)}\``;
}

function pgIdent(value: string): string {
  return `"${assertIdentifier(value)}"`;
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
  if (typeof value === 'object') return sanitizeRow(value as Record<string, unknown>);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizeString(value);
  return value;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

function checksum(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function stableJson(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return JSON.stringify(sorted);
}

function syntheticLegacyId(source: string, row: Record<string, unknown>): { id: number; sourceKey: string } {
  const preferredKey = ['chave', 'key', 'nome', 'name', 'codigo', 'code'].find((field) => {
    const value = row[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
  const sourceKey = preferredKey
    ? `${source}:${preferredKey}:${String(row[preferredKey]).trim()}`
    : `${source}:row:${stableJson(sanitizeRow(row))}`;
  const id = Number.parseInt(crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 12), 16);
  return { id, sourceKey };
}

function valueAsNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(row: Record<string, unknown>, fields: string[]): number | null {
  for (const field of fields) {
    const value = valueAsNumber(row[field]);
    if (value !== null) return value;
  }
  return null;
}

function rowProjection(row: MysqlRow, table: SourceTable): {
  legacy_mysql_id: number | null;
  legacy_source_key: string;
  source_checksum: string;
} {
  const payload = sanitizeRow(row);
  const mysqlLegacyId = pickNumber(row, ['id', 'legacy_mysql_id']);
  const synthetic = mysqlLegacyId === null ? syntheticLegacyId(table.source, row) : null;
  const legacyId = mysqlLegacyId ?? synthetic?.id ?? null;
  return {
    legacy_mysql_id: legacyId,
    legacy_source_key: synthetic?.sourceKey ?? `${table.source}:id:${legacyId}`,
    source_checksum: checksum(payload),
  };
}

function internalToken(): string {
  return String(env.MIAUBY_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || env.MIAUW_AGENT_INTERNAL_TOKEN || '').trim();
}

function requestToken(req: Request): string {
  return String(req.header('x-miauby-internal-token') || req.header('x-miauw-internal-token') || req.header('x-miauw-guardian-token') || '').trim();
}

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const expected = internalToken();
  if (expected === '') {
    res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
    return;
  }
  if (requestToken(req) !== expected) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  next();
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.trunc(parsed)));
}

function normalizeText(value: unknown, max = 700): string | null {
  if (value === undefined || value === null) return null;
  const text = sanitizeString(String(value)).replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function asIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function summarizeParity(parity: Awaited<ReturnType<typeof buildParity>>) {
  const countMismatches = parity.tables.filter((table) => !table.count_match).length;
  const sampleMismatches = parity.tables.reduce((total, table) => total + table.sample_mismatches, 0);
  const sampleMissingTargets = parity.tables.reduce((total, table) => total + table.sample_missing_targets, 0);
  return {
    ok: parity.ok,
    sample_limit: parity.sample_limit,
    tables_total: parity.tables.length,
    count_mismatches: countMismatches,
    sample_mismatches: sampleMismatches,
    sample_missing_targets: sampleMissingTargets,
    latest_validate_ok: parity.latest_runs.some((run) => run.mode === 'validate' && run.ok),
    tables: parity.tables.map((table) => ({
      source: table.source,
      target: table.target,
      source_count: table.source_count,
      target_count: table.target_count,
      count_match: table.count_match,
      sample_checked: table.sample_checked,
      sample_mismatches: table.sample_mismatches,
      issues: table.issues,
    })),
  };
}

function buildCutoverInventory() {
  return {
    ok: true,
    service: 'miauby',
    version: serviceVersion,
    mode: 'cutover_inventory_read_only',
    generated_at: new Date().toISOString(),
    official_source: {
      route: '/miauw/',
      runtime: 'site/miauw PHP',
      database: 'MySQL wimifarma_app / miauw_*',
      write_enabled: true,
      note: 'continua oficial ate corte validado com rollback',
    },
    shadow_target: {
      route: `${basePath}/api/internal/*`,
      runtime: 'apps/miauby Node.js 22 + TypeScript',
      database: 'Postgres wimifarma_miauby / miauby_*',
      write_enabled: false,
      public_proxy_enabled: false,
    },
    guards: {
      token_required: true,
      route_cutover_enabled: false,
      write_enabled: false,
      public_proxy_enabled: false,
      node_direct_module_db_writes_enabled: false,
    },
    tables: sourceTables.map((table) => ({
      source: table.source,
      target: table.target,
    })),
    flows: cutoverFlows,
    hard_blockers: [
      'apps/miauby ainda nao possui adaptador oficial de escrita para mensagens, treino, memorias, alertas e traces',
      'apps/miauw-agent ainda depende de agent-context.php, agent-tools.php e agent-actions.php para contexto, tools e confirmacoes',
      'widget, diagnostico e treino continuam em PHP e precisam de compatibilidade de sessao/CSRF antes de trocar a rota',
      'antes de congelar miauw_* e preciso dump, migracao sombra, validacao de checksum e janela de observacao',
    ],
    safe_sequence: [
      'manter PHP oficial e Postgres sombra sincronizado',
      'migrar leituras de contexto/persona/tool contracts para Node em modo read-only',
      'criar adaptador de escrita Node desligado por env e testar com usuario adm',
      'habilitar node_shadow por usuario e comparar resposta/trace sem latencia global',
      'cortar escrita de mensagens/traces primeiro, mantendo rollback por MIAUW_ENGINE=php',
      'migrar treino, memoria, alertas e diagnostico por contratos pequenos',
    ],
    rollback: {
      engine: 'MIAUW_ENGINE=php',
      keep_routes: ['/miauw/', '/miauby/', '/miauw/agent/', '/miauby/agent/'],
      keep_legacy_tables: true,
      restore_rule: 'nao apagar site/miauw nem miauw_* antes de congelamento, dump e observacao',
    },
  };
}

async function tableExists(source: string): Promise<boolean> {
  const [rows] = await mysqlPool.query<RowDataPacket[]>('SHOW TABLES LIKE ?', [source]);
  return rows.length > 0;
}

async function tableColumns(source: string): Promise<string[]> {
  const [rows] = await mysqlPool.query<RowDataPacket[]>(`SHOW COLUMNS FROM ${mysqlIdent(source)}`);
  return rows.map((row) => String(row.Field || ''));
}

async function sourceCount(source: string): Promise<number> {
  const [rows] = await mysqlPool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${mysqlIdent(source)}`);
  return Number(rows[0]?.total || 0);
}

async function targetCount(client: PoolClient, target: string, source: string): Promise<number> {
  const result = await client.query<{ total: string }>(
    `SELECT COUNT(*)::bigint AS total FROM ${pgIdent(target)} WHERE source_table = $1`,
    [source],
  );
  return Number(result.rows[0]?.total || 0);
}

async function readSourceSamples(source: string, columns: string[], limit: number): Promise<MysqlRow[]> {
  if (limit <= 0) return [];
  const order = columns.includes('id') ? ' ORDER BY `id` ASC' : '';
  const [rows] = await mysqlPool.query<MysqlRow[]>(`SELECT * FROM ${mysqlIdent(source)}${order} LIMIT ${limit}`);
  return Array.isArray(rows) ? rows : [];
}

async function latestRuns(limit = 5): Promise<Array<{ mode: string; ok: boolean; started_at: string; finished_at: string | null }>> {
  const result = await pgPool.query<{
    mode: string;
    ok: boolean;
    started_at: Date | string;
    finished_at: Date | string | null;
  }>(
    `SELECT mode, ok, started_at, finished_at
       FROM miauby_migration_runs
      ORDER BY id DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    mode: row.mode,
    ok: row.ok,
    started_at: String(row.started_at),
    finished_at: row.finished_at === null ? null : String(row.finished_at),
  }));
}

async function tableParity(client: PoolClient, table: SourceTable, sampleLimit: number) {
  const exists = await tableExists(table.source);
  const summary = {
    source: table.source,
    target: table.target,
    exists,
    source_count: 0,
    target_count: await targetCount(client, table.target, table.source),
    count_match: false,
    sample_checked: 0,
    sample_mismatches: 0,
    sample_missing_targets: 0,
    sample: [] as Array<{ legacy_mysql_id: number; target_found: boolean; checksum_match: boolean }>,
    issues: [] as string[],
  };

  if (!exists) {
    summary.issues.push('source_table_missing');
    return summary;
  }

  const columns = await tableColumns(table.source);
  summary.source_count = await sourceCount(table.source);
  summary.count_match = summary.source_count === summary.target_count;
  if (!summary.count_match) {
    summary.issues.push(`count_mismatch:${summary.target_count}/${summary.source_count}`);
  }

  for (const row of await readSourceSamples(table.source, columns, sampleLimit)) {
    const projected = rowProjection(row, table);
    if (projected.legacy_mysql_id === null) {
      summary.sample_mismatches += 1;
      summary.issues.push('sample_without_stable_id');
      continue;
    }
    const target = await client.query<{ source_checksum: string }>(
      `SELECT source_checksum FROM ${pgIdent(table.target)} WHERE source_table = $1 AND legacy_mysql_id = $2 LIMIT 1`,
      [table.source, projected.legacy_mysql_id],
    );
    const targetChecksum = target.rows[0]?.source_checksum || '';
    const targetFound = target.rows.length > 0;
    const checksumMatch = targetFound && targetChecksum === projected.source_checksum;
    summary.sample_checked += 1;
    if (!targetFound) summary.sample_missing_targets += 1;
    if (!checksumMatch) summary.sample_mismatches += 1;
    summary.sample.push({
      legacy_mysql_id: projected.legacy_mysql_id,
      target_found: targetFound,
      checksum_match: checksumMatch,
    });
  }

  if (summary.sample_missing_targets > 0) {
    summary.issues.push(`sample_missing_targets:${summary.sample_missing_targets}`);
  }
  if (summary.sample_mismatches > 0) {
    summary.issues.push(`sample_mismatches:${summary.sample_mismatches}`);
  }

  return summary;
}

async function buildParity(sampleLimit: number) {
  const client = await pgPool.connect();
  try {
    const tables = [];
    for (const table of sourceTables) {
      tables.push(await tableParity(client, table, sampleLimit));
    }
    const runs = await latestRuns(5);
    const ok = tables.every((table) => table.issues.length === 0) && runs.some((run) => run.mode === 'validate' && run.ok);
    return {
      ok,
      mode: 'read_only_shadow_parity',
      official_source: 'site/miauw php + mysql miauw_*',
      shadow_target: 'apps/miauby + postgres miauby_*',
      sample_limit: sampleLimit,
      latest_runs: runs,
      tables,
    };
  } finally {
    client.release();
  }
}

async function readShadowSection(client: PoolClient, section: ShadowReadSection, limit: number) {
  const count = await targetCount(client, section.target, section.source);
  const result = await client.query<{
    legacy_mysql_id: string | number;
    role: string | null;
    status: string | null;
    content_preview: string | null;
    source_checksum: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT legacy_mysql_id, role, status, content_preview, source_checksum, created_at, updated_at
       FROM ${pgIdent(section.target)}
      WHERE source_table = $1
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT $2`,
    [section.source, limit],
  );

  return {
    key: section.key,
    label: section.label,
    source: section.source,
    target: section.target,
    count,
    limit,
    items: result.rows.map((row) => ({
      legacy_mysql_id: String(row.legacy_mysql_id),
      role: normalizeText(row.role, 80),
      status: normalizeText(row.status, 80),
      preview: normalizeText(row.content_preview, 700),
      checksum_prefix: row.source_checksum.slice(0, 16),
      created_at: asIsoString(row.created_at),
      updated_at: asIsoString(row.updated_at),
    })),
  };
}

async function buildReadModel(limit: number) {
  const client = await pgPool.connect();
  try {
    const sections = [];
    for (const section of readSections) {
      sections.push(await readShadowSection(client, section, limit));
    }
    return {
      ok: true,
      mode: 'read_only_shadow_context',
      official_source: 'site/miauw php + mysql miauw_*',
      shadow_target: 'apps/miauby + postgres miauby_*',
      write_enabled: false,
      payload_sanitized_only: true,
      raw_payload_returned: false,
      limit,
      sections,
    };
  } finally {
    client.release();
  }
}

type ShadowPayloadRow = {
  legacy_mysql_id: string | number;
  role: string | null;
  status: string | null;
  content_preview: string | null;
  payload_sanitized: unknown;
  source_checksum: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type CanonicalContextInput = {
  message: string;
  pageContext: string;
  limit: number;
  toolFilter: string;
  moduleFilter: string;
  riskFilter: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function canonicalString(value: unknown, max = 700): string {
  return normalizeText(value, max) || '';
}

function pickPayloadText(payload: Record<string, unknown>, fields: string[], fallback: unknown = null, max = 700): string {
  for (const field of fields) {
    const text = canonicalString(payload[field], max);
    if (text !== '') return text;
  }
  return canonicalString(fallback, max);
}

function canonicalStatus(value: unknown): string {
  return normalizeSearch(String(value ?? ''));
}

function statusLooksApproved(value: unknown): boolean {
  const status = canonicalStatus(value);
  return status === 'aprovado' || status === 'approved' || status === 'ativo' || status === 'active';
}

function statusLooksVisible(value: unknown): boolean {
  const status = canonicalStatus(value);
  return status === '' || ['aprovado', 'approved', 'ativo', 'active', 'aberto', 'open', 'pendente', 'pending', 'revisado'].includes(status);
}

function wordsForScore(value: string): string[] {
  const stop = new Set([
    'aqui',
    'agora',
    'ainda',
    'algo',
    'como',
    'com',
    'das',
    'dos',
    'essa',
    'esse',
    'isso',
    'mais',
    'para',
    'pela',
    'pelo',
    'por',
    'pra',
    'que',
    'qual',
    'quando',
    'sem',
    'ser',
    'sua',
    'tem',
    'uma',
    'voce',
  ]);
  const normalized = normalizeSearch(value).replace(/[^a-z0-9]+/g, ' ');
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && !stop.has(word)),
    ),
  );
}

function scoreText(message: string, values: string[]): number {
  const normalizedMessage = normalizeSearch(message);
  if (normalizedMessage === '') return 0;
  const haystack = normalizeSearch(values.join(' '));
  if (haystack === '') return 0;
  let score = haystack.includes(normalizedMessage) ? 80 : 0;
  for (const word of wordsForScore(message)) {
    if (haystack.includes(word)) score += 8;
  }
  return score;
}

function styleRouteFor(message: string, pageContext: string) {
  const normalized = normalizeSearch(`${message} ${pageContext}`);
  const hasAny = (needles: string[]) => needles.some((needle) => normalized.includes(needle));

  let intent = 'operational';
  let budgetWords = 120;
  let useTools = true;
  let localReply = false;
  let allowLists = true;
  let tone = 'miauby curto, pratico e operacional';
  let reason = 'fallback_operacional';

  if (normalized === '' || /^(oi|ola|teste|bom dia|boa tarde|boa noite)$/.test(normalized)) {
    intent = 'greeting';
    budgetWords = 28;
    useTools = false;
    localReply = true;
    allowLists = false;
    tone = 'entrada viva e curta';
    reason = 'saudacao_curta';
  } else if (hasAny(['token', 'senha', 'api', 'prompt', 'codigo', 'backend', 'endpoint', 'stack trace'])) {
    intent = 'backstage_technical';
    budgetWords = 55;
    useTools = false;
    localReply = true;
    allowLists = false;
    tone = 'bastidor vira suporte tecnico interno';
    reason = 'bastidor_tecnico';
  } else if (hasAny(['criar', 'lancar', 'registrar', 'sangria', 'pix', 'encomenda', 'conta gestao'])) {
    intent = 'strong_action';
    budgetWords = 140;
    useTools = true;
    localReply = false;
    allowLists = true;
    tone = 'confirmacao humana antes de escrita';
    reason = 'acao_operacional';
  } else if (hasAny(['bolo', 'receita', 'horoscopo', 'filme', 'futebol'])) {
    intent = 'offtopic';
    budgetWords = 45;
    useTools = false;
    localReply = true;
    allowLists = false;
    tone = 'puxar de volta para operacao';
    reason = 'fora_da_operacao';
  }

  return {
    intent,
    label: intent,
    budget_words: budgetWords,
    use_tools: useTools,
    local_reply: localReply,
    allow_lists: allowLists,
    tone,
    reason,
  };
}

function buildAudioContract() {
  return {
    version: 'miauby-voice-playback-profile-2026-05-17',
    enabled: false,
    ui_enabled: false,
    requested_by_env: false,
    status: 'desativado',
    mode: 'text_only',
    capture_enabled: false,
    playback_enabled: false,
    transcription_enabled: false,
    tts_enabled: false,
    voice_reply_enabled: false,
    speech_to_speech_enabled: false,
    storage_enabled: false,
    provider: 'not_configured',
    model: 'gpt-4o-transcribe',
    speech_model: 'gpt-4o-mini-tts',
    voice: 'marin',
    allowed_formats: ['text'],
    requires_explicit_user_action: true,
    privacy_rules: [
      'microfone nunca liga sozinho',
      'audio nao e armazenado no banco pelo Miauby',
      'voz nao libera escrita operacional direta',
      'acao forte continua exigindo confirmacao humana pelo fluxo auditado',
    ],
  };
}

function buildVoiceProfile() {
  const audio = buildAudioContract();
  return {
    version: 'miauby-voice-profile-2026-05-17',
    profile_id: 'miauby_padrao',
    label: 'Miauby padrao',
    tone: 'fiscal interno vivo, pratico, esperto e levemente acido',
    tempo: 'medio',
    humor: 'curto',
    directives: [
      'personalidade forte com solucao pratica',
      'respostas curtas por padrao no widget',
      'pedir somente o menor dado ausente antes de agir',
      'nao inventar dado real sem fonte do sistema ou do operador',
    ],
    audio,
  };
}

function buildPersonalityContract() {
  return {
    version: 'miauby-persona-2026-05-16',
    style_version: 'miauby-style-router-2026-05-16',
    source: 'apps/miauby_node_contract',
    nome_publico: 'Miauby',
    papel: 'Fiscal interno da operacao Wimifarma',
    voz: [
      'fiscal interno vivo, pratico, esperto e levemente acido',
      'humor curto como tempero, nunca como enrolacao',
      'personalidade forte com solucao pratica em toda resposta',
      'respostas curtas por padrao no widget',
      'perguntas casuais nao viram lista de ferramentas',
      'pedir somente o menor dado ausente antes de agir',
      'nao inventar dado real sem fonte do sistema ou do operador',
    ],
    bordoes_controlados: ['Miauby direto:', 'Veredito:', 'Sem dado, sem milagre.', 'Pode seguir.'],
    guardrails: [
      'nao expor segredo, token, payload bruto, stack trace ou telefone cru',
      'nao escrever diretamente nos bancos dos modulos por apps/miauby nesta fase',
      'acoes fortes continuam sob confirmacao humana e dono oficial PHP/modulo',
      'resposta oficial ainda e site/miauw PHP ate corte validado',
    ],
    proxima_melhoria: 'validar consumo sombra pelo agente antes de qualquer troca oficial.',
  };
}

async function readShadowRows(client: PoolClient, section: ShadowReadSection, limit: number): Promise<ShadowPayloadRow[]> {
  const result = await client.query<ShadowPayloadRow>(
    `SELECT legacy_mysql_id, role, status, content_preview, payload_sanitized, source_checksum, created_at, updated_at
       FROM ${pgIdent(section.target)}
      WHERE source_table = $1
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT $2`,
    [section.source, limit],
  );
  return result.rows;
}

async function countRowsByStatus(client: PoolClient, section: ShadowReadSection, statuses: string[]): Promise<number> {
  const result = await client.query<{ total: string }>(
    `SELECT COUNT(*)::bigint AS total
       FROM ${pgIdent(section.target)}
      WHERE source_table = $1
        AND LOWER(TRIM(COALESCE(status, ''))) = ANY($2::text[])`,
    [section.source, statuses],
  );
  return Number(result.rows[0]?.total || 0);
}

function canonicalItem(row: ShadowPayloadRow, fields: string[]) {
  const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
  return {
    legacy_mysql_id: String(row.legacy_mysql_id),
    status: normalizeText(row.status, 80),
    preview: pickPayloadText(payload, fields, row.content_preview, 700),
    checksum_prefix: row.source_checksum.slice(0, 16),
    created_at: asIsoString(row.created_at),
    updated_at: asIsoString(row.updated_at),
  };
}

async function buildCanonicalSection(client: PoolClient, section: ShadowReadSection, limit: number, fields: string[], visibleOnly = true) {
  const rows = (await readShadowRows(client, section, Math.max(limit * 4, limit))).filter((row) => !visibleOnly || statusLooksVisible(row.status));
  return {
    key: section.key,
    label: section.label,
    source: section.source,
    target: section.target,
    count: await targetCount(client, section.target, section.source),
    limit,
    items: rows.slice(0, limit).map((row) => canonicalItem(row, fields)),
  };
}

async function buildTrainingContext(client: PoolClient, message: string, routeIntent: string, limit: number) {
  const section = readSections.find((item) => item.key === 'training_examples') as ShadowReadSection;
  const rows = (await readShadowRows(client, section, 160)).filter((row) => statusLooksApproved(row.status));
  const scored = rows
    .map((row) => {
      const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
      const question = pickPayloadText(payload, ['pergunta', 'prompt', 'question', 'mensagem'], row.content_preview, 180);
      const reply = pickPayloadText(payload, ['resposta_ideal', 'resposta', 'completion', 'reply'], null, 360);
      const category = pickPayloadText(payload, ['categoria', 'category'], null, 80) || 'geral';
      const style = pickPayloadText(payload, ['estilo', 'style'], null, 80) || 'miauby';
      const score = scoreText(message, [question, reply, category, style]);
      return {
        row,
        question,
        reply,
        category,
        style,
        score,
      };
    })
    .filter((item) => item.question !== '' && item.reply !== '');

  scored.sort((left, right) => right.score - left.score || String(right.row.updated_at).localeCompare(String(left.row.updated_at)));
  const selected = (message.trim() === '' ? scored : scored.filter((item) => item.score > 0)).slice(0, limit);
  const fallback = selected.length > 0 ? selected : scored.slice(0, limit);
  const topScore = fallback[0]?.score || 0;
  const categories = Array.from(new Set(fallback.map((item) => item.category).filter(Boolean))).slice(0, 4);
  const styles = Array.from(new Set(fallback.map((item) => item.style).filter(Boolean))).slice(0, 4);
  const directives = [
    'usar treino aprovado como padrao de voz, nao como assunto para citar',
    'responder curto quando a mensagem for solta; pedir o menor recorte util',
  ];
  if (routeIntent === 'backstage_technical') {
    directives.push('bastidor, senha, chave e login: recusar sem expor e puxar para suporte interno ou objetivo operacional');
  }
  if (routeIntent === 'strong_action') {
    directives.push('acao forte: pedir dados obrigatorios e confirmacao humana antes de gravar');
  }

  let confidence = 'baixa';
  if (topScore >= 80) confidence = 'exata';
  else if (topScore >= 32) confidence = 'alta';
  else if (topScore >= 8) confidence = 'media';

  return {
    profile: {
      version: 'miauby-training-compiler-node-2026-06-02',
      approved_total: await countRowsByStatus(client, section, ['aprovado', 'approved', 'ativo', 'active']),
      examples_selected: fallback.length,
      confidence,
      top_score: topScore,
      route_intent: routeIntent,
      directives: directives.slice(0, 5),
      categories,
      styles,
    },
    examples: fallback.map((item) => ({
      pergunta: item.question,
      resposta_ideal: item.reply,
      categoria: item.category,
      estilo: item.style,
      score: item.score,
      legacy_mysql_id: String(item.row.legacy_mysql_id),
      updated_at: asIsoString(item.row.updated_at),
    })),
  };
}

function requestValue(req: Request, names: string[]): string {
  const body = isRecord(req.body) ? req.body : {};
  for (const name of names) {
    const raw = body[name] ?? req.query[name];
    if (Array.isArray(raw)) {
      const text = canonicalString(raw[0], 4000);
      if (text !== '') return text;
      continue;
    }
    const text = canonicalString(raw, 4000);
    if (text !== '') return text;
  }
  return '';
}

function canonicalInputFromRequest(req: Request): CanonicalContextInput {
  return {
    message: requestValue(req, ['message', 'mensagem']),
    pageContext: requestValue(req, ['page_context', 'pageContext', 'contexto']),
    limit: parseLimit(requestValue(req, ['limit', 'limite']), 3, 12),
    toolFilter: requestValue(req, ['tool', 'name', 'nome']),
    moduleFilter: requestValue(req, ['module', 'modulo']),
    riskFilter: requestValue(req, ['risk', 'risco']),
  };
}

async function buildCanonicalContext(input: CanonicalContextInput) {
  const client = await pgPool.connect();
  const started = Date.now();
  try {
    const route = styleRouteFor(input.message, input.pageContext);
    const training = await buildTrainingContext(client, input.message, String(route.intent), input.limit);
    const memories = await buildCanonicalSection(client, readSections[1], input.limit, ['memoria', 'memory', 'conteudo', 'resumo', 'texto']);
    const knowledge = await buildCanonicalSection(client, readSections[2], input.limit, ['titulo', 'conteudo', 'texto', 'resumo']);
    const alerts = await buildCanonicalSection(client, readSections[3], input.limit, ['titulo', 'descricao', 'mensagem', 'status']);
    const patterns = await buildCanonicalSection(client, readSections[4], input.limit, ['padrao', 'descricao', 'exemplo', 'status']);
    const settings = await buildCanonicalSection(client, readSections[6], input.limit, ['chave', 'key', 'nome', 'valor', 'value']);
    const voiceProfile = buildVoiceProfile();
    const examples = [
      ...training.examples.slice(0, 2).map((item) => `treino aprovado: ${item.pergunta} => ${item.resposta_ideal}`),
      ...patterns.items.slice(0, 2).map((item) => `padrao aprovado: ${item.preview}`),
    ].filter((item) => item.trim() !== '').slice(0, 4);

    return {
      ok: true,
      service: 'miauby',
      version: serviceVersion,
      context_version: 'miauby-node-context-pack-2026-06-02',
      mode: 'node_read_only_context_persona_tools',
      generated_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
      source: 'apps/miauby + postgres miauby_*',
      official_response_owner: 'site/miauw PHP',
      php_official_response: true,
      write_enabled: false,
      writes_enabled_in_node: false,
      route_cutover_enabled: false,
      public_proxy_enabled: false,
      payload_sanitized_only: true,
      raw_payload_returned: false,
      limit: input.limit,
      style_context: {
        version: 'miauby-style-router-2026-05-16',
        source: 'apps/miauby_node_read_only',
        route,
        hard_rules: [
          'casual sem lista numerada',
          'nao responder pergunta casual com lista de ferramentas',
          'bastidor tecnico vira suporte tecnico interno',
          'usar memorias/padroes apenas quando revisados como aprovado',
          'usar exemplos de treino aprovados sem citar treino, tabela ou revisao',
          'audio so inicia por botao explicito, sem gravacao e sem escrita operacional por voz',
        ],
        anti_patterns: [
          'resposta generica de suporte',
          'catalogo de ferramentas em pergunta casual',
          'expor endpoint, segredo, stack trace ou payload bruto',
          'prometer escrita sem confirmacao',
        ],
        approved_patterns: patterns.items.map((item) => item.preview).filter(Boolean),
        training_examples: training.examples,
        training_profile: training.profile,
        channel_memory: {
          items: [],
          source: 'not_migrated_to_miauby_shadow_in_this_step',
          note: 'memoria multicanal continua no bridge/PHP oficial ate proxima fase',
        },
        voice_profile: voiceProfile,
        audio_contract: voiceProfile.audio,
        examples,
      },
      tool_contracts: buildCanonicalToolContracts({
        name: input.toolFilter,
        module: input.moduleFilter,
        risk: input.riskFilter,
      }),
      personality: buildPersonalityContract(),
      datasets: {
        training_examples: {
          source: 'miauby_training_examples',
          selected: training.examples.length,
          approved_total: training.profile.approved_total,
        },
        memories,
        knowledge,
        alerts,
        patterns,
        settings,
      },
      guards: {
        token_required: true,
        write_enabled: false,
        direct_node_writes_enabled: false,
        execution_owner: 'php',
        confirmation_owner: 'php',
      },
    };
  } finally {
    client.release();
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get(['/health', `${basePath}/health`], async (_req, res) => {
  const started = Date.now();
  try {
    const ping = await pgPool.query<{ ok: number }>('SELECT 1 AS ok');
    let latestMigrationOk: boolean | null = null;
    try {
      const runs = await latestRuns(1);
      latestMigrationOk = runs[0]?.ok ?? null;
    } catch {
      latestMigrationOk = null;
    }
    res.json({
      ok: ping.rows[0]?.ok === 1,
      service: 'miauby',
      version: serviceVersion,
      base_path: basePath,
      mode: 'shadow_read_only',
      route_cutover_enabled: false,
      write_enabled: false,
      canonical_context_supported: true,
      internal_token_configured: internalToken() !== '',
      latest_migration_ok: latestMigrationOk,
      latency_ms: Date.now() - started,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'miauby',
      version: serviceVersion,
      error: error instanceof Error ? error.message : 'health_failed',
      latency_ms: Date.now() - started,
    });
  }
});

app.get(`${basePath}/api/internal/status`, requireInternalToken, async (_req, res) => {
  const client = await pgPool.connect();
  try {
    const tables = [];
    for (const table of sourceTables) {
      tables.push({
        source: table.source,
        target: table.target,
        target_count: await targetCount(client, table.target, table.source),
      });
    }
    res.json({
      ok: true,
      mode: 'read_only_shadow_status',
      write_enabled: false,
      latest_runs: await latestRuns(5),
      tables,
    });
  } finally {
    client.release();
  }
});

app.get(`${basePath}/api/internal/readiness`, requireInternalToken, async (req, res, next) => {
  const started = Date.now();
  try {
    const sampleLimit = parseLimit(req.query.sample, 20, 50);
    const ping = await pgPool.query<{ ok: number }>('SELECT 1 AS ok');
    const parity = await buildParity(sampleLimit);
    const paritySummary = summarizeParity(parity);
    res.json({
      ok: ping.rows[0]?.ok === 1 && paritySummary.ok,
      service: 'miauby',
      version: serviceVersion,
      mode: 'shadow_readiness',
      base_path: basePath,
      write_enabled: false,
      route_cutover_enabled: false,
      public_proxy_enabled: false,
      token_required: true,
      checks: {
        postgres: ping.rows[0]?.ok === 1,
        parity: paritySummary,
      },
      latency_ms: Date.now() - started,
    });
  } catch (error) {
    next(error);
  }
});

app.get(`${basePath}/api/internal/parity`, requireInternalToken, async (req, res, next) => {
  try {
    res.json(await buildParity(parseLimit(req.query.sample, 5, 50)));
  } catch (error) {
    next(error);
  }
});

app.get(`${basePath}/api/internal/context`, requireInternalToken, async (req, res, next) => {
  try {
    res.json(await buildReadModel(parseLimit(req.query.limit, 5, 25)));
  } catch (error) {
    next(error);
  }
});

async function canonicalContextHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await buildCanonicalContext(canonicalInputFromRequest(req)));
  } catch (error) {
    next(error);
  }
}

app.get(`${basePath}/api/internal/canonical-context`, requireInternalToken, canonicalContextHandler);
app.post(`${basePath}/api/internal/canonical-context`, requireInternalToken, canonicalContextHandler);
app.get(`${basePath}/api/internal/context-pack`, requireInternalToken, canonicalContextHandler);
app.post(`${basePath}/api/internal/context-pack`, requireInternalToken, canonicalContextHandler);

app.get(`${basePath}/api/internal/cutover`, requireInternalToken, (_req, res) => {
  res.json(buildCutoverInventory());
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[miauby] request failed', error);
  res.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : 'internal_error',
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[miauby] read-only shadow service listening on ${port} at ${basePath}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await Promise.allSettled([mysqlPool.end(), pgPool.end()]);
}

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
