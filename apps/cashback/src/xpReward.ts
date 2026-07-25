export const XP_CASHBACK_REDEMPTION_POINTS = 250;
export const XP_CASHBACK_REDEMPTION_SOURCE = 'cashback_redemption';
export const XP_CLIENT_CREATION_POINTS = 250;
export const XP_CLIENT_CREATION_SOURCE = 'cashback_client_creation';
export const XP_QUICK_VOUCHER_ISSUE_POINTS = 250;
export const XP_QUICK_VOUCHER_ISSUE_SOURCE = 'cashback_quick_voucher_issue';

export type XpRewardDescriptor = {
  points: number;
  source: string;
  sourceEntityId: string;
};

export function cashbackRedemptionXpReward(redemptionId: number): XpRewardDescriptor {
  const normalizedRedemptionId = Math.trunc(redemptionId);
  if (!Number.isSafeInteger(normalizedRedemptionId) || normalizedRedemptionId <= 0) {
    throw new Error('Resgate invalido para premiacao de XP.');
  }
  return {
    points: XP_CASHBACK_REDEMPTION_POINTS,
    source: XP_CASHBACK_REDEMPTION_SOURCE,
    sourceEntityId: String(normalizedRedemptionId),
  };
}

export function clientCreationXpReward(clientId: number): XpRewardDescriptor {
  const normalizedClientId = Math.trunc(clientId);
  if (!Number.isSafeInteger(normalizedClientId) || normalizedClientId <= 0) {
    throw new Error('Cliente invalido para premiacao de XP.');
  }
  return {
    points: XP_CLIENT_CREATION_POINTS,
    source: XP_CLIENT_CREATION_SOURCE,
    sourceEntityId: String(normalizedClientId),
  };
}

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

export function canCancelQuickVoucher(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === 'ativo';
}
