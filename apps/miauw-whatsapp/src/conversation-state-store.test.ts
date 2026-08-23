import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import {
  hasActiveConversationState,
  PERSISTENT_CONVERSATION_STATE_KEY,
  STRUCTURED_CONVERSATION_STATE_KEY,
  transitionConversationState,
} from './conversation-state-store.js';
import type { ConversationStatePayload } from './conversation-memory-client.js';

test('serializes concurrent confirmations and consumes a pending action once', async () => {
  const pool = new FakePool({
    active: true,
    revision: 1,
    pendingAction: { id: 'cancel-row-2', intent: 'cancelar_encomenda' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  let confirmations = 0;
  const resolver = async (_message: string, options: { state: ConversationStatePayload | null }) => {
    const pendingAction = options.state?.pendingAction;
    if (pendingAction) {
      confirmations += 1;
      return result('confirm', { ...options.state, revision: 2, pendingAction: null });
    }
    return result('reply', { ...options.state, revision: 3, pendingAction: null });
  };
  const input = {
    storageHash: 'a'.repeat(64),
    storageMask: '(**) *****-1234',
    sourceEventId: null,
    traceId: 'trace',
    message: 'sim',
    channel: 'whatsapp' as const,
    userId: '10',
    conversationId: 'a'.repeat(64),
    sessionId: 'whatsapp',
  };

  const [first, second] = await Promise.all([
    transitionConversationState(pool as unknown as Pool, input, { resolverUrl: 'url', resolverToken: 'token', resolverTimeoutMs: 500, resolver: resolver as never }),
    transitionConversationState(pool as unknown as Pool, input, { resolverUrl: 'url', resolverToken: 'token', resolverTimeoutMs: 500, resolver: resolver as never }),
  ]);

  assert.equal(confirmations, 1);
  assert.deepEqual([first.result?.status, second.result?.status].sort(), ['confirm', 'reply']);
});

test('does not persist an inactive message without prior conversation state', async () => {
  const pool = new FakePool(null);
  const resolver = async () => result('inactive', {
    active: false,
    revision: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const resolved = await transitionConversationState(pool as unknown as Pool, {
    storageHash: 'b'.repeat(64),
    storageMask: 'audit',
    sourceEventId: null,
    traceId: 'trace',
    message: 'sem contexto',
    channel: 'internal',
    userId: '20',
    conversationId: '30',
    sessionId: 'session-audit',
  }, { resolverUrl: 'url', resolverToken: 'token', resolverTimeoutMs: 500, resolver: resolver as never });

  assert.equal(resolved.result?.status, 'inactive');
  assert.equal(pool.insertions, 0);
  assert.equal(pool.currentState, null);
});

test('wipes expired payloads and prunes retained structured states', async () => {
  const pool = new FakePool(null);
  const active = await hasActiveConversationState(pool as unknown as Pool, ['c'.repeat(64)]);

  assert.equal(active, false);
  assert.equal(pool.statements.some((sql) => /payload\s*=\s*'\{\}'::jsonb/i.test(sql)), true);
  assert.equal(pool.statements.some((sql) => /DELETE FROM miauw_whatsapp_conversation_states/i.test(sql)), true);
});

test('loads and persists durable memory separately from the session state', async () => {
  const pool = new FakePool(null, {
    version: 1,
    channel: 'internal',
    userId: '20',
    currentTopic: 'encomendas',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const resolver = async (_message: string, options: {
    state: ConversationStatePayload | null;
    persistentState: ConversationStatePayload | null;
  }) => {
    assert.equal(options.state, null);
    assert.equal(options.persistentState?.currentTopic, 'encomendas');
    return result('reply', {
      active: true,
      revision: 1,
      currentTopic: 'falteiro',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, {
      version: 1,
      channel: 'internal',
      userId: '20',
      currentTopic: 'falteiro',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60_000).toISOString(),
    });
  };

  await transitionConversationState(pool as unknown as Pool, {
    storageHash: 'd'.repeat(64),
    storageMask: 'audit',
    sourceEventId: null,
    traceId: 'trace',
    message: 'Miauby falta losartana',
    channel: 'internal',
    userId: '20',
    conversationId: '31',
    sessionId: 'session-b',
  }, { resolverUrl: 'url', resolverToken: 'token', resolverTimeoutMs: 500, resolver: resolver as never });

  assert.equal(pool.stateFor(STRUCTURED_CONVERSATION_STATE_KEY)?.currentTopic, 'falteiro');
  assert.equal(pool.stateFor(PERSISTENT_CONVERSATION_STATE_KEY)?.currentTopic, 'falteiro');
  assert.equal(pool.insertionsByKey.get(STRUCTURED_CONVERSATION_STATE_KEY), 1);
  assert.equal(pool.insertionsByKey.get(PERSISTENT_CONVERSATION_STATE_KEY), 1);
});

test('explicit reset clears durable memory without carrying pending actions', async () => {
  const pool = new FakePool({
    active: true,
    revision: 3,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, {
    version: 1,
    channel: 'internal',
    userId: '20',
    currentTopic: 'encomendas',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const resolver = async () => result('reset', {
    active: false,
    revision: 4,
    expiresAt: new Date().toISOString(),
  }, null);

  await transitionConversationState(pool as unknown as Pool, {
    storageHash: 'e'.repeat(64),
    storageMask: 'audit',
    sourceEventId: null,
    traceId: 'trace',
    message: 'Miauby limpa contexto',
    channel: 'internal',
    userId: '20',
    conversationId: '31',
    sessionId: 'session-b',
  }, { resolverUrl: 'url', resolverToken: 'token', resolverTimeoutMs: 500, resolver: resolver as never });

  assert.equal(pool.persistentClears, 1);
  assert.equal(pool.stateFor(PERSISTENT_CONVERSATION_STATE_KEY), null);
});

function result(
  status: 'confirm' | 'reply' | 'inactive' | 'reset',
  state: ConversationStatePayload,
  persistentState: ConversationStatePayload | null = null,
) {
  return Promise.resolve({
    ok: true,
    error: '',
    result: {
      status,
      reason: status,
      message: '',
      reply: '',
      state: { ...state, active: !['inactive', 'reset'].includes(status), expiresAt: new Date(Date.now() + 60_000).toISOString() },
      persistentState,
      selectedEntity: null,
      pendingAction: null,
    },
  });
}

class FakePool {
  private states = new Map<string, ConversationStatePayload>();
  private locked = false;
  private waiters: Array<() => void> = [];
  readonly statements: string[] = [];
  insertions = 0;
  persistentClears = 0;
  readonly insertionsByKey = new Map<string, number>();

  constructor(initial: ConversationStatePayload | null, persistent: ConversationStatePayload | null = null) {
    if (initial) this.states.set(STRUCTURED_CONVERSATION_STATE_KEY, initial);
    if (persistent) this.states.set('persistent_user_context', persistent);
  }

  get currentState(): ConversationStatePayload | null {
    return this.stateFor(STRUCTURED_CONVERSATION_STATE_KEY);
  }

  stateFor(key: string): ConversationStatePayload | null {
    return this.states.get(key) || null;
  }

  async query(sql: string) {
    this.statements.push(sql);
    return { rows: [] };
  }

  async connect() {
    let ownsLock = false;
    return {
      query: async (sql: string, params: unknown[] = []) => {
        this.statements.push(sql);
        if (sql.includes('pg_advisory_xact_lock')) {
          if (!ownsLock) {
            await this.acquire();
            ownsLock = true;
          }
          return { rows: [] };
        }
        if (sql.includes('SELECT payload')) {
          const state = this.stateFor(String(params[1] || ''));
          return { rows: state ? [{ payload: state }] : [] };
        }
        if (sql.includes('INSERT INTO miauw_whatsapp_conversation_states')) {
          this.insertions += 1;
          const key = String(params[1] || '');
          this.insertionsByKey.set(key, (this.insertionsByKey.get(key) || 0) + 1);
          this.states.set(key, JSON.parse(String(params[3] || '{}')));
          return { rows: [] };
        }
        if (/status\s*=\s*'cancelled'/i.test(sql) && params[1] === PERSISTENT_CONVERSATION_STATE_KEY) {
          this.persistentClears += 1;
          this.states.delete(PERSISTENT_CONVERSATION_STATE_KEY);
          return { rows: [] };
        }
        if ((sql === 'COMMIT' || sql === 'ROLLBACK') && ownsLock) {
          ownsLock = false;
          this.release();
        }
        return { rows: [] };
      },
      release: () => {
        if (ownsLock) {
          ownsLock = false;
          this.release();
        }
      },
    };
  }

  private async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.locked = false;
  }
}
