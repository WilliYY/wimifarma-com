import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REFERRAL_REDEMPTION_XP_POINTS,
  REFERRAL_REDEMPTION_XP_SOURCE,
  couponAvailability,
  couponCodeKey,
  formatAutomaticCouponCode,
  parseMoneyToCents,
  referralRedemptionXpReward,
  signedLedgerAmount,
  validateCouponInput,
  validatePaymentInput,
  validatePersonInput,
} from './domain.js';

test('normaliza codigo para busca sem depender de hifen ou caixa', () => {
  assert.equal(couponCodeKey(' mir-8472 '), 'MIR8472');
  assert.equal(couponCodeKey('MIR 8472'), 'MIR8472');
});

test('gera formato automatico legivel a partir do indicador', () => {
  assert.equal(formatAutomaticCouponCode('Miro da Silva', 47), 'MIR-0047');
  assert.equal(formatAutomaticCouponCode('Joao', 9876), 'JOA-9876');
});

test('converte valores brasileiros em centavos sem ponto flutuante', () => {
  assert.equal(parseMoneyToCents('R$ 25,00'), 2500);
  assert.equal(parseMoneyToCents('1.234,56'), 123456);
  assert.equal(parseMoneyToCents('15'), 1500);
});

test('valida indicador externo sem exigir usuario do sistema', () => {
  assert.deepEqual(validatePersonInput({ name: 'Miro', phone: '', pix: '', notes: '' }), {
    ok: true,
    value: { name: 'Miro', phone: '', pix: '', notes: '', active: true },
  });
  assert.equal(validatePersonInput({ name: ' ' }).ok, false);
});

test('valida oferta, comissao e datas do cupom', () => {
  const result = validateCouponInput({
    referral_person_id: '8',
    code: 'MIRO15',
    product_name: 'Dipirona 500mg',
    normal_price: '25,00',
    promotional_price: '15,00',
    commission_amount: '3,00',
    start_date: '2026-08-11',
    expiration_date: '2026-08-31',
    status: 'ACTIVE',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.codeKey, 'MIRO15');
    assert.equal(result.value.normalPriceCents, 2500);
    assert.equal(result.value.promotionalPriceCents, 1500);
    assert.equal(result.value.commissionCents, 300);
  }
});

test('rejeita promocao sem desconto e data final anterior ao inicio', () => {
  assert.equal(validateCouponInput({
    referral_person_id: '1', code: 'TESTE1', product_name: 'Produto', normal_price: '10,00',
    promotional_price: '10,00', commission_amount: '1,00', status: 'ACTIVE',
  }).ok, false);
  assert.equal(validateCouponInput({
    referral_person_id: '1', code: 'TESTE2', product_name: 'Produto', normal_price: '10,00',
    promotional_price: '9,00', commission_amount: '1,00', status: 'ACTIVE',
    start_date: '2026-08-31', expiration_date: '2026-08-11',
  }).ok, false);
});

test('bloqueia cupom pausado, futuro ou vencido antes da confirmacao', () => {
  assert.equal(couponAvailability({ status: 'PAUSED', startDate: null, expirationDate: null }, '2026-08-11').available, false);
  assert.equal(couponAvailability({ status: 'ACTIVE', startDate: '2026-08-12', expirationDate: null }, '2026-08-11').available, false);
  assert.equal(couponAvailability({ status: 'ACTIVE', startDate: null, expirationDate: '2026-08-10' }, '2026-08-11').available, false);
  assert.equal(couponAvailability({ status: 'ACTIVE', startDate: '2026-08-01', expirationDate: '2026-08-31' }, '2026-08-11').available, true);
});

test('premiacao de uso e vinculada ao redemption id', () => {
  assert.equal(REFERRAL_REDEMPTION_XP_POINTS, 300);
  assert.equal(REFERRAL_REDEMPTION_XP_SOURCE, 'referral_coupon_redemption');
  assert.deepEqual(referralRedemptionXpReward(91), {
    points: 300,
    source: 'referral_coupon_redemption',
    sourceEntityId: '91',
  });
  assert.throws(() => referralRedemptionXpReward(0));
});

test('livro razao separa comissao, estorno e pagamento', () => {
  assert.equal(signedLedgerAmount('COMMISSION', 300), 300);
  assert.equal(signedLedgerAmount('REVERSAL', 300), -300);
  assert.equal(signedLedgerAmount('PAYMENT', 300), -300);
});

test('pagamento precisa ser positivo e nao pode superar o saldo', () => {
  assert.equal(validatePaymentInput({ referral_person_id: '2', amount: '36,00', payment_method: 'PIX' }, 3600).ok, true);
  assert.equal(validatePaymentInput({ referral_person_id: '2', amount: '36,01', payment_method: 'PIX' }, 3600).ok, false);
  assert.equal(validatePaymentInput({ referral_person_id: '2', amount: '0', payment_method: 'PIX' }, 3600).ok, false);
});
