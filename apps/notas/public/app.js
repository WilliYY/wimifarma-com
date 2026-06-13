(function () {
  const basePath = document.body?.getAttribute('data-notas-base-path') || '/notas';
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const grid = document.querySelector('[data-notes-grid]');
  const status = document.querySelector('[data-order-status]');
  let draggedCard = null;
  let saveTimer = 0;

  function setStatus(message, kind) {
    if (!status) return;
    status.textContent = message || '';
    status.dataset.kind = kind || '';
  }

  function autosize(textarea) {
    const minHeight = Number(textarea.dataset.autosizeMin || 84);
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
  }

  function initAutosize() {
    document.querySelectorAll('textarea[data-autosize]').forEach((textarea) => {
      autosize(textarea);
      textarea.addEventListener('input', () => autosize(textarea));
    });
  }

  function initConfirmations() {
    document.querySelectorAll('form[data-confirm-submit]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        const message = form.getAttribute('data-confirm-submit') || 'Confirmar?';
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      });
    });
  }

  function cardFromHandle(handle) {
    return handle.closest('[data-note-card]');
  }

  function currentIds() {
    return Array.from(grid?.querySelectorAll('[data-note-card]') || [])
      .map((card) => Number(card.getAttribute('data-note-id') || 0))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function saveOrderSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveOrder, 220);
  }

  async function saveOrder() {
    const ids = currentIds();
    if (!ids.length) return;
    setStatus('Salvando ordem...', 'pending');
    try {
      const response = await fetch(`${basePath}/api/order`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'Nao consegui salvar a ordem.');
      }
      setStatus('Ordem salva.', 'ok');
      window.setTimeout(() => setStatus('', ''), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui salvar a ordem.', 'error');
    }
  }

  function insertionPoint(container, pointerX, pointerY) {
    const cards = Array.from(container.querySelectorAll('[data-note-card]:not(.is-dragging)'));
    return cards.reduce((closest, card) => {
      const box = card.getBoundingClientRect();
      const verticalDistance = pointerY - box.top - box.height / 2;
      const horizontalDistance = pointerX - box.left - box.width / 2;
      const offset = Math.abs(verticalDistance) > box.height / 2
        ? verticalDistance
        : horizontalDistance;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: card };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  function initDrag() {
    if (!grid) return;
    document.querySelectorAll('[data-note-drag-handle]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        draggedCard = cardFromHandle(handle);
        if (!draggedCard) return;
        draggedCard.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedCard.getAttribute('data-note-id') || '');
      });

      handle.addEventListener('dragend', () => {
        if (!draggedCard) return;
        draggedCard.classList.remove('is-dragging');
        draggedCard = null;
        saveOrderSoon();
      });
    });

    grid.addEventListener('dragover', (event) => {
      if (!draggedCard) return;
      event.preventDefault();
      const next = insertionPoint(grid, event.clientX, event.clientY);
      if (next) {
        grid.insertBefore(draggedCard, next);
      } else {
        grid.appendChild(draggedCard);
      }
    });
  }

  function initSubmitState() {
    document.querySelectorAll('form[data-note-form], .notes-paper-new form').forEach((form) => {
      form.addEventListener('submit', () => {
        form.querySelectorAll('button[type="submit"]').forEach((button) => {
          button.disabled = true;
        });
      });
    });
  }

  function init() {
    initAutosize();
    initConfirmations();
    initDrag();
    initSubmitState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
