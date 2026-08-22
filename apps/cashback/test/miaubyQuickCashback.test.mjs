import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  normalizeMiaubyQuickCashbackCustomer,
  shouldAwardMiaubyQuickCashbackXp,
} from '../dist/miaubyQuickCashback.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(path.join(here, '..', 'src', 'server.ts'), 'utf8');

test('anonymous Miauby Cashback has no customer identity and no XP', () => {
  const customer = normalizeMiaubyQuickCashbackCustomer({});
  assert.equal(customer.identified, false);
  assert.equal(shouldAwardMiaubyQuickCashbackXp(null), false);
});

test('name or valid phone makes Miauby Cashback identified', () => {
  assert.equal(normalizeMiaubyQuickCashbackCustomer({ name: '  Ana   Maria ' }).identified, true);
  assert.deepEqual(normalizeMiaubyQuickCashbackCustomer({ phone: '(44) 99999-8888' }), {
    clientId: null,
    name: '',
    phone: '44999998888',
    note: '',
    documentProvided: false,
    identified: true,
  });
  assert.equal(shouldAwardMiaubyQuickCashbackXp(139), true);
  assert.equal(normalizeMiaubyQuickCashbackCustomer({ clientId: '139' }).identified, true);
});

test('CPF and observation are recognized but do not invent a customer identity', () => {
  const customer = normalizeMiaubyQuickCashbackCustomer({
    document: '123.456.789-09',
    note: 'Cliente do bairro',
  });
  assert.equal(customer.documentProvided, true);
  assert.equal(customer.note, 'Cliente do bairro');
  assert.equal(customer.identified, false);
  assert.equal(shouldAwardMiaubyQuickCashbackXp(null), false);
});

test('Miauby endpoint reuses the quick voucher engine with idempotency and conditional XP', () => {
  assert.match(serverSource, /post\('\/api\/internal\/miauby\/quick-vouchers', requireInternalToken/);
  assert.match(serverSource, /issueQuickVoucher\(db,/);
  assert.match(serverSource, /request_token = \$1/);
  assert.match(serverSource, /shouldAwardMiaubyQuickCashbackXp\(clientId\)/);
  assert.match(serverSource, /XP nao aplicado: Cashback anonimo/);
  assert.match(serverSource, /renderQuickVoucherPrintDocument\(receipt\)/);
  assert.doesNotMatch(serverSource, /cashback_clients[^;]*\bcpf\b/is);
});
