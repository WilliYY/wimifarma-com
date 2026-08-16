export type ReportModule = 'financeiro' | 'cashback' | 'tarefas' | 'cotacao' | 'codigos' | 'calendario' | 'geral';

export type ReportDialogState = {
  module: ReportModule | '';
  date: string;
};

export type ReportDialogDecision =
  | { kind: 'none' }
  | { kind: 'cancelled'; reply: string }
  | { kind: 'pending'; state: ReportDialogState; reply: string; invalidDate: boolean }
  | { kind: 'complete'; state: ReportDialogState; rewrittenMessage: string };

const REPORT_TERMS = /\b(relatorio|resumo)\b/u;
const CANCEL_TERMS = /^(cancelar|cancela|cancelado|sair|parar|deixa pra la)$/u;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function saoPauloToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validIsoDate(year: number, month: number, day: number): string {
  if (year < 2000 || year > 2100) return '';
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
  ) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateFromMessage(message: string, now: Date, allowBareDay: boolean): { date: string; invalid: boolean } {
  const clean = normalize(message);
  const today = saoPauloToday(now);
  if (/\banteontem\b/u.test(clean)) return { date: shiftIsoDate(today, -2), invalid: false };
  if (/\bontem\b/u.test(clean)) return { date: shiftIsoDate(today, -1), invalid: false };
  if (/\bhoje\b/u.test(clean)) return { date: today, invalid: false };

  let match = clean.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/u);
  if (match) {
    const date = validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return { date, invalid: !date };
  }

  match = clean.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?\b/u);
  if (match) {
    const currentYear = Number(today.slice(0, 4));
    const rawYear = match[3] ? Number(match[3]) : currentYear;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = validIsoDate(year, Number(match[2]), Number(match[1]));
    return { date, invalid: !date };
  }

  match = clean.match(/\bdia\s+(\d{1,2})\b/u);
  if (!match && allowBareDay) match = clean.match(/^(\d{1,2})$/u);
  if (match) {
    const date = validIsoDate(Number(today.slice(0, 4)), Number(today.slice(5, 7)), Number(match[1]));
    return { date, invalid: !date };
  }

  const hasDateCue = /\b(?:dia\s+\d+|\d{1,4}[\/-]\d{1,2}(?:[\/-]\d{1,4})?)\b/u.test(clean);
  return { date: '', invalid: hasDateCue };
}

function moduleFromMessage(message: string): ReportModule | '' {
  const clean = normalize(message);
  const rules: Array<[ReportModule, RegExp]> = [
    ['financeiro', /\b(financeiro|caixa|fechamento|sangria|pix|maquininha)\b/u],
    ['cashback', /\b(cashback|cash back|resgate|creditos?|clientes?|vendas?|compras?)\b/u],
    ['tarefas', /\b(tarefa|tarefas|pendencia|pendencias)\b/u],
    ['cotacao', /\b(cotacao|orcamento|fornecedor|fornecedores)\b/u],
    ['codigos', /\b(codigo|codigos|comissao|comissoes)\b/u],
    ['calendario', /\b(calendario|agenda|plantao|plantoes|escala)\b/u],
    ['geral', /\b(geral|completo|completa|todos|tudo)\b/u],
  ];
  for (const [module, pattern] of rules) {
    if (pattern.test(clean)) return module;
  }
  return '';
}

function hasExplicitMonthlyPeriod(message: string): boolean {
  const clean = normalize(message);
  if (/\b(este mes|deste mes|mes atual|mes passado|ultimo mes)\b/u.test(clean)) return true;
  if (/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/u.test(clean)) return true;
  return /(?:^|\s)(0?[1-9]|1[0-2])[\/-](20\d{2})(?:$|\s)/u.test(clean);
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function pendingReply(state: ReportDialogState, invalidDate: boolean): string {
  if (invalidDate) {
    return 'Essa data nao existe. Envie hoje, ontem ou uma data valida em DD/MM/AAAA.';
  }
  if (!state.module && !state.date) {
    return 'Qual relatorio e de qual dia? Ex.: financeiro de hoje, cashback de 15/08/2026 ou geral de ontem.';
  }
  if (!state.module) {
    return `Qual relatorio para ${displayDate(state.date)}? Envie financeiro, cashback, tarefas ou geral.`;
  }
  return `Qual dia do relatorio ${state.module}? Envie hoje, ontem, DD/MM ou DD/MM/AAAA.`;
}

export function advanceReportDialog(message: string, pending: ReportDialogState | null, now = new Date()): ReportDialogDecision {
  const clean = normalize(message);
  if (pending && CANCEL_TERMS.test(clean)) {
    return { kind: 'cancelled', reply: 'Pedido de relatorio cancelado.' };
  }

  const isNewReportRequest = REPORT_TERMS.test(clean);
  if (!pending && !isNewReportRequest) return { kind: 'none' };
  if (!pending && hasExplicitMonthlyPeriod(message)) return { kind: 'none' };

  const detectedModule = moduleFromMessage(message);
  const parsedDate = dateFromMessage(message, now, Boolean(pending && !pending.date));
  if (
    !pending
    && ['cotacao', 'codigos', 'calendario'].includes(detectedModule)
    && !parsedDate.date
    && !parsedDate.invalid
  ) return { kind: 'none' };

  const next: ReportDialogState = {
    module: detectedModule || pending?.module || '',
    date: pending?.date || '',
  };
  if (parsedDate.date) next.date = parsedDate.date;

  if (next.date && ['cotacao', 'codigos', 'calendario'].includes(next.module)) {
    const unsupportedModule = next.module;
    return {
      kind: 'pending',
      state: { module: '', date: next.date },
      reply: `O relatorio ${unsupportedModule} nao possui fechamento por dia. Para ${displayDate(next.date)}, escolha financeiro, cashback, tarefas ou geral. Para ${unsupportedModule}, peca o resumo atual ou informe um mes.`,
      invalidDate: false,
    };
  }

  if (parsedDate.invalid || !next.module || !next.date) {
    return {
      kind: 'pending',
      state: next,
      reply: pendingReply(next, parsedDate.invalid),
      invalidDate: parsedDate.invalid,
    };
  }

  const moduleLabel = next.module === 'tarefas' ? 'tarefas' : next.module;
  return {
    kind: 'complete',
    state: next,
    rewrittenMessage: `relatorio ${moduleLabel} do dia ${displayDate(next.date)}`,
  };
}
