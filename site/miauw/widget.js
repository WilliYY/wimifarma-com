(() => {
  if (window.__miauwWidgetLoaded) return;
  window.__miauwWidgetLoaded = true;

  const currentPath = window.location.pathname || '';
  const isCotacaoPath = currentPath.startsWith('/cotacao');
  if (currentPath.startsWith('/miauw/')) return;

  const cssId = 'miauw-widget-css';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = '/miauw/widget.css?v=20260529a';
    document.head.appendChild(link);
  }

  const state = {
    open: false,
    authenticated: false,
    csrf: '',
    avatar: '/miauw/miauby-novo.jpeg',
    loading: false,
    alerts: [],
    alertCount: 0,
    canDismissAlerts: true,
    view: 'chat',
    audio: {
      uiEnabled: false,
      captureEnabled: false,
      transcriptionEnabled: false,
      status: 'desativado',
      model: '',
      voice: '',
    },
  };

  const root = document.createElement('section');
  root.className = 'miauw-widget';
  root.innerHTML = `
    <button class="miauw-widget-bubble" type="button" aria-label="Abrir Miauby" aria-expanded="false">
      <img src="/miauw/miauby-novo.jpeg" alt="">
      <span>Miauby</span>
      <strong class="miauw-widget-alert-badge" data-miauw-alert-badge hidden>0</strong>
    </button>
    <button class="miauw-widget-nudge" type="button" data-miauw-nudge hidden aria-label="Recado do Miauby">Miauby esta de olho.</button>
    <div class="miauw-widget-panel" role="dialog" aria-label="Chat do Miauby" aria-hidden="true">
      <header class="miauw-widget-head">
        <div>
          <img src="/miauw/miauby-novo.jpeg" alt="">
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
        <section class="miauw-widget-audio-draft" data-miauw-audio-draft hidden aria-live="polite">
          <div class="miauw-widget-audio-draft-top">
            <span class="miauw-widget-audio-draft-dot" aria-hidden="true"></span>
            <strong>Audio pronto</strong>
            <small data-miauw-audio-draft-duration>00:00</small>
          </div>
          <div class="miauw-widget-audio-draft-player">
            <audio data-miauw-audio-draft-player controls preload="metadata" controlsList="nodownload noplaybackrate"></audio>
            <span class="miauw-widget-audio-draft-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          </div>
          <p><strong>Transcricao:</strong> <span data-miauw-audio-draft-transcript></span></p>
        </section>
        <textarea name="message" rows="1" maxlength="1200" placeholder="Chama o Miauby..."></textarea>
        <button class="miauw-widget-audio" type="button" data-miauw-audio-toggle aria-label="Falar com Miauby" aria-pressed="false" title="Falar com Miauby" hidden>
          <span class="miauw-widget-audio-dot" aria-hidden="true"></span>
          <span data-miauw-audio-label>Falar</span>
        </button>
        <button class="miauw-widget-audio-cancel" type="button" data-miauw-audio-cancel hidden>Descartar audio</button>
        <button class="miauw-widget-send" type="submit">Enviar</button>
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
  const audioButton = root.querySelector('[data-miauw-audio-toggle]');
  const audioLabel = audioButton ? audioButton.querySelector('[data-miauw-audio-label]') : null;
  const audioCancelButton = root.querySelector('[data-miauw-audio-cancel]');
  const audioDraft = root.querySelector('[data-miauw-audio-draft]');
  const audioDraftPlayer = audioDraft ? audioDraft.querySelector('[data-miauw-audio-draft-player]') : null;
  const audioDraftDuration = audioDraft ? audioDraft.querySelector('[data-miauw-audio-draft-duration]') : null;
  const audioDraftTranscript = audioDraft ? audioDraft.querySelector('[data-miauw-audio-draft-transcript]') : null;
  let typingMessage = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const widgetAudioState = {
    starting: false,
    recording: false,
    transcribing: false,
    draftActive: false,
    stream: null,
    recorder: null,
    chunks: [],
    timer: null,
    startedAt: 0,
    previousText: '',
    cancelText: '',
    stopReason: 'idle',
    draftBlobUrl: '',
    draftDuration: '00:00',
    draftTranscript: '',
  };
  const widgetAudioNoticeState = {
    text: '',
    at: 0,
  };
  const widgetAudioMessageUrls = [];
  let lastUserActivityAt = 0;
  let lastGuideAt = 0;
  let lastAmbientNudgeAt = 0;
  let activityTimer = null;
  let pendingNudge = null;
  let cotacaoRunnerActive = false;
  let cotacaoRunnerTimer = null;
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

  const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));

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
    } else if (widgetAudioState.recording || widgetAudioState.starting || widgetAudioState.transcribing) {
      resetWidgetAudioCaptureState({ clearDraft: false });
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

  const renderConfirmation = (container, confirmation) => {
    if (!container || !confirmation || !confirmation.id) return;

    const card = document.createElement('div');
    card.className = 'miauw-widget-confirmation';
    card.innerHTML = `
      <strong>Confirmar acao</strong>
      <span>${escapeHtml(confirmation.summary || 'Acao operacional pendente.')}</span>
      <nav>
        <button type="button" data-miauw-confirm-action="confirmar">Confirmar</button>
        <button type="button" data-miauw-confirm-action="cancelar">Cancelar</button>
      </nav>
    `;

    card.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.miauwConfirmAction || 'cancelar';
        card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        button.textContent = action === 'confirmar' ? 'Confirmando...' : 'Cancelando...';
        send(`${action} ${confirmation.id}`, { silentConfirmation: true });
      });
    });

    container.appendChild(card);
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
    if (role === 'assistant' && options.confirmation) {
      renderConfirmation(item.querySelector('div'), options.confirmation);
    }
    feed.appendChild(item);
    scrollBottom();
    return item;
  };

  const rememberWidgetAudioMessageUrl = (url) => {
    const safeUrl = String(url || '');
    if (safeUrl && safeUrl.startsWith('blob:')) {
      widgetAudioMessageUrls.push(safeUrl);
    }
    return safeUrl;
  };

  const releaseWidgetAudioMessageUrls = () => {
    if (!window.URL || typeof window.URL.revokeObjectURL !== 'function') return;
    while (widgetAudioMessageUrls.length) {
      const url = widgetAudioMessageUrls.pop();
      if (url) {
        try { window.URL.revokeObjectURL(url); } catch (error) { /* ignored */ }
      }
    }
  };

  const widgetAudioUrlFromBase64 = (base64, mime = 'audio/mpeg') => {
    const raw = String(base64 || '').trim();
    if (!raw || !window.URL || typeof window.URL.createObjectURL !== 'function') return '';

    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return rememberWidgetAudioMessageUrl(window.URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' })));
  };

  const widgetAudioBarsHtml = () => '<span class="miauw-widget-chat-audio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';

  const addWidgetAudioMessage = (role, audio, options = {}) => {
    if (!audio || !audio.url) return null;

    const item = document.createElement('article');
    item.className = `miauw-widget-msg ${role} audio-message`;
    const time = options.time || new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '');
    const duration = String(audio.duration || '').trim();
    const transcript = String(audio.transcript || '').trim();

    item.innerHTML = `
      ${role === 'assistant' ? `<img src="${escapeHtml(state.avatar)}" alt="">` : ''}
      <div class="miauw-widget-chat-audio">
        <span class="miauw-widget-chat-audio-state">${role === 'assistant' ? 'Miauby respondeu' : 'Audio enviado'}${duration ? ` <small>${escapeHtml(duration)}</small>` : ''}</span>
        <span class="miauw-widget-chat-audio-player">
          <audio controls preload="metadata" controlsList="nodownload noplaybackrate" src="${escapeHtml(audio.url)}" aria-label="${role === 'assistant' ? 'Resposta em audio do Miauby' : 'Audio enviado'}"></audio>
          ${widgetAudioBarsHtml()}
        </span>
        ${role === 'assistant' && transcript ? `<section class="miauw-widget-chat-audio-text"><button type="button" data-miauw-audio-transcript-toggle>Ver texto</button><p data-miauw-audio-transcript-text hidden>${formatMessage(transcript)}</p></section>` : ''}
        <time>${escapeHtml(time)}</time>
      </div>
    `;

    if (role === 'assistant' && options.confirmation) {
      renderConfirmation(item.querySelector('div'), options.confirmation);
    }

    feed.appendChild(item);
    scrollBottom();

    const player = item.querySelector('audio');
    const transcriptButton = item.querySelector('[data-miauw-audio-transcript-toggle]');
    const transcriptText = item.querySelector('[data-miauw-audio-transcript-text]');
    if (transcriptButton && transcriptText) {
      transcriptButton.addEventListener('click', () => {
        const willShow = transcriptText.hidden;
        transcriptText.hidden = !willShow;
        transcriptButton.textContent = willShow ? 'Ocultar texto' : 'Ver texto';
      });
    }

    if (player && options.autoPlay) {
      player.play().catch(() => {});
    }

    return item;
  };

  const streamAssistantMessage = async (text, options = {}) => {
    const source = String(text || '');
    if (!source || reducedMotion || source.length < 28) {
      addMessage('assistant', source, options);
      return;
    }

    const item = addMessage('assistant', '', options);
    const paragraph = item.querySelector('p');
    if (!paragraph) return;

    const pieces = source.match(/.{1,18}(?:\s|$)/g) || [source];
    let current = '';

    for (const piece of pieces) {
      current += piece;
      paragraph.innerHTML = formatMessage(current);
      scrollBottom();
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  };

  const addAssistantParts = async (parts, options = {}) => {
    const safeParts = Array.isArray(parts) && parts.length ? parts : [options.fallbackText || 'Nao consegui montar a resposta agora. Tente de novo.'];

    for (let index = 0; index < safeParts.length; index += 1) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
      await streamAssistantMessage(safeParts[index], {
        ...options,
        confirmation: index === safeParts.length - 1 ? options.confirmation : null,
      });
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
    const speech = topAlert && topAlert.speech ? topAlert.speech : '';
    queueOrShowNudge({
      text: speech || (topAlert && topAlert.title ? `${prefix} ${topAlert.title}` : `${prefix} Abrir painel.`),
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

  const cotacaoRunnerHomePoint = () => {
    const rect = bubble.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) {
      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
      };
    }

    return {
      x: window.innerWidth - 64,
      y: window.innerHeight - 64,
    };
  };

  const cotacaoRunnerWaypoint = () => ({
    x: clampNumber(80 + Math.random() * Math.max(120, window.innerWidth - 160), 70, Math.max(70, window.innerWidth - 70)),
    y: clampNumber(92 + Math.random() * Math.max(120, window.innerHeight - 184), 82, Math.max(82, window.innerHeight - 82)),
  });

  const spawnCotacaoPikachuRunner = () => {
    if (!isCotacaoPath || reducedMotion || cotacaoRunnerActive || document.hidden || state.open) {
      return false;
    }

    cotacaoRunnerActive = true;
    const runner = document.createElement('img');
    runner.className = 'miauw-cotacao-runner';
    runner.src = '/miauw/pikachu-loop.webp';
    runner.alt = '';
    runner.setAttribute('aria-hidden', 'true');
    runner.setAttribute('data-miauby-screen-object', 'pikachu da cotacao');
    runner.setAttribute('data-miauby-screen-label', 'Pikachu dando ronda dentro da Cotacao');
    document.body.appendChild(runner);

    const home = cotacaoRunnerHomePoint();
    let rect = runner.getBoundingClientRect();
    let width = rect.width || 128;
    let height = rect.height || 86;
    let x = home.x - (width / 2);
    let y = home.y - (height / 2);
    let vx = home.x > window.innerWidth / 2 ? -(1.35 + Math.random() * 0.85) : (1.35 + Math.random() * 0.85);
    let vy = -0.7 + Math.random() * 1.4;
    let waypoint = cotacaoRunnerWaypoint();
    let lastTick = performance.now();
    const startedAt = lastTick;
    const phase = Math.random() * Math.PI * 2;
    const pointer = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      active: false,
    };

    const setRunnerPosition = () => {
      runner.style.setProperty('--miauw-cotacao-runner-x', `${x.toFixed(1)}px`);
      runner.style.setProperty('--miauw-cotacao-runner-y', `${y.toFixed(1)}px`);
      runner.style.setProperty('--miauw-cotacao-runner-dir', vx < 0 ? '-1' : '1');
      runner.style.setProperty('--miauw-cotacao-runner-tilt', `${clampNumber(vy * 4.5, -13, 13).toFixed(1)}deg`);
    };

    const onPointerMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      runner.classList.add('is-returning');
      window.setTimeout(() => runner.remove(), 240);
      cotacaoRunnerActive = false;
    };

    const tick = (now) => {
      if (!runner.isConnected) {
        cotacaoRunnerActive = false;
        return;
      }

      const elapsed = now - startedAt;
      const dt = Math.min(32, now - lastTick) / 16.67;
      lastTick = now;
      rect = runner.getBoundingClientRect();
      width = rect.width || width;
      height = rect.height || height;

      const centerX = x + (width / 2);
      const centerY = y + (height / 2);
      const returningHome = elapsed > 9800;
      const target = returningHome ? cotacaoRunnerHomePoint() : waypoint;
      const targetDx = target.x - centerX;
      const targetDy = target.y - centerY;
      const targetDistance = Math.max(1, Math.hypot(targetDx, targetDy));

      if (!returningHome && targetDistance < 92) {
        waypoint = cotacaoRunnerWaypoint();
      }

      const targetForce = returningHome ? 0.12 : 0.048;
      vx += (targetDx / targetDistance) * targetForce * dt;
      vy += (targetDy / targetDistance) * targetForce * dt;
      vx += Math.cos((now / 820) + phase) * 0.018 * dt;
      vy += Math.sin((now / 960) + phase) * 0.018 * dt;

      const mouseDx = centerX - pointer.x;
      const mouseDy = centerY - pointer.y;
      const mouseDistance = Math.max(1, Math.hypot(mouseDx, mouseDy));
      if (pointer.active && mouseDistance < 230) {
        const flee = (230 - mouseDistance) / 230;
        vx += (mouseDx / mouseDistance) * flee * 0.7;
        vy += (mouseDy / mouseDistance) * flee * 0.7;
        runner.classList.add('is-fleeing');
      } else {
        runner.classList.remove('is-fleeing');
      }

      const maxSpeed = returningHome ? 4.15 : 3.25;
      const speed = Math.max(0.001, Math.hypot(vx, vy));
      if (speed > maxSpeed) {
        vx = (vx / speed) * maxSpeed;
        vy = (vy / speed) * maxSpeed;
      }

      vx *= 0.994;
      vy *= 0.994;
      x += vx * dt;
      y += vy * dt;

      const maxX = Math.max(10, window.innerWidth - width - 10);
      const maxY = Math.max(74, window.innerHeight - height - 10);
      if (x < 10 || x > maxX) {
        vx *= -0.84;
        x = clampNumber(x, 10, maxX);
      }
      if (y < 74 || y > maxY) {
        vy *= -0.84;
        y = clampNumber(y, 74, maxY);
      }

      setRunnerPosition();

      if ((returningHome && targetDistance < 34) || elapsed > 14500) {
        cleanup();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    setRunnerPosition();
    window.requestAnimationFrame(tick);
    return true;
  };

  const scheduleCotacaoPikachuRunner = (delay = 65000) => {
    if (!isCotacaoPath || reducedMotion) return;

    window.clearTimeout(cotacaoRunnerTimer);
    cotacaoRunnerTimer = window.setTimeout(() => {
      const spawned = spawnCotacaoPikachuRunner();
      scheduleCotacaoPikachuRunner(spawned ? 62000 + Math.random() * 58000 : 14000);
    }, delay);
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
        speech: alert.comentario_balao || alert.speech || '',
        module: alert.modulo || alert.module || 'sistema',
        type: alert.tipo || alert.type || '',
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
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
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
        headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrf, 'X-Requested-With': 'XMLHttpRequest' },
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
    releaseWidgetAudioMessageUrls();
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
    setWidgetAudioUi(widgetAudioState.recording ? 'recording' : (widgetAudioState.draftActive ? 'draft' : 'idle'), widgetAudioState.recording ? 'Parar' : (widgetAudioState.draftActive ? 'Refazer' : 'Falar'));
  };

  const applyAudioContract = (contract = {}) => {
    const next = contract && typeof contract === 'object' ? contract : {};
    state.audio = {
      uiEnabled: Boolean(next.ui_enabled),
      captureEnabled: Boolean(next.capture_enabled || next.enabled),
      transcriptionEnabled: Boolean(next.transcription_enabled),
      status: String(next.status || 'desativado'),
      model: String(next.model || ''),
      voice: String(next.voice || ''),
    };
    setWidgetAudioUi(widgetAudioState.recording ? 'recording' : (widgetAudioState.draftActive ? 'draft' : 'idle'), widgetAudioState.recording ? 'Parar' : (widgetAudioState.draftActive ? 'Refazer' : 'Falar'));
  };

  const widgetAudioUnavailable = () => {
    const status = state.audio.status || 'desativado';
    if (status === 'aguardando_chave') {
      return 'Audio ainda nao esta configurado no servidor. No texto eu sigo firme.';
    }
    if (status === 'curl_indisponivel') {
      return 'Audio indisponivel neste servidor agora. Meu bigode fica no texto por enquanto.';
    }
    if (status === 'desativado') {
      return 'Audio esta desligado neste ambiente. Sem microfone surpresa, humano.';
    }
    return 'Audio nao abriu agora. Revise permissao do microfone e tente de novo.';
  };

  const microphonePermissionMessage = (permissionState = '') => {
    if (permissionState === 'granted') {
      return 'O Chrome mostra permissao ativa, mas nao entregou o microfone. Recarregue a pagina; se continuar, verifique Windows > Privacidade > Microfone para o Chrome.';
    }
    if (permissionState === 'prompt') {
      return 'O Chrome ainda nao confirmou o microfone. Aperte Falar de novo e escolha Permitir quando aparecer.';
    }
    if (permissionState === 'denied') {
      return 'O Chrome ainda esta devolvendo microfone bloqueado. Clique em Redefinir permissao, recarregue a pagina e permita o microfone de novo.';
    }
    return 'Microfone bloqueado no navegador. Clique no cadeado/configuracoes ao lado do endereco, permita Microfone para este site, recarregue a pagina e tente de novo.';
  };

  const widgetAudioSecureContextMessage = () => 'Audio por microfone precisa de HTTPS ou localhost. No texto eu continuo funcionando.';

  const widgetAudioErrorMessage = (error) => {
    const name = error && error.name ? String(error.name) : '';
    const message = error && error.message ? String(error.message) : '';
    const permissionState = error && error.miauwPermissionState ? String(error.miauwPermissionState) : '';
    const lower = `${name} ${message}`.toLowerCase();

    if (name === 'NotFoundError' || lower.includes('notfound')) {
      return 'Nao achei microfone nesse navegador. Conecte ou selecione um microfone e tente de novo.';
    }

    if (name === 'NotReadableError' || lower.includes('notreadable')) {
      return 'Microfone parece ocupado por outro app. Feche a outra chamada e tente de novo.';
    }

    if (name === 'OverconstrainedError' || lower.includes('overconstrained')) {
      return 'O navegador recusou a configuracao do microfone. Tente de novo com o microfone padrao.';
    }

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' || lower.includes('permission denied') || lower.includes('permission dismissed') || lower.includes('notallowed')) {
      return microphonePermissionMessage(permissionState);
    }

    if (message && !lower.includes('denied')) {
      return message;
    }

    return widgetAudioUnavailable();
  };

  const showWidgetAudioNotice = (text) => {
    const safeText = String(text || widgetAudioUnavailable()).trim();
    const now = Date.now();
    if (safeText === widgetAudioNoticeState.text && now - widgetAudioNoticeState.at < 15000) return;

    widgetAudioNoticeState.text = safeText;
    widgetAudioNoticeState.at = now;
    addMessage('assistant', safeText);
  };

  const microphonePermissionState = async () => {
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return '';

    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      return permission && permission.state ? String(permission.state) : '';
    } catch (error) {
      return '';
    }
  };

  const getWidgetAudioStream = async () => {
    const permissionState = await microphonePermissionState();

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      if (error && typeof error === 'object') {
        error.miauwPermissionState = permissionState;
      }
      throw error;
    }
  };

  const MIN_WIDGET_AUDIO_RECORDING_MS = 1700;
  const MAX_WIDGET_AUDIO_RECORDING_MS = 90000;

  const widgetAudioMimeType = () => {
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidates.find((item) => window.MediaRecorder.isTypeSupported(item)) || '';
  };

  const widgetAudioSeconds = (totalSeconds) => {
    const normalizedSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = String(Math.floor(normalizedSeconds / 60)).padStart(2, '0');
    const seconds = String(normalizedSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const widgetAudioDuration = () => {
    if (!widgetAudioState.startedAt) return '00:00';
    return widgetAudioSeconds((Date.now() - widgetAudioState.startedAt) / 1000);
  };

  const clearWidgetAudioDraftPreview = () => {
    if (widgetAudioState.draftBlobUrl && window.URL && typeof window.URL.revokeObjectURL === 'function') {
      window.URL.revokeObjectURL(widgetAudioState.draftBlobUrl);
    }
    widgetAudioState.draftBlobUrl = '';
    widgetAudioState.draftDuration = '00:00';
    widgetAudioState.draftTranscript = '';

    if (audioDraftPlayer) {
      audioDraftPlayer.removeAttribute('src');
      try { audioDraftPlayer.load(); } catch (error) { /* ignored */ }
    }
    if (audioDraftDuration) {
      audioDraftDuration.textContent = '00:00';
    }
    if (audioDraftTranscript) {
      audioDraftTranscript.textContent = '';
    }
    if (audioDraft) {
      audioDraft.hidden = true;
    }
  };

  const showWidgetAudioDraftPreview = (blob, transcript, durationLabel) => {
    clearWidgetAudioDraftPreview();

    const safeTranscript = String(transcript || '').trim();
    const safeDuration = durationLabel || '00:00';
    widgetAudioState.draftDuration = safeDuration;
    widgetAudioState.draftTranscript = safeTranscript;

    if (blob && audioDraftPlayer && window.URL && typeof window.URL.createObjectURL === 'function') {
      widgetAudioState.draftBlobUrl = window.URL.createObjectURL(blob);
      audioDraftPlayer.src = widgetAudioState.draftBlobUrl;
    }

    if (audioDraftDuration) {
      audioDraftDuration.textContent = safeDuration;
    }
    if (audioDraftTranscript) {
      audioDraftTranscript.textContent = safeTranscript || 'Nao veio texto claro. Refaca o audio antes de enviar.';
    }
    if (audioDraft) {
      audioDraft.hidden = false;
    }
  };

  const setWidgetAudioUi = (mode, label = '') => {
    if (!audioButton) return;
    const active = mode === 'recording';
    const busy = mode === 'starting' || mode === 'transcribing';
    const draft = mode === 'draft';
    const allowed = state.authenticated && state.view === 'chat' && state.audio.uiEnabled;

    audioButton.hidden = !allowed;
    audioButton.disabled = busy || !allowed;
    audioButton.classList.toggle('is-active', active);
    audioButton.classList.toggle('is-starting', busy);
    audioButton.classList.toggle('is-draft', draft);
    audioButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (audioLabel) {
      audioLabel.textContent = label || (active ? `Parar ${widgetAudioDuration()}` : 'Falar');
    }
    if (audioCancelButton) {
      audioCancelButton.hidden = !(allowed && (active || draft || mode === 'transcribing'));
      audioCancelButton.disabled = mode === 'transcribing';
      audioCancelButton.textContent = active ? 'Cancelar audio' : (draft ? 'Descartar audio' : 'Aguarde');
    }
  };

  const stopWidgetAudioTracks = () => {
    if (widgetAudioState.stream) {
      widgetAudioState.stream.getTracks().forEach((track) => track.stop());
    }
    widgetAudioState.stream = null;
  };

  const clearWidgetAudioTimer = () => {
    if (widgetAudioState.timer) {
      window.clearInterval(widgetAudioState.timer);
      widgetAudioState.timer = null;
    }
  };

  const resetWidgetAudioCaptureState = (options = {}) => {
    clearWidgetAudioTimer();
    stopWidgetAudioTracks();
    widgetAudioState.starting = false;
    widgetAudioState.recording = false;
    widgetAudioState.transcribing = false;
    widgetAudioState.recorder = null;
    widgetAudioState.chunks = [];
    widgetAudioState.startedAt = 0;
    widgetAudioState.stopReason = 'idle';
    if (options.clearDraft) {
      clearWidgetAudioDraftPreview();
      widgetAudioState.draftActive = false;
      input.value = options.restorePrevious ? widgetAudioState.cancelText : input.value;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
      widgetAudioState.previousText = '';
      widgetAudioState.cancelText = '';
    }
    setWidgetAudioUi(widgetAudioState.draftActive ? 'draft' : 'idle', widgetAudioState.draftActive ? 'Refazer' : 'Falar');
  };

  const cancelWidgetAudioDraft = () => {
    if (widgetAudioState.recording && widgetAudioState.recorder) {
      widgetAudioState.stopReason = 'cancel';
      try { widgetAudioState.recorder.stop(); } catch (error) { resetWidgetAudioCaptureState({ clearDraft: true, restorePrevious: true }); }
      return;
    }

    resetWidgetAudioCaptureState({ clearDraft: true, restorePrevious: true });
  };

  const widgetTranscriptLooksTooLongForAudio = (transcript, durationMs) => {
    const text = String(transcript || '').trim();
    if (!text || !durationMs) return false;
    const words = text.split(/\s+/).filter(Boolean).length;
    if (durationMs < 2500 && words > 12) return true;
    return durationMs < 6500 && words > Math.max(16, Math.ceil((durationMs / 1000) * 5.5));
  };

  const transcribeWidgetAudioBlob = async (blob, durationMs = 0) => {
    if (!blob || blob.size <= 0) {
      throw new Error('O audio veio vazio. Segura um pouco mais antes de parar.');
    }

    const body = new FormData();
    body.set('action', 'audio_transcribe');
    body.set('audio', blob, 'miauby-audio.webm');
    body.set('duration_ms', String(Math.max(0, Math.round(Number(durationMs) || 0))));
    body.set('csrf_token', state.csrf);
    body.set('widget', '1');

    const response = await fetch('/miauw/api.php', {
      method: 'POST',
      body,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrf, 'X-Requested-With': 'XMLHttpRequest' },
    });
    const data = await readJsonResponse(response);
    state.csrf = data.csrf || state.csrf;
    if (!data.ok || !data.text) {
      throw new Error(data.detail || data.message || widgetAudioUnavailable());
    }

    const transcript = String(data.text || '').trim();
    if (widgetTranscriptLooksTooLongForAudio(transcript, durationMs)) {
      throw new Error('Esse audio ficou curto ou com ruido. Grave de novo com pelo menos 2 segundos, sem pressa.');
    }

    return transcript;
  };

  const finishWidgetRecordingAndTranscribe = async () => {
    const durationMs = widgetAudioState.startedAt ? Date.now() - widgetAudioState.startedAt : 0;
    const blob = new Blob(widgetAudioState.chunks, { type: widgetAudioMimeType() || 'audio/webm' });
    const durationLabel = widgetAudioSeconds(durationMs / 1000);
    widgetAudioState.recording = false;
    clearWidgetAudioTimer();
    stopWidgetAudioTracks();

    if (durationMs < MIN_WIDGET_AUDIO_RECORDING_MS) {
      resetWidgetAudioCaptureState({ clearDraft: true, restorePrevious: true });
      showWidgetAudioNotice('Audio curto demais. Grave pelo menos 2 segundos, meu bigode nao adivinha sopro.');
      return;
    }

    widgetAudioState.transcribing = true;
    setWidgetAudioUi('transcribing', 'Transcrevendo');

    try {
      const transcript = await transcribeWidgetAudioBlob(blob, durationMs);
      const previous = widgetAudioState.previousText.trim();
      input.value = previous ? `${previous}\n${transcript}` : transcript;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
      input.focus();
      widgetAudioState.draftActive = true;
      widgetAudioState.transcribing = false;
      showWidgetAudioDraftPreview(blob, transcript, durationLabel);
      setWidgetAudioUi('draft', 'Refazer');
    } catch (error) {
      resetWidgetAudioCaptureState({ clearDraft: true, restorePrevious: true });
      showWidgetAudioNotice(widgetAudioErrorMessage(error));
    }
  };

  const startWidgetAudioSession = async () => {
    if (!audioButton || widgetAudioState.starting) return;
    if (widgetAudioState.recording && widgetAudioState.recorder) {
      widgetAudioState.stopReason = 'transcribe';
      try { widgetAudioState.recorder.stop(); } catch (error) { showWidgetAudioNotice(widgetAudioErrorMessage(error)); }
      return;
    }

    if (widgetAudioState.transcribing) {
      return;
    }

    if (!state.authenticated) {
      showWidgetAudioNotice('Login primeiro. Microfone sem cracha nao entra no turno.');
      return;
    }

    if (!state.audio.uiEnabled || state.audio.status !== 'pronto_com_botao') {
      showWidgetAudioNotice(widgetAudioUnavailable());
      return;
    }

    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      showWidgetAudioNotice(widgetAudioSecureContextMessage());
      return;
    }

    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showWidgetAudioNotice('Seu navegador nao liberou gravacao por audio aqui. No texto eu continuo afiado.');
      return;
    }

    widgetAudioState.starting = true;
    setWidgetAudioUi('starting', 'Abrindo');

    try {
      const stream = await getWidgetAudioStream();

      const mimeType = widgetAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      clearWidgetAudioDraftPreview();
      widgetAudioState.stream = stream;
      widgetAudioState.recorder = recorder;
      widgetAudioState.chunks = [];
      widgetAudioState.cancelText = input.value || '';
      if (!widgetAudioState.draftActive) {
        widgetAudioState.previousText = input.value || '';
      }
      widgetAudioState.stopReason = 'transcribe';

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          widgetAudioState.chunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const reason = widgetAudioState.stopReason;
        if (reason === 'cancel') {
          resetWidgetAudioCaptureState({ clearDraft: true, restorePrevious: true });
          return;
        }
        finishWidgetRecordingAndTranscribe();
      });

      widgetAudioState.starting = false;
      widgetAudioState.recording = true;
      widgetAudioState.draftActive = false;
      widgetAudioState.startedAt = Date.now();
      recorder.start(350);
      setWidgetAudioUi('recording', `Parar ${widgetAudioDuration()}`);
      widgetAudioState.timer = window.setInterval(() => {
        setWidgetAudioUi('recording', `Parar ${widgetAudioDuration()}`);
        if (Date.now() - widgetAudioState.startedAt >= MAX_WIDGET_AUDIO_RECORDING_MS && widgetAudioState.recording && widgetAudioState.recorder) {
          widgetAudioState.stopReason = 'transcribe';
          try { widgetAudioState.recorder.stop(); } catch (error) { /* ignored */ }
        }
      }, 500);
    } catch (error) {
      resetWidgetAudioCaptureState({ clearDraft: widgetAudioState.draftActive, restorePrevious: false });
      showWidgetAudioNotice(widgetAudioErrorMessage(error));
    }
  };

  const consumeWidgetAudioDraftForMessage = () => {
    if (!widgetAudioState.draftActive || !widgetAudioState.draftBlobUrl) return null;

    const draft = {
      url: rememberWidgetAudioMessageUrl(widgetAudioState.draftBlobUrl),
      duration: widgetAudioState.draftDuration || '00:00',
      transcript: widgetAudioState.draftTranscript || '',
    };
    widgetAudioState.draftBlobUrl = '';
    return draft;
  };

  const readJsonResponse = async (response) => {
    const raw = await response.text();
    if (!raw.trim()) {
      return {
        ok: false,
        status: response.status,
        message: 'Miauby recebeu uma resposta vazia. Atualize a pagina e tente de novo.',
      };
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch (innerError) {
          // Continua para a mensagem padrao abaixo.
        }
      }

      return {
        ok: false,
        status: response.status,
        auth: response.status === 401 ? false : undefined,
        message: response.status >= 500
          ? 'Miauby recebeu erro do servidor. Atualize a pagina e tente de novo.'
          : 'Miauby recebeu uma resposta fora do formato. Atualize a pagina e tente de novo.',
      };
    }
  };

  const refreshStatusToken = async () => {
    const response = await fetch('/miauw/widget-status.php', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const data = await readJsonResponse(response);
    state.csrf = data.csrf || state.csrf;
    state.avatar = data.avatar || state.avatar;
    state.authenticated = Boolean(data.authenticated);
    applyAudioContract(data.audio_contract || {});
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
      headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrf, 'X-Requested-With': 'XMLHttpRequest' },
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
        state.authenticated = false;
        showAuthState();
        addMessage('assistant', data.message || 'Login falhou. O bigode nao aprovou.');
        return;
      }

      const loginMessage = data.message || 'Entrei. Agora manda a bagunca operacional. Curto e com dado, por favor.';
      state.csrf = data.csrf || state.csrf;
      state.authenticated = true;

      const statusData = await refreshStatusToken();
      showAuthState();
      feed.innerHTML = '';

      if (!state.authenticated) {
        addMessage('assistant', 'Login recebido, mas o navegador nao guardou minha sessao. Atualize a pagina e tente de novo; se persistir, o cookie do Miauby esta sendo bloqueado.');
        return;
      }

      if (Array.isArray(statusData.messages) && statusData.messages.length) {
        renderMessages(statusData.messages);
      } else {
        addMessage('assistant', loginMessage);
      }
      input.focus();
    } catch (error) {
      addMessage('assistant', 'Login falhou. Tragico, mas possivelmente digitavel de novo.');
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  };

  const send = async (message, options = {}) => {
    const text = String(message || '').trim();
    if (!text || state.loading) return;

    if (options.userAudio && options.userAudio.url) {
      addWidgetAudioMessage('user', options.userAudio);
    } else if (!options.silentConfirmation) {
      addMessage('user', text);
    }
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
    if (options.silentConfirmation) {
      body.set('silent_confirmation', '1');
    }
    if (options.voiceReply) {
      body.set('voice_reply', '1');
    }
    if (options.userAudio && options.userAudio.url) {
      body.set('input_mode', 'audio');
    }

    try {
      const response = await fetch('/miauw/api.php', {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrf, 'X-Requested-With': 'XMLHttpRequest' },
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
      if (options.voiceReply && data.reply_audio && data.reply_audio.audio_base64) {
        const assistantAudioUrl = widgetAudioUrlFromBase64(data.reply_audio.audio_base64, data.reply_audio.mime || 'audio/mpeg');
        if (assistantAudioUrl) {
          addWidgetAudioMessage('assistant', {
            url: assistantAudioUrl,
            duration: '',
            transcript: data.reply || '',
          }, {
            time: data.time,
            fallback: data.fallback,
            confirmation: data.confirmation || null,
            autoPlay: true,
          });
          maybeGuideFromReply(data.reply || '');
          return;
        }
      }

      await addAssistantParts(data.reply_parts || [data.reply || 'Nao consegui montar a resposta agora. Tente de novo.'], {
        time: data.time,
        fallback: data.fallback,
        confirmation: data.confirmation || null,
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
    const message = input.value;
    const voiceDraft = consumeWidgetAudioDraftForMessage();
    clearWidgetAudioDraftPreview();
    widgetAudioState.draftActive = false;
    widgetAudioState.previousText = '';
    widgetAudioState.cancelText = '';
    setWidgetAudioUi('idle', 'Falar');
    send(message, {
      userAudio: voiceDraft,
      voiceReply: Boolean(voiceDraft),
    });
  });

  if (audioButton) {
    audioButton.addEventListener('click', startWidgetAudioSession);
    window.addEventListener('beforeunload', () => {
      resetWidgetAudioCaptureState({ clearDraft: false });
      releaseWidgetAudioMessageUrls();
    });
  }

  if (audioCancelButton) {
    audioCancelButton.addEventListener('click', cancelWidgetAudioDraft);
  }

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
    pikachu: spawnCotacaoPikachuRunner,
    recentInteractions: () => recentInteractions.slice(),
    screenObjects: () => screenObjects(),
  };

  loadStatus({ statusOnly: true });
  window.setTimeout(maybeShowHomeCreatureNudge, 2200);
  scheduleCotacaoPikachuRunner(7500 + Math.random() * 5500);
  window.setInterval(() => {
    loadStatus({ statusOnly: !state.open });
  }, 1000 * 60 * 5);
})();
