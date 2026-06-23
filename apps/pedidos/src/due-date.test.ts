import assert from 'node:assert/strict';
import test from 'node:test';
import { dueDateFromDays, parsePositiveDueDays } from './due-date.js';

test('calcula vencimento em 30 dias e atravessa o mes', () => {
  assert.equal(dueDateFromDays('30', '2026-06-13'), '2026-07-13');
});

test('calcula vencimento em 7 dias', () => {
  assert.equal(dueDateFromDays('7', '2026-06-23'), '2026-06-30');
});

test('aceita campo vazio para preservar o fluxo de data manual opcional', () => {
  assert.equal(dueDateFromDays('', '2026-06-23'), null);
});

test('recusa zero, negativo, decimal e texto', () => {
  for (const value of ['0', '-1', '1.5', 'sete']) {
    assert.throws(
      () => parsePositiveDueDays(value),
      /numero inteiro maior que zero/,
    );
  }
});

test('preserva o calculo em virada de ano e ano bissexto', () => {
  assert.equal(dueDateFromDays('2', '2026-12-31'), '2027-01-02');
  assert.equal(dueDateFromDays('1', '2028-02-28'), '2028-02-29');
});
