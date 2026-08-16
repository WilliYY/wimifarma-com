export type ReportToolRequest = {
  tool: 'resumo_financeiro' | 'resumo_cashback' | 'resumo_tarefas' | 'resumo_geral';
  args: Record<string, unknown>;
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isoDate(year: number, month: number, day: number): string {
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return '';
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function exactDateFromMessage(message: string): { present: boolean; data: string } {
  const isoMatch = message.match(/\b(20[0-9]{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])\b/u);
  if (isoMatch) {
    return {
      present: true,
      data: isoDate(
        Number.parseInt(isoMatch[1] || '', 10),
        Number.parseInt(isoMatch[2] || '', 10),
        Number.parseInt(isoMatch[3] || '', 10),
      ),
    };
  }

  const dayMatch = message.match(/\b(0?[1-9]|[12][0-9]|3[01])[/-](0?[1-9]|1[0-2])[/-](20[0-9]{2})\b/u);
  if (!dayMatch) return { present: false, data: '' };
  return {
    present: true,
    data: isoDate(
      Number.parseInt(dayMatch[3] || '', 10),
      Number.parseInt(dayMatch[2] || '', 10),
      Number.parseInt(dayMatch[1] || '', 10),
    ),
  };
}

export function hasInvalidDailyReportDate(message: string): boolean {
  const text = normalizeText(message);
  if (!/\b(relatorio|resumo|status|situacao|visao)\b/u.test(text)) return false;
  const exactDate = exactDateFromMessage(message);
  return exactDate.present && exactDate.data === '';
}

export function reportPeriodArgsFromMessage(message: string): Record<string, unknown> {
  const exactDate = exactDateFromMessage(message);
  if (exactDate.present) return exactDate.data ? { data: exactDate.data } : {};

  const monthMatch = message.match(/\b(0?[1-9]|1[0-2])[/-](20[0-9]{2})\b/u);
  if (!monthMatch) {
    return {};
  }

  return {
    mes: Number.parseInt(monthMatch[1] || '', 10),
    ano: Number.parseInt(monthMatch[2] || '', 10),
  };
}

export function inferDailyReportToolRequest(message: string): ReportToolRequest | null {
  const args = reportPeriodArgsFromMessage(message);
  if (typeof args.data !== 'string') {
    return null;
  }

  const text = normalizeText(message);
  if (!/\b(relatorio|resumo|status|situacao|visao)\b/u.test(text)) {
    return null;
  }
  if (/\bfinanceiro\b|\bcaixa\b/u.test(text)) {
    return { tool: 'resumo_financeiro', args };
  }
  if (/\bcash\s*back\b|\bcashback\b/u.test(text)) {
    return { tool: 'resumo_cashback', args };
  }
  if (/\btarefas?\b/u.test(text)) {
    return { tool: 'resumo_tarefas', args };
  }
  if (/\bgeral\b/u.test(text)) {
    return { tool: 'resumo_geral', args };
  }

  return null;
}
