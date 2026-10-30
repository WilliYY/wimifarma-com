import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const selected = new Set(['withFinanceTransaction', 'lockClosingById', 'updateManualClosing', 'closeClosing', 'cancelEntry']);
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && selected.has(node.name?.text)).map(node => node.getText(tree)).join('\n');

function harness({ closeBeforeSave = false, currentDifference = 0 } = {}) {
  let closing = { id: 1, status: 'conferencia', faturamento_dia: 0, sobra_falta: 0 };
  const events = [];
  let locked = false;
  let auditClient;
  let recalculateClient;
  const query = async (sql, args = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) { events.push(sql); return { rows: [] }; }
    if (sql.includes('FOR UPDATE')) {
      locked = true;
      events.push('LOCK');
      if (closeBeforeSave) closing.status = 'fechado';
      return { rows: [{ ...closing }] };
    }
    if (sql.includes('responsible_legacy_id')) {
      events.push('SAVE');
      closing.status = 'conferencia';
    } else if (sql.includes('closed_at = NOW()')) {
      events.push('CLOSE');
      closing.status = args[0];
    }
    if (sql.includes('UPDATE financeiro_entries')) events.push('CANCEL');
    return { rows: [{ ...closing }] };
  };
  const client = { query, release() { events.push('RELEASE'); } };
  const context = vm.createContext({
    pgPool: { query, connect: async () => client },
    pgClient: value => value || { query }, transactionAuditMirrors: new WeakMap(),
    fetchClosingById: async () => {
      const snapshot = { ...closing };
      if (closeBeforeSave) closing.status = 'fechado';
      return snapshot;
    },
    fetchClosingByDate: async () => {
      const snapshot = { ...closing };
      if (closeBeforeSave) closing.status = 'fechado';
      return snapshot;
    },
    closingToView: row => row,
    isLocked: row => ['fechado', 'divergente'].includes(row.status),
    moneyTextToCents: Number, divergenceLimitCents: async transaction => {
      assert.equal(transaction, client, 'limite de divergencia deve usar a conexao ja bloqueada');
      return 100;
    },
    recalculateClosing: async (_id, transaction) => {
      events.push('RECALCULATE');
      recalculateClient = transaction;
      return { ...closing, sobra_falta: currentDifference };
    },
    auditEvent: async (...args) => {
      events.push('AUDIT');
      auditClient = args[7];
    },
    Date,
  });
  vm.runInContext(ts.transpile(functions, { target: ts.ScriptTarget.ES2022 }), context);
  return {
    save: () => vm.runInContext('updateManualClosing(1, { pix_correto_manual: null, faturamento_dia: 0 })', context),
    close: () => vm.runInContext("closeClosing(1, 'fechado')", context),
    cancel: () => vm.runInContext("cancelEntry('2026-10-30', 1, {session:{user:{id:1}}})", context),
    get status() { return closing.status; }, events,
    get transactionUsed() { return locked && auditClient === client && recalculateClient === client; },
  };
}

test('autosave iniciado antes do fechamento nao reabre o dia ao terminar', async () => {
  const db = harness({ closeBeforeSave: true });
  await assert.rejects(db.save(), /Reabra/);
  assert.equal(db.status, 'fechado');
  assert.equal(db.events.includes('SAVE'), false);
});

test('fechamento calcula divergencia atual sob lock em vez de aceitar snapshot antigo', async () => {
  const db = harness({ currentDifference: 5000 });
  const closed = await db.close();
  assert.equal(closed.status, 'divergente');
  assert.ok(db.events.indexOf('LOCK') < db.events.indexOf('RECALCULATE'));
  assert.ok(db.events.indexOf('RECALCULATE') < db.events.indexOf('CLOSE'));
  assert.ok(db.events.indexOf('CLOSE') < db.events.indexOf('COMMIT'));
  assert.equal(db.transactionUsed, true);
});

test('autosave de dia aberto grava e audita na mesma transacao', async () => {
  const db = harness();
  await db.save();
  assert.equal(db.status, 'conferencia');
  assert.deepEqual(db.events, ['BEGIN', 'LOCK', 'SAVE', 'RECALCULATE', 'AUDIT', 'COMMIT', 'RELEASE']);
  assert.equal(db.transactionUsed, true);
});

test('cancelamento iniciado antes de fechar nao altera lancamento de dia fechado', async () => {
  const db = harness({ closeBeforeSave: true });
  await assert.rejects(db.cancel(), /Reabra/);
  assert.equal(db.status, 'fechado');
  assert.equal(db.events.includes('CANCEL'), false);
});
