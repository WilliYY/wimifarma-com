import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizedCoreUser,
  readinessResult,
  sessionCookieSecureMode,
  sortCellChangesForLocking
} from './runtime-guards.js';

test('authorizedCoreUser blocks an inactive adm session', () => {
  assert.equal(authorizedCoreUser({
    id: '1',
    username: 'adm',
    role: 'admin',
    active: false,
    permission_count: '0',
    can_access: true
  }), null);
});

test('authorizedCoreUser refreshes an active allowed user', () => {
  assert.deepEqual(authorizedCoreUser({
    id: '7',
    username: 'balcao',
    role: 'user',
    active: true,
    permission_count: '1',
    can_access: true
  }), {
    id: 7,
    username: 'balcao',
    role: 'user',
    active: true
  });
});

test('authorizedCoreUser preserves default access only for an active user without explicit permissions', () => {
  assert.equal(authorizedCoreUser({
    id: '8',
    username: 'estoque',
    role: 'user',
    active: true,
    permission_count: '0',
    can_access: false
  })?.username, 'estoque');

  assert.equal(authorizedCoreUser({
    id: '8',
    username: 'estoque',
    role: 'user',
    active: true,
    permission_count: '1',
    can_access: false
  }), null);
});

test('readinessResult reports unavailable dependencies with HTTP 503', () => {
  assert.deepEqual(readinessResult({
    quoteReady: true,
    redisReady: true,
    auth: { coreReachable: false, usersSynced: false }
  }), { ok: false, status: 503 });

  assert.deepEqual(readinessResult({
    quoteReady: true,
    redisReady: true,
    auth: { coreReachable: true, usersSynced: true }
  }), { ok: true, status: 200 });
});

test('sessionCookieSecureMode uses secure auto mode in production', () => {
  assert.equal(sessionCookieSecureMode('production'), 'auto');
  assert.equal(sessionCookieSecureMode('development'), false);
  assert.equal(sessionCookieSecureMode('production', 'false'), false);
  assert.equal(sessionCookieSecureMode('development', 'true'), true);
});

test('sortCellChangesForLocking orders row locks and preserves order inside each row', () => {
  const changes = [
    { rowId: 'b', columnKey: 'produto', value: 'B1' },
    { rowId: 'a', columnKey: 'produto', value: 'A1' },
    { rowId: 'b', columnKey: 'categoria', value: 'B2' },
    { rowId: 'a', columnKey: 'categoria', value: 'A2' }
  ];

  assert.deepEqual(
    sortCellChangesForLocking(changes).map((change) => `${change.rowId}:${change.value}`),
    ['a:A1', 'a:A2', 'b:B1', 'b:B2']
  );
  assert.deepEqual(changes.map((change) => change.value), ['B1', 'A1', 'B2', 'A2']);
});
