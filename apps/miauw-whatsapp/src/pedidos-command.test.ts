import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parsePedidosArrivalReply,
  parsePedidosArrivalSelectionReply,
  parsePedidosOperationalCommand,
} from './pedidos-command.js';

test('lista pedidos que ainda estao para chegar', () => {
  assert.deepEqual(parsePedidosOperationalCommand('Miauby o que tem para chegar?'), {
    action: 'list',
    raw: 'o que tem para chegar',
    query: '',
  });
});

test('chegou sozinho inicia a escolha sem inventar fornecedor', () => {
  assert.deepEqual(parsePedidosArrivalReply('chegou'), { none: false, supplier: '' });
  assert.deepEqual(parsePedidosArrivalSelectionReply('chegou'), { kind: 'prompt' });
});

test('aceita numero, ordinal e chegou antes ou depois da escolha', () => {
  for (const [message, choice] of [
    ['3', '3'],
    ['3 chegou', '3'],
    ['chegou 3', '3'],
    ['o terceiro chegou', 'o terceiro'],
    ['chegou o terceiro', 'o terceiro'],
  ] as const) {
    assert.deepEqual(parsePedidosArrivalSelectionReply(message), { kind: 'choice', choice });
  }
});

test('permite desistir da escolha de chegada sem alterar pedido', () => {
  for (const message of ['nao', 'deixa', 'cancelar comando']) {
    assert.deepEqual(parsePedidosArrivalSelectionReply(message), { kind: 'cancel' });
  }
});

test('nao transforma novo comando ou fornecedor solto em escolha de chegada', () => {
  assert.equal(parsePedidosArrivalSelectionReply('miauby sangria 10'), null);
  assert.equal(parsePedidosArrivalSelectionReply('Nissei'), null);
});

test('preserva confirmacao direta pelo fornecedor e a resposta nenhum', () => {
  assert.deepEqual(parsePedidosArrivalReply('Nissei chegou'), { none: false, supplier: 'Nissei' });
  assert.deepEqual(parsePedidosArrivalReply('nenhum pedido chegou'), { none: true, supplier: '' });
});
