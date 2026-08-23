import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMiaubyResponse } from './response-format.js';

test('adiciona exatamente um prefixo Miauby nas respostas visiveis', () => {
  assert.equal(formatMiaubyResponse('Tudo certo.'), 'Miauby: Tudo certo.');
  assert.equal(formatMiaubyResponse('Miauby: Tudo certo.'), 'Miauby: Tudo certo.');
  assert.equal(formatMiaubyResponse('miauby: Miauby: Tudo certo.'), 'Miauby: Tudo certo.');
  assert.equal(formatMiaubyResponse('   '), '');
});
