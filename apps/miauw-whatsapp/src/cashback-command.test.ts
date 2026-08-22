import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuickCashbackRequest, formatQuickCashbackReply } from './cashback-command.js';
import type { SemanticMessageResult } from './semantic-interpreter-client.js';

function semantic(entities: SemanticMessageResult['entities']): SemanticMessageResult {
  return {
    status: 'resolved',
    message: 'cashback 35',
    intent: 'criar_cashback_rapido',
    module: 'cashback',
    confidence: 0.99,
    clarification: '',
    entities,
  };
}

test('monta emissao anonima sem solicitar impressao remota', () => {
  const request = buildQuickCashbackRequest(semantic([
    { type: 'money', value: '35', raw: '35', confidence: 0.99 },
  ]), 7, 'trace-1');

  assert.equal(request.gross_amount, '35');
  assert.equal(request.actor_user_id, 7);
  assert.equal(request.request_id, 'whatsapp:trace-1');
  assert.equal(request.request_print, false);
  assert.equal(request.customer.client_id, null);
});

test('preserva cliente, telefone e CPF sem confundir numeros com valor', () => {
  const request = buildQuickCashbackRequest(semantic([
    { type: 'money', value: '35', raw: '35', confidence: 0.99 },
    { type: 'customer_id', value: '#139', raw: '#139', confidence: 0.98 },
    { type: 'customer_name', value: 'Maria Silva', raw: 'Maria Silva', confidence: 0.96 },
    { type: 'phone', value: '(44) 99999-9999', raw: '(44) 99999-9999', confidence: 0.98 },
    { type: 'document', value: '123.456.789-09', raw: '123.456.789-09', confidence: 0.98 },
  ]), 7, 'trace-2');

  assert.equal(request.gross_amount, '35');
  assert.equal(request.customer.client_id, 139);
  assert.equal(request.customer.phone, '(44) 99999-9999');
  assert.equal(request.customer.document, '123.456.789-09');
});

test('bloqueia contato sem vinculo a conta Wimifarma', () => {
  assert.throws(
    () => buildQuickCashbackRequest(semantic([
      { type: 'money', value: '35', raw: '35', confidence: 0.99 },
    ]), 0, 'trace-3'),
    /Vincule este WhatsApp/i,
  );
});

test('resposta do WhatsApp informa a limitacao real de impressao', () => {
  const reply = formatQuickCashbackReply({
    voucher: { gross_amount: 35, cashback_amount: 1.75 },
    customer: null,
    xp: { awarded: false },
  });

  assert.match(reply, /Cashback de R\$\s*1,75/i);
  assert.match(reply, /Miauby Interno/i);
  assert.doesNotMatch(reply, /impressao foi aberta/i);
});
