import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./server.js', import.meta.url), 'utf8');
const delivery = source.includes('async function awardXpForDelivery(');
const awardName = delivery ? 'awardXpForDelivery' : 'awardXp';
const revokeName = delivery ? 'revokeXpForDelivery' : 'revokeXp';
const start = source.indexOf('async function ' + awardName + '(');
const workflow = source.slice(start, source.indexOf('async function ensureSchema(', start));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(pauseInsert = false) {
  let status = 'ACTIVE';
  let sale: { id: string; deleted_at: string | null } | null = null;
  let tail = Promise.resolve();
  const inserting = deferred();
  const resume = deferred();
  const sourcePool = { async query() { return { rows: [{ status }] }; } };
  const xpPool = { async connect() {
    let unlock: (() => void) | undefined;
    let staged: { id: string; deleted_at: string | null } | undefined;
    return { release() {}, async query(sql: string) {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) {
        const prior = tail;
        const lock = deferred();
        tail = prior.then(() => lock.promise);
        await prior;
        unlock = lock.resolve;
        return { rows: [] };
      }
      if (sql.includes('FROM xp_sales')) return { rows: sale ? [{ ...sale }] : [] };
      if (sql.includes('INSERT INTO xp_sales')) {
        inserting.resolve();
        if (pauseInsert) await resume.promise;
        staged = { id: '1', deleted_at: null };
        return { rows: [{ id: '1' }] };
      }
      if (sql.includes('UPDATE xp_sales')) { staged = { id: '1', deleted_at: 'cancelled' }; return { rows: [] }; }
      if (sql.includes('INSERT INTO xp_audit_events')) return { rows: [] };
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (sql === 'COMMIT' && staged !== undefined) sale = staged;
        staged = undefined;
        unlock?.(); unlock = undefined;
        return { rows: [] };
      }
      throw new Error('Unexpected SQL: ' + sql);
    } };
  } };
  const context: Record<string, any> = {
    xpPool, deliveryPool: sourcePool, referralPool: sourcePool,
    deliveryCreationXpReward: () => ({ points: 400, source: 'delivery_creation', sourceEntityId: '1' }),
    referralRedemptionXpReward: () => ({ points: 300, source: 'referral_coupon_redemption', sourceEntityId: '1' }),
    ensureXpRewardSchema: async () => {}, ensureXpSchema: async () => {},
    linkedXpEmployeeForUser: async () => ({ id: 2, name: 'Ana' }),
    linkedXpEmployee: async () => ({ id: 2, name: 'Ana' }),
    setRedemptionXpStatus: async () => {}, insertAuditSafe: async () => {}, logCoreAudit: async () => {},
    cleanSingleLine: (value: string) => value, console,
  };
  vm.runInNewContext(workflow, context);
  const user = { id: 9, displayName: 'Ana' };
  return {
    award: () => delivery ? context[awardName](1, 9, user) : context[awardName](1, user),
    revoke: () => { status = 'CANCELLED'; return context[revokeName](1, user); },
    inserting: inserting.promise, resume: resume.resolve,
    activeXp: () => sale && !sale.deleted_at ? 1 : 0,
  };
}

test('cancelamento sem lancamento impede premio tardio', async () => {
  const h = harness();
  await h.revoke();
  const result = await h.award();
  assert.equal(h.activeXp(), 0);
  assert.equal(result.awarded, false);
});

test('cancelamento durante a premiacao espera e estorna o XP confirmado', async () => {
  const h = harness(true);
  const award = h.award();
  await h.inserting;
  const revoke = h.revoke();
  await new Promise(resolve => setImmediate(resolve));
  h.resume();
  await Promise.all([award, revoke]);
  assert.equal(h.activeXp(), 0);
});
