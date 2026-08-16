import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSemanticMessage } from './semantic-interpreter-client.js';

test('usa a mensagem canonica retornada pelo interpretador central', async () => {
  const result = await resolveSemanticMessage('Miauby troco 30 sangria', {
    url: 'http://agent/interpret',
    token: 'test-token',
    timeoutMs: 100,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      status: 'resolved',
      intent: 'registrar_sangria',
      module: 'financeiro',
      confidence: 0.91,
      canonical_message: 'sangria 30 troco',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.message, 'sangria 30 troco');
  assert.equal(result.intent, 'registrar_sangria');
});

test('ambiguidade nao cai no parser legado', async () => {
  const result = await resolveSemanticMessage('Miauby cancelar pedido e tarefa', {
    url: 'http://agent/interpret',
    token: 'test-token',
    timeoutMs: 100,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      status: 'ambiguous',
      clarification: 'Voce quer cancelar o pedido ou a tarefa?',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.message, '');
  assert.match(result.clarification, /pedido ou a tarefa/i);
});

test('indisponibilidade preserva o formato legado', async () => {
  const result = await resolveSemanticMessage('miauby pedido anb 350', {
    url: 'http://agent/interpret',
    token: 'test-token',
    timeoutMs: 100,
    fetchImpl: async () => { throw new Error('offline'); },
  });

  assert.equal(result.status, 'fallback');
  assert.equal(result.message, 'miauby pedido anb 350');
});
