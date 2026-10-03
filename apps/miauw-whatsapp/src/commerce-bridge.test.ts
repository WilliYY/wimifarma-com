import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { commerceTokenAuthorized, createCommerceBridge, parseCommerceEvent, type CommerceStore, type Delivery } from './commerce-bridge.js';

const event = { eventId: 'br:order:opaque-id', type: 'order', text: 'Pedido novo; consulte o painel BR.' };

function memoryStore(): CommerceStore {
  const rows = new Map<string, Delivery>();
  return {
    async reserve(eventId, fingerprint) {
      const existing = rows.get(eventId);
      if (existing && !(existing.state === 'blocked' && existing.fingerprint === fingerprint)) {
        return { delivery: { ...existing }, claimed: false };
      }
      const delivery: Delivery = { event_id: eventId, fingerprint, state: 'sending', provider_message_id: null };
      rows.set(eventId, delivery);
      return { delivery: { ...delivery }, claimed: true };
    },
    async finish(eventId, state, messageId) {
      Object.assign(rows.get(eventId)!, { state, provider_message_id: messageId || null });
    },
  };
}

async function fixture(t: TestContext, options: {
  send?: (recipient: string, text: string) => Promise<string>; preflight?: () => Promise<string | null>; timeoutMs?: number;
  token?: string; recipient?: string;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use('/commerce', createCommerceBridge({
    token: 'exclusive-commerce-secret', recipient: '5544999999999', store: memoryStore(),
    preflight: async () => null, send: async () => 'provider-id', connection: async () => true, ...options,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/commerce`;
  return {
    async post(body = event) {
      const result = await fetch(`${base}/alerts`, { method: 'POST', headers: { authorization: 'Bearer exclusive-commerce-secret', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: result.status, body: await result.json() };
    },
    base,
  };
}

test('token exclusivo nao aceita fallback, query ou token ausente', () => {
  assert.equal(commerceTokenAuthorized('', 'Bearer anything'), false);
  assert.equal(commerceTokenAuthorized('commerce', 'Bearer legacy'), false);
  assert.equal(commerceTokenAuthorized('commerce', 'commerce'), false);
  assert.equal(commerceTokenAuthorized('commerce', 'Bearer commerce'), true);
});

test('valida tamanho, identificador opaco e nao permite destinatario no payload', () => {
  assert.ok(parseCommerceEvent(event));
  assert.equal(parseCommerceEvent({ ...event, recipient: '5544999999999' }), null);
  assert.ok(parseCommerceEvent({ ...event, text: 'x'.repeat(3000) }));
  assert.equal(parseCommerceEvent({ ...event, text: 'x'.repeat(3001) }), null);
  assert.equal(parseCommerceEvent({ ...event, eventId: 'email@example.com' }), null);
  assert.equal(parseCommerceEvent({ ...event, type: ['order'] }), null);
});

test('reserva concorrente envia uma vez e rejeita payload divergente', async (t) => {
  let calls = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => { release = resolve; });
  const api = await fixture(t, { send: async (recipient) => { assert.equal(recipient, '5544999999999'); calls++; return pending; } });
  const first = api.post();
  while (!calls) await new Promise((resolve) => setTimeout(resolve, 1));
  const duplicate = await api.post();
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.retryable, false);
  assert.equal(duplicate.body.uncertain, true);
  release('provider-id');
  assert.equal((await first).body.accepted, true);
  const previous = await api.post();
  assert.equal(previous.body.messageId, 'provider-id');
  assert.equal(previous.body.delivered, null);
  assert.equal((await api.post({ ...event, text: 'different' })).status, 409);
  assert.equal(calls, 1);
});

test('pausa bloqueia antes do transporte e permite tentativa posterior', async (t) => {
  let paused = true;
  let calls = 0;
  const api = await fixture(t, { preflight: async () => paused ? 'provider_paused' : null, send: async () => { calls++; return 'id'; } });
  const blocked = await api.post();
  assert.equal(blocked.body.status, 'blocked');
  assert.equal(blocked.body.retryable, true);
  assert.equal(calls, 0);
  paused = false;
  assert.equal((await api.post()).body.accepted, true);
  assert.equal(calls, 1);
});

for (const scenario of ['empty', 'error', 'timeout']) {
  test(`resultado ${scenario} fica incerto e nao reenvia`, async (t) => {
    let calls = 0;
    const api = await fixture(t, { timeoutMs: 10, send: async () => {
      calls++;
      if (scenario === 'error') throw new Error('provider failed');
      if (scenario === 'timeout') return new Promise<string>(() => {});
      return '';
    } });
    assert.equal((await api.post()).body.status, 'uncertain');
    const duplicate = await api.post();
    assert.equal(duplicate.body.retryable, false);
    assert.equal(duplicate.body.accepted, false);
    assert.equal(calls, 1);
  });
}

test('status exige token proprio e nao revela destinatario nem segredo', async (t) => {
  const api = await fixture(t);
  assert.equal((await fetch(`${api.base}/status?token=exclusive-commerce-secret`)).status, 401);
  const result = await fetch(`${api.base}/status`, { headers: { authorization: 'Bearer exclusive-commerce-secret' } });
  const body = await result.json();
  assert.equal(body.connected, true);
  assert.equal(body.configured, true);
  assert.equal(body.recipientHint, '****9999');
  assert.equal(JSON.stringify(body).includes('5544999999999'), false);
  assert.equal(JSON.stringify(body).includes('exclusive-commerce-secret'), false);
});

test('canal desligado e destinatario ausente bloqueiam sem invocar transporte', async (t) => {
  for (const options of [{ preflight: async () => 'channel_disabled' }, { recipient: '' }]) {
    let calls = 0;
    const api = await fixture(t, { ...options, send: async () => { calls++; return 'id'; } });
    const blocked = await api.post();
    assert.equal(blocked.body.status, 'blocked');
    assert.equal(blocked.body.retryable, true);
    assert.equal(calls, 0);
  }
});

test('token nao configurado fecha status e envio', async (t) => {
  const api = await fixture(t, { token: '' });
  assert.equal((await fetch(`${api.base}/status`)).status, 503);
  assert.equal((await api.post()).status, 503);
});
