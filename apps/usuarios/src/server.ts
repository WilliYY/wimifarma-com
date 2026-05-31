import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
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

type CoreUserRow = {
  id: string;
  legacy_mysql_id: string;
  username: string;
  username_normalized: string;
  password_hash: string | null;
  role: string;
  active: boolean;
  source: string;
  created_at: string;
  updated_at: string;
};

type UserViewRow = CoreUserRow & {
  xp_employee_id: string | null;
  xp_employee_name: string | null;
  permission_count: string;
  permissions: Record<string, boolean>;
  admin_password: string | null;
  admin_password_updated_at: string | null;
  admin_password_unavailable: boolean;
  password_vault_ciphertext?: string | null;
  password_vault_iv?: string | null;
  password_vault_tag?: string | null;
};

type WhatsappLinkRow = {
  id: string;
  user_id: string;
  contact_id: string;
  phone_mask: string;
  display_name: string;
  status: string;
  module_keys: string[];
  linked_by_username: string | null;
  linked_at: string;
  updated_at: string;
};

type XpEmployeeRow = {
  id: string;
  name: string;
  system_key: string | null;
};

type LinkedXpProfileRow = {
  id: string;
  name: string;
  photo_path: string | null;
  system_key: string | null;
  updated_at: string | null;
  total_xp: string | number | null;
  month_xp: string | number | null;
  rank: string | number;
};

type AuditRow = {
  id: string;
  actor_username: string | null;
  target_username: string | null;
  action: string;
  summary: string;
  created_at: string;
};

type ModuleDefinition = {
  key: string;
  label: string;
  href: string;
};

type WhatsappModuleDefinition = {
  key: string;
  label: string;
};

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
const SERVICE_NAME = 'usuarios';
const SERVICE_VERSION = '1.0.7';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/usuarios');
const PORT = Number.parseInt(env.PORT || '3900', 10);
const SESSION_SECRET = env.USUARIOS_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const PASSWORD_VAULT_KEY_SOURCE = cleanEnv('USUARIOS_PASSWORD_VAULT_KEY') || SESSION_SECRET;
const INTERNAL_HTTP_TIMEOUT_MS = Math.max(800, Math.min(12000, Number.parseInt(env.USUARIOS_INTERNAL_HTTP_TIMEOUT_MS || '4500', 10) || 4500));
const TAREFA_INTERNAL_BASE_URL = trimTrailingSlash(
  env.USUARIOS_TAREFA_INTERNAL_BASE_URL
    || env.TAREFA_INTERNAL_BASE_URL
    || 'http://wimifarma-tarefa-app:3500/tarefa',
);
const TAREFA_INTERNAL_TOKEN = cleanEnv('USUARIOS_TAREFA_INTERNAL_TOKEN')
  || cleanEnv('TAREFA_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_GUARDIAN_TOKEN')
  || cleanEnv('MIAUW_AGENT_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN');
const MIAUW_WHATSAPP_INTERNAL_BASE_URL = trimTrailingSlash(
  env.USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL
    || env.MIAUW_WHATSAPP_INTERNAL_BASE_URL
    || 'http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp',
);
const MIAUW_WHATSAPP_INTERNAL_TOKEN = cleanEnv('USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN')
  || cleanEnv('MIAUW_GUARDIAN_TOKEN')
  || cleanEnv('MIAUW_AGENT_INTERNAL_TOKEN');
const XP_FIRST_LEVEL_REQUIREMENT = 30000;
const XP_ADMIN_SYSTEM_KEY = 'adm';

const MODULES: ModuleDefinition[] = [
  { key: 'cashback', label: 'Cashback', href: '/cashback/' },
  { key: 'cotacao', label: 'Cotacao', href: '/cotacao/' },
  { key: 'pedidos', label: 'Pedidos', href: '/pedidos/' },
  { key: 'financeiro', label: 'Financeiro', href: '/financeiro/' },
  { key: 'tarefa', label: 'Tarefas', href: '/tarefa/' },
  { key: 'usuarios', label: 'Usuarios', href: '/usuarios/' },
  { key: 'codigos', label: 'Codigos', href: '/codigos/' },
  { key: 'xp', label: 'XP', href: '/xp/' },
  { key: 'gestao', label: 'Gestao', href: '/gestao/' },
  { key: 'miauw', label: 'Miauby', href: '/miauw/' },
  { key: 'miauw_whatsapp', label: 'Miauby Whatsapp', href: '/miauw/whatsapp/' },
];

const MODULE_KEYS = new Set(MODULES.map((module) => module.key));
const ROLE_OPTIONS = ['user', 'gerente', 'admin'];
const WHATSAPP_MODULES: WhatsappModuleDefinition[] = [
  { key: 'cashback', label: 'Cashback' },
  { key: 'cotacao', label: 'Cotacao' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'gestao', label: 'Gestao' },
  { key: 'tarefas', label: 'Tarefas' },
  { key: 'xp', label: 'XP' },
  { key: 'codigos', label: 'Codigos' },
  { key: 'miauw', label: 'Miauby' },
];
const WHATSAPP_MODULE_KEYS = new Set(WHATSAPP_MODULES.map((module) => module.key));

const corePgPool = new Pool({
  host: env.CORE_POSTGRES_HOST || env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || env.POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || env.POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || env.POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || env.POSTGRES_PASSWORD || '',
  max: 8,
});

const xpPgPool = new Pool({
  host: env.XP_POSTGRES_HOST || env.POSTGRES_XP_HOST || '127.0.0.1',
  port: Number(env.XP_POSTGRES_PORT || env.POSTGRES_XP_PORT || 5432),
  database: env.XP_POSTGRES_DB || 'wimifarma_xp',
  user: env.XP_POSTGRES_USER || 'wimifarma_xp',
  password: env.XP_POSTGRES_PASSWORD || '',
  max: 4,
});

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFUSUARIOS',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: corePgPool,
    tableName: 'usuarios_sessions',
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
  return clean === '' ? '/usuarios' : clean;
}

function cleanEnv(name: string): string {
  return String(env[name] || '').trim();
}

function trimTrailingSlash(value: string): string {
  return String(value || '').replace(/\/+$/, '');
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

function passwordVaultKey(): Buffer {
  return crypto.createHash('sha256').update(PASSWORD_VAULT_KEY_SOURCE, 'utf8').digest();
}

function encryptAdminPassword(password: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', passwordVaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptAdminPassword(row: UserViewRow): { value: string | null; unavailable: boolean } {
  if (!row.password_vault_ciphertext || !row.password_vault_iv || !row.password_vault_tag) {
    return { value: null, unavailable: false };
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      passwordVaultKey(),
      Buffer.from(row.password_vault_iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(row.password_vault_tag, 'base64'));
    const value = Buffer.concat([
      decipher.update(Buffer.from(row.password_vault_ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return { value, unavailable: false };
  } catch {
    return { value: null, unavailable: true };
  }
}

function numeric(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUsername(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requiredForNextLevel(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  const extra = Math.pow(Math.max(0, normalized - 1), 1.55) * 14000;
  return Math.max(XP_FIRST_LEVEL_REQUIREMENT, Math.round(XP_FIRST_LEVEL_REQUIREMENT + extra));
}

function progressFromTotal(totalXp: number): Record<string, number> {
  let level = 1;
  let levelStart = 0;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= requiredForNextLevel(level) && level < 10000) {
    const required = requiredForNextLevel(level);
    remaining -= required;
    levelStart += required;
    level += 1;
  }
  const required = requiredForNextLevel(level);
  return {
    level,
    next_level: level + 1,
    progress_xp: remaining,
    required_xp: required,
    percent: required > 0 ? Math.min(100, Math.round((remaining / required) * 10000) / 100) : 0,
  };
}

function xpPhotoUrl(value: unknown): string {
  const text = String(value || '');
  return /^\/xp\/uploads\/(funcionarios|adm)\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(text) ? text : '';
}

function currentMonthBounds(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value || new Date().getFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value || new Date().getMonth() + 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function normalizeRole(value: unknown): string {
  const role = normalizeUsername(value);
  return ROLE_OPTIONS.includes(role) ? role : 'user';
}

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function canManageUsers(user: User | null | undefined): boolean {
  if (!user) return false;
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  return username === 'adm' || role === 'admin';
}

function userPublic(row: Pick<CoreUserRow, 'id' | 'username' | 'role'>): User {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role || 'user'),
  };
}

function brDateTime(value: unknown): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function userSourceLabel(source: unknown): string {
  const value = String(source || '').trim();
  if (value === 'mysql:wf_users') return 'Migrado para Postgres';
  if (value === 'usuarios:core') return 'Criado no Postgres';
  if (value.includes('core')) return 'Postgres core';
  return value || 'Postgres core';
}

function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://usuarios.local');
    const allowedPaths = new Set([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`]);
    if (!allowedPaths.has(url.pathname)) return '';
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
  if (!expected || !received) return false;
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const receivedHash = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash);
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

function selectedModuleKeys(input: unknown): Set<string> {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const selected = new Set<string>();
  for (const value of raw) {
    const key = String(value || '').trim();
    if (MODULE_KEYS.has(key)) {
      selected.add(key);
    }
  }
  return selected;
}

function selectedWhatsappModuleKeys(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const selected: string[] = [];
  for (const value of raw) {
    const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '');
    if (WHATSAPP_MODULE_KEYS.has(key) && !selected.includes(key)) {
      selected.push(key);
    }
  }
  return selected;
}

function whatsappModulesFromUserPermissions(permissions: Record<string, boolean>): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    if (WHATSAPP_MODULE_KEYS.has(key) && !keys.includes(key)) keys.push(key);
  };
  for (const module of MODULES) {
    if (!permissions[module.key]) continue;
    if (module.key === 'tarefa') push('tarefas');
    else if (WHATSAPP_MODULE_KEYS.has(module.key)) push(module.key);
  }
  if (!keys.length) keys.push('miauw');
  return keys;
}

function permissionsForView(row: UserViewRow): Record<string, boolean> {
  const explicitCount = Number(row.permission_count || 0);
  const permissions = row.permissions || {};
  const result: Record<string, boolean> = {};
  for (const module of MODULES) {
    result[module.key] = explicitCount === 0 ? true : Boolean(permissions[module.key]);
  }
  return result;
}

async function ensureCoreSchema(): Promise<void> {
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_users (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT true,
      source TEXT NOT NULL DEFAULT 'mysql:wf_users',
      migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_audit_logs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_audit_logs_created_at
      ON core_audit_logs (created_at DESC)
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_audit_logs_actor_created
      ON core_audit_logs (actor_user_id, created_at DESC)
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_login_rate_limits (
      rate_key TEXT PRIMARY KEY,
      username_normalized TEXT,
      ip_hash TEXT,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      blocked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_user_module_permissions (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      can_access BOOLEAN NOT NULL DEFAULT true,
      granted_by BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, module_key)
    )
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_user_module_permissions_user
      ON core_user_module_permissions (user_id)
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_user_xp_links (
      user_id BIGINT PRIMARY KEY REFERENCES core_users(id) ON DELETE CASCADE,
      xp_employee_id BIGINT,
      xp_employee_name TEXT,
      linked_by BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_user_admin_passwords (
      user_id BIGINT PRIMARY KEY REFERENCES core_users(id) ON DELETE CASCADE,
      password_ciphertext TEXT NOT NULL,
      password_iv TEXT NOT NULL,
      password_tag TEXT NOT NULL,
      updated_by BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_user_admin_passwords_updated
      ON core_user_admin_passwords (updated_at DESC)
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_user_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      target_user_id BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await corePgPool.query(`
    CREATE TABLE IF NOT EXISTS core_user_whatsapp_links (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
      contact_id UUID NOT NULL,
      phone_mask VARCHAR(40) NOT NULL DEFAULT '',
      display_name VARCHAR(120) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'allowed',
      module_keys TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      linked_by BIGINT REFERENCES core_users(id) ON DELETE SET NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, contact_id)
    )
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_user_audit_events_created
      ON core_user_audit_events (created_at DESC)
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_user_audit_events_target_created
      ON core_user_audit_events (target_user_id, created_at DESC)
  `);
  await corePgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_core_user_whatsapp_links_user
      ON core_user_whatsapp_links (user_id, updated_at DESC)
  `);
  await corePgPool.query(`
    SELECT setval(
      pg_get_serial_sequence('core_users', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 1) FROM core_users), 1),
      true
    )
  `);
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, legacy_mysql_id::text, username, username_normalized, password_hash, role, active, source, created_at, updated_at
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
  const publicUser = userPublic(user);
  return canManageUsers(publicUser) ? publicUser : null;
}

async function currentSessionUser(sessionUser: User | undefined): Promise<User | null> {
  if (!sessionUser) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, legacy_mysql_id::text, username, username_normalized, password_hash, role, active, source, created_at, updated_at
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [sessionUser.id],
  );
  const user = result.rows[0];
  if (!user) return null;
  return userPublic(user);
}

async function currentUser(sessionUser: User | undefined): Promise<User | null> {
  const publicUser = await currentSessionUser(sessionUser);
  return canManageUsers(publicUser) ? publicUser : null;
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
    `SELECT id::text, legacy_mysql_id::text, username, username_normalized, password_hash, role, active, source, created_at, updated_at
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [username],
  );
  const user = result.rows[0];
  const publicUser = user ? userPublic(user) : null;
  return canManageUsers(publicUser) ? publicUser : null;
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
  if (!user) {
    user = await userByHomeSso(req);
    if (user) await regenerateWithUser(req, user);
  }
  if (!user) {
    req.session.returnTo = req.originalUrl;
    res.redirect(`${BASE_PATH}/login.php`);
    return null;
  }
  req.session.user = user;
  return user;
}

async function logUserAudit(
  actorUserId: number | null,
  targetUserId: number | null,
  action: string,
  summary: string,
  metadata: Record<string, unknown> = {},
  client: pg.Pool | pg.PoolClient = corePgPool,
): Promise<void> {
  const safeAction = cleanText(action, 80);
  const safeSummary = cleanText(summary, 500);
  await client.query(
    `INSERT INTO core_user_audit_events (actor_user_id, target_user_id, action, summary, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorUserId, targetUserId, safeAction, safeSummary, JSON.stringify(metadata)],
  );
  await client.query(
    `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorUserId, safeAction, 'core_user', targetUserId === null ? null : String(targetUserId), safeSummary, JSON.stringify({ service: SERVICE_NAME, ...metadata })],
  );
}

async function listUsers(): Promise<UserViewRow[]> {
  const result = await corePgPool.query<UserViewRow>(`
    SELECT
      u.id::text,
      u.legacy_mysql_id::text,
      u.username,
      u.username_normalized,
      u.password_hash,
      u.role,
      u.active,
      u.source,
      u.created_at::text,
      u.updated_at::text,
      x.xp_employee_id::text,
      x.xp_employee_name,
      v.password_ciphertext AS password_vault_ciphertext,
      v.password_iv AS password_vault_iv,
      v.password_tag AS password_vault_tag,
      v.updated_at::text AS admin_password_updated_at,
      COUNT(p.module_key)::text AS permission_count,
      COALESCE(jsonb_object_agg(p.module_key, p.can_access) FILTER (WHERE p.module_key IS NOT NULL), '{}'::jsonb) AS permissions
    FROM core_users u
    LEFT JOIN core_user_xp_links x ON x.user_id = u.id
    LEFT JOIN core_user_admin_passwords v ON v.user_id = u.id
    LEFT JOIN core_user_module_permissions p ON p.user_id = u.id
    GROUP BY u.id, x.user_id, x.xp_employee_id, x.xp_employee_name, v.user_id, v.password_ciphertext, v.password_iv, v.password_tag, v.updated_at
    ORDER BY u.active DESC, u.username_normalized ASC
  `);
  return result.rows.map((row) => {
    const decrypted = decryptAdminPassword(row);
    return {
      ...row,
      admin_password: decrypted.value,
      admin_password_unavailable: decrypted.unavailable,
    };
  });
}

async function listXpEmployees(): Promise<XpEmployeeRow[]> {
  try {
    const result = await xpPgPool.query<XpEmployeeRow>(
      `SELECT id::text, name, system_key
         FROM xp_employees
        WHERE status = 'ativo' AND deleted_at IS NULL
        ORDER BY (system_key = 'adm') ASC, name ASC`,
    );
    return result.rows;
  } catch (error) {
    console.warn('[usuarios] failed to load xp employees', error);
    return [];
  }
}

async function listWhatsappLinks(): Promise<Map<number, WhatsappLinkRow[]>> {
  const result = await corePgPool.query<WhatsappLinkRow>(
    `SELECT
       l.id::text,
       l.user_id::text,
       l.contact_id::text,
       l.phone_mask,
       l.display_name,
       l.status,
       l.module_keys,
       actor.username AS linked_by_username,
       l.linked_at::text,
       l.updated_at::text
     FROM core_user_whatsapp_links l
     LEFT JOIN core_users actor ON actor.id = l.linked_by
     ORDER BY l.updated_at DESC, l.id DESC`,
  );
  const grouped = new Map<number, WhatsappLinkRow[]>();
  for (const row of result.rows) {
    const userId = Number(row.user_id || 0);
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId)?.push(row);
  }
  return grouped;
}

async function postInternalJson(url: string, token: string, body: Record<string, unknown>, serviceLabel: string): Promise<Record<string, unknown>> {
  if (!token) {
    throw new Error(`${serviceLabel} sem token interno configurado.`);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Miauw-Internal-Token': token,
      'X-Tarefa-Internal-Token': token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(INTERNAL_HTTP_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    const error = cleanText(payload.error || payload.message || `${serviceLabel} retornou erro.`, 180);
    throw new Error(error || `${serviceLabel} retornou erro.`);
  }
  return payload;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => cleanText(item, 40)).filter(Boolean) : [];
}

async function recentAudit(limit = 80): Promise<AuditRow[]> {
  const result = await corePgPool.query<AuditRow>(
    `SELECT
        e.id::text,
        actor.username AS actor_username,
        target.username AS target_username,
        e.action,
        e.summary,
        e.created_at::text
       FROM core_user_audit_events e
       LEFT JOIN core_users actor ON actor.id = e.actor_user_id
       LEFT JOIN core_users target ON target.id = e.target_user_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(200, limit))],
  );
  return result.rows;
}

async function dashboardStats(): Promise<Record<string, number>> {
  const result = await corePgPool.query<{
    users_total: string;
    users_active: string;
    admins_active: string;
    xp_links: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM core_users) AS users_total,
      (SELECT COUNT(*) FROM core_users WHERE active = true) AS users_active,
      (SELECT COUNT(*) FROM core_users WHERE active = true AND (username_normalized = 'adm' OR role = 'admin')) AS admins_active,
      (SELECT COUNT(*) FROM core_user_xp_links) AS xp_links
  `);
  const row = result.rows[0];
  return {
    users_total: Number(row?.users_total || 0),
    users_active: Number(row?.users_active || 0),
    admins_active: Number(row?.admins_active || 0),
    xp_links: Number(row?.xp_links || 0),
  };
}

async function findCoreUser(userId: number, client: pg.Pool | pg.PoolClient = corePgPool): Promise<CoreUserRow | null> {
  const result = await client.query<CoreUserRow>(
    `SELECT id::text, legacy_mysql_id::text, username, username_normalized, password_hash, role, active, source, created_at::text, updated_at::text
       FROM core_users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function reserveCoreUserId(client: pg.PoolClient): Promise<number> {
  const result = await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence('core_users', 'id'))::text AS id");
  const id = Number(result.rows[0]?.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Nao consegui reservar o ID do usuario.');
  }
  return id;
}

async function countOtherActiveAdmins(userId: number, client: pg.Pool | pg.PoolClient = corePgPool): Promise<number> {
  const result = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM core_users
      WHERE id <> $1
        AND active = true
        AND (username_normalized = 'adm' OR role = 'admin')`,
    [userId],
  );
  return Number(result.rows[0]?.total || 0);
}

async function saveModulePermissions(
  targetUserId: number,
  selected: Set<string>,
  actorUserId: number,
  client: pg.Pool | pg.PoolClient = corePgPool,
): Promise<void> {
  for (const module of MODULES) {
    await client.query(
      `INSERT INTO core_user_module_permissions (user_id, module_key, can_access, granted_by, granted_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, module_key) DO UPDATE SET
         can_access = EXCLUDED.can_access,
         granted_by = EXCLUDED.granted_by,
         updated_at = NOW()`,
      [targetUserId, module.key, selected.has(module.key), actorUserId],
    );
  }
}

async function findXpEmployee(employeeId: number): Promise<XpEmployeeRow | null> {
  if (employeeId <= 0) return null;
  try {
    const result = await xpPgPool.query<XpEmployeeRow>(
      `SELECT id::text, name, system_key
         FROM xp_employees
        WHERE id = $1 AND status = 'ativo' AND deleted_at IS NULL
        LIMIT 1`,
      [employeeId],
    );
    return result.rows[0] || null;
  } catch (error) {
    console.warn('[usuarios] failed to find xp employee', error);
    return null;
  }
}

async function saveXpLink(
  targetUserId: number,
  xpEmployeeId: number,
  actorUserId: number,
  client: pg.Pool | pg.PoolClient = corePgPool,
): Promise<void> {
  if (xpEmployeeId <= 0) {
    await client.query('DELETE FROM core_user_xp_links WHERE user_id = $1', [targetUserId]);
    return;
  }
  const employee = await findXpEmployee(xpEmployeeId);
  if (!employee) {
    throw new Error('Funcionario XP nao encontrado.');
  }
  await client.query(
    `INSERT INTO core_user_xp_links (user_id, xp_employee_id, xp_employee_name, linked_by, linked_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       xp_employee_id = EXCLUDED.xp_employee_id,
       xp_employee_name = EXCLUDED.xp_employee_name,
       linked_by = EXCLUDED.linked_by,
       updated_at = NOW()`,
    [targetUserId, Number(employee.id), employee.system_key === 'adm' ? 'ADM' : cleanText(employee.name, 180), actorUserId],
  );
}

async function saveAdminPasswordSecret(
  targetUserId: number,
  password: string,
  actorUserId: number,
  client: pg.Pool | pg.PoolClient = corePgPool,
): Promise<void> {
  const secret = encryptAdminPassword(password);
  await client.query(
    `INSERT INTO core_user_admin_passwords (
       user_id, password_ciphertext, password_iv, password_tag, updated_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       password_ciphertext = EXCLUDED.password_ciphertext,
       password_iv = EXCLUDED.password_iv,
       password_tag = EXCLUDED.password_tag,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [targetUserId, secret.ciphertext, secret.iv, secret.tag, actorUserId],
  );
}

async function linkedXpProfile(userId: number): Promise<Record<string, unknown> | null> {
  const link = await corePgPool.query<{ xp_employee_id: string | null; xp_employee_name: string | null }>(
    `SELECT xp_employee_id::text, xp_employee_name
       FROM core_user_xp_links
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  const employeeId = Number(link.rows[0]?.xp_employee_id || 0);
  if (employeeId <= 0) return null;

  const month = currentMonthBounds();
  const result = await xpPgPool.query<LinkedXpProfileRow>(
    `WITH totals AS (
        SELECT employee_id, COALESCE(SUM(xp_points), 0) AS total_xp
          FROM xp_sales
         WHERE deleted_at IS NULL
         GROUP BY employee_id
      ),
      month_totals AS (
        SELECT employee_id, COALESCE(SUM(xp_points), 0) AS month_xp
          FROM xp_sales
         WHERE deleted_at IS NULL AND sale_date BETWEEN $1::date AND $2::date
         GROUP BY employee_id
      ),
      ranked AS (
        SELECT
          e.id,
          e.name,
          e.photo_path,
          e.system_key,
          e.updated_at,
          COALESCE(t.total_xp, 0) AS total_xp,
          COALESCE(m.month_xp, 0) AS month_xp,
          ROW_NUMBER() OVER (ORDER BY COALESCE(t.total_xp, 0) DESC, (e.system_key = $3) ASC, e.name ASC) AS rank
        FROM xp_employees e
        LEFT JOIN totals t ON t.employee_id = e.id
        LEFT JOIN month_totals m ON m.employee_id = e.id
        WHERE e.status = 'ativo' AND e.deleted_at IS NULL
      )
      SELECT id::text, name, photo_path, system_key, updated_at::text, total_xp, month_xp, rank::text
        FROM ranked
       WHERE id = $4
       LIMIT 1`,
    [month.start, month.end, XP_ADMIN_SYSTEM_KEY, employeeId],
  );

  const row = result.rows[0];
  if (!row) return null;
  const totalXp = numeric(row.total_xp);
  const isAdmin = row.system_key === XP_ADMIN_SYSTEM_KEY;
  return {
    id: Number(row.id),
    name: cleanText(row.name, 180) || (isAdmin ? 'ADM' : 'Funcionario'),
    photo_url: xpPhotoUrl(row.photo_path),
    is_admin: isAdmin,
    rank: Number(row.rank || 0),
    month_xp: numeric(row.month_xp),
    total_xp: totalXp,
    progress: progressFromTotal(totalXp),
    linked_name: link.rows[0]?.xp_employee_name || null,
    updated_at: row.updated_at || null,
  };
}

async function createUser(req: Request, actor: User): Promise<void> {
  const username = cleanText(req.body.username, 80);
  const normalized = normalizeUsername(username);
  if (!/^[a-zA-Z0-9._-]{2,60}$/.test(username)) {
    throw new Error('Usuario precisa ter 2 a 60 caracteres com letras, numeros, ponto, traco ou underline.');
  }
  if (normalized !== username.toLowerCase()) {
    throw new Error('Usuario nao pode ter espacos.');
  }
  const password = String(req.body.password || '');
  if (password.length < 6) {
    throw new Error('Senha precisa ter pelo menos 6 caracteres.');
  }
  const role = normalizeRole(req.body.role);
  const active = req.body.active === '1' || req.body.active === 'on';
  const modules = selectedModuleKeys(req.body.modules);
  if (role === 'admin' || normalized === 'adm') {
    modules.add('usuarios');
  }
  const xpEmployeeId = Number(req.body.xp_employee_id || 0);
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await corePgPool.connect();
  try {
    await client.query('BEGIN');
    const id = await reserveCoreUserId(client);
    const result = await client.query<CoreUserRow>(
      `INSERT INTO core_users (
         id, legacy_mysql_id, username, username_normalized, password_hash,
         role, active, source, migrated_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, 'usuarios:core', NOW(), NOW(), NOW()
       )
       RETURNING id::text, legacy_mysql_id::text, username, username_normalized, password_hash, role, active, source, created_at::text, updated_at::text`,
      [id, -id, username, normalized, passwordHash, role, active,],
    );
    const created = result.rows[0];
    await saveModulePermissions(Number(created.id), modules, actor.id, client);
    await saveXpLink(Number(created.id), xpEmployeeId, actor.id, client);
    await saveAdminPasswordSecret(Number(created.id), password, actor.id, client);
    await logUserAudit(actor.id, Number(created.id), 'usuarios_criou_usuario', `Usuario ${created.username} criado.`, {
      modules: Array.from(modules),
      role,
      active,
      xp_employee_id: xpEmployeeId || null,
      admin_password_vault_updated: true,
    }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error && error.message.includes('duplicate key')
      ? 'Ja existe um usuario com esse login.'
      : error instanceof Error ? error.message : 'Nao consegui criar o usuario.';
    throw new Error(message);
  } finally {
    client.release();
  }
}

async function updateUser(req: Request, actor: User): Promise<void> {
  const targetUserId = Number(req.body.user_id || 0);
  if (targetUserId <= 0) {
    throw new Error('Usuario invalido.');
  }
  const target = await findCoreUser(targetUserId);
  if (!target) {
    throw new Error('Usuario nao encontrado.');
  }
  const selected = selectedModuleKeys(req.body.modules);
  const isSelf = targetUserId === actor.id;
  const targetIsAdm = normalizeUsername(target.username) === 'adm';
  if (isSelf || targetIsAdm) {
    selected.add('usuarios');
  }
  let role = normalizeRole(req.body.role);
  let active = req.body.active === '1' || req.body.active === 'on';
  if (isSelf || targetIsAdm) {
    role = target.role;
    active = true;
  }
  const password = String(req.body.password || '');
  if (password && password.length < 6) {
    throw new Error('Senha precisa ter pelo menos 6 caracteres.');
  }
  const xpEmployeeId = Number(req.body.xp_employee_id || 0);
  const client = await corePgPool.connect();
  try {
    await client.query('BEGIN');
    const remainsAdmin = active && (target.username_normalized === 'adm' || role === 'admin');
    if ((target.active && (target.username_normalized === 'adm' || target.role === 'admin')) && !remainsAdmin) {
      const otherAdmins = await countOtherActiveAdmins(targetUserId, client);
      if (otherAdmins <= 0) {
        throw new Error('Mantenha pelo menos um administrador ativo.');
      }
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      await client.query(
        `UPDATE core_users
            SET role = $1, active = $2, password_hash = $3, updated_at = NOW()
          WHERE id = $4`,
        [role, active, passwordHash, targetUserId],
      );
      await saveAdminPasswordSecret(targetUserId, password, actor.id, client);
    } else {
      await client.query(
        `UPDATE core_users
            SET role = $1, active = $2, updated_at = NOW()
          WHERE id = $3`,
        [role, active, targetUserId],
      );
    }
    await saveModulePermissions(targetUserId, selected, actor.id, client);
    await saveXpLink(targetUserId, xpEmployeeId, actor.id, client);
    await logUserAudit(actor.id, targetUserId, 'usuarios_atualizou_usuario', `Usuario ${target.username} atualizado.`, {
      modules: Array.from(selected),
      role,
      active,
      xp_employee_id: xpEmployeeId || null,
      password_changed: Boolean(password),
      admin_password_vault_updated: Boolean(password),
    }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateUser(req: Request, actor: User): Promise<void> {
  const targetUserId = Number(req.body.user_id || 0);
  if (targetUserId <= 0) {
    throw new Error('Usuario invalido.');
  }
  if (targetUserId === actor.id) {
    throw new Error('Voce nao pode excluir o proprio acesso.');
  }
  const target = await findCoreUser(targetUserId);
  if (!target) {
    throw new Error('Usuario nao encontrado.');
  }
  if (normalizeUsername(target.username) === 'adm') {
    throw new Error('O usuario ADM nao pode ser excluido.');
  }
  if (target.active && (target.username_normalized === 'adm' || target.role === 'admin')) {
    const otherAdmins = await countOtherActiveAdmins(targetUserId);
    if (otherAdmins <= 0) {
      throw new Error('Mantenha pelo menos um administrador ativo.');
    }
  }
  await corePgPool.query('UPDATE core_users SET active = false, updated_at = NOW() WHERE id = $1', [targetUserId]);
  await logUserAudit(actor.id, targetUserId, 'usuarios_desativou_usuario', `Usuario ${target.username} desativado.`, {});
}

async function delegatePrivateTask(req: Request, actor: User): Promise<void> {
  const targetUserId = Number(req.body.user_id || 0);
  const target = targetUserId > 0 ? await findCoreUser(targetUserId) : null;
  if (!target || !target.active) {
    throw new Error('Usuario de destino invalido.');
  }
  const title = cleanText(req.body.titulo || req.body.title, 180);
  const description = String(req.body.descricao || '').trim().slice(0, 2000);
  const priority = ['alta', 'normal', 'baixa'].includes(String(req.body.prioridade || ''))
    ? String(req.body.prioridade)
    : 'normal';
  if (!title) {
    throw new Error('Informe o titulo da tarefa.');
  }
  const payload = await postInternalJson(
    `${TAREFA_INTERNAL_BASE_URL}/api/internal/tasks/private`,
    TAREFA_INTERNAL_TOKEN,
    {
      assigned_core_user_id: targetUserId,
      assigned_username: target.username,
      actor_user_id: actor.id,
      actor_username: actor.username,
      priority,
      title,
      description,
    },
    'Tarefa',
  );
  const task = (payload.task && typeof payload.task === 'object') ? payload.task as Record<string, unknown> : {};
  await logUserAudit(actor.id, targetUserId, 'usuarios_delegou_tarefa_privada', `Tarefa privada delegada para ${target.username}.`, {
    task_id: task.id || null,
    priority,
    title,
  });
}

async function linkWhatsappNumber(req: Request, actor: User): Promise<void> {
  const targetUserId = Number(req.body.user_id || 0);
  const target = targetUserId > 0 ? await findCoreUser(targetUserId) : null;
  if (!target || !target.active) {
    throw new Error('Usuario de destino invalido.');
  }
  const phone = cleanText(req.body.phone || req.body.numero, 80);
  const displayName = cleanText(req.body.display_name || target.username, 120);
  const moduleKeys = selectedWhatsappModuleKeys(req.body.whatsapp_modules);
  if (!phone) {
    throw new Error('Informe o numero do WhatsApp.');
  }
  const payload = await postInternalJson(
    `${MIAUW_WHATSAPP_INTERNAL_BASE_URL}/internal/allowlist/link-user`,
    MIAUW_WHATSAPP_INTERNAL_TOKEN,
    {
      user_id: targetUserId,
      username: target.username,
      actor_user_id: actor.id,
      actor_username: actor.username,
      phone,
      display_name: displayName,
      modules: moduleKeys.length ? moduleKeys : ['miauw'],
    },
    'Miauby WhatsApp',
  );
  const contact = (payload.contact && typeof payload.contact === 'object') ? payload.contact as Record<string, unknown> : {};
  const contactId = cleanText(contact.id, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contactId)) {
    throw new Error('Miauby WhatsApp nao retornou contato valido.');
  }
  const safeModules = selectedWhatsappModuleKeys(contact.module_keys || moduleKeys);
  await corePgPool.query(
    'DELETE FROM core_user_whatsapp_links WHERE contact_id = $1 AND user_id <> $2',
    [contactId, targetUserId],
  );
  await corePgPool.query(
    `INSERT INTO core_user_whatsapp_links (
       user_id, contact_id, phone_mask, display_name, status, module_keys, linked_by, linked_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, NOW(), NOW())
     ON CONFLICT (user_id, contact_id) DO UPDATE SET
       phone_mask = EXCLUDED.phone_mask,
       display_name = EXCLUDED.display_name,
       status = EXCLUDED.status,
       module_keys = EXCLUDED.module_keys,
       linked_by = EXCLUDED.linked_by,
       updated_at = NOW()`,
    [
      targetUserId,
      contactId,
      cleanText(contact.phone_mask, 40),
      cleanText(contact.display_name || displayName, 120),
      cleanText(contact.status || 'allowed', 20),
      safeModules,
      actor.id,
    ],
  );
  await logUserAudit(actor.id, targetUserId, 'usuarios_vinculou_whatsapp', `WhatsApp vinculado para ${target.username}.`, {
    contact_id: contactId,
    phone_mask: cleanText(contact.phone_mask, 40),
    modules: safeModules,
  });
}

async function unlinkWhatsappNumber(req: Request, actor: User): Promise<void> {
  const linkId = Number(req.body.link_id || 0);
  if (!Number.isSafeInteger(linkId) || linkId <= 0) {
    throw new Error('Vinculo de WhatsApp invalido.');
  }
  const result = await corePgPool.query<WhatsappLinkRow>(
    `SELECT id::text, user_id::text, contact_id::text, phone_mask, display_name, status, module_keys,
            NULL::text AS linked_by_username, linked_at::text, updated_at::text
       FROM core_user_whatsapp_links
      WHERE id = $1
      LIMIT 1`,
    [linkId],
  );
  const link = result.rows[0];
  if (!link) {
    throw new Error('Vinculo de WhatsApp nao encontrado.');
  }
  const userId = Number(link.user_id || 0);
  await postInternalJson(
    `${MIAUW_WHATSAPP_INTERNAL_BASE_URL}/internal/allowlist/unlink-user`,
    MIAUW_WHATSAPP_INTERNAL_TOKEN,
    {
      user_id: userId,
      contact_id: link.contact_id,
      actor_user_id: actor.id,
      actor_username: actor.username,
    },
    'Miauby WhatsApp',
  );
  await corePgPool.query('DELETE FROM core_user_whatsapp_links WHERE id = $1', [linkId]);
  await logUserAudit(actor.id, userId, 'usuarios_desvinculou_whatsapp', 'WhatsApp removido da allowlist do usuario.', {
    contact_id: link.contact_id,
    phone_mask: link.phone_mask,
  });
}

function renderLogin(req: Request, message = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Usu&aacute;rios - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260530-users-edit-layout">
  <script src="${BASE_PATH}/login-runner.js?v=20260529a" defer></script>
</head>
<body class="users-login-body">
  <main class="users-login">
    <img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma">
    <h1>Entrar em Usu&aacute;rios</h1>
    ${message ? `<div class="users-alert">${e(message)}</div>` : ''}
    <form method="post" action="${BASE_PATH}/login.php">
      ${csrfField(req)}
      <label class="users-label"><span>Usuario</span><input class="users-input" type="text" name="username" autocomplete="username" required autofocus></label>
      <label class="users-label"><span>Senha</span><input class="users-input" type="password" name="password" autocomplete="current-password" required></label>
      <button class="users-button" type="submit">Entrar</button>
    </form>
  </main>
  <img class="login-screen-runner login-cat-runner" src="${BASE_PATH}/assets/gato-hapy.gif?v=20260529a" alt="" aria-hidden="true" data-login-runner>
</body>
</html>`;
}

function renderRoleOptions(selected: string): string {
  return ROLE_OPTIONS.map((role) => `<option value="${e(role)}"${role === selected ? ' selected' : ''}>${e(role)}</option>`).join('');
}

function renderXpOptions(employees: XpEmployeeRow[], selectedId: string | null): string {
  const rows = ['<option value="">Sem vinculo XP</option>'];
  for (const employee of employees) {
    const label = employee.system_key === 'adm' ? 'ADM - XP' : employee.name;
    rows.push(`<option value="${e(employee.id)}"${String(selectedId || '') === String(employee.id) ? ' selected' : ''}>${e(label)}</option>`);
  }
  return rows.join('');
}

function renderModuleChecks(name: string, permissions: Record<string, boolean>): string {
  return `<div class="users-modules">${MODULES.map((module) => `<label class="users-check"><input type="checkbox" name="${e(name)}" value="${e(module.key)}"${permissions[module.key] ? ' checked' : ''}><span>${e(module.label)}</span></label>`).join('')}</div>`;
}

function renderWhatsappModuleChecks(selectedKeys: string[]): string {
  const selected = new Set(selectedKeys);
  return `<div class="users-modules users-whatsapp-modules">${WHATSAPP_MODULES.map((module) => `<label class="users-check"><input type="checkbox" name="whatsapp_modules" value="${e(module.key)}"${selected.has(module.key) ? ' checked' : ''}><span>${e(module.label)}</span></label>`).join('')}</div>`;
}

function whatsappModuleLabels(keys: string[]): string {
  const selected = new Set(keys);
  const labels = WHATSAPP_MODULES.filter((module) => selected.has(module.key)).map((module) => module.label);
  return labels.length ? labels.join(', ') : 'Sem cards';
}

function renderDashboard(
  req: Request,
  user: User,
  users: UserViewRow[],
  xpEmployees: XpEmployeeRow[],
  whatsappLinks: Map<number, WhatsappLinkRow[]>,
  audit: AuditRow[],
  stats: Record<string, number>,
): string {
  const flash = takeFlash(req);
  const defaultModules = Object.fromEntries(MODULES.map((module) => [module.key, module.key !== 'usuarios'])) as Record<string, boolean>;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Usu&aacute;rios - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260530-users-edit-layout">
  <script src="${BASE_PATH}/password-tools.js?v=20260530b" defer></script>
</head>
<body>
  <header class="users-topbar">
    <div class="users-shell users-topbar-inner">
      <a class="users-brand" href="${BASE_PATH}/"><img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma"><strong>Usu&aacute;rios</strong></a>
      <nav class="users-nav" aria-label="Navegacao">
        <a href="/">Home</a>
        <a href="/xp/">XP</a>
        <a href="${BASE_PATH}/logout.php">Sair</a>
      </nav>
    </div>
  </header>
  <main class="users-main">
    <div class="users-shell">
      <div class="users-page-title">
        <div>
          <span class="users-kicker">Core Postgres</span>
          <h1>Usu&aacute;rios</h1>
          <p>${e(user.username)} conectado. Logins individuais, permiss&otilde;es por m&oacute;dulo, XP e auditoria central.</p>
        </div>
        <div class="users-storage-note">
          <strong>Fonte oficial</strong>
          <span>Postgres core_users. Senhas antigas seguem em hash; novas trocas entram no cofre ADM.</span>
        </div>
      </div>
      ${flash.message ? `<div class="users-alert ${e(flash.type)}">${e(flash.message)}</div>` : ''}
      <section class="users-summary" aria-label="Resumo">
        <article><span>Total</span><strong>${e(stats.users_total)}</strong></article>
        <article><span>Ativos</span><strong>${e(stats.users_active)}</strong></article>
        <article><span>Admins</span><strong>${e(stats.admins_active)}</strong></article>
        <article><span>XP</span><strong>${e(stats.xp_links)}</strong></article>
      </section>
      <div class="users-layout">
        <aside>
          <section class="users-section">
            <h2>Novo usu&aacute;rio</h2>
            <form method="post" action="${BASE_PATH}/" class="users-create-form">
              ${csrfField(req)}
              <input type="hidden" name="action" value="create_user">
              <label class="users-label"><span>Usu&aacute;rio</span><input class="users-input" type="text" name="username" maxlength="60" autocomplete="off" required></label>
              <div class="users-label users-password-label">
                <span>Senha</span>
                <div class="users-password-control" data-password-control>
                  <input class="users-input" type="password" name="password" minlength="6" autocomplete="new-password" required data-password-input>
                  <button class="users-mini-action" type="button" data-password-generate>Gerar</button>
                  <button class="users-mini-action" type="button" data-password-toggle>Mostrar</button>
                  <button class="users-mini-action" type="button" data-password-copy>Copiar</button>
                </div>
                <small class="users-field-help" data-password-status>Ao criar, a senha fica no cofre ADM criptografado para consulta interna.</small>
              </div>
              <label class="users-label"><span>Perfil</span><select class="users-select" name="role">${renderRoleOptions('user')}</select></label>
              <label class="users-check"><input type="checkbox" name="active" value="1" checked>Ativo</label>
              <label class="users-label"><span>XP</span><select class="users-select" name="xp_employee_id">${renderXpOptions(xpEmployees, null)}</select></label>
              <fieldset class="users-fieldset"><legend>M&oacute;dulos</legend>${renderModuleChecks('modules', defaultModules)}</fieldset>
              <button class="users-button" type="submit">Criar</button>
            </form>
          </section>
          <section class="users-section">
            <h2>Hist&oacute;rico</h2>
            ${renderAudit(audit)}
          </section>
        </aside>
        <section class="users-grid" aria-label="Lista de usuarios">
          ${users.map((row) => renderUserRow(req, row, xpEmployees, whatsappLinks.get(Number(row.id)) || [])).join('')}
        </section>
      </div>
    </div>
  </main>
</body>
</html>`;
}

function renderAdminPasswordVault(row: UserViewRow): string {
  if (row.admin_password) {
    return `<div class="users-label users-password-label users-password-vault available">
      <span>Senha ADM</span>
      <div class="users-password-control vault" data-password-control>
        <input class="users-input" type="password" value="${e(row.admin_password)}" readonly data-password-input>
        <button class="users-mini-action" type="button" data-password-toggle>Mostrar</button>
        <button class="users-mini-action" type="button" data-password-copy>Copiar</button>
      </div>
      <small class="users-field-help" data-password-status>Senha definida pelo ADM em ${e(brDateTime(row.admin_password_updated_at))}. Login ainda valida pelo hash.</small>
    </div>`;
  }
  const text = row.admin_password_unavailable
    ? 'Senha salva, mas a chave do cofre mudou. Redefina a senha para voltar a exibir.'
    : 'Senha antiga importada nao da para recuperar. Defina uma nova senha e salve; depois ela aparece aqui para o ADM.';
  return `<div class="users-password-vault empty">
    <span>Senha ADM</span>
    <p>${e(text)}</p>
  </div>`;
}

function renderUserRow(req: Request, row: UserViewRow, xpEmployees: XpEmployeeRow[], whatsappLinks: WhatsappLinkRow[]): string {
  const permissions = permissionsForView(row);
  const enabledModules = MODULES.filter((module) => permissions[module.key]).map((module) => module.label);
  const userId = Number(row.id);
  const isAdm = normalizeUsername(row.username) === 'adm';
  const sourceLabel = userSourceLabel(row.source);
  const whatsappDefaults = whatsappModulesFromUserPermissions(permissions);
  return `<article class="users-user">
    <div class="users-user-head">
      <div class="users-name">
        <strong>${e(row.username)}</strong>
        <span><b>${e(sourceLabel)}</b> &middot; ${e(brDateTime(row.created_at))}</span>
      </div>
      <div class="users-pills">
        <span class="users-pill ${row.active ? 'ok' : 'off'}">${row.active ? 'Ativo' : 'Inativo'}</span>
        <span class="users-pill">${e(row.role || 'user')}</span>
        <span class="users-pill data">Postgres</span>
        ${row.xp_employee_name ? `<span class="users-pill ok">XP: ${e(row.xp_employee_name)}</span>` : '<span class="users-pill off">Sem XP</span>'}
        <span class="users-pill ${whatsappLinks.length ? 'ok' : 'off'}">WhatsApp: ${e(whatsappLinks.length)}</span>
      </div>
      <div class="users-meta"><span>${e(enabledModules.length)} m&oacute;dulos</span></div>
    </div>
    <details>
      <summary>Editar</summary>
      <form method="post" action="${BASE_PATH}/" class="users-user-form">
        ${csrfField(req)}
        <input type="hidden" name="action" value="update_user">
        <input type="hidden" name="user_id" value="${e(userId)}">
        <div class="users-form-grid">
          <label class="users-label"><span>Perfil</span><select class="users-select" name="role"${isAdm ? ' disabled' : ''}>${renderRoleOptions(row.role)}</select></label>
          <div class="users-label users-password-label">
            <span>Senha nova</span>
            <div class="users-password-control" data-password-control>
              <input class="users-input" type="password" name="password" minlength="6" autocomplete="new-password" placeholder="Manter atual" data-password-input>
              <button class="users-mini-action" type="button" data-password-generate>Gerar</button>
              <button class="users-mini-action" type="button" data-password-toggle>Mostrar</button>
              <button class="users-mini-action" type="button" data-password-copy>Copiar</button>
            </div>
            <small class="users-field-help" data-password-status>Senha atual protegida por hash. Para saber a senha, defina uma nova aqui.</small>
          </div>
          <label class="users-label"><span>XP</span><select class="users-select" name="xp_employee_id">${renderXpOptions(xpEmployees, row.xp_employee_id)}</select></label>
        </div>
        ${renderAdminPasswordVault(row)}
        ${isAdm ? `<input type="hidden" name="role" value="${e(row.role)}">` : ''}
        <label class="users-check"><input type="checkbox" name="active" value="1"${row.active ? ' checked' : ''}${isAdm ? ' disabled' : ''}>Ativo</label>
        ${isAdm ? '<input type="hidden" name="active" value="1">' : ''}
        <fieldset class="users-fieldset"><legend>M&oacute;dulos</legend>${renderModuleChecks('modules', permissions)}</fieldset>
        <div class="users-actions">
          <button class="users-button" type="submit">Salvar</button>
        </div>
      </form>
      <form method="post" action="${BASE_PATH}/" class="users-delete-form">
        ${csrfField(req)}
        <input type="hidden" name="action" value="deactivate_user">
        <input type="hidden" name="user_id" value="${e(userId)}">
        <button class="users-button danger" type="submit"${isAdm ? ' disabled' : ''}>Excluir</button>
      </form>
      <div class="users-integrations">
        <section class="users-subsection users-task-subsection">
          <div class="users-subsection-head">
            <div>
              <h3>Tarefa privada</h3>
              <p>Cria uma tarefa no mesmo modelo do m&oacute;dulo Tarefas, vis&iacute;vel somente para este login.</p>
            </div>
            <a class="users-mini-link" href="/tarefa/">Abrir Tarefas</a>
          </div>
          <form method="post" action="${BASE_PATH}/" class="users-inline-form users-task-form">
            ${csrfField(req)}
            <input type="hidden" name="action" value="delegate_task">
            <input type="hidden" name="user_id" value="${e(userId)}">
            <div class="users-task-create-head">
              <span class="users-task-kicker">Nova tarefa</span>
              <select class="users-select" name="prioridade" aria-label="Prioridade">
                <option value="alta">Alta</option>
                <option value="normal" selected>Normal</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <label class="users-label"><span>Titulo</span><input class="users-input" type="text" name="titulo" maxlength="180" placeholder="Ex.: Conferir pendencia do caixa" required></label>
            <label class="users-label"><span>Descricao</span><textarea class="users-input users-textarea" name="descricao" rows="4" placeholder="Detalhe curto para ninguem precisar adivinhar."></textarea></label>
            <div class="users-task-meta">
              <span>Destino: ${e(row.username)}</span>
              <span>Privada no m&oacute;dulo Tarefas</span>
            </div>
            <button class="users-button" type="submit">Criar tarefa privada</button>
          </form>
        </section>
        <section class="users-subsection">
          <h3>WhatsApp do funcionario</h3>
          <p>Vincula numeros a este usuario para o Miauby poder mandar aviso individual. O numero completo fica no bridge WhatsApp, nao no core.</p>
          ${renderWhatsappLinks(req, whatsappLinks)}
          <form method="post" action="${BASE_PATH}/" class="users-inline-form users-whatsapp-form">
            ${csrfField(req)}
            <input type="hidden" name="action" value="link_whatsapp">
            <input type="hidden" name="user_id" value="${e(userId)}">
            <div class="users-form-grid two">
              <label class="users-label"><span>Numero</span><input class="users-input" type="tel" name="phone" inputmode="tel" autocomplete="off" placeholder="44 99999-9999" required></label>
              <label class="users-label"><span>Nome no Miauby</span><input class="users-input" type="text" name="display_name" maxlength="120" placeholder="${e(row.username)}"></label>
            </div>
            <fieldset class="users-fieldset"><legend>Cards no WhatsApp</legend>${renderWhatsappModuleChecks(whatsappDefaults)}</fieldset>
            <button class="users-button secondary" type="submit">Colocar na allowlist</button>
          </form>
        </section>
      </div>
    </details>
  </article>`;
}

function renderWhatsappLinks(req: Request, links: WhatsappLinkRow[]): string {
  if (!links.length) {
    return '<p class="users-empty compact">Nenhum numero vinculado ainda.</p>';
  }
  return `<div class="users-whatsapp-links">${links.map((link) => `
    <div class="users-whatsapp-link">
      <div>
        <strong>${e(link.display_name || 'Sem nome')}</strong>
        <span>${e(link.phone_mask || '****')} &middot; ${e(link.status === 'allowed' ? 'Autorizado' : 'Bloqueado')}</span>
        <small>${e(whatsappModuleLabels(safeStringArray(link.module_keys)))}</small>
      </div>
      <form method="post" action="${BASE_PATH}/">
        ${csrfField(req)}
        <input type="hidden" name="action" value="unlink_whatsapp">
        <input type="hidden" name="link_id" value="${e(link.id)}">
        <button class="users-mini-danger" type="submit">Remover</button>
      </form>
    </div>`).join('')}</div>`;
}

function renderAudit(audit: AuditRow[]): string {
  if (!audit.length) {
    return '<p class="users-empty">Sem historico ainda.</p>';
  }
  return `<div class="users-audit-list">${audit.map((row) => `<div class="users-audit-item">
    <strong>${e(row.summary)}</strong>
    <span>${e(row.actor_username || 'sistema')} &middot; ${e(row.target_username || '-')} &middot; ${e(brDateTime(row.created_at))}</span>
  </div>`).join('')}</div>`;
}

async function renderDashboardPage(req: Request, res: Response): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  const [users, xpEmployees, whatsappLinks, audit, stats] = await Promise.all([
    listUsers(),
    listXpEmployees(),
    listWhatsappLinks(),
    recentAudit(),
    dashboardStats(),
  ]);
  res.type('html').send(renderDashboard(req, user, users, xpEmployees, whatsappLinks, audit, stats));
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use(BASE_PATH, express.static('public', { index: false, dotfiles: 'ignore' }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  await corePgPool.query('SELECT 1');
  const xpStartedAt = Date.now();
  let xpReachable = false;
  try {
    await xpPgPool.query('SELECT 1');
    xpReachable = true;
  } catch {
    xpReachable = false;
  }
  const stats = await dashboardStats();
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: env.CORE_POSTGRES_DB || env.POSTGRES_DB || 'wimifarma_core',
      tables: ['core_users', 'core_user_module_permissions', 'core_user_xp_links', 'core_user_admin_passwords', 'core_user_whatsapp_links', 'core_user_audit_events'],
    },
    xp: {
      reachable: xpReachable,
      latency_ms: Date.now() - xpStartedAt,
    },
    stats,
  });
}));

app.get(`${BASE_PATH}/api/me/xp-card`, asyncRoute(async (req, res) => {
  let user = await currentSessionUser(req.session.user);
  if (!user) {
    user = await userByHomeSso(req);
    if (user) await regenerateWithUser(req, user);
  }
  if (!user) {
    res.status(401).json({ ok: false, authenticated: false, xp: null });
    return;
  }

  const xp = await linkedXpProfile(user.id);
  res.json({
    ok: true,
    authenticated: true,
    source: SERVICE_NAME,
    user: { id: user.id, username: user.username },
    xp,
  });
}));

app.get(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  let user = await currentUser(req.session.user);
  if (!user) {
    user = await userByHomeSso(req);
    if (user) await regenerateWithUser(req, user);
  }
  if (user) {
    res.redirect(`${BASE_PATH}/`);
    return;
  }
  res.type('html').send(renderLogin(req));
}));

app.post(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  if (!csrfMatches(req)) {
    res.status(403).type('html').send(renderLogin(req, 'Sessao expirada. Tente novamente.'));
    return;
  }
  const username = cleanText(req.body.username, 120);
  const password = String(req.body.password || '');
  const waitSeconds = loginWaitSeconds(req);
  if (waitSeconds > 0) {
    res.status(429).type('html').send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`));
    return;
  }
  const user = await authenticateCore(username, password);
  if (!user) {
    registerLoginFailure(req);
    void logUserAudit(null, null, 'usuarios_login_falha', `Tentativa de login Usuarios falhou para ${username}.`, {});
    res.status(401).type('html').send(renderLogin(req, 'Usuario ou senha incorretos.'));
    return;
  }
  const returnTo = loginRedirectTarget(req);
  clearLoginRateLimit(req);
  req.session.regenerate((error) => {
    if (error) {
      res.status(500).type('html').send(renderLogin(req, 'Nao consegui renovar a sessao.'));
      return;
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logUserAudit(user.id, user.id, 'usuarios_login', 'Login Usuarios realizado.', {});
    res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get([`${BASE_PATH}/`, `${BASE_PATH}/index.php`, BASE_PATH], asyncRoute(async (req, res) => {
  await renderDashboardPage(req, res);
}));

app.post([`${BASE_PATH}/`, `${BASE_PATH}/index.php`, BASE_PATH], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    res.redirect(`${BASE_PATH}/`);
    return;
  }
  try {
    const action = String(req.body.action || '');
    if (action === 'create_user') {
      await createUser(req, user);
      setFlash(req, 'success', 'Usuario criado.');
    } else if (action === 'update_user') {
      await updateUser(req, user);
      setFlash(req, 'success', 'Usuario atualizado.');
    } else if (action === 'deactivate_user') {
      await deactivateUser(req, user);
      setFlash(req, 'success', 'Usuario excluido.');
    } else if (action === 'delegate_task') {
      await delegatePrivateTask(req, user);
      setFlash(req, 'success', 'Tarefa privada criada para o usuario.');
    } else if (action === 'link_whatsapp') {
      await linkWhatsappNumber(req, user);
      setFlash(req, 'success', 'Numero vinculado ao usuario e colocado na allowlist.');
    } else if (action === 'unlink_whatsapp') {
      await unlinkWhatsappNumber(req, user);
      setFlash(req, 'success', 'Numero removido da allowlist do usuario.');
    } else {
      setFlash(req, 'error', 'Acao invalida.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar o usuario.');
  }
  res.redirect(`${BASE_PATH}/`);
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[usuarios] request failed', error);
  res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><title>Usuarios</title><p>Usuarios indisponivel.</p>');
});

async function withRetry(name: string, fn: () => Promise<unknown>, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[usuarios] waiting for ${name} (${index}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function start(): Promise<void> {
  await withRetry('core postgres', () => corePgPool.query('SELECT 1'));
  await ensureCoreSchema();
  app.listen(PORT, () => {
    console.log(`[usuarios] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[usuarios] failed to start', error);
  process.exit(1);
});
