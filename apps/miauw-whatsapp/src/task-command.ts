export type TaskCommandAction = 'list' | 'create' | 'complete' | 'cancel';

export type TaskCommand = {
  action: TaskCommandAction;
  raw: string;
  title: string;
  query: string;
  priority: 'alta' | 'normal' | 'baixa';
  scope: 'self' | 'target' | 'general';
  target_hint: string;
  description: string;
  remind_at: string;
  reminder_label: string;
};

const CREATE_WORDS = [
  'tarefa',
  'tarefas',
  'pendencia',
  'pendenciazinha',
  'me lembra de',
  'me lembre de',
  'preciso fazer',
  'tenho que',
  'todos precisam',
];

export function parseTaskCommand(message: string): TaskCommand | null {
  const raw = stripActivationWord(message).replace(/[?!]+$/g, '').trim();
  const clean = normalizeIntentText(raw);
  if (!clean) return null;

  if (looksLikeList(clean)) {
    return baseCommand('list', raw);
  }
  if (looksLikeCancel(clean)) {
    return { ...baseCommand('cancel', raw), query: cleanTaskQuery(raw, 'cancel') };
  }
  if (looksLikeComplete(clean)) {
    return { ...baseCommand('complete', raw), query: cleanTaskQuery(raw, 'complete') };
  }
  if (!looksLikeCreate(clean)) {
    return null;
  }

  return parseCreate(raw);
}

function baseCommand(action: TaskCommandAction, raw: string): TaskCommand {
  return {
    action,
    raw,
    title: '',
    query: '',
    priority: 'normal',
    scope: 'self',
    target_hint: '',
    description: '',
    remind_at: '',
    reminder_label: '',
  };
}

function looksLikeList(clean: string): boolean {
  return /^(tarefa|tarefas|minhas tarefas)$/.test(clean)
    || /^(ver|veja|mostrar|mostra|listar|lista|consulta|consultar)\s+(minhas\s+)?(tarefa|tarefas|pendencia|pendencias)\b/.test(clean)
    || /\b(o que tem de tarefa|o que preciso fazer|lista minhas tarefas|tarefa pendente|tarefas pendentes)\b/.test(clean);
}

function looksLikeCancel(clean: string): boolean {
  return /\b(cancelar|cancela|excluir|apagar|remover|nao preciso mais)\b/.test(clean)
    && /\b(tarefa|tarefas|pendencia|pendencias)\b/.test(clean);
}

function looksLikeComplete(clean: string): boolean {
  return /\b(terminei|conclui|finalizar|finaliza|marcar como feito|ja fiz|fiz|concluida|feito|feita)\b/.test(clean)
    && (/\b(tarefa|tarefas|pendencia|pendencias)\b/.test(clean) || clean.length > 8);
}

function looksLikeCreate(clean: string): boolean {
  return CREATE_WORDS.some((word) => clean.startsWith(word) || clean.includes(` ${word} `))
    || /^(cria|criar|nova|novo|adiciona|adicionar|abre|abrir|lanca|lancar|registra|registrar)\s+(uma\s+)?(tarefa|tarefas|pendencia)\b/.test(clean);
}

function parseCreate(raw: string): TaskCommand {
  let body = raw
    .replace(/^\s*(cria|criar|nova|novo|adiciona|adicionar|abre|abrir|lanca|lancar|registra|registrar)\s+/i, '')
    .replace(/^\s*(uma\s+)?(tarefa|tarefas|pend[eê]ncia|pendenciazinha)\s*/i, '')
    .replace(/^\s*(me\s+lembra\s+de|me\s+lembre\s+de|preciso\s+fazer|tenho\s+que)\s+/i, '')
    .trim();

  const command = baseCommand('create', raw);
  command.priority = priorityFromText(body);

  const cleanBody = normalizeIntentText(body);
  if (/^(geral|publica|publico|para todos|pra todos)\b/.test(cleanBody)) {
    command.scope = 'general';
    body = body.replace(/^\s*(geral|publica|publico|para todos|pra todos)\s*/i, '').trim();
  } else if (/^todos precisam\s+/i.test(raw)) {
    command.scope = 'general';
    body = raw.replace(/^\s*todos precisam\s+/i, '').trim();
  } else {
    const target = body.match(/^\s*(?:para|pra|pro|p\/)\s+([\p{L}\p{N}._-]{2,45})\s+(.+)$/iu);
    if (target) {
      const hint = target[1].trim();
      const hintClean = normalizeIntentText(hint);
      if (['todos', 'todas', 'equipe'].includes(hintClean)) {
        command.scope = 'general';
        body = target[2].trim();
      } else if (!['mim', 'eu'].includes(hintClean)) {
        command.scope = 'target';
        command.target_hint = cleanPart(hint, 80);
        body = target[2].trim();
      }
    }
  }

  const reminder = extractReminderFromText(body);
  body = reminder.text;
  command.remind_at = reminder.remind_at;
  command.reminder_label = reminder.label;

  const parts = body.split(/\s*(?:-|;|\|)\s*/).map((part) => part.trim()).filter(Boolean);
  command.title = cleanTaskTitle(parts[0] || body);
  command.description = cleanPart(parts.slice(1).join(' - '), 900);
  return command;
}

function cleanTaskQuery(raw: string, action: 'complete' | 'cancel'): string {
  let text = raw;
  if (action === 'cancel') {
    text = text
      .replace(/\b(cancelar|cancela|excluir|apagar|remover)\s+(a\s+)?(tarefa|pendencia)\b/gi, ' ')
      .replace(/\bnao\s+preciso\s+mais\s+(da\s+)?(tarefa|pendencia)\b/gi, ' ');
  } else {
    text = text
      .replace(/\b(terminei|conclui|finalizar|finaliza|marcar\s+como\s+feito|pode\s+marcar\s+como\s+feito|ja\s+fiz|fiz)\s+(a\s+)?(tarefa|pendencia)?\b/gi, ' ')
      .replace(/\b(tarefa|pendencia)\s+(concluida|feita|pronta)\b/gi, ' ');
  }
  return cleanPart(text.replace(/\b(aquela|do|da|dos|das|de|o|a)\b/gi, ' '), 160);
}

function priorityFromText(value: string): 'alta' | 'normal' | 'baixa' {
  const clean = normalizeIntentText(value);
  if (/\b(alta|urgente|critica|critico|grave|importante)\b/.test(clean)) return 'alta';
  if (/\b(baixa|leve|menor|simples)\b/.test(clean)) return 'baixa';
  return 'normal';
}

function cleanTaskTitle(value: string): string {
  return cleanPart(
    value
      .replace(/\b(prioridade\s+)?(alta|media|medio|normal|baixa|urgente|critica|critico|grave|leve|menor|simples)\b/gi, ' ')
      .replace(/\b(pra mim|para mim|minha|meu|hoje|agora)\b/gi, ' '),
    180,
  );
}

function extractReminderFromText(value: string): { text: string; remind_at: string; label: string } {
  let text = value;
  const time = timeFromText(text);
  const timeLabel = time.label;
  const timeForDate = time.value;
  let date = '';
  let label = '';
  const clean = normalizeIntentText(text);
  const dateMatch = text.match(/\b([0-3]?\d)\/([01]?\d)(?:\/(\d{2,4}))?\b/);
  if (dateMatch) {
    date = dateFromSlashMatch(dateMatch);
    label = dateMatch[0];
    text = text.replace(dateMatch[0], ' ');
  } else if (/\bamanha\b/.test(clean)) {
    date = saoPauloDatePlusDays(1);
    label = 'amanha';
    text = text.replace(/\bamanh[aã]\b/iu, ' ');
  } else if (/\bhoje\b/.test(clean)) {
    date = saoPauloDatePlusDays(0);
    label = 'hoje';
    text = text.replace(/\bhoje\b/iu, ' ');
  } else {
    const weekday = weekdayFromText(clean);
    if (weekday !== null) {
      date = nextSaoPauloWeekday(weekday);
      label = weekdayLabel(weekday);
      text = text.replace(new RegExp(`\\b${weekdayRegexSource(weekday)}\\b`, 'iu'), ' ');
    }
  }

  if (time.matched) {
    text = text.replace(time.matched, ' ');
  }

  if (!date) {
    return { text: cleanPart(text, 1000), remind_at: '', label: '' };
  }

  return {
    text: cleanPart(text, 1000),
    remind_at: `${date}T${timeForDate}:00-03:00`,
    label: `${label}${timeLabel ? ` ${timeLabel}` : ''}`.trim(),
  };
}

function timeFromText(value: string): { value: string; label: string; matched: string } {
  const explicit = value.match(/\b(?:as|às|a)?\s*([01]?\d|2[0-3])(?:h|:)([0-5]\d)?\b/i);
  if (explicit) {
    const hour = explicit[1].padStart(2, '0');
    const minute = (explicit[2] || '00').padStart(2, '0');
    return { value: `${hour}:${minute}`, label: `${hour}:${minute}`, matched: explicit[0] };
  }
  const clean = normalizeIntentText(value);
  if (/\b(cedo|manha)\b/.test(clean)) return { value: '09:00', label: '09:00', matched: matchTimeWord(value, ['cedo', 'manha']) };
  if (/\btarde\b/.test(clean)) return { value: '15:00', label: '15:00', matched: matchTimeWord(value, ['tarde']) };
  if (/\bnoite\b/.test(clean)) return { value: '18:00', label: '18:00', matched: matchTimeWord(value, ['noite']) };
  return { value: '09:00', label: '09:00', matched: '' };
}

function matchTimeWord(value: string, words: string[]): string {
  for (const word of words) {
    const match = value.match(new RegExp(`\\b${word}\\b`, 'iu'));
    if (match) return match[0];
  }
  return '';
}

function saoPauloParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function saoPauloDatePlusDays(days: number): string {
  const parts = saoPauloParts();
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

function dateFromSlashMatch(match: RegExpMatchArray): string {
  const now = saoPauloParts();
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : now.year;
  if (year < 100) year += 2000;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const today = new Date(Date.UTC(now.year, now.month - 1, now.day));
  if (!match[3] && candidate.getTime() < today.getTime()) {
    candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
  }
  return candidate.toISOString().slice(0, 10);
}

function weekdayFromText(clean: string): number | null {
  const names: Array<[number, RegExp]> = [
    [0, /\bdomingo\b/],
    [1, /\bsegunda\b/],
    [2, /\bterca\b/],
    [3, /\bquarta\b/],
    [4, /\bquinta\b/],
    [5, /\bsexta\b/],
    [6, /\bsabado\b/],
  ];
  const found = names.find(([, pattern]) => pattern.test(clean));
  return found ? found[0] : null;
}

function nextSaoPauloWeekday(target: number): string {
  const parts = saoPauloParts();
  const today = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const diff = (target - today.getUTCDay() + 7) % 7 || 7;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + diff));
  return date.toISOString().slice(0, 10);
}

function weekdayLabel(day: number): string {
  return ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][day] || 'data';
}

function weekdayRegexSource(day: number): string {
  return ['domingo', 'segunda', 'ter[cç]a', 'quarta', 'quinta', 'sexta', 's[aá]bado'][day] || 'data';
}

function cleanPart(value: string, limit: number): string {
  return value
    .replace(/[^\p{L}\p{N}\s/\-.,+()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-:;,.()]+|[-:;,.()]+$/g, '')
    .slice(0, limit)
    .trim();
}

function stripActivationWord(message: string): string {
  return message.replace(/^\s*(miauby|miauw)\s+/i, '').trim();
}

function normalizeIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
