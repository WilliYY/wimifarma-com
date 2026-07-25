import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XP_CASHBACK_REDEMPTION_POINTS,
  XP_CASHBACK_REDEMPTION_SOURCE,
  XP_CLIENT_CREATION_POINTS,
  XP_CLIENT_CREATION_SOURCE,
  XP_QUICK_VOUCHER_ISSUE_POINTS,
  XP_QUICK_VOUCHER_ISSUE_SOURCE,
  cashbackRedemptionXpReward,
  canCancelQuickVoucher,
  clientCreationXpReward,
  quickVoucherIssueXpReward,
} from '../dist/xpReward.js';

test('cashback use awards 250 XP with an idempotent redemption identity', () => {
  assert.deepEqual(cashbackRedemptionXpReward(8), {
    points: 250,
    source: 'cashback_redemption',
    sourceEntityId: '8',
  });
  assert.equal(XP_CASHBACK_REDEMPTION_POINTS, 250);
  assert.equal(XP_CASHBACK_REDEMPTION_SOURCE, 'cashback_redemption');
});

test('cashback use XP rejects invalid redemption ids', () => {
  assert.throws(() => cashbackRedemptionXpReward(0), /Resgate invalido/);
  assert.throws(() => cashbackRedemptionXpReward(Number.NaN), /Resgate invalido/);
});

test('client creation awards 250 XP to the selected responsible user', () => {
  assert.deepEqual(clientCreationXpReward(139), {
    points: 250,
    source: 'cashback_client_creation',
    sourceEntityId: '139',
  });
  assert.equal(XP_CLIENT_CREATION_POINTS, 250);
  assert.equal(XP_CLIENT_CREATION_SOURCE, 'cashback_client_creation');
});

test('client creation XP rejects invalid client ids', () => {
  assert.throws(() => clientCreationXpReward(0), /Cliente invalido/);
  assert.throws(() => clientCreationXpReward(Number.NaN), /Cliente invalido/);
});

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
