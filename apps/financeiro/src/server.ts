import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import pg, { type PoolClient } from 'pg';

const { Pool } = pg;

type AnyRow = Record<string, unknown>;
type Flash = { type: '' | 'success' | 'error' | 'warning'; message: string };
type User = { id: number; username: string; role: string };
type CoreUserRow = { id: string; username: string; password_hash?: string | null; role?: string | null; active?: boolean };

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
const SERVICE_VERSION = '1.1.3';
const OPEN_CASH_CLOSING_LOOKBACK_DAYS = 10;
const FINANCEIRO_FISCAL_YEARS = [2026, 2027, 2028];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_ASSET_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webp|woff2?)$/i;

const AUTH_PROVIDER = 'core';
const SESSION_SECRET = env.FINANCEIRO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const REOPEN_PASSWORD = env.FINANCEIRO_REOPEN_PASSWORD || 'wimifarma';
const INTERNAL_TOKENS = [
  env.FINANCEIRO_INTERNAL_TOKEN,
  env.MIAUW_GUARDIAN_TOKEN,
  env.MIAUW_WHATSAPP_INTERNAL_TOKEN,
  env.MIAUW_AGENT_INTERNAL_TOKEN,
].map((value) => String(value || '').trim()).filter(Boolean);
const CORE_AUDIT_ACTIONS = new Set([
  'criar_fechamento',
  'alterar_fechamento',
  'fechar_fechamento',
  'reabrir_fechamento',
  'salvar_faturamento_diario',
  'criar_lancamento',
  'cancelar_lancamento',
]);

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_financeiro',
  user: env.POSTGRES_USER || 'wimifarma_financeiro',
  password: env.POSTGRES_PASSWORD || 'wimifarma_financeiro_dev_pass',
  max: 8,
});

const corePgPool = new Pool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 4,
});

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

function bodyText(value: unknown, preferLast = false): string {
  if (!Array.isArray(value)) return String(value ?? '');
  const values = value.map((item) => cleanText(item, 500)).filter(Boolean);
  return values.length === 0 ? '' : String(preferLast ? values[values.length - 1] : values[0]);
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

function userPublic(row: CoreUserRow): User {
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

function auditObject(value: unknown): AnyRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRow : {};
}

function auditValueLabel(row: AnyRow): string {
  const direct = row.valor ?? row.amount ?? row.faturamento_dia;
  if (direct !== undefined && direct !== null && direct !== '') return brMoneyFromDecimal(direct);
  const cents = Number(row.valor_cents ?? row.amount_cents ?? 0);
  return Number.isFinite(cents) && cents > 0 ? brMoneyFromCents(cents) : '';
}

function financeCoreAuditSummary(action: string, entityTable: string, after: unknown): string {
  const row = auditObject(after);
  const date = isoDate(row.data_fechamento ?? row.data ?? row.entry_date ?? row.closing_date);
  const dateLabel = date ? ` em ${brDate(date)}` : '';
  const category = cleanText(row.categoria ?? row.category, 120);
  const valueLabel = auditValueLabel(row);

  if (action === 'criar_lancamento') {
    return `Financeiro: lancamento${category ? ` ${category}` : ''}${valueLabel ? ` de ${valueLabel}` : ''}${dateLabel}.`;
  }
  if (action === 'cancelar_lancamento') return `Financeiro: lancamento cancelado${dateLabel}.`;
  if (action === 'salvar_faturamento_diario') return `Financeiro: faturamento diario${valueLabel ? ` de ${valueLabel}` : ''}${dateLabel} salvo.`;
  if (action === 'fechar_fechamento') return `Financeiro: fechamento${dateLabel} finalizado.`;
  if (action === 'reabrir_fechamento') return `Financeiro: fechamento${dateLabel} reaberto.`;
  if (action === 'alterar_fechamento') return `Financeiro: fechamento${dateLabel} salvo/alterado.`;
  if (action === 'criar_fechamento') return `Financeiro: fechamento${dateLabel} criado.`;
  return `Financeiro: ${action} em ${entityTable}.`;
}

async function mirrorCoreAudit(
  action: string,
  entityTable: string,
  recordId: number | null,
  after: unknown,
  req?: Request,
  userId?: number | null,
): Promise<void> {
  if (!CORE_AUDIT_ACTIONS.has(action)) return;
  const actorUserId = userId ?? req?.session.user?.id ?? null;
  await corePgPool.query(
    `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorUserId,
      `financeiro_${action}`,
      entityTable,
      recordId === null ? null : String(recordId),
      financeCoreAuditSummary(action, entityTable, after),
      JSON.stringify({
        service: 'financeiro',
        module: 'financeiro',
        source: req ? 'web' : 'internal',
        action,
      }),
    ],
  );
}

async function canAccessFinanceiro(user: User): Promise<boolean> {
  if (normalizeUsername(user.username) === 'adm') return true;
  const result = await corePgPool.query<{ can_access: boolean }>(
    `SELECT can_access
       FROM core_user_module_permissions
      WHERE user_id = $1 AND module_key = 'financeiro'
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  return row ? row.can_access !== false : true;
}

async function coreUserById(userId: number | null): Promise<User | null> {
  if (!userId || userId <= 0) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, role, active
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? userPublic(row) : null;
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

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      FINANCEIRO_FISCAL_YEARS.includes(year) &&
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() + 1 === month &&
      candidate.getUTCDate() === day
    ) {
      return text;
    }
    return fallback;
  }
  const br = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const month = Number(br[2]);
    const day = Number(br[1]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      FINANCEIRO_FISCAL_YEARS.includes(year) &&
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() + 1 === month &&
      candidate.getUTCDate() === day
    ) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return fallback;
}

function fiscalYears(): number[] {
  return [...FINANCEIRO_FISCAL_YEARS];
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
  if (INTERNAL_TOKENS.length === 0) {
    res.status(503).json({ ok: false, message: 'financeiro_internal_token_not_configured' });
    return false;
  }
  const provided = String(req.header('x-miauw-internal-token') || req.header('x-financeiro-internal-token') || '');
  if (!provided || !INTERNAL_TOKENS.some((token) => timingSafeStringEqual(provided, token))) {
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

  return {
    ok: true,
    postgres: postgres.rows[0],
    legacy: null,
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
  return authenticateCore(username, password);
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
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

async function currentUser(user: User | undefined): Promise<User | null> {
  if (!user) return null;
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

function hasHomeSsoCookie(req: Request): boolean {
  return /(?:^|;\s*)WFHOME_SSO=/.test(String(req.get('cookie') || ''));
}

async function homeSsoUsername(req: Request): Promise<string | null> {
  const cookie = String(req.get('cookie') || '');
  if (!HOME_SSO_INTERNAL_URL || !hasHomeSsoCookie(req)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOME_SSO_TIMEOUT_MS);
  try {
    const response = await fetch(HOME_SSO_INTERNAL_URL, { headers: { cookie }, signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; username?: unknown };
    const username = normalizeUsername(data.username);
    return data.ok && username ? username : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function userByHomeSso(req: Request): Promise<User | null> {
  const username = await homeSsoUsername(req);
  if (!username) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [username],
  );
  const row = result.rows[0];
  return row ? userPublic(row) : null;
}

function regenerateWithUser(req: Request, user: User): Promise<void> {
  const returnTo = req.session.returnTo;
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
      if (returnTo) req.session.returnTo = returnTo;
      resolve();
    });
  });
}

async function requireUser(req: Request, res: Response): Promise<User | null> {
  let user = await currentUser(req.session.user);
  const homeUser = await userByHomeSso(req);
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  } else if (!user && homeUser) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (!user) {
    if (wantsJson(req)) {
      res.status(401).json({ ok: false, message: 'Sessao expirada. Entre novamente no financeiro e tente de novo.' });
      return null;
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/');
    return null;
  }
  if (!(await canAccessFinanceiro(user))) {
    if (wantsJson(req)) {
      res.status(403).json({ ok: false, message: 'Seu usuario nao tem permissao para acessar o Financeiro.' });
      return null;
    }
    await auditEvent('acesso_financeiro_negado', 'user', user.id, null, { username: user.username }, req, user.id);
    req.session.returnTo = undefined;
    res.redirect('/');
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
  const received = bodyText(req.body?.csrf_token || req.get('x-csrf-token') || '');
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
  } catch (error) {
    console.warn('[financeiro] audit failed', error);
  }
  try {
    await mirrorCoreAudit(action, entityTable, recordId, after, req, userId);
  } catch (error) {
    console.warn('[financeiro] core audit mirror failed', error);
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
  return updated;
}

function closingDataFromBody(body: AnyRow, user?: User): AnyRow {
  const userResponsible = cleanText(user?.username, 160);
  const responsibleText = cleanText(body.responsavel_texto, 160) || userResponsible;
  const responsibleUserId = userResponsible && normalizeUsername(responsibleText) === normalizeUsername(userResponsible) ? user?.id || null : null;
  return {
    responsavel_id: intOrNull(body.responsavel_id) || responsibleUserId,
    responsavel_texto: responsibleText,
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

type EntryCategorySummary = {
  category: string;
  count: number;
  amountCents: number;
  className: string;
};

function normalizeEntryCategory(value: unknown): string {
  return cleanText(value, 80) || 'Outros';
}

function entryCategoryKey(value: unknown): string {
  return normalizeEntryCategory(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'outros';
}

function entryCategoryClass(category: unknown): string {
  const key = entryCategoryKey(category);
  if (key.includes('pix-cnpj')) return 'entry-kind-pix-cnpj';
  if (key.includes('sangria')) return 'entry-kind-sangria';
  if (key.includes('maquininha-c-d')) return 'entry-kind-card';
  if (key.includes('maquininha-pix')) return 'entry-kind-machine-pix';
  if (key.includes('dinheiro')) return 'entry-kind-cash';
  return 'entry-kind-other';
}

function pluralPt(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeEntryCategories(entries: AnyRow[]): EntryCategorySummary[] {
  const order = new Map(categories().map((category, index) => [entryCategoryKey(category), index]));
  const grouped = new Map<string, EntryCategorySummary>();

  for (const entry of entries) {
    const category = normalizeEntryCategory(entry.categoria);
    const key = entryCategoryKey(category);
    const current = grouped.get(key) || {
      category,
      count: 0,
      amountCents: 0,
      className: entryCategoryClass(category),
    };
    current.count += 1;
    current.amountCents += moneyTextToCents(entry.valor);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .sort(([leftKey, left], [rightKey, right]) => {
      const leftOrder = order.get(leftKey) ?? 999;
      const rightOrder = order.get(rightKey) ?? 999;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.category.localeCompare(right.category, 'pt-BR');
    })
    .map(([, value]) => value);
}

function renderEntryCategorySummary(entries: AnyRow[]): string {
  const summaries = summarizeEntryCategories(entries);
  if (summaries.length === 0) return '';
  const totalCount = summaries.reduce((sum, item) => sum + item.count, 0);
  const totalCents = summaries.reduce((sum, item) => sum + item.amountCents, 0);

  return `<div class="finance-category-summary" aria-label="Resumo por categoria">
    <div class="finance-category-summary-head">
      <div><span class="kicker">Categorias do dia</span><h3>${pluralPt(totalCount, 'lancamento', 'lancamentos')}</h3></div>
      <div class="finance-category-total">${brMoneyFromCents(totalCents)}</div>
    </div>
    <div class="finance-category-chips">${summaries
      .map(
        (item) => `<div class="finance-category-chip ${e(item.className)}">
          <span>${e(item.category)}</span>
          <strong>${brMoneyFromCents(item.amountCents)}</strong>
          <small>${pluralPt(item.count, 'item', 'itens')}</small>
        </div>`,
      )
      .join('')}</div>
  </div>`;
}

function closingMovementCents(closing: AnyRow): number {
  const values: unknown[] = [
    closing.caixa_fisico,
    closing.cartao_total,
    closing.pix_banco_total,
    closing.pix_maquininha_total,
    closing.pix_correto_total,
    closing.pix_correto_manual,
    closing.sangria_total,
    closing.retirada_caixa,
    closing.abertura_sistema,
    closing.faturamento_dia,
    closing.ajustes,
    closing.total_conferido,
    closing.sobra_falta,
  ];
  return values.reduce<number>((sum, value) => sum + Math.abs(moneyTextToCents(value)), 0);
}

async function closeEmptyDay(date: string, req: Request, observation = 'Sem movimento.'): Promise<AnyRow> {
  const closing = await getOrCreateClosing(date, req);
  if (isLocked(closing)) throw new Error('Este dia ja esta fechado.');
  const sums = await entrySums(Number(closing.id));
  if (Number(sums.qtd || 0) > 0 || closingMovementCents(closing) > 0) {
    throw new Error('Este dia ja tem movimento registrado. Remova os lancamentos ou zere os valores antes de marcar sem movimento.');
  }
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
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260605-categorias">
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
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260605-categorias">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260610-miauby-video">
  <script src="${BASE_PATH}/app.js?v=20260529-node" defer></script>
  <script src="/miauw/widget.js?v=20260610-miauby-video" defer></script>
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
    <a href="/">Home</a>
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
  const activeEntries = entries.filter((entry) => entry.status !== 'cancelado');
  const categorySummaryHtml = renderEntryCategorySummary(activeEntries);
  const entriesHtml = activeEntries
    .map(
      (entry) => {
        const category = normalizeEntryCategory(entry.categoria);
        const entryTime = formatPgTimestamp(entry.created_at, true) || '-';
        const observation = cleanText(entry.observacao, 4000);
        return `<article class="entry-row ${e(entryCategoryClass(category))}">
        <div class="entry-content">
          <div class="entry-card-head">
            <span class="entry-category">${e(category)}</span>
            <strong class="entry-value">${brMoneyFromDecimal(entry.valor)}</strong>
          </div>
          <dl class="entry-meta">
            <div><dt>Horario</dt><dd>${e(entryTime)}</dd></div>
            <div class="entry-note"><dt>Obs</dt><dd>${observation ? e(observation) : 'Sem observacao'}</dd></div>
          </dl>
        </div>
        ${
          locked
            ? ''
            : `<form method="post">${csrfField(req)}<input type="hidden" name="action" value="cancel_lancamento"><input type="hidden" name="data_fechamento" value="${e(date)}"><input type="hidden" name="id" value="${e(entry.id)}"><button class="link-danger" type="submit">Remover</button></form>`
        }
      </article>`;
      },
    )
    .join('');
  const categoryOptions = categories().map((category) => `<option value="${e(category)}">${e(category)}</option>`).join('');
  const badgeText = `${brDate(date)} - ${statusLabel(String(selectedClosing.status || 'aberto'))}${selectedClosing.fechado_em ? ` - Fechado ${formatPgTimestamp(selectedClosing.fechado_em, true)}` : ''}`;
  const responsibleText = selectedClosing.responsavel_nome || selectedClosing.responsavel_texto || req.session.user?.username || '';
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
        <label>Responsavel <input name="responsavel_texto" value="${e(responsibleText)}" placeholder="Ex.: Isadora" ${locked ? 'disabled' : ''}></label>
        <label>Total Sistema <input name="total_sistema" value="${e(moneyInput(selectedClosing.abertura_sistema))}" inputmode="decimal" placeholder="0,00" ${locked ? 'disabled' : ''}></label>
      </div>
    </form>
    <section class="launch-panel">
      ${
        locked
          ? ''
          : `<form class="entry-add-form" method="post" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="add_lancamento"><input type="hidden" name="data_fechamento" value="${e(date)}"><div class="form-grid entry-grid"><label>Categoria <select name="categoria">${categoryOptions}</select></label><label>Valor <input name="valor" inputmode="decimal" placeholder="0,00" required></label><label>Obs: <input name="observacao" placeholder="Opcional"></label><button class="btn secondary" type="submit">Adicionar</button></div></form>`
      }
      ${categorySummaryHtml}
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
  return {
    ok: true,
    service: 'financeiro',
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    mode: 'official',
    route_cutover_enabled: true,
    auth: {
      provider: AUTH_PROVIDER,
      core_required: true,
      internal_token_configured: INTERNAL_TOKENS.length > 0,
    },
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_financeiro',
      legacy_mysql_required: false,
      legacy_mysql_import_enabled: false,
      legacy_mysql_mirror_enabled: false,
      migration: null,
      postgres,
      legacy: null,
      legacy_error: null,
      postgres_latency_ms: Date.now() - pgStart,
    },
    next_cutover: {
      frontend_assets_preserved: true,
      rollback: 'rollback MySQL exige restaurar versao anterior/imagem anterior e backup validado',
      required_before_disabling_mysql_mirror: [],
      mysql_mirror_disabled_by_default: true,
    },
  };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function setStaticAssetCacheHeaders(res: Response, filePath: string): void {
  if (!STATIC_ASSET_FILE_RE.test(filePath)) return;
  res.removeHeader('Pragma');
  res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
  res.setHeader('Expires', new Date(Date.now() + STATIC_ASSET_MAX_AGE_MS).toUTCString());
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
app.set('trust proxy', true);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'self'; form-action 'self';",
  );
  if (req.secure || String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith(BASE_PATH)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: true, limit: '128kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, { index: false, dotfiles: 'ignore', setHeaders: setStaticAssetCacheHeaders }));

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
  const action = bodyText(body.action, true);
  const date = validFinanceDate(bodyText(body.data_fechamento), selectedContext(req).date);
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
      const updated = await updateManualClosing(Number(closing.id), closingDataFromBody(body, user), req);
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
  let user = await currentUser(req.session.user);
  if (!user) {
    user = await userByHomeSso(req);
    if (user) await regenerateWithUser(req, user);
  }
  if (user) {
    if (!(await canAccessFinanceiro(user))) {
      await auditEvent('acesso_financeiro_negado', 'user', user.id, null, { username: user.username }, req, user.id);
      res.redirect('/');
      return;
    }
    res.redirect(loginRedirectTarget(req));
    return;
  }
  res.redirect('/');
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
  if (!(await canAccessFinanceiro(user))) {
    await auditEvent('login_financeiro_sem_permissao', 'user', user.id, null, { username: user.username }, req, user.id);
    res.status(403).type('html').send(renderLogin(req, 'Seu usuario nao tem permissao para acessar o Financeiro.'));
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
  const openDays = await openCashClosingDays(date, status, Boolean(savedClosing?.id), !closed);
  return {
    ok: true,
    source: 'postgres',
    date,
    closing_exists: Boolean(savedClosing?.id),
    status,
    status_label: statusLabel(status),
    closed,
    should_notify: !closed || openDays.open_days_count > 0,
    open_days_lookback_days: OPEN_CASH_CLOSING_LOOKBACK_DAYS,
    open_days_start: openDays.open_days_start,
    open_days_end: openDays.open_days_end,
    open_days_count: openDays.open_days_count,
    open_days: openDays.open_days,
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

type OpenCashClosingDay = {
  date: string;
  status: string;
  status_label: string;
  closing_exists: boolean;
};

async function openCashClosingDays(
  selectedDate: string,
  selectedStatus: string,
  selectedExists: boolean,
  selectedOpen: boolean,
): Promise<{ open_days_count: number; open_days: OpenCashClosingDay[]; open_days_start: string; open_days_end: string }> {
  const windowStart = shiftIsoDate(selectedDate, -OPEN_CASH_CLOSING_LOOKBACK_DAYS);
  const windowEnd = selectedDate;
  const [daysResult, countResult] = await Promise.all([
    pgPool.query<AnyRow>(
      `SELECT closing_date::text AS date, status
         FROM financeiro_closings
        WHERE status IN ('aberto', 'conferencia')
          AND closing_date BETWEEN $1::date AND $2::date
        ORDER BY closing_date ASC
        LIMIT 10`,
      [windowStart, windowEnd],
    ),
    pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM financeiro_closings
        WHERE status IN ('aberto', 'conferencia')
          AND closing_date BETWEEN $1::date AND $2::date`,
      [windowStart, windowEnd],
    ),
  ]);

  const openDays = daysResult.rows
    .map((row) => {
      const date = isoDate(row.date);
      const status = String(row.status || 'aberto');
      if (!date) return null;
      return {
        date,
        status,
        status_label: statusLabel(status),
        closing_exists: true,
      };
    })
    .filter((row): row is OpenCashClosingDay => row !== null);

  if (selectedOpen && !openDays.some((day) => day.date === selectedDate)) {
    openDays.push({
      date: selectedDate,
      status: selectedStatus || 'aberto',
      status_label: statusLabel(selectedStatus || 'aberto'),
      closing_exists: selectedExists,
    });
  }

  openDays.sort((left, right) => left.date.localeCompare(right.date));
  const storedCount = Number(countResult.rows[0]?.count || 0);
  const implicitSelectedCount = selectedOpen && !selectedExists ? 1 : 0;

  return {
    open_days_count: storedCount + implicitSelectedCount,
    open_days: openDays,
    open_days_start: windowStart,
    open_days_end: windowEnd,
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
  return {
    ok: true,
    source: 'postgres',
    from,
    to,
    postgres: {
      by_day: postgresByDay.rows,
      by_type: postgresByType.rows,
    },
    legacy: null,
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
  if (actorUserId) {
    const actor = await coreUserById(actorUserId);
    if (!actor || !(await canAccessFinanceiro(actor))) {
      res.status(403).json({ ok: false, status: 'forbidden', error: 'actor_without_financeiro_permission' });
      return;
    }
  }
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
  res.json({
    ok: true,
    source: 'postgres',
    legacy_mysql_import_enabled: false,
    message: 'legacy_mysql_removed',
    health: await healthPayload(),
  });
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
  await corePgPool.query('SELECT COUNT(*) FROM core_users');
  app.listen(PORT, () => {
    console.log(`[financeiro] official service listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[financeiro] startup failed', error);
  process.exit(1);
});
