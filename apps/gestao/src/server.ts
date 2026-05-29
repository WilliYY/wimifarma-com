import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import mysql from 'mysql2/promise';
import pg from 'pg';

const { Pool } = pg;

type User = {
  id: number;
  username: string;
  role: string;
};

type AuthProvider = 'mysql' | 'core';

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

type AccountRow = {
  id: string;
  title: string;
  category: string;
  status: 'pendente' | 'pago' | 'cancelado';
  total_cents: string;
  competence_month: string;
  note: string | null;
  due_at: Date | string | null;
  repeat_next_month: boolean;
  monthly_sort_order: number;
  repeated_from_account_id: string | null;
  created_by: number | null;
  generated_at: Date | string;
  paid_at: Date | string | null;
  canceled_at: Date | string | null;
  archived_at: Date | string | null;
  archived_by: number | null;
  paid_cents?: string;
  last_payment_at?: Date | string | null;
};

type ItemRow = {
  id: string;
  account_id: string;
  description: string;
  amount_cents: string;
  sort_order: number;
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

type SupplierOrderStatus = 'pedido' | 'confirmado' | 'historico' | 'cancelado';

type AuditEventRow = {
  id: string;
  account_id: string | null;
  user_id: number | null;
  action: string;
  summary: string;
  created_at: Date | string;
};

type NotepadRow = {
  id: string;
  body: string;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CategorySummary = {
  key: string;
  label: string;
  openCount: number;
  closedCount: number;
  canceledCount: number;
  openCents: number;
  closedCents: number;
};

type RenderAccount = AccountRow & {
  items: ItemRow[];
  payments: PaymentRow[];
  auditEvents: AuditEventRow[];
};

type AccountSearchResult = {
  account: RenderAccount;
  score: number;
};

type MysqlUserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: number;
};

type CoreUserRow = {
  id: string;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const env = process.env;

const SERVICE_NAME = 'gestao';
const SERVICE_VERSION = '1.6.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/gestao');
const PORT = Number.parseInt(env.PORT || '3200', 10);
const SESSION_SECRET = env.GESTAO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const INTERNAL_TOKEN = String(env.GESTAO_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || '').trim();
const TZ = 'America/Sao_Paulo';
const AUTH_PROVIDER = normalizeAuthProvider(env.GESTAO_AUTH_PROVIDER || 'core');
const MYSQL_AUTH_FALLBACK_ENABLED = normalizeBoolean(env.GESTAO_AUTH_MYSQL_FALLBACK_ENABLED ?? 'true');
const CORE_AUTH_SHADOW_ENABLED = normalizeBoolean(env.GESTAO_CORE_AUTH_SHADOW_ENABLED);
const CORE_AUTH_SHADOW_TIMEOUT_MS = Math.max(
  500,
  Math.min(10000, Number.parseInt(env.GESTAO_CORE_AUTH_SHADOW_TIMEOUT_MS || '1500', 10) || 1500),
);
const CORE_AUTH_REQUIRED = AUTH_PROVIDER === 'core' || CORE_AUTH_SHADOW_ENABLED;

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_gestao',
  user: env.POSTGRES_USER || 'wimifarma_gestao',
  password: env.POSTGRES_PASSWORD || '',
  max: 12,
});

const mysqlPool = mysql.createPool({
  host: env.MYSQL_HOST || '127.0.0.1',
  port: Number(env.MYSQL_PORT || 3306),
  database: env.MYSQL_DATABASE || 'wimifarma_app',
  user: env.MYSQL_USER || 'wimifarma_user',
  password: env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4',
  dateStrings: true,
  connectTimeout: Number(env.MYSQL_CONNECT_TIMEOUT_MS || 3000),
});

const corePgPool = CORE_AUTH_REQUIRED
  ? new Pool({
      host: env.CORE_POSTGRES_HOST || '127.0.0.1',
      port: Number(env.CORE_POSTGRES_PORT || 5432),
      database: env.CORE_POSTGRES_DB || 'wimifarma_core',
      user: env.CORE_POSTGRES_USER || 'wimifarma_core',
      password: env.CORE_POSTGRES_PASSWORD || '',
      max: 4,
      connectionTimeoutMillis: CORE_AUTH_SHADOW_TIMEOUT_MS,
      statement_timeout: CORE_AUTH_SHADOW_TIMEOUT_MS,
      query_timeout: CORE_AUTH_SHADOW_TIMEOUT_MS,
    })
  : null;

const coreAuthShadow = {
  enabled: CORE_AUTH_SHADOW_ENABLED,
  attempts: 0,
  ok: 0,
  mismatches: 0,
  errors: 0,
  lastStatus: 'idle',
  lastLatencyMs: null as number | null,
  lastCheckedAt: null as string | null,
};

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFGESTAO',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'gestao_sessions',
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

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean === '' ? '/gestao' : clean;
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

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function normalizeAuthProvider(value: unknown): AuthProvider {
  return String(value || 'mysql').trim().toLowerCase() === 'core' ? 'core' : 'mysql';
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

function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
  }

  const received = String(req.get('x-miauw-internal-token') || req.get('x-gestao-internal-token') || '').trim();
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  return next();
}

function isAllowedUser(user: { username?: unknown; role?: unknown }): boolean {
  const username = String(user.username || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return username === 'adm' || role === 'admin' || role === 'gerente';
}

function userPublic(row: MysqlUserRow): User {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role || 'user'),
  };
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

function csrfMatches(req: Request): boolean {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  return Boolean(expected && received && expected === received);
}

function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    return redirectHome(res, monthValue(req.body?.competencia_mes), currentView(req));
  }
  return next();
}

function safeGestaoReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://gestao.local');
    const allowedPaths = new Set([
      `${BASE_PATH}/`,
      `${BASE_PATH}/index.php`,
    ]);
    if (!allowedPaths.has(url.pathname)) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || !isAllowedUser(req.session.user)) {
    const returnTo = safeGestaoReturnPath(req.originalUrl);
    if (returnTo) req.session.returnTo = returnTo;
    return res.redirect(`${BASE_PATH}/login.php`);
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

function redirectHome(res: Response, month = '', _view = ''): void {
  const target = month ? `${BASE_PATH}/?mes=${encodeURIComponent(month)}` : `${BASE_PATH}/`;
  res.redirect(target);
}

function loginRedirectTarget(req: Request): string {
  const target = safeGestaoReturnPath(req.session.returnTo);
  delete req.session.returnTo;
  return target || `${BASE_PATH}/`;
}

function currentView(_req: Request): '' {
  return '';
}

function monthValue(value?: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(text)) {
    const month = Number.parseInt(text.slice(5, 7), 10);
    if (month >= 1 && month <= 12) {
      return text;
    }
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const normalized = monthValue(month);
  return `${normalized.slice(5, 7)}/${normalized.slice(0, 4)}`;
}

function nextMonthValue(month: string): string {
  const normalized = monthValue(month);
  const year = Number.parseInt(normalized.slice(0, 4), 10);
  const monthIndex = Number.parseInt(normalized.slice(5, 7), 10);
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextMonthDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
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
  let text = String(value ?? '').replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function formatMoney(cents: unknown): string {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function moneyInput(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function brDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
  }).format(date);
}

function brDateOnly(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}`;
  }
  return brDate(value, false);
}

function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function datetimeLocalValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function datetimeLocalInput(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function parseDatetimeLocal(value: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    return `${text}:00-03:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T12:00:00-03:00`;
  }
  return new Date().toISOString();
}

function parseOptionalDatetimeLocal(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return parseDatetimeLocal(text);
}

function parseOptionalDate(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

function queryValue(value: unknown): string {
  return cleanText(value, 120);
}

function searchLimitValue(value: unknown): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(80, Math.max(10, parsed));
}

function searchNormalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function searchTokens(query: string): string[] {
  return Array.from(new Set(searchNormalize(query).split(' ').filter((token) => token.length >= 2)));
}

function moneySearchCents(query: string): number | null {
  const moneyMatch = query.match(/(?:r\$\s*)?\d+(?:\.\d{3})*(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:\.\d{1,2})?/i);
  if (!moneyMatch) return null;
  const cents = parseMoneyToCents(moneyMatch[0]);
  return cents > 0 ? cents : null;
}

function accountSearchText(account: RenderAccount, totalCents: number, paidCents: number, remainingCents: number): string {
  const pieces = [
    account.title,
    account.category,
    accountStatusLabel(account.status),
    monthLabel(account.competence_month),
    brDate(account.generated_at, true),
    brDateOnly(account.generated_at),
    brDate(account.due_at, true),
    brDateOnly(account.due_at),
    brDate(account.paid_at, true),
    brDateOnly(account.paid_at),
    formatMoney(totalCents),
    formatMoney(paidCents),
    formatMoney(remainingCents),
    moneyInput(totalCents),
    moneyInput(paidCents),
    moneyInput(remainingCents),
    ...account.items.flatMap((item) => [
      item.description,
      item.status,
      brDate(item.created_at, true),
      brDateOnly(item.created_at),
      formatMoney(item.amount_cents),
      moneyInput(Number(item.amount_cents || 0)),
    ]),
    ...account.payments.flatMap((payment) => [
      payment.description,
      payment.item_description || '',
      payment.status,
      brDate(payment.paid_at, true),
      brDateOnly(payment.paid_at),
      formatMoney(payment.amount_cents),
      moneyInput(Number(payment.amount_cents || 0)),
    ]),
  ];
  return searchNormalize(pieces.filter(Boolean).join(' '));
}

function moneyClosenessScore(target: number, candidates: number[]): number {
  let best = 0;
  for (const candidate of candidates) {
    if (candidate <= 0) continue;
    const diff = Math.abs(candidate - target);
    if (diff === 0) {
      best = Math.max(best, 120);
    } else if (diff <= 500) {
      best = Math.max(best, 85);
    } else if (diff <= 2000) {
      best = Math.max(best, 55);
    } else {
      const ratio = diff / Math.max(candidate, target, 1);
      if (ratio <= 0.1) best = Math.max(best, 35);
    }
  }
  return best;
}

function searchAccounts(accounts: RenderAccount[], query: string): AccountSearchResult[] {
  const trimmed = queryValue(query);
  if (!trimmed) return [];
  const normalized = searchNormalize(trimmed);
  const tokens = searchTokens(trimmed);
  const searchedCents = moneySearchCents(trimmed);
  const results: AccountSearchResult[] = [];

  accounts.forEach((account, index) => {
    const totalCents = Number(account.total_cents || 0);
    const paidCents = Number(account.paid_cents || 0);
    const remainingCents = Math.max(0, totalCents - paidCents);
    const titleText = searchNormalize(account.title);
    const categoryText = searchNormalize(account.category);
    const statusText = searchNormalize(accountStatusLabel(account.status));
    const fullText = accountSearchText(account, totalCents, paidCents, remainingCents);
    let score = 0;

    if (normalized && fullText.includes(normalized)) score += 120;
    if (normalized && titleText.includes(normalized)) score += 90;
    if (normalized && categoryText.includes(normalized)) score += 60;
    if (normalized && statusText.includes(normalized)) score += 30;

    for (const token of tokens) {
      if (titleText.includes(token)) score += 28;
      else if (categoryText.includes(token)) score += 18;
      else if (fullText.includes(token)) score += 10;
    }

    if (searchedCents !== null) {
      const candidates = [
        totalCents,
        paidCents,
        remainingCents,
        ...account.items.map((item) => Number(item.amount_cents || 0)),
        ...account.payments.map((payment) => Number(payment.amount_cents || 0)),
      ];
      score += moneyClosenessScore(searchedCents, candidates);
    }

    if (score > 0) {
      results.push({ account, score: score * 1000 - index });
    }
  });

  return results.sort((a, b) => b.score - a.score);
}

function gestaoListUrl(month: string, categoryKeyValue = '', search = '', limit = 0): string {
  const params = new URLSearchParams();
  params.set('mes', monthValue(month));
  if (categoryKeyValue) params.set('categoria', categoryKeyValue);
  if (search) params.set('busca', search);
  if (limit > 10) params.set('limite', String(limit));
  return `${BASE_PATH}/?${params.toString()}`;
}

function bodyArray(body: Record<string, unknown>, field: string): unknown[] {
  const value = body[field] ?? body[`${field}[]`];
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function categoryKey(value: unknown): string {
  const normalized = categoryLabel(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return normalized || 'geral';
}

function dueStatus(account: AccountRow): { key: string; label: string; days: number | null } {
  if (!account.due_at || account.status !== 'pendente') return { key: 'none', label: '', days: null };
  const due = account.due_at instanceof Date ? account.due_at : new Date(String(account.due_at));
  if (Number.isNaN(due.getTime())) return { key: 'none', label: '', days: null };
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((dueStart - todayStart) / 86400000);
  if (days < 0) return { key: 'overdue', label: `Venceu ha ${Math.abs(days)} dia(s)`, days };
  if (days === 0) return { key: 'today', label: 'Urgente: vence hoje', days };
  if (days <= 3) return { key: 'soon', label: `Vence em ${days} dia(s)`, days };
  return { key: 'scheduled', label: `Vence em ${days} dia(s)`, days };
}

function mysqlDateToPg(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text || text === '0000-00-00 00:00:00') return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return `${text.replace(' ', 'T')}-03:00`;
  }
  return text;
}

function accountStatusLabel(status: string): string {
  if (status === 'pago') return 'Pago';
  if (status === 'cancelado') return 'Cancelado';
  return 'Pendente';
}

function categoryLabel(value: unknown): string {
  const category = cleanText(value, 80);
  return category || 'Geral';
}

function categorySuggestions(): string[] {
  return [
    'Geral',
    'Funcionario',
    'Fornecedor',
    'Boleto',
    'Imposto',
    'Comissao',
    'Aluguel',
    'Energia',
    'Internet',
    'Medicamentos',
    'Servico',
    'Manutencao',
    'Outro',
  ];
}

function registerLoginFailure(req: Request): void {
  const now = Date.now();
  const attempts = Array.isArray(req.session.loginAttempts) ? req.session.loginAttempts : [];
  const fresh = attempts.filter((timestamp) => Number.isFinite(timestamp) && now - timestamp <= 15 * 60 * 1000);
  fresh.push(now);
  req.session.loginAttempts = fresh;
  if (fresh.length >= 5) {
    req.session.loginBlockedUntil = now + 10 * 60 * 1000;
  }
}

function loginWaitSeconds(req: Request): number {
  const blockedUntil = Number(req.session.loginBlockedUntil || 0);
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function clearLoginRateLimit(req: Request): void {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
}

async function authenticate(username: string, password: string): Promise<User | null> {
  if (AUTH_PROVIDER === 'core') {
    try {
      const coreUser = await authenticateCore(username, password);
      if (coreUser) return coreUser;
    } catch (error) {
      console.warn('[gestao] core auth failed', {
        username: maskUsername(username),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!MYSQL_AUTH_FALLBACK_ENABLED) return null;
    try {
      return await authenticateMysql(username, password);
    } catch (error) {
      console.warn('[gestao] mysql auth fallback failed', {
        username: maskUsername(username),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return authenticateMysql(username, password);
}

async function authenticateMysql(username: string, password: string): Promise<User | null> {
  const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
    'SELECT id, username, password_hash, role, active FROM wf_users WHERE username = ? AND active = 1 LIMIT 1',
    [username],
  );
  const user = rows[0] as MysqlUserRow | undefined;
  if (!user) return null;

  let ok = false;
  if (user.password_hash) {
    ok = await bcrypt.compare(password, normalizeHash(user.password_hash));
  }
  if (!ok && String(user.username || '').trim().toLowerCase() === 'adm') {
    ok = timingSafeStringEqual(password, 'adm');
  }

  if (!ok || !isAllowedUser(user)) return null;
  return userPublic(user);
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

async function shadowCoreAuth(username: string, password: string, mysqlUser: User): Promise<void> {
  if (!CORE_AUTH_SHADOW_ENABLED || AUTH_PROVIDER !== 'mysql' || !corePgPool) return;
  const startedAt = Date.now();
  coreAuthShadow.attempts += 1;
  try {
    const coreUser = await authenticateCore(username, password);
    const latencyMs = Date.now() - startedAt;
    const sameUser = Boolean(
      coreUser &&
      Number(coreUser.id) === Number(mysqlUser.id) &&
      normalizeUsername(coreUser.username) === normalizeUsername(mysqlUser.username) &&
      String(coreUser.role || 'user') === String(mysqlUser.role || 'user'),
    );
    coreAuthShadow.lastLatencyMs = latencyMs;
    coreAuthShadow.lastCheckedAt = new Date().toISOString();
    if (sameUser) {
      coreAuthShadow.ok += 1;
      coreAuthShadow.lastStatus = 'ok';
      console.info('[gestao] core auth shadow ok', {
        username: maskUsername(username),
        userId: mysqlUser.id,
        latencyMs,
      });
      return;
    }

    coreAuthShadow.mismatches += 1;
    coreAuthShadow.lastStatus = 'mismatch';
    console.warn('[gestao] core auth shadow mismatch', {
      username: maskUsername(username),
      mysqlUserId: mysqlUser.id,
      coreFound: Boolean(coreUser),
      coreUserId: coreUser?.id || null,
      latencyMs,
    });
  } catch (error) {
    coreAuthShadow.errors += 1;
    coreAuthShadow.lastLatencyMs = Date.now() - startedAt;
    coreAuthShadow.lastCheckedAt = new Date().toISOString();
    coreAuthShadow.lastStatus = 'error';
    console.warn('[gestao] core auth shadow failed', {
      username: maskUsername(username),
      error: error instanceof Error ? error.message : String(error),
      latencyMs: coreAuthShadow.lastLatencyMs,
    });
  }
}

async function coreAuthHealth(): Promise<Record<string, unknown>> {
  const state = {
    provider: AUTH_PROVIDER,
    mysqlFallbackEnabled: MYSQL_AUTH_FALLBACK_ENABLED,
    shadowEnabled: CORE_AUTH_SHADOW_ENABLED,
    shadow: { ...coreAuthShadow },
  };
  if (!CORE_AUTH_REQUIRED || !corePgPool) {
    return state;
  }

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

async function logMysql(userId: number | null, action: string, entityType: string | null, entityId: number | null, message: string): Promise<void> {
  await logCoreAudit(userId, action, entityType || 'legacy_log', entityId === null ? null : String(entityId), message);
  try {
    await mysqlPool.query(
      'INSERT INTO wf_logs (user_id, action, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, cleanText(message, 255)],
    );
  } catch (error) {
    console.warn('[gestao] wf_logs failed', error);
  }
}

async function logCoreAudit(userId: number | null, action: string, entityType: string, entityId: string | null, detail: string): Promise<void> {
  if (!corePgPool) return;
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
    console.warn('[gestao] failed to write core audit log', error);
  }
}

async function pgTableExists(tableName: string, client: pg.Pool | pg.PoolClient = pgPool): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.exists);
}

async function auditPg(client: pg.PoolClient, accountId: number | null, userId: number | null, action: string, summary: string): Promise<void> {
  await client.query(
    'INSERT INTO gestao_audit_events (account_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [accountId, userId, action, cleanText(summary, 255)],
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label: string, task: () => Promise<unknown>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[gestao] waiting for ${label} (${attempt}/40)`, error);
      await sleep(1000);
    }
  }
  throw lastError;
}

async function ensureSchema(): Promise<void> {
  await pgPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_accounts (
      id bigserial PRIMARY KEY,
      source_mysql_id bigint UNIQUE,
      title varchar(180) NOT NULL,
      category varchar(80) NOT NULL DEFAULT 'Geral',
      status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
      total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
      competence_month char(7) NOT NULL CHECK (competence_month ~ '^[0-9]{4}-[0-9]{2}$'),
      note text,
      created_by integer,
      generated_at timestamptz NOT NULL DEFAULT now(),
      paid_at timestamptz,
      canceled_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_account_items (
      id bigserial PRIMARY KEY,
      source_mysql_id bigint UNIQUE,
      account_id bigint NOT NULL REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      description varchar(180) NOT NULL,
      amount_cents integer NOT NULL CHECK (amount_cents > 0),
      sort_order integer NOT NULL DEFAULT 0,
      due_at date,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_account_payments (
      id bigserial PRIMARY KEY,
      source_mysql_id bigint UNIQUE,
      account_id bigint NOT NULL REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      description varchar(180) NOT NULL DEFAULT 'Pagamento',
      amount_cents integer NOT NULL CHECK (amount_cents > 0),
      paid_at timestamptz NOT NULL,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query("ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'");
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS due_at date');
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_by integer');
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS item_id bigint');
  await pgPool.query("ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'");
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS canceled_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS canceled_by integer');
  await pgPool.query('ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS due_at timestamptz');
  await pgPool.query("ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS repeat_next_month boolean NOT NULL DEFAULT false");
  await pgPool.query('ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS monthly_sort_order integer NOT NULL DEFAULT 0');
  await pgPool.query('ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS repeated_from_account_id bigint');
  await pgPool.query('ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS archived_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_accounts ADD COLUMN IF NOT EXISTS archived_by integer');
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gestao_account_items_status_check'
      ) THEN
        ALTER TABLE gestao_account_items
        ADD CONSTRAINT gestao_account_items_status_check CHECK (status IN ('ativo', 'cancelado'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gestao_account_payments_status_check'
      ) THEN
        ALTER TABLE gestao_account_payments
        ADD CONSTRAINT gestao_account_payments_status_check CHECK (status IN ('ativo', 'cancelado'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gestao_account_payments_item_id_fkey'
      ) THEN
        ALTER TABLE gestao_account_payments
        ADD CONSTRAINT gestao_account_payments_item_id_fkey
        FOREIGN KEY (item_id) REFERENCES gestao_account_items(id) ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gestao_accounts_repeated_from_fkey'
      ) THEN
        ALTER TABLE gestao_accounts
        ADD CONSTRAINT gestao_accounts_repeated_from_fkey
        FOREIGN KEY (repeated_from_account_id) REFERENCES gestao_accounts(id) ON DELETE SET NULL;
      END IF;
    END $$;
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
    CREATE TABLE IF NOT EXISTS gestao_notepad_notes (
      id bigserial PRIMARY KEY,
      body text NOT NULL,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      deleted_by integer
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS gestao_supplier_orders (
      id bigserial PRIMARY KEY,
      account_id bigint NOT NULL UNIQUE REFERENCES gestao_accounts(id) ON DELETE RESTRICT,
      supplier_name varchar(180) NOT NULL,
      status text NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido', 'confirmado', 'historico', 'cancelado')),
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
    CREATE INDEX IF NOT EXISTS gestao_accounts_status_month_idx
    ON gestao_accounts (status, competence_month, id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_generated_idx
    ON gestao_accounts (generated_at DESC, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_due_idx
    ON gestao_accounts (due_at ASC NULLS LAST, status, id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_repeated_from_idx
    ON gestao_accounts (repeated_from_account_id, competence_month)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_monthly_sort_idx
    ON gestao_accounts (competence_month, repeat_next_month, monthly_sort_order, id)
    WHERE archived_at IS NULL
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_visible_month_idx
    ON gestao_accounts (competence_month, status, id)
    WHERE archived_at IS NULL
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
    CREATE INDEX IF NOT EXISTS gestao_account_payments_paid_at_idx
    ON gestao_account_payments (paid_at, account_id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_account_payments_item_active_idx
    ON gestao_account_payments (item_id, paid_at, id)
    WHERE item_id IS NOT NULL AND status = 'ativo'
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_notepad_notes_active_idx
    ON gestao_notepad_notes (deleted_at, updated_at DESC, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_supplier_orders_status_arrival_idx
    ON gestao_supplier_orders (status, expected_arrival_at ASC NULLS LAST, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_supplier_orders_finished_idx
    ON gestao_supplier_orders (finished_at DESC NULLS LAST, id DESC)
  `);
  await pgPool.query(`
    CREATE OR REPLACE FUNCTION gestao_touch_updated_at()
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
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'gestao_accounts_touch_updated_at'
      ) THEN
        CREATE TRIGGER gestao_accounts_touch_updated_at
        BEFORE UPDATE ON gestao_accounts
        FOR EACH ROW EXECUTE FUNCTION gestao_touch_updated_at();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'gestao_supplier_orders_touch_updated_at'
      ) THEN
        CREATE TRIGGER gestao_supplier_orders_touch_updated_at
        BEFORE UPDATE ON gestao_supplier_orders
        FOR EACH ROW EXECUTE FUNCTION gestao_touch_updated_at();
      END IF;
    END $$;
  `);
}

async function mysqlTableExists(tableName: string): Promise<boolean> {
  const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function importMysqlGestaoOnce(): Promise<void> {
  const applied = await pgPool.query(
    "SELECT 1 FROM gestao_schema_migrations WHERE version = 'import-mysql-gestao-2026-05-18' LIMIT 1",
  );
  if (applied.rowCount) return;

  if (!(await mysqlTableExists('gestao_contas'))) {
    await pgPool.query(
      "INSERT INTO gestao_schema_migrations (version) VALUES ('import-mysql-gestao-2026-05-18') ON CONFLICT DO NOTHING",
    );
    return;
  }

  const hasPayments = await mysqlTableExists('gestao_conta_pagamentos');
  const hasItems = await mysqlTableExists('gestao_conta_itens');
  const [accountRows] = await mysqlPool.query<mysql.RowDataPacket[]>(
    'SELECT * FROM gestao_contas ORDER BY id ASC LIMIT 5000',
  );

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (const rawAccount of accountRows) {
      const account = rawAccount as Record<string, unknown>;
      const mysqlId = Number(account.id);
      const totalCents = parseMoneyToCents(account.valor_total);
      const result = await client.query<{ id: string }>(
        `INSERT INTO gestao_accounts
          (source_mysql_id, title, category, status, total_cents, competence_month, note, created_by, generated_at, paid_at, canceled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), $10::timestamptz, $11::timestamptz)
         ON CONFLICT (source_mysql_id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          status = EXCLUDED.status,
          total_cents = EXCLUDED.total_cents,
          competence_month = EXCLUDED.competence_month,
          note = EXCLUDED.note,
          paid_at = EXCLUDED.paid_at,
          canceled_at = EXCLUDED.canceled_at
         RETURNING id`,
        [
          mysqlId,
          cleanText(account.titulo, 180) || 'Conta importada',
          categoryLabel(account.categoria),
          ['pendente', 'pago', 'cancelado'].includes(String(account.status)) ? String(account.status) : 'pendente',
          totalCents,
          monthValue(account.competencia_mes),
          cleanText(account.observacao, 5000) || null,
          account.criado_por ? Number(account.criado_por) : null,
          mysqlDateToPg(account.gerado_em),
          mysqlDateToPg(account.pago_em),
          mysqlDateToPg(account.cancelado_em),
        ],
      );
      const accountId = Number(result.rows[0].id);

      if (hasItems) {
        const [itemRows] = await mysqlPool.query<mysql.RowDataPacket[]>(
          'SELECT * FROM gestao_conta_itens WHERE conta_id = ? ORDER BY ordem ASC, id ASC',
          [mysqlId],
        );
        for (const rawItem of itemRows) {
          const item = rawItem as Record<string, unknown>;
          const itemCents = parseMoneyToCents(item.valor);
          if (itemCents <= 0) continue;
          await client.query(
            `INSERT INTO gestao_account_items (source_mysql_id, account_id, description, amount_cents, sort_order, created_at)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
             ON CONFLICT (source_mysql_id) DO UPDATE SET
              description = EXCLUDED.description,
              amount_cents = EXCLUDED.amount_cents,
              sort_order = EXCLUDED.sort_order`,
            [
              Number(item.id),
              accountId,
              cleanText(item.descricao, 180) || 'Item importado',
              itemCents,
              Number(item.ordem || 0),
              mysqlDateToPg(item.criado_em),
            ],
          );
        }
      }

      let importedPayments = 0;
      if (hasPayments) {
        const [paymentRows] = await mysqlPool.query<mysql.RowDataPacket[]>(
          'SELECT * FROM gestao_conta_pagamentos WHERE conta_id = ? ORDER BY pago_em ASC, id ASC',
          [mysqlId],
        );
        for (const rawPayment of paymentRows) {
          const payment = rawPayment as Record<string, unknown>;
          const paymentCents = parseMoneyToCents(payment.valor);
          if (paymentCents <= 0) continue;
          importedPayments += 1;
          await client.query(
            `INSERT INTO gestao_account_payments (source_mysql_id, account_id, description, amount_cents, paid_at, created_by, created_at)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, COALESCE($7::timestamptz, now()))
             ON CONFLICT (source_mysql_id) DO UPDATE SET
              description = EXCLUDED.description,
              amount_cents = EXCLUDED.amount_cents,
              paid_at = EXCLUDED.paid_at`,
            [
              Number(payment.id),
              accountId,
              cleanText(payment.descricao, 180) || 'Pagamento importado',
              paymentCents,
              mysqlDateToPg(payment.pago_em),
              payment.criado_por ? Number(payment.criado_por) : null,
              mysqlDateToPg(payment.criado_em),
            ],
          );
        }
      }

      if (String(account.status) === 'pago' && totalCents > 0 && importedPayments === 0) {
        await client.query(
          `INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by)
           VALUES ($1, 'Pagamento confirmado importado', $2, COALESCE($3::timestamptz, now()), $4)`,
          [accountId, totalCents, mysqlDateToPg(account.pago_em) || mysqlDateToPg(account.gerado_em), account.criado_por ? Number(account.criado_por) : null],
        );
      }
    }

    await client.query(
      "INSERT INTO gestao_schema_migrations (version) VALUES ('import-mysql-gestao-2026-05-18') ON CONFLICT DO NOTHING",
    );
    await client.query('COMMIT');
    console.log(`[gestao] imported ${accountRows.length} mysql account(s)`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function paidTotal(client: pg.Pool | pg.PoolClient, accountId: number, itemId?: number): Promise<number> {
  if (itemId) {
    const itemResult = await client.query<{ paid_cents: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents
       FROM gestao_account_payments
       WHERE account_id = $1
         AND item_id = $2
         AND status = 'ativo'`,
      [accountId, itemId],
    );
    return Number(itemResult.rows[0]?.paid_cents || 0);
  }

  const result = await client.query<{ paid_cents: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents
     FROM gestao_account_payments
     WHERE account_id = $1
       AND status = 'ativo'`,
    [accountId],
  );
  return Number(result.rows[0]?.paid_cents || 0);
}

async function recalcAccountTotal(client: pg.PoolClient, accountId: number): Promise<number> {
  const result = await client.query<{ total_cents: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
     FROM gestao_account_items
     WHERE account_id = $1
       AND status = 'ativo'`,
    [accountId],
  );
  const totalCents = Number(result.rows[0]?.total_cents || 0);
  await client.query('UPDATE gestao_accounts SET total_cents = $1 WHERE id = $2', [totalCents, accountId]);
  return totalCents;
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

async function syncSupplierOrderAfterAccountChange(client: pg.PoolClient, accountId: number, userId: number | null): Promise<void> {
  const accountResult = await client.query<{ status: 'pendente' | 'pago' | 'cancelado' }>(
    'SELECT status FROM gestao_accounts WHERE id = $1 LIMIT 1',
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account || account.status === 'cancelado') return;

  const orderResult = await client.query<{ id: string; status: SupplierOrderStatus }>(
    'SELECT id, status FROM gestao_supplier_orders WHERE account_id = $1 FOR UPDATE',
    [accountId],
  );
  const order = orderResult.rows[0];

  if (order && order.status !== 'cancelado') {
    const orderId = Number(order.id);
    if (account.status === 'pago' && order.status === 'confirmado') {
      await client.query(
        "UPDATE gestao_supplier_orders SET status = 'historico', finished_at = now(), finished_by = $1 WHERE id = $2",
        [userId, orderId],
      );
      await auditPg(client, accountId, userId, 'gestao_pedido_finalizado', 'Pedido recebido e pago; movido para historico.');
    }

    if (account.status === 'pendente' && order.status === 'historico') {
      await client.query(
        "UPDATE gestao_supplier_orders SET status = 'confirmado', finished_at = NULL, finished_by = NULL WHERE id = $1",
        [orderId],
      );
      await auditPg(client, accountId, userId, 'gestao_pedido_reaberto', 'Pedido voltou para Confirmados apos ajuste de valor.');
    }
  }

  if (!(await pgTableExists('pedidos_confirmed_orders', client))) return;
  const pedidosResult = await client.query<{ id: string; lifecycle: 'confirmado' | 'historico' | 'cancelado' }>(
    "SELECT id, lifecycle FROM pedidos_confirmed_orders WHERE account_id = $1 AND lifecycle <> 'cancelado' FOR UPDATE",
    [accountId],
  );
  const pedido = pedidosResult.rows[0];
  if (!pedido) return;

  const pedidoId = Number(pedido.id);
  if (account.status === 'pago' && pedido.lifecycle === 'confirmado') {
    await client.query(
      "UPDATE pedidos_confirmed_orders SET lifecycle = 'historico', finished_at = now(), finished_by = $1 WHERE id = $2",
      [userId, pedidoId],
    );
    await auditPg(client, accountId, userId, 'pedidos_pedido_finalizado', 'Pedido recebido e pago; movido para historico.');
    return;
  }

  if (account.status === 'pendente' && pedido.lifecycle === 'historico') {
    await client.query(
      "UPDATE pedidos_confirmed_orders SET lifecycle = 'confirmado', finished_at = NULL, finished_by = NULL WHERE id = $1",
      [pedidoId],
    );
    await auditPg(client, accountId, userId, 'pedidos_pedido_reaberto', 'Pedido voltou para Confirmados apos ajuste de valor.');
  }
}

async function restoreSupplierOrderAfterAccountReopen(client: pg.PoolClient, accountId: number, userId: number | null): Promise<void> {
  const result = await client.query<{ status: SupplierOrderStatus }>(
    `UPDATE gestao_supplier_orders
     SET status = CASE WHEN confirmed_at IS NULL THEN 'pedido' ELSE 'confirmado' END,
         finished_at = NULL,
         finished_by = NULL
     WHERE account_id = $1
       AND status = 'cancelado'
     RETURNING status`,
    [accountId],
  );
  if (result.rowCount) {
    await auditPg(client, accountId, userId, 'gestao_pedido_reaberto', 'Pedido vinculado reaberto junto com a conta.');
  }

  if (await pgTableExists('pedidos_orders', client)) {
    const reopenedWaiting = await client.query(
      'UPDATE pedidos_orders SET canceled_at = NULL, canceled_by = NULL WHERE account_id = $1 AND canceled_at IS NOT NULL AND moved_to_confirmed_at IS NULL',
      [accountId],
    );
    if (reopenedWaiting.rowCount) {
      await auditPg(client, accountId, userId, 'pedidos_pedido_reaberto', 'Pedido pendente reaberto junto com a conta.');
    }
  }

  if (await pgTableExists('pedidos_confirmed_orders', client)) {
    const reopenedConfirmed = await client.query(
      `UPDATE pedidos_confirmed_orders
       SET lifecycle = 'confirmado',
           finished_at = NULL,
           finished_by = NULL
       WHERE account_id = $1
         AND lifecycle = 'cancelado'`,
      [accountId],
    );
    if (reopenedConfirmed.rowCount) {
      await auditPg(client, accountId, userId, 'pedidos_pedido_reaberto', 'Pedido confirmado reaberto junto com a conta.');
    }
  }
}

async function createAccount(req: Request): Promise<void> {
  const title = cleanText(req.body.titulo, 180);
  if (!title) throw new Error('Informe o nome ou titulo da conta.');

  const descriptions = bodyArray(req.body, 'item_descricao');
  const values = bodyArray(req.body, 'item_valor');
  const items: Array<{ description: string; cents: number }> = [];
  for (let index = 0; index < Math.min(Math.max(descriptions.length, values.length), 30); index += 1) {
    const description = cleanText(descriptions[index], 180);
    const cents = parseMoneyToCents(values[index]);
    if (!description && cents <= 0) continue;
    if (cents <= 0) throw new Error('Cada item usado precisa ter valor maior que zero.');
    items.push({ description: description || 'Valor principal', cents });
  }
  if (!items.length) throw new Error('Informe pelo menos um item com valor.');

  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  const status = req.body.status === 'pago' ? 'pago' : 'pendente';
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let accountId = 0;
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string }>(
      `INSERT INTO gestao_accounts
        (title, category, status, total_cents, competence_month, note, due_at, repeat_next_month, created_by, generated_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, now(), CASE WHEN $3 = 'pago' THEN now() ELSE NULL END)
       RETURNING id`,
      [
        title,
        categoryLabel(req.body.categoria),
        status,
        totalCents,
        monthValue(req.body.competencia_mes),
        cleanText(req.body.observacao, 5000) || null,
        parseOptionalDatetimeLocal(req.body.vencimento_em),
        req.body.repetir_mes === '1',
        userId,
      ],
    );
    accountId = Number(accountResult.rows[0].id);
    for (const [index, item] of items.entries()) {
      await client.query(
        'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order) VALUES ($1, $2, $3, $4)',
        [accountId, item.description, item.cents, (index + 1) * 10],
      );
    }
    if (status === 'pago') {
      await client.query(
        'INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, now(), $4)',
        [accountId, 'Pagamento confirmado', totalCents, userId],
      );
    }
    await auditPg(client, accountId, userId, 'gestao_conta_criada', `Conta criada: ${title} / ${formatMoney(totalCents)}`);
    if (req.body.repetir_mes === '1') {
      await auditPg(client, accountId, userId, 'gestao_recorrencia_ativada', 'Conta marcada para repetir no proximo mes.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_criada', 'gestao_conta', accountId, `Conta criada: ${title} / ${formatMoney(totalCents)}`);
  if (req.body.repetir_mes === '1') {
    const previousId = req.body.id;
    req.body.id = String(accountId);
    try {
      await repeatAccountNextMonth(req);
    } finally {
      req.body.id = previousId;
    }
  }
}

async function createInternalAccount(req: Request): Promise<{ accountId: number; totalCents: number; title: string; month: string; status: 'pendente' | 'pago' }> {
  const title = cleanText(req.body.titulo || req.body.title, 180);
  if (!title) throw new Error('Informe o nome ou titulo da conta.');

  const items: Array<{ description: string; cents: number }> = [];
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  for (const rawItem of rawItems.slice(0, 30)) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const description = cleanText(item.descricao || item.description || item.titulo || item.title, 180);
    const cents = item.amount_cents !== undefined ? Math.max(0, Number(item.amount_cents || 0)) : parseMoneyToCents(item.valor || item.value || item.amount);
    if (!description && cents <= 0) continue;
    if (cents <= 0) throw new Error('Cada item usado precisa ter valor maior que zero.');
    items.push({ description: description || 'Valor principal', cents });
  }

  if (!items.length) {
    const cents = parseMoneyToCents(req.body.valor || req.body.value || req.body.amount);
    if (cents <= 0) throw new Error('Informe um valor maior que zero.');
    const description = cleanText(req.body.descricao || req.body.description, 180) || title;
    items.push({ description, cents });
  }

  const totalCents = items.reduce((sum, item) => sum + item.cents, 0);
  const status = req.body.status === 'pago' ? 'pago' : 'pendente';
  const userId = Number(req.body.created_by || req.body.usuario_id || 0) || null;
  const month = monthValue(req.body.competencia_mes || req.body.month || req.body.mes);
  const repeatNextMonth = req.body.repetir_mes === true || req.body.repetir_mes === '1' || req.body.repeat_next_month === true;
  const client = await pgPool.connect();
  let accountId = 0;
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ id: string }>(
      `INSERT INTO gestao_accounts
        (title, category, status, total_cents, competence_month, note, due_at, repeat_next_month, created_by, generated_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, now(), CASE WHEN $3 = 'pago' THEN now() ELSE NULL END)
       RETURNING id`,
      [
        title,
        categoryLabel(req.body.categoria || req.body.category),
        status,
        totalCents,
        month,
        cleanText(req.body.observacao || req.body.note, 5000) || null,
        parseOptionalDatetimeLocal(req.body.vencimento_em || req.body.due_at),
        repeatNextMonth,
        userId,
      ],
    );
    accountId = Number(accountResult.rows[0].id);
    for (const [index, item] of items.entries()) {
      await client.query(
        'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order) VALUES ($1, $2, $3, $4)',
        [accountId, item.description, item.cents, (index + 1) * 10],
      );
    }
    if (status === 'pago') {
      await client.query(
        'INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, now(), $4)',
        [accountId, 'Pagamento confirmado pelo Miauby', totalCents, userId],
      );
    }
    await auditPg(client, accountId, userId, 'gestao_conta_criada_miauby', `Conta criada pelo Miauby: ${title} / ${formatMoney(totalCents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_criada_miauby', 'gestao_conta', accountId, `Conta criada pelo Miauby: ${title} / ${formatMoney(totalCents)}`);

  return { accountId, totalCents, title, month, status };
}

async function addItem(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const cents = parseMoneyToCents(req.body.novo_item_valor);
  if (!id) throw new Error('Conta invalida.');
  if (cents <= 0) throw new Error('Informe um valor maior que zero para adicionar.');

  const description = cleanText(req.body.novo_item_descricao, 180) || 'Acrescimo';
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id, status FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].status === 'cancelado') throw new Error('Reabra a conta antes de adicionar itens.');
    const orderResult = await client.query<{ next_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM gestao_account_items WHERE account_id = $1',
      [id],
    );
    await client.query(
      'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order) VALUES ($1, $2, $3, $4)',
      [id, description, cents, Number(orderResult.rows[0]?.next_order || 10)],
    );
    await client.query('UPDATE gestao_accounts SET total_cents = total_cents + $1 WHERE id = $2', [cents, id]);
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_item_adicionado', `Item adicionado: ${description} / ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_item_adicionado', 'gestao_conta', id, `Item adicionado na Gestao: ${description} / ${formatMoney(cents)}`);
}

async function addPayment(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  const cents = parseMoneyToCents(req.body.pagamento_valor);
  if (!id) throw new Error('Conta invalida.');
  if (cents <= 0) throw new Error('Informe um valor pago maior que zero.');

  let description = cleanText(req.body.pagamento_descricao, 180);
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
    const accountPaid = await paidTotal(client, id);
    const accountRemaining = Math.max(0, Number(account.total_cents) - accountPaid);
    let remaining = 0;
    let itemDescription = '';
    if (itemId > 0) {
      const itemResult = await client.query<{ description: string; amount_cents: number; status: string }>(
        'SELECT description, amount_cents, status FROM gestao_account_items WHERE id = $1 AND account_id = $2 FOR UPDATE',
        [itemId, id],
      );
      const item = itemResult.rows[0];
      if (!item) throw new Error('Lancamento nao encontrado nessa conta.');
      if (item.status === 'cancelado') throw new Error('Esse lancamento esta cancelado.');
      const itemPaid = await paidTotal(client, id, itemId);
      remaining = Math.min(Math.max(0, Number(item.amount_cents) - itemPaid), accountRemaining);
      itemDescription = item.description;
    } else {
      remaining = accountRemaining;
    }
    if (remaining <= 0) throw new Error('Essa conta ja esta paga.');
    if (cents > remaining) throw new Error('Pagamento maior que o saldo. Adicione juros ou diferenca como item antes de pagar.');
    if (!description) {
      description = itemId > 0
        ? (cents >= remaining ? `Quitacao de ${itemDescription}` : `Parcial de ${itemDescription}`)
        : (cents >= remaining ? 'Pagamento final' : 'Pagamento parcial');
    }
    await client.query(
      'INSERT INTO gestao_account_payments (account_id, item_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)',
      [id, itemId > 0 ? itemId : null, description, cents, parseDatetimeLocal(req.body.pagamento_em), userId],
    );
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_pagamento_criado', `Pagamento registrado: ${formatMoney(cents)}${itemId > 0 ? ` em ${itemDescription}` : ''}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_pagamento_criado', 'gestao_conta', id, `Pagamento registrado na Gestao: ${formatMoney(cents)}`);
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
        "INSERT INTO gestao_account_payments (account_id, description, amount_cents, paid_at, created_by) VALUES ($1, 'Pagamento final', $2, now(), $3)",
        [id, remaining, userId],
      );
    }
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_conta_quitada', 'Conta quitada na Gestao.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_status', 'gestao_conta', id, 'Conta quitada na Gestao.');
}

async function confirmItem(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  if (!id || !itemId) throw new Error('Lancamento invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let paidCents = 0;
  let itemDescription = '';
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ total_cents: number; status: string }>(
      'SELECT total_cents, status FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Conta nao encontrada.');
    if (account.status === 'cancelado') throw new Error('Reabra a conta antes de pagar lancamento.');

    const itemResult = await client.query<{ description: string; amount_cents: number; status: string }>(
      'SELECT description, amount_cents, status FROM gestao_account_items WHERE id = $1 AND account_id = $2 FOR UPDATE',
      [itemId, id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    if (item.status === 'cancelado') throw new Error('Esse lancamento esta cancelado.');
    itemDescription = item.description;
    const accountPaid = await paidTotal(client, id);
    const accountRemaining = Math.max(0, Number(account.total_cents || 0) - accountPaid);
    const paid = await paidTotal(client, id, itemId);
    paidCents = Math.min(Math.max(0, Number(item.amount_cents) - paid), accountRemaining);
    if (paidCents <= 0) throw new Error('Esse lancamento ja esta pago.');

    await client.query(
      'INSERT INTO gestao_account_payments (account_id, item_id, description, amount_cents, paid_at, created_by) VALUES ($1, $2, $3, $4, now(), $5)',
      [id, itemId, `Quitacao de ${item.description}`, paidCents, userId],
    );
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_item_quitado', `Lancamento quitado: ${item.description} / ${formatMoney(paidCents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_item_quitado', 'gestao_conta', id, `Lancamento quitado na Gestao: ${itemDescription} / ${formatMoney(paidCents)}`);
}

async function addItemAdjustment(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  const cents = parseMoneyToCents(req.body.ajuste_valor);
  if (!id || !itemId) throw new Error('Lancamento invalido.');
  if (cents <= 0) throw new Error('Informe um valor maior que zero para o ajuste.');

  const reason = cleanText(req.body.ajuste_descricao, 180) || 'Juros ou diferenca';
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let itemDescription = '';
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<{ status: string }>(
      'SELECT status FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Conta nao encontrada.');
    if (account.status === 'cancelado') throw new Error('Reabra a conta antes de adicionar ajuste.');

    const itemResult = await client.query<{ description: string; sort_order: number; status: string }>(
      'SELECT description, sort_order, status FROM gestao_account_items WHERE id = $1 AND account_id = $2 FOR UPDATE',
      [itemId, id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    if (item.status === 'cancelado') throw new Error('Esse lancamento esta cancelado.');
    itemDescription = item.description;
    const description = `${reason} - ${item.description}`.slice(0, 180);

    await client.query(
      'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order) VALUES ($1, $2, $3, $4)',
      [id, description, cents, Number(item.sort_order || 0) + 1],
    );
    await recalcAccountTotal(client, id);
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_item_ajuste', `Ajuste em lancamento: ${item.description} / ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_item_ajuste', 'gestao_conta', id, `Ajuste em lancamento na Gestao: ${itemDescription} / ${formatMoney(cents)}`);
}

async function cancelItem(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  if (!id || !itemId) throw new Error('Lancamento invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let itemDescription = '';
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id, status FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].status === 'cancelado') throw new Error('Reabra a conta antes de cancelar lancamento.');

    const itemResult = await client.query<{ description: string; status: string }>(
      'SELECT description, status FROM gestao_account_items WHERE id = $1 AND account_id = $2 FOR UPDATE',
      [itemId, id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    if (item.status === 'cancelado') throw new Error('Esse lancamento ja esta cancelado.');
    itemDescription = item.description;

    await client.query(
      "UPDATE gestao_account_items SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE id = $2",
      [userId, itemId],
    );
    await client.query(
      "UPDATE gestao_account_payments SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE item_id = $2 AND status = 'ativo'",
      [userId, itemId],
    );
    await recalcAccountTotal(client, id);
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_item_cancelado', `Lancamento cancelado: ${item.description}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_item_cancelado', 'gestao_conta', id, `Lancamento cancelado na Gestao: ${itemDescription}`);
}

async function reopenItem(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const itemId = Number(req.body.item_id || 0);
  if (!id || !itemId) throw new Error('Lancamento invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let itemDescription = '';
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id, status FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].status === 'cancelado') throw new Error('Reabra a conta antes de reabrir lancamento.');

    const itemResult = await client.query<{ description: string; status: string }>(
      'SELECT description, status FROM gestao_account_items WHERE id = $1 AND account_id = $2 FOR UPDATE',
      [itemId, id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error('Lancamento nao encontrado.');
    if (item.status !== 'cancelado') throw new Error('Esse lancamento ja esta aberto.');
    itemDescription = item.description;

    await client.query(
      "UPDATE gestao_account_items SET status = 'ativo', canceled_at = NULL, canceled_by = NULL WHERE id = $1",
      [itemId],
    );
    await recalcAccountTotal(client, id);
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_item_reaberto', `Lancamento reaberto: ${item.description}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_item_reaberto', 'gestao_conta', id, `Lancamento reaberto na Gestao: ${itemDescription}`);
}

async function cancelPayment(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const paymentId = Number(req.body.payment_id || 0);
  if (!id || !paymentId) throw new Error('Pagamento invalido.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let cents = 0;
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id, status FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].status === 'cancelado') throw new Error('Reabra a conta antes de cancelar pagamento.');

    const paymentResult = await client.query<{ amount_cents: number; status: string }>(
      'SELECT amount_cents, status FROM gestao_account_payments WHERE id = $1 AND account_id = $2 FOR UPDATE',
      [paymentId, id],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error('Pagamento nao encontrado.');
    if (payment.status === 'cancelado') throw new Error('Esse pagamento ja esta cancelado.');
    cents = Number(payment.amount_cents || 0);
    await client.query(
      "UPDATE gestao_account_payments SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE id = $2",
      [userId, paymentId],
    );
    await syncPaymentStatus(client, id);
    await syncSupplierOrderAfterAccountChange(client, id, userId);
    await auditPg(client, id, userId, 'gestao_pagamento_cancelado', `Pagamento cancelado: ${formatMoney(cents)}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_pagamento_cancelado', 'gestao_conta', id, `Pagamento cancelado na Gestao: ${formatMoney(cents)}`);
}

async function updateAccountNote(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const note = cleanText(req.body.observacao, 5000);
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    await client.query('UPDATE gestao_accounts SET note = $1 WHERE id = $2', [note || null, id]);
    await auditPg(client, id, userId, 'gestao_observacao_atualizada', 'Observacao da conta atualizada.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_observacao_atualizada', 'gestao_conta', id, 'Observacao da conta atualizada na Gestao.');
}

async function updateAccountTitle(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const title = cleanText(req.body.titulo, 180);
  if (!id) throw new Error('Conta invalida.');
  if (!title) throw new Error('Informe o novo nome da conta.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query<{ title: string }>('SELECT title FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    await client.query('UPDATE gestao_accounts SET title = $1 WHERE id = $2', [title, id]);
    await auditPg(client, id, userId, 'gestao_conta_renomeada', `Conta renomeada: ${account.rows[0].title} -> ${title}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_renomeada', 'gestao_conta', id, `Conta renomeada na Gestao: ${title}`);
}

async function updateAccountDue(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const dueAt = req.body.limpar_vencimento === '1' ? null : parseOptionalDatetimeLocal(req.body.vencimento_em);
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    await client.query('UPDATE gestao_accounts SET due_at = $1::timestamptz WHERE id = $2', [dueAt, id]);
    await auditPg(client, id, userId, 'gestao_vencimento_atualizado', dueAt ? `Vencimento atualizado: ${brDate(dueAt, true)}` : 'Vencimento removido.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_vencimento_atualizado', 'gestao_conta', id, dueAt ? 'Vencimento atualizado na Gestao.' : 'Vencimento removido na Gestao.');
}

async function accountIdsByCategory(month: string, key: string): Promise<number[]> {
  const accounts = await listAccounts(month);
  return accounts
    .filter((account) => categoryKey(account.category) === key)
    .map((account) => Number(account.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function updateCategoryGroup(req: Request): Promise<number> {
  const selectedMonth = monthValue(req.body.competencia_mes);
  const fromKey = cleanText(req.body.categoria_chave, 120);
  const newCategory = categoryLabel(req.body.nova_categoria);
  if (!fromKey) throw new Error('Categoria invalida.');
  if (!newCategory) throw new Error('Informe o novo nome da categoria.');
  const ids = await accountIdsByCategory(selectedMonth, fromKey);
  if (!ids.length) throw new Error('Nenhuma conta encontrada nessa categoria.');
  const linkedOrders = await pgPool.query<{ count: string }>(
    'SELECT COUNT(*)::bigint AS count FROM gestao_supplier_orders WHERE account_id = ANY($1::bigint[]) AND status <> $2',
    [ids, 'cancelado'],
  );
  if (Number(linkedOrders.rows[0]?.count || 0) > 0) {
    throw new Error('Essa categoria tem pedido de fornecedor vinculado. Pedidos ficam sempre na categoria Boleto.');
  }
  if ((await pgTableExists('pedidos_orders')) && (await pgTableExists('pedidos_confirmed_orders'))) {
    const linkedPedidos = await pgPool.query<{ count: string }>(
      `SELECT (
        (SELECT COUNT(*) FROM pedidos_orders WHERE account_id = ANY($1::bigint[]) AND canceled_at IS NULL)
        +
        (SELECT COUNT(*) FROM pedidos_confirmed_orders WHERE account_id = ANY($1::bigint[]) AND lifecycle <> 'cancelado')
      )::bigint AS count`,
      [ids],
    );
    if (Number(linkedPedidos.rows[0]?.count || 0) > 0) {
      throw new Error('Essa categoria tem pedido de fornecedor vinculado. Pedidos ficam sempre na categoria Boleto.');
    }
  }
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE gestao_accounts SET category = $1 WHERE id = ANY($2::bigint[])', [newCategory, ids]);
    for (const id of ids) {
      await auditPg(client, id, userId, 'gestao_categoria_alterada', `Categoria alterada em lote para ${newCategory}.`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_categoria_alterada', 'gestao_categoria', null, `Categoria alterada em lote para ${newCategory}: ${ids.length} conta(s).`);
  return ids.length;
}

async function cancelCategoryGroup(req: Request): Promise<number> {
  const selectedMonth = monthValue(req.body.competencia_mes);
  const fromKey = cleanText(req.body.categoria_chave, 120);
  if (!fromKey) throw new Error('Categoria invalida.');
  const ids = await accountIdsByCategory(selectedMonth, fromKey);
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let changed = 0;
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      const result = await client.query(
        "UPDATE gestao_accounts SET status = 'cancelado', paid_at = NULL, canceled_at = now() WHERE id = $1 AND status = 'pendente'",
        [id],
      );
      if (result.rowCount) {
        changed += 1;
        await client.query(
          "UPDATE gestao_account_payments SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE account_id = $2 AND status = 'ativo'",
          [userId, id],
        );
        const orderResult = await client.query(
          "UPDATE gestao_supplier_orders SET status = 'cancelado', finished_at = now(), finished_by = $1 WHERE account_id = $2 AND status <> 'cancelado'",
          [userId, id],
        );
        const pedidosWaitingResult = (await pgTableExists('pedidos_orders', client))
          ? await client.query(
            'UPDATE pedidos_orders SET canceled_at = now(), canceled_by = $1 WHERE account_id = $2 AND canceled_at IS NULL AND moved_to_confirmed_at IS NULL',
            [userId, id],
          )
          : { rowCount: 0 };
        const pedidosConfirmedResult = (await pgTableExists('pedidos_confirmed_orders', client))
          ? await client.query(
            "UPDATE pedidos_confirmed_orders SET lifecycle = 'cancelado', finished_at = now(), finished_by = $1 WHERE account_id = $2 AND lifecycle <> 'cancelado'",
            [userId, id],
          )
          : { rowCount: 0 };
        await auditPg(client, id, userId, 'gestao_categoria_cancelada', 'Conta aberta cancelada por acao na categoria.');
        if (orderResult.rowCount || pedidosWaitingResult.rowCount || pedidosConfirmedResult.rowCount) {
          await auditPg(client, id, userId, 'gestao_pedido_cancelado_categoria', 'Pedido vinculado cancelado por acao em categoria.');
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_categoria_cancelada', 'gestao_categoria', null, `Categoria cancelada em lote: ${changed} conta(s) aberta(s).`);
  return changed;
}

async function archiveCanceledAccount(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query<{ status: string; title: string; archived_at: Date | string | null }>(
      'SELECT status, title, archived_at FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (account.rows[0].archived_at) {
      await client.query('COMMIT');
      return;
    }
    if (account.rows[0].status !== 'cancelado') throw new Error('So contas canceladas podem ser excluidas da tela.');
    const result = await client.query(
      "UPDATE gestao_accounts SET archived_at = now(), archived_by = $1 WHERE id = $2 AND status = 'cancelado' AND archived_at IS NULL RETURNING id",
      [userId, id],
    );
    if (!result.rowCount) throw new Error('Essa conta ja foi excluida da tela.');
    await auditPg(client, id, userId, 'gestao_conta_arquivada', 'Conta cancelada excluida da tela; historico preservado no banco.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_arquivada', 'gestao_conta', id, 'Conta cancelada excluida da tela da Gestao; historico preservado.');
}

async function archiveCanceledCategoryGroup(req: Request): Promise<number> {
  const selectedMonth = monthValue(req.body.competencia_mes);
  const fromKey = cleanText(req.body.categoria_chave, 120);
  if (!fromKey) throw new Error('Categoria invalida.');
  const ids = await accountIdsByCategory(selectedMonth, fromKey);
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let changed = 0;
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      const result = await client.query(
        "UPDATE gestao_accounts SET archived_at = now(), archived_by = $1 WHERE id = $2 AND status = 'cancelado' AND archived_at IS NULL",
        [userId, id],
      );
      if (result.rowCount) {
        changed += 1;
        await auditPg(client, id, userId, 'gestao_conta_arquivada_categoria', 'Conta cancelada excluida da tela por acao em categoria.');
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_arquivada_categoria', 'gestao_categoria', null, `Categoria teve ${changed} conta(s) cancelada(s) excluida(s) da tela.`);
  return changed;
}

async function repeatAccountNextMonth(req: Request): Promise<{ accountId: number; month: string; created: boolean }> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  let newAccountId = 0;
  let targetMonth = '';
  let created = false;
  try {
    await client.query('BEGIN');
    const accountResult = await client.query<AccountRow>(
      'SELECT * FROM gestao_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Conta nao encontrada.');
    if (account.status === 'cancelado') throw new Error('Reabra a conta antes de repetir para o proximo mes.');

    targetMonth = nextMonthValue(account.competence_month);
    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM gestao_accounts
       WHERE repeated_from_account_id = $1
         AND competence_month = $2
         AND status <> 'cancelado'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [id, targetMonth],
    );
    if (existing.rowCount) {
      newAccountId = Number(existing.rows[0].id);
      await client.query('UPDATE gestao_accounts SET repeat_next_month = true WHERE id = $1', [id]);
      await auditPg(client, id, userId, 'gestao_recorrencia_ativada', `Recorrencia mantida para ${monthLabel(targetMonth)}.`);
      await client.query('COMMIT');
      return { accountId: newAccountId, month: targetMonth, created };
    }

    const itemResult = await client.query<ItemRow>(
      `SELECT *
       FROM gestao_account_items
       WHERE account_id = $1
         AND status = 'ativo'
       ORDER BY sort_order ASC, id ASC`,
      [id],
    );
    if (!itemResult.rowCount) throw new Error('Essa conta nao tem lancamento ativo para repetir.');

    const totalCents = itemResult.rows.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
    const title = cleanText(req.body.titulo_repetir, 180) || account.title;
    const repeatedResult = await client.query<{ id: string }>(
      `INSERT INTO gestao_accounts
        (title, category, status, total_cents, competence_month, note, due_at, repeat_next_month, repeated_from_account_id, created_by, generated_at, paid_at, canceled_at)
       VALUES ($1, $2, 'pendente', $3, $4, $5, $6::timestamptz, false, $7, $8, now(), NULL, NULL)
       RETURNING id`,
      [title, account.category, totalCents, targetMonth, account.note, nextMonthDateTime(account.due_at), id, userId],
    );
    newAccountId = Number(repeatedResult.rows[0].id);
    created = true;

    for (const [index, item] of itemResult.rows.entries()) {
      await client.query(
        'INSERT INTO gestao_account_items (account_id, description, amount_cents, sort_order) VALUES ($1, $2, $3, $4)',
        [newAccountId, item.description, Number(item.amount_cents || 0), (index + 1) * 10],
      );
    }

    await client.query('UPDATE gestao_accounts SET repeat_next_month = true WHERE id = $1', [id]);
    await auditPg(client, id, userId, 'gestao_conta_repetida_origem', `Conta repetida para ${monthLabel(targetMonth)}: ${title}`);
    await auditPg(client, newAccountId, userId, 'gestao_conta_repetida', `Conta criada por repeticao de ${account.title}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_repetida', 'gestao_conta', newAccountId, `Conta repetida para ${monthLabel(targetMonth)} na Gestao.`);
  return { accountId: newAccountId, month: targetMonth, created };
}

async function toggleRepeatNextMonth(req: Request): Promise<boolean> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const current = await pgPool.query<{ repeat_next_month: boolean; status: string }>(
    'SELECT repeat_next_month, status FROM gestao_accounts WHERE id = $1 LIMIT 1',
    [id],
  );
  const account = current.rows[0];
  if (!account) throw new Error('Conta nao encontrada.');
  if (account.status === 'cancelado') throw new Error('Reabra a conta antes de mexer na repeticao.');
  if (!account.repeat_next_month) {
    await repeatAccountNextMonth(req);
    return true;
  }

  await pgPool.query('UPDATE gestao_accounts SET repeat_next_month = false WHERE id = $1', [id]);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await auditPg(client, id, userId, 'gestao_recorrencia_desativada', 'Conta deixou de repetir automaticamente no proximo mes.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_recorrencia_desativada', 'gestao_conta', id, 'Recorrencia da Gestao desativada.');
  return false;
}

async function reopenAccount(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    await client.query("UPDATE gestao_accounts SET status = 'pendente', paid_at = NULL, canceled_at = NULL WHERE id = $1", [id]);
    await restoreSupplierOrderAfterAccountReopen(client, id, userId);
    await auditPg(client, id, userId, 'gestao_conta_reaberta', 'Conta reaberta para ajuste.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_reaberta', 'gestao_conta', id, 'Conta reaberta para ajuste na Gestao.');
}

async function setStatus(req: Request, status: 'pendente' | 'cancelado'): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Conta invalida.');
  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM gestao_accounts WHERE id = $1 FOR UPDATE', [id]);
    if (!account.rowCount) throw new Error('Conta nao encontrada.');
    if (status === 'cancelado') {
      await client.query("UPDATE gestao_accounts SET status = 'cancelado', paid_at = NULL, canceled_at = now() WHERE id = $1", [id]);
      await client.query(
        "UPDATE gestao_account_payments SET status = 'cancelado', canceled_at = now(), canceled_by = $1 WHERE account_id = $2 AND status = 'ativo'",
        [userId, id],
      );
      await client.query(
        "UPDATE gestao_supplier_orders SET status = 'cancelado', finished_at = now(), finished_by = $1 WHERE account_id = $2 AND status <> 'cancelado'",
        [userId, id],
      );
      if (await pgTableExists('pedidos_orders', client)) {
        await client.query(
          'UPDATE pedidos_orders SET canceled_at = now(), canceled_by = $1 WHERE account_id = $2 AND canceled_at IS NULL AND moved_to_confirmed_at IS NULL',
          [userId, id],
        );
      }
      if (await pgTableExists('pedidos_confirmed_orders', client)) {
        await client.query(
          "UPDATE pedidos_confirmed_orders SET lifecycle = 'cancelado', finished_at = now(), finished_by = $1 WHERE account_id = $2 AND lifecycle <> 'cancelado'",
          [userId, id],
        );
      }
    } else {
      await client.query("UPDATE gestao_accounts SET status = 'pendente', paid_at = NULL, canceled_at = NULL WHERE id = $1", [id]);
      await syncPaymentStatus(client, id);
      await restoreSupplierOrderAfterAccountReopen(client, id, userId);
    }
    await auditPg(client, id, userId, 'gestao_conta_status', `Conta marcada como ${status}.`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_status', 'gestao_conta', id, `Conta marcada como ${status}.`);
}

async function monthSummary(month: string) {
  const bounds = monthBounds(month);
  const paidResult = await pgPool.query<{ paid_cents: string }>(
    `SELECT COALESCE(SUM(p.amount_cents), 0)::bigint AS paid_cents
     FROM gestao_account_payments p
     JOIN gestao_accounts a ON a.id = p.account_id
     WHERE p.paid_at >= $1::timestamptz
       AND p.paid_at < $2::timestamptz
       AND p.status = 'ativo'
       AND a.archived_at IS NULL`,
    [bounds.start, bounds.end],
  );
  const summaryResult = await pgPool.query<{
    pending_cents: string;
    generated_cents: string;
    pending_accounts: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN a.status = 'pendente' THEN GREATEST(a.total_cents - COALESCE(p.paid_cents, 0), 0) ELSE 0 END), 0)::bigint AS pending_cents,
       COALESCE(SUM(CASE WHEN a.status <> 'cancelado' THEN a.total_cents ELSE 0 END), 0)::bigint AS generated_cents,
       COALESCE(SUM(CASE WHEN a.status = 'pendente' THEN 1 ELSE 0 END), 0)::bigint AS pending_accounts
     FROM gestao_accounts a
     LEFT JOIN (
       SELECT account_id, SUM(amount_cents) AS paid_cents
       FROM gestao_account_payments
       WHERE status = 'ativo'
       GROUP BY account_id
     ) p ON p.account_id = a.id
     WHERE a.competence_month = $1
       AND a.archived_at IS NULL`,
    [month],
  );
  const summary = summaryResult.rows[0];
  return {
    paidCents: Number(paidResult.rows[0]?.paid_cents || 0),
    pendingCents: Number(summary?.pending_cents || 0),
    generatedCents: Number(summary?.generated_cents || 0),
    pendingAccounts: Number(summary?.pending_accounts || 0),
  };
}

async function listAccounts(month: string): Promise<RenderAccount[]> {
  const bounds = monthBounds(month);
  const accountsResult = await pgPool.query<AccountRow>(
    `SELECT a.*,
            COALESCE(p.paid_cents, 0)::bigint AS paid_cents,
            p.last_payment_at
     FROM gestao_accounts a
     LEFT JOIN (
       SELECT account_id, SUM(amount_cents) AS paid_cents, MAX(paid_at) AS last_payment_at
       FROM gestao_account_payments
       WHERE status = 'ativo'
       GROUP BY account_id
     ) p ON p.account_id = a.id
     WHERE a.archived_at IS NULL
       AND (
        a.competence_month = $1
        OR (a.paid_at >= $2::timestamptz AND a.paid_at < $3::timestamptz)
        OR EXISTS (
          SELECT 1 FROM gestao_account_payments gp
          WHERE gp.account_id = a.id
            AND gp.paid_at >= $2::timestamptz
            AND gp.paid_at < $3::timestamptz
        )
       )
     ORDER BY
       CASE a.status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END ASC,
       CASE WHEN a.status = 'pendente' AND a.due_at IS NOT NULL THEN 0 ELSE 1 END ASC,
       CASE WHEN a.status = 'pendente' THEN a.due_at END ASC NULLS LAST,
       COALESCE(a.paid_at, p.last_payment_at, a.generated_at) DESC,
       a.id DESC
     LIMIT 500`,
    [month, bounds.start, bounds.end],
  );
  const accounts = accountsResult.rows;
  if (!accounts.length) return [];

  const ids = accounts.map((account) => Number(account.id));
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
    [ids],
  );
  const paymentsResult = await pgPool.query<PaymentRow>(
    `SELECT p.*, i.description AS item_description
     FROM gestao_account_payments p
     LEFT JOIN gestao_account_items i ON i.id = p.item_id
     WHERE p.account_id = ANY($1::bigint[])
     ORDER BY p.account_id ASC, p.paid_at ASC, p.id ASC`,
    [ids],
  );
  const auditResult = await pgPool.query<AuditEventRow>(
    `SELECT id, account_id, user_id, action, summary, created_at
     FROM gestao_audit_events
     WHERE account_id = ANY($1::bigint[])
     ORDER BY account_id ASC, created_at DESC, id DESC
     LIMIT 600`,
    [ids],
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

  const auditByAccount = new Map<string, AuditEventRow[]>();
  for (const event of auditResult.rows) {
    const key = String(event.account_id);
    auditByAccount.set(key, [...(auditByAccount.get(key) || []), event]);
  }

  return accounts.map((account) => ({
    ...account,
    items: itemsByAccount.get(String(account.id)) || [],
    payments: paymentsByAccount.get(String(account.id)) || [],
    auditEvents: auditByAccount.get(String(account.id)) || [],
  }));
}

async function listNotepadNotes(): Promise<NotepadRow[]> {
  const result = await pgPool.query<NotepadRow>(
    `SELECT id, body, created_by, created_at, updated_at
     FROM gestao_notepad_notes
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT 24`,
  );
  return result.rows;
}

function categorySummaries(accounts: RenderAccount[]): CategorySummary[] {
  const groups = new Map<string, CategorySummary>();
  for (const account of accounts) {
    const key = categoryKey(account.category);
    const existing = groups.get(key);
    const summary = existing || {
      key,
      label: categoryLabel(account.category),
      openCount: 0,
      closedCount: 0,
      canceledCount: 0,
      openCents: 0,
      closedCents: 0,
    };
    const total = Number(account.total_cents || 0);
    const paid = Number(account.paid_cents || 0);
    const remaining = Math.max(0, total - paid);
    if (account.status === 'pendente' && remaining > 0) {
      summary.openCount += 1;
      summary.openCents += remaining;
    } else {
      summary.closedCount += 1;
      summary.closedCents += total;
      if (account.status === 'cancelado') {
        summary.canceledCount += 1;
      }
    }
    groups.set(key, summary);
  }
  return [...groups.values()].sort((a, b) => {
    if (b.openCount !== a.openCount) return b.openCount - a.openCount;
    if (b.closedCount !== a.closedCount) return b.closedCount - a.closedCount;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

function recurringAccountsForMonth(accounts: RenderAccount[], selectedMonth: string): RenderAccount[] {
  const month = monthValue(selectedMonth);
  return accounts
    .filter((account) => account.competence_month === month && account.status !== 'cancelado' && Boolean(account.repeat_next_month))
    .sort((a, b) => {
      const aOrder = Number(a.monthly_sort_order || 0);
      const bOrder = Number(b.monthly_sort_order || 0);
      if (aOrder > 0 || bOrder > 0) {
        const normalizedA = aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER;
        const normalizedB = bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER;
        if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      }
      const aStatus = a.status === 'pendente' ? 0 : 1;
      const bStatus = b.status === 'pendente' ? 0 : 1;
      if (aStatus !== bStatus) return aStatus - bStatus;
      const aDue = a.due_at ? new Date(String(a.due_at)).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.due_at ? new Date(String(b.due_at)).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'pt-BR');
    });
}

function renderMonthlyPanel(req: Request, accounts: RenderAccount[], selectedMonth: string): string {
  const recurringAccounts = recurringAccountsForMonth(accounts, selectedMonth);
  const totalCents = recurringAccounts.reduce((sum, account) => sum + Number(account.total_cents || 0), 0);
  const nextMonthLabel = monthLabel(nextMonthValue(selectedMonth));
  const rowsHtml = recurringAccounts.length
    ? recurringAccounts.map((account) => renderAccount(req, account, selectedMonth, { monthly: true })).join('')
    : '<p class="gestao-empty-line">Nenhuma conta mensal repetindo neste mes.</p>';

  return `<section class="gestao-list-panel gestao-monthly-list-panel" aria-label="Contas mensais da Gestao">
    <div class="gestao-section-title">
      <span class="gestao-kicker">Mensal</span>
      <strong>${e(recurringAccounts.length)}</strong>
    </div>
    <div class="gestao-monthly-total gestao-monthly-total-inline">
      <span>Repetindo para ${e(nextMonthLabel)}</span>
      <strong>${e(formatMoney(totalCents))}</strong>
    </div>
    <div class="gestao-list gestao-monthly-sort-list" data-monthly-sort-list data-month="${e(monthValue(selectedMonth))}">${rowsHtml}</div>
  </section>`;
}

function renderCategoryPanel(req: Request, summaries: CategorySummary[], selectedMonth: string, selectedCategory: string): string {
  const chips = summaries.length
    ? summaries.map((summary) => {
      const active = selectedCategory === summary.key;
      const href = active
        ? `${BASE_PATH}/?mes=${encodeURIComponent(selectedMonth)}`
        : `${BASE_PATH}/?mes=${encodeURIComponent(selectedMonth)}&categoria=${encodeURIComponent(summary.key)}`;
      return `<a class="gestao-category-chip ${active ? 'is-active' : ''}" href="${href}">
        <span class="gestao-category-open">${e(summary.openCount)}</span>
        <strong>${e(summary.label)}</strong>
        <span class="gestao-category-closed">${e(summary.closedCount)}</span>
      </a>`;
    }).join('')
    : '<p class="gestao-empty-line">Sem categorias nesse mes ainda.</p>';
  const active = summaries.find((summary) => summary.key === selectedCategory);
  const activeTools = active ? `<div class="gestao-category-tools">
    <div class="gestao-category-focus">
      <span>Categoria selecionada</span>
      <strong>${e(active.label)}</strong>
      <small>${e(active.openCount)} aberta(s) / ${e(active.closedCount)} fechada(s)${active.canceledCount > 0 ? ` / ${e(active.canceledCount)} cancelada(s)` : ''}</small>
    </div>
    <form method="post" class="gestao-category-form">
      ${csrfField(req)}
      <input type="hidden" name="action" value="update_category_group">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <input type="hidden" name="categoria_chave" value="${e(active.key)}">
      <label><span>Trocar categoria</span><input type="text" name="nova_categoria" maxlength="80" value="${e(active.label)}"></label>
      <button type="submit" class="gestao-btn gestao-btn-secondary">Aplicar</button>
    </form>
    <form method="post" data-confirm="Cancelar todas as contas abertas dessa categoria? As contas fechadas ficam preservadas no historico.">
      ${csrfField(req)}
      <input type="hidden" name="action" value="cancel_category_group">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <input type="hidden" name="categoria_chave" value="${e(active.key)}">
      <button type="submit" class="gestao-link-danger">Cancelar abertas desta categoria</button>
    </form>
    ${active.canceledCount > 0 ? `<form method="post" action="${BASE_PATH}/" data-confirm="Excluir as contas canceladas dessa categoria da tela? O historico fica preservado no banco e na auditoria.">
      ${csrfField(req)}
      <input type="hidden" name="action" value="archive_canceled_category_group">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <input type="hidden" name="categoria_chave" value="${e(active.key)}">
      <button type="submit" class="gestao-link-danger">Excluir canceladas desta categoria</button>
    </form>` : ''}
  </div>` : '';

  return `<aside class="gestao-category-panel" aria-label="Categorias da Gestao">
    <div class="gestao-section-title">
      <span class="gestao-kicker">Categorias</span>
      <strong>${e(summaries.length)}</strong>
    </div>
    <div class="gestao-category-legend"><span>abertas</span><span>fechadas</span></div>
    <div class="gestao-category-chips">${chips}</div>
    ${activeTools}
  </aside>`;
}

async function addNotepadNote(req: Request): Promise<void> {
  const body = cleanText(req.body.nota_texto, 2000);
  if (!body) throw new Error('Escreva uma anotacao antes de salvar.');
  const userId = req.session.user?.id || null;
  await pgPool.query(
    'INSERT INTO gestao_notepad_notes (body, created_by) VALUES ($1, $2)',
    [body, userId],
  );
  await logMysql(userId, 'gestao_bloco_nota_criado', 'gestao_nota', null, 'Nota da Gestao criada.');
}

async function updateNotepadNote(req: Request): Promise<void> {
  const id = Number(req.body.note_id || 0);
  const body = cleanText(req.body.nota_texto, 2000);
  if (!id) throw new Error('Nota invalida.');
  if (!body) throw new Error('A nota nao pode ficar vazia. Apague se nao precisar mais.');
  const userId = req.session.user?.id || null;
  const result = await pgPool.query(
    'UPDATE gestao_notepad_notes SET body = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL',
    [body, id],
  );
  if (!result.rowCount) throw new Error('Nota nao encontrada.');
  await logMysql(userId, 'gestao_bloco_nota_editado', 'gestao_nota', id, 'Nota da Gestao editada.');
}

async function deleteNotepadNote(req: Request): Promise<void> {
  const id = Number(req.body.note_id || 0);
  if (!id) throw new Error('Nota invalida.');
  const userId = req.session.user?.id || null;
  const result = await pgPool.query(
    'UPDATE gestao_notepad_notes SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    [userId, id],
  );
  if (!result.rowCount) throw new Error('Nota nao encontrada.');
  await logMysql(userId, 'gestao_bloco_nota_apagado', 'gestao_nota', id, 'Nota da Gestao apagada.');
}

async function updateMonthlyOrder(req: Request): Promise<void> {
  const selectedMonth = monthValue(req.body.competencia_mes || req.body.month || req.body.mes);
  const ids = bodyArray(req.body, 'ids')
    .map((value) => Number(value || 0))
    .filter((value) => Number.isInteger(value) && value > 0);
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) throw new Error('Nenhuma conta mensal para ordenar.');

  const userId = req.session.user?.id || null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const validResult = await client.query<{ id: string }>(
      `SELECT id
       FROM gestao_accounts
       WHERE id = ANY($1::bigint[])
         AND competence_month = $2
         AND repeat_next_month = true
         AND status <> 'cancelado'
         AND archived_at IS NULL`,
      [uniqueIds, selectedMonth],
    );
    if (validResult.rowCount !== uniqueIds.length) {
      throw new Error('A ordem mensal mudou. Recarregue a pagina e tente de novo.');
    }

    for (const [index, id] of uniqueIds.entries()) {
      await client.query(
        'UPDATE gestao_accounts SET monthly_sort_order = $1 WHERE id = $2',
        [(index + 1) * 10, id],
      );
    }
    await auditPg(client, null, userId, 'gestao_mensal_ordem_atualizada', `Ordem mensal atualizada em ${selectedMonth}.`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logMysql(userId, 'gestao_mensal_ordem_atualizada', 'gestao', null, `Ordem mensal atualizada em ${selectedMonth}.`);
}

function renderAccount(req: Request, account: RenderAccount, selectedMonth: string, options: { monthly?: boolean } = {}): string {
  const id = Number(account.id);
  const status = account.status || 'pendente';
  const totalCents = Number(account.total_cents || 0);
  const paidCents = Number(account.paid_cents || 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const progress = totalCents > 0 ? Math.min(100, Math.max(0, (paidCents / totalCents) * 100)) : 0;
  const canEdit = status !== 'cancelado';
  const finalButtonLabel = paidCents > 0 ? 'Quitar saldo' : 'Quitar integral';
  const remainingMoney = formatMoney(remainingCents);
  const due = dueStatus(account);
  const repeatEnabled = Boolean(account.repeat_next_month);
  const activePayments = account.payments.filter((payment) => payment.status !== 'cancelado');
  const historyPayments = account.payments.filter((payment) => payment.status === 'cancelado');
  const openItems = account.items.filter((item) => {
    const itemCents = Number(item.amount_cents || 0);
    const itemPaid = Number(item.paid_cents || 0);
    return item.status !== 'cancelado' && Math.max(0, itemCents - itemPaid) > 0;
  });
  const historyItems = account.items.filter((item) => {
    const itemCents = Number(item.amount_cents || 0);
    const itemPaid = Number(item.paid_cents || 0);
    return item.status === 'cancelado' || Math.max(0, itemCents - itemPaid) <= 0;
  });

  const itemHtml = openItems.length
    ? `<div class="gestao-ledger-block">
       <div class="gestao-ledger-title"><span>Lancamentos abertos</span><strong>${e(formatMoney(openItems.reduce((sum, item) => sum + Math.max(0, Number(item.amount_cents || 0) - Number(item.paid_cents || 0)), 0)))}</strong></div>
       <div class="gestao-item-list">
        ${openItems.map((item) => {
          const itemId = Number(item.id);
          const itemCents = Number(item.amount_cents || 0);
          const itemPaid = Number(item.paid_cents || 0);
          const itemRemaining = Math.max(0, itemCents - itemPaid);
          const itemPayable = Math.min(itemRemaining, remainingCents);
          const itemProgress = itemCents > 0 ? Math.min(100, Math.max(0, (itemPaid / itemCents) * 100)) : 0;
          return `
            <section class="gestao-item-row" data-item-row data-item-id="${e(itemId)}">
              <button type="button" class="gestao-item-main" data-item-toggle aria-expanded="false">
                <div class="gestao-item-title">
                  <strong>${e(item.description)}</strong>
                  <span class="gestao-mini-pill">Aberto</span>
                  <span class="gestao-item-open-label">Opcoes</span>
                </div>
                <div class="gestao-item-numbers">
                  <span>Lancado <strong>${e(formatMoney(itemCents))}</strong></span>
                  <span>Pago <strong>${e(formatMoney(itemPaid))}</strong></span>
                  <span>Saldo <strong>${e(formatMoney(itemRemaining))}</strong></span>
                </div>
                <div class="gestao-item-progress" aria-hidden="true"><span style="width:${itemProgress.toFixed(2)}%"></span></div>
              </button>
              ${canEdit ? `
                <div class="gestao-item-actions">
                  ${status === 'pendente' && itemPayable > 0 ? `
                    <form method="post" class="gestao-item-pay-form" data-require-money>
                      ${csrfField(req)}
                      <input type="hidden" name="action" value="add_payment">
                      <input type="hidden" name="id" value="${e(id)}">
                      <input type="hidden" name="item_id" value="${e(itemId)}">
                      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                      <input type="hidden" name="pagamento_descricao" value="Pagamento de ${e(item.description)}">
                      <input type="hidden" name="pagamento_em" value="${e(datetimeLocalInput())}">
                      <input type="text" name="pagamento_valor" inputmode="decimal" placeholder="Pagar ex: ${e(moneyInput(Math.min(itemPayable, 2500)))}" data-money-input>
                      <button type="submit" class="gestao-btn gestao-btn-secondary">Pagar</button>
                    </form>
                    <form method="post" data-confirm="Quitar ${e(formatMoney(itemPayable))} deste lancamento?">
                      ${csrfField(req)}
                      <input type="hidden" name="action" value="confirm_item">
                      <input type="hidden" name="id" value="${e(id)}">
                      <input type="hidden" name="item_id" value="${e(itemId)}">
                      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                      <button type="submit" class="gestao-btn gestao-btn-ghost">Quitar item</button>
                    </form>
                  ` : ''}
                  <form method="post" class="gestao-item-adjust-form" data-require-money>
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="add_item_adjustment">
                    <input type="hidden" name="id" value="${e(id)}">
                    <input type="hidden" name="item_id" value="${e(itemId)}">
                    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                    <input type="text" name="ajuste_descricao" maxlength="180" placeholder="Juros, multa, diferenca">
                    <input type="text" name="ajuste_valor" inputmode="decimal" placeholder="0,00" data-money-input>
                    <button type="submit" class="gestao-btn gestao-btn-secondary">Adicionar</button>
                  </form>
                  <form method="post" data-confirm="Cancelar este lancamento e pagamentos ligados a ele?">
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="cancel_item">
                    <input type="hidden" name="id" value="${e(id)}">
                    <input type="hidden" name="item_id" value="${e(itemId)}">
                    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                    <button type="submit" class="gestao-link-danger">Cancelar lancamento</button>
                  </form>
                </div>
              ` : ''}
            </section>
          `;
        }).join('')}
       </div>
       </div>`
    : `<div class="gestao-ledger-block"><div class="gestao-ledger-title"><span>Lancamentos abertos</span></div><p class="gestao-empty-line">Sem lancamentos abertos nessa conta.</p></div>`;

  const paymentHtml = activePayments.length
    ? `<div class="gestao-ledger-block gestao-ledger-payments" data-payment-block data-payment-block-id="${e(id)}">
       <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-payment-toggle aria-expanded="false">
         <span>Pagamentos desta conta <em>${e(activePayments.length)} registro(s)</em></span>
         <strong>${e(formatMoney(paidCents))}</strong>
       </button>
       <ul class="gestao-payments" data-payment-list>
        ${activePayments.map((payment) => {
          return `
            <li>
              <span>
                <strong>${e(payment.description)}</strong>
                ${payment.item_description ? `<em>${e(payment.item_description)}</em>` : ''}
                <small>${e(brDate(payment.paid_at, true))}</small>
              </span>
              <strong>${e(formatMoney(payment.amount_cents))}</strong>
              ${canEdit ? `
                <form method="post" data-confirm="Cancelar este pagamento sem apagar o historico?">
                  ${csrfField(req)}
                  <input type="hidden" name="action" value="cancel_payment">
                  <input type="hidden" name="id" value="${e(id)}">
                  <input type="hidden" name="payment_id" value="${e(payment.id)}">
                  <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                  <button type="submit" class="gestao-link-danger">Cancelar</button>
                </form>
              ` : ''}
            </li>
          `;
        }).join('')}
       </ul>
       </div>`
    : `<div class="gestao-ledger-block gestao-ledger-payments" data-payment-block data-payment-block-id="${e(id)}">
       <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-payment-toggle aria-expanded="false">
         <span>Pagamentos desta conta <em>0 registro</em></span>
         <strong>${e(formatMoney(0))}</strong>
       </button>
       <p class="gestao-empty-line" data-payment-list>Nenhum pagamento registrado ainda.</p>
       </div>`;

  const quickHistoryItems = historyItems.slice(-3).reverse();
  const quickCanceledPayments = historyPayments.slice(-3).reverse();
  const historyRows = [
    ...quickHistoryItems.map((item) => {
      const itemCents = Number(item.amount_cents || 0);
      const itemPaid = Number(item.paid_cents || 0);
      const paid = item.status !== 'cancelado' && Math.max(0, itemCents - itemPaid) <= 0;
      return `<li>
        <span>
          <strong>${paid ? 'Lancamento pago' : 'Lancamento cancelado'}</strong>
          <em>${e(item.description)}</em>
          <small>${e(brDate(item.canceled_at || item.created_at, true))}</small>
        </span>
        <strong>${e(formatMoney(itemCents))}</strong>
        ${canEdit && item.status === 'cancelado' ? `<form method="post" data-confirm="Reabrir este lancamento? Os pagamentos cancelados continuam no historico.">
          ${csrfField(req)}
          <input type="hidden" name="action" value="reopen_item">
          <input type="hidden" name="id" value="${e(id)}">
          <input type="hidden" name="item_id" value="${e(item.id)}">
          <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
          <button type="submit" class="gestao-btn gestao-btn-secondary">Reabrir</button>
        </form>` : ''}
      </li>`;
    }),
    ...quickCanceledPayments.map((payment) => `<li>
      <span>
        <strong>Pagamento cancelado</strong>
        <em>${e(payment.description)}${payment.item_description ? ` - ${payment.item_description}` : ''}</em>
        <small>${e(brDate(payment.paid_at, true))}${payment.canceled_at ? ` / cancelado ${e(brDate(payment.canceled_at, true))}` : ''}</small>
      </span>
      <strong>${e(formatMoney(payment.amount_cents))}</strong>
    </li>`),
  ].join('');
  const historyHtml = `<div class="gestao-ledger-block gestao-history" data-history-block data-history-block-id="${e(id)}">
    <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-history-toggle aria-expanded="false">
      <span>Historico rapido <em>${e(Math.min(3, historyItems.length + historyPayments.length))} de ${e(historyItems.length + historyPayments.length)} item(ns)</em></span>
      <strong>ver</strong>
    </button>
    ${historyRows ? `<ul class="gestao-payments gestao-history-list" data-history-list>${historyRows}</ul>` : '<p class="gestao-empty-line" data-history-list>Nenhum historico rapido nessa conta ainda.</p>'}
  </div>`;

  const dueSummary = account.due_at ? brDateOnly(account.due_at) : 'definir';

  const pendingActions = status === 'pendente'
    ? `${remainingCents > 0 ? `
       <form method="post" data-confirm="Registrar ${e(remainingMoney)} como pagamento final desta conta?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="confirm_paid">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-primary">${e(finalButtonLabel)}</button>
       </form>
     ` : `
       <form method="post" data-confirm="Marcar esta conta como paga novamente?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="confirm_paid">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-primary">Confirmar pago</button>
       </form>
     `}
       <form method="post" data-confirm="Cancelar esta conta sem apagar o historico?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="cancel">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-ghost">Cancelar fatura</button>
       </form>`
    : '';

  const paidActions = status === 'pago'
    ? `<form method="post" data-confirm="Reabrir esta conta paga para ajustar lancamentos ou pagamentos?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="reopen">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-secondary">Reabrir pago</button>
       </form>
       <form method="post" data-confirm="Cancelar esta fatura paga sem apagar o historico?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="cancel">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-ghost">Cancelar fatura</button>
       </form>`
    : '';

  const canceledActions = status === 'cancelado'
    ? `<form method="post" data-confirm="Voltar esta conta para pendente?">
         ${csrfField(req)}
         <input type="hidden" name="action" value="reopen">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-secondary">Reabrir conta</button>
       </form>
       <form method="post" action="${BASE_PATH}/" data-confirm="Excluir esta conta cancelada da tela? Isso arquiva a conta e preserva historico/auditoria.">
         ${csrfField(req)}
         <input type="hidden" name="action" value="archive_canceled">
         <input type="hidden" name="id" value="${e(id)}">
         <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
         <button type="submit" class="gestao-btn gestao-btn-ghost">Excluir da tela</button>
       </form>`
    : '';

  const repeatAction = canEdit ? `<form method="post" class="gestao-repeat-toggle-form" data-confirm="${repeatEnabled ? 'Parar a repeticao futura desta conta? A copia ja criada nao sera apagada.' : `Ativar repeticao e criar/garantir copia para ${e(monthLabel(nextMonthValue(account.competence_month || selectedMonth)))}?`}">
    ${csrfField(req)}
    <input type="hidden" name="action" value="toggle_repeat_next_month">
    <input type="hidden" name="id" value="${e(id)}">
    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
    <button type="submit" class="gestao-repeat-toggle ${repeatEnabled ? 'is-on' : 'is-off'}">
      <span>${repeatEnabled ? 'Repetindo mes que vem' : 'Repetir mes que vem'}</span>
    </button>
  </form>` : '';

  const forms = canEdit
    ? `<div class="gestao-ledger-block gestao-adjust-block" data-adjust-block data-adjust-block-id="${e(id)}">
         <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-adjust-toggle aria-expanded="false">
           <span>Ajustes e pagamento</span>
           <strong>${e(remainingMoney)}</strong>
         </button>
         <div class="gestao-action-panel" data-adjust-panel>
           <div class="gestao-account-forms">
         <form method="post" class="gestao-mini-form" data-require-money>
           ${csrfField(req)}
           <input type="hidden" name="action" value="add_item">
           <input type="hidden" name="id" value="${e(id)}">
           <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
           <label><span>Adicionar cobranca/juros geral</span><input type="text" name="novo_item_descricao" maxlength="180" placeholder="Juros, multa, diferenca"></label>
           <label><span>Valor</span><input type="text" name="novo_item_valor" inputmode="decimal" placeholder="0,00" data-money-input></label>
           <button type="submit" class="gestao-btn gestao-btn-secondary">Adicionar no saldo</button>
         </form>
         ${status === 'pendente' && remainingCents > 0 ? `
           <form method="post" class="gestao-mini-form gestao-payment-form" data-require-money>
             ${csrfField(req)}
             <input type="hidden" name="action" value="add_payment">
             <input type="hidden" name="id" value="${e(id)}">
             <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
             <label><span>Pagamento nesta conta</span><input type="text" name="pagamento_descricao" maxlength="180" placeholder="Parcela, pix, boleto"></label>
             <label><span>Valor pago</span><input type="text" name="pagamento_valor" inputmode="decimal" placeholder="ex: ${e(moneyInput(Math.min(remainingCents, 4000)))}" autocomplete="off" data-money-input></label>
             <label><span>Data do pagamento</span><input type="datetime-local" name="pagamento_em" value="${e(datetimeLocalInput())}"></label>
             <button type="submit" class="gestao-btn gestao-btn-primary">Registrar pagamento</button>
           </form>
         ` : ''}
           </div>
         </div>
       </div>`
    : '';

  const titleForm = canEdit ? `<form method="post" class="gestao-title-panel" data-title-edit-panel>
    ${csrfField(req)}
    <input type="hidden" name="action" value="update_title">
    <input type="hidden" name="id" value="${e(id)}">
    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
    <input type="text" name="titulo" maxlength="180" value="${e(account.title)}" required>
    <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar</button>
  </form>` : '';

  const dueForm = canEdit ? `<div class="gestao-ledger-block gestao-due-block" data-due-block data-due-block-id="${e(id)}">
    <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-due-toggle aria-expanded="false">
      <span>Vencimento</span>
      <strong>${e(dueSummary)}</strong>
    </button>
    <form method="post" class="gestao-mini-form gestao-due-form" data-due-panel>
      ${csrfField(req)}
      <input type="hidden" name="action" value="update_due">
      <input type="hidden" name="id" value="${e(id)}">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <label><span>Data</span><input type="date" name="vencimento_em" value="${e(dateInputValue(account.due_at))}"></label>
      <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar</button>
      <button type="submit" name="limpar_vencimento" value="1" class="gestao-btn gestao-btn-ghost">Apagar</button>
    </form>
  </div>` : '';

  const noteForm = `<div class="gestao-note-block" data-note-block data-note-block-id="${e(id)}">
    <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-note-toggle aria-expanded="false">
      <span>Observacao</span>
      <strong>${account.note ? 'editar' : 'abrir'}</strong>
    </button>
    <form method="post" class="gestao-note-panel" data-note-panel>
    ${csrfField(req)}
    <input type="hidden" name="action" value="update_note">
    <input type="hidden" name="id" value="${e(id)}">
    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
    <label><span>Observacao</span><textarea name="observacao" rows="3" placeholder="Observacao desta conta.">${e(account.note || '')}</textarea></label>
    <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar observacao</button>
    </form>
  </div>`;

  const quickPayControl = status === 'pendente'
    ? `<form method="post" class="gestao-quick-pay" data-confirm="${remainingCents > 0 ? `Registrar ${e(remainingMoney)} como pagamento final desta conta?` : 'Marcar esta conta como paga novamente?'}">
        ${csrfField(req)}
        <input type="hidden" name="action" value="confirm_paid">
        <input type="hidden" name="id" value="${e(id)}">
        <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
        <button type="submit" class="gestao-compact-pay">Pagar</button>
      </form>`
    : `<span class="gestao-compact-state">${e(accountStatusLabel(status))}</span>`;
  const monthlyAttrs = options.monthly ? ` data-monthly-item data-monthly-account-id="${e(id)}" draggable="true"` : '';
  const monthlyMeta = options.monthly ? `<em>Repete ${e(monthLabel(nextMonthValue(selectedMonth)))}</em>` : '';

  return `<article class="gestao-account status-${e(status)} due-${e(due.key)} ${options.monthly ? 'is-monthly-item' : ''}" data-account-card data-account-id="${e(id)}"${monthlyAttrs}>
    <div class="gestao-account-compact">
      <span class="gestao-compact-category">${e(categoryLabel(account.category))}</span>
      <strong class="gestao-compact-title">${e(account.title)}${due.label ? `<em>${e(due.label)}</em>` : ''}${monthlyMeta}</strong>
      <span class="gestao-compact-value">${e(formatMoney(remainingCents > 0 ? remainingCents : totalCents))}</span>
      ${quickPayControl}
      <button type="button" class="gestao-compact-open" data-account-toggle data-open-label="Abrir" data-close-label="Fechar" aria-expanded="false">Abrir</button>
    </div>
    <div class="gestao-account-main">
      <div class="gestao-account-details" data-account-details>
        <div class="gestao-account-summary">
        <div class="gestao-account-head">
          <div>
            <span class="gestao-pill">${e(categoryLabel(account.category))}</span>
            <h2><span>${e(account.title)}</span>${canEdit ? `<button type="button" class="gestao-title-edit" data-title-edit-toggle aria-label="Renomear ${e(account.title)}" title="Renomear">✎</button>` : ''}</h2>
          </div>
          <div class="gestao-account-total"><span>Total lancado</span><strong>${e(formatMoney(totalCents))}</strong></div>
        </div>
        <div class="gestao-account-meta">
          <span>Gerado ${e(brDate(account.generated_at, true))}</span>
          <span>Competencia ${e(monthLabel(account.competence_month || selectedMonth))}</span>
          ${status === 'pago' ? `<span>Pago ${e(brDate(account.paid_at, true))}</span>` : ''}
        </div>
        ${due.label ? `<div class="gestao-due-alert"><span>${e(due.label)}</span></div>` : ''}
        <div class="gestao-balance" aria-label="Resumo de pagamento da conta">
          <span>Total <strong>${e(formatMoney(totalCents))}</strong></span>
          <span>Pago <strong>${e(formatMoney(paidCents))}</strong></span>
          <span>Saldo <strong>${e(formatMoney(remainingCents))}</strong></span>
        </div>
          <div class="gestao-progress" aria-hidden="true"><span style="width:${progress.toFixed(2)}%"></span></div>
        </div>
        ${titleForm}
        ${dueForm}
        ${itemHtml}
        ${paymentHtml}
        ${historyHtml}
        ${noteForm}
        ${forms}
        <div class="gestao-account-actions">
          <span class="gestao-status">${e(accountStatusLabel(status))}</span>
          ${pendingActions}
          ${repeatAction}
          ${paidActions}
          ${canceledActions}
        </div>
      </div>
    </div>
  </article>`;
}

function renderNotepad(req: Request, notes: NotepadRow[], selectedMonth: string): string {
  const notesHtml = notes.length
    ? notes.map((note) => `
      <article class="gestao-note-card">
        <form method="post">
          ${csrfField(req)}
          <input type="hidden" name="action" value="update_notepad_note">
          <input type="hidden" name="note_id" value="${e(note.id)}">
          <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
          <textarea name="nota_texto" rows="4">${e(note.body)}</textarea>
          <div class="gestao-note-card-foot">
            <small>Editado ${e(brDate(note.updated_at, true))}</small>
            <div>
              <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar</button>
            </div>
          </div>
        </form>
        <form method="post" data-confirm="Apagar esta anotacao?">
          ${csrfField(req)}
          <input type="hidden" name="action" value="delete_notepad_note">
          <input type="hidden" name="note_id" value="${e(note.id)}">
          <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
          <button type="submit" class="gestao-link-danger">Apagar anotacao</button>
        </form>
      </article>
    `).join('')
    : '<p class="gestao-empty-line">Sem lembretes ainda.</p>';

  return `<aside class="gestao-notepad" aria-label="Bloco de notas da Gestao">
    <div class="gestao-section-title">
      <span class="gestao-kicker">Bloco de notas</span>
      <strong>Lembretes</strong>
    </div>
    <form method="post" class="gestao-notepad-new">
      ${csrfField(req)}
      <input type="hidden" name="action" value="add_notepad_note">
      <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
      <textarea name="nota_texto" rows="5" placeholder="Anote algo para lembrar depois."></textarea>
      <button type="submit" class="gestao-btn gestao-btn-primary">Adicionar nota</button>
    </form>
    <div class="gestao-notes-list">${notesHtml}</div>
  </aside>`;
}

function renderSearchPanel(selectedMonth: string, searchQuery: string, totalResults: number, shownResults: number, currentLimit: number): string {
  const hasSearch = searchQuery !== '';
  const nextLimit = currentLimit + 10;
  const clearUrl = gestaoListUrl(selectedMonth);
  const moreUrl = gestaoListUrl(selectedMonth, '', searchQuery, nextLimit);
  const resultLine = hasSearch
    ? `<p>${e(totalResults)} resultado(s) encontrados. Mostrando ${e(shownResults)}.</p>`
    : '<p>Procure por nome, valor, categoria, vencimento ou data de lancamento.</p>';

  return `<section class="gestao-search-panel" aria-label="Busca de contas">
    <form method="get" class="gestao-search-form">
      <input type="hidden" name="mes" value="${e(selectedMonth)}">
      <label>
        <span>Pesquisar</span>
        <input type="search" name="busca" value="${e(searchQuery)}" placeholder="Ex: Rogerio, 82, boleto, 18/05">
      </label>
      <button type="submit" class="gestao-btn gestao-btn-primary">Buscar</button>
      ${hasSearch ? `<a class="gestao-btn gestao-btn-ghost" href="${e(clearUrl)}">Limpar</a>` : ''}
    </form>
    <div class="gestao-search-meta">
      ${resultLine}
      ${hasSearch && totalResults > shownResults ? `<a href="${e(moreUrl)}">Mostrar mais</a>` : ''}
    </div>
  </section>`;
}

async function renderApp(req: Request): Promise<string> {
  const selectedMonth = monthValue(req.query.mes);
  const searchQuery = queryValue(req.query.busca);
  const searchLimit = searchLimitValue(req.query.limite);
  const selectedCategory = searchQuery ? '' : cleanText(req.query.categoria, 120);
  const flash = takeFlash(req);
  const summary = await monthSummary(selectedMonth);
  const allAccounts = await listAccounts(selectedMonth);
  const notes = await listNotepadNotes();
  const summaries = categorySummaries(allAccounts);
  const activeCategory = summaries.some((summary) => summary.key === selectedCategory) ? selectedCategory : '';
  const searchResults = searchQuery ? searchAccounts(allAccounts, searchQuery) : [];
  const visibleAccounts = searchQuery
    ? searchResults.slice(0, searchLimit).map((result) => result.account)
    : activeCategory
    ? allAccounts.filter((account) => categoryKey(account.category) === activeCategory)
    : allAccounts.filter((account) => account.status === 'pendente');
  const suggestions = summaries.map((summary) => `<option value="${e(summary.label)}">`).join('');
  const accountsHtml = visibleAccounts.length
    ? visibleAccounts.map((account) => renderAccount(req, account, selectedMonth)).join('')
    : `<div class="gestao-empty">${searchQuery ? 'Nada encontrado para essa busca.' : 'Nada lancado nesse mes ainda.'}</div>`;
  const monthlyPanelHtml = renderMonthlyPanel(req, allAccounts, selectedMonth);
  const categoryPanelHtml = renderCategoryPanel(req, summaries, selectedMonth, activeCategory);
  const notepadHtml = renderNotepad(req, notes, selectedMonth);
  const searchPanelHtml = renderSearchPanel(selectedMonth, searchQuery, searchResults.length, visibleAccounts.length, searchLimit);
  const listTitle = searchQuery
    ? `<div class="gestao-section-title"><span class="gestao-kicker">Busca</span><strong>${e(searchQuery)}</strong></div>`
    : `<div class="gestao-section-title"><span class="gestao-kicker">${activeCategory ? 'Categoria filtrada' : 'Contas abertas'}</span><strong>${activeCategory ? e(summaries.find((summary) => summary.key === activeCategory)?.label || '') : e(monthLabel(selectedMonth))}</strong></div>`;
  const contentHtml = `<section class="gestao-layout">
      <form method="post" class="gestao-form" data-gestao-form>
        ${csrfField(req)}
        <input type="hidden" name="action" value="create">
        <div class="gestao-section-title">
          <span class="gestao-kicker">Nova conta</span>
          <strong data-gestao-total>Total R$ 0,00</strong>
        </div>
        <label><span>Nome ou titulo</span><input type="text" name="titulo" maxlength="180" placeholder="Rogerio, Boleto internet, Funcionario Thiago" required></label>
        <div class="gestao-form-grid">
          <label>
            <span>Categoria</span>
            <input type="text" name="categoria" maxlength="80" list="gestao-categorias" placeholder="Digite a categoria">
            <datalist id="gestao-categorias">${suggestions}</datalist>
          </label>
          <label><span>Competencia</span><input type="month" name="competencia_mes" value="${e(selectedMonth)}"></label>
          <label>
            <span>Status inicial</span>
            <select name="status"><option value="pendente">Pendente</option><option value="pago">Pago agora</option></select>
          </label>
          <label><span>Vencimento opcional</span><input type="date" name="vencimento_em"></label>
        </div>
        <div class="gestao-line-items" data-line-items>
          <div class="gestao-line-item">
            <label><span>Descricao do item</span><input type="text" name="item_descricao[]" maxlength="180" placeholder="Salario, boleto, comissao, parcela"></label>
            <label><span>Valor</span><input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input></label>
          </div>
        </div>
        <button type="button" class="gestao-btn gestao-btn-secondary" data-add-item>Adicionar item</button>
        <label class="gestao-check-row"><input type="checkbox" name="repetir_mes" value="1"><span>Repetir mes que vem</span></label>
        <label><span>Observacao</span><textarea name="observacao" rows="3" placeholder="Detalhe curto, se precisar."></textarea></label>
        <button type="submit" class="gestao-btn gestao-btn-primary">Lancar conta</button>
      </form>

      <div class="gestao-lists-grid">
        <section class="gestao-list-panel">
          ${listTitle}
          <div class="gestao-list">${accountsHtml}</div>
        </section>

        ${monthlyPanelHtml}
      </div>

      <div class="gestao-side-stack">
        ${categoryPanelHtml}
        ${notepadHtml}
      </div>
    </section>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${e(ensureCsrf(req))}">
  <title>Gestao - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260524-compact-monthly">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260521a">
  <script src="${BASE_PATH}/app.js?v=20260523-compact-monthly" defer></script>
  <script src="/miauw/widget.js?v=20260521a" defer></script>
</head>
<body class="gestao-app-body" data-gestao-base-path="${e(BASE_PATH)}">
  <header class="gestao-topbar">
    <a class="gestao-brand" href="/">
      <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
      <strong>Gestao</strong>
    </a>
    <nav class="gestao-nav" aria-label="Navegacao">
      <a href="/">Home</a>
      <a href="${BASE_PATH}/logout.php">Sair</a>
    </nav>
  </header>

  <main class="gestao-page" data-miauby-screen-object="modulo gestao" data-miauby-screen-label="Modulo Gestao: ${e(formatMoney(summary.paidCents))} pago no mes, ${e(formatMoney(summary.pendingCents))} pendente">
    <section class="gestao-hero">
      <div>
        <span class="gestao-kicker">Administrativo</span>
        <h1>Gestao</h1>
      </div>
      <form method="get" class="gestao-month-filter">
        <label><span>Mes</span><input type="month" name="mes" value="${e(selectedMonth)}"></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Ver</button>
      </form>
    </section>

    ${flash.message ? `<div class="gestao-alert ${e(flash.type)}">${e(flash.message)}</div>` : ''}

    <section class="gestao-stats" aria-label="Resumo do mes">
      <div><span>Pago</span><strong>${e(formatMoney(summary.paidCents))}</strong></div>
      <div><span>Pendente</span><strong>${e(formatMoney(summary.pendingCents))}</strong></div>
      <div><span>Gerado</span><strong>${e(formatMoney(summary.generatedCents))}</strong></div>
      <div><span>Abertas</span><strong>${e(summary.pendingAccounts)}</strong></div>
    </section>

    ${searchPanelHtml}

    ${contentHtml}
  </main>
</body>
</html>`;
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gestao - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260520-search">
  <script src="${BASE_PATH}/login-runner.js?v=20260518-click" defer></script>
</head>
<body class="gestao-login-body">
  <img class="gestao-login-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
  <main class="gestao-login-card">
    <img class="gestao-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
    <span class="gestao-kicker">Wimifarma Gestao</span>
    <h1>Acesso administrativo</h1>
    <p>Contas a pagar manuais e conferidas antes de virar total do mes.</p>
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
  if (req.path === `${BASE_PATH}/` || req.path === `${BASE_PATH}` || req.path.startsWith(`${BASE_PATH}/api`)) {
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
  let mysqlReachable = false;
  if (AUTH_PROVIDER === 'mysql') {
    await mysqlPool.query('SELECT 1');
    mysqlReachable = true;
  } else if (MYSQL_AUTH_FALLBACK_ENABLED) {
    try {
      await mysqlPool.query('SELECT 1');
      mysqlReachable = true;
    } catch {
      mysqlReachable = false;
    }
  }
  const auth = await coreAuthHealth();
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    runtime: 'node22-typescript',
    database: 'postgres',
    mysql_auth: AUTH_PROVIDER === 'mysql',
    mysql_auth_fallback: MYSQL_AUTH_FALLBACK_ENABLED,
    mysql_reachable: mysqlReachable,
    auth,
    base_path: BASE_PATH,
  });
}));

app.get(`${BASE_PATH}/api/internal/summary`, requireInternalAuth, asyncRoute(async (req, res) => {
  const month = monthValue(req.query.mes || req.query.month || req.query.competencia_mes);
  const summary = await monthSummary(month);
  const accounts = await listAccounts(month);
  const categories = categorySummaries(accounts);
  res.json({
    ok: true,
    month,
    summary: {
      paid_cents: summary.paidCents,
      pending_cents: summary.pendingCents,
      generated_cents: summary.generatedCents,
      pending_accounts: summary.pendingAccounts,
      paid: formatMoney(summary.paidCents),
      pending: formatMoney(summary.pendingCents),
      generated: formatMoney(summary.generatedCents),
    },
    categories: categories.map((category) => ({
      key: category.key,
      label: category.label,
      open_count: category.openCount,
      closed_count: category.closedCount,
      canceled_count: category.canceledCount,
      open_cents: category.openCents,
      closed_cents: category.closedCents,
    })),
    accounts_count: accounts.length,
  });
}));

app.post(`${BASE_PATH}/api/internal/accounts`, requireInternalAuth, asyncRoute(async (req, res) => {
  try {
    const result = await createInternalAccount(req);
    res.status(201).json({
      ok: true,
      account: {
        id: result.accountId,
        title: result.title,
        total_cents: result.totalCents,
        total: formatMoney(result.totalCents),
        month: result.month,
        status: result.status,
      },
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Nao consegui criar a conta.' });
  }
}));

app.post(`${BASE_PATH}/api/monthly-order`, requireAuth, asyncRoute(async (req, res) => {
  if (!csrfMatches(req)) {
    return res.status(403).json({ ok: false, error: 'Sessao expirada. Recarregue a pagina.' });
  }
  try {
    await updateMonthlyOrder(req);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Nao consegui salvar a ordem mensal.' });
  }
}));

app.get(`${BASE_PATH}/api/orders/badge`, asyncRoute(async (_req, res) => {
  res.redirect(308, '/pedidos/api/badge');
}));

app.get(`${BASE_PATH}/login`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req));
});
app.get(`${BASE_PATH}/login.php`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req, req.query.restrito ? 'Gestao e area restrita para adm, admin ou gerente.' : ''));
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
    await logMysql(null, 'login_gestao_falha', 'user', null, `Tentativa de login Gestao Node falhou para usuario: ${username}`);
    return res.status(401).type('html').send(renderLogin(req, 'Usuario, senha ou permissao incorretos.'));
  }

  if (AUTH_PROVIDER === 'mysql') void shadowCoreAuth(username, password, user);
  const returnTo = safeGestaoReturnPath(req.session.returnTo) || `${BASE_PATH}/`;
  clearLoginRateLimit(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[gestao] session regenerate failed', error);
      return res.status(500).type('html').send(renderLogin(req, 'Nao consegui abrir sua sessao agora.'));
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logMysql(user.id, 'login_gestao', 'user', user.id, 'Login Gestao Node realizado.');
    res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
app.get(`${BASE_PATH}/index.php`, requireAuth, (_req, res) => res.redirect(`${BASE_PATH}/`));
app.get(`${BASE_PATH}/`, requireAuth, asyncRoute(async (req, res) => {
  res.type('html').send(await renderApp(req));
}));
app.get(`${BASE_PATH}/pedidos`, (req, res) => {
  const month = monthValue(req.query.mes);
  res.redirect(308, `/pedidos/?mes=${encodeURIComponent(month)}`);
});
app.get(`${BASE_PATH}/pedidos/`, (req, res) => {
  const month = monthValue(req.query.mes);
  res.redirect(308, `/pedidos/?mes=${encodeURIComponent(month)}`);
});

async function handleGestaoPost(req: Request, res: Response): Promise<void> {
  const action = String(req.body.action || '');
  const selectedMonth = monthValue(req.body.competencia_mes);
  const selectedView = currentView(req);
  try {
    if (action === 'create') {
      await createAccount(req);
      setFlash(req, 'success', 'Conta lancada na Gestao.');
    } else if (action === 'create_order' || action === 'confirm_order_arrival') {
      throw new Error('Pedidos agora fica em /pedidos/. Abra pelo card Pedidos.');
    } else if (action === 'add_item') {
      await addItem(req);
      setFlash(req, 'success', 'Item adicionado na conta.');
    } else if (action === 'add_payment') {
      await addPayment(req);
      setFlash(req, 'success', 'Pagamento parcial registrado.');
    } else if (action === 'confirm_paid') {
      await confirmRemaining(req);
      setFlash(req, 'success', 'Saldo confirmado e registrado nos pagamentos.');
    } else if (action === 'confirm_item') {
      await confirmItem(req);
      setFlash(req, 'success', 'Lancamento quitado.');
    } else if (action === 'add_item_adjustment') {
      await addItemAdjustment(req);
      setFlash(req, 'success', 'Juros ou diferenca adicionados ao lancamento.');
    } else if (action === 'cancel_item') {
      await cancelItem(req);
      setFlash(req, 'success', 'Lancamento cancelado sem apagar historico.');
    } else if (action === 'reopen_item') {
      await reopenItem(req);
      setFlash(req, 'success', 'Lancamento reaberto para ajuste.');
    } else if (action === 'cancel_payment') {
      await cancelPayment(req);
      setFlash(req, 'success', 'Pagamento cancelado sem apagar historico.');
    } else if (action === 'update_note') {
      await updateAccountNote(req);
      setFlash(req, 'success', 'Observacao atualizada.');
    } else if (action === 'update_title') {
      await updateAccountTitle(req);
      setFlash(req, 'success', 'Nome da conta atualizado.');
    } else if (action === 'update_due') {
      await updateAccountDue(req);
      setFlash(req, 'success', req.body.limpar_vencimento === '1' ? 'Vencimento removido.' : 'Vencimento atualizado.');
    } else if (action === 'repeat_next_month') {
      const repeated = await repeatAccountNextMonth(req);
      setFlash(req, 'success', `Conta repetida para ${monthLabel(repeated.month)}.`);
    } else if (action === 'toggle_repeat_next_month') {
      const enabled = await toggleRepeatNextMonth(req);
      setFlash(req, 'success', enabled ? 'Conta marcada para repetir mes que vem.' : 'Repeticao do proximo mes desativada.');
    } else if (action === 'update_category_group') {
      const changed = await updateCategoryGroup(req);
      setFlash(req, 'success', `Categoria atualizada em ${changed} conta(s).`);
    } else if (action === 'cancel_category_group') {
      const changed = await cancelCategoryGroup(req);
      setFlash(req, 'success', `Categoria cancelada em ${changed} conta(s) aberta(s).`);
    } else if (action === 'archive_canceled_category_group') {
      const changed = await archiveCanceledCategoryGroup(req);
      setFlash(req, 'success', `${changed} conta(s) cancelada(s) excluida(s) da tela. Historico preservado.`);
    } else if (action === 'add_notepad_note') {
      await addNotepadNote(req);
      setFlash(req, 'success', 'Nota adicionada no bloco de lembretes.');
    } else if (action === 'update_notepad_note') {
      await updateNotepadNote(req);
      setFlash(req, 'success', 'Nota atualizada.');
    } else if (action === 'delete_notepad_note') {
      await deleteNotepadNote(req);
      setFlash(req, 'success', 'Nota apagada.');
    } else if (action === 'cancel') {
      await setStatus(req, 'cancelado');
      setFlash(req, 'success', 'Conta cancelada sem apagar o historico.');
    } else if (action === 'reopen') {
      await reopenAccount(req);
      setFlash(req, 'success', 'Conta reaberta para ajuste.');
    } else if (action === 'archive_canceled') {
      await archiveCanceledAccount(req);
      setFlash(req, 'success', 'Conta cancelada excluida da tela. Historico preservado.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar essa conta agora.');
  }
  redirectHome(res, selectedMonth, selectedView);
}

app.post(`${BASE_PATH}/`, requireAuth, verifyCsrf, asyncRoute(handleGestaoPost));
app.post(`${BASE_PATH}/pedidos`, (_req, res) => res.redirect(303, '/pedidos/'));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gestao] request failed', error);
  if (res.headersSent) return;
  res.status(500).type('html').send('Gestao indisponivel agora.');
});

async function start() {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  if (CORE_AUTH_REQUIRED) {
    await withRetry('core-postgres', () => corePgPool?.query('SELECT 1') || Promise.reject(new Error('core auth disabled')));
  }
  if (AUTH_PROVIDER === 'mysql') {
    await withRetry('mysql', () => mysqlPool.query('SELECT 1'));
  }
  await ensureSchema();
  try {
    await importMysqlGestaoOnce();
  } catch (error) {
    console.warn('[gestao] mysql legacy import skipped', error);
  }
  app.listen(PORT, () => {
    console.log(`[gestao] listening on ${PORT}${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[gestao] startup failed', error);
  process.exit(1);
});
