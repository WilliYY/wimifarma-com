import type { Pool } from 'pg';
import { pixReceiptAutoIdempotencyKey } from './pix-receipt-auto.js';

export const PIX_RECEIPT_IDENTITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS miauw_whatsapp_pix_receipt_identity_aliases (
  alias TEXT PRIMARY KEY,
  finance_key TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paid_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

type PixReceiptIdentityInput = {
  endToEndId: string;
  mediaFingerprint: string;
  amountCents: number;
  paidDate: string;
};

export async function reservePixReceiptIdentity(
  pool: Pick<Pool, 'connect'>,
  input: PixReceiptIdentityInput,
): Promise<string | null> {
  const endToEndAlias = pixReceiptAutoIdempotencyKey(input.endToEndId, '');
  const fileAlias = pixReceiptAutoIdempotencyKey('', input.mediaFingerprint);
  const aliases = [...new Set([endToEndAlias, fileAlias].filter(Boolean))].sort();
  if (!aliases.length || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidDate) || input.paidDate.startsWith('0000-')) return null;
  const parsedDate = new Date(`${input.paidDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.paidDate) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const alias of aliases) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [alias]);
    }
    const existing = await client.query<{ alias: string; finance_key: string; amount_cents: string; paid_date: string }>(
      `SELECT alias, finance_key, amount_cents::text AS amount_cents, paid_date::text AS paid_date
         FROM miauw_whatsapp_pix_receipt_identity_aliases
        WHERE alias = ANY($1::text[])
        FOR UPDATE`,
      [aliases],
    );
    const keys = new Set(existing.rows.map((row) => row.finance_key));
    if (keys.size > 1 || existing.rows.some((row) => row.amount_cents !== String(input.amountCents) || row.paid_date !== input.paidDate)) {
      await client.query('ROLLBACK');
      return null;
    }
    const financeKey = existing.rows[0]?.finance_key || endToEndAlias || fileAlias;
    const knownAliases = new Set(existing.rows.map((row) => row.alias));
    for (const alias of aliases) {
      if (knownAliases.has(alias)) continue;
      await client.query(
        `INSERT INTO miauw_whatsapp_pix_receipt_identity_aliases (alias, finance_key, amount_cents, paid_date)
         VALUES ($1, $2, $3, $4::date)`,
        [alias, financeKey, input.amountCents, input.paidDate],
      );
    }
    await client.query('COMMIT');
    return financeKey;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
