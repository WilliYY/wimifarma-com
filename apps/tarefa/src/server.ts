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
  display_name?: string;
};

type Flash = {
  type: 'success' | 'error' | '';
  message: string;
};

type TaskPriority = 'alta' | 'normal' | 'baixa';
type TaskStatus = 'aberta' | 'concluida' | 'cancelada';
type TaskReminderStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled' | 'skipped';
type TaskReminderKind = 'manual' | 'assignment_created' | 'assignment_followup';

type CoreUserRow = {
  id: string;
  username: string;
  display_name?: string | null;
  password_hash: string | null;
  role: string | null;
  active: boolean;
};

type TaskRow = {
  id: string;
  legacy_mysql_id: string | null;
  priority: TaskPriority;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: number | null;
  assigned_core_user_id: string | number | null;
  assigned_username_snapshot: string | null;
  delegated_by: number | null;
  delegated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  completed_at: Date | string | null;
  canceled_at: Date | string | null;
};

type AssignableTaskUserRow = {
  id: string;
  username: string;
  display_name?: string | null;
  role: string | null;
  can_access: boolean;
};

type InternalTaskActorRow = AssignableTaskUserRow & {
  active: boolean;
};

type TaskReminderRow = {
  id: string;
  task_id: string | number;
  assigned_core_user_id: string | number;
  assigned_username_snapshot: string;
  remind_at: Date | string;
  kind: TaskReminderKind;
  dedupe_key: string;
  status: TaskReminderStatus;
  requested_by: number | null;
  requested_at: Date | string;
  sent_at: Date | string | null;
  last_attempt_at: Date | string | null;
  attempts: number;
  error_summary: string;
  whatsapp_result: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string | null;
};

type TaskReminderSummaryRow = {
  task_id: string | number;
  sent_count: string | number;
  failed_count: string | number;
  skipped_count: string | number;
  cancelled_count: string | number;
  total_attempts: string | number;
  last_status: TaskReminderStatus | null;
  last_kind: TaskReminderKind | null;
  last_remind_at: Date | string | null;
  last_sent_at: Date | string | null;
  last_attempt_at: Date | string | null;
  last_error_summary: string | null;
};

type DueTaskReminderRow = TaskReminderRow & {
  priority: TaskPriority;
  title: string;
  description: string | null;
  task_status: TaskStatus;
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const env = process.env;

const SERVICE_NAME = 'tarefa';
const SERVICE_VERSION = '1.3.1';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/tarefa');
const PORT = Number.parseInt(env.PORT || '3500', 10);
const SESSION_SECRET = env.TAREFA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_ASSET_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webp|woff2?)$/i;
const INTERNAL_TOKEN = cleanEnv('TAREFA_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_GUARDIAN_TOKEN')
  || cleanEnv('MIAUW_AGENT_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN');
const WHATSAPP_INTERNAL_BASE_URL = trimTrailingSlash(
  cleanEnv('TAREFA_MIAUW_WHATSAPP_INTERNAL_BASE_URL')
    || cleanEnv('MIAUW_WHATSAPP_INTERNAL_BASE_URL')
    || 'http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp',
);
const WHATSAPP_INTERNAL_TOKEN = cleanEnv('TAREFA_MIAUW_WHATSAPP_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_GUARDIAN_TOKEN')
  || INTERNAL_TOKEN;
const WHATSAPP_INTERNAL_TIMEOUT_MS = Math.max(
  1000,
  Math.min(60000, Number.parseInt(env.TAREFA_MIAUW_WHATSAPP_TIMEOUT_MS || '25000', 10) || 25000),
);
const REMINDER_WORKER_INTERVAL_MS = Math.max(
  15000,
  Math.min(300000, Number.parseInt(env.TAREFA_REMINDER_WORKER_INTERVAL_MS || '60000', 10) || 60000),
);
const REMINDER_RETRY_DELAY_MINUTES = Math.max(
  1,
  Math.min(60, Number.parseInt(env.TAREFA_REMINDER_RETRY_DELAY_MINUTES || '5', 10) || 5),
);
const REMINDER_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(10, Number.parseInt(env.TAREFA_REMINDER_MAX_ATTEMPTS || '3', 10) || 3),
);
const REMINDER_IN_FLIGHT_GRACE_MINUTES = Math.max(
  2,
  Math.min(60, Number.parseInt(env.TAREFA_REMINDER_IN_FLIGHT_GRACE_MINUTES || '15', 10) || 15),
);
const TZ = 'America/Sao_Paulo';
const CORE_AUTH_TIMEOUT_MS = Math.max(
  500,
  Math.min(10000, Number.parseInt(env.TAREFA_CORE_AUTH_TIMEOUT_MS || '1500', 10) || 1500),
);

const priorities: Record<TaskPriority, { label: string; rank: number }> = {
  alta: { label: 'Alta', rank: 3 },
  normal: { label: 'Normal', rank: 2 },
  baixa: { label: 'Baixa', rank: 1 },
};

const statuses: Record<TaskStatus, string> = {
  aberta: 'Aberta',
  concluida: 'Concluida',
  cancelada: 'Cancelada',
};

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_tarefa',
  user: env.POSTGRES_USER || 'wimifarma_tarefa',
  password: env.POSTGRES_PASSWORD || '',
  max: 10,
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
  name: 'WFTAREFA',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'tarefa_sessions',
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
  return clean === '' ? '/tarefa' : clean;
}

function cleanEnv(name: string): string {
  return String(env[name] || '').trim();
}

function trimTrailingSlash(value: string): string {
  return String(value || '').replace(/\/+$/, '');
}

function requireCorePgPool(feature: string): pg.Pool {
  if (!corePgPool) {
    throw new Error(`Core Postgres auth is disabled for ${feature}.`);
  }
  return corePgPool;
}

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value: unknown): string {
  return e(value).replace(/\r\n|\r|\n/g, '<br>');
}

function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function trimText(value: unknown, limit: number): string {
  return String(value ?? '').trim().slice(0, limit);
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

function validPriority(value: unknown): TaskPriority {
  const priority = String(value || '').trim();
  return priority === 'alta' || priority === 'normal' || priority === 'baixa' ? priority : 'normal';
}

function validStatus(value: unknown): TaskStatus {
  const status = String(value || '').trim();
  return status === 'aberta' || status === 'concluida' || status === 'cancelada' ? status : 'aberta';
}

function priorityLabel(priority: TaskPriority): string {
  return priorities[priority]?.label || 'Normal';
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

function internalTokenFromRequest(req: Request): string {
  const auth = String(req.get('authorization') || '');
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return cleanText(
    req.get('x-tarefa-internal-token')
      || req.get('x-miauw-internal-token')
      || req.get('x-miauw-agent-token')
      || '',
    300,
  );
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

function redirectHome(res: Response): void {
  res.redirect(`${BASE_PATH}/`);
}

function safeTarefaReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://tarefa.local');
    const allowedPaths = new Set([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`]);
    if (!allowedPaths.has(url.pathname)) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function loginRedirectTarget(req: Request): string {
  const target = safeTarefaReturnPath(req.session.returnTo);
  delete req.session.returnTo;
  return target || `${BASE_PATH}/`;
}

function setStaticAssetCacheHeaders(res: Response, filePath: string): void {
  if (!STATIC_ASSET_FILE_RE.test(filePath)) return;
  res.removeHeader('Pragma');
  res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
  res.setHeader('Expires', new Date(Date.now() + STATIC_ASSET_MAX_AGE_MS).toUTCString());
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
  if (attempts.length >= 5) {
    req.session.loginBlockedUntil = now + 10 * 60 * 1000;
  }
}

function clearLoginRateLimit(req: Request): void {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
}

async function authenticate(username: string, password: string): Promise<User | null> {
  return authenticateCore(username, password);
}

async function currentUser(user: User | undefined): Promise<User | null> {
  if (!user) return null;
  return currentCoreUser(user);
}

async function currentCoreUser(user: User): Promise<User | null> {
  const result = await requireCorePgPool('current user').query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  return row
    ? {
        id: Number(row.id),
        username: String(row.username),
        role: String(row.role || 'user'),
      }
    : null;
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
  const result = await requireCorePgPool('home sso').query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [username],
  );
  const row = result.rows[0];
  return row
    ? {
        id: Number(row.id),
        username: String(row.username),
        role: String(row.role || 'user'),
      }
    : null;
}

async function canAccessModule(user: User, moduleKey: string): Promise<boolean> {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  if (username === 'adm' || role === 'admin') return true;
  const result = await requireCorePgPool('module access').query<{ permission_count: string; can_access: boolean }>(
    `SELECT COUNT(*)::text AS permission_count,
            COALESCE(BOOL_OR(module_key = $2 AND can_access = TRUE), FALSE) AS can_access
       FROM core_user_module_permissions
      WHERE user_id = $1`,
    [user.id, moduleKey],
  );
  const row = result.rows[0];
  const explicitCount = Number(row?.permission_count || 0);
  return explicitCount === 0 ? true : row?.can_access === true;
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

async function ensureSessionUser(req: Request): Promise<User | null> {
  const current = await currentUser(req.session.user);
  const homeUser = await userByHomeSso(req);
  let user = current;
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  } else if (!user && homeUser) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (!user) return null;
  return (await canAccessModule(user, 'tarefa')) ? user : null;
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
  const result = await requireCorePgPool('auth').query<CoreUserRow>(
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
  if (!ok) return null;

  return {
    id: Number(user.id),
    username: String(user.username),
    role: String(user.role || 'user'),
  };
}

async function coreAuthHealth(): Promise<Record<string, unknown>> {
  const state = {
    provider: 'core',
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

async function logCoreAudit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!corePgPool) return;
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, entityId, cleanText(detail, 255), JSON.stringify({ service: SERVICE_NAME, ...metadata })],
    );
  } catch (error) {
    console.warn('[tarefa] failed to write core audit log', error);
  }
}

async function auditPg(client: pg.PoolClient, taskId: number | null, userId: number | null, action: string, summary: string): Promise<void> {
  await client.query(
    'INSERT INTO tarefa_audit_events (task_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [taskId, userId, action, cleanText(summary, 255)],
  );
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  Promise.resolve(ensureSessionUser(req))
    .then((user) => {
      if (!user) {
        const returnTo = safeTarefaReturnPath(req.originalUrl);
        if (returnTo) req.session.returnTo = returnTo;
        res.redirect('/');
        return;
      }
      req.session.user = user;
      next();
    })
    .catch(next);
}

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
  }
  const received = internalTokenFromRequest(req);
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received || expected !== received) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    return redirectHome(res);
  }
  return next();
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function brDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tarefa_sessions (
      sid varchar NOT NULL PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS tarefa_sessions_expire_idx ON tarefa_sessions (expire)');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tarefa_tasks (
      id bigserial PRIMARY KEY,
      legacy_mysql_id bigint UNIQUE,
      priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('alta', 'normal', 'baixa')),
      title varchar(180) NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'cancelada')),
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz,
      completed_at timestamptz,
      canceled_at timestamptz
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS tarefa_tasks_status_priority_created_idx ON tarefa_tasks (status, priority, created_at)');
  await pgPool.query("CREATE INDEX IF NOT EXISTS tarefa_tasks_open_idx ON tarefa_tasks (priority, created_at, id) WHERE status = 'aberta'");
  await pgPool.query(`
    ALTER TABLE tarefa_tasks
      ADD COLUMN IF NOT EXISTS assigned_core_user_id BIGINT NULL,
      ADD COLUMN IF NOT EXISTS assigned_username_snapshot VARCHAR(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS delegated_by INTEGER NULL,
      ADD COLUMN IF NOT EXISTS delegated_at TIMESTAMPTZ NULL
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS tarefa_tasks_assigned_user_status_idx
      ON tarefa_tasks (assigned_core_user_id, status, priority, created_at)
      WHERE assigned_core_user_id IS NOT NULL
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS tarefa_tasks_public_open_idx
      ON tarefa_tasks (priority, created_at, id)
      WHERE status = 'aberta' AND assigned_core_user_id IS NULL
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tarefa_audit_events (
      id bigserial PRIMARY KEY,
      task_id bigint REFERENCES tarefa_tasks(id) ON DELETE SET NULL,
      user_id integer,
      action varchar(80) NOT NULL,
      summary varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS tarefa_audit_events_task_idx ON tarefa_audit_events (task_id, created_at DESC)');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tarefa_reminders (
      id bigserial PRIMARY KEY,
      task_id bigint NOT NULL REFERENCES tarefa_tasks(id) ON DELETE CASCADE,
      assigned_core_user_id bigint NOT NULL,
      assigned_username_snapshot varchar(120) NOT NULL DEFAULT '',
      remind_at timestamptz NOT NULL,
      kind varchar(30) NOT NULL DEFAULT 'manual',
      dedupe_key varchar(180) NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled', 'skipped')),
      requested_by integer,
      requested_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      last_attempt_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      error_summary varchar(255) NOT NULL DEFAULT '',
      whatsapp_result jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz
    )
  `);
  await pgPool.query(`
    ALTER TABLE tarefa_reminders
      ADD COLUMN IF NOT EXISTS kind varchar(30) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS dedupe_key varchar(180) NOT NULL DEFAULT ''
  `);
  await pgPool.query(`
    DO $$
    BEGIN
      ALTER TABLE tarefa_reminders
        ADD CONSTRAINT tarefa_reminders_kind_check
        CHECK (kind IN ('manual', 'assignment_created', 'assignment_followup'));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$;
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS tarefa_reminders_due_idx
      ON tarefa_reminders (status, remind_at, id)
      WHERE status = 'scheduled'
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS tarefa_reminders_task_idx ON tarefa_reminders (task_id, remind_at DESC, id DESC)');
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tarefa_reminders_dedupe_key_idx
      ON tarefa_reminders (dedupe_key)
      WHERE dedupe_key <> ''
        AND status IN ('scheduled', 'sent')
  `);
}

function isTaskAdminIdentity(usernameValue: unknown, roleValue: unknown): boolean {
  const username = normalizeUsername(usernameValue);
  const role = normalizeUsername(roleValue);
  return username === 'adm' || role === 'adm' || role === 'admin';
}

function isTaskAdmin(user: User | null | undefined): boolean {
  return isTaskAdminIdentity(user?.username, user?.role);
}

function isInternalTaskAdmin(user: InternalTaskActorRow | null | undefined): boolean {
  return isTaskAdminIdentity(user?.username, user?.role);
}

function isOfficialPharmacyWhatsappActor(user: InternalTaskActorRow | null | undefined, source: unknown): boolean {
  return normalizeUsername(user?.role) === 'farmacia'
    && normalizeUsername(source) === 'miauby_whatsapp';
}

function taskDisplayName(user: Partial<AssignableTaskUserRow | InternalTaskActorRow> | null | undefined): string {
  return cleanText(user?.display_name || user?.username || '', 120);
}

function taskUserLogin(user: Partial<AssignableTaskUserRow | InternalTaskActorRow> | null | undefined): string {
  return cleanText(user?.username || '', 120);
}

function taskAssigneeLabel(user: Partial<AssignableTaskUserRow | InternalTaskActorRow> | null | undefined): string {
  return taskDisplayName(user) || taskUserLogin(user);
}

function visibleTasksWhere(userId: number, canViewAll = false): string {
  if (canViewAll) return '';
  return userId > 0 ? 'WHERE assigned_core_user_id IS NULL OR assigned_core_user_id = $1' : 'WHERE assigned_core_user_id IS NULL';
}

async function taskCounts(userId = 0, canViewAll = userId <= 0): Promise<Record<TaskStatus, number>> {
  const counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  const result = await pgPool.query<{ status: TaskStatus; total: string }>(
    `SELECT status, COUNT(*) AS total
       FROM tarefa_tasks
       ${visibleTasksWhere(userId, canViewAll)}
      GROUP BY status`,
    canViewAll || userId <= 0 ? [] : [userId],
  );
  for (const row of result.rows) {
    counts[validStatus(row.status)] = Number(row.total || 0);
  }
  return counts;
}

async function countOpenPublic(): Promise<number> {
  const result = await pgPool.query<{ total: string }>("SELECT COUNT(*) AS total FROM tarefa_tasks WHERE status = 'aberta' AND assigned_core_user_id IS NULL");
  return Number(result.rows[0]?.total || 0);
}

async function openTasks(userId: number, canViewAll = false): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
       WHERE status = 'aberta'
         ${canViewAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $1)'}
       ORDER BY
         CASE priority WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
         created_at ASC,
         id ASC`,
    canViewAll ? [] : [userId],
  );
  return result.rows;
}

async function historyTasks(userId: number, canViewAll = false): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
       WHERE status IN ('concluida', 'cancelada')
         ${canViewAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $1)'}
       ORDER BY COALESCE(completed_at, canceled_at, updated_at, created_at) DESC, id DESC
       LIMIT 120`,
    canViewAll ? [] : [userId],
  );
  return result.rows;
}

async function listAssignableTaskUsers(): Promise<AssignableTaskUserRow[]> {
  const result = await requireCorePgPool('task assignees').query<AssignableTaskUserRow>(
    `SELECT u.id::text AS id,
            u.username,
            COALESCE(u.display_name, '') AS display_name,
            u.role,
            COALESCE(p.can_access, FALSE) AS can_access
       FROM core_users u
       LEFT JOIN core_user_module_permissions p
         ON p.user_id = u.id
        AND p.module_key = 'tarefa'
      WHERE u.active = TRUE
        AND (
          u.username_normalized = 'adm'
          OR COALESCE(u.role, '') IN ('adm', 'admin', 'gerente')
          OR COALESCE(p.can_access, FALSE) = TRUE
        )
      ORDER BY
        CASE WHEN u.username_normalized = 'adm' THEN 0 ELSE 1 END,
        lower(COALESCE(NULLIF(u.display_name, ''), u.username))
      LIMIT 250`,
  );
  return result.rows;
}

async function taskAssigneeById(userId: number): Promise<AssignableTaskUserRow | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const result = await requireCorePgPool('task assignee').query<AssignableTaskUserRow>(
    `SELECT u.id::text AS id,
            u.username,
            COALESCE(u.display_name, '') AS display_name,
            u.role,
            COALESCE(p.can_access, FALSE) AS can_access
       FROM core_users u
       LEFT JOIN core_user_module_permissions p
         ON p.user_id = u.id
        AND p.module_key = 'tarefa'
      WHERE u.id = $1
        AND u.active = TRUE
        AND (
          u.username_normalized = 'adm'
          OR COALESCE(u.role, '') IN ('adm', 'admin', 'gerente')
          OR COALESCE(p.can_access, FALSE) = TRUE
        )
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function internalTaskActorById(userId: number): Promise<InternalTaskActorRow | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const result = await requireCorePgPool('task internal actor').query<InternalTaskActorRow>(
    `SELECT u.id::text AS id,
            u.username,
            COALESCE(u.display_name, '') AS display_name,
            u.role,
            u.active,
            COALESCE(p.can_access, FALSE) AS can_access
       FROM core_users u
       LEFT JOIN core_user_module_permissions p
         ON p.user_id = u.id
        AND p.module_key = 'tarefa'
      WHERE u.id = $1
        AND u.active = TRUE
      LIMIT 1`,
    [userId],
  );
  const actor = result.rows[0] || null;
  if (!actor) return null;
  if (isInternalTaskAdmin(actor) || actor.can_access === true) return actor;
  return null;
}

async function selectedAssigneeFromRequest(req: Request, canManageAll: boolean): Promise<AssignableTaskUserRow | null> {
  const raw = String(req.body?.assigned_core_user_id || '').trim();
  if (!raw) return null;
  if (!canManageAll) throw new Error('Somente ADM pode direcionar tarefa para outro usuario.');
  const userId = Number(raw);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Usuario de destino invalido.');
  const assignee = await taskAssigneeById(userId);
  if (!assignee) throw new Error('Usuario de destino nao tem acesso ao modulo Tarefas.');
  return assignee;
}

function parseReminderDate(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const date = localMatch
    ? new Date(`${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}:00-03:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Horario do lembrete Miauby invalido.');
  if (date.getTime() < Date.now() - 60 * 1000) throw new Error('Escolha uma hora futura para o lembrete Miauby.');
  return date;
}

function dateTimeLocalValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year || ''}-${parts.month || ''}-${parts.day || ''}T${parts.hour || '00'}:${parts.minute || '00'}`;
}

function reminderStatusLabel(status: TaskReminderStatus): string {
  if (status === 'scheduled') return 'Agendado';
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Falhou';
  if (status === 'cancelled') return 'Cancelado';
  return 'Ignorado';
}

function validReminderKind(value: unknown): TaskReminderKind {
  const kind = cleanText(value, 40);
  if (kind === 'assignment_created' || kind === 'assignment_followup') return kind;
  return 'manual';
}

function reminderKindLabel(kind: TaskReminderKind): string {
  if (kind === 'assignment_created') return 'Nova tarefa';
  if (kind === 'assignment_followup') return 'Pendente';
  return 'Lembrete';
}

function saoPauloDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year || '0000'}-${parts.month || '00'}-${parts.day || '00'}`;
}

function reminderDedupeKey(taskId: number, kind: TaskReminderKind, remindAt: Date): string {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return '';
  if (kind === 'assignment_created') return `task:${taskId}:assignment-created`;
  if (kind === 'assignment_followup') return `task:${taskId}:assignment-followup:${saoPauloDateKey(remindAt)}`;
  return `task:${taskId}:manual:${Math.floor(remindAt.getTime() / 60000)}`;
}

async function latestReminderMap(taskIds: number[]): Promise<Map<number, TaskReminderRow>> {
  const uniqueIds = [...new Set(taskIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const map = new Map<number, TaskReminderRow>();
  if (uniqueIds.length === 0) return map;
  const result = await pgPool.query<TaskReminderRow>(
    `SELECT DISTINCT ON (task_id) *
       FROM tarefa_reminders
      WHERE task_id = ANY($1::bigint[])
      ORDER BY task_id,
        CASE status WHEN 'scheduled' THEN 0 WHEN 'failed' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
        CASE kind WHEN 'manual' THEN 0 ELSE 1 END,
        remind_at DESC,
        id DESC`,
    [uniqueIds],
  );
  for (const row of result.rows) map.set(Number(row.task_id), row);
  return map;
}

async function reminderSummaryMap(taskIds: number[]): Promise<Map<number, TaskReminderSummaryRow>> {
  const uniqueIds = [...new Set(taskIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const map = new Map<number, TaskReminderSummaryRow>();
  if (uniqueIds.length === 0) return map;
  const result = await pgPool.query<TaskReminderSummaryRow>(
    `WITH base AS (
       SELECT *
         FROM tarefa_reminders
        WHERE task_id = ANY($1::bigint[])
     ),
     latest AS (
       SELECT DISTINCT ON (task_id)
              task_id,
              status AS last_status,
              kind AS last_kind,
              remind_at AS last_remind_at,
              sent_at AS last_sent_at,
              last_attempt_at,
              error_summary AS last_error_summary
         FROM base
        ORDER BY task_id,
                 COALESCE(updated_at, last_attempt_at, sent_at, requested_at, created_at) DESC,
                 id DESC
     )
     SELECT base.task_id,
            COUNT(*) FILTER (WHERE base.status = 'sent')::int AS sent_count,
            COUNT(*) FILTER (WHERE base.status = 'failed')::int AS failed_count,
            COUNT(*) FILTER (WHERE base.status = 'skipped')::int AS skipped_count,
            COUNT(*) FILTER (WHERE base.status = 'cancelled')::int AS cancelled_count,
            COALESCE(SUM(base.attempts), 0)::int AS total_attempts,
            latest.last_status,
            latest.last_kind,
            latest.last_remind_at,
            latest.last_sent_at,
            latest.last_attempt_at,
            latest.last_error_summary
       FROM base
       JOIN latest ON latest.task_id = base.task_id
      GROUP BY base.task_id,
               latest.last_status,
               latest.last_kind,
               latest.last_remind_at,
               latest.last_sent_at,
               latest.last_attempt_at,
               latest.last_error_summary`,
    [uniqueIds],
  );
  for (const row of result.rows) map.set(Number(row.task_id), row);
  return map;
}

async function auditTaskEvent(taskId: number | null, userId: number | null, action: string, summary: string): Promise<void> {
  await pgPool.query(
    'INSERT INTO tarefa_audit_events (task_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [taskId, userId, action, cleanText(summary, 255)],
  );
}

async function cancelScheduledReminders(
  client: pg.PoolClient,
  taskId: number,
  userId: number | null,
  reason: string,
  kind?: TaskReminderKind,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `UPDATE tarefa_reminders
        SET status = 'cancelled',
            error_summary = $2,
            updated_at = NOW()
      WHERE task_id = $1
        AND status = 'scheduled'
        AND ($3::text = '' OR kind = $3)
      RETURNING id`,
    [taskId, cleanText(reason, 255), kind || ''],
  );
  const changed = Number(result.rowCount || 0);
  if (changed > 0) {
    await auditPg(client, taskId, userId, 'tarefa_lembrete_cancelado', reason);
  }
  return changed;
}

async function insertTaskReminder(
  client: pg.PoolClient,
  task: TaskRow,
  remindAt: Date,
  userId: number | null,
  kindValue: TaskReminderKind = 'manual',
): Promise<TaskReminderRow> {
  const assignedUserId = Number(task.assigned_core_user_id || 0);
  if (!assignedUserId) throw new Error('Escolha um usuario para o lembrete Miauby.');
  if (validStatus(task.status) !== 'aberta') throw new Error('Lembrete Miauby so pode ser agendado em tarefa aberta.');
  const kind = validReminderKind(kindValue);
  const taskId = Number(task.id);
  const dedupeKey = reminderDedupeKey(taskId, kind, remindAt);
  const result = await client.query<TaskReminderRow>(
    `INSERT INTO tarefa_reminders (
       task_id, assigned_core_user_id, assigned_username_snapshot, remind_at, requested_by, kind, dedupe_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [taskId, assignedUserId, cleanText(task.assigned_username_snapshot, 120), remindAt, userId, kind, dedupeKey],
  );
  const inserted = result.rows[0];
  if (inserted) {
    const action = kind === 'manual' ? 'tarefa_lembrete_agendado' : 'tarefa_aviso_miauby_agendado';
    const summary = kind === 'manual'
      ? `Lembrete Miauby agendado para ${brDate(remindAt, true)}.`
      : `${reminderKindLabel(kind)} Miauby agendado para ${brDate(remindAt, true)}.`;
    await auditPg(client, taskId, userId, action, summary);
    return inserted;
  }
  const existing = await client.query<TaskReminderRow>(
    `SELECT *
       FROM tarefa_reminders
      WHERE dedupe_key = $1
      LIMIT 1`,
    [dedupeKey],
  );
  const duplicate = existing.rows[0];
  if (!duplicate) throw new Error('Falha ao registrar lembrete Miauby.');
  return duplicate;
}

async function syncTaskReminder(client: pg.PoolClient, task: TaskRow, remindAt: Date | null, userId: number | null): Promise<string> {
  const taskId = Number(task.id);
  const existing = await client.query<TaskReminderRow>(
    `SELECT *
      FROM tarefa_reminders
      WHERE task_id = $1
        AND status = 'scheduled'
        AND kind = 'manual'
      ORDER BY remind_at DESC, id DESC
      LIMIT 1
      FOR UPDATE`,
    [taskId],
  );
  const current = existing.rows[0] || null;
  if (!remindAt) {
    if (current) {
      await cancelScheduledReminders(client, taskId, userId, 'Lembrete Miauby removido.', 'manual');
      return 'cancelled';
    }
    return '';
  }
  const assignedUserId = Number(task.assigned_core_user_id || 0);
  const unchanged = current
    && Number(current.assigned_core_user_id || 0) === assignedUserId
    && Math.abs(new Date(current.remind_at).getTime() - remindAt.getTime()) < 60 * 1000;
  if (unchanged) return 'unchanged';
  if (current) await cancelScheduledReminders(client, taskId, userId, 'Lembrete Miauby reagendado.', 'manual');
  await insertTaskReminder(client, task, remindAt, userId);
  return 'scheduled';
}

async function postWhatsappTaskReminder(row: DueTaskReminderRow): Promise<Record<string, unknown>> {
  if (!WHATSAPP_INTERNAL_TOKEN) throw new Error('whatsapp_internal_token_not_configured');
  if (!WHATSAPP_INTERNAL_BASE_URL) throw new Error('whatsapp_internal_base_url_not_configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATSAPP_INTERNAL_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_INTERNAL_BASE_URL}/internal/task-reminder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_INTERNAL_TOKEN}`,
        'X-Miauw-Internal-Token': WHATSAPP_INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        source: 'tarefa_reminder',
        reminder_id: Number(row.id),
        reminder_kind: validReminderKind(row.kind),
        dedupe_key: cleanText(row.dedupe_key, 180),
        task_id: Number(row.task_id),
        user_id: Number(row.assigned_core_user_id),
        username: row.assigned_username_snapshot || '',
        priority: row.priority,
        title: row.title,
        description: row.description || '',
        remind_at: new Date(row.remind_at).toISOString(),
        task_url: '/tarefa/',
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || data.ok !== true) {
      throw new Error(cleanText(data.error || data.message || `whatsapp_http_${response.status}`, 180));
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function finishReminder(row: DueTaskReminderRow, status: TaskReminderStatus, summary: string, result: Record<string, unknown> = {}): Promise<void> {
  const sent = status === 'sent';
  await pgPool.query(
    `UPDATE tarefa_reminders
        SET status = $2::varchar,
            sent_at = CASE WHEN $2::varchar = 'sent' THEN NOW() ELSE sent_at END,
            error_summary = $3,
            whatsapp_result = $4::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [Number(row.id), status, cleanText(summary, 255), JSON.stringify(result)],
  );
  const action = sent ? 'tarefa_lembrete_enviado' : status === 'skipped' ? 'tarefa_lembrete_ignorado' : 'tarefa_lembrete_falhou';
  await auditTaskEvent(Number(row.task_id), Number(row.requested_by || 0) || null, action, summary);
}

async function retryReminder(row: DueTaskReminderRow, error: unknown): Promise<void> {
  const summary = cleanText(error instanceof Error ? error.message : String(error), 255) || 'Falha ao enviar lembrete Miauby.';
  if (Number(row.attempts || 0) >= REMINDER_MAX_ATTEMPTS) {
    await finishReminder(row, 'failed', summary, { error: summary, attempts: row.attempts });
    return;
  }
  await pgPool.query(
    `UPDATE tarefa_reminders
        SET remind_at = NOW() + ($2::text || ' minutes')::interval,
            error_summary = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [Number(row.id), String(REMINDER_RETRY_DELAY_MINUTES), summary],
  );
  await auditTaskEvent(Number(row.task_id), Number(row.requested_by || 0) || null, 'tarefa_lembrete_retry', `Lembrete Miauby reagendado apos falha: ${summary}`);
}

async function scheduleNextAssignmentFollowup(row: DueTaskReminderRow): Promise<void> {
  const kind = validReminderKind(row.kind);
  if (kind !== 'assignment_created' && kind !== 'assignment_followup') return;
  const taskId = Number(row.task_id || 0);
  const assignedUserId = Number(row.assigned_core_user_id || 0);
  if (!Number.isSafeInteger(taskId) || taskId <= 0 || !Number.isSafeInteger(assignedUserId) || assignedUserId <= 0) return;

  const nextAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const taskResult = await client.query<TaskRow>(
      `SELECT *
         FROM tarefa_tasks
        WHERE id = $1
          AND status = 'aberta'
          AND assigned_core_user_id = $2
        FOR UPDATE`,
      [taskId, assignedUserId],
    );
    const task = taskResult.rows[0];
    if (task) {
      await insertTaskReminder(client, task, nextAt, Number(row.requested_by || 0) || null, 'assignment_followup');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.warn('[tarefa] reminder followup schedule failed', error);
  } finally {
    client.release();
  }
}

async function processDueTaskReminders(): Promise<void> {
  const result = await pgPool.query<DueTaskReminderRow>(
    `WITH due AS (
       SELECT id
         FROM tarefa_reminders
        WHERE status = 'scheduled'
          AND remind_at <= NOW()
          AND (
            last_attempt_at IS NULL
            OR remind_at > last_attempt_at
            OR last_attempt_at < NOW() - ($1::text || ' minutes')::interval
          )
        ORDER BY remind_at ASC, id ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
     )
     UPDATE tarefa_reminders r
        SET attempts = r.attempts + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
       FROM due, tarefa_tasks t
      WHERE r.id = due.id
        AND t.id = r.task_id
      RETURNING r.*, t.priority, t.title, t.description, t.status AS task_status`,
    [String(REMINDER_IN_FLIGHT_GRACE_MINUTES)],
  );

  for (const row of result.rows) {
    if (validStatus(row.task_status) !== 'aberta') {
      await finishReminder(row, 'skipped', 'Tarefa nao esta mais aberta.', { skipped: true, reason: 'task_not_open' });
      continue;
    }
    try {
      const data = await postWhatsappTaskReminder(row);
      const sent = Number(data.sent || 0);
      const recipients = Number(data.recipients || 0);
      const blocked = Number(data.blocked || 0);
      const errors = Array.isArray(data.errors) ? data.errors.map((item) => cleanText(item, 120)).filter(Boolean) : [];
      if (sent > 0) {
        await finishReminder(row, 'sent', `Lembrete Miauby enviado para ${sent} contato(s).`, data);
        await scheduleNextAssignmentFollowup(row);
      } else if (errors.some((error) => error === 'duplicate_task_reminder')) {
        await finishReminder(row, 'sent', 'Lembrete Miauby ja havia sido enviado; repeticao bloqueada.', data);
        await scheduleNextAssignmentFollowup(row);
      } else if (blocked > 0 || errors.some((error) => error === 'user_on_vacation')) {
        await finishReminder(row, 'skipped', 'Lembrete Miauby nao enviado: usuario em ferias.', data);
      } else if (errors.some((error) => error === 'whatsapp_transport_unavailable' || error === 'provider_paused' || error === 'task_reminder_in_flight')) {
        throw new Error(errors[0]);
      } else {
        await finishReminder(row, 'failed', errors[0] || (recipients === 0 ? 'Nenhum WhatsApp com card Tarefas vinculado ao usuario.' : 'WhatsApp nao enviou o lembrete.'), data);
      }
    } catch (error) {
      await retryReminder(row, error);
    }
  }
}

async function createTask(req: Request): Promise<number> {
  const priority = validPriority(req.body.prioridade);
  const title = trimText(req.body.titulo, 180);
  const description = String(req.body.descricao || '').trim();
  const userId = req.session.user?.id || null;
  const canManageAll = isTaskAdmin(req.session.user);
  const assignee = await selectedAssigneeFromRequest(req, canManageAll);
  const remindAt = parseReminderDate(reminderValueFromBody(req.body));
  if (!title) throw new Error('Informe o titulo da tarefa.');
  if (remindAt && !assignee) throw new Error('Escolha um usuario para o lembrete Miauby.');

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<TaskRow>(
      `INSERT INTO tarefa_tasks (
         priority, title, description, status, created_by,
         assigned_core_user_id, assigned_username_snapshot, delegated_by, delegated_at
       )
       VALUES ($1, $2, $3, 'aberta', $4, $5, $6, $7, CASE WHEN $5::bigint IS NULL THEN NULL ELSE NOW() END)
       RETURNING *`,
      [priority, title, description, userId, assignee ? Number(assignee.id) : null, assignee ? taskAssigneeLabel(assignee) : '', assignee ? userId : null],
    );
    const task = result.rows[0];
    const taskId = Number(task?.id || 0);
    await auditPg(
      client,
      taskId,
      userId,
      assignee ? 'tarefa_privada_criada' : 'tarefa_criada',
      assignee ? `Tarefa privada criada para ${taskAssigneeLabel(assignee)}: ${title}` : `Tarefa criada: ${title}`,
    );
    if (assignee) await insertTaskReminder(client, task, new Date(), userId, 'assignment_created');
    if (remindAt) await insertTaskReminder(client, task, remindAt, userId);
    await client.query('COMMIT');
    void logCoreAudit(userId, assignee ? 'tarefa_privada_criada' : 'tarefa_criada', 'task', String(taskId), `Tarefa criada: ${title}`, {
      assigned_core_user_id: assignee ? Number(assignee.id) : null,
      assigned_username: assignee ? taskUserLogin(assignee) : null,
      assigned_display_name: assignee ? taskAssigneeLabel(assignee) : null,
      miauby_reminder_at: remindAt ? remindAt.toISOString() : null,
    });
    return taskId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createPrivateTaskFromInternal(req: Request): Promise<TaskRow> {
  const priority = validPriority(req.body?.priority || req.body?.prioridade);
  const title = trimText(req.body?.title || req.body?.titulo, 180);
  const description = String(req.body?.description || req.body?.descricao || '').trim();
  const assignedUserId = Number(req.body?.assigned_core_user_id || req.body?.user_id || 0);
  const actorUserId = Number(req.body?.actor_user_id || 0) || null;
  const actorUsername = cleanText(req.body?.actor_username || '', 120);
  const remindAt = parseReminderDate(req.body?.remind_at || req.body?.reminder_at || '');
  if (!title) throw new Error('Informe o titulo da tarefa.');
  if (!Number.isSafeInteger(assignedUserId) || assignedUserId <= 0) {
    throw new Error('Usuario de destino invalido.');
  }
  const actor = actorUserId ? await internalTaskActorById(actorUserId) : null;
  if (actorUserId && !actor) {
    throw new Error('Usuario executor nao tem acesso ao modulo Tarefas.');
  }
  if (actor && actorUserId !== assignedUserId && !isInternalTaskAdmin(actor) && !isOfficialPharmacyWhatsappActor(actor, req.body?.source)) {
    throw new Error('Somente ADM pode direcionar tarefa para outro usuario.');
  }
  const assignee = await taskAssigneeById(assignedUserId);
  if (!assignee) {
    throw new Error('Usuario de destino nao tem acesso ao modulo Tarefas.');
  }
  const assignedUsername = cleanText(assignee.username, 120);
  const assignedDisplayName = taskDisplayName(assignee);
  const assignedSnapshotName = assignedDisplayName || assignedUsername;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<TaskRow>(
      `INSERT INTO tarefa_tasks (
         priority, title, description, status, created_by,
         assigned_core_user_id, assigned_username_snapshot, delegated_by, delegated_at
       )
       VALUES ($1, $2, $3, 'aberta', $4, $5, $6, $7, NOW())
       RETURNING *`,
      [priority, title, description, actorUserId, assignedUserId, assignedSnapshotName, actorUserId],
    );
    const task = result.rows[0];
    await insertTaskReminder(client, task, new Date(), actorUserId, 'assignment_created');
    if (remindAt) await insertTaskReminder(client, task, remindAt, actorUserId);
    await auditPg(
      client,
      Number(task.id),
      actorUserId,
      'tarefa_privada_delegada',
      `Tarefa privada delegada para ${assignedDisplayName || assignedUsername || assignedUserId}: ${title}`,
    );
    await client.query('COMMIT');
    void logCoreAudit(actorUserId, 'tarefa_privada_delegada', 'task', String(task.id), `Tarefa privada delegada por ${actorUsername || 'sistema'}.`, {
      assigned_core_user_id: assignedUserId,
      assigned_username: assignedUsername || null,
      assigned_display_name: assignedDisplayName || null,
      miauby_reminder_at: remindAt ? remindAt.toISOString() : null,
      source: cleanText(req.body?.source || '', 80) || null,
    });
    return task;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createPublicTaskFromInternal(req: Request): Promise<TaskRow> {
  const priority = validPriority(req.body?.priority || req.body?.prioridade);
  const title = trimText(req.body?.title || req.body?.titulo, 180);
  const description = String(req.body?.description || req.body?.descricao || '').trim();
  const actorUserId = Number(req.body?.actor_user_id || req.body?.usuario_id || 0) || null;
  const actorUsername = cleanText(req.body?.actor_username || req.body?.username || 'Miauby', 120);
  if (!title) throw new Error('Informe o titulo da tarefa.');
  const actor = actorUserId ? await internalTaskActorById(actorUserId) : null;
  if (actorUserId && !actor) {
    throw new Error('Usuario executor nao tem acesso ao modulo Tarefas.');
  }
  if (actor && !isInternalTaskAdmin(actor) && !isOfficialPharmacyWhatsappActor(actor, req.body?.source)) {
    throw new Error('Somente ADM pode criar tarefa geral pelo Miauby.');
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<TaskRow>(
      `INSERT INTO tarefa_tasks (priority, title, description, status, created_by)
       VALUES ($1, $2, $3, 'aberta', $4)
       RETURNING *`,
      [priority, title, description, actorUserId],
    );
    const task = result.rows[0];
    await auditPg(client, Number(task.id), actorUserId, 'tarefa_criada_miauby', `Tarefa criada pelo Miauby: ${title}`);
    await client.query('COMMIT');
    void logCoreAudit(actorUserId, 'tarefa_criada_miauby', 'task', String(task.id), `Tarefa criada pelo Miauby por ${actorUsername}.`, {
      source: cleanText(req.body?.source || '', 80) || 'miauby_internal_tool',
    });
    return task;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function publicTaskPayload(task: TaskRow): Record<string, unknown> {
  return {
    id: Number(task.id),
    status: task.status,
    priority: task.priority,
    title: task.title,
    description: task.description || '',
    created_by: task.created_by === null ? null : Number(task.created_by),
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

function renderAssigneeOptions(users: AssignableTaskUserRow[], selectedId: number): string {
  const options = ['<option value="">Todos da equipe</option>'];
  for (const user of users) {
    const id = Number(user.id || 0);
    const label = taskAssigneeLabel(user);
    options.push(`<option value="${e(id)}" ${id === selectedId ? 'selected' : ''}>${e(label)}</option>`);
  }
  return options.join('');
}

function reminderParts(value: string): { date: string; time: string } {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  return {
    date: match?.[1] || '',
    time: match?.[2] || '',
  };
}

function reminderValueFromBody(body: Record<string, unknown>): string {
  const hasDate = Object.prototype.hasOwnProperty.call(body || {}, 'remind_date');
  const hasTime = Object.prototype.hasOwnProperty.call(body || {}, 'remind_time');
  if (hasDate || hasTime) {
    const date = cleanText(body?.remind_date, 10);
    const time = cleanText(body?.remind_time, 5);
    if (!date && !time) return '';
    if (!date || !time) throw new Error('Informe dia e horario para o lembrete Miauby.');
    return `${date}T${time}`;
  }
  return String(body?.remind_at || '').trim();
}

function renderReminderControl(value = '', help = 'Opcional. Para enviar lembrete, escolha um usuario privado.'): string {
  const parts = reminderParts(value);
  return `
    <div class="task-field task-reminder-field" data-reminder-control>
        <div class="task-field-title">
            <span>Lembrete Miauby (WhatsApp)</span>
            <strong>dia e horario</strong>
        </div>
        <input type="hidden" name="remind_at" value="${e(value)}" data-reminder-value>
        <div class="task-reminder-grid">
            <label>
                <span>Dia</span>
                <input type="date" name="remind_date" value="${e(parts.date)}" data-reminder-date>
            </label>
            <label>
                <span>Horario</span>
                <input type="time" name="remind_time" value="${e(parts.time)}" data-reminder-time>
            </label>
        </div>
        <small class="task-form-help">${e(help)}</small>
    </div>`;
}

function renderReminderPill(reminder: TaskReminderRow | undefined): string {
  if (!reminder) return '';
  const status = reminder.status || 'scheduled';
  const kind = validReminderKind(reminder.kind);
  const when = brDate(status === 'sent' && reminder.sent_at ? reminder.sent_at : reminder.remind_at, true);
  return `<span class="task-reminder-pill status-${e(status)}">Miauby ${e(reminderKindLabel(kind))}: ${e(reminderStatusLabel(status))} ${e(when)}</span>`;
}

function countValue(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function renderWhatsappReminderStatus(summary: TaskReminderSummaryRow | undefined, canManageAll: boolean): string {
  if (!canManageAll || !summary) return '';
  const status = summary.last_status || 'scheduled';
  const sentCount = countValue(summary.sent_count);
  const failedCount = countValue(summary.failed_count);
  const skippedCount = countValue(summary.skipped_count);
  const cancelledCount = countValue(summary.cancelled_count);
  const totalAttempts = countValue(summary.total_attempts);
  const lastDate = summary.last_sent_at || summary.last_attempt_at || summary.last_remind_at;
  const detail = sentCount > 0
    ? `Ultimo envio: ${brDate(summary.last_sent_at || lastDate, true)}`
    : `${reminderStatusLabel(status)}: ${brDate(lastDate, true)}`;
  const title = [
    `Miauby Whats`,
    `${sentCount} envio(s) confirmado(s)`,
    totalAttempts > 0 ? `${totalAttempts} tentativa(s)` : '',
    failedCount > 0 ? `${failedCount} falha(s)` : '',
    skippedCount > 0 ? `${skippedCount} ignorado(s)` : '',
    cancelledCount > 0 ? `${cancelledCount} cancelado(s)` : '',
    summary.last_error_summary ? `Ultimo detalhe: ${cleanText(summary.last_error_summary, 180)}` : '',
  ].filter(Boolean).join(' | ');
  return `
    <span class="task-whatsapp-pill status-${e(status)}" title="${e(title)}">
      <strong>Miauby Whats</strong>
      <span>${e(sentCount)} envio(s)</span>
      <small>${e(detail)}</small>
    </span>`;
}

function assigneeLabelForTask(task: TaskRow, users: AssignableTaskUserRow[]): string {
  const assignedUserId = Number(task.assigned_core_user_id || 0);
  const currentUser = users.find((user) => Number(user.id || 0) === assignedUserId);
  return taskAssigneeLabel(currentUser) || cleanText(task.assigned_username_snapshot, 80);
}

async function updateTask(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const priority = validPriority(req.body.prioridade);
  const title = trimText(req.body.titulo, 180);
  const description = String(req.body.descricao || '').trim();
  if (!id || !title) throw new Error('Tarefa invalida.');
  const userId = req.session.user?.id || 0;
  const canManageAll = isTaskAdmin(req.session.user);
  const assigneeFieldPresent = Object.prototype.hasOwnProperty.call(req.body || {}, 'assigned_core_user_id');
  const reminderFieldPresent = Object.prototype.hasOwnProperty.call(req.body || {}, 'remind_at');
  if (!canManageAll && (assigneeFieldPresent || reminderFieldPresent)) {
    throw new Error('Somente ADM pode alterar dono ou lembrete Miauby.');
  }
  const selectedAssignee = canManageAll && assigneeFieldPresent
    ? await selectedAssigneeFromRequest(req, true)
    : undefined;
  const remindAt = canManageAll && reminderFieldPresent ? parseReminderDate(reminderValueFromBody(req.body)) : undefined;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<TaskRow>(
      `SELECT *
         FROM tarefa_tasks
        WHERE id = $1
          ${canManageAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $2)'}
        FOR UPDATE`,
      canManageAll ? [id] : [id, userId],
    );
    const current = existing.rows[0];
    if (!current) throw new Error('Tarefa invalida.');

    const nextAssignedId = assigneeFieldPresent
      ? (selectedAssignee ? Number(selectedAssignee.id) : null)
      : (current.assigned_core_user_id ? Number(current.assigned_core_user_id) : null);
    const nextAssignedName = assigneeFieldPresent
      ? (selectedAssignee ? taskAssigneeLabel(selectedAssignee) : '')
      : (current.assigned_username_snapshot || '');
    const assignmentChanged = assigneeFieldPresent
      && Number(current.assigned_core_user_id || 0) !== Number(nextAssignedId || 0);

    const result = await client.query<TaskRow>(
      `UPDATE tarefa_tasks
          SET priority = $1,
              title = $2,
              description = $3,
              assigned_core_user_id = $4,
              assigned_username_snapshot = $5,
              delegated_by = CASE WHEN $6::boolean THEN $7 ELSE delegated_by END,
              delegated_at = CASE
                WHEN $6::boolean AND $4::bigint IS NOT NULL THEN NOW()
                WHEN $6::boolean THEN NULL
                ELSE delegated_at
              END,
              updated_at = NOW()
        WHERE id = $8
        RETURNING *`,
      [priority, title, description, nextAssignedId, nextAssignedName, assignmentChanged, userId || null, id],
    );
    const task = result.rows[0];
    if (!task) throw new Error('Tarefa invalida.');
    if (canManageAll && assignmentChanged) {
      await cancelScheduledReminders(client, id, userId || null, 'Lembrete Miauby cancelado porque o usuario da tarefa mudou.');
    }
    if (canManageAll && reminderFieldPresent) {
      await syncTaskReminder(client, task, remindAt || null, userId || null);
    }
    if (canManageAll && assignmentChanged && nextAssignedId) {
      await insertTaskReminder(client, task, new Date(), userId || null, 'assignment_created');
    }
    await auditPg(client, id, req.session.user?.id || null, 'tarefa_editada', `Tarefa editada: ${title}`);
    await client.query('COMMIT');
    void logCoreAudit(req.session.user?.id || null, 'tarefa_editada', 'task', String(id), `Tarefa editada: ${title}`, {
      assigned_core_user_id: nextAssignedId,
      assigned_username: selectedAssignee ? taskUserLogin(selectedAssignee) : nextAssignedName || null,
      assigned_display_name: nextAssignedName || null,
      miauby_reminder_at: remindAt ? remindAt.toISOString() : null,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setTaskStatus(req: Request, status: TaskStatus): Promise<void> {
  const id = Number(req.body.id || 0);
  if (!id) throw new Error('Tarefa invalida.');
  const userId = req.session.user?.id || 0;
  const canManageAll = isTaskAdmin(req.session.user);
  const completedAt = status === 'concluida' ? 'now()' : 'NULL';
  const canceledAt = status === 'cancelada' ? 'now()' : 'NULL';
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<TaskRow>(
      `UPDATE tarefa_tasks
          SET status = $1,
              completed_at = ${completedAt},
              canceled_at = ${canceledAt},
              updated_at = NOW()
        WHERE id = $2
          ${canManageAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $3)'}
        RETURNING *`,
      canManageAll ? [status, id] : [status, id, userId],
    );
    const task = result.rows[0];
    if (!task) throw new Error('Tarefa invalida.');
    if (status !== 'aberta') {
      await cancelScheduledReminders(client, id, req.session.user?.id || null, `Lembrete Miauby cancelado porque a tarefa foi marcada como ${status}.`);
    }
    await auditPg(client, id, req.session.user?.id || null, 'tarefa_status', `Tarefa marcada como ${status}.`);
    await client.query('COMMIT');
    void logCoreAudit(req.session.user?.id || null, 'tarefa_status', 'task', String(id), `Tarefa marcada como ${status}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function renderTask(
  req: Request,
  task: TaskRow,
  reminders: Map<number, TaskReminderRow>,
  reminderSummaries: Map<number, TaskReminderSummaryRow>,
  assignableUsers: AssignableTaskUserRow[],
  canManageAll: boolean,
  history = false,
): string {
  const id = Number(task.id || 0);
  const priority = validPriority(task.priority);
  const status = validStatus(task.status);
  const title = String(task.title || '');
  const description = String(task.description || '').trim();
  const date = brDate(task.created_at, true);
  const finishDate = status === 'concluida' ? brDate(task.completed_at, true) : brDate(task.canceled_at, true);
  const assignedUserId = Number(task.assigned_core_user_id || 0);
  const assignedLabel = assigneeLabelForTask(task, assignableUsers);
  const reminder = reminders.get(id);
  const reminderSummary = reminderSummaries.get(id);
  const priorityOptions = (Object.entries(priorities) as Array<[TaskPriority, { label: string }]>)
    .map(([key, item]) => `<option value="${e(key)}" ${key === priority ? 'selected' : ''}>${e(item.label)}</option>`)
    .join('');
  const assigneeOptions = renderAssigneeOptions(assignableUsers, assignedUserId);
  const reminderValue = reminder?.status === 'scheduled' && validReminderKind(reminder.kind) === 'manual'
    ? dateTimeLocalValue(reminder.remind_at)
    : '';

  return `
    <article class="task-row priority-${e(priority)} status-${e(status)}" data-task-row>
        <div class="task-priority">
            <span class="priority-pill">${e(priorityLabel(priority))}</span>
            ${assignedUserId > 0 ? `<span class="task-private-pill">Privada${assignedLabel ? `: ${e(assignedLabel)}` : ''}</span>` : ''}
            ${renderReminderPill(reminder)}
            ${renderWhatsappReminderStatus(reminderSummary, canManageAll)}
            <small>${e(status === 'aberta' ? date : finishDate)}</small>
        </div>
        <div class="task-main">
            <h2>${e(title)}</h2>
            ${description ? `<p>${nl2br(description)}</p>` : '<p class="task-muted">Sem descricao.</p>'}

            ${
              history
                ? ''
                : `<details class="task-edit">
                    <summary>Editar</summary>
                    <form method="post" class="task-edit-form" data-task-edit-form>
                        ${csrfField(req)}
                        <input type="hidden" name="action" value="update">
                        <input type="hidden" name="id" value="${e(id)}">
                        <label>
                            <span>Prioridade</span>
                            <select name="prioridade">${priorityOptions}</select>
                        </label>
                        <label>
                            <span>Titulo</span>
                            <input type="text" name="titulo" value="${e(title)}" maxlength="180" required>
                        </label>
                        <label>
                            <span>Descricao</span>
                            <textarea name="descricao" rows="3">${e(description)}</textarea>
                        </label>
                        ${
                          canManageAll
                            ? `<div class="task-field task-assignee-field">
                                <span class="task-field-label">Quem ve esta tarefa</span>
                                <select name="assigned_core_user_id">${assigneeOptions}</select>
                            </div>
                            ${renderReminderControl(reminderValue, 'Para lembrar por WhatsApp, selecione um usuario com card Tarefas liberado.')}`
                            : ''
                        }
                        <button type="submit" class="task-btn task-btn-secondary">Salvar ajuste</button>
                    </form>
                </details>`
            }
        </div>
        <div class="task-actions">
            ${
              status === 'aberta'
                ? `<form method="post" data-task-status-form>
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="complete">
                    <input type="hidden" name="status_action" value="complete">
                    <input type="hidden" name="id" value="${e(id)}">
                    <button type="submit" class="task-icon-btn complete" title="Concluir">Concluir</button>
                </form>
                <form method="post" data-task-status-form>
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="cancel">
                    <input type="hidden" name="status_action" value="cancel">
                    <input type="hidden" name="id" value="${e(id)}">
                    <button type="submit" class="task-icon-btn cancel" title="Cancelar">Cancelar</button>
                </form>`
                : `<form method="post" data-task-status-form>
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="reopen">
                    <input type="hidden" name="status_action" value="reopen">
                    <input type="hidden" name="id" value="${e(id)}">
                    <button type="submit" class="task-icon-btn reopen" title="Reabrir">Reabrir</button>
                </form>`
            }
        </div>
    </article>`;
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tarefas - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="${BASE_PATH}/favicon.svg">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260507b">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260610-miauby-video">
    <script src="/miauw/widget.js?v=20260610-miauby-video" defer></script>
</head>
<body class="task-login-body">
    <img class="login-screen-runner login-cat-runner" src="${BASE_PATH}/assets/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="task-login-card">
        <img class="task-login-logo" src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
        <span class="task-kicker">Wimifarma tarefas</span>
        <h1>Acesso das tarefas</h1>
        <p>Prioridade aberta primeiro. Bagunca riscada vai para o historico.</p>

        ${error ? `<div class="task-alert error">${e(error)}</div>` : ''}

        <form method="post" class="task-login-form">
            ${csrfField(req)}
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="task-btn task-btn-primary">Entrar nas tarefas</button>
        </form>
    </main>

    <script src="${BASE_PATH}/login-runner.js?v=20260506a" defer></script>
</body>
</html>`;
}

function internalErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  const validationMessages = [
    'Informe o titulo da tarefa.',
    'Usuario de destino invalido.',
    'Usuario de destino nao tem acesso ao modulo Tarefas.',
    'Horario do lembrete Miauby invalido.',
    'Escolha uma hora futura para o lembrete Miauby.',
    'Escolha um usuario para o lembrete Miauby.',
    'Lembrete Miauby so pode ser agendado em tarefa aberta.',
    'Usuario executor nao tem acesso ao modulo Tarefas.',
    'Somente ADM pode direcionar tarefa para outro usuario.',
    'Somente ADM pode criar tarefa geral pelo Miauby.',
    'Voce nao pode cancelar essa tarefa pelo Miauby.',
    'Tarefa nao encontrada para esse usuario.',
    'Status interno invalido para esse comando.',
  ];
  if (message.startsWith('Somente ADM') || message.includes('nao tem acesso') || message.includes('nao pode cancelar')) return 403;
  return validationMessages.includes(message) ? 400 : 500;
}

function normalizeTaskSearch(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function taskSearchScore(query: string, task: TaskRow): number {
  const cleanQuery = normalizeTaskSearch(query);
  if (!cleanQuery) return 1;
  const title = normalizeTaskSearch(task.title);
  const description = normalizeTaskSearch(task.description || '');
  const haystack = `${title} ${description}`.trim();
  if (!haystack) return 0;
  if (title === cleanQuery) return 100;
  if (title.includes(cleanQuery)) return 82;
  if (haystack.includes(cleanQuery)) return 66;
  const queryWords = cleanQuery.split(/\s+/).filter((word) => word.length >= 3);
  if (!queryWords.length) return 0;
  const matched = queryWords.filter((word) => haystack.includes(word)).length;
  return matched === 0 ? 0 : Math.round((matched / queryWords.length) * 55);
}

function taskScopeForActor(task: TaskRow, actor: InternalTaskActorRow): string {
  const actorId = Number(actor.id || 0);
  const assignedId = Number(task.assigned_core_user_id || 0);
  const createdBy = Number(task.created_by || 0);
  const delegatedBy = Number(task.delegated_by || 0);
  if (!assignedId) return 'general';
  if (assignedId === actorId && (delegatedBy || createdBy) && delegatedBy !== actorId && createdBy !== actorId) return 'admin_to_user';
  if (assignedId === actorId) return 'mine';
  return 'assigned_other';
}

function internalTaskPayload(task: TaskRow, actor: InternalTaskActorRow, score = 0): Record<string, unknown> {
  return {
    ...publicTaskPayload(task),
    assigned_core_user_id: task.assigned_core_user_id ? Number(task.assigned_core_user_id) : null,
    assigned_username: task.assigned_username_snapshot || '',
    created_by: task.created_by === null ? null : Number(task.created_by),
    delegated_by: task.delegated_by === null ? null : Number(task.delegated_by),
    delegated_at: task.delegated_at,
    scope: taskScopeForActor(task, actor),
    match_score: score,
  };
}

async function visibleOpenTasksForInternal(actor: InternalTaskActorRow, query = '', adminViewAll = false, limit = 80): Promise<Array<{ task: TaskRow; score: number }>> {
  const actorId = Number(actor.id || 0);
  const canViewAll = isInternalTaskAdmin(actor) && adminViewAll;
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
      WHERE status = 'aberta'
        ${canViewAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $1)'}
      ORDER BY
        CASE priority WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
        created_at ASC,
        id ASC
      LIMIT 160`,
    canViewAll ? [] : [actorId],
  );
  const scored = result.rows
    .map((task) => ({ task, score: taskSearchScore(query, task) }))
    .filter((item) => normalizeTaskSearch(query) === '' || item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftPriority = left.task.priority === 'alta' ? 3 : left.task.priority === 'normal' ? 2 : 1;
      const rightPriority = right.task.priority === 'alta' ? 3 : right.task.priority === 'normal' ? 2 : 1;
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return Number(left.task.id || 0) - Number(right.task.id || 0);
    });
  return scored.slice(0, Math.max(1, Math.min(120, limit)));
}

function canCancelTaskInternally(task: TaskRow, actor: InternalTaskActorRow): boolean {
  if (isInternalTaskAdmin(actor)) return true;
  const actorId = Number(actor.id || 0);
  const createdBy = Number(task.created_by || 0);
  const delegatedBy = Number(task.delegated_by || 0);
  return actorId > 0 && (createdBy === actorId || delegatedBy === actorId);
}

async function setTaskStatusFromInternal(actor: InternalTaskActorRow, taskId: number, status: TaskStatus): Promise<TaskRow> {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) throw new Error('Tarefa nao encontrada para esse usuario.');
  const actorId = Number(actor.id || 0);
  const canManageAll = isInternalTaskAdmin(actor);
  const completedAt = status === 'concluida' ? 'now()' : 'NULL';
  const canceledAt = status === 'cancelada' ? 'now()' : 'NULL';
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<TaskRow>(
      `SELECT *
         FROM tarefa_tasks
        WHERE id = $1
          AND status = 'aberta'
          ${canManageAll ? '' : 'AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $2)'}
        FOR UPDATE`,
      canManageAll ? [taskId] : [taskId, actorId],
    );
    const current = existing.rows[0];
    if (!current) throw new Error('Tarefa nao encontrada para esse usuario.');
    if (status === 'cancelada' && !canCancelTaskInternally(current, actor)) {
      throw new Error('Voce nao pode cancelar essa tarefa pelo Miauby.');
    }
    const result = await client.query<TaskRow>(
      `UPDATE tarefa_tasks
          SET status = $1,
              completed_at = ${completedAt},
              canceled_at = ${canceledAt},
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [status, taskId],
    );
    const task = result.rows[0];
    if (!task) throw new Error('Tarefa nao encontrada para esse usuario.');
    await cancelScheduledReminders(client, taskId, actorId || null, `Lembrete Miauby cancelado porque a tarefa foi marcada como ${status} pelo Miauby.`);
    await auditPg(client, taskId, actorId || null, 'tarefa_status_miauby', `Tarefa marcada como ${status} pelo Miauby.`);
    await client.query('COMMIT');
    void logCoreAudit(actorId || null, 'tarefa_status_miauby', 'task', String(taskId), `Tarefa marcada como ${status} pelo Miauby.`, {
      source: 'miauby_task_command',
      status,
    });
    return task;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function renderApp(req: Request): Promise<string> {
  const flash = takeFlash(req);
  const viewerId = req.session.user?.id || 0;
  const canManageAll = isTaskAdmin(req.session.user);
  let counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  let open: TaskRow[] = [];
  let history: TaskRow[] = [];
  let assignableUsers: AssignableTaskUserRow[] = [];
  let reminders = new Map<number, TaskReminderRow>();
  let reminderSummaries = new Map<number, TaskReminderSummaryRow>();
  let loadError = '';

  try {
    [counts, open, history, assignableUsers] = await Promise.all([
      taskCounts(viewerId, canManageAll),
      openTasks(viewerId, canManageAll),
      historyTasks(viewerId, canManageAll),
      canManageAll ? listAssignableTaskUsers() : Promise.resolve([]),
    ]);
    const loadedTaskIds = [...open, ...history].map((task) => Number(task.id || 0));
    reminders = await latestReminderMap(loadedTaskIds);
    if (canManageAll) {
      reminderSummaries = await reminderSummaryMap(loadedTaskIds);
    }
  } catch {
    loadError = 'Nao consegui carregar as tarefas agora.';
  }

  const effectiveFlash = loadError ? { type: 'error', message: loadError } : flash;

  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tarefas - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="${BASE_PATH}/favicon.svg">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260608-task-card-polish">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260610-miauby-video">
    <script src="/miauw/widget.js?v=20260610-miauby-video" defer></script>
</head>
<body class="task-app-body">
    <header class="task-topbar">
        <a class="task-brand" href="/">
            <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Tarefas</strong>
        </a>
        <nav class="task-nav" aria-label="Navegacao">
            <a href="/">Home</a>
        </nav>
    </header>

    <main class="task-page" data-miauby-screen-object="modulo tarefas" data-miauby-screen-label="Modulo Tarefas: ${e(counts.aberta)} aberta(s), ${e(counts.concluida)} concluida(s), ${e(counts.cancelada)} cancelada(s)">
        <section class="task-hero">
            <div>
                <h1>Tarefas</h1>
                ${canManageAll ? '<p class="task-admin-note">ADM vendo tarefas publicas, privadas por usuario e lembretes Miauby.</p>' : ''}
            </div>
            <div class="task-stats" aria-label="Resumo">
                <span><strong>${e(counts.aberta)}</strong> aberta(s)</span>
                <span><strong>${e(counts.concluida)}</strong> concluida(s)</span>
                <span><strong>${e(counts.cancelada)}</strong> cancelada(s)</span>
            </div>
        </section>

        ${effectiveFlash.message ? `<div class="task-alert ${e(effectiveFlash.type)}">${e(effectiveFlash.message)}</div>` : ''}

        <section class="task-board">
            <form method="post" class="task-create">
                ${csrfField(req)}
                <input type="hidden" name="action" value="create">
                <div class="task-create-head">
                    <span class="task-kicker">Nova tarefa</span>
                    <select name="prioridade" aria-label="Prioridade">
                        <option value="alta">Alta</option>
                        <option value="normal" selected>Normal</option>
                        <option value="baixa">Baixa</option>
                    </select>
                </div>
                <label>
                    <span>Titulo</span>
                    <input type="text" name="titulo" maxlength="180" placeholder="Ex.: Conferir pendencia do caixa" required>
                </label>
                <label>
                    <span>Descricao</span>
                    <textarea name="descricao" rows="4" placeholder="Detalhe curto para ninguem precisar adivinhar."></textarea>
                </label>
                ${
                  canManageAll
                    ? `<div class="task-field task-assignee-field">
                        <span class="task-field-label">Quem vai ver</span>
                        <select name="assigned_core_user_id">${renderAssigneeOptions(assignableUsers, 0)}</select>
                    </div>
                    ${renderReminderControl('', 'Opcional. Para enviar lembrete, escolha um usuario privado.')}`
                    : ''
                }
                <button type="submit" class="task-btn task-btn-primary">Criar tarefa</button>
            </form>

            <section class="task-list-panel">
                <div class="task-section-title">
                    <span class="task-kicker">Abertas por prioridade</span>
                    <strong>${e(open.length)} na fila</strong>
                </div>
                <div class="task-list">
                    ${open.length ? open.map((task) => renderTask(req, task, reminders, reminderSummaries, assignableUsers, canManageAll)).join('') : '<div class="task-empty">Sem tarefa aberta. Milagre administrativo, mas eu nao confio cegamente.</div>'}
                </div>
            </section>
        </section>

        <details class="task-history">
            <summary>
                <span>Historico concluido/cancelado</span>
                <strong>${e(history.length)}</strong>
            </summary>
            <div class="task-history-list">
                ${history.length ? history.map((task) => renderTask(req, task, reminders, reminderSummaries, assignableUsers, canManageAll, true)).join('') : '<div class="task-empty">Nada no historico ainda.</div>'}
            </div>
        </details>
    </main>

    <script src="${BASE_PATH}/app.js?v=20260603-reminder-fields" defer></script>
</body>
</html>`;
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'self'; form-action 'self';",
  );
  next();
});
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use(sessionMiddleware);
app.use(
  BASE_PATH,
  express.static(path.join(rootDir, 'public'), {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders: setStaticAssetCacheHeaders,
  }),
);

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  await pgPool.query('SELECT 1');
  const [counts, auth] = await Promise.all([taskCounts(), coreAuthHealth()]);
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_tarefa',
      legacy_mysql_required: false,
      counts,
    },
    auth,
  });
}));

app.get([`${BASE_PATH}/api/badge`, `${BASE_PATH}/badge.php`], asyncRoute(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.json({ ok: true, open: await countOpenPublic(), scope: 'public' });
}));

app.get(`${BASE_PATH}/login`, asyncRoute(async (req, res) => {
  const user = await ensureSessionUser(req);
  if (user) return res.redirect(loginRedirectTarget(req));
  return res.redirect('/');
}));

app.get(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  const user = await ensureSessionUser(req);
  if (user) return res.redirect(loginRedirectTarget(req));
  return res.redirect('/');
}));

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
  if (!username || !password) {
    return res.status(400).type('html').send(renderLogin(req, 'Informe usuario e senha.'));
  }
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    void logCoreAudit(null, 'login_tarefa_falha', 'user', null, `Tentativa de login Tarefas falhou para usuario: ${username}`, {
      auth_provider: 'core',
    });
    return res.status(401).type('html').send(renderLogin(req, 'Usuario ou senha incorretos.'));
  }

  const returnTo = safeTarefaReturnPath(req.session.returnTo) || `${BASE_PATH}/`;
  clearLoginRateLimit(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[tarefa] session regenerate failed', error);
      return res.status(500).type('html').send(renderLogin(req, 'Nao consegui abrir sua sessao agora.'));
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logCoreAudit(user.id, 'login_tarefa', 'user', String(user.id), 'Login Tarefas Node realizado.', {
      auth_provider: 'core',
    });
    return res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get(`${BASE_PATH}/index.php`, requireAuth, (_req, res) => res.redirect(`${BASE_PATH}/`));

app.get([BASE_PATH, `${BASE_PATH}/`], requireAuth, asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.type('html').send(await renderApp(req));
}));

async function handlePost(req: Request, res: Response): Promise<void> {
  const action = String(req.body.action || '');
  const statusActionConfirmed = String(req.body.status_action || '') === action;
  try {
    if (action === 'create') {
      await createTask(req);
      setFlash(req, 'success', 'Tarefa criada e colocada na fila.');
    } else if (action === 'update') {
      await updateTask(req);
      setFlash(req, 'success', 'Tarefa atualizada.');
    } else if (action === 'complete') {
      if (!statusActionConfirmed) throw new Error('Prioridade alterada nao conclui tarefa. Use o botao Concluir para fechar.');
      await setTaskStatus(req, 'concluida');
      setFlash(req, 'success', 'Tarefa concluida e movida para o historico.');
    } else if (action === 'cancel') {
      if (!statusActionConfirmed) throw new Error('Prioridade alterada nao cancela tarefa. Use o botao Cancelar para fechar.');
      await setTaskStatus(req, 'cancelada');
      setFlash(req, 'success', 'Tarefa cancelada e movida para o historico.');
    } else if (action === 'reopen') {
      if (!statusActionConfirmed) throw new Error('Use o botao Reabrir para devolver a tarefa para a fila.');
      await setTaskStatus(req, 'aberta');
      setFlash(req, 'success', 'Tarefa reaberta.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar essa tarefa agora.');
  }
  redirectHome(res);
}

app.post(`${BASE_PATH}/`, requireAuth, verifyCsrf, asyncRoute(handlePost));

app.get(`${BASE_PATH}/api/internal/summary`, requireInternalToken, asyncRoute(async (req, res) => {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start || '')) ? String(req.query.start) : '';
  const endExclusive = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end_exclusive || '')) ? String(req.query.end_exclusive) : '';
  const params: unknown[] = [];
  const periodWhere = start && endExclusive
    ? "created_at >= $1::date AND created_at < $2::date AND assigned_core_user_id IS NULL"
    : 'assigned_core_user_id IS NULL';
  if (start && endExclusive) {
    params.push(start, endExclusive);
  }
  const periodCounts = await pgPool.query<{
    total: string;
    abertas: string;
    concluidas: string;
    canceladas: string;
    altas_abertas: string;
  }>(
    `SELECT
       COUNT(*)::bigint AS total,
       COALESCE(SUM(CASE WHEN status = 'aberta' THEN 1 ELSE 0 END), 0)::bigint AS abertas,
       COALESCE(SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END), 0)::bigint AS concluidas,
       COALESCE(SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END), 0)::bigint AS canceladas,
       COALESCE(SUM(CASE WHEN status = 'aberta' AND priority = 'alta' THEN 1 ELSE 0 END), 0)::bigint AS altas_abertas
     FROM tarefa_tasks
     WHERE ${periodWhere}`,
    params,
  );
  const open = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
       WHERE status = 'aberta'
         AND assigned_core_user_id IS NULL
       ORDER BY
         CASE priority WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
         created_at ASC,
         id ASC
       LIMIT 8`,
  );
  const row = periodCounts.rows[0];
  res.json({
    ok: true,
    source: 'postgres',
    scope: 'public',
    period: { start: start || null, end_exclusive: endExclusive || null },
    counts: {
      total: Number(row?.total || 0),
      abertas: Number(row?.abertas || 0),
      concluidas: Number(row?.concluidas || 0),
      canceladas: Number(row?.canceladas || 0),
      altas_abertas: Number(row?.altas_abertas || 0),
    },
    open: open.rows.map(publicTaskPayload),
  });
}));

app.post(`${BASE_PATH}/api/internal/tasks`, requireInternalToken, asyncRoute(async (req, res) => {
  const task = await createPublicTaskFromInternal(req);
  res.json({
    ok: true,
    source: 'postgres',
    task: publicTaskPayload(task),
  });
}));

app.get(`${BASE_PATH}/api/internal/users`, requireInternalToken, asyncRoute(async (req, res) => {
  const q = normalizeTaskSearch(req.query.q || '');
  const users = await listAssignableTaskUsers();
  const filtered = q
    ? users.filter((user) => {
      const label = normalizeTaskSearch(`${user.username} ${user.display_name || ''}`);
      return label.includes(q) || q.split(/\s+/).filter(Boolean).every((word) => label.includes(word));
    })
    : users;
  res.json({
    ok: true,
    source: 'core_postgres',
    users: filtered.slice(0, 50).map((user) => ({
      id: Number(user.id),
      username: user.username,
      display_name: user.display_name || user.username,
      role: user.role || '',
      can_access: user.can_access === true,
      can_manage_all: isTaskAdminIdentity(user.username, user.role),
    })),
  });
}));

app.get(`${BASE_PATH}/api/internal/tasks/visible`, requireInternalToken, asyncRoute(async (req, res) => {
  const actorUserId = Number(req.query.actor_user_id || req.query.user_id || 0);
  const actor = await internalTaskActorById(actorUserId);
  if (!actor) throw new Error('Usuario executor nao tem acesso ao modulo Tarefas.');
  const q = cleanText(req.query.q || req.query.search || '', 180);
  const limit = Number.parseInt(String(req.query.limit || '80'), 10) || 80;
  const adminViewAll = ['1', 'true', 'sim', 'yes'].includes(String(req.query.admin_view_all || '').toLowerCase());
  const tasks = await visibleOpenTasksForInternal(actor, q, adminViewAll, limit);
  res.json({
    ok: true,
    source: 'postgres',
    actor: {
      id: Number(actor.id),
      username: actor.username,
      display_name: taskDisplayName(actor),
      role: actor.role || '',
      can_manage_all: isInternalTaskAdmin(actor),
    },
    scope: isInternalTaskAdmin(actor) && adminViewAll ? 'admin_all' : 'actor_visible',
    query: q || null,
    tasks: tasks.map((item) => internalTaskPayload(item.task, actor, item.score)),
  });
}));

app.post(`${BASE_PATH}/api/internal/tasks/status`, requireInternalToken, asyncRoute(async (req, res) => {
  const actorUserId = Number(req.body?.actor_user_id || req.body?.user_id || 0);
  const actor = await internalTaskActorById(actorUserId);
  if (!actor) throw new Error('Usuario executor nao tem acesso ao modulo Tarefas.');
  const taskId = Number(req.body?.task_id || req.body?.id || 0);
  const status = validStatus(req.body?.status || '');
  if (status === 'aberta') throw new Error('Status interno invalido para esse comando.');
  const task = await setTaskStatusFromInternal(actor, taskId, status);
  res.json({
    ok: true,
    source: 'postgres',
    task: internalTaskPayload(task, actor),
  });
}));

app.post(`${BASE_PATH}/api/internal/tasks/private`, requireInternalToken, asyncRoute(async (req, res) => {
  const task = await createPrivateTaskFromInternal(req);
  res.json({
    ok: true,
    task: {
      id: Number(task.id),
      status: task.status,
      priority: task.priority,
      title: task.title,
      assigned_core_user_id: Number(task.assigned_core_user_id || 0),
      assigned_username: task.assigned_username_snapshot || '',
      assigned_display_name: task.assigned_username_snapshot || '',
    },
  });
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[tarefa] request failed', error);
  if (res.headersSent) return;
  if (_req.path.includes('/api/internal/')) {
    res.status(internalErrorStatus(error)).json({ ok: false, error: error instanceof Error ? error.message : 'internal_error' });
    return;
  }
  res.status(500).type('html').send('Tarefas indisponivel agora.');
});

async function withRetry(name: string, fn: () => Promise<unknown>, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[tarefa] waiting for ${name} (${index}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function start() {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  await withRetry('core postgres', () => requireCorePgPool('startup').query('SELECT 1'));
  await ensureSchema();
  setTimeout(() => {
    processDueTaskReminders().catch((error) => console.warn('[tarefa] reminder worker failed', error));
  }, 2500).unref();
  setInterval(() => {
    processDueTaskReminders().catch((error) => console.warn('[tarefa] reminder worker failed', error));
  }, REMINDER_WORKER_INTERVAL_MS).unref();
  app.listen(PORT, () => {
    console.log(`[tarefa] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[tarefa] failed to start', error);
  process.exit(1);
});
