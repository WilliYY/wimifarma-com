export type SangriaCommand = {
  ok: boolean;
  error: string;
  error_message: string;
  raw: string;
  amount_cents: number;
  amount_label: string;
  responsible_hint: string;
  observation: string;
  time_note: string;
  needs_confirmation: boolean;
  confirmation_message: string;
  confirmation_summary: string;
};

type AmountMatch = {
  cents: number;
  raw: string;
  index: number;
  end: number;
  negative: boolean;
};

const HIGH_VALUE_CENTS = 1000000;
const SANGRIA_WORDS = new Set([
  'sangria',
  'sangriaa',
  'sangira',
  'sagria',
  'sangra',
  'sangrei',
  'sangrou',
  'sangrando',
  'sg',
  'sang',
]);
const ACTION_WORDS = new Set([
  'faz',
  'fazer',
  'registra',
  'registrar',
  'registre',
  'lancar',
  'lanca',
  'lance',
  'coloca',
  'coloque',
  'bota',
  'retirei',
  'retira',
  'retirar',
  'tirei',
  'tira',
  'tirar',
  'saiu',
]);
const OBS_PREFIXES = new Set(['para', 'pra', 'pro', 'por', 'motivo', 'obs', 'observacao', 'despesa']);
const RESPONSIBLE_PREFIXES = new Set(['responsavel', 'resp', 'operador', 'atendente']);
const TAIL_NOISE = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'caixa',
  'como',
  'sangria',
  'sangriaa',
  'sangira',
  'sagria',
  'sangra',
  'sangrei',
  'saiu',
  'retirada',
  'retirei',
  'tirei',
  'feita',
  'feito',
  'agora',
  'hoje',
  'reais',
  'real',
  'rs',
]);
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
  quinze: 15,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  cem: 100,
  cento: 100,
};
const WORD_FIXES: Record<string, string> = {
  sangriaa: 'sangria',
  sangira: 'sangria',
  sagria: 'sangria',
  sangra: 'sangria',
};

export function parseSangriaCommand(message: string): SangriaCommand | null {
  const raw = stripActivationWord(message).replace(/[?!;]+$/g, '').trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized || !hasSangriaIntent(normalized)) return null;

  const numericAmount = findNumericAmount(raw);
  const wordAmount = numericAmount ? null : findWordAmount(raw);
  const amount = numericAmount || wordAmount;
  const base = buildCommand(raw, 0, '', '', '', false);

  if (!amount) {
    if (hasConfusingAmount(normalized)) {
      return invalidCommand(base, 'invalid_amount', 'Nao entendi o valor. Me mande assim: miauby sangria 10.');
    }
    return invalidCommand(base, 'missing_amount', 'Faltou o valor. Me mande assim: miauby sangria 10.');
  }

  if (amount.negative || amount.cents <= 0) {
    return invalidCommand(buildCommand(raw, Math.max(0, amount.cents), formatMoneyLabel(amount.cents), '', '', false), 'invalid_value', 'Valor invalido para sangria.');
  }

  const tail = raw.slice(amount.end).trim();
  const tailParts = parseTail(tail);
  const command = buildCommand(raw, amount.cents, formatMoneyLabel(amount.cents), tailParts.responsibleHint, tailParts.observation, false, tailParts.timeNote);

  if (amount.cents >= HIGH_VALUE_CENTS) {
    const messageText = `${formatMoneyLabel(amount.cents)} e alto. Confirma essa sangria?`;
    return invalidCommand(command, 'high_value_confirmation_required', messageText, true, `Registrar sangria de ${formatMoneyLabel(amount.cents)}.`);
  }

  return command;
}

export function formatSangriaCreateError(command: SangriaCommand): string {
  if (command.error === 'invalid_amount') return 'Nao entendi o valor. Me mande assim: miauby sangria 10.';
  if (command.error === 'invalid_value') return 'Valor invalido para sangria.';
  return command.error_message || 'Nao registrei. Valor ficou confuso.';
}

function buildCommand(
  raw: string,
  amountCents: number,
  amountLabel: string,
  responsibleHint: string,
  observation: string,
  needsConfirmation: boolean,
  timeNote = '',
  confirmationSummary = '',
): SangriaCommand {
  return {
    ok: !needsConfirmation && amountCents > 0,
    error: '',
    error_message: '',
    raw,
    amount_cents: amountCents,
    amount_label: amountLabel,
    responsible_hint: cleanName(responsibleHint),
    observation: cleanObservation(observation),
    time_note: cleanObservation(timeNote),
    needs_confirmation: needsConfirmation,
    confirmation_message: '',
    confirmation_summary: confirmationSummary,
  };
}

function invalidCommand(
  command: SangriaCommand,
  error: string,
  message: string,
  needsConfirmation = false,
  confirmationSummary = '',
): SangriaCommand {
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

function hasSangriaIntent(normalized: string): boolean {
  const words = normalized.split(/\s+/g).map(canonicalWord).filter(Boolean);
  if (words.some((word) => SANGRIA_WORDS.has(word))) return true;
  const hasAction = words.some((word) => ACTION_WORDS.has(word));
  const hasCashBox = words.includes('caixa');
  const hasMoney = findNumericAmount(normalized) !== null || findWordAmount(normalized) !== null;
  return hasAction && hasCashBox && hasMoney;
}

function findNumericAmount(value: string): AmountMatch | null {
  const pattern = /(?:r\$\s*)?[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?(?=\s*(?:reais?|rs)?(?:$|[\s.,;:!?-]))/giu;
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
  const pattern = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|cem|cento)\s+reais?\b/iu;
  const match = pattern.exec(normalized);
  if (!match) return null;
  const amount = WORD_AMOUNT[match[1]] || 0;
  if (amount <= 0) return null;
  return {
    cents: amount * 100,
    raw: match[0],
    index: match.index,
    end: match.index + match[0].length,
    negative: false,
  };
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
  if (/\b(muito|alto|valor alto|valor)\b/.test(normalized)) return true;
  return Object.keys(WORD_AMOUNT).some((word) => new RegExp(`\\b${word}\\b`).test(normalized));
}

function parseTail(value: string): { responsibleHint: string; observation: string; timeNote: string } {
  const timeNote = timeNoteFromTail(value);
  const withoutTime = value.replace(/\b(?:as|a?s|ate)?\s*[0-2]?\d\s*h(?:[0-5]\d)?\b/giu, ' ');
  let clean = withoutTime
    .replace(/^\s*(?:reais?|real|rs)\b/iu, ' ')
    .replace(/\b(?:do|da)\s+caixa\b/giu, ' ')
    .replace(/\b(?:como|de)\s+sangria\b/giu, ' ')
    .replace(/\bfeita\s+agora\b/giu, ' ')
    .replace(/\bfeito\s+agora\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return { responsibleHint: '', observation: '', timeNote };

  const explicit = clean.split(/\s+-\s+/, 2);
  if (explicit.length === 2) {
    return {
      responsibleHint: cleanName(explicit[0]),
      observation: cleanObservation(explicit[1]),
      timeNote,
    };
  }

  const words = clean
    .split(/\s+/g)
    .map((word) => word.replace(/^[.,:;!?/-]+|[.,:;!?/-]+$/g, ''))
    .filter(Boolean);
  while (words.length && TAIL_NOISE.has(canonicalWord(normalizeIntentText(words[0])))) {
    words.shift();
  }
  if (!words.length) return { responsibleHint: '', observation: '', timeNote };

  const first = canonicalWord(normalizeIntentText(words[0]));
  if (OBS_PREFIXES.has(first)) {
    return { responsibleHint: '', observation: cleanObservation(words.slice(1).join(' ')), timeNote };
  }
  if (RESPONSIBLE_PREFIXES.has(first) || (first === 'feito' && normalizeIntentText(words[1] || '') === 'por')) {
    const start = first === 'feito' ? 2 : 1;
    const parts = splitNameAndObservation(words.slice(start));
    return { ...parts, timeNote };
  }

  const parts = splitNameAndObservation(words);
  return { ...parts, timeNote };
}

function splitNameAndObservation(words: string[]): { responsibleHint: string; observation: string } {
  const filtered = words.filter((word) => canonicalWord(normalizeIntentText(word)));
  while (filtered.length && TAIL_NOISE.has(canonicalWord(normalizeIntentText(filtered[0])))) {
    filtered.shift();
  }
  if (!filtered.length) return { responsibleHint: '', observation: '' };
  const first = canonicalWord(normalizeIntentText(filtered[0]));
  if (OBS_PREFIXES.has(first)) {
    return { responsibleHint: '', observation: cleanObservation(filtered.slice(1).join(' ')) };
  }
  return {
    responsibleHint: cleanName(filtered[0]),
    observation: cleanObservation(filtered.slice(1).join(' ')),
  };
}

function timeNoteFromTail(value: string): string {
  const normalized = normalizeIntentText(value);
  const match = normalized.match(/\b(?:as|a?s|ate)?\s*([0-2]?\d)\s*h([0-5]\d)?\b/u);
  if (!match) return '';
  const hour = Number.parseInt(match[1], 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '';
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return '';
  return `Horario informado: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`;
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
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,:;!?/-]+|[.,:;!?/-]+$/g, '')
    .slice(0, 220);
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
