export const XP_QUICK_VOUCHER_ISSUE_POINTS = 250;
export const XP_QUICK_VOUCHER_ISSUE_SOURCE = 'cashback_quick_voucher_issue';

export type XpRewardDescriptor = {
  points: number;
  source: string;
  sourceEntityId: string;
};

export function quickVoucherIssueXpReward(voucherId: number): XpRewardDescriptor {
  const normalizedVoucherId = Math.trunc(voucherId);
  if (!Number.isSafeInteger(normalizedVoucherId) || normalizedVoucherId <= 0) {
    throw new Error('Cupom invalido para premiacao de XP.');
  }
  return {
    points: XP_QUICK_VOUCHER_ISSUE_POINTS,
    source: XP_QUICK_VOUCHER_ISSUE_SOURCE,
    sourceEntityId: String(normalizedVoucherId),
  };
}
