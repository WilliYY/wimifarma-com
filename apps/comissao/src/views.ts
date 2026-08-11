import type { SessionUser } from './domain.js';

export type Flash = { type: 'success' | 'error'; message: string };

export type CouponRow = {
  id: string;
  person_id: string;
  person_name: string;
  code: string;
  product_name: string;
  normal_price_cents: string;
  promotional_price_cents: string;
  commission_cents: string;
  start_date: string | null;
  expiration_date: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  created_at: Date | string;
  uses_count?: string;
};

export type PersonRow = {
  id: string;
  name: string;
  phone: string | null;
  pix: string | null;
  notes: string | null;
  active: boolean;
  balance_cents: string;
  paid_cents: string;
  generated_cents: string;
  month_generated_cents: string;
  uses_count: string;
  active_coupons: string;
};

export type RedemptionRow = {
  id: string;
  coupon_id: string;
  coupon_code: string;
  person_id: string;
  person_name: string;
  product_name: string;
  commission_cents: string;
  xp_points: string;
  redeemed_by_user_id: string;
  redeemed_by_name: string;
  status: 'ACTIVE' | 'CANCELLED';
  created_at: Date | string;
  cancelled_at: Date | string | null;
  cancellation_reason: string | null;
  xp_status?: 'PENDING' | 'AWARDED' | 'SKIPPED' | 'FAILED' | 'REVOKED';
};

export type PaymentRow = {
  id: string;
  person_id: string;
  person_name: string;
  amount_cents: string;
  payment_method: 'PIX' | 'CASH' | 'OTHER';
  registered_by_name: string;
  notes: string | null;
  created_at: Date | string;
};

export type RankingRow = { person_id: string; person_name: string; uses_count: string; generated_cents: string };
export type Summary = { todayUses: number; monthUses: number; todayCommissionCents: number; monthCommissionCents: number; activePeople: number };

export type DashboardViewModel = {
  basePath: string;
  csrfToken: string;
  redemptionToken: string;
  personToken: string;
  couponToken: string;
  paymentToken: string;
  user: SessionUser;
  isAdmin: boolean;
  canCreateOffers: boolean;
  flash: Flash | null;
  codeQuery: string;
  foundCoupon: CouponRow | null;
  foundCouponAvailable?: boolean;
  foundCouponReason?: string;
  summary: Summary;
  ownRedemptions: RedemptionRow[];
  recentRedemptions: RedemptionRow[];
  recentPayments: PaymentRow[];
  people: PersonRow[];
  ranking: RankingRow[];
  selectedPerson: PersonRow | null;
  selectedPersonCoupons: CouponRow[];
  selectedCoupon: CouponRow | null;
};

const ASSET_VERSION = '1.2.0';

function e(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cents(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function money(value: number | string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents(value) / 100);
}

function dateBr(value: Date | string | null): string {
  if (!value) return 'Sem validade';
  const raw = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
}

function dateTime(value: Date | string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(parsed);
}

function csrf(token: string): string {
  return `<input type="hidden" name="csrf_token" value="${e(token)}">`;
}

function selected(value: unknown, current: unknown): string {
  return String(value) === String(current) ? ' selected' : '';
}

function statusLabel(status: CouponRow['status']): string {
  return status === 'ACTIVE' ? 'Ativo' : status === 'PAUSED' ? 'Pausado' : 'Encerrado';
}

function methodLabel(method: PaymentRow['payment_method']): string {
  return method === 'PIX' ? 'PIX' : method === 'CASH' ? 'Dinheiro' : 'Outro';
}

function renderFoundCoupon(model: DashboardViewModel): string {
  const coupon = model.foundCoupon;
  if (!model.codeQuery) {
    return `<div class="lookup-empty"><strong>Pronto para consultar</strong><span>Digite o codigo antes de confirmar qualquer utilizacao.</span></div>`;
  }
  if (!coupon) {
    return `<div class="lookup-empty lookup-empty--error"><strong>Codigo nao encontrado</strong><span>Confira os caracteres e tente novamente.</span></div>`;
  }
  const available = model.foundCouponAvailable !== false;
  return `<section class="coupon-result${available ? '' : ' coupon-result--blocked'}" aria-label="Codigo encontrado">
    <div class="result-heading">
      <div><span class="eyebrow">Codigo encontrado</span><h2>${e(coupon.code)}</h2></div>
      <span class="status status--${e(coupon.status.toLowerCase())}">${e(model.foundCouponReason || statusLabel(coupon.status))}</span>
    </div>
    <div class="offer-grid">
      <article><span>Indicador</span><strong>${e(coupon.person_name)}</strong></article>
      <article><span>Produto</span><strong>${e(coupon.product_name)}</strong></article>
      <article><span>Oferta</span><strong><del>${e(money(coupon.normal_price_cents))}</del> ${e(money(coupon.promotional_price_cents))}</strong></article>
      <article class="offer-grid__commission"><span>Comissao do indicador</span><strong>${e(money(coupon.commission_cents))}</strong></article>
    </div>
    <div class="confirmation-band">
      <div><span>Ao concluir</span><strong>+300 XP para ${e(model.user.displayName)}</strong><small>A comissao pertence somente a ${e(coupon.person_name)}.</small></div>
      ${available ? `<form method="post" action="${e(model.basePath)}/redeem">
        ${csrf(model.csrfToken)}
        <input type="hidden" name="request_token" value="${e(model.redemptionToken)}">
        <input type="hidden" name="coupon_id" value="${e(coupon.id)}">
        <button class="button button--primary button--confirm" type="submit">Confirmar utilizacao</button>
      </form>` : `<strong class="blocked-copy">${e(model.foundCouponReason || 'Cupom indisponivel.')}</strong>`}
    </div>
  </section>`;
}

function renderRedemptionRows(rows: RedemptionRow[], isAdmin: boolean, model: DashboardViewModel): string {
  if (!rows.length) return `<div class="empty-state">Nenhuma utilizacao registrada.</div>`;
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Data</th><th>Codigo e oferta</th><th>Indicador</th><th>Comissao</th><th>Funcionario</th><th>XP</th><th>Status</th>${isAdmin ? '<th>Acao</th>' : ''}</tr></thead>
    <tbody>${rows.map((row) => {
      const canRetryXp = row.status === 'ACTIVE' && ['PENDING', 'SKIPPED', 'FAILED'].includes(row.xp_status || '');
      const adminActions = row.status === 'ACTIVE' ? `<div class="row-actions row-actions--stacked">
        ${canRetryXp ? `<form method="post" action="${e(model.basePath)}/retry-xp" data-confirm="Tentar gerar novamente os 300 XP para ${e(row.redeemed_by_name)}?">${csrf(model.csrfToken)}<input type="hidden" name="redemption_id" value="${e(row.id)}"><button class="button button--secondary button--small" type="submit">Corrigir XP</button></form>` : ''}
        <form method="post" action="${e(model.basePath)}/cancel-redemption" class="inline-form" data-confirm="Cancelar esta utilizacao e estornar comissao e XP?">
          ${csrf(model.csrfToken)}<input type="hidden" name="redemption_id" value="${e(row.id)}"><input name="reason" maxlength="240" placeholder="Motivo" aria-label="Motivo do cancelamento" required><button class="button button--danger button--small" type="submit">Cancelar</button>
        </form></div>` : `<small>${e(row.cancellation_reason || 'Cancelado')}</small>`;
      return `<tr>
        <td data-label="Data">${e(dateTime(row.created_at))}</td>
        <td data-label="Codigo e oferta"><strong>${e(row.coupon_code)}</strong><small>${e(row.product_name)}</small></td>
        <td data-label="Indicador">${e(row.person_name)}</td>
        <td data-label="Comissao">${e(money(row.commission_cents))}</td>
        <td data-label="Funcionario">${e(row.redeemed_by_name)}</td>
        <td data-label="XP"><strong class="xp-copy">+${e(row.xp_points)} XP</strong>${row.xp_status && row.xp_status !== 'AWARDED' && row.xp_status !== 'REVOKED' ? '<small class="warning-copy">Conferir XP</small>' : ''}</td>
        <td data-label="Status"><span class="status status--${row.status === 'ACTIVE' ? 'active' : 'closed'}">${row.status === 'ACTIVE' ? 'Valido' : 'Cancelado'}</span></td>
        ${isAdmin ? `<td class="cell-wide" data-label="Acao">${adminActions}</td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderPeople(model: DashboardViewModel): string {
  if (!model.people.length) return `<div class="empty-state">Cadastre o primeiro indicador para criar cupons.</div>`;
  return `<div class="people-grid">${model.people.map((person, index) => `<a class="person-card${model.selectedPerson?.id === person.id ? ' person-card--selected' : ''}" href="${e(model.basePath)}/?person_id=${e(person.id)}#indicador-detalhe">
    <span class="rank-number">${index + 1}</span>
    <div><strong>${e(person.name)}</strong><small>${person.active ? `${e(person.active_coupons)} cupom(ns) ativo(s)` : 'Indicador inativo'}</small></div>
    <dl><div><dt>Saldo a pagar</dt><dd class="${cents(person.balance_cents) < 0 ? 'negative' : ''}">${e(money(person.balance_cents))}</dd></div><div><dt>Usos</dt><dd>${e(person.uses_count)}</dd></div><div><dt>Total gerado</dt><dd>${e(money(person.generated_cents))}</dd></div></dl>
  </a>`).join('')}</div>`;
}

function renderCouponPreview(coupon?: Partial<CouponRow> | null): string {
  return `<div class="receipt receipt--preview" data-coupon-preview>
    <img class="receipt-logo" src="/comissao/logo-wimifarma-receipt.png?v=${ASSET_VERSION}" alt="WimiFarma">
    <h3>Cupom de indicacao</h3>
    <strong class="receipt-product" data-preview="product">${e(coupon?.product_name || 'PRODUTO / MEDICAMENTO')}</strong>
    <div class="receipt-offer"><span>DE <del data-preview="normal">R$ 0,00</del></span><strong>POR <b data-preview="promotional">R$ 0,00</b></strong></div>
    <div class="receipt-code"><span>CODIGO</span><strong data-preview="code">${e(coupon?.code || 'CODIGO')}</strong></div>
    <p>Apresente este cupom na Wimifarma.</p>
    <dl><div><dt>Indicacao</dt><dd data-preview="person">${e(coupon?.person_name || 'Indicador')}</dd></div><div><dt>Validade</dt><dd data-preview="expiration">${e(dateBr(coupon?.expiration_date || null))}</dd></div></dl>
  </div>`;
}

function renderCouponFields(model: DashboardViewModel, coupon: CouponRow | null, action: string, submitLabel: string): string {
  return `<form class="coupon-form" method="post" action="${e(model.basePath)}${e(action)}" data-coupon-form>
    ${csrf(model.csrfToken)}
    ${coupon ? `<input type="hidden" name="coupon_id" value="${e(coupon.id)}">` : `<input type="hidden" name="request_token" value="${e(model.couponToken)}">`}
    <input type="hidden" name="automatic_code" value="0" data-auto-code>
    <label>Indicador *<select name="referral_person_id" required data-preview-source="person"><option value="">Selecione</option>${model.people.filter((person) => person.active || person.id === coupon?.person_id).map((person) => `<option value="${e(person.id)}" data-person-name="${e(person.name)}"${selected(person.id, coupon?.person_id)}>${e(person.name)}</option>`).join('')}</select></label>
    <label class="field-wide">Produto/Medicamento *<input name="product_name" maxlength="220" required value="${e(coupon?.product_name || '')}" placeholder="Ex.: Dipirona 500mg 20 comprimidos" data-preview-source="product"></label>
    <label>Preco normal *<input name="normal_price" inputmode="decimal" required value="${coupon ? e((cents(coupon.normal_price_cents) / 100).toFixed(2).replace('.', ',')) : ''}" placeholder="25,00" data-preview-source="normal"></label>
    <label>Preco promocional *<input name="promotional_price" inputmode="decimal" required value="${coupon ? e((cents(coupon.promotional_price_cents) / 100).toFixed(2).replace('.', ',')) : ''}" placeholder="15,00" data-preview-source="promotional"></label>
    <label>Comissao por uso *<input name="commission_amount" inputmode="decimal" required value="${coupon ? e((cents(coupon.commission_cents) / 100).toFixed(2).replace('.', ',')) : ''}" placeholder="3,00"></label>
    <label class="code-field">Codigo *<span><input name="code" maxlength="24" required value="${e(coupon?.code || '')}" placeholder="MIRO15" data-preview-source="code"><button class="icon-button" type="button" data-generate-code title="Gerar codigo automaticamente" aria-label="Gerar codigo automaticamente">+</button></span></label>
    <label>Data de inicio<input type="date" name="start_date" value="${e(coupon?.start_date || '')}"></label>
    <label>Data de validade<input type="date" name="expiration_date" value="${e(coupon?.expiration_date || '')}" data-preview-source="expiration"></label>
    <label>Status<select name="status"><option value="ACTIVE"${selected('ACTIVE', coupon?.status || 'ACTIVE')}>Ativo</option><option value="PAUSED"${selected('PAUSED', coupon?.status)}>Pausado</option><option value="CLOSED"${selected('CLOSED', coupon?.status)}>Encerrado</option></select></label>
    <button class="button button--primary field-wide" type="submit">${e(submitLabel)}</button>
  </form>`;
}

function renderSelectedPerson(model: DashboardViewModel): string {
  const person = model.selectedPerson;
  if (!person) return '';
  const balance = cents(person.balance_cents);
  return `<section class="surface detail-section" id="indicador-detalhe">
    <div class="section-heading"><div><span class="eyebrow">Perfil do indicador</span><h2>${e(person.name)}</h2></div><a class="button button--ghost" href="${e(model.basePath)}/#indicadores">Fechar</a></div>
    <div class="person-summary">
      <article><span>Saldo a pagar</span><strong class="${balance < 0 ? 'negative' : ''}">${e(money(balance))}</strong><small>${balance < 0 ? 'Ajuste pendente de cancelamento' : 'Disponivel para pagamento'}</small></article>
      <article><span>Ja pago</span><strong>${e(money(person.paid_cents))}</strong></article>
      <article><span>Total gerado</span><strong>${e(money(person.generated_cents))}</strong></article>
      <article><span>Usos validos</span><strong>${e(person.uses_count)}</strong></article>
    </div>
    <div class="detail-columns">
      <form class="edit-person-form" method="post" action="${e(model.basePath)}/update-person">
        ${csrf(model.csrfToken)}<input type="hidden" name="person_id" value="${e(person.id)}">
        <h3>Dados do indicador</h3>
        <label>Nome *<input name="name" maxlength="160" required value="${e(person.name)}"></label>
        <label>Telefone<input name="phone" maxlength="40" value="${e(person.phone || '')}"></label>
        <label>PIX<input name="pix" maxlength="180" value="${e(person.pix || '')}"></label>
        <label>Status<select name="active"><option value="1"${person.active ? ' selected' : ''}>Ativo</option><option value="0"${!person.active ? ' selected' : ''}>Inativo</option></select></label>
        <label class="field-wide">Observacoes<textarea name="notes" maxlength="1000">${e(person.notes || '')}</textarea></label>
        <button class="button button--secondary field-wide" type="submit">Salvar indicador</button>
      </form>
      <form class="payment-form" method="post" action="${e(model.basePath)}/pay" data-confirm="Registrar este pagamento? O historico sera permanente.">
        ${csrf(model.csrfToken)}<input type="hidden" name="request_token" value="${e(model.paymentToken)}"><input type="hidden" name="referral_person_id" value="${e(person.id)}">
        <span class="eyebrow">Financeiro</span><h3>Pagar comissao</h3><p>Saldo disponivel: <strong>${e(money(Math.max(0, balance)))}</strong></p>
        <label>Valor a pagar *<input name="amount" inputmode="decimal" required value="${balance > 0 ? e((balance / 100).toFixed(2).replace('.', ',')) : ''}" ${balance <= 0 ? 'disabled' : ''}></label>
        <label>Forma<select name="payment_method"><option value="PIX">PIX</option><option value="CASH">Dinheiro</option><option value="OTHER">Outro</option></select></label>
        <label>Observacao<textarea name="notes" maxlength="500" placeholder="Opcional"></textarea></label>
        <button class="button button--primary" type="submit" ${balance <= 0 ? 'disabled' : ''}>Pagar e imprimir</button>
      </form>
    </div>
    <div class="subsection-heading"><h3>Cupons do indicador</h3><span>${e(model.selectedPersonCoupons.length)} cadastrado(s)</span></div>
    ${model.selectedPersonCoupons.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Codigo</th><th>Oferta</th><th>Comissao</th><th>Usos</th><th>Status</th><th>Acoes</th></tr></thead><tbody>${model.selectedPersonCoupons.map((coupon) => `<tr><td data-label="Codigo"><strong>${e(coupon.code)}</strong></td><td data-label="Oferta">${e(coupon.product_name)}<small><del>${e(money(coupon.normal_price_cents))}</del> por ${e(money(coupon.promotional_price_cents))}</small></td><td data-label="Comissao">${e(money(coupon.commission_cents))}</td><td data-label="Usos">${e(coupon.uses_count || '0')}</td><td data-label="Status"><span class="status status--${e(coupon.status.toLowerCase())}">${e(statusLabel(coupon.status))}</span></td><td class="cell-wide" data-label="Acoes"><div class="row-actions"><a class="button button--ghost button--small" href="${e(model.basePath)}/?person_id=${e(person.id)}&coupon_id=${e(coupon.id)}#editar-cupom">Editar</a><form method="post" action="${e(model.basePath)}/print-coupon">${csrf(model.csrfToken)}<input type="hidden" name="coupon_id" value="${e(coupon.id)}"><button class="button button--secondary button--small" type="submit">Imprimir</button></form></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Nenhum cupom deste indicador.</div>'}
  </section>`;
}

function renderAdminCreation(model: DashboardViewModel): string {
  if (!model.canCreateOffers) return '';
  return `<section class="surface admin-creation" id="cadastros">
      <div class="section-heading"><div><span class="eyebrow">Administracao</span><h2>Criar indicador e oferta</h2><p>Indicador externo recebe dinheiro. Usuario Wimifarma recebe XP.</p></div></div>
      <div class="creation-grid">
        <form class="person-form" method="post" action="${e(model.basePath)}/create-person">
          ${csrf(model.csrfToken)}<input type="hidden" name="request_token" value="${e(model.personToken)}">
          <span class="step-number">1</span><h3>Novo indicador</h3>
          <label>Nome *<input name="name" maxlength="160" required placeholder="Ex.: Miro"></label>
          <label>Telefone<input name="phone" maxlength="40" placeholder="Opcional"></label>
          <label>PIX<input name="pix" maxlength="180" placeholder="Opcional"></label>
          <label>Observacoes<textarea name="notes" maxlength="1000" placeholder="Opcional"></textarea></label>
          <button class="button button--secondary" type="submit">Cadastrar indicador</button>
        </form>
        <div class="coupon-creation"><div><span class="step-number step-number--blue">2</span><h3>Novo cupom</h3></div>${renderCouponFields(model, null, '/create-coupon', 'Criar cupom')}</div>
        <aside class="preview-panel"><span class="eyebrow">Previa termica</span><p>O valor da comissao nao aparece no papel.</p>${renderCouponPreview()}</aside>
      </div>
    </section>`;
}

function renderAdminManagement(model: DashboardViewModel): string {
  if (!model.isAdmin) return '';
  return `<div class="admin-area">
    <nav class="jump-nav" aria-label="Administracao">${model.canCreateOffers ? '<a href="#cadastros">Criar oferta</a>' : ''}<a href="#indicadores">Indicadores</a><a href="#ranking">Ranking</a><a href="#historicos">Historicos</a></nav>
    <section class="surface" id="indicadores"><div class="section-heading"><div><span class="eyebrow">Parceiros</span><h2>Indicadores</h2></div><span class="count-pill">${e(model.people.length)} cadastrado(s)</span></div>${renderPeople(model)}</section>
    ${renderSelectedPerson(model)}
    ${model.selectedCoupon ? `<section class="surface edit-coupon-section" id="editar-cupom"><div class="section-heading"><div><span class="eyebrow">Oferta #${e(model.selectedCoupon.id)}</span><h2>Editar cupom ${e(model.selectedCoupon.code)}</h2></div><a class="button button--ghost" href="${e(model.basePath)}/?person_id=${e(model.selectedCoupon.person_id)}#indicador-detalhe">Fechar</a></div><div class="coupon-edit-grid">${renderCouponFields(model, model.selectedCoupon, '/update-coupon', 'Salvar cupom')}${renderCouponPreview(model.selectedCoupon)}</div></section>` : ''}
    <section class="surface" id="ranking"><div class="section-heading"><div><span class="eyebrow">Desempenho</span><h2>Indicadores que mais trouxeram clientes</h2></div></div>${model.ranking.length ? `<ol class="ranking-list">${model.ranking.map((row, index) => `<li><span>${index + 1}</span><strong>${e(row.person_name)}</strong><b>${e(row.uses_count)} utilizacao(oes)</b><small>${e(money(row.generated_cents))} gerados</small></li>`).join('')}</ol>` : '<div class="empty-state">O ranking aparece depois da primeira utilizacao.</div>'}</section>
    <section class="surface" id="historicos"><div class="section-heading"><div><span class="eyebrow">Auditoria</span><h2>Historico de utilizacoes</h2></div></div>${renderRedemptionRows(model.recentRedemptions, true, model)}
      <div class="subsection-heading"><h3>Pagamentos aos indicadores</h3><span>${e(model.recentPayments.length)} recente(s)</span></div>
      ${model.recentPayments.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Indicador</th><th>Valor</th><th>Usuario</th><th>Forma</th><th>Observacao</th><th>Acao</th></tr></thead><tbody>${model.recentPayments.map((payment) => `<tr><td data-label="Data">${e(dateTime(payment.created_at))}</td><td data-label="Indicador">${e(payment.person_name)}</td><td data-label="Valor"><strong>${e(money(payment.amount_cents))}</strong></td><td data-label="Usuario">${e(payment.registered_by_name)}</td><td data-label="Forma">${e(methodLabel(payment.payment_method))}</td><td data-label="Observacao">${e(payment.notes || '-')}</td><td class="cell-wide" data-label="Acao"><form method="post" action="${e(model.basePath)}/print-payment">${csrf(model.csrfToken)}<input type="hidden" name="payment_id" value="${e(payment.id)}"><button class="button button--ghost button--small" type="submit">Reimprimir</button></form></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Nenhum pagamento registrado.</div>'}
    </section>
  </div>`;
}

export function renderDashboard(model: DashboardViewModel): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Indica&ccedil;&atilde;o | WimiFarma</title><link rel="stylesheet" href="${e(model.basePath)}/comissao.css?v=${ASSET_VERSION}"></head>
  <body><header class="topbar"><a class="brand" href="/"><img src="${e(model.basePath)}/logo-wimifarma-receipt.png?v=${ASSET_VERSION}" alt="WimiFarma"><span>Indica&ccedil;&atilde;o</span></a><nav><a class="active" href="${e(model.basePath)}/">Painel</a><a href="/">Home</a></nav></header>
  <main class="shell">
    <div class="page-title"><div><span class="eyebrow">Operacao de indicacao</span><h1>Indica&ccedil;&atilde;o</h1><p>Valide cupons, reconheca parceiros e premie quem atende.</p></div><span class="user-chip">Usuario: ${e(model.user.displayName)}</span></div>
    ${model.flash ? `<div class="flash flash--${e(model.flash.type)}" role="status">${e(model.flash.message)}</div>` : ''}
    ${renderAdminCreation(model)}
    <section class="surface redemption-section">
      <div class="section-heading"><div><span class="eyebrow">Atendimento</span><h2>Utilizar codigo</h2><p>Consulte primeiro. Comissao e XP so nascem depois da confirmacao.</p></div><span class="xp-badge">+300 XP por uso valido</span></div>
      <form class="lookup-form" method="get" action="${e(model.basePath)}/"><label for="coupon-code">Codigo do cupom</label><div><input id="coupon-code" name="code" maxlength="24" autocomplete="off" value="${e(model.codeQuery)}" placeholder="Ex.: MIRO15" autofocus><button class="button button--primary" type="submit">Buscar codigo</button></div></form>
      ${renderFoundCoupon(model)}
    </section>
    <section class="summary-band" aria-label="Indicadores do modulo">
      <article><span>Hoje</span><strong>${e(model.summary.todayUses)}</strong><small>cupons utilizados</small></article>
      <article><span>Este mes</span><strong>${e(model.summary.monthUses)}</strong><small>cupons utilizados</small></article>
      ${model.isAdmin ? `<article class="metric-money"><span>Comissoes do mes</span><strong>${e(money(model.summary.monthCommissionCents))}</strong><small>${e(money(model.summary.todayCommissionCents))} hoje</small></article><article><span>Indicadores ativos</span><strong>${e(model.summary.activePeople)}</strong><small>parceiros cadastrados</small></article>` : `<article class="metric-xp"><span>Meu premio por uso</span><strong>+300 XP</strong><small>apos confirmar corretamente</small></article>`}
    </section>
    <section class="surface own-history"><div class="section-heading compact"><div><span class="eyebrow">Minha operacao</span><h2>Minhas utilizacoes recentes</h2></div></div>${renderRedemptionRows(model.ownRedemptions, false, model)}</section>
    ${renderAdminManagement(model)}
  </main><footer>Wimifarma | Indicacao, comissao e XP separados com auditoria.</footer><script src="${e(model.basePath)}/comissao.js?v=${ASSET_VERSION}" defer></script></body></html>`;
}

export function renderCouponReceipt(basePath: string, coupon: CouponRow): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cupom de indicacao ${e(coupon.code)}</title><link rel="stylesheet" href="${e(basePath)}/comissao.css?v=${ASSET_VERSION}"></head><body class="print-page">
    <main class="receipt receipt--print">
      <img class="receipt-logo" src="${e(basePath)}/logo-wimifarma-receipt.png?v=${ASSET_VERSION}" alt="WimiFarma">
      <h1>Cupom de indicacao</h1>
      <strong class="receipt-product">${e(coupon.product_name)}</strong>
      <div class="receipt-offer"><span>DE <del>${e(money(coupon.normal_price_cents))}</del></span><strong>POR <b>${e(money(coupon.promotional_price_cents))}</b></strong></div>
      <div class="receipt-code"><span>CODIGO</span><strong>${e(coupon.code)}</strong></div>
      <p>Apresente este cupom na Wimifarma.</p>
      <dl><div><dt>Indicacao</dt><dd>${e(coupon.person_name)}</dd></div><div><dt>Validade</dt><dd>${e(dateBr(coupon.expiration_date))}</dd></div></dl>
    </main>
    <div class="print-controls"><button class="button button--primary" type="button" data-print>Imprimir cupom</button><a class="button button--ghost" href="${e(basePath)}/?person_id=${e(coupon.person_id)}#indicador-detalhe">Voltar</a></div>
    <script src="${e(basePath)}/comissao-print.js?v=${ASSET_VERSION}" defer></script>
  </body></html>`;
}

export function renderPaymentReceipt(basePath: string, payment: PaymentRow): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento de comissao #${e(payment.id)}</title><link rel="stylesheet" href="${e(basePath)}/comissao.css?v=${ASSET_VERSION}"></head><body class="print-page">
    <main class="receipt receipt--print receipt--payment">
      <img class="receipt-logo" src="${e(basePath)}/logo-wimifarma-receipt.png?v=${ASSET_VERSION}" alt="WimiFarma">
      <h1>Pagamento de comissao</h1>
      <div class="receipt-payment-value"><span>VALOR PAGO</span><strong>${e(money(payment.amount_cents))}</strong></div>
      <dl><div><dt>Indicador</dt><dd>${e(payment.person_name)}</dd></div><div><dt>Forma</dt><dd>${e(methodLabel(payment.payment_method))}</dd></div><div><dt>Registrado por</dt><dd>${e(payment.registered_by_name)}</dd></div><div><dt>Data e hora</dt><dd>${e(dateTime(payment.created_at))}</dd></div></dl>
      <p>Comprovante interno Wimifarma</p>
    </main>
    <div class="print-controls"><button class="button button--primary" type="button" data-print>Imprimir comprovante</button><a class="button button--ghost" href="${e(basePath)}/?person_id=${e(payment.person_id)}#indicador-detalhe">Voltar</a></div>
    <script src="${e(basePath)}/comissao-print.js?v=${ASSET_VERSION}" defer></script>
  </body></html>`;
}
