import assert from 'node:assert/strict';
import test from 'node:test';

import { formatFalteiroConfirmation, parseFalteiroCommand } from './falteiro-command.js';

test('reconhece os sinonimos do Falteiro sem diferenciar maiusculas', () => {
  const cases = [
    ['Miauby falteiro losartana', 'falteiro'],
    ['miauby falta losartana', 'falta'],
    ['MIAUBY FALTOU losartana', 'faltou'],
    ['MiAuBy acabou losartana', 'acabou'],
  ];

  for (const [message, trigger] of cases) {
    assert.deepEqual(parseFalteiroCommand(message), {
      matched: true,
      trigger,
      product: 'Losartana',
      category: '',
      error: '',
    });
  }
});

test('mantem apresentacao no produto e separa prioridade urgente', () => {
  assert.deepEqual(parseFalteiroCommand('Miauby falta losartana 40mg urgente'), {
    matched: true,
    trigger: 'falta',
    product: 'Losartana 40mg',
    category: 'Urgente',
    error: '',
  });

  assert.deepEqual(parseFalteiroCommand('miauby: falteiro  dipirona 500mg, prioridade urgencia.'), {
    matched: true,
    trigger: 'falteiro',
    product: 'Dipirona 500mg',
    category: 'Urgente',
    error: '',
  });
});

test('aceita comando direto, pontuacao e falta de produto sem inventar dado', () => {
  assert.deepEqual(parseFalteiroCommand('falta de amoxicilina 500mg!'), {
    matched: true,
    trigger: 'falta',
    product: 'Amoxicilina 500mg',
    category: '',
    error: '',
  });

  assert.deepEqual(parseFalteiroCommand('Miauby acabou urgente'), {
    matched: true,
    trigger: 'acabou',
    product: '',
    category: 'Urgente',
    error: 'missing_product',
  });
});

test('nao registra frases ambiguas ou sem relacao clara com o Falteiro', () => {
  const unrelated = [
    'qual produto faltou ontem?',
    'a losartana acabou?',
    'Miauby cotacao losartana',
    'Miauby o estoque de losartana acabou',
    'Miauby falta chegar pedido da Profarma',
  ];

  for (const message of unrelated) {
    assert.equal(parseFalteiroCommand(message), null, message);
  }
});

test('monta confirmacao curta sem perder a prioridade', () => {
  assert.equal(
    formatFalteiroConfirmation({ product: 'Losartana 40mg', category: 'Urgente' }),
    '✅ Losartana 40mg adicionada ao Falteiro como Urgente.',
  );
  assert.equal(
    formatFalteiroConfirmation({ product: 'Losartana', category: '' }),
    '✅ Losartana adicionada ao Falteiro.',
  );
});
