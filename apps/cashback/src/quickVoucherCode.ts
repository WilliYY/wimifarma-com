export const LEGACY_QUICK_VOUCHER_CODE_DIGITS = 4;
export const CURRENT_QUICK_VOUCHER_CODE_DIGITS = 5;
export const QUICK_VOUCHER_CODE_SPACE = 10 ** CURRENT_QUICK_VOUCHER_CODE_DIGITS;

export function normalizeQuickVoucherCode(value: unknown): string {
  const code = String(value ?? '').replace(/\D+/g, '');
  return code.length === LEGACY_QUICK_VOUCHER_CODE_DIGITS
    || code.length === CURRENT_QUICK_VOUCHER_CODE_DIGITS
    ? code
    : '';
}

export function quickVoucherCodeAt(firstCandidate: number, attempt: number): string {
  const candidate = ((firstCandidate + attempt) % QUICK_VOUCHER_CODE_SPACE + QUICK_VOUCHER_CODE_SPACE)
    % QUICK_VOUCHER_CODE_SPACE;
  return candidate.toString().padStart(CURRENT_QUICK_VOUCHER_CODE_DIGITS, '0');
}

export function findAvailableQuickVoucherCode(
  reservedCodes: ReadonlySet<string>,
  firstCandidate: number,
): string {
  for (let attempt = 0; attempt < QUICK_VOUCHER_CODE_SPACE; attempt += 1) {
    const candidate = quickVoucherCodeAt(firstCandidate, attempt);
    if (!reservedCodes.has(candidate)) return candidate;
  }
  return '';
}
