import assert from 'node:assert/strict';
import test from 'node:test';

import { mightBeFalteiroCommand } from './cotacao-command.js';

test('encaminha candidatos do Falteiro sem diferenciar maiusculas', () => {
  assert.equal(mightBeFalteiroCommand('MIAUBY FALTEIRO losartana'), true);
  assert.equal(mightBeFalteiroCommand('falta losartana 40mg urgente'), true);
  assert.equal(mightBeFalteiroCommand('AcAbOu losartana'), true);
});

test('nao encaminha mensagens sem sinonimo do Falteiro', () => {
  assert.equal(mightBeFalteiroCommand('Miauby cotacao losartana'), false);
  assert.equal(mightBeFalteiroCommand('qual e o relatorio de hoje?'), false);
  assert.equal(mightBeFalteiroCommand('qual produto faltou ontem?'), false);
  assert.equal(mightBeFalteiroCommand('o estoque de losartana acabou?'), false);
});
