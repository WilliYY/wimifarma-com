import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { RedisStore } from 'connect-redis';
import express from 'express';
import session from 'express-session';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { createClient } from 'redis';
import { Server } from 'socket.io';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const env = process.env;
const BASE_PATH = env.BASE_PATH || '/cotacao';
const PORT = Number(env.PORT || 3000);
const SESSION_SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DEFAULT_QUOTE_NAME = 'Cotacao atual';

const app = express();
const server = http.createServer(app);
const redis = createClient({ url: env.REDIS_URL || 'redis://127.0.0.1:6379' });
const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_cotacao',
  user: env.POSTGRES_USER || 'wimifarma_cotacao',
  password: env.POSTGRES_PASSWORD || '',
  max: 12
});
const mysqlPool = mysql.createPool({
  host: env.MYSQL_HOST || '127.0.0.1',
  port: Number(env.MYSQL_PORT || 3306),
  database: env.MYSQL_DATABASE || 'wimifarma_app',
  user: env.MYSQL_USER || 'wimifarma_user',
  password: env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4'
});

redis.on('error', (error) => {
  console.error('[cotacao] redis error', error);
});

const sessionMiddleware = session({
  name: 'WFCOTACAOV2',
  secret: SESSION_SECRET,
  store: new RedisStore({ client: redis, prefix: 'cotacao:sess:' }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 10
  }
});

const io = new Server(server, {
  path: `${BASE_PATH}/socket.io`,
  serveClient: true,
  transports: ['websocket', 'polling']
});

app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '2mb' }));
app.use(sessionMiddleware);
app.use(BASE_PATH, express.static(path.join(rootDir, 'public'), { index: false, maxAge: '1h' }));

io.engine.use(sessionMiddleware);
io.use((socket, next) => {
  const sessionUser = socket.request.session?.user;
  if (!sessionUser) {
    return next(new Error('unauthorized'));
  }
  socket.user = sessionUser;
  return next();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, task) {
  let lastError;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.warn(`[cotacao] waiting for ${label} (${attempt}/40): ${error.message}`);
      await sleep(1000);
    }
  }
  throw lastError;
}

function ensureCsrf(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function verifyCsrf(req, res, next) {
  const expected = req.session.csrfToken;
  const received = req.get('x-csrf-token') || req.body?.csrf_token;
  if (!expected || !received || expected !== received) {
    return res.status(403).json({ ok: false, error: 'Sessao expirada. Recarregue a pagina.' });
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect(`${BASE_PATH}/login.php`);
  }
  return next();
}

function requireApiAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, error: 'Login necessario.' });
  }
  return next();
}

function normalizeHash(hash) {
  return String(hash || '').replace(/^\$2y\$/, '$2a$');
}

function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function userPublic(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'user'
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function authenticate(username, password) {
  const [rows] = await mysqlPool.query(
    'SELECT id, username, password_hash, role, active FROM wf_users WHERE username = ? AND active = 1 LIMIT 1',
    [username]
  );
  const user = rows[0];
  if (!user || !user.password_hash) {
    return null;
  }
  const ok = await bcrypt.compare(password, normalizeHash(user.password_hash));
  return ok ? userPublic(user) : null;
}

async function ensureSchema() {
  await pgPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_quotes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_columns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      key text NOT NULL,
      label text NOT NULL,
      type text NOT NULL DEFAULT 'text',
      position integer NOT NULL DEFAULT 0,
      width integer NOT NULL DEFAULT 160,
      locked boolean NOT NULL DEFAULT false,
      options jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cotacao_v2_columns_quote_key_idx
    ON cotacao_v2_columns (quote_id, key)
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_rows (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      position integer NOT NULL DEFAULT 0,
      values jsonb NOT NULL DEFAULT '{}'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      version bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS cotacao_v2_rows_quote_position_idx
    ON cotacao_v2_rows (quote_id, position, id)
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_events (
      id bigserial PRIMARY KEY,
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      type text NOT NULL,
      row_id uuid NULL,
      column_key text NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      user_id integer NULL,
      username text NULL,
      client_id text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS cotacao_v2_events_quote_id_idx
    ON cotacao_v2_events (quote_id, id)
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      name text NOT NULL,
      target text NOT NULL DEFAULT 'row',
      column_key text NOT NULL DEFAULT 'categoria',
      operator text NOT NULL DEFAULT 'contains',
      value text NOT NULL DEFAULT '',
      background text NOT NULL DEFAULT '#fff7ed',
      color text NOT NULL DEFAULT '#7c2d12',
      enabled boolean NOT NULL DEFAULT true,
      priority integer NOT NULL DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const quote = await getOrCreateDefaultQuote();
  await seedColumns(quote.id);
  await seedRows(quote.id);
}

async function getOrCreateDefaultQuote() {
  const current = await pgPool.query(
    "SELECT * FROM cotacao_v2_quotes WHERE status = 'active' ORDER BY created_at ASC LIMIT 1"
  );
  if (current.rows[0]) {
    return current.rows[0];
  }
  const created = await pgPool.query(
    'INSERT INTO cotacao_v2_quotes (name) VALUES ($1) RETURNING *',
    [DEFAULT_QUOTE_NAME]
  );
  return created.rows[0];
}

async function seedColumns(quoteId) {
  const columns = [
    ['ean', 'EAN', 'text', 1, 130, true, {}],
    ['produto', 'PRODUTO', 'text', 2, 270, false, {}],
    ['quantidade', 'QUANTIDADE', 'number', 3, 120, false, {}],
    ['categoria', 'CATEGORIA', 'text', 4, 210, false, {}],
    ['fornecedor_1', 'Anb', 'currency', 5, 150, false, { tone: 'supplier-yellow' }],
    ['fornecedor_2', 'Profarma', 'currency', 6, 150, false, { tone: 'supplier-blue' }],
    ['fornecedor_3', 'mauro', 'currency', 7, 150, false, { tone: 'supplier-green' }],
    ['fornecedor_4', 'arthur', 'currency', 8, 150, false, { tone: 'supplier-rose' }],
    ['fornecedor_5', 'Santa', 'currency', 9, 150, false, { tone: 'supplier-purple' }],
    ['fornecedor_6', 'tom', 'currency', 10, 150, false, { tone: 'supplier-orange' }],
    ['fornecedor_7', 'cimed', 'currency', 11, 150, false, { tone: 'supplier-yellow' }],
    ['quem_ganhou', 'QUEM GANHOU', 'text', 12, 190, false, { fallback: 'Sem vencedor', tone: 'winner' }]
  ];
  for (const column of columns) {
    await pgPool.query(
      `INSERT INTO cotacao_v2_columns (quote_id, key, label, type, position, width, locked, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (quote_id, key)
       DO UPDATE SET label = EXCLUDED.label,
                     type = EXCLUDED.type,
                     position = EXCLUDED.position,
                     width = EXCLUDED.width,
                     locked = EXCLUDED.locked,
                     options = EXCLUDED.options,
                     updated_at = now()`,
      [quoteId, ...column.slice(0, 6), JSON.stringify(column[6] || {})]
    );
  }

  await pgPool.query(
    `UPDATE cotacao_v2_columns
     SET options = jsonb_set(COALESCE(options, '{}'::jsonb), '{hidden}', 'true'::jsonb, true),
         position = 999,
         updated_at = now()
     WHERE quote_id = $1
       AND key = ANY($2::text[])`,
    [quoteId, ['observacao', 'status']]
  );
}

async function seedRows(quoteId) {
  const count = await pgPool.query('SELECT COUNT(*)::int AS total FROM cotacao_v2_rows WHERE quote_id = $1', [quoteId]);
  if (count.rows[0].total > 0) {
    return;
  }
  await addRows(quoteId, 20, []);
}

async function loadSheet() {
  const quote = await getOrCreateDefaultQuote();
  const [columns, rows, rules, lastEvent] = await Promise.all([
    pgPool.query(
      `SELECT * FROM cotacao_v2_columns
       WHERE quote_id = $1
         AND COALESCE((options->>'hidden')::boolean, false) = false
       ORDER BY position ASC, label ASC`,
      [quote.id]
    ),
    pgPool.query('SELECT * FROM cotacao_v2_rows WHERE quote_id = $1 ORDER BY position ASC, id ASC', [quote.id]),
    pgPool.query('SELECT * FROM cotacao_v2_rules WHERE quote_id = $1 ORDER BY priority ASC, created_at ASC', [quote.id]),
    pgPool.query('SELECT COALESCE(MAX(id), 0)::bigint AS id FROM cotacao_v2_events WHERE quote_id = $1', [quote.id])
  ]);
  return {
    quote,
    columns: columns.rows,
    rows: rows.rows.map((row) => ({
      id: row.id,
      position: row.position,
      values: row.values || {},
      version: Number(row.version),
      updatedAt: row.updated_at
    })),
    rules: rules.rows,
    lastEventId: Number(lastEvent.rows[0].id)
  };
}

async function addRows(quoteId, count, valuesList) {
  const maxPosition = await pgPool.query(
    'SELECT COALESCE(MAX(position), 0)::int AS position FROM cotacao_v2_rows WHERE quote_id = $1',
    [quoteId]
  );
  const rows = [];
  const total = Math.max(1, Math.min(Number(count || valuesList.length || 1), 200));
  for (let index = 0; index < total; index += 1) {
    const values = valuesList[index] || {};
    const inserted = await pgPool.query(
      `INSERT INTO cotacao_v2_rows (quote_id, position, values)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, position, values, version, updated_at`,
      [quoteId, maxPosition.rows[0].position + index + 1, JSON.stringify(values)]
    );
    rows.push({
      id: inserted.rows[0].id,
      position: inserted.rows[0].position,
      values: inserted.rows[0].values || {},
      version: Number(inserted.rows[0].version),
      updatedAt: inserted.rows[0].updated_at
    });
  }
  return rows;
}

async function appendEvent({ quoteId, type, rowId = null, columnKey = null, payload = {}, user, clientId = null }) {
  const result = await pgPool.query(
    `INSERT INTO cotacao_v2_events (quote_id, type, row_id, column_key, payload, user_id, username, client_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING id, created_at`,
    [quoteId, type, rowId, columnKey, JSON.stringify(payload), user?.id || null, user?.username || null, clientId]
  );
  return result.rows[0];
}

async function activePresence(quoteId) {
  const keys = await redis.keys(`cotacao:presence:${quoteId}:*`);
  if (!keys.length) {
    return [];
  }
  const values = await redis.mGet(keys);
  return values
    .filter(Boolean)
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));
}

function renderLogin(req, error = '') {
  const csrf = ensureCsrf(req);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wimifarma Cotacao</title>
  <link rel="icon" href="${BASE_PATH}/favicon.svg">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css">
</head>
<body class="login-page">
  <main class="login-shell">
    <section class="login-card">
      <img class="login-logo" src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
      <span class="login-kicker">Wimifarma Cotacao</span>
      <h1>Acesso da equipe</h1>
      <p>Entre para comparar fornecedores, precos e prioridades de compra.</p>
      ${error ? `<div class="login-alert">${e(error)}</div>` : ''}
      <form method="post" action="${BASE_PATH}/login.php" autocomplete="on">
        <input type="hidden" name="csrf_token" value="${e(csrf)}">
        <label>Usuario
          <input name="username" autocomplete="username" required autofocus>
        </label>
        <label>Senha
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Entrar na cotacao</button>
      </form>
    </section>
    <img class="login-runner login-runner-cat" src="${BASE_PATH}/assets/gato-hapy.gif" alt="">
  </main>
</body>
</html>`;
}

function renderApp(req) {
  const csrf = ensureCsrf(req);
  const user = userPublic(req.session.user);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${e(csrf)}">
  <title>Cotacao Wimifarma</title>
  <link rel="icon" href="${BASE_PATH}/favicon.svg">
  <link rel="stylesheet" href="${BASE_PATH}/styles.css">
</head>
<body class="app-page">
  <header class="app-header">
    <div class="app-brandline">
    <a class="brand" href="/">
      <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
    </a>
      <strong>Cotacao</strong>
    </div>
    <nav class="view-tabs" aria-label="Atalhos da cotacao">
      <button type="button" class="view-tab is-active" data-view-category="">Cotacao Geral</button>
      <button type="button" class="view-tab" data-view-category="Farmacia Popular">Farmacia Popular</button>
      <button type="button" class="view-tab" data-view-category="Bebe">Bebe</button>
      <button type="button" class="view-tab" id="exportCsvButton">Baixar .csv</button>
      <a href="${BASE_PATH}/logout.php">Sair</a>
    </nav>
  </header>
  <main class="sheet-shell" data-user-id="${e(user.id)}" data-username="${e(user.username)}">
    <section class="sheet-topline">
      <div>
        <span class="kicker">Wimifarma Cotacao</span>
        <h1 id="viewTitle">Cotacao Geral</h1>
      </div>
      <div class="sheet-stats">
        <span id="rowCountBadge">0 linha(s) com dados</span>
        <strong id="presenceCount">1 pessoa usando</strong>
        <span id="userBadge">Usuario: ${e(user.username)}</span>
      </div>
    </section>

    <section class="toolbar" aria-label="Ferramentas da cotacao">
      <button type="button" id="addRowsButton">Adicionar linhas</button>
      <button type="button" id="importButton">Colar do Sheets</button>
      <button type="button" id="rulesButton">Formatacao condicional</button>
      <div class="presence-inline" id="presenceList"></div>
      <label class="toolbar-field">Busca
        <input id="searchInput" type="search" placeholder="EAN, produto, categoria...">
      </label>
      <label class="toolbar-field">Categoria
        <select id="categoryFilter">
          <option value="">Todas</option>
        </select>
      </label>
      <span id="saveStatus" class="save-status">Sincronizado</span>
    </section>

    <section class="sheet-wrap" aria-label="Planilha de cotacao">
      <table class="sheet-table" id="sheetTable"></table>
    </section>
  </main>

  <dialog id="importDialog">
    <form method="dialog" class="dialog-card">
      <h2>Colar linhas</h2>
      <p>Cole linhas copiadas do Sheets. A ordem das colunas segue a tabela atual.</p>
      <textarea id="importText" rows="10"></textarea>
      <div class="dialog-actions">
        <button type="button" id="confirmImport">Importar</button>
        <button type="submit">Cancelar</button>
      </div>
    </form>
  </dialog>

  <dialog id="rulesDialog">
    <form method="dialog" class="dialog-card">
      <h2>Formatacao condicional</h2>
      <p>Regras so valem quando criadas aqui. Palavras como urgente ou encomenda nao tem gatilho escondido.</p>
      <div class="rules-form">
        <label>Coluna
          <select id="ruleColumn"></select>
        </label>
        <label>Operador
          <select id="ruleOperator">
            <option value="contains">Contem</option>
            <option value="equals">Igual</option>
            <option value="starts">Comeca com</option>
          </select>
        </label>
        <label>Texto
          <input id="ruleValue" type="text">
        </label>
        <label>Fundo
          <input id="ruleBg" type="color" value="#fff7ed">
        </label>
        <label>Texto
          <input id="ruleColor" type="color" value="#7c2d12">
        </label>
        <button type="button" id="addRuleButton">Criar regra</button>
      </div>
      <div id="rulesList" class="rules-list"></div>
      <div class="dialog-actions">
        <button type="submit">Fechar</button>
      </div>
    </form>
  </dialog>

  <script>
    window.COTACAO_CONFIG = ${JSON.stringify({ basePath: BASE_PATH, user })};
  </script>
  <script src="${BASE_PATH}/socket.io/socket.io.js"></script>
  <script src="${BASE_PATH}/app.js"></script>
</body>
</html>`;
}

app.get(`${BASE_PATH}/health`, asyncRoute(async (_req, res) => {
  const quote = await getOrCreateDefaultQuote();
  res.json({ ok: true, service: 'cotacao-v2', quote_id: quote.id });
}));

app.get(BASE_PATH, (req, res, next) => {
  if (req.originalUrl === BASE_PATH) {
    return res.redirect(`${BASE_PATH}/`);
  }
  return next();
});
app.get(`${BASE_PATH}/login`, (req, res) => res.type('html').send(renderLogin(req)));
app.get(`${BASE_PATH}/login.php`, (req, res) => res.type('html').send(renderLogin(req)));
app.post(`${BASE_PATH}/login.php`, asyncRoute(async (req, res) => {
  const expected = req.session.csrfToken;
  if (!expected || expected !== req.body.csrf_token) {
    return res.status(403).type('html').send(renderLogin(req, 'Sessao expirada. Recarregue e tente novamente.'));
  }
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = await authenticate(username, password);
  if (!user) {
    return res.status(401).type('html').send(renderLogin(req, 'Usuario ou senha invalidos.'));
  }
  req.session.user = user;
  req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return res.redirect(`${BASE_PATH}/`);
}));
app.get(`${BASE_PATH}/logout.php`, (req, res) => {
  req.session.destroy(() => res.redirect(`${BASE_PATH}/login.php`));
});
app.get(`${BASE_PATH}/index.php`, requireAuth, (_req, res) => res.redirect(`${BASE_PATH}/`));
app.get(`${BASE_PATH}/`, requireAuth, (req, res) => res.type('html').send(renderApp(req)));

app.get(`${BASE_PATH}/api/bootstrap`, requireApiAuth, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const presence = await activePresence(sheet.quote.id);
  res.json({ ok: true, ...sheet, presence, user: userPublic(req.session.user) });
}));

app.post(`${BASE_PATH}/api/rows`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const valuesList = Array.isArray(req.body.rows) ? req.body.rows : [];
  const rows = await addRows(sheet.quote.id, req.body.count || valuesList.length || 1, valuesList);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'rows_added',
    payload: { rows },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('rows:added', { rows, eventId: Number(event.id), clientId });
  res.json({ ok: true, rows, eventId: Number(event.id) });
}));

app.patch(`${BASE_PATH}/api/cells`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const rowId = String(req.body.rowId || '');
  const columnKey = String(req.body.columnKey || '');
  const value = String(req.body.value ?? '');
  const clientId = String(req.body.clientId || '');
  const allowed = new Set(sheet.columns.map((column) => column.key));
  if (!rowId || !allowed.has(columnKey)) {
    return res.status(422).json({ ok: false, error: 'Celula invalida.' });
  }
  const updated = await pgPool.query(
    `UPDATE cotacao_v2_rows
     SET values = jsonb_set(COALESCE(values, '{}'::jsonb), ARRAY[$2], to_jsonb($3::text), true),
         version = version + 1,
         updated_at = now()
     WHERE id = $1 AND quote_id = $4
     RETURNING id, position, values, version, updated_at`,
    [rowId, columnKey, value, sheet.quote.id]
  );
  const row = updated.rows[0];
  if (!row) {
    return res.status(404).json({ ok: false, error: 'Linha nao encontrada.' });
  }
  const payload = {
    rowId: row.id,
    columnKey,
    value,
    version: Number(row.version),
    updatedAt: row.updated_at
  };
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'cell_updated',
    rowId: row.id,
    columnKey,
    payload,
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('cell:update', {
    ...payload,
    eventId: Number(event.id),
    user: userPublic(req.session.user),
    clientId
  });
  return res.json({ ok: true, ...payload, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/rules`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const columnKey = String(req.body.columnKey || 'categoria');
  const allowed = new Set(sheet.columns.map((column) => column.key));
  if (!allowed.has(columnKey)) {
    return res.status(422).json({ ok: false, error: 'Coluna invalida.' });
  }
  const value = String(req.body.value || '').trim();
  if (!value) {
    return res.status(422).json({ ok: false, error: 'Informe o texto da regra.' });
  }
  const result = await pgPool.query(
    `INSERT INTO cotacao_v2_rules (quote_id, name, target, column_key, operator, value, background, color, priority)
     VALUES ($1, $2, 'row', $3, $4, $5, $6, $7, 100)
     RETURNING *`,
    [
      sheet.quote.id,
      `Regra ${value}`,
      columnKey,
      String(req.body.operator || 'contains'),
      value,
      String(req.body.background || '#fff7ed'),
      String(req.body.color || '#7c2d12')
    ]
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'rule_created',
    payload: { rule: result.rows[0] },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('rules:update', { rules: [result.rows[0]], mode: 'created', eventId: Number(event.id) });
  res.json({ ok: true, rule: result.rows[0], eventId: Number(event.id) });
}));

app.delete(`${BASE_PATH}/api/rules/:id`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const id = String(req.params.id || '');
  await pgPool.query('DELETE FROM cotacao_v2_rules WHERE id = $1 AND quote_id = $2', [id, sheet.quote.id]);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'rule_deleted',
    payload: { id },
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('rules:update', { id, mode: 'deleted', eventId: Number(event.id) });
  res.json({ ok: true, id, eventId: Number(event.id) });
}));

io.on('connection', (socket) => {
  socket.on('join', async ({ quoteId, clientId }) => {
    if (!quoteId || !clientId) {
      return;
    }
    socket.quoteId = String(quoteId);
    socket.clientId = String(clientId);
    socket.join(`quote:${socket.quoteId}`);
    await updatePresence(socket, {});
  });

  socket.on('presence:update', async (payload = {}) => {
    if (!socket.quoteId || !socket.clientId) {
      return;
    }
    await updatePresence(socket, payload);
  });

  socket.on('disconnect', async () => {
    if (socket.quoteId && socket.clientId) {
      await redis.del(`cotacao:presence:${socket.quoteId}:${socket.clientId}`);
      const presence = await activePresence(socket.quoteId);
      io.to(`quote:${socket.quoteId}`).emit('presence:update', presence);
    }
  });
});

async function updatePresence(socket, payload) {
  const item = {
    clientId: socket.clientId,
    userId: socket.user.id,
    username: socket.user.username,
    role: socket.user.role || 'user',
    rowId: payload.rowId || null,
    columnKey: payload.columnKey || null,
    filter: payload.filter || null,
    editing: Boolean(payload.editing),
    updatedAt: new Date().toISOString()
  };
  await redis.set(`cotacao:presence:${socket.quoteId}:${socket.clientId}`, JSON.stringify(item), { EX: 30 });
  const presence = await activePresence(socket.quoteId);
  io.to(`quote:${socket.quoteId}`).emit('presence:update', presence);
}

app.use((error, _req, res, _next) => {
  console.error('[cotacao] request error', error);
  const status = Number(error.statusCode || error.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: status === 400 ? 'Requisicao invalida.' : 'Erro interno da cotacao.'
  });
});

async function start() {
  await withRetry('redis', () => redis.connect());
  await withRetry('postgres', () => pgPool.query('SELECT 1'));
  await withRetry('mysql', () => mysqlPool.query('SELECT 1'));
  await ensureSchema();
  server.listen(PORT, () => {
    console.log(`[cotacao] listening on ${PORT}${BASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('[cotacao] startup failed', error);
  process.exit(1);
});
