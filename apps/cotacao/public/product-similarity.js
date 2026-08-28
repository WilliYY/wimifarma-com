((root) => {
  'use strict';

  const PRESENTATION_TOKENS = new Set([
    'amp', 'ampola', 'ampolas',
    'caps', 'capsula', 'capsulas',
    'cartela', 'cartelas',
    'caixa', 'caixas', 'comp', 'comps', 'comprimido', 'comprimidos', 'cp', 'cps', 'cx', 'cxs',
    'dragea', 'drageas',
    'frasco', 'frascos',
    'gota', 'gotas',
    'sache', 'saches',
    'solucao', 'suspensao',
    'tubo', 'tubos',
    'un', 'und', 'unid', 'unidade', 'unidades',
    'xarope'
  ]);
  const UNIT_TOKEN = /^(?:g|kg|l|mcg|mg|ml|ug|ui)$/;
  const NUMBER_OR_DOSAGE_TOKEN = /^\d+(?:\d*[a-z%]+)?$/;

  function normalizedProductTokens(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/µ/g, 'u')
      .replace(/\bc\s*\/\s*\d+\b/g, ' ')
      .replace(/[^a-z0-9%]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function isTrailingQualifier(token) {
    return PRESENTATION_TOKENS.has(token)
      || UNIT_TOKEN.test(token)
      || NUMBER_OR_DOSAGE_TOKEN.test(token);
  }

  function normalizeProductIdentity(value) {
    const tokens = normalizedProductTokens(value);
    while (tokens.length > 1 && isTrailingQualifier(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    return tokens.join(' ');
  }

  function editDistanceAtMostOne(left, right) {
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

    if (leftIndex < left.length || rightIndex < right.length) edits += 1;
    return edits <= 1;
  }

  function normalizedProductsAreSimilar(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;

    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    if (shorter.length < 5) return false;
    if (longer.startsWith(`${shorter} `)) return true;
    return !left.includes(' ') && !right.includes(' ') && editDistanceAtMostOne(left, right);
  }

  function productsAreSimilar(leftValue, rightValue) {
    return normalizedProductsAreSimilar(
      normalizeProductIdentity(leftValue),
      normalizeProductIdentity(rightValue)
    );
  }

  function findSimilarProductRowIds(rows, productValue = (row) => row?.values?.produto) {
    const products = (Array.isArray(rows) ? rows : [])
      .map((row) => ({ id: row?.id, identity: normalizeProductIdentity(productValue(row)) }))
      .filter((item) => item.id && item.identity);
    const marked = new Set();
    const groups = new Map();
    products.forEach((product) => {
      const group = groups.get(product.identity) || [];
      group.push(product.id);
      groups.set(product.identity, group);
    });

    const markGroup = (group) => group.forEach((rowId) => marked.add(rowId));
    const markPair = (leftGroup, rightGroup) => {
      markGroup(leftGroup);
      markGroup(rightGroup);
    };

    groups.forEach((group) => {
      if (group.length > 1) markGroup(group);
    });

    const identities = Array.from(groups.keys()).sort();
    for (let leftIndex = 0; leftIndex < identities.length; leftIndex += 1) {
      const left = identities[leftIndex];
      if (left.length < 5) continue;
      const prefix = `${left} `;
      for (let rightIndex = leftIndex + 1; rightIndex < identities.length; rightIndex += 1) {
        const right = identities[rightIndex];
        if (!right.startsWith(left)) break;
        if (right.startsWith(prefix)) markPair(groups.get(left), groups.get(right));
      }
    }

    const wildcardGroups = new Map();
    identities
      .filter((identity) => identity.length >= 5 && !identity.includes(' '))
      .forEach((identity) => {
        for (let index = 0; index < identity.length; index += 1) {
          const wildcard = `${index}:${identity.slice(0, index)}*${identity.slice(index + 1)}`;
          const candidates = wildcardGroups.get(wildcard) || [];
          candidates.forEach((candidate) => markPair(groups.get(candidate), groups.get(identity)));
          candidates.push(identity);
          wildcardGroups.set(wildcard, candidates);

          const shorter = `${identity.slice(0, index)}${identity.slice(index + 1)}`;
          if (shorter.length >= 5 && groups.has(shorter)) {
            markPair(groups.get(shorter), groups.get(identity));
          }
        }
      });

    return marked;
  }

  root.WimiProductSimilarity = Object.freeze({
    findSimilarProductRowIds,
    normalizeProductIdentity,
    productsAreSimilar
  });
})(globalThis);
