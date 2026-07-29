import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_QUICK_VOUCHERS_PER_TRANSACTION,
  calculateQuickVoucherBatchTotals,
  parseQuickVoucherCodes,
} from '../dist/quickVoucherBatch.js';

test('quick voucher batch accepts the legacy scalar field and repeated form fields', () => {
  assert.deepEqual(parseQuickVoucherCodes('09-30'), {
    codes: ['0930'],
    error: '',
  });
  assert.deepEqual(parseQuickVoucherCodes(['00930', '', '88 021']), {
    codes: ['00930', '88021'],
    error: '',
  });
});

test('quick voucher batch rejects invalid, duplicate, or excessive codes', () => {
  assert.match(parseQuickVoucherCodes(['00930', '930']).error, /invalido/i);
  assert.match(parseQuickVoucherCodes(['00930', '00 930']).error, /repetido/i);
  assert.match(
    parseQuickVoucherCodes(Array.from({ length: MAX_QUICK_VOUCHERS_PER_TRANSACTION + 1 }, (_, index) => String(index).padStart(5, '0'))).error,
    /no maximo 10/i,
  );
});

test('quick voucher batch applies the 4x rule to the combined cashback and creates one successor value', () => {
  assert.deepEqual(calculateQuickVoucherBatchTotals([250, 150], 2000, 4, 500), {
    redeemedCents: 400,
    requiredPurchaseCents: 1600,
    chargedCents: 1600,
    successorCashbackCents: 80,
  });
});

test('quick voucher batch blocks a purchase below the combined minimum', () => {
  assert.throws(
    () => calculateQuickVoucherBatchTotals([250, 150], 1599, 4, 500),
    /pelo menos R\$ 16,00/i,
  );
});

test('combined minimum rounds once after summing all voucher cents', () => {
  const totals = calculateQuickVoucherBatchTotals([1, 1], 3, 1.5, 500);

  assert.equal(totals.redeemedCents, 2);
  assert.equal(totals.requiredPurchaseCents, 3);
});
