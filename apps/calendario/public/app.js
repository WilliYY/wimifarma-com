(function () {
  'use strict';

  const boot = window.CALENDARIO_BOOTSTRAP || {};
  const basePath = boot.basePath || '/calendario';
  const csrfToken = boot.csrfToken || '';
  const monthNames = boot.monthNames || [
    'Janeiro',
    'Fevereiro',
    'Marco',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const state = {
    calendar: null,
    calendars: [],
    colors: [],
    notes: new Map(),
    month: Number(boot.currentMonth || 1),
    selected: null,
    saveTimers: new Map(),
    dirtyDays: new Set(),
    savingCount: 0,
    dirty: false,
    saving: false,
    pointerStartX: 0,
    pointerStartY: 0,
    dragPending: false,
    dragging: false,
    dragPointerId: null,
    dragStartTarget: null,
    dragSettleTimer: null,
    suppressNextClick: false,
    monthAnimating: false,
    monthAnimationTimer: null,
    contextMenuDay: null,
  };

  const els = {
    yearSelect: document.getElementById('year-select'),
    monthLabel: document.getElementById('month-label'),
    monthImage: document.getElementById('month-image'),
    dayLayer: document.getElementById('day-layer'),
    stage: document.getElementById('calendar-stage'),
    prev: document.getElementById('prev-month'),
    next: document.getElementById('next-month'),
    createNextYear: document.getElementById('create-next-year'),
    saveState: document.getElementById('save-state'),
    selectedTitle: document.getElementById('selected-title'),
    noteInput: document.getElementById('note-input'),
    notePreview: document.getElementById('note-preview'),
    dayColors: document.getElementById('day-colors'),
    paletteList: document.getElementById('palette-list'),
    colorForm: document.getElementById('color-form'),
    contextMenu: document.getElementById('day-context-menu'),
  };

  function key(month, day) {
    return `${month}:${day}`;
  }

  function api(path, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${basePath}${path}`, Object.assign({}, options, { headers })).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || 'Falha ao comunicar com o Calendario.');
        error.payload = data;
        throw error;
      }
      return data;
    });
  }

  function setSaveState(mode, text) {
    els.saveState.dataset.state = mode || 'ok';
    els.saveState.textContent = text || 'Sincronizado';
  }

  function noteFor(month, day) {
    return state.notes.get(key(month, day)) || {
      calendar_id: state.calendar && state.calendar.id,
      month,
      day,
      note_text: '',
      color_id: null,
      updated_at: null,
    };
  }

  function setNote(note) {
    state.notes.set(key(note.month, note.day), note);
  }

  function setSyncStateAfterSave() {
    state.dirty = state.dirtyDays.size > 0;
    state.saving = state.savingCount > 0;
    if (state.saving) {
      setSaveState('saving', 'Salvando...');
    } else if (state.dirty) {
      setSaveState('dirty', 'Alteracoes nao salvas');
    } else {
      setSaveState('ok', 'Sincronizado');
    }
  }

  // The PNG artwork already prints the year and day numbers; these hitboxes follow that visual grid.
  const visualMonthLayouts = {
    1: { totalDays: 31, startCol: 4 },
    2: { totalDays: 28, startCol: 0 },
    3: { totalDays: 31, startCol: 0 },
    4: { totalDays: 30, startCol: 3 },
    5: { totalDays: 31, startCol: 5 },
    6: { totalDays: 30, startCol: 1 },
    7: { totalDays: 31, startCol: 3 },
    8: { totalDays: 31, startCol: 6 },
    9: { totalDays: 30, startCol: 2 },
    10: { totalDays: 31, startCol: 4 },
    11: { totalDays: 30, startCol: 0 },
    12: { totalDays: 31, startCol: 2 },
  };

  function rgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(147, 197, 253, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function paintVars(element, hex, prefix) {
    element.style.setProperty(`--${prefix}-color`, hex);
    element.style.setProperty(`--${prefix}-wash`, rgba(hex, 0.26));
    element.style.setProperty(`--${prefix}-wash-strong`, rgba(hex, 0.38));
    element.style.setProperty(`--${prefix}-line`, rgba(hex, 0.78));
    element.style.setProperty(`--${prefix}-glow`, rgba(hex, 0.2));
  }

  function colorById(id) {
    return state.colors.find((color) => String(color.id) === String(id)) || null;
  }

  function renderYearSelect() {
    const selectedYear = state.calendar ? Number(state.calendar.year) : 2026;
    els.yearSelect.innerHTML = '';
    for (const calendar of state.calendars) {
      const option = document.createElement('option');
      option.value = String(calendar.year);
      option.textContent = String(calendar.year);
      option.selected = Number(calendar.year) === selectedYear;
      els.yearSelect.appendChild(option);
    }
  }

  function positionsForMonth(month) {
    const layout = visualMonthLayouts[month] || visualMonthLayouts[1];
    const totalDays = layout.totalDays;
    const offset = layout.startCol;
    const raw = [];
    const overflowCols = new Set();
    for (let day = 1; day <= totalDays; day += 1) {
      const index = offset + day - 1;
      const row = Math.floor(index / 7);
      const col = index % 7;
      if (row >= 5) overflowCols.add(col);
      raw.push({ day, row, col });
    }
    return raw.map((item) => {
      const split = overflowCols.has(item.col) && item.row >= 4;
      return {
        day: item.day,
        col: item.col,
        visualRow: Math.min(item.row, 4),
        half: split,
        bottom: item.row >= 5,
      };
    });
  }

  function renderDays() {
    if (!state.calendar) return;
    const month = state.month;
    const grid = { left: 32.05, top: 12.15, width: 66.25, height: 85.7 };
    const colWidth = grid.width / 7;
    const rowHeight = grid.height / 5;
    els.dayLayer.innerHTML = '';

    for (const position of positionsForMonth(month)) {
      const note = noteFor(month, position.day);
      const color = colorById(note.color_id);
      const cell = document.createElement('label');
      const selected = state.selected && state.selected.month === month && state.selected.day === position.day;
      cell.className = 'cal-day-cell';
      cell.dataset.month = String(month);
      cell.dataset.day = String(position.day);
      if (selected) cell.classList.add('is-selected');
      if ((note.note_text || '').trim() !== '' || note.color_id) cell.classList.add('has-note');
      if (color) {
        cell.classList.add('has-color');
        paintVars(cell, color.color_hex, 'day');
      }
      cell.style.left = `${grid.left + position.col * colWidth}%`;
      cell.style.top = `${grid.top + position.visualRow * rowHeight + (position.half && position.bottom ? rowHeight / 2 : 0)}%`;
      cell.style.width = `${colWidth}%`;
      cell.style.height = `${position.half ? rowHeight / 2 : rowHeight}%`;

      const input = document.createElement('textarea');
      input.className = 'cal-cell-input';
      input.value = note.note_text || '';
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('aria-label', `${position.day} de ${monthNames[month - 1]} de ${state.calendar.year}`);
      const openColorMenu = (event) => openDayContextMenu(event, month, position.day, cell);
      cell.addEventListener('contextmenu', openColorMenu);
      input.addEventListener('contextmenu', openColorMenu);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          openDayContextMenu(event, month, position.day, cell);
        }
      });
      input.addEventListener('focus', () => selectDay(month, position.day, false, false));
      input.addEventListener('click', () => selectDay(month, position.day, false, false));
      input.addEventListener('input', () => {
        const current = noteFor(month, position.day);
        current.note_text = input.value;
        setNote(current);
        if (state.selected && state.selected.month === month && state.selected.day === position.day) {
          els.noteInput.value = input.value;
          updatePreview();
        }
        scheduleSave(month, position.day);
      });

      cell.appendChild(input);
      els.dayLayer.appendChild(cell);
    }
  }

  function renderMonth() {
    if (!state.calendar) return;
    closeDayContextMenu();
    els.monthLabel.textContent = `${monthNames[state.month - 1]} ${state.calendar.year}`;
    els.monthImage.src = `${basePath}/months/month-${String(state.month).padStart(2, '0')}.png`;
    els.monthImage.alt = `Imagem base de ${monthNames[state.month - 1]} com ano e numeros dos dias impressos`;
    renderDays();
    updateSidePanel();
  }

  function renderColors() {
    els.dayColors.innerHTML = '';
    const selectedNote = state.selected ? noteFor(state.selected.month, state.selected.day) : null;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cal-color-choice cal-color-clear';
    clear.setAttribute('aria-label', 'Sem cor');
    clear.title = 'Sem cor';
    if (!selectedNote || !selectedNote.color_id) clear.classList.add('is-active');
    clear.innerHTML = '<span class="cal-color-dot" style="background:#fff"></span>';
    clear.addEventListener('click', () => applySelectedColor(null));
    els.dayColors.appendChild(clear);

    for (const color of state.colors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-color-choice';
      if (selectedNote && String(selectedNote.color_id || '') === String(color.id)) button.classList.add('is-active');
      button.setAttribute('aria-label', `Aplicar cor ${color.label}`);
      button.title = color.label;
      paintVars(button, color.color_hex, 'swatch');
      const dot = document.createElement('span');
      dot.className = 'cal-color-dot';
      button.appendChild(dot);
      button.addEventListener('click', () => applySelectedColor(color.id));
      els.dayColors.appendChild(button);
    }
  }

  function renderPalette() {
    els.paletteList.innerHTML = '';
    for (const color of state.colors) {
      const item = document.createElement('div');
      item.className = 'cal-palette-item';
      item.title = color.label;
      paintVars(item, color.color_hex, 'swatch');

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = color.color_hex;
      colorInput.setAttribute('aria-label', `Editar cor ${color.label}`);

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'cal-color-label-input';
      labelInput.maxLength = 80;
      labelInput.value = color.label;
      labelInput.setAttribute('aria-label', `Nome da cor ${color.label}`);
      labelInput.tabIndex = -1;

      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'cal-palette-archive';
      archive.textContent = 'x';
      archive.setAttribute('aria-label', `Arquivar cor ${color.label}`);
      archive.title = `Arquivar ${color.label}`;

      const save = debounce(() => saveColor(color.id, colorInput.value, labelInput.value), 500);
      colorInput.addEventListener('input', save);
      labelInput.addEventListener('input', save);
      archive.addEventListener('click', () => archiveColor(color.id));

      item.appendChild(colorInput);
      item.appendChild(labelInput);
      item.appendChild(archive);
      els.paletteList.appendChild(item);
    }
  }

  function renderAll() {
    renderYearSelect();
    renderMonth();
    renderColors();
    renderPalette();
  }

  function syncSelectedDayClasses() {
    for (const cell of els.dayLayer.querySelectorAll('.cal-day-cell')) {
      const isSelected =
        state.selected &&
        cell.dataset.month === String(state.selected.month) &&
        cell.dataset.day === String(state.selected.day);
      cell.classList.toggle('is-selected', Boolean(isSelected));
    }
  }

  function selectDay(month, day, focusSide, rerenderDays) {
    state.selected = { month, day };
    updateSidePanel();
    renderColors();
    if (rerenderDays !== false) {
      renderDays();
    } else {
      syncSelectedDayClasses();
    }
    if (focusSide) els.noteInput.focus();
  }

  function updateSidePanel() {
    if (!state.selected) {
      els.selectedTitle.textContent = 'Escolha um dia';
      els.noteInput.value = '';
      els.noteInput.disabled = true;
      els.notePreview.textContent = '-';
      return;
    }
    const note = noteFor(state.selected.month, state.selected.day);
    els.selectedTitle.textContent = `${state.selected.day} de ${monthNames[state.selected.month - 1]} de ${state.calendar.year}`;
    els.noteInput.disabled = false;
    els.noteInput.value = note.note_text || '';
    updatePreview();
  }

  function updatePreview() {
    const text = state.selected ? noteFor(state.selected.month, state.selected.day).note_text || '' : '';
    els.notePreview.textContent = text.trim() ? text : '-';
  }

  function applySelectedColor(colorId) {
    if (!state.selected) return;
    applyDayColor(state.selected.month, state.selected.day, colorId);
  }

  function applyDayColor(month, day, colorId) {
    const note = noteFor(month, day);
    note.color_id = colorId;
    setNote(note);
    saveDay(month, day);
    if (!state.selected || state.selected.month !== month || state.selected.day !== day) {
      state.selected = { month, day };
      updateSidePanel();
    }
    renderColors();
    renderDays();
    closeDayContextMenu();
  }

  function scheduleSave(month, day) {
    const saveKey = key(month, day);
    state.dirty = true;
    state.dirtyDays.add(saveKey);
    setSaveState('dirty', 'Alteracoes nao salvas');
    const existingTimer = state.saveTimers.get(saveKey);
    if (existingTimer) clearTimeout(existingTimer);
    state.saveTimers.set(saveKey, setTimeout(() => saveDay(month, day), 650));
  }

  async function saveSelectedDay() {
    if (!state.selected || !state.calendar) return;
    return saveDay(state.selected.month, state.selected.day);
  }

  async function saveDay(month, day) {
    if (!state.calendar) return false;
    const saveKey = key(month, day);
    const existingTimer = state.saveTimers.get(saveKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      state.saveTimers.delete(saveKey);
    }
    const note = noteFor(month, day);
    state.savingCount += 1;
    state.saving = true;
    setSaveState('saving', 'Salvando...');
    let failed = false;
    let failureMessage = '';
    try {
      const data = await api('/api/day', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          csrf_token: csrfToken,
          calendar_id: state.calendar.id,
          month,
          day,
          note_text: note.note_text || '',
          color_id: note.color_id || null,
          client_updated_at: note.updated_at || null,
        }),
      });
      setNote(data.note);
      state.dirtyDays.delete(saveKey);
    } catch (error) {
      failed = true;
      state.dirtyDays.add(saveKey);
      if (error.payload && error.payload.conflict) {
        failureMessage = error.message || 'Este dia mudou em outra janela. Recarregue antes de sobrescrever.';
      } else {
        failureMessage = error.message || 'Falha ao salvar';
      }
    } finally {
      state.savingCount = Math.max(0, state.savingCount - 1);
      if (failed) {
        state.dirty = true;
        state.saving = state.savingCount > 0;
        setSaveState('error', failureMessage);
      } else {
        setSyncStateAfterSave();
      }
    }
    return !failed;
  }

  async function flushPendingDaySaves() {
    const pending = Array.from(state.dirtyDays);
    if (pending.length === 0) return;
    const results = await Promise.all(
      pending.map((saveKey) => {
        const parts = saveKey.split(':');
        return saveDay(Number(parts[0]), Number(parts[1]));
      })
    );
    if (results.some((saved) => saved === false)) {
      throw new Error('Existem anotacoes pendentes que ainda nao foram salvas.');
    }
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced() {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  async function saveColor(id, hex, label) {
    if (!state.calendar) return;
    setSaveState('saving', 'Salvando cor...');
    try {
      await api('/api/colors', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          csrf_token: csrfToken,
          id,
          calendar_id: state.calendar.id,
          color_hex: hex,
          label,
        }),
      });
      await loadState(state.calendar.year, false);
      setSaveState('ok', 'Sincronizado');
    } catch (error) {
      setSaveState('error', error.message || 'Falha ao salvar cor');
    }
  }

  async function archiveColor(id) {
    if (!state.calendar) return;
    setSaveState('saving', 'Arquivando cor...');
    try {
      await api(`/api/colors/${id}/archive`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ csrf_token: csrfToken, calendar_id: state.calendar.id }),
      });
      await loadState(state.calendar.year, false);
      setSaveState('ok', 'Sincronizado');
    } catch (error) {
      setSaveState('error', error.message || 'Falha ao arquivar cor');
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function applyMonthChange(delta) {
    let next = state.month + delta;
    if (next < 1) next = 12;
    if (next > 12) next = 1;
    state.month = next;
    state.selected = null;
    renderMonth();
    renderColors();
  }

  function finishMonthAnimation() {
    window.clearTimeout(state.monthAnimationTimer);
    els.stage.classList.remove('is-month-exiting', 'is-month-entering', 'is-month-entered');
    els.stage.style.setProperty('--swipe-out-x', '0px');
    els.stage.style.setProperty('--swipe-enter-x', '0px');
    state.monthAnimating = false;
  }

  function animateMonthChange(delta) {
    if (state.monthAnimating) return;
    closeDayContextMenu();
    if (prefersReducedMotion()) {
      applyMonthChange(delta);
      return;
    }

    state.monthAnimating = true;
    window.clearTimeout(state.monthAnimationTimer);
    const distance = Math.max(150, Math.min(280, els.stage.clientWidth * 0.26));
    const outX = delta > 0 ? -distance : distance;
    const enterX = -outX;
    els.stage.style.setProperty('--swipe-out-x', `${outX}px`);
    els.stage.style.setProperty('--swipe-enter-x', `${enterX}px`);
    els.stage.classList.remove('is-settling', 'is-month-entering', 'is-month-entered');
    els.stage.classList.add('is-month-exiting');

    state.monthAnimationTimer = window.setTimeout(() => {
      applyMonthChange(delta);
      setStageDragOffset(0, 0);
      els.stage.classList.remove('is-month-exiting');
      els.stage.classList.add('is-month-entering');
      window.requestAnimationFrame(() => {
        els.stage.classList.add('is-month-entered');
      });
      state.monthAnimationTimer = window.setTimeout(finishMonthAnimation, 360);
    }, 210);
  }

  function changeMonth(delta) {
    animateMonthChange(delta);
  }

  function renderDayContextMenu(month, day) {
    const note = noteFor(month, day);
    els.contextMenu.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cal-context-head';
    const label = document.createElement('span');
    label.textContent = 'Pintar';
    const dayLabel = document.createElement('strong');
    dayLabel.textContent = String(day);
    head.appendChild(label);
    head.appendChild(dayLabel);

    const grid = document.createElement('div');
    grid.className = 'cal-context-grid';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cal-color-choice cal-color-clear';
    clear.setAttribute('role', 'menuitemradio');
    clear.setAttribute('aria-label', 'Sem cor');
    clear.setAttribute('aria-checked', String(!note.color_id));
    clear.title = 'Sem cor';
    if (!note.color_id) clear.classList.add('is-active');
    clear.innerHTML = '<span class="cal-color-dot" style="background:#fff"></span>';
    clear.addEventListener('click', () => applyDayColor(month, day, null));
    grid.appendChild(clear);

    for (const color of state.colors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-color-choice';
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-label', `Aplicar cor ${color.label}`);
      button.setAttribute('aria-checked', String(String(note.color_id || '') === String(color.id)));
      button.title = color.label;
      if (String(note.color_id || '') === String(color.id)) button.classList.add('is-active');
      paintVars(button, color.color_hex, 'swatch');
      const dot = document.createElement('span');
      dot.className = 'cal-color-dot';
      button.appendChild(dot);
      button.addEventListener('click', () => applyDayColor(month, day, color.id));
      grid.appendChild(button);
    }

    els.contextMenu.appendChild(head);
    els.contextMenu.appendChild(grid);
  }

  function positionDayContextMenu(x, y) {
    const margin = 10;
    const rect = els.contextMenu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    els.contextMenu.style.left = `${left}px`;
    els.contextMenu.style.top = `${top}px`;
  }

  function openDayContextMenu(event, month, day, sourceElement) {
    if (state.monthAnimating) return;
    event.preventDefault();
    event.stopPropagation();
    selectDay(month, day, false, false);
    state.contextMenuDay = { month, day };
    renderDayContextMenu(month, day);

    const sourceRect = sourceElement.getBoundingClientRect();
    const x = event.clientX || sourceRect.left + sourceRect.width / 2;
    const y = event.clientY || sourceRect.top + sourceRect.height / 2;
    els.contextMenu.hidden = false;
    els.contextMenu.classList.add('is-open');
    positionDayContextMenu(x + 8, y + 8);
  }

  function closeDayContextMenu() {
    if (!els.contextMenu || els.contextMenu.hidden) return;
    els.contextMenu.classList.remove('is-open');
    els.contextMenu.hidden = true;
    state.contextMenuDay = null;
  }

  function setStageDragOffset(x, y) {
    els.stage.style.setProperty('--drag-x', `${x}px`);
    els.stage.style.setProperty('--drag-y', `${y}px`);
  }

  function settleStageDrag() {
    window.clearTimeout(state.dragSettleTimer);
    els.stage.classList.remove('is-drag-ready', 'is-dragging');
    els.stage.classList.add('is-settling');
    setStageDragOffset(0, 0);
    state.dragSettleTimer = window.setTimeout(() => {
      els.stage.classList.remove('is-settling');
    }, 190);
  }

  function resetStageDrag(shouldSettle) {
    state.dragPending = false;
    state.dragging = false;
    state.dragPointerId = null;
    state.dragStartTarget = null;
    if (shouldSettle === false) {
      window.clearTimeout(state.dragSettleTimer);
      els.stage.classList.remove('is-drag-ready', 'is-dragging', 'is-settling');
      setStageDragOffset(0, 0);
      return;
    }
    settleStageDrag();
  }

  function beginStageDrag(event) {
    if (state.monthAnimating) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.dragPending = true;
    state.dragging = false;
    state.dragPointerId = event.pointerId;
    state.dragStartTarget = event.target;
    window.clearTimeout(state.dragSettleTimer);
    els.stage.classList.remove('is-settling');
    els.stage.classList.add('is-drag-ready');
    setStageDragOffset(0, 0);
    try {
      els.stage.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is only visual polish; drag still works without it.
    }
  }

  function moveStageDrag(event) {
    if (state.monthAnimating) return;
    if (!state.dragPending || state.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - state.pointerStartX;
    const dy = event.clientY - state.pointerStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!state.dragging) {
      if (absX < 10 && absY < 10) return;
      if (absX < absY * 1.15) return;
      state.dragging = true;
      els.stage.classList.remove('is-drag-ready');
      els.stage.classList.add('is-dragging');
      if (state.dragStartTarget && state.dragStartTarget.matches && state.dragStartTarget.matches('.cal-cell-input')) {
        state.dragStartTarget.blur();
      }
    }

    event.preventDefault();
    const dragLimitX = Math.max(118, Math.min(190, els.stage.clientWidth * 0.16));
    const easedX = Math.max(-dragLimitX, Math.min(dragLimitX, dx * 0.52));
    const easedY = Math.max(-18, Math.min(18, dy * 0.12));
    setStageDragOffset(easedX, easedY);
  }

  function endStageDrag(event) {
    if (!state.dragPending || state.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - state.pointerStartX;
    const dy = event.clientY - state.pointerStartY;
    const monthThreshold = Math.max(70, Math.min(120, els.stage.clientWidth * 0.08));
    const changedMonth = state.dragging && Math.abs(dx) > monthThreshold && Math.abs(dx) > Math.abs(dy) * 1.35;
    if (state.dragging) {
      event.preventDefault();
      state.suppressNextClick = true;
      window.setTimeout(() => {
        state.suppressNextClick = false;
      }, 180);
    }
    try {
      els.stage.releasePointerCapture(event.pointerId);
    } catch (error) {
      // It is harmless if the browser already released the pointer.
    }
    resetStageDrag(!changedMonth);
    if (changedMonth) changeMonth(dx < 0 ? 1 : -1);
  }

  async function loadState(year, keepMonth) {
    const data = await api(`/api/state?year=${encodeURIComponent(year || '')}`);
    state.calendar = data.calendar;
    state.calendars = data.calendars || [];
    state.colors = data.colors || [];
    state.notes = new Map();
    for (const note of data.notes || []) {
      setNote(note);
    }
    if (!keepMonth) {
      state.month = Math.max(1, Math.min(12, state.month || 1));
    }
    renderAll();
  }

  els.prev.addEventListener('click', () => changeMonth(-1));
  els.next.addEventListener('click', () => changeMonth(1));

  els.noteInput.spellcheck = false;
  els.noteInput.autocomplete = 'off';
  els.noteInput.setAttribute('autocorrect', 'off');
  els.noteInput.setAttribute('autocapitalize', 'none');

  els.yearSelect.addEventListener('change', async () => {
    state.selected = null;
    try {
      await flushPendingDaySaves();
      await loadState(els.yearSelect.value, true);
    } catch (error) {
      setSaveState('error', error.message || 'Falha ao trocar calendario');
    }
  });

  els.noteInput.addEventListener('input', () => {
    if (!state.selected) return;
    const note = noteFor(state.selected.month, state.selected.day);
    note.note_text = els.noteInput.value;
    setNote(note);
    updatePreview();
    renderDays();
    scheduleSave(state.selected.month, state.selected.day);
  });

  els.colorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.calendar) return;
    const form = new FormData(els.colorForm);
    const colorHex = String(form.get('color_hex') || '#93c5fd');
    const label = String(form.get('label') || '').trim() || `Cor ${state.colors.length + 1}`;
    await saveColor('', colorHex, label);
    els.colorForm.reset();
  });

  els.createNextYear.addEventListener('click', async () => {
    setSaveState('saving', 'Criando calendario...');
    try {
      await flushPendingDaySaves();
      setSaveState('saving', 'Criando calendario...');
      const data = await api('/api/create-next-year', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ csrf_token: csrfToken }),
      });
      state.selected = null;
      const returnedState = data.state || {};
      state.calendar = returnedState.calendar;
      state.calendars = returnedState.calendars || [];
      state.colors = returnedState.colors || [];
      state.notes = new Map();
      for (const note of returnedState.notes || []) setNote(note);
      renderAll();
      setSaveState('ok', 'Calendario criado');
    } catch (error) {
      setSaveState('error', error.message || 'Falha ao criar calendario');
    }
  });

  els.contextMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.contextMenu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', closeDayContextMenu);
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.cal-day-cell') && !event.target.closest('#day-context-menu')) {
      closeDayContextMenu();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDayContextMenu();
  });
  window.addEventListener('resize', closeDayContextMenu);
  document.addEventListener('scroll', closeDayContextMenu, true);

  els.stage.addEventListener('pointerdown', beginStageDrag);
  els.stage.addEventListener('pointermove', moveStageDrag);
  els.stage.addEventListener('pointerup', endStageDrag);
  els.stage.addEventListener('pointercancel', resetStageDrag);
  els.stage.addEventListener(
    'click',
    (event) => {
      if (!state.suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      state.suppressNextClick = false;
    },
    true
  );

  window.addEventListener('beforeunload', (event) => {
    if (state.dirty || state.saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  loadState(boot.currentYear || 2026, true)
    .then(() => {
      setSaveState('ok', 'Sincronizado');
    })
    .catch((error) => {
      setSaveState('error', error.message || 'Falha ao abrir Calendario');
    });
})();
