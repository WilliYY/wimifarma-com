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

type TaskPriority = 'alta' | 'normal' | 'baixa';
type TaskStatus = 'aberta' | 'concluida' | 'cancelada';

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

type TaskRow = {
  id: string;
  legacy_mysql_id: string | null;
  priority: TaskPriority;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  completed_at: Date | string | null;
  canceled_at: Date | string | null;
};

type LegacyTaskRow = {
  id: number;
  prioridade: string;
  titulo: string;
  descricao: string | null;
  status: string;
  criado_por: number | null;
  criado_em: string | null;
  atualizado_em: string | null;
  concluido_em: string | null;
  cancelado_em: string | null;
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
const SERVICE_VERSION = '1.1.1';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/tarefa');
const PORT = Number.parseInt(env.PORT || '3500', 10);
const SESSION_SECRET = env.TAREFA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TZ = 'America/Sao_Paulo';
const AUTH_PROVIDER = normalizeAuthProvider(env.TAREFA_AUTH_PROVIDER || 'core');
const LEGACY_MYSQL_MIRROR_ENABLED = normalizeBoolean(env.TAREFA_LEGACY_MYSQL_MIRROR_ENABLED ?? 'true');
const LEGACY_MYSQL_IMPORT_ENABLED = normalizeBoolean(env.TAREFA_LEGACY_MYSQL_IMPORT_ENABLED ?? 'true');
const LEGACY_MYSQL_LOGS_ENABLED = normalizeBoolean(env.TAREFA_LEGACY_MYSQL_LOGS_ENABLED ?? 'true');
const CORE_AUTH_SHADOW_ENABLED = normalizeBoolean(env.TAREFA_CORE_AUTH_SHADOW_ENABLED);
const CORE_AUTH_SHADOW_TIMEOUT_MS = Math.max(
  500,
  Math.min(10000, Number.parseInt(env.TAREFA_CORE_AUTH_SHADOW_TIMEOUT_MS || '1500', 10) || 1500),
);
const CORE_AUTH_REQUIRED = AUTH_PROVIDER === 'core' || CORE_AUTH_SHADOW_ENABLED;
const LEGACY_MYSQL_REQUIRED =
  AUTH_PROVIDER === 'mysql' || LEGACY_MYSQL_IMPORT_ENABLED || LEGACY_MYSQL_MIRROR_ENABLED || LEGACY_MYSQL_LOGS_ENABLED;

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

const mysqlPool: mysql.Pool | null = LEGACY_MYSQL_REQUIRED
  ? mysql.createPool({
      host: env.MYSQL_HOST || '127.0.0.1',
      port: Number(env.MYSQL_PORT || 3306),
      database: env.MYSQL_DATABASE || 'wimifarma_app',
      user: env.MYSQL_USER || 'wimifarma_user',
      password: env.MYSQL_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 6,
      charset: 'utf8mb4',
      dateStrings: true,
    })
  : null;

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

const migrationState = {
  imported: 0,
  lastRunAt: null as string | null,
  lastError: null as string | null,
};

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

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function normalizeAuthProvider(value: unknown): AuthProvider {
  return String(value || 'core').trim().toLowerCase() === 'mysql' ? 'mysql' : 'core';
}

function requireMysqlPool(feature: string): mysql.Pool {
  if (!mysqlPool) {
    throw new Error(`Legacy MySQL is disabled for ${feature}.`);
  }
  return mysqlPool;
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
  return AUTH_PROVIDER === 'core' ? authenticateCore(username, password) : authenticateMysql(username, password);
}

async function authenticateMysql(username: string, password: string): Promise<User | null> {
  const [rows] = await requireMysqlPool('auth').query<mysql.RowDataPacket[]>(
    'SELECT id, username, password_hash, role, active FROM wf_users WHERE username = ? AND active = 1 LIMIT 1',
    [username],
  );
  const user = rows[0] as MysqlUserRow | undefined;
  if (!user) return null;

  let ok = false;
  if (user.password_hash) {
    ok = await bcrypt.compare(password, normalizeHash(user.password_hash));
  }
  if (!ok && normalizeUsername(user.username) === 'adm') {
    ok = timingSafeStringEqual(password, 'adm');
  }

  return ok ? userPublic(user) : null;
}

async function currentUser(user: User | undefined): Promise<User | null> {
  if (!user) return null;
  return AUTH_PROVIDER === 'core' ? currentCoreUser(user) : currentMysqlUser(user);
}

async function currentMysqlUser(user: User): Promise<User | null> {
  const [rows] = await requireMysqlPool('current user').query<mysql.RowDataPacket[]>(
    'SELECT id, username, role, active FROM wf_users WHERE id = ? AND active = 1 LIMIT 1',
    [user.id],
  );
  const row = rows[0] as MysqlUserRow | undefined;
  return row ? userPublic(row) : null;
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
      console.info('[tarefa] core auth shadow ok', { username: maskUsername(username), userId: mysqlUser.id, latencyMs });
      return;
    }

    coreAuthShadow.mismatches += 1;
    coreAuthShadow.lastStatus = 'mismatch';
    console.warn('[tarefa] core auth shadow mismatch', {
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
    console.warn('[tarefa] core auth shadow failed', {
      username: maskUsername(username),
      error: error instanceof Error ? error.message : String(error),
      latencyMs: coreAuthShadow.lastLatencyMs,
    });
  }
}

async function coreAuthHealth(): Promise<Record<string, unknown>> {
  const state = {
    provider: AUTH_PROVIDER,
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
  if (!LEGACY_MYSQL_LOGS_ENABLED) return;
  try {
    await requireMysqlPool('wf_logs').query(
      'INSERT INTO wf_logs (user_id, action, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, cleanText(message, 255)],
    );
  } catch (error) {
    console.warn('[tarefa] failed to write wf_logs', error);
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
  Promise.resolve(currentUser(req.session.user))
    .then((user) => {
      if (!user) {
        const returnTo = safeTarefaReturnPath(req.originalUrl);
        if (returnTo) req.session.returnTo = returnTo;
        res.redirect(`${BASE_PATH}/login.php`);
        return;
      }
      req.session.user = user;
      next();
    })
    .catch(next);
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

function mysqlDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, '0');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${pad(Number(get('hour')))}:${get('minute')}:${get('second')}`;
}

function pgDateFromMysql(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === '0000-00-00 00:00:00') return null;
  return text.includes('T') ? text : `${text.replace(' ', 'T')}-03:00`;
}

async function ensureLegacyMysqlSchema(): Promise<void> {
  if (!LEGACY_MYSQL_IMPORT_ENABLED && !LEGACY_MYSQL_MIRROR_ENABLED) return;
  await requireMysqlPool('legacy schema').query(`
    CREATE TABLE IF NOT EXISTS wf_tarefas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      prioridade ENUM('alta','normal','baixa') NOT NULL DEFAULT 'normal',
      titulo VARCHAR(180) NOT NULL,
      descricao TEXT NULL,
      status ENUM('aberta','concluida','cancelada') NOT NULL DEFAULT 'aberta',
      criado_por INT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      concluido_em DATETIME NULL,
      cancelado_em DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_tarefa_status_prioridade (status, prioridade, criado_em),
      KEY idx_tarefa_criado (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
  if (LEGACY_MYSQL_IMPORT_ENABLED || LEGACY_MYSQL_MIRROR_ENABLED) {
    await ensureLegacyMysqlSchema();
  }
  if (LEGACY_MYSQL_IMPORT_ENABLED) {
    await migrateLegacyTasks();
  }
}

async function migrateLegacyTasks(): Promise<void> {
  try {
    const [rows] = await requireMysqlPool('legacy import').query<mysql.RowDataPacket[]>(
      'SELECT id, prioridade, titulo, descricao, status, criado_por, criado_em, atualizado_em, concluido_em, cancelado_em FROM wf_tarefas ORDER BY id ASC',
    );
    let imported = 0;
    for (const row of rows as LegacyTaskRow[]) {
      const result = await pgPool.query(
        `INSERT INTO tarefa_tasks
          (legacy_mysql_id, priority, title, description, status, created_by, created_at, updated_at, completed_at, canceled_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8::timestamptz, $9::timestamptz, $10::timestamptz)
         ON CONFLICT (legacy_mysql_id) DO NOTHING
         RETURNING id`,
        [
          Number(row.id),
          validPriority(row.prioridade),
          trimText(row.titulo, 180) || 'Tarefa sem titulo',
          String(row.descricao || ''),
          validStatus(row.status),
          row.criado_por ? Number(row.criado_por) : null,
          pgDateFromMysql(row.criado_em),
          pgDateFromMysql(row.atualizado_em),
          pgDateFromMysql(row.concluido_em),
          pgDateFromMysql(row.cancelado_em),
        ],
      );
      if (result.rowCount) imported += 1;
    }
    migrationState.imported = imported;
    migrationState.lastRunAt = new Date().toISOString();
    migrationState.lastError = null;
  } catch (error) {
    migrationState.lastRunAt = new Date().toISOString();
    migrationState.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function taskCounts(): Promise<Record<TaskStatus, number>> {
  const counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  const result = await pgPool.query<{ status: TaskStatus; total: string }>('SELECT status, COUNT(*) AS total FROM tarefa_tasks GROUP BY status');
  for (const row of result.rows) {
    counts[validStatus(row.status)] = Number(row.total || 0);
  }
  return counts;
}

async function legacyTaskCounts(): Promise<Record<TaskStatus, number>> {
  const counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  if (!LEGACY_MYSQL_IMPORT_ENABLED && !LEGACY_MYSQL_MIRROR_ENABLED) return counts;
  const [rows] = await requireMysqlPool('legacy counts').query<mysql.RowDataPacket[]>('SELECT status, COUNT(*) AS total FROM wf_tarefas GROUP BY status');
  for (const row of rows as Array<{ status: string; total: number }>) {
    counts[validStatus(row.status)] = Number(row.total || 0);
  }
  return counts;
}

async function countOpen(): Promise<number> {
  const result = await pgPool.query<{ total: string }>("SELECT COUNT(*) AS total FROM tarefa_tasks WHERE status = 'aberta'");
  return Number(result.rows[0]?.total || 0);
}

async function openTasks(): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
      WHERE status = 'aberta'
      ORDER BY
        CASE priority WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
        created_at ASC,
        id ASC`,
  );
  return result.rows;
}

async function historyTasks(): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
      WHERE status IN ('concluida', 'cancelada')
      ORDER BY COALESCE(completed_at, canceled_at, updated_at, created_at) DESC, id DESC
      LIMIT 120`,
  );
  return result.rows;
}

async function createTask(req: Request): Promise<number> {
  const priority = validPriority(req.body.prioridade);
  const title = trimText(req.body.titulo, 180);
  const description = String(req.body.descricao || '').trim();
  const userId = req.session.user?.id || null;
  if (!title) throw new Error('Informe o titulo da tarefa.');

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `INSERT INTO tarefa_tasks (priority, title, description, status, created_by)
       VALUES ($1, $2, $3, 'aberta', $4)
       RETURNING id`,
      [priority, title, description, userId],
    );
    const taskId = Number(result.rows[0]?.id || 0);
    await auditPg(client, taskId, userId, 'tarefa_criada', `Tarefa criada: ${title}`);
    await client.query('COMMIT');
    void mirrorCreateToMysql(taskId);
    void logMysql(userId, 'tarefa_criada', 'task', taskId, `Tarefa criada: ${title}`);
    return taskId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateTask(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const priority = validPriority(req.body.prioridade);
  const title = trimText(req.body.titulo, 180);
  const description = String(req.body.descricao || '').trim();
  if (!id || !title) throw new Error('Tarefa invalida.');

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<TaskRow>(
      `UPDATE tarefa_tasks
          SET priority = $1,
              title = $2,
              description = $3,
              updated_at = now()
        WHERE id = $4
        RETURNING *`,
      [priority, title, description, id],
    );
    const task = result.rows[0];
    if (!task) throw new Error('Tarefa invalida.');
    await auditPg(client, id, req.session.user?.id || null, 'tarefa_editada', `Tarefa editada: ${title}`);
    await client.query('COMMIT');
    void mirrorTaskToMysql(task);
    void logMysql(req.session.user?.id || null, 'tarefa_editada', 'task', id, `Tarefa editada: ${title}`);
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
  const completedAt = status === 'concluida' ? 'now()' : 'NULL';
  const canceledAt = status === 'cancelada' ? 'now()' : 'NULL';
  const result = await pgPool.query<TaskRow>(
    `UPDATE tarefa_tasks
        SET status = $1,
            completed_at = ${completedAt},
            canceled_at = ${canceledAt},
            updated_at = now()
      WHERE id = $2
      RETURNING *`,
    [status, id],
  );
  const task = result.rows[0];
  if (!task) throw new Error('Tarefa invalida.');
  await pgPool.query(
    'INSERT INTO tarefa_audit_events (task_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [id, req.session.user?.id || null, 'tarefa_status', cleanText(`Tarefa marcada como ${status}.`, 255)],
  );
  void mirrorTaskToMysql(task);
  void logMysql(req.session.user?.id || null, 'tarefa_status', 'task', id, `Tarefa marcada como ${status}.`);
}

async function mirrorCreateToMysql(taskId: number): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    const result = await pgPool.query<TaskRow>('SELECT * FROM tarefa_tasks WHERE id = $1 LIMIT 1', [taskId]);
    const task = result.rows[0];
    if (!task || task.legacy_mysql_id) return;
    const [insert] = await requireMysqlPool('legacy mirror create').query<mysql.ResultSetHeader>(
      'INSERT INTO wf_tarefas (prioridade, titulo, descricao, status, criado_por, criado_em, atualizado_em, concluido_em, cancelado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        task.priority,
        task.title,
        task.description || '',
        task.status,
        task.created_by,
        mysqlDate(task.created_at),
        mysqlDate(task.updated_at),
        mysqlDate(task.completed_at),
        mysqlDate(task.canceled_at),
      ],
    );
    await pgPool.query('UPDATE tarefa_tasks SET legacy_mysql_id = $1 WHERE id = $2 AND legacy_mysql_id IS NULL', [insert.insertId, taskId]);
  } catch (error) {
    console.warn('[tarefa] legacy mysql mirror create failed', error);
  }
}

async function mirrorTaskToMysql(task: TaskRow): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED || !task.legacy_mysql_id) return;
  try {
    await requireMysqlPool('legacy mirror update').query(
      'UPDATE wf_tarefas SET prioridade = ?, titulo = ?, descricao = ?, status = ?, atualizado_em = ?, concluido_em = ?, cancelado_em = ? WHERE id = ?',
      [
        task.priority,
        task.title,
        task.description || '',
        task.status,
        mysqlDate(task.updated_at || new Date()),
        mysqlDate(task.completed_at),
        mysqlDate(task.canceled_at),
        Number(task.legacy_mysql_id),
      ],
    );
  } catch (error) {
    console.warn('[tarefa] legacy mysql mirror update failed', error);
  }
}

function renderTask(req: Request, task: TaskRow, history = false): string {
  const id = Number(task.id || 0);
  const priority = validPriority(task.priority);
  const status = validStatus(task.status);
  const title = String(task.title || '');
  const description = String(task.description || '').trim();
  const date = brDate(task.created_at, true);
  const finishDate = status === 'concluida' ? brDate(task.completed_at, true) : brDate(task.canceled_at, true);
  const priorityOptions = (Object.entries(priorities) as Array<[TaskPriority, { label: string }]>)
    .map(([key, item]) => `<option value="${e(key)}" ${key === priority ? 'selected' : ''}>${e(item.label)}</option>`)
    .join('');

  return `
    <article class="task-row priority-${e(priority)} status-${e(status)}" data-task-row>
        <div class="task-priority">
            <span class="priority-pill">${e(priorityLabel(priority))}</span>
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
    <link rel="stylesheet" href="/miauw/widget.css?v=20260529a">
    <script src="/miauw/widget.js?v=20260529a" defer></script>
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

async function renderApp(req: Request): Promise<string> {
  const flash = takeFlash(req);
  let counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  let open: TaskRow[] = [];
  let history: TaskRow[] = [];
  let loadError = '';

  try {
    counts = await taskCounts();
    open = await openTasks();
    history = await historyTasks();
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
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260507b">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260529a">
    <script src="/miauw/widget.js?v=20260529a" defer></script>
</head>
<body class="task-app-body">
    <header class="task-topbar">
        <a class="task-brand" href="/">
            <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Tarefas</strong>
        </a>
        <nav class="task-nav" aria-label="Navegacao">
            <a href="${BASE_PATH}/logout.php">Sair</a>
        </nav>
    </header>

    <main class="task-page" data-miauby-screen-object="modulo tarefas" data-miauby-screen-label="Modulo Tarefas: ${e(counts.aberta)} aberta(s), ${e(counts.concluida)} concluida(s), ${e(counts.cancelada)} cancelada(s)">
        <section class="task-hero">
            <div>
                <h1>Tarefas</h1>
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
                <button type="submit" class="task-btn task-btn-primary">Criar tarefa</button>
            </form>

            <section class="task-list-panel">
                <div class="task-section-title">
                    <span class="task-kicker">Abertas por prioridade</span>
                    <strong>${e(open.length)} na fila</strong>
                </div>
                <div class="task-list">
                    ${open.length ? open.map((task) => renderTask(req, task)).join('') : '<div class="task-empty">Sem tarefa aberta. Milagre administrativo, mas eu nao confio cegamente.</div>'}
                </div>
            </section>
        </section>

        <details class="task-history">
            <summary>
                <span>Historico concluido/cancelado</span>
                <strong>${e(history.length)}</strong>
            </summary>
            <div class="task-history-list">
                ${history.length ? history.map((task) => renderTask(req, task, true)).join('') : '<div class="task-empty">Nada no historico ainda.</div>'}
            </div>
        </details>
    </main>

    <script src="${BASE_PATH}/app.js?v=20260507b" defer></script>
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
  }),
);

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  await pgPool.query('SELECT 1');
  if (LEGACY_MYSQL_REQUIRED) await requireMysqlPool('health').query('SELECT 1');
  const [counts, legacyCounts, auth] = await Promise.all([taskCounts(), legacyTaskCounts(), coreAuthHealth()]);
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_tarefa',
      legacy_mysql_required: LEGACY_MYSQL_REQUIRED,
      legacy_mysql_import_enabled: LEGACY_MYSQL_IMPORT_ENABLED,
      legacy_mysql_mirror_enabled: LEGACY_MYSQL_MIRROR_ENABLED,
      legacy_mysql_logs_enabled: LEGACY_MYSQL_LOGS_ENABLED,
      migration: migrationState,
      counts,
      legacy_counts: legacyCounts,
    },
    auth,
  });
}));

app.get([`${BASE_PATH}/api/badge`, `${BASE_PATH}/badge.php`], asyncRoute(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.json({ ok: true, open: await countOpen() });
}));

app.get(`${BASE_PATH}/login`, (req, res) => {
  if (req.session.user) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req));
});

app.get(`${BASE_PATH}/login.php`, (req, res) => {
  if (req.session.user) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req));
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
  if (!username || !password) {
    return res.status(400).type('html').send(renderLogin(req, 'Informe usuario e senha.'));
  }
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    void logCoreAudit(null, 'login_tarefa_falha', 'user', null, `Tentativa de login Tarefas falhou para usuario: ${username}`, {
      auth_provider: AUTH_PROVIDER,
    });
    await logMysql(null, 'login_tarefa_falha', 'user', null, `Tentativa de login Tarefas falhou para usuario: ${username}`);
    return res.status(401).type('html').send(renderLogin(req, 'Usuario ou senha incorretos.'));
  }

  if (AUTH_PROVIDER === 'mysql') void shadowCoreAuth(username, password, user);
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
      auth_provider: AUTH_PROVIDER,
    });
    void logMysql(user.id, 'login_tarefa', 'user', user.id, 'Login Tarefas Node realizado.');
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[tarefa] request failed', error);
  if (res.headersSent) return;
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
  if (LEGACY_MYSQL_REQUIRED) {
    await withRetry('mysql', () => requireMysqlPool('startup').query('SELECT 1'));
  }
  if (CORE_AUTH_REQUIRED) {
    await withRetry('core postgres', () => requireCorePgPool('startup').query('SELECT 1'));
  }
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`[tarefa] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[tarefa] failed to start', error);
  process.exit(1);
});
