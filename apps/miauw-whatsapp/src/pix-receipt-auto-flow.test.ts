import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canAutomaticallyRegisterPixReceipt, pixReceiptAutoIdempotencyKey } from './pix-receipt-auto.js';

const source = ts.createSourceFile('server.ts', readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ESNext, true);
const functions = ['registerAutomaticPixReceipt', 'pixReceiptAutomaticEvidence', 'dateFromReceiptValue']
  .map((name) => {
    const node = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(node, name);
    return node.getText(source);
  });
const compiled = ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(writesEnabled = true) {
  const row = { id: 'event-test', trace_id: 'trace-test', sender_phone_mask: '***', payload_summary: {} };
  const extraction = {
    paymentStatus: 'completed',
    rawText: 'Pix efetuado com sucesso.',
    autoEvidence: { paidDate: '2026-11-24', amountConfidence: 0.95, payerConfidence: 0.92, targetConfidence: 0.99 },
    endToEndId: 'E00000000202611241500000000TST01',
    mediaFingerprint: 'a'.repeat(64),
  };
  const target = { cnpjMatch: true, keyMatch: false };
  const writes: unknown[][] = [];
  const outcomes: unknown[] = [];
  let fail = false;
  const aliases = new Map<string, string>();
  const { run, evidence } = runInNewContext(`${compiled}\n({ run: registerAutomaticPixReceipt, evidence: pixReceiptAutomaticEvidence })`, {
    CONFIRMED_ACTIONS_ENABLED: writesEnabled,
    canAutomaticallyRegisterPixReceipt,
    pgPool: {},
    reservePixReceiptIdentity: async (_pool: unknown, input: { endToEndId: string; mediaFingerprint: string }) => {
      const endToEnd = pixReceiptAutoIdempotencyKey(input.endToEndId, '');
      const file = pixReceiptAutoIdempotencyKey('', input.mediaFingerprint);
      const key = aliases.get(endToEnd) || aliases.get(file) || endToEnd || file;
      if (endToEnd) aliases.set(endToEnd, key);
      if (file) aliases.set(file, key);
      return key;
    },
    saoPauloTodayIso: () => '2026-11-25',
    isRecord: (value: unknown) => value !== null && typeof value === 'object',
    safeText: (value: unknown) => typeof value === 'string' ? value : '',
    numberFromReceiptValue: (value: unknown) => typeof value === 'number' ? value : 0,
    confidenceFromReceiptValue: (value: unknown) => typeof value === 'number' ? value : 0,
    safeOutboundText: (value: unknown) => typeof value === 'string' ? value : '',
    pixReceiptExtractionSummary: (_receipt: unknown, outcome: string) => ({ pix_receipt_outcome: outcome }),
    mergePixReceiptEventSummary: async (_id: string, summary: Record<string, unknown>) => outcomes.push(summary.pix_receipt_outcome),
    pixReceiptCommandFromExtraction: () => ({ amount_cents: 2590, public_observation: 'Pagador de teste' }),
    wimifarmaWhatsappContext: () => ({ id: null, role: 'system' }),
    createPixCnpjFromWhatsapp: async (...args: unknown[]) => {
      writes.push(args);
      assert.equal(outcomes.at(-1), 'auto_registering');
      if (fail) throw new Error('resposta do Financeiro perdida');
      return { text: 'Pix lançado', engine: 'local', reason: 'pix_cnpj_created' };
    },
  }) as {
    run(event: typeof row, receipt: typeof extraction, match: typeof target): Promise<{ reason: string }>;
    evidence(raw: Record<string, unknown>): typeof extraction.autoEvidence;
  };
  return { row, extraction, target, run, evidence, writes, outcomes, failWrite: (on: boolean) => { fail = on; } };
}

test('comprovante concluído grava com responsável institucional, data do Pix e chave estável', async () => {
  const f = fixture();
  const result = await f.run(f.row, f.extraction, f.target);
  assert.equal(result.reason, 'pix_cnpj_created');
  assert.equal(f.writes.length, 1);
  const write = f.writes[0];
  assert.match(String(write[4]), /^whatsapp:pix-media:[a-f0-9]{64}$/);
  assert.equal((write[5] as { responsibleName: string }).responsibleName, 'Wimifarma');
  assert.equal((write[5] as { actorUserId: unknown }).actorUserId, null);
  assert.equal(write[6], f.extraction.autoEvidence.paidDate);
  assert.deepEqual(f.outcomes, ['auto_registering', 'accepted']);
});

test('não aciona o Financeiro para agendamento, destino incerto ou data inválida', async () => {
  const cases = [
    { receipt: { paymentStatus: 'scheduled' }, reason: 'pix_receipt_payment_unconfirmed' },
    { target: { cnpjMatch: false }, reason: 'pix_receipt_payment_unconfirmed' },
    { evidence: { paidDate: '2026-02-31' }, reason: 'pix_receipt_paid_date_unconfirmed' },
    { evidence: { paidDate: '2026-11-26' }, reason: 'pix_receipt_paid_date_unconfirmed' },
    { evidence: { targetConfidence: 0.3 }, reason: 'pix_receipt_auto_fields_unconfirmed' },
  ];
  for (const item of cases) {
    const f = fixture();
    const result = await f.run(f.row, {
      ...f.extraction,
      ...item.receipt,
      autoEvidence: { ...f.extraction.autoEvidence, ...item.evidence },
    }, { ...f.target, ...item.target });
    assert.equal(result.reason, item.reason);
    assert.equal(f.writes.length, 0);
  }
});

test('respeita o bloqueio global de gravações', async () => {
  const f = fixture(false);
  assert.equal((await f.run(f.row, f.extraction, f.target)).reason, 'pix_receipt_auto_writes_disabled');
  assert.equal(f.writes.length, 0);
});

test('retry com OCR diferente reutiliza a primeira chave após falha de resposta', async () => {
  const f = fixture();
  f.failWrite(true);
  await assert.rejects(f.run(f.row, f.extraction, f.target), /resposta do Financeiro perdida/);
  assert.deepEqual(f.outcomes, ['auto_registering']);
  f.failWrite(false);
  await f.run({ ...f.row, id: 'event-retry', payload_summary: {} }, { ...f.extraction, endToEndId: '' }, f.target);
  assert.equal(f.writes[0][4], f.writes[1][4]);
});

test('data de emissão e confiança geral não aprovam data ou valores incertos', async () => {
  const f = fixture();
  const autoEvidence = f.evidence({
    paid_at_date: null,
    raw_text: 'Comprovante emitido em 24/11/2026',
    date_confidence: 0,
    amount_brl: 25.90,
    amount_confidence: 0,
    target_confidence: 0,
    confidence: 0.95,
  });
  assert.equal(autoEvidence.paidDate, '');
  assert.equal(autoEvidence.amountConfidence, 0);
  assert.equal(autoEvidence.targetConfidence, 0);
  assert.equal((await f.run(f.row, { ...f.extraction, autoEvidence }, f.target)).reason, 'pix_receipt_paid_date_unconfirmed');
  assert.equal(f.writes.length, 0);
});
