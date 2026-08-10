import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDashboard, renderPrintReceipt, type DashboardViewModel, type DeliveryRow } from './views.js';

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
};

function model(manager: boolean): DashboardViewModel {
  return {
    basePath: '/entrega',
    user: { id: 7, username: 'ana', displayName: 'Ana', role: manager ? 'gerente' : 'user' },
    isManager: manager,
    csrfToken: 'csrf-safe',
    creationToken: '11111111-1111-4111-8111-111111111111',
    flash: { type: '', message: '' },
    selectedMonth: '2026-08',
    mine: { today: 1, generated: 2, active: 2, cancelled: 0, commissionCents: 200 },
    global: { generated: 8, active: 7, cancelled: 1, commissionCents: 700 },
    leaders: [],
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
});

test('painel gestor mostra resumo geral e equipe', () => {
  const html = renderDashboard(model(true));
  assert.match(html, /Total gerado/);
  assert.match(html, /Entregas por usuario/);
});

test('comprovante escapa dados e nao revela comissao', () => {
  const html = renderPrintReceipt('/entrega', delivery);
  assert.match(html, /#000123/);
  assert.match(html, /Maria &lt;Teste&gt;/);
  assert.doesNotMatch(html, /comiss/i);
  assert.doesNotMatch(html, /R\$ 1,00/);
  assert.match(html, /data-auto-print/);
});
