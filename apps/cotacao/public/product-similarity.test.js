import assert from 'node:assert/strict';
import test from 'node:test';

await import('./product-similarity.js');

const {
  findSimilarProductRowIds,
  normalizeProductIdentity,
  productsAreSimilar
} = globalThis.WimiProductSimilarity || {};

function rows(...products) {
  return products.map((produto, index) => ({
    id: `row-${index + 1}`,
    values: { produto }
  }));
}

function markedProducts(...products) {
  return Array.from(findSimilarProductRowIds(rows(...products))).sort();
}

test('normaliza caixa, acentos, pontuacao, dose e apresentacao', () => {
  assert.equal(normalizeProductIdentity('  DIPIRONA 500 mg - 20 cp  '), 'dipirona');
  assert.equal(normalizeProductIdentity('Ácido acetilsalicílico 100mg'), 'acido acetilsalicilico');
});

test('marca todas as variacoes de dipirona do exemplo informado', () => {
  assert.deepEqual(
    markedProducts('dipirona 500 mg', 'dipirona 500', 'dipirona'),
    ['row-1', 'row-2', 'row-3']
  );
});

test('nao confunde o mesmo medicamento quando as dosagens informadas sao diferentes', () => {
  assert.equal(productsAreSimilar('sinvastatina 20 mg', 'sinvastatina 40 mg'), false);
  assert.equal(productsAreSimilar('desvenlafaxina 50', 'desvenlafaxina 100'), false);
  assert.equal(productsAreSimilar('Prolopa BD 100/25', 'Prolopa BD 200/50'), false);
  assert.equal(productsAreSimilar('Puran 75 mcg', 'Puran 75 mg'), false);
  assert.equal(productsAreSimilar('amlodipino 5 mg', 'anlodipino 10 mg'), false);
  assert.equal(productsAreSimilar('Dove 200 ml', 'Dove 400 ml'), false);
  assert.deepEqual(
    markedProducts('sinvastatina 20', 'sinvastatina 40', 'desvenlafaxina 50', 'desvenlafaxina 100'),
    []
  );
});

test('considera equivalentes formatos da mesma dosagem e ignora quantidade da embalagem', () => {
  assert.equal(productsAreSimilar('dipirona 500 mg', 'dipirona 500mg'), true);
  assert.equal(productsAreSimilar('amoxicilina 0,5 g', 'amoxicilina 500 mg'), true);
  assert.equal(productsAreSimilar('dipirona 500 mg 20 cp', 'dipirona 500mg 30 comprimidos'), true);
  assert.deepEqual(
    markedProducts('dipirona 500 mg', 'dipirona 500mg', 'dipirona 500'),
    ['row-1', 'row-2', 'row-3']
  );
});

test('nome sem dosagem continua avisando sobre uma possivel variacao', () => {
  assert.equal(productsAreSimilar('dipirona', 'dipirona 500 mg'), true);
  assert.deepEqual(
    markedProducts('dipirona', 'dipirona 500 mg', 'dipirona 1 g'),
    ['row-1', 'row-2', 'row-3']
  );
});

test('nao aproxima produtos diferentes apenas porque compartilham a dosagem', () => {
  assert.equal(productsAreSimilar('Pregabalina 75 mg', 'Puran 75 mcg'), false);
  assert.deepEqual(markedProducts('Pregabalina 75', 'Puran 75'), []);
});

test('na lista do exemplo marca somente o nome realmente parecido', () => {
  assert.deepEqual(
    markedProducts(
      'Metotrexato',
      'Montelocaste',
      'Pregabalina 75',
      'alendronato de sodio',
      'metoprolol 25',
      'sinvastatina 40',
      'sinvastatina 20',
      'Puran 75',
      'Rapilax',
      'Salompas',
      'Salompas grande',
      'Desvenlafaxina 50',
      'Desvenlafaxina 100',
      'Fosfomicina'
    ),
    ['row-10', 'row-11']
  );
});

test('marca nome igual mesmo com caixa e acento diferentes', () => {
  assert.deepEqual(
    markedProducts('Ácido acetilsalicílico', 'acido acetilsalicilico'),
    ['row-1', 'row-2']
  );
});

test('marca complemento e erro minimo de digitacao', () => {
  assert.equal(productsAreSimilar('dipirona', 'dipirona monoidratada'), true);
  assert.equal(productsAreSimilar('amlodipino', 'anlodipino'), true);
  assert.deepEqual(
    markedProducts('dipirona', 'dipirona monoidratada', 'amlodipino', 'anlodipino'),
    ['row-1', 'row-2', 'row-3', 'row-4']
  );
});

test('nao marca apenas por palavras genericas em comum', () => {
  assert.equal(productsAreSimilar('protetor solar summer', 'protetor solar johnson'), false);
  assert.equal(productsAreSimilar('losartana', 'loratadina'), false);
  assert.equal(productsAreSimilar('Vitamina C', 'Vitamina D'), false);
  assert.deepEqual(
    markedProducts(
      'protetor solar summer',
      'protetor solar johnson',
      'losartana',
      'loratadina',
      'Vitamina C',
      'Vitamina D'
    ),
    []
  );
});

test('entende abreviacao de embalagem sem apagar a vitamina C', () => {
  assert.equal(normalizeProductIdentity('dipirona 500mg c/20'), 'dipirona');
  assert.equal(normalizeProductIdentity('Vitamina C'), 'vitamina c');
});

test('recalculo remove a marcacao quando deixa de existir outro parecido', () => {
  const currentRows = rows('dipirona 500 mg', 'dipirona');
  assert.deepEqual(Array.from(findSimilarProductRowIds(currentRows)).sort(), ['row-1', 'row-2']);

  currentRows[1].values.produto = 'losartana';
  assert.deepEqual(Array.from(findSimilarProductRowIds(currentRows)), []);
});

test('ignora linhas vazias e nao marca ocorrencia unica', () => {
  assert.deepEqual(markedProducts('', '   ', 'Zart'), []);
});
