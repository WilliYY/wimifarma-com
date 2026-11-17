import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { withTransaction } from './db-transaction.js';

const source = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
function loadFunction(name, dependencies) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf('\nasync function ', start + 1);
  const nextSync = source.indexOf('\nfunction ', start + 1);
  const stop = Math.min(...[end, nextSync].filter((index) => index >= 0));
  return vm.runInNewContext(`${source.slice(start, stop)}\n${name}`, dependencies);
}

function database() {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('MAX(id)')) return { rows: [{ id: '7' }] };
      if (sql.includes('INSERT INTO cotacao_v2_events')) return { rows: [{ id: '8' }] };
      if (sql.includes('INSERT INTO cotacao_v2_rows')) return { rows: [{ id: 'row', values: {}, version: 1 }] };
      return { rows: [] };
    },
    release() { calls.push('RELEASE'); }
  };
  return { calls, client, async connect() { return client; }, async query() { throw new Error('Unexpected pool query outside transaction'); } };
}

function batchHandler(dependencies) {
  const start = source.indexOf('app.patch(`${BASE_PATH}/api/cells/batch`');
  const end = source.indexOf('\n}));', start) + 5;
  let handler;
  const noop = () => {};
  vm.runInNewContext(source.slice(start, end), {
    app: { patch(_path, ...handlers) { handler = handlers.at(-1); } }, BASE_PATH: '/cotacao',
    requireApiAuth: noop, verifyCsrf: noop, asyncRoute: (fn) => fn, ...dependencies
  });
  return handler;
}

async function saveBatch(changes, values) {
  const calls = [];
  let events = 0;
  const client = {
    async query(sql, params) {
      calls.push(sql);
      if (sql.includes('SELECT id, position')) return { rows: values[params[0]] ? [{ id: params[0], values: values[params[0]], version: 1 }] : [] };
      if (sql.includes('UPDATE cotacao_v2_rows')) return { rows: [{ id: params[0], version: 2 }] };
      return { rows: [] };
    },
    release() {}
  };
  const handler = batchHandler({
    getOrCreateDefaultQuote: async () => ({ id: 'quote' }),
    sortCellChangesForLocking: (items) => items,
    editableColumnKeySet: async () => new Set(['produto']),
    pgPool: { connect: async () => client },
    clearProductCellStyles: async () => [],
    appendEvent: async () => { events += 1; return { id: '8' }; },
    io: { to: () => ({ emit() {} }) }, userPublic: () => ({}),
    syncEncomendaRemindersForRows: async () => {}
  });
  const res = { status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ body: { changes }, session: { user: {} } }, res);
  return { res, calls, events };
}

test('batch ACK includes unchanged cells alongside committed changes', async () => {
  const { res, events } = await saveBatch([
    { rowId: 'a', columnKey: 'produto', value: 'new' },
    { rowId: 'b', columnKey: 'produto', value: 'same' }
  ], { a: { produto: 'old' }, b: { produto: 'same' } });
  assert.equal(res.body.cells.length, 2);
  assert.equal(res.body.cells[1].value, 'same');
  assert.equal(res.body.cells[1].version, 1);
  assert.equal(events, 1);
});

test('retry of already committed batch ACKs without another history event', async () => {
  const { res, calls, events } = await saveBatch([
    { rowId: 'a', columnKey: 'produto', value: 'same', expectedValue: 'before' }
  ], { a: { produto: 'same' } });
  assert.equal(res.body.cells.length, 1);
  assert.equal(res.body.cells[0].previousValue, 'same');
  assert.equal(res.body.cells[0].expectedValue, 'before');
  assert.equal(res.body.cells[0].overwroteRemote, false);
  assert.equal(res.body.noop, true);
  assert.equal(events, 0);
  assert.ok(!calls.some((sql) => sql.includes('UPDATE cotacao_v2_rows')));
});

test('missing row rolls back the entire batch before emitting any event', async () => {
  const { res, calls, events } = await saveBatch([
    { rowId: 'a', columnKey: 'produto', value: 'new' },
    { rowId: 'missing', columnKey: 'produto', value: 'new' }
  ], { a: { produto: 'old' } });
  assert.equal(res.code, 404);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
  assert.equal(events, 0);
});

test('bootstrap reads rows and cursor inside one read-only repeatable snapshot', async () => {
  const pool = database();
  const originalQuery = pool.client.query;
  let querying = false;
  pool.client.query = async (...args) => {
    assert.equal(querying, false, 'client must complete each query before starting another');
    querying = true;
    try {
      await Promise.resolve();
      return await originalQuery(...args);
    } finally {
      querying = false;
    }
  };
  const loadSheet = loadFunction('loadSheet', { pgPool: pool, withTransaction, getOrCreateDefaultQuote: async () => ({ id: 'quote' }) });
  const sheet = await loadSheet();
  assert.equal(sheet.lastEventId, 7);
  assert.equal(pool.calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual(pool.calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('delta reads its latest cursor, count and events from the same snapshot', async () => {
  const pool = database();
  const originalQuery = pool.client.query;
  pool.client.query = async (sql, params) => {
    if (sql.includes('COUNT(*)')) { pool.calls.push(sql); return { rows: [{ total: 1 }] }; }
    if (sql.includes('ORDER BY id ASC')) { pool.calls.push(sql); return { rows: [{ id: '7', type: 'cell_updated' }] }; }
    return originalQuery(sql, params);
  };
  const delta = loadFunction('loadEventDelta', { pgPool: pool, withTransaction, DELTA_EVENT_LIMIT: 100, SNAPSHOT_EVENT_TYPES: new Set() });
  const result = await delta('quote', 6);
  assert.equal(result.latestEventId, 7);
  assert.equal(result.events.at(-1).id, 7);
  assert.equal(result.requiresSnapshot, false);
  assert.equal(pool.calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual(pool.calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('events acquire transaction-scoped quote lock before allocating the ID', async () => {
  const pool = database();
  const appendEvent = loadFunction('appendEvent', { pgPool: pool, withTransaction });
  const event = await appendEvent({ quoteId: 'quote', type: 'cell_updated', db: pool.client });
  assert.equal(event.id, '8');
  assert.match(pool.calls[0], /pg_advisory_xact_lock/);
  assert.match(pool.calls[1], /INSERT INTO cotacao_v2_events/);
});

test('standalone events hold the quote lock through commit on the same client', async () => {
  const pool = database();
  const appendEvent = loadFunction('appendEvent', { pgPool: pool, withTransaction });
  await appendEvent({ quoteId: 'quote', type: 'backup_created' });
  assert.equal(pool.calls[0], 'BEGIN');
  assert.match(pool.calls[1], /pg_advisory_xact_lock/);
  assert.deepEqual(pool.calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('import rolls back row replacement when its event fails', async () => {
  const pool = database();
  const replace = loadFunction('replaceRowsFromImport', { pgPool: pool });
  await assert.rejects(replace('quote', [], async (client, rows) => {
    assert.equal(client, pool.client);
    assert.equal(rows.length, 1);
    throw new Error('event unavailable');
  }), /event unavailable/);
  assert.ok(!pool.calls.includes('COMMIT'));
  assert.deepEqual(pool.calls.slice(-2), ['ROLLBACK', 'RELEASE']);
});

test('restore normalizes columns and appends its event before commit on the same client', async () => {
  const pool = database();
  const restore = loadFunction('restoreBackup', {
    pgPool: pool, BACKUP_DIR: '.', path: { join: (...parts) => parts.join('/') },
    fs: { readFile: async () => JSON.stringify({ kind: 'wimifarma-cotacao-v2-backup', sheet: {} }) },
    normalizeColumnOrder: async (_quote, client) => { assert.equal(client, pool.client); pool.calls.push('NORMALIZE'); }
  });
  await restore('cotacao-v2-test.json', 'quote', async (client, rows) => {
    assert.equal(client, pool.client);
    assert.equal(rows.length, 1);
    pool.calls.push('EVENT');
  });
  assert.deepEqual(pool.calls.slice(-4), ['NORMALIZE', 'EVENT', 'COMMIT', 'RELEASE']);
});

test('restore rolls back row and column replacement when its event fails', async () => {
  const pool = database();
  const restore = loadFunction('restoreBackup', {
    pgPool: pool, BACKUP_DIR: '.', path: { join: (...parts) => parts.join('/') },
    fs: { readFile: async () => JSON.stringify({ kind: 'wimifarma-cotacao-v2-backup', sheet: {} }) },
    normalizeColumnOrder: async () => {}
  });
  await assert.rejects(restore('cotacao-v2-test.json', 'quote', async () => { throw new Error('event unavailable'); }), /event unavailable/);
  assert.ok(!pool.calls.includes('COMMIT'));
  assert.deepEqual(pool.calls.slice(-2), ['ROLLBACK', 'RELEASE']);
});

test('quote reminder query failure stays best effort after committed import', async () => {
  const warnings = [];
  const sync = loadFunction('syncEncomendaRemindersForQuote', {
    pgPool: { async query() { throw new Error('reminder unavailable'); } },
    console: { warn(...args) { warnings.push(args); } }
  });
  const result = await sync('quote');
  assert.equal(result.failed, 1);
  assert.equal(warnings.length, 1);
});

test('oversized cell batch rejects before quote access or mutation', async () => {
  const start = source.indexOf('app.patch(`${BASE_PATH}/api/cells/batch`');
  const end = source.indexOf('\n}));', start) + 5;
  let handler;
  const noop = () => {};
  vm.runInNewContext(source.slice(start, end), {
    app: { patch(_path, ...handlers) { handler = handlers.at(-1); } }, BASE_PATH: '/cotacao',
    requireApiAuth: noop, verifyCsrf: noop, asyncRoute: (fn) => fn,
    getOrCreateDefaultQuote: async () => { throw new Error('Quote must not be accessed'); }
  });
  const res = { status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ body: { changes: Array.from({ length: 1001 }, () => ({})) } }, res);
  assert.equal(res.code, 422);
  assert.equal(res.body.ok, false);
});
