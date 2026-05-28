import express, { type Request, type Response } from 'express';
import mysql, { type Pool as MySqlPool, type RowDataPacket } from 'mysql2/promise';
import pg from 'pg';

const { Pool } = pg;

type AnyRow = Record<string, unknown>;

const env = process.env;
const PORT = Number(env.PORT || 3800);
const BASE_PATH = env.BASE_PATH || '/financeiro';
const SERVICE_VERSION = '0.1.0';

const LEGACY_IMPORT_ENABLED = parseBool(env.FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED, true);
const LEGACY_MYSQL_REQUIRED = LEGACY_IMPORT_ENABLED;
const INTERNAL_TOKEN = env.FINANCEIRO_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || '';

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_financeiro',
  user: env.POSTGRES_USER || 'wimifarma_financeiro',
  password: env.POSTGRES_PASSWORD || 'wimifarma_financeiro_dev_pass',
  max: 8,
});

let mysqlPool: MySqlPool | null = null;

function legacyDb(): MySqlPool {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: env.MYSQL_HOST || '127.0.0.1',
      port: Number(env.MYSQL_PORT || 3306),
      database: env.MYSQL_DATABASE || 'wimifarma_app',
      user: env.MYSQL_USER || 'wimifarma_user',
      password: env.MYSQL_PASSWORD || 'wimifarma_dev_pass',
      waitForConnections: true,
      connectionLimit: 5,
      decimalNumbers: false,
      dateStrings: true,
    });
  }
  return mysqlPool;
}

type MigrationState = {
  lastRunAt: string | null;
  lastError: string | null;
  closingsImported: number;
  entriesImported: number;
  sangriasImported: number;
  cardEntriesImported: number;
  pixEntriesImported: number;
  settingsImported: number;
  auditImported: number;
};

const migrationState: MigrationState = {
  lastRunAt: null,
  lastError: null,
  closingsImported: 0,
  entriesImported: 0,
  sangriasImported: 0,
  cardEntriesImported: 0,
  pixEntriesImported: 0,
  settingsImported: 0,
  auditImported: 0,
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(value.toLowerCase());
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const text = cleanText(value, max);
  return text === '' ? null : text;
}

function intOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function moneyToCents(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  const normalized = String(value)
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function centsToMoney(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function timeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    return text.length === 5 ? `${text}:00` : text;
  }
  return null;
}

function dateTimeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text === '' || text.startsWith('0000-00-00') ? null : text.replace(' ', 'T');
}

function safeJson(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value.slice(0, 4000) };
  }
}

function requireInternalToken(req: Request, res: Response): boolean {
  if (!INTERNAL_TOKEN) {
    res.status(503).json({ ok: false, message: 'financeiro_internal_token_not_configured' });
    return false;
  }
  const provided = String(req.header('x-miauw-internal-token') || req.header('x-financeiro-internal-token') || '');
  if (provided !== INTERNAL_TOKEN) {
    res.status(401).json({ ok: false, message: 'unauthorized' });
    return false;
  }
  return true;
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS financeiro_closings (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      closing_date DATE NOT NULL UNIQUE,
      responsible_legacy_id BIGINT,
      responsible_text VARCHAR(160),
      status VARCHAR(32) NOT NULL DEFAULT 'aberto',
      cash_cents BIGINT NOT NULL DEFAULT 0,
      card_cents BIGINT NOT NULL DEFAULT 0,
      pix_bank_cents BIGINT NOT NULL DEFAULT 0,
      pix_machine_cents BIGINT NOT NULL DEFAULT 0,
      pix_correct_cents BIGINT NOT NULL DEFAULT 0,
      pix_correct_manual_cents BIGINT,
      pix_correct_note TEXT,
      sangria_cents BIGINT NOT NULL DEFAULT 0,
      cash_withdraw_cents BIGINT NOT NULL DEFAULT 0,
      system_opening_cents BIGINT NOT NULL DEFAULT 0,
      daily_revenue_cents BIGINT NOT NULL DEFAULT 0,
      daily_revenue_recorded_at TIMESTAMPTZ,
      adjustments_cents BIGINT NOT NULL DEFAULT 0,
      total_checked_cents BIGINT NOT NULL DEFAULT 0,
      difference_cents BIGINT NOT NULL DEFAULT 0,
      justification TEXT,
      observation TEXT,
      closed_at TIMESTAMPTZ,
      closed_by_legacy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT financeiro_closings_status_check CHECK (status IN ('aberto', 'conferencia', 'fechado', 'divergente', 'sem_movimento'))
    );

    CREATE TABLE IF NOT EXISTS financeiro_entries (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      closing_id BIGINT REFERENCES financeiro_closings(id) ON DELETE SET NULL,
      legacy_closing_id BIGINT,
      entry_date DATE NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount_cents BIGINT NOT NULL DEFAULT 0,
      observation TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'lancado',
      created_by_legacy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT financeiro_entries_status_check CHECK (status IN ('lancado', 'cancelado'))
    );

    CREATE TABLE IF NOT EXISTS financeiro_sangrias (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      closing_id BIGINT REFERENCES financeiro_closings(id) ON DELETE SET NULL,
      legacy_closing_id BIGINT,
      entry_date DATE NOT NULL,
      entry_time TIME,
      amount_cents BIGINT NOT NULL DEFAULT 0,
      reason VARCHAR(140) NOT NULL,
      responsible_legacy_id BIGINT,
      authorized_by VARCHAR(160),
      destination VARCHAR(180),
      observation TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'lancado',
      attachment_path VARCHAR(255),
      created_by_legacy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT financeiro_sangrias_status_check CHECK (status IN ('lancado', 'conferido', 'cancelado'))
    );

    CREATE TABLE IF NOT EXISTS financeiro_card_entries (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      closing_id BIGINT REFERENCES financeiro_closings(id) ON DELETE SET NULL,
      legacy_closing_id BIGINT,
      entry_date DATE NOT NULL,
      operator_name VARCHAR(80) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      gross_cents BIGINT NOT NULL DEFAULT 0,
      fee_cents BIGINT NOT NULL DEFAULT 0,
      net_cents BIGINT NOT NULL DEFAULT 0,
      brand VARCHAR(80),
      nsu VARCHAR(80),
      receipt_code VARCHAR(120),
      entry_time TIME,
      responsible_legacy_id BIGINT,
      observation TEXT,
      reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'pendente',
      attachment_path VARCHAR(255),
      created_by_legacy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS financeiro_pix_entries (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      closing_id BIGINT REFERENCES financeiro_closings(id) ON DELETE SET NULL,
      legacy_closing_id BIGINT,
      entry_date DATE NOT NULL,
      kind VARCHAR(32) NOT NULL DEFAULT 'banco',
      amount_cents BIGINT NOT NULL DEFAULT 0,
      origin VARCHAR(160),
      responsible_legacy_id BIGINT,
      receipt_path VARCHAR(255),
      observation TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'pendente',
      created_by_legacy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS financeiro_settings (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      setting_key VARCHAR(80) NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      description VARCHAR(255),
      updated_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS financeiro_audit_events (
      id BIGSERIAL PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      user_legacy_id BIGINT,
      action VARCHAR(100) NOT NULL,
      entity_table VARCHAR(100) NOT NULL,
      entity_legacy_id BIGINT,
      previous_value JSONB,
      new_value JSONB,
      ip VARCHAR(80),
      user_agent VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS financeiro_migration_runs (
      id BIGSERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      ok BOOLEAN NOT NULL DEFAULT FALSE,
      imported_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT
    );
  `);

  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_closings_date_status ON financeiro_closings (closing_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_entries_date_status ON financeiro_entries (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_sangrias_date_status ON financeiro_sangrias (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_cards_date_status ON financeiro_card_entries (entry_date, reconciliation_status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_pix_date_status ON financeiro_pix_entries (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON financeiro_audit_events (entity_table, entity_legacy_id)');
}

async function mysqlTableExists(table: string): Promise<boolean> {
  const [rows] = await legacyDb().query<RowDataPacket[]>('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function legacyRows(table: string): Promise<AnyRow[]> {
  if (!(await mysqlTableExists(table))) return [];
  const [rows] = await legacyDb().query<RowDataPacket[]>(`SELECT * FROM \`${table}\` ORDER BY id ASC`);
  return rows as AnyRow[];
}

async function closingIdForLegacy(legacyId: unknown): Promise<number | null> {
  const id = intOrNull(legacyId);
  if (!id) return null;
  const result = await pgPool.query<{ id: string }>('SELECT id::text FROM financeiro_closings WHERE legacy_mysql_id = $1 LIMIT 1', [id]);
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function importClosings(): Promise<number> {
  const rows = await legacyRows('financeiro_fechamentos');
  for (const row of rows) {
    const closingDate = isoDate(row.data_fechamento);
    if (!closingDate) continue;
    await pgPool.query(
      `INSERT INTO financeiro_closings (
        legacy_mysql_id, closing_date, responsible_legacy_id, responsible_text, status,
        cash_cents, card_cents, pix_bank_cents, pix_machine_cents, pix_correct_cents,
        pix_correct_manual_cents, pix_correct_note, sangria_cents, cash_withdraw_cents,
        system_opening_cents, daily_revenue_cents, daily_revenue_recorded_at,
        adjustments_cents, total_checked_cents, difference_cents, justification, observation,
        closed_at, closed_by_legacy_id, created_at, updated_at, imported_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, COALESCE($25::timestamptz, NOW()), $26, NOW()
      )
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        closing_date = EXCLUDED.closing_date,
        responsible_legacy_id = EXCLUDED.responsible_legacy_id,
        responsible_text = EXCLUDED.responsible_text,
        status = EXCLUDED.status,
        cash_cents = EXCLUDED.cash_cents,
        card_cents = EXCLUDED.card_cents,
        pix_bank_cents = EXCLUDED.pix_bank_cents,
        pix_machine_cents = EXCLUDED.pix_machine_cents,
        pix_correct_cents = EXCLUDED.pix_correct_cents,
        pix_correct_manual_cents = EXCLUDED.pix_correct_manual_cents,
        pix_correct_note = EXCLUDED.pix_correct_note,
        sangria_cents = EXCLUDED.sangria_cents,
        cash_withdraw_cents = EXCLUDED.cash_withdraw_cents,
        system_opening_cents = EXCLUDED.system_opening_cents,
        daily_revenue_cents = EXCLUDED.daily_revenue_cents,
        daily_revenue_recorded_at = EXCLUDED.daily_revenue_recorded_at,
        adjustments_cents = EXCLUDED.adjustments_cents,
        total_checked_cents = EXCLUDED.total_checked_cents,
        difference_cents = EXCLUDED.difference_cents,
        justification = EXCLUDED.justification,
        observation = EXCLUDED.observation,
        closed_at = EXCLUDED.closed_at,
        closed_by_legacy_id = EXCLUDED.closed_by_legacy_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        closingDate,
        intOrNull(row.responsavel_id),
        nullableText(row.responsavel_texto, 160),
        cleanText(row.status || 'aberto', 32),
        moneyToCents(row.caixa_fisico),
        moneyToCents(row.cartao_total),
        moneyToCents(row.pix_banco_total),
        moneyToCents(row.pix_maquininha_total),
        moneyToCents(row.pix_correto_total),
        row.pix_correto_manual === null ? null : moneyToCents(row.pix_correto_manual),
        nullableText(row.pix_correto_justificativa, 4000),
        moneyToCents(row.sangria_total),
        moneyToCents(row.retirada_caixa),
        moneyToCents(row.abertura_sistema),
        moneyToCents(row.faturamento_dia),
        dateTimeValue(row.faturamento_registrado_em),
        moneyToCents(row.ajustes),
        moneyToCents(row.total_conferido),
        moneyToCents(row.sobra_falta),
        nullableText(row.justificativa, 4000),
        nullableText(row.observacao, 4000),
        dateTimeValue(row.fechado_em),
        intOrNull(row.fechado_por),
        dateTimeValue(row.created_at),
        dateTimeValue(row.updated_at),
      ],
    );
  }
  return rows.length;
}

async function importEntries(): Promise<number> {
  const rows = await legacyRows('financeiro_lancamentos');
  for (const row of rows) {
    const entryDate = isoDate(row.data);
    if (!entryDate) continue;
    const closingId = await closingIdForLegacy(row.fechamento_id);
    await pgPool.query(
      `INSERT INTO financeiro_entries (
        legacy_mysql_id, closing_id, legacy_closing_id, entry_date, category, amount_cents,
        observation, status, created_by_legacy_id, created_at, updated_at, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), $11, NOW())
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        closing_id = EXCLUDED.closing_id,
        legacy_closing_id = EXCLUDED.legacy_closing_id,
        entry_date = EXCLUDED.entry_date,
        category = EXCLUDED.category,
        amount_cents = EXCLUDED.amount_cents,
        observation = EXCLUDED.observation,
        status = EXCLUDED.status,
        created_by_legacy_id = EXCLUDED.created_by_legacy_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        closingId,
        intOrNull(row.fechamento_id),
        entryDate,
        cleanText(row.categoria, 120),
        moneyToCents(row.valor),
        nullableText(row.observacao, 4000),
        cleanText(row.status || 'lancado', 32),
        intOrNull(row.created_by),
        dateTimeValue(row.created_at),
        dateTimeValue(row.updated_at),
      ],
    );
  }
  return rows.length;
}

async function importSangrias(): Promise<number> {
  const rows = await legacyRows('financeiro_sangrias');
  for (const row of rows) {
    const entryDate = isoDate(row.data);
    if (!entryDate) continue;
    const closingId = await closingIdForLegacy(row.fechamento_id);
    await pgPool.query(
      `INSERT INTO financeiro_sangrias (
        legacy_mysql_id, closing_id, legacy_closing_id, entry_date, entry_time, amount_cents,
        reason, responsible_legacy_id, authorized_by, destination, observation, status,
        attachment_path, created_by_legacy_id, created_at, updated_at, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()), $16, NOW())
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        closing_id = EXCLUDED.closing_id,
        legacy_closing_id = EXCLUDED.legacy_closing_id,
        entry_date = EXCLUDED.entry_date,
        entry_time = EXCLUDED.entry_time,
        amount_cents = EXCLUDED.amount_cents,
        reason = EXCLUDED.reason,
        responsible_legacy_id = EXCLUDED.responsible_legacy_id,
        authorized_by = EXCLUDED.authorized_by,
        destination = EXCLUDED.destination,
        observation = EXCLUDED.observation,
        status = EXCLUDED.status,
        attachment_path = EXCLUDED.attachment_path,
        created_by_legacy_id = EXCLUDED.created_by_legacy_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        closingId,
        intOrNull(row.fechamento_id),
        entryDate,
        timeValue(row.hora),
        moneyToCents(row.valor),
        cleanText(row.motivo || 'Sangria', 140),
        intOrNull(row.responsavel_id),
        nullableText(row.autorizado_por, 160),
        nullableText(row.destino, 180),
        nullableText(row.observacao, 4000),
        cleanText(row.status || 'lancado', 32),
        nullableText(row.anexo_path, 255),
        intOrNull(row.created_by),
        dateTimeValue(row.created_at),
        dateTimeValue(row.updated_at),
      ],
    );
  }
  return rows.length;
}

async function importCardEntries(): Promise<number> {
  const rows = await legacyRows('financeiro_maquininhas');
  for (const row of rows) {
    const entryDate = isoDate(row.data);
    if (!entryDate) continue;
    const closingId = await closingIdForLegacy(row.fechamento_id);
    await pgPool.query(
      `INSERT INTO financeiro_card_entries (
        legacy_mysql_id, closing_id, legacy_closing_id, entry_date, operator_name, kind,
        gross_cents, fee_cents, net_cents, brand, nsu, receipt_code, entry_time,
        responsible_legacy_id, observation, reconciliation_status, attachment_path,
        created_by_legacy_id, created_at, updated_at, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, COALESCE($19::timestamptz, NOW()), $20, NOW())
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        closing_id = EXCLUDED.closing_id,
        legacy_closing_id = EXCLUDED.legacy_closing_id,
        entry_date = EXCLUDED.entry_date,
        operator_name = EXCLUDED.operator_name,
        kind = EXCLUDED.kind,
        gross_cents = EXCLUDED.gross_cents,
        fee_cents = EXCLUDED.fee_cents,
        net_cents = EXCLUDED.net_cents,
        brand = EXCLUDED.brand,
        nsu = EXCLUDED.nsu,
        receipt_code = EXCLUDED.receipt_code,
        entry_time = EXCLUDED.entry_time,
        responsible_legacy_id = EXCLUDED.responsible_legacy_id,
        observation = EXCLUDED.observation,
        reconciliation_status = EXCLUDED.reconciliation_status,
        attachment_path = EXCLUDED.attachment_path,
        created_by_legacy_id = EXCLUDED.created_by_legacy_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        closingId,
        intOrNull(row.fechamento_id),
        entryDate,
        cleanText(row.operadora || 'Outra', 80),
        cleanText(row.tipo || 'credito', 32),
        moneyToCents(row.valor_bruto),
        moneyToCents(row.taxa),
        moneyToCents(row.valor_liquido),
        nullableText(row.bandeira, 80),
        nullableText(row.nsu, 80),
        nullableText(row.codigo_comprovante, 120),
        timeValue(row.horario),
        intOrNull(row.responsavel_id),
        nullableText(row.observacao, 4000),
        cleanText(row.status_conciliacao || 'pendente', 32),
        nullableText(row.anexo_path, 255),
        intOrNull(row.created_by),
        dateTimeValue(row.created_at),
        dateTimeValue(row.updated_at),
      ],
    );
  }
  return rows.length;
}

async function importPixEntries(): Promise<number> {
  const rows = await legacyRows('financeiro_pix');
  for (const row of rows) {
    const entryDate = isoDate(row.data);
    if (!entryDate) continue;
    const closingId = await closingIdForLegacy(row.fechamento_id);
    await pgPool.query(
      `INSERT INTO financeiro_pix_entries (
        legacy_mysql_id, closing_id, legacy_closing_id, entry_date, kind, amount_cents,
        origin, responsible_legacy_id, receipt_path, observation, status,
        created_by_legacy_id, created_at, updated_at, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()), $14, NOW())
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        closing_id = EXCLUDED.closing_id,
        legacy_closing_id = EXCLUDED.legacy_closing_id,
        entry_date = EXCLUDED.entry_date,
        kind = EXCLUDED.kind,
        amount_cents = EXCLUDED.amount_cents,
        origin = EXCLUDED.origin,
        responsible_legacy_id = EXCLUDED.responsible_legacy_id,
        receipt_path = EXCLUDED.receipt_path,
        observation = EXCLUDED.observation,
        status = EXCLUDED.status,
        created_by_legacy_id = EXCLUDED.created_by_legacy_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        closingId,
        intOrNull(row.fechamento_id),
        entryDate,
        cleanText(row.tipo || 'banco', 32),
        moneyToCents(row.valor),
        nullableText(row.origem, 160),
        intOrNull(row.responsavel_id),
        nullableText(row.comprovante_path, 255),
        nullableText(row.observacao, 4000),
        cleanText(row.status || 'pendente', 32),
        intOrNull(row.created_by),
        dateTimeValue(row.created_at),
        dateTimeValue(row.updated_at),
      ],
    );
  }
  return rows.length;
}

async function importSettings(): Promise<number> {
  const rows = await legacyRows('financeiro_configuracoes');
  for (const row of rows) {
    const key = cleanText(row.chave, 80);
    if (!key) continue;
    await pgPool.query(
      `INSERT INTO financeiro_settings (legacy_mysql_id, setting_key, setting_value, description, updated_at, imported_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET
         legacy_mysql_id = EXCLUDED.legacy_mysql_id,
         setting_value = EXCLUDED.setting_value,
         description = EXCLUDED.description,
         updated_at = EXCLUDED.updated_at,
         imported_at = NOW()`,
      [intOrNull(row.id), key, String(row.valor ?? ''), nullableText(row.descricao, 255), dateTimeValue(row.updated_at)],
    );
  }
  return rows.length;
}

async function importAudit(): Promise<number> {
  const rows = await legacyRows('financeiro_auditoria');
  for (const row of rows) {
    await pgPool.query(
      `INSERT INTO financeiro_audit_events (
        legacy_mysql_id, user_legacy_id, action, entity_table, entity_legacy_id,
        previous_value, new_value, ip, user_agent, created_at, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, COALESCE($10::timestamptz, NOW()), NOW())
      ON CONFLICT (legacy_mysql_id) DO UPDATE SET
        user_legacy_id = EXCLUDED.user_legacy_id,
        action = EXCLUDED.action,
        entity_table = EXCLUDED.entity_table,
        entity_legacy_id = EXCLUDED.entity_legacy_id,
        previous_value = EXCLUDED.previous_value,
        new_value = EXCLUDED.new_value,
        ip = EXCLUDED.ip,
        user_agent = EXCLUDED.user_agent,
        created_at = EXCLUDED.created_at,
        imported_at = NOW()`,
      [
        intOrNull(row.id),
        intOrNull(row.usuario_id),
        cleanText(row.acao, 100),
        cleanText(row.tabela_afetada, 100),
        intOrNull(row.registro_id),
        JSON.stringify(safeJson(row.valor_anterior)),
        JSON.stringify(safeJson(row.valor_novo)),
        nullableText(row.ip, 80),
        nullableText(row.user_agent, 255),
        dateTimeValue(row.created_at),
      ],
    );
  }
  return rows.length;
}

async function runLegacyImport(): Promise<void> {
  if (!LEGACY_IMPORT_ENABLED) return;
  await ensureSchema();
  const run = await pgPool.query<{ id: string }>('INSERT INTO financeiro_migration_runs DEFAULT VALUES RETURNING id::text');
  const runId = Number(run.rows[0]?.id || 0);
  try {
    migrationState.closingsImported = await importClosings();
    migrationState.entriesImported = await importEntries();
    migrationState.sangriasImported = await importSangrias();
    migrationState.cardEntriesImported = await importCardEntries();
    migrationState.pixEntriesImported = await importPixEntries();
    migrationState.settingsImported = await importSettings();
    migrationState.auditImported = await importAudit();
    migrationState.lastRunAt = new Date().toISOString();
    migrationState.lastError = null;
    await pgPool.query(
      'UPDATE financeiro_migration_runs SET finished_at = NOW(), ok = true, imported_counts = $1::jsonb WHERE id = $2',
      [JSON.stringify(migrationState), runId],
    );
  } catch (error) {
    migrationState.lastRunAt = new Date().toISOString();
    migrationState.lastError = error instanceof Error ? error.message : String(error);
    await pgPool.query(
      'UPDATE financeiro_migration_runs SET finished_at = NOW(), ok = false, error_message = $1 WHERE id = $2',
      [migrationState.lastError, runId],
    );
    throw error;
  }
}

async function pgCounts(): Promise<Record<string, unknown>> {
  const result = await pgPool.query(`
    SELECT
      (SELECT COUNT(*)::text FROM financeiro_closings) AS closings_total,
      (SELECT COUNT(*)::text FROM financeiro_closings WHERE status IN ('fechado', 'divergente', 'sem_movimento')) AS closings_finished,
      (SELECT COUNT(*)::text FROM financeiro_entries) AS entries_total,
      (SELECT COUNT(*)::text FROM financeiro_sangrias) AS sangrias_total,
      (SELECT COUNT(*)::text FROM financeiro_card_entries) AS card_entries_total,
      (SELECT COUNT(*)::text FROM financeiro_pix_entries) AS pix_entries_total,
      (SELECT COUNT(*)::text FROM financeiro_audit_events) AS audit_total
  `);
  return result.rows[0] || {};
}

async function legacyCounts(): Promise<Record<string, unknown> | null> {
  if (!LEGACY_MYSQL_REQUIRED) return null;
  const tables = [
    'financeiro_fechamentos',
    'financeiro_lancamentos',
    'financeiro_sangrias',
    'financeiro_maquininhas',
    'financeiro_pix',
    'financeiro_auditoria',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    if (!(await mysqlTableExists(table))) {
      counts[table] = 0;
      continue;
    }
    const [rows] = await legacyDb().query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${table}\``);
    counts[table] = Number((rows[0] as AnyRow | undefined)?.total || 0);
  }
  return counts;
}

async function checksumPayload(): Promise<Record<string, unknown>> {
  const postgres = await pgPool.query(`
    SELECT
      (SELECT COUNT(*)::text FROM financeiro_closings) AS closings_count,
      (SELECT COALESCE(SUM(total_checked_cents), 0)::text FROM financeiro_closings) AS closings_total_checked_cents,
      (SELECT COALESCE(SUM(difference_cents), 0)::text FROM financeiro_closings) AS closings_difference_cents,
      (SELECT COALESCE(SUM(daily_revenue_cents), 0)::text FROM financeiro_closings) AS daily_revenue_cents,
      (SELECT COUNT(*)::text FROM financeiro_entries) AS entries_count,
      (SELECT COALESCE(SUM(amount_cents), 0)::text FROM financeiro_entries WHERE status <> 'cancelado') AS entries_amount_cents,
      (SELECT COUNT(*)::text FROM financeiro_pix_entries) AS pix_count,
      (SELECT COALESCE(SUM(amount_cents), 0)::text FROM financeiro_pix_entries WHERE status <> 'cancelado') AS pix_amount_cents,
      (SELECT COUNT(*)::text FROM financeiro_sangrias) AS sangrias_count,
      (SELECT COALESCE(SUM(amount_cents), 0)::text FROM financeiro_sangrias WHERE status <> 'cancelado') AS sangrias_amount_cents
  `);

  let legacy: Record<string, unknown> | null = null;
  if (LEGACY_MYSQL_REQUIRED) {
    legacy = {};
    const closings = await legacyRows('financeiro_fechamentos');
    const entries = await legacyRows('financeiro_lancamentos');
    const pix = await legacyRows('financeiro_pix');
    const sangrias = await legacyRows('financeiro_sangrias');
    legacy = {
      closings_count: closings.length,
      closings_total_checked_cents: closings.reduce((sum, row) => sum + moneyToCents(row.total_conferido), 0),
      closings_difference_cents: closings.reduce((sum, row) => sum + moneyToCents(row.sobra_falta), 0),
      daily_revenue_cents: closings.reduce((sum, row) => sum + moneyToCents(row.faturamento_dia), 0),
      entries_count: entries.length,
      entries_amount_cents: entries.filter((row) => row.status !== 'cancelado').reduce((sum, row) => sum + moneyToCents(row.valor), 0),
      pix_count: pix.length,
      pix_amount_cents: pix.filter((row) => row.status !== 'cancelado').reduce((sum, row) => sum + moneyToCents(row.valor), 0),
      sangrias_count: sangrias.length,
      sangrias_amount_cents: sangrias.filter((row) => row.status !== 'cancelado').reduce((sum, row) => sum + moneyToCents(row.valor), 0),
    };
  }

  return {
    ok: true,
    postgres: postgres.rows[0],
    legacy,
  };
}

async function summaryPayload(): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const result = await pgPool.query<{
    open_days: string;
    month_total_cents: string;
    month_difference_cents: string;
    pending_sangrias: string;
    pending_pix: string;
    pending_cards: string;
    divergences: string;
  }>(
    `SELECT
      (SELECT COUNT(*)::text FROM financeiro_closings WHERE status IN ('aberto', 'conferencia')) AS open_days,
      (SELECT COALESCE(SUM(total_checked_cents), 0)::text FROM financeiro_closings WHERE to_char(closing_date, 'YYYY-MM') = $1) AS month_total_cents,
      (SELECT COALESCE(SUM(difference_cents), 0)::text FROM financeiro_closings WHERE to_char(closing_date, 'YYYY-MM') = $1) AS month_difference_cents,
      (SELECT COUNT(*)::text FROM financeiro_sangrias WHERE status = 'lancado') AS pending_sangrias,
      (SELECT COUNT(*)::text FROM financeiro_pix_entries WHERE status = 'pendente') AS pending_pix,
      (SELECT COUNT(*)::text FROM financeiro_card_entries WHERE reconciliation_status = 'pendente') AS pending_cards,
      (SELECT COUNT(*)::text FROM financeiro_closings WHERE status = 'divergente' AND to_char(closing_date, 'YYYY-MM') = $1) AS divergences`,
    [month],
  );
  const row = result.rows[0];
  return {
    ok: true,
    date: today,
    month,
    open_days: Number(row?.open_days || 0),
    month_total: centsToMoney(Number(row?.month_total_cents || 0)),
    month_difference: centsToMoney(Number(row?.month_difference_cents || 0)),
    pending_sangrias: Number(row?.pending_sangrias || 0),
    pending_pix: Number(row?.pending_pix || 0),
    pending_cards: Number(row?.pending_cards || 0),
    divergences: Number(row?.divergences || 0),
    source: 'postgres_shadow',
  };
}

async function healthPayload(): Promise<Record<string, unknown>> {
  const pgStart = Date.now();
  await pgPool.query('SELECT 1');
  const postgres = await pgCounts();
  let legacy: Record<string, unknown> | null = null;
  let legacyError: string | null = null;
  if (LEGACY_MYSQL_REQUIRED) {
    try {
      legacy = await legacyCounts();
    } catch (error) {
      legacyError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    ok: true,
    service: 'financeiro',
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    mode: 'shadow',
    route_cutover_enabled: false,
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_financeiro',
      legacy_mysql_required: LEGACY_MYSQL_REQUIRED,
      legacy_mysql_import_enabled: LEGACY_IMPORT_ENABLED,
      migration: migrationState,
      postgres,
      legacy,
      legacy_error: legacyError,
      postgres_latency_ms: Date.now() - pgStart,
    },
    next_cutover: {
      frontend_preserved_in_php: true,
      route_to_switch_later: '/financeiro/',
      required_before_cutover: ['checksum_match', 'login_core_validated', 'miauby_contract_updated'],
    },
  };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  res.json(await healthPayload());
}));

app.get(`${BASE_PATH}/internal/migration-status`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await healthPayload());
}));

app.get(`${BASE_PATH}/internal/summary`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await summaryPayload());
}));

app.get(`${BASE_PATH}/internal/checksums`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await checksumPayload());
}));

app.post(`${BASE_PATH}/internal/sync`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  await runLegacyImport();
  res.json(await healthPayload());
}));

app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'not_found', path: req.path });
});

app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[financeiro] request failed', error);
  res.status(500).json({ ok: false, message: 'internal_error' });
});

async function start(): Promise<void> {
  await ensureSchema();
  if (LEGACY_IMPORT_ENABLED) {
    await runLegacyImport();
  }
  app.listen(PORT, () => {
    console.log(`[financeiro] shadow service listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[financeiro] startup failed', error);
  process.exit(1);
});
