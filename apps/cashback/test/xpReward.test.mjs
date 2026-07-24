import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XP_QUICK_VOUCHER_ISSUE_POINTS,
  XP_QUICK_VOUCHER_ISSUE_SOURCE,
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
