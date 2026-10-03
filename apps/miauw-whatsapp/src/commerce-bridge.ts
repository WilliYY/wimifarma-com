import crypto from 'node:crypto';
import express from 'express';
import type { Pool } from 'pg';

export type CommerceEvent = { eventId: string; type: 'cart' | 'order' | 'payment' | 'test'; text: string };
export type Delivery = { event_id: string; fingerprint: string; state: 'sending' | 'accepted' | 'blocked' | 'uncertain'; provider_message_id: string | null };
export interface CommerceStore {
  reserve(eventId: string, fingerprint: string): Promise<{ delivery: Delivery; claimed: boolean }>;
  finish(eventId: string, state: Delivery['state'], messageId?: string): Promise<void>;
}

export const COMMERCE_SCHEMA = `CREATE TABLE IF NOT EXISTS miauby_commerce_deliveries (
  event_id VARCHAR(160) PRIMARY KEY,
  fingerprint CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL CHECK (state IN ('sending', 'accepted', 'blocked', 'uncertain')),
  provider_message_id VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

export function postgresCommerceStore(pool: Pool): CommerceStore {
  return {
    async reserve(eventId, fingerprint) {
      const inserted = await pool.query<Delivery>(`INSERT INTO miauby_commerce_deliveries (event_id, fingerprint, state)
        VALUES ($1, $2, 'sending') ON CONFLICT DO NOTHING RETURNING *`, [eventId, fingerprint]);
      if (inserted.rows[0]) return { delivery: inserted.rows[0], claimed: true };
      // A process crash or lost response must never cause an automatic second send.
      await pool.query(`UPDATE miauby_commerce_deliveries SET state = 'uncertain', updated_at = NOW()
        WHERE event_id = $1 AND state = 'sending' AND updated_at < NOW() - INTERVAL '2 minutes'`, [eventId]);
      const reclaimed = await pool.query<Delivery>(`UPDATE miauby_commerce_deliveries SET state = 'sending', updated_at = NOW()
        WHERE event_id = $1 AND fingerprint = $2 AND state = 'blocked' RETURNING *`, [eventId, fingerprint]);
      if (reclaimed.rows[0]) return { delivery: reclaimed.rows[0], claimed: true };
      const result = await pool.query<Delivery>('SELECT * FROM miauby_commerce_deliveries WHERE event_id = $1', [eventId]);
      return { delivery: result.rows[0], claimed: false };
    },
    async finish(eventId, state, messageId) {
      await pool.query(`UPDATE miauby_commerce_deliveries SET state = $2, provider_message_id = $3, updated_at = NOW()
        WHERE event_id = $1 AND state = 'sending'`, [eventId, state, messageId || null]);
    },
  };
}

export function parseCommerceEvent(value: unknown): CommerceEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !['eventId', 'type', 'text'].includes(key))) return null;
  if (typeof event.eventId !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(event.eventId)) return null;
  if (typeof event.type !== 'string' || !['cart', 'order', 'payment', 'test'].includes(event.type)) return null;
  if (typeof event.text !== 'string' || !event.text.trim() || event.text.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(event.text)) return null;
  return { eventId: event.eventId, type: event.type as CommerceEvent['type'], text: event.text };
}

export function commerceTokenAuthorized(expected: string, authorization: string): boolean {
  if (!expected || !authorization.startsWith('Bearer ')) return false;
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(expected), digest(authorization.slice(7)));
}

function response(delivery: Delivery, duplicate: boolean) {
  const status = delivery.state === 'sending' ? 'uncertain' : delivery.state;
  return { ok: status === 'accepted', eventId: delivery.event_id, status,
    messageId: delivery.provider_message_id, accepted: status === 'accepted', delivered: null,
    uncertain: status === 'uncertain', duplicate, retryable: status === 'blocked' };
}

export function createCommerceBridge(options: {
  token: string; recipient: string; store: CommerceStore;
  preflight: () => Promise<string | null>;
  send: (recipient: string, text: string) => Promise<string>;
  connection: () => Promise<boolean | null>;
  timeoutMs?: number;
}) {
  const configured = /^\d{10,15}$/.test(options.recipient);
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.token) { res.status(503).json({ ok: false, error: 'commerce_token_not_configured' }); return; }
    if (!commerceTokenAuthorized(options.token, req.get('authorization') || '')) {
      res.status(401).json({ ok: false, error: 'unauthorized' }); return;
    }
    next();
  });
  router.get('/status', async (_req, res, next) => {
    try {
      const blocked = configured ? await options.preflight() : 'recipient_not_configured';
      let connected: boolean | null = null;
      try { connected = await options.connection(); } catch { /* Connection remains unknown. */ }
      res.json({ ok: true, configured, enabled: !blocked, blocked, connected,
        recipientHint: configured ? `****${options.recipient.slice(-4)}` : '' });
    } catch (error) { next(error); }
  });
  router.post('/alerts', async (req, res, next) => {
    const event = parseCommerceEvent(req.body);
    if (!event) { res.status(400).json({ ok: false, error: 'invalid_commerce_event' }); return; }
    try {
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
      const reservation = await options.store.reserve(event.eventId, fingerprint);
      if (reservation.delivery.fingerprint !== fingerprint) {
        res.status(409).json({ ok: false, error: 'event_payload_conflict' }); return;
      }
      if (!reservation.claimed) { res.json(response(reservation.delivery, true)); return; }
      let blocked: string | null;
      try { blocked = configured ? await options.preflight() : 'recipient_not_configured'; }
      catch { blocked = 'preflight_unavailable'; }
      if (blocked) {
        await options.store.finish(event.eventId, 'blocked');
        res.json({ ...response({ ...reservation.delivery, state: 'blocked' }, false), reason: blocked }); return;
      }
      let messageId = '';
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        messageId = await Promise.race([
          options.send(options.recipient, event.text),
          new Promise<string>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('commerce_send_timeout')), options.timeoutMs ?? 90000); }),
        ]);
        if (typeof messageId !== 'string' || messageId.length > 180) messageId = '';
        messageId = messageId.trim();
      } catch { /* After transport invocation the outcome is uncertain, including gate errors. */ }
      finally { if (timer) clearTimeout(timer); }
      const state = messageId ? 'accepted' : 'uncertain';
      await options.store.finish(event.eventId, state, messageId);
      res.json(response({ ...reservation.delivery, state, provider_message_id: messageId || null }, false));
    } catch (error) { next(error); }
  });
  return router;
}
