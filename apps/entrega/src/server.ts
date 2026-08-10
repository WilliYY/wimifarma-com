import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import connectPgSimple from 'connect-pg-simple';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import {
  canManageAll,
  cleanSingleLine,
  isBareBasePath,
  localDateParts,
  normalizeHistoryFilters,
  normalizeMonth,
  normalizeUsername,
  previousMonth,
  validateCommissionPaymentInput,
  validateDeliveryInput,
  validateResponsibleUserId,
  type HistoryFilters,
  type SessionUser,
} from './domain.js';
import {
  renderDashboard,
  renderCommissionPaymentReceipt,
  renderPrintReceipt,
  type AuditRow,
  type DeliveryRow,
  type Flash,
  type LeaderRow,
  type MineSummary,
  type CommissionOverviewRow,
  type CommissionPaymentRow,
  type Summary,
  type UserOption,
} from './views.js';

const { Pool } = pg;

type CoreUserRow = QueryResultRow & {
  id: string;
  username: string;
  display_name: string | null;
  role: string | null;
  active: boolean;
};

type CountRow = QueryResultRow & {
  generated: string;
  active: string;
  cancelled: string;
  commission_cents: string;
  pending_commission_cents: string;
  paid_commission_cents: string;
  today?: string;
};

type DeliveryIdRow = QueryResultRow & { id: string; created_by_user_id: string; status: 'ACTIVE' | 'CANCELLED' };
type CommissionIdRow = QueryResultRow & { id: string; delivery_id: string; amount_cents: string };
type TotalRow = QueryResultRow & { total: string };
type HealthRow = QueryResultRow & {
  generated: string;
  active: string;
  cancelled: string;
  orphan_deliveries: string;
  status_mismatches: string;
  payment_count_mismatches: string;
  payment_total_mismatches: string;
  paid_cancelled_commissions: string;
};

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    creationToken?: string;
    paymentToken?: string;
    flash?: Flash;
    printDeliveryId?: number;
    printPaymentId?: number;
    returnTo?: string;
    user?: SessionUser;
  }
}

const env = process.env;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');

const SERVICE_NAME = 'entrega';
const SERVICE_VERSION = '1.2.0';
const TIME_ZONE = 'America/Sao_Paulo';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/entrega');
const PORT = Number.parseInt(env.PORT || '3980', 10);
const SESSION_SECRET = env.ENTREGA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const PAGE_SIZE = 50;

const deliveryPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_entrega',
  user: env.POSTGRES_USER || 'wimifarma_entrega',
  password: env.POSTGRES_PASSWORD || '',
  max: 10,
});

const corePool = new Pool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 5,
});

const app = express();
app.set('trust proxy', 1);
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFENTREGA',
  secret: SESSION_SECRET,
  store: new PgSession({ pool: deliveryPool, tableName: 'entrega_sessions', createTableIfMissing: true }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production' ? 'auto' : false,
    maxAge: 1000 * 60 * 60 * 10,
  },
});

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean === '' ? '/entrega' : clean;
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function publicUser(row: CoreUserRow): SessionUser {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: cleanSingleLine(row.display_name, 160) || row.username,
    role: row.role || 'user',
  };
}

async function currentUser(user?: SessionUser): Promise<SessionUser | null> {
  if (!user?.id) return null;
  const result = await corePool.query<CoreUserRow>(
    `SELECT id::text, username, display_name, role, active
       FROM core_users
      WHERE id = $1 AND active = TRUE
      LIMIT 1`,
    [user.id],
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

function hasHomeSsoCookie(req: Request): boolean {
  return /(?:^|;\s*)WFHOME_SSO=/.test(String(req.get('cookie') || ''));
}

async function homeSsoUsername(req: Request): Promise<string | null> {
  if (!HOME_SSO_INTERNAL_URL || !hasHomeSsoCookie(req)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOME_SSO_TIMEOUT_MS);
  try {
    const response = await fetch(HOME_SSO_INTERNAL_URL, {
      headers: { cookie: String(req.get('cookie') || '') },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; username?: unknown };
    const username = normalizeUsername(payload.username);
    return payload.ok && username ? username : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function userByHomeSso(req: Request): Promise<SessionUser | null> {
  const username = await homeSsoUsername(req);
  if (!username) return null;
  const result = await corePool.query<CoreUserRow>(
    `SELECT id::text, username, display_name, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = TRUE
      LIMIT 1`,
    [username],
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

async function regenerateWithUser(req: Request, user: SessionUser): Promise<void> {
  const returnTo = req.session.returnTo;
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
      if (returnTo) req.session.returnTo = returnTo;
      resolve();
    });
  });
}

async function requireUser(req: Request, res: Response): Promise<SessionUser | null> {
  let user = await currentUser(req.session.user);
  const homeUser = await userByHomeSso(req);
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (!user) {
    req.session.returnTo = req.originalUrl;
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

function ensureCreationToken(req: Request): string {
  if (!req.session.creationToken) req.session.creationToken = crypto.randomUUID();
  return req.session.creationToken;
}

function ensurePaymentToken(req: Request): string {
  if (!req.session.paymentToken) req.session.paymentToken = crypto.randomUUID();
  return req.session.paymentToken;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function csrfMatches(req: Request): boolean {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || '');
  return Boolean(expected && received && safeEqual(expected, received));
}

function creationTokenMatches(req: Request): boolean {
  const expected = req.session.creationToken || '';
  const received = String(req.body?.request_token || '');
  return Boolean(expected && received && /^[0-9a-f-]{36}$/i.test(received) && safeEqual(expected, received));
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function parsePositiveId(value: unknown): number | null {
  const id = Number.parseInt(String(value || ''), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function logCoreAudit(
  userId: number,
  action: string,
  deliveryId: number,
  detail: string,
  metadata: Record<string, unknown> = {},
  entityType = 'delivery',
): Promise<void> {
  try {
    await corePool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, String(deliveryId), cleanSingleLine(detail, 500), JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('[entrega] core audit failed', error);
  }
}

async function insertAudit(
  client: PoolClient,
  deliveryId: number,
  user: SessionUser,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO delivery_audit_logs (delivery_id, user_id, actor_name, action, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [deliveryId, user.id, user.displayName, action, JSON.stringify(metadata)],
  );
}

async function ensureSchema(): Promise<void> {
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      customer_name VARCHAR(160) NOT NULL CHECK (BTRIM(customer_name) <> ''),
      customer_phone VARCHAR(40) NOT NULL CHECK (BTRIM(customer_phone) <> ''),
      address VARCHAR(500) NOT NULL CHECK (BTRIM(address) <> ''),
      created_by_user_id BIGINT NOT NULL,
      created_by_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
      cancelled_at TIMESTAMPTZ,
      cancelled_by_user_id BIGINT,
      cancelled_by_name VARCHAR(160),
      CHECK (
        (status = 'ACTIVE' AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL)
        OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)
      )
    )
  `);
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_commissions (
      id BIGSERIAL PRIMARY KEY,
      delivery_id BIGINT NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE RESTRICT,
      user_id BIGINT NOT NULL,
      user_name VARCHAR(160) NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 100 CHECK (amount_cents = 100),
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ,
      cancelled_by_user_id BIGINT,
      CHECK (
        (status = 'ACTIVE' AND cancelled_at IS NULL)
        OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      )
    )
  `);
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_commission_payments (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      user_id BIGINT NOT NULL,
      user_name VARCHAR(160) NOT NULL,
      period_month DATE NOT NULL CHECK (period_month = DATE_TRUNC('month', period_month)::date),
      commission_count INTEGER NOT NULL CHECK (commission_count > 0),
      total_cents INTEGER NOT NULL CHECK (total_cents > 0 AND total_cents = commission_count * 100),
      paid_by_user_id BIGINT NOT NULL,
      paid_by_name VARCHAR(160) NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_commission_payment_items (
      id BIGSERIAL PRIMARY KEY,
      payment_id BIGINT NOT NULL REFERENCES delivery_commission_payments(id) ON DELETE RESTRICT,
      commission_id BIGINT NOT NULL UNIQUE REFERENCES delivery_commissions(id) ON DELETE RESTRICT,
      delivery_id BIGINT NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK (amount_cents = 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
      user_id BIGINT NOT NULL,
      actor_name VARCHAR(160) NOT NULL,
      action VARCHAR(40) NOT NULL CHECK (action IN ('DELIVERY_CREATED', 'DELIVERY_EDITED', 'DELIVERY_REPRINTED', 'DELIVERY_CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await deliveryPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_commission_payment_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      payment_id BIGINT NOT NULL REFERENCES delivery_commission_payments(id) ON DELETE RESTRICT,
      user_id BIGINT NOT NULL,
      actor_name VARCHAR(160) NOT NULL,
      action VARCHAR(40) NOT NULL CHECK (action IN ('PAYMENT_CREATED', 'PAYMENT_REPRINTED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await deliveryPool.query(`
    CREATE INDEX IF NOT EXISTS deliveries_created_idx ON deliveries (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS deliveries_creator_created_idx ON deliveries (created_by_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS deliveries_status_created_idx ON deliveries (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS delivery_audit_delivery_idx ON delivery_audit_logs (delivery_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS delivery_payment_user_period_idx ON delivery_commission_payments (user_id, period_month, paid_at DESC);
    CREATE INDEX IF NOT EXISTS delivery_payment_paid_at_idx ON delivery_commission_payments (paid_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS delivery_payment_items_payment_idx ON delivery_commission_payment_items (payment_id, id);
    CREATE INDEX IF NOT EXISTS delivery_payment_audit_idx ON delivery_commission_payment_audit_logs (payment_id, created_at DESC, id DESC);
  `);
  await deliveryPool.query(`
    CREATE OR REPLACE FUNCTION entrega_protect_delivery_identity() RETURNS trigger AS $$
    BEGIN
      IF NEW.id <> OLD.id
         OR NEW.request_token <> OLD.request_token
         OR NEW.created_by_user_id <> OLD.created_by_user_id
         OR NEW.created_by_name <> OLD.created_by_name
         OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'delivery identity fields are immutable';
      END IF;
      IF OLD.status = 'CANCELLED' AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'cancelled delivery cannot be reactivated';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS entrega_protect_delivery_identity_trigger ON deliveries;
    CREATE TRIGGER entrega_protect_delivery_identity_trigger
      BEFORE UPDATE ON deliveries
      FOR EACH ROW EXECUTE FUNCTION entrega_protect_delivery_identity();

    CREATE OR REPLACE FUNCTION entrega_protect_commission_identity() RETURNS trigger AS $$
    BEGIN
      IF NEW.id <> OLD.id
         OR NEW.delivery_id <> OLD.delivery_id
         OR NEW.user_id <> OLD.user_id
         OR NEW.user_name <> OLD.user_name
         OR NEW.amount_cents <> OLD.amount_cents
         OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'delivery commission identity fields are immutable';
      END IF;
      IF OLD.status = 'CANCELLED' AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'cancelled commission cannot be reactivated';
      END IF;
      IF OLD.status = 'ACTIVE' AND NEW.status = 'CANCELLED' AND EXISTS (
        SELECT 1 FROM delivery_commission_payment_items WHERE commission_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'paid commission cannot be cancelled';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS entrega_protect_commission_identity_trigger ON delivery_commissions;
    CREATE TRIGGER entrega_protect_commission_identity_trigger
      BEFORE UPDATE ON delivery_commissions
      FOR EACH ROW EXECUTE FUNCTION entrega_protect_commission_identity();

    CREATE OR REPLACE FUNCTION entrega_prevent_history_delete() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'delivery history cannot be deleted';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS entrega_no_delete_deliveries ON deliveries;
    CREATE TRIGGER entrega_no_delete_deliveries BEFORE DELETE ON deliveries
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();
    DROP TRIGGER IF EXISTS entrega_no_delete_commissions ON delivery_commissions;
    CREATE TRIGGER entrega_no_delete_commissions BEFORE DELETE ON delivery_commissions
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();
    DROP TRIGGER IF EXISTS entrega_no_delete_audit ON delivery_audit_logs;
    CREATE TRIGGER entrega_no_delete_audit BEFORE DELETE ON delivery_audit_logs
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();
    DROP TRIGGER IF EXISTS entrega_no_delete_payments ON delivery_commission_payments;
    CREATE TRIGGER entrega_no_delete_payments BEFORE DELETE ON delivery_commission_payments
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();
    DROP TRIGGER IF EXISTS entrega_no_delete_payment_items ON delivery_commission_payment_items;
    CREATE TRIGGER entrega_no_delete_payment_items BEFORE DELETE ON delivery_commission_payment_items
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();
    DROP TRIGGER IF EXISTS entrega_no_delete_payment_audit ON delivery_commission_payment_audit_logs;
    CREATE TRIGGER entrega_no_delete_payment_audit BEFORE DELETE ON delivery_commission_payment_audit_logs
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_history_delete();

    CREATE OR REPLACE FUNCTION entrega_prevent_payment_update() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'delivery commission payment history is immutable';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS entrega_no_update_payments ON delivery_commission_payments;
    CREATE TRIGGER entrega_no_update_payments BEFORE UPDATE ON delivery_commission_payments
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_payment_update();
    DROP TRIGGER IF EXISTS entrega_no_update_payment_items ON delivery_commission_payment_items;
    CREATE TRIGGER entrega_no_update_payment_items BEFORE UPDATE ON delivery_commission_payment_items
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_payment_update();
    DROP TRIGGER IF EXISTS entrega_no_update_payment_audit ON delivery_commission_payment_audit_logs;
    CREATE TRIGGER entrega_no_update_payment_audit BEFORE UPDATE ON delivery_commission_payment_audit_logs
      FOR EACH ROW EXECUTE FUNCTION entrega_prevent_payment_update();
  `);
}

const DELIVERY_SELECT = `
  SELECT d.id::text, d.customer_name, d.customer_phone, d.address,
         d.created_by_user_id::text, d.created_by_name, d.created_at, d.updated_at,
         d.status, d.cancelled_at, d.cancelled_by_name,
         c.amount_cents::text AS commission_amount_cents, c.status AS commission_status,
         pi.payment_id::text AS commission_payment_id, p.paid_at AS commission_paid_at
    FROM deliveries d
    JOIN delivery_commissions c ON c.delivery_id = d.id
    LEFT JOIN delivery_commission_payment_items pi ON pi.commission_id = c.id
     LEFT JOIN delivery_commission_payments p ON p.id = pi.payment_id`;

async function deliveryById(id: number): Promise<DeliveryRow | null> {
  const result = await deliveryPool.query<DeliveryRow & QueryResultRow>(
    `${DELIVERY_SELECT}
      WHERE d.id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function deliveryForUser(id: number, user: SessionUser, lockClient?: PoolClient): Promise<DeliveryRow | null> {
  const client = lockClient || deliveryPool;
  const manager = canManageAll(user);
  const result = await client.query<DeliveryRow & QueryResultRow>(
    `${DELIVERY_SELECT}
      WHERE d.id = $1 ${manager ? '' : 'AND d.created_by_user_id = $2'}
      ${lockClient ? 'FOR UPDATE OF d' : ''}
      LIMIT 1`,
    manager ? [id] : [id, user.id],
  );
  return result.rows[0] || null;
}

async function loadSummary(userId: number | null, month: string): Promise<Summary> {
  const result = await deliveryPool.query<CountRow>(
    `SELECT COUNT(*)::text AS generated,
            COUNT(*) FILTER (WHERE d.status = 'ACTIVE')::text AS active,
            COUNT(*) FILTER (WHERE d.status = 'CANCELLED')::text AS cancelled,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE'), 0)::text AS commission_cents,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NULL), 0)::text AS pending_commission_cents,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NOT NULL), 0)::text AS paid_commission_cents
       FROM deliveries d
       JOIN delivery_commissions c ON c.delivery_id = d.id
       LEFT JOIN delivery_commission_payment_items pi ON pi.commission_id = c.id
      WHERE TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = $1
        AND ($2::bigint IS NULL OR d.created_by_user_id = $2)`,
    [month, userId],
  );
  const row = result.rows[0];
  return {
    generated: Number(row?.generated || 0),
    active: Number(row?.active || 0),
    cancelled: Number(row?.cancelled || 0),
    commissionCents: Number(row?.commission_cents || 0),
    pendingCommissionCents: Number(row?.pending_commission_cents || 0),
    paidCommissionCents: Number(row?.paid_commission_cents || 0),
  };
}

async function loadMineSummary(userId: number, month: string): Promise<MineSummary> {
  const summary = await loadSummary(userId, month);
  const today = await deliveryPool.query<{ today: string } & QueryResultRow>(
    `SELECT COUNT(*)::text AS today
       FROM deliveries
      WHERE created_by_user_id = $1
        AND status = 'ACTIVE'
        AND (created_at AT TIME ZONE '${TIME_ZONE}')::date = (NOW() AT TIME ZONE '${TIME_ZONE}')::date`,
    [userId],
  );
  return { ...summary, today: Number(today.rows[0]?.today || 0) };
}

async function loadLeaders(month: string): Promise<LeaderRow[]> {
  const result = await deliveryPool.query<LeaderRow & QueryResultRow>(
    `SELECT d.created_by_user_id::text AS user_id,
            (ARRAY_AGG(d.created_by_name ORDER BY d.created_at DESC, d.id DESC))[1] AS user_name,
            COUNT(*)::text AS generated,
            COUNT(*) FILTER (WHERE d.status = 'ACTIVE')::text AS active,
            COUNT(*) FILTER (WHERE d.status = 'CANCELLED')::text AS cancelled,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE'), 0)::text AS commission_cents,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NULL), 0)::text AS pending_commission_cents,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NOT NULL), 0)::text AS paid_commission_cents
       FROM deliveries d
       JOIN delivery_commissions c ON c.delivery_id = d.id
       LEFT JOIN delivery_commission_payment_items pi ON pi.commission_id = c.id
      WHERE TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = $1
      GROUP BY d.created_by_user_id
      ORDER BY COUNT(*) FILTER (WHERE d.status = 'ACTIVE') DESC, user_name ASC`,
    [month],
  );
  return result.rows;
}

async function loadCommissionOverview(month: string): Promise<CommissionOverviewRow[]> {
  const result = await deliveryPool.query<CommissionOverviewRow & QueryResultRow>(
    `SELECT c.user_id::text,
            (ARRAY_AGG(c.user_name ORDER BY c.created_at DESC, c.id DESC))[1] AS user_name,
            COUNT(*) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NULL)::text AS pending_count,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NULL), 0)::text AS pending_cents,
            COUNT(*) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NOT NULL)::text AS paid_count,
            COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NOT NULL), 0)::text AS paid_cents
       FROM delivery_commissions c
       JOIN deliveries d ON d.id = c.delivery_id
       LEFT JOIN delivery_commission_payment_items pi ON pi.commission_id = c.id
      WHERE TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = $1
      GROUP BY c.user_id
      HAVING COUNT(*) FILTER (WHERE c.status = 'ACTIVE') > 0
      ORDER BY COUNT(*) FILTER (WHERE c.status = 'ACTIVE' AND pi.id IS NULL) DESC, user_name ASC`,
    [month],
  );
  return result.rows;
}

async function loadRecentPayments(month: string): Promise<CommissionPaymentRow[]> {
  const result = await deliveryPool.query<CommissionPaymentRow & QueryResultRow>(
    `SELECT id::text, user_id::text, user_name, period_month, commission_count::text,
            total_cents::text, paid_by_name, paid_at
       FROM delivery_commission_payments
      WHERE TO_CHAR(period_month, 'YYYY-MM') = $1
      ORDER BY paid_at DESC, id DESC
      LIMIT 12`,
    [month],
  );
  return result.rows;
}

async function commissionPaymentForManager(id: number, user: SessionUser): Promise<CommissionPaymentRow | null> {
  if (!canManageAll(user)) return null;
  const result = await deliveryPool.query<CommissionPaymentRow & QueryResultRow>(
    `SELECT id::text, user_id::text, user_name, period_month, commission_count::text,
            total_cents::text, paid_by_name, paid_at
       FROM delivery_commission_payments
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function loadUsers(): Promise<UserOption[]> {
  const result = await corePool.query<UserOption & QueryResultRow>(
    `SELECT id::text, COALESCE(NULLIF(BTRIM(display_name), ''), username) AS display_name, username
       FROM core_users
      WHERE active = TRUE AND COALESCE(role, 'user') <> 'farmacia'
      ORDER BY COALESCE(NULLIF(BTRIM(display_name), ''), username), id`,
  );
  return result.rows;
}

async function eligibleUserById(userId: number): Promise<UserOption | null> {
  const result = await corePool.query<UserOption & QueryResultRow>(
    `SELECT id::text, COALESCE(NULLIF(BTRIM(display_name), ''), username) AS display_name, username
       FROM core_users
      WHERE id = $1 AND active = TRUE AND COALESCE(role, 'user') <> 'farmacia'
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

function buildHistoryWhere(
  filters: HistoryFilters,
  user: SessionUser,
  selectedMonth: string,
): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!canManageAll(user)) conditions.push(`d.created_by_user_id = ${add(user.id)}`);
  if (filters.userId) conditions.push(`d.created_by_user_id = ${add(filters.userId)}`);
  if (filters.status) conditions.push(`d.status = ${add(filters.status)}`);
  if (filters.query) {
    const param = add(`%${filters.query}%`);
    const rawParam = add(filters.query);
    conditions.push(`(
      d.customer_name ILIKE ${param}
      OR d.customer_phone ILIKE ${param}
      OR d.address ILIKE ${param}
      OR d.created_by_name ILIKE ${param}
      OR LPAD(d.id::text, 6, '0') ILIKE REPLACE(${param}, '#', '')
      OR (
        REGEXP_REPLACE(${rawParam}, '\\D', '', 'g') <> ''
        AND REGEXP_REPLACE(d.customer_phone, '\\D', '', 'g') ILIKE '%' || REGEXP_REPLACE(${rawParam}, '\\D', '', 'g') || '%'
      )
    )`);
  }

  if (filters.period === 'today') {
    conditions.push(`(d.created_at AT TIME ZONE '${TIME_ZONE}')::date = (NOW() AT TIME ZONE '${TIME_ZONE}')::date`);
  } else if (filters.period === 'month') {
    conditions.push(`TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = ${add(selectedMonth)}`);
  } else if (filters.period === 'previous') {
    conditions.push(`TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = ${add(previousMonth(selectedMonth))}`);
  } else if (filters.period === 'custom') {
    if (filters.startDate) conditions.push(`(d.created_at AT TIME ZONE '${TIME_ZONE}')::date >= ${add(filters.startDate)}::date`);
    if (filters.endDate) conditions.push(`(d.created_at AT TIME ZONE '${TIME_ZONE}')::date <= ${add(filters.endDate)}::date`);
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

async function loadHistory(
  filters: HistoryFilters,
  user: SessionUser,
  selectedMonth: string,
): Promise<{ rows: DeliveryRow[]; total: number }> {
  const where = buildHistoryWhere(filters, user, selectedMonth);
  const count = await deliveryPool.query<TotalRow>(`SELECT COUNT(*)::text AS total FROM deliveries d ${where.sql}`, where.params);
  const params = [...where.params, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE];
  const rows = await deliveryPool.query<DeliveryRow & QueryResultRow>(
    `${DELIVERY_SELECT} ${where.sql}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: rows.rows, total: Number(count.rows[0]?.total || 0) };
}

async function loadAudit(deliveryId: number): Promise<AuditRow[]> {
  const result = await deliveryPool.query<AuditRow & QueryResultRow>(
    `SELECT action, actor_name, created_at, metadata
       FROM delivery_audit_logs
      WHERE delivery_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 30`,
    [deliveryId],
  );
  return result.rows;
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, { index: false, dotfiles: 'ignore', maxAge: 1000 * 60 * 60 * 24 * 30 }));

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  const counts = await deliveryPool.query<HealthRow>(
    `SELECT COUNT(*)::text AS generated,
            COUNT(*) FILTER (WHERE d.status = 'ACTIVE')::text AS active,
            COUNT(*) FILTER (WHERE d.status = 'CANCELLED')::text AS cancelled,
            COUNT(*) FILTER (WHERE c.id IS NULL)::text AS orphan_deliveries,
            COUNT(*) FILTER (WHERE c.id IS NOT NULL AND c.status <> d.status)::text AS status_mismatches,
            (SELECT COUNT(*)::text
               FROM delivery_commission_payments p
               LEFT JOIN (
                 SELECT payment_id, COUNT(*) AS item_count FROM delivery_commission_payment_items GROUP BY payment_id
               ) i ON i.payment_id = p.id
              WHERE p.commission_count <> COALESCE(i.item_count, 0)) AS payment_count_mismatches,
            (SELECT COUNT(*)::text
               FROM delivery_commission_payments p
               LEFT JOIN (
                 SELECT payment_id, COALESCE(SUM(amount_cents), 0) AS item_total FROM delivery_commission_payment_items GROUP BY payment_id
               ) i ON i.payment_id = p.id
              WHERE p.total_cents <> COALESCE(i.item_total, 0)) AS payment_total_mismatches,
            (SELECT COUNT(*)::text
               FROM delivery_commission_payment_items pi
               JOIN delivery_commissions paid_commission ON paid_commission.id = pi.commission_id
              WHERE paid_commission.status <> 'ACTIVE') AS paid_cancelled_commissions
       FROM deliveries d
       LEFT JOIN delivery_commissions c ON c.delivery_id = d.id`,
  );
  const row = counts.rows[0];
  const consistent = Number(row?.orphan_deliveries || 0) === 0
    && Number(row?.status_mismatches || 0) === 0
    && Number(row?.payment_count_mismatches || 0) === 0
    && Number(row?.payment_total_mismatches || 0) === 0
    && Number(row?.paid_cancelled_commissions || 0) === 0;
  res.status(consistent ? 200 : 503).json({
    ok: consistent,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    storage: 'postgres',
    deliveries: row,
  });
}));

app.get(BASE_PATH, (req, res, next) => {
  if (!isBareBasePath(req.path, BASE_PATH)) return next();
  return res.redirect(`${BASE_PATH}/`);
});

app.get(`${BASE_PATH}/`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const manager = canManageAll(user);
  const selectedMonth = normalizeMonth(req.query.month, localDateParts().month);
  const filters = normalizeHistoryFilters(req.query as Record<string, unknown>, { manager });
  const [mine, global, leaders, users, commissionOverview, recentPayments, history] = await Promise.all([
    loadMineSummary(user.id, selectedMonth),
    manager ? loadSummary(null, selectedMonth) : Promise.resolve({ generated: 0, active: 0, cancelled: 0, commissionCents: 0, pendingCommissionCents: 0, paidCommissionCents: 0 }),
    manager ? loadLeaders(selectedMonth) : Promise.resolve([]),
    loadUsers(),
    manager ? loadCommissionOverview(selectedMonth) : Promise.resolve([]),
    manager ? loadRecentPayments(selectedMonth) : Promise.resolve([]),
    loadHistory(filters, user, selectedMonth),
  ]);

  const selectedId = parsePositiveId(req.query.view_id);
  const selectedDelivery = selectedId ? await deliveryForUser(selectedId, user) : null;
  const selectedAudit = selectedDelivery ? await loadAudit(Number(selectedDelivery.id)) : [];
  res.type('html').send(renderDashboard({
    basePath: BASE_PATH,
    user,
    isManager: manager,
    csrfToken: ensureCsrf(req),
    creationToken: ensureCreationToken(req),
    paymentToken: manager ? ensurePaymentToken(req) : '',
    flash: takeFlash(req),
    selectedMonth,
    mine,
    global,
    leaders,
    commissionOverview,
    recentPayments,
    users,
    filters,
    history: history.rows,
    historyTotal: history.total,
    pageSize: PAGE_SIZE,
    selectedDelivery,
    selectedAudit,
  }));
}));

app.post(`${BASE_PATH}/create`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req) || !creationTokenMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Recarregue a pagina antes de gerar a entrega.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const parsed = validateDeliveryInput(req.body as Record<string, unknown>);
  if (!parsed.value) {
    setFlash(req, 'error', parsed.errors.join(' '));
    return res.redirect(`${BASE_PATH}/`);
  }
  const responsibleUserId = validateResponsibleUserId(req.body.responsible_user_id);
  const responsibleUser = responsibleUserId ? await eligibleUserById(responsibleUserId) : null;
  if (!responsibleUser) {
    setFlash(req, 'error', 'Selecione um usuario ativo para ficar responsavel pela entrega.');
    return res.redirect(`${BASE_PATH}/`);
  }

  const client = await deliveryPool.connect();
  let deliveryId = 0;
  let created = false;
  try {
    await client.query('BEGIN');
    const inserted = await client.query<DeliveryIdRow>(
      `INSERT INTO deliveries (
         request_token, customer_name, customer_phone, address, created_by_user_id, created_by_name
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
       ON CONFLICT (request_token) DO NOTHING
       RETURNING id::text, created_by_user_id::text, status`,
       [req.session.creationToken, parsed.value.customerName, parsed.value.customerPhone, parsed.value.address, responsibleUser.id, responsibleUser.display_name],
    );
    let row = inserted.rows[0];
    if (!row) {
      const existing = await client.query<DeliveryIdRow>(
        `SELECT id::text, created_by_user_id::text, status FROM deliveries WHERE request_token = $1::uuid FOR UPDATE`,
        [req.session.creationToken],
      );
      row = existing.rows[0];
      if (!row || Number(row.created_by_user_id) !== Number(responsibleUser.id)) throw new Error('request_token_conflict');
    } else {
      created = true;
    }
    deliveryId = Number(row.id);

    if (created) {
      const commission = await client.query(
        `INSERT INTO delivery_commissions (delivery_id, user_id, user_name, amount_cents)
         VALUES ($1, $2, $3, 100)
         RETURNING id`,
        [deliveryId, responsibleUser.id, responsibleUser.display_name],
      );
      if (commission.rowCount !== 1) throw new Error('commission_not_created');
      await insertAudit(client, deliveryId, user, 'DELIVERY_CREATED', {
        customer_name: parsed.value.customerName,
        customer_phone: parsed.value.customerPhone,
        address: parsed.value.address,
        commission_cents: 100,
        responsible_user_id: Number(responsibleUser.id),
        responsible_user_name: responsibleUser.display_name,
        registered_by_user_id: user.id,
        registered_by_name: user.displayName,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (created) {
    await logCoreAudit(user.id, 'DELIVERY_CREATED', deliveryId, `Entrega criada para ${responsibleUser.display_name} com comissao unica de R$ 1,00.`, {
      commission_cents: 100,
      responsible_user_id: Number(responsibleUser.id),
      responsible_user_name: responsibleUser.display_name,
    });
  }
  delete req.session.creationToken;
  req.session.printDeliveryId = deliveryId;
  setFlash(req, 'success', created ? `Entrega registrada para ${responsibleUser.display_name}. A impressao sera aberta agora.` : 'A entrega ja estava registrada; nenhum valor foi duplicado.');
  await saveSession(req);
  return res.redirect(`${BASE_PATH}/print/${deliveryId}`);
}));

app.post(`${BASE_PATH}/edit`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const deliveryId = parsePositiveId(req.body.delivery_id);
  if (!csrfMatches(req) || !deliveryId) {
    setFlash(req, 'error', 'Nao foi possivel validar a edicao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const parsed = validateDeliveryInput(req.body as Record<string, unknown>);
  if (!parsed.value) {
    setFlash(req, 'error', parsed.errors.join(' '));
    return res.redirect(`${BASE_PATH}/?view_id=${deliveryId}#entrega-detalhe`);
  }

  const client = await deliveryPool.connect();
  let before: DeliveryRow | null = null;
  try {
    await client.query('BEGIN');
    before = await deliveryForUser(deliveryId, user, client);
    if (!before) {
      await client.query('ROLLBACK');
      setFlash(req, 'error', 'Entrega nao encontrada ou sem permissao para editar.');
      return res.redirect(`${BASE_PATH}/`);
    }
    await client.query(
      `UPDATE deliveries
          SET customer_name = $1, customer_phone = $2, address = $3,
              updated_by_user_id = $4, updated_at = NOW()
        WHERE id = $5`,
      [parsed.value.customerName, parsed.value.customerPhone, parsed.value.address, user.id, deliveryId],
    );
    await insertAudit(client, deliveryId, user, 'DELIVERY_EDITED', {
      before: { customer_name: before.customer_name, customer_phone: before.customer_phone, address: before.address },
      after: { customer_name: parsed.value.customerName, customer_phone: parsed.value.customerPhone, address: parsed.value.address },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logCoreAudit(user.id, 'DELIVERY_EDITED', deliveryId, 'Dados de cliente da entrega editados.');
  setFlash(req, 'success', 'Dados da entrega atualizados. Responsavel, data, numero e comissao foram preservados.');
  return res.redirect(`${BASE_PATH}/?view_id=${deliveryId}#entrega-detalhe`);
}));

app.post(`${BASE_PATH}/reprint`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const deliveryId = parsePositiveId(req.body.delivery_id);
  if (!csrfMatches(req) || !deliveryId) {
    setFlash(req, 'error', 'Nao foi possivel validar a reimpressao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const delivery = await deliveryForUser(deliveryId, user);
  if (!delivery || delivery.status !== 'ACTIVE') {
    setFlash(req, 'error', 'Somente uma entrega ativa e permitida pode ser reimpressa.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const client = await deliveryPool.connect();
  try {
    await insertAudit(client, deliveryId, user, 'DELIVERY_REPRINTED', { source: 'history' });
  } finally {
    client.release();
  }
  await logCoreAudit(user.id, 'DELIVERY_REPRINTED', deliveryId, 'Reimpressao da entrega solicitada.');
  req.session.printDeliveryId = deliveryId;
  await saveSession(req);
  return res.redirect(`${BASE_PATH}/print/${deliveryId}`);
}));

app.post(`${BASE_PATH}/pay-commission`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = validateCommissionPaymentInput(req.body as Record<string, unknown>);
  const expectedToken = req.session.paymentToken || '';
  if (!csrfMatches(req) || !canManageAll(user) || !parsed.value || !expectedToken || !safeEqual(expectedToken, parsed.value.requestToken)) {
    setFlash(req, 'error', parsed.errors.join(' ') || 'Somente ADM ou gerente pode pagar comissoes.');
    return res.redirect(`${BASE_PATH}/`);
  }

  const selectedUser = await eligibleUserById(parsed.value.userId);
  if (!selectedUser) {
    setFlash(req, 'error', 'O usuario selecionado nao esta ativo ou nao pode receber comissao.');
    return res.redirect(`${BASE_PATH}/?month=${parsed.value.periodMonth}#pagar-comissao`);
  }

  const client = await deliveryPool.connect();
  let paymentId = 0;
  let created = false;
  let commissionCount = 0;
  let totalCents = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [parsed.value.userId]);
    const existing = await client.query<{ id: string; paid_by_user_id: string; user_id: string; period_month: string } & QueryResultRow>(
      `SELECT id::text, paid_by_user_id::text, user_id::text, TO_CHAR(period_month, 'YYYY-MM') AS period_month
         FROM delivery_commission_payments
        WHERE request_token = $1::uuid
        FOR SHARE`,
      [parsed.value.requestToken],
    );
    if (existing.rows[0]) {
      if (Number(existing.rows[0].paid_by_user_id) !== user.id
          || Number(existing.rows[0].user_id) !== parsed.value.userId
          || existing.rows[0].period_month !== parsed.value.periodMonth) throw new Error('payment_token_conflict');
      paymentId = Number(existing.rows[0].id);
    } else {
      const payable = await client.query<CommissionIdRow>(
        `SELECT c.id::text, c.delivery_id::text, c.amount_cents::text
           FROM deliveries d
           JOIN delivery_commissions c ON c.delivery_id = d.id
          WHERE c.user_id = $1
            AND c.status = 'ACTIVE'
            AND d.status = 'ACTIVE'
            AND TO_CHAR(d.created_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = $2
            AND NOT EXISTS (
              SELECT 1 FROM delivery_commission_payment_items pi WHERE pi.commission_id = c.id
            )
          ORDER BY d.id
          FOR UPDATE OF d, c`,
        [parsed.value.userId, parsed.value.periodMonth],
      );
      if (payable.rowCount === 0) {
        await client.query('ROLLBACK');
        delete req.session.paymentToken;
        setFlash(req, 'error', 'Nao ha comissoes pendentes para este usuario no mes selecionado.');
        return res.redirect(`${BASE_PATH}/?month=${parsed.value.periodMonth}#pagar-comissao`);
      }

      commissionCount = payable.rows.length;
      totalCents = payable.rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
      const payment = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO delivery_commission_payments (
           request_token, user_id, user_name, period_month, commission_count, total_cents,
           paid_by_user_id, paid_by_name
         ) VALUES ($1::uuid, $2, $3, ($4 || '-01')::date, $5, $6, $7, $8)
         RETURNING id::text`,
        [parsed.value.requestToken, parsed.value.userId, selectedUser.display_name, parsed.value.periodMonth, commissionCount, totalCents, user.id, user.displayName],
      );
      paymentId = Number(payment.rows[0]?.id || 0);
      if (!paymentId) throw new Error('commission_payment_not_created');

      const commissionIds = payable.rows.map((row) => Number(row.id));
      const items = await client.query(
        `INSERT INTO delivery_commission_payment_items (payment_id, commission_id, delivery_id, amount_cents)
         SELECT $1, c.id, c.delivery_id, c.amount_cents
           FROM delivery_commissions c
          WHERE c.id = ANY($2::bigint[])
         RETURNING id`,
        [paymentId, commissionIds],
      );
      if (items.rowCount !== commissionCount) throw new Error('commission_payment_items_incomplete');
      await client.query(
        `INSERT INTO delivery_commission_payment_audit_logs (payment_id, user_id, actor_name, action, metadata)
         VALUES ($1, $2, $3, 'PAYMENT_CREATED', $4::jsonb)`,
        [paymentId, user.id, user.displayName, JSON.stringify({ user_id: parsed.value.userId, period_month: parsed.value.periodMonth, commission_count: commissionCount, total_cents: totalCents })],
      );
      created = true;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (created) {
    await logCoreAudit(
      user.id,
      'DELIVERY_COMMISSION_PAYMENT_CREATED',
      paymentId,
      `Pagamento de comissao criado para ${selectedUser.display_name}.`,
      { paid_user_id: parsed.value.userId, period_month: parsed.value.periodMonth, commission_count: commissionCount, total_cents: totalCents },
      'delivery_commission_payment',
    );
  }
  delete req.session.paymentToken;
  req.session.printPaymentId = paymentId;
  setFlash(req, 'success', created ? 'Comissao paga e registrada. O relatorio resumido sera aberto para impressao.' : 'Este pagamento ja estava registrado; nenhum valor foi duplicado.');
  await saveSession(req);
  return res.redirect(`${BASE_PATH}/print-commission/${paymentId}`);
}));

app.post(`${BASE_PATH}/reprint-commission`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const paymentId = parsePositiveId(req.body.payment_id);
  if (!csrfMatches(req) || !paymentId || !canManageAll(user)) {
    setFlash(req, 'error', 'Somente ADM ou gerente pode reimprimir pagamentos de comissao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const payment = await commissionPaymentForManager(paymentId, user);
  if (!payment) {
    setFlash(req, 'error', 'Pagamento de comissao nao encontrado.');
    return res.redirect(`${BASE_PATH}/`);
  }
  await deliveryPool.query(
    `INSERT INTO delivery_commission_payment_audit_logs (payment_id, user_id, actor_name, action, metadata)
     VALUES ($1, $2, $3, 'PAYMENT_REPRINTED', '{}'::jsonb)`,
    [paymentId, user.id, user.displayName],
  );
  await logCoreAudit(user.id, 'DELIVERY_COMMISSION_PAYMENT_REPRINTED', paymentId, 'Reimpressao do pagamento de comissao solicitada.', {}, 'delivery_commission_payment');
  req.session.printPaymentId = paymentId;
  await saveSession(req);
  return res.redirect(`${BASE_PATH}/print-commission/${paymentId}`);
}));

app.post(`${BASE_PATH}/cancel`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const deliveryId = parsePositiveId(req.body.delivery_id);
  if (!csrfMatches(req) || !deliveryId || !canManageAll(user)) {
    setFlash(req, 'error', 'Somente ADM ou gerente pode cancelar uma entrega.');
    return res.redirect(`${BASE_PATH}/`);
  }

  const client = await deliveryPool.connect();
  let cancelled = false;
  try {
    await client.query('BEGIN');
    const delivery = await client.query<DeliveryIdRow>(
      `SELECT id::text, created_by_user_id::text, status FROM deliveries WHERE id = $1 FOR UPDATE`,
      [deliveryId],
    );
    const row = delivery.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      setFlash(req, 'error', 'Entrega nao encontrada.');
      return res.redirect(`${BASE_PATH}/`);
    }
    if (row.status === 'ACTIVE') {
      const paid = await client.query<{ payment_id: string } & QueryResultRow>(
        `SELECT pi.payment_id::text
           FROM delivery_commissions c
           JOIN delivery_commission_payment_items pi ON pi.commission_id = c.id
          WHERE c.delivery_id = $1
          LIMIT 1`,
        [deliveryId],
      );
      if (paid.rows[0]) {
        await client.query('ROLLBACK');
        setFlash(req, 'error', `A entrega nao pode ser cancelada porque a comissao ja foi paga no relatorio #${String(paid.rows[0].payment_id).padStart(6, '0')}.`);
        return res.redirect(`${BASE_PATH}/?view_id=${deliveryId}#entrega-detalhe`);
      }
      await client.query(
        `UPDATE deliveries
            SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by_user_id = $1,
                cancelled_by_name = $2, updated_by_user_id = $1, updated_at = NOW()
          WHERE id = $3`,
        [user.id, user.displayName, deliveryId],
      );
      const commission = await client.query(
        `UPDATE delivery_commissions
            SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by_user_id = $1
          WHERE delivery_id = $2 AND status = 'ACTIVE'
          RETURNING id`,
        [user.id, deliveryId],
      );
      if (commission.rowCount !== 1) throw new Error('commission_not_cancelled');
      await insertAudit(client, deliveryId, user, 'DELIVERY_CANCELLED', { commission_reversed_cents: 100 });
      cancelled = true;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (cancelled) await logCoreAudit(user.id, 'DELIVERY_CANCELLED', deliveryId, 'Entrega cancelada e comissao estornada.', { commission_reversed_cents: 100 });
  setFlash(req, cancelled ? 'success' : 'error', cancelled ? 'Entrega cancelada. A comissao de R$ 1,00 foi estornada e o historico foi mantido.' : 'Esta entrega ja estava cancelada.');
  return res.redirect(`${BASE_PATH}/?view_id=${deliveryId}#entrega-detalhe`);
}));

app.get(`${BASE_PATH}/print/:id`, asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const deliveryId = parsePositiveId(req.params.id);
  if (!deliveryId || req.session.printDeliveryId !== deliveryId) return res.redirect(`${BASE_PATH}/`);
  delete req.session.printDeliveryId;
  await saveSession(req);
  const delivery = await deliveryById(deliveryId);
  if (!delivery || delivery.status !== 'ACTIVE') {
    setFlash(req, 'error', 'O comprovante nao esta disponivel para impressao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  return res.type('html').send(renderPrintReceipt(BASE_PATH, delivery));
}));

app.get(`${BASE_PATH}/print-commission/:id`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const paymentId = parsePositiveId(req.params.id);
  if (!paymentId || !canManageAll(user) || req.session.printPaymentId !== paymentId) return res.redirect(`${BASE_PATH}/`);
  delete req.session.printPaymentId;
  await saveSession(req);
  const payment = await commissionPaymentForManager(paymentId, user);
  if (!payment) {
    setFlash(req, 'error', 'O relatorio de pagamento nao esta disponivel para impressao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  return res.type('html').send(renderCommissionPaymentReceipt(BASE_PATH, payment));
}));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error('[entrega] request failed', error);
  if (res.headersSent) return;
  setFlash(req, 'error', 'Nao foi possivel concluir a operacao. Nada foi duplicado; tente novamente.');
  res.status(500).redirect(`${BASE_PATH}/`);
});

async function start(): Promise<void> {
  if (!env.ENTREGA_SESSION_SECRET) console.warn('[entrega] ENTREGA_SESSION_SECRET ausente; usando segredo temporario desta inicializacao.');
  await ensureSchema();
  await corePool.query('SELECT 1 FROM core_users LIMIT 1');
  app.listen(PORT, () => console.log(`[entrega] listening on ${PORT}${BASE_PATH}`));
}

start().catch((error) => {
  console.error('[entrega] startup failed', error);
  process.exit(1);
});
