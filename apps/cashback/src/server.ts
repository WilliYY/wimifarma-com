import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type FlashType = 'success' | 'error' | 'info' | '';
type DbRow = Record<string, unknown>;

type Flash = {
  type: FlashType;
  message: string;
};

type User = {
  id: number;
  username: string;
  displayName?: string;
  role: string;
};

type Balance = {
  totalGerado: number;
  saldoDisponivel: number;
  saldoExpirado: number;
  saldoExpirando: number;
  saldoUsado: number;
  proximoVencimento: string | null;
};

type CreditExpirySlice = {
  expiresAt: string;
  amountCents: number;
  credits: number;
  daysUntil: number | null;
};

type XpRewardStatus = {
  available: boolean;
  employeeName: string | null;
  message: string;
};

type XpAwardResult = {
  awarded: boolean;
  alreadyAwarded?: boolean;
  employeeName?: string;
  saleId?: number;
  message: string;
};

type Settings = {
  cashbackPercent: number;
  cashbackPercentBps: number;
  validityDays: number;
  redeemMultiplier: number;
  expirationAlertDays: number;
};

type QuickVoucherIssue = {
  id: number;
  code: string;
  grossCents: number;
  cashbackCents: number;
  expiresAt: string;
};

type QuickVoucherRedemption = {
  voucherId: number;
  code: string;
  redeemedCents: number;
  redemptionId: number;
  purchaseId: number;
  chargedCents: number;
  successor: QuickVoucherIssue | null;
};

type MigrationStats = {
  lastRunAt: string | null;
  lastError: string | null;
  imported: Record<string, number>;
};

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    flash?: Flash;
    loginAttempts?: number[];
    loginBlockedUntil?: number;
    quickVoucherReceiptIds?: number[];
    returnTo?: string;
    user?: User;
  }
}

const env = process.env;
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_ASSET_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webp|woff2?)$/i;
const SERVICE_VERSION = '1.1.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/cashback');
const PORT = Number.parseInt(env.PORT || '4000', 10);
const SESSION_SECRET = env.CASHBACK_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_PROVIDER = 'core';
const INTERNAL_TOKEN = env.CASHBACK_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || '';
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const RECOMPRA_QUEUE_VISIBLE_DAYS = 14;
const CASHBACK_CREDIT_VALIDITY_DAYS = 45;
const QUICK_VOUCHER_VALIDITY_YEARS = 1;
const QUICK_VOUCHER_CODE_SPACE = 10000;
const QUICK_VOUCHER_ADVISORY_LOCK = 20260721;
const XP_CASHBACK_REDEEM_POINTS = 500;
const XP_CASHBACK_REDEEM_SOURCE = 'cashback_redemption';

function setStaticAssetCacheHeaders(res: Response, filePath: string): void {
  if (!STATIC_ASSET_FILE_RE.test(filePath)) return;
  res.removeHeader('Pragma');
  res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
  res.setHeader('Expires', new Date(Date.now() + STATIC_ASSET_MAX_AGE_MS).toUTCString());
}

const migrationStats: MigrationStats = {
  lastRunAt: null,
  lastError: null,
  imported: {},
};

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.POSTGRES_PORT || '5432', 10),
  database: env.POSTGRES_DB || 'wimifarma_cashback',
  user: env.POSTGRES_USER || 'wimifarma_cashback',
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

const xpPgPool = new Pool({
  host: env.XP_POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.XP_POSTGRES_PORT || '5432', 10),
  database: env.XP_POSTGRES_DB || 'wimifarma_xp',
  user: env.XP_POSTGRES_USER || 'wimifarma_xp',
  password: env.XP_POSTGRES_PASSWORD || '',
  max: 3,
});

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFCASHBACK',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'cashback_sessions',
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

app.disable('x-powered-by');
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(
  BASE_PATH,
  express.static(publicDir, {
    etag: false,
    index: false,
    maxAge: 0,
    setHeaders: setStaticAssetCacheHeaders,
  }),
);

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const pgCounts = await tableCounts();
    const coreReachable = await corePgPool
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    res.json({
      ok: true,
      service: 'cashback',
      version: SERVICE_VERSION,
      mode: 'official',
      auth: { provider: AUTH_PROVIDER, coreReachable },
      storage: { provider: 'postgres', database: env.POSTGRES_DB || 'wimifarma_cashback' },
      legacy: {
        mysqlImport: false,
        mysqlMirror: false,
        mysqlLogs: false,
        counts: null,
      },
      counts: pgCounts,
      migration: migrationStats,
    });
  } catch (error) {
    res.status(500).json({ ok: false, service: 'cashback', error: errorMessage(error) });
  }
});

const router = express.Router();
app.use(BASE_PATH, sessionMiddleware, router);

router.get(['/', '/index.php'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.user) {
      const user = await userByHomeSso(req);
      if (user) await regenerateWithUser(req, user);
    }
  } catch (error) {
    next(error);
    return;
  }
  res.redirect(req.session.user ? `${BASE_PATH}/dashboard.php#busca` : '/');
});

router.get('/login.php', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.user) {
      const user = await userByHomeSso(req);
      if (user) await regenerateWithUser(req, user);
    }
  } catch (error) {
    next(error);
    return;
  }
  if (req.session.user) {
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  res.redirect('/');
});

router.post('/login.php', async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    res.status(403).send(renderLogin(req, 'Sessao expirada. Tente novamente.'));
    return;
  }

  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const waitSeconds = await loginRateLimitWaitSeconds(req, username);

  if (waitSeconds > 0) {
    const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
    res.send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${minutes} minuto(s).`));
    return;
  }

  try {
    const user = await authenticateUser(username, password);
    if (user) {
      await clearLoginRateLimit(req, username);
      req.session.regenerate((err: Error | null) => {
        if (err) {
          res.status(500).send(renderLogin(req, 'Nao foi possivel iniciar a sessao.'));
          return;
        }
        req.session.user = user;
        void logAction(req, 'login_cashback', 'user', user.id, 'Login Cashback realizado.');
        res.redirect(`${BASE_PATH}/dashboard.php#busca`);
      });
      return;
    }
    await registerLoginFailure(req, username);
    await logAction(req, 'login_cashback_falha', 'user', null, `Tentativa de login Cashback falhou para usuario: ${username}`);
    res.send(renderLogin(req, 'Usuario ou senha incorretos.'));
  } catch {
    res.send(renderLogin(req, 'Nao foi possivel conectar ao login interno. Confira o core de usuarios.'));
  }
});

router.get('/logout.php', async (req: Request, res: Response) => {
  if (req.session.user) {
    await logAction(req, 'logout_cashback', 'user', req.session.user.id, 'Logout Cashback realizado.');
  }
  req.session.destroy(() => {
    res.clearCookie('WFCASHBACK', { path: '/' });
    res.redirect('/');
  });
});

router.get('/manutencao.php', (req: Request, res: Response) => {
  res.send(renderMaintenance(req, ''));
});

router.post('/manutencao.php', async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    res.status(403).send(renderMaintenance(req, 'Sessao expirada.'));
    return;
  }
  if (String(req.body?.action || '') === 'disable_maintenance') {
    if (!req.session.user) {
      res.status(403).send(renderMaintenance(req, 'Entre pela Home para liberar o sistema.'));
      return;
    }
    await setSetting('maintenance_enabled', '0');
    await setSetting('maintenance_finished_at', sqlNowText());
    await logAction(req, 'manutencao_desativada', 'system', null, 'Modo manutencao desativado por usuario autenticado.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  res.send(renderMaintenance(req, 'Acao invalida. O sistema continua em manutencao.'));
});

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/internal/') || req.path.startsWith('/internal/')) {
    next();
    return;
  }
  requireAuth(req, res, next);
});

router.get('/dashboard.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  await refreshExpiredQuickVouchers();
  res.send(await renderDashboard(req));
});

router.post('/dashboard.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  await refreshExpiredCredits();
  await refreshExpiredQuickVouchers();
  await handleDashboardPost(req, res);
});

router.get('/clientes.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.send(await renderClients(req));
});

router.post('/clientes.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/clientes.php`);
    return;
  }
  await handleClientsPost(req, res);
});

router.get('/cliente-detalhe.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.send(await renderClientDetail(req, res));
});

router.post('/cliente-detalhe.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/clientes.php`);
    return;
  }
  await refreshExpiredCredits();
  await handleClientDetailPost(req, res);
});

router.get('/compras.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.send(await renderPurchases(req));
});

router.post('/compras.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/compras.php`);
    return;
  }
  await refreshExpiredCredits();
  await handleSimplePurchasePost(req, res);
});

router.get('/resgates.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.send(await renderRedemptions(req));
});

router.post('/resgates.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/resgates.php`);
    return;
  }
  await refreshExpiredCredits();
  await handleManualRedemptionPost(req, res);
});

router.get('/mensagens.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.send(await renderMessages(req));
});

router.get('/atendentes.php', clearSensitive, maintenanceGuard, (req: Request, res: Response) => {
  setFlash(req, 'info', 'Cadastro de atendentes agora fica em Configuracao e Relatorio.');
  res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
});

router.get(['/financeiro.php', '/financeiro-exportar.php'], clearSensitive, maintenanceGuard, (_req: Request, res: Response) => {
  res.redirect('/financeiro/');
});

router.post('/api-whatsapp-status.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    res.status(403).json({ ok: false, message: 'Sessao expirada.' });
    return;
  }
  await handleWhatsappStatus(req, res);
});

router.get('/api-clientes.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  res.json({ clientes: await clientSearchPayload(req.query.q ?? req.query.term ?? '') });
});

router.get('/api-cashback-rapido.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  const code = normalizeQuickVoucherCode(req.query.codigo);
  if (!code) {
    res.status(400).json({ ok: false, message: 'Informe os 4 digitos do codigo.' });
    return;
  }
  let waitSeconds = 0;
  try {
    waitSeconds = await consumeQuickVoucherAttempt(req, 'lookup', 30, 10 * 60, 15 * 60);
  } catch {
    res.status(503).json({ ok: false, message: 'Validacao de codigo indisponivel agora.' });
    return;
  }
  if (waitSeconds > 0) {
    await logAction(req, 'cashback_rapido_limite_tentativas', 'cashback_quick_voucher', null, 'Limite de consultas de codigo rapido atingido.');
    res.status(429).json({ ok: false, message: `Muitas consultas. Aguarde ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).` });
    return;
  }
  const voucher = await activeQuickVoucher(pgPool, code);
  if (!voucher) {
    res.status(404).json({ ok: false, message: 'Codigo invalido, usado ou expirado.' });
    return;
  }
  const linkedClientId = num(voucher.issued_client_id);
  const settings = await loadSettings();
  const minimumPurchaseCents = Math.ceil(num(voucher.cashback_cents) * settings.redeemMultiplier);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    codigo: String(voucher.code || ''),
    cashback: brMoneyCents(voucher.cashback_cents),
    cashback_raw: centsToMoney(num(voucher.cashback_cents)),
    compra_minima: brMoneyCents(minimumPurchaseCents),
    compra_minima_raw: centsToMoney(minimumPurchaseCents),
    validade: brDate(voucher.expires_at),
    vinculado: linkedClientId > 0,
    cliente_id: linkedClientId || null,
  });
});

router.post('/api-cashback-rapido-impressao.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    res.status(403).json({ ok: false, message: 'Sessao expirada.' });
    return;
  }
  const voucherId = num(req.body?.voucher_id);
  const allowedReceiptIds = req.session.quickVoucherReceiptIds || [];
  if (voucherId <= 0 || !allowedReceiptIds.includes(voucherId)) {
    res.status(400).json({ ok: false, message: 'Cupom invalido.' });
    return;
  }
  const updated = await pgPool.query(
    `UPDATE cashback_quick_vouchers
        SET print_requests = print_requests + 1,
            last_print_requested_at = NOW(),
            last_print_requested_by = $1,
            updated_at = NOW()
      WHERE id = $2
        AND status = 'ativo'
      RETURNING id, code, print_requests`,
    [req.session.user?.id ?? null, voucherId],
  );
  if ((updated.rowCount ?? 0) <= 0) {
    res.status(404).json({ ok: false, message: 'Cupom nao encontrado.' });
    return;
  }
  await logAction(
    req,
    'cashback_rapido_impressao_solicitada',
    'cashback_quick_voucher',
    voucherId,
    `Impressao solicitada para o codigo rapido ${String(updated.rows[0]?.code || '')}.`,
    { print_requests: num(updated.rows[0]?.print_requests) },
  );
  res.json({ ok: true });
});

router.get('/relatorio.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  await refreshExpiredQuickVouchers();
  res.send(await renderReport(req));
});

router.post('/relatorio.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada.');
    res.redirect(`${BASE_PATH}/relatorio.php`);
    return;
  }
  await handleReportPost(req, res);
});

router.get('/exportar.php', clearSensitive, maintenanceGuard, async (req: Request, res: Response) => {
  await sendExport(req, res);
});

router.get('/diagnostico.php', clearSensitive, async (req: Request, res: Response) => {
  res.send(await renderDiagnostics(req));
});

router.get('/diagnostico-publico.php', clearSensitive, async (req: Request, res: Response) => {
  res.send(await renderDiagnostics(req));
});

router.get('/autoteste.php', clearSensitive, async (req: Request, res: Response) => {
  res.send(await renderSelfTest(req));
});

router.get('/internal/migration-status', requireInternalToken, async (_req: Request, res: Response) => {
  await ensureSchema();
  res.json({ ok: true, counts: await tableCounts(), migration: migrationStats });
});

router.get('/api/internal/summary', requireInternalToken, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  await refreshExpiredQuickVouchers();
  const counts = await tableCounts();
  const settings = await loadSettings();
  const start = isValidDateInput(req.query.start) ? String(req.query.start) : '';
  const endExclusive = isValidDateInput(req.query.end_exclusive) ? String(req.query.end_exclusive) : '';
  const periodWhere = start && endExclusive ? 'WHERE purchased_at >= $1::date AND purchased_at < $2::date' : '';
  const periodParams = start && endExclusive ? [start, endExclusive] : [];
  const totals = await pgPool.query(
    `SELECT
       COUNT(*)::bigint AS purchases,
       COALESCE(SUM(gross_cents), 0)::bigint AS total,
       COALESCE(SUM(charged_cents), 0)::bigint AS charged,
       COALESCE(SUM(cashback_generated_cents), 0)::bigint AS generated,
       COALESCE((SELECT SUM(redeemed_cents) FROM cashback_redemptions), 0)::bigint AS redeemed,
       COALESCE((SELECT SUM(remaining_cents) FROM cashback_credits WHERE canceled_at IS NULL AND status = 'ativo' AND expires_at >= CURRENT_DATE), 0)::bigint AS available
     FROM cashback_purchases
     ${periodWhere}`,
    periodParams,
  );
  const quickVouchers = await pgPool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'ativo' AND expires_at >= CURRENT_DATE)::bigint AS active,
       COALESCE(SUM(cashback_cents) FILTER (WHERE status = 'ativo' AND expires_at >= CURRENT_DATE), 0)::bigint AS available,
       COUNT(*) FILTER (WHERE status = 'usado')::bigint AS used,
       COUNT(*) FILTER (WHERE status = 'expirado')::bigint AS expired
     FROM cashback_quick_vouchers`,
  );
  res.json({
    ok: true,
    source: 'postgres',
    period: { start: start || null, end_exclusive: endExclusive || null },
    counts,
    settings: {
      cashback_percent: settings.cashbackPercent,
      cashback_validity_days: settings.validityDays,
      redeem_multiplier: settings.redeemMultiplier,
      expiration_alert_days: settings.expirationAlertDays,
    },
    totals: {
      purchases: num(totals.rows[0]?.purchases),
      total: centsToMoney(num(totals.rows[0]?.total)),
      charged: centsToMoney(num(totals.rows[0]?.charged)),
      generated: centsToMoney(num(totals.rows[0]?.generated)),
      redeemed: centsToMoney(num(totals.rows[0]?.redeemed)),
      available: centsToMoney(num(totals.rows[0]?.available)),
    },
    quick_vouchers: {
      active: num(quickVouchers.rows[0]?.active),
      available: centsToMoney(num(quickVouchers.rows[0]?.available)),
      used: num(quickVouchers.rows[0]?.used),
      expired: num(quickVouchers.rows[0]?.expired),
      validity_years: QUICK_VOUCHER_VALIDITY_YEARS,
    },
  });
});

router.get('/api/internal/clients/search', requireInternalToken, async (req: Request, res: Response) => {
  await refreshExpiredCredits();
  const query = cleanText(req.query.q, 140);
  const normalizedTerms = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((term) => term.length >= 3)
    .slice(0, 5);
  const digitTerm = digitsOnly(query);
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const term of normalizedTerms) {
    params.push(`%${term}%`);
    clauses.push(`LOWER(COALESCE(c.name, '')) LIKE $${params.length}`);
  }

  if (digitTerm.length >= 6) {
    params.push(`%${digitTerm}%`);
    clauses.push(`regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE $${params.length}`);
  }

  if (!clauses.length) {
    return res.json({ ok: true, source: 'postgres', query, clients: [], total: 0 });
  }

  const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit || '5'), 10) || 5, 12));
  params.push(limit);
  const limitParam = params.length;
  const result = await pgPool.query(
    `SELECT
        c.id,
        c.name,
        c.phone,
        c.status,
        c.created_at,
        a.name AS attendant_name,
        COALESCE((
          SELECT SUM(cr.remaining_cents)
          FROM cashback_credits cr
          WHERE cr.client_id = c.id
            AND cr.canceled_at IS NULL
            AND cr.status = 'ativo'
            AND cr.remaining_cents > 0
            AND cr.expires_at >= CURRENT_DATE
        ), 0)::bigint AS available_cents,
        (SELECT COUNT(*) FROM cashback_purchases p WHERE p.client_id = c.id)::int AS purchase_count,
        (SELECT MAX(p.purchased_at) FROM cashback_purchases p WHERE p.client_id = c.id) AS last_purchase_at
       FROM cashback_clients c
       LEFT JOIN cashback_attendants a ON a.id = c.attendant_id
       WHERE c.status <> 'excluido'
         AND (${clauses.join(' OR ')})
       ORDER BY c.updated_at DESC NULLS LAST, c.id DESC
       LIMIT $${limitParam}`,
    params,
  );

  const clients = result.rows.map((row: DbRow) => ({
    id: num(row.id),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    phone_formatted: formatPhone(row.phone),
    status: String(row.status || ''),
    attendant_name: String(row.attendant_name || ''),
    available_cents: num(row.available_cents),
    available: centsToMoney(num(row.available_cents)),
    purchase_count: num(row.purchase_count),
    last_purchase_at: row.last_purchase_at || null,
    created_at: row.created_at || null,
  }));

  return res.json({ ok: true, source: 'postgres', query, clients, total: clients.length });
});

function normalizeBasePath(value: string): string {
  const clean = value.trim().replace(/\/+$/, '');
  return clean.startsWith('/') ? clean || '/cashback' : `/${clean || 'cashback'}`;
}

function normalizeUsername(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
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

function cssToken(value: unknown): string {
  const token = cleanText(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || 'generico';
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function appendClientSearchCondition(params: unknown[], search: string, alias = 'c'): string {
  const term = cleanText(search, 180);
  if (!term) return '';

  const conditions: string[] = [];
  const digits = digitsOnly(term);

  params.push(`%${term}%`);
  conditions.push(`${alias}.name ILIKE $${params.length}`);

  if (digits) {
    params.push(`%${digits}%`);
    conditions.push(`regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g') LIKE $${params.length}`);

    if (digits.length <= 12) {
      params.push(Number(digits));
      conditions.push(`${alias}.id = $${params.length}`);
    }
  }

  return `(${conditions.join(' OR ')})`;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function intOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function moneyToCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  let text = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s+/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  text = text.replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function percentToBps(value: unknown): number {
  return Math.max(0, Math.min(10000, moneyToCents(value)));
}

function centsToMoney(cents: number): number {
  return Math.round(cents) / 100;
}

function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

function brMoneyCents(cents: unknown): string {
  return `R$ ${centsToMoney(num(cents)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function brMoney(value: unknown): string {
  return `R$ ${num(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyInputCents(cents: unknown): string {
  return centsToMoney(num(cents)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function brDate(value: unknown, withTime = false): string {
  if (!value) return '-';
  const text = String(value);
  const date = text.length <= 10 ? new Date(`${text}T12:00:00-03:00`) : new Date(text.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function isoDate(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function sqlNowText(): string {
  return new Date().toISOString();
}

function dateDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateDaysFromDate(value: unknown, days: number): string {
  const base = isoDate(value) || todayIso();
  const [year, month, day] = base.split('-').map(Number);
  if (!year || !month || !day) return dateDaysFromNow(days);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntilDate(value: unknown): number | null {
  const iso = isoDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = todayIso().split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today[0] || 1970, (today[1] || 1) - 1, today[2] || 1);
  return Math.round((targetUtc - todayUtc) / 86400000);
}

function expirationText(value: unknown, canceled = false): string {
  if (canceled) return 'Cashback cancelado';
  const days = daysUntilDate(value);
  if (days === null) return 'Sem vencimento';
  if (days < 0) return `Expirou ha ${Math.abs(days)} dia(s)`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Falta 1 dia';
  return `Faltam ${days} dias`;
}

function expiryBreakdownSummary(slices: CreditExpirySlice[], maxItems = 2): string {
  if (!slices.length) return 'Sem cashback ativo com vencimento.';
  const visible = slices.slice(0, maxItems);
  const parts = visible.map((slice) => `${brMoneyCents(slice.amountCents)} em ${brDate(slice.expiresAt)} (${expirationText(slice.expiresAt).toLowerCase()})`);
  if (slices.length > visible.length) parts.push(`+${slices.length - visible.length} data(s)`);
  return parts.join(' | ');
}

function renderExpiryBreakdown(
  slices: CreditExpirySlice[],
  options: { compact?: boolean; maxItems?: number; title?: string; emptyText?: string } = {},
): string {
  const maxItems = options.maxItems ?? slices.length;
  const visible = slices.slice(0, maxItems);
  const hiddenCount = Math.max(0, slices.length - visible.length);
  const classes = ['cashback-expiry-list', options.compact ? 'compact' : ''].filter(Boolean).join(' ');
  const title = options.title ? `<div class="expiry-list-title"><span>${e(options.title)}</span></div>` : '';
  if (!visible.length) {
    return `<div class="${e(classes)} is-empty">${title}<p>${e(options.emptyText || 'Sem cashback ativo com vencimento.')}</p></div>`;
  }
  const rows = visible
    .map(
      (slice) =>
        `<div class="expiry-row"><strong>${brMoneyCents(slice.amountCents)}</strong><span>${e(brDate(slice.expiresAt))}</span><small>${e(expirationText(slice.expiresAt))}</small></div>`,
    )
    .join('');
  const more = hiddenCount ? `<div class="expiry-row more"><strong>+${e(hiddenCount)}</strong><span>outras datas</span><small>Abra historico completo</small></div>` : '';
  return `<div class="${e(classes)}">${title}${rows}${more}</div>`;
}

function purchaseCashbackKind(row: DbRow): string {
  const mode = String(row.cashback_generation_mode || '');
  if (mode === 'manual') return 'Manual';
  if (mode === 'voucher_rapido') return 'Codigo rapido';
  return 'Automatico';
}

function purchaseCashbackPercentLabel(row: DbRow): string {
  const kind = purchaseCashbackKind(row);
  if (kind === 'Manual') return kind;
  const percent = `${bpsToPercent(num(row.cashback_percent_bps)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`;
  return kind === 'Codigo rapido' ? `Codigo ${percent}` : percent;
}

function purchaseCashbackCssClass(row: DbRow): string {
  const kind = purchaseCashbackKind(row);
  if (kind === 'Manual') return 'manual';
  return kind === 'Codigo rapido' ? 'quick' : 'auto';
}

function isValidDateInput(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function safeDateInput(value: unknown, fallback: string): string {
  return isValidDateInput(value) ? String(value) : fallback;
}

function formatPhone(phone: unknown): string {
  const digits = digitsOnly(phone);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return String(phone || 'Sem telefone');
}

function whatsappLink(phone: unknown, message: unknown): string {
  let digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(message || ''))}`;
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function asset(name: string): string {
  return `${BASE_PATH}/${name}?v=${SERVICE_VERSION}`;
}

function pageUrl(pathName: string): string {
  return `${BASE_PATH}/${pathName.replace(/^\/+/, '')}`;
}

function csrf(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function csrfField(req: Request): string {
  return `<input type="hidden" name="csrf_token" value="${e(csrf(req))}">`;
}

function csrfMatches(req: Request): boolean {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received) return false;
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const receivedHash = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash);
}

function setFlash(req: Request, type: FlashType, message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  Promise.resolve(ensureSessionUser(req))
    .then((user) => {
      if (!user) {
        req.session.returnTo = req.originalUrl;
        res.redirect('/');
        return;
      }
      req.session.user = user;
      next();
    })
    .catch(next);
}

function clearSensitive(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

async function maintenanceGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const enabled = (await getSetting('maintenance_enabled', '0')) === '1';
  if (enabled) {
    res.redirect(`${BASE_PATH}/manutencao.php`);
    return;
  }
  next();
}

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_TOKEN) {
    res.status(503).json({ ok: false, message: 'Token interno nao configurado.' });
    return;
  }
  const received = String(req.get('x-miauw-internal-token') || req.get('x-cashback-internal-token') || req.query.token || '');
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    res.status(401).json({ ok: false, message: 'Token interno invalido.' });
    return;
  }
  next();
}

async function authenticateUser(username: string, password: string): Promise<User | null> {
  if (!username || !password) return null;
  const result = await corePgPool.query(
    'SELECT id, username, display_name, password_hash, role, active FROM core_users WHERE username_normalized = $1 AND active = true LIMIT 1',
    [username],
  );
  const row = result.rows[0] as DbRow | undefined;
  if (row && (await bcrypt.compare(password, normalizeHash(row.password_hash)))) {
    return coreUserFromRow(row, username);
  }
  return null;
}

function coreUserFromRow(row: DbRow | undefined, fallbackUsername = ''): User | null {
  if (!row) return null;
  const username = String(row.username || fallbackUsername || '').trim();
  return {
    id: num(row.id),
    username,
    displayName: cleanText(row.display_name, 160) || username,
    role: String(row.role || 'user'),
  };
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
  const result = await corePgPool.query(
    'SELECT id, username, display_name, role, active FROM core_users WHERE username_normalized = $1 AND active = true LIMIT 1',
    [username],
  );
  return coreUserFromRow(result.rows[0] as DbRow | undefined, username);
}

async function refreshCoreUser(user: User): Promise<User | null> {
  const result = await corePgPool.query(
    'SELECT id, username, display_name, role, active FROM core_users WHERE id = $1 AND active = true LIMIT 1',
    [user.id],
  );
  return coreUserFromRow(result.rows[0] as DbRow | undefined, user.username);
}

async function canAccessModule(user: User, moduleKey: string): Promise<boolean> {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  if (username === 'adm' || role === 'admin') return true;
  const result = await corePgPool.query(
    `SELECT COUNT(*)::text AS permission_count,
            COALESCE(BOOL_OR(module_key = $2 AND can_access = TRUE), FALSE) AS can_access
       FROM core_user_module_permissions
      WHERE user_id = $1`,
    [user.id, moduleKey],
  );
  const row = result.rows[0] as DbRow | undefined;
  const explicitCount = Number(row?.permission_count || 0);
  return explicitCount === 0 ? true : Boolean(row?.can_access);
}

async function activeCashbackCoreUsers(): Promise<User[]> {
  const result = await corePgPool.query(
    `SELECT u.id, u.username, u.display_name, u.role
      FROM core_users u
      WHERE u.active = TRUE
        AND LOWER(COALESCE(u.role, '')) <> 'farmacia'
        AND (
          u.username_normalized = 'adm'
          OR LOWER(u.role) = 'admin'
          OR NOT EXISTS (
            SELECT 1
              FROM core_user_module_permissions permission
             WHERE permission.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
              FROM core_user_module_permissions permission
             WHERE permission.user_id = u.id
               AND permission.module_key = 'cashback'
               AND permission.can_access = TRUE
          )
        )
      ORDER BY COALESCE(NULLIF(u.display_name, ''), u.username) ASC, u.username ASC`,
  );
  return (result.rows as DbRow[])
    .map((row) => coreUserFromRow(row))
    .filter((user): user is User => Boolean(user && user.id > 0));
}

async function cashbackCoreUserById(userId: number): Promise<User | null> {
  if (userId <= 0) return null;
  const result = await corePgPool.query(
    'SELECT id, username, display_name, role FROM core_users WHERE id = $1 AND active = TRUE LIMIT 1',
    [userId],
  );
  const user = coreUserFromRow(result.rows[0] as DbRow | undefined);
  if (!user || normalizeUsername(user.role) === 'farmacia' || !(await canAccessModule(user, 'cashback'))) return null;
  return user;
}

function regenerateWithUser(req: Request, user: User): Promise<void> {
  const returnTo = req.session.returnTo;
  return new Promise((resolve, reject) => {
    req.session.regenerate((error: Error | null) => {
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
  const homeUser = await userByHomeSso(req);
  let user = req.session.user || null;
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (!user) return null;
  if (!user.displayName) {
    const refreshed = await refreshCoreUser(user);
    if (refreshed) {
      user = refreshed;
      req.session.user = refreshed;
    }
  }
  return (await canAccessModule(user, 'cashback')) ? user : null;
}

async function loginRateLimitWaitSeconds(req: Request, username: string): Promise<number> {
  const sessionWait = Math.max(0, Math.ceil((Number(req.session.loginBlockedUntil || 0) - Date.now()) / 1000));
  try {
    const rateKey = loginRateKey(req, username);
    const result = await corePgPool.query('SELECT blocked_until FROM core_login_rate_limits WHERE rate_key = $1 LIMIT 1', [rateKey.identityHash]);
    const blockedAt = result.rows[0]?.blocked_until;
    if (!blockedAt) return sessionWait;
    const databaseWait = Math.max(0, Math.ceil((new Date(String(blockedAt)).getTime() - Date.now()) / 1000));
    return Math.max(sessionWait, databaseWait);
  } catch {
    return sessionWait;
  }
}

async function registerLoginFailure(req: Request, username: string): Promise<void> {
  const now = Date.now();
  const attempts = (req.session.loginAttempts || []).filter((timestamp: number) => now - timestamp <= 15 * 60 * 1000);
  attempts.push(now);
  req.session.loginAttempts = attempts;
  if (attempts.length >= 5) req.session.loginBlockedUntil = now + 10 * 60 * 1000;
  try {
    const rateKey = loginRateKey(req, username);
    await corePgPool.query(
      `INSERT INTO core_login_rate_limits
         (rate_key, username_normalized, ip_hash, attempts_count, window_started_at, blocked_until, updated_at)
       VALUES ($1, $2, $3, 1, NOW(), NULL, NOW())
       ON CONFLICT (rate_key) DO UPDATE SET
         username_normalized = EXCLUDED.username_normalized,
         ip_hash = EXCLUDED.ip_hash,
         attempts_count = CASE
           WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1
           ELSE core_login_rate_limits.attempts_count + 1
         END,
         window_started_at = CASE
           WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN NOW()
           ELSE core_login_rate_limits.window_started_at
         END,
         blocked_until = CASE
           WHEN (
             CASE
               WHEN core_login_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1
               ELSE core_login_rate_limits.attempts_count + 1
             END
           ) >= 5 THEN NOW() + INTERVAL '10 minutes'
           ELSE core_login_rate_limits.blocked_until
         END,
         updated_at = NOW()`,
      [rateKey.identityHash, username, rateKey.ipHash],
    );
  } catch {
    // Session limiter remains active if the core limiter is unavailable.
  }
}

async function clearLoginRateLimit(req: Request, username: string): Promise<void> {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
  try {
    const rateKey = loginRateKey(req, username);
    await corePgPool.query('DELETE FROM core_login_rate_limits WHERE rate_key = $1', [rateKey.identityHash]);
  } catch {
    // Login success should not fail because cleanup failed.
  }
}

function loginRateKey(req: Request, username: string): { identityHash: string; ipHash: string } {
  const ip = String(req.ip || req.socket.remoteAddress || '').slice(0, 80);
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
  const identityHash = crypto.createHash('sha256').update(`cashback|${username}|${ipHash}`).digest('hex');
  return { identityHash, ipHash };
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cashback_attendants (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      core_user_id BIGINT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE cashback_attendants ADD COLUMN IF NOT EXISTS core_user_id BIGINT;
    CREATE INDEX IF NOT EXISTS idx_cashback_attendants_status ON cashback_attendants(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cashback_attendants_core_user ON cashback_attendants(core_user_id) WHERE core_user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS cashback_clients (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      birth_date DATE,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      attendant_id BIGINT REFERENCES cashback_attendants(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_clients_name ON cashback_clients(name);
    CREATE INDEX IF NOT EXISTS idx_cashback_clients_phone ON cashback_clients(phone);
    CREATE INDEX IF NOT EXISTS idx_cashback_clients_status ON cashback_clients(status);

    CREATE TABLE IF NOT EXISTS cashback_redemptions (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      client_id BIGINT NOT NULL REFERENCES cashback_clients(id) ON DELETE RESTRICT,
      attendant_id BIGINT REFERENCES cashback_attendants(id) ON DELETE SET NULL,
      purchase_cents BIGINT NOT NULL DEFAULT 0,
      redeemed_cents BIGINT NOT NULL DEFAULT 0,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_redemptions_client ON cashback_redemptions(client_id);
    CREATE INDEX IF NOT EXISTS idx_cashback_redemptions_date ON cashback_redemptions(redeemed_at);

    CREATE TABLE IF NOT EXISTS cashback_purchases (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      client_id BIGINT NOT NULL REFERENCES cashback_clients(id) ON DELETE RESTRICT,
      attendant_id BIGINT REFERENCES cashback_attendants(id) ON DELETE SET NULL,
      gross_cents BIGINT NOT NULL DEFAULT 0,
      cashback_discount_cents BIGINT NOT NULL DEFAULT 0,
      charged_cents BIGINT NOT NULL DEFAULT 0,
      redemption_id BIGINT REFERENCES cashback_redemptions(id) ON DELETE SET NULL,
      cashback_percent_bps INTEGER NOT NULL DEFAULT 500,
      cashback_generated_cents BIGINT NOT NULL DEFAULT 0,
      cashback_generation_mode TEXT NOT NULL DEFAULT 'automatico',
      manual_cashback_cents BIGINT NOT NULL DEFAULT 0,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE cashback_purchases ADD COLUMN IF NOT EXISTS cashback_generation_mode TEXT NOT NULL DEFAULT 'automatico';
    ALTER TABLE cashback_purchases ADD COLUMN IF NOT EXISTS manual_cashback_cents BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE cashback_purchases DROP CONSTRAINT IF EXISTS cashback_purchases_generation_mode_check;
    ALTER TABLE cashback_purchases
      ADD CONSTRAINT cashback_purchases_generation_mode_check
      CHECK (cashback_generation_mode IN ('automatico', 'manual', 'voucher_rapido'));
    CREATE INDEX IF NOT EXISTS idx_cashback_purchases_client ON cashback_purchases(client_id);
    CREATE INDEX IF NOT EXISTS idx_cashback_purchases_date ON cashback_purchases(purchased_at);

    CREATE TABLE IF NOT EXISTS cashback_credits (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      client_id BIGINT NOT NULL REFERENCES cashback_clients(id) ON DELETE RESTRICT,
      purchase_id BIGINT NOT NULL REFERENCES cashback_purchases(id) ON DELETE RESTRICT,
      original_cents BIGINT NOT NULL DEFAULT 0,
      remaining_cents BIGINT NOT NULL DEFAULT 0,
      expires_at DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'usado', 'expirado')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      canceled_by BIGINT,
      canceled_reason TEXT
    );
    ALTER TABLE cashback_credits ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
    ALTER TABLE cashback_credits ADD COLUMN IF NOT EXISTS canceled_by BIGINT;
    ALTER TABLE cashback_credits ADD COLUMN IF NOT EXISTS canceled_reason TEXT;
    CREATE INDEX IF NOT EXISTS idx_cashback_credits_client_status ON cashback_credits(client_id, status);
    CREATE INDEX IF NOT EXISTS idx_cashback_credits_expire ON cashback_credits(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cashback_credits_canceled ON cashback_credits(canceled_at);

    CREATE TABLE IF NOT EXISTS cashback_redemption_items (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      redemption_id BIGINT NOT NULL REFERENCES cashback_redemptions(id) ON DELETE CASCADE,
      credit_id BIGINT NOT NULL REFERENCES cashback_credits(id) ON DELETE RESTRICT,
      used_cents BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_redemption_items_redemption ON cashback_redemption_items(redemption_id);
    CREATE INDEX IF NOT EXISTS idx_cashback_redemption_items_credit ON cashback_redemption_items(credit_id);

    CREATE TABLE IF NOT EXISTS cashback_quick_vouchers (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      code TEXT NOT NULL CHECK (code ~ '^[0-9]{4}$'),
      gross_cents BIGINT NOT NULL CHECK (gross_cents > 0),
      cashback_cents BIGINT NOT NULL CHECK (cashback_cents > 0),
      cashback_percent_bps INTEGER NOT NULL DEFAULT 500 CHECK (cashback_percent_bps >= 0 AND cashback_percent_bps <= 10000),
      request_token TEXT,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'usado', 'expirado', 'cancelado')),
      issued_attendant_id BIGINT REFERENCES cashback_attendants(id) ON DELETE SET NULL,
      issued_by BIGINT,
      issued_client_id BIGINT REFERENCES cashback_clients(id) ON DELETE SET NULL,
      parent_voucher_id BIGINT REFERENCES cashback_quick_vouchers(id) ON DELETE SET NULL,
      source_purchase_id BIGINT REFERENCES cashback_purchases(id) ON DELETE SET NULL,
      redeemed_client_id BIGINT REFERENCES cashback_clients(id) ON DELETE SET NULL,
      redeemed_attendant_id BIGINT REFERENCES cashback_attendants(id) ON DELETE SET NULL,
      redemption_id BIGINT UNIQUE REFERENCES cashback_redemptions(id) ON DELETE SET NULL,
      print_requests INTEGER NOT NULL DEFAULT 0,
      last_print_requested_at TIMESTAMPTZ,
      last_print_requested_by BIGINT,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at DATE NOT NULL,
      redeemed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE cashback_quick_vouchers ADD COLUMN IF NOT EXISTS request_token TEXT;
    ALTER TABLE cashback_quick_vouchers ADD COLUMN IF NOT EXISTS print_requests INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cashback_quick_vouchers ADD COLUMN IF NOT EXISTS last_print_requested_at TIMESTAMPTZ;
    ALTER TABLE cashback_quick_vouchers ADD COLUMN IF NOT EXISTS last_print_requested_by BIGINT;
    DROP INDEX IF EXISTS idx_cashback_quick_vouchers_active_code;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cashback_quick_vouchers_code
      ON cashback_quick_vouchers(code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cashback_quick_vouchers_request_token
      ON cashback_quick_vouchers(request_token)
      WHERE request_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cashback_quick_vouchers_status_expiry
      ON cashback_quick_vouchers(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_cashback_quick_vouchers_client
      ON cashback_quick_vouchers(issued_client_id, redeemed_client_id);
    CREATE INDEX IF NOT EXISTS idx_cashback_quick_vouchers_attendant
      ON cashback_quick_vouchers(issued_attendant_id, issued_at DESC);

    CREATE TABLE IF NOT EXISTS cashback_quick_voucher_rate_limits (
      rate_key TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK (operation IN ('lookup', 'redeem')),
      attempts_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      blocked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_quick_voucher_rate_limits_blocked
      ON cashback_quick_voucher_rate_limits(blocked_until);

    CREATE TABLE IF NOT EXISTS cashback_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS cashback_whatsapp_messages (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      client_id BIGINT REFERENCES cashback_clients(id) ON DELETE SET NULL,
      purchase_id BIGINT REFERENCES cashback_purchases(id) ON DELETE SET NULL,
      credit_id BIGINT REFERENCES cashback_credits(id) ON DELETE SET NULL,
      campaign TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      phone TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aberta', 'copiada', 'enviada', 'cancelada', 'expirado_da_fila')),
      due_date DATE,
      opened_at TIMESTAMPTZ,
      copied_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      user_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_whatsapp_status ON cashback_whatsapp_messages(status, campaign);
    CREATE INDEX IF NOT EXISTS idx_cashback_whatsapp_due ON cashback_whatsapp_messages(due_date);
    ALTER TABLE cashback_whatsapp_messages DROP CONSTRAINT IF EXISTS cashback_whatsapp_messages_status_check;
    ALTER TABLE cashback_whatsapp_messages
      ADD CONSTRAINT cashback_whatsapp_messages_status_check
      CHECK (status IN ('pendente', 'aberta', 'copiada', 'enviada', 'cancelada', 'expirado_da_fila'));

    CREATE TABLE IF NOT EXISTS cashback_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      legacy_mysql_id BIGINT UNIQUE,
      user_id BIGINT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id BIGINT,
      message TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cashback_audit_action ON cashback_audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_cashback_audit_entity ON cashback_audit_events(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS cashback_migration_runs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
  `);
}

let xpRewardSchemaReady = false;

async function ensureXpRewardSchema(): Promise<void> {
  if (xpRewardSchemaReady) return;
  await xpPgPool.query(`
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE xp_sales ADD COLUMN IF NOT EXISTS source_entity_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_sales_source_entity
      ON xp_sales(source, source_entity_id)
      WHERE source IS NOT NULL AND source_entity_id IS NOT NULL;
  `);
  xpRewardSchemaReady = true;
}

async function tableCounts(): Promise<Record<string, number>> {
  const tables = [
    'cashback_clients',
    'cashback_attendants',
    'cashback_purchases',
    'cashback_credits',
    'cashback_redemptions',
    'cashback_redemption_items',
    'cashback_quick_vouchers',
    'cashback_quick_voucher_rate_limits',
    'cashback_settings',
    'cashback_whatsapp_messages',
    'cashback_audit_events',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const result = await pgPool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = num(result.rows[0]?.count);
  }
  return counts;
}

async function getSetting(key: string, fallback: string): Promise<string> {
  const result = await pgPool.query('SELECT value FROM cashback_settings WHERE key = $1 LIMIT 1', [key]);
  return String(result.rows[0]?.value ?? fallback);
}

async function setSetting(key: string, value: string): Promise<void> {
  await pgPool.query(
    `INSERT INTO cashback_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value],
  );
}

async function loadSettings(): Promise<Settings> {
  const rows = await pgPool.query('SELECT key, value FROM cashback_settings');
  const values = new Map<string, string>();
  for (const row of rows.rows as DbRow[]) values.set(String(row.key), String(row.value ?? ''));
  const cashbackPercent = boundedNumber(values.get('cashback_percent'), 5, 0, 100);
  return {
    cashbackPercent,
    cashbackPercentBps: percentToBps(cashbackPercent),
    validityDays: CASHBACK_CREDIT_VALIDITY_DAYS,
    redeemMultiplier: boundedNumber(values.get('redeem_multiplier'), 4, 1, 20),
    expirationAlertDays: Math.round(boundedNumber(values.get('expiration_alert_days'), 10, 1, 365)),
  };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

async function refreshExpiredCredits(): Promise<void> {
  await pgPool.query(
    `UPDATE cashback_credits
     SET status = 'expirado', updated_at = NOW()
     WHERE status = 'ativo'
       AND canceled_at IS NULL
       AND remaining_cents > 0
       AND expires_at < CURRENT_DATE`,
  );
}

async function refreshExpiredQuickVouchers(db: pg.Pool | pg.PoolClient = pgPool): Promise<void> {
  await db.query(
    `UPDATE cashback_quick_vouchers
        SET status = 'expirado', updated_at = NOW()
      WHERE status = 'ativo'
        AND expires_at < CURRENT_DATE`,
  );
}

function normalizeQuickVoucherCode(value: unknown): string {
  const code = digitsOnly(value);
  return code.length === 4 ? code : '';
}

async function consumeQuickVoucherAttempt(
  req: Request,
  operation: 'lookup' | 'redeem',
  maxAttempts: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<number> {
  const userId = req.session.user?.id ?? 0;
  const rateKey = `user:${userId}:${operation}`;
  const db = await pgPool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [rateKey]);
    const result = await db.query(
      `SELECT attempts_count, window_started_at, blocked_until
         FROM cashback_quick_voucher_rate_limits
        WHERE rate_key = $1
        FOR UPDATE`,
      [rateKey],
    );
    const row = result.rows[0] as DbRow | undefined;
    const now = Date.now();
    const blockedUntil = row?.blocked_until ? new Date(String(row.blocked_until)).getTime() : 0;
    if (blockedUntil > now) {
      await db.query('COMMIT');
      return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    }

    const windowStartedAt = row?.window_started_at ? new Date(String(row.window_started_at)).getTime() : 0;
    const resetWindow = !row || blockedUntil > 0 || now - windowStartedAt >= windowSeconds * 1000;
    const attempts = resetWindow ? 1 : num(row.attempts_count) + 1;
    const nextBlockedUntil = attempts > maxAttempts ? new Date(now + blockSeconds * 1000) : null;
    await db.query(
      `INSERT INTO cashback_quick_voucher_rate_limits
          (rate_key, operation, attempts_count, window_started_at, blocked_until, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (rate_key) DO UPDATE SET
         operation = EXCLUDED.operation,
         attempts_count = EXCLUDED.attempts_count,
         window_started_at = EXCLUDED.window_started_at,
         blocked_until = EXCLUDED.blocked_until,
         updated_at = NOW()`,
      [rateKey, operation, attempts, new Date(resetWindow ? now : windowStartedAt), nextBlockedUntil],
    );
    await db.query('COMMIT');
    return nextBlockedUntil ? blockSeconds : 0;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

async function activeQuickVoucher(
  db: pg.Pool | pg.PoolClient,
  code: string,
  lock = false,
): Promise<DbRow | null> {
  if (!code) return null;
  await refreshExpiredQuickVouchers(db);
  const result = await db.query(
    `SELECT *
       FROM cashback_quick_vouchers
      WHERE code = $1
        AND status = 'ativo'
        AND expires_at >= CURRENT_DATE
      ORDER BY id DESC
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [code],
  );
  return (result.rows[0] as DbRow | undefined) || null;
}

async function issueQuickVoucher(
  client: pg.PoolClient,
  input: {
    grossCents: number;
    cashbackCents: number;
    percentBps: number;
    attendantId: number;
    userId: number | null;
    requestToken?: string | null;
    clientId?: number | null;
    parentVoucherId?: number | null;
    sourcePurchaseId?: number | null;
  },
): Promise<QuickVoucherIssue> {
  const grossCents = Math.floor(input.grossCents);
  const cashbackCents = Math.floor(input.cashbackCents);
  if (grossCents <= 0 || cashbackCents <= 0) {
    throw new Error('A compra precisa gerar pelo menos R$ 0,01 de cashback rapido.');
  }

  await client.query('SELECT pg_advisory_xact_lock($1)', [QUICK_VOUCHER_ADVISORY_LOCK]);
  await refreshExpiredQuickVouchers(client);

  const requestToken = cleanText(input.requestToken, 120) || null;
  if (requestToken) {
    const existing = await client.query(
      `SELECT id, code, gross_cents, cashback_cents, expires_at
         FROM cashback_quick_vouchers
        WHERE request_token = $1
        LIMIT 1`,
      [requestToken],
    );
    if ((existing.rowCount ?? 0) > 0) {
      const row = existing.rows[0] as DbRow;
      return {
        id: num(row.id),
        code: String(row.code || ''),
        grossCents: num(row.gross_cents),
        cashbackCents: num(row.cashback_cents),
        expiresAt: isoDate(row.expires_at),
      };
    }
  }

  const issuedCodes = new Set(
    (await client.query('SELECT code FROM cashback_quick_vouchers')).rows.map((row: DbRow) => String(row.code || '')),
  );
  const firstCandidate = crypto.randomInt(0, QUICK_VOUCHER_CODE_SPACE);
  let code = '';
  for (let attempt = 0; attempt < QUICK_VOUCHER_CODE_SPACE; attempt += 1) {
    const candidate = ((firstCandidate + attempt) % QUICK_VOUCHER_CODE_SPACE).toString().padStart(4, '0');
    if (!issuedCodes.has(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new Error('Todos os 10.000 codigos de 4 digitos ja foram emitidos. Sera necessario ampliar o codigo.');
  }

  const inserted = await client.query(
    `INSERT INTO cashback_quick_vouchers
        (code, gross_cents, cashback_cents, cashback_percent_bps, request_token, status,
         issued_attendant_id, issued_by, issued_client_id, parent_voucher_id,
         source_purchase_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'ativo', $6, $7, $8, $9, $10,
               (CURRENT_DATE + ($11::text || ' year')::interval)::date)
       RETURNING id, code, gross_cents, cashback_cents, expires_at`,
    [
      code,
      grossCents,
      cashbackCents,
      input.percentBps,
      requestToken,
      input.attendantId,
      input.userId,
      input.clientId || null,
      input.parentVoucherId || null,
      input.sourcePurchaseId || null,
      QUICK_VOUCHER_VALIDITY_YEARS,
    ],
  );
  const row = inserted.rows[0] as DbRow;
  return {
    id: num(row.id),
    code: String(row.code || ''),
    grossCents: num(row.gross_cents),
    cashbackCents: num(row.cashback_cents),
    expiresAt: isoDate(row.expires_at),
  };
}

async function quickVoucherReceipt(voucherId: number): Promise<DbRow | null> {
  if (voucherId <= 0) return null;
  await refreshExpiredQuickVouchers();
  const result = await pgPool.query(
    `SELECT q.*, a.name AS attendant_name
       FROM cashback_quick_vouchers q
       LEFT JOIN cashback_attendants a ON a.id = q.issued_attendant_id
      WHERE q.id = $1
      LIMIT 1`,
    [voucherId],
  );
  return (result.rows[0] as DbRow | undefined) || null;
}

function rememberQuickVoucherReceipt(req: Request, voucherId: number): void {
  if (voucherId <= 0) return;
  const ids = (req.session.quickVoucherReceiptIds || []).filter((id) => id !== voucherId);
  req.session.quickVoucherReceiptIds = [voucherId, ...ids].slice(0, 12);
}

async function balanceForClient(clientId: number): Promise<Balance> {
  await refreshExpiredCredits();
  const settings = await loadSettings();
  const result = await pgPool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN canceled_at IS NULL THEN original_cents ELSE 0 END), 0)::bigint AS total_gerado,
       COALESCE(SUM(CASE WHEN canceled_at IS NULL AND status = 'ativo' AND expires_at >= CURRENT_DATE THEN remaining_cents ELSE 0 END), 0)::bigint AS saldo_disponivel,
       COALESCE(SUM(CASE WHEN canceled_at IS NULL AND status = 'expirado' THEN remaining_cents ELSE 0 END), 0)::bigint AS saldo_expirado,
       COALESCE(SUM(CASE WHEN canceled_at IS NULL AND status = 'ativo' AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day') THEN remaining_cents ELSE 0 END), 0)::bigint AS saldo_expirando,
       MIN(CASE WHEN canceled_at IS NULL AND status = 'ativo' AND remaining_cents > 0 AND expires_at >= CURRENT_DATE THEN expires_at ELSE NULL END) AS proximo_vencimento
     FROM cashback_credits
     WHERE client_id = $2`,
    [settings.expirationAlertDays, clientId],
  );
  const used = await pgPool.query('SELECT COALESCE(SUM(redeemed_cents), 0)::bigint AS used FROM cashback_redemptions WHERE client_id = $1', [
    clientId,
  ]);
  const row = result.rows[0] as DbRow;
  return {
    totalGerado: num(row.total_gerado),
    saldoDisponivel: num(row.saldo_disponivel),
    saldoExpirado: num(row.saldo_expirado),
    saldoExpirando: num(row.saldo_expirando),
    saldoUsado: num(used.rows[0]?.used),
    proximoVencimento: isoDate(row.proximo_vencimento) || null,
  };
}

async function expiryBreakdownForClients(clientIds: number[]): Promise<Map<number, CreditExpirySlice[]>> {
  const ids = Array.from(new Set(clientIds.map((id) => Math.trunc(num(id))).filter((id) => id > 0)));
  const byClient = new Map<number, CreditExpirySlice[]>();
  if (!ids.length) return byClient;

  await refreshExpiredCredits();
  const result = await pgPool.query(
    `SELECT client_id,
            expires_at::date AS expires_at,
            COALESCE(SUM(remaining_cents), 0)::bigint AS amount_cents,
            COUNT(*)::int AS credits
       FROM cashback_credits
      WHERE client_id = ANY($1::bigint[])
        AND canceled_at IS NULL
        AND status = 'ativo'
        AND remaining_cents > 0
        AND expires_at >= CURRENT_DATE
      GROUP BY client_id, expires_at::date
      ORDER BY expires_at::date ASC, client_id ASC`,
    [ids],
  );

  for (const row of result.rows as DbRow[]) {
    const clientId = num(row.client_id);
    const expiresAt = isoDate(row.expires_at);
    if (!clientId || !expiresAt) continue;
    const current = byClient.get(clientId) || [];
    current.push({
      expiresAt,
      amountCents: num(row.amount_cents),
      credits: num(row.credits),
      daysUntil: daysUntilDate(expiresAt),
    });
    byClient.set(clientId, current);
  }

  return byClient;
}

async function activeClientExists(clientId: number): Promise<boolean> {
  const result = await pgPool.query("SELECT id FROM cashback_clients WHERE id = $1 AND status = 'ativo' LIMIT 1", [clientId]);
  return (result.rowCount ?? 0) > 0;
}

async function normalizeAttendantId(attendantId: number | null): Promise<number | null> {
  if (!attendantId || attendantId <= 0) return null;
  const result = await pgPool.query(
    "SELECT id, core_user_id FROM cashback_attendants WHERE id = $1 AND status = 'ativo' AND core_user_id IS NOT NULL LIMIT 1",
    [attendantId],
  );
  if ((result.rowCount ?? 0) <= 0) throw new Error('Atendente invalido ou inativo.');
  const coreUser = await cashbackCoreUserById(num(result.rows[0]?.core_user_id));
  if (!coreUser) throw new Error('Atendente sem conta Wimifarma ativa ou sem acesso ao Cashback.');
  return attendantId;
}

async function clientOptions(): Promise<DbRow[]> {
  const result = await pgPool.query("SELECT id, name, phone FROM cashback_clients WHERE status = 'ativo' ORDER BY name ASC");
  return result.rows as DbRow[];
}

async function attendantOptions(): Promise<DbRow[]> {
  const [result, coreUsers] = await Promise.all([
    pgPool.query("SELECT id, core_user_id, name FROM cashback_attendants WHERE status = 'ativo' AND core_user_id IS NOT NULL ORDER BY name ASC"),
    activeCashbackCoreUsers(),
  ]);
  const eligibleUsers = new Map(coreUsers.map((user) => [user.id, user]));
  return (result.rows as DbRow[])
    .filter((row) => eligibleUsers.has(num(row.core_user_id)))
    .map((row) => ({ ...row, name: attendantNameForUser(eligibleUsers.get(num(row.core_user_id)) as User) }));
}

function attendantNameForUser(user: User): string {
  return cleanText(user.displayName || user.username, 160) || cleanText(user.username, 160) || `Usuario ${user.id}`;
}

async function ensureAttendantForCoreUser(
  user: User,
  notes: string,
): Promise<{ id: number; result: 'existing' | 'linked' | 'created' }> {
  const attendantName = attendantNameForUser(user);
  const existingByCore = await pgPool.query('SELECT id, name, status FROM cashback_attendants WHERE core_user_id = $1 LIMIT 1', [user.id]);
  const coreRow = existingByCore.rows[0] as DbRow | undefined;
  if (coreRow) {
    const id = num(coreRow.id);
    await pgPool.query(
      `UPDATE cashback_attendants
          SET name = $1,
              status = 'ativo',
              notes = CASE WHEN $2 <> '' THEN $2 ELSE notes END,
              updated_at = NOW()
        WHERE id = $3`,
      [attendantName, notes, id],
    );
    return { id, result: 'existing' };
  }

  const existingByName = await pgPool.query(
    "SELECT id, core_user_id FROM cashback_attendants WHERE LOWER(name) = LOWER($1) ORDER BY CASE WHEN core_user_id IS NULL THEN 0 ELSE 1 END, id ASC LIMIT 1",
    [attendantName],
  );
  const nameRow = existingByName.rows[0] as DbRow | undefined;
  if (nameRow && !nameRow.core_user_id) {
    const id = num(nameRow.id);
    await pgPool.query(
      `UPDATE cashback_attendants
          SET core_user_id = $1,
              name = $2,
              status = 'ativo',
              notes = CASE WHEN $3 <> '' THEN $3 ELSE notes END,
              updated_at = NOW()
        WHERE id = $4`,
      [user.id, attendantName, notes, id],
    );
    return { id, result: 'linked' };
  }

  try {
    const inserted = await pgPool.query(
      "INSERT INTO cashback_attendants (core_user_id, name, status, notes) VALUES ($1, $2, 'ativo', $3) RETURNING id",
      [user.id, attendantName, notes || `Criado automaticamente a partir do login ${user.username}.`],
    );
    const id = num(inserted.rows[0]?.id);
    await pgPool.query('UPDATE cashback_attendants SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [id]);
    return { id, result: 'created' };
  } catch (error) {
    const retry = await pgPool.query('SELECT id FROM cashback_attendants WHERE core_user_id = $1 LIMIT 1', [user.id]);
    const retryId = num(retry.rows[0]?.id);
    if (retryId > 0) return { id: retryId, result: 'existing' };
    throw error;
  }
}

async function loggedUserAttendantId(req: Request): Promise<number | null> {
  const user = req.session.user;
  if (!user) return null;
  const coreUser = await cashbackCoreUserById(user.id);
  if (!coreUser) return null;
  req.session.user = coreUser;
  return (await ensureAttendantForCoreUser(coreUser, '')).id;
}

async function requireLoggedAttendantId(req: Request): Promise<number> {
  const attendantId = await loggedUserAttendantId(req);
  if (!attendantId) throw new Error('Nao foi possivel identificar o usuario logado como atendente.');
  return attendantId;
}

async function logAction(
  req: Request,
  action: string,
  entityType: string | null,
  entityId: number | null,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const userId = req.session.user?.id ?? null;
  try {
    await pgPool.query(
      `INSERT INTO cashback_audit_events (user_id, action, entity_type, entity_id, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, entityId, message, JSON.stringify(metadata)],
    );
  } catch {
    // Audit logging must not block the cashier flow.
  }
}

async function linkedXpEmployeeForUser(userId: number): Promise<{ id: number; name: string } | null> {
  if (userId <= 0) return null;
  const link = await corePgPool.query<{ xp_employee_id: string | null; xp_employee_name: string | null }>(
    `SELECT xp_employee_id::text, xp_employee_name
       FROM core_user_xp_links
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  const employeeId = num(link.rows[0]?.xp_employee_id);
  if (employeeId <= 0) return null;
  const employee = await xpPgPool.query<{ id: string; name: string; system_key: string | null }>(
    `SELECT id::text, name, system_key
       FROM xp_employees
      WHERE id = $1
        AND status = 'ativo'
        AND deleted_at IS NULL
      LIMIT 1`,
    [employeeId],
  );
  const row = employee.rows[0];
  if (!row) return null;
  return { id: num(row.id), name: cleanText(row.name, 180) || (row.system_key === 'adm' ? 'ADM' : 'Funcionario XP') };
}

async function currentUserXpRewardStatus(req: Request): Promise<XpRewardStatus> {
  const userId = req.session.user?.id ?? 0;
  if (userId <= 0) {
    return { available: false, employeeName: null, message: 'XP indisponivel: usuario sem sessao.' };
  }
  try {
    const employee = await linkedXpEmployeeForUser(userId);
    if (!employee) {
      return { available: false, employeeName: null, message: 'Sem XP vinculado: vincule este usuario no modulo Usuarios.' };
    }
    return { available: true, employeeName: employee.name, message: `+${XP_CASHBACK_REDEEM_POINTS} XP para ${employee.name} quando usar cashback.` };
  } catch {
    return { available: false, employeeName: null, message: 'XP indisponivel agora: compra continua funcionando.' };
  }
}

async function awardXpForCashbackRedemption(req: Request, redemptionId: number, redeemedCents: number, clientId: number): Promise<XpAwardResult> {
  if (redemptionId <= 0 || redeemedCents <= 0) {
    return { awarded: false, message: 'Sem XP: nenhum cashback foi usado.' };
  }
  const userId = req.session.user?.id ?? 0;
  if (userId <= 0) {
    return { awarded: false, message: 'XP nao gerado: usuario sem sessao.' };
  }
  try {
    await ensureXpRewardSchema();
    const employee = await linkedXpEmployeeForUser(userId);
    if (!employee) {
      return { awarded: false, message: 'XP nao gerado: usuario sem vinculo XP.' };
    }
    const sourceEntityId = String(redemptionId);
    const xpClient = await xpPgPool.connect();
    try {
      await xpClient.query('BEGIN');
      const existing = await xpClient.query<{ id: string }>(
        'SELECT id::text FROM xp_sales WHERE source = $1 AND source_entity_id = $2 LIMIT 1',
        [XP_CASHBACK_REDEEM_SOURCE, sourceEntityId],
      );
      if (existing.rows[0]) {
        await xpClient.query('COMMIT');
        return {
          awarded: false,
          alreadyAwarded: true,
          employeeName: employee.name,
          saleId: num(existing.rows[0].id),
          message: `XP ja estava registrado para ${employee.name}.`,
        };
      }
      const note = cleanText(`Cashback usado no Balcao: ${brMoneyCents(redeemedCents)} no cliente #${clientId}.`, 220);
      const inserted = await xpClient.query<{ id: string }>(
        `INSERT INTO xp_sales (employee_id, sale_date, amount_cents, xp_points, note, created_by, source, source_entity_id)
         VALUES ($1, CURRENT_DATE, 0, $2, $3, $4, $5, $6)
         RETURNING id::text`,
        [employee.id, XP_CASHBACK_REDEEM_POINTS, note, userId, XP_CASHBACK_REDEEM_SOURCE, sourceEntityId],
      );
      const saleId = num(inserted.rows[0]?.id);
      await xpClient.query(
        `INSERT INTO xp_audit_events (actor_user_id, action, entity_type, entity_id, summary)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          'xp_cashback_resgate_lancado',
          'xp_sale',
          String(saleId),
          cleanText(`+${XP_CASHBACK_REDEEM_POINTS} XP por uso de cashback no resgate #${redemptionId}.`, 255),
        ],
      );
      await xpClient.query('COMMIT');
      await logAction(req, 'xp_cashback_resgate_lancado', 'resgate', redemptionId, `XP gerado para ${employee.name}: +${XP_CASHBACK_REDEEM_POINTS}.`);
      return {
        awarded: true,
        employeeName: employee.name,
        saleId,
        message: `XP gerado: +${XP_CASHBACK_REDEEM_POINTS} para ${employee.name}.`,
      };
    } catch (error) {
      await xpClient.query('ROLLBACK').catch(() => undefined);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
      if (code === '23505') {
        return { awarded: false, alreadyAwarded: true, employeeName: employee.name, message: `XP ja estava registrado para ${employee.name}.` };
      }
      throw error;
    } finally {
      xpClient.release();
    }
  } catch (error) {
    await logAction(req, 'xp_cashback_resgate_falha', 'resgate', redemptionId, `Falha ao gerar XP do cashback: ${errorMessage(error)}`);
    return { awarded: false, message: `XP nao gerado agora: ${errorMessage(error)}` };
  }
}

function htmlShell(req: Request, title: string, body: string, options: { login?: boolean; maintenance?: boolean } = {}): string {
  const flash = takeFlash(req);
  const user = req.session.user;
  const pageClass = title === 'WhatsApp' ? ' whatsapp-page' : '';
  if (options.login || options.maintenance) {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} - Wimifarma Cashback</title>
  <link rel="icon" type="image/png" href="${asset('favicon.png')}">
  <link rel="apple-touch-icon" href="${asset('apple-touch-icon.png')}">
  <link rel="stylesheet" href="${asset('styles.css')}">
  ${options.login ? `<script src="${asset('login-runner.js')}" defer></script>` : ''}
</head>
<body class="${options.maintenance ? 'maintenance-page' : 'login-body'}">
${body}
</body>
</html>`;
  }

  const nav = [
    ['dashboard.php#busca', 'Balcao'],
    ['dashboard.php#cadastro', 'Novo cliente'],
    ['dashboard.php#resgate', 'Nova compra, Gastar/Usar CashBack'],
    ['mensagens.php', 'Mensagens'],
    ['relatorio.php', 'Configuracao e Relatorio'],
  ];
  const currentFile = String(req.path || '').split('/').filter(Boolean).pop() || 'dashboard.php';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} - Wimifarma Cashback</title>
  <meta name="wfwc-csrf" content="${e(csrf(req))}">
  <link rel="icon" type="image/png" href="${asset('favicon.png')}">
  <link rel="apple-touch-icon" href="${asset('apple-touch-icon.png')}">
  <link rel="stylesheet" href="${asset('styles.css')}">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260610-miauby-video">
</head>
<body>
<img class="cashback-screen-runner" src="${asset('mario.gif')}" alt="" aria-hidden="true" data-cashback-runner>
<header class="topbar">
  <a class="brand-wrap" href="/" aria-label="Ir para Home">
    <img class="brand-logo" src="${asset('logo-wimifarma.svg')}" alt="Wimifarma">
    <strong class="brand">Cashback</strong>
  </a>
  <nav class="nav">
    ${nav
      .map(([href, label]) => {
        const [pathPart, hash = ''] = href.split('#');
        const isActive = currentFile === pathPart && (pathPart !== 'dashboard.php' || hash === 'busca');
        const attrs = [
          hash ? `data-section-link="${e(hash)}"` : '',
          `data-nav-link`,
          `data-nav-path="${e(pathPart)}"`,
          hash ? `data-nav-hash="${e(hash)}"` : '',
          isActive ? `class="is-active"` : '',
          isActive ? `aria-current="page"` : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<a href="${pageUrl(href)}" ${attrs}>${e(label)}</a>`;
      })
      .join('')}
    <a href="/">Home</a>
  </nav>
</header>
<main class="container${pageClass}">
  <div class="page-heading">
    <div><span class="kicker">Operacao real</span><h1>${e(title)}</h1></div>
    <div class="user-pill">Usuario: ${e(user?.username || '')}</div>
  </div>
  ${flash.message ? `<div class="alert ${e(flash.type || 'info')}">${e(flash.message)}</div>` : ''}
  ${body}
</main>
<footer class="footer"><span>Wimifarma Cashback v${SERVICE_VERSION}</span><span>Operacao Wimifarma Cashback.</span></footer>
<script src="${asset('app.js')}"></script>
<script src="/miauw/widget.js?v=20260610-miauby-video" defer></script>
</body>
</html>`;
}

function renderLogin(req: Request, error: string): string {
  const username = String(req.body?.username || '');
  return htmlShell(
    req,
    'Login',
    `<img class="login-screen-runner login-cat-runner" src="${asset('gato-hapy.gif')}" alt="" aria-hidden="true" data-login-runner>
<main class="login-card">
  <img class="login-logo" src="${asset('logo-wimifarma.svg')}" alt="Wimifarma">
  <span class="kicker">Wimifarma Cashback</span>
  <h1>Acesso da equipe</h1>
  <p>Entre para cadastrar clientes, registrar compras e controlar cashback em tempo real.</p>
  ${error ? `<div class="alert error">${e(error)}</div>` : ''}
  <form method="post" action="${pageUrl('login.php')}" class="form-grid">
    ${csrfField(req)}
    <label><span>Usuario</span><input type="text" name="username" required autocomplete="username" value="${e(username)}"></label>
    <label><span>Senha</span><input type="password" name="password" required autocomplete="current-password" value=""></label>
    <button type="submit" class="btn primary">Entrar</button>
  </form>
</main>`,
    { login: true },
  );
}

function renderMaintenance(req: Request, error: string): string {
  const maintenanceAction = req.session.user
    ? `<form method="post" class="maintenance-unlock">
      ${csrfField(req)}
      <input type="hidden" name="action" value="disable_maintenance">
      <button class="btn primary full" type="submit">Liberar sistema</button>
      ${error ? `<div class="alert error">${e(error)}</div>` : ''}
    </form>`
    : `<div class="maintenance-unlock">
      <p>Entre pela Home para liberar o sistema.</p>
      <a class="btn primary full" href="/">Ir para Home</a>
      ${error ? `<div class="alert error">${e(error)}</div>` : ''}
    </div>`;
  return htmlShell(
    req,
    'Manutencao',
    `<main class="maintenance-shell">
  <section class="maintenance-copy">
    <img class="maintenance-brand" src="${asset('logo-wimifarma.svg')}" alt="Wimifarma">
    <span class="kicker">Modo tecnico ativo</span>
    <h1>Cashback em manutencao.</h1>
    <p>Estamos ajustando o sistema para o balcao continuar rapido, seguro e sem bugs para a equipe.</p>
    ${maintenanceAction}
  </section>
  <section class="maintenance-visual" aria-label="Tecnico da farmacia ajustando o sistema">
    <div class="maintenance-orbit orbit-one"></div><div class="maintenance-orbit orbit-two"></div>
    <div class="maintenance-cube cube-one">Node</div><div class="maintenance-cube cube-two">PG</div>
    <div class="maintenance-console"><span></span><span></span><span></span><strong>Wimifarma Cashback</strong><p>Revisando clientes e saldos...</p></div>
    <div class="maintenance-avatar"><img src="${asset('site-icon-512.png')}" alt=""></div>
  </section>
</main>`,
    { maintenance: true },
  );
}

async function handleDashboardPost(req: Request, res: Response): Promise<void> {
  const action = String(req.body?.action || '');
  if (action === 'create_quick_cashback') {
    await createQuickVoucherFromDashboard(req, res);
    return;
  }
  if (action === 'save_attendant') {
    setFlash(req, 'error', 'Cadastro de atendente fica em Configuracao e Relatorio.');
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  if (action === 'save_client') {
    await createClientFromDashboard(req, res);
    return;
  }
  if (action === 'save_purchase') {
    await createPurchaseFromDashboard(req, res);
    return;
  }
  if (action === 'save_redeem') {
    await createAutomaticRedemption(req, res);
    return;
  }
  setFlash(req, 'error', 'Acao invalida.');
  res.redirect(`${BASE_PATH}/dashboard.php#busca`);
}

async function createQuickVoucherFromDashboard(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const grossCents = moneyToCents(req.body?.valor_compra_rapida);
  const requestToken = `issue:${cleanText(req.body?.request_token, 100) || crypto.randomUUID()}`;
  if (grossCents <= 0) {
    setFlash(req, 'error', 'Informe quanto o cliente gastou para gerar o cashback rapido.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  const cashbackCents = Math.round((grossCents * settings.cashbackPercentBps) / 10000);
  if (cashbackCents <= 0) {
    setFlash(req, 'error', 'O valor informado precisa gerar pelo menos R$ 0,01 de cashback.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }

  let attendantId: number | null = null;
  try {
    attendantId = await normalizeAttendantId(num(req.body?.atendente_id));
  } catch (error) {
    setFlash(req, 'error', errorMessage(error));
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  if (!attendantId) {
    setFlash(req, 'error', 'Selecione o usuario que esta imprimindo o cupom.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const voucher = await issueQuickVoucher(client, {
      grossCents,
      cashbackCents,
      percentBps: settings.cashbackPercentBps,
      attendantId,
      userId: req.session.user?.id ?? null,
      requestToken,
    });
    await client.query('COMMIT');
    rememberQuickVoucherReceipt(req, voucher.id);
    await logAction(
      req,
      'cashback_rapido_emitido',
      'cashback_quick_voucher',
      voucher.id,
      `Codigo rapido ${voucher.code} emitido por ${brMoneyCents(voucher.cashbackCents)}.`,
      { attendant_id: attendantId, gross_cents: grossCents, expires_at: voucher.expiresAt },
    );
    setFlash(req, 'success', `Cashback rapido criado. Codigo ${voucher.code}, valido ate ${brDate(voucher.expiresAt)}.`);
    res.redirect(`${BASE_PATH}/dashboard.php?voucher_id=${voucher.id}#busca`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    setFlash(req, 'error', `Erro ao gerar cashback rapido: ${errorMessage(error)}`);
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
  } finally {
    client.release();
  }
}

async function createClientFromDashboard(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const name = cleanText(req.body?.nome, 180);
  const phone = digitsOnly(req.body?.telefone) || null;
  const birthDate = cleanText(req.body?.nascimento, 10);
  const notes = cleanText(req.body?.observacoes, 5000);
  const initialAmount = moneyToCents(req.body?.valor_compra_inicial);
  const initialPercentBps = percentToBps(req.body?.percentual_cashback_inicial || settings.cashbackPercent);
  const quickCodeRaw = cleanText(req.body?.codigo_cashback, 20);
  const quickCode = normalizeQuickVoucherCode(quickCodeRaw);
  if (!name) {
    setFlash(req, 'error', 'Informe o nome do cliente.');
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  if (birthDate && !isValidDateInput(birthDate)) {
    setFlash(req, 'error', 'Data de nascimento invalida.');
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  if (quickCodeRaw && !quickCode) {
    setFlash(req, 'error', 'O codigo de cashback precisa ter exatamente 4 digitos.');
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  if (quickCode && initialAmount <= 0) {
    setFlash(req, 'error', 'Informe a compra atual para usar o codigo e cadastrar o cliente.');
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  if (quickCode) {
    try {
      const waitSeconds = await consumeQuickVoucherAttempt(req, 'redeem', 30, 10 * 60, 30 * 60);
      if (waitSeconds > 0) {
        await logAction(req, 'cashback_rapido_limite_tentativas', 'cashback_quick_voucher', null, 'Limite de tentativas de uso de codigo rapido atingido.');
        setFlash(req, 'error', `Muitas tentativas de codigo. Aguarde ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`);
        res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
        return;
      }
    } catch {
      setFlash(req, 'error', 'Nao foi possivel validar tentativas de codigo agora. Tente novamente.');
      res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
      return;
    }
  }
  let attendantId: number | null;
  try {
    attendantId = await requireLoggedAttendantId(req);
  } catch (error) {
    setFlash(req, 'error', errorMessage(error));
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
    return;
  }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO cashback_clients (name, phone, birth_date, notes, status, attendant_id)
       VALUES ($1, $2, $3::date, $4, 'ativo', $5)
       RETURNING id`,
      [name, phone, birthDate || null, notes || null, attendantId],
    );
    const clientId = num(inserted.rows[0]?.id);
    await client.query('UPDATE cashback_clients SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [clientId]);
    let message = `Cliente cadastrado e selecionado: ${name}.`;
    let purchase: { id: number; cashbackCents: number; expiresAt: string; chargedCents: number } | null = null;
    let quickRedemption: QuickVoucherRedemption | null = null;
    if (quickCode) {
      quickRedemption = await redeemQuickVoucherAndCreateSuccessor(client, {
        code: quickCode,
        clientId,
        attendantId,
        purchaseCents: initialAmount,
        settings,
        notes: `Cliente cadastrado no primeiro uso do codigo. ${notes}`,
        userId: req.session.user?.id ?? null,
      });
      message += ` Codigo ${quickCode} usado: ${brMoneyCents(quickRedemption.redeemedCents)}. Valor a cobrar: ${brMoneyCents(quickRedemption.chargedCents)}.`;
    } else if (initialAmount > 0) {
      purchase = await createPurchaseAndCredit(client, {
        clientId,
        attendantId,
        grossCents: initialAmount,
        discountCents: 0,
        redemptionId: null,
        percentBps: initialPercentBps,
        notes: `Compra inicial registrada junto ao cadastro.${notes ? ` ${notes}` : ''}`,
        userId: req.session.user?.id ?? null,
      });
      message += ` Compra inicial registrada. Valor a cobrar: ${brMoneyCents(purchase.chargedCents)}. Cashback gerado: ${brMoneyCents(
        purchase.cashbackCents,
      )}.`;
    }
    await client.query('COMMIT');
    await logAction(req, 'cliente_criado', 'cliente', clientId, `Cliente criado pela operacao de balcao: ${name}`);
    if (quickRedemption) {
      await logAction(
        req,
        'cashback_rapido_usado',
        'cashback_quick_voucher',
        quickRedemption.voucherId,
        `Codigo rapido ${quickRedemption.code} usado no cadastro do cliente #${clientId}.`,
        { redemption_id: quickRedemption.redemptionId, purchase_id: quickRedemption.purchaseId },
      );
      const xpResult = await awardXpForCashbackRedemption(req, quickRedemption.redemptionId, quickRedemption.redeemedCents, clientId);
      const successorText = quickRedemption.successor
        ? ` Novo codigo ${quickRedemption.successor.code}: ${brMoneyCents(quickRedemption.successor.cashbackCents)}.`
        : ' A nova compra nao gerou outro codigo.';
      setFlash(req, 'success', `${message}${successorText} ${xpResult.message}`);
      const voucherQuery = quickRedemption.successor ? `&voucher_id=${quickRedemption.successor.id}` : '';
      if (quickRedemption.successor) rememberQuickVoucherReceipt(req, quickRedemption.successor.id);
      res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}${voucherQuery}#${quickRedemption.successor ? 'busca' : 'cliente-atual'}`);
      return;
    }
    setFlash(req, 'success', message);
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#cliente-atual`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    setFlash(req, 'error', `Erro ao cadastrar cliente: ${errorMessage(error)}`);
    res.redirect(`${BASE_PATH}/dashboard.php#cadastro`);
  } finally {
    client.release();
  }
}

async function createPurchaseFromDashboard(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const clientId = num(req.body?.cliente_id);
  const amount = moneyToCents(req.body?.valor_total);
  const manualCashbackCents = moneyToCents(req.body?.cashback_manual);
  const percentBps = percentToBps(req.body?.percentual_cashback || settings.cashbackPercent);
  const notes = cleanText(req.body?.observacoes, 5000);
  if (clientId <= 0 || amount <= 0) {
    setFlash(req, 'error', 'Selecione o cliente e informe valor/percentual validos.');
    res.redirect(`${BASE_PATH}/dashboard.php#resgate`);
    return;
  }
  if (manualCashbackCents > amount) {
    setFlash(req, 'error', 'Cashback Manual nao pode ser maior que o valor da compra.');
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
    return;
  }
  if (!(await activeClientExists(clientId))) {
    setFlash(req, 'error', 'Cliente invalido ou inativo.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  try {
    const attendantId = await requireLoggedAttendantId(req);
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const purchase = await createPurchaseAndCredit(client, {
        clientId,
        attendantId,
        grossCents: amount,
        discountCents: 0,
        redemptionId: null,
        percentBps,
        manualCashbackCents,
        notes,
        userId: req.session.user?.id ?? null,
      });
      await client.query('COMMIT');
      await logAction(req, 'compra_criada', 'compra', purchase.id, `Compra registrada no balcao com cashback de ${brMoneyCents(purchase.cashbackCents)}`);
      const generationLabel = manualCashbackCents > 0 ? 'Cashback Manual gerado' : 'Cashback gerado';
      setFlash(req, 'success', `Compra registrada. ${generationLabel}: ${brMoneyCents(purchase.cashbackCents)} com validade ate ${brDate(purchase.expiresAt)}.`);
      res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#cliente-atual`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    setFlash(req, 'error', `Erro ao registrar compra: ${errorMessage(error)}`);
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
  }
}

async function createAutomaticRedemption(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const clientId = num(req.body?.cliente_id);
  const purchaseCents = moneyToCents(req.body?.valor_compra);
  const manualCashbackCents = moneyToCents(req.body?.cashback_manual);
  const notes = cleanText(req.body?.observacoes, 5000);
  const quickCodeRaw = cleanText(req.body?.codigo_cashback, 20);
  const quickCode = normalizeQuickVoucherCode(quickCodeRaw);
  if (clientId <= 0 || purchaseCents <= 0) {
    setFlash(req, 'error', 'Informe cliente e valor da compra atual.');
    res.redirect(`${BASE_PATH}/dashboard.php#resgate`);
    return;
  }
  if (manualCashbackCents > purchaseCents) {
    setFlash(req, 'error', 'Cashback Manual nao pode ser maior que o valor da compra.');
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
    return;
  }
  if (quickCodeRaw && !quickCode) {
    setFlash(req, 'error', 'O codigo de cashback precisa ter exatamente 4 digitos.');
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
    return;
  }
  if (quickCode && manualCashbackCents > 0) {
    setFlash(req, 'error', 'Ao usar um codigo rapido, deixe o Cashback Manual vazio.');
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
    return;
  }
  if (quickCode) {
    try {
      const waitSeconds = await consumeQuickVoucherAttempt(req, 'redeem', 30, 10 * 60, 30 * 60);
      if (waitSeconds > 0) {
        await logAction(req, 'cashback_rapido_limite_tentativas', 'cashback_quick_voucher', null, 'Limite de tentativas de uso de codigo rapido atingido.');
        setFlash(req, 'error', `Muitas tentativas de codigo. Aguarde ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`);
        res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
        return;
      }
    } catch {
      setFlash(req, 'error', 'Nao foi possivel validar tentativas de codigo agora. Tente novamente.');
      res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
      return;
    }
  }
  if (!(await activeClientExists(clientId))) {
    setFlash(req, 'error', 'Cliente invalido ou inativo.');
    res.redirect(`${BASE_PATH}/dashboard.php#busca`);
    return;
  }
  try {
    const attendantId = await requireLoggedAttendantId(req);
    if (quickCode) {
      const quickClient = await pgPool.connect();
      try {
        await quickClient.query('BEGIN');
        const quickRedemption = await redeemQuickVoucherAndCreateSuccessor(quickClient, {
          code: quickCode,
          clientId,
          attendantId,
          purchaseCents,
          settings,
          notes,
          userId: req.session.user?.id ?? null,
        });
        await quickClient.query('COMMIT');
        await logAction(
          req,
          'cashback_rapido_usado',
          'cashback_quick_voucher',
          quickRedemption.voucherId,
          `Codigo rapido ${quickRedemption.code} usado pelo cliente #${clientId}.`,
          { redemption_id: quickRedemption.redemptionId, purchase_id: quickRedemption.purchaseId },
        );
        const xpResult = await awardXpForCashbackRedemption(req, quickRedemption.redemptionId, quickRedemption.redeemedCents, clientId);
        const successorText = quickRedemption.successor
          ? ` Novo codigo ${quickRedemption.successor.code}: ${brMoneyCents(quickRedemption.successor.cashbackCents)}.`
          : ' A nova compra nao gerou outro codigo.';
        setFlash(
          req,
          'success',
          `Codigo usado: ${brMoneyCents(quickRedemption.redeemedCents)}. Valor a cobrar: ${brMoneyCents(quickRedemption.chargedCents)}.${successorText} ${xpResult.message}`,
        );
        const voucherQuery = quickRedemption.successor ? `&voucher_id=${quickRedemption.successor.id}` : '';
        if (quickRedemption.successor) rememberQuickVoucherReceipt(req, quickRedemption.successor.id);
        res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}${voucherQuery}#${quickRedemption.successor ? 'busca' : 'cliente-atual'}`);
        return;
      } catch (error) {
        await quickClient.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        quickClient.release();
      }
    }
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT id, remaining_cents
         FROM cashback_credits
         WHERE client_id = $1
           AND canceled_at IS NULL
           AND status = 'ativo'
           AND remaining_cents > 0
           AND expires_at >= CURRENT_DATE
         ORDER BY expires_at ASC, id ASC
         FOR UPDATE`,
        [clientId],
      );
      const available = (locked.rows as DbRow[]).reduce((sum, row) => sum + num(row.remaining_cents), 0);
      const maxByRule = Math.floor((purchaseCents / settings.redeemMultiplier) / 1) || 0;
      const redeemedCents = Math.min(available, maxByRule);
      let redemptionId: number | null = null;
      if (redeemedCents > 0) {
        const redemption = await client.query(
          `INSERT INTO cashback_redemptions (client_id, attendant_id, purchase_cents, redeemed_cents, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [clientId, attendantId, purchaseCents, redeemedCents, notes || null, req.session.user?.id ?? null],
        );
        redemptionId = num(redemption.rows[0]?.id);
        await client.query('UPDATE cashback_redemptions SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [redemptionId]);
        await consumeCredits(client, locked.rows as DbRow[], redemptionId, redeemedCents);
      }
      const purchase = await createPurchaseAndCredit(client, {
        clientId,
        attendantId,
        grossCents: purchaseCents,
        discountCents: redeemedCents,
        redemptionId,
        percentBps: settings.cashbackPercentBps,
        manualCashbackCents,
        notes: redeemedCents > 0 ? cleanText(`Compra com uso de cashback. ${notes}`, 5000) : notes,
        userId: req.session.user?.id ?? null,
      });
      await client.query('COMMIT');
      if (redemptionId) await logAction(req, 'resgate_criado', 'resgate', redemptionId, `Resgate registrado no balcao: ${brMoneyCents(redeemedCents)}`);
      await logAction(req, 'compra_cashback_criada', 'compra', purchase.id, `Valor cobrado ${brMoneyCents(purchase.chargedCents)} e novo cashback ${brMoneyCents(purchase.cashbackCents)}`);
      const xpResult = redemptionId ? await awardXpForCashbackRedemption(req, redemptionId, redeemedCents, clientId) : null;
      const generationLabel = manualCashbackCents > 0 ? 'Cashback Manual gerado' : 'Novo cashback gerado';
      const flash =
        redeemedCents > 0
          ? `Cashback usado: ${brMoneyCents(redeemedCents)}. Valor a cobrar: ${brMoneyCents(purchase.chargedCents)}. ${generationLabel}: ${brMoneyCents(purchase.cashbackCents)}.`
          : `Compra registrada sem uso de cashback. Valor a cobrar: ${brMoneyCents(purchase.chargedCents)}. ${generationLabel}: ${brMoneyCents(purchase.cashbackCents)}.`;
      setFlash(req, 'success', `${flash}${xpResult ? ` ${xpResult.message}` : ''}`);
      res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#cliente-atual`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    setFlash(req, 'error', `Erro ao registrar Compra Cashback: ${errorMessage(error)}`);
    res.redirect(`${BASE_PATH}/dashboard.php?cliente_id=${clientId}#resgate`);
  }
}

async function createPurchaseAndCredit(
  client: pg.PoolClient,
  input: {
    clientId: number;
    attendantId: number | null;
    grossCents: number;
    discountCents: number;
    redemptionId: number | null;
    percentBps: number;
    manualCashbackCents?: number;
    notes: string;
    userId: number | null;
  },
): Promise<{ id: number; creditId: number | null; cashbackCents: number; chargedCents: number; expiresAt: string }> {
  const chargedCents = Math.max(input.grossCents - input.discountCents, 0);
  const manualCashbackCents = Math.max(0, Math.floor(input.manualCashbackCents || 0));
  if (manualCashbackCents > chargedCents) {
    throw new Error('Cashback Manual nao pode ser maior que o valor a cobrar.');
  }
  const automaticCashbackCents = manualCashbackCents > 0 ? 0 : Math.round(chargedCents * (input.percentBps / 10000));
  const cashbackCents = manualCashbackCents > 0 ? manualCashbackCents : automaticCashbackCents;
  const generationMode = manualCashbackCents > 0 ? 'manual' : 'automatico';
  const storedPercentBps = manualCashbackCents > 0 ? 0 : input.percentBps;
  const purchase = await client.query(
    `INSERT INTO cashback_purchases
      (client_id, attendant_id, gross_cents, cashback_discount_cents, charged_cents, redemption_id,
       cashback_percent_bps, cashback_generated_cents, cashback_generation_mode, manual_cashback_cents, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, purchased_at::date AS purchase_date`,
    [
      input.clientId,
      input.attendantId,
      input.grossCents,
      input.discountCents,
      chargedCents,
      input.redemptionId,
      storedPercentBps,
      cashbackCents,
      generationMode,
      manualCashbackCents,
      input.notes || null,
      input.userId,
    ],
  );
  const purchaseId = num(purchase.rows[0]?.id);
  const expiresAt = dateDaysFromDate(purchase.rows[0]?.purchase_date, CASHBACK_CREDIT_VALIDITY_DAYS);
  await client.query('UPDATE cashback_purchases SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [purchaseId]);
  let creditId: number | null = null;
  if (cashbackCents > 0) {
    const credit = await client.query(
      `INSERT INTO cashback_credits (client_id, purchase_id, original_cents, remaining_cents, expires_at, status)
       VALUES ($1, $2, $3, $3, $4, 'ativo')
       RETURNING id`,
      [input.clientId, purchaseId, cashbackCents, expiresAt],
    );
    creditId = num(credit.rows[0]?.id);
    await client.query('UPDATE cashback_credits SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [creditId]);
  }

  await enqueuePurchaseWhatsapp(client, input.clientId, purchaseId, creditId, cashbackCents, expiresAt, input.discountCents, chargedCents);
  return { id: purchaseId, creditId, cashbackCents, chargedCents, expiresAt };
}

async function redeemQuickVoucherAndCreateSuccessor(
  client: pg.PoolClient,
  input: {
    code: string;
    clientId: number;
    attendantId: number;
    purchaseCents: number;
    settings: Settings;
    notes: string;
    userId: number | null;
  },
): Promise<QuickVoucherRedemption> {
  const voucher = await activeQuickVoucher(client, input.code, true);
  if (!voucher) throw new Error('Codigo de cashback invalido, usado ou expirado.');

  const issuedClientId = num(voucher.issued_client_id);
  if (issuedClientId > 0 && issuedClientId !== input.clientId) {
    throw new Error('Este codigo pertence a outro cliente cadastrado. Selecione o cliente correto.');
  }

  const redeemedCents = num(voucher.cashback_cents);
  const requiredPurchaseCents = Math.ceil(redeemedCents * input.settings.redeemMultiplier);
  if (input.purchaseCents < requiredPurchaseCents) {
    throw new Error(`Para usar ${brMoneyCents(redeemedCents)}, a compra precisa ser de pelo menos ${brMoneyCents(requiredPurchaseCents)}.`);
  }

  const chargedCents = Math.max(input.purchaseCents - redeemedCents, 0);
  const successorCashbackCents = Math.round((chargedCents * input.settings.cashbackPercentBps) / 10000);
  const redemption = await client.query(
    `INSERT INTO cashback_redemptions (client_id, attendant_id, purchase_cents, redeemed_cents, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.clientId,
      input.attendantId,
      input.purchaseCents,
      redeemedCents,
      cleanText(`Codigo rapido ${input.code} utilizado. ${input.notes}`, 5000) || null,
      input.userId,
    ],
  );
  const redemptionId = num(redemption.rows[0]?.id);
  await client.query('UPDATE cashback_redemptions SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [redemptionId]);

  const purchase = await client.query(
    `INSERT INTO cashback_purchases
      (client_id, attendant_id, gross_cents, cashback_discount_cents, charged_cents, redemption_id,
       cashback_percent_bps, cashback_generated_cents, cashback_generation_mode, manual_cashback_cents,
       notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'voucher_rapido', 0, $9, $10)
     RETURNING id`,
    [
      input.clientId,
      input.attendantId,
      input.purchaseCents,
      redeemedCents,
      chargedCents,
      redemptionId,
      input.settings.cashbackPercentBps,
      successorCashbackCents,
      cleanText(`Compra com codigo rapido ${input.code}. ${input.notes}`, 5000) || null,
      input.userId,
    ],
  );
  const purchaseId = num(purchase.rows[0]?.id);
  await client.query('UPDATE cashback_purchases SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [purchaseId]);

  const successor = successorCashbackCents > 0
    ? await issueQuickVoucher(client, {
        grossCents: chargedCents,
        cashbackCents: successorCashbackCents,
        percentBps: input.settings.cashbackPercentBps,
        attendantId: input.attendantId,
        userId: input.userId,
        requestToken: `successor:${num(voucher.id)}`,
        clientId: input.clientId,
        parentVoucherId: num(voucher.id),
        sourcePurchaseId: purchaseId,
      })
    : null;

  await client.query(
    `UPDATE cashback_quick_vouchers
        SET status = 'usado',
            redeemed_client_id = $1,
            redeemed_attendant_id = $2,
            redemption_id = $3,
            redeemed_at = NOW(),
            updated_at = NOW()
      WHERE id = $4`,
    [input.clientId, input.attendantId, redemptionId, num(voucher.id)],
  );

  return {
    voucherId: num(voucher.id),
    code: String(voucher.code || ''),
    redeemedCents,
    redemptionId,
    purchaseId,
    chargedCents,
    successor,
  };
}

async function consumeCredits(client: pg.PoolClient, credits: DbRow[], redemptionId: number, amountCents: number): Promise<void> {
  let remaining = amountCents;
  for (const credit of credits) {
    if (remaining <= 0) break;
    const available = num(credit.remaining_cents);
    const used = Math.min(available, remaining);
    const newBalance = Math.max(available - used, 0);
    const newStatus = newBalance <= 0 ? 'usado' : 'ativo';
    await client.query('UPDATE cashback_credits SET remaining_cents = $1, status = $2, updated_at = NOW() WHERE id = $3', [
      newBalance,
      newStatus,
      num(credit.id),
    ]);
    const item = await client.query(
      `INSERT INTO cashback_redemption_items (redemption_id, credit_id, used_cents)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [redemptionId, num(credit.id), used],
    );
    await client.query('UPDATE cashback_redemption_items SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [
      num(item.rows[0]?.id),
    ]);
    remaining -= used;
  }
  if (remaining > 0) throw new Error('Saldo disponivel mudou durante o resgate. Tente novamente.');
}

async function enqueuePurchaseWhatsapp(
  client: pg.PoolClient,
  clientId: number,
  purchaseId: number,
  creditId: number | null,
  cashbackCents: number,
  expiresAt: string,
  redeemedCents: number,
  chargedCents: number,
): Promise<void> {
  const clientRow = await client.query('SELECT name, phone FROM cashback_clients WHERE id = $1 LIMIT 1', [clientId]);
  const customer = clientRow.rows[0] as DbRow | undefined;
  if (!customer) return;
  let message = `Oi ${customer.name}, obrigado pela compra na Wimifarma! `;
  if (redeemedCents > 0) {
    message += `Hoje voce usou ${brMoneyCents(redeemedCents)} de cashback e pagou ${brMoneyCents(chargedCents)}. `;
  }
  message += `Voce recebeu ${brMoneyCents(cashbackCents)} de cashback, valido ate ${brDate(expiresAt)}.`;
  await saveWhatsappMessageWithClient(client, {
    campaign: 'compra',
    dedupeKey: `compra-${purchaseId}`,
    clientId,
    purchaseId,
    creditId,
    clientName: String(customer.name || ''),
    phone: digitsOnly(customer.phone) || null,
    message,
    dueDate: todayIso(),
    userId: null,
  });
}

async function saveWhatsappMessageWithClient(
  client: pg.PoolClient,
  input: {
    campaign: string;
    dedupeKey: string;
    clientId: number | null;
    purchaseId: number | null;
    creditId: number | null;
    clientName: string;
    phone: string | null;
    message: string;
    dueDate: string | null;
    userId: number | null;
  },
): Promise<DbRow> {
  const result = await client.query(
    `INSERT INTO cashback_whatsapp_messages
      (client_id, purchase_id, credit_id, campaign, dedupe_key, client_name, phone, message, due_date, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)
     ON CONFLICT (dedupe_key) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       purchase_id = EXCLUDED.purchase_id,
       credit_id = EXCLUDED.credit_id,
       client_name = EXCLUDED.client_name,
       phone = EXCLUDED.phone,
       message = CASE WHEN cashback_whatsapp_messages.status = 'pendente' THEN EXCLUDED.message ELSE cashback_whatsapp_messages.message END,
       due_date = EXCLUDED.due_date,
       updated_at = NOW()
     RETURNING *`,
    [
      input.clientId,
      input.purchaseId,
      input.creditId,
      input.campaign,
      input.dedupeKey,
      input.clientName,
      input.phone,
      input.message,
      input.dueDate,
      input.userId,
    ],
  );
  const row = result.rows[0] as DbRow;
  await client.query('UPDATE cashback_whatsapp_messages SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [num(row.id)]);
  return row;
}

async function saveWhatsappMessage(input: {
  campaign: string;
  dedupeKey: string;
  clientId: number | null;
  purchaseId: number | null;
  creditId: number | null;
  clientName: string;
  phone: string | null;
  message: string;
  dueDate: string | null;
  userId: number | null;
}): Promise<DbRow> {
  const client = await pgPool.connect();
  try {
    const row = await saveWhatsappMessageWithClient(client, input);
    return row;
  } finally {
    client.release();
  }
}

function renderQuickVoucherReceipt(voucher: DbRow | null): string {
  if (!voucher) return '';
  const active = String(voucher.status || '') === 'ativo' && isoDate(voucher.expires_at) >= todayIso();
  return `<div class="quick-voucher-result ${active ? 'is-active' : 'is-inactive'}">
    <div class="quick-voucher-result-copy no-print">
      <span class="kicker">Cupom pronto</span>
      <h3>${active ? 'Confira e imprima o cashback' : 'Este cupom nao esta mais ativo'}</h3>
      <p>${active ? 'O codigo ja esta gravado. A impressao abre a tela da impressora deste computador.' : 'Cupons usados ou expirados ficam somente no historico.'}</p>
    </div>
    <article class="quick-voucher-receipt" data-quick-voucher-receipt>
      <img class="receipt-brand" src="${asset('logo-wimifarma-receipt.png')}" alt="Wimifarma" width="731" height="292">
      <h2>CashBack Wimifarma</h2>
      <span class="receipt-label">Voce ganhou</span>
      <strong class="receipt-value">${brMoneyCents(voucher.cashback_cents)}</strong>
      <div class="receipt-code"><span>Codigo</span><strong>${e(voucher.code)}</strong></div>
      <p class="receipt-validity">Valido ate <strong>${e(brDate(voucher.expires_at))}</strong></p>
      <div class="receipt-contact"><strong>WhatsApp (44) 98413-4971</strong><span>Av. Minas Gerais, 2263</span></div>
      <p class="receipt-instruction">* Para usar, informe o codigo a um atendente.</p>
      <small>Emitido por ${e(voucher.attendant_name || 'Wimifarma')} em ${e(brDate(voucher.issued_at, true))}</small>
    </article>
    <div class="quick-voucher-result-actions no-print">
      ${active ? `<button type="button" class="btn primary" data-print-quick-voucher data-voucher-id="${e(voucher.id)}">Imprimir na Bematech</button>` : ''}
      <a class="btn" href="${pageUrl('dashboard.php#busca')}">Gerar outro</a>
    </div>
  </div>`;
}

async function renderDashboard(req: Request): Promise<string> {
  const settings = await loadSettings();
  const search = cleanText(req.query.q, 180);
  const selectedClientId = search ? 0 : num(req.query.cliente_id);
  const initialClientResultCount = 5;
  const searchResults = await queryClients(search, 20, { activeOnly: true });
  const loggedAttendantId = await loggedUserAttendantId(req);
  const attendants = await attendantOptions();
  const requestedVoucherId = num(req.query.voucher_id);
  const printedVoucher = (req.session.quickVoucherReceiptIds || []).includes(requestedVoucherId)
    ? await quickVoucherReceipt(requestedVoucherId)
    : null;
  const quickRequestToken = crypto.randomUUID();
  const selected = selectedClientId > 0 ? await loadClientBundle(selectedClientId) : null;
  const xpReward = await currentUserXpRewardStatus(req);
  const visibleClientResultCount = Math.min(initialClientResultCount, searchResults.length);
  const expiryBreakdowns = await expiryBreakdownForClients([
    ...searchResults.map((client: DbRow) => num(client.id)),
    selectedClientId,
  ]);
  const resultSummary = search
    ? `${searchResults.length} resultado(s) para "${search}"`
    : `${visibleClientResultCount} de ${searchResults.length} cliente(s) recentes`;

  const searchCards = await Promise.all(
    searchResults.map(async (client: DbRow, index: number) => {
      const clientId = num(client.id);
      const balance = await balanceForClient(num(client.id));
      const expirySlices = expiryBreakdowns.get(clientId) || [];
      const isSelected = selectedClientId === clientId;
      const isExtra = index >= initialClientResultCount && !isSelected;
      const changedAt = client.changed_at || client.updated_at || client.created_at;
      return `<article class="client-result ${isSelected ? 'is-selected' : ''}" data-client-result-item${isExtra ? ' hidden' : ''}>
        <div class="client-result-main">
          <div class="client-result-title">
            <strong>${e(client.name)}</strong>
            <span class="client-status-pill">${e(client.status || 'ativo')}</span>
          </div>
          <div class="client-result-details">
            <span><small>ID</small><strong>#${e(client.id)}</strong></span>
            <span><small>Telefone</small><strong>${e(formatPhone(client.phone))}</strong></span>
            <span><small>Atendente</small><strong>${e(client.attendant_name || 'Sem atendente')}</strong></span>
            <span><small>Atualizado</small><strong>${e(brDate(changedAt, true))}</strong></span>
          </div>
        </div>
        <div class="result-balance"><span>Disponivel</span><strong>${brMoneyCents(balance.saldoDisponivel)}</strong>${renderExpiryBreakdown(expirySlices, {
          compact: true,
          maxItems: 2,
          emptyText: balance.saldoDisponivel > 0 ? 'Sem vencimento ativo encontrado.' : 'Sem saldo ativo.',
        })}</div>
        <div class="result-actions">
          <a class="btn primary" href="${pageUrl(`dashboard.php?cliente_id=${clientId}#cliente-atual`)}">Selecionar</a>
          <a class="btn" href="${pageUrl(`dashboard.php?cliente_id=${clientId}#resgate`)}">Gastar/Usar Cashback</a>
          <a class="btn" href="${pageUrl(`cliente-detalhe.php?id=${clientId}`)}">Historico completo</a>
        </div>
      </article>`;
    }),
  );

  const selectedExpiry = selectedClientId > 0 ? expiryBreakdowns.get(selectedClientId) || [] : [];
  const selectedHtml =
    selected && selected.client && selected.balance
      ? `<div class="selected-client-strip">
          <span>#${e(selected.client.id)}</span><span>${e(formatPhone(selected.client.phone))}</span>
          <span>Atendente: ${e(selected.client.attendant_name || '-')}</span><span>Status: ${e(selected.client.status)}</span>
        </div>
        <div class="metrics compact">
          <article class="metric highlight"><span>Saldo disponivel</span><strong>${brMoneyCents(selected.balance.saldoDisponivel)}</strong></article>
          <article class="metric"><span>Expirando</span><strong>${brMoneyCents(selected.balance.saldoExpirando)}</strong></article>
          <article class="metric"><span>Usado</span><strong>${brMoneyCents(selected.balance.saldoUsado)}</strong></article>
          <article class="metric"><span>Total gerado</span><strong>${brMoneyCents(selected.balance.totalGerado)}</strong></article>
          <article class="metric"><span>Proximo vencimento</span><strong>${e(brDate(selected.balance.proximoVencimento))}</strong></article>
        </div>
        ${renderExpiryBreakdown(selectedExpiry, {
          title: 'Validade do saldo ativo',
          emptyText: selected.balance.saldoDisponivel > 0 ? 'Saldo ativo sem vencimento agrupado encontrado.' : 'Cliente sem saldo ativo agora.',
        })}
        <div class="quick-actions">
          <a class="btn primary" href="#resgate" data-section-link="resgate">Gastar/Usar Cashback</a>
          <a class="btn" href="${pageUrl(`clientes.php?edit=${num(selected.client.id)}`)}">Editar dados</a>
        </div>
        <div class="client-history-grid">
          ${historyPanel('Ultimas compras', selected.purchases, (purchase) => {
            const row = purchase as DbRow;
            const generatedLabel = purchaseCashbackKind(row) === 'Codigo rapido' ? 'Proximo codigo' : 'Gerado';
            return `<article><strong>${e(brDate(row.purchased_at, true))}</strong><span>Compra: ${brMoneyCents(row.gross_cents)} | Pago: ${brMoneyCents(row.charged_cents)}</span><span>Cashback usado: ${brMoneyCents(row.cashback_discount_cents)} | ${generatedLabel}: ${brMoneyCents(row.cashback_generated_cents)}</span></article>`;
          })}
          ${historyPanel('Resgates recentes', selected.redemptions, (redemption) => {
            const row = redemption as DbRow;
            return `<article><strong>${e(brDate(row.redeemed_at, true))}</strong><span>Compra: ${brMoneyCents(row.purchase_cents)} | Usado: ${brMoneyCents(row.redeemed_cents)}</span><span>Atendente: ${e(row.attendant_name || '-')}</span></article>`;
          })}
        </div>`
      : '<p>Busque um cliente acima ou cadastre um novo para liberar a operacao de Compra Cashback.</p>';

  const selectedLabel =
    selected && selected.client
      ? `${selected.client.name} - ${formatPhone(selected.client.phone)}`
      : '';
  const selectedBalance = selected?.balance?.saldoDisponivel || 0;
  const quickAttendantOptions = attendants
    .map((attendant: DbRow) => {
      const id = num(attendant.id);
      return `<option value="${e(id)}" ${loggedAttendantId === id ? 'selected' : ''}>${e(attendant.name)}</option>`;
    })
    .join('');
  const quickCashbackPanel = `<div id="cashback-rapido" class="quick-cashback-shell">
    <div class="quick-cashback-heading">
      <div><span class="kicker">Sem cadastro agora</span><h2>Cashback rapido</h2><p>Informe somente o valor gasto. O codigo de 4 digitos vale por 1 ano.</p></div>
      <span class="quick-cashback-rate">${e(settings.cashbackPercent)}% automatico</span>
    </div>
    ${renderQuickVoucherReceipt(printedVoucher)}
    <form method="post" action="${pageUrl('dashboard.php#busca')}" class="quick-cashback-form" data-no-enter-submit data-quick-cashback-form data-default-percent="${e(settings.cashbackPercent)}">
      ${csrfField(req)}
      <input type="hidden" name="action" value="create_quick_cashback">
      <input type="hidden" name="request_token" value="${e(quickRequestToken)}">
      <label class="quick-cashback-amount"><span>Quanto o cliente gastou? *</span><input type="text" name="valor_compra_rapida" data-money inputmode="decimal" required placeholder="100,00" autofocus></label>
      <label><span>Usuario que imprime *</span><select name="atendente_id" required><option value="">Selecione</option>${quickAttendantOptions}</select></label>
      <div class="quick-cashback-preview" aria-live="polite"><span>Cashback previsto</span><strong class="js-quick-cashback-value">R$ 0,00</strong><small>Codigo unico por 1 ano</small></div>
      <button type="submit" class="btn primary quick-cashback-submit">Gerar codigo</button>
    </form>
  </div>`;

  const body = `<section class="balcao-grid">
  <div class="balcao-main">
    <section id="busca" class="panel section-block workspace-section">
      ${quickCashbackPanel}
      <div class="section-title"><div><span class="kicker">Consulta rapida</span><h2>Buscar cliente por nome, telefone ou ID</h2></div></div>
      <form method="get" action="${pageUrl('dashboard.php#busca')}" class="search-row live-search-wrap">
        ${selectedClientId > 0 ? `<input type="hidden" name="cliente_id" value="${e(selectedClientId)}">` : ''}
        <input type="search" name="q" value="${e(search)}" placeholder="Digite nome, telefone ou ID interno" data-live-client-search data-results="#live-client-results" autocomplete="off">
        <button type="submit" class="btn primary">Buscar</button>
        <a class="btn" href="${pageUrl(`dashboard.php${selectedClientId > 0 ? `?cliente_id=${selectedClientId}` : ''}#busca`)}">Limpar</a>
        <div id="live-client-results" class="live-client-results" hidden></div>
      </form>
      <div class="client-results-shell" data-client-results-list data-visible-step="${e(initialClientResultCount)}">
        <div class="client-results-head">
          <div>
            <span class="kicker">${search ? 'Resultado da busca' : 'Clientes alterados'}</span>
            <h3>${search ? 'Clientes encontrados' : 'Ultimos clientes alterados'}</h3>
          </div>
          <span class="soft-pill" data-client-results-count>${e(resultSummary)}</span>
        </div>
        <div class="client-results">${searchCards.join('') || '<p class="muted">Nenhum cliente encontrado. Use o cadastro rapido abaixo.</p>'}</div>
        ${
          searchResults.length > visibleClientResultCount
            ? `<div class="client-show-more-wrap"><button class="btn client-show-more" type="button" data-show-more-clients>Mostrar mais</button></div>`
            : ''
        }
      </div>
    </section>

    <section id="cliente-atual" class="panel section-block workspace-section">
      <div class="section-title">
        <div><span class="kicker">Cliente selecionado</span><h2>${selected?.client ? e(selected.client.name) : 'Nenhum cliente selecionado'}</h2></div>
        ${selected?.client ? `<a class="btn" href="${pageUrl(`cliente-detalhe.php?id=${num(selected.client.id)}`)}">Abrir historico completo</a>` : ''}
      </div>
      ${selectedHtml}
    </section>

    <section id="resgate" class="panel section-block workspace-section redeem-panel">
      <div class="section-title redeem-title"><div class="redeem-title-copy"><span class="kicker">Compra Cashback</span><h2>Gastar/Usar Cashback</h2><p>Registre a compra, aplique saldo permitido e gere novo cashback em uma unica operacao.</p></div><span class="soft-pill">Regra ${e(settings.redeemMultiplier)}x automatica</span></div>
      <form method="post" action="${pageUrl('dashboard.php#resgate')}" class="form-grid two-cols redeem-form" data-no-enter-submit data-redeem-form data-multiplier="${e(settings.redeemMultiplier)}" data-default-percent="${e(settings.cashbackPercent)}" data-available-balance="${e(centsToMoney(selectedBalance))}">
        ${csrfField(req)}
        <input type="hidden" name="action" value="save_redeem">
        <div class="redeem-block redeem-client-block full">
          <div class="redeem-block-title"><span class="step-badge">1</span><div><h3>Cliente</h3><small>Saldo e identificacao</small></div></div>
          <div class="client-picker redeem-client-picker" data-client-picker-root>
            <label><span>Buscar cliente *</span><input type="search" value="${e(selectedLabel)}" placeholder="Digite nome, telefone ou ID do cliente" data-client-picker data-results="#redeem-client-results" data-target="#redeem-client-id" data-selected="#redeem-selected-client" autocomplete="off" required><input type="hidden" id="redeem-client-id" name="cliente_id" value="${e(selectedClientId > 0 ? selectedClientId : '')}"></label>
            <div id="redeem-client-results" class="live-client-results picker-results" hidden></div>
            <div id="redeem-selected-client" class="selected-client-note" data-balance="${e(centsToMoney(selectedBalance))}">${selected?.client ? `Selecionado: ${e(selected.client.name)} | Saldo disponivel ${brMoneyCents(selectedBalance)}` : 'Nenhum cliente selecionado.'}</div>
          </div>
        </div>
        <div class="redeem-block redeem-operation-block full">
          <div class="redeem-block-title"><span class="step-badge">2</span><div><h3>Compra atual</h3><small>Uso permitido pela regra ${e(settings.redeemMultiplier)}x</small></div><span class="optional-chip">Calculo automatico</span></div>
          <div class="redeem-xp-note ${xpReward.available ? 'ok' : 'warn'}"><strong>${xpReward.available ? '+500 XP ativo' : 'XP'}</strong><span>${e(xpReward.message)}</span></div>
          <div class="redeem-fields">
            ${attendantSelect(attendants, 'Atendente', loggedAttendantId, true)}
            <label class="quick-code-field"><span>Codigo cashback rapido</span><input type="text" name="codigo_cashback" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" autocomplete="off" data-quick-voucher-code><small data-quick-voucher-status>Opcional</small></label>
            <label><span>Valor da compra atual *</span><input type="text" name="valor_compra" data-money required placeholder="40,00"></label>
            <label><span>Cashback aplicado automaticamente</span><input type="text" name="valor_resgate" data-money readonly required placeholder="0,00"></label>
            <label class="manual-cashback-field"><span>Cashback Manual</span><input type="text" name="cashback_manual" data-money placeholder="0,00"><small>Preenchido, zera o novo cashback automatico.</small></label>
          </div>
          <div class="charge-summary redeem-summary"><div><span>Cashback aplicado</span><strong class="js-redeem-auto">R$ 0,00</strong></div><div><span>Valor a cobrar</span><strong class="js-amount-charged">R$ 0,00</strong></div><div><span>Novo cashback automatico</span><strong class="js-new-cashback">R$ 0,00</strong></div><div><span>Novo cashback manual</span><strong class="js-manual-cashback">R$ 0,00</strong></div></div>
          <div class="live-preview js-redeem-preview">Busque o cliente e informe a compra. O sistema calcula sozinho se usa cashback, quanto cobrar e quanto gerar novamente.</div>
        </div>
        <div class="redeem-action full"><button type="submit" class="btn primary">Gastar/Usar Cashback</button></div>
      </form>
    </section>

    <section id="cadastro" class="panel section-block workspace-section quick-client-panel">
      <div class="section-title quick-client-title"><div class="quick-client-title-copy"><span class="kicker">Cadastro rapido</span><h2>Novo cliente</h2></div><span class="soft-pill">Compra inicial opcional</span></div>
      <form method="post" action="${pageUrl('dashboard.php#cadastro')}" class="form-grid two-cols quick-client-form" data-no-enter-submit data-initial-purchase-form data-default-percent="${e(settings.cashbackPercent)}" data-multiplier="${e(settings.redeemMultiplier)}">
        ${csrfField(req)}
        <input type="hidden" name="action" value="save_client">
        <div class="quick-client-block quick-client-identity full">
          <div class="quick-client-block-title"><span class="step-badge">1</span><div><h3>Dados do cliente</h3><small>Identificacao e contato</small></div></div>
          <div class="quick-client-fields">
            <label><span>Nome *</span><input type="text" name="nome" required placeholder="Nome do cliente"></label>
            <label><span>Telefone</span><input type="text" name="telefone" inputmode="numeric" placeholder="11999999999"></label>
            <label><span>Data de nascimento</span><input type="date" name="nascimento"></label>
            ${attendantSelect(attendants, 'Atendente responsavel', loggedAttendantId, true)}
          </div>
        </div>
        <div class="quick-client-block quick-client-purchase full">
          <div class="quick-client-block-title"><span class="step-badge">2</span><div><h3>Compra inicial</h3><small>Venda do momento, se houver</small></div><span class="optional-chip">Opcional</span></div>
          <div class="quick-client-fields">
            <label class="quick-code-field"><span>Codigo cashback rapido</span><input type="text" name="codigo_cashback" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" autocomplete="off" data-quick-voucher-code><small data-quick-voucher-status>Opcional</small></label>
            <label><span>Valor que o cliente vai gastar agora</span><input type="text" name="valor_compra_inicial" data-money placeholder="100,00"></label>
            <label><span>% Cashback</span><input type="text" name="percentual_cashback_inicial" value="${e(settings.cashbackPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}"></label>
          </div>
          <div class="charge-summary quick-client-summary compact-summary"><div><span>Valor a cobrar</span><strong class="js-initial-charge">R$ 0,00</strong></div><div><span>Cashback gerado</span><strong class="js-initial-cashback">R$ 0,00</strong></div><div><span>Validade</span><strong>${e(settings.validityDays)} dias</strong></div></div>
          <div class="live-preview js-initial-preview">Se o cliente ja estiver comprando, informe o valor para cadastrar e registrar tudo em uma vez.</div>
        </div>
        <div class="quick-client-action full"><button type="submit" class="btn primary">Cadastrar cliente</button></div>
      </form>
    </section>
  </div>
  <aside class="balcao-side"><section class="panel sticky-panel"><span class="kicker">Resumo do cliente</span>${selected?.client && selected.balance ? `<h2>${e(selected.client.name)}</h2><div class="balance-box"><span>Saldo disponivel</span><strong>${brMoneyCents(selected.balance.saldoDisponivel)}</strong><small>Expirando: ${brMoneyCents(selected.balance.saldoExpirando)}</small>${renderExpiryBreakdown(selectedExpiry, {
    compact: true,
    maxItems: 3,
    emptyText: selected.balance.saldoDisponivel > 0 ? 'Sem vencimento ativo encontrado.' : 'Sem saldo ativo.',
  })}</div><a class="btn primary" href="#resgate" data-section-link="resgate">Gastar/Usar Cashback</a>` : '<h2>Selecione um cliente</h2><p>Use a busca para puxar saldo, compras, vencimentos e abrir a Compra Cashback.</p>'}</section></aside>
</section>`;
  return htmlShell(req, 'Balcao', body);
}

function historyPanel(title: string, rows: DbRow[], renderer: (row: DbRow) => string): string {
  return `<section class="history-panel"><div class="mini-heading"><span class="kicker">Historico</span><h3>${e(title)}</h3></div>${
    rows.length ? `<div class="history-list">${rows.map(renderer).join('')}</div>` : '<p class="muted">Nenhum registro encontrado.</p>'
  }</section>`;
}

function attendantSelect(attendants: DbRow[], label = 'Atendente', selectedId: number | null = null, locked = false): string {
  const selected = selectedId && selectedId > 0 ? selectedId : null;
  const options = `<option value="" ${selected ? '' : 'selected'}>Sem atendente</option>${attendants
    .map((attendant: DbRow) => {
      const id = num(attendant.id);
      return `<option value="${e(id)}" ${selected === id ? 'selected' : ''}>${e(attendant.name)}</option>`;
    })
    .join('')}`;
  const selectName = locked ? 'atendente_id_display' : 'atendente_id';
  const hidden = locked ? `<input type="hidden" name="atendente_id" value="${e(selected || '')}">` : '';
  return `<label><span>${e(label)}</span><select name="${selectName}"${locked ? ' disabled aria-readonly="true"' : ''}>${options}</select>${hidden}</label>`;
}

async function queryClients(search: string, limit: number, options: { activeOnly?: boolean } = {}): Promise<DbRow[]> {
  const params: unknown[] = [];
  const whereParts: string[] = [];
  if (options.activeOnly) whereParts.push("c.status = 'ativo'");
  const searchCondition = appendClientSearchCondition(params, search);
  if (searchCondition) whereParts.push(searchCondition);
  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  params.push(limit);
  const result = await pgPool.query(
    `SELECT c.*, a.name AS attendant_name, COALESCE(c.updated_at, c.created_at) AS changed_at
     FROM cashback_clients c
     LEFT JOIN cashback_attendants a ON a.id = c.attendant_id
     ${where}
     ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.id DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows as DbRow[];
}

async function loadClientBundle(clientId: number): Promise<{
  client: DbRow | null;
  balance: Balance | null;
  purchases: DbRow[];
  redemptions: DbRow[];
  credits: DbRow[];
}> {
  const clientResult = await pgPool.query(
    `SELECT c.*, a.name AS attendant_name
     FROM cashback_clients c
     LEFT JOIN cashback_attendants a ON a.id = c.attendant_id
     WHERE c.id = $1
     LIMIT 1`,
    [clientId],
  );
  const client = (clientResult.rows[0] as DbRow | undefined) || null;
  if (!client) return { client: null, balance: null, purchases: [], redemptions: [], credits: [] };
  const [balance, purchases, redemptions, credits] = await Promise.all([
    balanceForClient(clientId),
    pgPool.query(
      `SELECT p.*, a.name AS attendant_name
       FROM cashback_purchases p
       LEFT JOIN cashback_attendants a ON a.id = p.attendant_id
       WHERE p.client_id = $1
       ORDER BY p.purchased_at DESC
       LIMIT 8`,
      [clientId],
    ),
    pgPool.query(
      `SELECT r.*, a.name AS attendant_name
       FROM cashback_redemptions r
       LEFT JOIN cashback_attendants a ON a.id = r.attendant_id
       WHERE r.client_id = $1
       ORDER BY r.redeemed_at DESC
       LIMIT 8`,
      [clientId],
    ),
    pgPool.query('SELECT * FROM cashback_credits WHERE client_id = $1 ORDER BY canceled_at NULLS FIRST, expires_at ASC, id DESC LIMIT 80', [clientId]),
  ]);
  return {
    client,
    balance,
    purchases: purchases.rows as DbRow[],
    redemptions: redemptions.rows as DbRow[],
    credits: credits.rows as DbRow[],
  };
}

async function clientSearchPayload(value: unknown): Promise<unknown[]> {
  const term = cleanText(value, 180);
  const digits = digitsOnly(term);
  if (!term || (term.length < 2 && !digits)) return [];
  const params: unknown[] = [];
  const searchCondition = appendClientSearchCondition(params, term);
  if (!searchCondition) return [];
  params.push(`${term}%`);
  const rows = await pgPool.query(
    `SELECT c.id, c.name, c.phone, c.birth_date, c.status, a.name AS attendant_name,
            (SELECT MAX(p.purchased_at) FROM cashback_purchases p WHERE p.client_id = c.id) AS last_purchase_at,
            (SELECT p.charged_cents FROM cashback_purchases p WHERE p.client_id = c.id ORDER BY p.purchased_at DESC LIMIT 1) AS last_purchase_cents
     FROM cashback_clients c
     LEFT JOIN cashback_attendants a ON a.id = c.attendant_id
     WHERE c.status = 'ativo'
       AND ${searchCondition}
     ORDER BY CASE WHEN c.name ILIKE $${params.length} THEN 0 ELSE 1 END, c.name ASC
     LIMIT 8`,
    params,
  );
  const expiryBreakdowns = await expiryBreakdownForClients((rows.rows as DbRow[]).map((row) => num(row.id)));
  const payload = [];
  for (const row of rows.rows as DbRow[]) {
    const balance = await balanceForClient(num(row.id));
    const expirySlices = expiryBreakdowns.get(num(row.id)) || [];
    payload.push({
      id: num(row.id),
      nome: row.name,
      telefone: formatPhone(row.phone),
      telefone_raw: digitsOnly(row.phone),
      atendente: row.attendant_name || 'Sem atendente',
      saldo_disponivel: brMoneyCents(balance.saldoDisponivel),
      saldo_disponivel_raw: centsToMoney(balance.saldoDisponivel),
      saldo_expirando: brMoneyCents(balance.saldoExpirando),
      saldo_expirando_raw: centsToMoney(balance.saldoExpirando),
      proximo_vencimento: balance.proximoVencimento ? brDate(balance.proximoVencimento) : '-',
      validade_resumo: expiryBreakdownSummary(expirySlices, 2),
      ultima_compra: row.last_purchase_at ? brDate(row.last_purchase_at, true) : 'Sem compra',
      ultima_compra_valor: row.last_purchase_cents !== null ? brMoneyCents(row.last_purchase_cents) : '-',
      selecionar_url: pageUrl(`dashboard.php?cliente_id=${num(row.id)}#cliente-atual`),
      compra_url: pageUrl(`dashboard.php?cliente_id=${num(row.id)}#resgate`),
      resgate_url: pageUrl(`dashboard.php?cliente_id=${num(row.id)}#resgate`),
    });
  }
  return payload;
}

async function renderClients(req: Request): Promise<string> {
  const editId = num(req.query.edit);
  const search = cleanText(req.query.q, 180);
  const attendants = await attendantOptions();
  const editing =
    editId > 0
      ? ((await pgPool.query('SELECT * FROM cashback_clients WHERE id = $1 LIMIT 1', [editId])).rows[0] as DbRow | undefined)
      : undefined;
  const client = editing || { id: 0, name: '', phone: '', birth_date: '', notes: '', status: 'ativo', attendant_id: '' };
  const clients = await queryClients(search, 300);
  const rows = await Promise.all(
    clients.map(async (item: DbRow) => {
      const balance = await balanceForClient(num(item.id));
      return `<tr><td>#${e(item.id)}</td><td><strong>${e(item.name)}</strong></td><td>${e(formatPhone(item.phone))}</td><td>${e(item.attendant_name || '-')}</td><td><span class="badge ${e(item.status)}">${e(item.status)}</span></td><td>${brMoneyCents(balance.saldoDisponivel)}</td><td class="table-actions"><a href="${pageUrl(`cliente-detalhe.php?id=${num(item.id)}`)}">Historico</a><a href="${pageUrl(`clientes.php?edit=${num(item.id)}`)}">Editar</a><form method="post" data-confirm-submit="Excluir ou inativar este cliente?">${csrfField(req)}<input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${e(item.id)}"><button type="submit" class="link-danger">Excluir</button></form></td></tr>`;
    }),
  );
  const body = `<section class="grid two">
  <div class="panel"><h2>${editId ? 'Editar cliente' : 'Cadastrar cliente'}</h2>
    <form method="post" class="form-grid" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="save"><input type="hidden" name="id" value="${e(client.id)}">
      <label><span>Nome *</span><input type="text" name="nome" required value="${e(client.name)}"></label>
      <label><span>Telefone</span><input type="text" name="telefone" inputmode="numeric" placeholder="11999999999" value="${e(client.phone)}"></label>
      <label><span>Data de nascimento</span><input type="date" name="nascimento" value="${e(isoDate(client.birth_date))}"></label>
      <label><span>Atendente responsavel</span><select name="atendente_id"><option value="">Sem atendente</option>${attendants
        .map(
          (attendant: DbRow) =>
            `<option value="${e(attendant.id)}" ${num(client.attendant_id) === num(attendant.id) ? 'selected' : ''}>${e(attendant.name)}</option>`,
        )
        .join('')}</select></label>
      <label><span>Status</span><select name="status"><option value="ativo" ${client.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${client.status === 'inativo' ? 'selected' : ''}>Inativo</option></select></label>
      <label class="full"><span>Observacoes</span><textarea name="observacoes" rows="4">${e(client.notes)}</textarea></label>
      <div class="actions"><button type="submit" class="btn primary">${editId ? 'Salvar alteracoes' : 'Cadastrar cliente'}</button>${editId ? `<a class="btn" href="${pageUrl('clientes.php')}">Cancelar edicao</a>` : ''}</div>
    </form>
  </div>
  <div class="panel"><h2>Busca rapida</h2><form method="get" class="form-grid"><label><span>Nome, telefone ou ID</span><input type="search" name="q" value="${e(search)}" placeholder="Digite para localizar"></label><button type="submit" class="btn primary">Buscar cliente</button><a class="btn" href="${pageUrl('clientes.php')}">Limpar busca</a></form></div>
</section>
<section class="panel"><h2>Clientes cadastrados</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Cliente</th><th>Telefone</th><th>Atendente</th><th>Status</th><th>Saldo</th><th>Acoes</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="7">Nenhum cliente encontrado.</td></tr>'}</tbody></table></div></section>`;
  return htmlShell(req, 'Clientes', body);
}

async function handleClientsPost(req: Request, res: Response): Promise<void> {
  const action = String(req.body?.action || '');
  if (action === 'save') {
    const id = num(req.body?.id);
    const name = cleanText(req.body?.nome, 180);
    const phone = digitsOnly(req.body?.telefone) || null;
    const birthDate = cleanText(req.body?.nascimento, 10);
    const notes = cleanText(req.body?.observacoes, 5000);
    const status = String(req.body?.status) === 'inativo' ? 'inativo' : 'ativo';
    if (!name) {
      setFlash(req, 'error', 'Informe o nome do cliente.');
      res.redirect(`${BASE_PATH}/clientes.php`);
      return;
    }
    try {
      const attendantId = await normalizeAttendantId(intOrNull(req.body?.atendente_id));
      let clientId = id;
      if (id > 0) {
        await pgPool.query(
          `UPDATE cashback_clients SET name = $1, phone = $2, birth_date = $3::date, notes = $4, status = $5, attendant_id = $6, updated_at = NOW() WHERE id = $7`,
          [name, phone, birthDate || null, notes || null, status, attendantId, id],
        );
        setFlash(req, 'success', 'Cliente atualizado com sucesso.');
        await logAction(req, 'cliente_atualizado', 'cliente', id, `Cliente atualizado: ${name}`);
      } else {
        const inserted = await pgPool.query(
          `INSERT INTO cashback_clients (name, phone, birth_date, notes, status, attendant_id)
           VALUES ($1, $2, $3::date, $4, $5, $6)
           RETURNING id`,
          [name, phone, birthDate || null, notes || null, status, attendantId],
        );
        clientId = num(inserted.rows[0]?.id);
        await pgPool.query('UPDATE cashback_clients SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [clientId]);
        setFlash(req, 'success', 'Cliente cadastrado com sucesso.');
        await logAction(req, 'cliente_criado', 'cliente', clientId, `Cliente criado: ${name}`);
      }
      res.redirect(`${BASE_PATH}/cliente-detalhe.php?id=${clientId}`);
    } catch (error) {
      setFlash(req, 'error', errorMessage(error));
      res.redirect(`${BASE_PATH}/clientes.php`);
    }
    return;
  }
  if (action === 'delete') {
    const id = num(req.body?.id);
    const history = await pgPool.query(
      `SELECT
        (SELECT COUNT(*) FROM cashback_purchases WHERE client_id = $1) +
        (SELECT COUNT(*) FROM cashback_redemptions WHERE client_id = $1) +
        (SELECT COUNT(*) FROM cashback_credits WHERE client_id = $1) AS total`,
      [id],
    );
    if (num(history.rows[0]?.total) > 0) {
      await pgPool.query("UPDATE cashback_clients SET status = 'inativo', updated_at = NOW() WHERE id = $1", [id]);
      await logAction(req, 'cliente_inativado', 'cliente', id, 'Cliente inativado por possuir historico.');
      setFlash(req, 'success', 'Cliente possui historico e foi inativado para preservar os dados.');
    } else {
      await pgPool.query('DELETE FROM cashback_clients WHERE id = $1', [id]);
      await logAction(req, 'cliente_excluido', 'cliente', id, 'Cliente excluido sem historico.');
      setFlash(req, 'success', 'Cliente excluido.');
    }
    res.redirect(`${BASE_PATH}/clientes.php`);
    return;
  }
  setFlash(req, 'error', 'Acao invalida.');
  res.redirect(`${BASE_PATH}/clientes.php`);
}

async function handleClientDetailPost(req: Request, res: Response): Promise<void> {
  const action = String(req.body?.action || '');
  if (action === 'cancel_credit') {
    await cancelGeneratedCredit(req, res);
    return;
  }
  setFlash(req, 'error', 'Acao invalida.');
  res.redirect(`${BASE_PATH}/cliente-detalhe.php?id=${num(req.body?.client_id) || ''}`);
}

async function cancelGeneratedCredit(req: Request, res: Response): Promise<void> {
  const clientId = num(req.body?.client_id);
  const creditId = num(req.body?.credit_id);
  const reason = cleanText(req.body?.motivo || 'Devolucao/cancelamento operacional.', 500);
  if (clientId <= 0 || creditId <= 0) {
    setFlash(req, 'error', 'Credito invalido para cancelamento.');
    res.redirect(`${BASE_PATH}/clientes.php`);
    return;
  }
  const db = await pgPool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(
      `SELECT cr.*, p.cashback_generated_cents
         FROM cashback_credits cr
         INNER JOIN cashback_purchases p ON p.id = cr.purchase_id
        WHERE cr.id = $1
          AND cr.client_id = $2
        FOR UPDATE`,
      [creditId, clientId],
    );
    const credit = result.rows[0] as DbRow | undefined;
    if (!credit) {
      throw new Error('Credito nao encontrado para este cliente.');
    }
    if (credit.canceled_at) {
      throw new Error('Este cashback ja esta cancelado.');
    }
    const originalCents = num(credit.original_cents);
    const remainingCents = num(credit.remaining_cents);
    if (originalCents <= 0 || remainingCents <= 0 || remainingCents < originalCents) {
      throw new Error('Este cashback ja foi usado total ou parcialmente e nao pode ser excluido sem ajuste manual.');
    }
    await db.query(
      `UPDATE cashback_credits
          SET remaining_cents = 0,
              canceled_at = NOW(),
              canceled_by = $1,
              canceled_reason = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [req.session.user?.id ?? null, reason || null, creditId],
    );
    await db.query(
      `UPDATE cashback_purchases
          SET cashback_generated_cents = GREATEST(cashback_generated_cents - $1, 0),
              manual_cashback_cents = GREATEST(manual_cashback_cents - $1, 0)
        WHERE id = $2`,
      [originalCents, num(credit.purchase_id)],
    );
    await db.query(
      "UPDATE cashback_whatsapp_messages SET status = 'cancelada', updated_at = NOW() WHERE credit_id = $1 AND status = 'pendente'",
      [creditId],
    );
    await db.query('COMMIT');
    await logAction(req, 'cashback_credito_cancelado', 'credito', creditId, `Cashback gerado cancelado: ${brMoneyCents(originalCents)}. Motivo: ${reason || '-'}`);
    setFlash(req, 'success', `Cashback gerado excluido do saldo: ${brMoneyCents(originalCents)}.`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    setFlash(req, 'error', `Nao foi possivel excluir o cashback: ${errorMessage(error)}`);
  } finally {
    db.release();
  }
  res.redirect(`${BASE_PATH}/cliente-detalhe.php?id=${clientId}#creditos`);
}

async function renderClientDetail(req: Request, res: Response): Promise<string> {
  const id = num(req.query.id);
  const bundle = await loadClientBundle(id);
  if (!bundle.client || !bundle.balance) {
    setFlash(req, 'error', 'Cliente nao encontrado.');
    res.redirect(`${BASE_PATH}/clientes.php`);
    return '';
  }
  const rowsPurchases = bundle.purchases
    .map(
      (purchase: DbRow) =>
        `<tr><td>${e(brDate(purchase.purchased_at, true))}</td><td>${brMoneyCents(purchase.charged_cents)}</td><td><span class="cashback-source-pill ${purchaseCashbackCssClass(purchase)}">${e(purchaseCashbackPercentLabel(purchase))}</span></td><td>${brMoneyCents(purchase.cashback_generated_cents)}</td><td>${e(purchase.attendant_name || '-')}</td></tr>`,
    )
    .join('');
  const rowsRedemptions = bundle.redemptions
    .map(
      (redemption: DbRow) =>
        `<tr><td>${e(brDate(redemption.redeemed_at, true))}</td><td>${brMoneyCents(redemption.purchase_cents)}</td><td>${brMoneyCents(redemption.redeemed_cents)}</td><td>${e(redemption.attendant_name || '-')}</td></tr>`,
    )
    .join('');
  const creditCards = bundle.credits
    .map(
      (credit: DbRow) => {
        const canceled = Boolean(credit.canceled_at);
        const originalCents = num(credit.original_cents);
        const remainingCents = num(credit.remaining_cents);
        const status = canceled ? 'cancelado' : String(credit.status || 'ativo');
        const canCancel = !canceled && originalCents > 0 && remainingCents >= originalCents;
        const action = canCancel
          ? `<form method="post" action="${pageUrl('cliente-detalhe.php#creditos')}" data-confirm-submit="Excluir este cashback do saldo do cliente? Use apenas em devolucao/cancelamento.">${csrfField(req)}<input type="hidden" name="action" value="cancel_credit"><input type="hidden" name="client_id" value="${e(bundle.client?.id)}"><input type="hidden" name="credit_id" value="${e(credit.id)}"><input type="hidden" name="motivo" value="Devolucao/cancelamento de compra"><button type="submit" class="btn danger compact">Excluir cashback</button></form>`
          : `<span class="credit-action-note">${canceled ? 'Cancelado' : 'Nao excluivel'}</span>`;
        return `<article class="cashback-credit-card credit-${e(cssToken(status))}">
          <div class="credit-card-top"><strong>#${e(credit.id)}</strong><span class="badge ${e(cssToken(status))}">${e(status)}</span></div>
          <div class="credit-card-money"><span>Original</span><strong>${brMoneyCents(originalCents)}</strong><small>Restante: ${brMoneyCents(remainingCents)}</small></div>
          <div class="credit-card-date"><span>${e(brDate(credit.expires_at))}</span><strong>${e(expirationText(credit.expires_at, canceled))}</strong></div>
          <div class="credit-card-footer"><span>Compra #${e(credit.purchase_id)}</span>${action}</div>
          ${canceled && credit.canceled_reason ? `<p class="credit-cancel-reason">${e(credit.canceled_reason)}</p>` : ''}
        </article>`;
      },
    )
    .join('');
  const nextExpirationText = bundle.balance.proximoVencimento ? expirationText(bundle.balance.proximoVencimento) : 'Sem credito ativo';
  const body = `<section class="panel hero-client client-detail-hero"><div><span class="kicker">Cliente #${e(bundle.client.id)}</span><h2>${e(bundle.client.name)}</h2><p>${e(formatPhone(bundle.client.phone))} | Status ${e(bundle.client.status)} | Atendente ${e(bundle.client.attendant_name || '-')}</p></div><div class="actions"><a class="btn primary" href="${pageUrl(`dashboard.php?cliente_id=${id}#resgate`)}">Nova compra, Gastar/Usar CashBack</a><a class="btn" href="${pageUrl(`clientes.php?edit=${id}`)}">Editar cliente</a></div></section>
<section class="metrics client-detail-metrics"><article class="metric highlight"><span>Saldo disponivel</span><strong>${brMoneyCents(bundle.balance.saldoDisponivel)}</strong><small>Pronto para usar</small></article><article class="metric"><span>Expirando</span><strong>${brMoneyCents(bundle.balance.saldoExpirando)}</strong><small>${e(nextExpirationText)}</small></article><article class="metric"><span>Saldo usado</span><strong>${brMoneyCents(bundle.balance.saldoUsado)}</strong><small>Historico preservado</small></article><article class="metric"><span>Saldo expirado</span><strong>${brMoneyCents(bundle.balance.saldoExpirado)}</strong><small>Fora do saldo</small></article><article class="metric"><span>Total gerado</span><strong>${brMoneyCents(bundle.balance.totalGerado)}</strong><small>Sem cancelados</small></article><article class="metric"><span>Proximo vencimento</span><strong>${e(brDate(bundle.balance.proximoVencimento))}</strong><small>${e(nextExpirationText)}</small></article></section>
<section class="grid two client-ledger-grid"><div class="panel"><h2>Compras do cliente</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Valor pago</th><th>Tipo</th><th>Cashback</th><th>Atendente</th></tr></thead><tbody>${rowsPurchases || '<tr><td colspan="5">Nenhuma compra registrada.</td></tr>'}</tbody></table></div></div><div class="panel"><h2>Resgates do cliente</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Compra</th><th>Usado</th><th>Atendente</th></tr></thead><tbody>${rowsRedemptions || '<tr><td colspan="4">Nenhum resgate registrado.</td></tr>'}</tbody></table></div></div></section>
<section id="creditos" class="panel cashback-credit-panel"><div class="section-title"><div><span class="kicker">Cashback gerado</span><h2>Creditos do cliente</h2></div><span class="soft-pill">${e(bundle.credits.length)} registro(s)</span></div><div class="cashback-credit-grid">${creditCards || '<p class="muted">Nenhum credito gerado.</p>'}</div></section>`;
  return htmlShell(req, `Historico de ${String(bundle.client.name)}`, body);
}

// Remaining screens intentionally reuse the same service methods as the dashboard.
async function renderPurchases(req: Request): Promise<string> {
  const settings = await loadSettings();
  const loggedAttendantId = await loggedUserAttendantId(req);
  const attendants = await attendantOptions();
  const clients = await clientOptions();
  const selectedClient = num(req.query.cliente_id);
  const recent = await pgPool.query(
    `SELECT p.*, c.name AS client_name, c.phone, a.name AS attendant_name
     FROM cashback_purchases p
     INNER JOIN cashback_clients c ON c.id = p.client_id
     LEFT JOIN cashback_attendants a ON a.id = p.attendant_id
     ORDER BY p.purchased_at DESC
     LIMIT 80`,
  );
  const rows = (recent.rows as DbRow[])
    .map(
      (purchase: DbRow) =>
        `<tr><td>${e(brDate(purchase.purchased_at, true))}</td><td>${e(purchase.client_name)}</td><td>${e(purchase.attendant_name || '-')}</td><td>${brMoneyCents(purchase.charged_cents)}</td><td><span class="cashback-source-pill ${purchaseCashbackCssClass(purchase)}">${e(purchaseCashbackPercentLabel(purchase))}</span></td><td>${brMoneyCents(purchase.cashback_generated_cents)}</td><td><a href="${pageUrl('mensagens.php#compras-hoje')}">Fila WhatsApp</a></td><td><a href="${pageUrl(`cliente-detalhe.php?id=${num(purchase.client_id)}`)}">Cliente</a></td></tr>`,
    )
    .join('');
  const body = `<section class="grid two"><div class="panel"><h2>Registrar nova compra</h2><form method="post" class="form-grid" data-no-enter-submit>${csrfField(req)}<label><span>Cliente *</span><select name="cliente_id" required><option value="">Selecione</option>${clients
    .map((client: DbRow) => `<option value="${e(client.id)}" ${selectedClient === num(client.id) ? 'selected' : ''}>${e(client.name)} - ${e(formatPhone(client.phone))}</option>`)
    .join('')}</select></label>${attendantSelect(attendants, 'Atendente', loggedAttendantId, true)}<label><span>Valor da compra *</span><input type="text" name="valor_total" data-money required placeholder="100,00"></label><label><span>% Cashback</span><input type="text" name="percentual_cashback" value="${e(settings.cashbackPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}"></label><label class="manual-cashback-field"><span>Cashback Manual</span><input type="text" name="cashback_manual" data-money placeholder="0,00"><small>Preenchido, zera o cashback automatico.</small></label><label class="full"><span>Observacoes</span><textarea name="observacoes" rows="4"></textarea></label><button type="submit" class="btn primary">Salvar compra e gerar cashback</button></form></div><div class="panel"><h2>Regra aplicada</h2><ul class="info-list"><li>Cashback padrao: <strong>${e(settings.cashbackPercent)}%</strong></li><li>Cashback Manual substitui o automatico quando preenchido.</li><li>Validade padrao: <strong>${e(settings.validityDays)} dias</strong></li><li>Persistencia: <strong>Postgres oficial</strong></li></ul><a class="btn" href="${pageUrl('clientes.php')}">Cadastrar cliente</a></div></section><section class="panel"><h2>Compras recentes</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Atendente</th><th>Compra</th><th>Tipo</th><th>Cashback</th><th>WhatsApp</th><th>Acoes</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Nenhuma compra registrada.</td></tr>'}</tbody></table></div></section>`;
  return htmlShell(req, 'Compras', body);
}

async function handleSimplePurchasePost(req: Request, res: Response): Promise<void> {
  req.body.action = 'save_purchase';
  await createPurchaseFromDashboard(req, res);
}

async function renderRedemptions(req: Request): Promise<string> {
  const settings = await loadSettings();
  const clients = await clientOptions();
  const loggedAttendantId = await loggedUserAttendantId(req);
  const attendants = await attendantOptions();
  const selectedClient = num(req.query.cliente_id);
  const selectedBalance = selectedClient > 0 ? await balanceForClient(selectedClient) : null;
  const recent = await pgPool.query(
    `SELECT r.*, c.name AS client_name, a.name AS attendant_name
     FROM cashback_redemptions r
     INNER JOIN cashback_clients c ON c.id = r.client_id
     LEFT JOIN cashback_attendants a ON a.id = r.attendant_id
     ORDER BY r.redeemed_at DESC
     LIMIT 80`,
  );
  const rows = (recent.rows as DbRow[])
    .map(
      (row: DbRow) =>
        `<tr><td>${e(brDate(row.redeemed_at, true))}</td><td>${e(row.client_name)}</td><td>${e(row.attendant_name || '-')}</td><td>${brMoneyCents(row.purchase_cents)}</td><td>${brMoneyCents(row.redeemed_cents)}</td><td><a href="${pageUrl(`cliente-detalhe.php?id=${num(row.client_id)}`)}">Ver cliente</a></td></tr>`,
    )
    .join('');
  const body = `<section class="grid two"><div class="panel"><h2>Usar cashback do cliente</h2><form method="get" class="form-grid"><label><span>Consultar saldo do cliente</span><select name="cliente_id" data-auto-submit><option value="">Selecione</option>${clients
    .map((client: DbRow) => `<option value="${e(client.id)}" ${selectedClient === num(client.id) ? 'selected' : ''}>${e(client.name)} - ${e(formatPhone(client.phone))}</option>`)
    .join('')}</select></label></form>${selectedBalance ? `<div class="balance-box"><span>Saldo disponivel</span><strong>${brMoneyCents(selectedBalance.saldoDisponivel)}</strong><small>Expirando: ${brMoneyCents(selectedBalance.saldoExpirando)} | Proximo vencimento: ${e(brDate(selectedBalance.proximoVencimento))}</small></div>` : ''}<form method="post" class="form-grid" data-no-enter-submit>${csrfField(req)}<label><span>Cliente *</span><select name="cliente_id" required><option value="">Selecione</option>${clients
    .map((client: DbRow) => `<option value="${e(client.id)}" ${selectedClient === num(client.id) ? 'selected' : ''}>${e(client.name)}</option>`)
    .join('')}</select></label>${attendantSelect(attendants, 'Atendente', loggedAttendantId, true)}<label><span>Valor da compra atual *</span><input type="text" name="valor_compra" data-money required placeholder="40,00"></label><label><span>Cashback a usar *</span><input type="text" name="valor_resgate" data-money required placeholder="10,00"></label><label class="full"><span>Observacoes</span><textarea name="observacoes" rows="4"></textarea></label><button type="submit" class="btn primary">Validar regra e registrar resgate</button></form></div><div class="panel"><h2>Regra de uso</h2><p>O cliente so pode usar cashback se a compra atual for no minimo <strong>${e(settings.redeemMultiplier)}x</strong> o valor resgatado.</p><ul class="info-list"><li>Usar R$ 10,00 exige compra minima de R$ 40,00.</li><li>O sistema consome primeiro os creditos que vencem antes.</li><li>O resgate e feito em transacao Postgres para proteger o saldo.</li></ul></div></section><section class="panel"><h2>Resgates recentes</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Atendente</th><th>Compra atual</th><th>Usado</th><th>Acoes</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhum resgate registrado.</td></tr>'}</tbody></table></div></section>`;
  return htmlShell(req, 'Resgates', body);
}

async function handleManualRedemptionPost(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const clientId = num(req.body?.cliente_id);
  const purchaseCents = moneyToCents(req.body?.valor_compra);
  const redeemedCents = moneyToCents(req.body?.valor_resgate);
  const notes = cleanText(req.body?.observacoes, 5000);
  if (clientId <= 0 || purchaseCents <= 0 || redeemedCents <= 0) {
    setFlash(req, 'error', 'Informe cliente, valor da compra atual e valor de cashback a usar.');
    res.redirect(`${BASE_PATH}/resgates.php`);
    return;
  }
  const balance = await balanceForClient(clientId);
  if (redeemedCents > balance.saldoDisponivel) {
    setFlash(req, 'error', `Saldo insuficiente. Disponivel: ${brMoneyCents(balance.saldoDisponivel)}.`);
    res.redirect(`${BASE_PATH}/resgates.php?cliente_id=${clientId}`);
    return;
  }
  if (purchaseCents < Math.round(redeemedCents * settings.redeemMultiplier)) {
    setFlash(req, 'error', `Uso bloqueado. Para usar ${brMoneyCents(redeemedCents)}, a compra precisa ser de no minimo ${brMoneyCents(Math.round(redeemedCents * settings.redeemMultiplier))}.`);
    res.redirect(`${BASE_PATH}/resgates.php?cliente_id=${clientId}`);
    return;
  }
  try {
    const attendantId = await requireLoggedAttendantId(req);
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const redemption = await client.query(
        `INSERT INTO cashback_redemptions (client_id, attendant_id, purchase_cents, redeemed_cents, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [clientId, attendantId, purchaseCents, redeemedCents, notes || null, req.session.user?.id ?? null],
      );
      const redemptionId = num(redemption.rows[0]?.id);
      await client.query('UPDATE cashback_redemptions SET legacy_mysql_id = COALESCE(legacy_mysql_id, id) WHERE id = $1', [redemptionId]);
      const credits = await client.query(
        `SELECT id, remaining_cents FROM cashback_credits WHERE client_id = $1 AND canceled_at IS NULL AND status = 'ativo' AND remaining_cents > 0 AND expires_at >= CURRENT_DATE ORDER BY expires_at ASC, id ASC FOR UPDATE`,
        [clientId],
      );
      await consumeCredits(client, credits.rows as DbRow[], redemptionId, redeemedCents);
      await client.query('COMMIT');
      await logAction(req, 'resgate_criado', 'resgate', redemptionId, `Resgate de ${brMoneyCents(redeemedCents)} registrado.`);
      const xpResult = await awardXpForCashbackRedemption(req, redemptionId, redeemedCents, clientId);
      setFlash(req, 'success', `Resgate registrado: ${brMoneyCents(redeemedCents)}. ${xpResult.message}`);
      res.redirect(`${BASE_PATH}/cliente-detalhe.php?id=${clientId}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    setFlash(req, 'error', `Erro ao registrar resgate: ${errorMessage(error)}`);
    res.redirect(`${BASE_PATH}/resgates.php?cliente_id=${clientId}`);
  }
}

async function renderMessages(req: Request): Promise<string> {
  await expirePastDueWhatsappMessages(req);
  const settings = await loadSettings();
  const today = todayIso();
  const tomorrow = dateDaysFromNow(1);
  const returnDays = Math.max(1, num(req.query.return_days || 30));
  const comprasHoje: DbRow[] = [];
  const comprasRows = await pgPool.query(
    `SELECT c.id, c.name, c.phone, COUNT(p.id)::int AS purchases, COALESCE(SUM(p.charged_cents), 0)::bigint AS charged,
            COALESCE(SUM(p.cashback_generated_cents), 0)::bigint AS cashback, MAX(p.purchased_at) AS last_purchase, MAX(cr.expires_at) AS validity
     FROM cashback_purchases p
     INNER JOIN cashback_clients c ON c.id = p.client_id
     LEFT JOIN cashback_credits cr ON cr.purchase_id = p.id AND cr.canceled_at IS NULL
     WHERE p.purchased_at >= $1::date AND p.purchased_at < $2::date
       AND (p.notes IS NULL OR p.notes NOT ILIKE 'Saldo importado sistema antigo CSV.%')
     GROUP BY c.id, c.name, c.phone
     ORDER BY last_purchase DESC`,
    [today, tomorrow],
  );
  for (const row of comprasRows.rows as DbRow[]) {
    const validity = isoDate(row.validity) || dateDaysFromNow(settings.validityDays);
    const message = `Oi ${row.name}, obrigado pela compra na Wimifarma! Voce recebeu ${brMoneyCents(row.cashback)} de cashback. Seu cashback vale ate ${brDate(validity)}.`;
    const saved = await saveWhatsappMessage({
      campaign: 'compra',
      dedupeKey: `compra_hoje:${num(row.id)}:${today}`,
      clientId: num(row.id),
      purchaseId: null,
      creditId: null,
      clientName: String(row.name || ''),
      phone: digitsOnly(row.phone) || null,
      message,
      dueDate: today,
      userId: req.session.user?.id ?? null,
    });
    if (saved.status === 'pendente') comprasHoje.push({ ...saved, subtitle: `${e(row.purchases)} compra(s) hoje | Cobrado ${brMoneyCents(row.charged)} | Cashback ${brMoneyCents(row.cashback)}` });
  }

  const retorno = await generateRecompraMessages(req, returnDays, today);
  const aniversarios = await generateBirthdayMessages(req, today);
  const expirando = await generateExpiringMessages(req);
  const all = await pgPool.query('SELECT * FROM cashback_whatsapp_messages ORDER BY created_at DESC, id DESC LIMIT 10');
  const historyRows =
    (all.rows as DbRow[])
      .map((row: DbRow) => `<tr><td>${e(brDate(row.created_at, true))}</td><td>${e(campaignLabel(row.campaign))}</td><td>${e(row.client_name)}<br><small>${e(formatPhone(row.phone))}</small></td><td><span class="badge">${e(statusLabel(row.status))}</span></td><td>${e(shortMessage(row.message))}</td></tr>`)
      .join('') || '<tr><td colspan="5">Nenhum WhatsApp salvo ainda.</td></tr>';

  const body = `<section class="metrics compact whatsapp-metrics"><article class="metric highlight whatsapp-metric"><span>Compraram hoje</span><strong data-whatsapp-metric-count="compras-hoje">${comprasHoje.length}</strong><small>Obrigado pela compra</small></article><article class="metric whatsapp-metric"><span>Recompra</span><strong data-whatsapp-metric-count="retorno">${retorno.length}</strong><small>Saldo ativo sem compra recente</small></article><article class="metric whatsapp-metric"><span>Aniversarios</span><strong data-whatsapp-metric-count="aniversarios">${aniversarios.length}</strong><small>Janela de ate 5 dias</small></article><article class="metric whatsapp-metric"><span>Expirando</span><strong data-whatsapp-metric-count="expiracao">${expirando.length}</strong><small>Ate ${e(settings.expirationAlertDays)} dias</small></article></section>
<nav class="anchor-bar whatsapp-tabs" aria-label="Atalhos de mensagens"><a class="btn primary" href="#compras-hoje">Compras de hoje</a><a class="btn" href="#retorno">Recompra</a><a class="btn" href="#aniversarios">Aniversarios</a><a class="btn" href="#expiracao">Expiracao</a><a class="btn" href="#todos-whats">Todos Whats</a></nav>
${messageSection('compras-hoje', 'Obrigado pela compra', 'Clientes que compraram hoje', comprasHoje)}
${messageSection('retorno', 'Retorno e recompra', 'Clientes com saldo e sem compra recente', retorno)}
${messageSection('aniversarios', 'Aniversario', 'Clientes com aniversario em ate 5 dias', aniversarios)}
${messageSection('expiracao', 'Expiracao', `Cashback vencendo em ate ${settings.expirationAlertDays} dias`, expirando)}
<details id="todos-whats" class="panel section-block whatsapp-history-panel"><summary class="section-title whatsapp-history-summary"><div><span class="kicker">Historico salvo</span><h2>Todos Whats</h2></div><div class="history-summary-actions"><span class="soft-pill">${all.rows.length} ultimos registros</span><span class="history-toggle" aria-hidden="true"></span></div></summary><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>Status</th><th>Mensagem</th></tr></thead><tbody>${historyRows}</tbody></table></div></details>`;
  return htmlShell(req, 'WhatsApp', body);
}

function messageSection(id: string, kicker: string, title: string, rows: DbRow[]): string {
  const emptyState = '<div class="message-empty" data-message-empty><strong>Nenhuma mensagem pendente agora.</strong><span>A fila vai aparecer aqui quando houver cliente dentro da regra.</span></div>';
  return `<section id="${e(id)}" class="panel section-block message-section" data-message-section><div class="section-title message-section-title"><div><span class="kicker">${e(kicker)}</span><h2>${e(title)}</h2></div><span class="soft-pill" data-message-section-count>${e(rows.length)} na fila</span></div><div class="message-grid">${rows
    .map((row: DbRow) => messageCard(row, String(row.subtitle || '')))
    .join('')}${rows.length ? emptyState.replace('<div class="message-empty"', '<div class="message-empty" hidden') : emptyState}</div></section>`;
}

function messageCard(message: DbRow, subtitle: string): string {
  const wa = whatsappLink(message.phone, message.message);
  const phone = formatPhone(message.phone);
  const campaignClass = `campaign-${cssToken(message.campaign)}`;
  const createdAt = brDate(message.created_at, true);
  const dueAt = brDate(message.due_date);
  return `<article class="message-card ${e(campaignClass)}" data-whatsapp-card data-message-id="${e(message.id)}"><div class="message-card-head"><div><span class="message-card-label">${e(campaignLabel(message.campaign))}</span><strong>${e(message.client_name)}</strong></div><span class="soft-pill message-status-pill">Pendente</span></div><div class="message-card-meta"><span>${e(subtitle || 'Sem detalhe adicional')}</span>${phone ? `<span>${e(phone)}</span>` : '<span>Sem telefone</span>'}</div><p class="message-card-body" title="${e(message.message)}">${e(message.message)}</p><div class="message-card-timeline"><span>Criada ${e(createdAt)}</span>${dueAt !== '-' ? `<span>Data ${e(dueAt)}</span>` : ''}</div><div class="message-actions">${wa ? `<a class="btn primary" href="${e(wa)}" target="_blank" rel="noopener" data-whatsapp-send data-message-id="${e(message.id)}">Abrir WhatsApp</a>` : '<span class="soft-pill">Sem telefone</span>'}<button class="btn" type="button" data-copy-message="${e(message.message)}" data-message-id="${e(message.id)}">Copiar texto</button><button class="btn danger" type="button" data-cancel-message data-message-id="${e(message.id)}">Excluir da fila</button></div></article>`;
}

function recompraDedupeKey(clientId: number, lastPurchase: unknown): string {
  return `recompra:${clientId}:${isoDate(lastPurchase) || 'sem-compra'}`;
}

async function expireStaleRecompraMessages(req: Request): Promise<void> {
  const result = await pgPool.query(
    `UPDATE cashback_whatsapp_messages
     SET status = 'expirado_da_fila',
         user_id = COALESCE(user_id, $1),
         updated_at = NOW()
     WHERE campaign = 'recompra'
       AND status = 'pendente'
       AND created_at < NOW() - ($2::int * INTERVAL '1 day')
     RETURNING id`,
    [req.session.user?.id ?? null, RECOMPRA_QUEUE_VISIBLE_DAYS],
  );
  for (const row of result.rows as DbRow[]) {
    await logAction(req, 'whatsapp_queue_expired', 'whatsapp', num(row.id), `Mensagem de recompra removida da fila principal apos ${RECOMPRA_QUEUE_VISIBLE_DAYS} dias.`);
  }
}

async function expirePastDueWhatsappMessages(req: Request): Promise<void> {
  const result = await pgPool.query(
    `UPDATE cashback_whatsapp_messages
     SET status = 'expirado_da_fila',
         user_id = COALESCE(user_id, $1),
         updated_at = NOW()
     WHERE status = 'pendente'
       AND campaign IN ('compra', 'aniversario', 'expiracao')
       AND due_date IS NOT NULL
       AND due_date < CURRENT_DATE
     RETURNING id, campaign, due_date`,
    [req.session.user?.id ?? null],
  );
  for (const row of result.rows as DbRow[]) {
    await logAction(
      req,
      'whatsapp_queue_expired',
      'whatsapp',
      num(row.id),
      `Mensagem ${campaignLabel(row.campaign)} removida da fila principal apos vencer em ${brDate(row.due_date)}.`,
    );
  }
}

async function adoptPendingRecompraMessage(clientId: number, dedupeKey: string): Promise<void> {
  await pgPool.query(
    `WITH candidate AS (
       SELECT id
       FROM cashback_whatsapp_messages
       WHERE campaign = 'recompra'
         AND client_id = $1
         AND status = 'pendente'
         AND dedupe_key <> $2
         AND created_at >= NOW() - ($3::int * INTERVAL '1 day')
         AND NOT EXISTS (
           SELECT 1
           FROM cashback_whatsapp_messages existing
           WHERE existing.dedupe_key = $2
         )
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     )
     UPDATE cashback_whatsapp_messages message
     SET dedupe_key = $2,
         updated_at = NOW()
     FROM candidate
     WHERE message.id = candidate.id`,
    [clientId, dedupeKey, RECOMPRA_QUEUE_VISIBLE_DAYS],
  );
}

async function generateRecompraMessages(req: Request, returnDays: number, today: string): Promise<DbRow[]> {
  await expireStaleRecompraMessages(req);
  const result = await pgPool.query(
    `SELECT c.id, c.name, c.phone, COALESCE(SUM(cr.remaining_cents), 0)::bigint AS balance, MIN(cr.expires_at) AS next_expire,
            (SELECT MAX(p.purchased_at) FROM cashback_purchases p WHERE p.client_id = c.id) AS last_purchase
     FROM cashback_clients c
     INNER JOIN cashback_credits cr ON cr.client_id = c.id
     WHERE c.status = 'ativo'
       AND cr.canceled_at IS NULL
       AND cr.status = 'ativo'
       AND cr.remaining_cents > 0
       AND cr.expires_at >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM cashback_whatsapp_messages wm
         WHERE wm.client_id = c.id AND wm.campaign = 'recompra' AND wm.status IN ('aberta','copiada','enviada') AND wm.created_at >= NOW() - INTERVAL '7 days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM cashback_whatsapp_messages wm
         WHERE wm.client_id = c.id
           AND wm.campaign = 'recompra'
           AND wm.status IN ('cancelada','expirado_da_fila')
           AND COALESCE(wm.updated_at, wm.created_at) >= NOW() - ($2::int * INTERVAL '1 day')
       )
     GROUP BY c.id, c.name, c.phone
     HAVING (SELECT MAX(p2.purchased_at) FROM cashback_purchases p2 WHERE p2.client_id = c.id) IS NULL
         OR (SELECT MAX(p2.purchased_at) FROM cashback_purchases p2 WHERE p2.client_id = c.id) < NOW() - ($1::int * INTERVAL '1 day')
     ORDER BY next_expire ASC
     LIMIT 80`,
    [returnDays, RECOMPRA_QUEUE_VISIBLE_DAYS],
  );
  const rows: DbRow[] = [];
  for (const row of result.rows as DbRow[]) {
    const dedupeKey = recompraDedupeKey(num(row.id), row.last_purchase);
    await adoptPendingRecompraMessage(num(row.id), dedupeKey);
    const message = `Oi ${row.name}, voce tem ${brMoneyCents(row.balance)} de cashback disponivel na Wimifarma. Seu proximo vencimento e ${brDate(row.next_expire)}. Passe na loja para aproveitar.`;
    const saved = await saveWhatsappMessage({
      campaign: 'recompra',
      dedupeKey,
      clientId: num(row.id),
      purchaseId: null,
      creditId: null,
      clientName: String(row.name || ''),
      phone: digitsOnly(row.phone) || null,
      message,
      dueDate: today,
      userId: req.session.user?.id ?? null,
    });
    if (saved.status === 'pendente') rows.push({ ...saved, subtitle: `Saldo ${brMoneyCents(row.balance)} | Ultima compra: ${brDate(row.last_purchase, true)}` });
  }
  return rows;
}

async function generateBirthdayMessages(req: Request, _today: string): Promise<DbRow[]> {
  const result = await pgPool.query("SELECT id, name, phone, birth_date FROM cashback_clients WHERE status = 'ativo' AND birth_date IS NOT NULL ORDER BY name ASC");
  const rows: DbRow[] = [];
  for (const row of result.rows as DbRow[]) {
    const birthday = birthdayDaysUntil(isoDate(row.birth_date));
    if (!birthday || birthday.days > 5) continue;
    const daysText = birthday.days === 0 ? 'hoje e seu aniversario' : `faltam ${birthday.days} dia(s) para seu aniversario`;
    const message = `Oi ${row.name}, ${daysText}! A Wimifarma preparou uma acao especial para voce: 10% de cashback aqui na loja. Esperamos voce.`;
    const saved = await saveWhatsappMessage({
      campaign: 'aniversario',
      dedupeKey: `aniversario:${num(row.id)}:${birthday.date}`,
      clientId: num(row.id),
      purchaseId: null,
      creditId: null,
      clientName: String(row.name || ''),
      phone: digitsOnly(row.phone) || null,
      message,
      dueDate: birthday.date,
      userId: req.session.user?.id ?? null,
    });
    if (saved.status === 'pendente') rows.push({ ...saved, subtitle: `${daysText.charAt(0).toUpperCase()}${daysText.slice(1)} | Data: ${brDate(birthday.date)}` });
  }
  return rows;
}

async function generateExpiringMessages(req: Request): Promise<DbRow[]> {
  const settings = await loadSettings();
  const result = await pgPool.query(
    `SELECT c.id, c.name, c.phone, cr.expires_at AS deadline, COALESCE(SUM(cr.remaining_cents), 0)::bigint AS expiring, COUNT(cr.id)::int AS credits
     FROM cashback_credits cr
     INNER JOIN cashback_clients c ON c.id = cr.client_id
     WHERE c.status = 'ativo' AND cr.canceled_at IS NULL AND cr.status = 'ativo' AND cr.remaining_cents > 0
       AND cr.expires_at IS NOT NULL
       AND cr.expires_at >= CURRENT_DATE
       AND cr.expires_at <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
     GROUP BY c.id, c.name, c.phone, cr.expires_at
     ORDER BY deadline ASC, c.name ASC`,
    [settings.expirationAlertDays],
  );
  const rows: DbRow[] = [];
  for (const row of result.rows as DbRow[]) {
    const deadline = isoDate(row.deadline);
    if (!deadline) continue;
    const message = `Oi ${row.name}, seu cashback de ${brMoneyCents(row.expiring)} na Wimifarma expira ate ${brDate(deadline)}. Aproveite antes do vencimento.`;
    const saved = await saveWhatsappMessage({
      campaign: 'expiracao',
      dedupeKey: `expiracao:${num(row.id)}:${deadline}`,
      clientId: num(row.id),
      purchaseId: null,
      creditId: null,
      clientName: String(row.name || ''),
      phone: digitsOnly(row.phone) || null,
      message,
      dueDate: deadline,
      userId: req.session.user?.id ?? null,
    });
    if (saved.status === 'pendente') rows.push({ ...saved, subtitle: `${brMoneyCents(row.expiring)} vencendo | Data limite: ${brDate(deadline)}` });
  }
  return rows;
}

function birthdayDaysUntil(birthDate: string): { days: number; date: string } | null {
  if (!birthDate) return null;
  const [, month, day] = birthDate.split('-');
  if (!month || !day) return null;
  const today = new Date();
  const target = new Date(today.getFullYear(), Number(month) - 1, Number(day));
  if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate())) target.setFullYear(target.getFullYear() + 1);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { days: Math.round((target.getTime() - base.getTime()) / 86400000), date: target.toISOString().slice(0, 10) };
}

function campaignLabel(value: unknown): string {
  const labels: Record<string, string> = { compra: 'Compra', recompra: 'Recompra', aniversario: 'Aniversario', expiracao: 'Expiracao', generico: 'Generico' };
  return labels[String(value || '')] || String(value || '');
}

function statusLabel(value: unknown): string {
  const labels: Record<string, string> = { pendente: 'Pendente', aberta: 'Aberta', copiada: 'Copiada', enviada: 'Enviada', cancelada: 'Cancelada', expirado_da_fila: 'Expirado da fila' };
  return labels[String(value || '')] || String(value || '');
}

function shortMessage(value: unknown, limit = 110): string {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

async function handleWhatsappStatus(req: Request, res: Response): Promise<void> {
  const id = num(req.body?.id);
  const event = String(req.body?.event || 'opened');
  const map: Record<string, { status: string; column: string | null }> = {
    opened: { status: 'aberta', column: 'opened_at' },
    copied: { status: 'copiada', column: 'copied_at' },
    sent: { status: 'enviada', column: 'sent_at' },
    cancelled: { status: 'cancelada', column: null },
  };
  const target = map[event];
  if (id <= 0 || !target) {
    res.status(422).json({ ok: false, message: 'Dados invalidos.' });
    return;
  }
  if (target.column) {
    await pgPool.query(`UPDATE cashback_whatsapp_messages SET status = $1, ${target.column} = COALESCE(${target.column}, NOW()), user_id = $2, updated_at = NOW() WHERE id = $3`, [
      target.status,
      req.session.user?.id ?? null,
      id,
    ]);
  } else {
    await pgPool.query("UPDATE cashback_whatsapp_messages SET status = $1, user_id = $2, updated_at = NOW() WHERE id = $3 AND status <> 'enviada'", [
      target.status,
      req.session.user?.id ?? null,
      id,
    ]);
  }
  await logAction(req, `whatsapp_${event}`, 'whatsapp', id, `Mensagem WhatsApp marcada como ${target.status}.`);
  res.json({ ok: true, status: target.status });
}

async function renderReport(req: Request): Promise<string> {
  const start = safeDateInput(req.query.start, todayIso().slice(0, 8) + '01');
  const end = safeDateInput(req.query.end, todayIso());
  const currentAttendantId = await loggedUserAttendantId(req);
  const currentUser = req.session.user;
  const [clients, purchases, used, expired, quickVouchers, attendants, coreUsers] = await Promise.all([
    pgPool.query("SELECT COUNT(*)::int AS count FROM cashback_clients WHERE status = 'ativo'"),
    pgPool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(charged_cents), 0)::bigint AS charged,
              COALESCE(SUM(cashback_generated_cents) FILTER (WHERE cashback_generation_mode <> 'voucher_rapido'), 0)::bigint AS common_generated,
              COALESCE(SUM(cashback_generated_cents) FILTER (WHERE cashback_generation_mode = 'voucher_rapido'), 0)::bigint AS quick_generated
       FROM cashback_purchases WHERE purchased_at::date BETWEEN $1::date AND $2::date`,
      [start, end],
    ),
    pgPool.query(
      `SELECT
         COALESCE(SUM(r.redeemed_cents) FILTER (WHERE COALESCE(p.cashback_generation_mode, 'automatico') <> 'voucher_rapido'), 0)::bigint AS common_used,
         COALESCE(SUM(r.redeemed_cents) FILTER (WHERE p.cashback_generation_mode = 'voucher_rapido'), 0)::bigint AS quick_used
       FROM cashback_redemptions r
       LEFT JOIN cashback_purchases p ON p.redemption_id = r.id
       WHERE r.redeemed_at::date BETWEEN $1::date AND $2::date`,
      [start, end],
    ),
    pgPool.query("SELECT COALESCE(SUM(remaining_cents), 0)::bigint AS expired FROM cashback_credits WHERE canceled_at IS NULL AND status = 'expirado' AND updated_at::date BETWEEN $1::date AND $2::date", [start, end]),
    pgPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ativo' AND expires_at >= CURRENT_DATE)::int AS active,
         COALESCE(SUM(cashback_cents) FILTER (WHERE status = 'ativo' AND expires_at >= CURRENT_DATE), 0)::bigint AS available
       FROM cashback_quick_vouchers`,
    ),
    pgPool.query(
      `SELECT a.*,
         (SELECT COUNT(*) FROM cashback_clients c WHERE c.attendant_id = a.id)::int AS clients,
         (SELECT COUNT(*) FROM cashback_purchases p WHERE p.attendant_id = a.id)::int AS purchases,
         COALESCE((SELECT SUM(p.charged_cents) FROM cashback_purchases p WHERE p.attendant_id = a.id), 0)::bigint AS charged,
         COALESCE((SELECT SUM(p.cashback_generated_cents) FROM cashback_purchases p WHERE p.attendant_id = a.id), 0)::bigint AS cashback
       FROM cashback_attendants a
       WHERE a.core_user_id IS NOT NULL
       ORDER BY CASE WHEN a.status = 'ativo' THEN 0 ELSE 1 END, a.name ASC`,
    ),
    activeCashbackCoreUsers(),
  ]);
  const purchaseRow = purchases.rows[0] as DbRow;
  const commonGenerated = num(purchaseRow.common_generated);
  const quickGenerated = num(purchaseRow.quick_generated);
  const commonUsedCents = num(used.rows[0]?.common_used);
  const quickUsedCents = num(used.rows[0]?.quick_used);
  const quickVoucherRow = quickVouchers.rows[0] as DbRow;
  const roi = commonGenerated > 0 ? (commonUsedCents / commonGenerated) * 100 : 0;
  const coreUsersById = new Map(coreUsers.map((user) => [user.id, user]));
  const attendantRows = (attendants.rows as DbRow[]).filter((attendant) => coreUsersById.has(num(attendant.core_user_id)));
  const linkedCoreUserIds = new Set(attendantRows.map((attendant) => num(attendant.core_user_id)));
  const availableCoreUsers = coreUsers.filter((user) => !linkedCoreUserIds.has(user.id));
  const attendantCards = attendantRows
    .map(
      (attendant: DbRow) => {
        const coreUser = coreUsersById.get(num(attendant.core_user_id)) as User;
        const isCurrent = num(attendant.id) === currentAttendantId;
        return `<article class="attendant-card attendant-card-${e(cssToken(attendant.status))}${isCurrent ? ' attendant-card-current' : ''}"><form method="post" action="${pageUrl('relatorio.php#atendentes')}" class="attendant-edit-form" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="id" value="${e(attendant.id)}"><div class="attendant-card-top"><span>#${e(attendant.id)}</span><div class="attendant-card-badges">${isCurrent ? '<span class="current-user-badge">Voce esta logado</span>' : ''}<span>${e(attendant.status === 'ativo' ? 'Ativo' : 'Inativo')}</span></div></div><div class="attendant-card-head"><div class="attendant-account"><span>Conta Wimifarma</span><strong>${e(attendantNameForUser(coreUser))}</strong><small>@${e(coreUser.username)}</small></div><label><span>Status no Cashback</span><select name="status" ${isCurrent ? 'disabled aria-label="Ativo enquanto esta conta estiver logada"' : ''}><option value="ativo" ${attendant.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${attendant.status === 'inativo' ? 'selected' : ''}>Inativo</option></select>${isCurrent ? '<input type="hidden" name="status" value="ativo">' : ''}</label></div><dl><div><dt>Clientes</dt><dd>${e(attendant.clients)}</dd></div><div><dt>Compras</dt><dd>${e(attendant.purchases)}</dd></div><div><dt>Vendido</dt><dd>${brMoneyCents(attendant.charged)}</dd></div><div><dt>Cashback</dt><dd>${brMoneyCents(attendant.cashback)}</dd></div></dl><label class="attendant-notes"><span>Observacoes</span><textarea name="observacoes" rows="2" placeholder="Opcional">${e(attendant.notes)}</textarea></label><div class="attendant-actions"><button class="btn primary" type="submit" name="action" value="update_attendant">Salvar</button>${isCurrent ? '<span class="current-user-lock">Conta em uso agora</span>' : '<button class="btn danger" type="submit" name="action" value="delete_attendant" data-confirm-submit="Remover este usuario do Cashback? O historico sera preservado.">Remover do Cashback</button>'}</div></form></article>`;
      },
    )
    .join('');
  const currentUserName = currentUser ? attendantNameForUser(currentUser) : 'Usuario nao identificado';
  const currentAttendantBanner = `<div class="current-attendant-banner"><div><span class="kicker">Conta em uso</span><strong>${e(currentUserName)}</strong><small>@${e(currentUser?.username || '')} · Atendente #${e(currentAttendantId || '-')}</small></div><span class="current-session-pill">Logado agora</span></div>`;
  const newAttendantForm = availableCoreUsers.length > 0
    ? `<form method="post" action="${pageUrl('relatorio.php#atendentes')}" class="form-grid team-form" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="save_attendant"><h3>Adicionar conta</h3><label><span>Usuario Wimifarma *</span><select name="core_user_id" required><option value="">Selecione uma conta</option>${availableCoreUsers.map((user) => `<option value="${e(user.id)}">${e(attendantNameForUser(user))} (@${e(user.username)})</option>`).join('')}</select></label><label><span>Observacoes</span><textarea name="observacoes" rows="3" placeholder="Opcional"></textarea></label><button class="btn primary" type="submit">Adicionar ao Cashback</button><a class="btn" href="/usuarios/">Gerenciar contas</a></form>`
    : `<div class="team-form team-form-empty"><span class="kicker">Equipe vinculada</span><h3>Todas as contas elegiveis ja estao no Cashback.</h3><a class="btn primary" href="/usuarios/">Abrir Usuarios</a></div>`;
  const exports = [
    ['clientes', 'Clientes'],
    ['compras', 'Compras'],
    ['resgates', 'Resgates'],
    ['creditos', 'Creditos de cashback'],
    ['codigos-rapidos', 'Codigos de cashback rapido'],
    ['whatsapp', 'Todos Whats'],
    ['atendentes', 'Atendentes'],
  ];
  const body = `<div class="report-page"><nav class="anchor-bar report-nav" aria-label="Atalhos da configuracao"><a href="#sistema">Sistema</a><a href="#atendentes">Atendentes</a><a href="#usuarios">Usuarios</a><a href="#relatorios">Relatorios</a></nav>
<section id="sistema" class="panel maintenance-control"><div><span class="kicker">Controle do sistema</span><h2>Modo manutencao</h2><p>Use quando precisar mexer no sistema sem deixar atendentes usando as telas.</p></div><form method="post" class="maintenance-control-form" data-no-enter-submit>${csrfField(req)}<input type="hidden" name="action" value="enable_maintenance"><button class="btn primary" type="submit">Colocar site em manutencao</button><span class="soft-pill">Retirada por usuario logado</span></form></section>
<section id="atendentes" class="panel team-manager"><div class="section-title"><div><span class="kicker">Equipe</span><h2>Atendentes do cashback</h2><p>Somente contas ativas da Wimifarma com acesso ao Cashback.</p></div><span class="soft-pill">${attendantRows.length} conta(s) vinculada(s)</span></div>${currentAttendantBanner}<div class="team-layout">${newAttendantForm}<div class="team-list">${attendantCards || '<p class="muted">Nenhuma conta vinculada ao Cashback.</p>'}</div></div></section>
<section id="usuarios" class="panel section-block report-access-panel"><div class="section-title"><div><span class="kicker">Acessos</span><h2>Usuarios do sistema</h2></div><span class="soft-pill">Centralizado no modulo Usuarios</span></div><p>Os logins individuais agora ficam no Postgres core. Para criar, bloquear, trocar acesso por modulo ou vincular XP, use o modulo Usuarios.</p><a class="btn primary" href="/usuarios/">Abrir Usuarios</a></section>
<section id="relatorios" class="operation-hero compact-hero report-period-panel"><div><span class="kicker">Exportacao Excel</span><h2>Baixe os dados reais do cashback.</h2><p>Use estes arquivos para conferencia, campanhas externas, backup operacional ou analise fora do sistema.</p></div><form method="get" action="${pageUrl('relatorio.php')}" class="inline-form hero-filter report-period-form"><label><span>De</span><input type="date" name="start" value="${e(start)}"></label><label><span>Ate</span><input type="date" name="end" value="${e(end)}"></label><button class="btn primary" type="submit">Atualizar periodo</button></form></section>
<section class="metrics report-metrics"><article class="metric highlight"><span>Clientes ativos</span><strong>${e(clients.rows[0]?.count)}</strong></article><article class="metric"><span>Compras no periodo</span><strong>${e(purchaseRow.count)}</strong></article><article class="metric"><span>Total vendido</span><strong>${brMoneyCents(purchaseRow.charged)}</strong></article><article class="metric"><span>Cashback comum gerado</span><strong>${brMoneyCents(commonGenerated)}</strong></article><article class="metric"><span>Cashback comum usado</span><strong>${brMoneyCents(commonUsedCents)}</strong></article><article class="metric"><span>Cashback expirado</span><strong>${brMoneyCents(expired.rows[0]?.expired)}</strong></article><article class="metric"><span>Sucessores rapidos no periodo</span><strong>${brMoneyCents(quickGenerated)}</strong></article><article class="metric"><span>Codigos rapidos usados</span><strong>${brMoneyCents(quickUsedCents)}</strong></article><article class="metric"><span>Codigos rapidos ativos</span><strong>${e(quickVoucherRow.active)}</strong></article><article class="metric"><span>Valor em codigos rapidos</span><strong>${brMoneyCents(quickVoucherRow.available)}</strong></article><article class="metric"><span>ROI comum</span><strong>${e(roi.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%</strong></article></section>
<section class="panel report-downloads"><div class="section-title"><div><span class="kicker">Arquivos</span><h2>Baixar relatorios</h2></div><span class="soft-pill">${e(brDate(start))} ate ${e(brDate(end))}</span></div><div class="message-grid report-download-grid">${exports
    .map(([type, label]) => `<article class="message-card report-download-card"><div><span class="download-format">CSV</span><strong>${e(label)}</strong><span>Compativel com Excel</span></div><p>Gerado direto do Postgres oficial.</p><div class="message-actions"><a class="btn primary" href="${pageUrl(`exportar.php?tipo=${type}&start=${start}&end=${end}`)}">Baixar</a></div></article>`)
    .join('')}</div></section></div>`;
  return htmlShell(req, 'Configuracao e Relatorio', body);
}

async function handleReportPost(req: Request, res: Response): Promise<void> {
  const action = String(req.body?.action || '');
  if (action === 'enable_maintenance') {
    await setSetting('maintenance_enabled', '1');
    await setSetting('maintenance_started_at', sqlNowText());
    await logAction(req, 'manutencao_ativada', 'system', null, 'Modo manutencao ativado pela tela de configuracao e relatorio.');
    res.redirect(`${BASE_PATH}/manutencao.php`);
    return;
  }
  if (action === 'save_attendant') {
    const coreUserId = num(req.body?.core_user_id);
    const notes = cleanText(req.body?.observacoes, 5000);
    const coreUser = await cashbackCoreUserById(coreUserId);
    if (!coreUser) {
      setFlash(req, 'error', 'Selecione uma conta Wimifarma ativa com acesso ao Cashback.');
      res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
      return;
    }
    const linked = await ensureAttendantForCoreUser(coreUser, notes);
    const name = attendantNameForUser(coreUser);
    await logAction(req, 'atendente_vinculado', 'atendente', linked.id, `Conta Wimifarma vinculada ao Cashback: ${name} (@${coreUser.username}).`);
    setFlash(req, 'success', linked.result === 'existing' ? `${name} ja estava vinculado e foi reativado.` : `${name} foi adicionado ao Cashback.`);
    res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
    return;
  }
  if (action === 'update_attendant') {
    const id = num(req.body?.id);
    const status = String(req.body?.status) === 'inativo' ? 'inativo' : 'ativo';
    const notes = cleanText(req.body?.observacoes, 5000);
    const attendantResult = await pgPool.query('SELECT id, core_user_id FROM cashback_attendants WHERE id = $1 AND core_user_id IS NOT NULL LIMIT 1', [id]);
    const attendant = attendantResult.rows[0] as DbRow | undefined;
    const coreUser = await cashbackCoreUserById(num(attendant?.core_user_id));
    if (!attendant || !coreUser) {
      setFlash(req, 'error', 'Atendente sem conta Wimifarma ativa ou sem acesso ao Cashback.');
      res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
      return;
    }
    if (coreUser.id === req.session.user?.id && status === 'inativo') {
      setFlash(req, 'error', 'O usuario logado precisa continuar ativo enquanto estiver usando o Cashback.');
      res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
      return;
    }
    const name = attendantNameForUser(coreUser);
    await pgPool.query('UPDATE cashback_attendants SET name = $1, status = $2, notes = $3, updated_at = NOW() WHERE id = $4', [name, status, notes || null, id]);
    await logAction(req, 'atendente_alterado', 'atendente', id, `Atendente vinculado atualizado no Cashback: ${name} (@${coreUser.username}).`);
    setFlash(req, 'success', `Atendente atualizado: ${name}.`);
    res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
    return;
  }
  if (action === 'delete_attendant') {
    const id = num(req.body?.id);
    const attendantResult = await pgPool.query('SELECT id, core_user_id FROM cashback_attendants WHERE id = $1 AND core_user_id IS NOT NULL LIMIT 1', [id]);
    const attendant = attendantResult.rows[0] as DbRow | undefined;
    if (!attendant) {
      setFlash(req, 'error', 'Atendente sem conta Wimifarma vinculada.');
      res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
      return;
    }
    if (num(attendant.core_user_id) === req.session.user?.id) {
      setFlash(req, 'error', 'O usuario logado nao pode remover a propria conta do Cashback.');
      res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
      return;
    }
    const usage = await pgPool.query(
      `SELECT
        (SELECT COUNT(*) FROM cashback_clients WHERE attendant_id = $1) +
        (SELECT COUNT(*) FROM cashback_purchases WHERE attendant_id = $1) +
        (SELECT COUNT(*) FROM cashback_redemptions WHERE attendant_id = $1) AS total`,
      [id],
    );
    if (num(usage.rows[0]?.total) > 0) {
      await pgPool.query("UPDATE cashback_attendants SET status = 'inativo', updated_at = NOW() WHERE id = $1", [id]);
      await logAction(req, 'atendente_inativado', 'atendente', id, 'Atendente inativado porque possui historico vinculado.');
      setFlash(req, 'success', 'Usuario removido da operacao. O historico foi preservado.');
    } else {
      await pgPool.query('DELETE FROM cashback_attendants WHERE id = $1', [id]);
      await logAction(req, 'atendente_excluido', 'atendente', id, 'Atendente excluido sem historico vinculado.');
      setFlash(req, 'success', 'Usuario removido do Cashback.');
    }
    res.redirect(`${BASE_PATH}/relatorio.php#atendentes`);
    return;
  }
  setFlash(req, 'error', 'Acao invalida.');
  res.redirect(`${BASE_PATH}/relatorio.php`);
}

async function renderDiagnostics(req: Request): Promise<string> {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];
  async function check(name: string, fn: () => Promise<string>): Promise<void> {
    try {
      checks.push({ name, ok: true, message: await fn() });
    } catch (error) {
      checks.push({ name, ok: false, message: errorMessage(error) });
    }
  }
  await check('Postgres Cashback', async () => {
    await pgPool.query('SELECT 1');
    return 'Conexao Postgres oficial ativa.';
  });
  await check('Postgres Core', async () => {
    await corePgPool.query('SELECT 1');
    return 'Core de usuarios acessivel.';
  });
  for (const [table, count] of Object.entries(await tableCounts())) {
    checks.push({ name: `Tabela ${table}`, ok: true, message: `${count} registro(s).` });
  }
  const rows = checks
    .map((checkItem) => `<tr><td>${e(checkItem.name)}</td><td><span class="badge ${checkItem.ok ? 'ativo' : 'expirado'}">${checkItem.ok ? 'OK' : 'ERRO'}</span></td><td>${e(checkItem.message)}</td></tr>`)
    .join('');
  return htmlShell(
    req,
    'Diagnostico',
    `<section class="panel"><h2>Status da integracao frontend + banco</h2><p>Esta tela confirma o app Node, o Postgres oficial e o core de usuarios.</p><div class="table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Mensagem</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,
  );
}

async function renderSelfTest(req: Request): Promise<string> {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];
  const add = (name: string, ok: boolean, message: string): void => {
    checks.push({ name, ok, message });
  };
  const db = await pgPool.connect();
  let transactionOpen = false;
  try {
    const settings = await loadSettings();
    const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const attendantId = await requireLoggedAttendantId(req);
    const attendant = await db.query(
      'SELECT id, core_user_id FROM cashback_attendants WHERE id = $1 AND core_user_id = $2 LIMIT 1',
      [attendantId, req.session.user?.id ?? null],
    );
    add('Atendente vinculado', (attendant.rowCount ?? 0) > 0, 'Usuario logado confirmado como atendente por core_user_id.');
    await db.query('BEGIN');
    transactionOpen = true;

    const client = await db.query(
      "INSERT INTO cashback_clients (name, phone, birth_date, notes, status, attendant_id) VALUES ($1, $2, $3, $4, 'ativo', $5) RETURNING id",
      [`Cliente Teste ${suffix}`, '11999999999', '1990-01-01', 'Criado pelo autoteste com rollback.', attendantId],
    );
    const clientId = num(client.rows[0]?.id);
    add('Cadastro de cliente', clientId > 0, 'INSERT em cashback_clients executado dentro de transacao.');

    const purchaseCents = 10000;
    const cashbackCents = Math.round((purchaseCents * settings.cashbackPercentBps) / 10000);
    const purchase = await db.query(
      `INSERT INTO cashback_purchases
        (client_id, attendant_id, gross_cents, charged_cents, cashback_percent_bps, cashback_generated_cents, purchased_at, notes, created_by)
       VALUES ($1, $2, $3, $3, $4, $5, NOW(), $6, $7)
       RETURNING id, purchased_at::date AS purchase_date`,
      [clientId, attendantId, purchaseCents, settings.cashbackPercentBps, cashbackCents, 'Compra criada pelo autoteste.', req.session.user?.id ?? null],
    );
    const purchaseId = num(purchase.rows[0]?.id);
    const expiresAt = await db.query('SELECT ($1::date + $2::int)::date AS value', [purchase.rows[0]?.purchase_date, settings.validityDays]);
    add('Registro de compra', purchaseId > 0, 'Compra de R$ 100,00 gravada temporariamente no Postgres.');

    const credit = await db.query(
      `INSERT INTO cashback_credits (client_id, purchase_id, original_cents, remaining_cents, expires_at, status)
       VALUES ($1, $2, $3, $3, $4, 'ativo')
       RETURNING id`,
      [clientId, purchaseId, cashbackCents, expiresAt.rows[0]?.value],
    );
    const creditId = num(credit.rows[0]?.id);
    add('Geracao de cashback', cashbackCents > 0 && creditId > 0, `Cashback calculado: ${brMoneyCents(cashbackCents)}.`);

    const balance = await db.query(
      "SELECT COALESCE(SUM(remaining_cents), 0)::bigint AS value FROM cashback_credits WHERE client_id = $1 AND canceled_at IS NULL AND status = 'ativo'",
      [clientId],
    );
    add('Consulta de saldo', num(balance.rows[0]?.value) === cashbackCents, `Saldo temporario encontrado: ${brMoneyCents(balance.rows[0]?.value)}.`);

    const redeemCents = Math.min(500, cashbackCents);
    const requiredPurchaseCents = Math.ceil(redeemCents * settings.redeemMultiplier);
    add('Bloqueio regra 4x', 1000 < requiredPurchaseCents, `Usar ${brMoneyCents(redeemCents)} exige compra minima de ${brMoneyCents(requiredPurchaseCents)}.`);

    const redemption = await db.query(
      `INSERT INTO cashback_redemptions (client_id, attendant_id, purchase_cents, redeemed_cents, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [clientId, attendantId, requiredPurchaseCents, redeemCents, 'Resgate criado pelo autoteste.', req.session.user?.id ?? null],
    );
    const redemptionId = num(redemption.rows[0]?.id);
    await db.query('UPDATE cashback_credits SET remaining_cents = remaining_cents - $1, status = $2 WHERE id = $3', [redeemCents, 'usado', creditId]);
    await db.query('INSERT INTO cashback_redemption_items (redemption_id, credit_id, used_cents) VALUES ($1, $2, $3)', [redemptionId, creditId, redeemCents]);
    add('Registro de resgate', redemptionId > 0, 'Resgate, item de consumo e atualizacao de credito passaram dentro da mesma transacao.');

    const quickVoucher = await issueQuickVoucher(db, {
      grossCents: purchaseCents,
      cashbackCents,
      percentBps: settings.cashbackPercentBps,
      attendantId,
      userId: req.session.user?.id ?? null,
      requestToken: `autoteste:${suffix}`,
    });
    const quickExpiry = await db.query(
      "SELECT $1::date = (CURRENT_DATE + INTERVAL '1 year')::date AS valid",
      [quickVoucher.expiresAt],
    );
    add(
      'Cashback rapido: emissao',
      /^[0-9]{4}$/.test(quickVoucher.code) && quickVoucher.cashbackCents === cashbackCents && Boolean(quickExpiry.rows[0]?.valid),
      `Codigo ${quickVoucher.code} criado com 4 digitos, ${brMoneyCents(quickVoucher.cashbackCents)} e validade de 1 ano.`,
    );

    const quickPurchaseCents = Math.ceil(quickVoucher.cashbackCents * settings.redeemMultiplier);
    const quickRedemption = await redeemQuickVoucherAndCreateSuccessor(db, {
      code: quickVoucher.code,
      clientId,
      attendantId,
      purchaseCents: quickPurchaseCents,
      settings,
      notes: 'Resgate de codigo rapido criado pelo autoteste.',
      userId: req.session.user?.id ?? null,
    });
    const consumedQuickVoucher = await db.query(
      'SELECT status, redeemed_client_id FROM cashback_quick_vouchers WHERE id = $1',
      [quickVoucher.id],
    );
    add(
      'Cashback rapido: uso e sucessor',
      consumedQuickVoucher.rows[0]?.status === 'usado'
        && num(consumedQuickVoucher.rows[0]?.redeemed_client_id) === clientId
        && Boolean(quickRedemption.successor)
        && quickRedemption.successor?.code !== quickVoucher.code,
      `Codigo consumido uma vez e sucessor ${quickRedemption.successor?.code || '-'} vinculado ao cliente.`,
    );
    add(
      'Cashback rapido: bloqueio de reuso',
      (await activeQuickVoucher(db, quickVoucher.code)) === null,
      'O codigo usado deixou imediatamente a lista de codigos ativos.',
    );

    await db.query('ROLLBACK');
    transactionOpen = false;
    add('Rollback seguro', true, 'Nenhum dado do autoteste foi persistido.');
  } catch (error) {
    if (transactionOpen) {
      await db.query('ROLLBACK').catch(() => undefined);
    }
    add('Autoteste', false, errorMessage(error));
  } finally {
    db.release();
  }

  const rows = checks
    .map((checkItem) => `<tr><td>${e(checkItem.name)}</td><td><span class="badge ${checkItem.ok ? 'ativo' : 'expirado'}">${checkItem.ok ? 'OK' : 'ERRO'}</span></td><td>${e(checkItem.message)}</td></tr>`)
    .join('');
  return htmlShell(
    req,
    'Autoteste seguro',
    `<section class="panel"><h2>Autoteste com rollback</h2><p>Este teste cria cliente, compra, credito, resgate e codigo rapido em transacao Postgres e desfaz tudo no final.</p><div class="table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Mensagem</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,
  );
}

async function sendExport(req: Request, res: Response): Promise<void> {
  const type = String(req.query.tipo || 'clientes');
  const start = safeDateInput(req.query.start, todayIso().slice(0, 8) + '01');
  const end = safeDateInput(req.query.end, todayIso());
  const exports: Record<string, { filename: string; headers: string[]; sql: string; params: unknown[] }> = {
    clientes: {
      filename: 'clientes',
      headers: ['ID', 'Nome', 'Telefone', 'Nascimento', 'Status', 'Atendente', 'Criado em', 'Observacoes'],
      sql: `SELECT c.id, c.name, c.phone, c.birth_date, c.status, COALESCE(a.name, '') AS attendant, c.created_at, c.notes
            FROM cashback_clients c LEFT JOIN cashback_attendants a ON a.id = c.attendant_id ORDER BY c.name ASC`,
      params: [],
    },
    compras: {
      filename: 'compras',
      headers: ['ID', 'Data', 'Cliente', 'Atendente', 'Valor bruto', 'Cashback usado', 'Valor cobrado', 'Tipo cashback', 'Percentual', 'Cashback manual', 'Cashback gerado', 'Observacoes'],
      sql: `SELECT p.id, p.purchased_at, c.name AS client, COALESCE(a.name, '') AS attendant,
                   ROUND(p.gross_cents::numeric / 100, 2) AS gross,
                   ROUND(p.cashback_discount_cents::numeric / 100, 2) AS cashback_discount,
                   ROUND(p.charged_cents::numeric / 100, 2) AS charged,
                   p.cashback_generation_mode,
                   ROUND(p.cashback_percent_bps::numeric / 100, 2) AS cashback_percent,
                   ROUND(p.manual_cashback_cents::numeric / 100, 2) AS manual_cashback,
                   ROUND(p.cashback_generated_cents::numeric / 100, 2) AS cashback_generated,
                   p.notes
            FROM cashback_purchases p INNER JOIN cashback_clients c ON c.id = p.client_id LEFT JOIN cashback_attendants a ON a.id = p.attendant_id
            WHERE p.purchased_at::date BETWEEN $1::date AND $2::date ORDER BY p.purchased_at DESC`,
      params: [start, end],
    },
    resgates: {
      filename: 'resgates',
      headers: ['ID', 'Data', 'Cliente', 'Atendente', 'Valor compra', 'Cashback usado', 'Valor cobrado', 'Observacoes'],
      sql: `SELECT r.id, r.redeemed_at, c.name AS client, COALESCE(a.name, '') AS attendant,
                   ROUND(r.purchase_cents::numeric / 100, 2) AS purchase_value,
                   ROUND(r.redeemed_cents::numeric / 100, 2) AS redeemed_value,
                   ROUND((r.purchase_cents - r.redeemed_cents)::numeric / 100, 2) AS charged,
                   r.notes
            FROM cashback_redemptions r INNER JOIN cashback_clients c ON c.id = r.client_id LEFT JOIN cashback_attendants a ON a.id = r.attendant_id
            WHERE r.redeemed_at::date BETWEEN $1::date AND $2::date ORDER BY r.redeemed_at DESC`,
      params: [start, end],
    },
    creditos: {
      filename: 'creditos-cashback',
      headers: ['ID', 'Cliente', 'Compra ID', 'Valor original', 'Valor restante', 'Vence em', 'Status', 'Cancelado em', 'Motivo cancelamento', 'Criado em'],
      sql: `SELECT cr.id, c.name AS client, cr.purchase_id,
                   ROUND(cr.original_cents::numeric / 100, 2) AS original_value,
                   ROUND(cr.remaining_cents::numeric / 100, 2) AS remaining_value,
                   cr.expires_at,
                   CASE WHEN cr.canceled_at IS NOT NULL THEN 'cancelado' ELSE cr.status END AS status,
                   cr.canceled_at,
                   COALESCE(cr.canceled_reason, '') AS canceled_reason,
                   cr.created_at
            FROM cashback_credits cr INNER JOIN cashback_clients c ON c.id = cr.client_id ORDER BY cr.expires_at ASC, cr.id DESC`,
      params: [],
    },
    'codigos-rapidos': {
      filename: 'codigos-cashback-rapido',
      headers: ['ID', 'Codigo', 'Status', 'Compra origem', 'Cashback', 'Percentual', 'Atendente emissor', 'Cliente vinculado', 'Cliente que usou', 'Codigo anterior', 'Compra sucessora', 'Impressoes solicitadas', 'Ultima impressao solicitada', 'Emitido em', 'Valido ate', 'Usado em'],
      sql: `SELECT q.id, q.code, q.status,
                   ROUND(q.gross_cents::numeric / 100, 2) AS gross,
                   ROUND(q.cashback_cents::numeric / 100, 2) AS cashback,
                   ROUND(q.cashback_percent_bps::numeric / 100, 2) AS cashback_percent,
                   COALESCE(a.name, '') AS issued_attendant,
                   COALESCE(ic.name, '') AS issued_client,
                   COALESCE(rc.name, '') AS redeemed_client,
                   q.parent_voucher_id,
                   q.source_purchase_id,
                   q.print_requests,
                   q.last_print_requested_at,
                   q.issued_at,
                   q.expires_at,
                   q.redeemed_at
              FROM cashback_quick_vouchers q
              LEFT JOIN cashback_attendants a ON a.id = q.issued_attendant_id
              LEFT JOIN cashback_clients ic ON ic.id = q.issued_client_id
              LEFT JOIN cashback_clients rc ON rc.id = q.redeemed_client_id
             ORDER BY q.issued_at DESC, q.id DESC`,
      params: [],
    },
    whatsapp: {
      filename: 'todos-whats',
      headers: ['ID', 'Criado em', 'Campanha', 'Cliente', 'Telefone', 'Status', 'Vencimento/acao', 'Mensagem'],
      sql: 'SELECT id, created_at, campaign, client_name, phone, status, due_date, message FROM cashback_whatsapp_messages ORDER BY created_at DESC, id DESC',
      params: [],
    },
    atendentes: {
      filename: 'atendentes',
      headers: ['ID', 'Nome', 'Status', 'Observacoes', 'Criado em'],
      sql: 'SELECT id, name, status, notes, created_at FROM cashback_attendants ORDER BY name ASC',
      params: [],
    },
  };
  const config = exports[type];
  if (!config) {
    res.status(404).send('Relatorio invalido.');
    return;
  }
  const result = await pgPool.query(config.sql, config.params);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wimifarma-${config.filename}-${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}.csv"`);
  res.write('\uFEFF');
  res.write(`${config.headers.map(csvValue).join(';')}\n`);
  for (const row of result.rows as DbRow[]) {
    res.write(`${Object.values(row).map((value: unknown) => csvValue(exportValue(value))).join(';')}\n`);
  }
  res.end();
}

function csvValue(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  return String(value ?? '');
}

async function main(): Promise<void> {
  await ensureSchema();
  await refreshExpiredCredits();
  await refreshExpiredQuickVouchers();
  app.listen(PORT, () => {
    console.log(`[cashback] listening on ${PORT}${BASE_PATH}`);
  });
}

main().catch((error) => {
  console.error('[cashback] failed to start:', error);
  process.exit(1);
});
