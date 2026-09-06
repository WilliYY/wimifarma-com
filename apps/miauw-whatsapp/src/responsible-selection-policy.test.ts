import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES,
  expiredResponsibleSelectionFallback,
  responsibleSelectionInstruction,
  shouldFinalizeResponsibleSelectionBeforeMessage,
} from './responsible-selection-policy.js';

test('mantem a escolha de responsavel aberta por 30 minutos', () => {
  assert.equal(DEFAULT_RESPONSIBLE_SELECTION_TTL_MINUTES, 30);
});

test('usa Wimifarma automaticamente no PIX CNPJ e na sangria sem resposta', () => {
  assert.equal(expiredResponsibleSelectionFallback('pix_cnpj'), 'Wimifarma');
  assert.equal(expiredResponsibleSelectionFallback('sangria'), 'Wimifarma');
  assert.equal(expiredResponsibleSelectionFallback('pedido_create'), null);
  assert.equal(expiredResponsibleSelectionFallback('pedido_cancel'), null);
  assert.equal(expiredResponsibleSelectionFallback('tarefa_status'), null);
});

test('avisa o prazo e o fallback no pedido de responsavel do PIX', () => {
  assert.equal(
    responsibleSelectionInstruction('pix_cnpj', 30),
    'Responda com o numero ou nome. Para cancelar, digite cancelar. Se ninguem responder em 30 minutos ou se chegar outra mensagem antes da escolha, vou registrar como Wimifarma.',
  );
  assert.equal(
    responsibleSelectionInstruction('sangria', 30),
    'Responda com o numero ou nome. Para cancelar, digite cancelar. Se ninguem responder em 30 minutos ou se chegar outra mensagem antes da escolha, vou registrar como Wimifarma.',
  );
  assert.equal(
    responsibleSelectionInstruction('pix_cnpj', 30, 'Responda com o numero ou nome. Se nao for isso, digite cancelar.'),
    'Responda com o numero ou nome. Se nao for isso, digite cancelar. Se ninguem responder em 30 minutos ou se chegar outra mensagem antes da escolha, vou registrar como Wimifarma.',
  );
});

test('finaliza PIX ou sangria como Wimifarma somente quando chega outra mensagem', () => {
  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('pix_cnpj', false, false, false), true);
  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('sangria', false, false, false), true);
  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('pix_cnpj', true, false, false), true);

  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('pix_cnpj', false, true, false), false);
  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('pix_cnpj', false, false, true), false);
  assert.equal(shouldFinalizeResponsibleSelectionBeforeMessage('pedido_create', true, false, false), false);
});
