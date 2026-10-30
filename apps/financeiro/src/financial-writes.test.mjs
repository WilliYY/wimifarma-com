import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['saveDailyRevenue', 'withFinanceTransaction', 'lockClosingById', 'addEntry', 'auditEvent']);
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(tree)).join('\n');
const routeStart = source.indexOf('app.post(`${BASE_PATH}/api/internal/lancamentos`');
const routeEnd = source.indexOf('app.post(`${BASE_PATH}/api/internal/faturamentos`', routeStart);

function harness(status = 'aberto') {
  let handler;
  let committed = { entries: [], keys: new Map(), audits: [] };
  let tail = Promise.resolve();
  let failKey = false;
  let raceStatus;
  let closing = { id: 1, status };
  const mirrors = [];
  const query = async (sql, args = [], state = committed) => {
    if (sql.includes('SELECT result FROM financeiro_internal_idempotency')) return { rows: state.keys.has(args[0]) ? [{ result: state.keys.get(args[0]) }] : [] };
    if (sql.includes('INSERT INTO financeiro_internal_idempotency')) {
      if (failKey) { failKey = false; throw new Error('simulated persistence failure'); }
      state.keys.set(args[0], JSON.parse(args[1]));
    }
    if (sql.includes('SELECT * FROM financeiro_closings')) return { rows: [closing] };
    if (sql.includes('INSERT INTO financeiro_entries')) {
      const entry = { id: state.entries.length + 1 };
      state.entries.push(entry);
      return { rows: [entry] };
    }
    if (sql.includes('INSERT INTO financeiro_audit_events')) state.audits.push(args);
    if (sql.includes('UPDATE financeiro_closings')) {
      if (raceStatus) closing.status = raceStatus;
      if (['fechado', 'divergente'].includes(closing.status) && sql.includes('NOT IN')) return { rows: [] };
      closing = { ...closing, daily_revenue_cents: args[0], status: args[2] ? 'conferencia' : closing.status };
      return { rows: [closing] };
    }
    return { rows: [] };
  };
  const pool = {
    query,
    async connect() {
      let state;
      let unlock;
      return {
        async query(sql, args) {
          if (sql === 'BEGIN') {
            state = { entries: [...committed.entries], keys: new Map(committed.keys), audits: [...committed.audits] };
          } else if (sql.includes('pg_advisory_xact_lock')) {
            const previous = tail;
            tail = new Promise(resolve => { unlock = resolve; });
            await previous;
            state = { entries: [...committed.entries], keys: new Map(committed.keys), audits: [...committed.audits] };
          } else if (sql === 'COMMIT') { committed = state; unlock?.(); }
          else if (sql === 'ROLLBACK') { unlock?.(); }
          else return query(sql, args, state);
          return { rows: [] };
        },
        release() {},
        get state() { return state; },
      };
    },
  };
  const context = vm.createContext({
    pgPool: pool, pgClient: client => client || pool, transactionAuditMirrors: new WeakMap(),
    BASE_PATH: '/financeiro', app: { post(_path, fn) { handler = fn; } },
    asyncRoute: fn => fn, requireInternalToken: () => true,
    cleanText: value => String(value ?? '').trim(), validFinanceDate: value => value || '2026-10-30',
    todayDate: () => '2026-10-30', moneyTextToCents: Number, intOrNull: Number,
    coreUserById: async () => ({ id: 1 }), canAccessFinanceiro: async () => true,
    centsToDecimal: value => value / 100,
    getOrCreateClosing: async () => closing, fetchClosingById: async () => closing,
    isLocked: row => ['fechado', 'divergente'].includes(row.status), closingToView: row => row,
    mirrorCoreAudit: async (...args) => { mirrors.push(args); },
    recalculateClosing: async (_id, client) => { assert.ok(client); return { total_conferido: 10 }; },
    console, Date,
  });
  vm.runInContext(ts.transpile(functions + '\n' + source.slice(routeStart, routeEnd), { target: ts.ScriptTarget.ES2022 }), context);
  return {
    async post(key = 'confirmation-1') {
      let response;
      await handler({ body: { idempotency_key: key, categoria: 'Pix CNPJ', amount_cents: 1000, responsavel: 'Ana' } }, { json(value) { response = value; }, status() { return this; } });
      return response;
    },
    save: value => vm.runInContext(`saveDailyRevenue('2026-10-30', ${value}, 1, 'relatorio_auto')`, context),
    get count() { return committed.entries.length; },
    get closing() { return closing; },
    get auditCount() { return committed.audits.length; },
    get mirrorCount() { return mirrors.length; },
    failNextKey() { failKey = true; },
    closeBeforeUpdate() { raceStatus = 'fechado'; },
  };
}

test('faturamento rejeita fechamento ocorrido entre leitura e UPDATE', async () => {
  const db = harness();
  db.closeBeforeUpdate();
  await assert.rejects(db.save(5000), /Reabra/);
  assert.equal(db.closing.daily_revenue_cents, undefined);
  assert.equal(db.auditCount, 0);
});

test('faturamento zero preserva sem_movimento', async () => {
  const db = harness('sem_movimento');
  await db.save(0);
  assert.equal(db.closing.status, 'sem_movimento');
});

for (const status of ['fechado', 'divergente']) {
  test(`faturamento rejeita dia ${status} sem alterar valor ou auditoria`, async () => {
    const db = harness(status);
    await assert.rejects(db.save(5000), /Reabra/);
    assert.equal(db.closing.daily_revenue_cents, undefined);
    assert.equal(db.auditCount, 0);
  });
}

for (const status of ['aberto', 'conferencia', 'sem_movimento']) {
  test(`faturamento preserva edicao de dia ${status}`, async () => {
    const db = harness(status);
    await db.save(5000);
    assert.equal(db.closing.daily_revenue_cents, 5000);
    assert.equal(db.closing.status, status === 'sem_movimento' ? 'conferencia' : status);
  });
}

test('confirmacoes concorrentes com mesma chave gravam um lancamento', async () => {
  const db = harness();
  const results = await Promise.all(Array.from({ length: 8 }, () => db.post()));
  assert.equal(db.count, 1);
  assert.equal(results.filter(result => result.idempotent).length, 7);
});

test('falha ao persistir chave desfaz lancamento e retry grava uma vez', async () => {
  const db = harness();
  db.failNextKey();
  await assert.rejects(db.post(), /simulated persistence failure/);
  assert.equal(db.count, 0);
  assert.equal(db.auditCount, 0);
  assert.equal(db.mirrorCount, 0);
  await db.post();
  assert.equal(db.count, 1);
  assert.equal(db.auditCount, 1);
  assert.equal(db.mirrorCount, 1);
  assert.equal((await db.post()).idempotent, true);
  assert.equal(db.count, 1);
});

test('operacoes iguais com chaves distintas continuam permitidas', async () => {
  const db = harness();
  await db.post('confirmation-1');
  await db.post('confirmation-2');
  assert.equal(db.count, 2);
});
