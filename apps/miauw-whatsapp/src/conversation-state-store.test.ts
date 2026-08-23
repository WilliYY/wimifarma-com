import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { hasActiveConversationState, transitionConversationState } from './conversation-state-store.js';
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

function result(status: 'confirm' | 'reply' | 'inactive', state: ConversationStatePayload) {
  return Promise.resolve({
    ok: true,
    error: '',
    result: {
      status,
      reason: status,
      message: '',
      reply: '',
      state: { ...state, active: status !== 'inactive', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      selectedEntity: null,
      pendingAction: null,
    },
  });
}

class FakePool {
  private state: ConversationStatePayload | null;
  private locked = false;
  private waiters: Array<() => void> = [];
  readonly statements: string[] = [];
  insertions = 0;

  constructor(initial: ConversationStatePayload | null) {
    this.state = initial;
  }

  get currentState(): ConversationStatePayload | null {
    return this.state;
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
          await this.acquire();
          ownsLock = true;
          return { rows: [] };
        }
        if (sql.includes('SELECT payload')) return { rows: this.state ? [{ payload: this.state }] : [] };
        if (sql.includes('INSERT INTO miauw_whatsapp_conversation_states')) {
          this.insertions += 1;
          this.state = JSON.parse(String(params[3] || '{}'));
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
