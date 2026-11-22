import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';

const source = await readFile(new URL('../dist/server.js', import.meta.url), 'utf8');
const workflow = source.slice(source.indexOf('async function createAutomaticRedemption('), source.indexOf('async function createPurchaseAndCredit('));
const token = '11111111-1111-4111-8111-111111111111';

function harness(availableCents = 1000) {
  const operations = new Map();
  const purchases = new Map();
  const awarded = new Set();
  const locks = new Map();
  let nextId = 0;
  let failPurchase = false;
  let failXp = false;
  const pool = { async connect() {
    let staged, stagedPurchase, unlock;
    return { release() {}, async query(sql, args = []) {
      if (sql === 'BEGIN') return { rows: [] };
      if (/INSERT INTO cashback_redemption_operations/.test(sql)) {
        const prior = locks.get(args[0]) || Promise.resolve();
        const current = new Promise(resolve => { unlock = resolve; });
        locks.set(args[0], prior.then(() => current));
        await prior;
        if (!operations.has(args[0])) staged = { request_token: args[0], actor_user_id: args[1], request_hash: args[2], purchase_id: null };
        return { rows: [] };
      }
      if (/FROM cashback_redemption_operations/.test(sql)) return { rows: [staged || operations.get(args[0])] };
      if (/UPDATE cashback_redemption_operations/.test(sql)) { staged.purchase_id = args[0]; return { rows: [] }; }
      if (/FROM cashback_purchases/.test(sql)) return { rows: [purchases.get(args[0])] };
      if (/FROM cashback_credits/.test(sql)) return { rows: [{ id: 1, remaining_cents: availableCents }] };
      if (/INSERT INTO cashback_redemptions/.test(sql)) return { rows: [{ id: nextId + 1 }] };
      if (/UPDATE cashback_redemptions/.test(sql)) return { rows: [] };
      if (sql === 'COMMIT') {
        if (staged) operations.set(staged.request_token, structuredClone(staged));
        if (stagedPurchase) purchases.set(stagedPurchase.id, stagedPurchase);
        unlock?.(); unlock = null;
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') { staged = null; stagedPurchase = null; unlock?.(); unlock = null; return { rows: [] }; }
      throw new Error('Unexpected SQL: ' + sql);
    }, stagePurchase(input) {
      if (failPurchase) { failPurchase = false; throw new Error('simulated purchase failure'); }
      const id = ++nextId;
      stagedPurchase = { id, redemption_id: input.redemptionId, cashback_discount_cents: input.discountCents, charged_cents: input.grossCents - input.discountCents, cashback_generated_cents: 150 };
      return { id, chargedCents: stagedPurchase.charged_cents, cashbackCents: 150 };
    } };
  } };
  const context = {
    crypto, pgPool: pool, BASE_PATH: '/cashback',
    num: value => Number(value) || 0,
    cleanText: value => String(value || '').trim(),
    moneyToCents: value => Math.round(Number(value) * 100),
    parseQuickVoucherCodes: () => ({ codes: [] }),
    loadSettings: async () => ({ redeemMultiplier: 4, cashbackPercentBps: 500 }),
    activeClientExists: async () => true,
    normalizeAttendantId: async value => value,
    consumeCredits: async () => {},
    createPurchaseAndCredit: async (client, input) => client.stagePurchase(input),
    awardXpForCashbackRedemption: async (req, id) => { if (failXp) { failXp = false; return { message: 'XP pending' }; } awarded.add(id); return { message: 'XP' }; },
    logAction: async () => {},
    brMoneyCents: String,
    errorMessage: error => error.message,
    setFlash: (req, type, message) => { req.flash = { type, message }; },
    rememberCashbackPurchaseReceipt: (req, id) => { req.receiptId = id; },
  };
  vm.runInNewContext(workflow, context);
  async function redeem(requestToken = token, changes = {}, actorId = 9) {
    const req = { body: { cliente_id: 7, atendente_id: 8, valor_compra: '40', print_after_save: '1', request_token: requestToken, ...changes }, session: { user: { id: actorId } } };
    const res = { redirect(url) { req.redirect = url; } };
    await context.createAutomaticRedemption(req, res);
    return req;
  }
  return { redeem, purchases, awarded, operations, failNextPurchase() { failPurchase = true; }, failNextXp() { failXp = true; } };
}

test('concurrent retries keep one purchase, redemption, reward and original receipt', async () => {
  const h = harness();
  const [first, retry] = await Promise.all([h.redeem(), h.redeem()]);
  assert.equal(h.purchases.size, 1);
  assert.equal(h.awarded.size, 1);
  assert.equal(first.receiptId, retry.receiptId);
  assert.match(retry.redirect, /receipt_purchase_id=1&auto_print_receipt=1/);
  const later = await h.redeem();
  assert.equal(later.receiptId, first.receiptId);
  assert.equal(h.purchases.size, 1);
});

test('distinct operation tokens allow identical legitimate purchases', async () => {
  const h = harness();
  await h.redeem();
  await h.redeem('22222222-2222-4222-8222-222222222222');
  assert.equal(h.purchases.size, 2);
  assert.equal(h.awarded.size, 2);
});

test('missing token and a reused token with changed operation fail without another purchase', async () => {
  const h = harness();
  const missing = await h.redeem('');
  assert.equal(missing.flash.type, 'error');
  assert.equal(h.purchases.size, 0);
  await h.redeem();
  const changed = await h.redeem(token, { valor_compra: '50' });
  assert.equal(changed.flash.type, 'error');
  assert.equal(h.purchases.size, 1);
});

test('failed transaction releases the operation for a safe retry', async () => {
  const h = harness();
  h.failNextPurchase();
  const failed = await h.redeem();
  assert.equal(failed.flash.type, 'error');
  assert.equal(h.operations.size, 0);
  assert.equal(h.purchases.size, 0);
  const retry = await h.redeem();
  assert.equal(retry.flash.type, 'success');
  assert.equal(h.purchases.size, 1);
});

test('operation tokens cannot be reused by a different actor', async () => {
  const h = harness();
  await h.redeem();
  const other = await h.redeem(token, {}, 10);
  assert.equal(other.flash.type, 'error');
  assert.equal(h.purchases.size, 1);
});

test('purchase without available cashback also replays one original receipt', async () => {
  const h = harness(0);
  const first = await h.redeem();
  const retry = await h.redeem();
  assert.equal(h.purchases.size, 1);
  assert.equal(h.awarded.size, 0);
  assert.equal(first.receiptId, retry.receiptId);
});

test('retry recovers pending XP after the purchase commit without repeating financial writes', async () => {
  const h = harness();
  h.failNextXp();
  const first = await h.redeem();
  assert.equal(h.purchases.size, 1);
  assert.equal(h.awarded.size, 0);
  const retry = await h.redeem();
  assert.equal(retry.receiptId, first.receiptId);
  assert.equal(h.purchases.size, 1);
  assert.equal(h.awarded.size, 1);
});
