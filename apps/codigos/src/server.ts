import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
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
  password_hash: string | null;
  role: string;
  active: boolean;
};

type MysqlUserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: number;
};

type CodeItemRow = {
  id: string;
  legacy_mysql_id: string | null;
  codigo: string;
  ean: string;
  price_cents: string | number;
  sort_order: string | number;
  active: boolean;
  created_by: string | number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type CodeItem = {
  id: number;
  legacy_mysql_id: number | null;
  codigo: string;
  ean: string;
  price_cents: number;
  sort_order: number;
};

type GroupRow = {
  id: string;
  legacy_mysql_id: string | null;
  group_key: string;
  label: string;
  sort_order: string | number;
  active: boolean;
};

type MigrationStats = {
  groupsImported: number;
  itemsImported: number;
  lastRunAt: string | null;
  lastError: string | null;
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
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/codigos');
const PORT = Number.parseInt(env.PORT || '3700', 10);
const SERVICE_VERSION = '1.0.0';
const SESSION_SECRET = env.CODIGOS_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_PROVIDER = normalizeAuthProvider(env.CODIGOS_AUTH_PROVIDER || 'core');
const GROUP_DELETE_PASSWORD = env.CODIGOS_GROUP_DELETE_PASSWORD || 'wimifarma';
const INTERNAL_TOKEN = env.CODIGOS_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || '';
const LEGACY_MYSQL_IMPORT_ENABLED = normalizeBoolean(env.CODIGOS_LEGACY_MYSQL_IMPORT_ENABLED ?? 'true');
const LEGACY_MYSQL_MIRROR_ENABLED = normalizeBoolean(env.CODIGOS_LEGACY_MYSQL_MIRROR_ENABLED ?? 'true');
const LEGACY_MYSQL_LOGS_ENABLED = normalizeBoolean(env.CODIGOS_LEGACY_MYSQL_LOGS_ENABLED ?? 'true');
const LEGACY_MYSQL_REQUIRED =
  AUTH_PROVIDER === 'mysql' ||
  LEGACY_MYSQL_IMPORT_ENABLED ||
  LEGACY_MYSQL_MIRROR_ENABLED ||
  LEGACY_MYSQL_LOGS_ENABLED;
const CORE_AUTH_REQUIRED = AUTH_PROVIDER === 'core';

const migrationStats: MigrationStats = {
  groupsImported: 0,
  itemsImported: 0,
  lastRunAt: null,
  lastError: null,
};

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.POSTGRES_PORT || '5432', 10),
  database: env.POSTGRES_DB || 'wimifarma_codigos',
  user: env.POSTGRES_USER || 'wimifarma_codigos',
  password: env.POSTGRES_PASSWORD || '',
  max: 8,
});

const corePgPool = new Pool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.CORE_POSTGRES_PORT || '5432', 10),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 4,
});

let mysqlPool: mysql.Pool | null = null;

function mysqlDb(): mysql.Pool {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: env.MYSQL_HOST || '127.0.0.1',
      port: Number.parseInt(env.MYSQL_PORT || '3306', 10),
      database: env.MYSQL_DATABASE || 'wimifarma_app',
      user: env.MYSQL_USER || 'wimifarma_user',
      password: env.MYSQL_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 4,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return mysqlPool;
}

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFCODIGOS',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'codigos_sessions',
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
  const clean = value.trim().replace(/\/+$/, '');
  return clean.startsWith('/') ? clean || '/codigos' : `/${clean || 'codigos'}`;
}

function normalizeBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeAuthProvider(value: unknown): AuthProvider {
  return String(value || 'core').trim().toLowerCase() === 'mysql' ? 'mysql' : 'core';
}

function normalizeUsername(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function e(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanText(value: unknown, limit: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.slice(0, limit) : clean;
}

function priceToCents(value: unknown): number {
  if (typeof value === 'number') {
    return Math.max(0, Math.round(value * 100));
  }
  let text = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s+/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  text = text.replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function priceInput(value: unknown): string {
  return (toNumber(value) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function eanPrefix(ean: string): string {
  return digitsOnly(ean).slice(0, 2);
}

function normalizeGroupKey(value: string): string {
  return digitsOnly(value).slice(0, 2);
}

function groupKey(ean: string): string {
  const prefix = eanPrefix(ean);
  return /^\d{2}$/.test(prefix) ? prefix : 'outros';
}

function isValidGroupKey(group: string): boolean {
  return group === 'outros' || /^\d{2}$/.test(group);
}

function groupLabel(group: string): string {
  return /^\d{2}$/.test(group) ? `EAN ${group}` : 'Outros';
}

function defaultEanPlaceholder(group: string): string {
  return /^\d{2}$/.test(group) ? `${group} 000` : 'EAN';
}

function isProtectedGroup(group: string): boolean {
  return ['20', '40', 'outros'].includes(group);
}

function canDeleteGroup(group: string): boolean {
  return /^\d{2}$/.test(group) && !isProtectedGroup(group);
}

function groupPayload(group: string) {
  return {
    key: group,
    label: groupLabel(group),
    placeholder: defaultEanPlaceholder(group),
    can_delete: canDeleteGroup(group),
  };
}

function itemPayload(item: CodeItem) {
  return {
    id: item.id,
    codigo: item.codigo,
    ean: item.ean,
    preco: priceInput(item.price_cents),
    group: groupKey(item.ean),
  };
}

function internalItemPayload(item: CodeItem) {
  const group = groupKey(item.ean);
  return {
    id: item.id,
    codigo: item.codigo,
    ean: item.ean,
    preco: priceInput(item.price_cents),
    price_cents: item.price_cents,
    group,
    group_label: groupLabel(group),
  };
}

function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function requireInternalToken(req: Request, res: Response): boolean {
  if (!INTERNAL_TOKEN) {
    res.status(503).json({ ok: false, error: 'Codigos internal token not configured.' });
    return false;
  }

  const provided = String(req.get('x-codigos-internal-token') || req.get('x-miauw-internal-token') || '');
  if (!secretMatches(provided, INTERNAL_TOKEN)) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return false;
  }

  return true;
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
  if (!text.startsWith(BASE_PATH)) return '';
  if (/^https?:\/\//i.test(text) || text.startsWith('//')) return '';
  return text;
}

function loginRedirectTarget(req: Request): string {
  const target = safeReturnPath(req.session.returnTo);
  delete req.session.returnTo;
  return target || `${BASE_PATH}/`;
}

async function authenticate(username: string, password: string): Promise<User | null> {
  return AUTH_PROVIDER === 'mysql' ? authenticateMysql(username, password) : authenticateCore(username, password);
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
  if (!row?.password_hash) return null;
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;
  return { id: toNumber(row.id), username: row.username, role: row.role || 'user' };
}

async function authenticateMysql(username: string, password: string): Promise<User | null> {
  const [rows] = await mysqlDb().query<mysql.RowDataPacket[]>(
    'SELECT id, username, password_hash, role, active FROM wf_users WHERE username = ? AND active = 1 LIMIT 1',
    [username],
  );
  const row = rows[0] as MysqlUserRow | undefined;
  if (!row?.password_hash) return null;
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;
  return { id: toNumber(row.id), username: String(row.username || ''), role: String(row.role || 'user') };
}

async function currentUser(user?: User): Promise<User | null> {
  if (!user) return null;
  if (AUTH_PROVIDER === 'mysql') {
    const [rows] = await mysqlDb().query<mysql.RowDataPacket[]>(
      'SELECT id, username, role, active FROM wf_users WHERE id = ? AND active = 1 LIMIT 1',
      [user.id],
    );
    const row = rows[0] as MysqlUserRow | undefined;
    return row ? { id: toNumber(row.id), username: String(row.username || ''), role: String(row.role || 'user') } : null;
  }
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  return row ? { id: toNumber(row.id), username: row.username, role: row.role || 'user' } : null;
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

async function logCoreAudit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  detail: string,
): Promise<void> {
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
      [userId, action, entityType, entityId === null ? null : String(entityId), cleanText(detail, 500)],
    );
  } catch (error) {
    console.error('[codigos] core audit failed', error);
  }
}

async function logMysql(
  userId: number | null,
  action: string,
  entityType: string | null,
  entityId: number | string | null,
  message: string,
): Promise<void> {
  if (!LEGACY_MYSQL_LOGS_ENABLED) return;
  try {
    await mysqlDb().query(
      'INSERT INTO wf_logs (user_id, action, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId === null ? null : Number(entityId) || null, cleanText(message, 500)],
    );
  } catch (error) {
    console.error('[codigos] legacy log failed', error);
  }
}

async function auditPg(
  action: string,
  entityType: string,
  entityId: number | string | null,
  userId: number | null,
  summary: string,
): Promise<void> {
  await pgPool.query(
    `INSERT INTO codigos_audit_events (actor_user_id, action, entity_type, entity_id, summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId === null ? null : String(entityId), cleanText(summary, 500)],
  );
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS codigos_groups (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      group_key VARCHAR(16) NOT NULL UNIQUE,
      label VARCHAR(80) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS codigos_items (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      codigo VARCHAR(180) NOT NULL,
      ean VARCHAR(80) NOT NULL,
      price_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS codigos_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80),
      entity_id TEXT,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_codigos_groups_active_order ON codigos_groups (active, sort_order, group_key)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_codigos_items_active_order ON codigos_items (active, sort_order, id)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_codigos_items_codigo ON codigos_items (codigo)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_codigos_items_ean ON codigos_items (ean)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_codigos_audit_created ON codigos_audit_events (created_at DESC)');

  if (LEGACY_MYSQL_IMPORT_ENABLED || LEGACY_MYSQL_MIRROR_ENABLED) {
    await ensureLegacyMysqlSchema();
  }
  if (LEGACY_MYSQL_IMPORT_ENABLED) {
    await migrateLegacyData();
  }
  await seedDefaultGroups();
  await seedPgDefaultsIfEmpty();
  await syncGroupsFromItems();
}

async function ensureLegacyMysqlSchema(): Promise<void> {
  const db = mysqlDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS wf_codigos_comissao (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      codigo VARCHAR(180) NOT NULL,
      ean VARCHAR(80) NOT NULL,
      preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      ordem INT UNSIGNED NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_por INT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      apagado_em DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_codigos_comissao_ativo_ordem (ativo, ordem, id),
      KEY idx_codigos_comissao_codigo (codigo),
      KEY idx_codigos_comissao_ean (ean)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wf_codigos_blocos (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      group_key VARCHAR(16) NOT NULL,
      label VARCHAR(80) NOT NULL,
      ordem INT UNSIGNED NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_por INT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_codigos_blocos_group_key (group_key),
      KEY idx_codigos_blocos_ativo_ordem (ativo, ordem, group_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await seedLegacyDefaultsIfEmpty();
}

const defaultItems: Array<[string, string, number]> = [
  ['KIT GRIPE', '20 001', 36.9],
  ['INJETAVEL 1X', '20 002', 35.0],
  ['INJETAVEL 2X', '20 003', 60.0],
  ['AZITRO 3 CP', '20 004', 30.0],
  ['AZITRO 5 CP', '20 005', 35.0],
  ['AZITRO SUSP (TODOS)', '20 006', 49.99],
  ['RIFAMICINA', '20 007', 35.0],
  ['KIT RESSACA', '20 008', 20.0],
  ['OTOLOGICO', '20 009', 35.0],
  ['OFTALMICO', '20 010', 35.0],
  ['LEVOFLOXACINO 500 MG', '20 011', 65.0],
  ['LEVOFLOXACINO 750 MG', '20 012', 75.0],
  ['QUADRIDERM (SIM / GEN)', '20 013', 45.0],
  ['CIPROFLOXACINO', '20 014', 45.0],
  ['CEFALEXINA', '20 015', 29.99],
  ['CEFALEXINA SUSP', '20 016', 49.99],
  ['AMOXILINA 500 - 21CP', '20 017', 39.99],
  ['AMOX / CLAV 875/125 - 14CP', '20 018', 89.9],
  ['AMOXILINA SUSP (TODAS)', '20 019', 56.9],
  ['METRONIDAZOL (TODAS MG)', '20 020', 45.99],
  ['SULFAMET + TRIME (COMP E SUSP)', '20 021', 39.99],
  ['NORFLOXACINO 400MG - 14 CP', '20 022', 45.0],
  ['CREME MAO', '40 001', 19.99],
  ['WIMI COMPLEX B', '40 002', 59.9],
];

async function seedLegacyDefaultsIfEmpty(): Promise<void> {
  const db = mysqlDb();
  const [countRows] = await db.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS total FROM wf_codigos_comissao');
  if (toNumber(countRows[0]?.total) < 1) {
    const stmt = 'INSERT INTO wf_codigos_comissao (codigo, ean, preco, ordem, criado_por) VALUES (?, ?, ?, ?, NULL)';
    for (const [index, row] of defaultItems.entries()) {
      await db.query(stmt, [row[0], row[1], row[2], (index + 1) * 10]);
    }
  }
  for (const [group, order] of [['20', 10], ['40', 20]] as Array<[string, number]>) {
    await db.query(
      `INSERT INTO wf_codigos_blocos (group_key, label, ordem, criado_por)
       VALUES (?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE label = VALUES(label), ativo = 1`,
      [group, groupLabel(group), order],
    );
  }
}

async function seedDefaultGroups(): Promise<void> {
  for (const [group, order] of [['20', 10], ['40', 20]] as Array<[string, number]>) {
    await pgPool.query(
      `INSERT INTO codigos_groups (group_key, label, sort_order, active, updated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label, active = true, updated_at = NOW()`,
      [group, groupLabel(group), order],
    );
  }
}

async function seedPgDefaultsIfEmpty(): Promise<void> {
  const result = await pgPool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM codigos_items');
  if (toNumber(result.rows[0]?.total) > 0) return;
  for (const [index, item] of defaultItems.entries()) {
    await pgPool.query(
      `INSERT INTO codigos_items (codigo, ean, price_cents, sort_order, active)
       VALUES ($1, $2, $3, $4, true)`,
      [item[0], item[1], priceToCents(item[2]), (index + 1) * 10],
    );
  }
}

async function migrateLegacyData(): Promise<void> {
  const startedAt = new Date().toISOString();
  try {
    const db = mysqlDb();
    const [groups] = await db.query<mysql.RowDataPacket[]>(
      'SELECT id, group_key, label, ordem, ativo, criado_por, criado_em, atualizado_em FROM wf_codigos_blocos ORDER BY ordem ASC, id ASC',
    );
    const [items] = await db.query<mysql.RowDataPacket[]>(
      'SELECT id, codigo, ean, preco, ordem, ativo, criado_por, criado_em, atualizado_em, apagado_em FROM wf_codigos_comissao ORDER BY id ASC',
    );

    let groupsImported = 0;
    let itemsImported = 0;
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      for (const row of groups) {
        const group = cleanText(row.group_key, 16);
        if (!/^\d{2}$/.test(group)) continue;
        await client.query(
          `INSERT INTO codigos_groups (
             legacy_mysql_id, group_key, label, sort_order, active, created_by,
             created_at, updated_at, deleted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8::timestamptz, CASE WHEN $5 THEN NULL ELSE NOW() END)
           ON CONFLICT (group_key) DO UPDATE SET
             legacy_mysql_id = COALESCE(codigos_groups.legacy_mysql_id, EXCLUDED.legacy_mysql_id),
             label = EXCLUDED.label,
             sort_order = EXCLUDED.sort_order,
             active = EXCLUDED.active,
             updated_at = NOW(),
             deleted_at = CASE WHEN EXCLUDED.active THEN NULL ELSE COALESCE(codigos_groups.deleted_at, NOW()) END`,
          [
            toNumber(row.id),
            group,
            cleanText(row.label || groupLabel(group), 80),
            toNumber(row.ordem),
            toNumber(row.ativo) === 1,
            row.criado_por ? toNumber(row.criado_por) : null,
            row.criado_em || null,
            row.atualizado_em || null,
          ],
        );
        groupsImported += 1;
      }
      for (const row of items) {
        await client.query(
          `INSERT INTO codigos_items (
             legacy_mysql_id, codigo, ean, price_cents, sort_order, active,
             created_by, created_at, updated_at, deleted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::timestamptz, $10::timestamptz)
           ON CONFLICT (legacy_mysql_id) DO UPDATE SET
             codigo = EXCLUDED.codigo,
             ean = EXCLUDED.ean,
             price_cents = EXCLUDED.price_cents,
             sort_order = EXCLUDED.sort_order,
             active = EXCLUDED.active,
             updated_at = NOW(),
             deleted_at = EXCLUDED.deleted_at`,
          [
            toNumber(row.id),
            cleanText(row.codigo, 180),
            cleanText(row.ean, 80),
            priceToCents(row.preco),
            toNumber(row.ordem),
            toNumber(row.ativo) === 1,
            row.criado_por ? toNumber(row.criado_por) : null,
            row.criado_em || null,
            row.atualizado_em || null,
            row.apagado_em || null,
          ],
        );
        itemsImported += 1;
      }
      await client.query(`SELECT setval(pg_get_serial_sequence('codigos_groups', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM codigos_groups), 1), true)`);
      await client.query(`SELECT setval(pg_get_serial_sequence('codigos_items', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM codigos_items), 1), true)`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    migrationStats.groupsImported = groupsImported;
    migrationStats.itemsImported = itemsImported;
    migrationStats.lastRunAt = startedAt;
    migrationStats.lastError = null;
  } catch (error) {
    migrationStats.lastRunAt = startedAt;
    migrationStats.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function syncGroupsFromItems(): Promise<void> {
  const items = await listItems('');
  const seen = new Set<string>();
  for (const item of items) {
    const group = groupKey(item.ean);
    if (group === 'outros' || seen.has(group)) continue;
    seen.add(group);
    await saveGroup(group, null, false);
  }
}

function validatePayload(codigo: unknown, ean: unknown, preco: unknown): { codigo: string; ean: string; priceCents: number } {
  const cleanCodigo = cleanText(codigo, 180);
  const cleanEan = cleanText(ean, 80);
  const priceCents = priceToCents(preco);
  if (!cleanCodigo) throw new Error('Informe o codigo.');
  if (!cleanEan) throw new Error('Informe o EAN.');
  if (priceCents <= 0) throw new Error('Informe um preco maior que zero.');
  return { codigo: cleanCodigo, ean: cleanEan, priceCents };
}

function mapItem(row: CodeItemRow): CodeItem {
  return {
    id: toNumber(row.id),
    legacy_mysql_id: row.legacy_mysql_id === null ? null : toNumber(row.legacy_mysql_id),
    codigo: row.codigo,
    ean: row.ean,
    price_cents: toNumber(row.price_cents),
    sort_order: toNumber(row.sort_order),
  };
}

async function listItems(search = ''): Promise<CodeItem[]> {
  const text = cleanText(search, 120);
  if (text) {
    const result = await pgPool.query<CodeItemRow>(
      `SELECT id::text, legacy_mysql_id::text, codigo, ean, price_cents::text, sort_order, active, created_by, created_at::text, updated_at::text, deleted_at::text
         FROM codigos_items
        WHERE active = true AND (codigo ILIKE $1 OR ean ILIKE $1)
        ORDER BY sort_order ASC, id ASC`,
      [`%${text}%`],
    );
    return result.rows.map(mapItem);
  }
  const result = await pgPool.query<CodeItemRow>(
    `SELECT id::text, legacy_mysql_id::text, codigo, ean, price_cents::text, sort_order, active, created_by, created_at::text, updated_at::text, deleted_at::text
       FROM codigos_items
      WHERE active = true
      ORDER BY sort_order ASC, id ASC`,
  );
  return result.rows.map(mapItem);
}

async function countActive(): Promise<number> {
  const result = await pgPool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM codigos_items WHERE active = true');
  return toNumber(result.rows[0]?.total);
}

function internalSearchTerms(value: unknown): string[] {
  const text = cleanText(value, 180).toLowerCase();
  const terms = text
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term && !['codigo', 'codigos', 'comissao', 'preco', 'precos'].includes(term));

  const digitMatches = text.match(/\b\d{2,14}\b/g) || [];
  return Array.from(new Set([...terms, ...digitMatches])).slice(0, 5);
}

async function internalSearchItems(query: unknown): Promise<CodeItem[]> {
  const terms = internalSearchTerms(query);
  if (!terms.length) return [];

  const where: string[] = [];
  const values: string[] = [];
  terms.forEach((term, index) => {
    values.push(`%${term}%`);
    where.push(`(codigo ILIKE $${index + 1} OR ean ILIKE $${index + 1})`);
  });

  const result = await pgPool.query<CodeItemRow>(
    `SELECT id::text, legacy_mysql_id::text, codigo, ean, price_cents::text, sort_order, active, created_by, created_at::text, updated_at::text, deleted_at::text
       FROM codigos_items
      WHERE active = true AND (${where.join(' OR ')})
      ORDER BY sort_order ASC, id ASC
      LIMIT 8`,
    values,
  );
  return result.rows.map(mapItem);
}

async function findItem(id: number): Promise<CodeItem | null> {
  if (id <= 0) return null;
  const result = await pgPool.query<CodeItemRow>(
    `SELECT id::text, legacy_mysql_id::text, codigo, ean, price_cents::text, sort_order, active, created_by, created_at::text, updated_at::text, deleted_at::text
       FROM codigos_items
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapItem(result.rows[0]) : null;
}

async function savedGroupKeys(): Promise<string[]> {
  const result = await pgPool.query<GroupRow>(
    `SELECT id::text, legacy_mysql_id::text, group_key, label, sort_order, active
       FROM codigos_groups
      WHERE active = true
      ORDER BY sort_order ASC, group_key ASC`,
  );
  return result.rows.map((row) => row.group_key).filter((group) => /^\d{2}$/.test(group));
}

async function saveGroup(groupValue: string, userId: number | null, shouldLog: boolean): Promise<string> {
  const group = normalizeGroupKey(groupValue);
  if (!/^\d{2}$/.test(group)) {
    throw new Error('Informe um EAN com 2 digitos.');
  }
  const nextOrderResult = await pgPool.query<{ next_order: string }>('SELECT COALESCE(MAX(sort_order), 20) + 10 AS next_order FROM codigos_groups');
  await pgPool.query(
    `INSERT INTO codigos_groups (group_key, label, sort_order, active, created_by, updated_at)
     VALUES ($1, $2, $3, true, $4, NOW())
     ON CONFLICT (group_key) DO UPDATE SET label = EXCLUDED.label, active = true, deleted_at = NULL, updated_at = NOW()`,
    [group, groupLabel(group), toNumber(nextOrderResult.rows[0]?.next_order), userId],
  );
  if (shouldLog) {
    await auditPg('codigo_bloco_criado', 'codigo', group, userId, `Bloco ${groupLabel(group)} criado.`);
    void logCoreAudit(userId, 'codigo_bloco_criado', 'codigo', group, `Bloco ${groupLabel(group)} criado.`);
    void logMysql(userId, 'codigo_bloco_criado', 'codigo', null, `Bloco ${groupLabel(group)} criado.`);
    void mirrorGroupToMysql(group, userId);
  }
  return group;
}

async function ensureGroupForEan(ean: string, userId: number | null): Promise<void> {
  const group = groupKey(ean);
  if (group !== 'outros') {
    await saveGroup(group, userId, false);
  }
}

async function groupItems(items: CodeItem[]): Promise<Record<string, CodeItem[]>> {
  const groups: Record<string, CodeItem[]> = {};
  for (const group of await savedGroupKeys()) {
    groups[group] = [];
  }
  for (const item of items) {
    const group = groupKey(item.ean);
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  }
  return groups;
}

async function orderedGroupKeys(groups: Record<string, CodeItem[]>): Promise<string[]> {
  const keys = Array.from(new Set([...(await savedGroupKeys()), ...Object.keys(groups)]));
  const numeric = keys.filter((key) => /^\d{2}$/.test(key));
  numeric.sort((left, right) => {
    if (left === '20') return right === '20' ? 0 : -1;
    if (right === '20') return 1;
    if (left === '40') return right === '40' ? 0 : -1;
    if (right === '40') return 1;
    return Number(left) - Number(right);
  });
  return numeric;
}

async function groupIds(group: string): Promise<number[]> {
  const items = await listItems('');
  return items.filter((item) => groupKey(item.ean) === group).map((item) => item.id);
}

async function createItem(codigoValue: unknown, eanValue: unknown, precoValue: unknown, userId: number | null): Promise<number> {
  const payload = validatePayload(codigoValue, eanValue, precoValue);
  await ensureGroupForEan(payload.ean, userId);
  const orderResult = await pgPool.query<{ next_order: string }>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM codigos_items');
  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO codigos_items (codigo, ean, price_cents, sort_order, created_by, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id::text`,
    [payload.codigo, payload.ean, payload.priceCents, toNumber(orderResult.rows[0]?.next_order), userId],
  );
  const id = toNumber(result.rows[0]?.id);
  await auditPg('codigo_comissao_criado', 'codigo', id, userId, `Codigo criado: ${payload.codigo} / ${payload.ean}`);
  void logCoreAudit(userId, 'codigo_comissao_criado', 'codigo', id, `Codigo criado: ${payload.codigo} / ${payload.ean}`);
  void logMysql(userId, 'codigo_comissao_criado', 'codigo', id, `Codigo criado: ${payload.codigo} / ${payload.ean}`);
  void mirrorItemToMysql(id, userId);
  return id;
}

async function updateItem(id: number, codigoValue: unknown, eanValue: unknown, precoValue: unknown, userId: number | null): Promise<void> {
  if (id <= 0) throw new Error('Codigo invalido.');
  const payload = validatePayload(codigoValue, eanValue, precoValue);
  await ensureGroupForEan(payload.ean, userId);
  const result = await pgPool.query(
    `UPDATE codigos_items
        SET codigo = $1, ean = $2, price_cents = $3, updated_at = NOW()
      WHERE id = $4 AND active = true`,
    [payload.codigo, payload.ean, payload.priceCents, id],
  );
  if ((result.rowCount || 0) < 1) throw new Error('Codigo nao encontrado.');
  await auditPg('codigo_comissao_editado', 'codigo', id, userId, `Codigo editado: ${payload.codigo} / ${payload.ean}`);
  void logCoreAudit(userId, 'codigo_comissao_editado', 'codigo', id, `Codigo editado: ${payload.codigo} / ${payload.ean}`);
  void logMysql(userId, 'codigo_comissao_editado', 'codigo', id, `Codigo editado: ${payload.codigo} / ${payload.ean}`);
  void mirrorItemToMysql(id, userId);
}

async function deleteItem(id: number, userId: number | null): Promise<void> {
  if (id <= 0) throw new Error('Codigo invalido.');
  const result = await pgPool.query(
    `UPDATE codigos_items
        SET active = false, deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND active = true`,
    [id],
  );
  if ((result.rowCount || 0) < 1) throw new Error('Codigo nao encontrado.');
  await auditPg('codigo_comissao_apagado', 'codigo', id, userId, 'Codigo apagado da lista operacional.');
  void logCoreAudit(userId, 'codigo_comissao_apagado', 'codigo', id, 'Codigo apagado da lista operacional.');
  void logMysql(userId, 'codigo_comissao_apagado', 'codigo', id, 'Codigo apagado da lista operacional.');
  void mirrorItemDeleteToMysql(id);
}

async function reorderGroup(group: string, orderedIds: unknown[], userId: number | null): Promise<void> {
  if (!isValidGroupKey(group)) throw new Error('Grupo invalido.');
  const currentIds = await groupIds(group);
  if (currentIds.length < 1) return;
  const currentSet = new Set(currentIds);
  const seen = new Set<number>();
  const finalIds: number[] = [];
  for (const rawId of orderedIds) {
    const id = toNumber(rawId);
    if (id > 0 && currentSet.has(id) && !seen.has(id)) {
      seen.add(id);
      finalIds.push(id);
    }
  }
  for (const id of currentIds) {
    if (!seen.has(id)) finalIds.push(id);
  }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (const [index, id] of finalIds.entries()) {
      await client.query('UPDATE codigos_items SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND active = true', [
        (index + 1) * 10,
        id,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await auditPg('codigo_comissao_reordenado', 'codigo', group, userId, `Grupo ${group} reordenado.`);
  void logCoreAudit(userId, 'codigo_comissao_reordenado', 'codigo', group, `Grupo ${group} reordenado.`);
  void logMysql(userId, 'codigo_comissao_reordenado', 'codigo', null, `Grupo ${group} reordenado.`);
  void mirrorGroupOrderToMysql(finalIds);
}

async function deleteGroup(groupValue: string, password: string, userId: number | null): Promise<number> {
  const group = normalizeGroupKey(groupValue);
  if (!canDeleteGroup(group)) throw new Error('Este bloco nao pode ser apagado.');
  if (!crypto.timingSafeEqual(crypto.createHash('sha256').update(GROUP_DELETE_PASSWORD).digest(), crypto.createHash('sha256').update(password).digest())) {
    throw new Error('Senha incorreta para excluir a tabela.');
  }
  const groupItemIds = await groupIds(group);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const groupResult = await client.query('UPDATE codigos_groups SET active = false, deleted_at = NOW(), updated_at = NOW() WHERE group_key = $1 AND active = true', [group]);
    if ((groupResult.rowCount || 0) < 1 && groupItemIds.length < 1) {
      throw new Error('Bloco nao encontrado.');
    }
    if (groupItemIds.length > 0) {
      await client.query('UPDATE codigos_items SET active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = ANY($1::bigint[]) AND active = true', [groupItemIds]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await auditPg('codigo_bloco_apagado', 'codigo', group, userId, `Bloco ${groupLabel(group)} apagado com ${groupItemIds.length} codigo(s).`);
  void logCoreAudit(userId, 'codigo_bloco_apagado', 'codigo', group, `Bloco ${groupLabel(group)} apagado com ${groupItemIds.length} codigo(s).`);
  void logMysql(userId, 'codigo_bloco_apagado', 'codigo', null, `Bloco ${groupLabel(group)} apagado com ${groupItemIds.length} codigo(s).`);
  void mirrorGroupDeleteToMysql(group, groupItemIds);
  return groupItemIds.length;
}

async function mirrorGroupToMysql(group: string, userId: number | null): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    await mysqlDb().query(
      `INSERT INTO wf_codigos_blocos (group_key, label, ordem, criado_por)
       VALUES (?, ?, (SELECT COALESCE(MAX(ordem), 20) + 10 FROM (SELECT ordem FROM wf_codigos_blocos) AS x), ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), ativo = 1`,
      [group, groupLabel(group), userId],
    );
  } catch (error) {
    console.error('[codigos] group mirror failed', error);
  }
}

async function mirrorItemToMysql(id: number, userId: number | null): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    const item = await findItem(id);
    if (!item) return;
    const preco = (item.price_cents / 100).toFixed(2);
    if (item.legacy_mysql_id) {
      await mysqlDb().query(
        'UPDATE wf_codigos_comissao SET codigo = ?, ean = ?, preco = ?, ordem = ?, ativo = 1 WHERE id = ?',
        [item.codigo, item.ean, preco, item.sort_order, item.legacy_mysql_id],
      );
      return;
    }
    const [result] = await mysqlDb().query<mysql.ResultSetHeader>(
      'INSERT INTO wf_codigos_comissao (codigo, ean, preco, ordem, criado_por) VALUES (?, ?, ?, ?, ?)',
      [item.codigo, item.ean, preco, item.sort_order, userId],
    );
    await pgPool.query('UPDATE codigos_items SET legacy_mysql_id = $1 WHERE id = $2 AND legacy_mysql_id IS NULL', [result.insertId, id]);
  } catch (error) {
    console.error('[codigos] item mirror failed', error);
  }
}

async function mirrorItemDeleteToMysql(id: number): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    const result = await pgPool.query<{ legacy_mysql_id: string | null }>('SELECT legacy_mysql_id::text FROM codigos_items WHERE id = $1 LIMIT 1', [id]);
    const legacyId = toNumber(result.rows[0]?.legacy_mysql_id);
    if (legacyId > 0) {
      await mysqlDb().query('UPDATE wf_codigos_comissao SET ativo = 0, apagado_em = NOW() WHERE id = ? AND ativo = 1', [legacyId]);
    }
  } catch (error) {
    console.error('[codigos] item delete mirror failed', error);
  }
}

async function mirrorGroupOrderToMysql(ids: number[]): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    for (const [index, id] of ids.entries()) {
      const result = await pgPool.query<{ legacy_mysql_id: string | null }>('SELECT legacy_mysql_id::text FROM codigos_items WHERE id = $1 LIMIT 1', [id]);
      const legacyId = toNumber(result.rows[0]?.legacy_mysql_id);
      if (legacyId > 0) {
        await mysqlDb().query('UPDATE wf_codigos_comissao SET ordem = ? WHERE id = ? AND ativo = 1', [(index + 1) * 10, legacyId]);
      }
    }
  } catch (error) {
    console.error('[codigos] reorder mirror failed', error);
  }
}

async function mirrorGroupDeleteToMysql(group: string, ids: number[]): Promise<void> {
  if (!LEGACY_MYSQL_MIRROR_ENABLED) return;
  try {
    await mysqlDb().query('UPDATE wf_codigos_blocos SET ativo = 0 WHERE group_key = ? AND ativo = 1', [group]);
    for (const id of ids) {
      await mirrorItemDeleteToMysql(id);
    }
  } catch (error) {
    console.error('[codigos] group delete mirror failed', error);
  }
}

function groupTitleHtml(group: string, count: number): string {
  const deleteButton = canDeleteGroup(group)
    ? `<button type="button" class="codes-btn codes-btn-table-delete" data-delete-code-group="${e(group)}" data-delete-code-group-label="${e(groupLabel(group))}">Excluir tabela</button>`
    : '';
  return `<div class="codes-sheet-title">
                        <h2>${e(groupLabel(group))}</h2>
                        <div class="codes-sheet-title-actions">
                            <span data-code-group-count="${e(group)}">${e(String(count))} item(ns)</span>
                            ${deleteButton}
                        </div>
                    </div>`;
}

function renderRow(req: Request, item: CodeItem, group: string, index: number): string {
  return `<form method="post" class="codes-row" role="row" data-code-row data-code-group="${e(group)}">
                                    ${csrfField(req)}
                                    <input type="hidden" name="action" value="update">
                                    <input type="hidden" name="id" value="${e(item.id)}">
                                    <span class="codes-row-number codes-row-drag-handle" data-drag-handle title="Arraste para mudar a ordem">${e(index + 1)}</span>
                                    <label>
                                        <span>C&oacute;digo</span>
                                        <textarea name="codigo" maxlength="180" rows="1" spellcheck="false" required>${e(item.codigo)}</textarea>
                                    </label>
                                    <label>
                                        <span>EAN</span>
                                        <input type="text" name="ean" value="${e(item.ean)}" maxlength="80" required>
                                    </label>
                                    <label>
                                        <span>Pre&ccedil;o</span>
                                        <input type="text" name="preco" value="${e(priceInput(item.price_cents))}" inputmode="decimal" data-price-input required>
                                    </label>
                                    <div class="codes-row-actions">
                                        <span class="codes-save-status" data-save-status>Salvo</span>
                                        <button type="submit" name="action" value="delete" class="codes-btn codes-btn-danger" data-confirm-delete formnovalidate>Apagar</button>
                                    </div>
                                </form>`;
}

function renderNewRow(req: Request, group: string): string {
  return `<form method="post" class="codes-row codes-row-new" role="row" data-code-row data-new-row data-code-group="${e(group)}">
                                ${csrfField(req)}
                                <input type="hidden" name="action" value="create">
                                <input type="hidden" name="id" value="">
                                <span class="codes-row-number">+</span>
                                <label>
                                    <span>C&oacute;digo</span>
                                    <textarea name="codigo" maxlength="180" rows="1" spellcheck="false" placeholder="Novo codigo" required></textarea>
                                </label>
                                <label>
                                    <span>EAN</span>
                                    <input type="text" name="ean" maxlength="80" placeholder="${e(defaultEanPlaceholder(group))}" required>
                                </label>
                                <label>
                                    <span>Pre&ccedil;o</span>
                                    <input type="text" name="preco" inputmode="decimal" data-price-input placeholder="0,00" required>
                                </label>
                                <div class="codes-row-actions">
                                    <span class="codes-save-status is-muted" data-save-status>Novo</span>
                                </div>
                            </form>`;
}

function renderPanel(req: Request, group: string, items: CodeItem[], includeNewRow: boolean): string {
  return `<section class="codes-sheet-panel${group === 'outros' ? ' codes-sheet-panel-other' : ''}" aria-label="${e(groupLabel(group))}" data-code-group-panel="${e(group)}">
                    ${groupTitleHtml(group, items.length)}
                    <div class="codes-sheet-scroll">
                        <div class="codes-sheet" role="table" aria-label="${e(groupLabel(group))}">
                            <div class="codes-sheet-head" role="row">
                                <span>#</span>
                                <span>C&Oacute;DIGO</span>
                                <span>EAN</span>
                                <span>PRE&Ccedil;O</span>
                                <span>STATUS</span>
                            </div>
                            ${items.map((item, index) => renderRow(req, item, group, index)).join('')}
                            ${includeNewRow ? renderNewRow(req, group) : ''}
                        </div>
                    </div>
                </section>`;
}

async function renderIndex(req: Request, flashOverride?: Flash): Promise<string> {
  const search = cleanText(req.query.q, 120);
  let items: CodeItem[] = [];
  let groups: Record<string, CodeItem[]> = { '20': [], '40': [], outros: [] };
  let keys = ['20', '40'];
  let total = 0;
  let flash = flashOverride || takeFlash(req);
  try {
    items = await listItems(search);
    groups = await groupItems(items);
    keys = await orderedGroupKeys(groups);
    total = await countActive();
  } catch (error) {
    console.error('[codigos] list failed', error);
    flash = { type: 'error', message: 'Nao consegui carregar os codigos agora.' };
  }
  const filtered = search ? `<span><strong>${e(items.length)}</strong> filtrado(s)</span>` : '';
  const alert = flash.message ? `<div class="codes-alert ${e(flash.type)}">${e(flash.message)}</div>` : '';
  const clearSearch = search ? `<a class="codes-btn codes-btn-soft" href="${BASE_PATH}/">Limpar</a>` : '';
  const panels = keys.map((key) => renderPanel(req, key, groups[key] || [], true)).join('');
  const otherPanel = groups.outros?.length ? renderPanel(req, 'outros', groups.outros, false) : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codigos - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260525a">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260529a">
    <script src="${BASE_PATH}/app.js?v=20260525a" defer></script>
    <script src="/miauw/widget.js?v=20260529a" defer></script>
</head>
<body class="codes-app-body">
    <header class="codes-topbar">
        <a class="codes-brand" href="/">
            <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
            <strong>C&oacute;digos</strong>
        </a>
        <nav class="codes-nav" aria-label="Navegacao">
            <a href="/">Home</a>
            <a href="${BASE_PATH}/logout.php">Sair</a>
        </nav>
    </header>

    <main class="codes-page" data-miauby-screen-object="modulo codigos" data-miauby-screen-label="Modulo Codigos: ${e(total)} codigo(s) ativo(s)">
        <section class="codes-hero">
            <div>
                <h1>C&oacute;digos</h1>
            </div>
            <div class="codes-stats" aria-label="Resumo">
                <span><strong data-total-count>${e(total)}</strong> ativo(s)</span>
                ${filtered}
            </div>
        </section>

        ${alert}

        <section class="codes-toolbar" aria-label="Ferramentas">
            <form method="get" class="codes-search">
                <label>
                    <span>Buscar</span>
                    <input type="search" name="q" value="${e(search)}" placeholder="Codigo ou EAN">
                </label>
                <button type="submit" class="codes-btn">Filtrar</button>
                ${clearSearch}
            </form>
            <div class="codes-group-adder" data-group-adder>
                <input type="text" inputmode="numeric" maxlength="2" data-new-group-input aria-label="Prefixo do novo bloco de EAN" placeholder="EAN">
                <button type="button" class="codes-btn codes-btn-icon" data-add-code-group aria-label="Criar novo bloco de EAN" title="Criar novo bloco de EAN">+</button>
            </div>
        </section>

        <section class="codes-sheet-board" aria-label="Tabelas de codigos por EAN">
            ${panels}
            ${otherPanel}
            <button type="button" class="codes-sheet-panel codes-add-panel" data-focus-group-adder aria-label="Ir para criacao de bloco de EAN" title="Ir para criacao de bloco de EAN">
                <span>+</span>
            </button>
        </section>
    </main>

    <div class="codes-dialog" hidden data-group-delete-dialog role="dialog" aria-modal="true" aria-labelledby="codes-delete-title">
        <div class="codes-dialog-card">
            <span class="codes-dialog-kicker">Acao forte</span>
            <h2 id="codes-delete-title">Excluir tabela</h2>
            <p>Essa acao apaga a tabela inteira e todos os codigos ativos dentro dela.</p>
            <strong data-group-delete-label>EAN</strong>
            <label>
                <span>Senha para excluir</span>
                <input type="password" data-group-delete-password autocomplete="off" placeholder="Digite a senha">
            </label>
            <div class="codes-dialog-error" hidden data-group-delete-error></div>
            <div class="codes-dialog-actions">
                <button type="button" class="codes-btn" data-cancel-group-delete>Cancelar</button>
                <button type="button" class="codes-btn codes-btn-danger-solid" data-confirm-group-delete>Excluir tabela</button>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function renderLogin(req: Request, error = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codigos - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260518a">
    <script src="${BASE_PATH}/login-runner.js?v=20260515b" defer></script>
</head>
<body class="codes-login-body">
    <img class="login-screen-runner" src="/cashback/gato-hapy.gif" alt="" aria-hidden="true" data-login-runner>

    <main class="codes-login-card">
        <img class="codes-login-logo" src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
        <span class="codes-kicker">Wimifarma Codigos</span>
        <h1>Acesso dos c&oacute;digos</h1>
        <p>Lista rapida para codigo, EAN e preco de itens com comissao diferente.</p>

        ${error ? `<div class="codes-alert error">${e(error)}</div>` : ''}

        <form method="post" class="codes-login-form">
            ${csrfField(req)}
            <label>
                <span>Usuario</span>
                <input type="text" name="username" required autofocus autocomplete="username" value="${e(req.body?.username || '')}">
            </label>
            <label>
                <span>Senha</span>
                <input type="password" name="password" required autocomplete="current-password">
            </label>
            <button type="submit" class="codes-btn codes-btn-primary">Entrar</button>
        </form>
    </main>
</body>
</html>`;
}

async function healthPayload() {
  const [postgresStats, legacyStats, coreStats] = await Promise.all([postgresHealth(), legacyHealth(), coreHealth()]);
  return {
    ok: true,
    service: 'codigos',
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    storage: {
      provider: 'postgres',
      database: env.POSTGRES_DB || 'wimifarma_codigos',
      legacy_mysql_required: LEGACY_MYSQL_REQUIRED,
      legacy_mysql_import_enabled: LEGACY_MYSQL_IMPORT_ENABLED,
      legacy_mysql_mirror_enabled: LEGACY_MYSQL_MIRROR_ENABLED,
      legacy_mysql_logs_enabled: LEGACY_MYSQL_LOGS_ENABLED,
      migration: migrationStats,
      postgres: postgresStats,
      legacy: legacyStats,
    },
    auth: {
      provider: AUTH_PROVIDER,
      ...coreStats,
    },
    rules: {
      protected_groups: ['20', '40', 'outros'],
      group_delete_password_configured: GROUP_DELETE_PASSWORD !== 'wimifarma',
    },
  };
}

async function postgresHealth() {
  const result = await pgPool.query<{
    items_total: string;
    items_active: string;
    groups_total: string;
    groups_active: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM codigos_items) AS items_total,
      (SELECT COUNT(*)::text FROM codigos_items WHERE active = true) AS items_active,
      (SELECT COUNT(*)::text FROM codigos_groups) AS groups_total,
      (SELECT COUNT(*)::text FROM codigos_groups WHERE active = true) AS groups_active
  `);
  return result.rows[0];
}

async function legacyHealth() {
  if (!LEGACY_MYSQL_REQUIRED) return null;
  const [rows] = await mysqlDb().query<mysql.RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM wf_codigos_comissao) AS items_total,
      (SELECT COUNT(*) FROM wf_codigos_comissao WHERE ativo = 1) AS items_active,
      (SELECT COUNT(*) FROM wf_codigos_blocos) AS groups_total,
      (SELECT COUNT(*) FROM wf_codigos_blocos WHERE ativo = 1) AS groups_active
  `);
  return rows[0] || null;
}

async function coreHealth() {
  if (!CORE_AUTH_REQUIRED) {
    return { coreReachable: false, users: null, coreLatencyMs: null };
  }
  const started = Date.now();
  const result = await corePgPool.query<{ users: string }>('SELECT COUNT(*)::text AS users FROM core_users WHERE active = true');
  return { coreReachable: true, users: toNumber(result.rows[0]?.users), coreLatencyMs: Date.now() - started };
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

async function handleApi(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req.session.user);
  if (!user) {
    res.status(401).json({ ok: false, message: 'Sessao expirada. Entre novamente.' });
    return;
  }
  if (!csrfMatches(req)) {
    res.status(419).json({ ok: false, message: 'Sessao expirada. Tente novamente.' });
    return;
  }

  const action = String(req.body.action || '');
  if (['save', 'create', 'update'].includes(action)) {
    let id = toNumber(req.body.id);
    if (id > 0) {
      await updateItem(id, req.body.codigo, req.body.ean, req.body.preco, user.id);
    } else {
      id = await createItem(req.body.codigo, req.body.ean, req.body.preco, user.id);
    }
    const item = await findItem(id);
    if (!item) throw new Error('Codigo salvo nao encontrado.');
    res.json({ ok: true, item: itemPayload(item), total: await countActive() });
    return;
  }

  if (action === 'delete') {
    await deleteItem(toNumber(req.body.id), user.id);
    res.json({ ok: true, total: await countActive() });
    return;
  }

  if (action === 'reorder') {
    const ids = JSON.parse(String(req.body.ids || '[]')) as unknown[];
    if (!Array.isArray(ids)) throw new Error('Ordem invalida.');
    await reorderGroup(String(req.body.group || ''), ids, user.id);
    res.json({ ok: true, total: await countActive() });
    return;
  }

  if (action === 'create_group') {
    const group = await saveGroup(String(req.body.group || ''), user.id, true);
    res.json({ ok: true, group: groupPayload(group), total: await countActive() });
    return;
  }

  if (action === 'delete_group') {
    const deletedItems = await deleteGroup(String(req.body.group || ''), String(req.body.password || ''), user.id);
    res.json({ ok: true, deleted_items: deletedItems, total: await countActive() });
    return;
  }

  res.status(400).json({ ok: false, message: 'Acao invalida.' });
}

async function handlePost(req: Request, res: Response): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    res.redirect(`${BASE_PATH}/`);
    return;
  }
  try {
    const action = String(req.body.action || '');
    if (action === 'create') {
      await createItem(req.body.codigo, req.body.ean, req.body.preco, user.id);
      setFlash(req, 'success', 'Codigo adicionado.');
    } else if (action === 'update') {
      await updateItem(toNumber(req.body.id), req.body.codigo, req.body.ean, req.body.preco, user.id);
      setFlash(req, 'success', 'Codigo atualizado.');
    } else if (action === 'delete') {
      await deleteItem(toNumber(req.body.id), user.id);
      setFlash(req, 'success', 'Codigo apagado da lista.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar os codigos agora.');
  }
  res.redirect(`${BASE_PATH}/`);
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.path.startsWith(BASE_PATH)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use(express.json({ limit: '128kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, { index: false, dotfiles: 'ignore' }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  res.json(await healthPayload());
}));

app.get(`${BASE_PATH}/api/internal/summary`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;

  const [total, groupsResult, recentResult] = await Promise.all([
    countActive(),
    pgPool.query<{ group_key: string; total: string }>(
      `WITH grouped AS (
          SELECT
            CASE
              WHEN regexp_replace(ean, '[^0-9]', '', 'g') ~ '^[0-9]{2}'
                THEN substring(regexp_replace(ean, '[^0-9]', '', 'g') FROM 1 FOR 2)
              ELSE 'outros'
            END AS group_key,
            COUNT(*)::text AS total
           FROM codigos_items
          WHERE active = true
          GROUP BY 1
        )
        SELECT group_key, total
          FROM grouped
         ORDER BY CASE WHEN group_key = '20' THEN 1 WHEN group_key = '40' THEN 2 WHEN group_key = 'outros' THEN 99 ELSE 10 END, group_key ASC`,
    ),
    pgPool.query<CodeItemRow>(
      `SELECT id::text, legacy_mysql_id::text, codigo, ean, price_cents::text, sort_order, active, created_by, created_at::text, updated_at::text, deleted_at::text
         FROM codigos_items
        WHERE active = true
        ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
        LIMIT 5`,
    ),
  ]);

  res.json({
    ok: true,
    total,
    groups: groupsResult.rows.map((row) => ({
      group: row.group_key,
      label: groupLabel(row.group_key),
      total: toNumber(row.total),
    })),
    recent: recentResult.rows.map(mapItem).map(internalItemPayload),
  });
}));

app.get(`${BASE_PATH}/api/internal/search`, asyncRoute(async (req, res) => {
  if (!requireInternalToken(req, res)) return;

  const q = String(req.query.q || req.query.busca || '');
  const items = await internalSearchItems(q);
  res.json({
    ok: true,
    items: items.map(internalItemPayload),
  });
}));

app.get(`${BASE_PATH}/internal/migration-status`, asyncRoute(async (_req, res) => {
  res.json(await healthPayload());
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
  const waitSeconds = loginWaitSeconds(req);
  if (waitSeconds > 0) {
    res.status(429).type('html').send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`));
    return;
  }
  const username = cleanText(req.body.username, 120);
  const password = String(req.body.password || '');
  const user = await authenticate(username, password);
  if (!user) {
    registerLoginFailure(req);
    void logCoreAudit(null, 'login_codigos_falha', 'user', null, `Tentativa de login Codigos falhou para usuario: ${username}`);
    void logMysql(null, 'login_codigos_falha', 'user', null, `Tentativa de login Codigos falhou para usuario: ${username}`);
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
    void logCoreAudit(user.id, 'login_codigos', 'user', user.id, 'Login Codigos realizado.');
    void logMysql(user.id, 'login_codigos', 'user', user.id, 'Login Codigos realizado.');
    res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  const user = req.session.user;
  if (user) {
    void logCoreAudit(user.id, 'logout_codigos', 'user', user.id, 'Logout Codigos realizado.');
    void logMysql(user.id, 'logout_codigos', 'user', user.id, 'Logout Codigos realizado.');
  }
  req.session.destroy(() => res.redirect('/'));
});

app.get([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.type('html').send(await renderIndex(req));
}));

app.post([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(handlePost));

app.post(`${BASE_PATH}/api.php`, asyncRoute(async (req, res) => {
  try {
    await handleApi(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao consegui salvar os codigos agora.';
    const status = /invalido|nao encontrado|Informe|Senha|Bloco|Grupo|Ordem/i.test(message) ? 422 : 500;
    res.status(status).json({ ok: false, message });
  }
}));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error('[codigos] request failed', error);
  if (res.headersSent) return;
  if (req.path.endsWith('/api.php')) {
    res.status(500).json({ ok: false, message: 'Nao consegui salvar os codigos agora.' });
    return;
  }
  res.status(500).type('html').send('<h1>Erro no Codigos</h1>');
});

async function withRetry(label: string, action: () => Promise<unknown>, attempts = 30): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await action();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  throw new Error(`${label} unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function start(): Promise<void> {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  if (CORE_AUTH_REQUIRED) {
    await withRetry('core postgres', () => corePgPool.query('SELECT COUNT(*) FROM core_users'));
  }
  if (LEGACY_MYSQL_REQUIRED) {
    await withRetry('mysql', () => mysqlDb().query('SELECT 1'));
  }
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`[codigos] listening on ${PORT} at ${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[codigos] failed to start', error);
  process.exitCode = 1;
});
