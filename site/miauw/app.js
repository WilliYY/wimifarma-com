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

  const addMessage = (role, text, options = {}) => {
    if (!feed) return;

    const article = document.createElement('article');
    article.className = `message ${role}`;

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
    article.appendChild(bubble);
    feed.appendChild(article);
    scrollToBottom();
  };

  const addAssistantParts = async (parts, options = {}) => {
    const safeParts = Array.isArray(parts) && parts.length ? parts : [options.fallbackText || 'Nao consegui montar a resposta agora. Tente de novo.'];

    for (let index = 0; index < safeParts.length; index += 1) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
      addMessage('assistant', safeParts[index], options);
    }
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
        fallbackText: data.reply,
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

  scrollToBottom();
  autoGrow();
})();
