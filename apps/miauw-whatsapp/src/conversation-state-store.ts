import type { Pool } from 'pg';

import {
  applyConversationMemoryEffect,
  resolveConversationMemory,
  type ConversationChannel,
  type ConversationEffectPayload,
  type ConversationMemoryResult,
  type ConversationStatePayload,
} from './conversation-memory-client.js';

export const STRUCTURED_CONVERSATION_STATE_KEY = 'structured_conversation';
const STRUCTURED_CONVERSATION_RETENTION_DAYS = 7;

export type ConversationStateTransitionInput = {
  storageHash: string;
  storageMask: string;
  sourceEventId: string | null;
  traceId: string;
  message: string;
  channel: ConversationChannel;
  userId: string;
  conversationId: string;
  sessionId: string;
};

export type ConversationStateStoreOptions = {
  resolverUrl: string;
  effectUrl?: string;
  resolverToken: string;
  resolverTimeoutMs: number;
  resolver?: typeof resolveConversationMemory;
};

export type ConversationStateEffectInput = Omit<ConversationStateTransitionInput, 'message'> & {
  effect: ConversationEffectPayload;
};

type StateRow = {
  payload: ConversationStatePayload;
};

export async function hasActiveConversationState(pool: Pool, storageHashes: string[]): Promise<boolean> {
  const hashes = storageHashes.map(cleanHash).filter(Boolean);
  if (!hashes.length) return false;

  await pool.query(
    `UPDATE miauw_whatsapp_conversation_states
        SET status = 'expired',
            payload = '{}'::jsonb,
            consumed_at = COALESCE(consumed_at, NOW()),
            updated_at = NOW()
      WHERE state_key = $1
        AND status = 'pending'
        AND expires_at <= NOW()`,
    [STRUCTURED_CONVERSATION_STATE_KEY],
  );
  await pool.query(
    `DELETE FROM miauw_whatsapp_conversation_states
      WHERE state_key = $1
        AND status IN ('consumed', 'cancelled', 'expired')
        AND updated_at < NOW() - ($2::int * INTERVAL '1 day')`,
    [STRUCTURED_CONVERSATION_STATE_KEY, STRUCTURED_CONVERSATION_RETENTION_DAYS],
  );
  const result = await pool.query<{ exists: string }>(
    `SELECT '1' AS exists
       FROM miauw_whatsapp_conversation_states
      WHERE sender_phone_hash = ANY($1::text[])
        AND state_key = $2
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1`,
    [hashes, STRUCTURED_CONVERSATION_STATE_KEY],
  );
  return Boolean(result.rows[0]);
}

export async function transitionConversationState(
  pool: Pool,
  input: ConversationStateTransitionInput,
  options: ConversationStateStoreOptions,
): Promise<ConversationMemoryResult> {
  const storageHash = cleanHash(input.storageHash);
  if (!storageHash) return unavailable('invalid_conversation_storage_hash');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${STRUCTURED_CONVERSATION_STATE_KEY}:${storageHash}`],
    );
    await client.query(
      `UPDATE miauw_whatsapp_conversation_states
          SET status = 'expired',
              payload = '{}'::jsonb,
              consumed_at = COALESCE(consumed_at, NOW()),
              updated_at = NOW()
        WHERE sender_phone_hash = $1
          AND state_key = $2
          AND status = 'pending'
          AND expires_at <= NOW()`,
      [storageHash, STRUCTURED_CONVERSATION_STATE_KEY],
    );
    await client.query(
      `DELETE FROM miauw_whatsapp_conversation_states
        WHERE state_key = $1
          AND status IN ('consumed', 'cancelled', 'expired')
          AND updated_at < NOW() - ($2::int * INTERVAL '1 day')`,
      [STRUCTURED_CONVERSATION_STATE_KEY, STRUCTURED_CONVERSATION_RETENTION_DAYS],
    );
    const stored = await client.query<StateRow>(
      `SELECT payload
         FROM miauw_whatsapp_conversation_states
        WHERE sender_phone_hash = $1
          AND state_key = $2
          AND status = 'pending'
          AND expires_at > NOW()
        FOR UPDATE`,
      [storageHash, STRUCTURED_CONVERSATION_STATE_KEY],
    );
    const resolver = options.resolver || resolveConversationMemory;
    const resolved = await resolver(input.message, {
      url: options.resolverUrl,
      token: options.resolverToken,
      timeoutMs: options.resolverTimeoutMs,
      channel: input.channel,
      userId: input.userId,
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      state: stored.rows[0]?.payload || null,
    });

    if (!resolved.ok || !resolved.result) {
      await client.query('COMMIT');
      return resolved;
    }

    if (!stored.rows[0] && resolved.result.status === 'inactive') {
      await client.query('COMMIT');
      return resolved;
    }

    const state = resolved.result.state;
    const status = state.active === true
      ? 'pending'
      : resolved.result.status === 'expired' ? 'expired' : 'cancelled';
    const expiresAt = validFutureIso(state.expiresAt);
    await client.query(
      `INSERT INTO miauw_whatsapp_conversation_states (
         sender_phone_hash, state_key, sender_phone_mask, payload, status,
         source_event_id, trace_id, expires_at, consumed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::timestamptz, NULL)
       ON CONFLICT (sender_phone_hash, state_key) DO UPDATE SET
         sender_phone_mask = EXCLUDED.sender_phone_mask,
         payload = EXCLUDED.payload,
         status = EXCLUDED.status,
         source_event_id = EXCLUDED.source_event_id,
         trace_id = EXCLUDED.trace_id,
         expires_at = EXCLUDED.expires_at,
         consumed_at = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE NOW() END,
         updated_at = NOW()`,
      [
        storageHash,
        STRUCTURED_CONVERSATION_STATE_KEY,
        String(input.storageMask || '').slice(0, 40),
        JSON.stringify(state),
        status,
        input.sourceEventId || null,
        String(input.traceId || '').slice(0, 32),
        expiresAt,
      ],
    );
    await client.query('COMMIT');
    return resolved;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function applyStoredConversationEffect(
  pool: Pool,
  input: ConversationStateEffectInput,
  options: Omit<ConversationStateStoreOptions, 'resolver'>,
): Promise<boolean> {
  const storageHash = cleanHash(input.storageHash);
  if (!storageHash) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${STRUCTURED_CONVERSATION_STATE_KEY}:${storageHash}`],
    );
    const stored = await client.query<StateRow>(
      `SELECT payload
         FROM miauw_whatsapp_conversation_states
        WHERE sender_phone_hash = $1
          AND state_key = $2
          AND status = 'pending'
          AND expires_at > NOW()
        FOR UPDATE`,
      [storageHash, STRUCTURED_CONVERSATION_STATE_KEY],
    );
    const state = stored.rows[0]?.payload || null;
    if (!state) {
      await client.query('COMMIT');
      return false;
    }
    const applied = await applyConversationMemoryEffect(input.effect, {
      url: options.effectUrl || options.resolverUrl.replace(/\/resolve\/?$/i, '/effect'),
      token: options.resolverToken,
      timeoutMs: options.resolverTimeoutMs,
      channel: input.channel,
      userId: input.userId,
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      state,
    });
    if (!applied.ok || !applied.state) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      `UPDATE miauw_whatsapp_conversation_states
          SET payload = $3::jsonb,
              source_event_id = $4,
              trace_id = $5,
              expires_at = $6::timestamptz,
              updated_at = NOW()
        WHERE sender_phone_hash = $1 AND state_key = $2`,
      [
        storageHash,
        STRUCTURED_CONVERSATION_STATE_KEY,
        JSON.stringify(applied.state),
        input.sourceEventId || null,
        String(input.traceId || '').slice(0, 32),
        validFutureIso(applied.state.expiresAt),
      ],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function validFutureIso(value: unknown): string {
  const parsed = new Date(String(value || ''));
  if (Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now()) return parsed.toISOString();
  return new Date(Date.now() + 60_000).toISOString();
}

function cleanHash(value: unknown): string {
  const clean = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(clean) ? clean : '';
}

function unavailable(error: string): ConversationMemoryResult {
  return { ok: false, error, result: null };
}
