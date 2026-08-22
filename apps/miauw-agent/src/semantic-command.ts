export type SemanticChannel = 'internal' | 'whatsapp';
export type SemanticStatus = 'resolved' | 'ambiguous' | 'blocked' | 'none';

export type SemanticEntityType =
  | 'money'
  | 'date'
  | 'time'
  | 'quantity'
  | 'dosage'
  | 'category'
  | 'user'
  | 'customer_name'
  | 'customer_id'
  | 'phone'
  | 'document'
  | 'note';

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

type PhraseMatch = {
  phrase: string;
  indexes: number[];
  fuzzyCount: number;
};

const ACTIVATION_WORDS = new Set(['miauby', 'miauw', 'miau']);
const EDGE_FILLERS = new Set([
  'a', 'ai', 'como', 'da', 'de', 'do', 'e', 'eu', 'favor', 'me', 'no', 'o', 'por', 'porfavor',
  'quero', 'queria', 'preciso', 'pra', 'pode', 'poderia', 'por',
]);
const ACTION_FILLERS = new Set([
  'abre', 'abrir', 'adiciona', 'adicionar', 'coloca', 'colocar', 'cria', 'criar', 'faca', 'faco',
  'faz', 'fazer', 'lanca', 'lancar', 'registra', 'registrar',
]);
const NEGATION_WORDS = new Set(['jamais', 'nao', 'nem', 'nunca']);
const INFORMATIONAL_CUES = [
  'como faco', 'como fazer', 'como funciona', 'da para', 'devo', 'deveria', 'e possivel', 'o que acontece',
  'pode me explicar', 'poderia', 'posso', 'tem como',
];
const RELATIVE_DATE_WORDS = new Set(['anteontem', 'amanha', 'hoje', 'ontem']);
const QUANTITY_UNITS = new Set([
  'ampola', 'ampolas', 'caixa', 'caixas', 'comprimido', 'comprimidos', 'frasco', 'frascos',
  'item', 'itens', 'pacote', 'pacotes', 'unidade', 'unidades',
]);
const NUMBER_WORDS = new Map<string, string>([
  ['uma', '1'], ['um', '1'], ['duas', '2'], ['dois', '2'], ['tres', '3'], ['quatro', '4'],
  ['cinco', '5'], ['seis', '6'], ['sete', '7'], ['oito', '8'], ['nove', '9'], ['dez', '10'],
]);
const PHRASE_PARTS_CACHE = new Map<string, string[]>();
const MONEY_TOKEN_PATTERN = /^(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/;
const CATEGORY_WORDS = new Set([
  'alta', 'baixa', 'critica', 'critico', 'encomenda', 'falta', 'geral', 'grave', 'importante',
  'normal', 'popular', 'urgente',
]);
const FALTEIRO_CONTEXT_CUES = [
  'falteiro', 'falta', 'faltou', 'acabou', 'zerou', 'acabando', 'esta acabando', 'ta acabando',
  'esta faltando', 'ta faltando', 'ficou sem', 'estamos sem', 'sem estoque', 'nao tem mais',
  'nao temos', 'nao tem', 'terminou', 'precisa comprar', 'precisamos comprar', 'preciso comprar',
  'comprar', 'precisa repor', 'precisamos repor', 'preciso repor', 'repor', 'reposicao', 'no falteiro',
  'preciso urgente de', 'preciso de', 'precisamos de', 'esta em falta', 'ta em falta', 'em falta',
  'estao faltando', 'tao faltando', 'faltando', 'faltam', 'estoque baixo', 'tem pouco', 'so tem',
  'so temos', 'tem so', 'tem meia caixa', 'restou', 'ultima caixa', 'ultima unidade', 'vai acabar', 'nao pode faltar',
  'urgente',
];
const FALTEIRO_BLOCKING_CUES = FALTEIRO_CONTEXT_CUES.filter((cue) => cue !== 'urgente');
const INTENTS: IntentSpec[] = [
  {
    intent: 'criar_cashback_rapido', module: 'cashback', risk: 'medio', prefix: 'cashback', priority: 78,
    groups: [['cashback', 'cash back']],
    optional: ['faz', 'fazer', 'gera', 'gerar', 'cria', 'criar', 'imprime', 'imprimir'],
    blockers: [
      'relatorio', 'resumo', 'historico', 'saldo', 'consultar', 'consulta', 'mostrar', 'ver cashback',
      'quanto cashback', 'cashback usado', 'cashback gerado',
    ],
    moneyFirst: true,
    requiredPayload: 'valor',
  },
  {
    intent: 'registrar_falteiro', module: 'cotacao', risk: 'medio', prefix: 'falta', priority: 40,
    groups: [FALTEIRO_CONTEXT_CUES],
    optional: ['coloca', 'adiciona', 'joga'],
    blockers: ['qual faltou', 'o que faltou', 'relatorio', 'historico', 'tarefa', 'tarefas', 'pedido', 'pedidos'],
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
    intent: 'criar_encomenda_cotacao', module: 'cotacao', risk: 'alto', prefix: 'encomenda', priority: 85,
    groups: [[
      'encomenda', 'encomendar', 'encomendado', 'encomendou', 'pedido cliente', 'pedido do cliente',
      'pedido para', 'pedido para cliente', 'cliente pediu', 'cliente quer', 'pediu', 'pediram', 'quer',
      'separa', 'separar', 'separar para', 'deixar separado', 'deixar separado para',
      'guarda', 'guardar', 'guardar para', 'reserva', 'reservar',
    ]],
    optional: ['criar', 'registrar', 'adicionar', 'colocar', 'cotacao'],
    blockers: [
      'relatorio', 'resumo', 'historico', 'listar', 'lista', 'consultar', 'mostrar', 'ver encomendas',
      'o que tem', 'o que ha', 'o que existe', 'pedidos encomenda', 'encomendas antigas',
      'encomendas recentes', 'encomendas atuais', 'ver encomenda', 'encomenda recente',
      'encomenda antiga', 'encomenda atual', 'tarefa',
    ],
    requiredPayload: 'produto',
  },
  {
    intent: 'criar_cotacao_urgente', module: 'cotacao', risk: 'alto', prefix: 'cotacao urgente', priority: 55,
    groups: [['cotacao', 'cotar'], ['urgente']], optional: ['criar', 'colocar', 'adicionar'],
    blockers: FALTEIRO_BLOCKING_CUES, requiredPayload: 'produto',
  },
  {
    intent: 'criar_planilha_cotacao', module: 'cotacao', risk: 'alto', prefix: 'planilha cotacao', priority: 55,
    groups: [['planilha'], ['cotacao', 'cotar']], optional: ['criar', 'montar', 'gerar'],
    blockers: FALTEIRO_BLOCKING_CUES, requiredPayload: 'itens',
  },
  {
    intent: 'criar_cotacao_rapida', module: 'cotacao', risk: 'alto', prefix: 'cotacao rapida', priority: 42,
    groups: [['cotacao rapida', 'cotar rapido', 'cotar rapida']], optional: ['criar', 'fazer'],
    blockers: FALTEIRO_BLOCKING_CUES, requiredPayload: 'produto',
  },
  {
    intent: 'consultar_cotacao', module: 'cotacao', risk: 'baixo', prefix: 'cotacao', priority: 20,
    groups: [['cotacao', 'cotar', 'preco na cotacao']], optional: ['buscar', 'consultar', 'mostrar', 'ver'],
    blockers: ['urgente', 'planilha', 'encomenda', 'rapida', 'rapido', ...FALTEIRO_BLOCKING_CUES], requiredPayload: 'item',
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
  if (top.spec.risk !== 'baixo' && hasBlockingNegation(top, tokens)) {
    return {
      status: 'blocked',
      intent: top.spec.intent,
      module: top.spec.module,
      risk: top.spec.risk,
      confidence: round(top.confidence),
      evidence: top.evidence,
      entities: extractEntities(original, tokens, top.spec, top.consumed),
      canonical_message: '',
      missing: [],
      clarification: 'Entendi. Nao vou executar essa acao.',
    };
  }
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

  if (top.spec.risk !== 'baixo' && question) {
    return {
      status: 'ambiguous',
      intent: top.spec.intent,
      module: top.spec.module,
      risk: top.spec.risk,
      confidence: round(Math.max(0.5, top.confidence - 0.08)),
      evidence: top.evidence,
      entities: extractEntities(original, tokens, top.spec, top.consumed),
      canonical_message: '',
      missing: [],
      clarification: `Voce quer ${intentLabel(top.spec)}?`,
    };
  }

  if (top.spec.risk !== 'baixo' && hasInformationalCue(tokens)) {
    return {
      status: 'ambiguous',
      intent: top.spec.intent,
      module: top.spec.module,
      risk: top.spec.risk,
      confidence: round(Math.max(0.5, top.confidence - 0.08)),
      evidence: top.evidence,
      entities: extractEntities(original, tokens, top.spec, top.consumed),
      canonical_message: '',
      missing: [],
      clarification: `Voce quer ${intentLabel(top.spec)}?`,
    };
  }

  const entities = extractEntities(original, tokens, top.spec, top.consumed);
  const canonical = canonicalMessage(top, tokens, entities, original);
  const missing = missingFields(top.spec, canonical, entities);

  if (top.spec.intent === 'criar_cashback_rapido' && missing.length) {
    return {
      status: 'ambiguous',
      intent: top.spec.intent,
      module: top.spec.module,
      risk: top.spec.risk,
      confidence: round(top.confidence),
      evidence: top.evidence,
      entities,
      canonical_message: '',
      missing,
      clarification: 'Qual foi o valor da compra para gerar o Cashback?',
    };
  }

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
  let fuzzyCount = 0;
  for (const group of spec.groups) {
    const matched = bestPhrase(tokens, group, activated);
    if (!matched) return null;
    evidence.push(matched.phrase);
    fuzzyCount += matched.fuzzyCount;
    matched.indexes.forEach((index) => consumed.add(index));
  }

  if (spec.intent === 'criar_encomenda_cotacao') {
    const hasNamedCustomerRequest = /\b(?:cliente\s+)?[a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,4}\s+(?:pediu|quer)\s+(?!(?:abrir|acessar|consultar|entrar|para|perguntar|saber|ver)\b)[a-z0-9]/.test(normalized);
    const hasWeakCustomerCue = evidence.some((cue) => ['cliente pediu', 'cliente quer', 'pediu', 'quer'].includes(cue));
    if (hasWeakCustomerCue && (!hasNamedCustomerRequest
        || /\b(?:abrir|acessar|caixa|calendario|consultar|financeiro|gestao|perguntar|pix|preco|relatorio|saber|sangria|tarefa|valor)\b/.test(normalized))) {
      return null;
    }
    if (evidence.includes('pedido para')
        && /\bpedido\s+para\s+(?:abrir|acessar|cancelar|consultar|excluir|mostrar|ver)\b/.test(normalized)) {
      return null;
    }
    const hasExplicitOrderCue = /\b(?:encomenda|encomendar|encomendado|encomendou|pediram)\b/.test(normalized)
      || /\bpedido\s+(?:(?:do|para)\s+)?cliente\b/.test(normalized)
      || /\bpedido\s+para\b/.test(normalized)
      || hasNamedCustomerRequest;
    const hasReservationCue = /\b(?:separa|separar|reserva|reservar|guarda|guardar|deixar\s+separado)\b/.test(normalized);
    if (!hasExplicitOrderCue && hasReservationCue) {
      if (!/\bpara\b/.test(normalized)) return null;
      if (/\b(?:caixa|calendario|dinheiro|financeiro|gestao|pix|relatorio|sangria|tarefa)\b/.test(normalized)) return null;
    }
  }

  const optional = (spec.optional || [])
    .map((phrase) => bestPhrase(tokens, [phrase]))
    .filter((match): match is PhraseMatch => match !== null);
  for (const match of optional) {
    evidence.push(match.phrase);
    match.indexes.forEach((index) => consumed.add(index));
  }

  if (spec.intent === 'registrar_falteiro' && question && !activated) return null;
  if (spec.intent === 'registrar_falteiro'
      && evidence.every((cue) => normalizeText(cue) === 'urgente')
      && (!activated || /\b(?:cashback|cotacao|encomenda|financeiro|gestao|pedido|sangria|tarefa)\b/.test(normalized))) {
    return null;
  }
  if (spec.intent === 'criar_conta_gestao' && !containsMoneyLike(tokens) && !hasPhrase(tokens, 'conta')) return null;

  const specificity = evidence.reduce((total, phrase) => total + phrase.split(' ').length, 0);
  const score = (spec.priority || 0) + spec.groups.length * 35 + optional.length * 5 + specificity * 3
    + (activated ? 4 : 0) - fuzzyCount * 4;
  const base = spec.risk === 'baixo' ? 0.58 : 0.64;
  const confidence = Math.max(0.5, Math.min(0.98,
    base + Math.min(0.24, specificity * 0.035) + Math.min(0.08, optional.length * 0.02) - fuzzyCount * 0.07,
  ));
  if (!activated && normalized.split(' ').length > 18 && specificity < 2) return null;

  return { spec, score, confidence, evidence: unique(evidence), consumed };
}

function canonicalMessage(candidate: Candidate, tokens: MessageToken[], entities: SemanticEntity[], original: string): string {
  if (candidate.spec.intent === 'criar_cashback_rapido') {
    const money = entities.find((entity) => entity.type === 'money');
    return money ? `cashback ${cashbackAmountValue(money.value)}` : 'cashback';
  }

  if (candidate.spec.intent === 'registrar_falteiro') {
    const preserved = original
      .replace(/\b(?:miauby|miauw)\b/giu, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
    return /^falta\b/iu.test(preserved) ? preserved : `falta ${preserved}`;
  }

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
  if (spec.intent === 'criar_cashback_rapido' && !entities.some((entity) => entity.type === 'money')) {
    return ['valor'];
  }
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

function bestPhrase(tokens: MessageToken[], phrases: string[], allowFuzzy = false): PhraseMatch | null {
  let best: PhraseMatch | null = null;
  for (const phrase of phrases) {
    const match = phraseMatch(tokens, phrase, allowFuzzy);
    if (!match) continue;
    if (!best || match.indexes.length > best.indexes.length
      || (match.indexes.length === best.indexes.length && match.fuzzyCount < best.fuzzyCount)) {
      best = { phrase, ...match };
    }
  }
  return best;
}

function hasPhrase(tokens: MessageToken[], phrase: string): boolean {
  return phraseMatch(tokens, phrase, false) !== null;
}

function phraseMatch(
  tokens: MessageToken[],
  phrase: string,
  allowFuzzy: boolean,
): { indexes: number[]; fuzzyCount: number } | null {
  const parts = phraseParts(phrase);
  if (!parts.length || parts.length > tokens.length) return null;
  for (let start = 0; start <= tokens.length - parts.length; start += 1) {
    let fuzzyCount = 0;
    for (let offset = 0; offset < parts.length; offset += 1) {
      const actual = tokens[start + offset].normalized;
      const expected = parts[offset];
      if (actual === expected) continue;
      if (!allowFuzzy || !isConservativeTypo(actual, expected)) {
        fuzzyCount = -1;
        break;
      }
      fuzzyCount += 1;
    }
    if (fuzzyCount >= 0) {
      return { indexes: parts.map((_part, offset) => start + offset), fuzzyCount };
    }
  }
  return null;
}

function phraseParts(phrase: string): string[] {
  const cached = PHRASE_PARTS_CACHE.get(phrase);
  if (cached) return cached;
  const parts = normalizeText(phrase).split(' ').filter(Boolean);
  PHRASE_PARTS_CACHE.set(phrase, parts);
  return parts;
}

function isConservativeTypo(actual: string, expected: string): boolean {
  if (actual.length < 5 || expected.length < 6 || Math.abs(actual.length - expected.length) > 1) return false;
  if (actual.length === expected.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < actual.length; index += 1) {
      if (actual[index] !== expected[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true;
    return mismatches.length === 2
      && mismatches[1] === mismatches[0] + 1
      && actual[mismatches[0]] === expected[mismatches[1]]
      && actual[mismatches[1]] === expected[mismatches[0]];
  }

  const [shorter, longer] = actual.length < expected.length ? [actual, expected] : [expected, actual];
  if (`${shorter}s` === longer) return false;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function hasUnconsumedNegation(tokens: MessageToken[], consumed: Set<number>): boolean {
  return tokens.some((token, index) => NEGATION_WORDS.has(token.normalized) && !consumed.has(index));
}

function hasBlockingNegation(candidate: Candidate, tokens: MessageToken[]): boolean {
  if (!hasUnconsumedNegation(tokens, candidate.consumed)) return false;
  if (candidate.spec.intent !== 'registrar_falteiro') return true;

  let text = tokens.map((token) => token.normalized).join(' ');
  const contextualNegations = [
    /\bnao (?:e|eh) urgente\b/g,
    /\bnao pegar validade curta\b/g,
    /\bnao comprar desse laboratorio\b/g,
    /\bnao substituir\b/g,
    /\bnao precisa muitas?\b/g,
    /\bnao pode faltar\b/g,
    /\bnao pegar [a-z0-9-]+\b/g,
  ];
  for (const pattern of contextualNegations) text = text.replace(pattern, ' ');
  return /\b(?:jamais|nao|nem|nunca)\b/.test(text);
}

function hasInformationalCue(tokens: MessageToken[]): boolean {
  return INFORMATIONAL_CUES.some((phrase) => hasPhrase(tokens, phrase));
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
  collectMatches(entities, message, 'quantity', /\b\d+\s*(?:ampolas?|caixas?|comprimidos?|frascos?|itens?|pacotes?|unidades?)\b/gi);
  collectMatches(entities, message, 'money', /(?:R\$\s*\d+(?:\.\d{3})*(?:,\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s*(?:reais?|real))\b/gi);

  if (spec?.intent === 'criar_cashback_rapido') {
    const specific = extractCashbackEntities(message);
    entities.push(...specific);
    const protectedRanges = specific.filter((entity) => entity.type === 'phone' || entity.type === 'document');
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      if (entity.type !== 'money') continue;
      if (protectedRanges.some((protectedEntity) => rangesOverlap(
        entity.start,
        entity.end,
        protectedEntity.start,
        protectedEntity.end,
      ))) entities.splice(index, 1);
    }
  }

  for (const [index, token] of tokens.entries()) {
    if (RELATIVE_DATE_WORDS.has(token.normalized)) entities.push(entityFromToken('date', token));
    const numericWord = NUMBER_WORDS.get(token.normalized);
    const next = tokens[index + 1];
    if (numericWord && next && QUANTITY_UNITS.has(next.normalized)) {
      entities.push({
        type: 'quantity',
        value: message.slice(token.start, next.end),
        normalized: numericWord,
        start: token.start,
        end: next.end,
      });
    }
  }

  if (spec?.moneyFirst && !entities.some((entity) => entity.type === 'money')) {
    const plain = spec.intent === 'criar_cashback_rapido'
      ? cashbackMoneyEntity(tokens, entities)
      : plainMoneyEntity(tokens, entities);
    if (plain) entities.push(plain);
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

function plainMoneyEntity(tokens: MessageToken[], entities: SemanticEntity[] = []): SemanticEntity | null {
  const token = tokens.find((item) => MONEY_TOKEN_PATTERN.test(item.normalized)
    && !entities.some((entity) => ['date', 'time', 'dosage', 'quantity', 'phone', 'document'].includes(entity.type)
      && rangesOverlap(item.start, item.end, entity.start, entity.end)));
  return token ? entityFromToken('money', token) : null;
}

function cashbackMoneyEntity(tokens: MessageToken[], entities: SemanticEntity[]): SemanticEntity | null {
  const cashbackIndexes = tokens
    .map((token, index) => (token.normalized === 'cashback' ? index : -1))
    .filter((index) => index >= 0);
  const candidates = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => MONEY_TOKEN_PATTERN.test(token.normalized))
    .filter(({ token }) => token.normalized.replace(/\D/g, '').length <= 7)
    .filter(({ token }) => !entities.some((entity) => ['date', 'time', 'dosage', 'quantity', 'phone', 'document'].includes(entity.type)
      && rangesOverlap(token.start, token.end, entity.start, entity.end)))
    .map(({ token, index }) => {
      const previous = tokens[index - 1]?.normalized || '';
      const distance = cashbackIndexes.length
        ? Math.min(...cashbackIndexes.map((cashbackIndex) => Math.abs(cashbackIndex - index)))
        : 99;
      const labelBonus = ['valor', 'de', 'r', 'rs'].includes(previous) ? 6 : 0;
      return { token, score: labelBonus + Math.max(0, 5 - distance) };
    })
    .sort((left, right) => right.score - left.score || left.token.start - right.token.start);
  return candidates[0] ? entityFromToken('money', candidates[0].token) : null;
}

function extractCashbackEntities(message: string): SemanticEntity[] {
  const entities: SemanticEntity[] = [];
  collectCapturedEntity(
    entities,
    message,
    'customer_id',
    /\b(?:codigo\s+do\s+cliente|código\s+do\s+cliente|id\s+do\s+cliente|id|cliente)\s*[:=#-]?\s*(\d{1,9})\b/giu,
  );
  collectCapturedEntity(
    entities,
    message,
    'document',
    /\bcpf\s*[:=-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/giu,
  );
  collectCapturedEntity(
    entities,
    message,
    'phone',
    /\b(?:telefone|fone|whatsapp|zap)\s*[:=-]?\s*(\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4})\b/giu,
  );
  collectCapturedEntity(
    entities,
    message,
    'customer_name',
    /\b(?:cliente|nome|para)\s*[:=-]?\s*([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}?)(?=\s+(?:telefone|fone|whatsapp|zap|cpf|obs|observacao|observação|valor)\b|$)/giu,
  );
  collectCapturedEntity(
    entities,
    message,
    'note',
    /\b(?:obs|observacao|observação)\s*[:=-]?\s*(.+)$/giu,
  );
  return entities;
}

function collectCapturedEntity(
  entities: SemanticEntity[],
  message: string,
  type: SemanticEntityType,
  pattern: RegExp,
): void {
  for (const match of message.matchAll(pattern)) {
    const value = String(match[1] || '').trim();
    if (!value) continue;
    const relative = match[0].lastIndexOf(value);
    const start = (match.index || 0) + Math.max(0, relative);
    entities.push({ type, value, normalized: normalizeText(value), start, end: start + value.length });
  }
}

function cashbackAmountValue(value: string): string {
  return String(value || '')
    .replace(/R\$/gi, '')
    .replace(/\b(?:reais?|real)\b/gi, '')
    .trim();
}

function containsMoneyLike(tokens: MessageToken[]): boolean {
  return tokens.some((token) => MONEY_TOKEN_PATTERN.test(token.normalized));
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
