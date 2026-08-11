import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCouponReceipt, renderDashboard, type DashboardViewModel } from './views.js';

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
  assert.match(html, /Utilizar c[oó]digo/i);
  assert.match(html, /\+300 XP/);
  assert.doesNotMatch(html, /Novo indicador/);
  assert.doesNotMatch(html, /Pagar comiss[aã]o/i);
});

test('painel administrativo inclui indicadores, cupons e pagamentos', () => {
  const html = renderDashboard({
    ...baseModel,
    isAdmin: true,
    user: { ...baseModel.user, role: 'admin' },
    selectedPerson: {
      id: '2', name: 'Miro', phone: null, pix: null, notes: null, active: true,
      balance_cents: '3600', paid_cents: '0', generated_cents: '3600', month_generated_cents: '3600',
      uses_count: '12', active_coupons: '1',
    },
  });
  assert.match(html, /Novo indicador/);
  assert.match(html, /Novo cupom/);
  assert.match(html, /Pagar comiss[aã]o/i);
  assert.match(html, /Hist[oó]rico de utiliza[cç][oõ]es/i);
});

test('cupom termico mostra oferta e indicador sem mostrar comissao', () => {
  const html = renderCouponReceipt('/comissao', {
    id: '7',
    person_id: '2',
    person_name: 'Miro',
    code: 'MIRO15',
    product_name: 'Dipirona 500mg',
    normal_price_cents: '2500',
    promotional_price_cents: '1500',
    commission_cents: '300',
    start_date: null,
    expiration_date: '2026-08-31',
    status: 'ACTIVE',
    created_at: '2026-08-11T12:00:00Z',
  });
  assert.match(html, /MIRO15/);
  assert.match(html, /Miro/);
  assert.match(html, /R\$\s*15,00/);
  assert.doesNotMatch(html, />\s*Comiss[aã]o\s*</i);
  assert.doesNotMatch(html, /R\$ 3,00/);
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
