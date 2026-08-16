export type SemanticChannel = 'internal' | 'whatsapp';
export type SemanticStatus = 'resolved' | 'ambiguous' | 'none';

export type SemanticEntityType =
  | 'money'
  | 'date'
  | 'time'
  | 'quantity'
  | 'dosage'
  | 'category'
  | 'user';

export type SemanticEntity = {
  type: SemanticEntityType;
  value: string;
  normalized: string;
  start: number;
  end: number;
};

export type SemanticInterpretation = {
  status: SemanticStatus;
  intent: string;
  module: string;
  risk: 'baixo' | 'medio' | 'alto';
  confidence: number;
  evidence: string[];
  entities: SemanticEntity[];
  canonical_message: string;
  missing: string[];
  clarification: string;
};

type SemanticOptions = {
  channel?: SemanticChannel;
};

type IntentSpec = {
  intent: string;
  module: string;
  risk: 'baixo' | 'medio' | 'alto';
  prefix: string;
  groups: string[][];
  optional?: string[];
  blockers?: string[];
  priority?: number;
  moneyFirst?: boolean;
  requiredPayload?: string;
};

type MessageToken = {
  value: string;
  normalized: string;
  start: number;
  end: number;
};

type Candidate = {
  spec: IntentSpec;
  score: number;
  confidence: number;
  evidence: string[];
  consumed: Set<number>;
};

const ACTIVATION_WORDS = new Set(['miauby', 'miauw', 'miau']);
const EDGE_FILLERS = new Set([
  'a', 'ai', 'como', 'da', 'de', 'do', 'e', 'eu', 'favor', 'me', 'no', 'o', 'por', 'porfavor',
  'quero', 'queria', 'preciso', 'pra', 'pode', 'poderia', 'por',
]);
const ACTION_FILLERS = new Set([
  'abre', 'abrir', 'adiciona', 'adicionar', 'coloca', 'colocar', 'cria', 'criar', 'faz', 'fazer',
  'lanca', 'lancar', 'registra', 'registrar',
]);
const CATEGORY_WORDS = new Set([
  'alta', 'baixa', 'critica', 'critico', 'encomenda', 'falta', 'geral', 'grave', 'importante',
  'normal', 'popular', 'urgente',
]);

const INTENTS: IntentSpec[] = [
  {
    intent: 'registrar_falteiro', module: 'cotacao', risk: 'medio', prefix: 'falta', priority: 40,
    groups: [[
      'falteiro', 'falta', 'faltou', 'acabou', 'esta faltando', 'ta faltando', 'ficou sem', 'estamos sem',
      'sem estoque', 'nao tem mais', 'terminou', 'precisa comprar', 'precisamos comprar', 'no falteiro',
      'preciso urgente de', 'preciso de', 'precisamos de', 'esta em falta', 'ta em falta', 'em falta',
    ]],
    optional: ['coloca', 'adiciona', 'joga'],
    blockers: ['qual faltou', 'o que faltou', 'relatorio', 'historico'],
    requiredPayload: 'produto',
  },
  {
    intent: 'registrar_pix_cnpj', module: 'financeiro', risk: 'alto', prefix: 'pix cnpj', priority: 60,
    groups: [['pix'], ['cnpj', 'cpnj']], optional: ['lancar', 'registrar', 'comprovante'], moneyFirst: true,
    requiredPayload: 'valor',
  },
  {
    intent: 'registrar_sangria', module: 'financeiro', risk: 'alto', prefix: 'sangria', priority: 55,
    groups: [[
      'sangria', 'sangra', 'sangrei', 'retirada do caixa', 'retirar do caixa', 'tira do caixa',
      'tirar do caixa', 'retirei do caixa',
    ]],
    optional: ['lancar', 'registrar', 'dinheiro', 'valor'], moneyFirst: true, requiredPayload: 'valor',
  },
  {
    intent: 'registrar_faturamento_diario', module: 'financeiro', risk: 'alto', prefix: 'faturamento diario', priority: 45,
    groups: [['faturamento', 'venda do dia', 'vendas do dia'], ['diario', 'hoje', 'do dia']],
    optional: ['lancar', 'registrar'], moneyFirst: true, requiredPayload: 'valor',
  },
  {
    intent: 'criar_lancamento_financeiro', module: 'financeiro', risk: 'alto', prefix: 'financeiro', priority: 15,
    groups: [['financeiro', 'lancamento financeiro'], ['lancar', 'registrar', 'entrada', 'saida', 'pagar']],
    optional: ['conta', 'valor'], moneyFirst: true, requiredPayload: 'valor',
  },
  {
    intent: 'fechar_caixa', module: 'financeiro', risk: 'alto', prefix: 'fechar caixa', priority: 52,
    groups: [['caixa', 'fechamento'], ['fechar', 'finalizar']],
    blockers: ['sangria', 'pix', 'cnpj', 'tarefa'],
  },
  {
    intent: 'reabrir_caixa', module: 'financeiro', risk: 'alto', prefix: 'reabrir caixa', priority: 52,
    groups: [['caixa', 'fechamento'], ['reabrir', 'abrir novamente']],
    blockers: ['sangria', 'pix', 'cnpj', 'tarefa'],
  },
  {
    intent: 'consultar_fechamento_caixa', module: 'financeiro', risk: 'baixo', prefix: 'fechamento caixa', priority: 18,
    groups: [['fechamento caixa', 'fechamento de caixa', 'caixa'], ['fechamento', 'status', 'aberto', 'fechado']],
    optional: ['consultar', 'conferir'],
    blockers: ['sangria', 'pix', 'cnpj', 'faturamento', 'tarefa', 'fechar', 'finalizar', 'reabrir', 'abrir novamente'],
  },
  {
    intent: 'cancelar_pedido', module: 'pedidos', risk: 'medio', prefix: 'cancelar pedido', priority: 55,
    groups: [['pedido', 'pedidos'], ['cancelar', 'cancela', 'remover', 'excluir', 'apagar', 'nao precisa mais', 'nao preciso mais']],
    optional: ['fornecedor', 'distribuidora'], requiredPayload: 'pedido',
  },
  {
    intent: 'listar_pedidos_chegada', module: 'pedidos', risk: 'baixo', prefix: 'pedidos', priority: 35,
    groups: [['pedido', 'pedidos', 'o que falta chegar', 'aguardando chegada', 'para chegar']],
    optional: ['listar', 'lista', 'ver', 'mostrar', 'abertos'],
    blockers: ['cancelar', 'remover', 'excluir', 'criar', 'registrar', 'novo', 'pedido pago', 'pedido chegou'],
  },
  {
    intent: 'criar_pedido', module: 'pedidos', risk: 'alto', prefix: 'pedido', priority: 30,
    groups: [['pedido', 'pedidos', 'fornecedor', 'distribuidora']],
    optional: ['criar', 'registrar', 'lancar', 'novo'],
    blockers: ['cancelar', 'remover', 'excluir', 'listar', 'mostrar', 'ver pedidos', 'aguardando chegada'],
    requiredPayload: 'fornecedor e valor',
  },
  {
    intent: 'cancelar_tarefa', module: 'tarefa', risk: 'medio', prefix: 'cancelar tarefa', priority: 55,
    groups: [['tarefa', 'tarefas'], ['cancelar', 'cancela', 'remover', 'excluir', 'apagar', 'nao preciso mais', 'nao precisa mais']],
    requiredPayload: 'tarefa',
  },
  {
    intent: 'concluir_tarefa', module: 'tarefa', risk: 'medio', prefix: 'concluir tarefa', priority: 55,
    groups: [['tarefa', 'tarefas'], ['concluir', 'conclui', 'terminei', 'finalizar', 'finalizei', 'ja fiz', 'feito']],
    requiredPayload: 'tarefa',
  },
  {
    intent: 'consultar_tarefa', module: 'tarefa', risk: 'baixo', prefix: 'consultar tarefa', priority: 45,
    groups: [['tarefa', 'tarefas'], ['consultar', 'mostrar', 'status', 'detalhe']],
    blockers: ['concluir', 'cancelar', 'criar', 'listar', 'minhas tarefas'], requiredPayload: 'tarefa',
  },
  {
    intent: 'listar_tarefas', module: 'tarefa', risk: 'baixo', prefix: 'tarefas', priority: 35,
    groups: [['tarefas', 'minhas tarefas', 'o que preciso fazer', 'lista de tarefas']],
    optional: ['listar', 'lista', 'mostrar', 'ver'],
    blockers: ['concluir', 'cancelar', 'criar', 'nova tarefa'],
  },
  {
    intent: 'criar_tarefa', module: 'tarefa', risk: 'medio', prefix: 'criar tarefa', priority: 25,
    groups: [['tarefa', 'tarefas', 'me lembra', 'me lembre', 'preciso fazer', 'tenho que']],
    optional: ['criar', 'nova', 'novo', 'adicionar', 'lancar', 'registrar'],
    blockers: ['concluir', 'cancelar', 'listar', 'minhas tarefas', 'mostrar tarefa', 'status da tarefa'],
    requiredPayload: 'titulo',
  },
  {
    intent: 'criar_conta_gestao', module: 'gestao', risk: 'alto', prefix: 'gestao', priority: 35,
    groups: [['gestao', 'conta da gestao', 'conta na gestao']], optional: ['conta', 'criar', 'lancar', 'registrar'],
    blockers: ['abrir gestao', 'acessar gestao', 'relatorio', 'resumo'], moneyFirst: true,
    requiredPayload: 'titulo e valor',
  },
  {
    intent: 'abrir_gestao', module: 'gestao', risk: 'baixo', prefix: 'abrir gestao', priority: 50,
    groups: [['gestao'], ['abrir', 'acessar', 'entrar']],
  },
  {
    intent: 'criar_encomenda_cotacao', module: 'cotacao', risk: 'alto', prefix: 'encomenda', priority: 55,
    groups: [['encomenda', 'encomendar', 'encomendado']], optional: ['criar', 'registrar', 'cotacao'],
    blockers: ['relatorio', 'resumo', 'listar'], requiredPayload: 'produto',
  },
  {
    intent: 'criar_cotacao_urgente', module: 'cotacao', risk: 'alto', prefix: 'cotacao urgente', priority: 55,
    groups: [['cotacao', 'cotar'], ['urgente']], optional: ['criar', 'colocar', 'adicionar'], requiredPayload: 'produto',
  },
  {
    intent: 'criar_planilha_cotacao', module: 'cotacao', risk: 'alto', prefix: 'planilha cotacao', priority: 55,
    groups: [['planilha'], ['cotacao', 'cotar']], optional: ['criar', 'montar', 'gerar'], requiredPayload: 'itens',
  },
  {
    intent: 'criar_cotacao_rapida', module: 'cotacao', risk: 'alto', prefix: 'cotacao rapida', priority: 42,
    groups: [['cotacao rapida', 'cotar rapido', 'cotar rapida']], optional: ['criar', 'fazer'], requiredPayload: 'produto',
  },
  {
    intent: 'consultar_cotacao', module: 'cotacao', risk: 'baixo', prefix: 'cotacao', priority: 20,
    groups: [['cotacao', 'cotar', 'preco na cotacao']], optional: ['buscar', 'consultar', 'mostrar', 'ver'],
    blockers: ['urgente', 'planilha', 'encomenda', 'rapida', 'rapido'], requiredPayload: 'item',
  },
  ...reportSpecs(),
  {
    intent: 'consultar_calendario', module: 'calendario', risk: 'baixo', prefix: 'calendario', priority: 30,
    groups: [['calendario', 'agenda', 'plantao', 'plantoes', 'escala', 'dia marcado']],
    optional: ['consultar', 'mostrar', 'status', 'ver'],
  },
];

function reportSpecs(): IntentSpec[] {
  return ['financeiro', 'cashback', 'tarefas', 'geral', 'cotacao', 'codigos', 'calendario'].map((module) => ({
    intent: `relatorio_${module}`,
    module: module === 'tarefas' ? 'tarefa' : module,
    risk: 'baixo',
    prefix: `relatorio ${module}`,
    priority: 70,
    groups: [['relatorio', 'resumo'], [module]],
    optional: ['mostrar', 'consultar', 'ver', 'quero'],
  }));
}

export function interpretSemanticCommand(message: string, _options: SemanticOptions = {}): SemanticInterpretation {
  const original = String(message || '').trim();
  const empty = noneResult();
  if (!original) return empty;

  const tokens = tokenize(original);
  const normalized = normalizeText(original);
  const activated = tokens.some((token) => ACTIVATION_WORDS.has(token.normalized));
  const question = /\?\s*$/.test(original) || /^(qual|quais|quando|onde|porque|por que|quem)\b/.test(normalized);
  const candidates = INTENTS
    .map((spec) => candidateFor(spec, tokens, normalized, activated, question))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.score - left.score || (right.spec.priority || 0) - (left.spec.priority || 0));

  if (!candidates.length) return { ...empty, entities: extractEntities(original, tokens) };

  const top = candidates[0];
  const second = candidates[1];
  if (second && isAmbiguous(top, second)) {
    return {
      status: 'ambiguous',
      intent: '',
      module: '',
      risk: top.spec.risk === 'alto' || second.spec.risk === 'alto' ? 'alto' : 'medio',
      confidence: round(Math.min(top.confidence, second.confidence)),
      evidence: unique([...top.evidence, ...second.evidence]),
      entities: extractEntities(original, tokens),
      canonical_message: '',
      missing: [],
      clarification: ambiguityQuestion(top.spec, second.spec),
    };
  }

  const entities = extractEntities(original, tokens, top.spec, top.consumed);
  const canonical = canonicalMessage(top, tokens, entities);
  const missing = missingFields(top.spec, canonical, entities);

  return {
    status: 'resolved',
    intent: top.spec.intent,
    module: top.spec.module,
    risk: top.spec.risk,
    confidence: round(top.confidence),
    evidence: top.evidence,
    entities,
    canonical_message: canonical,
    missing,
    clarification: '',
  };
}

function candidateFor(
  spec: IntentSpec,
  tokens: MessageToken[],
  normalized: string,
  activated: boolean,
  question: boolean,
): Candidate | null {
  const blockers = (spec.blockers || []).filter((phrase) => hasPhrase(tokens, phrase));
  if (blockers.length) return null;

  const consumed = new Set<number>();
  const evidence: string[] = [];
  for (const group of spec.groups) {
    const matched = bestPhrase(tokens, group);
    if (!matched) return null;
    evidence.push(matched.phrase);
    matched.indexes.forEach((index) => consumed.add(index));
  }

  const optional = (spec.optional || [])
    .map((phrase) => bestPhrase(tokens, [phrase]))
    .filter((match): match is { phrase: string; indexes: number[] } => match !== null);
  for (const match of optional) {
    evidence.push(match.phrase);
    match.indexes.forEach((index) => consumed.add(index));
  }

  if (spec.intent === 'registrar_falteiro' && question && !activated) return null;
  if (spec.intent === 'criar_conta_gestao' && !containsMoneyLike(tokens) && !hasPhrase(tokens, 'conta')) return null;

  const specificity = evidence.reduce((total, phrase) => total + phrase.split(' ').length, 0);
  const score = (spec.priority || 0) + spec.groups.length * 35 + optional.length * 5 + specificity * 3 + (activated ? 4 : 0);
  const base = spec.risk === 'baixo' ? 0.58 : 0.64;
  const confidence = Math.min(0.98, base + Math.min(0.24, specificity * 0.035) + Math.min(0.08, optional.length * 0.02));
  if (!activated && normalized.split(' ').length > 18 && specificity < 2) return null;

  return { spec, score, confidence, evidence: unique(evidence), consumed };
}

function canonicalMessage(candidate: Candidate, tokens: MessageToken[], entities: SemanticEntity[]): string {
  const consumed = new Set(candidate.consumed);
  tokens.forEach((token, index) => {
    if (ACTIVATION_WORDS.has(token.normalized)) consumed.add(index);
  });

  let payload = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ index }) => !consumed.has(index))
    .filter(({ token }) => !ACTION_FILLERS.has(token.normalized))
    .map(({ token }) => token);

  while (payload.length && EDGE_FILLERS.has(payload[0].normalized)) payload.shift();
  while (payload.length && EDGE_FILLERS.has(payload[payload.length - 1].normalized)) payload.pop();

  let money = '';
  if (candidate.spec.moneyFirst) {
    const entity = entities.find((item) => item.type === 'money') || plainMoneyEntity(payload);
    if (entity) {
      money = entity.value;
      payload = payload.filter((token) => !rangesOverlap(token.start, token.end, entity.start, entity.end));
      while (payload.length && /^(r|rs|real|reais|valor)$/.test(payload[0].normalized)) payload.shift();
    }
  }

  const body = payload.map((token) => token.value).join(' ').replace(/\s+/g, ' ').trim();
  return [candidate.spec.prefix, money, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function missingFields(spec: IntentSpec, canonical: string, entities: SemanticEntity[]): string[] {
  if (!spec.requiredPayload) return [];
  if (spec.moneyFirst && !entities.some((entity) => entity.type === 'money') && !/\b\d+(?:[.,]\d{1,2})?\b/.test(canonical)) {
    return ['valor'];
  }
  const payload = normalizeText(canonical).replace(normalizeText(spec.prefix), '').trim();
  if (!payload) return [spec.requiredPayload];
  return [];
}

function isAmbiguous(first: Candidate, second: Candidate): boolean {
  if (first.spec.intent === second.spec.intent) return false;
  if (Math.abs(first.score - second.score) > 7) return false;
  if (first.spec.risk === 'baixo' && second.spec.risk === 'baixo') return false;
  return true;
}

function ambiguityQuestion(first: IntentSpec, second: IntentSpec): string {
  const pair = new Set([first.intent, second.intent]);
  if (pair.has('cancelar_pedido') && pair.has('cancelar_tarefa')) {
    return 'Voce quer cancelar o pedido ou a tarefa?';
  }
  return `Voce quer ${intentLabel(first)} ou ${intentLabel(second)}?`;
}

function intentLabel(spec: IntentSpec): string {
  return spec.prefix.toLowerCase();
}

function bestPhrase(tokens: MessageToken[], phrases: string[]): { phrase: string; indexes: number[] } | null {
  let best: { phrase: string; indexes: number[] } | null = null;
  for (const phrase of phrases) {
    const indexes = phraseIndexes(tokens, phrase);
    if (!indexes.length) continue;
    if (!best || indexes.length > best.indexes.length) best = { phrase, indexes };
  }
  return best;
}

function hasPhrase(tokens: MessageToken[], phrase: string): boolean {
  return phraseIndexes(tokens, phrase).length > 0;
}

function phraseIndexes(tokens: MessageToken[], phrase: string): number[] {
  const parts = normalizeText(phrase).split(' ').filter(Boolean);
  if (!parts.length || parts.length > tokens.length) return [];
  for (let start = 0; start <= tokens.length - parts.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < parts.length; offset += 1) {
      if (tokens[start + offset].normalized !== parts[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return parts.map((_part, offset) => start + offset);
  }
  return [];
}

function tokenize(message: string): MessageToken[] {
  const tokens: MessageToken[] = [];
  const matcher = /[\p{L}\p{N}]+(?:[.,:/_-][\p{L}\p{N}]+)*/gu;
  for (const match of message.matchAll(matcher)) {
    const value = match[0];
    const start = match.index || 0;
    tokens.push({ value, normalized: normalizeToken(value), start, end: start + value.length });
  }
  return tokens;
}

function extractEntities(
  message: string,
  tokens: MessageToken[],
  spec?: IntentSpec,
  consumed = new Set<number>(),
): SemanticEntity[] {
  const entities: SemanticEntity[] = [];
  collectMatches(entities, message, 'date', /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])(?:[/-]\d{2,4})?\b/g);
  collectMatches(entities, message, 'time', /\b(?:[01]?\d|2[0-3])\s*h(?:[0-5]\d)?\b/gi);
  collectMatches(entities, message, 'dosage', /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|kg|ml|l|ui|%)\b/gi);
  collectMatches(entities, message, 'quantity', /\b(?:quantidade|qtd)\s*[:=-]?\s*\d+\b/gi);
  collectMatches(entities, message, 'money', /(?:R\$\s*)?\d+(?:\.\d{3})*(?:,\d{1,2})\s*(?:reais?|real)?\b/gi);
  collectMatches(entities, message, 'money', /\b\d+(?:\.\d{1,2})\s*(?:reais?|real)\b/gi);

  if (spec?.moneyFirst && !entities.some((entity) => entity.type === 'money')) {
    const plain = tokens.find((token) => /^\d+$/.test(token.normalized)
      && !entities.some((entity) => ['date', 'time', 'dosage', 'quantity'].includes(entity.type)
        && rangesOverlap(token.start, token.end, entity.start, entity.end)));
    if (plain) entities.push(entityFromToken('money', plain));
  }

  for (const [index, token] of tokens.entries()) {
    if (consumed.has(index)) continue;
    if (CATEGORY_WORDS.has(token.normalized)) entities.push(entityFromToken('category', token));
  }

  const userPattern = /\b(responsavel|usuario|atendente|para|pra|pro|por)\s+([\p{L}][\p{L}.'-]{1,50})\b/giu;
  for (const match of message.matchAll(userPattern)) {
    const introducer = normalizeText(match[1]);
    const value = match[2];
    const normalizedValue = normalizeText(value);
    const explicitRole = ['responsavel', 'usuario', 'atendente'].includes(introducer);
    if (!explicitRole && (!/^\p{Lu}/u.test(value) || EDGE_FILLERS.has(normalizedValue))) continue;
    const full = match[0];
    const relative = full.lastIndexOf(value);
    const start = (match.index || 0) + Math.max(0, relative);
    entities.push({ type: 'user', value, normalized: normalizedValue, start, end: start + value.length });
  }

  return dedupeEntities(entities).sort((left, right) => left.start - right.start || left.end - right.end);
}

function collectMatches(
  entities: SemanticEntity[],
  message: string,
  type: SemanticEntityType,
  pattern: RegExp,
): void {
  for (const match of message.matchAll(pattern)) {
    const value = match[0].trim();
    const start = (match.index || 0) + Math.max(0, match[0].indexOf(value));
    entities.push({ type, value, normalized: normalizeText(value), start, end: start + value.length });
  }
}

function entityFromToken(type: SemanticEntityType, token: MessageToken): SemanticEntity {
  return { type, value: token.value, normalized: token.normalized, start: token.start, end: token.end };
}

function plainMoneyEntity(tokens: MessageToken[]): SemanticEntity | null {
  const token = tokens.find((item) => /^\d+(?:[.,]\d{1,2})?$/.test(item.normalized));
  return token ? entityFromToken('money', token) : null;
}

function containsMoneyLike(tokens: MessageToken[]): boolean {
  return tokens.some((token) => /^\d+(?:[.,]\d{1,2})?$/.test(token.normalized));
}

function dedupeEntities(entities: SemanticEntity[]): SemanticEntity[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.start}:${entity.end}:${entity.normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeToken(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%.,:/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function noneResult(): SemanticInterpretation {
  return {
    status: 'none',
    intent: '',
    module: '',
    risk: 'baixo',
    confidence: 0,
    evidence: [],
    entities: [],
    canonical_message: '',
    missing: [],
    clarification: '',
  };
}
