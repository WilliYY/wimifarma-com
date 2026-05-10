(() => {
  if (window.__miauwWidgetLoaded) return;
  window.__miauwWidgetLoaded = true;

  const currentPath = window.location.pathname || '';
  if (currentPath.startsWith('/miauw/')) return;

  const cssId = 'miauw-widget-css';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = '/miauw/widget.css?v=20260506a';
    document.head.appendChild(link);
  }

  const state = {
    open: false,
    authenticated: false,
    csrf: '',
    avatar: '/miauw/miauw.png',
    loading: false,
    alerts: [],
    alertCount: 0,
    canDismissAlerts: true,
    view: 'chat',
  };

  const root = document.createElement('section');
  root.className = 'miauw-widget';
  root.innerHTML = `
    <button class="miauw-widget-bubble" type="button" aria-label="Abrir Miauby" aria-expanded="false">
      <img src="/miauw/miauw.png" alt="">
      <span>Miauby</span>
      <strong class="miauw-widget-alert-badge" data-miauw-alert-badge hidden>0</strong>
    </button>
    <button class="miauw-widget-nudge" type="button" data-miauw-nudge hidden aria-label="Recado do Miauby">Miauby esta de olho.</button>
    <div class="miauw-widget-panel" role="dialog" aria-label="Chat do Miauby" aria-hidden="true">
      <header class="miauw-widget-head">
        <div>
          <img src="/miauw/miauw.png" alt="">
          <div>
            <strong>Miauby</strong>
            <small>Fiscal interno</small>
          </div>
        </div>
        <button type="button" data-miauw-close aria-label="Fechar Miauby">x</button>
      </header>
      <nav class="miauw-widget-tools" data-miauw-tools hidden aria-label="Areas do Miauby">
        <button type="button" class="is-active" data-miauw-view="chat">Chat</button>
        <button type="button" data-miauw-view="alerts">Alertas <strong data-miauw-tools-alert-count hidden>0</strong></button>
      </nav>
      <div class="miauw-widget-feed" data-miauw-feed></div>
      <section class="miauw-widget-alerts" data-miauw-alerts hidden>
        <div class="miauw-widget-alerts-head">
          <div>
            <strong>Alertas do Miauby</strong>
            <small>Mesmo painel do guardiao, sem alerta duplicado.</small>
          </div>
          <button type="button" data-miauw-alerts-refresh>Atualizar</button>
        </div>
        <div class="miauw-widget-alert-list" data-miauw-alert-list></div>
      </section>
      <div class="miauw-widget-login" data-miauw-login hidden>
        <strong>Login interno</strong>
        <p>Entre para o Miauby ajudar sem ficar miando no corredor.</p>
        <input type="text" name="username" placeholder="Usuario" autocomplete="username">
        <input type="password" name="password" placeholder="Senha" autocomplete="current-password">
        <button type="button" data-miauw-login-btn>Entrar</button>
      </div>
      <form class="miauw-widget-composer" data-miauw-form hidden>
        <textarea name="message" rows="1" maxlength="1200" placeholder="Chama o Miauby..."></textarea>
        <button type="submit">Enviar</button>
      </form>
    </div>
  `;

  document.body.appendChild(root);

  const bubble = root.querySelector('.miauw-widget-bubble');
  const panel = root.querySelector('.miauw-widget-panel');
  const close = root.querySelector('[data-miauw-close]');
  const feed = root.querySelector('[data-miauw-feed]');
  const loginBox = root.querySelector('[data-miauw-login]');
  const loginButton = root.querySelector('[data-miauw-login-btn]');
  const form = root.querySelector('[data-miauw-form]');
  const input = root.querySelector('textarea[name="message"]');
  const alertBadge = root.querySelector('[data-miauw-alert-badge]');
  const alertNudge = root.querySelector('[data-miauw-nudge]');
  const tools = root.querySelector('[data-miauw-tools]');
  const viewButtons = Array.from(root.querySelectorAll('[data-miauw-view]'));
  const alertsPanel = root.querySelector('[data-miauw-alerts]');
  const alertList = root.querySelector('[data-miauw-alert-list]');
  const alertCountPill = root.querySelector('[data-miauw-tools-alert-count]');
  const alertRefresh = root.querySelector('[data-miauw-alerts-refresh]');
  let typingMessage = null;
  let lastUserActivityAt = 0;
  let lastGuideAt = 0;
  let lastAmbientNudgeAt = 0;
  let activityTimer = null;
  let pendingNudge = null;
  const recentInteractions = [];
  const NUDGE_ACTIVITY_WINDOW = 1000 * 18;

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const normalizeMessageText = (value) => String(value || '')
    .replace(/```[\s\S]*?```/g, 'Parte tecnica omitida.')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^`{1,3}[a-z0-9_-]*\s*$/gim, '')
    .replace(/\*{3,}/g, '**')
    .replace(/\*\*(\s*)\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n');

  const clipText = (value, max = 70) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

  const isWidgetTarget = (target) => target && root.contains(target);

  const safeTargetLabel = (target) => {
    if (!target || isWidgetTarget(target)) return '';
    if (typeof target.closest !== 'function') return '';

    const element = target.closest('button, a, input, textarea, select, th, td, label, [role="button"], [data-module-card], [data-action]');
    if (!element || isWidgetTarget(element)) return '';

    const tag = element.tagName ? element.tagName.toLowerCase() : 'elemento';
    const type = element.getAttribute('type') || '';
    if ((tag === 'input' && /password|hidden/i.test(type)) || tag === 'textarea') {
      return tag === 'textarea' ? 'campo de texto' : 'campo protegido';
    }

    const label = element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.getAttribute('data-action')
      || element.getAttribute('data-module-card')
      || (tag === 'input' || tag === 'select' ? element.getAttribute('name') : '')
      || element.textContent;

    return clipText(`${tag}: ${label || 'sem rotulo'}`, 90);
  };

  const recordInteraction = (kind, target) => {
    const label = safeTargetLabel(target);
    if (!label) return;

    recentInteractions.push({
      kind,
      label,
      path: window.location.pathname + window.location.search,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });

    while (recentInteractions.length > 8) {
      recentInteractions.shift();
    }
  };

  const hasRecentActivity = () => Date.now() - lastUserActivityAt < NUDGE_ACTIVITY_WINDOW;

  const screenObjects = () => Array.from(document.querySelectorAll('[data-miauby-screen-object], [data-wfwc-runner]')).map((element) => {
    const kind = element.getAttribute('data-miauby-screen-object') || element.getAttribute('data-runner-kind') || 'objeto visual';
    const label = element.getAttribute('data-miauby-screen-label') || kind;
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;

    return {
      kind: clipText(kind, 36),
      label: clipText(label, 90),
      visible,
    };
  }).filter((item) => item.kind || item.label);

  const formatMessage = (value) => escapeHtml(normalizeMessageText(value))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+|\/miauw\/relatorios\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
    .replaceAll('\n', '<br>');

  const pageContext = () => {
    const title = document.title || '';
    const path = window.location.pathname + window.location.search;
    const heading = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '';
    const interactions = recentInteractions.map((item) => `${item.time} ${item.kind} ${item.label}`).join(' > ');
    const active = safeTargetLabel(document.activeElement);
    const objects = screenObjects().filter((item) => item.visible).map((item) => item.label).join(', ');
    return [
      title ? `Titulo: ${title}` : '',
      path ? `Tela: ${path}` : '',
      heading ? `Titulo da tela: ${heading}` : '',
      active ? `Foco atual: ${active}` : '',
      objects ? `Objetos visuais na tela: ${objects}` : '',
      interactions ? `Interacoes recentes: ${interactions}` : '',
    ].filter(Boolean).join(' | ').slice(0, 1400);
  };

  const setView = (view, options = {}) => {
    const nextView = view === 'alerts' ? 'alerts' : 'chat';
    state.view = nextView;

    viewButtons.forEach((button) => {
      const active = button.dataset.miauwView === nextView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    feed.hidden = nextView !== 'chat';
    alertsPanel.hidden = nextView !== 'alerts';
    form.hidden = !state.authenticated || nextView !== 'chat';
    loginBox.hidden = state.authenticated || nextView !== 'chat';

    if (nextView === 'alerts') {
      renderAlerts(state.alerts);
      if (!options.skipLoad) {
        loadAlerts();
      }
    } else if (state.authenticated && state.open) {
      window.setTimeout(() => input && input.focus(), 120);
    }
  };

  const setOpen = (open) => {
    state.open = open;
    root.classList.toggle('is-open', open);
    bubble.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (open) {
      hideAlertNudge();
      loadStatus();
      if (state.view === 'alerts') {
        loadAlerts();
      } else {
        setTimeout(() => input && input.focus(), 160);
      }
    }
  };

  const scrollBottom = () => {
    feed.scrollTop = feed.scrollHeight;
  };

  const removeGuideCue = () => {
    document.querySelectorAll('.miauw-guide-cue').forEach((item) => item.remove());
  };

  const showGuideCue = (text, selector = '') => {
    removeGuideCue();

    const target = selector ? document.querySelector(selector) : null;
    const rect = target ? target.getBoundingClientRect() : bubble.getBoundingClientRect();
    const cue = document.createElement('div');
    cue.className = 'miauw-guide-cue';
    cue.innerHTML = `
      <span class="miauw-guide-paw" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="miauw-guide-card">${escapeHtml(text)}</span>
    `;

    const top = Math.max(16, Math.min(window.innerHeight - 112, rect.top + window.scrollY - 12));
    const left = Math.max(16, Math.min(window.innerWidth - 268, rect.left + window.scrollX + Math.min(rect.width, 48)));
    cue.style.top = `${top}px`;
    cue.style.left = `${left}px`;
    document.body.appendChild(cue);
    window.setTimeout(() => cue.remove(), 5200);
  };

  const guideSelectorForReply = (text) => {
    const normalized = String(text || '').toLowerCase();

    if (normalized.includes('financeiro') || normalized.includes('caixa') || normalized.includes('pix')) {
      return ['Financeiro fica aqui. Se tem PIX, sangria, caixa ou faturamento, o gato aponta para o modulo certo.', 'a[href*="/financeiro/"], [data-module-card="financeiro"]'];
    }

    if (normalized.includes('cotacao') || normalized.includes('distribuidora') || normalized.includes('vencedor')) {
      return ['Cotacao fica aqui. Use produto, categoria, distribuidora e vencedor sem misturar com financeiro.', 'a[href*="/cotacao/"], [data-module-card="cotacao"]'];
    }

    if (normalized.includes('cashback') || normalized.includes('cliente')) {
      return ['Cashback fica aqui. Cliente, saldo e recompra ficam nesse caminho.', 'a[href*="/cashback/"], [data-module-card="cashback"]'];
    }

    if (normalized.includes('alerta') || normalized.includes('erro interno')) {
      return ['Tem alerta operacional. Abra o Miauby e confira antes que vire retrabalho.', '.miauw-widget-bubble'];
    }

    return null;
  };

  const maybeGuideFromReply = (text) => {
    if (Date.now() - lastGuideAt < 9000) return;
    const guide = guideSelectorForReply(text);
    if (!guide) return;

    lastGuideAt = Date.now();
    showGuideCue(guide[0], guide[1]);
  };

  const spawnScreenEffect = (event, forcedType = '') => {
    return null;
  };

  const maybeSpawnScreenEffect = (event) => {
    return null;
  };

  const addMessage = (role, text, options = {}) => {
    const item = document.createElement('article');
    item.className = `miauw-widget-msg ${role}`;
    const fallback = '';
    const time = options.time || new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '');

    item.innerHTML = `
      ${role === 'assistant' ? `<img src="${escapeHtml(state.avatar)}" alt="">` : ''}
      <div>
        <p>${formatMessage(text)}</p>
        <time>${escapeHtml(time + fallback)}</time>
      </div>
    `;
    feed.appendChild(item);
    scrollBottom();
  };

  const addAssistantParts = async (parts, options = {}) => {
    const safeParts = Array.isArray(parts) && parts.length ? parts : [options.fallbackText || 'Nao consegui montar a resposta agora. Tente de novo.'];

    for (let index = 0; index < safeParts.length; index += 1) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
      addMessage('assistant', safeParts[index], options);
      maybeGuideFromReply(safeParts[index]);
    }
  };

  const hideAlertNudge = () => {
    if (!alertNudge) return;
    alertNudge.classList.remove('is-visible');
    window.setTimeout(() => {
      alertNudge.hidden = true;
    }, 180);
  };

  const showQueuedNudge = (payload) => {
    if (!alertNudge || !payload || state.open) return;

    alertNudge.textContent = payload.text || 'Miauby tem algo para verificar.';
    alertNudge.dataset.miauwPrompt = payload.prompt || '';
    alertNudge.dataset.miauwView = payload.view || (payload.alert ? 'alerts' : 'chat');
    alertNudge.classList.toggle('is-alert-speech', Boolean(payload.alert));
    alertNudge.classList.toggle('is-ambient-speech', !payload.alert);
    alertNudge.hidden = false;
    window.requestAnimationFrame(() => alertNudge.classList.add('is-visible'));

    if (payload.storage && payload.storage.key) {
      window.localStorage.setItem(payload.storage.key, String(payload.storage.value || Date.now()));
    }

    if (payload.storageCount && payload.storageCount.key) {
      window.localStorage.setItem(payload.storageCount.key, String(payload.storageCount.value || 0));
    }

    window.setTimeout(hideAlertNudge, 8500);
  };

  const queueOrShowNudge = (payload) => {
    if (!payload || state.open) return;

    if (hasRecentActivity()) {
      showQueuedNudge(payload);
      return;
    }

    pendingNudge = payload;
  };

  const flushPendingNudge = () => {
    if (!pendingNudge || !hasRecentActivity()) return;

    const payload = pendingNudge;
    pendingNudge = null;
    showQueuedNudge(payload);
  };

  const maybeShowAlertNudge = (count, alerts = []) => {
    const total = Number(count || 0);
    if (!alertNudge || total <= 0 || state.open) return;

    const now = Date.now();
    const lastAt = Number(window.localStorage.getItem('miauw_alert_nudge_at') || 0);
    const lastCount = Number(window.localStorage.getItem('miauw_alert_nudge_count') || 0);
    const cooldownMs = 1000 * 60 * 35;

    if (lastAt && now - lastAt < cooldownMs && total <= lastCount) {
      return;
    }

    const topAlert = Array.isArray(alerts) && alerts.length ? alerts[0] : null;
    const prefix = total === 1 ? 'Miauby achou 1 alerta.' : `Miauby achou ${total} alertas.`;
    queueOrShowNudge({
      text: topAlert && topAlert.title ? `${prefix} ${topAlert.title}` : `${prefix} Abrir painel.`,
      prompt: '',
      view: 'alerts',
      alert: true,
      storage: { key: 'miauw_alert_nudge_at', value: now },
      storageCount: { key: 'miauw_alert_nudge_count', value: total },
    });
  };

  const maybeShowMedicineNewsNudge = (count) => {
    if (!alertNudge || Number(count || 0) > 0 || state.open) return;

    const now = Date.now();
    const lastAt = Number(window.localStorage.getItem('miauby_medicine_news_nudge_at') || 0);
    const cooldownMs = 1000 * 60 * 60 * 12;
    if (lastAt && now - lastAt < cooldownMs) {
      return;
    }

    queueOrShowNudge({
      text: 'Miauby tem curiosidade oficial para conferir quando voce pedir.',
      prompt: '',
      view: 'chat',
      storage: { key: 'miauby_medicine_news_nudge_at', value: now },
    });
  };

  const maybeShowHomeCreatureNudge = () => {
    if (!alertNudge || state.open) return;
    if (!document.body.classList.contains('home') && (window.location.pathname || '/') !== '/') return;

    const objects = screenObjects().filter((item) => item.visible);
    if (objects.length < 2) return;

    const now = Date.now();
    const lastAt = Number(window.localStorage.getItem('miauby_home_creature_nudge_at') || 0);
    const cooldownMs = 1000 * 60 * 18;
    if (lastAt && now - lastAt < cooldownMs) return;

    const names = objects.map((item) => item.kind);
    const hasDuck = names.some((name) => name.includes('pato'));
    const hasDragon = names.some((name) => name.includes('drag'));
    const hasCat = names.some((name) => name.includes('gato') || name.includes('nyan'));
    const messages = [
      hasDuck && hasDragon && hasCat
        ? 'Miauby analisou a home: pato em ronda, dragao no teto e gato voador deixando rastro. Auditoria visual aprovada, produtividade ainda suspeita.'
        : 'Miauby viu os bichos zanzando pela tela. Se algo sumir, eu interrogo primeiro o mais animado.',
      hasDragon
        ? 'Tem dragao patrulhando a home. Otimo: se a rotina pegar fogo, pelo menos combina com o tema.'
        : 'Tem objeto voador na home. Estou monitorando, porque disciplina operacional tambem precisa de showzinho.',
      hasDuck
        ? 'O pato esta fugindo do mouse com mais estrategia que muita justificativa de caixa. Anotado.'
        : 'Miauby detectou movimento na home. Nada critico, so charme operacional com fiscalizacao.',
    ].filter(Boolean);

    queueOrShowNudge({
      text: messages[Math.floor(Math.random() * messages.length)],
      prompt: '',
      view: 'chat',
      storage: { key: 'miauby_home_creature_nudge_at', value: now },
    });
  };

  const ambientNudgeText = () => {
    const path = window.location.pathname || '/';
    if (path.startsWith('/financeiro/')) {
      return 'Financeiro aberto. Valor sem motivo vira fantasma de fechamento.';
    }
    if (path.startsWith('/cotacao/')) {
      return 'Cotacao aberta. Preco sem vencedor fica miando no canto.';
    }
    if (path.startsWith('/cashback/')) {
      return 'Cashback aberto. Confere cliente antes do saldo virar fofoca.';
    }
    if (path.startsWith('/tarefa/')) {
      return 'Tarefas na tela. Prioridade em cima, drama embaixo.';
    }
    if (path === '/' || document.body.classList.contains('home')) {
      return 'Miauby de ronda. Clique, venda, feche caixa. Eu julgo em silencio.';
    }
    return 'Miauby esta de olho. Manda dado, tela e objetivo.';
  };

  const maybeShowAmbientNudge = () => {
    if (!alertNudge || state.open || state.alertCount > 0) return;
    if (!alertNudge.hidden && alertNudge.classList.contains('is-visible')) return;

    const now = Date.now();
    if (now - lastAmbientNudgeAt < 1000 * 45) return;

    const pathKey = (window.location.pathname || '/').replace(/[^a-z0-9_-]+/gi, '_') || 'home';
    const storageKey = `miauby_ambient_nudge_at_${pathKey}`;
    const lastAt = Number(window.localStorage.getItem(storageKey) || 0);
    const cooldownMs = 1000 * 60 * 18;
    if (lastAt && now - lastAt < cooldownMs) return;

    lastAmbientNudgeAt = now;
    queueOrShowNudge({
      text: ambientNudgeText(),
      prompt: '',
      view: 'chat',
      storage: { key: storageKey, value: now },
    });
  };

  const normalizeAlerts = (alerts = []) => {
    if (!Array.isArray(alerts)) return [];

    return alerts
      .map((alert) => ({
        id: Number(alert.id || 0),
        title: alert.titulo || alert.title || 'Alerta operacional',
        message: alert.mensagem || alert.message || '',
        action: alert.acao_sugerida || alert.action || '',
        module: alert.modulo || alert.module || 'sistema',
        severity: alert.severidade || alert.severity || 'media',
        risk: Number(alert.risco_score || alert.risk_score || 0),
        occurrences: Number(alert.ocorrencias || alert.occurrences || 1),
        age: alert.age_label || alert.last_seen_label || '',
      }))
      .filter((alert) => alert.id > 0);
  };

  const renderAlerts = (alerts = []) => {
    if (!alertList) return;
    const normalized = normalizeAlerts(alerts);

    if (!normalized.length) {
      alertList.innerHTML = `
        <div class="miauw-widget-alert-empty">
          <strong>Sem alerta ativo.</strong>
          <span>Milagre operacional detectado. O Miauby continua olhando.</span>
        </div>
      `;
      return;
    }

    alertList.innerHTML = normalized.map((alert) => `
      <article class="miauw-widget-alert-card severity-${escapeHtml(alert.severity)}" data-alert-id="${alert.id}">
        <div>
          <span>${escapeHtml(String(alert.module).toUpperCase())} Â· ${escapeHtml(String(alert.severity).toUpperCase())}${alert.risk ? ` Â· risco ${alert.risk}/100` : ''}</span>
          <strong>${escapeHtml(alert.title)}</strong>
          ${alert.message ? `<p>${escapeHtml(alert.message)}</p>` : ''}
          ${alert.action ? `<em>${escapeHtml(alert.action)}</em>` : ''}
          <small>${escapeHtml(alert.age || `Ocorrencias: ${alert.occurrences}`)}</small>
        </div>
        ${state.canDismissAlerts ? `<button type="button" data-miauw-alert-dismiss="${alert.id}">Apagar</button>` : '<small class="miauw-widget-alert-lock">Somente gestor apaga</small>'}
      </article>
    `).join('');
  };

  const updateAlertBadge = (count, alerts = []) => {
    const total = Number(count || 0);
    state.alertCount = total;
    state.alerts = normalizeAlerts(alerts);
    if (alertBadge) {
      alertBadge.hidden = total <= 0;
      alertBadge.textContent = total > 9 ? '9+' : String(total);
    }
    if (alertCountPill) {
      alertCountPill.hidden = total <= 0;
      alertCountPill.textContent = total > 9 ? '9+' : String(total);
    }
    bubble.classList.toggle('has-alerts', total > 0);
    if (state.view === 'alerts') {
      renderAlerts(state.alerts);
    }
    maybeShowAlertNudge(total, state.alerts);
    maybeShowMedicineNewsNudge(total);
  };

  const loadAlerts = async () => {
    if (!state.authenticated || !alertList) return;

    alertList.innerHTML = '<div class="miauw-widget-alert-empty"><strong>Atualizando alertas...</strong><span>Um segundo. Sem teatro.</span></div>';
    try {
      const response = await fetch('/miauw/widget-alerts.php', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await readJsonResponse(response);
      state.csrf = data.csrf || state.csrf;

      if (!data.ok) {
        if (data.auth === false) {
          state.authenticated = false;
          showAuthState();
        }
        alertList.innerHTML = `<div class="miauw-widget-alert-empty"><strong>${escapeHtml(data.message || 'Nao consegui carregar alertas.')}</strong></div>`;
        return;
      }

      updateAlertBadge(data.count || 0, data.alerts || []);
      state.canDismissAlerts = data.can_dismiss !== false;
      renderAlerts(state.alerts);
    } catch (error) {
      alertList.innerHTML = '<div class="miauw-widget-alert-empty"><strong>Nao consegui carregar alertas agora.</strong><span>Tente de novo em instantes.</span></div>';
    }
  };

  const dismissAlert = async (alertId) => {
    const id = Number(alertId || 0);
    if (!id || !state.authenticated) return;

    const card = alertList ? alertList.querySelector(`[data-alert-id="${id}"]`) : null;
    if (card) card.classList.add('is-dismissing');

    const body = new FormData();
    body.set('action', 'dismiss');
    body.set('alert_id', String(id));
    body.set('csrf_token', state.csrf);

    try {
      const response = await fetch('/miauw/widget-alerts.php', {
        method: 'POST',
        body,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-CSRF-Token': state.csrf },
      });
      const data = await readJsonResponse(response);
      state.csrf = data.csrf || state.csrf;

      if (!data.ok) {
        if (card) card.classList.remove('is-dismissing');
        addMessage('assistant', data.message || 'Nao consegui apagar esse alerta agora.');
        return;
      }

      updateAlertBadge(data.count || 0, data.alerts || []);
      state.canDismissAlerts = data.can_dismiss !== false;
      renderAlerts(state.alerts);
    } catch (error) {
      if (card) card.classList.remove('is-dismissing');
      addMessage('assistant', 'Nao consegui apagar esse alerta agora.');
    }
  };

  const showTyping = () => {
    if (typingMessage) return;

    const item = document.createElement('article');
    item.className = 'miauw-widget-msg assistant typing';
    item.setAttribute('aria-live', 'polite');
    item.innerHTML = `
      <img src="${escapeHtml(state.avatar)}" alt="">
      <div>
        <p><span class="miauw-widget-typing-text">Miauby esta analisando</span><span class="miauw-widget-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
      </div>
    `;
    typingMessage = item;
    feed.appendChild(item);
    scrollBottom();
  };

  const hideTyping = () => {
    if (typingMessage) {
      typingMessage.remove();
      typingMessage = null;
    }
  };

  const renderMessages = (messages = []) => {
    feed.innerHTML = '';

    if (!messages.length) {
      addMessage('assistant', 'Miauby na area. Manda tela, dado e objetivo. Sem dado, sem milagre.');
      return;
    }

    messages.forEach((message) => {
      addMessage(message.role === 'assistant' ? 'assistant' : 'user', message.text || '', {
        time: message.time,
        fallback: message.fallback,
      });
    });
  };

  const showAuthState = () => {
    if (!state.authenticated && state.view === 'alerts') {
      state.view = 'chat';
    }
    if (tools) {
      tools.hidden = !state.authenticated;
    }
    setView(state.view, { skipLoad: true });
  };

  const readJsonResponse = async (response) => {
    try {
      return await response.json();
    } catch (error) {
      return {
        ok: false,
        message: 'Miauby recebeu uma resposta fora do formato. Atualize a pagina e tente de novo.',
      };
    }
  };

  const refreshStatusToken = async () => {
    const response = await fetch('/miauw/widget-status.php', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await readJsonResponse(response);
    state.csrf = data.csrf || state.csrf;
    state.avatar = data.avatar || state.avatar;
    state.authenticated = Boolean(data.authenticated);
    updateAlertBadge(data.guardian_alert_count || 0, data.guardian_alerts || []);
    return data;
  };

  const loadStatus = async (options = {}) => {
    const statusOnly = Boolean(options.statusOnly);

    try {
      const data = await refreshStatusToken();

      root.querySelectorAll('img').forEach((img) => {
        if (img.src.includes('/miauw/')) img.src = state.avatar;
      });

      if (statusOnly && !state.open) {
        return;
      }

      showAuthState();

      if (state.authenticated) {
        renderMessages(data.messages || []);
      } else {
        feed.innerHTML = '';
        addMessage('assistant', 'Login primeiro. Fiscal interno nao trabalha no anonimato, que luxo perigoso.');
      }
    } catch (error) {
      if (statusOnly && !state.open) return;
      feed.innerHTML = '';
      state.authenticated = false;
      showAuthState();
      addMessage('assistant', 'Nao consegui carregar o Miauby agora. Tente novamente em instantes.');
    }
  };

  const submitLoginAttempt = async (username, password) => {
    const body = new FormData();
    body.set('username', username);
    body.set('password', password);
    body.set('csrf_token', state.csrf);

    const response = await fetch('/miauw/widget-auth.php', {
      method: 'POST',
      body,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-CSRF-Token': state.csrf },
    });
    const data = await readJsonResponse(response);
    state.csrf = data.csrf || state.csrf;

    return { response, data };
  };

  const login = async () => {
    const username = root.querySelector('input[name="username"]').value.trim();
    const password = root.querySelector('input[name="password"]').value;

    if (!username || !password) {
      addMessage('assistant', 'Informe usuario e senha para eu abrir o turno.');
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Entrando...';

    try {
      if (!state.csrf) {
        await refreshStatusToken();
      }

      let result = await submitLoginAttempt(username, password);
      if (result.response.status === 419) {
        await refreshStatusToken();
        result = await submitLoginAttempt(username, password);
      }

      const data = result.data;

      if (!data.ok) {
        addMessage('assistant', data.message || 'Login falhou. O bigode nao aprovou.');
        return;
      }

      state.csrf = data.csrf || state.csrf;
      state.authenticated = true;
      showAuthState();
      feed.innerHTML = '';
        addMessage('assistant', data.message || 'Entrei. Agora manda a bagunca operacional. Curto e com dado, por favor.');
      input.focus();
    } catch (error) {
      addMessage('assistant', 'Login falhou. Tragico, mas possivelmente digitavel de novo.');
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  };

  const send = async (message) => {
    const text = String(message || '').trim();
    if (!text || state.loading) return;

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';
    state.loading = true;
    showTyping();
    const typingDelay = new Promise((resolve) => setTimeout(resolve, 650));

    const body = new FormData();
    body.set('action', 'send');
    body.set('message', text);
    body.set('csrf_token', state.csrf);
    body.set('page_context', pageContext());
    body.set('widget', '1');

    try {
      const response = await fetch('/miauw/api.php', {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': state.csrf },
      });
      const data = await readJsonResponse(response);
      await typingDelay;

      if (!data.ok) {
        hideTyping();
        if (data.auth === false) {
          state.authenticated = false;
          showAuthState();
        }

        await addAssistantParts([data.message || 'Nao consegui concluir agora.'], { fallback: data.fallback });
        return;
      }

      hideTyping();
      updateAlertBadge(data.guardian_alert_count || 0, data.guardian_alerts || []);
      await addAssistantParts(data.reply_parts || [data.reply || 'Nao consegui montar a resposta agora. Tente de novo.'], {
        time: data.time,
        fallback: data.fallback,
        fallbackText: data.reply || 'Nao consegui montar a resposta agora. Tente de novo.',
      });
    } catch (error) {
      await typingDelay;
      hideTyping();
      addMessage('assistant', 'Nao consegui falar com o Miauby agora. Tente novamente em instantes.');
    } finally {
      hideTyping();
      state.loading = false;
    }
  };

  bubble.addEventListener('click', () => setOpen(!state.open));
  alertNudge.addEventListener('click', () => {
    const prompt = alertNudge.dataset.miauwPrompt || '';
    const view = alertNudge.dataset.miauwView || 'chat';
    alertNudge.dataset.miauwPrompt = '';
    setOpen(true);
    if (prompt) {
      window.setTimeout(() => send(prompt), 180);
    } else {
      setView(view);
    }
  });
  close.addEventListener('click', () => setOpen(false));
  loginButton.addEventListener('click', login);

  viewButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.miauwView || 'chat'));
  });

  if (alertRefresh) {
    alertRefresh.addEventListener('click', loadAlerts);
  }

  if (alertList) {
    alertList.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('[data-miauw-alert-dismiss]') : null;
      if (!button) return;
      dismissAlert(button.dataset.miauwAlertDismiss);
    });
  }

  loginBox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      login();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });

  const markUserActivity = (event) => {
    lastUserActivityAt = Date.now();
    root.classList.add('has-user-activity');
    window.clearTimeout(activityTimer);
    activityTimer = window.setTimeout(() => root.classList.remove('has-user-activity'), 1600);

    if (event && (event.type === 'pointermove' || event.type === 'click' || event.type === 'mousedown')) {
      maybeSpawnScreenEffect(event);
    }

    flushPendingNudge();
    maybeShowAmbientNudge();
    maybeShowHomeCreatureNudge();
  };

  ['pointermove', 'mousedown', 'keydown', 'scroll', 'focusin'].forEach((eventName) => {
    document.addEventListener(eventName, markUserActivity, { passive: true, capture: true });
  });

  document.addEventListener('click', (event) => {
    recordInteraction('clicou em', event.target);
  }, true);

  document.addEventListener('input', (event) => {
    recordInteraction('editou', event.target);
  }, true);

  window.MiaubyGuide = {
    paw: showGuideCue,
    effect: spawnScreenEffect,
    recentInteractions: () => recentInteractions.slice(),
    screenObjects: () => screenObjects(),
  };

  loadStatus({ statusOnly: true });
  window.setTimeout(maybeShowHomeCreatureNudge, 2200);
  window.setInterval(() => {
    loadStatus({ statusOnly: !state.open });
  }, 1000 * 60 * 5);
})();
