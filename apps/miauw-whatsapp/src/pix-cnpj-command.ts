export type PixCnpjCommand = {
  ok: boolean;
  error: string;
  error_message: string;
  raw: string;
  amount_cents: number;
  amount_label: string;
  responsible_hint: string;
  observation: string;
};

type AmountMatch = {
  cents: number;
  raw: string;
  index: number;
  end: number;
  negative: boolean;
};

const MONEY_UNIT_WORDS = new Set(['reais', 'real', 'rs', 'conto', 'contos', 'pila', 'pilas']);
const COMMAND_NOISE = new Set([
  'pix',
  'cnpj',
  'cpnj',
  'valor',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'o',
  'a',
  'um',
  'uma',
  'por',
  'pela',
  'pelo',
  'feito',
  'feita',
  'fez',
  'fazer',
  'lancar',
  'lanca',
  'lance',
  'registrar',
  'registra',
  'registre',
  'criar',
  'cria',
  'colocar',
  'coloca',
]);
const OBS_STRIP_PREFIXES = new Set(['obs', 'observacao', 'motivo']);
const OBS_KEEP_PREFIXES = new Set(['fornecedor', 'destino', 'pagador', 'referente', 'compra', 'pagamento']);
const RESPONSIBLE_PREFIXES = new Set(['responsavel', 'resp']);
const WORD_AMOUNT: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
};
const WORD_FIXES: Record<string, string> = {
  cpnj: 'cnpj',
};

export function parsePixCnpjCommand(message: string): PixCnpjCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized || !hasPixCnpjIntent(normalized)) return null;

  const commandText = stripPixCnpjCommandWords(raw);
  const numericAmount = findNumericAmount(commandText);
  const wordAmount = numericAmount ? null : findWordAmount(commandText);
  const amount = numericAmount || wordAmount;
  const base = buildCommand(raw, 0, '', '', '');

  if (!amount) {
    if (hasConfusingAmount(normalized)) {
      return invalidCommand(base, 'invalid_amount', 'Nao registrei. Valor ficou confuso.');
    }
    return invalidCommand(base, 'missing_amount', 'Faltou o valor. Me mande assim: miauby pix cnpj 28,90 sueli.');
  }

  if (amount.negative || amount.cents <= 0) {
    return invalidCommand(
      buildCommand(raw, Math.max(0, amount.cents), formatMoneyLabel(amount.cents), '', ''),
      'invalid_value',
      'Valor invalido para PIX CNPJ.',
    );
  }

  const beforeAmount = commandText.slice(0, amount.index).trim();
  const afterAmount = commandText.slice(amount.end).trim();
  const beforeParts = parseSegment(beforeAmount);
  const afterParts = parseSegment(afterAmount);
  const responsibleHint = beforeParts.responsibleHint || afterParts.responsibleHint;
  const observation = [beforeParts.observation, afterParts.observation].filter(Boolean).join(' ');

  return buildCommand(raw, amount.cents, formatMoneyLabel(amount.cents), responsibleHint, observation);
}

export function formatPixCnpjCreateError(command: PixCnpjCommand): string {
  if (command.error === 'missing_amount') return 'Faltou o valor. Me mande assim: miauby pix cnpj 28,90 sueli.';
  if (command.error === 'invalid_value') return 'Valor invalido para PIX CNPJ.';
  if (command.error === 'invalid_amount') return 'Nao registrei. Valor ficou confuso.';
  return command.error_message || 'Nao registrei. Valor ficou confuso.';
}

function buildCommand(
  raw: string,
  amountCents: number,
  amountLabel: string,
  responsibleHint: string,
  observation: string,
): PixCnpjCommand {
  return {
    ok: amountCents > 0,
    error: '',
    error_message: '',
    raw,
    amount_cents: amountCents,
    amount_label: amountLabel,
    responsible_hint: cleanName(responsibleHint),
    observation: cleanObservation(observation),
  };
}

function invalidCommand(command: PixCnpjCommand, error: string, message: string): PixCnpjCommand {
  return {
    ...command,
    ok: false,
    error,
    error_message: message,
  };
}

function hasPixCnpjIntent(normalized: string): boolean {
  const words = normalized.split(/\s+/g).map(canonicalWord).filter(Boolean);
  return words.includes('pix') && words.includes('cnpj');
}

function stripPixCnpjCommandWords(value: string): string {
  return value
    .replace(/\b(?:lancar|lan[çc]ar|lanca|lan[çc]a|lance|registrar|registra|registre|criar|cria|colocar|coloca)\b/giu, ' ')
    .replace(/\bpix\s+c(?:npj|pnj)\b/giu, ' ')
    .replace(/\b(?:pix|c(?:npj|pnj))\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findNumericAmount(value: string): AmountMatch | null {
  const pattern = /(?:r\$\s*)?[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?(?=\s*(?:reais?|rs|conto?s?|pila?s?)?(?:$|[\s.,;:!?-]))/giu;
  for (const match of value.matchAll(pattern)) {
    const raw = match[0] || '';
    const index = match.index ?? -1;
    if (index < 0) continue;
    const before = value.slice(Math.max(0, index - 1), index);
    const after = value.slice(index + raw.length, index + raw.length + 1);
    if (before === '/' || after === '/' || /^[hH]$/.test(after)) continue;
    const parsed = parseMoneyToCents(raw);
    if (parsed === null) continue;
    return {
      cents: parsed.cents,
      raw,
      index,
      end: index + raw.length,
      negative: parsed.negative,
    };
  }
  return null;
}

function findWordAmount(value: string): AmountMatch | null {
  const normalized = normalizeIntentText(value);
  const amountWords = Object.keys(WORD_AMOUNT).join('|');
  const pattern = new RegExp(`\\b(${amountWords})\\b(?:\\s+(reais?|conto?s?|pila?s?))?(?=\\s*(?:$|[\\s.,;:!?-]))`, 'giu');
  for (const match of normalized.matchAll(pattern)) {
    const word = match[1] || '';
    const unit = match[2] || '';
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (!unit && !wordAmountHasSafeContext(normalized, index, word.length)) continue;
    const amount = WORD_AMOUNT[word] || 0;
    if (amount <= 0) continue;
    return {
      cents: amount * 100,
      raw: match[0],
      index,
      end: index + match[0].length,
      negative: false,
    };
  }
  return null;
}

function wordAmountHasSafeContext(value: string, index: number, length: number): boolean {
  const before = value.slice(Math.max(0, index - 32), index);
  const after = value.slice(index + length).trim();
  if (/\b(?:pix|cnpj|cpnj|valor)\b/u.test(before)) return true;
  if (!after) return false;
  const firstAfter = canonicalWord(after.split(/\s+/g)[0] || '');
  if (OBS_STRIP_PREFIXES.has(firstAfter) || OBS_KEEP_PREFIXES.has(firstAfter) || MONEY_UNIT_WORDS.has(firstAfter)) return true;
  return /^[a-z]{3,}/u.test(firstAfter);
}

function parseMoneyToCents(value: string): { cents: number; negative: boolean } | null {
  let text = value.replace(/r\$/gi, '').replace(/\s+/g, '').trim();
  if (!text) return null;
  const negative = text.startsWith('-');
  text = text.replace(/^[+-]/, '');
  if (!text) return { cents: 0, negative };
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}(?:\.|$)/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return null;
  return { cents: Math.round(amount * 100), negative };
}

function hasConfusingAmount(normalized: string): boolean {
  if (/\b(muito|alto|valor\s+alto)\b/.test(normalized)) return true;
  const amountWords = Object.keys(WORD_AMOUNT).join('|');
  return new RegExp(`\\b(?:${amountWords})\\b`, 'u').test(normalized)
    && !new RegExp(`\\b(?:${amountWords})\\s+(?:reais?|conto?s?|pila?s?)\\b`, 'u').test(normalized);
}

function parseSegment(value: string): { responsibleHint: string; observation: string } {
  const clean = value
    .replace(/\bvalor\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { responsibleHint: '', observation: '' };

  const explicit = clean.split(/\s+-\s+/, 2);
  if (explicit.length === 2) {
    return {
      responsibleHint: cleanName(explicit[0]),
      observation: cleanObservation(explicit[1]),
    };
  }

  const markerMatch = clean.match(/\b(?:respons[aá]vel|resp|quem\s+fez|feito\s+(?:por|pela|pelo)|feita\s+(?:por|pela|pelo))\s+(.+)$/iu);
  if (markerMatch) {
    return splitNameAndObservation(wordsFrom(markerMatch[1] || ''));
  }

  return splitNameAndObservation(wordsFrom(clean));
}

function splitNameAndObservation(words: string[]): { responsibleHint: string; observation: string } {
  const filtered = [...words];
  while (
    filtered.length
    && (
      COMMAND_NOISE.has(canonicalWord(normalizeIntentText(filtered[0])))
      || MONEY_UNIT_WORDS.has(canonicalWord(normalizeIntentText(filtered[0])))
    )
  ) {
    filtered.shift();
  }
  if (!filtered.length) return { responsibleHint: '', observation: '' };

  const first = canonicalWord(normalizeIntentText(filtered[0]));
  if (OBS_STRIP_PREFIXES.has(first)) {
    return { responsibleHint: '', observation: cleanObservation(filtered.slice(1).join(' ')) };
  }
  if (OBS_KEEP_PREFIXES.has(first)) {
    return { responsibleHint: '', observation: cleanObservation(filtered.join(' ')) };
  }
  if (RESPONSIBLE_PREFIXES.has(first)) {
    return splitNameAndObservation(filtered.slice(1));
  }
  const observationWords = filtered.slice(1).filter((word) => {
    const clean = canonicalWord(normalizeIntentText(word));
    return clean && !COMMAND_NOISE.has(clean) && !MONEY_UNIT_WORDS.has(clean);
  });
  return {
    responsibleHint: cleanName(filtered[0]),
    observation: cleanObservation(observationWords.join(' ')),
  };
}

function wordsFrom(value: string): string[] {
  return value
    .split(/\s+/g)
    .map((word) => word.replace(/^[.,:;!?/-]+|[.,:;!?/-]+$/g, ''))
    .filter(Boolean);
}

function cleanName(value: string): string {
  return value
    .replace(/[^\p{L}0-9\s._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function cleanObservation(value: string): string {
  return value
    .replace(/\b(?:obs|observacao|motivo)\s*[:,-]?\s*/giu, ' ')
    .replace(/^\s*(?:para|pra|pro|por\s+causa\s+(?:do|da|de)?|referente\s+a|usad[oa]\s+para)\s+/iu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,:;!?/-]+|[.,:;!?/-]+$/g, '')
    .slice(0, 260);
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

function formatMoneyLabel(cents: number): string {
  return (Math.max(0, cents) / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}
