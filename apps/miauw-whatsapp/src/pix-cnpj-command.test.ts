import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePixCnpjCommand } from './pix-cnpj-command.js';

test('recusa valores positivos e negativos conflitantes ou negativos repetidos', () => {
  for (const body of ['30 -30', '-30 30', '-30 -30']) {
    const result = parsePixCnpjCommand(`pix cnpj ${body} Sueli`);
    assert.equal(result?.ok, false, body);
    assert.ok(['invalid_amount', 'invalid_value'].includes(result?.error || ''), body);
  }
  assert.equal(parsePixCnpjCommand('pix cnpj saldo -30 valor 30 Sueli')?.amount_cents, 3000);
});

test('prioriza valor explicito e exclui horarios, saldo e tarifa com preposicoes', () => {
  for (const detail of ['as 14:30', 'as 14h30', 'as 14h', 'saldo de 500', 'saldo disponivel de R$ 500', 'tarifa de 2', 'tarifa cobrada de R$ 2']) {
    for (const body of [`${detail} valor 90`, `valor 90 ${detail}`]) {
      const result = parsePixCnpjCommand(`recebi pix cnpj ${body} responsavel Sueli`);
      assert.equal(result?.ok, true, body);
      assert.equal(result?.amount_cents, 9000, body);
    }
  }
  assert.equal(parsePixCnpjCommand('pix cnpj 30 valor 90')?.amount_cents, 9000);
  for (const body of ['30 90', 'valor 30 valor 90']) {
    const result = parsePixCnpjCommand(`pix cnpj ${body}`);
    assert.equal(result?.ok, false, body);
    assert.equal(result?.error, 'invalid_amount', body);
  }
});

test('CNPJ do pagador nao comprova destino empresarial no recebimento natural', () => {
  assert.equal(parsePixCnpjCommand('recebi pix 30 CNPJ do pagador 12.345.678/0001-90'), null);
  assert.equal(parsePixCnpjCommand('recebi pix 30 CNPJ do pagador 12.345.678/0001-90 na conta da farmacia')?.amount_cents, 3000);
});

test('recebimento empresarial natural preserva valor, responsavel e observacao', () => {
  const result = parsePixCnpjCommand('Recebi um pix de 30 na conta da farmacia responsavel Sueli obs venda balcao');
  assert.equal(result?.ok, true);
  assert.equal(result?.amount_cents, 3000);
  assert.equal(result?.responsible_hint, 'Sueli');
  assert.equal(result?.observation, 'venda balcao');
});

test('documentos, telefone, data, saldo e tarifa nao viram valor recebido', () => {
  for (const detail of ['CPF 123.456.789-09', 'CNPJ 12.345.678/0001-90', 'telefone 11987654321', 'dia 06/11/2026', 'saldo 500 tarifa 2']) {
    const result = parsePixCnpjCommand(`recebi pix cnpj ${detail} valor 30 responsavel Sueli`);
    assert.equal(result?.amount_cents, 3000, detail);
    assert.equal(result?.responsible_hint, 'Sueli', detail);
  }
});

test('nao aceita negacao, pergunta, envio, pagamento ou conta pessoal como entrada', () => {
  assert.equal(parsePixCnpjCommand('recebi pix 30 do CNPJ 12.345.678/0001-90'), null);
  for (const message of ['nao recebi pix cnpj 30', 'como registrar pix cnpj 30?', 'enviei pix cnpj 30', 'paguei pix cnpj 30', 'recebi pix cnpj 30 na minha conta pessoal', 'recebi pix 30']) {
    assert.equal(parsePixCnpjCommand(message), null, message);
  }
});
