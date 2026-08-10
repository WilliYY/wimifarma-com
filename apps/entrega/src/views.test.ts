import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCommissionPaymentReceipt, renderDashboard, renderPrintReceipt, type CommissionPaymentRow, type DashboardViewModel, type DeliveryRow } from './views.js';

const delivery: DeliveryRow = {
  id: '123',
  customer_name: 'Maria <Teste>',
  customer_phone: '(44) 99999-0000',
  address: 'Rua Central, 10',
  created_by_user_id: '7',
  created_by_name: 'Ana',
  created_at: '2026-08-10T15:00:00.000Z',
  updated_at: '2026-08-10T15:00:00.000Z',
  status: 'ACTIVE',
  cancelled_at: null,
  cancelled_by_name: null,
  commission_amount_cents: '100',
  commission_status: 'ACTIVE',
  commission_payment_id: null,
  commission_paid_at: null,
};

const payment: CommissionPaymentRow = {
  id: '12',
  user_id: '7',
  user_name: 'Ana <Silva>',
  period_month: '2026-08-01',
  commission_count: '5',
  total_cents: '500',
  paid_by_name: 'Gerente',
  paid_at: '2026-08-10T16:00:00.000Z',
};

function model(manager: boolean): DashboardViewModel {
  return {
    basePath: '/entrega',
    user: { id: 7, username: 'ana', displayName: 'Ana', role: manager ? 'gerente' : 'user' },
    isManager: manager,
    csrfToken: 'csrf-safe',
    creationToken: '11111111-1111-4111-8111-111111111111',
    paymentToken: '22222222-2222-4222-8222-222222222222',
    flash: { type: '', message: '' },
    selectedMonth: '2026-08',
    mine: { today: 1, generated: 2, active: 2, cancelled: 0, commissionCents: 200, pendingCommissionCents: 100, paidCommissionCents: 100 },
    global: { generated: 8, active: 7, cancelled: 1, commissionCents: 700, pendingCommissionCents: 500, paidCommissionCents: 200 },
    leaders: [],
    commissionOverview: [{ user_id: '7', user_name: 'Ana', pending_count: '1', pending_cents: '100', paid_count: '1', paid_cents: '100' }],
    recentPayments: [payment],
    users: [],
    filters: { query: '', period: 'month', startDate: '', endDate: '', userId: null, status: '', page: 1 },
    history: [delivery],
    historyTotal: 1,
    pageSize: 50,
    selectedDelivery: null,
    selectedAudit: [],
  };
}

test('painel comum mostra apenas indicadores proprios', () => {
  const html = renderDashboard(model(false));
  assert.match(html, /Minhas hoje/);
  assert.doesNotMatch(html, /Total gerado/);
  assert.doesNotMatch(html, /Entregas por usuario/);
  assert.doesNotMatch(html, /Pagar comissao/);
});

test('painel gestor mostra resumo geral e equipe', () => {
  const html = renderDashboard(model(true));
  assert.match(html, /Total gerado/);
  assert.match(html, /Entregas por usuario/);
  assert.match(html, /Pagar comissao/);
  assert.match(html, /Pagar e imprimir/);
});

test('entrega com comissao paga nao oferece cancelamento', () => {
  const paidDelivery: DeliveryRow = { ...delivery, commission_payment_id: '12', commission_paid_at: payment.paid_at };
  const managerModel = model(true);
  const html = renderDashboard({ ...managerModel, history: [paidDelivery], selectedDelivery: paidDelivery });
  assert.match(html, /Paga #000012/);
  assert.match(html, /cancelamento bloqueado/i);
  assert.doesNotMatch(html, />Cancelar entrega</);
});

test('comprovante escapa dados e nao revela comissao', () => {
  const html = renderPrintReceipt('/entrega', delivery);
  assert.match(html, /#000123/);
  assert.match(html, /Maria &lt;Teste&gt;/);
  assert.doesNotMatch(html, /comiss/i);
  assert.doesNotMatch(html, /R\$ 1,00/);
  assert.match(html, /data-auto-print/);
});

test('relatorio de pagamento e curto, escapa dados e nao lista clientes', () => {
  const html = renderCommissionPaymentReceipt('/entrega', payment);
  assert.match(html, /PAGAMENTO DE COMISSAO/);
  assert.match(html, /R\$\s*5,00/);
  assert.match(html, /Ana &lt;Silva&gt;/);
  assert.match(html, /ENTREGAS PAGAS/);
  assert.doesNotMatch(html, /Maria|telefone|endereco/i);
  assert.match(html, /data-auto-print/);
});
