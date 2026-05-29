import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import fs from 'fs/promises';
import { imageSize } from 'image-size';
import multer from 'multer';
import mysql from 'mysql2/promise';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AuthProvider = 'core' | 'mysql';

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
  username: string;
  password_hash: string;
  role: string;
  active: boolean;
};

type MysqlUserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  active: number;
};

type EmployeeRow = {
  id: string;
  legacy_mysql_id: string | null;
  name: string;
  photo_path: string | null;
  status: 'ativo' | 'inativo';
  system_key: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  total_amount_cents?: string | number | null;
  total_xp?: string | number | null;
  month_amount_cents?: string | number | null;
  month_xp?: string | number | null;
};

type EmployeeView = {
  id: number;
  legacy_mysql_id: number | null;
  name: string;
  photo_path: string;
  is_admin: boolean;
  rank: number;
  total_amount_cents: number;
  total_xp: number;
  month_amount_cents: number;
  month_xp: number;
  progress: Progress;
};

type SaleRow = {
  id: string;
  legacy_mysql_id: string | null;
  employee_id: string;
  sale_date: string;
  amount_cents: string | number;
  xp_points: string | number;
  note: string | null;
  created_by: number | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  employee_name?: string;
};

type Progress = {
  level: number;
  next_level: number;
  level_start_xp: number;
  next_level_total_xp: number;
  progress_xp: number;
  required_xp: number;
  percent: number;
};

type MonthContext = {
  month: string;
  start: string;
  end: string;
  label: string;
  prev: string;
  next: string;
};

type LegacyEmployeeRow = {
  id: number;
  name: string;
  photo_path: string | null;
  status: string;
  system_key: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type LegacySaleRow = {
  id: number;
  employee_id: number;
  sale_date: string;
  amount_cents: number;
  xp_points: number;
  note: string | null;
  created_by: number | null;
  created_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
};

type LegacySettingRow = {
  setting_key: string;
  setting_value: string | null;
  updated_by: number | null;
  updated_at: string | null;
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
const SERVICE_NAME = 'xp';
const SERVICE_VERSION = '1.0.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/xp');
const PORT = Number.parseInt(env.PORT || '3600', 10);
const SESSION_SECRET = env.XP_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_PROVIDER = normalizeAuthProvider(env.XP_AUTH_PROVIDER || 'core');
const LEGACY_MYSQL_IMPORT_ENABLED = normalizeBoolean(env.XP_LEGACY_MYSQL_IMPORT_ENABLED ?? 'true');
const LEGACY_MYSQL_MIRROR_ENABLED = normalizeBoolean(env.XP_LEGACY_MYSQL_MIRROR_ENABLED ?? 'true');
const LEGACY_MYSQL_LOGS_ENABLED = normalizeBoolean(env.XP_LEGACY_MYSQL_LOGS_ENABLED ?? 'true');
const CORE_AUTH_REQUIRED = AUTH_PROVIDER === 'core';
const LEGACY_MYSQL_REQUIRED =
  AUTH_PROVIDER === 'mysql' || LEGACY_MYSQL_IMPORT_ENABLED || LEGACY_MYSQL_MIRROR_ENABLED || LEGACY_MYSQL_LOGS_ENABLED;
const XP_POINTS_PER_THOUSAND_REAIS = 2500;
const XP_FIRST_LEVEL_REQUIREMENT = 30000;
const XP_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const XP_TRACK_BASE_LEVELS = 20;
const XP_TRACK_DYNAMIC_LEVELS = 20;
const XP_ADMIN_SYSTEM_KEY = 'adm';
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const uploadRoot = env.XP_UPLOAD_ROOT || path.resolve(publicDir, 'uploads');

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_xp',
  user: env.POSTGRES_USER || 'wimifarma_xp',
  password: env.POSTGRES_PASSWORD || '',
  max: 10,
});

const corePgPool = CORE_AUTH_REQUIRED
  ? new Pool({
      host: env.CORE_POSTGRES_HOST || '127.0.0.1',
      port: Number(env.CORE_POSTGRES_PORT || 5432),
      database: env.CORE_POSTGRES_DB || 'wimifarma_core',
      user: env.CORE_POSTGRES_USER || 'wimifarma_core',
      password: env.CORE_POSTGRES_PASSWORD || '',
      max: 4,
    })
  : null;

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

const migrationState = {
  employeesImported: 0,
  salesImported: 0,
  settingsImported: 0,
  lastRunAt: null as string | null,
  lastError: null as string | null,
};

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFXP',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'xp_sessions',
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: XP_UPLOAD_MAX_BYTES },
});

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean === '' ? '/xp' : clean;
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

function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
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

function numeric(value: unknown): number {
  return Number(value || 0) || 0;
}

function userPublic(row: CoreUserRow | MysqlUserRow): User {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role || 'user'),
  };
}

function managerCanManage(user: User | null | undefined): boolean {
  if (!user) return false;
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  return username === 'adm' || role === 'admin' || role === 'gerente';
}

function ensureManager(user: User): void {
  if (!managerCanManage(user)) {
    throw new Error('Seu usuario nao tem permissao para alimentar o XP.');
  }
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

function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://xp.local');
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

function monthContext(value: unknown): MonthContext {
  const input = String(value || '').trim();
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const match = input.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
  }
  if (month < 1 || month > 12 || year < 2020 || year > 2100) {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: `${String(month).padStart(2, '0')}/${year}`,
    prev: `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`,
    next: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

function todayDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(new Date());
}

function brDate(value: unknown): string {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function formatNumber(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numeric(value));
}

function formatPercent(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0)) + '%';
}

function centsToMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function moneyToCents(value: unknown): number {
  if (typeof value === 'number') {
    return Math.max(0, Math.round(value * 100));
  }
  let clean = String(value || '').trim().replace(/R\$/gi, '').replace(/\s+/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const number = Number.parseFloat(clean.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function salesToPoints(amountCents: number): number {
  return Math.max(0, Math.round((amountCents * XP_POINTS_PER_THOUSAND_REAIS) / 100000));
}

function requiredForNextLevel(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  const extra = Math.pow(Math.max(0, normalized - 1), 1.55) * 14000;
  return Math.max(XP_FIRST_LEVEL_REQUIREMENT, Math.round(XP_FIRST_LEVEL_REQUIREMENT + extra));
}

function progressFromTotal(totalXp: number): Progress {
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
  const percent = required > 0 ? Math.min(100, Math.round((remaining / required) * 10000) / 100) : 0;
  return {
    level,
    next_level: level + 1,
    level_start_xp: levelStart,
    next_level_total_xp: levelStart + required,
    progress_xp: remaining,
    required_xp: required,
    percent,
  };
}

function employeeInitials(name: string): string {
  const parts = cleanText(name, 180).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'XP';
  const first = parts[0]?.slice(0, 1) || 'X';
  const last = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : '';
  return `${first}${last}`.toUpperCase();
}

function photoUrl(photoPath: unknown): string {
  const value = String(photoPath || '');
  return /^\/xp\/uploads\/(funcionarios|adm)\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(value) ? value : '';
}

function levelAsset(level: number): string {
  if (level % 10 === 0) return `${BASE_PATH}/assets/nivel-10-castelo.svg?v=20260522b`;
  if (level % 5 === 0) return `${BASE_PATH}/assets/nivel-5-estrela.svg?v=20260522b`;
  return `${BASE_PATH}/assets/bloco-xp.svg?v=20260522b`;
}

function levelKind(level: number): string {
  if (level % 10 === 0) return 'castle';
  if (level % 5 === 0) return 'star';
  return 'block';
}

function levelTrackBounds(employees: EmployeeView[]): [number, number] {
  const maxLevel = employees.reduce((max, employee) => Math.max(max, employee.progress.level), 1);
  if (maxLevel <= XP_TRACK_BASE_LEVELS) {
    return [1, XP_TRACK_BASE_LEVELS];
  }
  const start = Math.max(1, maxLevel - 8);
  return [start, start + XP_TRACK_DYNAMIC_LEVELS - 1];
}

function progressFillClass(progress: Progress): string {
  const percent = Math.max(0, Math.min(100, progress.percent));
  return `xp-fill-p${Math.round(percent)}`;
}

function playerDataAttrs(player: EmployeeView): string {
  const progress = player.progress;
  const attrs: Record<string, string> = {
    'data-xp-player-name': player.name || 'Jogador',
    'data-xp-player-role': player.is_admin ? 'ADM' : 'Atendente XP',
    'data-xp-player-level': `Nivel ${progress.level} -> ${progress.next_level}`,
    'data-xp-player-percent': formatPercent(progress.percent),
    'data-xp-player-percent-value': progress.percent.toFixed(2),
    'data-xp-player-progress': formatNumber(progress.progress_xp),
    'data-xp-player-required': formatNumber(progress.required_xp),
    'data-xp-player-month': formatNumber(player.month_xp),
    'data-xp-player-total': formatNumber(player.total_xp),
  };
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${e(value)}"`)
    .join('');
}

function validStatus(value: unknown): 'ativo' | 'inativo' {
  return String(value || '').trim() === 'inativo' ? 'inativo' : 'ativo';
}

function pgDateFromMysql(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === '0000-00-00 00:00:00') return null;
  return text.includes('T') ? text : `${text.replace(' ', 'T')}-03:00`;
}

function validateSaleDate(value: unknown): string {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Informe uma data valida para a venda.');
  }
  const date = new Date(`${text}T00:00:00-03:00`);
  const min = new Date('2020-01-01T00:00:00-03:00');
  const max = new Date(Date.now() + 36 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime()) || date < min || date > max) {
    throw new Error('A data da venda esta fora do periodo permitido.');
  }
  return text;
}

async function authenticate(username: string, password: string): Promise<User | null> {
  return AUTH_PROVIDER === 'mysql' ? authenticateMysql(username, password) : authenticateCore(username, password);
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
  return ok ? userPublic(user) : null;
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
  if (AUTH_PROVIDER === 'mysql') {
    const [rows] = await requireMysqlPool('current user').query<mysql.RowDataPacket[]>(
      'SELECT id, username, role, active FROM wf_users WHERE id = ? AND active = 1 LIMIT 1',
      [user.id],
    );
    const row = rows[0] as MysqlUserRow | undefined;
    return row ? userPublic(row) : null;
  }
  const result = await requireCorePgPool('current user').query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
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
    req.session.returnTo = req.originalUrl;
    res.redirect(`${BASE_PATH}/login.php`);
    return null;
  }
  req.session.user = user;
  return user;
}

async function logCoreAudit(userId: number | null, action: string, entityType: string, entityId: string | null, detail: string): Promise<void> {
  if (!corePgPool) return;
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, entityId, cleanText(detail, 255), JSON.stringify({ service: SERVICE_NAME })],
    );
  } catch (error) {
    console.warn('[xp] failed to write core audit log', error);
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
    console.warn('[xp] failed to write legacy log', error);
  }
}

async function auditPg(action: string, entityType: string, entityId: string | null, summary: string, actorUserId: number | null): Promise<void> {
  await pgPool.query(
    'INSERT INTO xp_audit_events (actor_user_id, action, entity_type, entity_id, summary) VALUES ($1, $2, $3, $4, $5)',
    [actorUserId, action, entityType, entityId, cleanText(summary, 255)],
  );
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS xp_employees (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      name VARCHAR(180) NOT NULL,
      photo_path VARCHAR(255),
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      system_key VARCHAR(32) UNIQUE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_employees_status_name_idx ON xp_employees (status, name)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_employees_created_at_idx ON xp_employees (created_at)');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS xp_sales (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      employee_id BIGINT NOT NULL REFERENCES xp_employees(id) ON UPDATE CASCADE,
      sale_date DATE NOT NULL,
      amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
      xp_points BIGINT NOT NULL CHECK (xp_points >= 0),
      note VARCHAR(255),
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      deleted_by INTEGER
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_sales_employee_date_idx ON xp_sales (employee_id, sale_date)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_sales_date_idx ON xp_sales (sale_date)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_sales_active_date_idx ON xp_sales (deleted_at, sale_date)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_sales_active_employee_date_idx ON xp_sales (deleted_at, employee_id, sale_date)');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS xp_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS xp_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80),
      entity_id TEXT,
      summary VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS xp_audit_events_created_idx ON xp_audit_events (created_at DESC)');
  await fs.mkdir(path.join(uploadRoot, 'funcionarios'), { recursive: true });
  await fs.mkdir(path.join(uploadRoot, 'adm'), { recursive: true });
  if (LEGACY_MYSQL_IMPORT_ENABLED || LEGACY_MYSQL_MIRROR_ENABLED) {
    await ensureLegacyMysqlSchema();
  }
  if (LEGACY_MYSQL_IMPORT_ENABLED) {
    await migrateLegacyData();
  }
}

async function ensureLegacyMysqlSchema(): Promise<void> {
  const db = requireMysqlPool('legacy schema');
  await db.query(`
    CREATE TABLE IF NOT EXISTS wf_xp_employees (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(180) NOT NULL,
      photo_path VARCHAR(255) NULL,
      status ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
      system_key VARCHAR(32) NULL,
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY ux_xp_employees_system_key (system_key),
      KEY idx_xp_employees_status_name (status, name),
      KEY idx_xp_employees_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wf_xp_sales (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id BIGINT UNSIGNED NOT NULL,
      sale_date DATE NOT NULL,
      amount_cents BIGINT UNSIGNED NOT NULL,
      xp_points BIGINT UNSIGNED NOT NULL,
      note VARCHAR(255) NULL,
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      deleted_by INT UNSIGNED NULL,
      PRIMARY KEY (id),
      KEY idx_xp_sales_employee_date (employee_id, sale_date),
      KEY idx_xp_sales_date (sale_date),
      KEY idx_xp_sales_active (deleted_at, sale_date),
      KEY idx_xp_sales_active_employee_date (deleted_at, employee_id, sale_date),
      CONSTRAINT fk_xp_sales_employee
        FOREIGN KEY (employee_id) REFERENCES wf_xp_employees(id)
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wf_xp_settings (
      setting_key VARCHAR(80) NOT NULL,
      setting_value TEXT NULL,
      updated_by INT UNSIGNED NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function migrateLegacyData(): Promise<void> {
  if (!LEGACY_MYSQL_IMPORT_ENABLED) return;
  const startedAt = new Date().toISOString();
  try {
    const mysqlDb = requireMysqlPool('legacy import');
    const [employeeRows] = await mysqlDb.query<mysql.RowDataPacket[]>(
      'SELECT id, name, photo_path, status, system_key, created_by, created_at, updated_at, deleted_at FROM wf_xp_employees ORDER BY id ASC',
    );
    const [saleRows] = await mysqlDb.query<mysql.RowDataPacket[]>(
      'SELECT id, employee_id, sale_date, amount_cents, xp_points, note, created_by, created_at, deleted_at, deleted_by FROM wf_xp_sales ORDER BY id ASC',
    );
    const [settingRows] = await mysqlDb.query<mysql.RowDataPacket[]>(
      'SELECT setting_key, setting_value, updated_by, updated_at FROM wf_xp_settings ORDER BY setting_key ASC',
    );
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      let employeesImported = 0;
      for (const row of employeeRows as LegacyEmployeeRow[]) {
        await client.query(
          `INSERT INTO xp_employees (
             id, legacy_mysql_id, name, photo_path, status, system_key,
             created_by, created_at, updated_at, deleted_at
           ) VALUES (
             $1, $1, $2, $3, $4, $5,
             $6, COALESCE($7::timestamptz, NOW()), $8::timestamptz, $9::timestamptz
           )
           ON CONFLICT (legacy_mysql_id) DO UPDATE SET
             name = EXCLUDED.name,
             photo_path = EXCLUDED.photo_path,
             status = EXCLUDED.status,
             system_key = EXCLUDED.system_key,
             created_by = EXCLUDED.created_by,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at`,
          [
            Number(row.id),
            cleanText(row.name, 180) || 'Funcionario sem nome',
            photoUrl(row.photo_path) || null,
            validStatus(row.status),
            row.system_key || null,
            row.created_by ? Number(row.created_by) : null,
            pgDateFromMysql(row.created_at),
            pgDateFromMysql(row.updated_at),
            pgDateFromMysql(row.deleted_at),
          ],
        );
        employeesImported += 1;
      }
      let salesImported = 0;
      for (const row of saleRows as LegacySaleRow[]) {
        await client.query(
          `INSERT INTO xp_sales (
             id, legacy_mysql_id, employee_id, sale_date, amount_cents, xp_points,
             note, created_by, created_at, deleted_at, deleted_by
           ) VALUES (
             $1, $1, $2, $3::date, $4, $5,
             $6, $7, COALESCE($8::timestamptz, NOW()), $9::timestamptz, $10
           )
           ON CONFLICT (legacy_mysql_id) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             sale_date = EXCLUDED.sale_date,
             amount_cents = EXCLUDED.amount_cents,
             xp_points = EXCLUDED.xp_points,
             note = EXCLUDED.note,
             created_by = EXCLUDED.created_by,
             created_at = EXCLUDED.created_at,
             deleted_at = EXCLUDED.deleted_at,
             deleted_by = EXCLUDED.deleted_by`,
          [
            Number(row.id),
            Number(row.employee_id),
            row.sale_date,
            Number(row.amount_cents || 0),
            Number(row.xp_points || 0),
            row.note ? cleanText(row.note, 255) : null,
            row.created_by ? Number(row.created_by) : null,
            pgDateFromMysql(row.created_at),
            pgDateFromMysql(row.deleted_at),
            row.deleted_by ? Number(row.deleted_by) : null,
          ],
        );
        salesImported += 1;
      }
      let settingsImported = 0;
      for (const row of settingRows as LegacySettingRow[]) {
        await client.query(
          `INSERT INTO xp_settings (setting_key, setting_value, updated_by, updated_at)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
           ON CONFLICT (setting_key) DO UPDATE SET
             setting_value = EXCLUDED.setting_value,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at`,
          [cleanText(row.setting_key, 80), row.setting_value ?? null, row.updated_by ? Number(row.updated_by) : null, pgDateFromMysql(row.updated_at)],
        );
        settingsImported += 1;
      }
      await resetSequences(client);
      await client.query('COMMIT');
      migrationState.employeesImported = employeesImported;
      migrationState.salesImported = salesImported;
      migrationState.settingsImported = settingsImported;
      migrationState.lastRunAt = startedAt;
      migrationState.lastError = null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    migrationState.lastRunAt = startedAt;
    migrationState.lastError = error instanceof Error ? error.message : String(error);
    console.warn('[xp] legacy migration failed', error);
  }
}

async function resetSequences(client: pg.PoolClient | pg.Pool = pgPool): Promise<void> {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('xp_employees', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 1) FROM xp_employees), 1),
      true
    )
  `);
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('xp_sales', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 1) FROM xp_sales), 1),
      true
    )
  `);
}

async function settingGet(key: string, fallback = ''): Promise<string> {
  const result = await pgPool.query<{ setting_value: string | null }>('SELECT setting_value FROM xp_settings WHERE setting_key = $1 LIMIT 1', [key]);
  return result.rows[0]?.setting_value || fallback;
}

async function settingSet(key: string, value: string | null, userId: number): Promise<void> {
  await pgPool.query(
    `INSERT INTO xp_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [cleanText(key, 80), value, userId],
  );
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await requireMysqlPool('settings mirror').query(
      `INSERT INTO wf_xp_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [cleanText(key, 80), value, userId],
    );
  }
}

async function adminProfile(): Promise<{ photo_path: string }> {
  return { photo_path: photoUrl(await settingGet('adm_photo_path', '')) };
}

async function syncAdminEmployee(photoPath: string | null, userId: number | null): Promise<number> {
  const safePhoto = photoUrl(photoPath) || null;
  const existing = await pgPool.query<EmployeeRow>('SELECT * FROM xp_employees WHERE system_key = $1 LIMIT 1', [XP_ADMIN_SYSTEM_KEY]);
  let id = Number(existing.rows[0]?.id || 0);
  let adminName = cleanText(existing.rows[0]?.name, 180) || 'ADM';
  let adminPhoto = safePhoto || photoUrl(existing.rows[0]?.photo_path) || null;
  if (!id) {
    const namedAdm = await pgPool.query<EmployeeRow>("SELECT * FROM xp_employees WHERE UPPER(name) = 'ADM' ORDER BY id ASC LIMIT 1");
    id = Number(namedAdm.rows[0]?.id || 0);
    adminName = cleanText(namedAdm.rows[0]?.name, 180) || adminName;
    adminPhoto = safePhoto || photoUrl(namedAdm.rows[0]?.photo_path) || adminPhoto;
  }
  if (id > 0) {
    await pgPool.query(
      `UPDATE xp_employees
          SET name = $4,
              photo_path = $1,
              status = 'ativo',
              system_key = $2,
              deleted_at = NULL,
              updated_at = NOW()
        WHERE id = $3`,
      [adminPhoto, XP_ADMIN_SYSTEM_KEY, id, adminName],
    );
  } else {
    const inserted = await pgPool.query<{ id: string }>(
      "INSERT INTO xp_employees (name, photo_path, status, system_key, created_by) VALUES ($1, $2, 'ativo', $3, $4) RETURNING id",
      [adminName, adminPhoto, XP_ADMIN_SYSTEM_KEY, userId],
    );
    id = Number(inserted.rows[0].id);
  }
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await mirrorAdminEmployee(id, adminPhoto, userId, adminName);
  }
  return id;
}

async function mirrorAdminEmployee(pgId: number, safePhoto: string | null, userId: number | null, nameValue?: string): Promise<void> {
  try {
    const db = requireMysqlPool('admin mirror');
    const adminName = cleanText(nameValue, 180) || 'ADM';
    const [rows] = await db.query<mysql.RowDataPacket[]>('SELECT id FROM wf_xp_employees WHERE system_key = ? LIMIT 1', [XP_ADMIN_SYSTEM_KEY]);
    let legacyId = Number(rows[0]?.id || 0);
    if (!legacyId) {
      const [named] = await db.query<mysql.RowDataPacket[]>("SELECT id FROM wf_xp_employees WHERE UPPER(name) = 'ADM' ORDER BY id ASC LIMIT 1");
      legacyId = Number(named[0]?.id || 0);
    }
    if (legacyId) {
      await db.query(
        "UPDATE wf_xp_employees SET name = ?, photo_path = ?, status = 'ativo', system_key = ?, deleted_at = NULL WHERE id = ?",
        [adminName, safePhoto, XP_ADMIN_SYSTEM_KEY, legacyId],
      );
    } else {
      const [insert] = await db.query<mysql.ResultSetHeader>(
        "INSERT INTO wf_xp_employees (name, photo_path, status, system_key, created_by) VALUES (?, ?, 'ativo', ?, ?)",
        [adminName, safePhoto, XP_ADMIN_SYSTEM_KEY, userId],
      );
      legacyId = Number(insert.insertId);
    }
    if (legacyId) {
      await pgPool.query('UPDATE xp_employees SET legacy_mysql_id = $1 WHERE id = $2 AND legacy_mysql_id IS NULL', [legacyId, pgId]);
    }
  } catch (error) {
    console.warn('[xp] failed to mirror ADM employee', error);
  }
}

async function listEmployees(context: MonthContext): Promise<EmployeeView[]> {
  const result = await pgPool.query<EmployeeRow>(
    `SELECT
        e.*,
        COALESCE(t.total_amount_cents, 0) AS total_amount_cents,
        COALESCE(t.total_xp, 0) AS total_xp,
        COALESCE(m.month_amount_cents, 0) AS month_amount_cents,
        COALESCE(m.month_xp, 0) AS month_xp
      FROM xp_employees e
      LEFT JOIN (
        SELECT employee_id, SUM(amount_cents) AS total_amount_cents, SUM(xp_points) AS total_xp
        FROM xp_sales
        WHERE deleted_at IS NULL
        GROUP BY employee_id
      ) t ON t.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(amount_cents) AS month_amount_cents, SUM(xp_points) AS month_xp
        FROM xp_sales
        WHERE deleted_at IS NULL AND sale_date BETWEEN $1::date AND $2::date
        GROUP BY employee_id
      ) m ON m.employee_id = e.id
      WHERE e.status = 'ativo' AND e.deleted_at IS NULL
      ORDER BY total_xp DESC, (e.system_key = $3) ASC, e.name ASC`,
    [context.start, context.end, XP_ADMIN_SYSTEM_KEY],
  );
  return result.rows.map((row, index) => {
    const isAdmin = row.system_key === XP_ADMIN_SYSTEM_KEY;
    const totalXp = numeric(row.total_xp);
    return {
      id: Number(row.id),
      legacy_mysql_id: row.legacy_mysql_id ? Number(row.legacy_mysql_id) : null,
      name: cleanText(row.name, 180) || (isAdmin ? 'ADM' : 'Funcionario'),
      photo_path: photoUrl(row.photo_path),
      is_admin: isAdmin,
      rank: index + 1,
      total_amount_cents: numeric(row.total_amount_cents),
      total_xp: totalXp,
      month_amount_cents: numeric(row.month_amount_cents),
      month_xp: numeric(row.month_xp),
      progress: progressFromTotal(totalXp),
    };
  });
}

async function findEmployee(id: number): Promise<EmployeeRow | null> {
  if (id <= 0) return null;
  const result = await pgPool.query<EmployeeRow>(
    "SELECT * FROM xp_employees WHERE id = $1 AND status = 'ativo' AND deleted_at IS NULL LIMIT 1",
    [id],
  );
  return result.rows[0] || null;
}

async function recentSales(limit = 10): Promise<SaleRow[]> {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const result = await pgPool.query<SaleRow>(
    `SELECT s.*, e.name AS employee_name
       FROM xp_sales s
       INNER JOIN xp_employees e ON e.id = s.employee_id
      WHERE s.deleted_at IS NULL
      ORDER BY s.sale_date DESC, s.created_at DESC, s.id DESC
      LIMIT $1`,
    [safeLimit],
  );
  return result.rows;
}

function summary(employees: EmployeeView[]): { employee_count: number; month_amount_cents: number; month_xp: number; total_xp: number; top_employee: EmployeeView | null } {
  return {
    employee_count: employees.length,
    month_amount_cents: employees.reduce((sum, employee) => sum + employee.month_amount_cents, 0),
    month_xp: employees.reduce((sum, employee) => sum + employee.month_xp, 0),
    total_xp: employees.reduce((sum, employee) => sum + employee.total_xp, 0),
    top_employee: employees[0] || null,
  };
}

async function uploadPhoto(file: Express.Multer.File | undefined, userId: number, folder = 'funcionarios', prefix = 'funcionario'): Promise<string | null> {
  if (!file) return null;
  if (file.size <= 0 || file.size > XP_UPLOAD_MAX_BYTES) {
    throw new Error('A foto precisa ter ate 3 MB.');
  }
  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new Error('Envie uma imagem JPG, PNG ou WEBP.');
  }
  const allowedTypes = new Set(['jpg', 'jpeg', 'png', 'webp']);
  if (!dimensions.type || !allowedTypes.has(dimensions.type)) {
    throw new Error('Envie uma imagem JPG, PNG ou WEBP.');
  }
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  if (width < 80 || height < 80) {
    throw new Error('A foto precisa ter pelo menos 80x80 px.');
  }
  if (width > 6000 || height > 6000) {
    throw new Error('A foto e grande demais. Use uma imagem menor.');
  }
  if (folder !== 'funcionarios' && folder !== 'adm') {
    throw new Error('Pasta de upload invalida.');
  }
  const extension = dimensions.type === 'jpeg' ? 'jpg' : dimensions.type;
  const safePrefix = cleanText(prefix, 40).replace(/[^a-z0-9_-]+/gi, '-') || 'foto';
  const fileName = `${safePrefix}-${Math.max(0, userId)}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const targetDir = path.join(uploadRoot, folder);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, fileName), file.buffer, { mode: 0o644 });
  return `${BASE_PATH}/uploads/${folder}/${fileName}`;
}

async function updateAdminProfile(nameValue: unknown, file: Express.Multer.File | undefined, userId: number): Promise<void> {
  const name = cleanText(nameValue, 180);
  if (!name) throw new Error('Informe o nome do ADM.');
  const uploaded = await uploadPhoto(file, userId, 'adm', 'adm');
  if (uploaded) {
    await settingSet('adm_photo_path', uploaded, userId);
  }
  const adminId = await syncAdminEmployee(uploaded || (await settingGet('adm_photo_path', '')), userId);
  const current = await findEmployee(adminId);
  const photoPath = uploaded || photoUrl(current?.photo_path) || null;
  await pgPool.query('UPDATE xp_employees SET name = $1, photo_path = $2, updated_at = NOW() WHERE id = $3', [name, photoPath, adminId]);
  await auditPg('xp_adm_perfil_atualizado', 'xp_employee', String(adminId), `Perfil ADM do XP atualizado: ${name}.`, userId);
  void logMysql(userId, 'xp_adm_perfil_atualizado', 'xp_employee', adminId, `Perfil ADM do XP atualizado: ${name}.`);
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await mirrorAdminEmployee(adminId, photoPath, userId, name);
  }
}

async function createEmployee(nameValue: unknown, file: Express.Multer.File | undefined, userId: number): Promise<number> {
  const name = cleanText(nameValue, 180);
  if (!name) throw new Error('Informe o nome do funcionario.');
  if (name.toUpperCase() === 'ADM') throw new Error('ADM ja existe como perfil reservado.');
  const photoPath = await uploadPhoto(file, userId);
  const inserted = await pgPool.query<{ id: string }>(
    'INSERT INTO xp_employees (name, photo_path, created_by) VALUES ($1, $2, $3) RETURNING id',
    [name, photoPath, userId],
  );
  const id = Number(inserted.rows[0].id);
  await auditPg('xp_funcionario_criado', 'xp_employee', String(id), `Funcionario XP criado: ${name}`, userId);
  void logMysql(userId, 'xp_funcionario_criado', 'xp_employee', id, `Funcionario XP criado: ${name}`);
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await mirrorEmployeeCreate(id);
  }
  return id;
}

async function mirrorEmployeeCreate(id: number): Promise<void> {
  try {
    const row = (await pgPool.query<EmployeeRow>('SELECT * FROM xp_employees WHERE id = $1 LIMIT 1', [id])).rows[0];
    if (!row || row.legacy_mysql_id) return;
    const [insert] = await requireMysqlPool('employee mirror create').query<mysql.ResultSetHeader>(
      'INSERT INTO wf_xp_employees (name, photo_path, created_by) VALUES (?, ?, ?)',
      [row.name, row.photo_path || null, row.created_by],
    );
    await pgPool.query('UPDATE xp_employees SET legacy_mysql_id = $1 WHERE id = $2', [Number(insert.insertId), id]);
  } catch (error) {
    console.warn('[xp] failed to mirror employee create', error);
  }
}

async function updateEmployee(id: number, nameValue: unknown, file: Express.Multer.File | undefined, userId: number): Promise<void> {
  const employee = await findEmployee(id);
  if (!employee) throw new Error('Funcionario nao encontrado.');
  const isAdmin = employee.system_key === XP_ADMIN_SYSTEM_KEY;
  const name = cleanText(nameValue, 180);
  if (!name) throw new Error('Informe o nome do funcionario.');
  const photoPath = await uploadPhoto(file, userId, isAdmin ? 'adm' : 'funcionarios', isAdmin ? 'adm' : 'funcionario');
  if (isAdmin && photoPath) {
    await settingSet('adm_photo_path', photoPath, userId);
  }
  if (photoPath) {
    await pgPool.query('UPDATE xp_employees SET name = $1, photo_path = $2, updated_at = NOW() WHERE id = $3', [name, photoPath, id]);
  } else {
    await pgPool.query('UPDATE xp_employees SET name = $1, updated_at = NOW() WHERE id = $2', [name, id]);
  }
  const action = isAdmin ? 'xp_adm_perfil_atualizado' : 'xp_funcionario_editado';
  const description = isAdmin ? `Perfil ADM do XP atualizado: ${name}.` : `Funcionario XP editado: ${name}`;
  await auditPg(action, 'xp_employee', String(id), description, userId);
  void logMysql(userId, action, 'xp_employee', id, description);
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    if (isAdmin) {
      const current = await findEmployee(id);
      await mirrorAdminEmployee(id, photoUrl(current?.photo_path) || null, userId, name);
    } else {
      await mirrorEmployeeUpdate(id);
    }
  }
}

async function mirrorEmployeeUpdate(id: number): Promise<void> {
  try {
    const row = (await pgPool.query<EmployeeRow>('SELECT * FROM xp_employees WHERE id = $1 LIMIT 1', [id])).rows[0];
    if (!row?.legacy_mysql_id) return;
    await requireMysqlPool('employee mirror update').query(
      'UPDATE wf_xp_employees SET name = ?, photo_path = ?, status = ?, deleted_at = ? WHERE id = ?',
      [row.name, row.photo_path || null, row.status, row.deleted_at, Number(row.legacy_mysql_id)],
    );
  } catch (error) {
    console.warn('[xp] failed to mirror employee update', error);
  }
}

async function deactivateEmployee(id: number, userId: number): Promise<void> {
  const employee = await findEmployee(id);
  if (!employee) throw new Error('Funcionario nao encontrado.');
  if (employee.system_key === XP_ADMIN_SYSTEM_KEY) throw new Error('O ADM e um perfil protegido e nao pode ser excluido.');
  await pgPool.query("UPDATE xp_employees SET status = 'inativo', deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'ativo' AND deleted_at IS NULL", [id]);
  await auditPg('xp_funcionario_inativado', 'xp_employee', String(id), `Funcionario XP inativado: ${employee.name}`, userId);
  void logMysql(userId, 'xp_funcionario_inativado', 'xp_employee', id, `Funcionario XP inativado: ${employee.name}`);
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await mirrorEmployeeUpdate(id);
  }
}

async function createSale(employeeId: number, saleDateValue: unknown, amountValue: unknown, noteValue: unknown, userId: number): Promise<number> {
  const employee = await findEmployee(employeeId);
  if (!employee) throw new Error('Escolha um funcionario ativo.');
  const saleDate = validateSaleDate(saleDateValue);
  const amountCents = moneyToCents(amountValue);
  if (amountCents <= 0) throw new Error('Informe um valor de venda maior que zero.');
  const xpPoints = salesToPoints(amountCents);
  const note = cleanText(noteValue, 220);
  const inserted = await pgPool.query<{ id: string }>(
    'INSERT INTO xp_sales (employee_id, sale_date, amount_cents, xp_points, note, created_by) VALUES ($1, $2::date, $3, $4, $5, $6) RETURNING id',
    [employeeId, saleDate, amountCents, xpPoints, note || null, userId],
  );
  const id = Number(inserted.rows[0].id);
  await auditPg('xp_venda_lancada', 'xp_sale', String(id), `Venda XP lancada: ${centsToMoney(amountCents)} = ${formatNumber(xpPoints)} XP.`, userId);
  void logMysql(userId, 'xp_venda_lancada', 'xp_sale', id, `Venda XP lancada: ${centsToMoney(amountCents)} = ${formatNumber(xpPoints)} XP.`);
  if (LEGACY_MYSQL_MIRROR_ENABLED) {
    await mirrorSaleCreate(id);
  }
  return id;
}

async function mirrorSaleCreate(id: number): Promise<void> {
  try {
    const row = (await pgPool.query<SaleRow>('SELECT * FROM xp_sales WHERE id = $1 LIMIT 1', [id])).rows[0];
    if (!row || row.legacy_mysql_id) return;
    const employee = (await pgPool.query<EmployeeRow>('SELECT legacy_mysql_id FROM xp_employees WHERE id = $1 LIMIT 1', [row.employee_id])).rows[0];
    if (!employee?.legacy_mysql_id) return;
    const [insert] = await requireMysqlPool('sale mirror create').query<mysql.ResultSetHeader>(
      'INSERT INTO wf_xp_sales (employee_id, sale_date, amount_cents, xp_points, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [Number(employee.legacy_mysql_id), String(row.sale_date).slice(0, 10), Number(row.amount_cents), Number(row.xp_points), row.note || null, row.created_by],
    );
    await pgPool.query('UPDATE xp_sales SET legacy_mysql_id = $1 WHERE id = $2', [Number(insert.insertId), id]);
  } catch (error) {
    console.warn('[xp] failed to mirror sale create', error);
  }
}

async function deleteSale(id: number, userId: number): Promise<void> {
  if (id <= 0) throw new Error('Lancamento invalido.');
  const updated = await pgPool.query<SaleRow>(
    'UPDATE xp_sales SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *',
    [userId, id],
  );
  const sale = updated.rows[0];
  if (!sale) throw new Error('Lancamento nao encontrado.');
  await auditPg('xp_venda_cancelada', 'xp_sale', String(id), 'Lancamento XP cancelado.', userId);
  void logMysql(userId, 'xp_venda_cancelada', 'xp_sale', id, 'Lancamento XP cancelado.');
  if (LEGACY_MYSQL_MIRROR_ENABLED && sale.legacy_mysql_id) {
    try {
      await requireMysqlPool('sale mirror delete').query('UPDATE wf_xp_sales SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL', [
        userId,
        Number(sale.legacy_mysql_id),
      ]);
    } catch (error) {
      console.warn('[xp] failed to mirror sale delete', error);
    }
  }
}

async function postgresStats(): Promise<Record<string, unknown>> {
  const result = await pgPool.query<{
    employees_total: string;
    employees_active: string;
    sales_total: string;
    sales_active: string;
    amount_cents_active: string | null;
    xp_points_active: string | null;
    settings_total: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM xp_employees) AS employees_total,
      (SELECT COUNT(*) FROM xp_employees WHERE status = 'ativo' AND deleted_at IS NULL) AS employees_active,
      (SELECT COUNT(*) FROM xp_sales) AS sales_total,
      (SELECT COUNT(*) FROM xp_sales WHERE deleted_at IS NULL) AS sales_active,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM xp_sales WHERE deleted_at IS NULL) AS amount_cents_active,
      (SELECT COALESCE(SUM(xp_points), 0) FROM xp_sales WHERE deleted_at IS NULL) AS xp_points_active,
      (SELECT COUNT(*) FROM xp_settings) AS settings_total
  `);
  return result.rows[0] || {};
}

async function legacyStats(): Promise<Record<string, unknown> | null> {
  if (!LEGACY_MYSQL_REQUIRED || !mysqlPool) return null;
  try {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM wf_xp_employees) AS employees_total,
        (SELECT COUNT(*) FROM wf_xp_employees WHERE status = 'ativo' AND deleted_at IS NULL) AS employees_active,
        (SELECT COUNT(*) FROM wf_xp_sales) AS sales_total,
        (SELECT COUNT(*) FROM wf_xp_sales WHERE deleted_at IS NULL) AS sales_active,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM wf_xp_sales WHERE deleted_at IS NULL) AS amount_cents_active,
        (SELECT COALESCE(SUM(xp_points), 0) FROM wf_xp_sales WHERE deleted_at IS NULL) AS xp_points_active,
        (SELECT COUNT(*) FROM wf_xp_settings) AS settings_total
    `);
    return rows[0] || {};
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function coreAuthHealth(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = { provider: AUTH_PROVIDER };
  if (!CORE_AUTH_REQUIRED || !corePgPool) {
    return state;
  }
  const started = Date.now();
  try {
    const result = await corePgPool.query<{ users: string }>('SELECT COUNT(*)::text AS users FROM core_users WHERE active = true');
    state.coreReachable = true;
    state.users = Number(result.rows[0]?.users || 0);
    state.coreLatencyMs = Date.now() - started;
  } catch (error) {
    state.coreReachable = false;
    state.error = error instanceof Error ? error.message : String(error);
  }
  return state;
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>XP - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260525d">
    <script src="${BASE_PATH}/login-runner.js?v=20260522a" defer></script>
</head>
<body class="xp-login-body">
    <img class="xp-login-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>
    <main class="xp-login-card">
        <img class="xp-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
        <h1>Entrar no XP</h1>
        <p>Trilha de niveis dos atendentes por vendas lancadas diariamente.</p>
        ${error ? `<div class="xp-alert error">${e(error)}</div>` : ''}
        <form method="post" class="xp-login-form">
            ${csrfField(req)}
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username" value="${e(req.body?.username || '')}">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="xp-btn xp-btn-primary">Entrar</button>
        </form>
    </main>
</body>
</html>`;
}

function renderPlayerButton(player: EmployeeView, compact = false): string {
  const photo = photoUrl(player.photo_path);
  const classes = compact ? `xp-game-player ${player.is_admin ? 'is-adm' : ''}` : `xp-node-player ${player.is_admin ? 'is-adm' : ''}`;
  if (compact) {
    return `<button type="button" class="${classes}" data-xp-focus-employee="${e(player.id)}"${playerDataAttrs(player)}>
      <span class="xp-game-avatar">
        ${photo ? `<img src="${e(photo)}" alt="${e(player.name)}" loading="lazy" decoding="async">` : `<i>${player.is_admin ? 'ADM' : e(employeeInitials(player.name))}</i>`}
      </span>
      <span class="xp-game-info">
        <strong>${e(player.name)}</strong>
        <small>${player.is_admin ? 'ADM' : `Nivel ${e(player.progress.level)} - ${e(formatPercent(player.progress.percent))}`}</small>
        <em class="${e(progressFillClass(player.progress))}"><b></b></em>
      </span>
    </button>`;
  }
  return `<button type="button" class="${classes}" data-xp-focus-employee="${e(player.id)}" title="${e(player.name)}"${playerDataAttrs(player)}>
    ${photo ? `<img src="${e(photo)}" alt="${e(player.name)}" loading="lazy" decoding="async">` : `<span>${player.is_admin ? 'ADM' : e(employeeInitials(player.name))}</span>`}
  </button>`;
}

function renderMain(req: Request, user: User, data: { employees: EmployeeView[]; adminProfile: { photo_path: string }; recentSales: SaleRow[]; context: MonthContext; activeTab: 'trilha' | 'configuracoes'; flash: Flash }): string {
  const canManage = managerCanManage(user);
  const { employees, adminProfile, context, activeTab, flash } = data;
  const sum = summary(employees);
  const trailUrl = `${BASE_PATH}/?tab=trilha&month=${encodeURIComponent(context.month)}`;
  const settingsUrl = `${BASE_PATH}/?tab=configuracoes&month=${encodeURIComponent(context.month)}`;
  const [levelStart, levelEnd] = levelTrackBounds(employees);
  const playersByLevel = new Map<number, EmployeeView[]>();
  for (const employee of employees) {
    const level = employee.progress.level;
    playersByLevel.set(level, [...(playersByLevel.get(level) || []), employee]);
  }
  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>XP - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260525c">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517k">
    <script src="${BASE_PATH}/app.js?v=20260523d" defer></script>
    <script src="/miauw/widget.js?v=20260517k" defer></script>
</head>
<body class="xp-app-body ${activeTab === 'trilha' ? 'is-trail-view' : 'is-settings-view'}">
    <header class="xp-topbar">
        <a class="xp-brand" href="/">
            <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
            <strong>XP</strong>
        </a>
        <nav class="xp-section-tabs" aria-label="Abas XP">
            <a class="${activeTab === 'trilha' ? 'is-active' : ''}" href="${e(trailUrl)}" ${activeTab === 'trilha' ? 'aria-current="page"' : ''}>Trilha</a>
            <a class="${activeTab === 'configuracoes' ? 'is-active' : ''}" href="${e(settingsUrl)}" ${activeTab === 'configuracoes' ? 'aria-current="page"' : ''}>Configura&ccedil;&otilde;es</a>
        </nav>
        <nav class="xp-nav" aria-label="Navegacao">
            <a href="/">Home</a>
            <a href="${BASE_PATH}/logout.php">Sair</a>
        </nav>
    </header>

    <main class="xp-page ${activeTab === 'trilha' ? 'is-trail-view' : 'is-settings-view'}" data-miauby-screen-object="modulo xp" data-miauby-screen-label="Modulo XP: ${e(sum.employee_count)} jogador(es)">
        <section class="xp-hero xp-settings-only">
            <div><h1>XP</h1></div>
            <form class="xp-month" method="get">
                <input type="hidden" name="tab" value="configuracoes">
                <label>
                    <span>Mes</span>
                    <input type="month" name="month" value="${e(context.month)}">
                </label>
                <button type="submit" class="xp-btn">Ver</button>
            </form>
        </section>
        ${flash.message ? `<div class="xp-alert xp-settings-only ${e(flash.type)}">${e(flash.message)}</div>` : ''}
        <section class="xp-summary-grid xp-settings-only" aria-label="Resumo XP">
            <article><span>Jogadores</span><strong>${e(sum.employee_count)}</strong></article>
            <article><span>XP do mes</span><strong>${e(formatNumber(sum.month_xp))}</strong></article>
            <article><span>XP total</span><strong>${e(formatNumber(sum.total_xp))}</strong></article>
        </section>
        ${canManage ? renderAdmin(req, employees, adminProfile) : ''}
        ${activeTab === 'trilha' ? renderTrail(employees, playersByLevel, levelStart, levelEnd, sum.total_xp, sum.top_employee) : ''}
        ${renderEmployees(req, employees, canManage)}
        ${canManage ? renderRecent(req, data.recentSales) : ''}
    </main>
</body>
</html>`;
}

function renderAdmin(req: Request, employees: EmployeeView[], adminProfile: { photo_path: string }): string {
  const adminEmployee = employees.find((employee) => employee.is_admin);
  const adminName = adminEmployee?.name || 'ADM';
  return `<section class="xp-admin-grid xp-settings-only" aria-label="Administracao XP">
    <article class="xp-admin-card xp-admin-profile-card">
      <h2>Moldura ADM</h2>
      <div class="xp-admin-avatar">${adminProfile.photo_path ? `<img src="${e(adminProfile.photo_path)}" alt="Foto ADM XP" loading="lazy" decoding="async">` : '<span>ADM</span>'}</div>
      <form method="post" enctype="multipart/form-data" class="xp-form">
        ${csrfField(req)}
        <input type="hidden" name="action" value="update_admin_profile">
        <label><span>Seu nome</span><input type="text" name="name" maxlength="180" value="${e(adminName)}" required></label>
        <label><span>Sua foto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input><small>Essa foto usa a moldura ADM.</small></label>
        <div class="xp-photo-preview" hidden data-xp-photo-preview></div>
        <button type="submit" class="xp-btn xp-btn-primary">Salvar ADM</button>
      </form>
    </article>
    <article class="xp-admin-card">
      <h2>Cadastrar funcionario</h2>
      <form method="post" enctype="multipart/form-data" class="xp-form">
        ${csrfField(req)}
        <input type="hidden" name="action" value="create_employee">
        <label><span>Nome</span><input type="text" name="name" maxlength="180" required placeholder="Nome do atendente"></label>
        <label><span>Foto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input><small>JPG, PNG ou WEBP ate 3 MB.</small></label>
        <div class="xp-photo-preview" hidden data-xp-photo-preview></div>
        <button type="submit" class="xp-btn xp-btn-primary">Adicionar</button>
      </form>
    </article>
    <article class="xp-admin-card xp-admin-card-wide">
      <h2>Gerar XP diario</h2>
      <form method="post" class="xp-form xp-form-sale">
        ${csrfField(req)}
        <input type="hidden" name="action" value="create_sale">
        <label><span>Funcionario</span><select name="employee_id" required><option value="">Escolha</option>${employees
          .map((employee) => {
            const label = employee.is_admin ? `${employee.name} (ADM)` : employee.name;
            return `<option value="${e(employee.id)}">${e(label)}</option>`;
          })
          .join('')}</select></label>
        <label><span>Data</span><input type="date" name="sale_date" value="${e(todayDate())}" required></label>
        <label><span>Valor em R$</span><input type="text" name="amount" inputmode="decimal" required placeholder="1.000,00"></label>
        <label class="xp-form-note"><span>Observacao</span><input type="text" name="note" maxlength="220" placeholder="Opcional"></label>
        <button type="submit" class="xp-btn xp-btn-primary">Gerar XP</button>
      </form>
      <p class="xp-admin-hint">Exemplo: R$ 1.000,00 gera ${e(formatNumber(XP_POINTS_PER_THOUSAND_REAIS))} XP.</p>
    </article>
  </section>`;
}

function renderTrail(employees: EmployeeView[], playersByLevel: Map<number, EmployeeView[]>, levelStart: number, levelEnd: number, totalXp: number, topEmployee: EmployeeView | null): string {
  const levels: string[] = [];
  for (let level = levelStart; level <= levelEnd; level += 1) {
    const players = playersByLevel.get(level) || [];
    const visiblePlayers = players.slice(0, 4);
    levels.push(`<article class="xp-level xp-level-${e(levelKind(level))} ${players.length ? 'has-players' : ''}" data-xp-level="${e(level)}">
      ${level > levelStart ? '<span class="xp-path" aria-hidden="true"></span>' : ''}
      <div class="xp-level-node">
        <img class="xp-level-art" src="${e(levelAsset(level))}" alt="" loading="lazy" decoding="async">
        <strong>Nivel ${e(level)}</strong>
        ${players.length ? `<div class="xp-node-players" aria-label="Funcionarios neste nivel">${visiblePlayers.map((player) => renderPlayerButton(player)).join('')}${players.length > visiblePlayers.length ? `<span class="xp-node-more">+${e(players.length - visiblePlayers.length)}</span>` : ''}</div>` : ''}
      </div>
    </article>`);
  }
  return `<section class="xp-world xp-trail-only" aria-label="Trilha de niveis XP">
    <div class="xp-world-hud">
      <div class="xp-world-score"><span>Ranking atual</span><strong>${topEmployee ? e(topEmployee.name) : 'Sem jogadores'}</strong><small>${e(formatNumber(totalXp))} XP total na equipe</small></div>
      <div class="xp-world-controls" aria-label="Controles da trilha"><button type="button" data-xp-track-step="-1" aria-label="Voltar niveis">&lsaquo;</button><button type="button" data-xp-track-step="1" aria-label="Avancar niveis">&rsaquo;</button></div>
    </div>
    <div class="xp-player-summary" data-xp-player-summary hidden>
      <button type="button" class="xp-player-summary-close" data-xp-player-summary-close aria-label="Fechar resumo">&times;</button>
      <span data-xp-summary-role>Atendente XP</span>
      <strong data-xp-summary-name>Jogador</strong>
      <small data-xp-summary-level>Nivel 1 -> 2</small>
      <div class="xp-player-summary-bar" data-xp-summary-bar"><i></i><b data-xp-summary-progress>0/30.000 XP</b></div>
      <dl><div><dt>XP do mes</dt><dd data-xp-summary-month>0</dd></div><div><dt>XP total</dt><dd data-xp-summary-total>0</dd></div><div><dt>Progresso</dt><dd data-xp-summary-percent>0%</dd></div></dl>
    </div>
    <div class="xp-track-scroll" data-xp-track><div class="xp-track">${levels.join('')}</div></div>
    ${employees.length ? `<div class="xp-game-roster" aria-label="Placar de jogadores">${employees.map((employee) => renderPlayerButton(employee, true)).join('')}</div>` : ''}
  </section>`;
}

function renderEmployees(req: Request, employees: EmployeeView[], canManage: boolean): string {
  if (!employees.length) {
    return `<section class="xp-employee-grid xp-settings-only" aria-label="Funcionarios XP"><article class="xp-empty"><h2>Nenhum jogador cadastrado ainda</h2><p>Cadastre os atendentes e gere XP diario para a trilha comecar a andar.</p></article></section>`;
  }
  return `<section class="xp-employee-grid xp-settings-only" aria-label="Funcionarios XP">${employees.map((employee) => renderEmployee(req, employee, canManage)).join('')}</section>`;
}

function renderEmployee(req: Request, employee: EmployeeView, canManage: boolean): string {
  const progress = employee.progress;
  const photo = photoUrl(employee.photo_path);
  const deleteAction = canManage && !employee.is_admin
    ? `<div class="xp-employee-actions" aria-label="Acoes do usuario"><form method="post" class="xp-delete-user-form">${csrfField(req)}<input type="hidden" name="action" value="deactivate_employee"><input type="hidden" name="employee_id" value="${e(employee.id)}"><button type="submit" class="xp-btn xp-btn-danger" aria-label="Excluir usuario ${e(employee.name)} do XP" data-xp-confirm="Excluir este usuario do XP? Ele sai da trilha e da lista, mas os lancamentos antigos ficam preservados.">Excluir usuario</button></form></div>`
    : '';
  const editAction = canManage
    ? `<details class="xp-edit-details"><summary>Editar usuario</summary><form method="post" enctype="multipart/form-data" class="xp-form xp-form-edit">${csrfField(req)}<input type="hidden" name="action" value="update_employee"><input type="hidden" name="employee_id" value="${e(employee.id)}"><label><span>Nome</span><input type="text" name="name" maxlength="180" value="${e(employee.name)}" required></label><label><span>Nova foto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input></label><button type="submit" class="xp-btn">Salvar</button></form></details>`
    : '';
  return `<article class="xp-employee-card ${employee.is_admin ? 'is-adm' : ''}" data-xp-employee-card="${e(employee.id)}" data-xp-employee-level="${e(progress.level)}">
    <div class="xp-employee-main">
      <div class="xp-avatar-frame ${employee.is_admin ? 'is-adm' : ''}">${photo ? `<img src="${e(photo)}" alt="${e(employee.name)}" loading="lazy" decoding="async">` : `<span>${employee.is_admin ? 'ADM' : e(employeeInitials(employee.name))}</span>`}</div>
      <div class="xp-employee-info">
        <span class="xp-rank">${employee.is_admin ? 'ADM' : `#${e(employee.rank)}`}</span>
        <h2>${e(employee.name)}</h2>
        <p>Nivel ${e(progress.level)} -> ${e(progress.next_level)}</p>
        ${employee.is_admin ? '<small class="xp-admin-player-note">Perfil ADM para receber XP do proprio administrador.</small>' : ''}
        <dl><div><dt>XP do mes</dt><dd>${e(formatNumber(employee.month_xp))}</dd></div><div><dt>XP total</dt><dd>${e(formatNumber(employee.total_xp))}</dd></div></dl>
      </div>
      <div class="xp-liquid-bar ${e(progressFillClass(progress))}"><i aria-hidden="true"></i><span>${e(formatNumber(progress.progress_xp))}/${e(formatNumber(progress.required_xp))} XP</span></div>
    </div>
    <div class="xp-progress-line ${e(progressFillClass(progress))}" aria-label="Progresso para o proximo nivel"><i></i><span>${e(formatPercent(progress.percent))}</span></div>
    ${deleteAction}
    ${editAction}
  </article>`;
}

function renderRecent(req: Request, sales: SaleRow[]): string {
  if (!sales.length) {
    return '<section class="xp-recent xp-settings-only" aria-label="Lancamentos recentes"><h2>Ultimos lancamentos</h2><p>Nenhum lancamento ainda.</p></section>';
  }
  return `<section class="xp-recent xp-settings-only" aria-label="Lancamentos recentes"><h2>Ultimos lancamentos</h2><div class="xp-recent-list">${sales
    .map((sale) => {
      const note = cleanText(sale.note || '', 255);
      return `<article>
        <div class="xp-recent-main"><strong>${e(sale.employee_name || 'Funcionario')}</strong><span>${e(brDate(sale.sale_date))}</span>${note ? `<p class="xp-recent-note"><span>Observacao</span>${e(note)}</p>` : ''}</div>
        <div class="xp-recent-xp" aria-label="XP do lancamento"><span>${e(formatNumber(sale.xp_points))} XP</span></div>
        <form method="post">${csrfField(req)}<input type="hidden" name="action" value="delete_sale"><input type="hidden" name="sale_id" value="${e(sale.id)}"><button type="submit" class="xp-mini-danger" data-xp-confirm="Cancelar este lancamento?">Cancelar</button></form>
      </article>`;
    })
    .join('')}</div></section>`;
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function photoUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('photo')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      setFlash(req, 'error', 'A foto precisa ter ate 3 MB.');
      res.redirect(`${BASE_PATH}/?tab=configuracoes`);
      return;
    }
    next(error);
  });
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
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
app.use(BASE_PATH, express.static(publicDir, { index: false, dotfiles: 'ignore' }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  await pgPool.query('SELECT 1');
  if (LEGACY_MYSQL_REQUIRED) await requireMysqlPool('health').query('SELECT 1');
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_xp',
      legacy_mysql_required: LEGACY_MYSQL_REQUIRED,
      legacy_mysql_import_enabled: LEGACY_MYSQL_IMPORT_ENABLED,
      legacy_mysql_mirror_enabled: LEGACY_MYSQL_MIRROR_ENABLED,
      legacy_mysql_logs_enabled: LEGACY_MYSQL_LOGS_ENABLED,
      migration: migrationState,
      postgres: await postgresStats(),
      legacy: await legacyStats(),
    },
    auth: await coreAuthHealth(),
    rules: {
      xp_per_1000_reais: XP_POINTS_PER_THOUSAND_REAIS,
      first_level_requirement: XP_FIRST_LEVEL_REQUIREMENT,
    },
  });
}));

app.get(`${BASE_PATH}/internal/migration-status`, asyncRoute(async (_req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    migration: migrationState,
    postgres: await postgresStats(),
    legacy: await legacyStats(),
  });
}));

app.get(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  if (await currentUser(req.session.user)) {
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
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    void logCoreAudit(null, 'login_xp_falha', 'user', null, `Tentativa de login XP falhou para usuario: ${username}`);
    void logMysql(null, 'login_xp_falha', 'user', null, `Tentativa de login XP falhou para usuario: ${username}`);
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
    void logCoreAudit(user.id, 'login_xp', 'user', String(user.id), 'Login XP realizado.');
    void logMysql(user.id, 'login_xp', 'user', user.id, 'Login XP realizado.');
    res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

async function renderXpPage(req: Request, res: Response): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  const context = monthContext(req.query.month);
  const activeTab = req.query.tab === 'configuracoes' ? 'configuracoes' : 'trilha';
  const flash = takeFlash(req);
  const profile = await adminProfile();
  await syncAdminEmployee(profile.photo_path, user.id);
  const employees = await listEmployees(context);
  const sales = await recentSales(9);
  res.type('html').send(renderMain(req, user, { employees, adminProfile: profile, recentSales: sales, context, activeTab, flash }));
}

app.get([`${BASE_PATH}/`, `${BASE_PATH}/index.php`, BASE_PATH], asyncRoute(async (req, res) => {
  await renderXpPage(req, res);
}));

app.post([`${BASE_PATH}/`, `${BASE_PATH}/index.php`, BASE_PATH], photoUpload, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const settingsUrl = `${BASE_PATH}/?tab=configuracoes&month=${encodeURIComponent(monthContext(req.query.month).month)}`;
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    res.redirect(settingsUrl);
    return;
  }
  try {
    ensureManager(user);
    const action = String(req.body.action || '');
    const file = req.file;
    if (action === 'create_employee') {
      await createEmployee(req.body.name, file, user.id);
      setFlash(req, 'success', 'Funcionario cadastrado no XP.');
    } else if (action === 'update_admin_profile') {
      await updateAdminProfile(req.body.name, file, user.id);
      setFlash(req, 'success', 'Perfil ADM atualizado.');
    } else if (action === 'update_employee') {
      await updateEmployee(Number(req.body.employee_id || 0), req.body.name, file, user.id);
      setFlash(req, 'success', 'Funcionario atualizado.');
    } else if (action === 'deactivate_employee') {
      await deactivateEmployee(Number(req.body.employee_id || 0), user.id);
      setFlash(req, 'success', 'Usuario removido do XP.');
    } else if (action === 'create_sale') {
      await createSale(Number(req.body.employee_id || 0), req.body.sale_date, req.body.amount, req.body.note, user.id);
      setFlash(req, 'success', 'XP calculado e lancado.');
    } else if (action === 'delete_sale') {
      await deleteSale(Number(req.body.sale_id || 0), user.id);
      setFlash(req, 'success', 'Lancamento cancelado sem apagar historico.');
    } else {
      setFlash(req, 'error', 'Acao invalida.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar o XP agora.');
  }
  res.redirect(settingsUrl);
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[xp] request failed', error);
  res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><title>XP</title><p>XP indisponivel.</p>');
});

async function withRetry(name: string, fn: () => Promise<unknown>, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[xp] waiting for ${name} (${index}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function start(): Promise<void> {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  if (CORE_AUTH_REQUIRED) {
    await withRetry('core postgres', () => requireCorePgPool('startup').query('SELECT COUNT(*) FROM core_users'));
  }
  if (LEGACY_MYSQL_REQUIRED) {
    await withRetry('mysql', () => requireMysqlPool('startup').query('SELECT 1'));
  }
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`[xp] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[xp] failed to start', error);
  process.exit(1);
});
