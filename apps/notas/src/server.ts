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

type CoreUserRow = {
  id: string;
  username: string;
  password_hash: string | null;
  role: string | null;
  active: boolean;
};

type NoteRow = {
  id: string;
  body: string;
  sort_order: number;
  created_by: number | null;
  created_at: Date | string;
  updated_by: number | null;
  updated_at: Date | string;
  legacy_gestao_note_id: string | null;
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_ASSET_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webp|woff2?)$/i;

const SERVICE_NAME = 'notas';
const SERVICE_VERSION = '1.0.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/notas');
const PORT = Number.parseInt(env.PORT || '3970', 10);
const SESSION_SECRET = env.NOTAS_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const INTERNAL_TOKEN = String(env.NOTAS_INTERNAL_TOKEN || env.MIAUW_GUARDIAN_TOKEN || env.MIAUW_AGENT_INTERNAL_TOKEN || '').trim();

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_notas',
  user: env.POSTGRES_USER || 'wimifarma_notas',
  password: env.POSTGRES_PASSWORD || '',
  max: 8,
});

const corePgPool = new Pool({
  host: env.CORE_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.CORE_POSTGRES_PORT || 5432),
  database: env.CORE_POSTGRES_DB || 'wimifarma_core',
  user: env.CORE_POSTGRES_USER || 'wimifarma_core',
  password: env.CORE_POSTGRES_PASSWORD || '',
  max: 4,
});

const legacyGestaoPool = new Pool({
  host: env.GESTAO_POSTGRES_HOST || '127.0.0.1',
  port: Number(env.GESTAO_POSTGRES_PORT || 5432),
  database: env.GESTAO_POSTGRES_DB || 'wimifarma_gestao',
  user: env.GESTAO_POSTGRES_USER || 'wimifarma_gestao',
  password: env.GESTAO_POSTGRES_PASSWORD || '',
  max: 2,
});

const app = express();
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  name: 'WFNOTAS',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'notas_sessions',
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
  return clean === '' ? '/notas' : clean;
}

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeUsername(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeHash(hash: unknown): string {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function cleanText(value: unknown, limit: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.slice(0, limit) : clean;
}

function cleanNoteText(value: unknown, limit = 2000): string {
  const normalized = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function userPublic(row: CoreUserRow): User {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role || 'user'),
  };
}

async function currentUser(user?: User): Promise<User | null> {
  if (!user?.id) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE id = $1 AND active = TRUE
      LIMIT 1`,
    [user.id],
  );
  return result.rows[0] ? userPublic(result.rows[0]) : null;
}

async function authenticateCore(username: string, password: string): Promise<User | null> {
  const normalized = normalizeUsername(username);
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = TRUE
      LIMIT 1`,
    [normalized],
  );
  const user = result.rows[0];
  if (!user?.password_hash) return null;
  const ok = await bcrypt.compare(password, normalizeHash(user.password_hash));
  return ok ? userPublic(user) : null;
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

async function userByHomeSso(req: Request): Promise<User | null> {
  const username = await homeSsoUsername(req);
  if (!username) return null;
  const result = await corePgPool.query<CoreUserRow>(
    `SELECT id::text, username, password_hash, role, active
       FROM core_users
      WHERE username_normalized = $1 AND active = TRUE
      LIMIT 1`,
    [username],
  );
  const row = result.rows[0];
  return row ? userPublic(row) : null;
}

async function canAccessModule(user: User, moduleKey: string): Promise<boolean> {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  if (username === 'adm' || role === 'admin') return true;
  const result = await corePgPool.query<{ permission_count: string; can_access: boolean }>(
    `SELECT COUNT(*)::text AS permission_count,
            COALESCE(BOOL_OR(module_key = $2 AND can_access = TRUE), FALSE) AS can_access
       FROM core_user_module_permissions
      WHERE user_id = $1`,
    [user.id, moduleKey],
  );
  const row = result.rows[0];
  const explicitCount = Number(row?.permission_count || 0);
  return explicitCount === 0 ? true : row?.can_access === true;
}

function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('://') || text.startsWith('//')) return '';
  try {
    const url = new URL(text, 'http://notas.local');
    const allowedPaths = new Set([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`]);
    if (!allowedPaths.has(url.pathname)) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
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
  return Boolean(expected && received && expected === received);
}

function setFlash(req: Request, type: Flash['type'], message: string): void {
  req.session.flash = { type, message };
}

function takeFlash(req: Request): Flash {
  const flash = req.session.flash || { type: '', message: '' };
  delete req.session.flash;
  return flash;
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function regenerateWithUser(req: Request, user: User): Promise<void> {
  const returnTo = req.session.returnTo;
  await new Promise<void>((resolve, reject) => {
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
  const homeUser = await userByHomeSso(req);
  if (homeUser && (!user || user.id !== homeUser.id)) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  } else if (!user && homeUser) {
    await regenerateWithUser(req, homeUser);
    user = homeUser;
  }
  if (!user) {
    req.session.returnTo = req.originalUrl;
    if (req.originalUrl.startsWith(`${BASE_PATH}/api/`)) {
      res.status(401).json({ ok: false, error: 'Sessao expirada. Entre pela Home e tente novamente.' });
      return null;
    }
    res.redirect('/');
    return null;
  }
  if (!(await canAccessModule(user, 'notas'))) {
    if (req.originalUrl.startsWith(`${BASE_PATH}/api/`)) {
      res.status(403).json({ ok: false, error: 'Sem permissao para acessar o Bloco de notas.' });
      return null;
    }
    res.redirect('/');
    return null;
  }
  req.session.user = user;
  return user;
}

function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
  }
  const received = String(req.get('x-miauw-internal-token') || req.get('x-notas-internal-token') || '').trim();
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Recarregue a pagina e tente de novo.');
    return res.redirect(`${BASE_PATH}/`);
  }
  return next();
}

async function logCoreAudit(userId: number | null, action: string, detail: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await corePgPool.query(
      `INSERT INTO core_audit_logs (actor_user_id, action, entity_type, entity_id, detail, metadata)
       VALUES ($1, $2, 'notas_note', NULL, $3, $4::jsonb)`,
      [userId, action, cleanText(detail, 500), JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('[notas] core audit failed', error);
  }
}

async function logAudit(userId: number | null, action: string, noteId: number | null, summary: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await pgPool.query(
    `INSERT INTO notas_audit_events (note_id, actor_user_id, action, summary, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [noteId, userId, action, cleanText(summary, 500), JSON.stringify(metadata)],
  );
  await logCoreAudit(userId, action, summary, metadata);
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS notas_notes (
      id BIGSERIAL PRIMARY KEY,
      legacy_gestao_note_id BIGINT UNIQUE,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_by INTEGER,
      deleted_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS notas_audit_events (
      id BIGSERIAL PRIMARY KEY,
      note_id BIGINT REFERENCES notas_notes(id) ON DELETE SET NULL,
      actor_user_id INTEGER,
      action VARCHAR(100) NOT NULL,
      summary VARCHAR(500) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query('CREATE INDEX IF NOT EXISTS notas_notes_active_order_idx ON notas_notes (deleted_at, sort_order, updated_at DESC, id DESC)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS notas_audit_created_idx ON notas_audit_events (created_at DESC, id DESC)');
}

async function migrateLegacyGestaoNotes(): Promise<number> {
  try {
    const table = await legacyGestaoPool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.gestao_notepad_notes') IS NOT NULL AS exists",
    );
    if (!table.rows[0]?.exists) return 0;
    const legacy = await legacyGestaoPool.query<{
      id: string;
      body: string;
      created_by: number | null;
      created_at: Date | string;
      updated_at: Date | string;
      deleted_at: Date | string | null;
      deleted_by: number | null;
    }>(
      `SELECT id::text, body, created_by, created_at, updated_at, deleted_at, deleted_by
         FROM gestao_notepad_notes
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, id DESC`,
    );
    let inserted = 0;
    for (const [index, note] of legacy.rows.entries()) {
      const result = await pgPool.query(
        `INSERT INTO notas_notes (
           legacy_gestao_note_id, body, created_by, created_at, updated_at, deleted_at, deleted_by, sort_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (legacy_gestao_note_id) DO NOTHING`,
        [
          Number(note.id),
          note.body,
          note.created_by,
          note.created_at,
          note.updated_at,
          note.deleted_at,
          note.deleted_by,
          index + 1,
        ],
      );
      inserted += result.rowCount || 0;
    }
    return inserted;
  } catch (error) {
    console.warn('[notas] legacy gestao notes migration skipped', error);
    return 0;
  }
}

async function listNotes(): Promise<NoteRow[]> {
  const result = await pgPool.query<NoteRow>(
    `SELECT id::text, body, sort_order, created_by, created_at, updated_by, updated_at, legacy_gestao_note_id::text
       FROM notas_notes
      WHERE deleted_at IS NULL
      ORDER BY
        CASE WHEN sort_order > 0 THEN 0 ELSE 1 END,
        sort_order ASC,
        updated_at DESC,
        id DESC
      LIMIT 200`,
  );
  return result.rows;
}

async function countNotes(): Promise<{ active: number; deleted: number; imported: number }> {
  const result = await pgPool.query<{ active: string; deleted: string; imported: string }>(
    `SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::text AS active,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS deleted,
      COUNT(*) FILTER (WHERE legacy_gestao_note_id IS NOT NULL)::text AS imported
     FROM notas_notes`,
  );
  return {
    active: Number(result.rows[0]?.active || 0),
    deleted: Number(result.rows[0]?.deleted || 0),
    imported: Number(result.rows[0]?.imported || 0),
  };
}

async function createNote(req: Request, user: User): Promise<void> {
  const body = cleanNoteText(req.body.nota_texto, 2000);
  if (!body) throw new Error('Escreva uma anotacao antes de salvar.');
  const orderResult = await pgPool.query<{ next_order: string }>(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM notas_notes WHERE deleted_at IS NULL",
  );
  const sortOrder = Number(orderResult.rows[0]?.next_order || 1);
  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO notas_notes (body, sort_order, created_by, updated_by)
     VALUES ($1, $2, $3, $3)
     RETURNING id::text`,
    [body, sortOrder, user.id],
  );
  await logAudit(user.id, 'notas_nota_criada', Number(result.rows[0]?.id || 0), 'Nota criada no Bloco de notas/lembretes.');
}

async function updateNote(req: Request, user: User): Promise<void> {
  const id = Number(req.body.note_id || 0);
  const body = cleanNoteText(req.body.nota_texto, 2000);
  if (!id) throw new Error('Nota invalida.');
  if (!body) throw new Error('A nota nao pode ficar vazia. Apague se nao precisar mais.');
  const result = await pgPool.query(
    `UPDATE notas_notes
        SET body = $1, updated_by = $2, updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL`,
    [body, user.id, id],
  );
  if (!result.rowCount) throw new Error('Nota nao encontrada.');
  await logAudit(user.id, 'notas_nota_editada', id, 'Nota editada no Bloco de notas/lembretes.');
}

async function deleteNote(req: Request, user: User): Promise<void> {
  const id = Number(req.body.note_id || 0);
  if (!id) throw new Error('Nota invalida.');
  const result = await pgPool.query(
    `UPDATE notas_notes
        SET deleted_at = NOW(), deleted_by = $1, updated_by = $1, updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL`,
    [user.id, id],
  );
  if (!result.rowCount) throw new Error('Nota nao encontrada.');
  await logAudit(user.id, 'notas_nota_apagada', id, 'Nota apagada logicamente no Bloco de notas/lembretes.');
}

function requestIdArray(req: Request): number[] {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids: number[] = raw
    .map((value: unknown): number => Number(value || 0))
    .filter((value: number): value is number => Number.isInteger(value) && value > 0);
  return Array.from(new Set<number>(ids));
}

async function updateNoteOrder(req: Request, user: User): Promise<void> {
  const ids = requestIdArray(req);
  if (!ids.length) throw new Error('Nenhuma nota para ordenar.');
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (const [index, id] of ids.entries()) {
      await client.query(
        'UPDATE notas_notes SET sort_order = $1, updated_by = $2 WHERE id = $3 AND deleted_at IS NULL',
        [index + 1, user.id, id],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit(user.id, 'notas_ordem_atualizada', null, 'Ordem das notas atualizada.', { total: ids.length });
}

function brDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(String(value));
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

function noteRows(body: string): number {
  const lines = body.split('\n').length;
  const rough = Math.ceil(body.length / 48);
  return Math.max(2, Math.min(12, Math.max(lines, rough)));
}

function renderNote(req: Request, note: NoteRow): string {
  return `<article class="notes-paper" data-note-card data-note-id="${e(note.id)}">
    <span class="notes-paper-clip" aria-hidden="true"></span>
    <button type="button" class="notes-drag-handle" draggable="true" data-note-drag-handle aria-label="Segurar e mover nota" title="Segurar e mover nota"></button>
    <form method="post" action="${BASE_PATH}/" class="notes-form" data-note-form>
      ${csrfField(req)}
      <input type="hidden" name="action" value="update_note">
      <input type="hidden" name="note_id" value="${e(note.id)}">
      <textarea name="nota_texto" rows="${e(noteRows(note.body))}" maxlength="2000" data-autosize>${e(note.body)}</textarea>
      <footer class="notes-card-foot">
        <small><span>Editado</span>${e(brDate(note.updated_at))}</small>
        <button type="submit" class="notes-btn notes-btn-soft">Salvar</button>
      </footer>
    </form>
    <form method="post" action="${BASE_PATH}/" class="notes-delete-form" data-confirm-submit="Apagar esta anotacao?">
      ${csrfField(req)}
      <input type="hidden" name="action" value="delete_note">
      <input type="hidden" name="note_id" value="${e(note.id)}">
      <button type="submit" class="notes-link-danger" aria-label="Apagar anotacao">Apagar</button>
    </form>
  </article>`;
}

function renderIndex(req: Request, notes: NoteRow[], counts: { active: number; deleted: number; imported: number }): string {
  const csrfToken = ensureCsrf(req);
  const flash = takeFlash(req);
  const alert = flash.message ? `<div class="notes-alert ${e(flash.type)}">${e(flash.message)}</div>` : '';
  const notesHtml = notes.length
    ? notes.map((note) => renderNote(req, note)).join('')
    : '<p class="notes-empty">Sem lembretes ainda.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${e(csrfToken)}">
  <title>Bloco de notas/lembretes - Wimifarma</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260613-notas-drag">
  <link rel="stylesheet" href="/miauw/widget.css?v=20260610-miauby-video">
  <script src="${BASE_PATH}/app.js?v=20260613-notas-drag" defer></script>
  <script src="/miauw/widget.js?v=20260610-miauby-video" defer></script>
</head>
<body class="notes-app-body" data-notas-base-path="${e(BASE_PATH)}">
  <header class="notes-topbar">
    <a class="notes-brand" href="/">
      <img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma">
      <strong>Bloco de notas</strong>
    </a>
    <nav class="notes-nav" aria-label="Navegacao">
      <a href="/">Home</a>
    </nav>
  </header>

  <main class="notes-page" data-miauby-screen-object="modulo bloco de notas lembretes" data-miauby-screen-label="Modulo Bloco de notas/lembretes: ${e(counts.active)} nota(s) ativa(s)">
    <section class="notes-hero" aria-label="Resumo">
      <img src="${BASE_PATH}/assets/notepad-paper.png" alt="" aria-hidden="true">
      <div>
        <span>Bloco de notas</span>
        <h1>Lembretes</h1>
      </div>
      <strong>${e(counts.active)}</strong>
    </section>

    ${alert}
    <p class="notes-order-status" data-order-status aria-live="polite"></p>

    <section class="notes-grid" data-notes-grid aria-label="Notas">
      <article class="notes-paper notes-paper-new">
        <span class="notes-paper-clip" aria-hidden="true"></span>
        <form method="post" action="${BASE_PATH}/" class="notes-form">
          ${csrfField(req)}
          <input type="hidden" name="action" value="create_note">
          <textarea name="nota_texto" rows="4" maxlength="2000" placeholder="Anote algo para lembrar depois." data-autosize data-autosize-min="148"></textarea>
          <button type="submit" class="notes-btn notes-btn-primary">Adicionar nota</button>
        </form>
      </article>
      ${notesHtml}
    </section>
  </main>
</body>
</html>`;
}

function renderLogin(req: Request, message = ''): string {
  const alert = message ? `<div class="notes-alert error">${e(message)}</div>` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Entrar - Bloco de notas</title>
  <link rel="icon" type="image/png" href="/cashback/favicon.png">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260613-notas-drag">
</head>
<body class="notes-login-body">
  <main class="notes-login-card">
    <img src="/financeiro/logo-wimifarma.svg" alt="Wimifarma">
    <h1>Bloco de notas</h1>
    ${alert}
    <form method="post" action="${BASE_PATH}/login.php">
      ${csrfField(req)}
      <label><span>Usuario</span><input type="text" name="username" autocomplete="username" required></label>
      <label><span>Senha</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit" class="notes-btn notes-btn-primary">Entrar</button>
    </form>
  </main>
</body>
</html>`;
}

function loginWaitSeconds(req: Request): number {
  const blockedUntil = Number(req.session.loginBlockedUntil || 0);
  return blockedUntil > Date.now() ? Math.ceil((blockedUntil - Date.now()) / 1000) : 0;
}

function registerLoginFailure(req: Request): void {
  const now = Date.now();
  const attempts = (req.session.loginAttempts || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  attempts.push(now);
  req.session.loginAttempts = attempts;
  if (attempts.length >= 5) {
    req.session.loginBlockedUntil = now + 10 * 60 * 1000;
  }
}

function clearLoginFailures(req: Request): void {
  delete req.session.loginAttempts;
  delete req.session.loginBlockedUntil;
}

function setStaticAssetCacheHeaders(res: Response, filePath: string): void {
  if (STATIC_ASSET_FILE_RE.test(filePath)) {
    res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
  }
}

async function withRetry(label: string, task: () => Promise<unknown>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[notas] waiting for ${label} (${attempt}/40)`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '64kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, {
  index: false,
  dotfiles: 'ignore',
  maxAge: STATIC_ASSET_MAX_AGE_MS,
  setHeaders: setStaticAssetCacheHeaders,
}));

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  const counts = await countNotes();
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    auth: { provider: 'core' },
    storage: { provider: 'postgres', database: env.POSTGRES_DB || 'wimifarma_notas' },
    legacy_import: { source: 'gestao_notepad_notes', imported: counts.imported },
    notes: counts,
  });
}));

app.get(`${BASE_PATH}/api/internal/summary`, requireInternalAuth, asyncRoute(async (_req, res) => {
  const counts = await countNotes();
  res.json({
    ok: true,
    module: 'notas',
    name: 'Bloco de notas/lembretes',
    route: `${BASE_PATH}/`,
    privacy: 'summary_only_no_note_text',
    notes: {
      active: counts.active,
      deleted: counts.deleted,
      imported_from_gestao: counts.imported,
    },
  });
}));

app.get([`${BASE_PATH}/login`, `${BASE_PATH}/login.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (user) return res.redirect(safeReturnPath(req.session.returnTo) || `${BASE_PATH}/`);
  return undefined;
}));

app.post(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  if (!csrfMatches(req)) {
    return res.status(403).type('html').send(renderLogin(req, 'Sessao expirada. Tente novamente.'));
  }
  const waitSeconds = loginWaitSeconds(req);
  if (waitSeconds > 0) {
    return res.status(429).type('html').send(renderLogin(req, `Muitas tentativas de login. Aguarde cerca de ${Math.max(1, Math.ceil(waitSeconds / 60))} minuto(s).`));
  }
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || '');
  const user = await authenticateCore(username, password);
  if (!user || !(await canAccessModule(user, 'notas'))) {
    registerLoginFailure(req);
    await logCoreAudit(null, 'login_notas_falha', `Tentativa de login Notas falhou para usuario: ${username}`);
    return res.status(401).type('html').send(renderLogin(req, 'Usuario, senha ou permissao incorretos.'));
  }
  const returnTo = safeReturnPath(req.session.returnTo) || `${BASE_PATH}/`;
  clearLoginFailures(req);
  req.session.regenerate((error) => {
    if (error) {
      console.error('[notas] session regenerate failed', error);
      return res.status(500).type('html').send(renderLogin(req, 'Nao consegui abrir sua sessao agora.'));
    }
    req.session.user = user;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    void logCoreAudit(user.id, 'login_notas', 'Login Notas realizado.');
    return res.redirect(returnTo);
  });
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const [notes, counts] = await Promise.all([listNotes(), countNotes()]);
  res.type('html').send(renderIndex(req, notes, counts));
}));

app.post(`${BASE_PATH}/`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Recarregue a pagina e tente de novo.');
    return res.redirect(`${BASE_PATH}/`);
  }
  const action = String(req.body.action || '');
  try {
    if (action === 'create_note') {
      await createNote(req, user);
      setFlash(req, 'success', 'Nota adicionada.');
    } else if (action === 'update_note') {
      await updateNote(req, user);
      setFlash(req, 'success', 'Nota atualizada.');
    } else if (action === 'delete_note') {
      await deleteNote(req, user);
      setFlash(req, 'success', 'Nota apagada.');
    }
  } catch (error) {
    setFlash(req, 'error', error instanceof Error ? error.message : 'Nao consegui salvar essa nota agora.');
  }
  return res.redirect(`${BASE_PATH}/`);
}));

app.post(`${BASE_PATH}/api/order`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    return res.status(403).json({ ok: false, error: 'Sessao expirada. Recarregue a pagina e tente de novo.' });
  }
  try {
    await updateNoteOrder(req, user);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Nao consegui salvar a ordem.' });
  }
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[notas] request failed', error);
  if (res.headersSent) return;
  res.status(500).type('html').send('Bloco de notas indisponivel agora.');
});

async function start() {
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  await withRetry('core-postgres', () => corePgPool.query('SELECT 1'));
  await ensureSchema();
  const imported = await migrateLegacyGestaoNotes();
  if (imported > 0) {
    console.log(`[notas] imported ${imported} legacy gestao note(s)`);
  }
  app.listen(PORT, () => {
    console.log(`[notas] listening on ${PORT}${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[notas] startup failed', error);
  process.exit(1);
});
