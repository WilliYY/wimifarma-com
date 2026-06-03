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
