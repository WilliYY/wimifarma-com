const ACTIVATION_PATTERN = /^(?:miauby|miauw)\b[\s,:;\-\u2013\u2014]*/iu;
const COMMAND_PATTERN = /^(?:por\s+favor[\s,:;\-]+)?(falteiro|falta|faltou|acabou)\b[\s,:;\-]*(.*)$/iu;
const URGENT_SUFFIX_PATTERN = /(?:^|[\s,;\-]+)(?:prioridade\s+)?(?:urgente|urg[êe]ncia)\s*[.!?]*$/iu;
const DOSAGE_ONLY_PATTERN = /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui)$/iu;
const NON_FALTEIRO_COMPLEMENT_PATTERN = /^(?:o\s+que\s+)?(?:chegar|chegando|chegada|chegadas)\b/iu;

function cleanCommandText(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayProduct(value) {
  const clean = cleanCommandText(value)
    .replace(/^[\s,:;\-]+|[\s,;.!?]+$/g, '')
    .replace(/^de\s+/iu, '')
    .trim();
  if (!clean) return '';
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
}

export function parseFalteiroCommand(message) {
  const raw = cleanCommandText(message);
  if (!raw) return null;

  const commandText = raw.replace(ACTIVATION_PATTERN, '');
  const match = commandText.match(COMMAND_PATTERN);
  if (!match) return null;

  const trigger = String(match[1] || '').toLocaleLowerCase('pt-BR');
  let productText = cleanCommandText(match[2]);
  if (NON_FALTEIRO_COMPLEMENT_PATTERN.test(productText)) return null;
  let category = '';
  if (URGENT_SUFFIX_PATTERN.test(productText)) {
    category = 'Urgente';
    productText = productText.replace(URGENT_SUFFIX_PATTERN, '').trim();
  }

  const product = displayProduct(productText);
  let error = '';
  if (!product || DOSAGE_ONLY_PATTERN.test(product)) {
    error = 'missing_product';
  } else if (product.length > 220) {
    error = 'product_too_long';
  }

  return {
    matched: true,
    trigger,
    product: error ? '' : product,
    category,
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
