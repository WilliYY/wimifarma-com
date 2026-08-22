export type MiaubyQuickCashbackCustomer = {
  clientId: number | null;
  name: string;
  phone: string;
  note: string;
  documentProvided: boolean;
  identified: boolean;
};

export type MiaubyQuickCashbackInput = {
  clientId?: unknown;
  name?: unknown;
  phone?: unknown;
  note?: unknown;
  document?: unknown;
};

export function normalizeMiaubyQuickCashbackCustomer(
  input: MiaubyQuickCashbackInput | null | undefined,
): MiaubyQuickCashbackCustomer {
  const parsedClientId = Number(input?.clientId);
  const clientId = Number.isSafeInteger(parsedClientId) && parsedClientId > 0 ? parsedClientId : null;
  const name = clean(input?.name, 160);
  const phoneDigits = clean(input?.phone, 40).replace(/\D/g, '').slice(0, 11);
  const phone = phoneDigits.length >= 10 ? phoneDigits : '';
  const note = clean(input?.note, 500);
  const documentProvided = clean(input?.document, 40).replace(/\D/g, '').length === 11;
  return {
    clientId,
    name,
    phone,
    note,
    documentProvided,
    identified: Boolean(clientId || name || phone),
  };
}

export function shouldAwardMiaubyQuickCashbackXp(clientId: number | null): boolean {
  return Number.isSafeInteger(clientId) && Number(clientId) > 0;
}

function clean(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
