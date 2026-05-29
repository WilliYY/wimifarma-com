import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import mysql, { type Pool as MySqlPool, type RowDataPacket } from 'mysql2/promise';
import pg, { type PoolClient } from 'pg';

const { Pool } = pg;

type AnyRow = Record<string, unknown>;
type AuthProvider = 'core' | 'mysql';
type Flash = { type: '' | 'success' | 'error' | 'warning'; message: string };
type User = { id: number; username: string; role: string };
type CoreUserRow = { id: string; username: string; password_hash?: string | null; role?: string | null; active?: boolean };
type MysqlUserRow = RowDataPacket & { id: number; username: string; password_hash?: string | null; role?: string | null; active?: number };

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    flash?: Flash;
    loginAttempts?: number[];
    loginBlockedUntil?: number;
    returnTo?: string;
    user?: User;
  }
}

const env = process.env;
const PORT = Number(env.PORT || 3800);
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/financeiro');
const SERVICE_VERSION = '0.2.1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');

const AUTH_PROVIDER = normalizeAuthProvider(env.FINANCEIRO_AUTH_PROVIDER || 'core');
const LEGACY_IMPORT_ENABLED = parseBool(env.FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED, true);
const LEGACY_MIRROR_ENABLED = parseBool(env.FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED, true);
const LEGACY_MYSQL_REQUIRED = LEGACY_IMPORT_ENABLED || LEGACY_MIRROR_ENABLED || AUTH_PROVIDER === 'mysql';
const SESSION_SECRET = env.FINANCEIRO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const REOPEN_PASSWORD = env.FINANCEIRO_REOPEN_PASSWORD || 'wimifarma';
const INTERNAL_TOKEN = env.FINANCEIRO_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || env.MIAUW_WHATSAPP_INTERNAL_TOKEN || env.MIAUW_AGENT_INTERNAL_TOKEN || '';

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_financeiro',
  user: env.POSTGRES_USER || 'wimifarma_financeiro',
  password: env.POSTGRES_PASSWORD || 'wimifarma_financeiro_dev_pass',
  max: 8,
});

const corePgPool =
  AUTH_PROVIDER === 'core'
    ? new Pool({
        host: env.CORE_POSTGRES_HOST || '127.0.0.1',
        port: Number(env.CORE_POSTGRES_PORT || 5432),
        database: env.CORE_POSTGRES_DB || 'wimifarma_core',
        user: env.CORE_POSTGRES_USER || 'wimifarma_core',
        password: env.CORE_POSTGRES_PASSWORD || '',
        max: 4,
      })
    : null;

let mysqlPool: MySqlPool | null = null;

function legacyDb(): MySqlPool {
  if (!LEGACY_MYSQL_REQUIRED) {
    throw new Error('Legacy MySQL is disabled for Financeiro.');
  }
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

function normalizeAuthProvider(value: unknown): AuthProvider {
  return String(value || 'core').trim().toLowerCase() === 'mysql' ? 'mysql' : 'core';
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

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeBasePath(value: string): string {
  const normalized = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized === '' ? '/financeiro' : normalized;
}

function normalizeUsername(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function userPublic(row: CoreUserRow | MysqlUserRow): User {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role || 'user'),
  };
}

function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return normalizeUsername(user.role) === 'admin' || normalizeUsername(user.username) === 'adm';
}

function centsToDecimal(cents: number): number {
  return Math.round(Number(cents || 0)) / 100;
}

function moneyTextToCents(value: unknown): number {
  return moneyToCents(value);
}

function brMoneyFromCents(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function brMoneyFromDecimal(value: unknown): string {
  return brMoneyFromCents(Math.round(Number(value || 0) * 100));
}

function brDate(value: unknown): string {
  const text = isoDate(value) || String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function todayDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toDateInput(value: unknown): string {
  return isoDate(value) || todayDate();
}

function formatPgTimestamp(value: unknown, compact = false): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: compact ? '2-digit' : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return compact ? formatted.replace(',', ' -') : formatted.replace(',', '');
}

function dayStatusLabel(closing: AnyRow | null): string {
  if (!closing || !closing.id) return 'Aberto';
  const status = String(closing.status || 'aberto');
  if (status === 'sem_movimento') return 'Sem movimento';
  if (status === 'fechado') return 'Fechado';
  if (status === 'divergente') return 'Divergente';
  return 'Aberto';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    aberto: 'Aberto',
    conferencia: 'Em conferencia',
    fechado: 'Fechado',
    divergente: 'Divergente',
    sem_movimento: 'Sem movimento',
  };
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

function diffClass(cents: number): string {
  if (cents > 0) return 'is-positive';
  if (cents < 0) return 'is-negative';
  return 'is-zero';
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  const technical = ['sqlstate', 'syntax error', 'stack trace', 'password_hash', 'secret', 'token', 'select ', 'insert ', 'update ', 'delete '];
  if (technical.some((needle) => lower.includes(needle))) {
    return 'Nao consegui concluir agora. O erro foi registrado para revisao. Acione o Codex se repetir.';
  }
  return message.trim() || 'Nao consegui concluir agora. O erro foi registrado para revisao. Acione o Codex se repetir.';
}

function validFinanceDate(value: unknown, fallback = todayDate()): string {
  const text = String(value || '').trim();
  if (text === '') return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const month = Number(br[2]);
    const day = Number(br[1]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() + 1 === month && candidate.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return fallback;
}

function fiscalYears(): number[] {
  return [2026, 2027, 2028];
}

function monthName(month: number): string {
  const names = [
    '',
    'Janeiro',
    'Fevereiro',
    'Marco',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return names[month] || '';
}

function monthDays(month: number, year: number): string[] {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const days: string[] = [];
  for (let cursor = start; cursor.getUTCMonth() === start.getUTCMonth(); cursor = new Date(cursor.getTime() + 86400000)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function defaultDateForMonth(year: number, month: number): string {
  const days = monthDays(month, year);
  const today = todayDate();
  if (today.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) return today;
  return days[0] || today;
}

function weekdayLabel(date: string): string {
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const parsed = new Date(`${date}T00:00:00-03:00`);
  return labels[parsed.getDay()] || '';
}

function selectedContext(req: Request): { year: number; month: number; date: string } {
  const years = fiscalYears();
  const now = new Date(`${todayDate()}T00:00:00-03:00`);
  let year = Math.max(Math.min(...years), Math.min(Math.max(...years), Number(req.query.ano || now.getFullYear())));
  let month = Math.max(1, Math.min(12, Number(req.query.mes || now.getMonth() + 1)));
  let date = validFinanceDate(req.query.data, defaultDateForMonth(year, month));
  const parsed = new Date(`${date}T00:00:00-03:00`);
  if (years.includes(parsed.getFullYear())) {
    year = parsed.getFullYear();
    month = parsed.getMonth() + 1;
  } else {
    date = defaultDateForMonth(year, month);
  }
  return { year, month, date };
}

function selectedView(req: Request): 'caixa' | 'relatorio' {
  return req.query.view === 'relatorio' ? 'relatorio' : 'caixa';
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

    CREATE TABLE IF NOT EXISTS financeiro_internal_idempotency (
      idempotency_key VARCHAR(160) PRIMARY KEY,
      action VARCHAR(80) NOT NULL,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_closings_date_status ON financeiro_closings (closing_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_entries_date_status ON financeiro_entries (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_sangrias_date_status ON financeiro_sangrias (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_cards_date_status ON financeiro_card_entries (entry_date, reconciliation_status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_pix_date_status ON financeiro_pix_entries (entry_date, status)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON financeiro_audit_events (entity_table, entity_legacy_id)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_audit_created ON financeiro_audit_events (created_at DESC)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_fin_idempotency_created ON financeiro_internal_idempotency (created_at DESC)');
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
      ON CONFLICT (closing_date) DO UPDATE SET
        legacy_mysql_id = COALESCE(financeiro_closings.legacy_mysql_id, EXCLUDED.legacy_mysql_id),
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
    source: 'postgres',
  };
}

async function authenticate(username: string, password: string): Promise<User | null> {
  return AUTH_PROVIDER === 'mysql' ? authenticateMysql(username, password) : authenticateCore(username, password);
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
  if (!corePgPool) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [normalizeUsername(username)],
  );
  const row = result.rows[0];
  if (!row) return null;
  let ok = false;
  if (row.password_hash) ok = await bcrypt.compare(password, normalizeHash(row.password_hash));
  if (!ok && normalizeUsername(row.username) === 'adm') ok = timingSafeStringEqual(password, 'adm');
  return ok ? userPublic(row) : null;
}

async function authenticateMysql(username: string, password: string): Promise<User | null> {
  const [rows] = await legacyDb().query<RowDataPacket[]>(
    'SELECT id, username, password_hash, role, active FROM wf_users WHERE username = ? AND active = 1 LIMIT 1',
    [username],
  );
  const row = rows[0] as MysqlUserRow | undefined;
  if (!row) return null;
  let ok = false;
  if (row.password_hash) ok = await bcrypt.compare(password, normalizeHash(row.password_hash));
  if (!ok && normalizeUsername(row.username) === 'adm') ok = timingSafeStringEqual(password, 'adm');
  return ok ? userPublic(row) : null;
}

async function currentUser(user: User | undefined): Promise<User | null> {
  if (!user) return null;
  if (AUTH_PROVIDER === 'mysql') {
    const [rows] = await legacyDb().query<RowDataPacket[]>(
      'SELECT id, username, role, active FROM wf_users WHERE id = ? AND active = 1 LIMIT 1',
      [user.id],
    );
    const row = rows[0] as MysqlUserRow | undefined;
    return row ? userPublic(row) : null;
  }
  if (!corePgPool) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, role, active
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  return row ? userPublic(row) : null;
}

async function requireUser(req: Request, res: Response): Promise<User | null> {
  const user = await currentUser(req.session.user);
  if (!user) {
    if (wantsJson(req)) {
      res.status(401).json({ ok: false, message: 'Sessao expirada. Entre novamente no financeiro e tente de novo.' });
      return null;
    }
    req.session.returnTo = req.originalUrl;
    res.redirect(`${BASE_PATH}/login.php`);
    return null;
  }
  req.session.user = user;
  return user;
}

function ensureCsrf(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function csrfField(req: Request): string {
  return `<input type="hidden" name="csrf_token" value="${e(ensureCsrf(req))}">`;
}

function csrfMatches(req: Request): boolean {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received) return false;
  const left = crypto.createHash('sha256').update(expected).digest();
  const right = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(left, right);
}

function wantsJson(req: Request): boolean {
  return String(req.body?.ajax || '') === '1' || req.accepts(['html', 'json']) === 'json' || req.get('x-requested-with') === 'XMLHttpRequest';
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

function loginWaitSeconds(req: Request): number {
  const blockedUntil = Number(req.session.loginBlockedUntil || 0);
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function registerLoginFailure(req: Request): void {
  const now = Date.now();
  const attempts = (req.session.loginAttempts || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  attempts.push(now);
  req.session.loginAttempts = attempts;
  if (attempts.length >= 5) req.session.loginBlockedUntil = now + 10 * 60 * 1000;
}

function clearLoginRateLimit(req: Request): void {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
}

function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://financeiro.local');
    if (url.pathname !== BASE_PATH && url.pathname !== `${BASE_PATH}/` && url.pathname !== `${BASE_PATH}/index.php`) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function loginRedirectTarget(req: Request): string {
  const target = safeReturnPath(req.session.returnTo);
  delete req.session.returnTo;
  return target || `${BASE_PATH}/`;
}

function pgClient(client?: PoolClient): PoolClient | typeof pgPool {
  return client || pgPool;
}

function closingToView(row: AnyRow | null): AnyRow | null {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    legacy_mysql_id: row.legacy_mysql_id === null || row.legacy_mysql_id === undefined ? null : Number(row.legacy_mysql_id),
    data_fechamento: toDateInput(row.closing_date),
    responsavel_id: row.responsible_legacy_id === null || row.responsible_legacy_id === undefined ? null : Number(row.responsible_legacy_id),
    responsavel_texto: String(row.responsible_text || ''),
    responsavel_nome: String(row.responsible_text || ''),
    status: String(row.status || 'aberto'),
    caixa_fisico: centsToDecimal(Number(row.cash_cents || 0)),
    cartao_total: centsToDecimal(Number(row.card_cents || 0)),
    pix_banco_total: centsToDecimal(Number(row.pix_bank_cents || 0)),
    pix_maquininha_total: centsToDecimal(Number(row.pix_machine_cents || 0)),
    pix_correto_total: centsToDecimal(Number(row.pix_correct_cents || 0)),
    pix_correto_manual: row.pix_correct_manual_cents === null ? null : centsToDecimal(Number(row.pix_correct_manual_cents || 0)),
    pix_correto_justificativa: String(row.pix_correct_note || ''),
    sangria_total: centsToDecimal(Number(row.sangria_cents || 0)),
    retirada_caixa: centsToDecimal(Number(row.cash_withdraw_cents || 0)),
    abertura_sistema: centsToDecimal(Number(row.system_opening_cents || 0)),
    faturamento_dia: centsToDecimal(Number(row.daily_revenue_cents || 0)),
    faturamento_registrado_em: row.daily_revenue_recorded_at || null,
    ajustes: centsToDecimal(Number(row.adjustments_cents || 0)),
    total_conferido: centsToDecimal(Number(row.total_checked_cents || 0)),
    sobra_falta: centsToDecimal(Number(row.difference_cents || 0)),
    justificativa: String(row.justification || ''),
    observacao: String(row.observation || ''),
    fechado_em: row.closed_at || null,
    fechado_por: row.closed_by_legacy_id === null || row.closed_by_legacy_id === undefined ? null : Number(row.closed_by_legacy_id),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function defaultClosing(date: string): AnyRow {
  return {
    id: null,
    data_fechamento: date,
    responsavel_id: null,
    responsavel_texto: '',
    responsavel_nome: '',
    status: 'aberto',
    caixa_fisico: 0,
    cartao_total: 0,
    pix_banco_total: 0,
    pix_maquininha_total: 0,
    pix_correto_total: 0,
    pix_correto_manual: null,
    pix_correto_justificativa: '',
    sangria_total: 0,
    retirada_caixa: 0,
    abertura_sistema: 0,
    faturamento_dia: 0,
    faturamento_registrado_em: null,
    ajustes: 0,
    total_conferido: 0,
    sobra_falta: 0,
    justificativa: '',
    observacao: '',
    fechado_em: null,
  };
}

async function fetchClosingByDate(date: string, client?: PoolClient): Promise<AnyRow | null> {
  const result = await pgClient(client).query<AnyRow>('SELECT * FROM financeiro_closings WHERE closing_date = $1 LIMIT 1', [date]);
  return closingToView(result.rows[0] || null);
}

async function fetchClosingById(id: number, client?: PoolClient): Promise<AnyRow | null> {
  const result = await pgClient(client).query<AnyRow>('SELECT * FROM financeiro_closings WHERE id = $1 LIMIT 1', [id]);
  return closingToView(result.rows[0] || null);
}

function isLocked(closing: AnyRow): boolean {
  return ['fechado', 'divergente'].includes(String(closing.status || ''));
}

function isFinishedClosingStatus(status: unknown): boolean {
  return ['fechado', 'divergente', 'sem_movimento'].includes(String(status || ''));
}

async function auditEvent(
  action: string,
  entityTable: string,
  recordId: number | null,
  before: unknown,
  after: unknown,
  req?: Request,
  userId?: number | null,
): Promise<void> {
  try {
    await pgPool.query(
      `INSERT INTO financeiro_audit_events
        (user_legacy_id, action, entity_table, entity_legacy_id, previous_value, new_value, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        userId ?? req?.session.user?.id ?? null,
        action,
        entityTable,
        recordId,
        before === null || before === undefined ? null : JSON.stringify(before),
        after === null || after === undefined ? null : JSON.stringify(after),
        req?.ip || null,
        String(req?.get('user-agent') || '').slice(0, 255),
      ],
    );
    if (LEGACY_MIRROR_ENABLED) {
      await mirrorAudit(action, entityTable, recordId, before, after, req, userId ?? req?.session.user?.id ?? null);
    }
  } catch (error) {
    console.warn('[financeiro] audit failed', error);
  }
}

async function mirrorAudit(
  action: string,
  entityTable: string,
  recordId: number | null,
  before: unknown,
  after: unknown,
  req?: Request,
  userId?: number | null,
): Promise<void> {
  try {
    await legacyDb().query(
      `INSERT INTO financeiro_auditoria
        (usuario_id, acao, tabela_afetada, registro_id, valor_anterior, valor_novo, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId ?? null,
        action,
        entityTable,
        recordId,
        before === null || before === undefined ? null : JSON.stringify(before),
        after === null || after === undefined ? null : JSON.stringify(after),
        req?.ip || null,
        String(req?.get('user-agent') || '').slice(0, 255),
      ],
    );
  } catch (error) {
    console.warn('[financeiro] legacy audit mirror failed', error);
  }
}

async function mirrorClosing(closing: AnyRow): Promise<number | null> {
  if (!LEGACY_MIRROR_ENABLED) return Number(closing.legacy_mysql_id || 0) || null;
  try {
    const legacyId = Number(closing.legacy_mysql_id || 0) || null;
    const values = [
      closing.data_fechamento,
      closing.responsavel_id || null,
      cleanText(closing.responsavel_texto, 160) || null,
      closing.status || 'aberto',
      centsToDecimal(moneyTextToCents(closing.caixa_fisico)),
      centsToDecimal(moneyTextToCents(closing.cartao_total)),
      centsToDecimal(moneyTextToCents(closing.pix_banco_total)),
      centsToDecimal(moneyTextToCents(closing.pix_maquininha_total)),
      centsToDecimal(moneyTextToCents(closing.pix_correto_total)),
      closing.pix_correto_manual === null || closing.pix_correto_manual === undefined ? null : centsToDecimal(moneyTextToCents(closing.pix_correto_manual)),
      cleanText(closing.pix_correto_justificativa, 4000) || null,
      centsToDecimal(moneyTextToCents(closing.sangria_total)),
      centsToDecimal(moneyTextToCents(closing.retirada_caixa)),
      centsToDecimal(moneyTextToCents(closing.abertura_sistema)),
      centsToDecimal(moneyTextToCents(closing.faturamento_dia)),
      closing.faturamento_registrado_em || null,
      centsToDecimal(moneyTextToCents(closing.ajustes)),
      centsToDecimal(moneyTextToCents(closing.total_conferido)),
      centsToDecimal(moneyTextToCents(closing.sobra_falta)),
      cleanText(closing.justificativa, 4000) || null,
      cleanText(closing.observacao, 4000) || null,
      closing.fechado_em || null,
      closing.fechado_por || null,
      legacyId,
    ];
    const sql = legacyId
      ? `UPDATE financeiro_fechamentos
            SET data_fechamento = ?, responsavel_id = ?, responsavel_texto = ?, status = ?,
                caixa_fisico = ?, cartao_total = ?, pix_banco_total = ?, pix_maquininha_total = ?,
                pix_correto_total = ?, pix_correto_manual = ?, pix_correto_justificativa = ?,
                sangria_total = ?, retirada_caixa = ?, abertura_sistema = ?, faturamento_dia = ?,
                faturamento_registrado_em = ?, ajustes = ?, total_conferido = ?, sobra_falta = ?,
                justificativa = ?, observacao = ?, fechado_em = ?, fechado_por = ?
          WHERE id = ?`
      : `INSERT INTO financeiro_fechamentos
           (data_fechamento, responsavel_id, responsavel_texto, status, caixa_fisico, cartao_total,
            pix_banco_total, pix_maquininha_total, pix_correto_total, pix_correto_manual,
            pix_correto_justificativa, sangria_total, retirada_caixa, abertura_sistema,
            faturamento_dia, faturamento_registrado_em, ajustes, total_conferido, sobra_falta,
            justificativa, observacao, fechado_em, fechado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            responsavel_id = VALUES(responsavel_id),
            responsavel_texto = VALUES(responsavel_texto),
            status = VALUES(status),
            caixa_fisico = VALUES(caixa_fisico),
            cartao_total = VALUES(cartao_total),
            pix_banco_total = VALUES(pix_banco_total),
            pix_maquininha_total = VALUES(pix_maquininha_total),
            pix_correto_total = VALUES(pix_correto_total),
            pix_correto_manual = VALUES(pix_correto_manual),
            pix_correto_justificativa = VALUES(pix_correto_justificativa),
            sangria_total = VALUES(sangria_total),
            retirada_caixa = VALUES(retirada_caixa),
            abertura_sistema = VALUES(abertura_sistema),
            faturamento_dia = VALUES(faturamento_dia),
            faturamento_registrado_em = VALUES(faturamento_registrado_em),
            ajustes = VALUES(ajustes),
            total_conferido = VALUES(total_conferido),
            sobra_falta = VALUES(sobra_falta),
            justificativa = VALUES(justificativa),
            observacao = VALUES(observacao),
            fechado_em = VALUES(fechado_em),
            fechado_por = VALUES(fechado_por)`;
    const [result] = await legacyDb().query(sql, legacyId ? values : values.slice(0, -1));
    const insertId = Number((result as { insertId?: number }).insertId || legacyId || 0);
    if (!legacyId && insertId > 0 && closing.id) {
      await pgPool.query('UPDATE financeiro_closings SET legacy_mysql_id = $1 WHERE id = $2 AND legacy_mysql_id IS NULL', [insertId, closing.id]);
    }
    return insertId || legacyId;
  } catch (error) {
    console.warn('[financeiro] legacy closing mirror failed', error);
    return Number(closing.legacy_mysql_id || 0) || null;
  }
}

async function getOrCreateClosing(date: string, req?: Request, client?: PoolClient): Promise<AnyRow> {
  const existing = await fetchClosingByDate(date, client);
  if (existing) return existing;
  const result = await pgClient(client).query<AnyRow>(
    `INSERT INTO financeiro_closings (closing_date, status)
     VALUES ($1, 'aberto')
     ON CONFLICT (closing_date) DO NOTHING
     RETURNING *`,
    [date],
  );
  const created = closingToView(result.rows[0] || null) || (await fetchClosingByDate(date, client));
  if (!created) throw new Error('Nao foi possivel criar o fechamento financeiro.');
  const legacyId = await mirrorClosing(created);
  if (legacyId && !created.legacy_mysql_id) created.legacy_mysql_id = legacyId;
  await auditEvent('criar_fechamento', 'financeiro_fechamentos', Number(created.id), null, created, req);
  return created;
}

async function entrySums(closingId: number): Promise<AnyRow> {
  const result = await pgPool.query<AnyRow>(
    `SELECT
        COUNT(*)::int AS total_qtd,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN 1 ELSE 0 END), 0)::int AS qtd,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN amount_cents ELSE 0 END), 0)::bigint AS total,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category = 'Dinheiro Fisico' THEN amount_cents ELSE 0 END), 0)::bigint AS dinheiro,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category = 'Maquininha C/D' THEN amount_cents ELSE 0 END), 0)::bigint AS cartao,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category = 'Pix CNPJ' THEN amount_cents ELSE 0 END), 0)::bigint AS pix_banco,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category = 'Maquininha Pix' THEN amount_cents ELSE 0 END), 0)::bigint AS pix_maquininha,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category = 'Sangria' THEN amount_cents ELSE 0 END), 0)::bigint AS sangria,
        COALESCE(SUM(CASE WHEN status <> 'cancelado' AND category NOT IN ('Dinheiro Fisico', 'Maquininha C/D', 'Pix CNPJ', 'Maquininha Pix', 'Sangria') THEN amount_cents ELSE 0 END), 0)::bigint AS outros
       FROM financeiro_entries
      WHERE closing_id = $1`,
    [closingId],
  );
  return result.rows[0] || {};
}

async function specificSums(closingId: number): Promise<AnyRow> {
  const result = await pgPool.query<AnyRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM financeiro_card_entries WHERE closing_id = $1) AS card_total_qtd,
       (SELECT COALESCE(SUM(CASE WHEN reconciliation_status <> 'cancelado' AND kind IN ('credito', 'debito', 'voucher', 'outra') THEN gross_cents ELSE 0 END), 0)::bigint FROM financeiro_card_entries WHERE closing_id = $1) AS cartao,
       (SELECT COALESCE(SUM(CASE WHEN reconciliation_status <> 'cancelado' AND kind = 'pix_maquininha' THEN gross_cents ELSE 0 END), 0)::bigint FROM financeiro_card_entries WHERE closing_id = $1) AS pix_maquininha_card,
       (SELECT COUNT(*)::int FROM financeiro_pix_entries WHERE closing_id = $1) AS pix_total_qtd,
       (SELECT COALESCE(SUM(CASE WHEN status <> 'cancelado' AND kind = 'banco' THEN amount_cents ELSE 0 END), 0)::bigint FROM financeiro_pix_entries WHERE closing_id = $1) AS pix_banco,
       (SELECT COALESCE(SUM(CASE WHEN status <> 'cancelado' AND kind = 'maquininha' THEN amount_cents ELSE 0 END), 0)::bigint FROM financeiro_pix_entries WHERE closing_id = $1) AS pix_maquininha_pix,
       (SELECT COALESCE(SUM(CASE WHEN status <> 'cancelado' AND kind = 'ajuste' THEN amount_cents ELSE 0 END), 0)::bigint FROM financeiro_pix_entries WHERE closing_id = $1) AS pix_ajuste,
       (SELECT COUNT(*)::int FROM financeiro_sangrias WHERE closing_id = $1) AS sangrias_total_qtd,
       (SELECT COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN amount_cents ELSE 0 END), 0)::bigint FROM financeiro_sangrias WHERE closing_id = $1) AS sangria`,
    [closingId],
  );
  return result.rows[0] || {};
}

async function recalculateClosing(closingId: number): Promise<AnyRow> {
  const closing = await fetchClosingById(closingId);
  if (!closing) throw new Error('Fechamento financeiro nao encontrado.');
  const generic = await entrySums(closingId);
  const specific = await specificSums(closingId);
  const hasGeneric = Number(generic.total_qtd || 0) > 0;
  const cash = hasGeneric ? Number(generic.dinheiro || 0) : moneyTextToCents(closing.caixa_fisico);
  const card = hasGeneric
    ? Number(generic.cartao || 0)
    : Number(specific.card_total_qtd || 0) > 0
      ? Number(specific.cartao || 0)
      : moneyTextToCents(closing.cartao_total);
  const pixBank = hasGeneric
    ? Number(generic.pix_banco || 0)
    : Number(specific.pix_total_qtd || 0) > 0
      ? Number(specific.pix_banco || 0)
      : moneyTextToCents(closing.pix_banco_total);
  const pixMachineAuto = Number(specific.pix_maquininha_card || 0) + Number(specific.pix_maquininha_pix || 0);
  const pixMachine = hasGeneric
    ? Number(generic.pix_maquininha || 0)
    : Number(specific.card_total_qtd || 0) + Number(specific.pix_total_qtd || 0) > 0
      ? pixMachineAuto
      : moneyTextToCents(closing.pix_maquininha_total);
  const sangria = hasGeneric
    ? Number(generic.sangria || 0)
    : Number(specific.sangrias_total_qtd || 0) > 0
      ? Number(specific.sangria || 0)
      : moneyTextToCents(closing.sangria_total);
  const adjustments = hasGeneric ? Number(generic.outros || 0) : moneyTextToCents(closing.ajustes);
  const manualPix = closing.pix_correto_manual === null || closing.pix_correto_manual === undefined ? null : moneyTextToCents(closing.pix_correto_manual);
  const pixCorrect = manualPix !== null ? manualPix : pixBank + pixMachine + Number(specific.pix_ajuste || 0);
  const total = hasGeneric
    ? Number(generic.total || 0)
    : cash + card + pixCorrect + sangria + moneyTextToCents(closing.retirada_caixa) + adjustments;
  const difference = total - moneyTextToCents(closing.abertura_sistema);
  const result = await pgPool.query<AnyRow>(
    `UPDATE financeiro_closings
        SET cash_cents = $1,
            card_cents = $2,
            pix_bank_cents = $3,
            pix_machine_cents = $4,
            pix_correct_cents = $5,
            sangria_cents = $6,
            adjustments_cents = $7,
            total_checked_cents = $8,
            difference_cents = $9,
            updated_at = NOW()
      WHERE id = $10
      RETURNING *`,
    [cash, card, pixBank, pixMachine, pixCorrect, sangria, adjustments, total, difference, closingId],
  );
  const updated = closingToView(result.rows[0] || null) || closing;
  await mirrorClosing(updated);
  return updated;
}

function closingDataFromBody(body: AnyRow): AnyRow {
  return {
    responsavel_id: intOrNull(body.responsavel_id),
    responsavel_texto: cleanText(body.responsavel_texto, 160),
    caixa_fisico: moneyTextToCents(body.caixa_fisico),
    cartao_total: moneyTextToCents(body.cartao_total),
    pix_banco_total: moneyTextToCents(body.pix_banco_total),
    pix_maquininha_total: moneyTextToCents(body.pix_maquininha_total),
    pix_correto_manual: body.pix_correto_manual === null || body.pix_correto_manual === undefined || body.pix_correto_manual === '' ? null : moneyTextToCents(body.pix_correto_manual),
    pix_correto_justificativa: cleanText(body.pix_correto_justificativa, 4000),
    sangria_total: moneyTextToCents(body.sangria_total),
    retirada_caixa: moneyTextToCents(body.retirada_caixa),
    abertura_sistema: moneyTextToCents(body.total_sistema || body.abertura_sistema),
    faturamento_dia: moneyTextToCents(body.faturamento_dia),
    ajustes: moneyTextToCents(body.ajustes),
    justificativa: cleanText(body.justificativa, 4000),
    observacao: cleanText(body.observacao, 4000),
  };
}

async function updateManualClosing(closingId: number, data: AnyRow, req?: Request): Promise<AnyRow> {
  const before = await fetchClosingById(closingId);
  if (!before) throw new Error('Fechamento nao encontrado.');
  if (isLocked(before)) throw new Error('Este dia esta fechado. Reabra com senha para editar.');
  if (data.pix_correto_manual !== null && data.pix_correto_justificativa === '') {
    throw new Error('Informe a justificativa quando preencher PIX correto manual.');
  }
  const previousRevenue = moneyTextToCents(before.faturamento_dia);
  const nextRevenue = Number(data.faturamento_dia || 0);
  let recordedAt = before.faturamento_registrado_em || null;
  if (nextRevenue <= 0) {
    recordedAt = null;
  } else if (Math.abs(nextRevenue - previousRevenue) > 0 || !recordedAt) {
    recordedAt = new Date().toISOString();
  }
  await pgPool.query(
    `UPDATE financeiro_closings
        SET responsible_legacy_id = $1,
            responsible_text = $2,
            status = 'conferencia',
            cash_cents = $3,
            card_cents = $4,
            pix_bank_cents = $5,
            pix_machine_cents = $6,
            pix_correct_manual_cents = $7,
            pix_correct_note = $8,
            sangria_cents = $9,
            cash_withdraw_cents = $10,
            system_opening_cents = $11,
            daily_revenue_cents = $12,
            daily_revenue_recorded_at = $13,
            adjustments_cents = $14,
            justification = $15,
            observation = $16,
            updated_at = NOW()
      WHERE id = $17`,
    [
      data.responsavel_id,
      data.responsavel_texto,
      data.caixa_fisico,
      data.cartao_total,
      data.pix_banco_total,
      data.pix_maquininha_total,
      data.pix_correto_manual,
      data.pix_correto_justificativa,
      data.sangria_total,
      data.retirada_caixa,
      data.abertura_sistema,
      nextRevenue,
      recordedAt,
      data.ajustes,
      data.justificativa,
      data.observacao,
      closingId,
    ],
  );
  const after = await recalculateClosing(closingId);
  await auditEvent('alterar_fechamento', 'financeiro_fechamentos', closingId, before, after, req);
  return after;
}

async function closeClosing(closingId: number, status: string, req?: Request): Promise<AnyRow> {
  const before = await fetchClosingById(closingId);
  if (!before) throw new Error('Fechamento financeiro nao encontrado.');
  const result = await pgPool.query<AnyRow>(
    `UPDATE financeiro_closings
        SET status = $1,
            closed_at = NOW(),
            closed_by_legacy_id = $2,
            updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
    [status, req?.session.user?.id || null, closingId],
  );
  const after = closingToView(result.rows[0] || null) || before;
  await mirrorClosing(after);
  await auditEvent('fechar_fechamento', 'financeiro_fechamentos', closingId, before, after, req);
  return after;
}

async function reopenClosing(date: string, req: Request): Promise<void> {
  const closing = await fetchClosingByDate(date);
  if (!closing) throw new Error('Dia financeiro nao encontrado.');
  const before = closing;
  const result = await pgPool.query<AnyRow>(
    `UPDATE financeiro_closings
        SET status = 'conferencia',
            closed_at = NULL,
            closed_by_legacy_id = NULL,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [closing.id],
  );
  const after = closingToView(result.rows[0] || null) || closing;
  await mirrorClosing(after);
  await auditEvent('reabrir_fechamento', 'financeiro_fechamentos', Number(closing.id), before, after, req);
}

async function saveDailyRevenue(date: string, valueCents: number, userId: number | null, source: string, req?: Request): Promise<AnyRow> {
  const closing = await getOrCreateClosing(date, req);
  const before = await fetchClosingById(Number(closing.id)) || closing;
  const reopenEmpty = String(before.status || '') === 'sem_movimento' && valueCents > 0;
  const result = await pgPool.query<AnyRow>(
    `UPDATE financeiro_closings
        SET daily_revenue_cents = $1,
            daily_revenue_recorded_at = $2,
            status = CASE WHEN $3 THEN 'conferencia' ELSE status END,
            closed_at = CASE WHEN $3 THEN NULL ELSE closed_at END,
            closed_by_legacy_id = CASE WHEN $3 THEN NULL ELSE closed_by_legacy_id END,
            updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
    [valueCents, valueCents > 0 ? new Date().toISOString() : null, reopenEmpty, closing.id],
  );
  const after = closingToView(result.rows[0] || null) || closing;
  await mirrorClosing(after);
  await auditEvent(
    'salvar_faturamento_diario',
    'financeiro_fechamentos',
    Number(closing.id),
    before,
    {
      data_fechamento: date,
      faturamento_dia: centsToDecimal(valueCents),
      status: after.status,
      sem_movimento_convertido: reopenEmpty,
      origem: source,
      usuario_id: userId,
    },
    req,
    userId,
  );
  return after;
}

async function mirrorEntry(entry: AnyRow): Promise<number | null> {
  if (!LEGACY_MIRROR_ENABLED) return Number(entry.legacy_mysql_id || 0) || null;
  try {
    const legacyId = Number(entry.legacy_mysql_id || 0) || null;
    const closing = entry.closing_id ? await fetchClosingById(Number(entry.closing_id)) : null;
    const closingLegacyId = Number(entry.legacy_closing_id || closing?.legacy_mysql_id || 0) || null;
    const values = [
      closingLegacyId,
      toDateInput(entry.entry_date),
      cleanText(entry.category, 120),
      centsToDecimal(Number(entry.amount_cents || 0)),
      cleanText(entry.observation, 4000) || null,
      entry.status || 'lancado',
      entry.created_by_legacy_id || null,
      legacyId,
    ];
    const sql = legacyId
      ? `UPDATE financeiro_lancamentos
            SET fechamento_id = ?, data = ?, categoria = ?, valor = ?, observacao = ?, status = ?, created_by = ?
          WHERE id = ?`
      : `INSERT INTO financeiro_lancamentos
            (fechamento_id, data, categoria, valor, observacao, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await legacyDb().query(sql, legacyId ? values : values.slice(0, -1));
    const insertId = Number((result as { insertId?: number }).insertId || legacyId || 0);
    if (!legacyId && insertId > 0 && entry.id) {
      await pgPool.query('UPDATE financeiro_entries SET legacy_mysql_id = $1, legacy_closing_id = $2 WHERE id = $3 AND legacy_mysql_id IS NULL', [
        insertId,
        closingLegacyId,
        entry.id,
      ]);
    }
    return insertId || legacyId;
  } catch (error) {
    console.warn('[financeiro] legacy entry mirror failed', error);
    return Number(entry.legacy_mysql_id || 0) || null;
  }
}

async function addEntry(
  date: string,
  category: string,
  valueCents: number,
  observation: string,
  userId: number | null,
  req?: Request,
): Promise<AnyRow> {
  const cleanedCategory = cleanText(category, 120);
  if (cleanedCategory === '') throw new Error('Informe a categoria.');
  if (valueCents <= 0) throw new Error('Informe o valor do lancamento.');
  const closing = await getOrCreateClosing(date, req);
  if (isLocked(closing)) throw new Error('Este dia esta fechado. Reabra para adicionar lancamentos.');
  const result = await pgPool.query<AnyRow>(
    `INSERT INTO financeiro_entries
        (closing_id, legacy_closing_id, entry_date, category, amount_cents, observation, status, created_by_legacy_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'lancado', $7)
     RETURNING *`,
    [closing.id, closing.legacy_mysql_id || null, date, cleanedCategory, valueCents, cleanText(observation, 4000), userId],
  );
  const entry = result.rows[0];
  await mirrorEntry(entry);
  const updated = await recalculateClosing(Number(closing.id));
  await auditEvent(
    'criar_lancamento',
    'financeiro_lancamentos',
    Number(entry.id),
    null,
    { data: date, categoria: cleanedCategory, valor: centsToDecimal(valueCents), observacao: observation, total_conferido: updated.total_conferido },
    req,
    userId,
  );
  return { ...entry, closing: updated };
}

async function cancelEntry(date: string, id: number, req: Request): Promise<void> {
  const closing = await fetchClosingByDate(date);
  if (!closing || isLocked(closing)) throw new Error('Este dia esta fechado. Reabra para remover lancamentos.');
  const beforeResult = await pgPool.query<AnyRow>('SELECT * FROM financeiro_entries WHERE id = $1 AND closing_id = $2 LIMIT 1', [id, closing.id]);
  const before = beforeResult.rows[0];
  if (!before) throw new Error('Lancamento nao encontrado.');
  const afterResult = await pgPool.query<AnyRow>("UPDATE financeiro_entries SET status = 'cancelado', updated_at = NOW() WHERE id = $1 RETURNING *", [id]);
  const after = afterResult.rows[0];
  await mirrorEntry(after);
  await recalculateClosing(Number(closing.id));
  await auditEvent('cancelar_lancamento', 'financeiro_lancamentos', id, before, after, req);
}

async function monthClosings(month: number, year: number): Promise<Record<string, AnyRow>> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = monthDays(month, year).at(-1) || start;
  const result = await pgPool.query<AnyRow>(
    'SELECT * FROM financeiro_closings WHERE closing_date BETWEEN $1 AND $2 ORDER BY closing_date ASC',
    [start, end],
  );
  const rows: Record<string, AnyRow> = {};
  for (const row of result.rows) {
    const closing = closingToView(row);
    if (closing) rows[String(closing.data_fechamento)] = closing;
  }
  return rows;
}

async function yearSummary(year: number): Promise<Record<number, AnyRow>> {
  const result = await pgPool.query<AnyRow>(
    `SELECT EXTRACT(MONTH FROM closing_date)::int AS mes,
            COUNT(*)::int AS dias,
            COALESCE(SUM(total_checked_cents), 0)::bigint AS total_cents,
            COALESCE(SUM(difference_cents), 0)::bigint AS diferenca_cents,
            COALESCE(SUM(CASE WHEN status = 'divergente' THEN 1 ELSE 0 END), 0)::int AS divergentes,
            COALESCE(SUM(CASE WHEN status IN ('fechado', 'divergente', 'sem_movimento') THEN 1 ELSE 0 END), 0)::int AS fechados
       FROM financeiro_closings
      WHERE EXTRACT(YEAR FROM closing_date)::int = $1
      GROUP BY EXTRACT(MONTH FROM closing_date)::int`,
    [year],
  );
  const rows: Record<number, AnyRow> = {};
  for (const row of result.rows) {
    rows[Number(row.mes)] = {
      dias: Number(row.dias || 0),
      total: centsToDecimal(Number(row.total_cents || 0)),
      diferenca: centsToDecimal(Number(row.diferenca_cents || 0)),
      divergentes: Number(row.divergentes || 0),
      fechados: Number(row.fechados || 0),
    };
  }
  return rows;
}

function reportMonthTotals(closings: Record<string, AnyRow>, days: string[]): AnyRow {
  const totals: AnyRow = {
    dias_mes: days.length,
    dias_registrados: 0,
    fechados: 0,
    divergentes: 0,
    total_lancado: 0,
    total_sistema: 0,
    faturamento_dia: 0,
    faturamento_registros: 0,
    sobra_falta: 0,
    maior_sobra: 0,
    maior_falta: 0,
  };
  for (const closing of Object.values(closings)) {
    totals.dias_registrados = Number(totals.dias_registrados) + 1;
    totals.total_lancado = Number(totals.total_lancado) + Number(closing.total_conferido || 0);
    totals.total_sistema = Number(totals.total_sistema) + Number(closing.abertura_sistema || 0);
    totals.faturamento_dia = Number(totals.faturamento_dia) + Number(closing.faturamento_dia || 0);
    totals.sobra_falta = Number(totals.sobra_falta) + Number(closing.sobra_falta || 0);
    if (Number(closing.faturamento_dia || 0) > 0) totals.faturamento_registros = Number(totals.faturamento_registros) + 1;
    if (['fechado', 'divergente', 'sem_movimento'].includes(String(closing.status || ''))) totals.fechados = Number(totals.fechados) + 1;
    if (String(closing.status || '') === 'divergente') totals.divergentes = Number(totals.divergentes) + 1;
    if (Number(closing.sobra_falta || 0) > Number(totals.maior_sobra || 0)) totals.maior_sobra = Number(closing.sobra_falta || 0);
    if (Number(closing.sobra_falta || 0) < Number(totals.maior_falta || 0)) totals.maior_falta = Number(closing.sobra_falta || 0);
  }
  return totals;
}

async function divergenceHighlights(month: number, year: number, limit = 6): Promise<AnyRow[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = monthDays(month, year).at(-1) || start;
  const result = await pgPool.query<AnyRow>(
    `SELECT *
       FROM financeiro_closings
      WHERE closing_date BETWEEN $1 AND $2
        AND ABS(difference_cents) > 0
      ORDER BY ABS(difference_cents) DESC, closing_date ASC
      LIMIT $3`,
    [start, end, Math.max(1, Math.min(20, limit))],
  );
  return result.rows.map((row) => closingToView(row)).filter(Boolean) as AnyRow[];
}

async function fetchEntries(closingId: number): Promise<AnyRow[]> {
  const result = await pgPool.query<AnyRow>(
    `SELECT id::text, legacy_mysql_id, closing_id, entry_date, category, amount_cents, observation, status, created_by_legacy_id, created_at, updated_at
       FROM financeiro_entries
      WHERE closing_id = $1
      ORDER BY status ASC, created_at ASC, id ASC`,
    [closingId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    legacy_mysql_id: row.legacy_mysql_id,
    data: toDateInput(row.entry_date),
    categoria: String(row.category || ''),
    valor: centsToDecimal(Number(row.amount_cents || 0)),
    observacao: String(row.observation || ''),
    status: String(row.status || 'lancado'),
    created_at: row.created_at || null,
  }));
}

async function divergenceLimitCents(): Promise<number> {
  const result = await pgPool.query<{ setting_value: string }>(
    "SELECT setting_value FROM financeiro_settings WHERE setting_key = 'limite_divergencia' LIMIT 1",
  );
  return Math.max(0, moneyTextToCents(result.rows[0]?.setting_value || '10.00'));
}

function categories(): string[] {
  return ['Sangria', 'Maquininha C/D', 'Maquininha Pix', 'Pix CNPJ', 'Dinheiro Fisico', 'Outros'];
}

async function closeEmptyDay(date: string, req: Request, observation = 'Sem movimento.'): Promise<AnyRow> {
  const closing = await getOrCreateClosing(date, req);
  if (isLocked(closing)) throw new Error('Este dia ja esta fechado.');
  await updateManualClosing(
    Number(closing.id),
    {
      responsavel_id: closing.responsavel_id || null,
      responsavel_texto: cleanText(closing.responsavel_texto, 160),
      caixa_fisico: 0,
      cartao_total: 0,
      pix_banco_total: 0,
      pix_maquininha_total: 0,
      pix_correto_manual: null,
      pix_correto_justificativa: '',
      sangria_total: 0,
      retirada_caixa: 0,
      abertura_sistema: 0,
      faturamento_dia: 0,
      ajustes: 0,
      justificativa: observation,
      observacao: observation,
    },
    req,
  );
  return closeClosing(Number(closing.id), 'sem_movimento', req);
}

function postRedirect(res: Response, year: number, month: number, date: string, anchor = 'dia'): void {
  res.redirect(`${BASE_PATH}/?ano=${year}&mes=${month}&data=${date}#${anchor}`);
}

function pageUrl(query: Record<string, unknown> = {}, anchor = ''): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return `${BASE_PATH}/${params.toString() ? `?${params.toString()}` : ''}${anchor ? `#${anchor.replace(/^#/, '')}` : ''}`;
}

function moneyInput(value: unknown): string {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login Financeiro - Wimifarma</title>
  <link rel="icon" type="image/svg+xml" href="${BASE_PATH}/favicon.svg">
  <link rel="alternate icon" href="${BASE_PATH}/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260520-card">
  <script src="${BASE_PATH}/app.js?v=20260529-node" defer></script>
  <script src="${BASE_PATH}/login-runner.js?v=20260504d" defer></script>
</head>
<body class="finance-login-body">
  <img class="login-screen-runner login-cat-runner" src="${BASE_PATH}/assets/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
  <main class="finance-login-card">
    <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
    <span class="kicker">Wimifarma Financeiro</span>
    <h1>Acesso do caixa</h1>
    <p>Entre para fechar o caixa, conferir sangrias, maquininhas e PIX.</p>
    ${error ? `<div class="notice error">${e(error)}</div>` : ''}
    <form method="post" data-no-enter-submit>
      ${csrfField(req)}
      <label>Usuario
        <input type="text" name="username" required autocomplete="username" value="${e(req.body?.username || '')}">
      </label>
      <label>Senha
        <input type="password" name="password" required autocomplete="current-password">
      </label>
      <button class="btn primary" type="submit">Entrar no financeiro</button>
    </form>
  </main>
</body>
</html>`;
}

function renderShell(req: Request, user: User, view: 'caixa' | 'relatorio', pageTitle: string, flash: Flash, content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(pageTitle)} - Wimifarma</title>
  <link rel="icon" type="image/svg+xml" href="${BASE_PATH}/favicon.svg">
  <link rel="alternate icon" href="${BASE_PATH}/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260520-card">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260517j">
  <script src="${BASE_PATH}/app.js?v=20260529-node" defer></script>
  <script src="/miauw/widget.js?v=20260517j" defer></script>
</head>
<body>
<header class="finance-topbar">
  <a class="finance-brand" href="/">
    <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
    <span>Financeiro</span>
  </a>
  <nav class="finance-nav" aria-label="Navegacao financeira">
    <a class="${view === 'caixa' ? 'active' : ''}" href="${BASE_PATH}/">Caixa</a>
    <a class="${view === 'relatorio' ? 'active' : ''}" href="${pageUrl({ view: 'relatorio', rel_ano: req.query.rel_ano || new Date().getFullYear(), rel_mes: req.query.rel_mes || new Date().getMonth() + 1 })}">Relatorio</a>
    <a href="${BASE_PATH}/logout.php">Sair</a>
  </nav>
</header>
<main class="finance-shell">
  <section class="finance-hero">
    <div>
      <h1>${view === 'relatorio' ? 'Relatorio financeiro' : 'Fechamento de caixa'}</h1>
    </div>
    <div class="user-pill">Usuario: ${e(user.username)}</div>
  </section>
  ${flash.message ? `<div class="notice ${e(flash.type)}">${e(flash.message)}</div>` : ''}
  ${content}
</main>
</body>
</html>`;
}

async function renderReport(req: Request): Promise<string> {
  const years = fiscalYears();
  const context = selectedContext(req);
  const reportYear = Math.max(Math.min(...years), Math.min(Math.max(...years), Number(req.query.rel_ano || context.year)));
  const reportMonth = Math.max(1, Math.min(12, Number(req.query.rel_mes || context.month)));
  const reportYearSummary = await yearSummary(reportYear);
  const reportDays = monthDays(reportMonth, reportYear);
  const closings = await monthClosings(reportMonth, reportYear);
  const totals = reportMonthTotals(closings, reportDays);
  const divergences = await divergenceHighlights(reportMonth, reportYear, 6);
  const monthGrid = Array.from({ length: 12 }, (_, index) => index + 1)
    .map((number) => {
      const summary = reportYearSummary[number] || { fechados: 0 };
      return `<a class="report-month-card ${number === reportMonth ? 'active' : ''}" href="${pageUrl({ view: 'relatorio', rel_ano: reportYear, rel_mes: number })}">
        <span>${String(number).padStart(2, '0')}/${reportYear}</span>
        <strong>${e(monthName(number))}</strong>
        <small>${Number(summary.fechados || 0)} fechado(s)</small>
      </a>`;
    })
    .join('');
  const rows = reportDays
    .map((dayDate) => {
      const closing = closings[dayDate] || {};
      const revenue = Number(closing.faturamento_dia || 0);
      const dayStatus = String(closing.status || 'sem registro');
      const isSunday = new Date(`${dayDate}T00:00:00-03:00`).getDay() === 0;
      const locked = closing.id ? isLocked(closing) : false;
      const isEmpty = dayStatus === 'sem_movimento';
      const closedAt = closing.fechado_em ? formatPgTimestamp(closing.fechado_em, true) : '';
      const closedBy = cleanText(closing.responsavel_nome || closing.responsavel_texto || '', 160);
      return `<tr class="${isSunday ? 'is-sunday' : ''} ${isEmpty ? 'is-empty-movement-selected' : ''}">
        <td><strong>${brDate(dayDate).slice(0, 5)}</strong><small>${e(weekdayLabel(dayDate))}</small></td>
        <td><span class="status-dot status-${e(dayStatus.replace(/[^a-z0-9_-]/gi, '-'))}">${e(dayStatus)}</span></td>
        <td><input type="text" name="faturamento[${e(dayDate)}]" value="${revenue > 0 ? e(moneyInput(revenue)) : ''}" inputmode="decimal" placeholder="0,00" data-revenue-date="${e(dayDate)}" data-daily-revenue-input></td>
        <td><button class="empty-day-button" type="button" data-empty-day="${e(dayDate)}" ${locked || isEmpty ? 'disabled' : ''}>${isEmpty ? 'Sem movimento' : 'Fechar sem mov.'}</button></td>
        <td class="closed-by-cell"><strong>${e(closedBy || '-')}</strong><small>${e(closedAt || '-')}</small></td>
        <td><span class="${diffClass(moneyTextToCents(closing.sobra_falta))}">${brMoneyFromDecimal(closing.sobra_falta)}</span></td>
      </tr>`;
    })
    .join('');
  const divergenceHtml = divergences.length
    ? `<div class="divergence-highlight-list">${divergences
        .map(
          (item) => `<article>
            <strong>${e(brDate(item.data_fechamento))} - <span class="${diffClass(moneyTextToCents(item.sobra_falta))}">${brMoneyFromDecimal(item.sobra_falta)}</span></strong>
            <p>${e(cleanText(item.justificativa, 4000) || 'Sem justificativa registrada.')}</p>
            ${cleanText(item.observacao, 4000) ? `<p class="divergence-observation">Obs.: ${e(item.observacao)}</p>` : ''}
          </article>`,
        )
        .join('')}</div>`
    : '<p class="empty-state">Nenhuma divergencia registrada nesse mes.</p>';

  return `<section class="finance-card report-card">
    <div class="section-head"><div><span class="kicker">Relatorio</span><h2>Ano ${reportYear}</h2></div><div class="soft-pill">${e(monthName(reportMonth))} / ${reportYear}</div></div>
    <div class="report-year-grid">${years
      .map((year) => `<a class="report-year-card ${year === reportYear ? 'active' : ''}" href="${pageUrl({ view: 'relatorio', rel_ano: year, rel_mes: reportMonth })}"><span>Ano</span><strong>${year}</strong></a>`)
      .join('')}</div>
    <div class="report-month-grid">${monthGrid}</div>
  </section>
  <section id="faturamento-diario" class="finance-card daily-revenue-card">
    <div class="section-head"><div><span class="kicker">Faturamento diario</span><h2>Dias de ${e(monthName(reportMonth))}</h2></div><div class="soft-pill">${Number(totals.faturamento_registros || 0)} lancado(s)</div></div>
    <form method="post" class="daily-revenue-form" data-daily-revenue-form data-report-year="${reportYear}" data-report-month="${reportMonth}" data-no-enter-submit>
      ${csrfField(req)}
      <input type="hidden" name="action" value="save_report_faturamento">
      <input type="hidden" name="rel_ano" value="${reportYear}">
      <input type="hidden" name="rel_mes" value="${reportMonth}">
      <input type="hidden" name="data_fechamento" value="${reportYear}-${String(reportMonth).padStart(2, '0')}-01">
      <div class="daily-revenue-layout">
        <div class="daily-revenue-table-wrap"><table class="daily-revenue-table"><thead><tr><th>Dia</th><th>Status</th><th>Faturamento</th><th>Movimento</th><th>Responsavel</th><th>Sobra/Falta</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="daily-revenue-actions"><div class="daily-revenue-total" data-daily-revenue-total>Total digitado: ${brMoneyFromDecimal(totals.faturamento_dia)}</div><div class="daily-revenue-save-state" data-daily-revenue-save-state>Salva automatico ao sair do campo.</div></div>
      </div>
    </form>
    <div class="finance-dialog" data-empty-confirm hidden><div class="finance-dialog-card" role="dialog" aria-modal="true" aria-labelledby="empty-confirm-title"><span class="kicker">Fechar sem movimento</span><h3 id="empty-confirm-title">Confirmar dia sem movimento?</h3><p data-empty-confirm-date>Dia selecionado</p><div class="finance-dialog-actions"><button class="btn ghost" type="button" data-empty-cancel>Nao</button><button class="btn primary" type="button" data-empty-confirm-yes>Sim, fechar</button></div></div></div>
  </section>
  <section class="finance-card report-detail-card">
    <div class="section-head"><div><span class="kicker">Resumo do mes</span><h2>${e(monthName(reportMonth))} / ${reportYear}</h2></div><div class="soft-pill">${Number(totals.dias_registrados || 0)} dia(s) com registro</div></div>
    <div class="finance-metrics compact report-metrics">
      <div><span>Total lancado</span><strong>${brMoneyFromDecimal(totals.total_lancado)}</strong></div>
      <div><span>Total Sistema</span><strong>${brMoneyFromDecimal(totals.total_sistema)}</strong></div>
      <div><span>Faturamento</span><strong>${brMoneyFromDecimal(totals.faturamento_dia)}</strong></div>
      <div><span>Sobra/Falta</span><strong class="${diffClass(moneyTextToCents(totals.sobra_falta))}">${brMoneyFromDecimal(totals.sobra_falta)}</strong></div>
      <div><span>Divergencias</span><strong>${Number(totals.divergentes || 0)}</strong></div>
    </div>
    <div class="report-general-grid">
      <div><span>Dias do mes</span><strong>${Number(totals.dias_mes || 0)}</strong></div>
      <div><span>Dias fechados</span><strong>${Number(totals.fechados || 0)}</strong></div>
      <div><span>Faturamentos lancados</span><strong>${Number(totals.faturamento_registros || 0)}</strong></div>
      <div><span>Maior sobra</span><strong class="is-positive">${brMoneyFromDecimal(totals.maior_sobra)}</strong></div>
      <div><span>Maior falta</span><strong class="is-negative">${brMoneyFromDecimal(totals.maior_falta)}</strong></div>
    </div>
    <div class="divergence-highlights"><div class="section-head mini"><div><span class="kicker">Maiores divergencias</span><h3>Com justificativas</h3></div></div>${divergenceHtml}</div>
  </section>`;
}

async function renderCashier(req: Request): Promise<string> {
  const { year, month, date } = selectedContext(req);
  const years = fiscalYears();
  const yearData = await yearSummary(year);
  const monthData = await monthClosings(month, year);
  const days = monthDays(month, year);
  const selectedClosing = (await fetchClosingByDate(date)) || defaultClosing(date);
  const locked = Boolean(selectedClosing.id) && isLocked(selectedClosing);
  const entries = selectedClosing.id ? await fetchEntries(Number(selectedClosing.id)) : [];
  const limitCents = await divergenceLimitCents();
  const diffCents = moneyTextToCents(selectedClosing.sobra_falta);
  const monthCards = Array.from({ length: 12 }, (_, index) => index + 1)
    .map((number) => {
      const summary = yearData[number] || { fechados: 0, total: 0 };
      return `<a class="month-card ${number === month ? 'active' : ''}" href="${pageUrl({ ano: year, mes: number, data: defaultDateForMonth(year, number) }, 'calendario')}">
        <span>${String(number).padStart(2, '0')}/${year}</span><strong>${e(monthName(number))}</strong><small>${Number(summary.fechados || 0)} fechado(s) | ${brMoneyFromDecimal(summary.total)}</small>
      </a>`;
    })
    .join('');
  const dayCells = days
    .map((day) => {
      const closing = monthData[day] || null;
      const status = String(closing?.status || 'aberto');
      const dayDiff = moneyTextToCents(closing?.sobra_falta || 0);
      const parsed = new Date(`${day}T00:00:00-03:00`);
      const classes = ['day-cell', `status-${status.replace(/[^a-z0-9_-]+/gi, '')}`];
      if (parsed.getDay() === 0) classes.push('is-sunday');
      if (day === date) classes.push('selected');
      if (day === todayDate()) classes.push('today');
      return `<a class="${e(classes.join(' '))}" href="${pageUrl({ ano: year, mes: month, data: day }, 'dia')}">
        <strong>${day.slice(8, 10)}</strong>
        <span>${e(dayStatusLabel(closing))}</span>
        ${Math.abs(dayDiff) > 0 ? `<small class="day-diff ${diffClass(dayDiff)}">Diferenca</small>` : ''}
      </a>`;
    })
    .join('');
  const entriesHtml = entries
    .filter((entry) => entry.status !== 'cancelado')
    .map(
      (entry) => `<div class="entry-row">
        <div class="entry-content"><span>${e(entry.categoria)}</span><strong>${brMoneyFromDecimal(entry.valor)}</strong><small>${e(formatPgTimestamp(entry.created_at, true))}${entry.observacao ? ` - ${e(entry.observacao)}` : ''}</small></div>
        ${
          locked
            ? ''
            : `<form method="post">${csrfField(req)}<input type="hidden" name="action" value="cancel_lancamento"><input type="hidden" name="data_fechamento" value="${e(date)}"><input type="hidden" name="id" value="${e(entry.id)}"><button class="link-danger" type="submit">Remover</button></form>`
        }
      </div>`,
    )
    .join('');
  const categoryOptions = categories().map((category) => `<option value="${e(category)}">${e(category)}</option>`).join('');
  const badgeText = `${brDate(date)} - ${statusLabel(String(selectedClosing.status || 'aberto'))}${selectedClosing.fechado_em ? ` - Fechado ${formatPgTimestamp(selectedClosing.fechado_em, true)}` : ''}`;
  return `<div class="fiscal-overview">
    <details class="finance-card year-card collapsed-picker">
      <summary><div><span class="kicker">Mes fiscal</span><h2>${year} / ${e(monthName(month))}</h2></div><div class="year-actions">${years
        .map((fiscalYear) => `<a class="btn ${fiscalYear === year ? 'primary' : 'secondary'}" href="${pageUrl({ ano: fiscalYear, mes: month, data: defaultDateForMonth(fiscalYear, month) }, 'calendario')}">${fiscalYear}</a>`)
        .join('')}</div></summary>
      <div class="month-grid">${monthCards}</div>
    </details>
    <details id="calendario" class="finance-card day-board collapsed-picker">
      <summary><div><span class="kicker">Dias de ${e(monthName(month))}</span><h2>${e(brDate(date))}</h2></div><div class="soft-pill">${days.length} dias no mes</div></summary>
      <div class="day-grid">${dayCells}</div>
    </details>
  </div>
  <section id="dia" class="finance-card selected-day">
    <div class="section-head selected-day-head"><div class="day-title-line"><h2>Dia selecionado</h2><span class="date-status-pill">${e(badgeText)}</span></div><div class="autosave-pill" data-save-status>Salvamento automatico</div></div>
    ${locked ? '<div class="notice warning">Este dia esta fechado. Para editar, reabra com a senha interna.</div>' : ''}
    <form id="day-close-form" class="finance-form day-autosave-form" method="post" data-no-enter-submit data-autosave-day>
      ${csrfField(req)}
      <input type="hidden" name="action" value="save_day">
      <input type="hidden" name="data_fechamento" value="${e(date)}">
      <input type="hidden" name="caixa_fisico" value="${e(moneyInput(selectedClosing.caixa_fisico))}">
      <input type="hidden" name="cartao_total" value="${e(moneyInput(selectedClosing.cartao_total))}">
      <input type="hidden" name="pix_banco_total" value="${e(moneyInput(selectedClosing.pix_banco_total))}">
      <input type="hidden" name="pix_maquininha_total" value="${e(moneyInput(selectedClosing.pix_maquininha_total))}">
      <input type="hidden" name="sangria_total" value="${e(moneyInput(selectedClosing.sangria_total))}">
      <input type="hidden" name="retirada_caixa" value="${e(moneyInput(selectedClosing.retirada_caixa))}">
      <input type="hidden" name="ajustes" value="${e(moneyInput(selectedClosing.ajustes))}">
      <input type="hidden" name="faturamento_dia" value="${e(moneyInput(selectedClosing.faturamento_dia))}">
      <div class="form-grid top-fields">
        <label>Responsavel <input name="responsavel_texto" value="${e(selectedClosing.responsavel_nome || selectedClosing.responsavel_texto || '')}" placeholder="Ex.: Isadora" ${locked ? 'disabled' : ''}></label>
        <label>Total Sistema <input name="total_sistema" value="${e(moneyInput(selectedClosing.abertura_sistema))}" inputmode="decimal" placeholder="0,00" ${locked ? 'disabled' : ''}></label>
      </div>
    </form>
    <section class="launch-panel">
      ${
        locked
          ? ''
          : `<form class="entry-add-form" method="post" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="add_lancamento"><input type="hidden" name="data_fechamento" value="${e(date)}"><div class="form-grid entry-grid"><label>Categoria <select name="categoria">${categoryOptions}</select></label><label>Valor <input name="valor" inputmode="decimal" placeholder="0,00" required></label><label>Obs: <input name="observacao" placeholder="Opcional"></label><button class="btn secondary" type="submit">Adicionar</button></div></form>`
      }
      <div class="entry-list launch-list">${entriesHtml || '<div class="empty-list">Nenhum lancamento adicionado neste dia.</div>'}</div>
    </section>
    <div class="finance-metrics compact result-metrics">
      <div><span>Total lancado</span><strong data-total-conferido>${brMoneyFromDecimal(selectedClosing.total_conferido)}</strong></div>
      <div><span>Total Sistema</span><strong data-total-sistema>${brMoneyFromDecimal(selectedClosing.abertura_sistema)}</strong></div>
      <div><span>Sobra/Falta</span><strong data-sobra-falta data-sobra-raw="${centsToDecimal(diffCents).toFixed(2)}" class="${diffClass(diffCents)}">${brMoneyFromCents(diffCents)}</strong></div>
      <div><span>Limite divergencia</span><strong>${brMoneyFromCents(limitCents)}</strong></div>
    </div>
    <div class="day-footer-actions">
      ${
        locked
          ? ''
          : `<div class="close-actions"><button class="btn primary" type="submit" form="day-close-form" name="action" value="close_day">Fechar dia</button><button class="btn ghost" type="submit" form="day-close-form" name="action" value="close_empty" data-close-empty>Fechar sem movimento</button></div>`
      }
      <details class="optional-note divergence-note${Math.abs(diffCents) > limitCents ? '' : ' is-hidden'}" data-divergence-justification data-limit="${centsToDecimal(limitCents).toFixed(2)}"><summary>Justificar Sobra/Falta</summary><label>Justificativa<textarea name="justificativa" form="day-close-form" ${locked ? 'disabled' : ''}>${e(selectedClosing.justificativa || '')}</textarea></label></details>
      <details class="optional-note" ${cleanText(selectedClosing.observacao, 4000) ? 'open' : ''}><summary>Adicionar observacao</summary><label>Observacao livre<textarea name="observacao" form="day-close-form" ${locked ? 'disabled' : ''}>${e(selectedClosing.observacao || '')}</textarea></label></details>
    </div>
    ${
      locked
        ? `<form class="inline-reopen" method="post" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="reopen_day"><input type="hidden" name="data_fechamento" value="${e(date)}"><label>Senha para reabrir <input type="password" name="senha_reabertura" placeholder="Senha interna"></label><button class="btn danger" type="submit">Reabrir dia</button></form>`
        : ''
    }
  </section>`;
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
    mode: 'official',
    route_cutover_enabled: true,
    auth: {
      provider: AUTH_PROVIDER,
      core_required: AUTH_PROVIDER === 'core',
      internal_token_configured: INTERNAL_TOKEN !== '',
    },
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_financeiro',
      legacy_mysql_required: LEGACY_MYSQL_REQUIRED,
      legacy_mysql_import_enabled: LEGACY_IMPORT_ENABLED,
      legacy_mysql_mirror_enabled: LEGACY_MIRROR_ENABLED,
      migration: migrationState,
      postgres,
      legacy,
      legacy_error: legacyError,
      postgres_latency_ms: Date.now() - pgStart,
    },
    next_cutover: {
      frontend_assets_preserved: true,
      rollback: 'remover proxy Apache de /financeiro/ e usar espelho MySQL se necessario',
      required_before_disabling_mysql_mirror: ['checksum_match_by_day', 'miauby_pix_smoke', 'export_csv_smoke'],
    },
  };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFFINANCEIRO',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'financeiro_sessions',
    createTableIfMissing: true,
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 10,
  },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: true, limit: '128kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, { index: false, dotfiles: 'ignore' }));

app.get([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const view = selectedView(req);
  const content = view === 'relatorio' ? await renderReport(req) : await renderCashier(req);
  res.type('html').send(renderShell(req, user, view, view === 'relatorio' ? 'Relatorio Financeiro' : 'Financeiro', takeFlash(req), content));
}));

app.post([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = req.body as AnyRow;
  const action = String(body.action || '');
  const date = validFinanceDate(body.data_fechamento, selectedContext(req).date);
  const postYear = new Date(`${date}T00:00:00-03:00`).getFullYear();
  const postMonth = new Date(`${date}T00:00:00-03:00`).getMonth() + 1;
  try {
    if (!csrfMatches(req)) throw new Error('Sessao expirada. Atualize a pagina e tente novamente.');
    if (action === 'save_report_faturamento_auto') {
      const reportYear = Math.max(2026, Math.min(2028, Number(body.rel_ano || postYear)));
      const reportMonth = Math.max(1, Math.min(12, Number(body.rel_mes || postMonth)));
      const entryDate = validFinanceDate(body.entry_date, '');
      if (!entryDate) throw new Error('Dia invalido para salvar faturamento.');
      if (new Date(`${entryDate}T00:00:00-03:00`).getFullYear() !== reportYear || new Date(`${entryDate}T00:00:00-03:00`).getMonth() + 1 !== reportMonth) {
        throw new Error('Dia fora do mes selecionado.');
      }
      const valueCents = String(body.valor || '').trim() === '' ? 0 : moneyTextToCents(body.valor);
      await saveDailyRevenue(entryDate, valueCents, user.id, 'relatorio_auto', req);
      const closings = await monthClosings(reportMonth, reportYear);
      const totals = reportMonthTotals(closings, monthDays(reportMonth, reportYear));
      res.json({
        ok: true,
        message: 'Faturamento salvo automaticamente.',
        entry_date: entryDate,
        valor: brMoneyFromCents(valueCents),
        total_faturamento: brMoneyFromDecimal(totals.faturamento_dia),
        registros: Number(totals.faturamento_registros || 0),
      });
      return;
    }

    if (action === 'close_report_empty_day') {
      const reportYear = Math.max(2026, Math.min(2028, Number(body.rel_ano || postYear)));
      const reportMonth = Math.max(1, Math.min(12, Number(body.rel_mes || postMonth)));
      const entryDate = validFinanceDate(body.entry_date, '');
      if (!entryDate) throw new Error('Dia invalido para fechar sem movimento.');
      if (new Date(`${entryDate}T00:00:00-03:00`).getFullYear() !== reportYear || new Date(`${entryDate}T00:00:00-03:00`).getMonth() + 1 !== reportMonth) {
        throw new Error('Dia fora do mes selecionado.');
      }
      const after = await closeEmptyDay(entryDate, req, 'Sem movimento.');
      res.json({
        ok: true,
        message: 'Dia marcado sem movimento.',
        entry_date: entryDate,
        status: statusLabel(String(after.status || 'sem_movimento')),
        fechado_em: after.fechado_em ? formatPgTimestamp(after.fechado_em, true) : '',
        responsavel: cleanText(after.responsavel_nome || after.responsavel_texto || '', 160),
      });
      return;
    }

    if (action === 'save_report_faturamento') {
      const reportYear = Math.max(2026, Math.min(2028, Number(body.rel_ano || postYear)));
      const reportMonth = Math.max(1, Math.min(12, Number(body.rel_mes || postMonth)));
      const faturamento = typeof body.faturamento === 'object' && body.faturamento ? (body.faturamento as Record<string, unknown>) : {};
      let saved = 0;
      for (const [entryDateRaw, value] of Object.entries(faturamento)) {
        const entryDate = validFinanceDate(entryDateRaw, '');
        if (!entryDate) continue;
        await saveDailyRevenue(entryDate, String(value || '').trim() === '' ? 0 : moneyTextToCents(value), user.id, 'relatorio', req);
        saved++;
      }
      setFlash(req, 'success', saved > 0 ? `${saved} faturamento(s) salvo(s).` : 'Nenhum faturamento novo para salvar.');
      res.redirect(pageUrl({ view: 'relatorio', rel_ano: reportYear, rel_mes: reportMonth }, 'faturamento-diario'));
      return;
    }

    if (action === 'save_day' || action === 'close_day') {
      const closing = await getOrCreateClosing(date, req);
      const updated = await updateManualClosing(Number(closing.id), closingDataFromBody(body), req);
      if (action === 'save_day' && wantsJson(req)) {
        res.json({
          ok: true,
          message: 'Salvo automaticamente.',
          total_conferido: brMoneyFromDecimal(updated.total_conferido),
          total_sistema: brMoneyFromDecimal(updated.abertura_sistema),
          faturamento_registrado_em: updated.faturamento_registrado_em ? formatPgTimestamp(updated.faturamento_registrado_em, true) : '',
          sobra_falta: brMoneyFromDecimal(updated.sobra_falta),
          sobra_falta_raw: Number(updated.sobra_falta || 0),
          sobra_falta_class: diffClass(moneyTextToCents(updated.sobra_falta)),
          status: statusLabel(String(updated.status || 'aberto')),
        });
        return;
      }
      if (action === 'close_day') {
        const limit = await divergenceLimitCents();
        const status = Math.abs(moneyTextToCents(updated.sobra_falta)) > limit ? 'divergente' : 'fechado';
        await closeClosing(Number(closing.id), status, req);
        setFlash(req, 'success', status === 'divergente' ? 'Dia fechado como divergente.' : 'Dia fechado com sucesso.');
      } else {
        setFlash(req, 'success', 'Fechamento salvo como rascunho.');
      }
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'close_empty') {
      await closeEmptyDay(date, req, cleanText(body.observacao_sem_movimento, 4000) || 'Sem movimento.');
      setFlash(req, 'success', 'Dia marcado sem movimento.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'add_lancamento') {
      await addEntry(date, String(body.categoria || ''), moneyTextToCents(body.valor), cleanText(body.observacao, 4000), user.id, req);
      setFlash(req, 'success', 'Lancamento adicionado.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'cancel_lancamento') {
      await cancelEntry(date, Number(body.id || 0), req);
      setFlash(req, 'success', 'Lancamento removido.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'save_sangria') {
      const responsible = cleanText(body.autorizado_por || body.responsavel_texto || '', 120);
      const observation = cleanText([body.motivo || 'Sangria', body.destino, body.observacao, responsible ? `Responsavel informado: ${responsible}.` : ''].filter(Boolean).join(' - '), 300);
      await addEntry(date, 'Sangria', moneyTextToCents(body.valor), observation, user.id, req);
      setFlash(req, 'success', 'Sangria adicionada ao dia.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'save_maquininha') {
      const kind = String(body.tipo || '') === 'pix_maquininha' ? 'Maquininha Pix' : 'Maquininha C/D';
      const observation = cleanText([body.operadora, body.bandeira, body.nsu, body.codigo_comprovante, body.observacao].filter(Boolean).join(' - '), 300);
      await addEntry(date, kind, moneyTextToCents(body.valor_bruto), observation, user.id, req);
      setFlash(req, 'success', 'Lancamento de maquininha adicionado.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (action === 'save_pix') {
      const kind = String(body.tipo || '') === 'maquininha' ? 'Maquininha Pix' : 'Pix CNPJ';
      const observation = cleanText([body.origem, body.observacao].filter(Boolean).join(' - '), 300);
      await addEntry(date, kind, moneyTextToCents(body.valor), observation, user.id, req);
      setFlash(req, 'success', 'PIX adicionado ao dia.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    if (['cancel_sangria', 'cancel_maquininha', 'cancel_pix'].includes(action)) {
      throw new Error('Esse lancamento legado deve ser removido pela lista de lancamentos do dia.');
    }

    if (action === 'reopen_day') {
      if (!isAdmin(user)) throw new Error('Apenas admin pode reabrir um dia fechado.');
      if (String(body.senha_reabertura || '') !== REOPEN_PASSWORD) throw new Error('Senha de reabertura incorreta.');
      await reopenClosing(date, req);
      setFlash(req, 'success', 'Dia reaberto para ajustes.');
      postRedirect(res, postYear, postMonth, date, 'dia');
      return;
    }

    throw new Error('Acao financeira invalida.');
  } catch (error) {
    const message = publicError(error);
    if (wantsJson(req)) {
      res.status(422).json({ ok: false, message });
      return;
    }
    setFlash(req, 'error', message);
    postRedirect(res, postYear, postMonth, date, 'dia');
  }
}));

app.get([`${BASE_PATH}/login`, `${BASE_PATH}/login.php`], asyncRoute(async (req, res) => {
  if (await currentUser(req.session.user)) {
    res.redirect(loginRedirectTarget(req));
    return;
  }
  res.type('html').send(renderLogin(req));
}));

app.post(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  if (!csrfMatches(req)) {
    res.status(422).type('html').send(renderLogin(req, 'Sessao expirada. Atualize a pagina e tente novamente.'));
    return;
  }
  const waitSeconds = loginWaitSeconds(req);
  if (waitSeconds > 0) {
    res.status(429).type('html').send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`));
    return;
  }
  const username = cleanText(req.body?.username, 120);
  const password = String(req.body?.password || '');
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    await auditEvent('login_financeiro_falha', 'user', null, null, { username }, req, null);
    res.status(401).type('html').send(renderLogin(req, 'Usuario ou senha incorretos.'));
    return;
  }
  clearLoginRateLimit(req);
  const returnTo = loginRedirectTarget(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[financeiro] session regenerate failed', error);
      res.status(500).type('html').send(renderLogin(req, 'Nao foi possivel acessar o financeiro agora.'));
      return;
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void auditEvent('login_financeiro', 'user', user.id, null, { username: user.username }, req, user.id);
    res.redirect(returnTo);
  });
}));

app.get([`${BASE_PATH}/logout`, `${BASE_PATH}/logout.php`], (req, res) => {
  const user = req.session.user;
  if (user) void auditEvent('logout_financeiro', 'user', user.id, null, { username: user.username }, req, user.id);
  req.session.destroy(() => res.redirect('/'));
});

function csvSafe(value: unknown): string {
  const text = String(value ?? '');
  return text !== '' && /^[=\-+@]/.test(text.trimStart()) ? `'${text}` : text;
}

function csvLine(values: unknown[]): string {
  return values
    .map((value) => `"${csvSafe(value).replaceAll('"', '""')}"`)
    .join(';');
}

function exportRow(closing: AnyRow, fallbackDate: string): unknown[] {
  return [
    brDate(closing.data_fechamento || fallbackDate),
    closing.status ? statusLabel(String(closing.status)) : 'Sem fechamento',
    moneyInput(closing.caixa_fisico),
    moneyInput(closing.cartao_total),
    moneyInput(closing.pix_banco_total),
    moneyInput(closing.pix_maquininha_total),
    moneyInput(closing.sangria_total),
    moneyInput(closing.retirada_caixa),
    moneyInput(closing.abertura_sistema),
    moneyInput(closing.faturamento_dia),
    closing.faturamento_registrado_em ? formatPgTimestamp(closing.faturamento_registrado_em) : '',
    moneyInput(closing.ajustes),
    moneyInput(closing.total_conferido),
    moneyInput(closing.sobra_falta),
    closing.justificativa || '',
    closing.responsavel_nome || closing.responsavel_texto || '',
    closing.fechado_em ? formatPgTimestamp(closing.fechado_em) : '',
  ];
}

app.get(`${BASE_PATH}/exportar.php`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const type = String(req.query.tipo || 'mensal');
  const month = Math.max(1, Math.min(12, Number(req.query.mes || new Date().getMonth() + 1)));
  const year = Math.max(2020, Math.min(2100, Number(req.query.ano || new Date().getFullYear())));
  const date = validFinanceDate(req.query.data, todayDate());
  const headers = [
    'Data',
    'Status',
    'Caixa fisico',
    'Cartao C/D',
    'PIX banco',
    'PIX maquininha',
    'Sangria',
    'Retirada caixa',
    'Total Sistema',
    'Faturamento do dia',
    'Faturamento registrado em',
    'Ajustes',
    'Total conferido',
    'Sobra/Falta',
    'Justificativa',
    'Responsavel',
    'Fechado em',
  ];
  let filename = `financeiro-${year}-${String(month).padStart(2, '0')}.csv`;
  let rows: unknown[][] = [];
  if (type === 'dia') {
    const closing = (await fetchClosingByDate(date)) || defaultClosing(date);
    rows = [exportRow(closing, date)];
    filename = `financeiro-fechamento-${date}.csv`;
    await auditEvent('exportar_dia_csv', 'financeiro_fechamentos', closing.id ? Number(closing.id) : null, null, { data: date }, req);
  } else {
    const closings = await monthClosings(month, year);
    rows = monthDays(month, year).map((day) => exportRow(closings[day] || defaultClosing(day), day));
    await auditEvent('exportar_mes_csv', 'financeiro_fechamentos', null, null, { mes: month, ano: year }, req);
  }
  const csv = ['\uFEFF' + csvLine(headers), ...rows.map(csvLine)].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

async function internalSummaryPayload(monthParam?: unknown): Promise<Record<string, unknown>> {
  const today = todayDate();
  const month = String(monthParam || today.slice(0, 7)).match(/^\d{4}-\d{2}$/) ? String(monthParam || today.slice(0, 7)) : today.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const closings = await monthClosings(monthNumber, year);
  const totals = reportMonthTotals(closings, monthDays(monthNumber, year));
  const categoriesResult = await pgPool.query<AnyRow>(
    `SELECT category,
            COUNT(*)::int AS quantity,
            COALESCE(SUM(amount_cents), 0)::bigint AS amount_cents
       FROM financeiro_entries
      WHERE status <> 'cancelado'
        AND entry_date >= $1
        AND entry_date < ($1::date + interval '1 month')
      GROUP BY category
      ORDER BY amount_cents DESC, category ASC
      LIMIT 10`,
    [`${month}-01`],
  );
  return {
    ok: true,
    source: 'postgres',
    month,
    summary: {
      registered_days: Number(totals.dias_registrados || 0),
      closed_days: Number(totals.fechados || 0),
      divergences: Number(totals.divergentes || 0),
      total_checked_cents: moneyTextToCents(totals.total_lancado),
      total_checked: brMoneyFromDecimal(totals.total_lancado),
      system_total_cents: moneyTextToCents(totals.total_sistema),
      system_total: brMoneyFromDecimal(totals.total_sistema),
      daily_revenue_cents: moneyTextToCents(totals.faturamento_dia),
      daily_revenue: brMoneyFromDecimal(totals.faturamento_dia),
      difference_cents: moneyTextToCents(totals.sobra_falta),
      difference: brMoneyFromDecimal(totals.sobra_falta),
    },
    categories: categoriesResult.rows.map((row) => ({
      category: String(row.category || ''),
      quantity: Number(row.quantity || 0),
      amount_cents: Number(row.amount_cents || 0),
      amount: brMoneyFromCents(Number(row.amount_cents || 0)),
    })),
  };
}

async function dayPayload(date: string): Promise<Record<string, unknown>> {
  const closing = (await fetchClosingByDate(date)) || defaultClosing(date);
  return {
    ok: true,
    source: 'postgres',
    date,
    closing,
    entries: closing.id ? await fetchEntries(Number(closing.id)) : [],
  };
}

async function cashClosingStatusPayload(dateValue?: unknown): Promise<Record<string, unknown>> {
  const date = validFinanceDate(dateValue, todayDate());
  const savedClosing = await fetchClosingByDate(date);
  const closing = savedClosing || defaultClosing(date);
  const status = String(closing.status || 'aberto');
  const closed = isFinishedClosingStatus(status);
  return {
    ok: true,
    source: 'postgres',
    date,
    closing_exists: Boolean(savedClosing?.id),
    status,
    status_label: statusLabel(status),
    closed,
    should_notify: !closed,
    closed_at: closing.fechado_em || null,
    responsible: cleanText(closing.responsavel_nome || closing.responsavel_texto, 160),
    total_checked_cents: moneyTextToCents(closing.total_conferido),
    total_checked: brMoneyFromDecimal(closing.total_conferido),
    system_total_cents: moneyTextToCents(closing.abertura_sistema),
    system_total: brMoneyFromDecimal(closing.abertura_sistema),
    difference_cents: moneyTextToCents(closing.sobra_falta),
    difference: brMoneyFromDecimal(closing.sobra_falta),
  };
}

async function recentAuditPayload(limitValue: unknown): Promise<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(80, Number(limitValue || 20)));
  const result = await pgPool.query<AnyRow>(
    `SELECT id::text, user_legacy_id, action, entity_table, entity_legacy_id, ip, created_at
       FROM financeiro_audit_events
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [limit],
  );
  return {
    ok: true,
    source: 'postgres',
    audit: result.rows.map((row) => ({
      id: String(row.id),
      user_id: row.user_legacy_id,
      action: row.action,
      entity_table: row.entity_table,
      entity_id: row.entity_legacy_id,
      created_at: row.created_at,
    })),
  };
}

async function detailedChecksumPayload(fromValue?: unknown, toValue?: unknown): Promise<Record<string, unknown>> {
  const from = validFinanceDate(fromValue, `${new Date().getFullYear()}-01-01`);
  const to = validFinanceDate(toValue, todayDate());
  const postgresByDay = await pgPool.query<AnyRow>(
    `SELECT closing_date::text AS date,
            COUNT(*)::int AS closings,
            COALESCE(SUM(total_checked_cents), 0)::bigint AS total_checked_cents,
            COALESCE(SUM(system_opening_cents), 0)::bigint AS system_total_cents,
            COALESCE(SUM(daily_revenue_cents), 0)::bigint AS daily_revenue_cents,
            COALESCE(SUM(difference_cents), 0)::bigint AS difference_cents
       FROM financeiro_closings
      WHERE closing_date BETWEEN $1 AND $2
      GROUP BY closing_date
      ORDER BY closing_date`,
    [from, to],
  );
  const postgresByType = await pgPool.query<AnyRow>(
    `SELECT category AS type,
            COUNT(*)::int AS entries,
            COALESCE(SUM(amount_cents), 0)::bigint AS amount_cents
       FROM financeiro_entries
      WHERE entry_date BETWEEN $1 AND $2
        AND status <> 'cancelado'
      GROUP BY category
      ORDER BY category`,
    [from, to],
  );
  let legacy: Record<string, unknown> | null = null;
  if (LEGACY_MYSQL_REQUIRED) {
    try {
      const [dayRows] = await legacyDb().query<RowDataPacket[]>(
        `SELECT data_fechamento AS date,
                COUNT(*) AS closings,
                COALESCE(SUM(total_conferido), 0) AS total_checked,
                COALESCE(SUM(abertura_sistema), 0) AS system_total,
                COALESCE(SUM(faturamento_dia), 0) AS daily_revenue,
                COALESCE(SUM(sobra_falta), 0) AS difference_total
           FROM financeiro_fechamentos
          WHERE data_fechamento BETWEEN ? AND ?
          GROUP BY data_fechamento
          ORDER BY data_fechamento`,
        [from, to],
      );
      const [typeRows] = await legacyDb().query<RowDataPacket[]>(
        `SELECT categoria AS type,
                COUNT(*) AS entries,
                COALESCE(SUM(valor), 0) AS amount
           FROM financeiro_lancamentos
          WHERE data BETWEEN ? AND ?
            AND status <> 'cancelado'
          GROUP BY categoria
          ORDER BY categoria`,
        [from, to],
      );
      legacy = {
        by_day: (dayRows as AnyRow[]).map((row) => ({
          date: isoDate(row.date),
          closings: Number(row.closings || 0),
          total_checked_cents: moneyTextToCents(row.total_checked),
          system_total_cents: moneyTextToCents(row.system_total),
          daily_revenue_cents: moneyTextToCents(row.daily_revenue),
          difference_cents: moneyTextToCents(row.difference_total),
        })),
        by_type: (typeRows as AnyRow[]).map((row) => ({
          type: String(row.type || ''),
          entries: Number(row.entries || 0),
          amount_cents: moneyTextToCents(row.amount),
        })),
      };
    } catch (error) {
      legacy = { error: publicError(error) };
    }
  }
  return {
    ok: true,
    source: 'postgres',
    from,
    to,
    postgres: {
      by_day: postgresByDay.rows,
      by_type: postgresByType.rows,
    },
    legacy,
  };
}

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  res.json(await healthPayload());
}));

app.get(`${BASE_PATH}/internal/migration-status`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await healthPayload());
}));

app.get(`${BASE_PATH}/internal/summary`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await internalSummaryPayload(req.query.mes || req.query.month));
}));

app.get(`${BASE_PATH}/internal/checksums`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json({ ...(await checksumPayload()), detail: await detailedChecksumPayload(req.query.from, req.query.to) });
}));

app.get(`${BASE_PATH}/api/internal/summary`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await internalSummaryPayload(req.query.mes || req.query.month));
}));

app.get(`${BASE_PATH}/api/internal/day`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await dayPayload(validFinanceDate(req.query.data || req.query.date, todayDate())));
}));

app.get(`${BASE_PATH}/internal/cash-closing-status`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await cashClosingStatusPayload(req.query.data || req.query.date));
}));

app.get(`${BASE_PATH}/api/internal/cash-closing-status`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await cashClosingStatusPayload(req.query.data || req.query.date));
}));

app.get(`${BASE_PATH}/api/internal/checksums`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await detailedChecksumPayload(req.query.from, req.query.to));
}));

app.get(`${BASE_PATH}/api/internal/audit/recent`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  res.json(await recentAuditPayload(req.query.limit));
}));

app.post(`${BASE_PATH}/api/internal/lancamentos`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  const payload = req.body as AnyRow;
  const key = cleanText(payload.idempotency_key || payload.idempotencyKey, 160);
  if (key) {
    const existing = await pgPool.query<{ result: unknown }>('SELECT result FROM financeiro_internal_idempotency WHERE idempotency_key = $1 LIMIT 1', [key]);
    if (existing.rows[0]) {
      res.json({ ...(existing.rows[0].result as Record<string, unknown>), idempotent: true });
      return;
    }
  }
  const category = cleanText(payload.categoria || payload.category, 120);
  const date = validFinanceDate(payload.data || payload.date, todayDate());
  const amountCents = payload.amount_cents !== undefined ? Number(payload.amount_cents || 0) : moneyTextToCents(payload.valor || payload.amount);
  const responsible = cleanText(payload.responsavel || payload.responsible, 120);
  if (responsible === '') throw new Error('Informe quem fez ou quem e o responsavel antes de gravar no financeiro.');
  let observation = cleanText(payload.observacao || payload.observation, 300);
  if (observation === '') observation = `Miauby criou a categoria ${category} por comando interno.`;
  if (!observation.toLowerCase().includes('responsavel informado')) {
    observation = cleanText(`${observation} Responsavel informado: ${responsible}.`, 300);
  }
  const actorUserId = intOrNull(payload.actor_user_id || payload.actorUserId) || null;
  const entry = await addEntry(date, category, amountCents, observation, actorUserId, undefined);
  const entryClosing = (entry.closing || {}) as AnyRow;
  const response = {
    ok: true,
    source: 'postgres',
    id: Number(entry.id),
    data: date,
    categoria: category,
    valor: centsToDecimal(amountCents),
    valor_cents: amountCents,
    responsavel: responsible,
    observacao: observation,
    total_conferido: entryClosing.total_conferido ?? 0,
    sobra_falta: entryClosing.sobra_falta ?? 0,
  };
  if (key) {
    await pgPool.query(
      `INSERT INTO financeiro_internal_idempotency (idempotency_key, action, result)
       VALUES ($1, 'lancamento', $2::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [key, JSON.stringify(response)],
    );
  }
  res.json(response);
}));

app.post(`${BASE_PATH}/api/internal/faturamentos`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;
  const payload = req.body as AnyRow;
  const entries = Array.isArray(payload.entries)
    ? payload.entries
    : [{ data: payload.data || payload.date, valor: payload.valor || payload.amount, amount_cents: payload.amount_cents }];
  const actorUserId = intOrNull(payload.actor_user_id || payload.actorUserId) || null;
  const saved: AnyRow[] = [];
  for (const entry of entries as AnyRow[]) {
    const date = validFinanceDate(entry.data || entry.date, '');
    if (!date) continue;
    const amountCents = entry.amount_cents !== undefined ? Number(entry.amount_cents || 0) : moneyTextToCents(entry.valor || entry.amount);
    saved.push(await saveDailyRevenue(date, amountCents, actorUserId, 'miauby_internal'));
  }
  if (!saved.length) throw new Error('Nenhum faturamento diario valido para salvar.');
  res.json({ ok: true, source: 'postgres', salvos: saved });
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
  if (AUTH_PROVIDER === 'core' && corePgPool) {
    await corePgPool.query('SELECT COUNT(*) FROM core_users');
  }
  if (LEGACY_IMPORT_ENABLED) {
    await runLegacyImport();
  }
  app.listen(PORT, () => {
    console.log(`[financeiro] official service listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[financeiro] startup failed', error);
  process.exit(1);
});
