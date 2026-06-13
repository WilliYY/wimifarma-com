(function () {
  const basePath = document.body?.getAttribute('data-notas-base-path') || '/notas';
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const grid = document.querySelector('[data-notes-grid]');
  const status = document.querySelector('[data-order-status]');
  let draggedCard = null;
  let dragStartOrder = '';
  let lastDropTarget = null;
  let activePointer = null;
  let dragFrame = 0;
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

  function clearDropTarget() {
    if (lastDropTarget) {
      lastDropTarget.classList.remove('is-drop-target');
      lastDropTarget = null;
    }
    grid?.classList.remove('is-drop-end');
  }

  function markDropTarget(next) {
    if (next === lastDropTarget) {
      if (!next) grid?.classList.add('is-drop-end');
      return;
    }
    clearDropTarget();
    if (next) {
      next.classList.add('is-drop-target');
      lastDropTarget = next;
    } else {
      grid?.classList.add('is-drop-end');
    }
  }

  function markPlaced(card) {
    card.classList.add('is-just-placed');
    window.setTimeout(() => card.classList.remove('is-just-placed'), 520);
  }

  function beginPointerDrag() {
    if (!activePointer || activePointer.started) return;
    activePointer.started = true;
    draggedCard = activePointer.card;
    dragStartOrder = currentIds().join(',');
    draggedCard.classList.add('is-dragging', 'is-pointer-dragging');
    grid.classList.add('is-reordering');
    document.body.classList.add('is-notes-grabbing');
    activePointer.handle.setAttribute('aria-grabbed', 'true');
    setStatus('Segurando nota. Arraste ate a posicao e solte.', 'pending');
  }

  function scheduleDragMove(clientX, clientY) {
    if (!activePointer?.started) return;
    activePointer.clientX = clientX;
    activePointer.clientY = clientY;
    if (dragFrame) return;
    dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      if (!activePointer?.started || !draggedCard) return;
      const next = insertionPoint(grid, activePointer.clientX, activePointer.clientY);
      markDropTarget(next);
      if (next) {
        grid.insertBefore(draggedCard, next);
      } else {
        grid.appendChild(draggedCard);
      }
    });
  }

  function finishPointerDrag() {
    const pointer = activePointer;
    const droppedCard = draggedCard;
    if (dragFrame) {
      window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    activePointer = null;
    if (!pointer) return;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    try {
      pointer.handle.releasePointerCapture(pointer.pointerId);
    } catch (error) {
      // Some browsers release capture automatically after pointerup.
    }
    pointer.handle.setAttribute('aria-grabbed', 'false');
    if (!pointer.started || !droppedCard) {
      grid.classList.remove('is-reordering');
      document.body.classList.remove('is-notes-grabbing');
      clearDropTarget();
      draggedCard = null;
      dragStartOrder = '';
      setStatus('', '');
      return;
    }
    droppedCard.classList.remove('is-dragging', 'is-pointer-dragging');
    grid.classList.remove('is-reordering');
    document.body.classList.remove('is-notes-grabbing');
    clearDropTarget();
    draggedCard = null;
    markPlaced(droppedCard);
    if (currentIds().join(',') !== dragStartOrder) {
      setStatus('Soltei. Salvando nova ordem...', 'pending');
      saveOrderSoon();
    } else {
      setStatus('', '');
    }
    dragStartOrder = '';
  }

  function onPointerMove(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    const movement = Math.hypot(
      event.clientX - activePointer.startX,
      event.clientY - activePointer.startY,
    );
    if (!activePointer.started && movement < 6) return;
    event.preventDefault();
    beginPointerDrag();
    scheduleDragMove(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    event.preventDefault();
    finishPointerDrag();
  }

  function onPointerCancel(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    finishPointerDrag();
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
      handle.setAttribute('aria-grabbed', 'false');
      handle.addEventListener('dragstart', (event) => event.preventDefault());
      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const card = cardFromHandle(handle);
        if (!card || activePointer) return;
        activePointer = {
          card,
          handle,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          clientX: event.clientX,
          clientY: event.clientY,
          started: false,
        };
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture is an enhancement; document listeners still keep the drag working.
        }
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
      });
    });
  }

  function initSubmitState() {
    document.querySelectorAll('form[data-note-form], .notes-paper-new form').forEach((form) => {
      form.addEventListener('submit', () => {
        const buttons = Array.from(form.querySelectorAll('button[type="submit"]'));
        if (form.id) {
          buttons.push(...document.querySelectorAll(`button[type="submit"][form="${form.id}"]`));
        }
        buttons.forEach((button) => {
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
