(() => {
  const chat = document.querySelector('[data-chat]');
  if (!chat) return;

  const feed = chat.querySelector('[data-chat-feed]');
  const form = chat.querySelector('[data-chat-form]');
  const input = form ? form.querySelector('textarea[name="message"]') : null;
  const csrf = chat.dataset.csrf || '';
  const clearButton = chat.querySelector('[data-clear-chat]');
  const shortcutButtons = document.querySelectorAll('[data-prompt]');
  const guardianCard = document.querySelector('.guardian-card');
  let typingMessage = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scrollToBottom = () => {
    if (feed) feed.scrollTop = feed.scrollHeight;
  };

  const autoGrow = () => {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  };

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

  const formatMessage = (value) => escapeHtml(normalizeMessageText(value))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+|\/miauw\/relatorios\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
    .replaceAll('\n', '<br>');

  const renderConfirmation = (bubble, confirmation) => {
    if (!bubble || !confirmation || !confirmation.id) return;

    const card = document.createElement('div');
    card.className = 'miauw-confirmation-card';
    card.innerHTML = `
      <strong>Confirmar acao</strong>
      <span>${escapeHtml(confirmation.summary || 'Acao operacional pendente.')}</span>
      <nav>
        <button type="button" data-confirm-action="confirmar">Confirmar</button>
        <button type="button" data-confirm-action="cancelar">Cancelar</button>
      </nav>
    `;

    card.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.confirmAction || 'cancelar';
        card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        sendMessage(`${action} ${confirmation.id}`);
      });
    });

    bubble.appendChild(card);
  };

  const renderTrainingActions = (bubble, messageId) => {
    if (!bubble || !messageId || bubble.querySelector('[data-training-actions]')) return;

    const actions = document.createElement('nav');
    actions.className = 'training-actions';
    actions.dataset.trainingActions = '1';
    actions.dataset.messageId = String(messageId);
    actions.setAttribute('aria-label', 'Treinar resposta do Miauby');
    actions.innerHTML = `
      <button type="button" data-training-rating="boa">Boa</button>
      <button type="button" data-training-open>Treinar</button>
      <span data-training-status></span>
    `;
    bubble.appendChild(actions);
  };

  const addMessage = (role, text, options = {}) => {
    if (!feed) return;

    const article = document.createElement('article');
    article.className = `message ${role}`;
    const messageId = Number(options.messageId || 0);
    if (messageId > 0) {
      article.dataset.messageId = String(messageId);
    }

    if (role === 'assistant') {
      const headerImage = document.querySelector('.agent img');
      const img = document.createElement('img');
      img.src = headerImage ? headerImage.src : '/miauw/assets/miauw-avatar.svg';
      img.alt = '';
      article.appendChild(img);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const stamp = options.time || new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '');
    const suffix = '';

    bubble.innerHTML = `<p>${formatMessage(text)}</p><time>${escapeHtml(stamp + suffix)}</time>`;
    if (role === 'assistant' && options.confirmation) {
      renderConfirmation(bubble, options.confirmation);
    }
    if (role === 'assistant' && messageId > 0 && !options.suppressTraining) {
      renderTrainingActions(bubble, messageId);
    }
    article.appendChild(bubble);
    feed.appendChild(article);
    scrollToBottom();
    return article;
  };

  const streamAssistantMessage = async (text, options = {}) => {
    const source = String(text || '');
    if (!source || reducedMotion || source.length < 28) {
      addMessage('assistant', source, options);
      return;
    }

    const article = addMessage('assistant', '', { ...options, suppressTraining: true });
    const paragraph = article ? article.querySelector('.bubble p') : null;
    if (!paragraph) return;

    const pieces = source.match(/.{1,18}(?:\s|$)/g) || [source];
    let current = '';

    for (const piece of pieces) {
      current += piece;
      paragraph.innerHTML = formatMessage(current);
      scrollToBottom();
      await new Promise((resolve) => setTimeout(resolve, 18));
    }

    const messageId = Number(options.messageId || 0);
    const bubble = article.querySelector('.bubble');
    if (messageId > 0 && bubble) {
      renderTrainingActions(bubble, messageId);
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
        messageId: index === safeParts.length - 1 ? options.messageId : 0,
      });
    }
  };

  const setTrainingStatus = (actions, text, mode = 'idle') => {
    if (!actions) return;
    const status = actions.querySelector('[data-training-status]');
    if (status) {
      status.textContent = text || '';
      status.dataset.mode = mode;
    }
  };

  const sendTrainingFeedback = async ({
    assistantMessageId,
    rating,
    reason = '',
    ideal = '',
    category = '',
    style = '',
  }, actions = null) => {
    const id = Number(assistantMessageId || 0);
    if (!id) return;

    if (actions) {
      actions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      setTrainingStatus(actions, 'Salvando...', 'loading');
    }

    const body = new FormData();
    body.set('action', 'train_feedback');
    body.set('assistant_message_id', String(id));
    body.set('rating', rating || 'ajuste');
    body.set('reason', reason);
    body.set('ideal', ideal);
    body.set('category', category);
    body.set('style', style);
    body.set('csrf_token', csrf);

    try {
      const response = await fetch('/miauw/api.php', {
        method: 'POST',
        body,
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.message || 'Falha ao treinar.');
      }

      if (actions) {
        setTrainingStatus(actions, data.status === 'aprovado' ? 'Aprovado' : 'Guardado', 'ok');
        actions.classList.add('is-saved');
      }
    } catch (error) {
      if (actions) {
        actions.querySelectorAll('button').forEach((button) => { button.disabled = false; });
        setTrainingStatus(actions, 'Falhou', 'error');
      }
      addMessage('assistant', 'Nao consegui guardar esse treino agora. Tenta de novo em instantes.');
    }
  };

  const openTrainingDialog = (messageId, actions) => {
    const id = Number(messageId || 0);
    if (!id || document.querySelector('.miauw-training-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'miauw-training-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <form class="miauw-training-box">
        <div>
          <span>Treinar resposta</span>
          <h2>Como o Miauby deveria falar?</h2>
        </div>
        <label>
          Motivo
          <select name="reason">
            <option value="chatgpt_demais">Parece ChatGPT demais</option>
            <option value="lista_demais">Listou demais</option>
            <option value="seco">Seco demais</option>
            <option value="longo">Longo demais</option>
            <option value="fugiu">Fugiu do assunto</option>
            <option value="sem_personalidade">Sem personalidade Miauby</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label>
          Tema
          <input name="category" maxlength="80" placeholder="ex: compra de farmacia">
        </label>
        <label>
          Estilo
          <input name="style" maxlength="80" value="miauby direto">
        </label>
        <label>
          Resposta ideal
          <textarea name="ideal" maxlength="1200" rows="5" placeholder="Escreva do jeito que o Miauby deveria responder..."></textarea>
        </label>
        <nav>
          <button class="btn primary" type="submit">Guardar treino</button>
          <button class="btn ghost" type="button" data-training-cancel>Cancelar</button>
        </nav>
      </form>
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-training-cancel]')) {
        close();
      }
    });
    overlay.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await sendTrainingFeedback({
        assistantMessageId: id,
        rating: 'ajuste',
        reason: String(formData.get('reason') || ''),
        ideal: String(formData.get('ideal') || ''),
        category: String(formData.get('category') || ''),
        style: String(formData.get('style') || ''),
      }, actions);
      close();
    });

    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('textarea');
    if (textarea) textarea.focus();
  };

  const showTyping = () => {
    if (!feed || typingMessage) return;

    const article = document.createElement('article');
    article.className = 'message assistant typing';
    article.setAttribute('aria-live', 'polite');
    article.innerHTML = `
      <img src="${escapeHtml((document.querySelector('.agent img') || {}).src || '/miauw/assets/miauw-avatar.svg')}" alt="">
      <div class="bubble">
        <span class="typing-text">Miauby esta digitando</span>
        <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    `;
    typingMessage = article;
    feed.appendChild(article);
    scrollToBottom();
  };

  const hideTyping = () => {
    if (typingMessage) {
      typingMessage.remove();
      typingMessage = null;
    }
  };

  const setLoading = (isLoading) => {
    if (!form) return;
    form.classList.toggle('is-loading', isLoading);
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = isLoading;
      button.querySelector('span').textContent = isLoading ? 'Pensando' : 'Enviar';
    }
  };

  const sendMessage = async (message) => {
    const text = String(message || '').trim();
    if (!text) return;

    addMessage('user', text);
    setLoading(true);
    showTyping();
    const typingDelay = new Promise((resolve) => setTimeout(resolve, 650));

    const body = new FormData();
    body.set('action', 'send');
    body.set('message', text);
    body.set('csrf_token', csrf);

    try {
      const response = await fetch('/miauw/api.php', {
        method: 'POST',
        body,
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await response.json();
      await typingDelay;

      if (!data.ok) {
        hideTyping();
        addMessage('assistant', data.message || 'Nao consegui concluir agora. Tente de novo.');
        return;
      }

      hideTyping();
      await addAssistantParts(data.reply_parts || [data.reply], {
        fallback: data.fallback,
        time: data.time,
        confirmation: data.confirmation || null,
        fallbackText: data.reply,
        messageId: data.assistant_message_id || 0,
      });
    } catch (error) {
      await typingDelay;
      hideTyping();
      addMessage('assistant', 'Nao consegui falar com o Miauby agora. Tente novamente em instantes.');
    } finally {
      hideTyping();
      setLoading(false);
    }
  };

  const updateGuardianCount = (count) => {
    if (!guardianCard) return;
    const total = Number(count || 0);
    const label = guardianCard.querySelector('.guardian-head strong');
    if (label) label.textContent = `${total} alerta(s)`;
    guardianCard.classList.toggle('has-alerts', total > 0);
  };

  const showGuardianEmpty = () => {
    if (!guardianCard || guardianCard.querySelector('.alert-pill')) return;
    const list = guardianCard.querySelector('.alert-list');
    if (list) {
      list.outerHTML = '<p class="guardian-empty">Sem alerta ativo agora. Milagre operacional detectado, mas eu continuo olhando.</p>';
    }
  };

  const dismissAlert = async (button) => {
    const alertId = Number(button.dataset.dismissAlert || 0);
    if (!alertId || button.disabled) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = '...';

    const body = new FormData();
    body.set('action', 'dismiss_alert');
    body.set('alert_id', String(alertId));
    body.set('csrf_token', csrf);

    try {
      const response = await fetch('/miauw/api.php', {
        method: 'POST',
        body,
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await response.json();

      if (!data.ok) {
        button.disabled = false;
        button.textContent = originalText;
        addMessage('assistant', data.message || 'Nao consegui apagar esse alerta agora.');
        return;
      }

      const pill = button.closest('.alert-pill');
      if (pill) pill.remove();
      updateGuardianCount(data.guardian_alert_count || 0);
      showGuardianEmpty();
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      addMessage('assistant', 'Nao consegui apagar esse alerta agora. Tente de novo.');
    }
  };

  if (input) {
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
  }

  if (form && input) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = input.value;
      input.value = '';
      autoGrow();
      sendMessage(message);
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', async () => {
      if (!window.confirm('Limpar esta conversa? O Miauby vai fingir que nao lembra.')) return;

      const body = new FormData();
      body.set('action', 'clear');
      body.set('csrf_token', csrf);

      try {
        await fetch('/miauw/api.php', {
          method: 'POST',
          body,
          headers: { 'X-CSRF-Token': csrf },
        });
        window.location.reload();
      } catch (error) {
        addMessage('assistant', 'Nao consegui limpar. Ate meu esquecimento falhou.');
      }
    });
  }

  shortcutButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!input) return;
      input.value = button.dataset.prompt || '';
      autoGrow();
      input.focus();
    });
  });

  if (guardianCard) {
    guardianCard.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dismiss-alert]');
      if (button) dismissAlert(button);
    });
  }

  if (feed) {
    feed.addEventListener('click', (event) => {
      const goodButton = event.target.closest('[data-training-rating]');
      const trainButton = event.target.closest('[data-training-open]');
      const actions = event.target.closest('[data-training-actions]');

      if (goodButton && actions) {
        sendTrainingFeedback({
          assistantMessageId: actions.dataset.messageId,
          rating: goodButton.dataset.trainingRating || 'boa',
          reason: 'boa_resposta',
          category: 'geral',
          style: 'miauby',
        }, actions);
      }

      if (trainButton && actions) {
        openTrainingDialog(actions.dataset.messageId, actions);
      }
    });
  }

  scrollToBottom();
  autoGrow();
})();
