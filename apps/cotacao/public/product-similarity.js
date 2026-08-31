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
  const PRESENTATION_PATTERN = Array.from(PRESENTATION_TOKENS)
    .sort((left, right) => right.length - left.length)
    .join('|');
  const PACKAGE_QUANTITY_PATTERN = new RegExp(
    `\\b\\d+(?:[.,]\\d+)?\\s*(?:${PRESENTATION_PATTERN})\\b`,
    'g'
  );
  const EXPLICIT_DOSAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(kg|mcg|mg|ml|ug|ui|g|l|%)(?![a-z])/g;
  const RATIO_DOSAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/g;
  const DOSAGE_UNITS = Object.freeze({
    kg: { family: 'mass', factor: 1000000 },
    g: { family: 'mass', factor: 1000 },
    mg: { family: 'mass', factor: 1 },
    mcg: { family: 'mass', factor: 0.001 },
    ug: { family: 'mass', factor: 0.001 },
    l: { family: 'volume', factor: 1000 },
    ml: { family: 'volume', factor: 1 },
    ui: { family: 'potency', factor: 1 },
    '%': { family: 'percent', factor: 1 }
  });

  function normalizedProductText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/µ/g, 'u')
      .replace(/(\d),(\d)/g, '$1.$2');
  }

  function normalizedProductTokens(value) {
    return normalizedProductText(value)
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

  function normalizedNumber(value) {
    const number = Number.parseFloat(String(value));
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 1000000) / 1000000;
  }

  function explicitDosage(numberText, unit) {
    const raw = normalizedNumber(numberText);
    const definition = DOSAGE_UNITS[unit];
    if (raw === null || !definition) return null;
    return {
      family: definition.family,
      raw,
      canonical: normalizedNumber(raw * definition.factor)
    };
  }

  function implicitDosage(numberText) {
    const raw = normalizedNumber(numberText);
    return raw === null ? null : { family: 'implicit', raw, canonical: raw };
  }

  function extractDosages(value) {
    let remaining = normalizedProductText(value)
      .replace(/\bc\s*\/\s*\d+\b/g, ' ')
      .replace(PACKAGE_QUANTITY_PATTERN, ' ');
    const dosages = [];

    remaining = remaining.replace(EXPLICIT_DOSAGE_PATTERN, (_match, numberText, unit) => {
      const dosage = explicitDosage(numberText, unit);
      if (dosage) dosages.push(dosage);
      return ' ';
    });
    remaining = remaining.replace(RATIO_DOSAGE_PATTERN, (_match, left, right) => {
      const leftDosage = implicitDosage(left);
      const rightDosage = implicitDosage(right);
      if (leftDosage) dosages.push(leftDosage);
      if (rightDosage) dosages.push(rightDosage);
      return ' ';
    });

    const trailingNumber = remaining.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*$/);
    if (trailingNumber) {
      const dosage = implicitDosage(trailingNumber[1]);
      if (dosage) dosages.push(dosage);
    }
    return dosages;
  }

  function productDescriptor(value) {
    return {
      identity: normalizeProductIdentity(value),
      dosages: extractDosages(value)
    };
  }

  function dosageComponentsAreCompatible(left, right) {
    if (left.family === right.family) return left.canonical === right.canonical;
    const implicit = left.family === 'implicit' ? left : right.family === 'implicit' ? right : null;
    const explicit = implicit === left ? right : implicit === right ? left : null;
    if (!implicit || !explicit) return false;
    return implicit.raw === explicit.raw || implicit.raw === explicit.canonical;
  }

  function dosagesAreCompatible(left, right) {
    if (!left.length || !right.length) return true;
    if (left.length !== right.length) return false;
    return left.every((dosage, index) => dosageComponentsAreCompatible(dosage, right[index]));
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
    const left = productDescriptor(leftValue);
    const right = productDescriptor(rightValue);
    return dosagesAreCompatible(left.dosages, right.dosages)
      && normalizedProductsAreSimilar(left.identity, right.identity);
  }

  function findSimilarProductRowIds(rows, productValue = (row) => row?.values?.produto) {
    const products = (Array.isArray(rows) ? rows : [])
      .map((row) => ({ id: row?.id, ...productDescriptor(productValue(row)) }))
      .filter((item) => item.id && item.identity);
    const marked = new Set();
    const groups = new Map();
    products.forEach((product) => {
      const group = groups.get(product.identity) || [];
      group.push(product);
      groups.set(product.identity, group);
    });

    const markCompatiblePairs = (leftGroup, rightGroup = leftGroup) => {
      const sameGroup = leftGroup === rightGroup;
      leftGroup.forEach((left, leftIndex) => {
        rightGroup.forEach((right, rightIndex) => {
          if ((sameGroup && rightIndex <= leftIndex) || !dosagesAreCompatible(left.dosages, right.dosages)) return;
          marked.add(left.id);
          marked.add(right.id);
        });
      });
    };

    groups.forEach((group) => {
      if (group.length > 1) markCompatiblePairs(group);
    });

    const identities = Array.from(groups.keys()).sort();
    for (let leftIndex = 0; leftIndex < identities.length; leftIndex += 1) {
      const left = identities[leftIndex];
      if (left.length < 5) continue;
      const prefix = `${left} `;
      for (let rightIndex = leftIndex + 1; rightIndex < identities.length; rightIndex += 1) {
        const right = identities[rightIndex];
        if (!right.startsWith(left)) break;
        if (right.startsWith(prefix)) markCompatiblePairs(groups.get(left), groups.get(right));
      }
    }

    const wildcardGroups = new Map();
    identities
      .filter((identity) => identity.length >= 5 && !identity.includes(' '))
      .forEach((identity) => {
        for (let index = 0; index < identity.length; index += 1) {
          const wildcard = `${index}:${identity.slice(0, index)}*${identity.slice(index + 1)}`;
          const candidates = wildcardGroups.get(wildcard) || [];
          candidates.forEach((candidate) => markCompatiblePairs(groups.get(candidate), groups.get(identity)));
          candidates.push(identity);
          wildcardGroups.set(wildcard, candidates);

          const shorter = `${identity.slice(0, index)}${identity.slice(index + 1)}`;
          if (shorter.length >= 5 && groups.has(shorter)) {
            markCompatiblePairs(groups.get(shorter), groups.get(identity));
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
