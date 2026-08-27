import test from 'node:test';
import assert from 'node:assert/strict';

import { withTransaction } from './db-transaction.js';

function fakePool({ failOn = '' } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === failOn) throw new Error(`failed:${sql}`);
      return { rows: [] };
    },
    release() {
      calls.push('RELEASE');
    }
  };
  return {
    calls,
    async connect() {
      calls.push('CONNECT');
      return client;
    }
  };
}

test('withTransaction commits the work before releasing the client', async () => {
  const pool = fakePool();
  const result = await withTransaction(pool, async (client) => {
    await client.query('MUTATION');
    await client.query('EVENT');
    return { ok: true };
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(pool.calls, ['CONNECT', 'BEGIN', 'MUTATION', 'EVENT', 'COMMIT', 'RELEASE']);
});

test('withTransaction rolls back failed work and preserves the original error', async () => {
  const pool = fakePool({ failOn: 'EVENT' });

  await assert.rejects(
    withTransaction(pool, async (client) => {
      await client.query('MUTATION');
      await client.query('EVENT');
    }),
    /failed:EVENT/
  );

  assert.deepEqual(pool.calls, ['CONNECT', 'BEGIN', 'MUTATION', 'EVENT', 'ROLLBACK', 'RELEASE']);
});
