const ACTIVATION_PATTERN = /^(?:miauby|miauw)\b[\s,:;\-\u2013\u2014]*/iu;
const DOSAGE_ONLY_PATTERN = /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)$/iu;
const NON_FALTEIRO_COMPLEMENT_PATTERN = /^(?:o\s+que\s+)?(?:chegar|chegando|chegada|chegadas)\b/iu;
const QUESTION_PATTERN = /\?\s*$/u;
const BLOCKED_PRODUCT_PATTERN = /^(?:a\s+|o\s+)?(?:internet|energia|tempo|sistema|acesso|sinal|resposta|conex[aã]o|dados)$/iu;
const CATEGORY_HINT_PATTERN = /^(?:prioridade\s+)?(?:urgente|urg[êe]ncia|popular|falta)(?:\s+(?:urgente|urg[êe]ncia|popular|falta))*$/iu;
const CATEGORY_ALIASES = new Map([
  ['acabando', 'falta'],
  ['acabou', 'falta'],
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
  { concept: 'popular', phrases: ['linha popular'] },
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
const NUMBER_TOKEN_SOURCE = '(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';
const ORDER_UNIT_SOURCE = '(?:caixas?|pacotes?|frascos?|ampolas?|unidades?|itens?)';
const ANYWHERE_INTENTS = [
  { trigger: 'sem_estoque', phrases: ['nao tem mais', 'nao temos', 'nao tem', 'sem estoque', 'estamos sem', 'ficou sem', 'estou sem', 'sem'] },
  { trigger: 'faltando', phrases: ['esta faltando', 'ta faltando', 'estao faltando', 'tao faltando', 'faltando'] },
  { trigger: 'acabando', phrases: ['estoque baixo', 'esta acabando', 'ta acabando', 'tem pouco', 'vai acabar', 'acabando'] },
  { trigger: 'estoque_baixo', phrases: ['so temos', 'so tem', 'tem so', 'tem meia caixa', 'restou', 'ultima caixa', 'ultima unidade'] },
  { trigger: 'comprar', phrases: ['precisamos comprar', 'precisa comprar', 'preciso comprar', 'comprar'] },
  { trigger: 'repor', phrases: ['precisamos repor', 'precisa repor', 'preciso repor', 'reposicao', 'repor'] },
  { trigger: 'falteiro', phrases: ['no falteiro', 'falteiro'] },
  { trigger: 'falta', phrases: ['faltou', 'falta', 'faltam'] },
  { trigger: 'acabou', phrases: ['nao pode faltar', 'zerou', 'acabou'] },
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

  addMatches(new RegExp(`\\b(comprar|compre|pegar|pega|pegue|repor)\\s+(${NUMBER_TOKEN_SOURCE})(?:\\s+(${ORDER_UNIT_SOURCE}))?\\b`, 'giu'), 40, (match) => {
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
  addMatches(/\b(?:esta\s+faltando|t(?:a|\u00e1)\s+faltando|estao\s+faltando|tao\s+faltando|esta\s+em\s+falta|estamos\s+sem|ficou\s+sem|estou\s+sem|nao\s+tem\s+mais|nao\s+temos|sem\s+estoque|terminou|zerou|acabou)\b/giu, 20, (match) => ({ label: normalized(match[0]) }));

  addMatches(/\b(?:muita\s+gente\s+(?:esta\s+)?procurando|muita\s+gente\s+perguntou|muita\s+procura|cliente\s+esta\s+procurando|ja\s+pediram\s+varias\s+vezes|vende\s+muito|sai\s+muito|produto\s+de\s+giro|vende\s+pouco|nao\s+pode\s+faltar)\b/giu, 30, (match) => ({ label: match[0] }));

  addMatches(/\b(?:o\s+quanto\s+antes|nao\s+pode\s+esperar|sem\s+pressa|pode\s+esperar|proxima\s+cotacao|preciso\s+(?:hoje|amanha))\b/giu, 50, (match) => ({ label: match[0] }));
  addMatches(/\b(?:para|pra)\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/giu, 50, (match) => ({ label: match[0] }));
  addMatches(/\b(?:hoje|amanha)\b/giu, 50, (match) => ({ label: match[0] }));

  addMatches(/\b(?:se\s+estiver\s+barato|pegar\s+o\s+mais\s+barato|so\s+se\s+tiver\s+promocao|comprar\s+se\s+tiver\s+promocao)\b/giu, 65, (match) => ({
    label: match[0],
    extraRemovals: normalized(match[0]).startsWith('comprar ') ? [match[0].replace(/^comprar\s+/iu, '')] : [],
  }));
  addMatches(/\b(?:qualquer\s+laboratorio|pode\s+ser\s+generico|validade\s+longa|pegar\s+bastante|cliente\s+reclama\s+dessa\s+marca)\b/giu, 70, (match) => ({ label: match[0] }));
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
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
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
  const product = displayProduct(extracted.productText);
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

export function formatFalteiroConfirmation({ product, category }) {
  const cleanProduct = displayProduct(product);
  const cleanCategory = cleanCommandText(category);
  return cleanCategory
    ? `✅ ${cleanProduct} adicionada ao Falteiro como ${cleanCategory}.`
    : `✅ ${cleanProduct} adicionada ao Falteiro.`;
}
