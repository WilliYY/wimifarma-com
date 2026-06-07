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

type User = {
  id: number;
  username: string;
  display_name: string;
  role: string;
};

type CoreUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  active: boolean;
};

type CalendarRow = {
  id: string;
  year: number;
  template_year: number;
  created_at: string;
  updated_at: string | null;
};

type ColorRow = {
  id: string;
  calendar_id: string;
  color_hex: string;
  label: string;
  sort_order: number;
  active: boolean;
};

type NoteRow = {
  id: string;
  calendar_id: string;
  month: number;
  day: number;
  note_text: string;
  color_id: string | null;
  updated_at: string | null;
  updated_by: string | number | null;
};

type ExistingNoteRow = NoteRow & {
  updated_at_ms: string | null;
};

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    returnTo?: string;
    user?: User;
  }
}

const env = process.env;
const SERVICE_NAME = 'calendario';
const SERVICE_VERSION = '1.0.0';
const MODULE_KEY = 'calendario';
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/calendario');
const PORT = Number.parseInt(env.PORT || '4105', 10);
const SESSION_SECRET = env.CALENDARIO_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const INTERNAL_TOKEN = cleanEnv('CALENDARIO_INTERNAL_TOKEN') || cleanEnv('MIAUW_GUARDIAN_TOKEN') || cleanEnv('MIAUW_AGENT_INTERNAL_TOKEN');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_CODE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const STATIC_CODE_MAX_AGE_MS = 1000 * 60;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;
const STATIC_CODE_FILE_RE = /\.(?:css|js)$/i;

const DEFAULT_COLORS = [
  { color_hex: '#f97373', label: 'Plantao' },
  { color_hex: '#fde047', label: 'Importante' },
  { color_hex: '#86efac', label: 'Resolvido' },
  { color_hex: '#93c5fd', label: 'Entrega' },
  { color_hex: '#e9d5ff', label: 'Anotacao' },
];

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.POSTGRES_PORT || '5432', 10),
  database: env.POSTGRES_DB || 'wimifarma_calendario',
  user: env.POSTGRES_USER || 'wimifarma_calendario',
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

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFCALENDARIO',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'calendario_sessions',
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
  return clean.startsWith('/') ? clean || '/calendario' : `/${clean || 'calendario'}`;
}

function cleanEnv(name: string): string {
  return String(env[name] || '').trim();
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

function normalizeHex(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '#93c5fd';
}

function brDateTime(value: unknown): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ensureCsrf(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function csrfMatches(req: Request): boolean {
  const expected = req.session.csrfToken || '';
  const received = String(req.body?.csrf_token || req.get('x-csrf-token') || '');
  if (!expected || !received) return false;
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const receivedHash = crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash);
}

function userLabel(user: User): string {
  return cleanText(user.display_name || user.username, 120) || user.username;
}

async function currentUser(user?: User): Promise<User | null> {
  if (!user) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, display_name, role, active
       FROM core_users
      WHERE id = $1 AND active = true
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  return row ? userFromRow(row) : null;
}

function userFromRow(row: CoreUserRow): User {
  return {
    id: toNumber(row.id),
    username: row.username,
    display_name: cleanText(row.display_name || row.username, 120),
    role: row.role || 'user',
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
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, display_name, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = true
      LIMIT 1`,
    [username],
  );
  const row = result.rows[0];
  return row ? userFromRow(row) : null;
}

function isAdminUser(user: User): boolean {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  return username === 'adm' || role === 'admin';
}

function colorKey(colorId: string | number | null | undefined): string {
  return colorId === null || colorId === undefined || colorId === '' ? '' : String(colorId);
}

function notePayloadChanged(note: NoteRow, noteText: string, colorId: number | null): boolean {
  return note.note_text !== noteText || colorKey(note.color_id) !== colorKey(colorId);
}

function isStaleDaySave(existing: ExistingNoteRow, clientUpdatedAtRaw: unknown): boolean {
  const clientUpdatedAt = String(clientUpdatedAtRaw || '').trim();
  if (!clientUpdatedAt) return true;
  const existingMs = Number(existing.updated_at_ms || 0);
  const clientMs = Date.parse(clientUpdatedAt);
  if (!Number.isFinite(existingMs) || existingMs <= 0 || !Number.isFinite(clientMs)) return true;
  return existingMs > clientMs + 1000;
}

async function canAccessCalendar(user: User): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const result = await corePgPool.query<{ can_access: boolean }>(
    `SELECT can_access
       FROM core_user_module_permissions
      WHERE user_id = $1 AND module_key = $2
      LIMIT 1`,
    [user.id, MODULE_KEY],
  );
  if (!result.rows[0]) return true;
  return result.rows[0].can_access === true;
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

async function resolveRequestUser(req: Request): Promise<User | null> {
  let user = await currentUser(req.session.user);
  const homeUser = await userByHomeSso(req);
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  } else if (!user && homeUser) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (user) req.session.user = user;
  return user;
}

async function requireUser(req: Request, res: Response): Promise<User | null> {
  const user = await resolveRequestUser(req);
  if (!user) {
    req.session.returnTo = req.originalUrl;
    res.redirect('/');
    return null;
  }
  if (!(await canAccessCalendar(user))) {
    await auditEvent(user, 'calendario_acesso_bloqueado', null, 'Tentativa bloqueada no modulo Calendario.');
    res.redirect('/');
    return null;
  }
  return user;
}

async function requireJsonUser(req: Request, res: Response): Promise<User | null> {
  const user = await resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Sessao invalida.' });
    return null;
  }
  if (!(await canAccessCalendar(user))) {
    await auditEvent(user, 'calendario_acesso_bloqueado', null, 'Tentativa bloqueada no modulo Calendario.');
    res.status(403).json({ ok: false, error: 'Acesso bloqueado.' });
    return null;
  }
  return user;
}

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const received = String(req.get('x-calendario-internal-token') || req.get('x-miauw-internal-token') || req.get('x-miauw-agent-token') || '');
  if (!INTERNAL_TOKEN || !received) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const expectedHash = crypto.createHash('sha256').update(INTERNAL_TOKEN).digest();
  const receivedHash = crypto.createHash('sha256').update(received).digest();
  if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  next();
}

async function logCoreAudit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  detail: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, action, entityType, entityId === null ? null : String(entityId), cleanText(detail, 500), JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('[calendario] core audit failed', error instanceof Error ? error.message : 'unknown');
  }
}

async function auditEvent(
  user: User | null,
  action: string,
  calendarId: number | string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const safeSummary = cleanText(summary, 500);
  try {
    await pgPool.query(
      `INSERT INTO calendario_audit_events
        (actor_user_id, actor_username, actor_display_name, action, calendar_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        user?.id || null,
        user?.username || null,
        user?.display_name || null,
        action,
        calendarId === null ? null : String(calendarId),
        safeSummary,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    console.error('[calendario] audit failed', error instanceof Error ? error.message : 'unknown');
  }
  await logCoreAudit(user?.id || null, action, 'calendario', calendarId, safeSummary, metadata);
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS calendario_calendars (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      year INTEGER NOT NULL UNIQUE,
      template_year INTEGER NOT NULL DEFAULT 2026,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS calendario_colors (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      calendar_id BIGINT NOT NULL REFERENCES calendario_calendars(id) ON DELETE CASCADE,
      color_hex VARCHAR(20) NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT,
      updated_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS calendario_day_notes (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      calendar_id BIGINT NOT NULL REFERENCES calendario_calendars(id) ON DELETE CASCADE,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
      note_text TEXT NOT NULL DEFAULT '',
      color_id BIGINT REFERENCES calendario_colors(id) ON DELETE SET NULL,
      updated_by BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (calendar_id, month, day)
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS calendario_day_note_revisions (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      note_id BIGINT REFERENCES calendario_day_notes(id) ON DELETE SET NULL,
      calendar_id BIGINT NOT NULL REFERENCES calendario_calendars(id) ON DELETE CASCADE,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
      previous_note_text TEXT,
      previous_color_id BIGINT REFERENCES calendario_colors(id) ON DELETE SET NULL,
      previous_updated_by BIGINT,
      previous_updated_at TIMESTAMPTZ,
      new_note_text TEXT NOT NULL DEFAULT '',
      new_color_id BIGINT REFERENCES calendario_colors(id) ON DELETE SET NULL,
      changed_by BIGINT,
      change_source VARCHAR(60) NOT NULL DEFAULT 'autosave',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS calendario_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT,
      actor_username TEXT,
      actor_display_name TEXT,
      action VARCHAR(100) NOT NULL,
      calendar_id BIGINT,
      summary TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_calendario_colors_calendar ON calendario_colors (calendar_id, active, sort_order, id)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_calendario_notes_calendar_month ON calendario_day_notes (calendar_id, month, day)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_calendario_note_revisions_day ON calendario_day_note_revisions (calendar_id, month, day, created_at DESC)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_calendario_note_revisions_created ON calendario_day_note_revisions (created_at DESC)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_calendario_audit_created ON calendario_audit_events (created_at DESC)');

  let calendar = await getCalendarByYear(2026);
  if (!calendar) {
    const created = await pgPool.query<CalendarRow>(
      `INSERT INTO calendario_calendars (year, template_year)
       VALUES (2026, 2026)
       ON CONFLICT (year) DO UPDATE SET template_year = EXCLUDED.template_year
       RETURNING id::text, year, template_year, created_at::text, updated_at::text`,
    );
    calendar = created.rows[0] || null;
  }
  if (calendar) await ensureDefaultColors(calendar.id);
}

async function ensureDefaultColors(calendarId: string | number): Promise<void> {
  const count = await pgPool.query<{ total: string }>(
    'SELECT COUNT(*)::text AS total FROM calendario_colors WHERE calendar_id = $1',
    [calendarId],
  );
  if (Number(count.rows[0]?.total || 0) > 0) return;
  for (let index = 0; index < DEFAULT_COLORS.length; index++) {
    const color = DEFAULT_COLORS[index];
    await pgPool.query(
      `INSERT INTO calendario_colors (calendar_id, color_hex, label, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [calendarId, color.color_hex, color.label, (index + 1) * 10],
    );
  }
}

async function getCalendarByYear(year: number): Promise<CalendarRow | null> {
  const result = await pgPool.query<CalendarRow>(
    `SELECT id::text, year, template_year, created_at::text, updated_at::text
       FROM calendario_calendars
      WHERE year = $1
      LIMIT 1`,
    [year],
  );
  return result.rows[0] || null;
}

async function getDefaultCalendar(): Promise<CalendarRow> {
  const requested = await getCalendarByYear(2026);
  if (requested) return requested;
  const result = await pgPool.query<CalendarRow>(
    `INSERT INTO calendario_calendars (year, template_year)
     VALUES (2026, 2026)
     ON CONFLICT (year) DO UPDATE SET template_year = EXCLUDED.template_year
     RETURNING id::text, year, template_year, created_at::text, updated_at::text`,
  );
  await ensureDefaultColors(result.rows[0].id);
  return result.rows[0];
}

async function listCalendars(): Promise<CalendarRow[]> {
  const result = await pgPool.query<CalendarRow>(
    `SELECT id::text, year, template_year, created_at::text, updated_at::text
       FROM calendario_calendars
      ORDER BY year ASC`,
  );
  return result.rows;
}

async function loadCalendarPayload(yearInput: unknown): Promise<Record<string, unknown>> {
  const parsed = Number.parseInt(String(yearInput || ''), 10);
  const year = Number.isFinite(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : 2026;
  let calendar = await getCalendarByYear(year);
  if (!calendar) calendar = await getDefaultCalendar();
  await ensureDefaultColors(calendar.id);

  const [calendars, colors, notes] = await Promise.all([
    listCalendars(),
    pgPool.query<ColorRow>(
      `SELECT id::text, calendar_id::text, color_hex, label, sort_order, active
         FROM calendario_colors
        WHERE calendar_id = $1 AND active = true
        ORDER BY sort_order ASC, id ASC`,
      [calendar.id],
    ),
    pgPool.query<NoteRow>(
      `SELECT id::text, calendar_id::text, month, day, note_text, color_id::text, updated_at::text, updated_by
         FROM calendario_day_notes
        WHERE calendar_id = $1
        ORDER BY month ASC, day ASC`,
      [calendar.id],
    ),
  ]);

  return {
    ok: true,
    source: 'calendario_node_postgres',
    calendar,
    calendars,
    month_names: MONTH_NAMES,
    colors: colors.rows,
    notes: notes.rows,
  };
}

function pageHtml(req: Request, user: User): string {
  const csrfToken = ensureCsrf(req);
  const bootstrap = JSON.stringify({
    basePath: BASE_PATH,
    csrfToken,
    monthNames: MONTH_NAMES,
    currentYear: 2026,
    currentMonth: new Date().getMonth() + 1,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Calendario | Wimifarma</title>
  <link rel="stylesheet" href="${BASE_PATH}/styles.css">
</head>
<body>
  <header class="cal-topbar">
    <a class="cal-brand" href="/" aria-label="Voltar para Home">
      <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
      <strong>Calendario</strong>
    </a>
    <nav class="cal-nav" aria-label="Navegacao">
      <a href="/">Home</a>
    </nav>
  </header>

  <main class="cal-shell">
    <section class="cal-hero">
      <div>
        <span class="cal-kicker">Escala e notas</span>
        <h1>Calendario</h1>
        <p>Meses da farmacia com anotacoes salvas automaticamente.</p>
      </div>
      <div class="cal-user">Usuario: ${e(userLabel(user))}</div>
    </section>

    <section class="cal-toolbar" aria-label="Controles do calendario">
      <div class="cal-month-controls">
        <button class="cal-icon-btn" id="prev-month" type="button" aria-label="Mes anterior" title="Mes anterior">&lsaquo;</button>
        <div class="cal-month-title">
          <strong id="month-label">Janeiro</strong>
          <label>
            <span>Ano</span>
            <select id="year-select"></select>
          </label>
        </div>
        <button class="cal-icon-btn" id="next-month" type="button" aria-label="Proximo mes" title="Proximo mes">&rsaquo;</button>
      </div>
      <div class="cal-toolbar-actions">
        <button class="cal-secondary" id="create-next-year" type="button">Criar proximo calendario</button>
        <span class="cal-save-state" id="save-state">Sincronizado</span>
      </div>
    </section>

    <section class="cal-workspace">
      <div class="cal-calendar-panel">
        <div class="cal-image-stage" id="calendar-stage">
          <img id="month-image" src="${BASE_PATH}/months/month-01.png" alt="Calendario mensal">
          <div class="cal-day-layer" id="day-layer"></div>
        </div>
      </div>

      <aside class="cal-side-panel" aria-live="polite">
        <div class="cal-selected-head">
          <span class="cal-kicker">Dia selecionado</span>
          <strong id="selected-title">Escolha um dia</strong>
        </div>
        <textarea id="note-input" rows="10" wrap="soft" placeholder="Digite a anotacao deste dia"></textarea>
        <div class="cal-color-picker" id="day-colors"></div>
        <div class="cal-note-preview">
          <span class="cal-kicker">Texto completo</span>
          <p id="note-preview">-</p>
        </div>
      </aside>
    </section>

    <div class="cal-context-menu" id="day-context-menu" role="menu" aria-label="Pintar dia" hidden></div>

    <section class="cal-palette-panel" aria-label="Paleta de cores">
      <div class="cal-section-head">
        <div>
          <span class="cal-kicker">Paleta</span>
          <h2>Cores e significados</h2>
        </div>
      </div>
      <div class="cal-palette-grid" id="palette-list"></div>
      <form class="cal-add-color" id="color-form">
        <input type="color" name="color_hex" value="#f97373" aria-label="Cor">
        <input type="hidden" name="label" value="">
        <button type="submit" aria-label="Adicionar cor" title="Adicionar cor">+</button>
      </form>
    </section>
  </main>

  <script>window.CALENDARIO_BOOTSTRAP = ${bootstrap};</script>
  <script src="${BASE_PATH}/app.js" defer></script>
</body>
</html>`;
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);
app.use(
  BASE_PATH,
  express.static(publicDir, {
    fallthrough: true,
    maxAge: STATIC_CODE_MAX_AGE_MS,
    setHeaders: (res, filePath) => {
      if (STATIC_ASSET_FILE_RE.test(filePath)) {
        res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
      } else if (STATIC_CODE_FILE_RE.test(filePath)) {
        res.setHeader('Cache-Control', STATIC_CODE_CACHE_CONTROL);
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }),
);

app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ ok: true, service: SERVICE_NAME, version: SERVICE_VERSION });
});

app.get(`${BASE_PATH}/api/internal/summary`, requireInternalToken, async (req, res, next) => {
  try {
    const payload = await loadCalendarPayload(req.query.year);
    const notes = (payload.notes as NoteRow[]).filter((note) => cleanText(note.note_text, 1000) !== '' || note.color_id);
    const colors = payload.colors as ColorRow[];
    res.json({
      ok: true,
      source: 'calendario_node_postgres',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      calendar: payload.calendar,
      totals: {
        years: (payload.calendars as CalendarRow[]).length,
        active_colors: colors.length,
        marked_days: notes.length,
      },
      active_colors: colors.map((color) => ({ id: color.id, color_hex: color.color_hex, label: color.label })),
      recent_updates: notes
        .slice()
        .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))
        .slice(0, 8)
        .map((note) => ({
          month: note.month,
          day: note.day,
          has_text: cleanText(note.note_text, 1000) !== '',
          color_id: note.color_id,
          updated_at: note.updated_at,
        })),
    });
  } catch (error) {
    next(error);
  }
});

app.get([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.setHeader('Cache-Control', 'no-store');
    res.send(pageHtml(req, user));
  } catch (error) {
    next(error);
  }
});

app.get(`${BASE_PATH}/api/state`, async (req, res, next) => {
  try {
    const user = await requireJsonUser(req, res);
    if (!user) return;
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadCalendarPayload(req.query.year));
  } catch (error) {
    next(error);
  }
});

app.post(`${BASE_PATH}/api/day`, async (req, res, next) => {
  try {
    const user = await requireJsonUser(req, res);
    if (!user) return;
    if (!csrfMatches(req)) {
      res.status(403).json({ ok: false, error: 'CSRF invalido.' });
      return;
    }

    const calendarId = toNumber(req.body.calendar_id);
    const month = toNumber(req.body.month);
    const day = toNumber(req.body.day);
    const noteText = String(req.body.note_text ?? '').slice(0, 4000);
    const colorIdRaw = req.body.color_id === null || req.body.color_id === '' ? null : toNumber(req.body.color_id);
    if (calendarId <= 0 || month < 1 || month > 12 || day < 1 || day > 31) {
      res.status(400).json({ ok: false, error: 'Dia invalido.' });
      return;
    }

    const colorId = colorIdRaw && colorIdRaw > 0 ? colorIdRaw : null;
    if (colorId) {
      const colorExists = await pgPool.query('SELECT 1 FROM calendario_colors WHERE id = $1 AND calendar_id = $2 AND active = true', [colorId, calendarId]);
      if (!colorExists.rows[0]) {
        res.status(400).json({ ok: false, error: 'Cor invalida.' });
        return;
      }
    }

    const client = await pgPool.connect();
    let changed = false;
    let noteRow: NoteRow | null = null;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`calendario-day:${calendarId}:${month}:${day}`]);
      const existingResult = await client.query<ExistingNoteRow>(
        `SELECT id::text, calendar_id::text, month, day, note_text, color_id::text, updated_at::text, updated_by,
                (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint::text AS updated_at_ms
           FROM calendario_day_notes
          WHERE calendar_id = $1 AND month = $2 AND day = $3
          FOR UPDATE`,
        [calendarId, month, day],
      );
      const existing = existingResult.rows[0] || null;

      if (existing && notePayloadChanged(existing, noteText, colorId) && isStaleDaySave(existing, req.body.client_updated_at)) {
        await client.query('ROLLBACK');
        res.status(409).json({
          ok: false,
          conflict: true,
          error: 'Este dia foi alterado em outra janela. Seu texto nao foi apagado; recarregue antes de sobrescrever.',
          note: existing,
        });
        return;
      }

      if (existing && !notePayloadChanged(existing, noteText, colorId)) {
        noteRow = existing;
      } else if (existing) {
        const updated = await client.query<NoteRow>(
          `UPDATE calendario_day_notes
              SET note_text = $4,
                  color_id = $5,
                  updated_by = $6,
                  updated_at = NOW()
            WHERE id = $1 AND calendar_id = $2 AND month = $3 AND day = $7
            RETURNING id::text, calendar_id::text, month, day, note_text, color_id::text, updated_at::text, updated_by`,
          [existing.id, calendarId, month, noteText, colorId, user.id, day],
        );
        noteRow = updated.rows[0];
        changed = true;
        await client.query(
          `INSERT INTO calendario_day_note_revisions
            (note_id, calendar_id, month, day, previous_note_text, previous_color_id, previous_updated_by, previous_updated_at,
             new_note_text, new_color_id, changed_by, change_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'autosave')`,
          [
            noteRow.id,
            calendarId,
            month,
            day,
            existing.note_text,
            existing.color_id,
            existing.updated_by,
            existing.updated_at,
            noteText,
            colorId,
            user.id,
          ],
        );
      } else {
        const inserted = await client.query<NoteRow>(
          `INSERT INTO calendario_day_notes (calendar_id, month, day, note_text, color_id, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id::text, calendar_id::text, month, day, note_text, color_id::text, updated_at::text, updated_by`,
          [calendarId, month, day, noteText, colorId, user.id],
        );
        noteRow = inserted.rows[0];
        changed = true;
        await client.query(
          `INSERT INTO calendario_day_note_revisions
            (note_id, calendar_id, month, day, previous_note_text, previous_color_id, previous_updated_by, previous_updated_at,
             new_note_text, new_color_id, changed_by, change_source)
           VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, $5, $6, $7, 'autosave')`,
          [noteRow.id, calendarId, month, day, noteText, colorId, user.id],
        );
      }

      if (changed) {
        await client.query('UPDATE calendario_calendars SET updated_at = NOW() WHERE id = $1', [calendarId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (changed) {
      await auditEvent(user, 'calendario_dia_salvo', calendarId, `Calendario ${month}/${day} salvo.`, {
        month,
        day,
        has_text: noteText.trim() !== '',
        color_id: colorId,
        protected_revision: true,
      });
    }
    res.json({ ok: true, note: noteRow, unchanged: !changed });
  } catch (error) {
    next(error);
  }
});

app.post(`${BASE_PATH}/api/colors`, async (req, res, next) => {
  try {
    const user = await requireJsonUser(req, res);
    if (!user) return;
    if (!csrfMatches(req)) {
      res.status(403).json({ ok: false, error: 'CSRF invalido.' });
      return;
    }

    const calendarId = toNumber(req.body.calendar_id);
    const colorId = toNumber(req.body.id);
    const colorHex = normalizeHex(req.body.color_hex);
    const label = cleanText(req.body.label, 80);
    if (calendarId <= 0 || label === '') {
      res.status(400).json({ ok: false, error: 'Informe cor e significado.' });
      return;
    }

    let row: ColorRow;
    if (colorId > 0) {
      const result = await pgPool.query<ColorRow>(
        `UPDATE calendario_colors
            SET color_hex = $1, label = $2, updated_by = $3, updated_at = NOW()
          WHERE id = $4 AND calendar_id = $5 AND active = true
          RETURNING id::text, calendar_id::text, color_hex, label, sort_order, active`,
        [colorHex, label, user.id, colorId, calendarId],
      );
      if (!result.rows[0]) {
        res.status(404).json({ ok: false, error: 'Cor nao encontrada.' });
        return;
      }
      row = result.rows[0];
    } else {
      const maxOrder = await pgPool.query<{ next_order: number }>(
        'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM calendario_colors WHERE calendar_id = $1',
        [calendarId],
      );
      const result = await pgPool.query<ColorRow>(
        `INSERT INTO calendario_colors (calendar_id, color_hex, label, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text, calendar_id::text, color_hex, label, sort_order, active`,
        [calendarId, colorHex, label, Number(maxOrder.rows[0]?.next_order || 10), user.id],
      );
      row = result.rows[0];
    }

    await auditEvent(user, colorId > 0 ? 'calendario_cor_editada' : 'calendario_cor_criada', calendarId, `Cor ${label} salva.`, {
      color_id: row.id,
      color_hex: row.color_hex,
    });
    res.json({ ok: true, color: row });
  } catch (error) {
    next(error);
  }
});

app.post(`${BASE_PATH}/api/colors/:id/archive`, async (req, res, next) => {
  try {
    const user = await requireJsonUser(req, res);
    if (!user) return;
    if (!csrfMatches(req)) {
      res.status(403).json({ ok: false, error: 'CSRF invalido.' });
      return;
    }

    const colorId = toNumber(req.params.id);
    const calendarId = toNumber(req.body.calendar_id);
    const client = await pgPool.connect();
    let row: ColorRow | null = null;
    let affectedDays = 0;
    try {
      await client.query('BEGIN');
      const result = await client.query<ColorRow>(
        `UPDATE calendario_colors
            SET active = false, updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND calendar_id = $3
          RETURNING id::text, calendar_id::text, color_hex, label, sort_order, active`,
        [user.id, colorId, calendarId],
      );
      row = result.rows[0] || null;
      if (!row) {
        await client.query('ROLLBACK');
        res.status(404).json({ ok: false, error: 'Cor nao encontrada.' });
        return;
      }

      await client.query(
        `INSERT INTO calendario_day_note_revisions
          (note_id, calendar_id, month, day, previous_note_text, previous_color_id, previous_updated_by, previous_updated_at,
           new_note_text, new_color_id, changed_by, change_source)
         SELECT id, calendar_id, month, day, note_text, color_id, updated_by, updated_at,
                note_text, NULL, $1, 'color_archive'
           FROM calendario_day_notes
          WHERE calendar_id = $2 AND color_id = $3`,
        [user.id, calendarId, colorId],
      );

      const updatedNotes = await client.query(
        'UPDATE calendario_day_notes SET color_id = NULL, updated_at = NOW(), updated_by = $1 WHERE calendar_id = $2 AND color_id = $3',
        [user.id, calendarId, colorId],
      );
      affectedDays = updatedNotes.rowCount || 0;
      if (affectedDays > 0) {
        await client.query('UPDATE calendario_calendars SET updated_at = NOW() WHERE id = $1', [calendarId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await auditEvent(user, 'calendario_cor_arquivada', calendarId, `Cor ${row.label} arquivada.`, {
      color_id: colorId,
      affected_days: affectedDays,
      protected_revision: true,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post(`${BASE_PATH}/api/create-next-year`, async (req, res, next) => {
  try {
    const user = await requireJsonUser(req, res);
    if (!user) return;
    if (!csrfMatches(req)) {
      res.status(403).json({ ok: false, error: 'CSRF invalido.' });
      return;
    }

    const maxResult = await pgPool.query<{ year: number }>('SELECT COALESCE(MAX(year), 2025) AS year FROM calendario_calendars');
    const nextYear = Number(maxResult.rows[0]?.year || 2025) + 1;
    const created = await pgPool.query<CalendarRow>(
      `INSERT INTO calendario_calendars (year, template_year, created_by)
       VALUES ($1, 2026, $2)
       ON CONFLICT (year) DO UPDATE SET updated_at = calendario_calendars.updated_at
       RETURNING id::text, year, template_year, created_at::text, updated_at::text`,
      [nextYear, user.id],
    );
    const calendar = created.rows[0];
    const colorCount = await pgPool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM calendario_colors WHERE calendar_id = $1', [calendar.id]);
    if (Number(colorCount.rows[0]?.total || 0) === 0) {
      const source = await pgPool.query<CalendarRow>(
        `SELECT id::text, year, template_year, created_at::text, updated_at::text
           FROM calendario_calendars
          WHERE year = $1
          LIMIT 1`,
        [nextYear - 1],
      );
      const sourceId = source.rows[0]?.id;
      if (sourceId) {
        await pgPool.query(
          `INSERT INTO calendario_colors (calendar_id, color_hex, label, sort_order, created_by)
           SELECT $1, color_hex, label, sort_order, $2
             FROM calendario_colors
            WHERE calendar_id = $3 AND active = true
            ORDER BY sort_order ASC, id ASC`,
          [calendar.id, user.id, sourceId],
        );
      }
      await ensureDefaultColors(calendar.id);
    }

    await auditEvent(user, 'calendario_proximo_criado', calendar.id, `Calendario ${nextYear} criado limpo.`, { year: nextYear });
    res.json({ ok: true, calendar, state: await loadCalendarPayload(nextYear) });
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (req.path === '/calendario' || req.path.startsWith('/calendario/')) {
    next();
    return;
  }
  res.status(404).json({ ok: false, error: 'not_found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[calendario] request failed', error instanceof Error ? error.message : 'unknown');
  res.status(500).json({ ok: false, error: 'Erro interno.' });
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[calendario] listening on ${PORT}${BASE_PATH}`);
    });
  })
  .catch((error) => {
    console.error('[calendario] startup failed', error instanceof Error ? error.message : error);
    process.exit(1);
  });
