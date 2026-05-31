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

type TaskPriority = 'alta' | 'normal' | 'baixa';
type TaskStatus = 'aberta' | 'concluida' | 'cancelada';

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
  assigned_core_user_id: string | number | null;
  assigned_username_snapshot: string | null;
  delegated_by: number | null;
  delegated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  completed_at: Date | string | null;
  canceled_at: Date | string | null;
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
const SERVICE_VERSION = '1.2.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/tarefa');
const PORT = Number.parseInt(env.PORT || '3500', 10);
const SESSION_SECRET = env.TAREFA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const INTERNAL_TOKEN = cleanEnv('TAREFA_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_GUARDIAN_TOKEN')
  || cleanEnv('MIAUW_AGENT_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN');
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
  if (current) return current;
  const user = await userByHomeSso(req);
  if (!user) return null;
  await regenerateWithUser(req, user);
  return user;
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
        res.redirect(`${BASE_PATH}/login.php`);
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
}

function visibleTasksWhere(userId: number): string {
  return userId > 0 ? 'WHERE assigned_core_user_id IS NULL OR assigned_core_user_id = $1' : '';
}

async function taskCounts(userId = 0): Promise<Record<TaskStatus, number>> {
  const counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  const result = await pgPool.query<{ status: TaskStatus; total: string }>(
    `SELECT status, COUNT(*) AS total
       FROM tarefa_tasks
       ${visibleTasksWhere(userId)}
      GROUP BY status`,
    userId > 0 ? [userId] : [],
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

async function openTasks(userId: number): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
       WHERE status = 'aberta'
         AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $1)
       ORDER BY
         CASE priority WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
         created_at ASC,
         id ASC`,
    [userId],
  );
  return result.rows;
}

async function historyTasks(userId: number): Promise<TaskRow[]> {
  const result = await pgPool.query<TaskRow>(
    `SELECT *
       FROM tarefa_tasks
       WHERE status IN ('concluida', 'cancelada')
         AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $1)
       ORDER BY COALESCE(completed_at, canceled_at, updated_at, created_at) DESC, id DESC
       LIMIT 120`,
    [userId],
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
    void logCoreAudit(userId, 'tarefa_criada', 'task', String(taskId), `Tarefa criada: ${title}`);
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
  const assignedUsername = cleanText(req.body?.assigned_username || req.body?.username || '', 120);
  const actorUserId = Number(req.body?.actor_user_id || 0) || null;
  const actorUsername = cleanText(req.body?.actor_username || '', 120);
  if (!title) throw new Error('Informe o titulo da tarefa.');
  if (!Number.isSafeInteger(assignedUserId) || assignedUserId <= 0) {
    throw new Error('Usuario de destino invalido.');
  }

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
      [priority, title, description, actorUserId, assignedUserId, assignedUsername, actorUserId],
    );
    const task = result.rows[0];
    await auditPg(
      client,
      Number(task.id),
      actorUserId,
      'tarefa_privada_delegada',
      `Tarefa privada delegada para ${assignedUsername || assignedUserId}: ${title}`,
    );
    await client.query('COMMIT');
    void logCoreAudit(actorUserId, 'tarefa_privada_delegada', 'task', String(task.id), `Tarefa privada delegada por ${actorUsername || 'sistema'}.`, {
      assigned_core_user_id: assignedUserId,
      assigned_username: assignedUsername || null,
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
      source: 'miauby_internal_tool',
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

async function updateTask(req: Request): Promise<void> {
  const id = Number(req.body.id || 0);
  const priority = validPriority(req.body.prioridade);
  const title = trimText(req.body.titulo, 180);
  const description = String(req.body.descricao || '').trim();
  if (!id || !title) throw new Error('Tarefa invalida.');
  const userId = req.session.user?.id || 0;

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
           AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $5)
         RETURNING *`,
      [priority, title, description, id, userId],
    );
    const task = result.rows[0];
    if (!task) throw new Error('Tarefa invalida.');
    await auditPg(client, id, req.session.user?.id || null, 'tarefa_editada', `Tarefa editada: ${title}`);
    await client.query('COMMIT');
    void logCoreAudit(req.session.user?.id || null, 'tarefa_editada', 'task', String(id), `Tarefa editada: ${title}`);
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
  const completedAt = status === 'concluida' ? 'now()' : 'NULL';
  const canceledAt = status === 'cancelada' ? 'now()' : 'NULL';
  const result = await pgPool.query<TaskRow>(
    `UPDATE tarefa_tasks
        SET status = $1,
            completed_at = ${completedAt},
             canceled_at = ${canceledAt},
             updated_at = now()
       WHERE id = $2
         AND (assigned_core_user_id IS NULL OR assigned_core_user_id = $3)
       RETURNING *`,
    [status, id, userId],
  );
  const task = result.rows[0];
  if (!task) throw new Error('Tarefa invalida.');
  await pgPool.query(
    'INSERT INTO tarefa_audit_events (task_id, user_id, action, summary) VALUES ($1, $2, $3, $4)',
    [id, req.session.user?.id || null, 'tarefa_status', cleanText(`Tarefa marcada como ${status}.`, 255)],
  );
  void logCoreAudit(req.session.user?.id || null, 'tarefa_status', 'task', String(id), `Tarefa marcada como ${status}.`);
}

function renderTask(req: Request, task: TaskRow, history = false): string {
  const id = Number(task.id || 0);
  const priority = validPriority(task.priority);
  const status = validStatus(task.status);
  const title = String(task.title || '');
  const description = String(task.description || '').trim();
  const date = brDate(task.created_at, true);
  const finishDate = status === 'concluida' ? brDate(task.completed_at, true) : brDate(task.canceled_at, true);
  const assignedUserId = Number(task.assigned_core_user_id || 0);
  const assignedLabel = cleanText(task.assigned_username_snapshot, 80);
  const priorityOptions = (Object.entries(priorities) as Array<[TaskPriority, { label: string }]>)
    .map(([key, item]) => `<option value="${e(key)}" ${key === priority ? 'selected' : ''}>${e(item.label)}</option>`)
    .join('');

  return `
    <article class="task-row priority-${e(priority)} status-${e(status)}" data-task-row>
        <div class="task-priority">
            <span class="priority-pill">${e(priorityLabel(priority))}</span>
            ${assignedUserId > 0 ? `<span class="task-private-pill">Privada${assignedLabel ? `: ${e(assignedLabel)}` : ''}</span>` : ''}
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
  const viewerId = req.session.user?.id || 0;
  let counts: Record<TaskStatus, number> = { aberta: 0, concluida: 0, cancelada: 0 };
  let open: TaskRow[] = [];
  let history: TaskRow[] = [];
  let loadError = '';

  try {
    counts = await taskCounts(viewerId);
    open = await openTasks(viewerId);
    history = await historyTasks(viewerId);
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
  return res.type('html').send(renderLogin(req));
}));

app.get(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  const user = await ensureSessionUser(req);
  if (user) return res.redirect(loginRedirectTarget(req));
  return res.type('html').send(renderLogin(req));
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
    },
  });
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[tarefa] request failed', error);
  if (res.headersSent) return;
  if (_req.path.includes('/api/internal/')) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'internal_error' });
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
  app.listen(PORT, () => {
    console.log(`[tarefa] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[tarefa] failed to start', error);
  process.exit(1);
});
