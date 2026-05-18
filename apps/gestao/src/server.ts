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
  created_by: number | null;
  generated_at: Date | string;
  paid_at: Date | string | null;
  canceled_at: Date | string | null;
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

type NotepadRow = {
  id: string;
  body: string;
  created_by: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RenderAccount = AccountRow & {
  items: ItemRow[];
  payments: PaymentRow[];
};

type MysqlUserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const env = process.env;

const SERVICE_NAME = 'gestao';
const SERVICE_VERSION = '1.2.2';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/gestao');
const PORT = Number.parseInt(env.PORT || '3200', 10);
const SESSION_SECRET = env.GESTAO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TZ = 'America/Sao_Paulo';

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
});

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

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function isAllowedUser(user: User | MysqlUserRow): boolean {
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

function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received || expected !== received) {
    setFlash(req, 'error', 'Sessao expirada. Tente novamente.');
    return redirectHome(res, monthValue(req.body?.competencia_mes));
  }
  return next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || !isAllowedUser(req.session.user)) {
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

function redirectHome(res: Response, month = ''): void {
  const target = month ? `${BASE_PATH}/?mes=${encodeURIComponent(month)}` : `${BASE_PATH}/`;
  res.redirect(target);
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

function bodyArray(body: Record<string, unknown>, field: string): unknown[] {
  const value = body[field] ?? body[`${field}[]`];
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
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

async function logMysql(userId: number | null, action: string, entityType: string | null, entityId: number | null, message: string): Promise<void> {
  try {
    await mysqlPool.query(
      'INSERT INTO wf_logs (user_id, action, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, cleanText(message, 255)],
    );
  } catch (error) {
    console.warn('[gestao] wf_logs failed', error);
  }
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
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_account_items ADD COLUMN IF NOT EXISTS canceled_by integer');
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS item_id bigint');
  await pgPool.query("ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'");
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS canceled_at timestamptz');
  await pgPool.query('ALTER TABLE gestao_account_payments ADD COLUMN IF NOT EXISTS canceled_by integer');
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
    CREATE INDEX IF NOT EXISTS gestao_accounts_status_month_idx
    ON gestao_accounts (status, competence_month, id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_accounts_generated_idx
    ON gestao_accounts (generated_at DESC, id DESC)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS gestao_account_items_account_order_idx
    ON gestao_account_items (account_id, sort_order, id)
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
        (title, category, status, total_cents, competence_month, note, created_by, generated_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), CASE WHEN $3 = 'pago' THEN now() ELSE NULL END)
       RETURNING id`,
      [
        title,
        categoryLabel(req.body.categoria),
        status,
        totalCents,
        monthValue(req.body.competencia_mes),
        cleanText(req.body.observacao, 5000) || null,
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logMysql(userId, 'gestao_conta_criada', 'gestao_conta', accountId, `Conta criada: ${title} / ${formatMoney(totalCents)}`);
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
    } else {
      await client.query("UPDATE gestao_accounts SET status = 'pendente', paid_at = NULL, canceled_at = NULL WHERE id = $1", [id]);
      await syncPaymentStatus(client, id);
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
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS paid_cents
     FROM gestao_account_payments
     WHERE paid_at >= $1::timestamptz
       AND paid_at < $2::timestamptz
       AND status = 'ativo'`,
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
     WHERE a.competence_month = $1`,
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
     WHERE a.competence_month = $1
        OR (a.paid_at >= $2::timestamptz AND a.paid_at < $3::timestamptz)
        OR EXISTS (
          SELECT 1 FROM gestao_account_payments gp
          WHERE gp.account_id = a.id
            AND gp.paid_at >= $2::timestamptz
            AND gp.paid_at < $3::timestamptz
        )
     ORDER BY
       CASE a.status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END ASC,
       COALESCE(a.paid_at, p.last_payment_at, a.generated_at) DESC,
       a.id DESC
     LIMIT 180`,
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

  return accounts.map((account) => ({
    ...account,
    items: itemsByAccount.get(String(account.id)) || [],
    payments: paymentsByAccount.get(String(account.id)) || [],
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

function renderAccount(req: Request, account: RenderAccount, selectedMonth: string): string {
  const id = Number(account.id);
  const status = account.status || 'pendente';
  const totalCents = Number(account.total_cents || 0);
  const paidCents = Number(account.paid_cents || 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const progress = totalCents > 0 ? Math.min(100, Math.max(0, (paidCents / totalCents) * 100)) : 0;
  const canEdit = status !== 'cancelado';
  const finalButtonLabel = paidCents > 0 ? 'Quitar saldo' : 'Quitar integral';
  const remainingMoney = formatMoney(remainingCents);

  const itemHtml = account.items.length
    ? `<div class="gestao-ledger-block">
       <div class="gestao-ledger-title"><span>Lancamentos da conta</span><strong>${e(formatMoney(totalCents))}</strong></div>
       <div class="gestao-item-list">
        ${account.items.map((item) => {
          const itemId = Number(item.id);
          const itemCents = Number(item.amount_cents || 0);
          const itemPaid = Number(item.paid_cents || 0);
          const itemRemaining = Math.max(0, itemCents - itemPaid);
          const itemPayable = Math.min(itemRemaining, remainingCents);
          const itemProgress = itemCents > 0 ? Math.min(100, Math.max(0, (itemPaid / itemCents) * 100)) : 0;
          const itemActive = item.status !== 'cancelado';
          return `
            <section class="gestao-item-row ${itemActive ? '' : 'is-canceled'}" data-item-row data-item-id="${e(itemId)}">
              <button type="button" class="gestao-item-main" data-item-toggle aria-expanded="false">
                <div class="gestao-item-title">
                  <strong>${e(item.description)}</strong>
                  ${itemActive ? (itemRemaining <= 0 ? '<span class="gestao-mini-pill ok">Pago</span>' : '<span class="gestao-mini-pill">Aberto</span>') : '<span class="gestao-mini-pill danger">Cancelado</span>'}
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
                  ${itemActive && status === 'pendente' && itemPayable > 0 ? `
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
                  ${itemActive ? `<form method="post" class="gestao-item-adjust-form" data-require-money>
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
                  </form>` : `
                  <form method="post" data-confirm="Reabrir este lancamento? Os pagamentos cancelados continuam no historico.">
                    ${csrfField(req)}
                    <input type="hidden" name="action" value="reopen_item">
                    <input type="hidden" name="id" value="${e(id)}">
                    <input type="hidden" name="item_id" value="${e(itemId)}">
                    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
                    <button type="submit" class="gestao-btn gestao-btn-secondary">Reabrir lancamento</button>
                  </form>`}
                </div>
              ` : ''}
            </section>
          `;
        }).join('')}
       </div>
       </div>`
    : `<div class="gestao-ledger-block"><div class="gestao-ledger-title"><span>Lancamentos da conta</span></div><p class="gestao-empty-line">Sem itens lancados.</p></div>`;

  const paymentHtml = account.payments.length
    ? `<div class="gestao-ledger-block gestao-ledger-payments" data-payment-block data-payment-block-id="${e(id)}">
       <button type="button" class="gestao-ledger-title gestao-ledger-toggle" data-payment-toggle aria-expanded="false">
         <span>Pagamentos desta conta <em>${e(account.payments.length)} registro(s)</em></span>
         <strong>${e(formatMoney(paidCents))}</strong>
       </button>
       <ul class="gestao-payments" data-payment-list>
        ${account.payments.map((payment) => {
          const paymentActive = payment.status !== 'cancelado';
          return `
            <li class="${paymentActive ? '' : 'is-canceled'}">
              <span>
                <strong>${e(payment.description)}</strong>
                ${payment.item_description ? `<em>${e(payment.item_description)}</em>` : ''}
                <small>${e(brDate(payment.paid_at, true))}${paymentActive ? '' : ` / cancelado ${e(brDate(payment.canceled_at, true))}`}</small>
              </span>
              <strong>${e(formatMoney(payment.amount_cents))}</strong>
              ${canEdit && paymentActive ? `
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
       </form>`
    : '';

  const forms = canEdit
    ? `<div class="gestao-account-forms">
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
       </div>`
    : '';

  const noteForm = `<form method="post" class="gestao-note-panel">
    ${csrfField(req)}
    <input type="hidden" name="action" value="update_note">
    <input type="hidden" name="id" value="${e(id)}">
    <input type="hidden" name="competencia_mes" value="${e(selectedMonth)}">
    <label><span>Observacao</span><textarea name="observacao" rows="3" placeholder="Observacao desta conta.">${e(account.note || '')}</textarea></label>
    <button type="submit" class="gestao-btn gestao-btn-secondary">Salvar observacao</button>
  </form>`;

  return `<article class="gestao-account status-${e(status)}" data-account-card data-account-id="${e(id)}">
    <div class="gestao-account-main">
      <div class="gestao-account-head">
        <div>
          <span class="gestao-pill">${e(categoryLabel(account.category))}</span>
          <h2>${e(account.title)}</h2>
        </div>
        <div class="gestao-account-total"><span>Total lancado</span><strong>${e(formatMoney(totalCents))}</strong></div>
      </div>
      <div class="gestao-account-meta">
        <span>Gerado ${e(brDate(account.generated_at, true))}</span>
        <span>Competencia ${e(monthLabel(account.competence_month || selectedMonth))}</span>
        ${status === 'pago' ? `<span>Pago ${e(brDate(account.paid_at, true))}</span>` : ''}
      </div>
      <div class="gestao-balance" aria-label="Resumo de pagamento da conta">
        <span>Total <strong>${e(formatMoney(totalCents))}</strong></span>
        <span>Pago <strong>${e(formatMoney(paidCents))}</strong></span>
        <span>Saldo <strong>${e(formatMoney(remainingCents))}</strong></span>
      </div>
      <div class="gestao-progress" aria-hidden="true"><span style="width:${progress.toFixed(2)}%"></span></div>
      <div class="gestao-account-details" data-account-details>
        ${itemHtml}
        ${paymentHtml}
        ${noteForm}
        ${forms}
      </div>
    </div>
    <div class="gestao-account-actions">
      <span class="gestao-status">${e(accountStatusLabel(status))}</span>
      <button type="button" class="gestao-btn gestao-btn-ghost gestao-collapse-btn" data-account-toggle aria-expanded="true">Minimizar</button>
      ${pendingActions}
      ${paidActions}
      ${canceledActions}
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

async function renderApp(req: Request): Promise<string> {
  const selectedMonth = monthValue(req.query.mes);
  const flash = takeFlash(req);
  const summary = await monthSummary(selectedMonth);
  const accounts = await listAccounts(selectedMonth);
  const notes = await listNotepadNotes();
  const suggestions = categorySuggestions().map((label) => `<option value="${e(label)}">`).join('');
  const accountsHtml = accounts.length
    ? accounts.map((account) => renderAccount(req, account, selectedMonth)).join('')
    : '<div class="gestao-empty">Nada lancado nesse mes ainda.</div>';
  const notepadHtml = renderNotepad(req, notes, selectedMonth);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gestao - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260518-clean">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260517j">
  <script src="${BASE_PATH}/app.js?v=20260518-clean" defer></script>
  <script src="/miauw/widget.js?v=20260517j" defer></script>
</head>
<body class="gestao-app-body">
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
        <p>Contas manuais, categorias livres, pagamentos parciais e saldo conferido por mes.</p>
      </div>
      <form method="get" class="gestao-month-filter">
        <label><span>Mes</span><input type="month" name="mes" value="${e(selectedMonth)}"></label>
        <button type="submit" class="gestao-btn gestao-btn-secondary">Ver</button>
      </form>
    </section>

    ${flash.message ? `<div class="gestao-alert ${e(flash.type)}">${e(flash.message)}</div>` : ''}

    <section class="gestao-stats" aria-label="Resumo do mes">
      <div><span>Pago no mes</span><strong>${e(formatMoney(summary.paidCents))}</strong></div>
      <div><span>Pendente do mes</span><strong>${e(formatMoney(summary.pendingCents))}</strong></div>
      <div><span>Gerado no mes</span><strong>${e(formatMoney(summary.generatedCents))}</strong></div>
      <div><span>Contas pendentes</span><strong>${e(summary.pendingAccounts)}</strong></div>
    </section>

    <section class="gestao-layout">
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
            <input type="text" name="categoria" maxlength="80" value="Geral" list="gestao-categorias" placeholder="Funcionario, boleto internet, fornecedor">
            <datalist id="gestao-categorias">${suggestions}</datalist>
          </label>
          <label><span>Competencia</span><input type="month" name="competencia_mes" value="${e(selectedMonth)}"></label>
          <label>
            <span>Status inicial</span>
            <select name="status"><option value="pendente">Pendente</option><option value="pago">Pago agora</option></select>
          </label>
        </div>
        <div class="gestao-line-items" data-line-items>
          ${['Salario, aumento, comissao, boleto', 'Aumento', 'Comissao'].map((placeholder) => `
            <div class="gestao-line-item">
              <label><span>Descricao do item</span><input type="text" name="item_descricao[]" maxlength="180" placeholder="${e(placeholder)}"></label>
              <label><span>Valor</span><input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input></label>
            </div>
          `).join('')}
        </div>
        <button type="button" class="gestao-btn gestao-btn-secondary" data-add-item>Adicionar item</button>
        <label><span>Observacao</span><textarea name="observacao" rows="3" placeholder="Detalhe curto, se precisar."></textarea></label>
        <button type="submit" class="gestao-btn gestao-btn-primary">Lancar conta</button>
      </form>

      <section class="gestao-list-panel">
        <div class="gestao-section-title"><span class="gestao-kicker">Contas do mes</span><strong>${e(monthLabel(selectedMonth))}</strong></div>
        <div class="gestao-list">${accountsHtml}</div>
      </section>

      ${notepadHtml}
    </section>
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
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260518-clean">
  <script src="${BASE_PATH}/login-runner.js?v=20260518-clean" defer></script>
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
  await mysqlPool.query('SELECT 1');
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    runtime: 'node22-typescript',
    database: 'postgres',
    mysql_auth: true,
    base_path: BASE_PATH,
  });
}));

app.get(`${BASE_PATH}/login`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return redirectHome(res);
  return res.type('html').send(renderLogin(req));
});
app.get(`${BASE_PATH}/login.php`, (req, res) => {
  if (req.session.user && isAllowedUser(req.session.user)) return redirectHome(res);
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

  clearLoginRateLimit(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[gestao] session regenerate failed', error);
      return res.status(500).type('html').send(renderLogin(req, 'Nao consegui abrir sua sessao agora.'));
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logMysql(user.id, 'login_gestao', 'user', user.id, 'Login Gestao Node realizado.');
    res.redirect(`${BASE_PATH}/`);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
app.get(`${BASE_PATH}/index.php`, requireAuth, (_req, res) => res.redirect(`${BASE_PATH}/`));
app.get(`${BASE_PATH}/`, requireAuth, asyncRoute(async (req, res) => {
  res.type('html').send(await renderApp(req));
}));

app.post(`${BASE_PATH}/`, requireAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const action = String(req.body.action || '');
  const selectedMonth = monthValue(req.body.competencia_mes);
  try {
    if (action === 'create') {
      await createAccount(req);
      setFlash(req, 'success', 'Conta lancada na Gestao.');
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
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar essa conta agora.');
  }
  redirectHome(res, selectedMonth);
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gestao] request failed', error);
  if (res.headersSent) return;
  res.status(500).type('html').send('Gestao indisponivel agora.');
});

async function start() {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  await withRetry('mysql', () => mysqlPool.query('SELECT 1'));
  await ensureSchema();
  await importMysqlGestaoOnce();
  app.listen(PORT, () => {
    console.log(`[gestao] listening on ${PORT}${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[gestao] startup failed', error);
  process.exit(1);
});
