export type PedidosCommandItem = {
  amount_cents: number;
  due_date: string | null;
  description: string;
};

export type PedidosCreateCommand = {
  ok: boolean;
  error: string;
  error_message: string;
  raw: string;
  supplier_name: string;
  items: PedidosCommandItem[];
  expected_arrival_at: string | null;
  competence_month: string;
  paid_now: boolean;
  arrived_now: boolean;
  register_only: boolean;
  note: string;
  total_cents: number;
  total_label: string;
  status_label: string;
  needs_confirmation: boolean;
  confirmation_message: string;
  confirmation_summary: string;
};

type Token = {
  raw: string;
  clean: string;
  index: number;
};

type ParserOptions = {
  now?: Date;
  timezone?: string;
};

type ParsedStatus = {
  paidNow: boolean;
  arrivedNow: boolean;
  registerOnly: boolean;
  conflict: string;
};

type ParsedItems = {
  items: Array<{ amount_cents: number; due_date: string | null }>;
  invalidDate: string;
  pastDate: string;
  totalMismatch: boolean;
  expectedTotalCents: number;
  actualTotalCents: number;
};

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const START_WORDS = new Set(['pedido', 'pedidos']);
const CONNECTOR_WORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'para', 'pro', 'pra', 'em', 'com', 'o', 'a', 'um', 'uma']);
const SUPPLIER_PREFIX_WORDS = new Set(['fornecedor', 'distribuidora']);
const VALUE_WORDS = new Set(['valor', 'total', 'deu', 'ficou', 'boleto']);
const SUPPLIER_STOP_WORDS = new Set([
  ...VALUE_WORDS,
  'parcela',
  'parcelas',
  'primeira',
  'segunda',
  'terceira',
  'quarta',
  'quinta',
  'sexta',
  'setima',
  'oitava',
  'nona',
  'decima',
  'vence',
  'vencimento',
  'venc',
  'pagar',
  'pagamento',
  'chega',
  'chegar',
  'chegou',
  'chegada',
  'previsao',
  'previsto',
  'prevista',
  'receber',
  'recebido',
  'recebida',
  'pago',
  'paga',
  'pagou',
  'paguei',
  'quitado',
  'quitada',
  'registrar',
  'registro',
  'so',
  'falta',
  'aguardando',
  'pendente',
  'reais',
]);
const DATE_CONTEXT_WORDS = new Set(['vence', 'vencimento', 'venc', 'boleto', 'pagar', 'pagamento', 'data', 'dia']);
const ARRIVAL_CONTEXT_WORDS = new Set(['chega', 'chegar', 'chegou', 'chegada', 'previsao', 'previsto', 'prevista', 'receber', 'recebimento', 'entrega']);
const PARCEL_MARKERS = new Set(['parcela', 'parcelas', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'setima', 'oitava', 'nona', 'decima']);
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};
const WORD_NUMBERS: Record<string, number> = {
  uma: 1,
  um: 1,
  duas: 2,
  dois: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};
const WORD_FIXES: Record<string, string> = {
  pedio: 'pedido',
  peddido: 'pedido',
  peddidos: 'pedidos',
  paracela: 'parcela',
  paracelas: 'parcelas',
  chego: 'chegou',
  pgou: 'pagou',
  paguei: 'paguei',
  venc: 'venc',
};

export function parsePedidosCreateCommand(message: string, options: ParserOptions = {}): PedidosCreateCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized) return null;
  const words = normalized.split(' ').map(canonicalWord);
  const firstPedidoIndex = words.findIndex((word) => START_WORDS.has(word));
  const prefixCommand = firstPedidoIndex < 0 && words[0] !== undefined && SUPPLIER_PREFIX_WORDS.has(words[0]);
  if (firstPedidoIndex < 0 && !prefixCommand) return null;

  const tokens = tokenize(raw);
  const startIndex = tokens.findIndex((token) => START_WORDS.has(token.clean));
  const commandTokens = (startIndex >= 0 ? tokens.slice(startIndex + 1) : tokens)
    .map((token, index) => ({ ...token, index }));
  const today = localDateParts(options.now || new Date(), options.timezone || DEFAULT_TIMEZONE);
  const todayIso = isoFromParts(today.year, today.month, today.day) || '';
  const competenceMonth = `${todayIso.slice(0, 7) || monthFromDate(options.now || new Date(), options.timezone || DEFAULT_TIMEZONE)}`;
  const cleanCommand = commandTokens.map((token) => token.clean).join(' ');

  const supplierName = extractSupplier(commandTokens);
  const state = statusFromText(cleanCommand);
  const expectedArrivalAt = findExpectedArrivalDate(commandTokens, todayIso);
  const parcelCount = expectedParcelCount(commandTokens);
  const parsed = parseItems(commandTokens, supplierName, todayIso);
  const base = buildCommand(raw, supplierName, parsed.items, expectedArrivalAt, competenceMonth, state);

  if (!supplierName) return invalidCommand(base, 'missing_supplier', 'Faltou o fornecedor. Mande assim: miauby pedido anb 350.');
  if (parsed.invalidDate) return invalidCommand(base, 'invalid_date', `Nao entendi a data "${parsed.invalidDate}". Use dia/mes, tipo 05/06.`);
  if (expectedArrivalAt && todayIso && expectedArrivalAt < todayIso) return invalidCommand(base, 'past_date', `A data ${formatDateBr(expectedArrivalAt)} ja passou. Confirme no painel ou mande com ano correto.`);
  if (parsed.pastDate) return invalidCommand(base, 'past_date', `A data ${formatDateBr(parsed.pastDate)} ja passou. Confirme no painel ou mande com ano correto.`);
  if (state.conflict) return invalidCommand(base, 'status_conflict', state.conflict);
  if (parsed.totalMismatch) {
    const messageText = `As parcelas somam ${formatMoneyLabel(parsed.actualTotalCents)}, mas o total informado foi ${formatMoneyLabel(parsed.expectedTotalCents)}. Confirma criar pela soma das parcelas?`;
    return invalidCommand(base, 'total_mismatch', messageText, true, `Criar pedido ${displaySupplier(supplierName)} com ${formatMoneyLabel(parsed.actualTotalCents)} em ${parsed.items.length} parcela(s).`);
  }
  if (parcelCount > 0 && parsed.items.length > 0 && parcelCount !== parsed.items.length) {
    return invalidCommand(base, 'parcel_count_mismatch', `Voce informou ${parcelCount} parcela(s), mas eu li ${parsed.items.length}. Confere e manda de novo.`);
  }
  if (!parsed.items.length) return invalidCommand(base, 'missing_amount', 'Faltou o valor. Mande assim: miauby pedido anb 350.');

  return base;
}

export function formatPedidosCreateSuccess(command: PedidosCreateCommand, duplicate = false): string {
  const supplier = displaySupplier(command.supplier_name);
  const prefix = duplicate ? 'Pedido ja registrado' : command.register_only ? 'Pedido registrado' : 'Pedido criado';
  const arrival = command.expected_arrival_at ? ` - chega ${formatDateBr(command.expected_arrival_at)}` : '';
  return `${prefix}: ${supplier} - ${command.total_label} - ${command.status_label}${arrival}.`;
}

export function formatPedidosCreateError(command: PedidosCreateCommand): string {
  return command.error_message || 'Nao consegui montar esse pedido. Mande fornecedor e valor.';
}

function buildCommand(
  raw: string,
  supplierName: string,
  parsedItems: Array<{ amount_cents: number; due_date: string | null }>,
  expectedArrivalAt: string | null,
  competenceMonth: string,
  state: ParsedStatus,
): PedidosCreateCommand {
  const items = parsedItems.map((item, index) => ({
    amount_cents: item.amount_cents,
    due_date: item.due_date,
    description: `${parsedItems.length > 1 ? `Parcela ${index + 1}` : 'Pedido'} - ${supplierName || 'fornecedor'}`.slice(0, 180),
  }));
  const totalCents = items.reduce((sum, item) => sum + item.amount_cents, 0);
  return {
    ok: true,
    error: '',
    error_message: '',
    raw,
    supplier_name: supplierName,
    items,
    expected_arrival_at: expectedArrivalAt,
    competence_month: competenceMonth,
    paid_now: state.paidNow,
    arrived_now: state.arrivedNow,
    register_only: state.registerOnly,
    note: 'Criado pelo Miauby WhatsApp.',
    total_cents: totalCents,
    total_label: formatMoneyLabel(totalCents),
    status_label: statusLabel(state.paidNow, state.arrivedNow, state.registerOnly),
    needs_confirmation: false,
    confirmation_message: '',
    confirmation_summary: '',
  };
}

function invalidCommand(
  command: PedidosCreateCommand,
  error: string,
  message: string,
  needsConfirmation = false,
  confirmationSummary = '',
): PedidosCreateCommand {
  return {
    ...command,
    ok: false,
    error,
    error_message: message,
    needs_confirmation: needsConfirmation,
    confirmation_message: needsConfirmation ? message : '',
    confirmation_summary: confirmationSummary,
  };
}

function tokenize(value: string): Token[] {
  const matches = value.match(/R\$\s*\d+(?:[.,]\d{1,2})?|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,3}(?:\.\d{3})+,\d{2}|\d+x|\d+(?:[.,]\d{1,2})?|[\p{L}0-9._-]+/giu) || [];
  return matches.map((raw, index) => ({ raw, clean: canonicalWord(normalizeIntentText(raw)), index }));
}

function normalizeIntentText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/.,$-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalWord(value: string): string {
  return WORD_FIXES[value] || value;
}

function stripActivationWord(value: string): string {
  return value
    .replace(/(^|[\s,:;.-])miauby([\s,:;.-]|$)/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSupplier(tokens: Token[]): string {
  const firstAmountIndex = tokens.findIndex((token, index) => isAmountToken(tokens, index) && !isParcelCountToken(tokens, index) && !isDayNumberToken(tokens, index));
  const before = firstAmountIndex >= 0 ? collectSupplierTokens(tokens, 0, firstAmountIndex) : collectSupplierTokens(tokens, 0, tokens.length);
  if (before) return before;
  if (firstAmountIndex >= 0) return collectSupplierTokens(tokens, firstAmountIndex + 1, tokens.length);
  return '';
}

function collectSupplierTokens(tokens: Token[], start: number, end: number): string {
  const supplierTokens: string[] = [];
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (!token.clean) continue;
    const leadingNoise = CONNECTOR_WORDS.has(token.clean) || SUPPLIER_PREFIX_WORDS.has(token.clean) || VALUE_WORDS.has(token.clean);
    const parcelCountWord = Boolean(WORD_NUMBERS[token.clean] && tokens[index + 1]?.clean.startsWith('parcela'));
    if (!supplierTokens.length && leadingNoise) continue;
    if (
      isAmountToken(tokens, index)
      || parseAnyDateToken(token.clean, '2099-01-01')
      || isRelativeDateWord(token.clean)
      || SUPPLIER_STOP_WORDS.has(token.clean)
      || isInstallmentLabel(token.clean)
      || parcelCountWord
    ) {
      if (supplierTokens.length) break;
      continue;
    }
    supplierTokens.push(token.raw.replace(/[.,:;!?]+$/g, ''));
    if (supplierTokens.length >= 6) break;
  }
  const supplier = supplierTokens.join(' ').replace(/\s+/g, ' ').trim();
  return /\p{L}/u.test(supplier) ? supplier.slice(0, 180) : '';
}

function statusFromText(clean: string): ParsedStatus {
  const registerOnly = /(registrar|registro|historico)/.test(clean) && hasPaidSignal(clean) && hasArrivedSignal(clean)
    || /chegou e (ja )?(foi )?pago/.test(clean)
    || /pago e (ja )?chegou/.test(clean)
    || /pago e recebido/.test(clean)
    || /recebido e pago/.test(clean)
    || /ja pago e ja chegou/.test(clean)
    || /ja chegou e foi pago/.test(clean)
    || /passou batido/.test(clean);
  const hasPaid = hasPaidSignal(clean);
  const hasUnpaid = hasUnpaidSignal(clean);
  const hasArrived = hasArrivedSignal(clean);
  const hasWaitingArrival = hasWaitingArrivalSignal(clean);

  if (!registerOnly && hasPaid && hasUnpaid) {
    return {
      paidNow: false,
      arrivedNow: false,
      registerOnly: false,
      conflict: 'Status confuso: esta pago ou falta pagar? Mande "pago falta chegar" ou "chegou falta pagar".',
    };
  }
  if (!registerOnly && hasArrived && hasWaitingArrival) {
    return {
      paidNow: false,
      arrivedNow: false,
      registerOnly: false,
      conflict: 'Status confuso: chegou ou ainda falta chegar? Mande "ja chegou so pagar" ou "pago falta chegar".',
    };
  }

  return {
    paidNow: hasPaid || registerOnly,
    arrivedNow: hasArrived || registerOnly,
    registerOnly,
    conflict: '',
  };
}

function hasPaidSignal(clean: string): boolean {
  const text = clean.replace(/\bnao\s+(pago|paga|pagou|paguei)\b/g, ' ');
  return /(^|\s)(pago|paga|pagou|paguei|quitado|quitada)(\s|$)/.test(text)
    || /ja foi pago/.test(clean)
    || /pagamento feito/.test(clean)
    || /boleto pago/.test(clean)
    || /ja paguei/.test(clean)
    || /so chegar/.test(clean)
    || /so chega/.test(clean);
}

function hasUnpaidSignal(clean: string): boolean {
  return /so pagar/.test(clean)
    || /falta pagar/.test(clean)
    || /falta o boleto/.test(clean)
    || /falta boleto/.test(clean)
    || /\bnao\s+(pago|paga|pagou|paguei)\b/.test(clean)
    || /pagamento pendente/.test(clean)
    || /pendente de pagamento/.test(clean)
    || /(^|\s)pendente(\s|$)/.test(clean);
}

function hasArrivedSignal(clean: string): boolean {
  const text = clean.replace(/\bnao\s+chegou\b/g, ' ');
  return /(^|\s)(chegou|recebido|recebida)(\s|$)/.test(text)
    || /ja chegou/.test(text)
    || /mercadoria chegou/.test(text)
    || /chegou hoje/.test(text)
    || /so pagar/.test(clean);
}

function hasWaitingArrivalSignal(clean: string): boolean {
  return /so chegar/.test(clean)
    || /so chega/.test(clean)
    || /falta chegar/.test(clean)
    || /falta receber/.test(clean)
    || /aguardando chegada/.test(clean)
    || /aguardando entrega/.test(clean)
    || /nao chegou/.test(clean)
    || /esperar chegar/.test(clean);
}

function findExpectedArrivalDate(tokens: Token[], todayIso: string): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.clean) continue;
    const context = contextAround(tokens, index);
    const aroundArrival = context.some((word) => ARRIVAL_CONTEXT_WORDS.has(word));
    if (aroundArrival && token.clean === 'semana' && tokens[index + 1]?.clean === 'que' && tokens[index + 2]?.clean === 'vem') {
      return addDaysIso(todayIso, 7);
    }
    const isLooseRelativeDate = token.clean === 'amanha' || token.clean === 'hoje';
    if (!aroundArrival && !isLooseRelativeDate) continue;
    if (isDayOnlyDateToken(tokens, index)) {
      const parsedDay = parseDayOnlyToken(token.clean, todayIso);
      if (parsedDay) return parsedDay;
    }
    const parsed = parseAnyDateToken(token.clean, todayIso);
    if (parsed) return parsed;
  }
  return null;
}

function parseItems(tokens: Token[], supplierName: string, todayIso: string): ParsedItems {
  const parcelMode = tokens.some((token) => PARCEL_MARKERS.has(token.clean) || isInstallmentLabel(token.clean));
  const firstParcelIndex = tokens.findIndex((token) => PARCEL_MARKERS.has(token.clean) || isInstallmentLabel(token.clean));
  const amountIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ index }) => isAmountToken(tokens, index) && !isParcelCountToken(tokens, index) && !isDayNumberToken(tokens, index));
  const explicitTotalIndexes = new Set<number>();
  if (amountIndexes.length > 1) {
    for (const { index } of amountIndexes) {
      if (tokens[index - 1]?.clean === 'total' || tokens[index - 2]?.clean === 'total') explicitTotalIndexes.add(index);
      if (parcelMode && firstParcelIndex > index && explicitTotalIndexes.size === 0) explicitTotalIndexes.add(index);
    }
  }

  const items: Array<{ amount_cents: number; due_date: string | null }> = [];
  let expectedTotalCents = 0;
  let invalidDate = '';
  let pastDate = '';

  for (const { token, index } of amountIndexes) {
    const cents = parseMoneyToCents(token.raw);
    if (cents <= 0) continue;
    if (explicitTotalIndexes.has(index)) {
      expectedTotalCents = expectedTotalCents || cents;
      continue;
    }
    const due = dueDateAround(tokens, index, todayIso);
    if (due.invalidDate) {
      invalidDate = due.invalidDate;
      continue;
    }
    if (due.pastDate) {
      pastDate = due.pastDate;
      continue;
    }
    items.push({ amount_cents: cents, due_date: due.date });
  }

  const actualTotalCents = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const totalMismatch = expectedTotalCents > 0 && actualTotalCents > 0 && Math.abs(expectedTotalCents - actualTotalCents) > 1;
  if (!supplierName && items.length > 1) {
    return { items: [], invalidDate, pastDate, totalMismatch, expectedTotalCents, actualTotalCents };
  }
  return { items, invalidDate, pastDate, totalMismatch, expectedTotalCents, actualTotalCents };
}

function dueDateAround(tokens: Token[], amountIndex: number, todayIso: string): { date: string | null; invalidDate: string; pastDate: string } {
  const candidates: Token[] = [
    ...tokens.slice(amountIndex + 1, Math.min(tokens.length, amountIndex + 7)),
    ...tokens.slice(Math.max(0, amountIndex - 4), amountIndex).reverse(),
  ];
  for (const token of candidates) {
    const tokenIndex = token.index;
    const isDate = looksLikeDateToken(token.clean) || isDayOnlyDateToken(tokens, tokenIndex);
    if (!isDate) continue;
    const context = contextAround(tokens, tokenIndex);
    if (context.some((word) => ARRIVAL_CONTEXT_WORDS.has(word))) continue;
    const parsed = isDayOnlyDateToken(tokens, tokenIndex)
      ? parseDayOnlyToken(token.clean, todayIso)
      : parseAnyDateToken(token.clean, todayIso);
    if (!parsed) return { date: null, invalidDate: token.raw, pastDate: '' };
    if (todayIso && parsed < todayIso) return { date: null, invalidDate: '', pastDate: parsed };
    if (context.some((word) => DATE_CONTEXT_WORDS.has(word)) || token.index > amountIndex || tokens.length <= amountIndex + 4) {
      return { date: parsed, invalidDate: '', pastDate: '' };
    }
  }
  return { date: null, invalidDate: '', pastDate: '' };
}

function contextAround(tokens: Token[], index: number): string[] {
  return tokens.slice(Math.max(0, index - 3), Math.min(tokens.length, index + 4)).map((token) => token.clean);
}

function isAmountToken(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  if (!token?.clean) return false;
  if (looksLikeDateToken(token.clean)) return false;
  if (isInstallmentLabel(token.clean)) return false;
  return /^r\$\s*\d/i.test(token.raw) || /^\d+(?:[.,]\d{1,2})?$/.test(token.clean) || /^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(token.raw);
}

function isParcelCountToken(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  const next = tokens[index + 1]?.clean || '';
  const previous = tokens[index - 1]?.clean || '';
  const value = Number.parseInt(token.clean, 10);
  return Number.isInteger(value) && value > 0 && value <= 24 && (next === 'parcela' || next === 'parcelas' || previous === 'em');
}

function isDayNumberToken(tokens: Token[], index: number): boolean {
  const value = Number.parseInt(tokens[index]?.clean || '', 10);
  return Number.isInteger(value) && value >= 1 && value <= 31 && tokens[index - 1]?.clean === 'dia';
}

function isDayOnlyDateToken(tokens: Token[], index: number): boolean {
  const value = Number.parseInt(tokens[index]?.clean || '', 10);
  return Number.isInteger(value) && value >= 1 && value <= 31 && tokens[index - 1]?.clean === 'dia';
}

function isInstallmentLabel(value: string): boolean {
  return /^\d{1,2}x$/.test(value);
}

function expectedParcelCount(tokens: Token[]): number {
  let maxInstallmentLabel = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const numeric = /^\d+$/.test(tokens[index].clean) ? Number.parseInt(tokens[index].clean, 10) : Number.NaN;
    if (Number.isInteger(numeric) && numeric > 0 && numeric <= 24 && tokens[index + 1]?.clean.startsWith('parcela')) return numeric;
    const wordValue = WORD_NUMBERS[tokens[index].clean] || 0;
    if (wordValue > 0 && wordValue <= 24 && tokens[index + 1]?.clean.startsWith('parcela')) return wordValue;
    const installment = /^(\d{1,2})x$/.exec(tokens[index].clean);
    if (installment) maxInstallmentLabel = Math.max(maxInstallmentLabel, Number.parseInt(installment[1], 10));
  }
  return maxInstallmentLabel > 1 ? maxInstallmentLabel : 0;
}

function parseMoneyToCents(value: string): number {
  let text = value.replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function looksLikeDateToken(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    || /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(value)
    || isRelativeDateWord(value);
}

function isRelativeDateWord(value: string): boolean {
  return value === 'hoje' || value === 'amanha' || WEEKDAYS[value] !== undefined;
}

function parseAnyDateToken(value: string, todayIso: string): string | null {
  if (value === 'hoje') return todayIso;
  if (value === 'amanha') return addDaysIso(todayIso, 1);
  if (WEEKDAYS[value] !== undefined) return nextWeekdayIso(todayIso, WEEKDAYS[value]);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(value);
  if (!br) return null;
  const todayYear = Number(todayIso.slice(0, 4)) || new Date().getFullYear();
  const yearRaw = br[3] ? Number(br[3]) : todayYear;
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  return validIso(year, Number(br[2]), Number(br[1]));
}

function parseDayOnlyToken(value: string, todayIso: string): string | null {
  const day = Number.parseInt(value, 10);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const year = Number(todayIso.slice(0, 4)) || new Date().getFullYear();
  const month = Number(todayIso.slice(5, 7)) || new Date().getMonth() + 1;
  return validIso(year, month, day);
}

function validIso(year: number, month: number, day: number): string | null {
  return isoFromParts(year, month, day);
}

function localDateParts(date: Date, timezone: string): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekdayLabel = get('weekday').toLowerCase();
  const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: Math.max(0, weekdays.indexOf(weekdayLabel.slice(0, 3))),
  };
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function nextWeekdayIso(todayIso: string, weekday: number): string {
  const [year, month, day] = todayIso.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const current = date.getUTCDay();
  const diff = (weekday - current + 7) % 7 || 7;
  return addDaysIso(todayIso, diff);
}

function monthFromDate(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`;
}

function statusLabel(paidNow: boolean, arrivedNow: boolean, registerOnly: boolean): string {
  if (registerOnly || (paidNow && arrivedNow)) return 'pago e recebido';
  if (paidNow) return 'pago, aguardando chegada';
  if (arrivedNow) return 'recebido, falta pagar';
  return 'aguardando chegada e pagamento';
}

function formatMoneyLabel(cents: number): string {
  return (Math.max(0, cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function displaySupplier(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= 12) return clean.toUpperCase();
  return clean;
}
