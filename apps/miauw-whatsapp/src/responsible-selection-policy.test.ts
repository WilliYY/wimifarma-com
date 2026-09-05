import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES,
  expiredResponsibleSelectionFallback,
  responsibleSelectionInstruction,
} from './responsible-selection-policy.js';

test('mantem a escolha de responsavel aberta por 30 minutos', () => {
  assert.equal(DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES, 30);
});

test('usa Sistema automaticamente apenas no PIX CNPJ expirado', () => {
  assert.equal(expiredResponsibleSelectionFallback('pix_cnpj'), 'Sistema');
  assert.equal(expiredResponsibleSelectionFallback('sangria'), null);
  assert.equal(expiredResponsibleSelectionFallback('pedido_create'), null);
  assert.equal(expiredResponsibleSelectionFallback('pedido_cancel'), null);
  assert.equal(expiredResponsibleSelectionFallback('tarefa_status'), null);
});

test('avisa o prazo e o fallback no pedido de responsavel do PIX', () => {
  assert.equal(
    responsibleSelectionInstruction('pix_cnpj', 30),
    'Responda com o numero ou nome. Para cancelar, digite cancelar. Se ninguem responder em 30 minutos, vou registrar como Sistema.',
  );
  assert.equal(
    responsibleSelectionInstruction('sangria', 30),
    'Responda com o numero ou nome. Para cancelar, digite cancelar.',
  );
  assert.equal(
    responsibleSelectionInstruction('pix_cnpj', 30, 'Responda com o numero ou nome. Se nao for isso, digite cancelar.'),
    'Responda com o numero ou nome. Se nao for isso, digite cancelar. Se ninguem responder em 30 minutos, vou registrar como Sistema.',
  );
});
