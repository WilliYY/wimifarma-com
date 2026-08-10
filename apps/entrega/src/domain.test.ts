import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageAll,
  formatDeliveryNumber,
  isBareBasePath,
  normalizeDate,
  normalizeHistoryFilters,
  normalizeMonth,
  previousMonth,
  validateDeliveryInput,
} from './domain.js';

test('redireciona somente a rota sem barra final', () => {
  assert.equal(isBareBasePath('/entrega', '/entrega'), true);
  assert.equal(isBareBasePath('/entrega/', '/entrega'), false);
});

test('valida os tres dados obrigatorios da entrega', () => {
  const result = validateDeliveryInput({
    customer_name: 'Maria da Silva',
    customer_phone: '(44) 99999-0000',
    address: 'Av. Minas Gerais, 2263 - Centro',
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value?.customerPhone, '(44) 99999-0000');
});

test('rejeita cadastro incompleto e telefone inviavel', () => {
  const result = validateDeliveryInput({ customer_name: '', customer_phone: '123', address: '' });
  assert.equal(result.value, null);
  assert.equal(result.errors.length, 3);
});

test('identifica adm, admin e gerente como gestores', () => {
  assert.equal(canManageAll({ username: 'adm', role: 'user' }), true);
  assert.equal(canManageAll({ username: 'ana', role: 'admin' }), true);
  assert.equal(canManageAll({ username: 'bia', role: 'gerente' }), true);
  assert.equal(canManageAll({ username: 'caio', role: 'user' }), false);
});

test('formata o numero sequencial do comprovante', () => {
  assert.equal(formatDeliveryNumber(123), '#000123');
  assert.equal(formatDeliveryNumber('1000001'), '#1000001');
});

test('normaliza mes, mes anterior e datas validas', () => {
  assert.equal(normalizeMonth('2026-08', '2020-01'), '2026-08');
  assert.equal(normalizeMonth('2026-15', '2020-01'), '2020-01');
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(normalizeDate('2026-02-29'), '');
  assert.equal(normalizeDate('2028-02-29'), '2028-02-29');
});

test('usuario comum nao consegue aplicar filtro de outro responsavel', () => {
  const common = normalizeHistoryFilters({ period: 'all', user_id: '55', status: 'active' }, { manager: false });
  assert.equal(common.userId, null);
  assert.equal(common.status, 'ACTIVE');

  const manager = normalizeHistoryFilters({ period: 'all', user_id: '55' }, { manager: true });
  assert.equal(manager.userId, 55);
});
