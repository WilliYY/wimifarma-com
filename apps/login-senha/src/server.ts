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

type Flash = {
  type: 'success' | 'error' | '';
  message: string;
};

type CoreUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  active: boolean;
};

type EntryRow = {
  id: string;
  name: string;
  login_username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  created_by: string | number | null;
  updated_by: string | number | null;
  archived_by: string | number | null;
  created_at: string;
  updated_at: string | null;
  archived_at: string | null;
};

type AuditRow = {
  id: string;
  actor_user_id: string | number | null;
  actor_username: string | null;
  actor_display_name: string | null;
  action: string;
  entry_id: string | number | null;
  summary: string | null;
  created_at: string;
};

type EncryptedPassword = {
  ciphertext: string;
  iv: string;
  tag: string;
};

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    flash?: Flash;
    returnTo?: string;
    user?: User;
  }
}

const env = process.env;
const SERVICE_NAME = 'login-senha';
const SERVICE_VERSION = '1.0.0';
const MODULE_KEY = 'login_senha';
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const BASE_PATH = normalizeBasePath(env.BASE_PATH || '/login-senha');
const PORT = Number.parseInt(env.PORT || '3950', 10);
const SESSION_SECRET = env.LOGIN_SENHA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const VAULT_KEY_SOURCE = cleanEnv('LOGIN_SENHA_VAULT_KEY') || SESSION_SECRET;
const VAULT_KEY = crypto.createHash('sha256').update(VAULT_KEY_SOURCE).digest();
const HOME_SSO_INTERNAL_URL = String(env.WIMIFARMA_HOME_SSO_INTERNAL_URL || 'http://wimifarma-com-web/home-sso.php').trim();
const HOME_SSO_TIMEOUT_MS = Math.max(300, Math.min(5000, Number.parseInt(env.WIMIFARMA_HOME_SSO_TIMEOUT_MS || '1200', 10) || 1200));
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';
const STATIC_ASSET_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const STATIC_ASSET_FILE_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|webp|woff2?)$/i;

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number.parseInt(env.POSTGRES_PORT || '5432', 10),
  database: env.POSTGRES_DB || 'wimifarma_login_senha',
  user: env.POSTGRES_USER || 'wimifarma_login_senha',
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
  name: 'WFLOGINSENHA',
  secret: SESSION_SECRET,
  store: new PgSession({
    pool: pgPool,
    tableName: 'login_senha_sessions',
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
  return clean.startsWith('/') ? clean || '/login-senha' : `/${clean || 'login-senha'}`;
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

function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text.startsWith(BASE_PATH)) return '';
  if (/^https?:\/\//i.test(text) || text.startsWith('//')) return '';
  return text;
}

function userLabel(user: User): string {
  return cleanText(user.display_name || user.username, 120) || user.username;
}

function encryptPassword(password: string): EncryptedPassword {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptPassword(entry: Pick<EntryRow, 'password_ciphertext' | 'password_iv' | 'password_tag'>): string | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(entry.password_iv, 'base64'));
    decipher.setAuthTag(Buffer.from(entry.password_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(entry.password_ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
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

async function canAccessVault(user: User): Promise<boolean> {
  const username = normalizeUsername(user.username);
  const role = normalizeUsername(user.role);
  if (username === 'adm' || role === 'admin') return true;

  const result = await corePgPool.query<{ can_access: boolean }>(
    `SELECT can_access
       FROM core_user_module_permissions
      WHERE user_id = $1 AND module_key = $2
      LIMIT 1`,
    [user.id, MODULE_KEY],
  );
  return result.rows[0]?.can_access === true;
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
  if (!(await canAccessVault(user))) {
    await auditBlockedAccess(user);
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
  if (!(await canAccessVault(user))) {
    await auditBlockedAccess(user);
    res.status(403).json({ ok: false, error: 'Acesso bloqueado.' });
    return null;
  }
  return user;
}

async function auditBlockedAccess(user: User): Promise<void> {
  await logCoreAudit(user.id, 'login_senha_acesso_bloqueado', 'login_senha', null, 'Tentativa bloqueada no modulo Login / Senha.');
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
    console.error('[login-senha] core audit failed', error instanceof Error ? error.message : 'unknown');
  }
}

async function auditEvent(
  user: User | null,
  action: string,
  entryId: number | string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const safeSummary = cleanText(summary, 500);
  try {
    await pgPool.query(
      `INSERT INTO login_senha_audit_events
        (actor_user_id, actor_username, actor_display_name, action, entry_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        user?.id || null,
        user?.username || null,
        user?.display_name || null,
        action,
        entryId === null ? null : String(entryId),
        safeSummary,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    console.error('[login-senha] audit failed', error instanceof Error ? error.message : 'unknown');
  }

  await logCoreAudit(user?.id || null, action, 'login_senha', entryId, safeSummary, metadata);
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS login_senha_entries (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      login_username TEXT NOT NULL,
      password_ciphertext TEXT NOT NULL,
      password_iv TEXT NOT NULL,
      password_tag TEXT NOT NULL,
      created_by BIGINT,
      updated_by BIGINT,
      archived_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS login_senha_audit_events (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT,
      actor_username TEXT,
      actor_display_name TEXT,
      action VARCHAR(100) NOT NULL,
      entry_id BIGINT,
      summary TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query('ALTER TABLE login_senha_audit_events ADD COLUMN IF NOT EXISTS actor_username TEXT');
  await pgPool.query('ALTER TABLE login_senha_audit_events ADD COLUMN IF NOT EXISTS actor_display_name TEXT');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_login_senha_entries_active_name ON login_senha_entries (LOWER(name)) WHERE archived_at IS NULL');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_login_senha_entries_archived ON login_senha_entries (archived_at DESC) WHERE archived_at IS NOT NULL');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_login_senha_audit_created ON login_senha_audit_events (created_at DESC)');
  await pgPool.query('CREATE INDEX IF NOT EXISTS idx_login_senha_audit_entry ON login_senha_audit_events (entry_id, created_at DESC)');
}

async function listEntries(): Promise<EntryRow[]> {
  const result = await pgPool.query<EntryRow>(
    `SELECT *
       FROM login_senha_entries
      WHERE archived_at IS NULL
      ORDER BY LOWER(name), id`,
  );
  return result.rows;
}

async function loadEntry(id: number, includeArchived = false): Promise<EntryRow | null> {
  const result = await pgPool.query<EntryRow>(
    `SELECT *
       FROM login_senha_entries
      WHERE id = $1
        AND ($2::boolean = true OR archived_at IS NULL)
      LIMIT 1`,
    [id, includeArchived],
  );
  return result.rows[0] || null;
}

async function listAuditEvents(limit = 60): Promise<AuditRow[]> {
  const result = await pgPool.query<AuditRow>(
    `SELECT id::text,
            actor_user_id,
            actor_username,
            actor_display_name,
            action,
            entry_id,
            summary,
            created_at
       FROM login_senha_audit_events
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(100, limit))],
  );
  return result.rows;
}

async function createEntry(req: Request, user: User): Promise<void> {
  const name = cleanText(req.body?.name, 160);
  const loginUsername = cleanText(req.body?.login_username, 240);
  const password = String(req.body?.password ?? '');
  if (!name || !loginUsername || password.length === 0) {
    setFlash(req, 'error', 'Preencha Nome, Login / Usuario e Senha.');
    return;
  }
  if (password.length > 512) {
    setFlash(req, 'error', 'Senha acima do tamanho permitido.');
    return;
  }
  const encrypted = encryptPassword(password);
  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO login_senha_entries
      (name, login_username, password_ciphertext, password_iv, password_tag, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text`,
    [name, loginUsername, encrypted.ciphertext, encrypted.iv, encrypted.tag, user.id],
  );
  const id = result.rows[0]?.id || null;
  await auditEvent(user, 'login_senha_acesso_criado', id, `Acesso criado: ${name}.`, { name, login_username: loginUsername });
  setFlash(req, 'success', 'Acesso salvo.');
}

async function updateEntry(req: Request, user: User): Promise<void> {
  const id = toNumber(req.body?.id);
  const entry = id > 0 ? await loadEntry(id) : null;
  if (!entry) {
    setFlash(req, 'error', 'Acesso nao encontrado.');
    return;
  }

  const name = cleanText(req.body?.name, 160);
  const loginUsername = cleanText(req.body?.login_username, 240);
  const password = String(req.body?.password ?? '');
  if (!name || !loginUsername) {
    setFlash(req, 'error', 'Nome e Login / Usuario sao obrigatorios.');
    return;
  }
  if (password.length > 512) {
    setFlash(req, 'error', 'Senha acima do tamanho permitido.');
    return;
  }

  if (password.length > 0) {
    const encrypted = encryptPassword(password);
    await pgPool.query(
      `UPDATE login_senha_entries
          SET name = $1,
              login_username = $2,
              password_ciphertext = $3,
              password_iv = $4,
              password_tag = $5,
              updated_by = $6,
              updated_at = NOW()
        WHERE id = $7`,
      [name, loginUsername, encrypted.ciphertext, encrypted.iv, encrypted.tag, user.id, id],
    );
  } else {
    await pgPool.query(
      `UPDATE login_senha_entries
          SET name = $1,
              login_username = $2,
              updated_by = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [name, loginUsername, user.id, id],
    );
  }

  await auditEvent(user, 'login_senha_acesso_editado', id, `Acesso editado: ${name}.`, {
    name,
    login_username: loginUsername,
    password_changed: password.length > 0,
  });
  setFlash(req, 'success', 'Acesso atualizado.');
}

async function archiveEntry(req: Request, user: User): Promise<void> {
  const id = toNumber(req.body?.id);
  const entry = id > 0 ? await loadEntry(id) : null;
  if (!entry) {
    setFlash(req, 'error', 'Acesso nao encontrado.');
    return;
  }

  await pgPool.query(
    `UPDATE login_senha_entries
        SET archived_by = $1,
            archived_at = NOW(),
            updated_by = $1,
            updated_at = NOW()
      WHERE id = $2 AND archived_at IS NULL`,
    [user.id, id],
  );
  await auditEvent(user, 'login_senha_acesso_arquivado', id, `Acesso arquivado: ${entry.name}.`, { name: entry.name });
  setFlash(req, 'success', 'Acesso arquivado.');
}

async function handlePost(req: Request, res: Response): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    setFlash(req, 'error', 'Sessao expirada. Reabra a tela e tente novamente.');
    res.redirect(`${BASE_PATH}/`);
    return;
  }

  const action = cleanText(req.body?.action, 40);
  if (action === 'create') {
    await createEntry(req, user);
  } else if (action === 'update') {
    await updateEntry(req, user);
  } else if (action === 'archive') {
    await archiveEntry(req, user);
  } else {
    setFlash(req, 'error', 'Acao invalida.');
  }
  res.redirect(`${BASE_PATH}/`);
}

function renderEntryRows(req: Request, entry: EntryRow, index: number): string {
  const id = toNumber(entry.id);
  const updatedText = entry.updated_at ? `Atualizado em ${e(brDateTime(entry.updated_at))}` : `Criado em ${e(brDateTime(entry.created_at))}`;
  return `
    <tr class="vault-entry-row" data-entry-id="${id}" tabindex="0" aria-expanded="false" aria-controls="vault-entry-editor-${id}">
      <td class="vault-col-index">${index + 1}</td>
      <td class="vault-cell-main">
        <strong>${e(entry.name)}</strong>
        <span>${updatedText}</span>
      </td>
      <td><span class="vault-mono">${e(entry.login_username)}</span></td>
      <td><span class="vault-password-mask">********</span></td>
      <td><span class="vault-pill">Ativo</span></td>
      <td><span class="vault-edit-pill">Editar</span></td>
    </tr>
    <tr class="vault-entry-edit-row" id="vault-entry-editor-${id}" data-entry-id="${id}" hidden>
      <td colspan="6">
        <article class="vault-entry vault-entry-editor" data-entry-id="${id}">
          <form method="post" action="${BASE_PATH}/" class="vault-entry-form" autocomplete="off">
            ${csrfField(req)}
            <input type="hidden" name="action" value="update">
            <input type="hidden" name="id" value="${id}">
            <div class="vault-entry-head">
              <div>
                <span class="vault-kicker">Editar acesso</span>
                <h2>${e(entry.name)}</h2>
                <p>${updatedText}</p>
              </div>
              <span class="vault-status">Clique em salvar para aplicar</span>
            </div>
            <div class="vault-field-grid vault-edit-fields">
              <label>
                <span>Nome</span>
                <input name="name" maxlength="160" value="${e(entry.name)}" required>
              </label>
              <label>
                <span>Login / Usuario</span>
                <input name="login_username" maxlength="240" value="${e(entry.login_username)}" required>
              </label>
              <label>
                <span>Nova senha</span>
                <input name="password" type="password" maxlength="512" placeholder="Deixe em branco para manter" autocomplete="new-password">
              </label>
            </div>
            <div class="vault-secret-row">
              <input class="vault-secret-output" type="password" readonly value="********" aria-label="Senha">
              <button type="button" class="vault-btn vault-btn-soft" data-vault-action="reveal" data-entry-id="${id}">Mostrar</button>
              <button type="button" class="vault-btn vault-btn-soft" data-vault-action="copy-login" data-entry-id="${id}">Copiar login</button>
              <button type="button" class="vault-btn vault-btn-soft" data-vault-action="copy-password" data-entry-id="${id}">Copiar senha</button>
              <button class="vault-btn vault-btn-primary" type="submit">Salvar alteracoes</button>
            </div>
          </form>
          <form method="post" action="${BASE_PATH}/" class="vault-archive-form" data-confirm="Arquivar este acesso?">
            ${csrfField(req)}
            <input type="hidden" name="action" value="archive">
            <input type="hidden" name="id" value="${id}">
            <button class="vault-btn vault-btn-danger" type="submit">Arquivar</button>
          </form>
        </article>
      </td>
    </tr>`;
}

function renderEntryTable(req: Request, entries: EntryRow[]): string {
  if (entries.length === 0) {
    return '<p class="vault-empty">Nenhum acesso ativo cadastrado.</p>';
  }
  return `
    <div class="vault-entry-table-wrap">
      <table class="vault-entry-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>Login / Usuario</th>
            <th>Senha</th>
            <th>Status</th>
            <th>Acao</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry, index) => renderEntryRows(req, entry, index)).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderAuditRows(auditRows: AuditRow[]): string {
  if (auditRows.length === 0) {
    return '<p class="vault-empty">Nenhum evento registrado ainda.</p>';
  }
  return `
    <table class="vault-audit-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Usuario</th>
          <th>Acao</th>
          <th>Resumo</th>
        </tr>
      </thead>
      <tbody>
        ${auditRows.map((row) => {
          const actor = cleanText(row.actor_display_name || row.actor_username || '-', 120);
          return `
            <tr>
              <td>${e(brDateTime(row.created_at))}</td>
              <td>${e(actor)}</td>
              <td><span class="vault-status">${e(row.action)}</span></td>
              <td>${e(row.summary || '')}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderPage(req: Request, user: User, entries: EntryRow[], auditRows: AuditRow[]): string {
  const flash = takeFlash(req);
  const csrf = ensureCsrf(req);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${e(csrf)}">
  <title>Login / Senha - Wimifarma</title>
  <link rel="stylesheet" href="${BASE_PATH}/styles.css?v=20260605c">
  <script src="${BASE_PATH}/app.js?v=20260605b" defer></script>
</head>
<body data-base-path="${e(BASE_PATH)}">
  <header class="vault-topbar">
    <a class="vault-brand" href="/" aria-label="Ir para Home">
      <img src="/wp-content/themes/wimifarma-cashback-theme/assets/img/logo-wimifarma.svg" alt="Wimifarma">
    </a>
    <nav>
      <a href="/">Home</a>
      <span>Login / Senha</span>
    </nav>
  </header>

  <main class="vault-shell">
    <section class="vault-hero">
      <div>
        <span class="vault-kicker">Cofre interno</span>
        <h1>Login / Senha</h1>
        <p>Acessos da farmacia com senha cifrada e auditoria de uso.</p>
      </div>
      <span class="vault-user">Usuario: ${e(userLabel(user))}</span>
    </section>

    ${flash.message ? `<div class="vault-flash vault-flash-${e(flash.type)}">${e(flash.message)}</div>` : ''}

    <section class="vault-panel">
      <div class="vault-panel-head">
        <div>
          <span class="vault-kicker">Novo acesso</span>
          <h2>Cadastrar acesso</h2>
        </div>
      </div>
      <form method="post" action="${BASE_PATH}/" class="vault-create-form" autocomplete="off">
        ${csrfField(req)}
        <input type="hidden" name="action" value="create">
        <div class="vault-field-grid">
          <label>
            <span>Nome</span>
            <input name="name" maxlength="160" placeholder="Ex.: fornecedor, sistema ou portal" required>
          </label>
          <label>
            <span>Login / Usuario</span>
            <input name="login_username" maxlength="240" placeholder="Email, usuario ou codigo" required>
          </label>
          <label>
            <span>Senha</span>
            <input name="password" type="password" maxlength="512" autocomplete="new-password" required>
          </label>
        </div>
        <button class="vault-btn vault-btn-primary" type="submit">Salvar acesso</button>
      </form>
    </section>

    <section class="vault-section">
      <div class="vault-panel-head">
        <div>
          <span class="vault-kicker">Acessos salvos</span>
          <h2>${entries.length} registro(s) ativo(s)</h2>
        </div>
      </div>
      ${renderEntryTable(req, entries)}
    </section>

    <section class="vault-section vault-audit">
      <div class="vault-panel-head">
        <div>
          <span class="vault-kicker">Auditoria</span>
          <h2>Eventos recentes</h2>
        </div>
      </div>
      ${renderAuditRows(auditRows)}
    </section>
  </main>
</body>
</html>`;
}

function setSecurityHeaders(req: Request, res: Response): void {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';");
  if (req.secure || String(req.get('x-forwarded-proto') || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function setStaticAssetCacheHeaders(res: Response, filePath: string): void {
  if (STATIC_ASSET_FILE_RE.test(filePath)) {
    res.setHeader('Cache-Control', STATIC_ASSET_CACHE_CONTROL);
  }
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

app.use((req, res, next) => {
  if (req.path.startsWith(BASE_PATH)) {
    setSecurityHeaders(req, res);
  }
  next();
});

app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.json({ limit: '32kb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(publicDir, {
  index: false,
  dotfiles: 'ignore',
  maxAge: STATIC_ASSET_MAX_AGE_MS,
  setHeaders: setStaticAssetCacheHeaders,
}));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/health.php`], asyncRoute(async (_req, res) => {
  await pgPool.query('SELECT 1');
  await corePgPool.query('SELECT 1');
  res.json({ ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, database: 'ok', core: 'ok' });
}));

app.get(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.redirect(`${BASE_PATH}/`);
}));

app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('WFLOGINSENHA', { path: '/' });
    res.redirect('/');
  });
});

app.get([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const [entries, auditRows] = await Promise.all([listEntries(), listAuditEvents(60)]);
  res.send(renderPage(req, user, entries, auditRows));
}));

app.post([BASE_PATH, `${BASE_PATH}/`, `${BASE_PATH}/index.php`], asyncRoute(handlePost));

app.post(`${BASE_PATH}/api/entries/:id/reveal`, asyncRoute(async (req, res) => {
  const user = await requireJsonUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    res.status(403).json({ ok: false, error: 'CSRF invalido.' });
    return;
  }
  const id = toNumber(req.params.id);
  const entry = id > 0 ? await loadEntry(id) : null;
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Acesso nao encontrado.' });
    return;
  }
  const password = decryptPassword(entry);
  if (password === null) {
    await auditEvent(user, 'login_senha_senha_indisponivel', id, `Senha indisponivel para: ${entry.name}.`, { name: entry.name });
    res.status(500).json({ ok: false, error: 'Senha indisponivel. Confira a chave do cofre.' });
    return;
  }
  await auditEvent(user, 'login_senha_senha_visualizada', id, `Senha visualizada: ${entry.name}.`, { name: entry.name });
  res.json({ ok: true, password });
}));

app.post(`${BASE_PATH}/api/entries/:id/copy-login`, asyncRoute(async (req, res) => {
  const user = await requireJsonUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    res.status(403).json({ ok: false, error: 'CSRF invalido.' });
    return;
  }
  const id = toNumber(req.params.id);
  const entry = id > 0 ? await loadEntry(id) : null;
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Acesso nao encontrado.' });
    return;
  }
  await auditEvent(user, 'login_senha_login_copiado', id, `Login copiado: ${entry.name}.`, { name: entry.name });
  res.json({ ok: true, login_username: entry.login_username });
}));

app.post(`${BASE_PATH}/api/entries/:id/copy-password`, asyncRoute(async (req, res) => {
  const user = await requireJsonUser(req, res);
  if (!user) return;
  if (!csrfMatches(req)) {
    res.status(403).json({ ok: false, error: 'CSRF invalido.' });
    return;
  }
  const id = toNumber(req.params.id);
  const entry = id > 0 ? await loadEntry(id) : null;
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Acesso nao encontrado.' });
    return;
  }
  const password = decryptPassword(entry);
  if (password === null) {
    await auditEvent(user, 'login_senha_senha_indisponivel', id, `Senha indisponivel para: ${entry.name}.`, { name: entry.name });
    res.status(500).json({ ok: false, error: 'Senha indisponivel. Confira a chave do cofre.' });
    return;
  }
  await auditEvent(user, 'login_senha_senha_copiada', id, `Senha copiada: ${entry.name}.`, { name: entry.name });
  res.json({ ok: true, password });
}));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error('[login-senha] request failed', error instanceof Error ? error.message : 'unknown');
  if (req.path.startsWith(`${BASE_PATH}/api/`)) {
    res.status(500).json({ ok: false, error: 'Erro interno.' });
    return;
  }
  res.status(500).send('Erro interno.');
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[login-senha] listening on ${PORT} at ${BASE_PATH}`);
    });
  })
  .catch((error) => {
    console.error('[login-senha] failed to start', error instanceof Error ? error.message : 'unknown');
    process.exitCode = 1;
  });
