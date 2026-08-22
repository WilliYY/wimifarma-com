const ACTIVATION_PATTERN = /^(?:miauby|miauw)\b[\s,:;\-\u2013\u2014]*/iu;
const DOSAGE_ONLY_PATTERN = /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)$/iu;
const NON_FALTEIRO_COMPLEMENT_PATTERN = /^(?:o\s+que\s+)?(?:chegar|chegando|chegada|chegadas)\b/iu;
const QUESTION_PATTERN = /\?\s*$/u;
const BLOCKED_PRODUCT_PATTERN = /^(?:a\s+|o\s+)?(?:internet|energia|tempo|sistema|acesso|sinal|resposta|conex[aã]o|dados)$/iu;
const CATEGORY_HINT_PATTERN = /^(?:prioridade\s+)?(?:urgente|urg[êe]ncia|popular|falta)(?:\s+(?:urgente|urg[êe]ncia|popular|falta))*$/iu;
const CATEGORY_ALIASES = new Map([
  ['acabando', 'falta'],
  ['acabou', 'falta'],
  ['acabaram', 'falta'],
  ['cota', 'cotar'],
  ['cotacao', 'cotar'],
  ['cotacoes', 'cotar'],
  ['faltando', 'falta'],
  ['faltam', 'falta'],
  ['faltou', 'falta'],
  ['urgencia', 'urgente'],
  ['urgencias', 'urgente'],
  ['urgentes', 'urgente'],
  ['prioridade', 'urgente'],
  ['prioritaria', 'urgente'],
  ['prioritarias', 'urgente'],
  ['prioritario', 'urgente'],
  ['prioritarios', 'urgente'],
  ['populares', 'popular'],
  ['faltas', 'falta'],
]);
const CATEGORY_PHRASE_ALIASES = [
  { concept: 'urgente', phrases: ['com urgencia'] },
  { concept: 'popular', phrases: ['linha popular', 'farmacia popular'] },
  { concept: 'cotar', phrases: ['precisa cotar', 'precisamos cotar', 'preciso cotar', 'para cotar', 'pra cotar'] },
  { concept: 'falta', phrases: ['sem estoque'] },
].flatMap((rule) => rule.phrases.map((phrase) => ({
  concept: rule.concept,
  parts: normalized(phrase).split(' ').filter(Boolean),
}))).sort((left, right) => right.parts.length - left.parts.length);
const CATEGORY_HINT_TOKENS = new Set(['urgente', 'popular', 'falta', 'cotar']);
const CATEGORY_CONTROL_TOKENS = new Set([
  'adiciona', 'adicione', 'adicionar', 'categoria', 'coloca', 'coloque', 'colocar', 'como',
  'compre', 'comprar', 'pega', 'pegar', 'pegue', 'porque', 'pois', 'repor',
]);
const INTENT_FILLER_TOKENS = new Set(['por', 'favor']);
const PRODUCT_EDGE_TOKENS = new Set(['e', 'mas', 'porque', 'pois', 'para']);
const LIST_CONNECTOR_PATTERN = /^(?:e\s+tamb[eé]m|tamb[eé]m|al[eé]m\s+disso|mais|outro(?:s|a|as)?)\b[\s,:;\-]*/iu;
const COLLECTIVE_PATTERN = /(?:^|[,;]\s*|\s+)(todos?|todas?|tudo(?:\s+isso)?|os\s+dois|as\s+duas|os\s+tr[eê]s|esses|essas)\s+(?:s[aã]o\s+)?(.+?)\s*$/iu;
const COMPOUND_PRODUCT_PATTERN = /\b(?:kit|conjunto|combo)\b|\bshampoo\s+e\s+condicionador\b/iu;
const STRONG_PRODUCT_START_PATTERN = /^(?:(?:kit|shampoo|condicionador|creme|detergente|limpador|fralda|protetor|sabonete|bobina|papel|caneta|sacola|[aá]lcool|vassoura|pilha|mamadeira|chocolate|[aá]gua|[oó]leo|leite|sal)\b|[\p{L}'’-]+\s+\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)\b)/iu;
const NON_PRODUCT_CONJUNCTION_START_PATTERN = /^(?:tamb[eé]m|porque|pois|para|pra|n[aã]o|mas|com|sem|que|quando|disse|falou|avisou|vem|volta|s[oó]|urgente|popular|falta|acabou)\b/iu;
const FREE_CONTEXT_PATTERNS = [
  /\b(?:para|pra)\s+(?:(?:a|o)\s+)?[\p{L}'’-]+\s+que\s+(?:vem|volta|pediu|procurou)\b[\s\S]*$/iu,
  /\b(?:para|pra)\s+(?:usar|utilizar|limpar|fazer\s+a\s+limpeza|a\s+limpeza|uso\s+na|repor|reposi[cç][aã]o)\b[\s\S]*$/iu,
  /\bque\s+(?:(?:a|o|uma|um)\s+)?(?:cliente\s+)?(?:dona\s+)?[\p{L}][\p{L}\s'’-]{0,60}\s+(?:pediu|procurou|veio\s+procurar)\b[\s\S]*$/iu,
  /\b(?:(?:a|o)\s+)?(?:cliente|dona)\s+[\p{L}][\p{L}\s'’-]{0,60}\s+(?:pediu|procurou|volta|veio\s+procurar)\b[\s\S]*$/iu,
  /\bcliente\s+(?:volta|vem)\b[\s\S]*$/iu,
  /\b(?:comprar|pegar|repor)\s+(?:(?:uns?|umas?)\s+)?(?:\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|bastante)\b[\s\S]*$/iu,
  /\b(?:s[oó]\s+se|n[aã]o\s+esquecer|ver\s+pre[cç]o)\b[\s\S]*$/iu,
  /\bporque\b[\s\S]*$/iu,
];
export const MAX_FALTEIRO_BATCH_ITEMS = 50;
const BATCH_CONTROL_ONLY_PATTERN = /^(?:(?:por\s+favor\s+)?(?:miauby|miauw)\s+)?(?:falta|faltou|faltando|falteiro|acabou|comprar|repor|reposicao|coloca(?:r)?\s+no\s+falteiro|adiciona(?:r)?\s+no\s+falteiro|joga(?:r)?\s+no\s+falteiro)$/iu;
const NUMBER_TOKEN_SOURCE = '(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';
const ORDER_UNIT_SOURCE = '(?:caixas?|pacotes?|frascos?|ampolas?|unidades?|itens?)';
const ANYWHERE_INTENTS = [
  { trigger: 'sem_estoque', phrases: ['nao tem mais', 'nao temos', 'nao tem', 'sem estoque', 'estamos sem', 'ficou sem', 'estou sem', 'sem'] },
  { trigger: 'faltando', phrases: ['esta faltando', 'ta faltando', 'estao faltando', 'tao faltando', 'faltando'] },
  { trigger: 'acabando', phrases: ['estoque baixo', 'esta acabando', 'ta acabando', 'tem pouco', 'vai acabar', 'acabando'] },
  { trigger: 'estoque_baixo', phrases: ['so temos', 'so tem', 'tem so', 'tem meia caixa', 'restou', 'ultima caixa', 'ultima unidade'] },
  { trigger: 'comprar', phrases: ['estamos precisando de', 'esta precisando de', 'precisamos comprar', 'precisa comprar', 'preciso comprar', 'comprar'] },
  { trigger: 'repor', phrases: ['precisamos repor', 'precisa repor', 'preciso repor', 'reposicao', 'repor'] },
  { trigger: 'falteiro', phrases: ['no falteiro', 'falteiro'] },
  { trigger: 'falta', phrases: ['faltou', 'falta', 'faltam'] },
  { trigger: 'acabou', phrases: ['nao pode faltar', 'zerou', 'acabaram', 'acabou'] },
  { trigger: 'terminou', phrases: ['terminou'] },
];

function cleanCommandText(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value) {
  return cleanCommandText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalCategoryTokens(value) {
  return normalized(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => token !== 'prioridade')
    .map((token) => CATEGORY_ALIASES.get(token) || token)
    .sort();
}

function textTokens(value) {
  const tokens = [];
  const matcher = /[\p{L}\p{N}]+(?:[.,/%-][\p{L}\p{N}]+)*/gu;
  for (const match of cleanCommandText(value).matchAll(matcher)) {
    const token = match[0];
    const key = normalized(token);
    if (!key) continue;
    tokens.push({
      value: token,
      key,
      canonical: CATEGORY_ALIASES.get(key) || key,
      start: match.index || 0,
      end: (match.index || 0) + token.length,
    });
  }
  return tokens;
}

function contextLabel(value) {
  const clean = cleanCommandText(value);
  if (!clean) return '';
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
}

function contextRemovalVariants(value, extra = []) {
  return [value, ...extra]
    .map((item) => textTokens(item).map((token) => token.key))
    .filter((parts) => parts.length > 0);
}

function collectFalteiroContexts(value) {
  const text = cleanCommandText(value);
  const contexts = [];

  const addMatches = (pattern, priority, build) => {
    for (const match of text.matchAll(pattern)) {
      const built = build(match);
      if (!built?.label) continue;
      const start = match.index || 0;
      const end = start + match[0].length;
      if (contexts.some((item) => start < item.end && item.start < end)) continue;
      contexts.push({
        label: contextLabel(built.label),
        priority,
        start,
        end,
        removals: contextRemovalVariants(match[0], built.extraRemovals || []),
      });
    }
  };

  addMatches(/\b(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+clientes?\s+(?:perguntaram|procuraram|pediram)\s+(?:por|pelo|pela)\b/giu, 10, (match) => ({
    label: 'Muita procura',
    extraRemovals: [match[0].replace(/\s+(?:por|pelo|pela)\s*$/iu, '')],
  }));

  addMatches(/\bnao\s+(?:e|eh)\s+urgente\b/giu, 25, () => ({ label: 'Nao urgente' }));
  addMatches(/\bnao\s+pegar\s+validade\s+curta\b/giu, 70, () => ({ label: 'Nao pegar validade curta' }));
  addMatches(/\bnao\s+comprar\s+desse\s+laboratorio\b/giu, 70, () => ({ label: 'Nao comprar desse laboratorio' }));
  addMatches(/\bnao\s+(?:substituir|precisa\s+muitas?)\b/giu, 70, (match) => ({ label: match[0] }));

  addMatches(new RegExp(`\\b(comprar|compre|pegar|pega|pegue|repor)\\s+((?:(?:uns?|umas?)\\s+)?${NUMBER_TOKEN_SOURCE})(?:\\s+(${ORDER_UNIT_SOURCE}))?\\b`, 'giu'), 40, (match) => {
    const action = /^(?:pegar|pega|pegue)$/iu.test(match[1]) ? 'Pegar' : (/^repor$/iu.test(match[1]) ? 'Repor' : 'Comprar');
    const amount = cleanCommandText(match[2]);
    const unit = normalized(match[3]);
    return {
      label: [action, amount, unit].filter(Boolean).join(' '),
      extraRemovals: [[amount, unit].filter(Boolean).join(' ')],
    };
  });
  addMatches(new RegExp(`\\b(?:precisa|precisamos|preciso)\\s+de\\s+(${NUMBER_TOKEN_SOURCE})(?:\\s+(${ORDER_UNIT_SOURCE}))?\\b`, 'giu'), 40, (match) => {
    const amount = cleanCommandText(match[1]);
    const unit = normalized(match[2]);
    return {
      label: ['Comprar', amount, unit].filter(Boolean).join(' '),
      extraRemovals: [[amount, unit].filter(Boolean).join(' ')],
    };
  });

  addMatches(/\b(?:se\s+estiver\s+)?ate\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais?|rs)?\b/giu, 60, (match) => ({
    label: `Ate R$ ${match[1]}`,
  }));
  addMatches(/\bno\s+maximo\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais?|rs)?\b/giu, 60, (match) => ({
    label: `No maximo R$ ${match[1]}`,
  }));
  addMatches(/\babaixo\s+de\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais?|rs)?\b/giu, 60, (match) => ({
    label: `Abaixo de R$ ${match[1]}`,
  }));

  addMatches(new RegExp(`\\b(?:so\\s+temos|so\\s+tem|tem\\s+so|restou)\\s+(${NUMBER_TOKEN_SOURCE})(?:\\s+(${ORDER_UNIT_SOURCE}))?\\b`, 'giu'), 20, (match) => {
    const stockText = normalized(match[0]);
    const prefix = stockText.startsWith('so temos')
      ? 'So temos'
      : (stockText.startsWith('so tem') ? 'So tem' : (stockText.startsWith('tem so') ? 'Tem so' : 'Restou'));
    return {
      label: [prefix, cleanCommandText(match[1]), normalized(match[2])].filter(Boolean).join(' '),
      extraRemovals: [[match[1], match[2]].filter(Boolean).join(' ')],
    };
  });
  addMatches(/\btem\s+meia\s+caixa\b/giu, 20, (match) => ({ label: match[0] }));
  addMatches(/\b(?:ultima\s+(?:caixa|unidade)|estoque\s+baixo|tem\s+pouco|vai\s+acabar|esta\s+acabando|ta\s+acabando)\b/giu, 20, (match) => ({ label: match[0] }));
  addMatches(/\b(?:esta\s+faltando|t(?:a|\u00e1)\s+faltando|estao\s+faltando|tao\s+faltando|esta\s+em\s+falta|estamos\s+sem|ficou\s+sem|estou\s+sem|nao\s+tem\s+mais|nao\s+temos|sem\s+estoque|terminou|zerou|acabaram|acabou)\b/giu, 20, (match) => ({ label: normalized(match[0]) }));

  addMatches(/\b(?:muita\s+gente\s+(?:esta\s+)?procurando|muita\s+gente\s+perguntou|muita\s+procura|cliente\s+esta\s+procurando|ja\s+pediram\s+varias\s+vezes|vende\s+muito|sai\s+muito|produto\s+de\s+giro|vende\s+pouco|nao\s+pode\s+faltar)\b/giu, 30, (match) => ({ label: match[0] }));

  addMatches(/\b(?:o\s+quanto\s+antes|nao\s+pode\s+esperar|sem\s+pressa|pode\s+esperar|proxima\s+cotacao|preciso\s+(?:hoje|amanha))\b/giu, 50, (match) => ({ label: match[0] }));
  addMatches(/\b(?:comprar|compre|pegar|pega|pegue|repor)\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/giu, 50, (match) => ({
    label: match[0],
    extraRemovals: [match[0].replace(/^(?:comprar|compre|pegar|pega|pegue|repor)\s+/iu, '')],
  }));
  addMatches(/\b(?:para|pra)\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/giu, 50, (match) => ({ label: match[0] }));
  addMatches(/\b(?:hoje|amanha)\b/giu, 50, (match) => ({ label: match[0] }));

  addMatches(/\b(?:se\s+estiver\s+barato|pegar\s+o\s+mais\s+barato|so\s+se\s+tiver\s+promocao|comprar\s+se\s+tiver\s+promocao)\b/giu, 65, (match) => ({
    label: match[0],
    extraRemovals: normalized(match[0]).startsWith('comprar ') ? [match[0].replace(/^comprar\s+/iu, '')] : [],
  }));
  addMatches(/\b(?:qualquer\s+laboratorio|pode\s+ser\s+generico|validade\s+longa|pegar\s+bastante|cliente\s+reclama\s+dessa\s+marca)\b/giu, 70, (match) => ({ label: match[0] }));
  addMatches(/\bcomprar\s+bastante\b/giu, 70, (match) => ({ label: match[0] }));
  addMatches(/\bse\s+tiver\s+([\p{L}\p{N}-]+)\s+melhor\b/giu, 70, (match) => ({ label: `Preferir ${match[1]}` }));
  addMatches(/\bpreferir\s+([\p{L}\p{N}-]+)\b/giu, 70, (match) => ({ label: match[0] }));
  addMatches(/\bsomente\s+([\p{L}\p{N}-]+)\b/giu, 70, (match) => ({ label: match[0] }));
  addMatches(/\bnao\s+pegar\s+([\p{L}\p{N}-]+)\b/giu, 70, (match) => ({ label: match[0] }));

  return contexts
    .sort((left, right) => left.priority - right.priority || left.start - right.start)
    .filter((item, index, items) => items.findIndex((candidate) => normalized(candidate.label) === normalized(item.label)) === index);
}

function removeContextSegments(value, contexts) {
  const tokens = textTokens(value);
  const removed = new Set();

  for (const context of contexts) {
    for (const sequence of context.removals) {
      let matched = false;
      for (let start = 0; start <= tokens.length - sequence.length; start += 1) {
        if (sequence.every((part, offset) => !removed.has(start + offset) && tokens[start + offset]?.key === part)) {
          sequence.forEach((_part, offset) => removed.add(start + offset));
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return tokens.filter((_token, index) => !removed.has(index)).map((token) => token.value).join(' ');
}

function combineFalteiroCategory(officialCategory, contexts) {
  const labels = [officialCategory, ...contexts.map((item) => item.label)].filter(Boolean);
  const unique = labels.filter((label, index) => labels.findIndex((item) => normalized(item) === normalized(label)) === index);
  return cleanCommandText(unique.join(' | ')).slice(0, 700);
}

function hasBlockingFalteiroNegation(value) {
  let text = normalized(value);
  const safeContexts = [
    /\bnao (?:e|eh) urgente\b/gu,
    /\bnao pegar validade curta\b/gu,
    /\bnao comprar desse laboratorio\b/gu,
    /\bnao substituir\b/gu,
    /\bnao precisa muitas?\b/gu,
    /\bnao pode faltar\b/gu,
    /\bnao pegar [a-z0-9-]+\b/gu,
  ];
  for (const pattern of safeContexts) text = text.replace(pattern, ' ');
  return /\bnao\s+(?:coloca|coloque|adiciona|adicione|joga|jogue|registra|registrar|acabou|zerou|falta|faltou|esta\s+acabando|ta\s+acabando|comprar|repor)\b/u.test(text);
}

function isSpecificCustomerOrder(value) {
  const text = normalized(value);
  if (/\b(?:encomenda|encomendar|reservar|reserva)\b/.test(text) && /\b(?:para|pra)\s+[a-z]/.test(text)) return true;
  return /\b(?!cliente\b|clientes\b)[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,3}\s+pediu\b/.test(text);
}

export function sanitizeFalteiroCategories(values) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const label = cleanCommandText(value);
    const key = normalized(label);
    const numericLike = /^(?:r\$\s*)?[\d.,]+(?:\s*%)?$/iu.test(label);
    if (!label || label.length > 80 || numericLike || !/[a-záàâãéêíóôõúç]/iu.test(label) || unique.has(key)) continue;
    unique.set(key, label);
  }
  return [...unique.values()];
}

function categoryCatalog(values) {
  const unique = new Map();
  for (const label of sanitizeFalteiroCategories(values)) {
    const key = normalized(label);
    unique.set(key, {
      label,
      key,
      tokens: canonicalCategoryTokens(label),
    });
  }
  return [...unique.values()].sort((left, right) => (
    right.tokens.length - left.tokens.length || right.key.length - left.key.length
  ));
}

function resolveCategory(value, catalog) {
  const key = normalized(value);
  if (!key) return '';
  const exact = catalog.find((item) => item.key === key);
  if (exact) return exact.label;

  const tokens = canonicalCategoryTokens(value);
  if (!tokens.length) return '';
  const tokenKey = tokens.join('|');
  return catalog.find((item) => item.tokens.join('|') === tokenKey)?.label || '';
}

function categoryHintOnly(value) {
  return CATEGORY_HINT_PATTERN.test(cleanCommandText(value).replace(/[.,;:!?]+$/g, '').trim());
}

function findCategoryTokenIndexes(tokens, categoryTokens, supplementalTokens = []) {
  const available = categoryOccurrences(tokens, supplementalTokens);
  const usedIndexes = new Set();
  const usedOccurrences = new Set();
  const indexes = [];
  let usedSupplemental = false;

  for (const required of categoryTokens) {
    const found = available.findIndex((occurrence, index) => (
      occurrence.concept === required
      && !usedOccurrences.has(index)
      && occurrence.indexes.every((tokenIndex) => tokenIndex < 0 || !usedIndexes.has(tokenIndex))
    ));
    if (found < 0) return null;
    usedOccurrences.add(found);
    for (const tokenIndex of available[found].indexes) {
      if (tokenIndex >= 0) {
        usedIndexes.add(tokenIndex);
        indexes.push(tokenIndex);
      } else {
        usedSupplemental = true;
      }
    }
  }

  return { indexes, usedSupplemental };
}

function categoryOccurrences(tokens, supplementalTokens = []) {
  const occurrences = [];

  for (let start = 0; start < tokens.length; start += 1) {
    for (const rule of CATEGORY_PHRASE_ALIASES) {
      if (!rule.parts.every((part, offset) => tokens[start + offset]?.key === part)) continue;
      occurrences.push({
        concept: rule.concept,
        indexes: rule.parts.map((_part, offset) => start + offset),
      });
    }
    occurrences.push({ concept: tokens[start].canonical, indexes: [start] });
  }

  for (const concept of supplementalTokens) {
    occurrences.push({ concept, indexes: [-1] });
  }

  return occurrences.sort((left, right) => right.indexes.length - left.indexes.length);
}

function categoryMatches(tokens, catalog, supplementalTokens = []) {
  const normalizedText = tokens.map((token) => token.key).join(' ');
  return catalog
    .map((item) => {
      const found = findCategoryTokenIndexes(tokens, item.tokens, supplementalTokens);
      if (!found || (found.usedSupplemental && item.tokens.length < 2)) return null;
      const exact = normalizedText === item.key
        || normalizedText.startsWith(`${item.key} `)
        || normalizedText.endsWith(` ${item.key}`)
        || normalizedText.includes(` ${item.key} `);
      return { ...item, ...found, exact };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.tokens.length - left.tokens.length
      || Number(right.exact) - Number(left.exact)
      || right.key.length - left.key.length
    ));
}

function categoryHintFromTokens(tokens, catalog) {
  const knownTokens = new Set([
    ...CATEGORY_HINT_TOKENS,
    ...catalog.flatMap((item) => item.tokens),
  ]);
  return tokens
    .filter((token) => knownTokens.has(token.canonical))
    .map((token) => token.value);
}

function extractCategory(productText, catalog, initialHint = '', overlapHint = '') {
  const tokens = textTokens(productText);
  const explicitHint = cleanCommandText(initialHint);
  const supplementalTokens = canonicalCategoryTokens(explicitHint || overlapHint);
  const matches = categoryMatches(tokens, catalog, supplementalTokens);
  const best = matches[0] || null;
  const sameSpecificity = best
    ? matches.filter((item) => item.tokens.join('|') === best.tokens.join('|'))
    : [];
  const exact = sameSpecificity.find((item) => item.exact);
  const ambiguous = sameSpecificity.length > 1 && !exact;
  const selected = ambiguous ? null : (exact || best);
  const selectedIndexes = new Set(selected?.indexes || []);
  if (selected) {
    const selectedConcepts = new Set(selected.tokens);
    for (const occurrence of categoryOccurrences(tokens)) {
      if (!selectedConcepts.has(occurrence.concept)) continue;
      occurrence.indexes.forEach((index) => {
        if (index >= 0) selectedIndexes.add(index);
      });
    }
  }
  const contextTokens = categoryHintFromTokens(tokens, catalog);
  const unresolvedContext = tokens.filter((token, index) => (
    categoryHintFromTokens([token], catalog).length > 0 && !selectedIndexes.has(index)
  ));
  const explicitResolved = explicitHint ? resolveCategory(explicitHint, catalog) : '';
  const explicitUnresolved = explicitHint !== '' && explicitResolved === '' && !selected?.usedSupplemental;
  const hasCategoryProblem = ambiguous || explicitUnresolved || unresolvedContext.length > 0;
  const categoryHint = cleanCommandText([
    explicitHint,
    ...contextTokens,
  ].filter(Boolean).join(' '));

  const product = tokens
    .filter((_token, index) => !selectedIndexes.has(index))
    .filter((token) => !CATEGORY_CONTROL_TOKENS.has(token.canonical))
    .filter((token) => !hasCategoryProblem || !categoryHintFromTokens([token], catalog).length)
    .map((token) => token.value)
    .join(' ');

  return {
    productText: product,
    category: hasCategoryProblem ? '' : (selected?.label || explicitResolved),
    categoryError: hasCategoryProblem ? (ambiguous ? 'category_ambiguous' : 'category_not_found') : '',
    categoryHint: categoryHint || cleanCommandText(overlapHint),
    categoryCandidates: ambiguous ? sameSpecificity.map((item) => item.label) : [],
  };
}

function collectIntentCandidates(tokens, catalog) {
  const categoryIndexes = new Set(
    categoryMatches(tokens, catalog)
      .filter((match) => match.tokens.length > 1)
      .flatMap((match) => match.indexes),
  );
  const candidates = [];

  for (const item of ANYWHERE_INTENTS) {
    for (const phrase of item.phrases) {
      const parts = normalized(phrase).split(' ').filter(Boolean);
      for (let start = 0; start <= tokens.length - parts.length; start += 1) {
        if (!parts.every((part, offset) => tokens[start + offset]?.key === part)) continue;
        const indexes = parts.map((_part, offset) => start + offset);
        candidates.push({
          trigger: item.trigger,
          phrase,
          indexes,
          categoryOverlap: indexes.filter((index) => categoryIndexes.has(index)).length,
        });
      }
    }
  }

  return candidates.sort((left, right) => (
    left.categoryOverlap - right.categoryOverlap
    || right.indexes.length - left.indexes.length
    || left.indexes[0] - right.indexes[0]
  ));
}

function extractIntent(commandText, catalog) {
  const text = cleanCommandText(commandText).replace(/^[\s,:;\-]+|[.!]+$/g, '').trim();
  const tokens = textTokens(text);
  const intentCandidates = collectIntentCandidates(tokens, catalog);
  const preferredIntent = intentCandidates[0] || null;
  const patterns = [
    { trigger: 'falteiro', pattern: /^(?:por\s+favor\s+)?(?:coloca|coloque|adiciona|adicione|joga|jogue)\s+no\s+falteiro\s+(.+)$/iu },
    { trigger: 'falteiro', pattern: /^(?:por\s+favor\s+)?(?:coloca|coloque|adiciona|adicione|joga|jogue)\s+(.+?)\s+no\s+falteiro$/iu },
    { trigger: 'falta', pattern: /^(?:por\s+favor\s+)?(?:coloca|coloque|adiciona|adicione|joga|jogue)\s+(.+?)\s+na\s+falta$/iu },
    { trigger: 'falta', pattern: /^(.+?)\s+(?:coloca|coloque|adiciona|adicione|joga|jogue)\s+na\s+falta$/iu, subjectCommand: true },
    { trigger: 'falta', pattern: /^(?:por\s+favor[\s,:;\-]+)?(?:falteiro|falta|faltou|acabou)\b[\s,:;\-]*(.*)$/iu, triggerFromMatch: true },
    { trigger: 'faltando', pattern: /^(?:por\s+favor\s+)?(?:est[aá]|t[aá])\s+faltando\s+(.+)$/iu },
    { trigger: 'sem_estoque', pattern: /^(?:por\s+favor\s+)?(?:ficou|estamos|estou|est[aá]|t[aá])\s+sem\s+(?:estoque\s+(?:de\s+)?)?(.+)$/iu },
    { trigger: 'sem_estoque', pattern: /^(?:por\s+favor\s+)?sem\s+estoque\s+(?:de\s+)?(.+)$/iu },
    { trigger: 'acabou', pattern: /^(?:por\s+favor\s+)?n[aã]o\s+tem\s+mais\s+(.+)$/iu },
    { trigger: 'terminou', pattern: /^(?:por\s+favor\s+)?terminou\s+(.+)$/iu },
    { trigger: 'comprar', pattern: /^(?:por\s+favor\s+)?(?:precisa|precisamos|preciso)\s+comprar\s+(.+)$/iu },
    { trigger: 'comprar', pattern: /^(?:por\s+favor\s+)?(?:precisa|precisamos|preciso)\s+(.+?)\s+de\s+(.+)$/iu, categoryBeforeProduct: true },
    { trigger: 'acabou', pattern: /^(.+?)\s+(acabou|terminou)(?:\s*[,;]\s*(.+))?$/iu, subjectFirst: true },
    { trigger: 'falta', pattern: /^(.+?)\s+(?:est[aá]|t[aá])\s+(?:em\s+falta|faltando|sem\s+estoque)(?:\s*[,;]\s*(.+))?$/iu, subjectFirst: true, categoryIndex: 2 },
  ];

  for (const item of patterns) {
    const match = text.match(item.pattern);
    if (!match) continue;
    if (item.triggerFromMatch) {
      const triggerMatch = text.match(/^(?:por\s+favor[\s,:;\-]+)?(falteiro|falta|faltou|acabou)\b/iu);
      const leadingIntent = intentCandidates.find((candidate) => candidate.indexes[0] === 0);
      if (preferredIntent && leadingIntent && preferredIntent.categoryOverlap < leadingIntent.categoryOverlap) continue;
      return {
        trigger: normalized(triggerMatch?.[1] || item.trigger),
        productText: cleanCommandText(match[1]),
        categoryHint: '',
        overlapCategoryHint: 'falta',
      };
    }
    if (item.categoryBeforeProduct) {
      if (!categoryHintOnly(match[1])) continue;
      return { trigger: item.trigger, productText: cleanCommandText(match[2]), categoryHint: cleanCommandText(match[1]) };
    }
    if (item.subjectCommand) {
      return { trigger: item.trigger, productText: cleanCommandText(match[1]), categoryHint: '' };
    }
    if (item.subjectFirst) {
      return {
        trigger: item.trigger === 'acabou' ? normalized(match[2] || item.trigger) : item.trigger,
        productText: cleanCommandText(match[1]).replace(/^(?:o\s+)?estoque\s+de\s+/iu, ''),
        categoryHint: cleanCommandText(match[item.categoryIndex || 3]),
        overlapCategoryHint: 'falta',
      };
    }
    return { trigger: item.trigger, productText: cleanCommandText(match[1]), categoryHint: '' };
  }

  const intent = preferredIntent;
  if (!intent) return null;

  const consumed = new Set(intent.indexes);
  const productText = tokens
    .filter((_token, index) => !consumed.has(index))
    .filter((token) => !INTENT_FILLER_TOKENS.has(token.key))
    .map((token) => token.value)
    .join(' ');
  return {
    trigger: intent.trigger,
    productText,
    categoryHint: '',
    overlapCategoryHint: 'falta',
  };
}

function displayProduct(value) {
  let clean = cleanCommandText(value)
    .replace(/^[\s,:;\-]+|[\s,;.!?]+$/g, '')
    .replace(/^de\s+/iu, '')
    .trim();
  let tokens = textTokens(clean);
  while (tokens.length && PRODUCT_EDGE_TOKENS.has(tokens[0].key)) tokens = tokens.slice(1);
  while (tokens.length && PRODUCT_EDGE_TOKENS.has(tokens[tokens.length - 1].key)) tokens = tokens.slice(0, -1);
  clean = tokens.map((token) => token.value).join(' ').trim();
  if (!clean) return '';
  clean = clean
    .replace(/\b(?:da\s+)?l['’]?or[eé]al\b/giu, "L'Oreal")
    .replace(/\bda\s+omo\b/giu, 'OMO')
    .replace(/\bomo\b/giu, 'OMO')
    .replace(/\bveja\b/giu, 'Veja')
    .replace(/\belseve\b/giu, 'Elseve')
    .replace(/\bpantene\b/giu, 'Pantene')
    .replace(/\bde\s+(\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui))\b/giu, '$1')
    .replace(/\beno\b/giu, 'Eno');
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
}

function oneEditApart(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function knownProductTokenCatalog(knownProducts) {
  const knownTokens = new Map();
  for (const product of Array.isArray(knownProducts) ? knownProducts : []) {
    for (const token of textTokens(product)) {
      if (!/^[\p{L}'’]+$/u.test(token.value) || token.key.length < 6) continue;
      if (!knownTokens.has(token.key)) knownTokens.set(token.key, token.value);
    }
  }
  return knownTokens;
}

function correctProductFromCatalog(value, knownProducts, preparedTokens) {
  const knownTokens = preparedTokens instanceof Map ? preparedTokens : knownProductTokenCatalog(knownProducts);
  if (!knownTokens.size) return value;

  const clean = cleanCommandText(value);
  const replacements = [];
  for (const token of textTokens(clean)) {
    if (!/^[\p{L}'’]+$/u.test(token.value) || token.key.length < 6) continue;
    let replacement = knownTokens.get(token.key) || '';
    if (!replacement) {
      const candidates = [...knownTokens.entries()]
        .filter(([key]) => key[0] === token.key[0] && oneEditApart(token.key, key));
      replacement = candidates.length === 1 ? candidates[0][1] : '';
    }
    if (replacement && replacement !== token.value) {
      replacements.push({ start: token.start, end: token.end, value: replacement });
    }
  }

  if (!replacements.length) return value;
  let corrected = clean;
  for (const replacement of replacements.reverse()) {
    corrected = `${corrected.slice(0, replacement.start)}${replacement.value}${corrected.slice(replacement.end)}`;
  }
  return displayProduct(corrected);
}

function stripBatchSegmentPrefix(value) {
  return cleanCommandText(String(value || '')
    .replace(/^\s*(?:[-*•]+|\d+[.)])\s*/u, '')
    .replace(LIST_CONNECTOR_PATTERN, ''));
}

function splitConjoinedProducts(value) {
  const clean = stripBatchSegmentPrefix(value);
  if (!clean || COMPOUND_PRODUCT_PATTERN.test(clean)) return clean ? [clean] : [];

  const parts = clean.split(/\s+e\s+/iu);
  if (parts.length <= 1) return [clean];
  const result = [];
  let current = parts[0].trim();
  for (let index = 1; index < parts.length; index += 1) {
    const next = parts[index].trim();
    const leftTokens = textTokens(current);
    const rightTokens = textTokens(next);
    const leftHasContextClause = /\b(?:para|pra|porque|pois|cliente|dona|que)\b/iu.test(current);
    const rightStartsStrongProduct = STRONG_PRODUCT_START_PATTERN.test(next);
    const confidentBoundary = leftTokens.length > 0
      && leftTokens.length <= 9
      && rightTokens.length > 0
      && rightTokens.length <= 14
      && (!leftHasContextClause || rightStartsStrongProduct)
      && !NON_PRODUCT_CONJUNCTION_START_PATTERN.test(next)
      && !categoryHintOnly(next);
    if (confidentBoundary) {
      result.push(current);
      current = next;
    } else {
      current = `${current} e ${next}`.trim();
    }
  }
  if (current) result.push(current);
  return result;
}

function splitByKnownProductAnchors(value, knownProducts) {
  const text = stripBatchSegmentPrefix(value);
  const tokens = textTokens(text);
  const candidates = [];
  for (const knownProduct of Array.isArray(knownProducts) ? knownProducts : []) {
    const knownTokens = textTokens(knownProduct).map((token) => token.key);
    if (!knownTokens.length) continue;
    for (let start = 0; start <= tokens.length - knownTokens.length; start += 1) {
      if (!knownTokens.every((key, offset) => tokens[start + offset]?.key === key)) continue;
      candidates.push({
        start: tokens[start].start,
        end: tokens[start + knownTokens.length - 1].end,
        tokenCount: knownTokens.length,
      });
    }
  }

  const anchors = candidates
    .sort((left, right) => left.start - right.start || right.tokenCount - left.tokenCount)
    .filter((candidate, index, items) => (
      items.findIndex((item) => item.start === candidate.start) === index
    ))
    .filter((candidate, index, items) => index === 0 || candidate.start >= items[index - 1].end);
  if (anchors.length < 2) return [text];

  return anchors.map((anchor, index) => {
    const start = index === 0 ? 0 : anchor.start;
    const end = anchors[index + 1]?.start ?? text.length;
    return stripBatchSegmentPrefix(text.slice(start, end));
  }).filter(Boolean);
}

function splitFalteiroSegments(value, options = {}) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+(?:e\s+tamb[eé]m|tamb[eé]m|al[eé]m\s+disso)\s+/giu, '\n');
  const segments = [];
  let current = '';

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const previous = text[index - 1] || '';
    const next = text[index + 1] || '';
    const decimalComma = character === ',' && /\d/.test(previous) && /\d/.test(next);
    if (character === '\n' || character === ';' || character === '•' || (character === ',' && !decimalComma)) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) segments.push(current.trim());

  return segments
    .flatMap((segment) => splitByKnownProductAnchors(segment, options.knownProducts))
    .flatMap(splitConjoinedProducts)
    .map(stripBatchSegmentPrefix)
    .filter(Boolean);
}

function isBatchControlOnly(value) {
  return BATCH_CONTROL_ONLY_PATTERN.test(cleanCommandText(value).replace(/[,:;.!?]+$/u, '').trim());
}

function contextResidue(value, contexts) {
  return normalized(removeContextSegments(value, contexts))
    .replace(/\b(?:porque|pois|e|que|a|o|as|os|um|uma|de|do|da)\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function semanticContextLabel(value) {
  const label = contextLabel(cleanCommandText(value)
    .replace(/^que\s+(?:a\s+)?/iu, '')
    .replace(/^que\s+(?:o\s+)?/iu, '')
    .replace(/^(?:a|o)\s+(?=(?:cliente|dona)\b)/iu, ''));
  return label.replace(/\b(Cliente|Dona)\s+([\p{L}'’-]+)/iu, (match, prefix, name) => {
    if (/^(?:pediu|procurou|volta|veio)$/iu.test(name)) return match;
    return `${prefix} ${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)}`;
  });
}

function extractLeadingCustomerRequest(value) {
  const text = cleanCommandText(value);
  const match = text.match(/^(?:(?:miauby|miauw)\s+)?(?:a|o)\s+([\p{L}'’-]+)\s+(veio\s+atras\s+de|veio\s+procurar|procurou|pediu)\s+(.+?)\s+(?:e|mas)\s+nao\s+tinha\s+(?:coloca|coloque|adiciona|adicione|joga|jogue)\s+na\s+falta$/iu);
  if (!match) return { text, contexts: [] };
  const person = contextLabel(match[1]);
  const action = normalized(match[2]) === 'veio atras de' ? 'veio atras' : cleanCommandText(match[2]);
  return {
    text: `falta ${cleanCommandText(match[3])}`,
    contexts: [{ label: `${person} ${action} e nao tinha` }],
  };
}

function extractSemanticFreeContext(value) {
  const text = cleanCommandText(value);
  let selected = null;
  for (const pattern of FREE_CONTEXT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const clause = cleanCommandText(match[0]);
    const knownContexts = collectFalteiroContexts(clause);
    if (normalized(clause).startsWith('porque ') && knownContexts.length && !contextResidue(clause, knownContexts)) {
      continue;
    }
    const candidate = { start: match.index || 0, clause };
    if (!selected || candidate.start < selected.start) selected = candidate;
  }
  if (!selected) return { text, contexts: [] };

  const productText = cleanCommandText(text.slice(0, selected.start));
  return {
    text: productText,
    contexts: [{ label: semanticContextLabel(selected.clause) }],
  };
}

function extractGlobalModifier(value, catalog) {
  const text = String(value || '').trim();
  const match = text.match(COLLECTIVE_PATTERN);
  if (!match) return { text, category: '', context: '' };

  const modifier = cleanCommandText(match[2]).replace(/^(?:como|na\s+categoria)\s+/iu, '');
  const resolved = resolveCategory(modifier, catalog);
  const knownContexts = collectFalteiroContexts(modifier);
  const context = resolved ? '' : combineFalteiroCategory('', knownContexts);
  if (!resolved && !context) return { text, category: '', context: '' };
  return {
    text: `${text.slice(0, match.index)}${text.slice((match.index || 0) + match[0].length)}`.trim(),
    category: resolved,
    context,
  };
}

function withSemanticMetadata(parsed, rawText, segmentationConfidence = 0.96) {
  return {
    ...parsed,
    rawText: cleanCommandText(rawText),
    intentConfidence: 0.98,
    segmentationConfidence,
    productConfidence: parsed?.product ? 0.95 : 0,
  };
}

function parseFalteiroItem(segment, parseOptions, globalTrigger, segmentationConfidence) {
  const cleanSegment = stripBatchSegmentPrefix(segment);
  const leadingCustomer = extractLeadingCustomerRequest(cleanSegment);
  const semantic = extractSemanticFreeContext(leadingCustomer.text);
  const direct = parseFalteiroCommand(semantic.text, parseOptions);
  const inheritedSegment = semantic.text.replace(ACTIVATION_PATTERN, '').trim();
  const parsed = direct || parseFalteiroCommand(`falta ${inheritedSegment}`, parseOptions);
  if (!parsed) {
    return withSemanticMetadata({
      matched: true,
      trigger: globalTrigger,
      product: '',
      category: '',
      error: 'missing_product',
    }, segment, segmentationConfidence);
  }
  return withSemanticMetadata({
    ...parsed,
    trigger: parsed.trigger || globalTrigger,
    category: combineFalteiroCategory(parsed.category, [...leadingCustomer.contexts, ...semantic.contexts]),
  }, segment, segmentationConfidence);
}

export function parseFalteiroCommand(message, options = {}) {
  const raw = cleanCommandText(message);
  if (!raw || QUESTION_PATTERN.test(raw)) return null;

  const commandText = raw.replace(ACTIVATION_PATTERN, '');
  if (hasBlockingFalteiroNegation(commandText) || isSpecificCustomerOrder(commandText)) return null;

  const contexts = collectFalteiroContexts(commandText);
  const catalog = categoryCatalog(options.categories);
  const intent = extractIntent(commandText, catalog);
  if (!intent || NON_FALTEIRO_COMPLEMENT_PATTERN.test(intent.productText)) return null;

  const productWithoutContext = removeContextSegments(intent.productText, contexts);
  const extracted = extractCategory(productWithoutContext, catalog, intent.categoryHint, intent.overlapCategoryHint);
  const product = correctProductFromCatalog(
    displayProduct(extracted.productText),
    options.knownProducts,
    options.knownProductTokens,
  );
  if (BLOCKED_PRODUCT_PATTERN.test(product)) return null;

  let error = '';
  if (!product || DOSAGE_ONLY_PATTERN.test(product)) {
    error = 'missing_product';
  } else if (product.length > 220) {
    error = 'product_too_long';
  } else if (extracted.categoryError) {
    error = extracted.categoryError;
  }

  const result = {
    matched: true,
    trigger: intent.trigger,
    product: error && !['category_not_found', 'category_ambiguous'].includes(error) ? '' : product,
    category: extracted.categoryError
      ? ''
      : (error === 'missing_product' ? extracted.category : combineFalteiroCategory(extracted.category, contexts)),
    error,
  };
  if (error === 'category_not_found' || error === 'category_ambiguous') {
    result.categoryHint = extracted.categoryHint;
    result.categoryCandidates = extracted.categoryCandidates;
  }
  return result;
}

export function parseFalteiroCommands(message, options = {}) {
  const raw = String(message || '').trim();
  if (!raw || QUESTION_PATTERN.test(raw)) return null;

  const parseOptions = {
    ...options,
    knownProductTokens: knownProductTokenCatalog(options.knownProducts),
  };
  const catalog = categoryCatalog(options.categories);
  const wholeMessage = parseFalteiroCommand(raw, parseOptions);
  const explicitBatchIntent = /\b(?:falta|falteiro)\b|\b(?:coloca|coloque|adiciona|adicione|joga|jogue)\b[\s\S]*\b(?:falta|falteiro)\b/iu.test(raw);
  const fallbackIntent = explicitBatchIntent
    ? extractIntent(cleanCommandText(raw).replace(ACTIVATION_PATTERN, ''), catalog)
    : null;
  const globalTrigger = wholeMessage?.trigger || fallbackIntent?.trigger || '';
  if (!globalTrigger) return null;

  const globalModifier = extractGlobalModifier(raw, catalog);
  const messageForItems = globalModifier.text || raw;

  const segments = splitFalteiroSegments(messageForItems, parseOptions);
  if (segments.length <= 1) {
    const item = parseFalteiroItem(segments[0] || messageForItems, parseOptions, globalTrigger, 1);
    item.category = combineFalteiroCategory(item.category, [
      ...(globalModifier.category ? [{ label: globalModifier.category }] : []),
      ...(globalModifier.context ? [{ label: globalModifier.context }] : []),
    ]);
    return {
      matched: true,
      trigger: globalTrigger,
      items: [item],
      detectedCount: 1,
      error: item.error,
    };
  }

  const itemSegments = segments.filter((segment) => !isBatchControlOnly(segment));
  if (itemSegments.length > MAX_FALTEIRO_BATCH_ITEMS) {
    return {
      matched: true,
      trigger: wholeMessage.trigger,
      items: [],
      detectedCount: itemSegments.length,
      error: 'too_many_items',
    };
  }

  const items = itemSegments.map((segment) => {
    const item = parseFalteiroItem(segment, parseOptions, globalTrigger, 0.97);
    item.category = combineFalteiroCategory(item.category, [
      ...(globalModifier.category ? [{ label: globalModifier.category }] : []),
      ...(globalModifier.context ? [{ label: globalModifier.context }] : []),
    ]);
    return item;
  });

  if (!items.length) {
    const item = parseFalteiroItem(messageForItems, parseOptions, globalTrigger, 1);
    return {
      matched: true,
      trigger: globalTrigger,
      items: [item],
      detectedCount: 1,
      error: item.error,
    };
  }

  return {
    matched: true,
    trigger: globalTrigger,
    items,
    detectedCount: items.length,
    error: items.find((item) => item.error)?.error || '',
  };
}

export function formatFalteiroConfirmation({ product, category }) {
  const cleanProduct = displayProduct(product);
  const cleanCategory = cleanCommandText(category);
  return cleanCategory
    ? `✅ ${cleanProduct} adicionada ao Falteiro como ${cleanCategory}.`
    : `✅ ${cleanProduct} adicionada ao Falteiro.`;
}

export function formatFalteiroBatchConfirmation(items) {
  const cleanItems = Array.isArray(items) ? items.filter((item) => item && item.product) : [];
  if (cleanItems.length === 1) return formatFalteiroConfirmation(cleanItems[0]);
  if (!cleanItems.length) return '';

  const lines = cleanItems.map((item) => {
    const product = displayProduct(item.product);
    const category = cleanCommandText(item.category);
    return category ? `- ${product} — ${category}` : `- ${product}`;
  });
  return `✅ ${cleanItems.length} itens adicionados ao Falteiro:\n${lines.join('\n')}`;
}
