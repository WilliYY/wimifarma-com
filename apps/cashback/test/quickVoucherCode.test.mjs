import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_QUICK_VOUCHER_CODE_DIGITS,
  QUICK_VOUCHER_CODE_MAX,
  QUICK_VOUCHER_CODE_SPACE,
  findAvailableQuickVoucherCode,
  normalizeQuickVoucherCode,
  quickVoucherCodeAt,
} from '../dist/quickVoucherCode.js';

test('new quick voucher codes use five digits in the cashback-only range', () => {
  assert.equal(CURRENT_QUICK_VOUCHER_CODE_DIGITS, 5);
  assert.equal(QUICK_VOUCHER_CODE_SPACE, 50_000);
  assert.equal(QUICK_VOUCHER_CODE_MAX, 49_999);
  assert.equal(quickVoucherCodeAt(930, 0), '00930');
  assert.equal(quickVoucherCodeAt(49_999, 1), '00000');
});

test('normalization accepts legacy four-digit and current five-digit codes only', () => {
  assert.equal(normalizeQuickVoucherCode('09-30'), '0930');
  assert.equal(normalizeQuickVoucherCode('00 930'), '00930');
  assert.equal(normalizeQuickVoucherCode('930'), '');
  assert.equal(normalizeQuickVoucherCode('000930'), '');
});

test('a code remains unavailable while reserved and returns after its reservation expires', () => {
  const reserved = new Set(['00930']);
  assert.equal(findAvailableQuickVoucherCode(reserved, 930), '00931');
  reserved.delete('00930');
  assert.equal(findAvailableQuickVoucherCode(reserved, 930), '00930');
});

test('generation reports exhaustion when every current code is reserved', () => {
  const reserved = new Set(
    Array.from({ length: QUICK_VOUCHER_CODE_SPACE }, (_, index) => quickVoucherCodeAt(0, index)),
  );
  assert.equal(findAvailableQuickVoucherCode(reserved, 0), '');
});
