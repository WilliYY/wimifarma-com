import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverUrl = new URL('../src/server.ts', import.meta.url);
const appUrl = new URL('../../../site/cashback/app.js', import.meta.url);

test('new client and redemption forms expose repeatable quick voucher codes', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');

  assert.match(serverSource, /function renderQuickVoucherCodeList/);
  assert.equal((serverSource.match(/\$\{renderQuickVoucherCodeList\(\)\}/g) || []).length, 2);
  assert.match(serverSource, /data-quick-voucher-list/);
  assert.match(serverSource, /data-add-quick-voucher/);
  assert.match(serverSource, /data-remove-quick-voucher/);
});

test('multiple quick vouchers are locked and consumed in one transaction and one purchase', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const helperStart = serverSource.indexOf('async function redeemQuickVouchersAndCreateSuccessor');
  const helperEnd = serverSource.indexOf('async function consumeCredits', helperStart);
  const helper = serverSource.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'batch redemption helper should exist');
  assert.match(helper, /code = ANY\(\$1::text\[\]\)/);
  assert.match(helper, /FOR UPDATE/);
  assert.match(helper, /calculateQuickVoucherBatchTotals/);
  assert.equal((helper.match(/INSERT INTO cashback_redemptions/g) || []).length, 1);
  assert.equal((helper.match(/INSERT INTO cashback_purchases/g) || []).length, 1);
  assert.match(helper, /WHERE id = ANY\(\$4::bigint\[\]\)/);
});

test('the dashboard keeps scalar compatibility while parsing repeated quick voucher fields', async () => {
  const serverSource = await readFile(serverUrl, 'utf8');
  const clientWorkflow = serverSource.slice(
    serverSource.indexOf('async function createClientFromDashboard'),
    serverSource.indexOf('async function createPurchaseFromDashboard'),
  );
  const redeemWorkflow = serverSource.slice(
    serverSource.indexOf('async function createAutomaticRedemption'),
    serverSource.indexOf('async function createPurchaseAndCredit'),
  );

  assert.match(clientWorkflow, /parseQuickVoucherCodes\(req\.body\?\.codigo_cashback\)/);
  assert.match(clientWorkflow, /redeemQuickVouchersAndCreateSuccessor/);
  assert.match(redeemWorkflow, /parseQuickVoucherCodes\(req\.body\?\.codigo_cashback\)/);
  assert.match(redeemWorkflow, /redeemQuickVouchersAndCreateSuccessor/);
  assert.match(serverSource, /DROP CONSTRAINT IF EXISTS cashback_quick_vouchers_redemption_id_key/);
  assert.equal(
    (serverSource.match(/consumeQuickVoucherAttempt\(req, 'redeem', 30, 10 \* 60, 30 \* 60, quickCodes\.length\)/g) || []).length,
    2,
  );
  assert.match(serverSource, /resetWindow \? safeAttemptCost : num\(row\.attempts_count\) \+ safeAttemptCost/);
});

test('the browser can add and remove voucher rows and aggregates their previews', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(appSource, /function bindQuickVoucherLists/);
  assert.match(appSource, /data-add-quick-voucher/);
  assert.match(appSource, /data-remove-quick-voucher/);
  assert.match(appSource, /function quickVoucherFormState/);
  assert.match(appSource, /querySelectorAll\('\[data-quick-voucher-code\]'\)/);
  assert.match(appSource, /Math\.ceil\(cashbackCents \* multiplier\) \/ 100/);
});
