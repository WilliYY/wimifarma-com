import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { pixReceiptAutoIdempotencyKey } from './pix-receipt-auto.js';
import { reservePixReceiptIdentity } from './pix-receipt-identity.js';

const input = { endToEndId: 'E00000000202601010000SYNTHETIC0001', mediaFingerprint: 'a'.repeat(64), amountCents: 1234, paidDate: '2026-01-01' };
type Row = { alias: string; finance_key: string; amount_cents: string; paid_date: string };

class FakePool {
  rows = new Map<string, Row>();
  tails = new Map<string, Promise<void>>();
  clients: { commands: string[]; locks: string[]; released: boolean }[] = [];
  failInsert = false;

  async connect() {
    const state = { commands: [] as string[], locks: [] as string[], released: false };
    this.clients.push(state);
    const pending = new Map<string, Row>();
    const unlocks: (() => void)[] = [];
    const releaseLocks = () => { for (const unlock of unlocks.splice(0)) unlock(); };
    return {
      query: async (sql: string, values: unknown[] = []) => {
        state.commands.push(sql);
        if (sql.includes('pg_advisory_xact_lock')) {
          const alias = String(values[0]);
          state.locks.push(alias);
          const previous = this.tails.get(alias) ?? Promise.resolve();
          let unlock!: () => void;
          const lock = new Promise<void>((resolve) => { unlock = resolve; });
          this.tails.set(alias, previous.then(() => lock));
          await previous;
          unlocks.push(unlock);
        } else if (/^\s*SELECT/.test(sql)) {
          const aliases = values[0] as string[];
          return { rows: [...this.rows.values()].filter((row) => aliases.includes(row.alias)) };
        } else if (/^\s*INSERT/.test(sql)) {
          if (this.failInsert) throw new Error('simulated insert failure');
          const [alias, financeKey, amount, paidDate] = values;
          assert.equal(this.rows.has(String(alias)), false, 'aliases existentes nao devem ser sobrescritos');
          pending.set(String(alias), { alias: String(alias), finance_key: String(financeKey), amount_cents: String(amount), paid_date: String(paidDate) });
        } else if (sql === 'COMMIT') {
          for (const [alias, row] of pending) this.rows.set(alias, row);
          releaseLocks();
        } else if (sql === 'ROLLBACK') {
          pending.clear();
          releaseLocks();
        }
        return { rows: [] };
      },
      release: () => { state.released = true; },
    };
  }
}

function reserve(pool: FakePool, changes: Partial<typeof input> = {}) {
  return reservePixReceiptIdentity(pool as unknown as Pick<Pool, 'connect'>, { ...input, ...changes });
}

test('primeira reserva associa E2E e arquivo a mesma chave sem acessar Financeiro', async () => {
  const pool = new FakePool();
  const key = await reserve(pool);
  assert.equal(key, pixReceiptAutoIdempotencyKey(input.endToEndId, ''));
  assert.equal(pool.rows.size, 2);
  assert.deepEqual([...new Set([...pool.rows.values()].map((row) => row.finance_key))], [key]);
  assert.equal(pool.clients[0].released, true);
  assert.equal(pool.clients[0].commands.at(-1), 'COMMIT');
});

test('reenvio recupera chave reservada mesmo sem resultado financeiro conhecido', async () => {
  const pool = new FakePool();
  const key = await reserve(pool, { endToEndId: '' });
  assert.equal(await reserve(pool), key);
  assert.equal(await reserve(pool, { mediaFingerprint: '' }), key);
  assert.equal(pool.rows.size, 2);
});

test('novo E2E em arquivo repetido propaga a chave original', async () => {
  const pool = new FakePool();
  const key = await reserve(pool);
  const changedId = `${input.endToEndId}2`;
  assert.equal(await reserve(pool, { endToEndId: changedId }), key);
  assert.equal(await reserve(pool, { endToEndId: changedId, mediaFingerprint: '' }), key);
  assert.equal(pool.rows.size, 3);
});

test('E2E repetido associa arquivo novo a chave original', async () => {
  const pool = new FakePool();
  const key = await reserve(pool);
  const newFile = 'b'.repeat(64);
  assert.equal(await reserve(pool, { mediaFingerprint: newFile }), key);
  assert.equal(await reserve(pool, { endToEndId: '', mediaFingerprint: newFile }), key);
  assert.equal(pool.rows.size, 3);
});

test('reservas concorrentes por arquivo compartilhado convergem e adquirem locks lexicais', async () => {
  const pool = new FakePool();
  const keys = await Promise.all(Array.from({ length: 20 }, (_, i) => reserve(pool, { endToEndId: `${input.endToEndId}${i}` })));
  assert.equal(new Set(keys).size, 1);
  assert.equal(pool.rows.size, 21);
  assert.equal(pool.clients.every((client) => client.released), true);
  for (const client of pool.clients) {
    assert.deepEqual(client.locks, [...client.locks].sort());
    assert.equal(client.locks.length, 2);
    const selectIndex = client.commands.findIndex((sql) => /^\s*SELECT/.test(sql) && !sql.includes('pg_advisory_xact_lock'));
    assert.equal(client.commands.slice(1, selectIndex).every((sql) => sql.includes('pg_advisory_xact_lock')), true);
  }
});

test('aliases com chaves financeiras distintas retornam null sem inserir ou atualizar', async () => {
  const pool = new FakePool();
  await reserve(pool, { mediaFingerprint: '' });
  await reserve(pool, { endToEndId: '' });
  const before = [...pool.rows.entries()];
  assert.equal(await reserve(pool), null);
  assert.deepEqual([...pool.rows.entries()], before);
  assert.equal(pool.clients.at(-1)?.commands.at(-1), 'ROLLBACK');
});

test('valor ou data divergente bloqueia propagacao sem novas escritas', async () => {
  for (const changes of [{ amountCents: 1235 }, { paidDate: '2026-01-02' }]) {
    const pool = new FakePool();
    await reserve(pool, { endToEndId: '' });
    assert.equal(await reserve(pool, changes), null);
    assert.equal(pool.rows.size, 1);
    assert.equal(pool.clients.at(-1)?.commands.some((sql) => /^\s*INSERT/.test(sql)), false);
    assert.equal(pool.clients.at(-1)?.released, true);
  }
});

test('falha SQL faz rollback, libera cliente e preserva erro', async () => {
  const pool = new FakePool();
  pool.failInsert = true;
  await assert.rejects(reserve(pool), /simulated insert failure/);
  assert.equal(pool.rows.size, 0);
  assert.equal(pool.clients[0].commands.at(-1), 'ROLLBACK');
  assert.equal(pool.clients[0].released, true);
});

test('entrada sem identidade, valor inteiro positivo ou data real nao abre transacao', async () => {
  for (const changes of [
    { endToEndId: '', mediaFingerprint: '' }, { amountCents: 0 }, { amountCents: 1.5 },
    { amountCents: NaN }, { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { paidDate: '' }, { paidDate: '2026-02-30' }, { paidDate: '01/01/2026' },
  ]) {
    const pool = new FakePool();
    assert.equal(await reserve(pool, changes), null);
    assert.equal(pool.clients.length, 0);
  }
});
