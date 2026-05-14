import crypto from 'node:crypto';
import fs from 'node:fs/promises';
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
const BACKUP_DIR = env.COTACAO_BACKUP_DIR || path.join(rootDir, 'backups');
const GOOGLE_SHEETS_SPREADSHEET_ID = env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
const GOOGLE_SHEETS_RANGE = env.GOOGLE_SHEETS_RANGE || 'Cotacao!A1:Z500';
const GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || '';
const GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE || '';
const PAINT_SWATCHES = [
  ['Vermelho escuro', '#7f1d1d'], ['Vermelho forte', '#b91c1c'], ['Vermelho', '#ef4444'], ['Vermelho medio', '#f87171'], ['Vermelho claro', '#fca5a5'], ['Vermelho pastel', '#fecaca'], ['Vermelho suave', '#fee2e2'],
  ['Marrom escuro', '#451a03'], ['Marrom forte', '#78350f'], ['Marrom', '#92400e'], ['Marrom medio', '#b45309'], ['Marrom claro', '#fdba74'], ['Marrom pastel', '#fed7aa'], ['Marrom suave', '#ffedd5'],
  ['Amarelo escuro', '#713f12'], ['Amarelo forte', '#ca8a04'], ['Amarelo', '#eab308'], ['Amarelo medio', '#fde047'], ['Amarelo claro', '#fef08a'], ['Amarelo pastel', '#fef3c7'], ['Amarelo suave', '#fef9c3'],
  ['Verde escuro', '#14532d'], ['Verde forte', '#15803d'], ['Verde', '#22c55e'], ['Verde medio', '#86efac'], ['Verde claro', '#bbf7d0'], ['Verde pastel', '#d1fae5'], ['Verde suave', '#dcfce7'],
  ['Ciano escuro', '#164e63'], ['Ciano forte', '#0891b2'], ['Ciano', '#06b6d4'], ['Ciano medio', '#67e8f9'], ['Ciano claro', '#a5f3fc'], ['Ciano pastel', '#bae6fd'], ['Ciano suave', '#cffafe'],
  ['Azul escuro', '#1e3a8a'], ['Azul forte', '#1d4ed8'], ['Azul', '#3b82f6'], ['Azul medio', '#93c5fd'], ['Azul claro', '#bfdbfe'], ['Azul pastel', '#dbeafe'], ['Azul suave', '#eff6ff'],
  ['Roxo escuro', '#581c87'], ['Roxo forte', '#7e22ce'], ['Roxo', '#a855f7'], ['Roxo medio', '#c084fc'], ['Roxo claro', '#ddd6fe'], ['Roxo pastel', '#ede9fe'], ['Roxo suave', '#f5f3ff'],
  ['Rosa escuro', '#831843'], ['Rosa forte', '#be185d'], ['Rosa', '#ec4899'], ['Rosa medio', '#f9a8d4'], ['Rosa claro', '#fbcfe8'], ['Rosa pastel', '#fce7f3'], ['Rosa suave', '#fdf2f8'],
  ['Cinza escuro', '#0f172a'], ['Cinza forte', '#334155'], ['Cinza', '#64748b'], ['Cinza medio', '#94a3b8'], ['Cinza claro', '#cbd5e1'], ['Cinza pastel', '#e2e8f0'], ['Cinza suave', '#f1f5f9']
];

const PERFORMANCE_INDEXES = [
  {
    name: 'cotacao_v2_events_quote_id_idx',
    table: 'cotacao_v2_events',
    purpose: 'eventos incrementais por cotacao e cursor'
  },
  {
    name: 'cotacao_v2_quotes_status_created_idx',
    table: 'cotacao_v2_quotes',
    purpose: 'cotacao ativa por status e data'
  },
  {
    name: 'cotacao_v2_columns_visible_quote_position_idx',
    table: 'cotacao_v2_columns',
    purpose: 'colunas visiveis do snapshot em ordem'
  },
  {
    name: 'cotacao_v2_rows_active_quote_position_idx',
    table: 'cotacao_v2_rows',
    purpose: 'linhas ativas do snapshot em ordem'
  },
  {
    name: 'cotacao_v2_rules_quote_priority_idx',
    table: 'cotacao_v2_rules',
    purpose: 'regras condicionais em ordem de prioridade'
  },
  {
    name: 'cotacao_v2_styles_quote_updated_idx',
    table: 'cotacao_v2_styles',
    purpose: 'estilos manuais em ordem de atualizacao'
  }
];

const PERFORMANCE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS cotacao_v2_quotes_status_created_idx
   ON cotacao_v2_quotes (status, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS cotacao_v2_columns_visible_quote_position_idx
   ON cotacao_v2_columns (quote_id, position, label, key)
   WHERE COALESCE((options->>'hidden')::boolean, false) = false`,
  `CREATE INDEX IF NOT EXISTS cotacao_v2_rows_active_quote_position_idx
   ON cotacao_v2_rows (quote_id, position, id)
   WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS cotacao_v2_rules_quote_priority_idx
   ON cotacao_v2_rules (quote_id, priority, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS cotacao_v2_styles_quote_updated_idx
   ON cotacao_v2_styles (quote_id, updated_at, id)`
];
const DELTA_EVENT_LIMIT = Math.max(20, Math.min(1000, Number.parseInt(env.COTACAO_DELTA_EVENT_LIMIT || '250', 10) || 250));
const SNAPSHOT_EVENT_TYPES = new Set([
  'column_created',
  'column_renamed',
  'column_moved',
  'column_deleted',
  'column_restored',
  'column_resized',
  'google_sheets_imported',
  'backup_restored'
]);

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
app.use(BASE_PATH, express.static(path.join(rootDir, 'public'), {
  index: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

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

function renderPaintSwatches() {
  return PAINT_SWATCHES
    .map(([name, color]) => `<button type="button" class="paint-swatch" data-color="${e(color)}" style="--swatch:${e(color)}" title="${e(name)}"></button>`)
    .join('');
}

function normalizeRuleOperator(value) {
  const operator = String(value || 'contains');
  return ['contains', 'equals', 'starts'].includes(operator) ? operator : 'contains';
}

function normalizeHexColor(value, fallback = '#fff7ed') {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
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
  await pgPool.query('ALTER TABLE cotacao_v2_rows ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL');
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
      show_timestamp boolean NOT NULL DEFAULT false,
      enabled boolean NOT NULL DEFAULT true,
      priority integer NOT NULL DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query('ALTER TABLE cotacao_v2_rules ADD COLUMN IF NOT EXISTS show_timestamp boolean NOT NULL DEFAULT false');
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_styles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      style_key text NOT NULL,
      scope text NOT NULL,
      row_id uuid NULL,
      column_key text NULL,
      background text NOT NULL DEFAULT '',
      color text NOT NULL DEFAULT '',
      updated_by text NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cotacao_v2_styles_quote_key_idx
    ON cotacao_v2_styles (quote_id, style_key)
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cotacao_v2_column_audit (
      id bigserial PRIMARY KEY,
      quote_id uuid NOT NULL REFERENCES cotacao_v2_quotes(id) ON DELETE CASCADE,
      column_key text NOT NULL,
      action text NOT NULL,
      before jsonb NOT NULL DEFAULT '{}'::jsonb,
      after jsonb NOT NULL DEFAULT '{}'::jsonb,
      user_id integer NULL,
      username text NULL,
      client_id text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS cotacao_v2_column_audit_quote_idx
    ON cotacao_v2_column_audit (quote_id, created_at DESC)
  `);
  await ensurePerformanceIndexes();

  const quote = await getOrCreateDefaultQuote();
  await seedColumns(quote.id);
  await seedRows(quote.id);
}

async function ensurePerformanceIndexes() {
  for (const statement of PERFORMANCE_INDEX_STATEMENTS) {
    await pgPool.query(statement);
  }
}

async function listExpectedPerformanceIndexes() {
  const names = PERFORMANCE_INDEXES.map((index) => index.name);
  const result = await pgPool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])`,
    [names]
  );
  const found = new Set(result.rows.map((row) => row.indexname));
  return PERFORMANCE_INDEXES.map((index) => ({
    ...index,
    exists: found.has(index.name)
  }));
}

function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch (_error) {
    return null;
  }
}

function parseEventCursor(value) {
  const cursor = Number.parseInt(String(value ?? '0'), 10);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

async function loadEventDelta(quoteId, after) {
  const latest = await pgPool.query(
    'SELECT COALESCE(MAX(id), 0)::bigint AS id FROM cotacao_v2_events WHERE quote_id = $1',
    [quoteId]
  );
  const latestEventId = Number(latest.rows[0]?.id || 0);
  if (after >= latestEventId) {
    return {
      events: [],
      latestEventId,
      pendingEvents: 0,
      requiresSnapshot: false,
      reason: ''
    };
  }

  const count = await pgPool.query(
    'SELECT COUNT(*)::int AS total FROM cotacao_v2_events WHERE quote_id = $1 AND id > $2',
    [quoteId, after]
  );
  const pendingEvents = Number(count.rows[0]?.total || 0);
  if (pendingEvents > DELTA_EVENT_LIMIT) {
    return {
      events: [],
      latestEventId,
      pendingEvents,
      requiresSnapshot: true,
      reason: 'event_limit'
    };
  }

  const result = await pgPool.query(
    `SELECT id,
            type,
            row_id AS "rowId",
            column_key AS "columnKey",
            payload,
            user_id AS "userId",
            username,
            client_id AS "clientId",
            created_at AS "createdAt"
     FROM cotacao_v2_events
     WHERE quote_id = $1
       AND id > $2
     ORDER BY id ASC
     LIMIT $3`,
    [quoteId, after, DELTA_EVENT_LIMIT]
  );
  const snapshotEvent = result.rows.find((event) => SNAPSHOT_EVENT_TYPES.has(event.type));
  if (snapshotEvent) {
    return {
      events: [],
      latestEventId,
      pendingEvents,
      requiresSnapshot: true,
      reason: 'snapshot_event',
      snapshotEvent: {
        id: Number(snapshotEvent.id),
        type: snapshotEvent.type
      }
    };
  }

  return {
    events: result.rows.map((event) => ({ ...event, id: Number(event.id) })),
    latestEventId,
    pendingEvents,
    requiresSnapshot: false,
    reason: ''
  };
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
    ['ean', 'EAN', 'text', 1, 130, true, { fixed: true }],
    ['produto', 'PRODUTO', 'text', 2, 280, true, { fixed: true }],
    ['quantidade', 'QUANTIDADE', 'number', 3, 130, true, { fixed: true }],
    ['categoria', 'CATEGORIA', 'text', 4, 210, true, { fixed: true }],
    ['fornecedor_1', 'Anb', 'currency', 5, 150, false, { kind: 'distributor', tone: 'supplier-yellow' }],
    ['fornecedor_2', 'Profarma', 'currency', 6, 150, false, { kind: 'distributor', tone: 'supplier-blue' }],
    ['fornecedor_3', 'mauro', 'currency', 7, 150, false, { kind: 'distributor', tone: 'supplier-green' }],
    ['fornecedor_4', 'arthur', 'currency', 8, 150, false, { kind: 'distributor', tone: 'supplier-rose' }],
    ['fornecedor_5', 'Santa', 'currency', 9, 150, false, { kind: 'distributor', tone: 'supplier-purple' }],
    ['fornecedor_6', 'tom', 'currency', 10, 150, false, { kind: 'distributor', tone: 'supplier-orange' }],
    ['fornecedor_7', 'cimed', 'currency', 11, 150, false, { kind: 'distributor', tone: 'supplier-yellow' }],
    ['quem_ganhou', 'Ganhador', 'text', 12, 190, true, { fixed: true, computed: true, fallback: 'Sem vencedor', tone: 'winner' }]
  ];
  for (const column of columns) {
    await pgPool.query(
      `INSERT INTO cotacao_v2_columns (quote_id, key, label, type, position, width, locked, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (quote_id, key)
       DO UPDATE SET label = CASE
                               WHEN EXCLUDED.locked
                                 OR COALESCE((EXCLUDED.options->>'fixed')::boolean, false)
                               THEN EXCLUDED.label
                               ELSE cotacao_v2_columns.label
                             END,
                     type = EXCLUDED.type,
                     position = CASE
                                  WHEN EXCLUDED.locked
                                    OR COALESCE((EXCLUDED.options->>'fixed')::boolean, false)
                                  THEN EXCLUDED.position
                                  ELSE cotacao_v2_columns.position
                                END,
                     width = CASE
                               WHEN EXCLUDED.locked
                                 OR COALESCE((EXCLUDED.options->>'fixed')::boolean, false)
                               THEN EXCLUDED.width
                               ELSE cotacao_v2_columns.width
                             END,
                     locked = EXCLUDED.locked,
                     options = CASE
                                 WHEN EXCLUDED.locked
                                   OR COALESCE((EXCLUDED.options->>'fixed')::boolean, false)
                                 THEN EXCLUDED.options
                                 ELSE cotacao_v2_columns.options
                               END,
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

  await normalizeColumnOrder(quoteId);
}

async function normalizeColumnOrder(quoteId) {
  const current = await pgPool.query(
    `SELECT *
     FROM cotacao_v2_columns
     WHERE quote_id = $1
       AND COALESCE((options->>'hidden')::boolean, false) = false
     ORDER BY position ASC, created_at ASC, label ASC`,
    [quoteId]
  );
  const byKey = new Map(current.rows.map((column) => [column.key, column]));
  const fixedKeys = ['ean', 'produto', 'quantidade', 'categoria'];
  const ordered = [];
  fixedKeys.forEach((key) => {
    const column = byKey.get(key);
    if (column) ordered.push(column);
  });
  current.rows
    .filter((column) => isDistributorColumn(column) && !fixedKeys.includes(column.key))
    .forEach((column) => ordered.push(column));
  const winner = byKey.get('quem_ganhou');
  if (winner) ordered.push(winner);

  for (let index = 0; index < ordered.length; index += 1) {
    await pgPool.query(
      'UPDATE cotacao_v2_columns SET position = $3, updated_at = now() WHERE quote_id = $1 AND key = $2',
      [quoteId, ordered[index].key, index + 1]
    );
  }
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
  const [columns, rows, rules, styles, lastEvent] = await Promise.all([
    pgPool.query(
      `SELECT * FROM cotacao_v2_columns
       WHERE quote_id = $1
         AND COALESCE((options->>'hidden')::boolean, false) = false
       ORDER BY position ASC, label ASC`,
      [quote.id]
    ),
    pgPool.query(
      `SELECT * FROM cotacao_v2_rows
       WHERE quote_id = $1
         AND deleted_at IS NULL
       ORDER BY position ASC, id ASC`,
      [quote.id]
    ),
    pgPool.query('SELECT * FROM cotacao_v2_rules WHERE quote_id = $1 ORDER BY priority ASC, created_at ASC', [quote.id]),
    pgPool.query(
      `SELECT id,
              style_key AS "styleKey",
              scope,
              row_id AS "rowId",
              column_key AS "columnKey",
              background,
              color,
              updated_by AS "updatedBy",
              updated_at AS "updatedAt"
       FROM cotacao_v2_styles
       WHERE quote_id = $1
       ORDER BY updated_at ASC`,
      [quote.id]
    ),
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
    styles: styles.rows,
    lastEventId: Number(lastEvent.rows[0].id)
  };
}

async function addRows(quoteId, count, valuesList) {
  const maxPosition = await pgPool.query(
    'SELECT COALESCE(MAX(position), 0)::int AS position FROM cotacao_v2_rows WHERE quote_id = $1 AND deleted_at IS NULL',
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

async function insertRowsAt(quoteId, anchorRowId, placement = 'below', count = 1) {
  const total = Math.max(1, Math.min(Number(count || 1), 50));
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id
       FROM cotacao_v2_rows
       WHERE quote_id = $1
         AND deleted_at IS NULL
       ORDER BY position ASC, id ASC
       FOR UPDATE`,
      [quoteId]
    );
    const ids = current.rows.map((row) => row.id);
    const anchorIndex = ids.indexOf(anchorRowId);
    const insertIndex = anchorIndex === -1
      ? ids.length
      : anchorIndex + (placement === 'above' ? 0 : 1);
    const inserted = [];
    for (let index = 0; index < total; index += 1) {
      const row = await client.query(
        `INSERT INTO cotacao_v2_rows (quote_id, position, values)
         VALUES ($1, $2, '{}'::jsonb)
         RETURNING id, position, values, version, updated_at`,
        [quoteId, ids.length + index + 1]
      );
      inserted.push({
        id: row.rows[0].id,
        position: row.rows[0].position,
        values: row.rows[0].values || {},
        version: Number(row.rows[0].version),
        updatedAt: row.rows[0].updated_at
      });
    }
    const ordered = [
      ...ids.slice(0, insertIndex),
      ...inserted.map((row) => row.id),
      ...ids.slice(insertIndex)
    ];
    for (let index = 0; index < ordered.length; index += 1) {
      await client.query('UPDATE cotacao_v2_rows SET position = $2, updated_at = now() WHERE id = $1', [
        ordered[index],
        index + 1
      ]);
    }
    inserted.forEach((row) => {
      row.position = ordered.indexOf(row.id) + 1;
    });
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function isDistributorColumn(column) {
  return column
    && column.locked !== true
    && (column.options?.kind === 'distributor'
      || String(column.key || '').startsWith('fornecedor_')
      || String(column.key || '').startsWith('distribuidora_'));
}

function sanitizeColumnLabel(value, fallback) {
  const label = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 36);
  return label || fallback;
}

async function addDistributorColumn(quoteId, anchorKey, placement, label) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT *
       FROM cotacao_v2_columns
       WHERE quote_id = $1
         AND COALESCE((options->>'hidden')::boolean, false) = false
       ORDER BY position ASC, label ASC
       FOR UPDATE`,
      [quoteId]
    );
    const columns = current.rows;
    const distributorCount = columns.filter(isDistributorColumn).length;
    const winnerIndex = Math.max(0, columns.findIndex((column) => column.key === 'quem_ganhou'));
    const anchorIndex = columns.findIndex((column) => column.key === anchorKey && isDistributorColumn(column));
    const insertIndex = anchorIndex === -1
      ? winnerIndex
      : anchorIndex + (placement === 'before' ? 0 : 1);
    const key = `distribuidora_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const finalLabel = sanitizeColumnLabel(label, `Distribuidora ${distributorCount + 1}`);
    const inserted = await client.query(
      `INSERT INTO cotacao_v2_columns (quote_id, key, label, type, position, width, locked, options)
       VALUES ($1, $2, $3, 'currency', $4, 150, false, $5::jsonb)
       RETURNING *`,
      [quoteId, key, finalLabel, columns.length + 1, JSON.stringify({ kind: 'distributor', tone: 'supplier-custom' })]
    );
    const ordered = [
      ...columns.slice(0, insertIndex).map((column) => column.key),
      key,
      ...columns.slice(insertIndex).map((column) => column.key)
    ];
    for (let index = 0; index < ordered.length; index += 1) {
      await client.query(
        'UPDATE cotacao_v2_columns SET position = $3, updated_at = now() WHERE quote_id = $1 AND key = $2',
        [quoteId, ordered[index], index + 1]
      );
    }
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function logColumnAudit({ quoteId, columnKey, action, before = {}, after = {}, user, clientId = null }) {
  await pgPool.query(
    `INSERT INTO cotacao_v2_column_audit (quote_id, column_key, action, before, after, user_id, username, client_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
    [
      quoteId,
      columnKey,
      action,
      JSON.stringify(before || {}),
      JSON.stringify(after || {}),
      user?.id || null,
      user?.username || null,
      clientId
    ]
  );
}

async function renameDistributorColumn(quoteId, columnKey, label, user, clientId) {
  const current = await pgPool.query(
    `SELECT *
     FROM cotacao_v2_columns
     WHERE quote_id = $1
       AND key = $2
       AND COALESCE((options->>'hidden')::boolean, false) = false
     LIMIT 1`,
    [quoteId, columnKey]
  );
  const column = current.rows[0];
  if (!isDistributorColumn(column)) {
    const error = new Error('Somente distribuidoras podem ser renomeadas.');
    error.status = 422;
    throw error;
  }
  const nextLabel = sanitizeColumnLabel(label, column.label);
  const updated = await pgPool.query(
    `UPDATE cotacao_v2_columns
     SET label = $3, updated_at = now()
     WHERE quote_id = $1 AND key = $2
     RETURNING *`,
    [quoteId, columnKey, nextLabel]
  );
  await logColumnAudit({
    quoteId,
    columnKey,
    action: 'rename',
    before: { label: column.label },
    after: { label: updated.rows[0].label },
    user,
    clientId
  });
  return updated.rows[0];
}

async function moveDistributorColumn(quoteId, columnKey, direction, user, clientId) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT *
       FROM cotacao_v2_columns
       WHERE quote_id = $1
         AND COALESCE((options->>'hidden')::boolean, false) = false
       ORDER BY position ASC, label ASC
       FOR UPDATE`,
      [quoteId]
    );
    const columns = current.rows;
    const column = columns.find((item) => item.key === columnKey);
    if (!isDistributorColumn(column)) {
      const error = new Error('Somente distribuidoras podem ser reordenadas.');
      error.status = 422;
      throw error;
    }
    const distributors = columns.filter(isDistributorColumn);
    const fromIndex = distributors.findIndex((item) => item.key === columnKey);
    const delta = direction === 'left' ? -1 : 1;
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= distributors.length) {
      await client.query('COMMIT');
      return column;
    }
    const reordered = distributors.slice();
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    let distributorIndex = 0;
    const ordered = columns.map((item) => (isDistributorColumn(item) ? reordered[distributorIndex++] : item));
    for (let index = 0; index < ordered.length; index += 1) {
      await client.query(
        'UPDATE cotacao_v2_columns SET position = $3, updated_at = now() WHERE quote_id = $1 AND key = $2',
        [quoteId, ordered[index].key, index + 1]
      );
    }
    await client.query('COMMIT');
    await logColumnAudit({
      quoteId,
      columnKey,
      action: 'move',
      before: { position: column.position },
      after: { direction, fromIndex, toIndex },
      user,
      clientId
    });
    return { ...column, position: toIndex + 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizeStyleTarget(body) {
  const scope = String(body.scope || '');
  const rowId = body.rowId ? String(body.rowId) : null;
  const columnKey = body.columnKey ? String(body.columnKey) : null;
  if (!['row', 'column', 'cell'].includes(scope)) return null;
  if (scope === 'row' && !rowId) return null;
  if (scope === 'column' && !columnKey) return null;
  if (scope === 'cell' && (!rowId || !columnKey)) return null;
  return {
    scope,
    rowId,
    columnKey,
    styleKey: `${scope}:${rowId || ''}:${columnKey || ''}`
  };
}

function normalizeStylePayload(body) {
  const scope = String(body.scope || '');
  const rowId = body.rowId ? String(body.rowId) : null;
  const columnKey = body.columnKey ? String(body.columnKey) : null;
  const background = String(body.background || '').trim();
  const color = String(body.color || '').trim();
  if (!['row', 'column', 'cell'].includes(scope)) {
    return null;
  }
  if (scope === 'row' && !rowId) {
    return null;
  }
  if (scope === 'column' && !columnKey) {
    return null;
  }
  if (scope === 'cell' && (!rowId || !columnKey)) {
    return null;
  }
  if (!/^#[0-9a-f]{6}$/i.test(background)) {
    return null;
  }
  return {
    scope,
    rowId,
    columnKey,
    background,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '',
    styleKey: `${scope}:${rowId || ''}:${columnKey || ''}`
  };
}

function parsePriceForWinner(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function computeWinnerForRow(row, columns) {
  const distributors = columns.filter(isDistributorColumn);
  let best = null;
  let winners = [];
  distributors.forEach((column) => {
    const price = parsePriceForWinner(row.values?.[column.key]);
    if (price === null) return;
    if (best === null || price < best) {
      best = price;
      winners = [column];
      return;
    }
    if (price === best) winners.push(column);
  });
  if (!winners.length) return 'Sem vencedor';
  if (winners.length > 1) return `Empate: ${winners.map((column) => column.label).join(', ')}`;
  return winners[0].label;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function matrixFromSheet(sheet) {
  const columns = sheet.columns;
  const headers = [...columns.map((column) => column.label), 'cotacao_row_id'];
  const values = sheet.rows.map((row) => columns.map((column) => {
    if (column.key === 'quem_ganhou' || column.options?.computed === true) {
      return computeWinnerForRow(row, columns);
    }
    return String(row.values?.[column.key] ?? '');
  }).concat(row.id));
  return [headers, ...values];
}

function rowsFromMatrix(matrix, columns) {
  const rows = Array.isArray(matrix) ? matrix : [];
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value || '').trim().toLowerCase());
  const idIndex = ['cotacao_row_id', '_cotacao_row_id', 'row_id', 'id'].map((name) => headers.indexOf(name)).find((index) => index !== -1);
  const editableColumns = columns.filter((column) => column.options?.computed !== true);
  const indexByColumn = new Map();
  editableColumns.forEach((column, fallbackIndex) => {
    const labelIndex = headers.indexOf(String(column.label || '').trim().toLowerCase());
    const keyIndex = headers.indexOf(String(column.key || '').trim().toLowerCase());
    indexByColumn.set(column.key, labelIndex !== -1 ? labelIndex : (keyIndex !== -1 ? keyIndex : fallbackIndex));
  });
  return rows.slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const values = {};
      editableColumns.forEach((column) => {
        values[column.key] = String(row[indexByColumn.get(column.key)] ?? '');
      });
      const id = idIndex >= 0 && isUuid(row[idIndex]) ? String(row[idIndex]) : null;
      return { id, values };
    });
}

async function replaceRowsFromImport(quoteId, rows) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = rows.map((row) => row.id).filter(Boolean);
    if (incomingIds.length) {
      await client.query(
        `UPDATE cotacao_v2_rows
         SET deleted_at = now(), updated_at = now()
         WHERE quote_id = $1
           AND deleted_at IS NULL
           AND id <> ALL($2::uuid[])`,
        [quoteId, incomingIds]
      );
    } else {
      await client.query('UPDATE cotacao_v2_rows SET deleted_at = now(), updated_at = now() WHERE quote_id = $1 AND deleted_at IS NULL', [quoteId]);
    }
    const inserted = [];
    for (let index = 0; index < rows.length; index += 1) {
      const rowId = rows[index].id;
      const values = rows[index].values || {};
      const result = rowId
        ? await client.query(
          `INSERT INTO cotacao_v2_rows (id, quote_id, position, values, deleted_at)
           VALUES ($1, $2, $3, $4::jsonb, NULL)
           ON CONFLICT (id)
           DO UPDATE SET position = EXCLUDED.position,
                         values = EXCLUDED.values,
                         version = cotacao_v2_rows.version + 1,
                         deleted_at = NULL,
                         updated_at = now()
           RETURNING id, position, values, version, updated_at`,
          [rowId, quoteId, index + 1, JSON.stringify(values)]
        )
        : await client.query(
          `INSERT INTO cotacao_v2_rows (quote_id, position, values)
           VALUES ($1, $2, $3::jsonb)
           RETURNING id, position, values, version, updated_at`,
          [quoteId, index + 1, JSON.stringify(values)]
        );
      inserted.push({
        id: result.rows[0].id,
        position: result.rows[0].position,
        values: result.rows[0].values || {},
        version: Number(result.rows[0].version),
        updatedAt: result.rows[0].updated_at
      });
    }
    if (!inserted.length) {
      const empty = await client.query(
        `INSERT INTO cotacao_v2_rows (quote_id, position, values)
         VALUES ($1, 1, '{}'::jsonb)
         RETURNING id, position, values, version, updated_at`,
        [quoteId]
      );
      inserted.push({
        id: empty.rows[0].id,
        position: empty.rows[0].position,
        values: empty.rows[0].values || {},
        version: Number(empty.rows[0].version),
        updatedAt: empty.rows[0].updated_at
      });
    }
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function googleCredentials() {
  if (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON);
  }
  if (GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE) {
    return JSON.parse(await fs.readFile(GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE, 'utf8'));
  }
  return null;
}

async function googleAccessToken() {
  const credentials = await googleCredentials();
  if (!credentials?.client_email || !credentials?.private_key) {
    const error = new Error('Google Sheets nao configurado.');
    error.status = 422;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const privateKey = String(credentials.private_key).replace(/\\n/g, '\n');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error_description || data.error || 'Falha no token Google.');
    error.status = 502;
    throw error;
  }
  return data.access_token;
}

async function googleSheetsRequest(method, range, body = null) {
  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    const error = new Error('GOOGLE_SHEETS_SPREADSHEET_ID nao configurado.');
    error.status = 422;
    throw error;
  }
  const token = await googleAccessToken();
  const rangePath = encodeURIComponent(range);
  const suffix = method === 'PUT' ? '?valueInputOption=USER_ENTERED' : '';
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${rangePath}${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Falha na API do Google Sheets.');
    error.status = 502;
    throw error;
  }
  return data;
}

async function createBackup(quoteId, username) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const sheet = await loadSheet();
  const audit = await pgPool.query(
    `SELECT id, column_key, action, before, after, username, client_id, created_at
     FROM cotacao_v2_column_audit
     WHERE quote_id = $1
     ORDER BY id ASC`,
    [quoteId]
  );
  const payload = {
    kind: 'wimifarma-cotacao-v2-backup',
    createdAt: new Date().toISOString(),
    createdBy: username || null,
    sheet,
    columnAudit: audit.rows
  };
  const name = `cotacao-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = path.join(BACKUP_DIR, name);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return { name, file, bytes: Buffer.byteLength(JSON.stringify(payload)) };
}

async function listBackups() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const files = await fs.readdir(BACKUP_DIR);
  const backups = [];
  for (const file of files.filter((item) => /^cotacao-v2-.+\.json$/.test(item))) {
    const stat = await fs.stat(path.join(BACKUP_DIR, file));
    backups.push({ name: file, bytes: stat.size, updatedAt: stat.mtime.toISOString() });
  }
  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

async function restoreBackup(backupName, quoteId) {
  if (!/^cotacao-v2-[\w.-]+\.json$/.test(backupName)) {
    const error = new Error('Backup invalido.');
    error.status = 422;
    throw error;
  }
  const file = path.join(BACKUP_DIR, backupName);
  const payload = JSON.parse(await fs.readFile(file, 'utf8'));
  if (payload.kind !== 'wimifarma-cotacao-v2-backup') {
    const error = new Error('Arquivo de backup nao reconhecido.');
    error.status = 422;
    throw error;
  }
  const sheet = payload.sheet || {};
  const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const rules = Array.isArray(sheet.rules) ? sheet.rules : [];
  const styles = Array.isArray(sheet.styles) ? sheet.styles : [];
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cotacao_v2_styles WHERE quote_id = $1', [quoteId]);
    await client.query('DELETE FROM cotacao_v2_rules WHERE quote_id = $1', [quoteId]);
    await client.query('DELETE FROM cotacao_v2_rows WHERE quote_id = $1', [quoteId]);
    const backupColumnKeys = columns.map((column) => String(column?.key || '')).filter(Boolean);
    if (backupColumnKeys.length) {
      await client.query(
        `UPDATE cotacao_v2_columns
         SET options = jsonb_set(COALESCE(options, '{}'::jsonb), '{hidden}', 'true'::jsonb, true),
             updated_at = now()
         WHERE quote_id = $1
           AND locked = false
           AND key <> ALL($2::text[])`,
        [quoteId, backupColumnKeys]
      );
    }

    for (const column of columns) {
      if (!column?.key) continue;
      await client.query(
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
        [
          quoteId,
          String(column.key),
          String(column.label || column.key),
          String(column.type || 'text'),
          Number(column.position || 0),
          Number(column.width || 160),
          Boolean(column.locked),
          JSON.stringify(column.options || {})
        ]
      );
    }

    const insertedRows = [];
    const rowIdMap = new Map();
    for (let index = 0; index < rows.length; index += 1) {
      const sourceRow = rows[index] || {};
      const backupId = isUuid(sourceRow.id) ? String(sourceRow.id) : null;
      const result = backupId
        ? await client.query(
          `INSERT INTO cotacao_v2_rows (id, quote_id, position, values, version, meta)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
           RETURNING id, position, values, version, updated_at`,
          [
            backupId,
            quoteId,
            Number(sourceRow.position || index + 1),
            JSON.stringify(sourceRow.values || {}),
            Number(sourceRow.version || 1),
            JSON.stringify(sourceRow.meta || {})
          ]
        )
        : await client.query(
          `INSERT INTO cotacao_v2_rows (quote_id, position, values, version, meta)
           VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)
           RETURNING id, position, values, version, updated_at`,
          [
            quoteId,
            Number(sourceRow.position || index + 1),
            JSON.stringify(sourceRow.values || {}),
            Number(sourceRow.version || 1),
            JSON.stringify(sourceRow.meta || {})
          ]
        );
      if (sourceRow.id) rowIdMap.set(String(sourceRow.id), result.rows[0].id);
      insertedRows.push({
        id: result.rows[0].id,
        position: result.rows[0].position,
        values: result.rows[0].values || {},
        version: Number(result.rows[0].version),
        updatedAt: result.rows[0].updated_at
      });
    }
    if (!insertedRows.length) {
      const result = await client.query(
        `INSERT INTO cotacao_v2_rows (quote_id, position, values)
         VALUES ($1, 1, '{}'::jsonb)
         RETURNING id, position, values, version, updated_at`,
        [quoteId]
      );
      insertedRows.push({
        id: result.rows[0].id,
        position: result.rows[0].position,
        values: result.rows[0].values || {},
        version: Number(result.rows[0].version),
        updatedAt: result.rows[0].updated_at
      });
    }

    for (const rule of rules) {
      await client.query(
        `INSERT INTO cotacao_v2_rules (quote_id, name, target, column_key, operator, value, background, color, show_timestamp, enabled, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          quoteId,
          String(rule.name || 'Regra restaurada'),
          String(rule.target || 'row'),
          String(rule.column_key || rule.columnKey || 'categoria'),
          String(rule.operator || 'contains'),
          String(rule.value || ''),
          String(rule.background || '#fff7ed'),
          String(rule.color || '#7c2d12'),
          normalizeBoolean(rule.show_timestamp ?? rule.showTimestamp),
          rule.enabled !== false,
          Number(rule.priority || 100)
        ]
      );
    }

    for (const style of styles) {
      const styleKey = style.styleKey || style.style_key;
      if (!styleKey || !style.scope) continue;
      const restoredRowId = style.rowId || style.row_id || null;
      const rowId = restoredRowId ? (rowIdMap.get(String(restoredRowId)) || restoredRowId) : null;
      if ((style.scope === 'row' || style.scope === 'cell') && !rowId) continue;
      const styleColumnKey = style.columnKey || style.column_key || null;
      let safeStyleKey = String(styleKey);
      if (rowId && style.scope === 'row') {
        safeStyleKey = `row:${rowId}:`;
      } else if (rowId && style.scope === 'cell') {
        safeStyleKey = `cell:${rowId}:${styleColumnKey || ''}`;
      }
      await client.query(
        `INSERT INTO cotacao_v2_styles (quote_id, style_key, scope, row_id, column_key, background, color, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (quote_id, style_key)
         DO UPDATE SET background = EXCLUDED.background,
                       color = EXCLUDED.color,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()`,
        [
          quoteId,
          safeStyleKey,
          String(style.scope),
          rowId,
          styleColumnKey,
          String(style.background || ''),
          String(style.color || ''),
          String(style.updatedBy || style.updated_by || 'restore')
        ]
      );
    }
    await client.query('COMMIT');
    await normalizeColumnOrder(quoteId);
    return insertedRows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  <link rel="stylesheet" href="/miauw/widget.css?v=20260514a">
</head>
<body class="app-page">
  <header class="app-header">
    <div class="app-brandline">
      <a class="brand" href="/">
        <img src="${BASE_PATH}/logo-wimifarma.svg" alt="Wimifarma">
      </a>
      <strong>Wimifarma Cotacao</strong>
    </div>
    <nav class="app-actions" aria-label="Acoes da cotacao">
      <a href="/">Home</a>
      <button type="button" id="exportCsvButton">Baixar</button>
      <a href="${BASE_PATH}/logout.php">Sair</a>
    </nav>
  </header>
  <main class="sheet-shell" data-user-id="${e(user.id)}" data-username="${e(user.username)}">
    <section class="sheet-topline">
      <div>
        <span class="kicker">Wimifarma Cotacao</span>
      </div>
      <div class="sheet-stats">
        <span id="rowCountBadge">0 linha(s) com dados</span>
        <div class="presence-inline presence-top" id="presenceList"></div>
        <strong id="presenceCount">1 pessoa usando</strong>
        <span id="saveStatus" class="save-status">Sincronizado</span>
      </div>
    </section>

    <section class="toolbar" aria-label="Ferramentas da cotacao">
      <button type="button" class="icon-button" id="undoButton" title="Desfazer" aria-label="Desfazer">&#8630;</button>
      <button type="button" class="icon-button" id="redoButton" title="Refazer" aria-label="Refazer">&#8631;</button>
      <button type="button" class="icon-button" id="rulesButton" title="Formatacao condicional" aria-label="Formatacao condicional">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 5l3 5 3-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="paint-tools" aria-label="Cores rapidas">
        <button type="button" class="icon-button" id="paletteToggleButton" title="Cores" aria-label="Cores">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 0 0 16h1.4a1.8 1.8 0 0 0 1.2-3.1 1.4 1.4 0 0 1 .9-2.5H17a3 3 0 0 0 3-3A7.4 7.4 0 0 0 12 4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.6" cy="10" r="1" fill="currentColor"/><circle cx="11.6" cy="8" r="1" fill="currentColor"/><circle cx="14.8" cy="9.5" r="1" fill="currentColor"/></svg>
        </button>
        <div class="paint-palette" id="paintPalette" hidden>
          ${renderPaintSwatches()}
        </div>
      </div>
    </section>

    <section class="sheet-wrap" id="sheetWrap" aria-label="Planilha de cotacao">
      <table class="sheet-table" id="sheetTable"></table>
      <div class="sheet-footer">
        <button type="button" id="addRowsFooterButton">Adicionar 20 linhas</button>
      </div>
    </section>
  </main>

  <div id="contextMenu" class="context-menu" hidden>
    <button type="button" data-action="row-above">Adicionar linha acima</button>
    <button type="button" data-action="row-below">Adicionar linha abaixo</button>
    <span class="context-divider"></span>
    <button type="button" data-action="open-palette">Cores</button>
    <button type="button" data-action="erase-color">Limpar cor</button>
    <span class="context-divider"></span>
    <button type="button" data-action="column-before">Adicionar distribuidora antes</button>
    <button type="button" data-action="column-after">Adicionar distribuidora depois</button>
    <button type="button" data-action="column-delete">Apagar distribuidora</button>
  </div>

  <div id="filterMenu" class="filter-menu" hidden></div>

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
        <label>Valor
          <input id="ruleValue" type="text">
        </label>
        <label>Fundo
          <input id="ruleBg" type="color" value="#fff7ed">
        </label>
        <label class="rule-check">
          <input id="ruleTimestamp" type="checkbox">
          <span>Data/hora</span>
        </label>
        <button type="button" id="addRuleButton">Criar regra</button>
      </div>
      <div id="rulesList" class="rules-list"></div>
      <div class="dialog-actions">
        <button type="submit">Fechar</button>
      </div>
    </form>
  </dialog>

  <dialog id="diagnosticsDialog">
    <form method="dialog" class="dialog-card dialog-card-wide">
      <h2>Diagnostico da Cotacao</h2>
      <div class="diagnostics-grid">
        <button type="button" id="refreshDiagnosticsButton">Atualizar diagnostico</button>
        <button type="button" id="googleExportButton">Exportar Google Sheets</button>
        <button type="button" id="googleImportButton">Importar Google Sheets</button>
        <button type="button" id="createBackupButton">Criar backup</button>
        <select id="backupSelect" aria-label="Backups disponiveis"></select>
        <button type="button" id="restoreBackupButton">Restaurar backup</button>
      </div>
      <pre id="diagnosticsOutput" class="diagnostics-output"></pre>
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
  <script src="/miauw/widget.js?v=20260514a" defer></script>
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

app.get(`${BASE_PATH}/api/events`, requireApiAuth, asyncRoute(async (req, res) => {
  const quote = await getOrCreateDefaultQuote();
  const after = parseEventCursor(req.query.after);
  if (after === null) {
    const latest = await pgPool.query(
      'SELECT COALESCE(MAX(id), 0)::bigint AS id FROM cotacao_v2_events WHERE quote_id = $1',
      [quote.id]
    );
    return res.json({
      ok: true,
      events: [],
      latestEventId: Number(latest.rows[0]?.id || 0),
      pendingEvents: 0,
      requiresSnapshot: true,
      reason: 'invalid_cursor'
    });
  }
  const delta = await loadEventDelta(quote.id, after);
  return res.json({
    ok: true,
    quoteId: quote.id,
    after,
    limit: DELTA_EVENT_LIMIT,
    ...delta
  });
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

app.post(`${BASE_PATH}/api/rows/insert`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const rows = await insertRowsAt(
    sheet.quote.id,
    String(req.body.anchorRowId || ''),
    String(req.body.placement || 'below') === 'above' ? 'above' : 'below',
    req.body.count || 1
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'rows_inserted',
    payload: { rows },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('rows:added', { rows, eventId: Number(event.id), clientId });
  res.json({ ok: true, rows, eventId: Number(event.id) });
}));

app.delete(`${BASE_PATH}/api/rows/:id`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const rowId = String(req.params.id || '');
  const clientId = String(req.body?.clientId || '');
  const deleted = await pgPool.query(
    `UPDATE cotacao_v2_rows
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1
       AND quote_id = $2
       AND deleted_at IS NULL
     RETURNING id`,
    [rowId, sheet.quote.id]
  );
  if (!deleted.rows[0]) {
    return res.status(404).json({ ok: false, error: 'Linha nao encontrada.' });
  }
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'row_deleted',
    rowId,
    payload: { rowId },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('row:deleted', { rowId, eventId: Number(event.id), clientId });
  res.json({ ok: true, rowId, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/columns`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const column = await addDistributorColumn(
    sheet.quote.id,
    String(req.body.anchorKey || ''),
    String(req.body.placement || 'after') === 'before' ? 'before' : 'after',
    req.body.label
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_created',
    columnKey: column.key,
    payload: { column },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId });
  res.json({ ok: true, column, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/columns/:key/rename`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const column = await renameDistributorColumn(
    sheet.quote.id,
    String(req.params.key || ''),
    req.body.label,
    req.session.user,
    clientId
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_renamed',
    columnKey: column.key,
    payload: { column },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId });
  res.json({ ok: true, column, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/columns/:key/move`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const column = await moveDistributorColumn(
    sheet.quote.id,
    String(req.params.key || ''),
    String(req.body.direction || 'right') === 'left' ? 'left' : 'right',
    req.session.user,
    clientId
  );
  await normalizeColumnOrder(sheet.quote.id);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_moved',
    columnKey: column.key,
    payload: { column },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId });
  res.json({ ok: true, column, eventId: Number(event.id) });
}));

app.delete(`${BASE_PATH}/api/columns/:key`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const columnKey = String(req.params.key || '');
  const column = sheet.columns.find((item) => item.key === columnKey);
  if (!isDistributorColumn(column)) {
    return res.status(422).json({ ok: false, error: 'Somente colunas de distribuidoras podem ser apagadas.' });
  }
  await pgPool.query(
    `UPDATE cotacao_v2_columns
     SET options = jsonb_set(COALESCE(options, '{}'::jsonb), '{hidden}', 'true'::jsonb, true),
         updated_at = now()
     WHERE quote_id = $1
       AND key = $2`,
    [sheet.quote.id, columnKey]
  );
  await logColumnAudit({
    quoteId: sheet.quote.id,
    columnKey,
    action: 'delete',
    before: column,
    after: { hidden: true },
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  await normalizeColumnOrder(sheet.quote.id);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_deleted',
    columnKey,
    payload: { columnKey },
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId: String(req.body?.clientId || '') });
  res.json({ ok: true, columnKey, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/columns/:key/restore`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const columnKey = String(req.params.key || '');
  const current = await pgPool.query(
    `SELECT *
     FROM cotacao_v2_columns
     WHERE quote_id = $1
       AND key = $2
     LIMIT 1`,
    [sheet.quote.id, columnKey]
  );
  const column = current.rows[0];
  if (!isDistributorColumn(column)) {
    return res.status(422).json({ ok: false, error: 'Somente distribuidoras podem ser restauradas.' });
  }
  const restored = await pgPool.query(
    `UPDATE cotacao_v2_columns
     SET options = jsonb_set(COALESCE(options, '{}'::jsonb), '{hidden}', 'false'::jsonb, true),
         updated_at = now()
     WHERE quote_id = $1
       AND key = $2
     RETURNING *`,
    [sheet.quote.id, columnKey]
  );
  await logColumnAudit({
    quoteId: sheet.quote.id,
    columnKey,
    action: 'restore',
    before: column,
    after: restored.rows[0],
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  await normalizeColumnOrder(sheet.quote.id);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_restored',
    columnKey,
    payload: { columnKey },
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId: String(req.body?.clientId || '') });
  res.json({ ok: true, column: restored.rows[0], eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/columns/:key/width`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const columnKey = String(req.params.key || '');
  const column = sheet.columns.find((item) => item.key === columnKey);
  if (!column) {
    return res.status(404).json({ ok: false, error: 'Coluna nao encontrada.' });
  }
  const width = Math.max(84, Math.min(620, Number.parseInt(req.body?.width, 10) || 160));
  const updated = await pgPool.query(
    `UPDATE cotacao_v2_columns
     SET width = $3,
         updated_at = now()
     WHERE quote_id = $1
       AND key = $2
     RETURNING *`,
    [sheet.quote.id, columnKey, width]
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'column_resized',
    columnKey,
    payload: { columnKey, width },
    user: req.session.user,
    clientId: String(req.body?.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('columns:changed', { eventId: Number(event.id), clientId: String(req.body?.clientId || '') });
  res.json({ ok: true, column: updated.rows[0], eventId: Number(event.id) });
}));

app.put(`${BASE_PATH}/api/styles`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const style = normalizeStylePayload(req.body || {});
  if (!style) {
    return res.status(422).json({ ok: false, error: 'Estilo invalido.' });
  }
  const allowed = new Set(sheet.columns.map((column) => column.key));
  const rowAllowed = new Set(sheet.rows.map((row) => row.id));
  if (style.columnKey && !allowed.has(style.columnKey)) {
    return res.status(422).json({ ok: false, error: 'Coluna invalida.' });
  }
  if (style.rowId && !rowAllowed.has(style.rowId)) {
    return res.status(422).json({ ok: false, error: 'Linha invalida.' });
  }
  const result = await pgPool.query(
    `INSERT INTO cotacao_v2_styles (quote_id, style_key, scope, row_id, column_key, background, color, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (quote_id, style_key)
     DO UPDATE SET background = EXCLUDED.background,
                   color = EXCLUDED.color,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = now()
     RETURNING id,
               style_key AS "styleKey",
               scope,
               row_id AS "rowId",
               column_key AS "columnKey",
               background,
               color,
               updated_by AS "updatedBy",
               updated_at AS "updatedAt"`,
    [
      sheet.quote.id,
      style.styleKey,
      style.scope,
      style.rowId,
      style.columnKey,
      style.background,
      style.color,
      req.session.user?.username || null
    ]
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'style_updated',
    payload: { style: result.rows[0] },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('style:update', {
    style: result.rows[0],
    eventId: Number(event.id),
    clientId: String(req.body.clientId || '')
  });
  res.json({ ok: true, style: result.rows[0], eventId: Number(event.id) });
}));

app.delete(`${BASE_PATH}/api/styles`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const target = normalizeStyleTarget(req.body || {});
  if (!target) {
    return res.status(422).json({ ok: false, error: 'Alvo de estilo invalido.' });
  }
  await pgPool.query(
    'DELETE FROM cotacao_v2_styles WHERE quote_id = $1 AND style_key = $2',
    [sheet.quote.id, target.styleKey]
  );
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'style_deleted',
    payload: { styleKey: target.styleKey },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('style:delete', {
    styleKey: target.styleKey,
    eventId: Number(event.id),
    clientId: String(req.body.clientId || '')
  });
  res.json({ ok: true, styleKey: target.styleKey, eventId: Number(event.id) });
}));

app.patch(`${BASE_PATH}/api/cells`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const rowId = String(req.body.rowId || '');
  const columnKey = String(req.body.columnKey || '');
  const value = String(req.body.value ?? '');
  const clientId = String(req.body.clientId || '');
  const hasExpectedValue = Object.hasOwn(req.body || {}, 'expectedValue');
  const expectedValue = String(req.body.expectedValue ?? '');
  const allowed = new Set(sheet.columns.filter((column) => column.options?.computed !== true).map((column) => column.key));
  if (!rowId || !allowed.has(columnKey)) {
    return res.status(422).json({ ok: false, error: 'Celula invalida.' });
  }
  const client = await pgPool.connect();
  let row;
  let previousValue = '';
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, position, values, version, updated_at
       FROM cotacao_v2_rows
       WHERE id = $1
         AND quote_id = $2
         AND deleted_at IS NULL
       FOR UPDATE`,
      [rowId, sheet.quote.id]
    );
    const currentRow = current.rows[0];
    if (!currentRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Linha nao encontrada.' });
    }
    previousValue = String(currentRow.values?.[columnKey] ?? '');
    if (hasExpectedValue && previousValue !== expectedValue) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        error: 'Conflito de edicao nesta celula.',
        conflict: {
          rowId,
          columnKey,
          expectedValue,
          currentValue: previousValue,
          attemptedValue: value,
          version: Number(currentRow.version),
          updatedAt: currentRow.updated_at
        }
      });
    }
    const updated = await client.query(
      `UPDATE cotacao_v2_rows
       SET values = jsonb_set(COALESCE(values, '{}'::jsonb), ARRAY[$2], to_jsonb($3::text), true),
           version = version + 1,
           updated_at = now()
       WHERE id = $1 AND quote_id = $4
       RETURNING id, position, values, version, updated_at`,
      [rowId, columnKey, value, sheet.quote.id]
    );
    row = updated.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const payload = {
    rowId: row.id,
    columnKey,
    value,
    previousValue,
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

app.patch(`${BASE_PATH}/api/cells/batch`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const clientId = String(req.body.clientId || '');
  const changes = Array.isArray(req.body.changes) ? req.body.changes.slice(0, 1000) : [];
  const allowed = new Set(sheet.columns.filter((column) => column.options?.computed !== true).map((column) => column.key));
  if (!changes.length) {
    return res.status(422).json({ ok: false, error: 'Nenhuma celula informada.' });
  }
  if (changes.some((change) => !change?.rowId || !allowed.has(String(change.columnKey || '')))) {
    return res.status(422).json({ ok: false, error: 'Lote contem celula invalida.' });
  }

  const client = await pgPool.connect();
  const updatedCells = [];
  try {
    await client.query('BEGIN');
    for (const raw of changes) {
      const rowId = String(raw.rowId || '');
      const columnKey = String(raw.columnKey || '');
      const value = String(raw.value ?? '');
      const hasExpectedValue = Object.hasOwn(raw || {}, 'expectedValue');
      const expectedValue = String(raw.expectedValue ?? '');
      const current = await client.query(
        `SELECT id, position, values, version, updated_at
         FROM cotacao_v2_rows
         WHERE id = $1
           AND quote_id = $2
           AND deleted_at IS NULL
         FOR UPDATE`,
        [rowId, sheet.quote.id]
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Linha nao encontrada.', rowId });
      }
      const previousValue = String(currentRow.values?.[columnKey] ?? '');
      if (hasExpectedValue && previousValue !== expectedValue) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          ok: false,
          error: 'Conflito de edicao no lote.',
          conflict: {
            rowId,
            columnKey,
            expectedValue,
            currentValue: previousValue,
            attemptedValue: value,
            version: Number(currentRow.version),
            updatedAt: currentRow.updated_at
          }
        });
      }
      if (previousValue === value) continue;
      const updated = await client.query(
        `UPDATE cotacao_v2_rows
         SET values = jsonb_set(COALESCE(values, '{}'::jsonb), ARRAY[$2], to_jsonb($3::text), true),
             version = version + 1,
             updated_at = now()
         WHERE id = $1 AND quote_id = $4
         RETURNING id, position, values, version, updated_at`,
        [rowId, columnKey, value, sheet.quote.id]
      );
      updatedCells.push({
        rowId: updated.rows[0].id,
        columnKey,
        value,
        previousValue,
        version: Number(updated.rows[0].version),
        updatedAt: updated.rows[0].updated_at
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'cells_batch_updated',
    payload: { cells: updatedCells },
    user: req.session.user,
    clientId
  });
  io.to(`quote:${sheet.quote.id}`).emit('cells:update', {
    cells: updatedCells,
    eventId: Number(event.id),
    user: userPublic(req.session.user),
    clientId
  });
  return res.json({ ok: true, cells: updatedCells, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/rules`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const columnKey = String(req.body.columnKey || 'categoria');
  const allowed = new Set(sheet.columns.filter((column) => column.options?.computed !== true).map((column) => column.key));
  if (!allowed.has(columnKey)) {
    return res.status(422).json({ ok: false, error: 'Coluna invalida.' });
  }
  const value = String(req.body.value || '').trim();
  if (!value) {
    return res.status(422).json({ ok: false, error: 'Informe o texto da regra.' });
  }
  const result = await pgPool.query(
    `INSERT INTO cotacao_v2_rules (quote_id, name, target, column_key, operator, value, background, color, show_timestamp, priority)
     VALUES ($1, $2, 'cell', $3, $4, $5, $6, $7, $8, 100)
     RETURNING *`,
    [
      sheet.quote.id,
      `Regra ${value}`,
      columnKey,
      normalizeRuleOperator(req.body.operator),
      value,
      normalizeHexColor(req.body.background),
      '#111827',
      normalizeBoolean(req.body.showTimestamp)
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

app.patch(`${BASE_PATH}/api/rules/:id`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const id = String(req.params.id || '');
  const columnKey = String(req.body.columnKey || 'categoria');
  const allowed = new Set(sheet.columns.filter((column) => column.options?.computed !== true).map((column) => column.key));
  if (!allowed.has(columnKey)) {
    return res.status(422).json({ ok: false, error: 'Coluna invalida.' });
  }
  const value = String(req.body.value || '').trim();
  if (!value) {
    return res.status(422).json({ ok: false, error: 'Informe o texto da regra.' });
  }
  const result = await pgPool.query(
    `UPDATE cotacao_v2_rules
     SET name = $3,
         target = 'cell',
         column_key = $4,
         operator = $5,
         value = $6,
         background = $7,
         color = $8,
         show_timestamp = $9,
         enabled = true,
         updated_at = now()
     WHERE id = $1 AND quote_id = $2
     RETURNING *`,
    [
      id,
      sheet.quote.id,
      `Regra ${value}`,
      columnKey,
      normalizeRuleOperator(req.body.operator),
      value,
      normalizeHexColor(req.body.background),
      '#111827',
      normalizeBoolean(req.body.showTimestamp)
    ]
  );
  if (!result.rows[0]) {
    return res.status(404).json({ ok: false, error: 'Regra nao encontrada.' });
  }
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'rule_updated',
    payload: { rule: result.rows[0] },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('rules:update', { rules: [result.rows[0]], mode: 'updated', eventId: Number(event.id) });
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

app.get(`${BASE_PATH}/api/diagnostics`, requireApiAuth, asyncRoute(async (_req, res) => {
  const startedAt = Date.now();
  const sheetStartedAt = Date.now();
  const sheet = await loadSheet();
  const loadSheetMs = Date.now() - sheetStartedAt;
  const snapshotBytes = jsonByteLength({
    quote: sheet.quote,
    columns: sheet.columns,
    rows: sheet.rows,
    rules: sheet.rules,
    styles: sheet.styles,
    lastEventId: sheet.lastEventId
  });
  const [eventCount, lastEvents, auditCount, redisPing, performanceIndexes] = await Promise.all([
    pgPool.query('SELECT COUNT(*)::int AS total FROM cotacao_v2_events WHERE quote_id = $1', [sheet.quote.id]),
    pgPool.query(
      `SELECT id, type, row_id AS "rowId", column_key AS "columnKey", username, client_id AS "clientId", created_at AS "createdAt"
       FROM cotacao_v2_events
       WHERE quote_id = $1
       ORDER BY id DESC
       LIMIT 12`,
      [sheet.quote.id]
    ),
    pgPool.query('SELECT COUNT(*)::int AS total FROM cotacao_v2_column_audit WHERE quote_id = $1', [sheet.quote.id]),
    redis.ping(),
    listExpectedPerformanceIndexes()
  ]);
  const presence = await activePresence(sheet.quote.id);
  res.json({
    ok: true,
    service: 'cotacao-v2',
    quoteId: sheet.quote.id,
    rows: sheet.rows.length,
    columns: sheet.columns.length,
    rules: sheet.rules.length,
    styles: sheet.styles.length,
    events: eventCount.rows[0].total,
    lastEventId: sheet.lastEventId,
    lastEvents: lastEvents.rows,
    columnAudit: auditCount.rows[0].total,
    presence,
    googleSheetsConfigured: Boolean(GOOGLE_SHEETS_SPREADSHEET_ID && (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE)),
    backupDir: BACKUP_DIR,
    redis: redisPing,
    safety: {
      stage: 'etapa-2',
      bootstrapFallback: true,
      incrementalDeltaEnabled: true,
      deltaEndpoint: `${BASE_PATH}/api/events?after=:eventId`,
      deltaEventLimit: DELTA_EVENT_LIMIT,
      destructiveChanges: false,
      oldCotacaoPhpFallback: false,
      backupBeforeImportRestore: true
    },
    performance: {
      loadSheetMs,
      snapshotBytes,
      snapshotRows: sheet.rows.length,
      snapshotColumns: sheet.columns.length,
      snapshotRules: sheet.rules.length,
      snapshotStyles: sheet.styles.length,
      expectedIndexes: performanceIndexes
    },
    latencyMs: Date.now() - startedAt
  });
}));

app.get(`${BASE_PATH}/api/google-sheets/status`, requireApiAuth, asyncRoute(async (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(GOOGLE_SHEETS_SPREADSHEET_ID && (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE)),
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID ? 'configured' : '',
    range: GOOGLE_SHEETS_RANGE
  });
}));

app.post(`${BASE_PATH}/api/google-sheets/export`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const range = String(req.body.range || GOOGLE_SHEETS_RANGE);
  const values = matrixFromSheet(sheet);
  const result = await googleSheetsRequest('PUT', range, { majorDimension: 'ROWS', values });
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'google_sheets_exported',
    payload: { range, updatedCells: result.updatedCells || 0 },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  res.json({ ok: true, range, result, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/google-sheets/import`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const range = String(req.body.range || GOOGLE_SHEETS_RANGE);
  const data = await googleSheetsRequest('GET', range);
  const rows = rowsFromMatrix(data.values || [], sheet.columns);
  const backup = await createBackup(sheet.quote.id, req.session.user?.username);
  const inserted = await replaceRowsFromImport(sheet.quote.id, rows);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'google_sheets_imported',
    payload: { range, rows: inserted.length, backup: backup.name },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('sheet:reload', { eventId: Number(event.id), clientId: String(req.body.clientId || '') });
  res.json({ ok: true, range, rows: inserted.length, backup: backup.name, eventId: Number(event.id) });
}));

app.get(`${BASE_PATH}/api/backups`, requireApiAuth, asyncRoute(async (_req, res) => {
  const backups = await listBackups();
  res.json({ ok: true, backups });
}));

app.post(`${BASE_PATH}/api/backups`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const backup = await createBackup(sheet.quote.id, req.session.user?.username);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'backup_created',
    payload: { name: backup.name, bytes: backup.bytes },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  res.json({ ok: true, backup: { name: backup.name, bytes: backup.bytes }, eventId: Number(event.id) });
}));

app.post(`${BASE_PATH}/api/backups/:name/restore`, requireApiAuth, verifyCsrf, asyncRoute(async (req, res) => {
  const sheet = await loadSheet();
  const rows = await restoreBackup(String(req.params.name || ''), sheet.quote.id);
  const event = await appendEvent({
    quoteId: sheet.quote.id,
    type: 'backup_restored',
    payload: { name: String(req.params.name || ''), rows: rows.length },
    user: req.session.user,
    clientId: String(req.body.clientId || '')
  });
  io.to(`quote:${sheet.quote.id}`).emit('sheet:reload', { eventId: Number(event.id), clientId: String(req.body.clientId || '') });
  res.json({ ok: true, rows: rows.length, eventId: Number(event.id) });
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
