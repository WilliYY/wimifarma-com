const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parsePositiveDueDays(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) {
    throw new Error('Em "Vencimento em quantos dias?", informe um numero inteiro maior que zero.');
  }

  const days = Number(text);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error('Em "Vencimento em quantos dias?", informe um numero inteiro maior que zero.');
  }
  return days;
}

export function dueDateFromDays(value: unknown, baseDate: string): string | null {
  const days = parsePositiveDueDays(value);
  if (days === null) return null;

  const match = ISO_DATE_PATTERN.exec(baseDate);
  if (!match) throw new Error('Data base invalida para calcular o vencimento.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    Number.isNaN(base.getTime())
    || base.getUTCFullYear() !== year
    || base.getUTCMonth() !== month - 1
    || base.getUTCDate() !== day
  ) {
    throw new Error('Data base invalida para calcular o vencimento.');
  }

  base.setUTCDate(base.getUTCDate() + days);
  if (Number.isNaN(base.getTime()) || base.getUTCFullYear() > 9999) {
    throw new Error('O numero de dias informado gera uma data de vencimento invalida.');
  }
  return base.toISOString().slice(0, 10);
}
