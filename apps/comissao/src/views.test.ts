import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCouponReceipt, renderDashboard, renderPaymentReceipt, type DashboardViewModel } from './views.js';

const baseModel: DashboardViewModel = {
  basePath: '/comissao',
  csrfToken: 'csrf',
  redemptionToken: '11111111-1111-4111-8111-111111111111',
  personToken: '22222222-2222-4222-8222-222222222222',
  couponToken: '33333333-3333-4333-8333-333333333333',
  paymentToken: '44444444-4444-4444-8444-444444444444',
  user: { id: 1, username: 'thiago', displayName: 'Thiago', role: 'user' },
  isAdmin: false,
  flash: null,
  codeQuery: '',
  foundCoupon: null,
  summary: { todayUses: 0, monthUses: 0, todayCommissionCents: 0, monthCommissionCents: 0, activePeople: 0 },
  ownRedemptions: [],
  recentRedemptions: [],
  recentPayments: [],
  people: [],
  ranking: [],
  selectedPerson: null,
  selectedPersonCoupons: [],
  selectedCoupon: null,
};

test('painel comum prioriza uso do codigo e XP sem expor administracao', () => {
  const html = renderDashboard(baseModel);
  assert.match(html, /Utilizar codigo/i);
  assert.match(html, /\+300 XP/);
  assert.doesNotMatch(html, /Novo indicador/);
  assert.doesNotMatch(html, /Pagar comissao/i);
});

test('painel administrativo inclui gestao, correcao de XP e reimpressao', () => {
  const html = renderDashboard({
    ...baseModel,
    isAdmin: true,
    user: { ...baseModel.user, role: 'admin' },
    selectedPerson: {
      id: '2', name: 'Miro', phone: null, pix: null, notes: null, active: true,
      balance_cents: '3600', paid_cents: '0', generated_cents: '3600', month_generated_cents: '3600',
      uses_count: '12', active_coupons: '1',
    },
    recentRedemptions: [{
      id: '11', coupon_id: '7', coupon_code: 'MIRO15', person_id: '2', person_name: 'Miro',
      product_name: 'Dipirona', commission_cents: '300', xp_points: '300', redeemed_by_user_id: '8',
      redeemed_by_name: 'Thiago', status: 'ACTIVE', created_at: '2026-08-11T12:00:00Z', cancelled_at: null,
      cancellation_reason: null, xp_status: 'FAILED',
    }],
    recentPayments: [{
      id: '4', person_id: '2', person_name: 'Miro', amount_cents: '3600', payment_method: 'PIX',
      registered_by_name: 'Willian', notes: null, created_at: '2026-08-11T12:00:00Z',
    }],
  });
  assert.match(html, /Novo indicador/);
  assert.match(html, /Novo cupom/);
  assert.match(html, /Pagar comissao/i);
  assert.match(html, /Historico de utilizacoes/i);
  assert.match(html, /retry-xp/);
  assert.match(html, /Corrigir XP/);
  assert.match(html, /print-payment/);
  assert.match(html, /data-label="Indicador"/);
});

test('cupom termico mostra oferta e indicador sem mostrar comissao', () => {
  const html = renderCouponReceipt('/comissao', {
    id: '7', person_id: '2', person_name: 'Miro', code: 'MIRO15', product_name: 'Dipirona 500mg',
    normal_price_cents: '2500', promotional_price_cents: '1500', commission_cents: '300', start_date: null,
    expiration_date: '2026-08-31', status: 'ACTIVE', created_at: '2026-08-11T12:00:00Z',
  });
  assert.match(html, /MIRO15/);
  assert.match(html, /Miro/);
  assert.match(html, /R\$\s*15,00/);
  assert.doesNotMatch(html, />\s*Comissao\s*</i);
  assert.doesNotMatch(html, /R\$ 3,00/);
});

test('comprovante de pagamento e resumido e pronto para imprimir', () => {
  const html = renderPaymentReceipt('/comissao', {
    id: '4', person_id: '2', person_name: 'Miro', amount_cents: '3600', payment_method: 'PIX',
    registered_by_name: 'Willian', notes: 'Nao imprimir esta observacao', created_at: '2026-08-11T12:00:00Z',
  });
  assert.match(html, /Pagamento de comissao/i);
  assert.match(html, /Miro/);
  assert.match(html, /R\$\s*36,00/);
  assert.match(html, /PIX/);
  assert.match(html, /Willian/);
  assert.doesNotMatch(html, /Nao imprimir esta observacao/);
});

test('escapa texto externo em todas as saidas', () => {
  const html = renderCouponReceipt('/comissao', {
    id: '7', person_id: '2', person_name: '<script>alert(1)</script>', code: 'SAFE1',
    product_name: '<img src=x onerror=alert(1)>', normal_price_cents: '2500', promotional_price_cents: '1500',
    commission_cents: '300', start_date: null, expiration_date: null, status: 'ACTIVE', created_at: '2026-08-11T12:00:00Z',
  });
  assert.doesNotMatch(html, /<script>alert|<img src=x/i);
  assert.match(html, /&lt;script&gt;/);
});
