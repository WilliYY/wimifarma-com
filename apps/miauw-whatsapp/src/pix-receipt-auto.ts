import { createHash } from 'node:crypto';

export type PixReceiptPaymentStatus = 'completed' | 'scheduled' | 'pending' | 'failed' | 'unknown';

export function normalizePixReceiptPaymentStatus(value: unknown): PixReceiptPaymentStatus {
  if (typeof value !== 'string') return 'unknown';
  const status = value.trim().toLowerCase();
  switch (status) {
    case 'completed':
    case 'scheduled':
    case 'pending':
    case 'failed':
      return status;
    default:
      return 'unknown';
  }
}

export function canAutomaticallyRegisterPixReceipt(status: PixReceiptPaymentStatus, rawText: string): boolean {
  if (status !== 'completed') return false;
  const text = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    // Party names are not evidence of the payment status. Keep any following status field.
    .replace(/^[ \t]*(?:recebedor|favorecido|destinatario|destino|para|pagador|nome(?: do (?:recebedor|favorecido|pagador))?)\s*:[^\r\n]*?(?=\b(?:status|situacao)\s*:|$)/gm, '')
    .replace(/\bsem\s+agendamento\b/g, '')
    .replace(/\bnao\s+agendad[oa]\b/g, '')
    .replace(/\bagendamento\s*:\s*nao\b/g, '');
  const nonCompletedMarkers = [
    /\b(?:agendad[oa]s?|agendamento|pendentes?|estorn\w*|devolvid[oa]s?|cancelad[oa]s?|falh(?:a\w*|ou)|rejeitad[oa]s?|recusad[oa]s?)\b/,
    /\bem\s+(?:processamento|analise|andamento)\b|\bprocessando\b/,
    /\baguardando\s+(?:confirmacao|pagamento|processamento|efetivacao)\b/,
    /\bnao\s+(?:(?:foi|esta|e|houve)\s+)?(?:efetivad[oa]|efetuad[oa]|realizad[oa]|concluid[oa]|confirmad[oa]|processad[oa]|autorizad[oa]|pag[oa]|efetivacao|conclusao|confirmacao|realizacao|processamento|pagamento)\b/,
  ];
  return !nonCompletedMarkers.some((pattern) => pattern.test(text));
}

export function pixReceiptAutoIdempotencyKey(endToEndId: string, mediaHash: string): string {
  const identifier = endToEndId.trim().slice(0, 160).replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
  const fileHash = mediaHash.trim().toLowerCase();
  const source = identifier.length >= 16
    ? `e2e:${identifier.slice(0, 140)}`
    : /^[a-f0-9]{64}$/.test(fileHash) ? `file:${fileHash}` : '';
  return source ? `whatsapp:pix-media:${createHash('sha256').update(source).digest('hex')}` : '';
}
