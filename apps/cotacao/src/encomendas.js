const ENCOMENDA_TERM_RE = /(^|[^\p{L}\p{N}])((?:encomendas?|encomendar|encomendad[oa]s?)|enc\.)(?=$|[^\p{L}\p{N}])/iu;

export function normalizeEncomendaText(value, maxLength = 180) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function findEncomendaTerm(value) {
  const text = normalizeEncomendaText(value, 900);
  if (!text) return null;
  const match = text.match(ENCOMENDA_TERM_RE);
  if (!match || match.index === undefined) return null;
  const prefix = match[1] || '';
  const term = match[2] || '';
  const index = match.index + prefix.length;
  return {
    index,
    end: index + term.length,
    term,
    text
  };
}

export function hasEncomendaWord(value) {
  return findEncomendaTerm(value) !== null;
}

export function rowReminderFragments(values = {}) {
  const fields = [
    ['EAN', values.ean],
    ['Produto', values.produto],
    ['Quantidade', values.quantidade],
    ['Categoria', values.categoria]
  ];
  return fields
    .map(([label, value]) => {
      const clean = normalizeEncomendaText(value, 240);
      return clean ? `${label}: ${clean}` : '';
    })
    .filter(Boolean);
}

function stripEncomendaTerm(value) {
  const match = findEncomendaTerm(value);
  if (!match) return normalizeEncomendaText(value, 220);
  return normalizeEncomendaText(`${match.text.slice(0, match.index)} ${match.text.slice(match.end)}`, 220);
}

function cleanObservationEdge(value, maxLength = 220) {
  return normalizeEncomendaText(value, maxLength)
    .replace(/^[\s:;,\-|/\\]+/g, '')
    .replace(/[\s:;,\-|/\\]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function moneyLikeObservation(value) {
  const clean = normalizeEncomendaText(value, 80);
  if (!/^\d{1,5}(?:[,.]\d{1,2})?$/.test(clean)) return '';
  if (clean.replace(/\D/g, '').length > 5) return '';
  return `R$ ${clean.replace('.', ',')}`;
}

export function formatEncomendaObservation(before, after) {
  const cleanBefore = cleanObservationEdge(before, 160);
  const cleanAfter = cleanObservationEdge(after, 220);
  const combined = [cleanBefore, cleanAfter].filter(Boolean).join(' - ');
  if (!combined) return '';
  return moneyLikeObservation(combined) || combined;
}

export function extractQuantityFromText(value) {
  const match = String(value || '').match(/\b(\d+(?:[,.]\d+)?)\s*(caixas?|cx|un|und|unidades?|frascos?|cartelas?|cps|comp|comprimidos?)?\b/i);
  if (!match) return '';
  return normalizeEncomendaText(`${match[1]}${match[2] ? ` ${match[2]}` : ''}`, 80);
}

export function encomendaTextParts(values = {}) {
  const fields = [
    ['categoria', values.categoria],
    ['produto', values.produto],
    ['quantidade', values.quantidade]
  ];
  const fallbackText = normalizeEncomendaText(rowReminderFragments(values).join(' | '), 700);
  const source = fields
    .map(([field, value]) => ({ field, text: normalizeEncomendaText(value, 700) }))
    .find((item) => hasEncomendaWord(item.text))
    || { field: 'linha', text: fallbackText };
  const match = findEncomendaTerm(source.text);
  const text = normalizeEncomendaText(source.text, 700);
  if (!match) {
    return {
      sourceField: source.field,
      text,
      before: '',
      term: '',
      after: '',
      observation: ''
    };
  }
  const before = cleanObservationEdge(text.slice(0, match.index), 260);
  const after = cleanObservationEdge(text.slice(match.end), 260);
  return {
    sourceField: source.field,
    text,
    before,
    term: match.term,
    after,
    observation: formatEncomendaObservation(before, after)
  };
}

export function encomendaContextFromValues(values = {}) {
  const fragments = rowReminderFragments(values);
  const originalText = normalizeEncomendaText(fragments.join(' | '), 700);
  const parts = encomendaTextParts(values);
  const hasEncomenda = Boolean(parts.term) || hasEncomendaWord(originalText);
  const productRaw = normalizeEncomendaText(values.produto, 220);
  const produto = productRaw
    ? (hasEncomendaWord(productRaw) ? stripEncomendaTerm(productRaw) : productRaw)
    : '';
  const quantityRaw = normalizeEncomendaText(values.quantidade, 120);
  const quantidade = quantityRaw
    ? (hasEncomendaWord(quantityRaw) ? extractQuantityFromText(quantityRaw) : quantityRaw)
    : '';
  const categoria = normalizeEncomendaText(values.categoria, 220);
  return {
    hasEncomenda,
    produto,
    quantidade,
    categoria,
    originalText,
    observacaoEncomenda: parts.observation,
    rowValues: {
      ean: normalizeEncomendaText(values.ean, 120),
      produto: productRaw,
      quantidade: quantityRaw,
      categoria
    }
  };
}
