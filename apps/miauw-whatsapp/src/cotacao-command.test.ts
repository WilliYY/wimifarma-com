import assert from 'node:assert/strict';
import test from 'node:test';

import { mightBeFalteiroCommand } from './cotacao-command.js';

test('encaminha candidatos do Falteiro sem diferenciar maiusculas', () => {
  assert.equal(mightBeFalteiroCommand('MIAUBY FALTEIRO losartana'), true);
  assert.equal(mightBeFalteiroCommand('falta losartana 40mg urgente'), true);
  assert.equal(mightBeFalteiroCommand('AcAbOu losartana'), true);
  assert.equal(mightBeFalteiroCommand('Miauby tá faltando losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby estamos sem dipirona'), true);
  assert.equal(mightBeFalteiroCommand('Miauby coloca omeprazol 20mg no falteiro'), true);
  assert.equal(mightBeFalteiroCommand('Miauby precisa comprar losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50mg acabou, urgente'), true);
  assert.equal(mightBeFalteiroCommand('Miauby amoxicilina 500mg está em falta'), true);
  assert.equal(mightBeFalteiroCommand('Miauby o estoque de losartana acabou'), true);
  assert.equal(mightBeFalteiroCommand('Miauby urgente popular metformina 850 falta'), true);
  assert.equal(mightBeFalteiroCommand('Miauby metformina falta urgente popular 850'), true);
  assert.equal(mightBeFalteiroCommand('Miauby precisa repor losartana 50mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby reposicao de dipirona 500mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby comprar omeprazol 20mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50mg esta acabando'), true);
  assert.equal(mightBeFalteiroCommand('Miauby nao temos amoxicilina 500mg'), true);
  assert.equal(mightBeFalteiroCommand('Miauby losartana 50 zerou'), true);
  assert.equal(mightBeFalteiroCommand('Miauby omeprazol 20 estoque baixo'), true);
  assert.equal(mightBeFalteiroCommand('Miauby dipirona 500mg so tem 2 caixas'), true);
  assert.equal(mightBeFalteiroCommand('Miauby omeprazol 20 tem meia caixa'), true);
  assert.equal(mightBeFalteiroCommand('Miauby protetor Nivea vai acabar'), true);
});

test('nao encaminha mensagens sem sinonimo do Falteiro', () => {
  assert.equal(mightBeFalteiroCommand('Miauby cotacao losartana'), false);
  assert.equal(mightBeFalteiroCommand('qual e o relatorio de hoje?'), false);
  assert.equal(mightBeFalteiroCommand('qual produto faltou ontem?'), false);
  assert.equal(mightBeFalteiroCommand('Miauby falta chegar'), false);
  assert.equal(mightBeFalteiroCommand('Miauby relatorio de falta'), false);
  assert.equal(mightBeFalteiroCommand('o estoque de losartana acabou?'), false);
  assert.equal(mightBeFalteiroCommand('Miauby estamos sem internet'), false);
});
