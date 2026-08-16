const ACTIVATION_PATTERN = /^(?:miauby|miauw)\b[\s,:;\-\u2013\u2014]*/iu;
const DOSAGE_ONLY_PATTERN = /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)$/iu;
const NON_FALTEIRO_COMPLEMENT_PATTERN = /^(?:o\s+que\s+)?(?:chegar|chegando|chegada|chegadas)\b/iu;
const QUESTION_PATTERN = /\?\s*$/u;
const BLOCKED_PRODUCT_PATTERN = /^(?:a\s+|o\s+)?(?:internet|energia|tempo|sistema|acesso|sinal|resposta|conex[aã]o|dados)$/iu;
const CATEGORY_HINT_PATTERN = /^(?:prioridade\s+)?(?:urgente|urg[êe]ncia|popular|falta)(?:\s+(?:urgente|urg[êe]ncia|popular|falta))*$/iu;
const CATEGORY_ALIASES = new Map([
  ['urgencia', 'urgente'],
  ['urgencias', 'urgente'],
  ['urgentes', 'urgente'],
  ['populares', 'popular'],
  ['faltas', 'falta'],
]);
const CATEGORY_HINT_TOKENS = new Set(['urgente', 'popular', 'falta']);
const CATEGORY_CONTROL_TOKENS = new Set([
  'adiciona', 'adicione', 'categoria', 'coloca', 'coloque', 'como', 'prioridade',
]);
const INTENT_FILLER_TOKENS = new Set(['por', 'favor']);
const ANYWHERE_INTENTS = [
  { trigger: 'sem_estoque', phrases: ['nao tem mais', 'sem estoque', 'estamos sem', 'ficou sem', 'estou sem'] },
  { trigger: 'faltando', phrases: ['esta faltando', 'ta faltando', 'estao faltando', 'tao faltando'] },
  { trigger: 'comprar', phrases: ['precisamos comprar', 'precisa comprar', 'preciso comprar'] },
  { trigger: 'falteiro', phrases: ['no falteiro', 'falteiro'] },
  { trigger: 'falta', phrases: ['faltou', 'falta', 'faltam'] },
  { trigger: 'acabou', phrases: ['acabou'] },
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
    });
  }
  return tokens;
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
  const available = [
    ...tokens.map((token, index) => ({ canonical: token.canonical, index })),
    ...supplementalTokens.map((canonical) => ({ canonical, index: -1 })),
  ];
  const used = new Set();
  const indexes = [];
  let usedSupplemental = false;

  for (const required of categoryTokens) {
    const found = available.findIndex((token, index) => token.canonical === required && !used.has(index));
    if (found < 0) return null;
    used.add(found);
    if (available[found].index >= 0) indexes.push(available[found].index);
    else usedSupplemental = true;
  }

  return { indexes, usedSupplemental };
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
    categoryMatches(tokens, catalog).flatMap((match) => match.indexes),
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
    overlapCategoryHint: intent.phrase === 'falta' ? 'falta' : '',
  };
}

function displayProduct(value) {
  const clean = cleanCommandText(value)
    .replace(/^[\s,:;\-]+|[\s,;.!?]+$/g, '')
    .replace(/^de\s+/iu, '')
    .trim();
  if (!clean) return '';
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
}

export function parseFalteiroCommand(message, options = {}) {
  const raw = cleanCommandText(message);
  if (!raw || QUESTION_PATTERN.test(raw)) return null;

  const commandText = raw.replace(ACTIVATION_PATTERN, '');
  const catalog = categoryCatalog(options.categories);
  const intent = extractIntent(commandText, catalog);
  if (!intent || NON_FALTEIRO_COMPLEMENT_PATTERN.test(intent.productText)) return null;

  const extracted = extractCategory(intent.productText, catalog, intent.categoryHint, intent.overlapCategoryHint);
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
    category: extracted.category,
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
