import crypto from 'node:crypto';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { Pool, type PoolClient } from 'pg';

type MysqlRow = RowDataPacket & Record<string, unknown>;

type SourceTable = {
  source: string;
  target: string;
  previewFields: string[];
};

type TableSummary = {
  source: string;
  target: string;
  exists: boolean;
  source_count: number;
  target_count: number;
  migrated: number;
  skipped: number;
  issues: string[];
};

const env = process.env;
const validateOnly = process.argv.includes('--validate-only');
const migrate = process.argv.includes('--migrate') || !validateOnly;
const limit = Number((process.argv.find((arg) => arg.startsWith('--limit=')) || '').split('=')[1] || 0);
const MIGRATION_VERSION = '20260530_miauby_shadow_schema';

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
  max: 4,
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
  if (value === undefined) return null;
  if (value === null) return null;
  if (isSensitiveKey(key)) return '[redacted]';
  if (Buffer.isBuffer(value)) return `[binary:${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(`${key}_${index}`, item));
  if (typeof value === 'object') {
    return sanitizeRow(value as Record<string, unknown>);
  }
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

function pickText(row: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    const text = sanitizeString(String(value)).trim();
    if (text !== '') return text.slice(0, 500);
  }
  return null;
}

function pickDate(row: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined || value === '') continue;
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
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

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS miauby_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS miauby_migration_runs (
      id BIGSERIAL PRIMARY KEY,
      mode TEXT NOT NULL,
      ok BOOLEAN NOT NULL DEFAULT false,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `);

  for (const table of sourceTables) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${pgIdent(table.target)} (
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
    await pgPool.query(`ALTER TABLE ${pgIdent(table.target)} ADD COLUMN IF NOT EXISTS legacy_source_key TEXT`);
    await pgPool.query(`
      UPDATE ${pgIdent(table.target)}
         SET legacy_source_key = CONCAT(source_table, ':id:', legacy_mysql_id)
       WHERE legacy_source_key IS NULL OR legacy_source_key = ''
    `);
    await pgPool.query(`ALTER TABLE ${pgIdent(table.target)} ALTER COLUMN legacy_source_key SET NOT NULL`);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS ${pgIdent(`idx_${table.target}_source_created`)}
        ON ${pgIdent(table.target)} (source_table, created_at DESC)
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS ${pgIdent(`idx_${table.target}_user_created`)}
        ON ${pgIdent(table.target)} (user_legacy_id, created_at DESC)
    `);
  }

  await pgPool.query(
    `INSERT INTO miauby_schema_migrations (version)
     VALUES ($1)
     ON CONFLICT (version) DO NOTHING`,
    [MIGRATION_VERSION],
  );
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

async function readRows(source: string, columns: string[]): Promise<MysqlRow[]> {
  const order = columns.includes('id') ? ' ORDER BY `id` ASC' : '';
  const limitSql = limit > 0 ? ` LIMIT ${Math.max(1, Math.min(100000, Math.trunc(limit)))}` : '';
  const [rows] = await mysqlPool.query<MysqlRow[]>(`SELECT * FROM ${mysqlIdent(source)}${order}${limitSql}`);
  return Array.isArray(rows) ? rows : [];
}

function rowProjection(row: MysqlRow, table: SourceTable): {
  legacy_mysql_id: number | null;
  legacy_source_key: string;
  user_legacy_id: number | null;
  conversation_legacy_id: number | null;
  role: string | null;
  status: string | null;
  content_preview: string | null;
  payload_sanitized: Record<string, unknown>;
  source_checksum: string;
  created_at: string | null;
  updated_at: string | null;
} {
  const payload = sanitizeRow(row);
  const mysqlLegacyId = pickNumber(row, ['id', 'legacy_mysql_id']);
  const synthetic = mysqlLegacyId === null ? syntheticLegacyId(table.source, row) : null;
  const legacyId = mysqlLegacyId ?? synthetic?.id ?? null;
  return {
    legacy_mysql_id: legacyId,
    legacy_source_key: synthetic?.sourceKey ?? `${table.source}:id:${legacyId}`,
    user_legacy_id: pickNumber(row, ['user_id', 'usuario_id', 'created_by', 'autor_id']),
    conversation_legacy_id: pickNumber(row, ['conversa_id', 'conversation_id', 'chat_id']),
    role: pickText(row, ['role', 'papel', 'remetente', 'sender']),
    status: pickText(row, ['status', 'estado', 'situacao']),
    content_preview: pickText(row, table.previewFields),
    payload_sanitized: payload,
    source_checksum: checksum(payload),
    created_at: pickDate(row, ['created_at', 'criado_em', 'data_criacao', 'created', 'enviado_em', 'registrado_em', 'timestamp']),
    updated_at: pickDate(row, ['updated_at', 'atualizado_em', 'updated', 'revisado_em', 'processed_at']),
  };
}

async function migrateTable(client: PoolClient, table: SourceTable): Promise<TableSummary> {
  const summary: TableSummary = {
    source: table.source,
    target: table.target,
    exists: false,
    source_count: 0,
    target_count: 0,
    migrated: 0,
    skipped: 0,
    issues: [],
  };

  summary.exists = await tableExists(table.source);
  if (!summary.exists) {
    summary.issues.push('source_table_missing');
    summary.target_count = await targetCount(client, table.target, table.source);
    return summary;
  }

  const columns = await tableColumns(table.source);
  summary.source_count = await sourceCount(table.source);

  if (migrate) {
    for (const row of await readRows(table.source, columns)) {
      const projected = rowProjection(row, table);
      if (projected.legacy_mysql_id === null) {
        summary.skipped += 1;
        continue;
      }
      await client.query(
        `INSERT INTO ${pgIdent(table.target)} (
           legacy_mysql_id, legacy_source_key, source_table, user_legacy_id, conversation_legacy_id,
           role, status, content_preview, payload_sanitized, source_checksum,
           created_at, updated_at, migrated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9::jsonb, $10,
           COALESCE($11::timestamptz, NOW()), COALESCE($12::timestamptz, NOW()), NOW()
         )
         ON CONFLICT (legacy_mysql_id) DO UPDATE SET
           legacy_source_key = EXCLUDED.legacy_source_key,
           user_legacy_id = EXCLUDED.user_legacy_id,
           conversation_legacy_id = EXCLUDED.conversation_legacy_id,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           content_preview = EXCLUDED.content_preview,
           payload_sanitized = EXCLUDED.payload_sanitized,
           source_checksum = EXCLUDED.source_checksum,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at,
           migrated_at = NOW()`,
        [
          projected.legacy_mysql_id,
          projected.legacy_source_key,
          table.source,
          projected.user_legacy_id,
          projected.conversation_legacy_id,
          projected.role,
          projected.status,
          projected.content_preview,
          JSON.stringify(projected.payload_sanitized),
          projected.source_checksum,
          projected.created_at,
          projected.updated_at,
        ],
      );
      summary.migrated += 1;
    }
  }

  summary.target_count = await targetCount(client, table.target, table.source);
  if (limit <= 0 && summary.target_count < summary.source_count) {
    summary.issues.push(`target_count_lower_than_source:${summary.target_count}/${summary.source_count}`);
  }
  return summary;
}

async function recordRun(mode: string): Promise<number> {
  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO miauby_migration_runs (mode, ok, summary)
     VALUES ($1, false, '{}'::jsonb)
     RETURNING id::text`,
    [mode],
  );
  return Number(result.rows[0]?.id || 0);
}

async function finishRun(id: number, ok: boolean, summary: unknown): Promise<void> {
  if (!id) return;
  await pgPool.query(
    `UPDATE miauby_migration_runs
        SET ok = $2,
            summary = $3::jsonb,
            finished_at = NOW()
      WHERE id = $1`,
    [id, ok, JSON.stringify(summary)],
  );
}

async function main(): Promise<void> {
  await ensureSchema();
  const runId = await recordRun(validateOnly ? 'validate' : 'migrate');
  const client = await pgPool.connect();
  const tables: TableSummary[] = [];

  try {
    await client.query('BEGIN');
    for (const table of sourceTables) {
      tables.push(await migrateTable(client, table));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const summary = {
      ok: false,
      mode: validateOnly ? 'validate' : 'migrate',
      limit: limit > 0 ? limit : null,
      error: error instanceof Error ? error.message : String(error),
      tables,
    };
    await finishRun(runId, false, summary);
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  const summary = {
    ok: tables.every((table) => table.issues.length === 0 || table.issues.every((issue) => issue === 'source_table_missing')),
    mode: validateOnly ? 'validate' : 'migrate',
    limit: limit > 0 ? limit : null,
    tables,
  };

  await finishRun(runId, summary.ok, summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main()
  .catch(async (error: unknown) => {
    const summary = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([mysqlPool.end(), pgPool.end()]);
  });
