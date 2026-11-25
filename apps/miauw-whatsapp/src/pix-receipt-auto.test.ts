import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  canAutomaticallyRegisterPixReceipt,
  normalizePixReceiptPaymentStatus,
  pixReceiptAutoIdempotencyKey,
} from './pix-receipt-auto.js';

const endToEndId = 'E00000000202601010000SYNTHETIC0001';
const mediaHash = createHash('sha256').update('synthetic receipt bytes').digest('hex');

test('normaliza apenas os estados canonicos, sem promover texto livre a concluido', () => {
  for (const status of ['completed', 'scheduled', 'pending', 'failed', 'unknown'] as const) {
    assert.equal(normalizePixReceiptPaymentStatus(` ${status.toUpperCase()} `), status);
  }
  for (const value of [undefined, null, true, 1, {}, [], 'sucesso', 'concluido', 'paid', '']) {
    assert.equal(normalizePixReceiptPaymentStatus(value), 'unknown');
  }
});

test('somente completed permite registro automatico', () => {
  assert.equal(canAutomaticallyRegisterPixReceipt('completed', 'Pix realizado com sucesso'), true);
  assert.equal(canAutomaticallyRegisterPixReceipt('completed', ''), true);
  for (const status of ['scheduled', 'pending', 'failed', 'unknown'] as const) {
    assert.equal(canAutomaticallyRegisterPixReceipt(status, 'Pix concluído com sucesso'), false);
  }
});

test('OCR contraditorio veta agendamento, pendencia, falha e nao efetivacao', () => {
  for (const text of [
    'Comprovante de agendamento', 'PIX AGENDADO para amanhã', 'Agendamento: 02/01/2026',
    'Pagamento pendente', 'Pix em processamento', 'Aguardando confirmação',
    'Transação estornada', 'Pix devolvido', 'Pagamento cancelado', 'Falha no pagamento',
    'Transação rejeitada', 'Pix recusado', 'Pagamento não efetivado',
    'A transferência não foi concluída', 'Pix não realizado', 'Pagamento ainda não confirmado',
    'Pix realizado com sucesso\nStatus: pendente', 'Pix concluído\nSituação: falhou',
  ]) {
    assert.equal(canAutomaticallyRegisterPixReceipt('completed', text), false, text);
  }
});

test('ausencia explicita de agendamento nao contradiz Pix concluido', () => {
  for (const text of ['Pix concluído. Sem agendamento.', 'Pix efetivado\nAgendamento: não', 'Pix realizado, não agendado.']) {
    assert.equal(canAutomaticallyRegisterPixReceipt('completed', text), true, text);
  }
});

test('nome de recebedor ou pagador nao determina o status', () => {
  for (const label of ['Recebedor', 'Favorecido', 'Destinatário', 'Destino', 'Para', 'Pagador']) {
    assert.equal(canAutomaticallyRegisterPixReceipt('completed', `Pix concluído\n${label}: Agendamento Pendente Ltda`), true);
  }
  assert.equal(canAutomaticallyRegisterPixReceipt('completed', 'Recebedor: Agendamento Pendente Ltda\nPix agendado'), false);
});

test('E2E normalizado mantem chave entre reenvios e arquivos diferentes', () => {
  const key = pixReceiptAutoIdempotencyKey(endToEndId, mediaHash);
  assert.match(key, /^whatsapp:pix-media:[a-f0-9]{64}$/);
  assert.equal(pixReceiptAutoIdempotencyKey(` ${endToEndId.toLowerCase().replace(/(.{8})/g, '$1 - ')} `, ''), key);
  assert.equal(pixReceiptAutoIdempotencyKey(endToEndId, 'b'.repeat(64)), key);
  assert.notEqual(pixReceiptAutoIdempotencyKey(`${endToEndId}2`, mediaHash), key);
});

test('fallback usa SHA-256 estavel do arquivo e aceita caixa e espacos externos', () => {
  const key = pixReceiptAutoIdempotencyKey('', mediaHash);
  assert.match(key, /^whatsapp:pix-media:[a-f0-9]{64}$/);
  assert.equal(pixReceiptAutoIdempotencyKey('short-id', ` ${mediaHash.toUpperCase()} `), key);
  assert.notEqual(pixReceiptAutoIdempotencyKey('', 'b'.repeat(64)), key);
});

test('namespace separa E2E do hash de arquivo mesmo com conteudo identico', () => {
  assert.notEqual(pixReceiptAutoIdempotencyKey(mediaHash, ''), pixReceiptAutoIdempotencyKey('', mediaHash));
});

test('sem E2E valido nem hash SHA-256 valido nao existe chave', () => {
  for (const hash of ['', 'hash', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    assert.equal(pixReceiptAutoIdempotencyKey('short-id', hash), '');
  }
  assert.notEqual(pixReceiptAutoIdempotencyKey('a'.repeat(16), ''), '');
  assert.equal(pixReceiptAutoIdempotencyKey('a'.repeat(15), ''), '');
});
