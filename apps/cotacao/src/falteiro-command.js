const ACTIVATION_PATTERN = /^(?:miauby|miauw)\b[\s,:;\-\u2013\u2014]*/iu;
const DOSAGE_ONLY_PATTERN = /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)$/iu;
const NON_FALTEIRO_COMPLEMENT_PATTERN = /^(?:o\s+que\s+)?(?:chegar|chegando|chegada|chegadas)\b/iu;
const QUESTION_PATTERN = /\?\s*$/u;
const BLOCKED_PRODUCT_PATTERN = /^(?:a\s+|o\s+)?(?:internet|energia|tempo|sistema|acesso|sinal|resposta|conex[aã]o|dados)$/iu;
const CATEGORY_HINT_PATTERN = /^(?:prioridade\s+)?(?:urgente|urg[êe]ncia|popular|falta)(?:\s+(?:urgente|urg[êe]ncia|popular|falta))*$/iu;

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
  const aliases = new Map([
    ['urgencia', 'urgente'],
    ['urgencias', 'urgente'],
    ['urgentes', 'urgente'],
    ['populares', 'popular'],
    ['faltas', 'falta'],
  ]);
  return normalized(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => token !== 'prioridade')
    .map((token) => aliases.get(token) || token)
    .sort();
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

function extractCategory(productText, catalog, initialHint = '') {
  let text = cleanCommandText(productText);
  let category = resolveCategory(initialHint, catalog);

  const explicitMatch = text.match(/^(.*?)(?:[\s,;\-]+)(?:como|categoria|prioridade)\s+(.+?)\s*[.!?]*$/iu);
  if (explicitMatch) {
    const candidate = cleanCommandText(explicitMatch[2]);
    const resolved = resolveCategory(candidate, catalog);
    if (resolved || categoryHintOnly(candidate)) {
      text = cleanCommandText(explicitMatch[1]);
      category ||= resolved;
    }
  }

  const commaMatch = text.match(/^(.*?)[,;]\s*(?:(?:coloca|coloque|adiciona|adicione|categoria|prioridade)\s+)?(.+?)\s*[.!?]*$/iu);
  if (commaMatch) {
    const candidate = cleanCommandText(commaMatch[2]);
    const resolved = resolveCategory(candidate, catalog);
    if (resolved || categoryHintOnly(candidate)) {
      text = cleanCommandText(commaMatch[1]);
      category ||= resolved;
    }
  }

  const words = text.replace(/[.!?]+$/g, '').trim().split(/\s+/).filter(Boolean);
  const maxSuffixWords = Math.max(4, ...catalog.map((item) => item.tokens.length + 1));
  for (let size = Math.min(maxSuffixWords, words.length); size >= 1; size -= 1) {
    const candidate = words.slice(-size).join(' ');
    const resolved = resolveCategory(candidate, catalog);
    if (!resolved && !categoryHintOnly(candidate)) continue;
    text = words.slice(0, -size).join(' ');
    category ||= resolved;
    break;
  }

  return { productText: text, category };
}

function extractIntent(commandText) {
  const text = cleanCommandText(commandText).replace(/^[\s,:;\-]+|[.!]+$/g, '').trim();
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
  return null;
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
  const intent = extractIntent(commandText);
  if (!intent || NON_FALTEIRO_COMPLEMENT_PATTERN.test(intent.productText)) return null;

  const catalog = categoryCatalog(options.categories);
  const extracted = extractCategory(intent.productText, catalog, intent.categoryHint);
  const product = displayProduct(extracted.productText);
  if (BLOCKED_PRODUCT_PATTERN.test(product)) return null;

  let error = '';
  if (!product || DOSAGE_ONLY_PATTERN.test(product)) {
    error = 'missing_product';
  } else if (product.length > 220) {
    error = 'product_too_long';
  }

  return {
    matched: true,
    trigger: intent.trigger,
    product: error ? '' : product,
    category: extracted.category,
    error,
  };
}

export function formatFalteiroConfirmation({ product, category }) {
  const cleanProduct = displayProduct(product);
  const cleanCategory = cleanCommandText(category);
  return cleanCategory
    ? `✅ ${cleanProduct} adicionada ao Falteiro como ${cleanCategory}.`
    : `✅ ${cleanProduct} adicionada ao Falteiro.`;
}
