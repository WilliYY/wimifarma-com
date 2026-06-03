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

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const START_WORDS = new Set(['pedido', 'pedidos']);
const CONNECTOR_WORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'para', 'pro', 'pra', 'em', 'com', 'o', 'a', 'um', 'uma']);
const SUPPLIER_STOP_WORDS = new Set([
  'valor',
  'total',
  'em',
  'com',
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
  'boleto',
  'chega',
  'chegou',
  'chegada',
  'previsao',
  'previsto',
  'recebido',
  'recebida',
  'pago',
  'paga',
  'paguei',
  'quitado',
  'quitada',
  'registrar',
  'registro',
  'so',
  'falta',
]);
const DATE_CONTEXT_WORDS = new Set(['vence', 'vencimento', 'venc', 'boleto', 'data', 'dia']);
const ARRIVAL_CONTEXT_WORDS = new Set(['chega', 'chegada', 'previsao', 'previsto', 'prevista', 'receber', 'recebimento']);
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

export function parsePedidosCreateCommand(message: string, options: ParserOptions = {}): PedidosCreateCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const clean = normalizeIntentText(raw);
  if (!clean) return null;
  const words = clean.split(' ');
  const firstPedidoIndex = words.findIndex((word) => START_WORDS.has(word));
  if (firstPedidoIndex < 0) return null;

  const commandText = clean.slice(clean.indexOf(words[firstPedidoIndex]));
  if (!/^(pedido|pedidos)(\s|$)/.test(commandText)) return null;

  const tokens = tokenize(raw);
  const startIndex = tokens.findIndex((token) => START_WORDS.has(token.clean));
  const commandTokens = (startIndex >= 0 ? tokens.slice(startIndex + 1) : tokens)
    .map((token, index) => ({ ...token, index }));
  const today = localDateParts(options.now || new Date(), options.timezone || DEFAULT_TIMEZONE);
  const todayIso = isoFromParts(today.year, today.month, today.day) || '';
  const competenceMonth = `${todayIso.slice(0, 7) || monthFromDate(options.now || new Date(), options.timezone || DEFAULT_TIMEZONE)}`;
  const supplierName = extractSupplier(commandTokens);

  const state = statusFromText(clean);
  const expectedArrivalAt = findExpectedArrivalDate(commandTokens, todayIso);
  const parcelCount = expectedParcelCount(commandTokens);
  const parsed = parseItems(commandTokens, supplierName, todayIso);

  if (!supplierName) return errorCommand(raw, 'missing_supplier', 'Faltou o fornecedor. Me mande assim: miauby pedido anb 350.');
  if (parsed.invalidDate) return errorCommand(raw, 'invalid_date', `Nao entendi a data "${parsed.invalidDate}". Use dia/mes, tipo 05/06.`);
  if (expectedArrivalAt && todayIso && expectedArrivalAt < todayIso) return errorCommand(raw, 'past_date', `A data ${formatDateBr(expectedArrivalAt)} ja passou. Confirme no painel ou mande com ano correto.`);
  if (parsed.pastDate) return errorCommand(raw, 'past_date', `A data ${formatDateBr(parsed.pastDate)} ja passou. Confirme no painel ou mande com ano correto.`);
  if (parsed.totalMismatch) return errorCommand(raw, 'total_mismatch', 'O total nao bate com a soma das parcelas. Confere os valores e manda de novo.');
  if (parcelCount > 0 && parsed.items.length > 0 && parcelCount !== parsed.items.length) {
    return errorCommand(raw, 'parcel_count_mismatch', `Voce informou ${parcelCount} parcela(s), mas eu li ${parsed.items.length}. Confere e manda de novo.`);
  }
  if (!parsed.items.length) return errorCommand(raw, 'missing_amount', 'Faltou o valor. Me mande assim: miauby pedido anb 350.');

  const items = parsed.items.map((item, index) => ({
    amount_cents: item.amount_cents,
    due_date: item.due_date,
    description: `${parsed.items.length > 1 ? `Parcela ${index + 1}` : 'Pedido'} - ${supplierName}`.slice(0, 180),
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
  };
}

export function formatPedidosCreateSuccess(command: PedidosCreateCommand, duplicate = false): string {
  const supplier = displaySupplier(command.supplier_name);
  const prefix = duplicate ? 'Pedido ja registrado' : command.register_only ? 'Pedido registrado' : 'Pedido criado';
  const arrival = command.expected_arrival_at ? ` - chega ${formatDateBr(command.expected_arrival_at)}` : '';
  return `${prefix}: ${supplier} - ${command.total_label} - ${command.status_label}${arrival}.`;
}

export function formatPedidosCreateError(command: PedidosCreateCommand): string {
  return command.error_message || 'Nao consegui montar esse pedido. Me mande fornecedor e valor.';
}

function errorCommand(raw: string, error: string, message: string): PedidosCreateCommand {
  return {
    ok: false,
    error,
    error_message: message,
    raw,
    supplier_name: '',
    items: [],
    expected_arrival_at: null,
    competence_month: '',
    paid_now: false,
    arrived_now: false,
    register_only: false,
    note: '',
    total_cents: 0,
    total_label: '',
    status_label: '',
  };
}

function tokenize(value: string): Token[] {
  const matches = value.match(/R\$\s*\d+(?:[.,]\d{1,2})?|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,3}(?:\.\d{3})+,\d{2}|\d+(?:[.,]\d{1,2})?|[A-Za-zÀ-ÿ0-9._-]+/g) || [];
  return matches.map((raw, index) => ({ raw, clean: normalizeIntentText(raw), index }));
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

function stripActivationWord(value: string): string {
  return value
    .replace(/(^|[\s,:;.-])miauby([\s,:;.-]|$)/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSupplier(tokens: Token[]): string {
  const supplierTokens: string[] = [];
  for (const token of tokens) {
    if (!token.clean) continue;
    if (!supplierTokens.length && (CONNECTOR_WORDS.has(token.clean) || SUPPLIER_STOP_WORDS.has(token.clean))) continue;
    if (isAmountToken(token) || parseAnyDateToken(token.clean, '2099-01-01') || isRelativeDateWord(token.clean) || SUPPLIER_STOP_WORDS.has(token.clean)) {
      if (supplierTokens.length) break;
      continue;
    }
    supplierTokens.push(token.raw.replace(/[.,:;!?]+$/g, ''));
    if (supplierTokens.length >= 6) break;
  }
  const supplier = supplierTokens.join(' ').replace(/\s+/g, ' ').trim();
  return /[A-Za-zÀ-ÿ]/.test(supplier) ? supplier.slice(0, 180) : '';
}

function statusFromText(clean: string): { paidNow: boolean; arrivedNow: boolean; registerOnly: boolean } {
  const paidNow = /(^|\s)(pago|paga|paguei|quitado|quitada)(\s|$)/.test(clean)
    || /ja foi pago/.test(clean)
    || /so chegar/.test(clean);
  const arrivedNow = /(^|\s)(chegou|recebido|recebida)(\s|$)/.test(clean)
    || /ja chegou/.test(clean)
    || /so pagar/.test(clean);
  const registerOnly = /(registrar|registro)/.test(clean) && paidNow && arrivedNow
    || /chegou e (ja )?(foi )?pago/.test(clean)
    || /pago e (ja )?chegou/.test(clean)
    || /pago e recebido/.test(clean);
  return {
    paidNow: paidNow || registerOnly,
    arrivedNow: arrivedNow || registerOnly,
    registerOnly,
  };
}

function findExpectedArrivalDate(tokens: Token[], todayIso: string): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.clean) continue;
    const prev = tokens.slice(Math.max(0, index - 3), index).map((item) => item.clean);
    const next = tokens.slice(index + 1, index + 4).map((item) => item.clean);
    const aroundArrival = [...prev, ...next].some((word) => ARRIVAL_CONTEXT_WORDS.has(word));
    if (!aroundArrival && token.clean !== 'amanha' && token.clean !== 'hoje' && !WEEKDAYS[token.clean]) continue;
    const parsed = parseAnyDateToken(token.clean, todayIso);
    if (parsed) return parsed;
  }
  return null;
}

function parseItems(tokens: Token[], supplierName: string, todayIso: string): {
  items: Array<{ amount_cents: number; due_date: string | null }>;
  invalidDate: string;
  pastDate: string;
  totalMismatch: boolean;
} {
  const parcelMode = tokens.some((token) => PARCEL_MARKERS.has(token.clean));
  const firstParcelIndex = tokens.findIndex((token) => PARCEL_MARKERS.has(token.clean));
  const items: Array<{ amount_cents: number; due_date: string | null }> = [];
  let expectedTotal = 0;
  let invalidDate = '';
  let pastDate = '';

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!isAmountToken(token)) continue;
    if (isParcelCountToken(tokens, index)) continue;
    const cents = parseMoneyToCents(token.raw);
    if (cents <= 0) continue;
    const isExplicitTotal = tokens[index - 1]?.clean === 'total' || (parcelMode && firstParcelIndex > index && expectedTotal === 0);
    if (isExplicitTotal) {
      expectedTotal = cents;
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

  const total = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const totalMismatch = expectedTotal > 0 && total > 0 && Math.abs(expectedTotal - total) > 1;
  if (!supplierName && items.length > 1) {
    return { items: [], invalidDate, pastDate, totalMismatch };
  }
  return { items, invalidDate, pastDate, totalMismatch };
}

function dueDateAround(tokens: Token[], amountIndex: number, todayIso: string): { date: string | null; invalidDate: string; pastDate: string } {
  const candidates: Token[] = [
    ...tokens.slice(amountIndex + 1, Math.min(tokens.length, amountIndex + 6)),
    ...tokens.slice(Math.max(0, amountIndex - 3), amountIndex).reverse(),
  ];
  for (const token of candidates) {
    if (!looksLikeDateToken(token.clean)) continue;
    const context = contextAround(tokens, token.index);
    if (context.some((word) => ARRIVAL_CONTEXT_WORDS.has(word))) continue;
    const parsed = parseAnyDateToken(token.clean, todayIso);
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

function isAmountToken(token: Token): boolean {
  if (!token.clean) return false;
  if (looksLikeDateToken(token.clean)) return false;
  return /^r\$\s*\d/i.test(token.raw) || /^\d+(?:[.,]\d{1,2})?$/.test(token.clean) || /^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(token.raw);
}

function isParcelCountToken(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  const next = tokens[index + 1]?.clean || '';
  const previous = tokens[index - 1]?.clean || '';
  const value = Number.parseInt(token.clean, 10);
  return Number.isInteger(value) && value > 0 && value <= 24 && (next === 'parcela' || next === 'parcelas' || previous === 'em');
}

function expectedParcelCount(tokens: Token[]): number {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const value = Number.parseInt(tokens[index].clean, 10);
    if (Number.isInteger(value) && value > 0 && value <= 24 && tokens[index + 1]?.clean.startsWith('parcela')) return value;
  }
  return 0;
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
  return value === 'hoje' || value === 'amanha' || Boolean(WEEKDAYS[value]);
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
