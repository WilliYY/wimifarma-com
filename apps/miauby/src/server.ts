import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { Pool, type PoolClient } from 'pg';

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
const serviceVersion = '0.4.0';
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
