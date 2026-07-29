import { normalizeQuickVoucherCode } from './quickVoucherCode.js';

export const MAX_QUICK_VOUCHERS_PER_TRANSACTION = 10;

export type QuickVoucherCodeParseResult = {
  codes: string[];
  error: string;
};

export type QuickVoucherBatchTotals = {
  redeemedCents: number;
  requiredPurchaseCents: number;
  chargedCents: number;
  successorCashbackCents: number;
};

function moneyLabel(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function parseQuickVoucherCodes(value: unknown): QuickVoucherCodeParseResult {
  const rawValues = (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (rawValues.length > MAX_QUICK_VOUCHERS_PER_TRANSACTION) {
    return {
      codes: [],
      error: `Use no maximo ${MAX_QUICK_VOUCHERS_PER_TRANSACTION} codigos de cashback por operacao.`,
    };
  }

  const codes: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of rawValues) {
    const code = normalizeQuickVoucherCode(rawValue);
    if (!code) {
      return {
        codes: [],
        error: 'O codigo de cashback precisa ter 4 digitos antigos ou 5 digitos atuais. Existe um codigo invalido.',
      };
    }
    if (seen.has(code)) {
      return {
        codes: [],
        error: `O codigo ${code} esta repetido. Cada codigo pode ser usado somente uma vez na operacao.`,
      };
    }
    seen.add(code);
    codes.push(code);
  }

  return { codes, error: '' };
}

export function calculateQuickVoucherBatchTotals(
  voucherCashbackCents: number[],
  purchaseCents: number,
  redeemMultiplier: number,
  cashbackPercentBps: number,
): QuickVoucherBatchTotals {
  const redeemedCents = voucherCashbackCents.reduce((total, cents) => total + Math.max(0, Math.trunc(cents)), 0);
  const requiredPurchaseCents = Math.ceil(redeemedCents * redeemMultiplier);
  if (purchaseCents < requiredPurchaseCents) {
    throw new Error(
      `Para usar ${moneyLabel(redeemedCents)}, a compra precisa ser de pelo menos ${moneyLabel(requiredPurchaseCents)}.`,
    );
  }

  const chargedCents = Math.max(Math.trunc(purchaseCents) - redeemedCents, 0);
  const successorCashbackCents = Math.round((chargedCents * cashbackPercentBps) / 10000);
  return {
    redeemedCents,
    requiredPurchaseCents,
    chargedCents,
    successorCashbackCents,
  };
}
