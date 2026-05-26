import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import pg from 'pg';

const { Pool } = pg;

type JsonRecord = Record<string, unknown>;

type IncomingMessage = {
  provider: 'evolution';
  instanceName: string;
  eventType: string;
  eventId: string;
  messageId: string;
  remoteJid: string;
  senderPhone: string;
  pushName: string;
  messageType: string;
  bodyText: string;
  fromMe: boolean;
  isGroup: boolean;
  payloadSummary: JsonRecord;
};

type QueueRow = {
  id: string;
  trace_id: string;
  instance_name: string;
  message_id: string;
  sender_phone_ciphertext: string;
  sender_phone_mask: string;
  body_text: string;
  attempts: number;
};

const env = process.env;
const SERVICE_NAME = 'miauw-whatsapp';
const SERVICE_VERSION = '0.1.0';
const BASE_PATH = normalizeBasePath(env.BASE_PATH || env.MIAUW_WHATSAPP_BASE_PATH || '/miauw/whatsapp');
const PORT = numberEnv('PORT', 3400, 1, 65535);
const ENABLED = boolEnv('MIAUW_WHATSAPP_ENABLED', false);
const WEBHOOK_TOKEN = textEnv('MIAUW_WHATSAPP_WEBHOOK_TOKEN');
const INTERNAL_TOKEN = textEnv('MIAUW_WHATSAPP_INTERNAL_TOKEN') || textEnv('MIAUW_AGENT_INTERNAL_TOKEN') || textEnv('MIAUW_GUARDIAN_TOKEN');
const CRYPTO_SECRET = textEnv('MIAUW_WHATSAPP_ENCRYPTION_KEY') || WEBHOOK_TOKEN || INTERNAL_TOKEN;
const HASH_SALT = textEnv('MIAUW_WHATSAPP_HASH_SALT') || CRYPTO_SECRET || 'wimifarma-miauw-whatsapp-dev-salt';
const EVOLUTION_API_BASE_URL = trimTrailingSlash(textEnv('EVOLUTION_API_BASE_URL'));
const EVOLUTION_API_KEY = textEnv('EVOLUTION_API_KEY');
const EVOLUTION_INSTANCE = textEnv('EVOLUTION_API_INSTANCE') || textEnv('MIAUW_WHATSAPP_EVOLUTION_INSTANCE') || 'wimifarma-cashback-test';
const AGENT_RUN_URL = textEnv('MIAUW_WHATSAPP_AGENT_RUN_URL')
  || `${trimTrailingSlash(textEnv('MIAUW_AGENT_INTERNAL_BASE_URL') || 'http://wimifarma-miauw-agent:3100/miauw/agent')}/run`;
const REQUIRE_PREFIX = boolEnv('MIAUW_WHATSAPP_REQUIRE_PREFIX', true);
const PREFIX = (textEnv('MIAUW_WHATSAPP_PREFIX') || 'miauby').toLowerCase();
const GROUPS_ENABLED = boolEnv('MIAUW_WHATSAPP_GROUPS_ENABLED', false);
const MAX_REPLIES_PER_INBOUND = numberEnv('MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND', 1, 0, 3);
const USER_RATE_LIMIT_PER_MINUTE = numberEnv('MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE', 6, 1, 60);
const USER_RATE_LIMIT_PER_DAY = numberEnv('MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY', 120, 1, 1000);
const MIN_REPLY_DELAY_MS = numberEnv('MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS', 700, 0, 15000);
const MAX_REPLY_DELAY_MS = Math.max(MIN_REPLY_DELAY_MS, numberEnv('MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS', 2200, 0, 30000));
const WORKER_INTERVAL_MS = numberEnv('MIAUW_WHATSAPP_WORKER_INTERVAL_MS', 5000, 1000, 60000);
const WORKER_BATCH_SIZE = numberEnv('MIAUW_WHATSAPP_WORKER_BATCH_SIZE', 5, 1, 20);
const MAX_ATTEMPTS = numberEnv('MIAUW_WHATSAPP_MAX_ATTEMPTS', 5, 1, 12);
const REQUEST_TIMEOUT_MS = numberEnv('MIAUW_WHATSAPP_REQUEST_TIMEOUT_MS', 18000, 3000, 60000);
const ALLOWED_SENDERS = parseAllowedSenders(textEnv('MIAUW_WHATSAPP_ALLOWED_SENDERS') || textEnv('MIAUW_WHATSAPP_ALLOWED_NUMBERS'));

const pgPool = new Pool({
  host: env.POSTGRES_HOST || '127.0.0.1',
  port: Number(env.POSTGRES_PORT || 5432),
  database: env.POSTGRES_DB || 'wimifarma_miauw_whatsapp',
  user: env.POSTGRES_USER || 'wimifarma_miauw_whatsapp',
  password: env.POSTGRES_PASSWORD || '',
  max: 10,
});

function normalizeBasePath(value: string): string {
  const clean = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return clean || '/miauw/whatsapp';
}

function textEnv(name: string): string {
  return String(env[name] || '').trim();
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = textEnv(name).toLowerCase();
  if (['1', 'true', 'yes', 'sim', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(value)) return false;
  return fallback;
}

function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(textEnv(name), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function maskPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length <= 4) return '****';
  return `***${digits.slice(-4)}`;
}

function parseAllowedSenders(value: string): Set<string> {
  const set = new Set<string>();
  for (const item of value.split(/[,\s;]+/g)) {
    const phone = normalizePhone(item);
    if (phone) set.add(phone);
  }
  return set;
}

function phoneAllowed(phone: string): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized || ALLOWED_SENDERS.size === 0) return false;
  if (ALLOWED_SENDERS.has(normalized)) return true;
  for (const allowed of ALLOWED_SENDERS) {
    if (normalized.endsWith(allowed) || allowed.endsWith(normalized)) return true;
  }
  return false;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(HASH_SALT).update(':').update(value).digest('hex');
}

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(CRYPTO_SECRET).digest();
}

function encryptText(value: string): string {
  if (!CRYPTO_SECRET) {
    throw new Error('MIAUW_WHATSAPP_ENCRYPTION_KEY ausente');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptText(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('ciphertext invalido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function authTokenFromRequest(req: Request): string {
  const auth = String(req.get('authorization') || '').trim();
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return safeText(
    req.get('x-miauw-whatsapp-token')
      || req.get('x-webhook-token')
      || req.get('x-evolution-webhook-token')
      || req.query.token
      || '',
    300,
  );
}

function requireWebhookToken(req: Request, res: Response, next: NextFunction) {
  if (!ENABLED) {
    return next();
  }
  if (!WEBHOOK_TOKEN) {
    return res.status(503).json({ ok: false, error: 'webhook_token_not_configured' });
  }
  const received = authTokenFromRequest(req);
  if (!received || !timingSafeStringEqual(received, WEBHOOK_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'internal_token_not_configured' });
  }
  const received = safeText(req.get('x-miauw-whatsapp-token') || req.get('x-miauw-agent-token') || req.get('x-miauw-internal-token') || '', 300);
  if (!received || !timingSafeStringEqual(received, INTERNAL_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function payloadSummary(payload: JsonRecord, data: JsonRecord, messageType: string): JsonRecord {
  return {
    event: safeText(payload.event || payload.type || '', 80),
    instance: safeText(payload.instance || data.instance || data.instanceName || '', 120),
    message_type: messageType,
    has_message: isRecord(data.message),
    has_key: isRecord(data.key),
    source: 'evolution',
  };
}

function readNestedRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  return isRecord(value) ? value : {};
}

function firstMessageText(message: JsonRecord): { type: string; text: string } {
  const conversation = safeText(message.conversation, 4000);
  if (conversation) return { type: 'conversation', text: conversation };

  const extended = readNestedRecord(message, 'extendedTextMessage');
  const extendedText = safeText(extended.text, 4000);
  if (extendedText) return { type: 'extendedTextMessage', text: extendedText };

  const image = readNestedRecord(message, 'imageMessage');
  const imageCaption = safeText(image.caption, 4000);
  if (imageCaption) return { type: 'imageMessage', text: imageCaption };

  const video = readNestedRecord(message, 'videoMessage');
  const videoCaption = safeText(video.caption, 4000);
  if (videoCaption) return { type: 'videoMessage', text: videoCaption };

  const buttons = readNestedRecord(message, 'buttonsResponseMessage');
  const buttonText = safeText(buttons.selectedDisplayText || buttons.selectedButtonId, 4000);
  if (buttonText) return { type: 'buttonsResponseMessage', text: buttonText };

  const list = readNestedRecord(message, 'listResponseMessage');
  const listReply = isRecord(list.singleSelectReply) ? list.singleSelectReply : {};
  const listText = safeText(list.title || listReply.selectedRowId || '', 4000);
  if (listText) return { type: 'listResponseMessage', text: listText };

  const keys = Object.keys(message);
  return { type: keys[0] || 'unknown', text: '' };
}

function extractIncomingMessage(payload: unknown): IncomingMessage | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload.data) ? payload.data : payload;
  const key = readNestedRecord(data, 'key');
  const message = readNestedRecord(data, 'message');
  const messageInfo = firstMessageText(message);

  const remoteJid = safeText(
    key.remoteJid
      || data.remoteJid
      || data.remote_jid
      || data.sender
      || data.from
      || '',
    180,
  );
  const senderPhone = normalizePhone(remoteJid || data.sender || data.from);
  const eventType = safeText(payload.event || payload.type || 'messages.upsert', 80);
  const instanceName = safeText(payload.instance || data.instance || data.instanceName || EVOLUTION_INSTANCE, 120) || EVOLUTION_INSTANCE;
  const rawMessageId = safeText(key.id || data.id || data.messageId || data.message_id || '', 180);
  const messageId = rawMessageId || crypto.createHash('sha1').update(JSON.stringify(payload).slice(0, 4000)).digest('hex');
  const eventId = safeText(payload.event_id || payload.eventId || data.event_id || '', 180) || `${instanceName}:${eventType}:${messageId}`;
  const fromMe = key.fromMe === true || data.fromMe === true;
  const isGroup = remoteJid.includes('@g.us');

  return {
    provider: 'evolution',
    instanceName,
    eventType,
    eventId,
    messageId,
    remoteJid,
    senderPhone,
    pushName: safeText(data.pushName || data.senderName || data.notifyName || '', 120),
    messageType: safeText(data.messageType || messageInfo.type, 80) || 'unknown',
    bodyText: safeText(messageInfo.text, 4000),
    fromMe,
    isGroup,
    payloadSummary: payloadSummary(payload, data, messageInfo.type),
  };
}

function stripActivationPrefix(text: string): { accepted: boolean; text: string; reason: string } {
  const clean = text.trim();
  if (!REQUIRE_PREFIX) return { accepted: true, text: clean, reason: '' };
  const lower = clean.toLowerCase();
  if (lower === PREFIX) {
    return { accepted: false, text: '', reason: 'empty_after_prefix' };
  }
  if (lower.startsWith(`${PREFIX} `) || lower.startsWith(`${PREFIX},`) || lower.startsWith(`${PREFIX}:`)) {
    return { accepted: true, text: clean.slice(PREFIX.length).replace(/^[\s,:-]+/, '').trim(), reason: '' };
  }
  return { accepted: false, text: '', reason: 'missing_prefix' };
}

async function ensureSchema(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS miauw_whatsapp_contacts (
      id UUID PRIMARY KEY,
      phone_hash CHAR(64) NOT NULL UNIQUE,
      phone_mask VARCHAR(40) NOT NULL,
      display_name VARCHAR(120) NOT NULL DEFAULT '',
      linked_user_id INTEGER NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'allowed',
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (status IN ('allowed', 'blocked'))
    );

    CREATE TABLE IF NOT EXISTS miauw_whatsapp_events (
      id UUID PRIMARY KEY,
      provider VARCHAR(40) NOT NULL DEFAULT 'evolution',
      instance_name VARCHAR(120) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      provider_event_id VARCHAR(180) NOT NULL,
      message_id VARCHAR(180) NOT NULL,
      remote_jid_hash CHAR(64) NOT NULL,
      remote_jid_mask VARCHAR(60) NOT NULL,
      remote_jid_ciphertext TEXT NOT NULL,
      sender_phone_hash CHAR(64) NOT NULL,
      sender_phone_mask VARCHAR(40) NOT NULL,
      sender_phone_ciphertext TEXT NOT NULL,
      push_name VARCHAR(120) NOT NULL DEFAULT '',
      direction VARCHAR(20) NOT NULL DEFAULT 'inbound',
      message_type VARCHAR(80) NOT NULL DEFAULT 'unknown',
      body_text TEXT NOT NULL DEFAULT '',
      body_size INTEGER NOT NULL DEFAULT 0,
      payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'received',
      ignore_reason VARCHAR(80) NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ NULL,
      processed_at TIMESTAMPTZ NULL,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trace_id CHAR(32) NOT NULL,
      error_summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, instance_name, message_id),
      CHECK (direction IN ('inbound', 'outbound')),
      CHECK (status IN ('received', 'ignored', 'queued', 'processing', 'replied', 'failed', 'dead'))
    );

    CREATE TABLE IF NOT EXISTS miauw_whatsapp_outbox (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES miauw_whatsapp_events(id) ON DELETE CASCADE,
      provider VARCHAR(40) NOT NULL DEFAULT 'evolution',
      instance_name VARCHAR(120) NOT NULL,
      recipient_phone_hash CHAR(64) NOT NULL,
      recipient_phone_mask VARCHAR(40) NOT NULL,
      recipient_phone_ciphertext TEXT NOT NULL,
      body_text TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ NULL,
      provider_message_id VARCHAR(180) NOT NULL DEFAULT '',
      error_summary TEXT NOT NULL DEFAULT '',
      trace_id CHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead'))
    );

    CREATE INDEX IF NOT EXISTS idx_miauw_whatsapp_events_queue
      ON miauw_whatsapp_events (next_attempt_at, created_at)
      WHERE status = 'queued';
    CREATE INDEX IF NOT EXISTS idx_miauw_whatsapp_events_sender_created
      ON miauw_whatsapp_events (sender_phone_hash, created_at);
    CREATE INDEX IF NOT EXISTS idx_miauw_whatsapp_outbox_status
      ON miauw_whatsapp_outbox (status, next_attempt_at, created_at);
  `);
}

async function countRecentMessages(senderHash: string, interval: 'minute' | 'day'): Promise<number> {
  const expression = interval === 'minute' ? "NOW() - INTERVAL '1 minute'" : "NOW() - INTERVAL '1 day'";
  const result = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM miauw_whatsapp_events
      WHERE sender_phone_hash = $1
        AND status IN ('queued', 'processing', 'replied', 'failed', 'dead')
        AND created_at >= ${expression}`,
    [senderHash],
  );
  return Number(result.rows[0]?.count || 0);
}

async function upsertContact(message: IncomingMessage): Promise<void> {
  const phoneHash = sha256(message.senderPhone);
  await pgPool.query(
    `INSERT INTO miauw_whatsapp_contacts (id, phone_hash, phone_mask, display_name, status)
     VALUES ($1, $2, $3, $4, 'allowed')
     ON CONFLICT (phone_hash)
     DO UPDATE SET
       phone_mask = EXCLUDED.phone_mask,
       display_name = CASE WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name ELSE miauw_whatsapp_contacts.display_name END,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [crypto.randomUUID(), phoneHash, maskPhone(message.senderPhone), message.pushName],
  );
}

async function insertEvent(message: IncomingMessage, status: string, ignoreReason: string, bodyText: string): Promise<{ id: string; inserted: boolean }> {
  const remoteHash = sha256(message.remoteJid);
  const phoneHash = sha256(message.senderPhone);
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const params = [
    crypto.randomUUID(),
    message.provider,
    message.instanceName,
    message.eventType,
    message.eventId,
    message.messageId,
    remoteHash,
    message.isGroup ? 'grupo' : maskPhone(message.senderPhone),
    encryptText(message.remoteJid),
    phoneHash,
    maskPhone(message.senderPhone),
    encryptText(message.senderPhone),
    message.pushName,
    message.messageType,
    bodyText,
    bodyText.length,
    JSON.stringify(message.payloadSummary),
    status,
    ignoreReason,
    MAX_ATTEMPTS,
    traceId,
  ];

  const result = await pgPool.query<{ id: string; inserted: boolean }>(
    `WITH inserted AS (
       INSERT INTO miauw_whatsapp_events (
         id, provider, instance_name, event_type, provider_event_id, message_id,
         remote_jid_hash, remote_jid_mask, remote_jid_ciphertext,
         sender_phone_hash, sender_phone_mask, sender_phone_ciphertext,
         push_name, message_type, body_text, body_size, payload_summary,
         status, ignore_reason, max_attempts, trace_id
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15, $16, $17::jsonb,
         $18, $19, $20, $21
       )
       ON CONFLICT (provider, instance_name, message_id) DO NOTHING
       RETURNING id, true AS inserted
     ), duplicate AS (
       UPDATE miauw_whatsapp_events
          SET duplicate_count = duplicate_count + 1,
              last_seen_at = NOW(),
              updated_at = NOW()
        WHERE provider = $2 AND instance_name = $3 AND message_id = $6
          AND NOT EXISTS (SELECT 1 FROM inserted)
        RETURNING id, false AS inserted
     )
     SELECT id, inserted FROM inserted
     UNION ALL
     SELECT id, inserted FROM duplicate
     LIMIT 1`,
    params,
  );

  return result.rows[0] || { id: '', inserted: false };
}

async function acceptWebhook(payload: unknown): Promise<JsonRecord> {
  if (!ENABLED) {
    return { ok: true, accepted: false, reason: 'disabled' };
  }
  if (!CRYPTO_SECRET) {
    return { ok: false, accepted: false, reason: 'encryption_not_configured' };
  }

  const message = extractIncomingMessage(payload);
  if (!message) {
    return { ok: true, accepted: false, reason: 'unsupported_payload' };
  }

  const ignoreReasons: string[] = [];
  let bodyText = message.bodyText;
  if (message.fromMe) ignoreReasons.push('from_me');
  if (message.isGroup && !GROUPS_ENABLED) ignoreReasons.push('group_blocked');
  if (!message.senderPhone) ignoreReasons.push('missing_sender');
  if (!phoneAllowed(message.senderPhone)) ignoreReasons.push('sender_not_allowed');
  if (!bodyText) ignoreReasons.push('empty_or_unsupported_message');

  if (bodyText) {
    const prefix = stripActivationPrefix(bodyText);
    if (!prefix.accepted) {
      ignoreReasons.push(prefix.reason);
    } else {
      bodyText = prefix.text;
    }
  }

  if (message.senderPhone) {
    const senderHash = sha256(message.senderPhone);
    const minuteCount = await countRecentMessages(senderHash, 'minute');
    const dayCount = await countRecentMessages(senderHash, 'day');
    if (minuteCount >= USER_RATE_LIMIT_PER_MINUTE) ignoreReasons.push('rate_limited_minute');
    if (dayCount >= USER_RATE_LIMIT_PER_DAY) ignoreReasons.push('rate_limited_day');
  }

  if (!ignoreReasons.length) {
    await upsertContact(message);
  }

  const status = ignoreReasons.length > 0 ? 'ignored' : 'queued';
  const inserted = await insertEvent(message, status, ignoreReasons[0] || '', bodyText);
  if (inserted.inserted && status === 'queued') {
    queueMicrotask(() => {
      processQueue(WORKER_BATCH_SIZE).catch((error) => console.error(redact(String(error))));
    });
  }

  return {
    ok: true,
    accepted: status === 'queued',
    duplicate: !inserted.inserted,
    event_id: inserted.id,
    status,
    reason: ignoreReasons[0] || '',
  };
}

async function nextQueueRow(): Promise<QueueRow | null> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<QueueRow>(
      `SELECT id, trace_id, instance_name, message_id, sender_phone_ciphertext, sender_phone_mask, body_text, attempts
         FROM miauw_whatsapp_events
        WHERE status = 'queued'
          AND next_attempt_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const row = result.rows[0] || null;
    if (!row) {
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      `UPDATE miauw_whatsapp_events
          SET status = 'processing',
              attempts = attempts + 1,
              locked_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processQueue(limit = WORKER_BATCH_SIZE): Promise<{ processed: number }> {
  if (!ENABLED) return { processed: 0 };
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await nextQueueRow();
    if (!row) break;
    processed += 1;
    await processQueueRow(row);
  }
  return { processed };
}

function backoffExpression(attempts: number): string {
  const seconds = Math.min(3600, Math.max(30, attempts * attempts * 30));
  return `${seconds} seconds`;
}

async function markEventFailure(row: QueueRow, error: unknown): Promise<void> {
  const attempts = Number(row.attempts || 0) + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  await pgPool.query(
    `UPDATE miauw_whatsapp_events
        SET status = $2,
            error_summary = $3,
            next_attempt_at = CASE WHEN $2 = 'queued' THEN NOW() + $4::interval ELSE next_attempt_at END,
            updated_at = NOW()
      WHERE id = $1`,
    [row.id, dead ? 'dead' : 'queued', safeError(error), backoffExpression(attempts)],
  );
}

async function processQueueRow(row: QueueRow): Promise<void> {
  try {
    if (MAX_REPLIES_PER_INBOUND < 1) {
      await pgPool.query(
        `UPDATE miauw_whatsapp_events
            SET status = 'ignored', ignore_reason = 'replies_disabled', processed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      return;
    }

    const recipientPhone = decryptText(row.sender_phone_ciphertext);
    const agentReply = await requestMiauwReply(row.body_text, row.trace_id, row.sender_phone_mask);
    const replyText = safeText(agentReply.text, 1800);
    if (!replyText) throw new Error('miauby_empty_reply');

    const outboxId = crypto.randomUUID();
    await pgPool.query(
      `INSERT INTO miauw_whatsapp_outbox (
        id, event_id, provider, instance_name, recipient_phone_hash, recipient_phone_mask,
        recipient_phone_ciphertext, body_text, max_attempts, trace_id
      ) VALUES ($1, $2, 'evolution', $3, $4, $5, $6, $7, $8, $9)`,
      [outboxId, row.id, row.instance_name || EVOLUTION_INSTANCE, sha256(recipientPhone), maskPhone(recipientPhone), encryptText(recipientPhone), replyText, MAX_ATTEMPTS, row.trace_id],
    );

    await sleep(randomInt(MIN_REPLY_DELAY_MS, MAX_REPLY_DELAY_MS));
    const providerMessageId = await sendEvolutionText(recipientPhone, replyText, row.instance_name || EVOLUTION_INSTANCE);

    await pgPool.query(
      `UPDATE miauw_whatsapp_outbox
          SET status = 'sent',
              attempts = attempts + 1,
              sent_at = NOW(),
              provider_message_id = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [outboxId, providerMessageId],
    );
    await pgPool.query(
      `UPDATE miauw_whatsapp_events
          SET status = 'replied',
              processed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
  } catch (error) {
    await markEventFailure(row, error);
  }
}

async function requestMiauwReply(message: string, traceId: string, senderMask: string): Promise<{ text: string }> {
  if (!INTERNAL_TOKEN) throw new Error('internal_token_not_configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(AGENT_RUN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Miauw-Agent-Token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        trace_id: traceId,
        message,
        user_context: {
          username: `whatsapp:${senderMask}`,
          role: 'whatsapp_interno',
        },
        style_context: {
          version: 'miauby-whatsapp-bridge-2026-05-26',
          route: {
            intent: 'whatsapp_interno',
            label: 'WhatsApp interno',
            budget_words: 90,
            use_tools: false,
            local_reply: false,
            allow_lists: false,
            tone: 'Miauby curto, pratico e seguro para WhatsApp interno',
            reason: 'Canal de mensagem curta com allowlist e sem escrita forte direta.',
          },
          hard_rules: [
            'Responda como canal interno de WhatsApp, em texto curto.',
            'Nao exponha dados sensiveis, token, SQL, stack trace ou bastidor tecnico.',
            'Nao afirme que executou escrita operacional pelo WhatsApp.',
            'Se precisar de acao forte, diga que precisa confirmar no sistema.',
          ],
          anti_patterns: [
            'tutorial longo',
            'lista de ferramentas',
            'confirmacao de escrita sem sessao',
          ],
        },
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(data) || data.ok !== true) {
      throw new Error(safeText(isRecord(data) ? data.message || data.error : '', 160) || `agent_http_${response.status}`);
    }
    return { text: safeText(data.text, 1800) };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEvolutionText(phone: string, text: string, instanceName: string): Promise<string> {
  if (!EVOLUTION_API_BASE_URL || !EVOLUTION_API_KEY || !instanceName) {
    throw new Error('evolution_not_configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${EVOLUTION_API_BASE_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: normalizePhone(phone),
        text,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(safeText(isRecord(data) ? data.message || data.error : '', 160) || `evolution_http_${response.status}`);
    }
    return safeText(isRecord(data) ? data.key && isRecord(data.key) ? data.key.id : data.id : '', 180);
  } finally {
    clearTimeout(timeout);
  }
}

function publicStatus(): JsonRecord {
  return {
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    base_path: BASE_PATH,
    enabled: ENABLED,
    postgres: 'configured',
    webhook_token_configured: WEBHOOK_TOKEN !== '',
    encryption_configured: CRYPTO_SECRET !== '',
    allowlist_count: ALLOWED_SENDERS.size,
    require_prefix: REQUIRE_PREFIX,
    prefix: REQUIRE_PREFIX ? PREFIX : '',
    groups_enabled: GROUPS_ENABLED,
    agent_configured: INTERNAL_TOKEN !== '' && AGENT_RUN_URL !== '',
    evolution_configured: EVOLUTION_API_BASE_URL !== '' && EVOLUTION_API_KEY !== '' && EVOLUTION_INSTANCE !== '',
    max_replies_per_inbound: MAX_REPLIES_PER_INBOUND,
    rate_limit_per_minute: USER_RATE_LIMIT_PER_MINUTE,
    rate_limit_per_day: USER_RATE_LIMIT_PER_DAY,
  };
}

function redact(value: string): string {
  return value
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .replace(/\b\d{10,14}\b/g, '[phone]');
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(safeText(message, 240));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ ok: false, error: 'invalid_json' });
    return;
  }
  next(error);
});

app.get(`${BASE_PATH}/health`, async (_req, res) => {
  try {
    await pgPool.query('SELECT 1');
    res.json(publicStatus());
  } catch (error) {
    res.status(503).json({ ...publicStatus(), ok: false, error: safeError(error) });
  }
});

app.get(`${BASE_PATH}/status`, (_req, res) => {
  res.json(publicStatus());
});

app.post(`${BASE_PATH}/webhook`, requireWebhookToken, async (req, res) => {
  const result = await acceptWebhook(req.body);
  res.status(result.ok === false ? 503 : 200).json(result);
});

app.post(`${BASE_PATH}/worker/run`, requireInternalToken, async (req, res) => {
  const limit = Math.max(1, Math.min(20, Number(req.body?.limit || WORKER_BATCH_SIZE)));
  const result = await processQueue(limit);
  res.json({ ok: true, ...result });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(safeError(error));
  res.status(500).json({ ok: false, error: 'internal_error' });
});

async function main(): Promise<void> {
  await ensureSchema();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`${SERVICE_NAME} ${SERVICE_VERSION} listening on ${PORT}${BASE_PATH}`);
  });
  setInterval(() => {
    processQueue(WORKER_BATCH_SIZE).catch((error) => console.error(safeError(error)));
  }, WORKER_INTERVAL_MS).unref();
}

main().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});
