import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XP_QUICK_VOUCHER_ISSUE_POINTS,
  XP_QUICK_VOUCHER_ISSUE_SOURCE,
  canCancelQuickVoucher,
  quickVoucherIssueXpReward,
} from '../dist/xpReward.js';

test('quick voucher issue awards 250 XP with an idempotent source identity', () => {
  assert.deepEqual(quickVoucherIssueXpReward(42), {
    points: 250,
    source: 'cashback_quick_voucher_issue',
    sourceEntityId: '42',
  });
  assert.equal(XP_QUICK_VOUCHER_ISSUE_POINTS, 250);
  assert.equal(XP_QUICK_VOUCHER_ISSUE_SOURCE, 'cashback_quick_voucher_issue');
});

test('quick voucher XP rejects invalid voucher ids', () => {
  assert.throws(() => quickVoucherIssueXpReward(0), /Cupom invalido/);
  assert.throws(() => quickVoucherIssueXpReward(Number.NaN), /Cupom invalido/);
});

test('only an active quick voucher can be canceled', () => {
  assert.equal(canCancelQuickVoucher('ativo'), true);
  assert.equal(canCancelQuickVoucher(' ATIVO '), true);
  assert.equal(canCancelQuickVoucher('usado'), false);
  assert.equal(canCancelQuickVoucher('expirado'), false);
  assert.equal(canCancelQuickVoucher('cancelado'), false);
});
