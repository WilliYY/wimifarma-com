import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import connectPgSimple from 'connect-pg-simple';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  cleanSingleLine,
  couponAvailability,
  couponCodeKey,
  formatAutomaticCouponCode,
  isBareBasePath,
  parsePositiveId,
  referralRedemptionXpReward,
  validateCouponInput,
  validatePaymentInput,
  validatePersonInput,
  type SessionUser,
} from './domain.js';
import {
  renderCouponReceipt,
  renderDashboard,
  type CouponRow,
  type DashboardViewModel,
  type Flash,
  type PaymentRow,
  type PersonRow,
  type RankingRow,
  type RedemptionRow,
  type Summary,
} from './views.js';

const { Pool: PgPool } = pg;

type CoreUserRow = QueryResultRow & { id: string; username: string; display_name: string; role: string; active: boolean };
type IdRow = QueryResultRow & { id: string };
type CountRow = QueryResultRow & { count: string };
type BalanceRow = QueryResultRow & { balance_cents: string };
type XpEmployeeRow = QueryResultRow & { id: string; name: string; system_key: string | null };
type XpSaleRow = QueryResultRow & { id: string; deleted_at: Date | string | null };
type HealthRow = QueryResultRow & {
  people: string;
  coupons: string;
  active_coupons: string;
  redemptions: string;
  cancelled_redemptions: string;
  payments: string;
  missing_commissions: string;
  missing_reversals: string;
};
type XpResult = { awarded: boolean; alreadyAwarded?: boolean; message: string };
type XpRevocationResult = { revoked: boolean; alreadyRevoked?: boolean; message: string };

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    redemptionToken?: string;
    personToken?: string;
    couponToken?: string;
    paymentToken?: string;
    flash?: Flash;
    printCouponId?: number;
    returnTo?: string;
    user?: SessionUser;
  }
}

const env = process.env;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const SERVICE_VERSION = '1.0.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/comissao');
const PORT = Number.parseInt(env.PORT || '3990', 10);
const SESSION_SECRET = env.COMISSAO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));

const referralPool = new PgPool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_comissao',
  user: env.POSTGRES_USER || 'wimifarma_comissao',
  password: env.POSTGRES_PASSWORD || '',
  max: 10,
});
const corePool = new PgPool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 5,
});
const xpPool = new PgPool({
  host: env.XP_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.XP_POSTGRES_PORT || 5432),
  database: env.XP_POSTGRES_DB || 'wimifarma_xp',
  user: env.XP_POSTGRES_USER || 'wimifarma_xp',
  password: env.XP_POSTGRES_PASSWORD || '',
  max: 3,
});

const app = express();
app.set('trust proxy', 1);
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFCOMISSAO',
  secret: SESSION_SECRET,
  store: new PgSession({ pool: referralPool, tableName: 'referral_sessions', createTableIfMissing: true }),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' ? 'auto' : false, maxAge: 1000 * 60 * 60 * 10 },
});

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean || '/comissao';
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeUsername(value: unknown): string {
  return cleanSingleLine(value, 100).toLowerCase();
}

function publicUser(row: CoreUserRow): SessionUser {
  return { id: Number(row.id), username: row.username, displayName: cleanSingleLine(row.display_name, 160) || row.username, role: row.role || 'user' };
}

async function currentUser(user?: SessionUser): Promise<SessionUser | null> {
  if (!user?.id) return null;
  const result = await corePool.query<CoreUserRow>(
    `SELECT id::text, username, display_name, role, active FROM core_users WHERE id = $1 AND active = TRUE LIMIT 1`,
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
    const response = await fetch(HOME_SSO_INTERNAL_URL, { headers: { cookie: String(req.get('cookie') || '') }, signal: controller.signal });
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
    `SELECT id::text, username, display_name, role, active FROM core_users WHERE username_normalized = $1 AND active = TRUE LIMIT 1`,
    [username],
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

async function regenerateWithUser(req: Request, user: SessionUser): Promise<void> {
  const returnTo = req.session.returnTo;
  await new Promise<void>((resolve, reject) => req.session.regenerate((error) => {
    if (error) return reject(error);
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    if (returnTo) req.session.returnTo = returnTo;
    resolve();
  }));
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

function canAdmin(user: SessionUser): boolean {
  return user.username === 'adm' || ['admin', 'gerente'].includes(user.role);
}

function ensureCsrf(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

type TokenKey = 'redemptionToken' | 'personToken' | 'couponToken' | 'paymentToken';
function ensureToken(req: Request, key: TokenKey): string {
  if (!req.session[key]) req.session[key] = crypto.randomUUID();
  return req.session[key] as string;
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

function tokenMatches(req: Request, key: TokenKey): boolean {
  const expected = req.session[key] || '';
  const received = String(req.body?.request_token || '');
  return Boolean(expected && received && /^[0-9a-f-]{36}$/i.test(received) && safeEqual(expected, received));
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash | null {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function localDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function logCoreAudit(userId: number, action: string, entityType: string, entityId: number, detail: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await corePool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, String(entityId), cleanSingleLine(detail, 500), JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('[comissao] core audit failed', error);
  }
}

async function insertAudit(client: PoolClient, entityType: string, entityId: number, user: SessionUser, action: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await client.query(
    `INSERT INTO referral_audit_logs (entity_type, entity_id, actor_user_id, actor_name, action, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [entityType, entityId, user.id, user.displayName, action, JSON.stringify(metadata)],
  );
}

async function insertAuditSafe(entityType: string, entityId: number, user: SessionUser, action: string, metadata: Record<string, unknown> = {}): Promise<void> {
  let client: PoolClient | null = null;
  try {
    client = await referralPool.connect();
    await insertAudit(client, entityType, entityId, user, action, metadata);
  } catch (error) {
    console.error('[comissao] local audit failed', error);
  } finally {
    client?.release();
  }
}

let xpSchemaReady = false;
async function ensureXpSchema(): Promise<void> {
  if (xpSchemaReady) return;
  await xpPool.query(`
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS source_entity_id TEXT;
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_sales_source_entity ON xp_sales(source, source_entity_id) WHERE source IS NOT NULL AND source_entity_id IS NOT NULL;
  `);
  xpSchemaReady = true;
}

async function linkedXpEmployee(userId: number): Promise<{ id: number; name: string } | null> {
  const link = await corePool.query<QueryResultRow & { xp_employee_id: string | null }>(
    `SELECT xp_employee_id::text FROM core_user_xp_links WHERE user_id = $1 LIMIT 1`, [userId],
  );
  const employeeId = Number(link.rows[0]?.xp_employee_id || 0);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) return null;
  const employee = await xpPool.query<XpEmployeeRow>(
    `SELECT id::text, name, system_key FROM xp_employees WHERE id = $1 AND status = 'ativo' AND deleted_at IS NULL LIMIT 1`, [employeeId],
  );
  const row = employee.rows[0];
  return row ? { id: Number(row.id), name: cleanSingleLine(row.name, 180) || 'Funcionario XP' } : null;
}

async function setRedemptionXpStatus(redemptionId: number, status: RedemptionRow['xp_status']): Promise<void> {
  await referralPool.query(`UPDATE referral_redemptions SET xp_status = $1 WHERE id = $2`, [status, redemptionId]);
}

async function awardXp(redemptionId: number, user: SessionUser): Promise<XpResult> {
  const reward = referralRedemptionXpReward(redemptionId);
  try {
    await ensureXpSchema();
    const employee = await linkedXpEmployee(user.id);
    if (!employee) {
      await setRedemptionXpStatus(redemptionId, 'SKIPPED');
      await insertAuditSafe('redemption', redemptionId, user, 'XP_SKIPPED', { points: reward.points, reason: 'xp_link_not_found' });
      return { awarded: false, message: '300 XP nao gerados: seu usuario nao possui vinculo ativo no XP.' };
    }
    const client = await xpPool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<XpSaleRow>(
        `SELECT id::text, deleted_at FROM xp_sales WHERE source = $1 AND source_entity_id = $2 LIMIT 1`, [reward.source, reward.sourceEntityId],
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        const revoked = Boolean(existing.rows[0].deleted_at);
        await setRedemptionXpStatus(redemptionId, revoked ? 'REVOKED' : 'AWARDED');
        return { awarded: false, alreadyAwarded: !revoked, message: revoked ? 'O XP desta utilizacao permanece estornado.' : 'Os 300 XP desta utilizacao ja estavam registrados.' };
      }
      const inserted = await client.query<IdRow>(
        `INSERT INTO xp_sales (employee_id, sale_date, amount_cents, xp_points, note, created_by, source, source_entity_id)
         VALUES ($1, CURRENT_DATE, 0, $2, $3, $4, $5, $6) RETURNING id::text`,
        [employee.id, reward.points, cleanSingleLine(`Cupom de indicacao utilizado. Registro #${redemptionId}.`, 220), user.id, reward.source, reward.sourceEntityId],
      );
      await client.query(
        `INSERT INTO xp_audit_events (actor_user_id, action, entity_type, entity_id, summary) VALUES ($1, 'xp_indicacao_lancado', 'xp_sale', $2, $3)`,
        [user.id, inserted.rows[0]?.id || '', `+${reward.points} XP pelo cupom de indicacao #${redemptionId}.`],
      );
      await client.query('COMMIT');
      await setRedemptionXpStatus(redemptionId, 'AWARDED');
      await insertAuditSafe('redemption', redemptionId, user, 'XP_AWARDED', { points: reward.points, xp_employee_id: employee.id, xp_sale_id: inserted.rows[0]?.id });
      await logCoreAudit(user.id, 'REFERRAL_XP_AWARDED', 'referral_redemption', redemptionId, `+${reward.points} XP por cupom de indicacao.`, { xp_employee_id: employee.id });
      return { awarded: true, message: `+${reward.points} XP para ${employee.name}.` };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        const existing = await xpPool.query<XpSaleRow>(
          `SELECT id::text, deleted_at FROM xp_sales WHERE source = $1 AND source_entity_id = $2 LIMIT 1`,
          [reward.source, reward.sourceEntityId],
        );
        const revoked = Boolean(existing.rows[0]?.deleted_at);
        await setRedemptionXpStatus(redemptionId, revoked ? 'REVOKED' : 'AWARDED');
        return {
          awarded: false,
          alreadyAwarded: !revoked,
          message: revoked ? 'O XP desta utilizacao permanece estornado.' : 'Os 300 XP desta utilizacao ja estavam registrados.',
        };
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[comissao] XP award failed', error);
    await setRedemptionXpStatus(redemptionId, 'FAILED').catch(() => undefined);
    await insertAuditSafe('redemption', redemptionId, user, 'XP_FAILED', { points: reward.points, source: reward.source });
    return { awarded: false, message: 'Utilizacao registrada, mas os 300 XP precisam ser conferidos.' };
  }
}

async function revokeXp(redemptionId: number, actor: SessionUser): Promise<XpRevocationResult> {
  const reward = referralRedemptionXpReward(redemptionId);
  try {
    await ensureXpSchema();
    const client = await xpPool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<XpSaleRow>(
        `SELECT id::text, deleted_at FROM xp_sales WHERE source = $1 AND source_entity_id = $2 LIMIT 1 FOR UPDATE`,
        [reward.source, reward.sourceEntityId],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query('COMMIT');
        await setRedemptionXpStatus(redemptionId, 'REVOKED');
        return { revoked: false, message: 'Nenhum XP desta utilizacao precisava ser estornado.' };
      }
      if (row.deleted_at) {
        await client.query('COMMIT');
        await setRedemptionXpStatus(redemptionId, 'REVOKED');
        return { revoked: false, alreadyRevoked: true, message: 'Os 300 XP ja estavam estornados.' };
      }
      await client.query(`UPDATE xp_sales SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2`, [actor.id, Number(row.id)]);
      await client.query(
        `INSERT INTO xp_audit_events (actor_user_id, action, entity_type, entity_id, summary) VALUES ($1, 'xp_indicacao_estornado', 'xp_sale', $2, $3)`,
        [actor.id, row.id, `300 XP estornados pelo cancelamento da utilizacao #${redemptionId}.`],
      );
      await client.query('COMMIT');
      await setRedemptionXpStatus(redemptionId, 'REVOKED');
      await insertAuditSafe('redemption', redemptionId, actor, 'XP_REVOKED', { points: reward.points, xp_sale_id: row.id });
      await logCoreAudit(actor.id, 'REFERRAL_XP_REVOKED', 'referral_redemption', redemptionId, 'XP do cupom de indicacao estornado.', { points: reward.points });
      return { revoked: true, message: 'Os 300 XP foram estornados.' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[comissao] XP revocation failed', error);
    await insertAuditSafe('redemption', redemptionId, actor, 'XP_REVOCATION_FAILED', { points: reward.points });
    return { revoked: false, message: 'Utilizacao cancelada, mas o estorno dos 300 XP precisa ser conferido.' };
  }
}

async function ensureSchema(): Promise<void> {
  await referralPool.query(`
    CREATE TABLE IF NOT EXISTS referral_people (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      phone VARCHAR(40),
      pix VARCHAR(180),
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id BIGINT NOT NULL,
      created_by_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS referral_coupons (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      referral_person_id BIGINT NOT NULL REFERENCES referral_people(id) ON DELETE RESTRICT,
      code VARCHAR(24) NOT NULL,
      code_key VARCHAR(24) NOT NULL UNIQUE,
      product_name VARCHAR(220) NOT NULL,
      normal_price_cents INTEGER NOT NULL CHECK (normal_price_cents > 0),
      promotional_price_cents INTEGER NOT NULL CHECK (promotional_price_cents > 0 AND promotional_price_cents < normal_price_cents),
      commission_cents INTEGER NOT NULL CHECK (commission_cents > 0 AND commission_cents <= promotional_price_cents),
      start_date DATE,
      expiration_date DATE,
      status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
      created_by_user_id BIGINT NOT NULL,
      created_by_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (expiration_date IS NULL OR start_date IS NULL OR expiration_date >= start_date)
    );
    CREATE TABLE IF NOT EXISTS referral_redemptions (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      coupon_id BIGINT NOT NULL REFERENCES referral_coupons(id) ON DELETE RESTRICT,
      referral_person_id BIGINT NOT NULL REFERENCES referral_people(id) ON DELETE RESTRICT,
      coupon_code VARCHAR(24) NOT NULL,
      product_name VARCHAR(220) NOT NULL,
      normal_price_cents INTEGER NOT NULL CHECK (normal_price_cents > 0),
      promotional_price_cents INTEGER NOT NULL CHECK (promotional_price_cents > 0),
      commission_cents INTEGER NOT NULL CHECK (commission_cents > 0),
      xp_points INTEGER NOT NULL DEFAULT 300 CHECK (xp_points = 300),
      xp_status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (xp_status IN ('PENDING', 'AWARDED', 'SKIPPED', 'FAILED', 'REVOKED')),
      redeemed_by_user_id BIGINT NOT NULL,
      redeemed_by_name VARCHAR(160) NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ,
      cancelled_by_user_id BIGINT,
      cancelled_by_name VARCHAR(160),
      cancellation_reason VARCHAR(240),
      CHECK ((status = 'ACTIVE' AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL) OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS referral_payments (
      id BIGSERIAL PRIMARY KEY,
      request_token UUID NOT NULL UNIQUE,
      referral_person_id BIGINT NOT NULL REFERENCES referral_people(id) ON DELETE RESTRICT,
      person_name VARCHAR(160) NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('PIX', 'CASH', 'OTHER')),
      notes VARCHAR(500),
      registered_by_user_id BIGINT NOT NULL,
      registered_by_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS referral_commission_transactions (
      id BIGSERIAL PRIMARY KEY,
      referral_person_id BIGINT NOT NULL REFERENCES referral_people(id) ON DELETE RESTRICT,
      redemption_id BIGINT REFERENCES referral_redemptions(id) ON DELETE RESTRICT,
      payment_id BIGINT REFERENCES referral_payments(id) ON DELETE RESTRICT,
      type VARCHAR(12) NOT NULL CHECK (type IN ('COMMISSION', 'REVERSAL', 'PAYMENT')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((type IN ('COMMISSION', 'REVERSAL') AND redemption_id IS NOT NULL AND payment_id IS NULL) OR (type = 'PAYMENT' AND payment_id IS NOT NULL AND redemption_id IS NULL))
    );
    CREATE TABLE IF NOT EXISTS referral_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(30) NOT NULL,
      entity_id BIGINT NOT NULL,
      actor_user_id BIGINT NOT NULL,
      actor_name VARCHAR(160) NOT NULL,
      action VARCHAR(40) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS referral_commission_once_idx ON referral_commission_transactions(redemption_id) WHERE type = 'COMMISSION';
    CREATE UNIQUE INDEX IF NOT EXISTS referral_reversal_once_idx ON referral_commission_transactions(redemption_id) WHERE type = 'REVERSAL';
    CREATE UNIQUE INDEX IF NOT EXISTS referral_payment_once_idx ON referral_commission_transactions(payment_id) WHERE type = 'PAYMENT';
    CREATE INDEX IF NOT EXISTS referral_coupons_person_idx ON referral_coupons(referral_person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS referral_redemptions_user_idx ON referral_redemptions(redeemed_by_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS referral_redemptions_person_idx ON referral_redemptions(referral_person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS referral_transactions_person_idx ON referral_commission_transactions(referral_person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS referral_payments_person_idx ON referral_payments(referral_person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS referral_audit_entity_idx ON referral_audit_logs(entity_type, entity_id, created_at DESC);

    CREATE OR REPLACE FUNCTION referral_block_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'referral history cannot be deleted'; END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS referral_people_no_delete ON referral_people;
    CREATE TRIGGER referral_people_no_delete BEFORE DELETE ON referral_people FOR EACH ROW EXECUTE FUNCTION referral_block_delete();
    DROP TRIGGER IF EXISTS referral_coupons_no_delete ON referral_coupons;
    CREATE TRIGGER referral_coupons_no_delete BEFORE DELETE ON referral_coupons FOR EACH ROW EXECUTE FUNCTION referral_block_delete();
    DROP TRIGGER IF EXISTS referral_redemptions_no_delete ON referral_redemptions;
    CREATE TRIGGER referral_redemptions_no_delete BEFORE DELETE ON referral_redemptions FOR EACH ROW EXECUTE FUNCTION referral_block_delete();
    DROP TRIGGER IF EXISTS referral_payments_no_delete ON referral_payments;
    CREATE TRIGGER referral_payments_no_delete BEFORE DELETE ON referral_payments FOR EACH ROW EXECUTE FUNCTION referral_block_delete();
    DROP TRIGGER IF EXISTS referral_transactions_no_delete ON referral_commission_transactions;
    CREATE TRIGGER referral_transactions_no_delete BEFORE DELETE ON referral_commission_transactions FOR EACH ROW EXECUTE FUNCTION referral_block_delete();

    CREATE OR REPLACE FUNCTION referral_protect_redemption() RETURNS trigger AS $$
    BEGIN
      IF NEW.id <> OLD.id OR NEW.request_token <> OLD.request_token OR NEW.coupon_id <> OLD.coupon_id OR NEW.referral_person_id <> OLD.referral_person_id
         OR NEW.coupon_code <> OLD.coupon_code OR NEW.product_name <> OLD.product_name OR NEW.normal_price_cents <> OLD.normal_price_cents
         OR NEW.promotional_price_cents <> OLD.promotional_price_cents OR NEW.commission_cents <> OLD.commission_cents
         OR NEW.xp_points <> OLD.xp_points OR NEW.redeemed_by_user_id <> OLD.redeemed_by_user_id OR NEW.redeemed_by_name <> OLD.redeemed_by_name
         OR NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'redemption identity is immutable'; END IF;
      IF OLD.status = 'CANCELLED' AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'cancelled redemption cannot be reactivated'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS referral_protect_redemption_trigger ON referral_redemptions;
    CREATE TRIGGER referral_protect_redemption_trigger BEFORE UPDATE ON referral_redemptions FOR EACH ROW EXECUTE FUNCTION referral_protect_redemption();

    CREATE OR REPLACE FUNCTION referral_block_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'financial history is immutable'; END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS referral_payments_no_update ON referral_payments;
    CREATE TRIGGER referral_payments_no_update BEFORE UPDATE ON referral_payments FOR EACH ROW EXECUTE FUNCTION referral_block_update();
    DROP TRIGGER IF EXISTS referral_transactions_no_update ON referral_commission_transactions;
    CREATE TRIGGER referral_transactions_no_update BEFORE UPDATE ON referral_commission_transactions FOR EACH ROW EXECUTE FUNCTION referral_block_update();
  `);
}

const COUPON_SELECT = `SELECT c.id::text, c.referral_person_id::text AS person_id, p.name AS person_name, c.code, c.product_name,
  c.normal_price_cents::text, c.promotional_price_cents::text, c.commission_cents::text,
  c.start_date::text, c.expiration_date::text, c.status, c.created_at,
  (SELECT COUNT(*)::text FROM referral_redemptions r WHERE r.coupon_id = c.id AND r.status = 'ACTIVE') AS uses_count
  FROM referral_coupons c JOIN referral_people p ON p.id = c.referral_person_id`;

const PERSON_SELECT = `SELECT p.id::text, p.name, p.phone, p.pix, p.notes, p.active,
  COALESCE(ledger.balance_cents, 0)::text AS balance_cents,
  COALESCE(ledger.paid_cents, 0)::text AS paid_cents,
  COALESCE(ledger.generated_cents, 0)::text AS generated_cents,
  COALESCE(ledger.month_generated_cents, 0)::text AS month_generated_cents,
  COALESCE(uses.uses_count, 0)::text AS uses_count,
  COALESCE(coupons.active_coupons, 0)::text AS active_coupons
  FROM referral_people p
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(CASE WHEN t.type = 'COMMISSION' THEN t.amount_cents ELSE -t.amount_cents END), 0) AS balance_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'PAYMENT'), 0) AS paid_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'COMMISSION'), 0) AS generated_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'COMMISSION' AND date_trunc('month', t.created_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')), 0) AS month_generated_cents
      FROM referral_commission_transactions t WHERE t.referral_person_id = p.id
  ) ledger ON TRUE
  LEFT JOIN LATERAL (SELECT COUNT(*) AS uses_count FROM referral_redemptions r WHERE r.referral_person_id = p.id AND r.status = 'ACTIVE') uses ON TRUE
  LEFT JOIN LATERAL (SELECT COUNT(*) AS active_coupons FROM referral_coupons c WHERE c.referral_person_id = p.id AND c.status = 'ACTIVE') coupons ON TRUE`;

const REDEMPTION_SELECT = `SELECT r.id::text, r.coupon_id::text, r.coupon_code, r.referral_person_id::text AS person_id,
  p.name AS person_name, r.product_name, r.commission_cents::text, r.xp_points::text, r.xp_status,
  r.redeemed_by_user_id::text, r.redeemed_by_name, r.status, r.created_at, r.cancelled_at, r.cancellation_reason
  FROM referral_redemptions r JOIN referral_people p ON p.id = r.referral_person_id`;

async function loadCouponById(id: number): Promise<CouponRow | null> {
  const result = await referralPool.query<CouponRow & QueryResultRow>(`${COUPON_SELECT} WHERE c.id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

async function loadCouponByCode(value: string): Promise<CouponRow | null> {
  const key = couponCodeKey(value);
  if (key.length < 4) return null;
  const result = await referralPool.query<CouponRow & QueryResultRow>(`${COUPON_SELECT} WHERE c.code_key = $1 LIMIT 1`, [key]);
  return result.rows[0] || null;
}

async function loadPeople(): Promise<PersonRow[]> {
  const result = await referralPool.query<PersonRow & QueryResultRow>(`${PERSON_SELECT} ORDER BY p.active DESC, p.name, p.id`);
  return result.rows;
}

async function loadPerson(id: number): Promise<PersonRow | null> {
  const result = await referralPool.query<PersonRow & QueryResultRow>(`${PERSON_SELECT} WHERE p.id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

async function loadPersonCoupons(id: number): Promise<CouponRow[]> {
  const result = await referralPool.query<CouponRow & QueryResultRow>(`${COUPON_SELECT} WHERE c.referral_person_id = $1 ORDER BY c.created_at DESC, c.id DESC`, [id]);
  return result.rows;
}

async function loadRedemptions(where: string, params: unknown[], limit: number): Promise<RedemptionRow[]> {
  const result = await referralPool.query<RedemptionRow & QueryResultRow>(`${REDEMPTION_SELECT} ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ${Math.max(1, Math.min(200, limit))}`, params);
  return result.rows;
}

async function loadPayments(): Promise<PaymentRow[]> {
  const result = await referralPool.query<PaymentRow & QueryResultRow>(
    `SELECT id::text, referral_person_id::text AS person_id, person_name, amount_cents::text, payment_method, registered_by_name, notes, created_at FROM referral_payments ORDER BY created_at DESC, id DESC LIMIT 100`,
  );
  return result.rows;
}

async function loadSummary(): Promise<Summary> {
  const result = await referralPool.query<QueryResultRow & { today_uses: string; month_uses: string; today_commission: string; month_commission: string; active_people: string }>(`
    SELECT COUNT(*) FILTER (WHERE r.status = 'ACTIVE' AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)::text AS today_uses,
      COUNT(*) FILTER (WHERE r.status = 'ACTIVE' AND date_trunc('month', r.created_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo'))::text AS month_uses,
      COALESCE(SUM(r.commission_cents) FILTER (WHERE r.status = 'ACTIVE' AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::text AS today_commission,
      COALESCE(SUM(r.commission_cents) FILTER (WHERE r.status = 'ACTIVE' AND date_trunc('month', r.created_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')), 0)::text AS month_commission,
      (SELECT COUNT(*)::text FROM referral_people WHERE active = TRUE) AS active_people FROM referral_redemptions r`);
  const row = result.rows[0];
  return { todayUses: Number(row?.today_uses || 0), monthUses: Number(row?.month_uses || 0), todayCommissionCents: Number(row?.today_commission || 0), monthCommissionCents: Number(row?.month_commission || 0), activePeople: Number(row?.active_people || 0) };
}

async function loadRanking(): Promise<RankingRow[]> {
  const result = await referralPool.query<RankingRow & QueryResultRow>(`
    SELECT p.id::text AS person_id, p.name AS person_name, COUNT(r.id)::text AS uses_count, COALESCE(SUM(r.commission_cents), 0)::text AS generated_cents
      FROM referral_people p JOIN referral_redemptions r ON r.referral_person_id = p.id AND r.status = 'ACTIVE'
     GROUP BY p.id, p.name ORDER BY COUNT(r.id) DESC, SUM(r.commission_cents) DESC, p.name LIMIT 12`);
  return result.rows;
}

async function balanceForPerson(client: PoolClient, personId: number): Promise<number> {
  const result = await client.query<BalanceRow>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'COMMISSION' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance_cents FROM referral_commission_transactions WHERE referral_person_id = $1`,
    [personId],
  );
  return Number(result.rows[0]?.balance_cents || 0);
}

async function uniqueAutomaticCode(client: PoolClient, personName: string, preferred: string): Promise<{ code: string; key: string }> {
  const candidates = [preferred];
  for (let index = 0; index < 40; index += 1) candidates.push(formatAutomaticCouponCode(personName, crypto.randomInt(0, 10_000)));
  for (const code of candidates) {
    const key = couponCodeKey(code);
    const exists = await client.query(`SELECT 1 FROM referral_coupons WHERE code_key = $1 LIMIT 1`, [key]);
    if (!exists.rows[0]) return { code, key };
  }
  throw new Error('Nao foi possivel reservar um codigo automatico unico.');
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
  const result = await referralPool.query<HealthRow>(`
    SELECT (SELECT COUNT(*) FROM referral_people)::text AS people,
      (SELECT COUNT(*) FROM referral_coupons)::text AS coupons,
      (SELECT COUNT(*) FROM referral_coupons WHERE status = 'ACTIVE')::text AS active_coupons,
      (SELECT COUNT(*) FROM referral_redemptions)::text AS redemptions,
      (SELECT COUNT(*) FROM referral_redemptions WHERE status = 'CANCELLED')::text AS cancelled_redemptions,
      (SELECT COUNT(*) FROM referral_payments)::text AS payments,
      (SELECT COUNT(*) FROM referral_redemptions r WHERE r.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM referral_commission_transactions t WHERE t.redemption_id = r.id AND t.type = 'COMMISSION'))::text AS missing_commissions,
      (SELECT COUNT(*) FROM referral_redemptions r WHERE r.status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM referral_commission_transactions t WHERE t.redemption_id = r.id AND t.type = 'REVERSAL'))::text AS missing_reversals`);
  res.json({ ok: true, service: 'comissao', version: SERVICE_VERSION, storage: 'postgres', referrals: result.rows[0] });
}));

app.get(BASE_PATH, (req, res, next) => {
  if (!isBareBasePath(req.path, BASE_PATH)) return next();
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(`${BASE_PATH}/${query}`);
});

app.get(`${BASE_PATH}/`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const isAdmin = canAdmin(user);
  const codeQuery = cleanSingleLine(req.query.code, 24);
  const foundCoupon = codeQuery ? await loadCouponByCode(codeQuery) : null;
  const availability = foundCoupon
    ? couponAvailability({ status: foundCoupon.status, startDate: foundCoupon.start_date, expirationDate: foundCoupon.expiration_date }, localDateKey())
    : null;
  const selectedPersonId = isAdmin ? parsePositiveId(req.query.person_id) : null;
  const selectedCouponId = isAdmin ? parsePositiveId(req.query.coupon_id) : null;
  const [summary, ownRedemptions, people, ranking, recentRedemptions, recentPayments, selectedPerson, selectedPersonCoupons, selectedCoupon] = await Promise.all([
    loadSummary(),
    loadRedemptions(`WHERE r.redeemed_by_user_id = $1`, [user.id], 20),
    isAdmin ? loadPeople() : Promise.resolve([]),
    isAdmin ? loadRanking() : Promise.resolve([]),
    isAdmin ? loadRedemptions('', [], 100) : Promise.resolve([]),
    isAdmin ? loadPayments() : Promise.resolve([]),
    selectedPersonId ? loadPerson(selectedPersonId) : Promise.resolve(null),
    selectedPersonId ? loadPersonCoupons(selectedPersonId) : Promise.resolve([]),
    selectedCouponId ? loadCouponById(selectedCouponId) : Promise.resolve(null),
  ]);
  const model: DashboardViewModel = {
    basePath: BASE_PATH,
    csrfToken: ensureCsrf(req),
    redemptionToken: ensureToken(req, 'redemptionToken'),
    personToken: ensureToken(req, 'personToken'),
    couponToken: ensureToken(req, 'couponToken'),
    paymentToken: ensureToken(req, 'paymentToken'),
    user,
    isAdmin,
    flash: takeFlash(req),
    codeQuery,
    foundCoupon,
    foundCouponAvailable: availability?.available,
    foundCouponReason: availability?.reason,
    summary,
    ownRedemptions,
    recentRedemptions,
    recentPayments,
    people,
    ranking,
    selectedPerson,
    selectedPersonCoupons,
    selectedCoupon,
  };
  res.type('html').send(renderDashboard(model));
}));

app.post(`${BASE_PATH}/create-person`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  if (!csrfMatches(req) || !tokenMatches(req, 'personToken')) {
    setFlash(req, 'error', 'Formulario expirado. Atualize a pagina e tente novamente.');
    return res.redirect(`${BASE_PATH}/#cadastros`);
  }
  const parsed = validatePersonInput(req.body as Record<string, unknown>);
  if (!parsed.ok) { setFlash(req, 'error', parsed.message); return res.redirect(`${BASE_PATH}/#cadastros`); }
  const client = await referralPool.connect();
  let personId = 0;
  let created = false;
  try {
    await client.query('BEGIN');
    const inserted = await client.query<IdRow>(
      `INSERT INTO referral_people (request_token, name, phone, pix, notes, active, created_by_user_id, created_by_name)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8)
       ON CONFLICT (request_token) DO NOTHING RETURNING id::text`,
      [req.body.request_token, parsed.value.name, parsed.value.phone, parsed.value.pix, parsed.value.notes, parsed.value.active, user.id, user.displayName],
    );
    created = Boolean(inserted.rows[0]);
    if (created) personId = Number(inserted.rows[0]?.id || 0);
    else {
      const existing = await client.query<IdRow>(`SELECT id::text FROM referral_people WHERE request_token = $1`, [req.body.request_token]);
      personId = Number(existing.rows[0]?.id || 0);
    }
    if (!personId) throw new Error('Indicador nao identificado apos cadastro.');
    if (created) await insertAudit(client, 'person', personId, user, 'PERSON_CREATED', { name: parsed.value.name });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  delete req.session.personToken;
  if (created) await logCoreAudit(user.id, 'REFERRAL_PERSON_CREATED', 'referral_person', personId, `Indicador ${parsed.value.name} criado.`);
  setFlash(req, 'success', created ? `Indicador ${parsed.value.name} cadastrado.` : 'Este indicador ja havia sido cadastrado; nada foi duplicado.');
  return res.redirect(`${BASE_PATH}/?person_id=${personId}#indicador-detalhe`);
}));

app.post(`${BASE_PATH}/update-person`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  const personId = parsePositiveId(req.body.person_id);
  const parsed = validatePersonInput(req.body as Record<string, unknown>);
  if (!csrfMatches(req) || !personId || !parsed.ok) {
    setFlash(req, 'error', parsed.ok ? 'Formulario invalido.' : parsed.message);
    return res.redirect(`${BASE_PATH}/`);
  }
  const client = await referralPool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE referral_people SET name = $1, phone = NULLIF($2, ''), pix = NULLIF($3, ''), notes = NULLIF($4, ''), active = $5, updated_at = NOW() WHERE id = $6`,
      [parsed.value.name, parsed.value.phone, parsed.value.pix, parsed.value.notes, parsed.value.active, personId],
    );
    if (!updated.rowCount) throw new Error('Indicador nao encontrado.');
    await insertAudit(client, 'person', personId, user, 'PERSON_UPDATED', { name: parsed.value.name, active: parsed.value.active });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  await logCoreAudit(user.id, 'REFERRAL_PERSON_UPDATED', 'referral_person', personId, `Indicador ${parsed.value.name} atualizado.`);
  setFlash(req, 'success', 'Indicador atualizado sem alterar o historico financeiro.');
  return res.redirect(`${BASE_PATH}/?person_id=${personId}#indicador-detalhe`);
}));

app.post(`${BASE_PATH}/create-coupon`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  if (!csrfMatches(req) || !tokenMatches(req, 'couponToken')) {
    setFlash(req, 'error', 'Formulario expirado. Atualize a pagina e tente novamente.');
    return res.redirect(`${BASE_PATH}/#cadastros`);
  }
  const parsed = validateCouponInput(req.body as Record<string, unknown>);
  if (!parsed.ok) { setFlash(req, 'error', parsed.message); return res.redirect(`${BASE_PATH}/#cadastros`); }
  const client = await referralPool.connect();
  let couponId = 0;
  let created = false;
  let finalCode = parsed.value.code;
  try {
    await client.query('BEGIN');
    const person = await client.query<QueryResultRow & { name: string; active: boolean }>(`SELECT name, active FROM referral_people WHERE id = $1 FOR UPDATE`, [parsed.value.personId]);
    if (!person.rows[0]?.active) throw new Error('Selecione um indicador ativo.');
    let codeKey = parsed.value.codeKey;
    if (parsed.value.automaticCode) {
      const reserved = await uniqueAutomaticCode(client, person.rows[0].name, finalCode);
      finalCode = reserved.code;
      codeKey = reserved.key;
    } else {
      const duplicate = await client.query(`SELECT 1 FROM referral_coupons WHERE code_key = $1 LIMIT 1`, [codeKey]);
      if (duplicate.rows[0]) {
        await client.query('ROLLBACK');
        setFlash(req, 'error', 'Este codigo ja existe. Escolha outro codigo.');
        return res.redirect(`${BASE_PATH}/#cadastros`);
      }
    }
    const inserted = await client.query<IdRow>(
      `INSERT INTO referral_coupons (request_token, referral_person_id, code, code_key, product_name, normal_price_cents, promotional_price_cents, commission_cents, start_date, expiration_date, status, created_by_user_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13)
       ON CONFLICT (request_token) DO NOTHING RETURNING id::text`,
      [req.body.request_token, parsed.value.personId, finalCode, codeKey, parsed.value.productName, parsed.value.normalPriceCents, parsed.value.promotionalPriceCents, parsed.value.commissionCents, parsed.value.startDate, parsed.value.expirationDate, parsed.value.status, user.id, user.displayName],
    );
    created = Boolean(inserted.rows[0]);
    if (created) couponId = Number(inserted.rows[0]?.id || 0);
    else {
      const existing = await client.query<IdRow>(`SELECT id::text FROM referral_coupons WHERE request_token = $1`, [req.body.request_token]);
      couponId = Number(existing.rows[0]?.id || 0);
    }
    if (!couponId) throw new Error('Cupom nao identificado apos cadastro.');
    if (created) await insertAudit(client, 'coupon', couponId, user, 'COUPON_CREATED', { code: finalCode, person_id: parsed.value.personId, commission_cents: parsed.value.commissionCents });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') {
      setFlash(req, 'error', 'Este codigo ja existe. Escolha outro codigo.');
      return res.redirect(`${BASE_PATH}/#cadastros`);
    }
    if (error instanceof Error && error.message === 'Selecione um indicador ativo.') {
      setFlash(req, 'error', error.message);
      return res.redirect(`${BASE_PATH}/#cadastros`);
    }
    throw error;
  } finally { client.release(); }
  delete req.session.couponToken;
  if (created) await logCoreAudit(user.id, 'REFERRAL_COUPON_CREATED', 'referral_coupon', couponId, `Cupom ${finalCode} criado.`, { person_id: parsed.value.personId });
  setFlash(req, 'success', created ? `Cupom ${finalCode} criado. Confira e imprima pelo perfil do indicador.` : 'Este cupom ja havia sido criado; nada foi duplicado.');
  return res.redirect(`${BASE_PATH}/?person_id=${parsed.value.personId}&coupon_id=${couponId}#editar-cupom`);
}));

app.post(`${BASE_PATH}/update-coupon`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  const couponId = parsePositiveId(req.body.coupon_id);
  const parsed = validateCouponInput(req.body as Record<string, unknown>);
  if (!csrfMatches(req) || !couponId || !parsed.ok) {
    setFlash(req, 'error', parsed.ok ? 'Formulario invalido.' : parsed.message);
    return res.redirect(`${BASE_PATH}/`);
  }
  const client = await referralPool.connect();
  try {
    await client.query('BEGIN');
    const person = await client.query<QueryResultRow & { active: boolean }>(`SELECT active FROM referral_people WHERE id = $1`, [parsed.value.personId]);
    if (!person.rows[0]) throw new Error('Indicador nao encontrado.');
    if (parsed.value.status === 'ACTIVE' && !person.rows[0].active) {
      throw new Error('Cupom ativo exige um indicador ativo.');
    }
    await client.query(
      `UPDATE referral_coupons SET referral_person_id=$1, code=$2, code_key=$3, product_name=$4, normal_price_cents=$5, promotional_price_cents=$6, commission_cents=$7, start_date=$8::date, expiration_date=$9::date, status=$10, updated_at=NOW() WHERE id=$11`,
      [parsed.value.personId, parsed.value.code, parsed.value.codeKey, parsed.value.productName, parsed.value.normalPriceCents, parsed.value.promotionalPriceCents, parsed.value.commissionCents, parsed.value.startDate, parsed.value.expirationDate, parsed.value.status, couponId],
    );
    await insertAudit(client, 'coupon', couponId, user, 'COUPON_UPDATED', { code: parsed.value.code, status: parsed.value.status, commission_cents: parsed.value.commissionCents });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') {
      setFlash(req, 'error', 'Este codigo ja pertence a outro cupom.');
      return res.redirect(`${BASE_PATH}/?person_id=${parsed.value.personId}&coupon_id=${couponId}#editar-cupom`);
    }
    throw error;
  } finally { client.release(); }
  await logCoreAudit(user.id, 'REFERRAL_COUPON_UPDATED', 'referral_coupon', couponId, `Cupom ${parsed.value.code} atualizado.`);
  setFlash(req, 'success', 'Cupom atualizado. Utilizacoes antigas preservaram os valores originais.');
  return res.redirect(`${BASE_PATH}/?person_id=${parsed.value.personId}&coupon_id=${couponId}#editar-cupom`);
}));

app.post(`${BASE_PATH}/redeem`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const couponId = parsePositiveId(req.body.coupon_id);
  if (!csrfMatches(req) || !tokenMatches(req, 'redemptionToken') || !couponId) {
    setFlash(req, 'error', 'Confirmacao expirada. Consulte o codigo novamente.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const client = await referralPool.connect();
  let redemptionId = 0;
  let created = false;
  let code = '';
  let personName = '';
  let commissionCents = 0;
  let status = '';
  try {
    await client.query('BEGIN');
    const couponResult = await client.query<CouponRow & QueryResultRow>(`${COUPON_SELECT} WHERE c.id = $1 FOR UPDATE OF c`, [couponId]);
    const coupon = couponResult.rows[0];
    if (!coupon) throw new Error('Cupom nao encontrado.');
    const available = couponAvailability({ status: coupon.status, startDate: coupon.start_date, expirationDate: coupon.expiration_date }, localDateKey());
    if (!available.available) {
      await client.query('ROLLBACK');
      setFlash(req, 'error', available.reason);
      return res.redirect(`${BASE_PATH}/?code=${encodeURIComponent(coupon.code)}`);
    }
    await client.query(`SELECT id FROM referral_people WHERE id = $1 FOR UPDATE`, [Number(coupon.person_id)]);
    const inserted = await client.query<IdRow>(
      `INSERT INTO referral_redemptions (request_token, coupon_id, referral_person_id, coupon_code, product_name, normal_price_cents, promotional_price_cents, commission_cents, redeemed_by_user_id, redeemed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (request_token) DO NOTHING RETURNING id::text`,
      [req.body.request_token, couponId, Number(coupon.person_id), coupon.code, coupon.product_name, Number(coupon.normal_price_cents), Number(coupon.promotional_price_cents), Number(coupon.commission_cents), user.id, user.displayName],
    );
    created = Boolean(inserted.rows[0]);
    if (created) redemptionId = Number(inserted.rows[0]?.id || 0);
    else {
      const existing = await client.query<QueryResultRow & { id: string; status: string }>(`SELECT id::text, status FROM referral_redemptions WHERE request_token = $1`, [req.body.request_token]);
      redemptionId = Number(existing.rows[0]?.id || 0);
      status = existing.rows[0]?.status || '';
    }
    if (!redemptionId) throw new Error('Utilizacao nao identificada.');
    if (created) {
      await client.query(
        `INSERT INTO referral_commission_transactions (referral_person_id, redemption_id, type, amount_cents) VALUES ($1,$2,'COMMISSION',$3) ON CONFLICT DO NOTHING`,
        [Number(coupon.person_id), redemptionId, Number(coupon.commission_cents)],
      );
      await insertAudit(client, 'redemption', redemptionId, user, 'REDEMPTION_CREATED', { coupon_id: couponId, code: coupon.code, person_id: Number(coupon.person_id), commission_cents: Number(coupon.commission_cents), xp_points: 300 });
      status = 'ACTIVE';
    }
    await client.query('COMMIT');
    code = coupon.code;
    personName = coupon.person_name;
    commissionCents = Number(coupon.commission_cents);
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
  const xpResult = status === 'ACTIVE' ? await awardXp(redemptionId, user) : { awarded: false, message: 'Utilizacao cancelada; nenhum XP foi gerado.' };
  delete req.session.redemptionToken;
  if (created) await logCoreAudit(user.id, 'REFERRAL_REDEMPTION_CREATED', 'referral_redemption', redemptionId, `Cupom ${code} utilizado para ${personName}.`, { coupon_id: couponId, commission_cents: commissionCents, xp_points: 300 });
  setFlash(req, 'success', created ? `Codigo ${code} utilizado. ${personName} recebeu a comissao e ${xpResult.message}` : `Esta utilizacao ja estava registrada. ${xpResult.message}`);
  return res.redirect(`${BASE_PATH}/`);
}));

app.post(`${BASE_PATH}/pay`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  if (!csrfMatches(req) || !tokenMatches(req, 'paymentToken')) {
    setFlash(req, 'error', 'Formulario de pagamento expirado.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const personId = parsePositiveId(req.body.referral_person_id);
  if (!personId) { setFlash(req, 'error', 'Indicador invalido.'); return res.redirect(`${BASE_PATH}/`); }
  const client = await referralPool.connect();
  let paymentId = 0;
  let created = false;
  let personName = '';
  let amountCents = 0;
  try {
    await client.query('BEGIN');
    const existing = await client.query<IdRow>(`SELECT id::text FROM referral_payments WHERE request_token = $1`, [req.body.request_token]);
    if (existing.rows[0]) {
      paymentId = Number(existing.rows[0].id);
      await client.query('COMMIT');
    } else {
      const person = await client.query<QueryResultRow & { name: string }>(`SELECT name FROM referral_people WHERE id = $1 FOR UPDATE`, [personId]);
      if (!person.rows[0]) throw new Error('Indicador nao encontrado.');
      personName = person.rows[0].name;
      const balance = await balanceForPerson(client, personId);
      const parsed = validatePaymentInput(req.body as Record<string, unknown>, balance);
      if (!parsed.ok) {
        await client.query('ROLLBACK');
        setFlash(req, 'error', parsed.message);
        return res.redirect(`${BASE_PATH}/?person_id=${personId}#indicador-detalhe`);
      }
      amountCents = parsed.value.amountCents;
      const inserted = await client.query<IdRow>(
        `INSERT INTO referral_payments (request_token, referral_person_id, person_name, amount_cents, payment_method, notes, registered_by_user_id, registered_by_name)
         VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8) RETURNING id::text`,
        [req.body.request_token, personId, personName, parsed.value.amountCents, parsed.value.paymentMethod, parsed.value.notes, user.id, user.displayName],
      );
      paymentId = Number(inserted.rows[0]?.id || 0);
      await client.query(
        `INSERT INTO referral_commission_transactions (referral_person_id, payment_id, type, amount_cents) VALUES ($1,$2,'PAYMENT',$3)`,
        [personId, paymentId, parsed.value.amountCents],
      );
      await insertAudit(client, 'payment', paymentId, user, 'PAYMENT_CREATED', { person_id: personId, amount_cents: parsed.value.amountCents, payment_method: parsed.value.paymentMethod });
      await client.query('COMMIT');
      created = true;
    }
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
  delete req.session.paymentToken;
  if (created) await logCoreAudit(user.id, 'REFERRAL_PAYMENT_CREATED', 'referral_payment', paymentId, `Pagamento de comissao registrado para ${personName}.`, { person_id: personId, amount_cents: amountCents });
  setFlash(req, 'success', created ? 'Pagamento registrado. Saldo e historico foram atualizados.' : 'Este pagamento ja estava registrado; nada foi duplicado.');
  return res.redirect(`${BASE_PATH}/?person_id=${personId}#indicador-detalhe`);
}));

app.post(`${BASE_PATH}/cancel-redemption`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  const redemptionId = parsePositiveId(req.body.redemption_id);
  const reason = cleanSingleLine(req.body.reason, 240);
  if (!csrfMatches(req) || !redemptionId || reason.length < 3) {
    setFlash(req, 'error', 'Informe um motivo valido para o cancelamento.');
    return res.redirect(`${BASE_PATH}/#historicos`);
  }
  const client = await referralPool.connect();
  let cancelled = false;
  let personId = 0;
  let commissionCents = 0;
  try {
    await client.query('BEGIN');
    const result = await client.query<QueryResultRow & { status: string; referral_person_id: string; commission_cents: string }>(
      `SELECT status, referral_person_id::text, commission_cents::text FROM referral_redemptions WHERE id = $1 FOR UPDATE`, [redemptionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Utilizacao nao encontrada.');
    personId = Number(row.referral_person_id);
    commissionCents = Number(row.commission_cents);
    await client.query(`SELECT id FROM referral_people WHERE id = $1 FOR UPDATE`, [personId]);
    if (row.status === 'ACTIVE') {
      await client.query(
        `UPDATE referral_redemptions SET status='CANCELLED', cancelled_at=NOW(), cancelled_by_user_id=$1, cancelled_by_name=$2, cancellation_reason=$3 WHERE id=$4`,
        [user.id, user.displayName, reason, redemptionId],
      );
      await client.query(
        `INSERT INTO referral_commission_transactions (referral_person_id, redemption_id, type, amount_cents) VALUES ($1,$2,'REVERSAL',$3) ON CONFLICT DO NOTHING`,
        [personId, redemptionId, commissionCents],
      );
      await insertAudit(client, 'redemption', redemptionId, user, 'REDEMPTION_CANCELLED', { person_id: personId, commission_cents: commissionCents, reason });
      cancelled = true;
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const xpResult = await revokeXp(redemptionId, user);
  if (cancelled) await logCoreAudit(user.id, 'REFERRAL_REDEMPTION_CANCELLED', 'referral_redemption', redemptionId, 'Utilizacao de cupom cancelada.', { person_id: personId, commission_cents: commissionCents, reason });
  setFlash(req, 'success', cancelled ? `Utilizacao cancelada. A comissao foi estornada. ${xpResult.message}` : `Esta utilizacao ja estava cancelada. ${xpResult.message}`);
  return res.redirect(`${BASE_PATH}/#historicos`);
}));

app.post(`${BASE_PATH}/print-coupon`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  const couponId = parsePositiveId(req.body.coupon_id);
  if (!csrfMatches(req) || !couponId || !(await loadCouponById(couponId))) {
    setFlash(req, 'error', 'Cupom indisponivel para impressao.');
    return res.redirect(`${BASE_PATH}/`);
  }
  req.session.printCouponId = couponId;
  await insertAuditSafe('coupon', couponId, user, 'COUPON_PRINTED');
  await logCoreAudit(user.id, 'REFERRAL_COUPON_PRINTED', 'referral_coupon', couponId, 'Impressao de cupom de indicacao solicitada.');
  await saveSession(req);
  return res.redirect(`${BASE_PATH}/print/${couponId}`);
}));

app.get(`${BASE_PATH}/print/:id`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!canAdmin(user)) return res.status(403).send('Acesso negado.');
  const couponId = parsePositiveId(req.params.id);
  if (!couponId || req.session.printCouponId !== couponId) return res.redirect(`${BASE_PATH}/`);
  delete req.session.printCouponId;
  const coupon = await loadCouponById(couponId);
  if (!coupon) return res.redirect(`${BASE_PATH}/`);
  res.type('html').send(renderCouponReceipt(BASE_PATH, coupon));
}));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error('[comissao] request failed', error);
  if (res.headersSent) return;
  setFlash(req, 'error', 'Nao foi possivel concluir a operacao. Nenhum valor deve ser repetido; tente novamente.');
  res.status(500).redirect(`${BASE_PATH}/`);
});

async function waitForStartupDependencies(maxAttempts = 30): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ensureSchema();
      await corePool.query('SELECT 1 FROM core_users LIMIT 1');
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      console.warn(`[comissao] dependencias indisponiveis (${attempt}/${maxAttempts}); nova tentativa em 1s.`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function start(): Promise<void> {
  if (!env.COMISSAO_SESSION_SECRET) console.warn('[comissao] COMISSAO_SESSION_SECRET ausente; usando segredo temporario desta inicializacao.');
  await waitForStartupDependencies();
  app.listen(PORT, () => console.log(`[comissao] listening on ${PORT}${BASE_PATH}`));
}

start().catch((error) => {
  console.error('[comissao] startup failed', error);
  process.exit(1);
});
