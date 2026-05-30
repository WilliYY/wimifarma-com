import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import pg from 'pg';

const { Pool } = pg;

type User = {
  id: number;
  username: string;
  role: string;
};

type Flash = {
  type: 'success' | 'error' | '';
  message: string;
};

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    user?: User;
    flash?: Flash;
    loginAttempts?: number[];
    loginBlockedUntil?: number;
    returnTo?: string;
  }
}

type CoreUserRow = {
  id: string;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: boolean;
};

type OrderStatus = 'pedido' | 'confirmado' | 'historico';

type OrderRow = {
  id: string;
  order_id: string | null;
  account_id: string;
  supplier_name: string;
  status: OrderStatus;
  expected_arrival_at: Date | string | null;
  confirmed_at: Date | string | null;
  confirmed_by: number | null;
  finished_at: Date | string | null;
  finished_by: number | null;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  account_title: string;
  account_status: 'pendente' | 'pago' | 'cancelado';
  total_cents: string;
  competence_month: string;
  due_at: Date | string | null;
  item_due_at: Date | string | null;
  generated_at: Date | string;
  paid_at: Date | string | null;
  paid_cents?: string;
  last_payment_at?: Date | string | null;
};

type ItemRow = {
  id: string;
  account_id: string;
  description: string;
  amount_cents: string;
  sort_order: number;
  due_at: Date | string | null;
  status: 'ativo' | 'cancelado';
  canceled_at: Date | string | null;
  paid_cents?: string;
  created_at: Date | string;
};

type PaymentRow = {
  id: string;
  account_id: string;
  item_id: string | null;
  item_description?: string | null;
  description: string;
  amount_cents: string;
  status: 'ativo' | 'cancelado';
  canceled_at: Date | string | null;
  paid_at: Date | string;
  created_by: number | null;
  created_at: Date | string;
};

type ArrivalInternalOrder = {
  id: string;
  account_id: string;
  supplier_name: string;
  expected_arrival_at: Date | string | null;
  account_status: 'pendente' | 'pago' | 'cancelado';
  total_cents: string;
  paid_cents: string;
  remaining_cents: string;
};

type RenderOrder = OrderRow & {
  items: ItemRow[];
  payments: PaymentRow[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const env = process.env;

const SERVICE_NAME = 'pedidos';
const SERVICE_VERSION = '1.0.1';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/pedidos');
const PORT = Number.parseInt(env.PORT || '3300', 10);
const SESSION_SECRET = env.PEDIDOS_SESSION_SECRET || env.GESTAO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TZ = 'America/Sao_Paulo';
const CORE_AUTH_TIMEOUT_MS = Math.max(
  500,
  Math.min(
    10000,
    Number.parseInt(env.PEDIDOS_CORE_AUTH_TIMEOUT_MS || '1500', 10) || 1500,
  ),
);
const INTERNAL_TOKEN = String(
  env.PEDIDOS_INTERNAL_TOKEN
    || env.MIAUW_GUARDIAN_TOKEN
    || env.MIAUW_AGENT_INTERNAL_TOKEN
    || env.MIAUW_WHATSAPP_INTERNAL_TOKEN
    || '',
).trim();

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_gestao',
  user: env.POSTGRES_USER || 'wimifarma_gestao',
  password: env.POSTGRES_PASSWORD || '',
  max: 12,
});

const corePgPool = new Pool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 4,
  connectionTimeoutMillis: CORE_AUTH_TIMEOUT_MS,
  statement_timeout: CORE_AUTH_TIMEOUT_MS,
  query_timeout: CORE_AUTH_TIMEOUT_MS,
});

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFPEDIDOS',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'pedidos_sessions',
    createTableIfMissing: false,
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

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean === '' ? '/pedidos' : clean;
}

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeLookupText(value: unknown): string {
  return cleanText(value, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function normalizeUsername(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function maskUsername(value: unknown): string {
  const username = normalizeUsername(value);
  if (!username) return '';
  if (username.length <= 2) return `${username[0] || '*'}*`;
  return `${username.slice(0, 2)}***${username.slice(-1)}`;
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function isAllowedUser(user: { username?: unknown; role?: unknown }): boolean {
  const username = String(user.username || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return username === 'adm' || role === 'admin' || role === 'gerente';
}

function ensureCsrf(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function csrfField(req: Request): string {
  return `<input type="hidden" name="csrf_token" value="${e(ensureCsrf(req))}">`;
}

function safePedidosReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://pedidos.local');
    const allowedPaths = new Set([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`]);
    if (!allowedPaths.has(url.pathname)) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || !isAllowedUser(req.session.user)) {
    const returnTo = safePedidosReturnPath(req.originalUrl);
    if (returnTo) req.session.returnTo = returnTo;
    return res.redirect(`${BASE_PATH}/login.php`);
  }
  return next();
}

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
  }
  const received = String(req.get('x-pedidos-internal-token') || req.get('x-miauw-internal-token') || req.query.token || '').trim();
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return next();
}

function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received || expected !== received) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    return redirectHome(res, monthValue(req.body?.competencia_mes));
  }
  return next();
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

function redirectHome(res: Response, month = ''): void {
  const target = month ? `${BASE_PATH}/?mes=${encodeURIComponent(month)}` : `${BASE_PATH}/`;
  res.redirect(target);
}

function loginRedirectTarget(req: Request): string {
  const target = safePedidosReturnPath(req.session.returnTo);
  delete req.session.returnTo;
  return target || `${BASE_PATH}/`;
}

function monthValue(value?: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(text)) {
    const month = Number.parseInt(text.slice(5, 7), 10);
    if (month >= 1 && month <= 12) return text;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const normalized = monthValue(month);
  return `${normalized.slice(5, 7)}/${normalized.slice(0, 4)}`;
}

function monthBounds(month: string): { start: string; end: string } {
  const normalized = monthValue(month);
  const year = Number.parseInt(normalized.slice(0, 4), 10);
  const monthIndex = Number.parseInt(normalized.slice(5, 7), 10) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 3, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 3, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function parseMoneyToCents(value: unknown): number {
  let text = String(value ?? '').replace(/R\$/g, '').replace(/\s+/g, '').trim();
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function formatMoney(cents: unknown): string {
  const amount = Number(cents || 0) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moneyInput(cents: number): string {
  return (Math.max(0, cents) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function bodyArray(body: Record<string, unknown>, field: string): unknown[] {
  const value = body[field] ?? body[`${field}[]`];
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function parseArrivalDaysToDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) throw new Error('Na previsao de chegada, informe somente numeros de dias.');
  const days = Number.parseInt(text, 10);
  if (!Number.isFinite(days) || days < 0) throw new Error('Na previsao de chegada, informe um numero valido de dias.');
  if (days > 365) throw new Error('Na previsao de chegada, use no maximo 365 dias.');
  const [year, month, day] = localDateInput().split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function parseOptionalDateOnly(value: unknown, label = 'vencimento'): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Informe ${label} em formato de data.`);
  const [year, month, day] = text.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Informe ${label} valido.`);
  }
  return text;
}

function accountDueFromDate(date: string | null): string | null {
  return date ? `${date}T12:00:00-03:00` : null;
}

function earliestDateOnly(values: Array<string | null | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort();
  return valid[0] || null;
}

function parseOptionalDatetimeLocal(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text}:00-03:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T12:00:00-03:00`;
  return null;
}

function parseDatetimeLocal(value: unknown): string {
  return parseOptionalDatetimeLocal(value) || new Date().toISOString();
}

function localDateInput(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : value.toISOString().slice(0, 10);
}

function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function brDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function brDateOnly(value: Date | string | null | undefined): string {
  return brDate(value, false);
}

function effectiveDueText(order: OrderRow | RenderOrder): string {
  const fallback = dateInputValue(order.item_due_at || order.due_at);
  if (!('items' in order) || !('payments' in order) || order.account_status !== 'pendente') return fallback;

  const activeItems = order.items
    .filter((item) => item.status !== 'cancelado')
    .slice()
    .sort((left, right) => {
      const leftDue = dateInputValue(left.due_at) || '9999-12-31';
      const rightDue = dateInputValue(right.due_at) || '9999-12-31';
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    });
  if (!activeItems.length) return fallback;

  const paidByItem = new Map<string, number>();
  let generalPaidCents = 0;
  for (const payment of order.payments.filter((row) => row.status !== 'cancelado')) {
    const cents = Number(payment.amount_cents || 0);
    if (payment.item_id) {
      paidByItem.set(String(payment.item_id), (paidByItem.get(String(payment.item_id)) || 0) + cents);
    } else {
      generalPaidCents += cents;
    }
  }

  for (const item of activeItems) {
    const itemDue = dateInputValue(item.due_at);
    const amount = Number(item.amount_cents || 0);
    const directPaid = Math.min(amount, paidByItem.get(String(item.id)) || 0);
    let remaining = Math.max(0, amount - directPaid);
    if (remaining > 0 && generalPaidCents > 0) {
      const allocated = Math.min(remaining, generalPaidCents);
      remaining -= allocated;
      generalPaidCents -= allocated;
    }
    if (remaining > 0 && itemDue) return itemDue;
  }

  return fallback;
}

function dueStatus(order: OrderRow | RenderOrder): { key: string; label: string; days: number | null } {
  const dueText = effectiveDueText(order);
  if (!dueText || order.account_status !== 'pendente') return { key: 'none', label: 'Sem vencimento', days: null };
  const due = new Date(`${dueText}T12:00:00`);
  if (Number.isNaN(due.getTime())) return { key: 'none', label: 'Sem vencimento', days: null };
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((dueStart - todayStart) / 86400000);
  if (days < 0) return { key: 'overdue', label: `Vencido ha ${Math.abs(days)} dia(s)`, days };
  if (days === 0) return { key: 'urgent', label: 'Urgente: vence hoje', days };
  if (days <= 3) return { key: 'urgent', label: `Urgente: faltam ${days} dia(s)`, days };
  if (days <= 5) return { key: 'attention', label: `Atencao: faltam ${days} dia(s)`, days };
  return { key: 'scheduled', label: `Faltam ${days} dia(s)`, days };
}

function arrivalStatus(order: OrderRow): { key: string; label: string } {
  if (!order.expected_arrival_at || order.status !== 'pedido') return { key: 'none', label: 'Sem previsao' };
  const text = dateInputValue(order.expected_arrival_at);
  if (!text) return { key: 'none', label: 'Sem previsao' };
  const arrival = new Date(`${text}T12:00:00`);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const arrivalStart = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate()).getTime();
  const days = Math.round((arrivalStart - todayStart) / 86400000);
  if (days < 0) return { key: 'late', label: `Atrasado ha ${Math.abs(days)} dia(s)` };
  if (days === 0) return { key: 'today', label: 'Chega hoje' };
  if (days === 1) return { key: 'soon', label: 'Chega amanha' };
  return { key: 'scheduled', label: `Chega em ${days} dia(s)` };
}

function loginWaitSeconds(req: Request): number {
  const blockedUntil = Number(req.session.loginBlockedUntil || 0);
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function registerLoginFailure(req: Request): void {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (req.session.loginAttempts || []).filter((timestamp) => now - timestamp < windowMs);
  attempts.push(now);
  req.session.loginAttempts = attempts;
  if (attempts.length >= 8) {
    req.session.loginBlockedUntil = now + 10 * 60 * 1000;
  }
}

function clearLoginRateLimit(req: Request): void {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
}

async function authenticate(username: string, password: string): Promise<User | null> {
  try {
    return await authenticateCore(username, password);
  } catch (error) {
    console.warn('[pedidos] core auth failed', {
      username: maskUsername(username),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [normalizeUsername(username)],
  );
  const user = result.rows[0];
  if (!user) return null;

  let ok = false;
  if (user.password_hash) {
    ok = await bcrypt.compare(password, normalizeHash(user.password_hash));
  }
  if (!ok && normalizeUsername(user.username) === 'adm') {
    ok = timingSafeStringEqual(password, 'adm');
  }

  if (!ok || !isAllowedUser(user)) return null;
  return {
    id: Number(user.id),
    username: String(user.username),
    role: String(user.role || 'user'),
  };
}

async function coreAuthHealth(): Promise<Record<string, unknown>> {
  const state = {
    provider: 'core',
    mysqlFallbackEnabled: false,
    mysqlDependency: false,
    shadowConfigured: false,
    shadowEnabled: false,
  };

  const startedAt = Date.now();
  try {
    const result = await corePgPool.query<{ has_users: boolean }>('SELECT EXISTS (SELECT 1 FROM core_users LIMIT 1) AS has_users');
    return {
      ...state,
      coreReachable: true,
      usersSynced: Boolean(result.rows[0]?.has_users),
      coreLatencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      ...state,
      coreReachable: false,
      coreStatus: 'unreachable',
      coreLatencyMs: Date.now() - startedAt,
    };
  }
}

async function logAudit(userId: number | null, action: string, entityType: string | null, entityId: number | null, message: string): Promise<void> {
  await logCoreAudit(userId, action, entityType || 'legacy_log', entityId === null ? null : String(entityId), message);
}

async function logCoreAudit(userId: number | null, action: string, entityType: string, entityId: string | null, detail: string): Promise<void> {
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        userId,
        cleanText(action, 80),
        cleanText(entityType, 80) || 'legacy_log',
        entityId,
        cleanText(detail, 255),
        JSON.stringify({ service: SERVICE_NAME }),
      ],
    );
  } catch (error) {
    console.warn('[pedidos] failed to write core audit log', error);
  }
}

async function auditPg(client: pg.PoolClient, accountId: number | null, userId: number | null, action: string, summary: string): Promise<void> {
  await client.query(
    'INSERT INTO gestao_audit_events (account_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [accountId, userId, action, cleanText(summary, 255)],
  );
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await pgPool.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.exists);
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pedidos_sessions (
      sid varchar NOT NULL PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_sessions_expire_idx
    ON pedidos_sessions (expire)
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_accounts (
      id bigserial PRIMARY KEY,
      title varchar(180) NOT NULL,
      category varchar(80) NOT NULL DEFAULT 'Geral',
      status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
      total_cents bigint NOT NULL DEFAULT 0,
      competence_month char(7) NOT NULL,
      note text,
      due_at timestamptz,
      repeat_next_month boolean NOT NULL DEFAULT false,
      repeated_from_account_id bigint,
      created_by integer,
      generated_at timestamptz NOT NULL DEFAULT now(),
      paid_at timestamptz,
      canceled_at timestamptz,
      archived_at timestamptz,
      archived_by integer
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_account_items (
      id bigserial PRIMARY KEY,
      account_id bigint NOT NULL REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      description varchar(180) NOT NULL,
      amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
      sort_order integer NOT NULL DEFAULT 0,
      due_at date,
      status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado')),
      canceled_at timestamptz,
      canceled_by integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query("ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'");
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS due_at date');
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_by integer');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_account_payments (
      id bigserial PRIMARY KEY,
      account_id bigint NOT NULL REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      item_id bigint REFERENCES gestao_account_items(id) ON DELETE RESTRICT,
      description varchar(180) NOT NULL DEFAULT 'Pagamento',
      amount_cents bigint NOT NULL CHECK (amount_cents > 0),
      status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado')),
      canceled_at timestamptz,
      canceled_by integer,
      paid_at timestamptz NOT NULL DEFAULT now(),
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_audit_events (
      id bigserial PRIMARY KEY,
      account_id bigint REFERENCES gestao_accounts(id) ON DELETE SET NULL,
      user_id integer,
      action varchar(80) NOT NULL,
      summary varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pedidos_orders (
      id bigserial PRIMARY KEY,
      legacy_order_id bigint UNIQUE,
      account_id bigint NOT NULL UNIQUE REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      supplier_name varchar(180) NOT NULL,
      expected_arrival_at date,
      moved_to_confirmed_at timestamptz,
      canceled_at timestamptz,
      canceled_by integer,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pedidos_confirmed_orders (
      id bigserial PRIMARY KEY,
      legacy_order_id bigint UNIQUE,
      order_id bigint REFERENCES pedidos_orders(id) ON DELETE SET NULL,
      account_id bigint NOT NULL UNIQUE REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      supplier_name varchar(180) NOT NULL,
      lifecycle text NOT NULL DEFAULT 'confirmado' CHECK (lifecycle IN ('confirmado', 'historico', 'cancelado')),
      expected_arrival_at date,
      confirmed_at timestamptz,
      confirmed_by integer,
      finished_at timestamptz,
      finished_by integer,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_orders_arrival_idx
    ON pedidos_orders (moved_to_confirmed_at, canceled_at, expected_arrival_at ASC NULLS LAST, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_orders_waiting_arrival_idx
    ON pedidos_orders (expected_arrival_at ASC NULLS LAST, id DESC)
    WHERE moved_to_confirmed_at IS NULL AND canceled_at IS NULL
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_confirmed_lifecycle_due_idx
    ON pedidos_confirmed_orders (lifecycle, finished_at DESC NULLS LAST, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_confirmed_active_idx
    ON pedidos_confirmed_orders (lifecycle, finished_at DESC NULLS LAST, id DESC)
    WHERE lifecycle <> 'cancelado'
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS pedidos_confirmed_order_id_idx
    ON pedidos_confirmed_orders (order_id)
    WHERE order_id IS NOT NULL
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_account_items_account_order_idx
    ON gestao_account_items (account_id, sort_order, id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_account_items_account_due_idx
    ON gestao_account_items (account_id, due_at ASC NULLS LAST, id)
    WHERE status = 'ativo'
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_account_payments_account_paid_idx
    ON gestao_account_payments (account_id, paid_at, id)
  `);
  await pgPool.query(`
    CREATE OR REPLACE FUNCTION pedidos_touch_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pedidos_orders_touch_updated_at') THEN
        CREATE TRIGGER pedidos_orders_touch_updated_at
        BEFORE UPDATE ON pedidos_orders
        FOR EACH ROW EXECUTE FUNCTION pedidos_touch_updated_at();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pedidos_confirmed_touch_updated_at') THEN
        CREATE TRIGGER pedidos_confirmed_touch_updated_at
        BEFORE UPDATE ON pedidos_confirmed_orders
        FOR EACH ROW EXECUTE FUNCTION pedidos_touch_updated_at();
      END IF;
    END $$;
  `);

  await migrateLegacyOrders();
}

async function migrateLegacyOrders(): Promise<void> {
  if (!(await tableExists('gestao_supplier_orders'))) return;
  await pgPool.query(`
    INSERT INTO pedidos_orders
      (legacy_order_id, account_id, supplier_name, expected_arrival_at, created_by, created_at, updated_at)
    SELECT id, account_id, supplier_name, expected_arrival_at, created_by, created_at, updated_at
    FROM gestao_supplier_orders
    WHERE status = 'pedido'
    ON CONFLICT DO NOTHING
  `);
  await pgPool.query(`
    INSERT INTO pedidos_confirmed_orders
      (legacy_order_id, account_id, supplier_name, lifecycle, expected_arrival_at, confirmed_at, confirmed_by, finished_at, finished_by, created_by, created_at, updated_at)
    SELECT id,
           account_id,
           supplier_name,
           CASE WHEN status = 'pedido' THEN 'confirmado' ELSE status END,
           expected_arrival_at,
           COALESCE(confirmed_at, created_at),
           confirmed_by,
           finished_at,
           finished_by,
           created_by,
           created_at,
           updated_at
    FROM gestao_supplier_orders
    WHERE status IN ('confirmado', 'historico', 'cancelado')
    ON CONFLICT DO NOTHING
  `);
}

async function paidTotal(client: pg.PoolClient, accountId: number): Promise<number> {
  const result = await client.query<{ paid_cents: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents
     FROM gestao_account_payments
     WHERE account_id = $1
       AND status = 'ativo'`,
    [accountId],
  );
  return Number(result.rows[0]?.paid_cents || 0);
}

async function syncPaymentStatus(client: pg.PoolClient, accountId: number): Promise<void> {
  const accountResult = await client.query<{ total_cents: number; status: string }>(
    'SELECT total_cents, status FROM gestao_accounts WHERE id = $1 LIMIT 1',
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account || account.status === 'cancelado') return;

  const paid = await paidTotal(client, accountId);
  if (Number(account.total_cents) > 0 && paid >= Number(account.total_cents)) {
    const dateResult = await client.query<{ paid_at: Date | string | null }>(
      "SELECT MAX(paid_at) AS paid_at FROM gestao_account_payments WHERE account_id = $1 AND status = 'ativo'",
      [accountId],
    );
    await client.query(
      "UPDATE gestao_accounts SET status = 'pago', paid_at = COALESCE($1::timestamptz, now()), canceled_at = NULL WHERE id = $2",
      [dateResult.rows[0]?.paid_at || null, accountId],
    );
    return;
  }

  await client.query("UPDATE gestao_accounts SET status = 'pendente', paid_at = NULL, canceled_at = NULL WHERE id = $1", [accountId]);
}

async function syncPedidoAfterAccountChange(client: pg.PoolClient, accountId: number, userId: number | null): Promise<void> {
  const orderResult = await client.query<{ id: string; lifecycle: 'confirmado' | 'historico' | 'cancelado' }>(
    "SELECT id, lifecycle FROM pedidos_confirmed_orders WHERE account_id = $1 AND lifecycle <> 'cancelado' FOR UPDATE",
    [accountId],
  );
  const order = orderResult.rows[0];
  if (!order) return;

  const accountResult = await client.query<{ status: 'pendente' | 'pago' | 'cancelado' }>(
    'SELECT status FROM gestao_accounts WHERE id = $1 LIMIT 1',
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account || account.status === 'cancelado') return;

  if (account.status === 'pago' && order.lifecycle === 'confirmado') {
    await client.query(
      "UPDATE pedidos_confirmed_orders SET lifecycle = 'historico', finished_at = now(), finished_by = $1 WHERE id = $2",
      [userId, Number(order.id)],
    );
    await auditPg(client, accountId, userId, 'pedidos_pedido_finalizado', 'Pedido recebido e pago; movido para historico.');
  }

  if (account.status === 'pendente' && order.lifecycle === 'historico') {
    await client.query(
      "UPDATE pedidos_confirmed_orders SET lifecycle = 'confirmado', finished_at = NULL, finished_by = NULL WHERE id = $1",
      [Number(order.id)],
    );
    await auditPg(client, accountId, userId, 'pedidos_pedido_reaberto', 'Pedido voltou para Confirmados apos ajuste de valor.');
  }
}

async function refreshAccountTotal(client: pg.PoolClient, accountId: number): Promise<number> {
  const result = await client.query<{ total_cents: string }>(
    `UPDATE gestao_accounts
     SET total_cents = COALESCE((
       SELECT SUM(amount_cents)
       FROM gestao_account_items
       WHERE account_id = $1
         AND status = 'ativo'
     ), 0)
     WHERE id = $1
     RETURNING total_cents`,
    [accountId],
  );
  return Number(result.rows[0]?.total_cents || 0);
}

async function refreshAccountDue(client: pg.PoolClient, accountId: number): Promise<void> {
  await client.query(
    `UPDATE gestao_accounts
     SET due_at = (
       SELECT CASE
         WHEN MIN(i.due_at) IS NULL THEN NULL
         ELSE (MIN(i.due_at)::text || 'T12:00:00-03:00')::timestamptz
       END
       FROM gestao_account_items i
       WHERE i.account_id = $1
         AND i.status = 'ativo'
     )
     WHERE id = $1`,
    [accountId],
  );
}

async function createOrder(req: Request): Promise<{ paidNow: boolean; arrivedNow: boolean }> {
  const supplier = cleanText(req.body.fornecedor, 180);
  if (!supplier) throw new Error('Informe o nome do fornecedor.');

  const values = bodyArray(req.body, 'pedido_valor');
  const dueValues = bodyArray(req.body, 'pedido_vencimento');
  const legacyDueDate = parseOptionalDateOnly(req.body.vencimento_em, 'o vencimento do boleto');
  const items: Array<{ description: string; cents: number; dueDate: string | null }> = [];
  for (let index = 0; index < Math.min(values.length, 30); index += 1) {
    const cents = parseMoneyToCents(values[index]);
    if (cents <= 0) continue;
    const label = values.length > 1 ? `Parcela ${index + 1}` : 'Pedido';
    const dueDate = parseOptionalDateOnly(dueValues[index], `o vencimento da ${label.toLowerCase()}`) || (values.length === 1 ? legacyDueDate : null);
    items.push({ description: `${label} - ${supplier}`.slice(0, 180), cents, dueDate });
  }
  if (!items.length) throw new Error('Informe pelo menos um valor maior que zero para o pedido.');

  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  const userId = req.session.user?.id || null;
  const paidNow = req.body.pago_agora === '1';
  const arrivedNow = req.body.chegou_agora === '1';
  const month = monthValue(req.body.competencia_mes);
  const dueAt = accountDueFromDate(earliestDateOnly(items.map((item) => item.dueDate)) || legacyDueDate);
  const expectedArrivalAt = parseArrivalDaysToDate(req.body.chegada_prevista);
  const note = cleanText(req.body.observacao, 1200);
  const client = await pgPool.connect();
  let accountId = 0;
  let orderId = 0;

  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string }>(
      `INSERT INTO gestao_accounts
        (title, category, status, total_cents, competence_month, note, due_at, created_by, generated_at, paid_at)
       VALUES ($1, 'Boleto', $2, $3, $4, $5, $6::timestamptz, $7, now(), CASE WHEN $2 = 'pago' THEN now() ELSE NULL END)
       RETURNING id`,
      [`Pedido - ${supplier}`.slice(0, 180), paidNow ? 'pago' : 'pendente', totalCents, month, note || null, dueAt, userId],
    );
    accountId = Number(accountResult.rows[0].id);

    for (const [index, item] of items.entries()) {
      await client.query(
        'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order, due_at) VALUES ($1, $2, $3, $4, $5::date)',
        [accountId, item.description, item.cents, (index + 1) * 10, item.dueDate],
      );
    }

    if (paidNow) {
      await client.query(
        'INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, now(), $4)',
        [accountId, 'Pagamento confirmado na criacao do pedido', totalCents, userId],
      );
    }

    const orderResult = await client.query<{ id: string }>(
      `INSERT INTO pedidos_orders
        (account_id, supplier_name, expected_arrival_at, moved_to_confirmed_at, created_by)
       VALUES ($1, $2, $3::date, CASE WHEN $4::boolean THEN now() ELSE NULL::timestamptz END, $5)
       RETURNING id`,
      [accountId, supplier, expectedArrivalAt, arrivedNow, userId],
    );
    orderId = Number(orderResult.rows[0].id);

    if (arrivedNow) {
      const lifecycle = paidNow ? 'historico' : 'confirmado';
      await client.query(
        `INSERT INTO pedidos_confirmed_orders
          (order_id, account_id, supplier_name, lifecycle, expected_arrival_at, confirmed_at, confirmed_by, finished_at, finished_by, created_by)
         VALUES (
           $1::bigint,
           $2::bigint,
           $3::text,
           $4::text,
           $5::date,
           now(),
           $6::integer,
           CASE WHEN $4::text = 'historico' THEN now() ELSE NULL::timestamptz END,
           CASE WHEN $4::text = 'historico' THEN $6::integer ELSE NULL::integer END,
           $6::integer
         )`,
        [orderId, accountId, supplier, lifecycle, expectedArrivalAt, userId],
      );
    }

    await auditPg(client, accountId, userId, 'pedidos_pedido_criado', `Pedido criado para ${supplier} / ${formatMoney(totalCents)}`);
    if (paidNow) {
      await auditPg(client, accountId, userId, 'pedidos_pedido_pago_criacao', 'Pedido criado ja com pagamento registrado.');
    }
    if (arrivedNow) {
      await auditPg(client, accountId, userId, 'pedidos_pedido_ja_recebido', paidNow ? 'Pedido criado ja recebido e quitado.' : 'Pedido criado ja recebido e enviado para Confirmados.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit(userId, 'pedidos_pedido_criado', 'pedidos_pedido', orderId, `Pedido criado: ${supplier} / ${formatMoney(totalCents)}`);
  return { paidNow, arrivedNow };
}

async function confirmArrivalByOrderId(id: number, userId: number | null, sourceLabel = 'sistema'): Promise<{ supplierName: string; movedToHistory: boolean; accountId: number }> {
  if (!id) throw new Error('Pedido invalido.');

  const client = await pgPool.connect();
  let accountId = 0;
  let movedToHistory = false;
  let supplierName = '';
  try {
    await client.query('BEGIN');
    const orderResult = await client.query<{
      account_id: string;
      supplier_name: string;
      expected_arrival_at: Date | string | null;
      created_by: number | null;
      created_at: Date | string;
    }>(
      `SELECT account_id, supplier_name, expected_arrival_at, created_by, created_at
       FROM pedidos_orders
       WHERE id = $1 AND moved_to_confirmed_at IS NULL AND canceled_at IS NULL
       FOR UPDATE`,
      [id],
    );
    const order = orderResult.rows[0];
    if (!order) throw new Error('Pedido nao encontrado ou ja confirmado.');
    accountId = Number(order.account_id);
    supplierName = order.supplier_name;

    const accountResult = await client.query<{ status: 'pendente' | 'pago' | 'cancelado' }>(
      'SELECT status FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [accountId],
    );
    const account = accountResult.rows[0];
    if (!account || account.status === 'cancelado') throw new Error('A conta desse pedido esta cancelada.');
    movedToHistory = account.status === 'pago';

    await client.query(
      `INSERT INTO pedidos_confirmed_orders
        (order_id, account_id, supplier_name, lifecycle, expected_arrival_at, confirmed_at, confirmed_by, finished_at, finished_by, created_by, created_at)
       VALUES (
         $1::bigint,
         $2::bigint,
         $3::text,
         $4::text,
         $5::date,
         now(),
         $6::integer,
         CASE WHEN $4::text = 'historico' THEN now() ELSE NULL::timestamptz END,
         CASE WHEN $4::text = 'historico' THEN $6::integer ELSE NULL::integer END,
         $7::integer,
         $8::timestamptz
       )
       ON CONFLICT (account_id) DO UPDATE
       SET lifecycle = EXCLUDED.lifecycle,
           confirmed_at = COALESCE(pedidos_confirmed_orders.confirmed_at, EXCLUDED.confirmed_at),
           confirmed_by = COALESCE(pedidos_confirmed_orders.confirmed_by, EXCLUDED.confirmed_by),
           finished_at = EXCLUDED.finished_at,
           finished_by = EXCLUDED.finished_by`,
      [id, accountId, order.supplier_name, movedToHistory ? 'historico' : 'confirmado', order.expected_arrival_at, userId, order.created_by, order.created_at],
    );
    await client.query('UPDATE pedidos_orders SET moved_to_confirmed_at = now() WHERE id = $1', [id]);
    await auditPg(client, accountId, userId, 'pedidos_chegada_confirmada', `Chegada confirmada: ${order.supplier_name} (${sourceLabel})`);
    if (movedToHistory) {
      await auditPg(client, accountId, userId, 'pedidos_pedido_finalizado', 'Pedido ja estava pago; movido para historico apos chegada.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, 'pedidos_chegada_confirmada', 'pedidos_pedido', id, movedToHistory ? 'Pedido recebido e finalizado.' : 'Pedido recebido e aguardando pagamento.');
  return { supplierName, movedToHistory, accountId };
}

async function confirmArrival(req: Request): Promise<void> {
  const id = Number(req.body.order_id || 0);
  const userId = req.session.user?.id || null;
  await confirmArrivalByOrderId(id, userId, 'painel Pedidos');
}

async function addItem(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const cents = parseMoneyToCents(req.body.novo_item_valor);
  if (!id) throw new Error('Conta invalida.');
  if (cents <= 0) throw new Error('Informe um valor maior que zero para adicionar.');
  const requestedDescription = cleanText(req.body.novo_item_descricao, 180);
  const itemType = cleanText(req.body.novo_item_tipo, 40);
  const dueDate = parseOptionalDateOnly(req.body.novo_item_vencimento, 'o vencimento do novo valor');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let description = requestedDescription;
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id, status FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].status === 'cancelado') throw new Error('Reabra a conta antes de adicionar itens.');
    const supplierResult = await client.query<{ supplier_name: string }>(
      `SELECT supplier_name FROM pedidos_confirmed_orders WHERE account_id = $1 AND lifecycle <> 'cancelado'
       UNION ALL
       SELECT supplier_name FROM pedidos_orders WHERE account_id = $1 AND canceled_at IS NULL
       LIMIT 1`,
      [id],
    );
    const orderResult = await client.query<{ next_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM gestao_account_items WHERE account_id = $1',
      [id],
    );
    if (!description && itemType === 'parcela') {
      const supplier = supplierResult.rows[0]?.supplier_name || 'pedido';
      const activeCount = await client.query<{ count: string }>(
        "SELECT COUNT(*)::bigint AS count FROM gestao_account_items WHERE account_id = $1 AND status = 'ativo'",
        [id],
      );
      description = `Parcela ${Number(activeCount.rows[0]?.count || 0) + 1} - ${supplier}`.slice(0, 180);
    }
    description = description || 'Juros ou diferenca';
    await client.query(
      'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order, due_at) VALUES ($1, $2, $3, $4, $5::date)',
      [id, description, cents, Number(orderResult.rows[0]?.next_order || 10), dueDate],
    );
    await client.query('UPDATE gestao_accounts SET total_cents = total_cents + $1 WHERE id = $2', [cents, id]);
    await refreshAccountDue(client, id);
    await syncPaymentStatus(client, id);
    await syncPedidoAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, itemType === 'parcela' ? 'pedidos_parcela_adicionada' : 'pedidos_valor_adicionado', `Valor adicionado: ${description} / ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, itemType === 'parcela' ? 'pedidos_parcela_adicionada' : 'pedidos_valor_adicionado', 'gestao_conta', id, `Valor adicionado no pedido: ${description} / ${formatMoney(cents)}`);
}

async function updateOrderSupplier(req: Request): Promise<void> {
  const accountId = Number(req.body.id || 0);
  const supplier = cleanText(req.body.fornecedor, 180);
  if (!accountId) throw new Error('Conta invalida.');
  if (!supplier) throw new Error('Informe o nome do fornecedor.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let oldSupplier = '';
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM gestao_accounts WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [accountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Pedido nao encontrado.');
    if (account.status === 'cancelado') throw new Error('Esse pedido esta cancelado.');

    const waitingResult = await client.query<{ id: string; supplier_name: string }>(
      'SELECT id, supplier_name FROM pedidos_orders WHERE account_id = $1 FOR UPDATE',
      [accountId],
    );
    const confirmedResult = await client.query<{ id: string; supplier_name: string }>(
      'SELECT id, supplier_name FROM pedidos_confirmed_orders WHERE account_id = $1 FOR UPDATE',
      [accountId],
    );
    oldSupplier = confirmedResult.rows[0]?.supplier_name || waitingResult.rows[0]?.supplier_name || '';
    if (!oldSupplier) throw new Error('Pedido nao encontrado.');

    await client.query('UPDATE gestao_accounts SET title = $1 WHERE id = $2', [`Pedido - ${supplier}`.slice(0, 180), accountId]);
    await client.query('UPDATE pedidos_orders SET supplier_name = $1 WHERE account_id = $2', [supplier, accountId]);
    await client.query('UPDATE pedidos_confirmed_orders SET supplier_name = $1 WHERE account_id = $2', [supplier, accountId]);

    if (oldSupplier && oldSupplier !== supplier) {
      const items = await client.query<{ id: string; description: string }>(
        "SELECT id, description FROM gestao_account_items WHERE account_id = $1 AND status = 'ativo' FOR UPDATE",
        [accountId],
      );
      const oldSuffix = ` - ${oldSupplier}`;
      for (const item of items.rows) {
        if (!item.description.endsWith(oldSuffix)) continue;
        const newDescription = `${item.description.slice(0, -oldSuffix.length)} - ${supplier}`.slice(0, 180);
        await client.query('UPDATE gestao_account_items SET description = $1 WHERE id = $2', [newDescription, Number(item.id)]);
      }
    }

    await auditPg(client, accountId, userId, 'pedidos_nome_atualizado', `Fornecedor alterado: ${oldSupplier} -> ${supplier}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit(userId, 'pedidos_nome_atualizado', 'gestao_conta', accountId, `Fornecedor do pedido alterado: ${oldSupplier} -> ${supplier}`);
}

async function updateOrderItem(req: Request): Promise<void> {
  const accountId = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  const description = cleanText(req.body.item_descricao, 180);
  const cents = parseMoneyToCents(req.body.item_valor);
  const hasDueField = Object.prototype.hasOwnProperty.call(req.body, 'item_vencimento');
  const requestedDueDate = hasDueField ? parseOptionalDateOnly(req.body.item_vencimento, 'o vencimento da parcela') : null;
  if (!accountId || !itemId) throw new Error('Lancamento invalido.');
  if (!description) throw new Error('Informe o nome do lancamento.');
  if (cents <= 0) throw new Error('Informe um valor maior que zero.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM gestao_accounts WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [accountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Pedido nao encontrado.');
    if (account.status === 'cancelado') throw new Error('Esse pedido esta cancelado.');

    const itemResult = await client.query<{ description: string; amount_cents: string; due_at: Date | string | null }>(
      "SELECT description, amount_cents, due_at FROM gestao_account_items WHERE id = $1 AND account_id = $2 AND status = 'ativo' FOR UPDATE",
      [itemId, accountId],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    const dueDate = hasDueField ? requestedDueDate : (dateInputValue(item.due_at) || null);

    const paidForItem = await client.query<{ paid_cents: string }>(
      "SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents FROM gestao_account_payments WHERE item_id = $1 AND status = 'ativo'",
      [itemId],
    );
    if (cents < Number(paidForItem.rows[0]?.paid_cents || 0)) {
      throw new Error('O valor nao pode ficar menor que o total ja pago nessa parcela.');
    }

    await client.query('UPDATE gestao_account_items SET description = $1, amount_cents = $2, due_at = $3::date WHERE id = $4', [description, cents, dueDate, itemId]);
    const newTotal = await refreshAccountTotal(client, accountId);
    await refreshAccountDue(client, accountId);
    const paid = await paidTotal(client, accountId);
    if (newTotal < paid) {
      throw new Error('O total do pedido nao pode ficar menor que o valor ja pago.');
    }
    await syncPaymentStatus(client, accountId);
    await syncPedidoAfterAccountChange(client, accountId, userId);
    await auditPg(client, accountId, userId, 'pedidos_valor_atualizado', `Lancamento alterado: ${item.description} / ${formatMoney(item.amount_cents)} -> ${description} / ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit(userId, 'pedidos_valor_atualizado', 'gestao_item', itemId, `Valor do pedido atualizado: ${description} / ${formatMoney(cents)}`);
}

async function cancelOrderItem(req: Request): Promise<void> {
  const accountId = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  if (!accountId || !itemId) throw new Error('Lancamento invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let description = '';
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM gestao_accounts WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [accountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Pedido nao encontrado.');
    if (account.status === 'cancelado') throw new Error('Esse pedido esta cancelado.');

    const countResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::bigint AS count FROM gestao_account_items WHERE account_id = $1 AND status = 'ativo'",
      [accountId],
    );
    if (Number(countResult.rows[0]?.count || 0) <= 1) {
      throw new Error('Para remover o ultimo valor, arquive o pedido da tela.');
    }

    const itemResult = await client.query<{ description: string }>(
      "SELECT description FROM gestao_account_items WHERE id = $1 AND account_id = $2 AND status = 'ativo' FOR UPDATE",
      [itemId, accountId],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    description = item.description;

    const paidResult = await client.query<{ paid_cents: string }>(
      "SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents FROM gestao_account_payments WHERE item_id = $1 AND status = 'ativo'",
      [itemId],
    );
    if (Number(paidResult.rows[0]?.paid_cents || 0) > 0) {
      throw new Error('Esse valor ja tem pagamento vinculado. Edite o valor ou arquive o pedido.');
    }

    await client.query(
      "UPDATE gestao_account_items SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE id = $2",
      [userId, itemId],
    );
    const newTotal = await refreshAccountTotal(client, accountId);
    await refreshAccountDue(client, accountId);
    const paid = await paidTotal(client, accountId);
    if (newTotal < paid) {
      throw new Error('O total do pedido nao pode ficar menor que o valor ja pago.');
    }
    await syncPaymentStatus(client, accountId);
    await syncPedidoAfterAccountChange(client, accountId, userId);
    await auditPg(client, accountId, userId, 'pedidos_valor_cancelado', `Lancamento removido da tela: ${description}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit(userId, 'pedidos_valor_cancelado', 'gestao_item', itemId, `Valor removido do pedido: ${description}`);
}

async function archiveOrder(req: Request): Promise<void> {
  const accountId = Number(req.body.id || 0);
  if (!accountId) throw new Error('Pedido invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let supplier = '';
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string; archived_at: Date | string | null }>(
      'SELECT id, archived_at FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [accountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Pedido nao encontrado.');
    if (account.archived_at) throw new Error('Esse pedido ja saiu da tela.');

    const supplierResult = await client.query<{ supplier_name: string }>(
      `SELECT supplier_name FROM pedidos_confirmed_orders WHERE account_id = $1
       UNION ALL
       SELECT supplier_name FROM pedidos_orders WHERE account_id = $1
       LIMIT 1`,
      [accountId],
    );
    supplier = supplierResult.rows[0]?.supplier_name || 'pedido';

    await client.query('UPDATE gestao_accounts SET archived_at = now(), archived_by = $1::integer WHERE id = $2', [userId, accountId]);
    await client.query(
      "UPDATE pedidos_orders SET canceled_at = COALESCE(canceled_at, now()), canceled_by = COALESCE(canceled_by, $1::integer) WHERE account_id = $2 AND moved_to_confirmed_at IS NULL",
      [userId, accountId],
    );
    await client.query(
      "UPDATE pedidos_confirmed_orders SET lifecycle = 'cancelado', finished_at = COALESCE(finished_at, now()), finished_by = COALESCE(finished_by, $1::integer) WHERE account_id = $2 AND lifecycle <> 'cancelado'",
      [userId, accountId],
    );
    await auditPg(client, accountId, userId, 'pedidos_pedido_arquivado', `Pedido arquivado da tela: ${supplier}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit(userId, 'pedidos_pedido_arquivado', 'gestao_conta', accountId, `Pedido arquivado da tela: ${supplier}`);
}

async function addPayment(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const cents = parseMoneyToCents(req.body.pagamento_valor);
  if (!id) throw new Error('Conta invalida.');
  if (cents <= 0) throw new Error('Informe um valor pago maior que zero.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ total_cents: number; status: string }>(
      'SELECT total_cents, status FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Conta nao encontrada.');
    if (account.status === 'cancelado') throw new Error('Reabra a conta antes de registrar pagamento.');
    const paid = await paidTotal(client, id);
    const remaining = Math.max(0, Number(account.total_cents) - paid);
    if (remaining <= 0) throw new Error('Esse boleto ja esta pago.');
    if (cents > remaining) throw new Error('Pagamento maior que o saldo. Adicione juros ou diferenca antes de pagar.');
    const description = cleanText(req.body.pagamento_descricao, 180) || (cents >= remaining ? 'Pagamento final do pedido' : 'Pagamento parcial do pedido');
    await client.query(
      'INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, $4::timestamptz, $5)',
      [id, description, cents, parseDatetimeLocal(req.body.pagamento_em), userId],
    );
    await syncPaymentStatus(client, id);
    await syncPedidoAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'pedidos_pagamento_criado', `Pagamento registrado: ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, 'pedidos_pagamento_criado', 'gestao_conta', id, `Pagamento registrado em pedido: ${formatMoney(cents)}`);
}

async function markWaitingOrderAsPaid(req: Request): Promise<void> {
  const orderId = Number(req.body.order_id || 0);
  if (!orderId) throw new Error('Pedido invalido.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let accountId = 0;
  let supplier = '';
  let remaining = 0;
  try {
    await client.query('BEGIN');
    const orderResult = await client.query<{
      account_id: string;
      supplier_name: string;
      total_cents: string;
      status: string;
      archived_at: Date | string | null;
    }>(
      `SELECT o.account_id,
              o.supplier_name,
              a.total_cents,
              a.status,
              a.archived_at
       FROM pedidos_orders o
       JOIN gestao_accounts a ON a.id = o.account_id
       WHERE o.id = $1
         AND o.moved_to_confirmed_at IS NULL
         AND o.canceled_at IS NULL
       FOR UPDATE OF o, a`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) throw new Error('Pedido nao encontrado ou ja confirmado.');
    if (order.archived_at) throw new Error('Esse pedido foi arquivado da tela.');
    if (order.status === 'cancelado') throw new Error('Reabra a conta antes de marcar como pago.');
    accountId = Number(order.account_id);
    supplier = order.supplier_name;
    const paid = await paidTotal(client, accountId);
    remaining = Math.max(0, Number(order.total_cents || 0) - paid);
    if (remaining <= 0) throw new Error('Esse pedido ja esta pago; agora so confirme a chegada.');

    await client.query(
      "INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, 'Pagamento antecipado do pedido', $2, now(), $3)",
      [accountId, remaining, userId],
    );
    await syncPaymentStatus(client, accountId);
    await auditPg(client, accountId, userId, 'pedidos_pedido_pago_antes_chegada', `Pedido marcado como ja pago antes da chegada: ${supplier} / ${formatMoney(remaining)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, 'pedidos_pedido_pago_antes_chegada', 'pedidos_pedido', orderId, `Pedido aguardando chegada marcado como pago: ${supplier} / ${formatMoney(remaining)}`);
}

async function confirmRemaining(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ total_cents: number; status: string }>(
      'SELECT total_cents, status FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Conta nao encontrada.');
    if (account.status === 'cancelado') throw new Error('Reabra a conta antes de confirmar pagamento.');
    const paid = await paidTotal(client, id);
    const remaining = Math.max(0, Number(account.total_cents) - paid);
    if (remaining > 0) {
      await client.query(
        "INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, 'Pagamento final do pedido', $2, now(), $3)",
        [id, remaining, userId],
      );
    }
    await syncPaymentStatus(client, id);
    await syncPedidoAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'pedidos_boleto_quitado', 'Boleto do pedido quitado.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, 'pedidos_boleto_quitado', 'gestao_conta', id, 'Boleto do pedido quitado.');
}

async function updateDue(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const dueDate = req.body.limpar_vencimento === '1' ? null : parseOptionalDateOnly(req.body.vencimento_em, 'o vencimento do boleto');
  const dueAt = accountDueFromDate(dueDate);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE gestao_account_items SET due_at = $1::date WHERE account_id = $2 AND status = $3', [dueDate, id, 'ativo']);
    await client.query('UPDATE gestao_accounts SET due_at = $1::timestamptz WHERE id = $2', [dueAt, id]);
    await auditPg(client, id, userId, dueAt ? 'pedidos_vencimento_atualizado' : 'pedidos_vencimento_removido', dueAt ? 'Vencimento do boleto atualizado.' : 'Vencimento do boleto removido.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(userId, dueAt ? 'pedidos_vencimento_atualizado' : 'pedidos_vencimento_removido', 'gestao_conta', id, 'Vencimento do pedido atualizado.');
}

async function listOrders(month: string): Promise<RenderOrder[]> {
  await migrateLegacyOrders();
  const bounds = monthBounds(month);
  const paidSubquery = `
    SELECT account_id, SUM(amount_cents) AS paid_cents, MAX(paid_at) AS last_payment_at
    FROM gestao_account_payments
    WHERE status = 'ativo'
    GROUP BY account_id
  `;
  const waitingResult = await pgPool.query<OrderRow>(
    `SELECT o.id,
            NULL::bigint AS order_id,
            o.account_id,
            o.supplier_name,
            'pedido'::text AS status,
            o.expected_arrival_at,
            NULL::timestamptz AS confirmed_at,
            NULL::integer AS confirmed_by,
            NULL::timestamptz AS finished_at,
            NULL::integer AS finished_by,
            o.created_by,
            o.created_at,
            o.updated_at,
            a.title AS account_title,
            a.status AS account_status,
            a.total_cents,
            a.competence_month,
            a.due_at,
            item_due.item_due_at,
            a.generated_at,
            a.paid_at,
            COALESCE(p.paid_cents, 0)::bigint AS paid_cents,
            p.last_payment_at
     FROM pedidos_orders o
     JOIN gestao_accounts a ON a.id = o.account_id
     LEFT JOIN LATERAL (
       SELECT MIN(i.due_at) AS item_due_at
       FROM gestao_account_items i
       WHERE i.account_id = a.id
         AND i.status = 'ativo'
         AND i.due_at IS NOT NULL
     ) item_due ON true
     LEFT JOIN (${paidSubquery}) p ON p.account_id = a.id
     WHERE o.moved_to_confirmed_at IS NULL
       AND o.canceled_at IS NULL
       AND a.archived_at IS NULL
       AND a.status <> 'cancelado'
     ORDER BY o.expected_arrival_at ASC NULLS LAST, o.id DESC
     LIMIT 300`,
  );
  const confirmedResult = await pgPool.query<OrderRow>(
    `SELECT c.id,
            c.order_id,
            c.account_id,
            c.supplier_name,
            c.lifecycle AS status,
            c.expected_arrival_at,
            c.confirmed_at,
            c.confirmed_by,
            c.finished_at,
            c.finished_by,
            c.created_by,
            c.created_at,
            c.updated_at,
            a.title AS account_title,
            a.status AS account_status,
            a.total_cents,
            a.competence_month,
            a.due_at,
            item_due.item_due_at,
            a.generated_at,
            a.paid_at,
            COALESCE(p.paid_cents, 0)::bigint AS paid_cents,
            p.last_payment_at
     FROM pedidos_confirmed_orders c
     JOIN gestao_accounts a ON a.id = c.account_id
     LEFT JOIN LATERAL (
       SELECT MIN(i.due_at) AS item_due_at
       FROM gestao_account_items i
       WHERE i.account_id = a.id
         AND i.status = 'ativo'
         AND i.due_at IS NOT NULL
     ) item_due ON true
     LEFT JOIN (${paidSubquery}) p ON p.account_id = a.id
     WHERE c.lifecycle <> 'cancelado'
       AND a.archived_at IS NULL
       AND (
        c.lifecycle = 'confirmado'
        OR a.competence_month = $1
        OR (c.finished_at >= $2::timestamptz AND c.finished_at < $3::timestamptz)
        OR EXISTS (
          SELECT 1 FROM gestao_account_payments gp
          WHERE gp.account_id = a.id
            AND gp.paid_at >= $2::timestamptz
            AND gp.paid_at < $3::timestamptz
        )
       )
     LIMIT 500`,
    [month, bounds.start, bounds.end],
  );
  const orders = [...waitingResult.rows, ...confirmedResult.rows];
  if (!orders.length) return [];

  const accountIds = orders.map((order) => Number(order.account_id));
  const itemsResult = await pgPool.query<ItemRow>(
    `SELECT i.*,
            COALESCE(p.paid_cents, 0)::bigint AS paid_cents
     FROM gestao_account_items i
     LEFT JOIN (
       SELECT item_id, SUM(amount_cents) AS paid_cents
       FROM gestao_account_payments
       WHERE status = 'ativo'
         AND item_id IS NOT NULL
       GROUP BY item_id
     ) p ON p.item_id = i.id
     WHERE i.account_id = ANY($1::bigint[])
     ORDER BY i.account_id ASC, i.sort_order ASC, i.id ASC`,
    [accountIds],
  );
  const paymentsResult = await pgPool.query<PaymentRow>(
    `SELECT p.*, i.description AS item_description
     FROM gestao_account_payments p
     LEFT JOIN gestao_account_items i ON i.id = p.item_id
     WHERE p.account_id = ANY($1::bigint[])
     ORDER BY p.account_id ASC, p.paid_at ASC, p.id ASC`,
    [accountIds],
  );

  const itemsByAccount = new Map<string, ItemRow[]>();
  for (const item of itemsResult.rows) {
    const key = String(item.account_id);
    itemsByAccount.set(key, [...(itemsByAccount.get(key) || []), item]);
  }

  const paymentsByAccount = new Map<string, PaymentRow[]>();
  for (const payment of paymentsResult.rows) {
    const key = String(payment.account_id);
    paymentsByAccount.set(key, [...(paymentsByAccount.get(key) || []), payment]);
  }

  return orders
    .map((order) => ({
      ...order,
      items: itemsByAccount.get(String(order.account_id)) || [],
      payments: paymentsByAccount.get(String(order.account_id)) || [],
    }))
    .sort((left, right) => orderSortKey(left) - orderSortKey(right));
}

function orderSortKey(order: OrderRow | RenderOrder): number {
  const base = order.status === 'pedido' ? 0 : order.status === 'confirmado' ? 10_000_000_000_000 : 20_000_000_000_000;
  if (order.status === 'pedido') {
    return base + (order.expected_arrival_at ? new Date(String(order.expected_arrival_at)).getTime() : 9_000_000_000_000);
  }
  if (order.status === 'confirmado') {
    const dueText = effectiveDueText(order);
    return base + (dueText ? new Date(`${dueText}T12:00:00`).getTime() : 9_000_000_000_000);
  }
  return base - (order.finished_at ? new Date(String(order.finished_at)).getTime() : new Date(String(order.created_at)).getTime());
}

async function ordersBadge(): Promise<{ awaitingArrival: number; arrivingToday: number }> {
  await migrateLegacyOrders();
  const result = await pgPool.query<{ awaiting_arrival: string; arriving_today: string }>(
    `SELECT COUNT(*)::bigint AS awaiting_arrival,
            COUNT(*) FILTER (WHERE o.expected_arrival_at = ((now() AT TIME ZONE $1)::date))::bigint AS arriving_today
     FROM pedidos_orders o
     JOIN gestao_accounts a ON a.id = o.account_id
     WHERE o.moved_to_confirmed_at IS NULL
       AND o.canceled_at IS NULL
       AND a.archived_at IS NULL
       AND a.status <> 'cancelado'`,
    [TZ],
  );
  const row = result.rows[0];
  return {
    awaitingArrival: Number(row?.awaiting_arrival || 0),
    arrivingToday: Number(row?.arriving_today || 0),
  };
}

async function listWaitingArrivalInternal(limit = 80): Promise<ArrivalInternalOrder[]> {
  await migrateLegacyOrders();
  const result = await pgPool.query<ArrivalInternalOrder>(
    `SELECT o.id,
            o.account_id,
            o.supplier_name,
            o.expected_arrival_at,
            a.status AS account_status,
            a.total_cents::bigint::text AS total_cents,
            COALESCE(p.paid_cents, 0)::bigint::text AS paid_cents,
            GREATEST(a.total_cents - COALESCE(p.paid_cents, 0), 0)::bigint::text AS remaining_cents
       FROM pedidos_orders o
       JOIN gestao_accounts a ON a.id = o.account_id
       LEFT JOIN (
         SELECT account_id, SUM(amount_cents) AS paid_cents
         FROM gestao_account_payments
         WHERE status = 'ativo'
         GROUP BY account_id
       ) p ON p.account_id = a.id
      WHERE o.moved_to_confirmed_at IS NULL
        AND o.canceled_at IS NULL
        AND a.archived_at IS NULL
        AND a.status <> 'cancelado'
      ORDER BY o.expected_arrival_at ASC NULLS LAST, o.id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(200, Math.trunc(limit)))],
  );
  return result.rows;
}

function arrivalOrderPublic(order: ArrivalInternalOrder): Record<string, unknown> {
  return {
    id: Number(order.id),
    account_id: Number(order.account_id),
    supplier_name: order.supplier_name,
    expected_arrival_at: order.expected_arrival_at ? dateInputValue(order.expected_arrival_at) : null,
    account_status: order.account_status,
    total_cents: Number(order.total_cents || 0),
    paid_cents: Number(order.paid_cents || 0),
    remaining_cents: Number(order.remaining_cents || 0),
    total_label: formatMoney(order.total_cents),
    remaining_label: formatMoney(order.remaining_cents),
  };
}

function matchArrivalOrders(orders: ArrivalInternalOrder[], supplierInput: unknown): ArrivalInternalOrder[] {
  const target = normalizeLookupText(supplierInput)
    .replace(/\b(pedido|fornecedor|titulo|chegou|chegaram|recebido|recebida|recebemos)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (target.length < 2) return [];
  const exact = orders.filter((order) => normalizeLookupText(order.supplier_name) === target);
  if (exact.length) return exact;
  return orders.filter((order) => {
    const supplier = normalizeLookupText(order.supplier_name);
    const words = supplier.split(' ').filter(Boolean);
    return supplier.startsWith(`${target} `)
      || supplier.endsWith(` ${target}`)
      || supplier.includes(` ${target} `)
      || (target.length >= 4 && supplier.includes(target))
      || (target.split(' ').length === 1 && words.includes(target));
  });
}

async function confirmArrivalBySupplier(supplierInput: unknown, actorLabel: string): Promise<Record<string, unknown>> {
  const orders = await listWaitingArrivalInternal(120);
  const matches = matchArrivalOrders(orders, supplierInput);
  const options = orders.slice(0, 12).map((order) => arrivalOrderPublic(order));
  if (matches.length === 0) {
    return {
      ok: false,
      status: 'not_found',
      message: 'Nao achei esse titulo em Aguardando chegada.',
      options,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      status: 'ambiguous',
      message: 'Achei mais de um pedido parecido. Responda com o titulo mais exato.',
      options: matches.slice(0, 12).map((order) => arrivalOrderPublic(order)),
    };
  }

  const order = matches[0];
  const confirmed = await confirmArrivalByOrderId(Number(order.id), null, actorLabel);
  return {
    ok: true,
    status: confirmed.movedToHistory ? 'historico' : 'confirmado',
    order: arrivalOrderPublic(order),
    message: confirmed.movedToHistory
      ? `${confirmed.supplierName} chegou e foi para Historico porque ja estava pago.`
      : `${confirmed.supplierName} chegou e ficou em Confirmados para pagar.`,
  };
}

async function paidThisMonth(month: string): Promise<number> {
  const bounds = monthBounds(month);
  const result = await pgPool.query<{ paid_cents: string }>(
    `SELECT COALESCE(SUM(p.amount_cents), 0)::bigint AS paid_cents
     FROM gestao_account_payments p
     JOIN gestao_accounts a ON a.id = p.account_id
     WHERE p.status = 'ativo'
       AND p.paid_at >= $1::timestamptz
       AND p.paid_at < $2::timestamptz
       AND a.archived_at IS NULL
       AND (
        EXISTS (SELECT 1 FROM pedidos_orders o WHERE o.account_id = a.id)
        OR EXISTS (SELECT 1 FROM pedidos_confirmed_orders c WHERE c.account_id = a.id)
       )`,
    [bounds.start, bounds.end],
  );
  return Number(result.rows[0]?.paid_cents || 0);
}

function renderOrderForm(req: Request, selectedMonth: string): string {
  return `<form method="post" class="gestao-orders-form" data-gestao-order-form>
    ${csrfField(req)}
    <input type="hidden" name="action" value="create_order">
    <div class="gestao-order-form-head">
      <div>
        <span class="gestao-kicker">Novo pedido</span>
      </div>
      <strong class="gestao-order-form-total" data-order-total>Total R$ 0,00</strong>
    </div>
    <div class="gestao-order-form-section">
      <div class="gestao-order-form-section-head">Fornecedor</div>
      <label><span>Nome do fornecedor</span><input type="text" name="fornecedor" maxlength="180" placeholder="Distribuidora, laboratorio, representante" required></label>
    </div>
    <div class="gestao-order-form-section">
      <div class="gestao-order-form-section-head">Parcelas</div>
      <div class="gestao-order-values" data-order-items>
        <div class="gestao-order-parcel" data-order-parcel>
          <div class="gestao-order-parcel-head">
            <strong>Parcela 1</strong>
            <small>Valor e vencimento</small>
          </div>
          <label><span>Valor do boleto ou pedido</span><input type="text" name="pedido_valor[]" inputmode="decimal" placeholder="0,00" data-money-input></label>
          <label><span>Vencimento desta parcela</span><input type="date" name="pedido_vencimento[]"></label>
        </div>
      </div>
      <button type="button" class="gestao-btn gestao-btn-secondary" data-add-order-item>Adicionar parcela</button>
    </div>
    <div class="gestao-order-form-section">
      <div class="gestao-order-form-section-head">Entrega</div>
      <div class="gestao-order-form-grid">
        <label><span>Previsao de chegada (dias)</span><input type="text" name="chegada_prevista" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="Ex.: 2" title="Digite somente o numero de dias ate a chegada" data-arrival-days></label>
        <label><span>Competencia</span><input type="month" name="competencia_mes" value="${e(selectedMonth)}"></label>
      </div>
    </div>
    <div class="gestao-order-form-section">
      <div class="gestao-order-form-section-head">Status inicial</div>
      <div class="gestao-order-checks">
        <label class="gestao-check-row"><input type="checkbox" name="pago_agora" value="1"><span>Ja foi pago, so falta chegar</span></label>
        <label class="gestao-check-row"><input type="checkbox" name="chegou_agora" value="1"><span>Ja chegou, so pagar</span></label>
      </div>
    </div>
    <div class="gestao-order-form-section">
      <div class="gestao-order-form-section-head">Observacao</div>
      <label><span>Detalhe curto</span><textarea name="observacao" rows="3" placeholder="Pedido, numero do boleto ou detalhe curto."></textarea></label>
    </div>
    <button type="submit" class="gestao-btn gestao-btn-primary">Registrar pedido</button>
  </form>`;
}

function renderOrderCard(req: Request, order: RenderOrder, selectedMonth: string): string {
  const id = Number(order.id);
  const accountId = Number(order.account_id);
  const totalCents = Number(order.total_cents || 0);
  const paidCents = Number(order.paid_cents || 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const progress = totalCents > 0 ? Math.min(100, Math.max(0, (paidCents / totalCents) * 100)) : 0;
  const due = dueStatus(order);
  const arrival = arrivalStatus(order);
  const activePayments = order.payments.filter((payment) => payment.status !== 'cancelado');
  const activeItems = order.items.filter((item) => item.status !== 'cancelado');
  const itemRows = activeItems
    .map((item) => `<li><span>${e(item.description)}<small>${item.due_at ? `Vence ${e(brDateOnly(item.due_at))}` : 'Sem vencimento'}</small></span><strong>${e(formatMoney(item.amount_cents))}</strong></li>`)
    .join('');
  const editableItemRows = activeItems.map((item, index) => `<div class="gestao-order-edit-row">
      <div class="gestao-order-edit-row-head">
        <strong>Parcela ${index + 1}</strong>
        <small>${item.due_at ? `Vence ${e(brDateOnly(item.due_at))}` : 'Sem vencimento'}</small>
      </div>
      <form method="post" class="gestao-order-edit-item" data-require-money>
        ${csrfField(req)}
        <input type="hidden" name="action" value="update_order_item">
        <input type="hidden" name="id" value="${e(accountId)}">
        <input type="hidden" name="item_id" value="${e(item.id)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <label><span>Nome da parcela</span><input type="text" name="item_descricao" maxlength="180" value="${e(item.description)}" required></label>
        <label><span>Valor da parcela</span><input type="text" name="item_valor" inputmode="decimal" value="${e(moneyInput(Number(item.amount_cents || 0)))}" data-money-input required></label>
        <label><span>Vencimento da parcela</span><input type="date" name="item_vencimento" value="${e(dateInputValue(item.due_at))}"></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar parcela</button>
      </form>
      <form method="post" class="gestao-order-edit-remove" data-confirm="Remover este valor da tela? A auditoria e os dados ja pagos continuam preservados.">
        ${csrfField(req)}
        <input type="hidden" name="action" value="cancel_order_item">
        <input type="hidden" name="id" value="${e(accountId)}">
        <input type="hidden" name="item_id" value="${e(item.id)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <button type="submit" class="gestao-link-danger">Retirar parcela</button>
      </form>
    </div>`).join('');
  const paymentRows = activePayments
    .slice(-4)
    .reverse()
    .map((payment) => `<li><span>${e(payment.description)}<small>${e(brDate(payment.paid_at, true))}</small></span><strong>${e(formatMoney(payment.amount_cents))}</strong></li>`)
    .join('');
  const statusLabel = order.status === 'pedido'
    ? 'Aguardando chegada'
    : (order.status === 'confirmado' ? 'Confirmado' : 'Historico');
  const canManageOrder = order.status === 'pedido' || order.status === 'confirmado';
  const canCollapseOrder = canManageOrder || order.status === 'historico';
  const editPanelId = `pedido-edit-${accountId}`;
  const detailsId = `pedido-details-${accountId}`;
  const compactStatusHtml = order.status === 'pedido'
    ? `<span class="gestao-order-mini-chip arrival-${e(arrival.key)}">${e(arrival.label)}</span>`
    : order.status === 'confirmado'
      ? `<span class="gestao-order-mini-chip due-${e(due.key)}">${e(due.label)}</span>`
      : `<span class="gestao-order-mini-chip due-none">Finalizado</span>`;
  const compactBalanceHtml = order.status === 'confirmado'
    ? `<span class="gestao-order-mini-chip balance">Saldo ${e(formatMoney(remainingCents))}</span>`
    : order.status === 'pedido' && order.account_status === 'pago'
      ? '<span class="gestao-order-mini-chip paid">Ja pago</span>'
      : `<span class="gestao-order-mini-chip balance">Saldo ${e(formatMoney(remainingCents))}</span>`;

  const arrivalAction = order.status === 'pedido' ? `<form method="post" class="gestao-order-primary-action" data-confirm="Confirmar que o pedido de ${e(order.supplier_name)} chegou?">
    ${csrfField(req)}
    <input type="hidden" name="action" value="confirm_order_arrival">
    <input type="hidden" name="order_id" value="${e(id)}">
    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
    <button type="submit" class="gestao-btn gestao-btn-primary" title="Confirmar chegada" aria-label="Confirmar chegada">Confirmar</button>
  </form>` : '';
  const paidAction = order.status === 'confirmado' && remainingCents > 0 ? `<form method="post" class="gestao-order-primary-action" data-confirm="Registrar ${e(formatMoney(remainingCents))} como pago e mover para o historico?">
      ${csrfField(req)}
      <input type="hidden" name="action" value="confirm_paid">
      <input type="hidden" name="id" value="${e(accountId)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <button type="submit" class="gestao-btn gestao-btn-primary">Pago</button>
    </form>` : '';
  const paidBeforeArrivalAction = order.status === 'pedido' && remainingCents > 0 ? `<form method="post" class="gestao-order-secondary-action" data-confirm="Marcar ${e(formatMoney(remainingCents))} como pago para ${e(order.supplier_name)}? A chegada continua pendente.">
      ${csrfField(req)}
      <input type="hidden" name="action" value="mark_waiting_order_paid">
      <input type="hidden" name="order_id" value="${e(id)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <button type="submit" class="gestao-btn gestao-btn-secondary">Ja foi pago, so falta chegar</button>
    </form>` : '';
  const quickAction = order.status === 'pedido' ? arrivalAction : paidAction;

  const editPanel = canManageOrder ? `<div class="gestao-order-edit-panel" id="${e(editPanelId)}" data-order-edit-panel>
      <div class="gestao-order-edit-section-title">Fornecedor</div>
      <form method="post" class="gestao-order-edit-supplier">
        ${csrfField(req)}
        <input type="hidden" name="action" value="update_order_supplier">
        <input type="hidden" name="id" value="${e(accountId)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <label><span>Fornecedor</span><input type="text" name="fornecedor" maxlength="180" value="${e(order.supplier_name)}" required></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar nome</button>
      </form>
      <div class="gestao-order-edit-section-title">Parcelas atuais</div>
      ${editableItemRows ? `<div class="gestao-order-edit-list">${editableItemRows}</div>` : '<p class="gestao-empty-line">Nenhuma parcela ativa.</p>'}
      <form method="post" class="gestao-order-edit-add" data-require-money>
        ${csrfField(req)}
        <input type="hidden" name="action" value="add_item">
        <input type="hidden" name="novo_item_tipo" value="parcela">
        <input type="hidden" name="id" value="${e(accountId)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <div class="gestao-order-edit-section-title">Adicionar parcela</div>
        <label><span>Valor da nova parcela</span><input type="text" name="novo_item_valor" inputmode="decimal" placeholder="0,00" data-money-input required></label>
        <label><span>Vencimento da nova parcela</span><input type="date" name="novo_item_vencimento"></label>
        <label><span>Nome opcional</span><input type="text" name="novo_item_descricao" maxlength="180" placeholder="Ex.: Parcela extra, juros ou frete"></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Adicionar parcela</button>
      </form>
    </div>` : '';

  const orderTools = canManageOrder ? `<div class="gestao-order-head-tools" aria-label="Acoes do pedido">
      <button type="button" class="gestao-icon-btn gestao-icon-btn-edit" title="Editar fornecedor e valores" aria-label="Editar fornecedor e valores" aria-controls="${e(editPanelId)}" aria-expanded="false" data-order-edit-toggle>
        <span aria-hidden="true">&#9998;</span>
      </button>
      <form method="post" class="gestao-order-icon-form" data-confirm="Arquivar este pedido da tela? Use quando nao houver necessidade de registrar o boleto. Historico e auditoria continuam preservados.">
        ${csrfField(req)}
        <input type="hidden" name="action" value="archive_order">
        <input type="hidden" name="id" value="${e(accountId)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <button type="submit" class="gestao-icon-btn gestao-icon-btn-danger" title="Excluir desta tela" aria-label="Excluir desta tela">
          <span aria-hidden="true">&times;</span>
        </button>
      </form>
    </div>` : '';

  const confirmedActions = order.status === 'confirmado' ? `<div class="gestao-order-actions">
    <form method="post" class="gestao-order-due-form">
      ${csrfField(req)}
      <input type="hidden" name="action" value="update_due">
      <input type="hidden" name="id" value="${e(accountId)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <label><span>Vencimento para todas parcelas</span><input type="date" name="vencimento_em" value="${e(dateInputValue(order.item_due_at || order.due_at))}"></label>
      <button type="submit" class="gestao-btn gestao-btn-secondary">Aplicar</button>
      <button type="submit" name="limpar_vencimento" value="1" class="gestao-btn gestao-btn-ghost">Limpar datas</button>
    </form>
    ${remainingCents > 0 ? `<form method="post" class="gestao-order-pay-form" data-require-money>
      ${csrfField(req)}
      <input type="hidden" name="action" value="add_payment">
      <input type="hidden" name="id" value="${e(accountId)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <input type="hidden" name="pagamento_descricao" value="Pagamento pedido ${e(order.supplier_name)}">
      <label><span>Pagamento parcial</span><input type="text" name="pagamento_valor" inputmode="decimal" placeholder="0,00" data-money-input></label>
      <label><span>Data do pagamento</span><input type="date" name="pagamento_em" value="${e(localDateInput())}"></label>
      <button type="submit" class="gestao-btn gestao-btn-secondary">Registrar parcial</button>
    </form>
    ${paidAction}` : ''}
    <form method="post" class="gestao-order-adjust-form" data-require-money>
      ${csrfField(req)}
      <input type="hidden" name="action" value="add_item">
      <input type="hidden" name="id" value="${e(accountId)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <label><span>Adicionar valor ou juros</span><input type="text" name="novo_item_descricao" maxlength="180" placeholder="Juros, multa, diferenca"></label>
      <label><span>Valor</span><input type="text" name="novo_item_valor" inputmode="decimal" placeholder="0,00" data-money-input></label>
      <label><span>Vencimento</span><input type="date" name="novo_item_vencimento"></label>
      <button type="submit" class="gestao-btn gestao-btn-secondary">Adicionar</button>
    </form>
  </div>` : '';

  return `<article class="gestao-order-card status-${e(order.status)} due-${e(due.key)} arrival-${e(arrival.key)}" ${canCollapseOrder ? `data-order-card-collapse data-order-card-id="${e(accountId)}" data-order-card-kind="${e(order.status)}"` : ''}>
    <div class="gestao-order-head">
      ${canCollapseOrder ? `<div class="gestao-order-summary-toggle" role="button" tabindex="0" title="Abrir ou recolher detalhes do pedido" aria-label="Abrir ou recolher detalhes do pedido" aria-controls="${e(detailsId)}" aria-expanded="true" data-order-collapse-toggle>` : '<div class="gestao-order-summary-static">'}
        <span>
          <span class="gestao-pill">${e(statusLabel)}</span>
          <h2>${e(order.supplier_name)}</h2>
          <small class="gestao-order-compact-meta">${compactStatusHtml}${compactBalanceHtml}</small>
        </span>
        <strong>${e(formatMoney(totalCents))}</strong>
      </div>
      <div class="gestao-order-head-side">
        ${orderTools}
      </div>
    </div>
    ${quickAction ? `<div class="gestao-order-quick-action" data-order-quick-action>${quickAction}</div>` : ''}
    <div class="gestao-order-card-details" id="${e(detailsId)}" data-order-card-details>
      ${editPanel}
      <div class="gestao-order-meta">
        <span>Criado ${e(brDate(order.created_at, true))}</span>
        ${order.expected_arrival_at ? `<span>Chegada ${e(brDateOnly(order.expected_arrival_at))}</span>` : '<span>Chegada sem previsao</span>'}
        ${order.confirmed_at ? `<span>Confirmado ${e(brDate(order.confirmed_at, true))}</span>` : ''}
        ${order.finished_at ? `<span>Finalizado ${e(brDate(order.finished_at, true))}</span>` : ''}
      </div>
      <div class="gestao-order-flags">
        ${order.status === 'pedido' ? `<span class="gestao-order-flag arrival-${e(arrival.key)}">${e(arrival.label)}</span>` : `<span class="gestao-order-flag due-${e(due.key)}">${e(due.label)}</span>`}
        <span>Alimenta Boleto</span>
      </div>
      <div class="gestao-balance">
        <span>Total <strong>${e(formatMoney(totalCents))}</strong></span>
        <span>Pago <strong>${e(formatMoney(paidCents))}</strong></span>
        <span>Saldo <strong>${e(formatMoney(remainingCents))}</strong></span>
      </div>
      <div class="gestao-progress" aria-hidden="true"><span style="width:${progress.toFixed(2)}%"></span></div>
      ${itemRows ? `<ul class="gestao-order-lines">${itemRows}</ul>` : ''}
      ${paymentRows ? `<ul class="gestao-order-payments">${paymentRows}</ul>` : ''}
      ${paidBeforeArrivalAction}
      ${order.status === 'pedido' && order.account_status === 'pago' ? '<p class="gestao-empty-line">Ja esta pago; ao confirmar a chegada, vai direto para o historico.</p>' : ''}
      ${arrivalAction}
      ${confirmedActions}
    </div>
  </article>`;
}

async function renderApp(req: Request): Promise<string> {
  const selectedMonth = monthValue(req.query.mes);
  const flash = takeFlash(req);
  const orders = await listOrders(selectedMonth);
  const badge = await ordersBadge();
  const arrivingToday = badge.arrivingToday;
  const paidMonth = await paidThisMonth(selectedMonth);
  const waitingOrders = orders.filter((order) => order.status === 'pedido');
  const confirmedOrders = orders.filter((order) => order.status === 'confirmado');
  const historyOrders = orders.filter((order) => order.status === 'historico').slice(0, 12);
  const openTicketBalances = confirmedOrders
    .map((order) => Math.max(0, Number(order.total_cents || 0) - Number(order.paid_cents || 0)))
    .filter((remainingCents) => remainingCents > 0);
  const waitingTicketValue = waitingOrders.reduce(
    (sum, order) => sum + Math.max(0, Number(order.total_cents || 0) - Number(order.paid_cents || 0)),
    0,
  );
  const openTickets = openTicketBalances.length;
  const openTicketsValue = openTicketBalances.reduce((sum, remainingCents) => sum + remainingCents, 0);
  const waitingHtml = waitingOrders.length
    ? waitingOrders.map((order) => renderOrderCard(req, order, selectedMonth)).join('')
    : '<div class="gestao-empty">Nenhum pedido aguardando chegada.</div>';
  const confirmedHtml = confirmedOrders.length
    ? confirmedOrders.map((order) => renderOrderCard(req, order, selectedMonth)).join('')
    : '<div class="gestao-empty">Nenhum pedido confirmado aguardando pagamento.</div>';
  const historyHtml = historyOrders.length
    ? historyOrders.map((order) => renderOrderCard(req, order, selectedMonth)).join('')
    : '<div class="gestao-empty">Historico de pedidos ainda vazio neste mes.</div>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedidos - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260530-parcel-edit">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260529a">
  <script src="${BASE_PATH}/app.js?v=20260530-history-collapse" defer></script>
</head>
<body>
  <header class="gestao-topbar">
    <a class="gestao-brand" href="/">
      <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
      <span>Pedidos</span>
    </a>
    <nav class="gestao-nav" aria-label="Navegacao">
      <a href="/">Home</a>
      <a href="${BASE_PATH}/logout.php">Sair</a>
    </nav>
  </header>
  <main class="gestao-page">
    <section class="gestao-hero">
      <div>
        <span class="gestao-kicker">Fornecedores</span>
        <h1>Pedidos</h1>
        <p>Registro, chegada, vencimento de boleto, pagamentos e historico sem misturar a tela de Gestao.</p>
      </div>
      <form method="get" class="gestao-month-filter">
        <label><span>Mes</span><input type="month" name="mes" value="${e(selectedMonth)}"></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Ver</button>
      </form>
    </section>
    ${flash.message ? `<div class="gestao-alert ${flash.type === 'error' ? 'error' : ''}">${e(flash.message)}</div>` : ''}
    <section class="gestao-orders-workspace">
      <div class="gestao-orders-summary">
        <div><span>Chegam hoje</span><strong>${e(arrivingToday)}</strong></div>
        <div><span>Aguardando chegada</span><strong>${e(waitingOrders.length)}</strong></div>
        <div><span>Valor para chegar</span><strong>${e(formatMoney(waitingTicketValue))}</strong></div>
        <div><span>Boletos em aberto</span><strong>${e(openTickets)}</strong></div>
        <div><span>Valor boletos abertos</span><strong>${e(formatMoney(openTicketsValue))}</strong></div>
        <div><span>Pago em pedidos</span><strong>${e(formatMoney(paidMonth))}</strong></div>
      </div>
      <div class="gestao-orders-layout">
        <aside class="gestao-orders-side">
          <div class="gestao-orders-panel">
            <div class="gestao-section-title"><span class="gestao-kicker">Pedidos feitos</span><strong>${e(waitingOrders.length)}</strong></div>
            ${renderOrderForm(req, selectedMonth)}
          </div>
        </aside>
        <section class="gestao-orders-panel gestao-orders-waiting">
          <div class="gestao-section-title"><span class="gestao-kicker">Aguardando chegada</span><strong>${e(waitingOrders.length)}</strong></div>
          <div class="gestao-orders-stack gestao-orders-waiting-stack">${waitingHtml}</div>
        </section>
        <section class="gestao-orders-panel gestao-orders-confirmed">
          <div class="gestao-section-title"><span class="gestao-kicker">Confirmados</span><strong>vencimento primeiro</strong></div>
          <div class="gestao-orders-stack">${confirmedHtml}</div>
        </section>
        <aside class="gestao-orders-panel gestao-orders-history">
          <div class="gestao-section-title"><span class="gestao-kicker">Historico</span><strong>${e(historyOrders.length)}</strong></div>
          <div class="gestao-orders-stack">${historyHtml}</div>
        </aside>
      </div>
    </section>
  </main>
  <script src="/miauw/widget.js?v=20260529a" defer></script>
</body>
</html>`;
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedidos - Login</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260529-form-clean">
  <script src="${BASE_PATH}/login-runner.js?v=20260520-compact" defer></script>
</head>
<body class="gestao-login-body">
  <img class="gestao-login-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
  <main class="gestao-login-card">
    <img class="gestao-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
    <span class="gestao-kicker">Area interna</span>
    <h1>Pedidos</h1>
    <p>Controle de chegada de fornecedores e boletos.</p>
    ${error ? `<div class="gestao-alert error">${e(error)}</div>` : ''}
    <form method="post" class="gestao-login-form" action="${BASE_PATH}/login.php">
      ${csrfField(req)}
      <label><span>Usuario</span><input type="text" name="username" required autofocus autocomplete="username" value="${e(req.body?.username || '')}"></label>
      <label><span>Senha</span><input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit" class="gestao-btn gestao-btn-primary">Entrar</button>
    </form>
  </main>
</body>
</html>`;
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.set('etag', false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'self'; form-action 'self';",
  );
  if (req.path === `${BASE_PATH}/` || req.path === BASE_PATH || req.path.startsWith(`${BASE_PATH}/api`)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(path.join(rootDir, 'public'), {
  index: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  await pgPool.query('SELECT 1');
  const auth = await coreAuthHealth();
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: 'wimifarma_gestao',
      legacy_mysql_required: false,
    },
    mysql_dependency: false,
    mysql_auth: false,
    mysql_auth_fallback: false,
    mysql_reachable: false,
    internal_token_configured: INTERNAL_TOKEN !== '',
    auth,
  });
}));

app.get(`${BASE_PATH}/api/badge`, asyncRoute(async (_req, res) => {
  const badge = await ordersBadge();
  res.json({
    ok: true,
    count: badge.awaitingArrival,
    awaiting_arrival: badge.awaitingArrival,
    arriving_today: badge.arrivingToday,
  });
}));

app.get(`${BASE_PATH}/api/internal/arrival-summary`, requireInternalToken, asyncRoute(async (req, res) => {
  const limit = Math.max(1, Math.min(120, Number(req.query.limit || 80) || 80));
  const orders = await listWaitingArrivalInternal(limit);
  const totalCents = orders.reduce((sum, order) => sum + Number(order.remaining_cents || order.total_cents || 0), 0);
  res.json({
    ok: true,
    source: 'postgres',
    count: orders.length,
    total_cents: totalCents,
    total_label: formatMoney(totalCents),
    orders: orders.map((order) => arrivalOrderPublic(order)),
  });
}));

app.post(`${BASE_PATH}/api/internal/confirm-arrival`, requireInternalToken, asyncRoute(async (req, res) => {
  const orderId = Number(req.body?.order_id || 0);
  const actorLabel = cleanText(req.body?.actor || 'Miauby WhatsApp', 80) || 'Miauby WhatsApp';
  if (orderId > 0) {
    const confirmed = await confirmArrivalByOrderId(orderId, null, actorLabel);
    res.json({
      ok: true,
      status: confirmed.movedToHistory ? 'historico' : 'confirmado',
      message: confirmed.movedToHistory
        ? `${confirmed.supplierName} chegou e foi para Historico porque ja estava pago.`
        : `${confirmed.supplierName} chegou e ficou em Confirmados para pagar.`,
    });
    return;
  }
  const result = await confirmArrivalBySupplier(req.body?.supplier_name || req.body?.title || req.body?.message, actorLabel);
  res.status(result.ok === false ? 409 : 200).json(result);
}));

app.get(`${BASE_PATH}/login`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req));
});
app.get(`${BASE_PATH}/login.php`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req, req.query.restrito ? 'Pedidos e area restrita para adm, admin ou gerente.' : ''));
});
app.post(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  const expected = req.session.csrfToken || '';
  if (!expected || expected !== String(req.body.csrf_token || '')) {
    return res.status(403).type('html').send(renderLogin(req, 'Sessao expirada. Tente novamente.'));
  }
  const waitSeconds = loginWaitSeconds(req);
  if (waitSeconds > 0) {
    return res.status(429).type('html').send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`));
  }

  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || '');
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    await logAudit(null, 'login_pedidos_falha', 'user', null, `Tentativa de login Pedidos falhou para usuario: ${username}`);
    return res.status(401).type('html').send(renderLogin(req, 'Usuario, senha ou permissao incorretos.'));
  }

  const returnTo = safePedidosReturnPath(req.session.returnTo) || `${BASE_PATH}/`;
  clearLoginRateLimit(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[pedidos] session regenerate failed', error);
      return res.status(500).type('html').send(renderLogin(req, 'Nao consegui abrir sua sessao agora.'));
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logAudit(user.id, 'login_pedidos', 'user', user.id, 'Login Pedidos Node realizado.');
    res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
app.get(`${BASE_PATH}/index.php`, requireAuth, (_req, res) => res.redirect(`${BASE_PATH}/`));
app.get([BASE_PATH, `${BASE_PATH}/`], requireAuth, asyncRoute(async (req, res) => {
  res.type('html').send(await renderApp(req));
}));

async function handlePost(req: Request, res: Response): Promise<void> {
  const action = String(req.body.action || '');
  const selectedMonth = monthValue(req.body.competencia_mes);
  try {
    if (action === 'create_order') {
      const created = await createOrder(req);
      const message = created.arrivedNow
        ? (created.paidNow ? 'Pedido registrado, recebido e enviado ao historico.' : 'Pedido registrado direto em Confirmados.')
        : 'Pedido registrado. Quando chegar, confirme no card Pedidos feitos.';
      setFlash(req, 'success', message);
    } else if (action === 'confirm_order_arrival') {
      await confirmArrival(req);
      setFlash(req, 'success', 'Chegada confirmada. Se ainda tiver saldo, o boleto ficou em Confirmados.');
    } else if (action === 'add_item') {
      await addItem(req);
      setFlash(req, 'success', 'Valor adicionado ao boleto do pedido.');
    } else if (action === 'add_payment') {
      await addPayment(req);
      setFlash(req, 'success', 'Pagamento parcial registrado.');
    } else if (action === 'mark_waiting_order_paid') {
      await markWaitingOrderAsPaid(req);
      setFlash(req, 'success', 'Pedido marcado como pago. Quando chegar, confirme a chegada para ir ao historico.');
    } else if (action === 'confirm_paid') {
      await confirmRemaining(req);
      setFlash(req, 'success', 'Boleto pago e enviado para o historico.');
    } else if (action === 'update_due') {
      await updateDue(req);
      setFlash(req, 'success', req.body.limpar_vencimento === '1' ? 'Vencimento removido.' : 'Vencimento atualizado.');
    } else if (action === 'update_order_supplier') {
      await updateOrderSupplier(req);
      setFlash(req, 'success', 'Fornecedor atualizado com auditoria.');
    } else if (action === 'update_order_item') {
      await updateOrderItem(req);
      setFlash(req, 'success', 'Valor do pedido atualizado.');
    } else if (action === 'cancel_order_item') {
      await cancelOrderItem(req);
      setFlash(req, 'success', 'Valor removido da tela com auditoria preservada.');
    } else if (action === 'archive_order') {
      await archiveOrder(req);
      setFlash(req, 'success', 'Pedido saiu da tela, mantendo historico e auditoria.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar esse pedido agora.');
  }
  redirectHome(res, selectedMonth);
}

app.post(`${BASE_PATH}/`, requireAuth, verifyCsrf, asyncRoute(handlePost));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[pedidos] request failed', error);
  if (res.headersSent) return;
  res.status(500).type('html').send('Pedidos indisponivel agora.');
});

async function withRetry(name: string, fn: () => Promise<unknown>, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[pedidos] waiting for ${name} (${index}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function start() {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  await withRetry('core-postgres', () => corePgPool.query('SELECT 1'));
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`[pedidos] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[pedidos] failed to start', error);
  process.exit(1);
});
