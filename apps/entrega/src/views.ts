import { formatDeliveryNumber, type HistoryFilters, type SessionUser } from './domain.js';

export type Flash = { type: 'success' | 'error' | ''; message: string };

export type DeliveryRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: Date | string;
  updated_at: Date | string;
  status: 'ACTIVE' | 'CANCELLED';
  cancelled_at: Date | string | null;
  cancelled_by_name: string | null;
  commission_amount_cents: string;
  commission_status: 'ACTIVE' | 'CANCELLED';
  commission_payment_id: string | null;
  commission_paid_at: Date | string | null;
};

export type AuditRow = {
  action: string;
  actor_name: string;
  created_at: Date | string;
  metadata: Record<string, unknown> | null;
};

export type UserOption = { id: string; display_name: string; username: string };

export type Summary = {
  generated: number;
  active: number;
  cancelled: number;
  commissionCents: number;
  pendingCommissionCents: number;
  paidCommissionCents: number;
};

export type MineSummary = Summary & { today: number };

export type LeaderRow = {
  user_id: string;
  user_name: string;
  generated: string;
  active: string;
  cancelled: string;
  commission_cents: string;
  pending_commission_cents: string;
  paid_commission_cents: string;
};

export type CommissionOverviewRow = {
  user_id: string;
  user_name: string;
  pending_count: string;
  pending_cents: string;
  paid_count: string;
  paid_cents: string;
};

export type CommissionPaymentRow = {
  id: string;
  user_id: string;
  user_name: string;
  period_month: Date | string;
  commission_count: string;
  total_cents: string;
  paid_by_name: string;
  paid_at: Date | string;
};

export type DashboardViewModel = {
  basePath: string;
  user: SessionUser;
  isManager: boolean;
  csrfToken: string;
  creationToken: string;
  paymentToken: string;
  flash: Flash;
  selectedMonth: string;
  mine: MineSummary;
  global: Summary;
  leaders: LeaderRow[];
  commissionOverview: CommissionOverviewRow[];
  recentPayments: CommissionPaymentRow[];
  users: UserOption[];
  filters: HistoryFilters;
  history: DeliveryRow[];
  historyTotal: number;
  pageSize: number;
  selectedDelivery: DeliveryRow | null;
  selectedAudit: AuditRow[];
};

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents: number | string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
}

function dateTime(value: Date | string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function csrfField(token: string): string {
  return `<input type="hidden" name="csrf_token" value="${e(token)}">`;
}

function selected(value: unknown, current: unknown): string {
  return String(value) === String(current) ? ' selected' : '';
}

function historyHref(model: DashboardViewModel, page: number): string {
  const params = new URLSearchParams();
  params.set('month', model.selectedMonth);
  if (model.filters.query) params.set('q', model.filters.query);
  params.set('period', model.filters.period);
  if (model.filters.startDate) params.set('start_date', model.filters.startDate);
  if (model.filters.endDate) params.set('end_date', model.filters.endDate);
  if (model.filters.userId) params.set('user_id', String(model.filters.userId));
  if (model.filters.status) params.set('status', model.filters.status);
  if (page > 1) params.set('page', String(page));
  return `${model.basePath}/?${params.toString()}#historico`;
}

function renderStatus(delivery: DeliveryRow): string {
  const cancelled = delivery.status === 'CANCELLED';
  return `<span class="status status--${cancelled ? 'cancelled' : 'active'}">${cancelled ? 'Cancelada' : 'Ativa'}</span>`;
}

function renderDeliveryActions(model: DashboardViewModel, delivery: DeliveryRow): string {
  const active = delivery.status === 'ACTIVE';
  return `
    <div class="row-actions">
      <a class="button button--quiet" href="${e(model.basePath)}/?view_id=${e(delivery.id)}#entrega-detalhe">Ver / editar</a>
      ${active ? `<form method="post" action="${e(model.basePath)}/reprint">
        ${csrfField(model.csrfToken)}
        <input type="hidden" name="delivery_id" value="${e(delivery.id)}">
        <button class="button button--outline" type="submit">Reimprimir</button>
      </form>` : ''}
      ${model.isManager && active && !delivery.commission_payment_id ? `<form method="post" action="${e(model.basePath)}/cancel" data-confirm-cancel>
        ${csrfField(model.csrfToken)}
        <input type="hidden" name="delivery_id" value="${e(delivery.id)}">
        <button class="button button--danger" type="submit">Cancelar</button>
      </form>` : ''}
    </div>`;
}

function renderSelectedDelivery(model: DashboardViewModel): string {
  const delivery = model.selectedDelivery;
  if (!delivery) return '';
  const canCancel = model.isManager && delivery.status === 'ACTIVE' && !delivery.commission_payment_id;
  return `
    <section class="detail-panel" id="entrega-detalhe" aria-labelledby="detail-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ENTREGA SELECIONADA</p>
          <h2 id="detail-title">${e(formatDeliveryNumber(delivery.id))} <span class="heading-status">${renderStatus(delivery)}</span></h2>
          <p>Responsavel original: <strong>${e(delivery.created_by_name)}</strong> em ${e(dateTime(delivery.created_at))}</p>
        </div>
        <a class="button button--quiet" href="${e(model.basePath)}/#historico">Fechar</a>
      </div>
      <div class="detail-grid">
        <form class="edit-form" method="post" action="${e(model.basePath)}/edit" data-lock-submit>
          ${csrfField(model.csrfToken)}
          <input type="hidden" name="delivery_id" value="${e(delivery.id)}">
          <label>Nome do cliente
            <input name="customer_name" maxlength="160" required value="${e(delivery.customer_name)}">
          </label>
          <label>Telefone / WhatsApp
            <input name="customer_phone" maxlength="40" required inputmode="tel" data-phone value="${e(delivery.customer_phone)}">
          </label>
          <label class="field-wide">Endereco completo
            <input name="address" maxlength="500" required value="${e(delivery.address)}">
          </label>
          <div class="edit-actions field-wide">
            <button class="button button--primary" type="submit">Salvar dados</button>
            ${delivery.status === 'CANCELLED' ? '<span class="muted">Entrega cancelada; o historico permanece preservado.</span>' : ''}
            ${delivery.commission_payment_id ? `<span class="muted">Comissao quitada no pagamento #${e(String(delivery.commission_payment_id).padStart(6, '0'))}; cancelamento bloqueado.</span>` : ''}
          </div>
        </form>
        <aside class="audit-list" aria-label="Auditoria da entrega">
          <h3>Movimentacoes</h3>
          ${model.selectedAudit.length ? model.selectedAudit.map((audit) => `
            <article>
              <strong>${e(audit.action.replaceAll('_', ' '))}</strong>
              <span>${e(audit.actor_name)} · ${e(dateTime(audit.created_at))}</span>
            </article>`).join('') : '<p class="empty-copy">Nenhuma movimentacao registrada.</p>'}
        </aside>
      </div>
      <div class="detail-footer">
        ${delivery.status === 'ACTIVE' ? `<form method="post" action="${e(model.basePath)}/reprint">
          ${csrfField(model.csrfToken)}
          <input type="hidden" name="delivery_id" value="${e(delivery.id)}">
          <button class="button button--outline" type="submit">Reimprimir comprovante</button>
        </form>` : ''}
        ${canCancel ? `<form method="post" action="${e(model.basePath)}/cancel" data-confirm-cancel>
          ${csrfField(model.csrfToken)}
          <input type="hidden" name="delivery_id" value="${e(delivery.id)}">
          <button class="button button--danger" type="submit">Cancelar entrega</button>
        </form>` : ''}
      </div>
    </section>`;
}

function renderCommissionManagement(model: DashboardViewModel): string {
  if (!model.isManager) return '';
  const pendingRows = model.commissionOverview.filter((row) => Number(row.pending_count) > 0);
  const pendingCents = model.commissionOverview.reduce((sum, row) => sum + Number(row.pending_cents || 0), 0);
  const paidCents = model.commissionOverview.reduce((sum, row) => sum + Number(row.paid_cents || 0), 0);
  const paymentOptions = pendingRows.map((row) => `<option value="${e(row.user_id)}">${e(row.user_name)} - ${e(row.pending_count)} entrega(s) - ${e(money(row.pending_cents))}</option>`).join('');

  return `<section class="payment-section" id="pagar-comissao" aria-labelledby="payment-title">
    <div class="payment-heading">
      <div><p class="eyebrow">FECHAMENTO</p><h2 id="payment-title">Pagar comissao</h2><p>Quite somente valores ativos e ainda pendentes do mes selecionado.</p></div>
      <span class="payment-period">${e(monthLabel(model.selectedMonth))}</span>
    </div>
    <div class="payment-layout">
      <div class="payment-operation">
        <div class="payment-metrics">
          <article><span>A pagar</span><strong>${e(money(pendingCents))}</strong><small>${pendingRows.length} usuario(s) pendente(s)</small></article>
          <article><span>Ja pago</span><strong>${e(money(paidCents))}</strong><small>neste mes de referencia</small></article>
        </div>
        <form class="payment-form" method="post" action="${e(model.basePath)}/pay-commission" data-lock-submit data-confirm-payment>
          ${csrfField(model.csrfToken)}
          <input type="hidden" name="request_token" value="${e(model.paymentToken)}">
          <input type="hidden" name="period_month" value="${e(model.selectedMonth)}">
          <label>Usuario que vai receber
            <select name="user_id" required${pendingRows.length ? '' : ' disabled'}>
              <option value="">Selecione</option>${paymentOptions}
            </select>
          </label>
          <div class="payment-assurance"><strong>Baixa segura</strong><span>Cada entrega entra uma unica vez e o relatorio fica salvo para reimpressao.</span></div>
          <button class="button button--primary payment-submit" type="submit"${pendingRows.length ? '' : ' disabled'}>Pagar e imprimir</button>
        </form>
        <p class="payment-warning">Depois do pagamento, as entregas quitadas ficam protegidas contra cancelamento para manter o caixa correto.</p>
      </div>
      <div class="payment-history">
        <div class="payment-history-title"><div><p class="eyebrow">COMPROVANTES</p><h3>Pagamentos do mes</h3></div><span>${model.recentPayments.length} registro(s)</span></div>
        <div class="payment-list">
          ${model.recentPayments.length ? model.recentPayments.map((payment) => `<article class="payment-row">
            <div><small>#${e(String(payment.id).padStart(6, '0'))}</small><strong>${e(payment.user_name)}</strong><span>${e(payment.commission_count)} entrega(s) - ${e(dateTime(payment.paid_at))}</span></div>
            <b>${e(money(payment.total_cents))}</b>
            <form method="post" action="${e(model.basePath)}/reprint-commission">
              ${csrfField(model.csrfToken)}
              <input type="hidden" name="payment_id" value="${e(payment.id)}">
              <button class="button button--quiet" type="submit">Reimprimir</button>
            </form>
          </article>`).join('') : '<p class="empty-copy">Nenhuma comissao foi paga neste mes.</p>'}
        </div>
      </div>
    </div>
  </section>`;
}

export function renderDashboard(model: DashboardViewModel): string {
  const pageCount = Math.max(1, Math.ceil(model.historyTotal / model.pageSize));
  const userOptions = model.users.map((user) => `<option value="${e(user.id)}"${selected(user.id, model.filters.userId)}>${e(user.display_name)} (@${e(user.username)})</option>`).join('');
  const deliveryUserOptions = model.users.map((user) => `<option value="${e(user.id)}" data-display-name="${e(user.display_name)}"${selected(user.id, model.user.id)}>${e(user.display_name)} (@${e(user.username)})</option>`).join('');
  const defaultResponsible = model.users.find((user) => Number(user.id) === model.user.id)?.display_name || model.user.displayName;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Entrega | Wimifarma</title>
  <link rel="stylesheet" href="${e(model.basePath)}/entrega.css?v=1.2.0">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Voltar para a Home"><span class="brand-plus">+</span><i aria-hidden="true"></i><span>WimiFarma</span></a>
    <div class="topbar-title">Entrega</div>
    <div class="topbar-actions"><span>${e(model.user.displayName)}</span><a href="/">Home</a></div>
  </header>

  <main class="shell">
    <div class="page-title">
      <div><p class="eyebrow">OPERACAO DE BALCAO</p><h1>Entrega</h1><p>Registre, imprima e acompanhe as entregas da farmacia.</p></div>
      <form class="month-picker" method="get" action="${e(model.basePath)}/">
        <label for="month">Mes dos indicadores</label>
        <div><input id="month" name="month" type="month" value="${e(model.selectedMonth)}"><button class="button button--outline" type="submit">Atualizar</button></div>
      </form>
    </div>

    ${model.flash.message ? `<div class="flash flash--${e(model.flash.type)}" role="status">${e(model.flash.message)}</div>` : ''}

    <section class="registration-band" aria-labelledby="new-delivery-title">
      <div class="section-heading">
        <div><p class="eyebrow">NOVA ENTREGA</p><h2 id="new-delivery-title">Cadastro rapido</h2><p>Uma entrega valida gera automaticamente <strong>R$ 1,00</strong> de comissao para o usuario escolhido.</p></div>
        <span class="commission-badge">+ R$ 1,00</span>
      </div>
      <div class="registration-layout">
        <form class="delivery-form" method="post" action="${e(model.basePath)}/create" data-lock-submit data-delivery-form>
          ${csrfField(model.csrfToken)}
          <input type="hidden" name="request_token" value="${e(model.creationToken)}">
          <label>Nome do cliente <span>*</span>
            <input name="customer_name" maxlength="160" required autocomplete="name" data-preview-input="customer" placeholder="Ex.: Maria da Silva">
          </label>
          <label>Telefone / WhatsApp <span>*</span>
            <input name="customer_phone" maxlength="40" required inputmode="tel" autocomplete="tel" data-phone data-preview-input="phone" placeholder="(44) 99999-9999">
          </label>
          <label class="address-field">Endereco completo <span>*</span>
            <input name="address" maxlength="500" required autocomplete="street-address" data-preview-input="address" placeholder="Rua, numero, bairro e referencia">
          </label>
          <label class="responsible-field">Usuario responsavel <span>*</span>
            <select name="responsible_user_id" required data-responsible-user>${deliveryUserOptions}</select>
            <small>A entrega e a comissao ficam registradas para esta pessoa.</small>
          </label>
          <button class="button button--primary button--create" type="submit"><strong>Gerar entrega e imprimir</strong><small>Salva uma vez e abre a impressao local</small></button>
        </form>
        <aside class="receipt-preview-panel" aria-labelledby="receipt-preview-title">
          <div class="receipt-preview-heading"><div><p class="eyebrow">PREVIA DE IMPRESSAO</p><h3 id="receipt-preview-title">Cupom da entrega</h3></div><span>80 mm</span></div>
          <article class="receipt receipt--preview" data-delivery-preview>
            <img class="receipt-logo" src="${e(model.basePath)}/logo-wimifarma-receipt.png" alt="WimiFarma" width="731" height="292">
            <h1>ENTREGA</h1>
            <div class="receipt-number">#000000</div>
            <dl>
              <div><dt>CLIENTE</dt><dd data-preview-customer>Nome do cliente</dd></div>
              <div><dt>TELEFONE / WHATSAPP</dt><dd data-preview-phone>(44) 99999-9999</dd></div>
              <div><dt>ENDERECO</dt><dd data-preview-address>Rua, numero, bairro e referencia</dd></div>
              <div><dt>RESPONSAVEL PELA ENTREGA</dt><dd data-preview-responsible>${e(defaultResponsible)}</dd></div>
              <div><dt>DATA E HORA</dt><dd data-preview-date>${e(dateTime(new Date()))}</dd></div>
            </dl>
          </article>
          <p class="receipt-preview-note">O numero e o horario finais entram no cupom depois que a entrega for salva.</p>
        </aside>
      </div>
    </section>

    <section class="summary-section" aria-labelledby="summary-title">
      <div class="section-heading compact"><div><p class="eyebrow">RESUMO</p><h2 id="summary-title">${e(monthLabel(model.selectedMonth))}</h2></div></div>
      <div class="summary-grid${model.isManager ? '' : ' summary-grid--personal'}">
        <article class="metric metric--blue"><span>Minhas hoje</span><strong>${model.mine.today}</strong><small>entregas validas</small></article>
        <article class="metric metric--teal"><span>Minhas no mes</span><strong>${model.mine.active}</strong><small>de ${model.mine.generated} geradas</small></article>
        <article class="metric metric--green"><span>Minha comissao a receber</span><strong>${e(money(model.mine.pendingCommissionCents))}</strong><small>${e(money(model.mine.paidCommissionCents))} ja pago</small></article>
        ${model.isManager ? `<article class="metric metric--wine"><span>Total gerado</span><strong>${model.global.generated}</strong><small>no periodo selecionado</small></article>
        <article class="metric metric--amber"><span>Validas / canceladas</span><strong>${model.global.active} / ${model.global.cancelled}</strong><small>historico preservado</small></article>
        <article class="metric metric--green"><span>Comissoes a pagar</span><strong>${e(money(model.global.pendingCommissionCents))}</strong><small>${e(money(model.global.paidCommissionCents))} ja pago</small></article>` : ''}
      </div>
    </section>

    ${model.isManager ? `<section class="leader-section" aria-labelledby="leader-title">
      <div class="section-heading compact"><div><p class="eyebrow">GESTAO</p><h2 id="leader-title">Entregas por usuario</h2></div><span class="muted">Valores de ${e(monthLabel(model.selectedMonth))}</span></div>
      <div class="leader-grid">
        ${model.leaders.length ? model.leaders.map((row, index) => `<article class="leader-row">
          <span class="rank">${index + 1}</span><div><strong>${e(row.user_name)}</strong><small>${e(row.active)} validas - ${e(row.cancelled)} canceladas - ${e(money(row.paid_commission_cents))} pago</small></div><b>${e(money(row.pending_commission_cents))}<small>a pagar</small></b>
        </article>`).join('') : '<p class="empty-copy">Nenhuma entrega neste mes.</p>'}
      </div>
    </section>` : ''}

    ${renderCommissionManagement(model)}

    ${renderSelectedDelivery(model)}

    <section class="history-section" id="historico" aria-labelledby="history-title">
      <div class="section-heading">
        <div><p class="eyebrow">HISTORICO</p><h2 id="history-title">Entregas registradas</h2><p>${model.historyTotal} registro(s) encontrado(s).</p></div>
      </div>
      <form class="filter-form" method="get" action="${e(model.basePath)}/">
        <input type="hidden" name="month" value="${e(model.selectedMonth)}">
        <label class="search-field">Buscar
          <input name="q" value="${e(model.filters.query)}" placeholder="Cliente, telefone, endereco, numero ou usuario">
        </label>
        <label>Periodo
          <select name="period" data-period>
            <option value="today"${selected('today', model.filters.period)}>Hoje</option>
            <option value="month"${selected('month', model.filters.period)}>Este mes</option>
            <option value="previous"${selected('previous', model.filters.period)}>Mes anterior</option>
            <option value="custom"${selected('custom', model.filters.period)}>Periodo personalizado</option>
            <option value="all"${selected('all', model.filters.period)}>Todo o historico</option>
          </select>
        </label>
        ${model.isManager ? `<label>Usuario<select name="user_id"><option value="">Todos</option>${userOptions}</select></label>` : ''}
        <label>Status
          <select name="status"><option value="">Todos</option><option value="ACTIVE"${selected('ACTIVE', model.filters.status)}>Ativas</option><option value="CANCELLED"${selected('CANCELLED', model.filters.status)}>Canceladas</option></select>
        </label>
        <label class="custom-date" data-custom-date>De<input type="date" name="start_date" value="${e(model.filters.startDate)}"></label>
        <label class="custom-date" data-custom-date>Ate<input type="date" name="end_date" value="${e(model.filters.endDate)}"></label>
        <button class="button button--primary" type="submit">Filtrar</button>
        <a class="button button--quiet" href="${e(model.basePath)}/?month=${e(model.selectedMonth)}#historico">Limpar</a>
      </form>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Entrega</th><th>Cliente</th><th>Endereco</th><th>Responsavel</th><th>Status</th><th>Comissao</th><th>Acoes</th></tr></thead>
          <tbody>
          ${model.history.length ? model.history.map((delivery) => `<tr>
            <td><strong>${e(formatDeliveryNumber(delivery.id))}</strong><small>${e(dateTime(delivery.created_at))}</small></td>
            <td><strong>${e(delivery.customer_name)}</strong><small>${e(delivery.customer_phone)}</small></td>
            <td class="address-cell">${e(delivery.address)}</td>
            <td>${e(delivery.created_by_name)}</td>
            <td>${renderStatus(delivery)}${delivery.cancelled_at ? `<small>${e(dateTime(delivery.cancelled_at))}</small>` : ''}</td>
            <td><strong>${delivery.commission_status === 'ACTIVE' ? e(money(delivery.commission_amount_cents)) : 'R$ 0,00'}</strong><small>${delivery.commission_status !== 'ACTIVE' ? 'Estornada' : delivery.commission_payment_id ? `Paga #${e(String(delivery.commission_payment_id).padStart(6, '0'))}` : 'A pagar'}</small></td>
            <td>${renderDeliveryActions(model, delivery)}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty-cell">Nenhuma entrega encontrada com estes filtros.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pageCount > 1 ? `<nav class="pagination" aria-label="Paginas do historico">
        ${model.filters.page > 1 ? `<a class="button button--quiet" href="${e(historyHref(model, model.filters.page - 1))}">Anterior</a>` : '<span></span>'}
        <span>Pagina ${model.filters.page} de ${pageCount}</span>
        ${model.filters.page < pageCount ? `<a class="button button--quiet" href="${e(historyHref(model, model.filters.page + 1))}">Proxima</a>` : '<span></span>'}
      </nav>` : ''}
    </section>
  </main>
  <script src="${e(model.basePath)}/entrega.js?v=1.2.0" defer></script>
</body>
</html>`;
}

export function renderPrintReceipt(basePath: string, delivery: DeliveryRow): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(formatDeliveryNumber(delivery.id))} | Entrega Wimifarma</title>
  <link rel="stylesheet" href="${e(basePath)}/entrega.css?v=1.2.0">
</head>
<body class="print-page" data-auto-print>
  <main class="receipt" aria-label="Comprovante de entrega">
    <img class="receipt-logo" src="${e(basePath)}/logo-wimifarma-receipt.png" alt="WimiFarma" width="731" height="292">
    <h1>ENTREGA</h1>
    <div class="receipt-number">${e(formatDeliveryNumber(delivery.id))}</div>
    <dl>
      <div><dt>CLIENTE</dt><dd>${e(delivery.customer_name)}</dd></div>
      <div><dt>TELEFONE / WHATSAPP</dt><dd>${e(delivery.customer_phone)}</dd></div>
      <div><dt>ENDERECO</dt><dd>${e(delivery.address)}</dd></div>
      <div><dt>RESPONSAVEL PELA ENTREGA</dt><dd>${e(delivery.created_by_name)}</dd></div>
      <div><dt>DATA E HORA</dt><dd>${e(dateTime(delivery.created_at))}</dd></div>
    </dl>
  </main>
  <div class="print-controls"><button class="button button--primary" type="button" data-print-now>Imprimir</button><a class="button button--quiet" href="${e(basePath)}/">Voltar</a></div>
  <script src="${e(basePath)}/entrega-print.js?v=1.2.0" defer></script>
</body>
</html>`;
}

export function renderCommissionPaymentReceipt(basePath: string, payment: CommissionPaymentRow): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pagamento #${e(payment.id)} | Comissao de entrega</title>
  <link rel="stylesheet" href="${e(basePath)}/entrega.css?v=1.2.0">
</head>
<body class="print-page" data-auto-print>
  <main class="receipt commission-receipt" aria-label="Relatorio de pagamento de comissao">
    <img class="receipt-logo" src="${e(basePath)}/logo-wimifarma-receipt.png" alt="WimiFarma" width="731" height="292">
    <h1>PAGAMENTO DE COMISSAO</h1>
    <div class="payment-total"><small>TOTAL PAGO</small><strong>${e(money(payment.total_cents))}</strong></div>
    <dl>
      <div><dt>USUARIO</dt><dd>${e(payment.user_name)}</dd></div>
      <div><dt>MES DE REFERENCIA</dt><dd>${e(monthLabel(String(payment.period_month).slice(0, 7)))}</dd></div>
      <div><dt>ENTREGAS PAGAS</dt><dd>${e(payment.commission_count)}</dd></div>
      <div><dt>PAGAMENTO</dt><dd>#${e(String(payment.id).padStart(6, '0'))}</dd></div>
      <div><dt>PAGO POR</dt><dd>${e(payment.paid_by_name)}</dd></div>
      <div><dt>DATA E HORA</dt><dd>${e(dateTime(payment.paid_at))}</dd></div>
    </dl>
    <p class="receipt-note">Cada entrega valida corresponde a R$ 1,00.</p>
  </main>
  <div class="print-controls"><button class="button button--primary" type="button" data-print-now>Imprimir</button><a class="button button--quiet" href="${e(basePath)}/">Voltar</a></div>
  <script src="${e(basePath)}/entrega-print.js?v=1.2.0" defer></script>
</body>
</html>`;
}
