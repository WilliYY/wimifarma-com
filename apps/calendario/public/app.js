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
    saveTimer: null,
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
        throw new Error(data.error || 'Falha ao comunicar com o Calendario.');
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
      if (selected) cell.classList.add('is-selected');
      if ((note.note_text || '').trim() !== '' || note.color_id) cell.classList.add('has-note');
      cell.style.left = `${grid.left + position.col * colWidth}%`;
      cell.style.top = `${grid.top + position.visualRow * rowHeight + (position.half && position.bottom ? rowHeight / 2 : 0)}%`;
      cell.style.width = `${colWidth}%`;
      cell.style.height = `${position.half ? rowHeight / 2 : rowHeight}%`;
      if (color) {
        cell.style.background = rgba(color.color_hex, 0.28);
        cell.style.borderColor = rgba(color.color_hex, 0.75);
      }

      const input = document.createElement('textarea');
      input.className = 'cal-cell-input';
      input.value = note.note_text || '';
      input.setAttribute('aria-label', `${position.day} de ${monthNames[month - 1]} de ${state.calendar.year}`);
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
    els.monthLabel.textContent = `${monthNames[state.month - 1]} ${state.calendar.year}`;
    els.monthImage.src = `${basePath}/months/month-${String(state.month).padStart(2, '0')}.png`;
    els.monthImage.alt = `Imagem base de ${monthNames[state.month - 1]} com ano e numeros dos dias impressos`;
    renderDays();
    updateSidePanel();
  }

  function renderColors() {
    els.dayColors.innerHTML = '';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cal-color-choice cal-color-clear';
    clear.setAttribute('aria-label', 'Sem cor');
    clear.title = 'Sem cor';
    clear.innerHTML = '<span class="cal-color-dot" style="background:#fff"></span>';
    clear.addEventListener('click', () => applySelectedColor(null));
    els.dayColors.appendChild(clear);

    const selectedNote = state.selected ? noteFor(state.selected.month, state.selected.day) : null;
    for (const color of state.colors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-color-choice';
      if (selectedNote && String(selectedNote.color_id || '') === String(color.id)) button.classList.add('is-active');
      button.setAttribute('aria-label', `Aplicar cor ${color.label}`);
      button.title = color.label;
      const dot = document.createElement('span');
      dot.className = 'cal-color-dot';
      dot.style.background = color.color_hex;
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

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = color.color_hex;

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

  function selectDay(month, day, focusSide, rerenderDays) {
    state.selected = { month, day };
    updateSidePanel();
    renderColors();
    if (rerenderDays !== false) renderDays();
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
    const note = noteFor(state.selected.month, state.selected.day);
    note.color_id = colorId;
    setNote(note);
    saveDay(state.selected.month, state.selected.day);
    renderColors();
    renderDays();
  }

  function scheduleSave(month, day) {
    state.dirty = true;
    setSaveState('dirty', 'Alteracoes nao salvas');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveDay(month, day), 650);
  }

  async function saveSelectedDay() {
    if (!state.selected || !state.calendar) return;
    return saveDay(state.selected.month, state.selected.day);
  }

  async function saveDay(month, day) {
    if (!state.calendar) return;
    clearTimeout(state.saveTimer);
    const note = noteFor(month, day);
    state.saving = true;
    setSaveState('saving', 'Salvando...');
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
        }),
      });
      setNote(data.note);
      state.dirty = false;
      setSaveState('ok', 'Sincronizado');
    } catch (error) {
      setSaveState('error', error.message || 'Falha ao salvar');
    } finally {
      state.saving = false;
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

  function changeMonth(delta) {
    let next = state.month + delta;
    if (next < 1) next = 12;
    if (next > 12) next = 1;
    state.month = next;
    state.selected = null;
    renderMonth();
    renderColors();
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

  function resetStageDrag() {
    state.dragPending = false;
    state.dragging = false;
    state.dragPointerId = null;
    state.dragStartTarget = null;
    settleStageDrag();
  }

  function beginStageDrag(event) {
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
    const easedX = Math.max(-118, Math.min(118, dx * 0.42));
    const easedY = Math.max(-18, Math.min(18, dy * 0.12));
    setStageDragOffset(easedX, easedY);
  }

  function endStageDrag(event) {
    if (!state.dragPending || state.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - state.pointerStartX;
    const dy = event.clientY - state.pointerStartY;
    const changedMonth = state.dragging && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.35;
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
    resetStageDrag();
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

  els.yearSelect.addEventListener('change', () => {
    state.selected = null;
    loadState(els.yearSelect.value, true).catch((error) => setSaveState('error', error.message));
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
