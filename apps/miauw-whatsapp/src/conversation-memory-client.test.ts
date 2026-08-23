import assert from 'node:assert/strict';
import test from 'node:test';

import { applyConversationMemoryEffect, resolveConversationMemory } from './conversation-memory-client.js';

test('returns the structured resolver result from the shared agent', async () => {
  const result = await resolveConversationMemory('o segundo', {
    url: 'http://agent.test/miauw/agent/conversation/resolve',
    token: 'secret',
    timeoutMs: 500,
    channel: 'whatsapp',
    userId: '42',
    conversationId: 'phone-hash',
    sessionId: 'whatsapp',
    state: { active: true, revision: 3 },
    persistentState: { version: 1, currentTopic: 'encomendas' },
    fetchImpl: async (_input, init) => {
      const payload = JSON.parse(String(init?.body || '{}'));
      assert.equal(payload.message, 'o segundo');
      assert.equal(payload.user_id, '42');
      assert.equal(payload.state.revision, 3);
      assert.equal(payload.persistent_state.currentTopic, 'encomendas');
      return new Response(JSON.stringify({
        ok: true,
        result: {
          status: 'selected',
          reason: 'recent_entity_selected',
          message: 'Miauby encomendas da Maria',
          reply: '',
          state: { active: true, revision: 4 },
          persistentState: { version: 1, currentTopic: 'encomendas' },
          selectedEntity: { id: 'row-2', type: 'encomenda', label: 'Maria' },
          pendingAction: null,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result?.status, 'selected');
  assert.equal(result.result?.selectedEntity?.id, 'row-2');
  assert.equal(result.result?.persistentState?.currentTopic, 'encomendas');
});

test('fails closed when the shared resolver is unavailable', async () => {
  const result = await resolveConversationMemory('sim', {
    url: 'http://agent.test/miauw/agent/conversation/resolve',
    token: 'secret',
    timeoutMs: 100,
    channel: 'internal',
    userId: '7',
    conversationId: '12',
    sessionId: 'abc',
    state: null,
    persistentState: null,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'conversation_resolver_unavailable');
  assert.equal(result.result, null);
});

test('applies structured entities through the shared agent', async () => {
  const result = await applyConversationMemoryEffect({
    topic: 'encomendas',
    recentEntities: [{ id: 'row-7', type: 'encomenda', label: 'Maria' }],
  }, {
    url: 'http://agent.test/miauw/agent/conversation/effect',
    token: 'secret',
    timeoutMs: 500,
    channel: 'whatsapp',
    userId: '42',
    conversationId: 'phone-hash',
    sessionId: 'whatsapp',
    state: { active: true, revision: 2 },
    persistentState: null,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      state: { active: true, revision: 3, recentEntities: [{ id: 'row-7' }] },
      persistent_state: { version: 1, currentTopic: 'encomendas' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.state?.recentEntities, [{ id: 'row-7' }]);
  assert.equal(result.persistentState?.currentTopic, 'encomendas');
});
