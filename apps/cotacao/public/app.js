(() => {
  const config = window.COTACAO_CONFIG || {};
  const basePath = config.basePath || '/cotacao';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

  const table = document.getElementById('sheetTable');
  const searchInput = document.getElementById('searchInput');
  const rowCountBadge = document.getElementById('rowCountBadge');
  const presenceCount = document.getElementById('presenceCount');
  const presenceList = document.getElementById('presenceList');
  const saveStatus = document.getElementById('saveStatus');
  const contextMenu = document.getElementById('contextMenu');
  const filterMenu = document.getElementById('filterMenu');
  const exportCsvButton = document.getElementById('exportCsvButton');
  const undoButton = document.getElementById('undoButton');
  const redoButton = document.getElementById('redoButton');
  const eraserButton = document.getElementById('eraserButton');
  const rulesButton = document.getElementById('rulesButton');
  const rulesDialog = document.getElementById('rulesDialog');
  const ruleColumn = document.getElementById('ruleColumn');
  const ruleOperator = document.getElementById('ruleOperator');
  const ruleValue = document.getElementById('ruleValue');
  const ruleBg = document.getElementById('ruleBg');
  const ruleColor = document.getElementById('ruleColor');
  const addRuleButton = document.getElementById('addRuleButton');
  const rulesList = document.getElementById('rulesList');
  const diagnosticsButton = document.getElementById('diagnosticsButton');
  const diagnosticsDialog = document.getElementById('diagnosticsDialog');
  const diagnosticsOutput = document.getElementById('diagnosticsOutput');
  const refreshDiagnosticsButton = document.getElementById('refreshDiagnosticsButton');
  const googleExportButton = document.getElementById('googleExportButton');
  const googleImportButton = document.getElementById('googleImportButton');
  const createBackupButton = document.getElementById('createBackupButton');
  const backupSelect = document.getElementById('backupSelect');
  const restoreBackupButton = document.getElementById('restoreBackupButton');

  const FIXED_KEYS = ['ean', 'produto', 'quantidade', 'categoria'];
  const WINNER_KEY = 'quem_ganhou';
  const FILTERABLE_KEYS = ['categoria', WINNER_KEY];
  const ANIMALS = [
    'Capivara', 'Tatu', 'Arara', 'Lhama', 'Onca', 'Tamandua', 'Coruja',
    'Raposa', 'Baleia', 'Panda', 'Lontra', 'Falcao', 'Pinguim', 'Gato'
  ];
  const COLORS = ['Azul', 'Verde', 'Rosa', 'Roxo', 'Dourado', 'Prata', 'Vermelho', 'Preto'];

  const state = {
    quote: null,
    columns: [],
    rows: [],
    rules: [],
    styles: [],
    presence: [],
    lastEventId: 0,
    search: '',
    filters: {
      categoria: null,
      [WINNER_KEY]: null
    },
    activeCell: null,
    anchorCell: null,
    selectedRange: null,
    editing: null,
    dragging: false,
    context: null,
    paintColor: null,
    eraser: false,
    history: [],
    future: [],
    conflicts: new Map()
  };

  function makeClientId() {
    let id = sessionStorage.getItem('cotacao_client_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem('cotacao_client_id', id);
    }
    return id;
  }

  const clientId = makeClientId();

  function hashString(value) {
    let hash = 0;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function animalName(item) {
    const seed = hashString(item.clientId || item.username || item.userId);
    const animal = ANIMALS[seed % ANIMALS.length];
    const color = COLORS[Math.floor(seed / ANIMALS.length) % COLORS.length];
    return `${animal} ${color}${item.clientId === clientId ? ' (voce)' : ''}`;
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function status(text, mode = 'ok') {
    saveStatus.textContent = text;
    saveStatus.dataset.mode = mode;
  }

  async function api(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (!['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase())) {
      headers['X-CSRF-Token'] = csrf;
    }
    const response = await fetch(`${basePath}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(data?.error || 'Falha na cotacao.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function editableColumns() {
    return state.columns.filter((column) => column.options?.computed !== true);
  }

  function distributorColumns() {
    return state.columns.filter(isDistributorColumn);
  }

  function isDistributorColumn(column) {
    return column
      && column.locked !== true
      && (column.options?.kind === 'distributor'
        || String(column.key || '').startsWith('fornecedor_')
        || String(column.key || '').startsWith('distribuidora_'));
  }

  function rowById(rowId) {
    return state.rows.find((row) => row.id === rowId);
  }

  function colByKey(columnKey) {
    return state.columns.find((column) => column.key === columnKey);
  }

  function cellKey(rowId, columnKey) {
    return `${rowId}:${columnKey}`;
  }

  function isTextEntryTarget(target) {
    const node = target instanceof Element ? target : null;
    if (!node) return false;
    if (node.closest('dialog')) return true;
    if (node.closest('.sheet-cell')) return false;
    return Boolean(node.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function valueOf(row, column) {
    if (!row || !column) return '';
    if (column.key === WINNER_KEY || column.options?.computed === true) {
      return computeWinner(row).label;
    }
    return String(row.values?.[column.key] ?? '');
  }

  function parsePrice(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d,.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null;
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function computeWinner(row) {
    let best = null;
    let winners = [];
    distributorColumns().forEach((column) => {
      const price = parsePrice(row.values?.[column.key]);
      if (price === null) return;
      if (best === null || price < best) {
        best = price;
        winners = [column];
        return;
      }
      if (price === best) winners.push(column);
    });
    if (!winners.length) return { label: 'Sem vencedor', keys: [] };
    if (winners.length > 1) return { label: `Empate: ${winners.map((column) => column.label).join(', ')}`, keys: winners.map((column) => column.key) };
    return { label: winners[0].label, keys: [winners[0].key] };
  }

  function getVisibleRows() {
    const term = state.search.trim().toLowerCase();
    return state.rows.filter((row) => {
      if (term) {
        const haystack = [
          ...state.columns.map((column) => valueOf(row, column)),
          computeWinner(row).label
        ].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      for (const key of FILTERABLE_KEYS) {
        const filter = state.filters[key];
        if (!filter) continue;
        const column = colByKey(key);
        const value = key === WINNER_KEY ? computeWinner(row).label : valueOf(row, column);
        if (!filter.has(value)) return false;
      }
      return true;
    });
  }

  function nonEmptyRowCount(rows = getVisibleRows()) {
    return rows.filter((row) => Object.values(row.values || {}).some((value) => String(value ?? '').trim() !== '')).length;
  }

  function hasActiveViewFilter() {
    if (String(state.search || '').trim()) return true;
    return FILTERABLE_KEYS.some((key) => state.filters[key]);
  }

  function gridRows() {
    return hasActiveViewFilter() ? getVisibleRows() : state.rows;
  }

  function styleMap() {
    const map = new Map();
    state.styles.forEach((style) => map.set(style.styleKey, style));
    return map;
  }

  function ruleStyle(row) {
    for (const rule of state.rules.filter((item) => item.enabled !== false)) {
      const column = colByKey(rule.column_key || rule.columnKey);
      if (!column) continue;
      const current = valueOf(row, column).toLowerCase();
      const expected = String(rule.value || '').toLowerCase();
      if (!expected) continue;
      const operator = String(rule.operator || 'contains');
      const matched = operator === 'equals'
        ? current === expected
        : operator === 'starts'
          ? current.startsWith(expected)
          : current.includes(expected);
      if (matched) {
        return { background: rule.background, color: rule.color };
      }
    }
    return {};
  }

  function mergedStyle(row, column, map) {
    const merged = { ...ruleStyle(row) };
    [
      `column::${column.key}`,
      `row:${row.id}:`,
      `cell:${row.id}:${column.key}`
    ].forEach((key) => {
      const style = map.get(key);
      if (!style) return;
      if (style.background) merged.background = style.background;
      if (style.color) merged.color = style.color;
    });
    return merged;
  }

  function coordsFor(rowId, columnKey, rows = state.rows) {
    return {
      row: rows.findIndex((row) => row.id === rowId),
      col: state.columns.findIndex((column) => column.key === columnKey)
    };
  }

  function cellAt(rowIndex, colIndex, rows = state.rows) {
    const row = rows[Math.max(0, Math.min(rowIndex, rows.length - 1))];
    const column = state.columns[Math.max(0, Math.min(colIndex, state.columns.length - 1))];
    return row && column ? { rowId: row.id, columnKey: column.key } : null;
  }

  function selectedCells() {
    if (!state.activeCell) return [];
    const rows = gridRows();
    const anchorCell = state.anchorCell || state.activeCell;
    const anchor = coordsFor(anchorCell.rowId, anchorCell.columnKey, rows);
    const active = coordsFor(state.activeCell.rowId, state.activeCell.columnKey, rows);
    if (anchor.row < 0 || active.row < 0 || anchor.col < 0 || active.col < 0) return [];
    const startRow = Math.min(anchor.row, active.row);
    const endRow = Math.max(anchor.row, active.row);
    const startCol = Math.min(anchor.col, active.col);
    const endCol = Math.max(anchor.col, active.col);
    const cells = [];
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        const cell = cellAt(rowIndex, colIndex, rows);
        if (cell && colByKey(cell.columnKey)?.options?.computed !== true) {
          cells.push(cell);
        }
      }
    }
    return cells;
  }

  function setSelection(rowId, columnKey, extend = false) {
    const target = { rowId, columnKey };
    if (!extend || !state.anchorCell) {
      state.anchorCell = target;
    }
    state.activeCell = target;
    const rows = gridRows();
    const anchor = coordsFor(state.anchorCell.rowId, state.anchorCell.columnKey, rows);
    const active = coordsFor(rowId, columnKey, rows);
    state.selectedRange = {
      startRow: Math.min(anchor.row, active.row),
      endRow: Math.max(anchor.row, active.row),
      startCol: Math.min(anchor.col, active.col),
      endCol: Math.max(anchor.col, active.col)
    };
    updateSelectionClasses();
    updatePresence(false);
  }

  function updateSelectionClasses() {
    table.querySelectorAll('.is-selected, .is-active-cell').forEach((node) => {
      node.classList.remove('is-selected', 'is-active-cell');
    });
    table.querySelectorAll('.fill-handle').forEach((node) => node.remove());
    selectedCells().forEach((cell) => {
      const td = table.querySelector(`[data-row-id="${cell.rowId}"][data-column-key="${cell.columnKey}"]`);
      if (td) td.classList.add('is-selected');
    });
    if (state.activeCell) {
      const active = table.querySelector(`[data-row-id="${state.activeCell.rowId}"][data-column-key="${state.activeCell.columnKey}"]`);
      if (active) {
        active.classList.add('is-active-cell');
        const handle = document.createElement('span');
        handle.className = 'fill-handle';
        active.appendChild(handle);
      }
    }
  }

  function markConflictCell(rowId, columnKey) {
    const td = table.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"]`);
    if (td) td.classList.add('has-conflict');
  }

  function updateRenderedCell(rowId, columnKey, value) {
    const input = table.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"] .sheet-input`);
    if (input && !input.classList.contains('is-editing')) input.value = value;
  }

  function headerFilterButton(column) {
    if (!FILTERABLE_KEYS.includes(column.key)) return '';
    const active = state.filters[column.key] ? ' is-active' : '';
    return `<button type="button" class="filter-button${active}" data-filter-column="${esc(column.key)}" title="Filtro" aria-label="Filtrar ${esc(column.label)}"></button>`;
  }

  function renderTable() {
    const visibleRows = getVisibleRows();
    const styles = styleMap();
    const head = state.columns.map((column) => (
      `<th data-column-key="${esc(column.key)}" style="width:${Number(column.width || 160)}px">
        <span>${esc(column.label)}</span>${headerFilterButton(column)}
      </th>`
    )).join('');
    const body = visibleRows.map((row) => {
      const sourceIndex = state.rows.findIndex((item) => item.id === row.id) + 1;
      const winner = computeWinner(row);
      const cells = state.columns.map((column) => {
        const value = valueOf(row, column);
        const style = mergedStyle(row, column, styles);
        const isWinnerPrice = winner.keys.includes(column.key);
        const isComputed = column.options?.computed === true;
        const conflict = state.conflicts.has(cellKey(row.id, column.key));
        const classes = [
          'sheet-cell',
          column.options?.tone || '',
          isWinnerPrice ? 'is-best-price' : '',
          isComputed ? 'is-computed' : '',
          conflict ? 'has-conflict' : ''
        ].filter(Boolean).join(' ');
        const styleText = [
          style.background ? `background:${style.background}` : '',
          style.color ? `color:${style.color}` : ''
        ].filter(Boolean).join(';');
        return `<td class="${classes}" data-row-id="${esc(row.id)}" data-column-key="${esc(column.key)}" style="${styleText}">
          <input class="sheet-input" value="${esc(value)}" readonly ${isComputed ? 'tabindex="-1"' : ''}>
        </td>`;
      }).join('');
      return `<tr data-row-id="${esc(row.id)}">
        <th class="row-index" data-row-id="${esc(row.id)}">${sourceIndex}</th>
        ${cells}
      </tr>`;
    }).join('');
    table.innerHTML = `<thead><tr><th class="corner">#</th>${head}</tr></thead><tbody>${body}</tbody>`;
    rowCountBadge.textContent = `${nonEmptyRowCount(visibleRows)} linha(s) com dados`;
    updateSelectionClasses();
    bindCellHover();
  }

  function bindCellHover() {
    table.querySelectorAll('td.sheet-cell').forEach((td) => {
      td.addEventListener('mouseenter', () => {
        if (!state.dragging || !state.anchorCell) return;
        setSelection(td.dataset.rowId, td.dataset.columnKey, true);
      });
    });
  }

  function renderPresence() {
    const count = state.presence.length || 1;
    presenceCount.textContent = `${count} pessoa${count === 1 ? '' : 's'} usando`;
    presenceList.innerHTML = state.presence
      .map((item) => `<span class="presence-pill" title="${esc(item.username || '')}">${esc(animalName(item))}</span>`)
      .join('');
  }

  function renderRules() {
    ruleColumn.innerHTML = editableColumns()
      .map((column) => `<option value="${esc(column.key)}">${esc(column.label)}</option>`)
      .join('');
    rulesList.innerHTML = state.rules.length
      ? state.rules.map((rule) => `<div class="rule-item">
          <span>${esc(rule.column_key || rule.columnKey)} ${esc(rule.operator)} "${esc(rule.value)}"</span>
          <button type="button" data-rule-delete="${esc(rule.id)}">Apagar</button>
        </div>`).join('')
      : '<p class="empty-note">Nenhuma regra criada.</p>';
  }

  async function bootstrap() {
    status('Carregando...', 'busy');
    const data = await api('/api/bootstrap');
    state.quote = data.quote;
    state.columns = data.columns || [];
    state.rows = data.rows || [];
    state.rules = data.rules || [];
    state.styles = data.styles || [];
    state.presence = data.presence || [];
    state.lastEventId = Number(data.lastEventId || 0);
    if (!state.activeCell && state.rows[0] && state.columns[0]) {
      setSelection(state.rows[0].id, state.columns[0].key);
    }
    renderPresence();
    renderRules();
    renderTable();
    status('Sincronizado');
    socketConnect();
  }

  function socketConnect() {
    if (state.socket || !window.io || !state.quote?.id) return;
    const socket = window.io({ path: `${basePath}/socket.io` });
    state.socket = socket;
    socket.on('connect', () => {
      socket.emit('join', { quoteId: state.quote.id, clientId });
      updatePresence(false);
    });
    socket.on('presence:update', (presence) => {
      state.presence = Array.isArray(presence) ? presence : [];
      renderPresence();
    });
    socket.on('cell:update', (payload) => {
      if (payload.clientId === clientId) return;
      const row = rowById(payload.rowId);
      if (!row) return;
      const key = cellKey(payload.rowId, payload.columnKey);
      if (state.editing && state.editing.rowId === payload.rowId && state.editing.columnKey === payload.columnKey) {
        state.conflicts.set(key, {
          currentValue: payload.value,
          attemptedValue: state.editing.input?.value || '',
          updatedAt: payload.updatedAt
        });
        status('Conflito visual nesta celula', 'warn');
        markConflictCell(payload.rowId, payload.columnKey);
        return;
      }
      row.values = { ...(row.values || {}), [payload.columnKey]: payload.value };
      row.version = payload.version;
      state.lastEventId = Math.max(state.lastEventId, Number(payload.eventId || 0));
      state.conflicts.delete(key);
      if (state.editing) {
        updateRenderedCell(payload.rowId, payload.columnKey, payload.value);
        return;
      }
      renderTable();
    });
    socket.on('cells:update', (payload) => {
      if (payload.clientId === clientId) return;
      let needsRender = false;
      (payload.cells || []).forEach((cell) => {
        const row = rowById(cell.rowId);
        if (!row) return;
        const key = cellKey(cell.rowId, cell.columnKey);
        if (state.editing && state.editing.rowId === cell.rowId && state.editing.columnKey === cell.columnKey) {
          state.conflicts.set(key, {
            currentValue: cell.value,
            attemptedValue: state.editing.input?.value || '',
            updatedAt: cell.updatedAt
          });
          markConflictCell(cell.rowId, cell.columnKey);
          return;
        }
        row.values = { ...(row.values || {}), [cell.columnKey]: cell.value };
        row.version = cell.version;
        state.conflicts.delete(key);
        if (state.editing) updateRenderedCell(cell.rowId, cell.columnKey, cell.value);
        else needsRender = true;
      });
      state.lastEventId = Math.max(state.lastEventId, Number(payload.eventId || 0));
      if (needsRender && !state.editing) renderTable();
    });
    socket.on('rows:added', (payload) => {
      if (Array.isArray(payload.rows)) {
        payload.rows.forEach((row) => {
          if (!state.rows.some((item) => item.id === row.id)) state.rows.push(row);
        });
        state.rows.sort((a, b) => Number(a.position) - Number(b.position));
        renderTable();
      }
    });
    socket.on('row:deleted', (payload) => {
      state.rows = state.rows.filter((row) => row.id !== payload.rowId);
      if (state.activeCell?.rowId === payload.rowId) {
        state.activeCell = null;
        state.anchorCell = null;
        state.selectedRange = null;
      }
      renderTable();
    });
    socket.on('columns:changed', () => reloadSheet());
    socket.on('rules:update', () => reloadSheet());
    socket.on('sheet:reload', () => reloadSheet());
    socket.on('style:update', (payload) => {
      const style = payload.style;
      if (!style?.styleKey) return;
      state.styles = state.styles.filter((item) => item.styleKey !== style.styleKey);
      state.styles.push(style);
      renderTable();
    });
    socket.on('style:delete', (payload) => {
      state.styles = state.styles.filter((item) => item.styleKey !== payload.styleKey);
      renderTable();
    });
  }

  async function reloadSheet() {
    const data = await api('/api/bootstrap');
    state.columns = data.columns || [];
    state.rows = data.rows || [];
    state.rules = data.rules || [];
    state.styles = data.styles || [];
    state.presence = data.presence || [];
    state.lastEventId = Number(data.lastEventId || 0);
    renderPresence();
    renderRules();
    renderTable();
  }

  function updatePresence(editing = Boolean(state.editing)) {
    if (!state.socket?.connected || !state.quote?.id) return;
    state.socket.emit('presence:update', {
      rowId: state.activeCell?.rowId || null,
      columnKey: state.activeCell?.columnKey || null,
      filter: {
        search: state.search,
        categoria: state.filters.categoria ? Array.from(state.filters.categoria) : null,
        ganhador: state.filters[WINNER_KEY] ? Array.from(state.filters[WINNER_KEY]) : null
      },
      editing
    });
  }

  async function setCellValue(rowId, columnKey, value, options = {}) {
    const column = colByKey(columnKey);
    if (!column || column.options?.computed === true) return;
    const row = rowById(rowId);
    if (!row) return;
    const before = String(row.values?.[columnKey] ?? '');
    const after = String(value ?? '');
    if (before === after) return;
    status('Salvando...', 'busy');
    try {
      const data = await api('/api/cells', {
        method: 'PATCH',
        body: JSON.stringify({ rowId, columnKey, value: after, expectedValue: before, clientId })
      });
      row.values = { ...(row.values || {}), [columnKey]: after };
      row.version = data.version;
      row.updatedAt = data.updatedAt;
      state.conflicts.delete(cellKey(rowId, columnKey));
      if (options.history !== false) {
        state.history.push({ rowId, columnKey, before, after });
        state.future = [];
        updateUndoButtons();
      }
      status('Sincronizado');
      renderTable();
    } catch (error) {
      if (error.status === 409 && error.data?.conflict) {
        state.conflicts.set(cellKey(rowId, columnKey), error.data.conflict);
        status('Conflito visual nesta celula', 'warn');
        await reloadSheet();
        return;
      }
      status(error.message || 'Erro ao salvar', 'error');
      throw error;
    }
  }

  async function saveCellsBatch(changes, options = {}) {
    const unique = new Map();
    changes.forEach((change) => {
      if (!change?.rowId || !change?.columnKey) return;
      unique.set(cellKey(change.rowId, change.columnKey), change);
    });
    const prepared = Array.from(unique.values()).map((change) => {
      const column = colByKey(change.columnKey);
      const row = rowById(change.rowId);
      if (!row || !column || column.options?.computed === true) return null;
      const before = String(row.values?.[change.columnKey] ?? '');
      const after = String(change.value ?? '');
      if (before === after) return null;
      return {
        rowId: change.rowId,
        columnKey: change.columnKey,
        value: after,
        expectedValue: before,
        before,
        after
      };
    }).filter(Boolean);
    if (!prepared.length) return;
    status('Salvando lote...', 'busy');
    try {
      const data = await api('/api/cells/batch', {
        method: 'PATCH',
        body: JSON.stringify({
          changes: prepared.map(({ rowId, columnKey, value, expectedValue }) => ({ rowId, columnKey, value, expectedValue })),
          clientId
        })
      });
      (data.cells || []).forEach((cell) => {
        const row = rowById(cell.rowId);
        if (!row) return;
        row.values = { ...(row.values || {}), [cell.columnKey]: cell.value };
        row.version = cell.version;
        row.updatedAt = cell.updatedAt;
        state.conflicts.delete(cellKey(cell.rowId, cell.columnKey));
      });
      if (options.history !== false && data.cells?.length) {
        state.history.push({
          type: 'batch',
          changes: data.cells.map((cell) => ({
            rowId: cell.rowId,
            columnKey: cell.columnKey,
            before: cell.previousValue,
            after: cell.value
          }))
        });
        state.future = [];
        updateUndoButtons();
      }
      status('Sincronizado');
      renderTable();
    } catch (error) {
      if (error.status === 409 && error.data?.conflict) {
        const conflict = error.data.conflict;
        state.conflicts.set(cellKey(conflict.rowId, conflict.columnKey), conflict);
        status('Conflito visual nesta celula', 'warn');
        await reloadSheet();
        return;
      }
      status(error.message || 'Erro ao salvar lote', 'error');
      throw error;
    }
  }

  function beginEdit(rowId, columnKey, initialText = null) {
    const column = colByKey(columnKey);
    const row = rowById(rowId);
    if (!row || !column || column.options?.computed === true) return;
    setSelection(rowId, columnKey);
    const td = table.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"]`);
    const input = td?.querySelector('.sheet-input');
    if (!input) return;
    const originalValue = String(row.values?.[columnKey] ?? '');
    state.editing = { rowId, columnKey, originalValue, input };
    input.readOnly = false;
    input.classList.add('is-editing');
    input.value = initialText === null ? originalValue : String(initialText);
    input.focus();
    if (initialText === null) input.select();
    updatePresence(true);
  }

  async function commitEdit(move = null) {
    if (!state.editing) return;
    const editing = state.editing;
    state.editing = null;
    const input = editing.input;
    const value = input?.value ?? editing.originalValue;
    if (input) {
      input.readOnly = true;
      input.classList.remove('is-editing');
    }
    await setCellValue(editing.rowId, editing.columnKey, value);
    updatePresence(false);
    if (move) moveActive(move.row, move.col, false);
  }

  function cancelEdit() {
    if (!state.editing) return;
    const editing = state.editing;
    state.editing = null;
    if (editing.input) {
      editing.input.value = editing.originalValue;
      editing.input.readOnly = true;
      editing.input.classList.remove('is-editing');
    }
    updatePresence(false);
    renderTable();
  }

  function moveActive(rowDelta, colDelta, extend = false) {
    if (!state.activeCell) return;
    const rows = gridRows();
    const coords = coordsFor(state.activeCell.rowId, state.activeCell.columnKey, rows);
    const cell = cellAt(coords.row + rowDelta, coords.col + colDelta, rows);
    if (cell) setSelection(cell.rowId, cell.columnKey, extend);
  }

  async function undo() {
    const action = state.history.pop();
    if (!action) return;
    if (action.type === 'batch') {
      await saveCellsBatch(action.changes.map((change) => ({
        rowId: change.rowId,
        columnKey: change.columnKey,
        value: change.before
      })), { history: false });
    } else {
      await setCellValue(action.rowId, action.columnKey, action.before, { history: false });
    }
    state.future.push(action);
    updateUndoButtons();
  }

  async function redo() {
    const action = state.future.pop();
    if (!action) return;
    if (action.type === 'batch') {
      await saveCellsBatch(action.changes.map((change) => ({
        rowId: change.rowId,
        columnKey: change.columnKey,
        value: change.after
      })), { history: false });
    } else {
      await setCellValue(action.rowId, action.columnKey, action.after, { history: false });
    }
    state.history.push(action);
    updateUndoButtons();
  }

  function updateUndoButtons() {
    undoButton.disabled = state.history.length === 0;
    redoButton.disabled = state.future.length === 0;
  }

  async function addRows(anchorRowId, placement, count) {
    status('Adicionando linhas...', 'busy');
    const data = await api('/api/rows/insert', {
      method: 'POST',
      body: JSON.stringify({ anchorRowId, placement, count, clientId })
    });
    data.rows.forEach((row) => {
      if (!state.rows.some((item) => item.id === row.id)) state.rows.push(row);
    });
    await reloadSheet();
    status('Sincronizado');
    return data.rows;
  }

  async function appendRows(count) {
    const data = await api('/api/rows', {
      method: 'POST',
      body: JSON.stringify({ count, clientId })
    });
    data.rows.forEach((row) => state.rows.push(row));
    renderTable();
    return data.rows;
  }

  async function pasteMatrix(text) {
    if (!state.activeCell) return;
    const matrix = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((line, index, all) => line !== '' || index < all.length - 1)
      .map((line) => line.split('\t'));
    if (!matrix.length) return;
    const rows = gridRows();
    const start = coordsFor(state.activeCell.rowId, state.activeCell.columnKey, rows);
    if (start.row < 0 || start.col < 0) return;
    const neededRows = start.row + matrix.length - rows.length;
    if (neededRows > 0 && !hasActiveViewFilter()) {
      await appendRows(neededRows);
    }
    const targetRows = gridRows();
    const changes = [];
    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
        const cell = cellAt(start.row + rowOffset, start.col + colOffset, targetRows);
        if (!cell) continue;
        const column = colByKey(cell.columnKey);
        if (!column || column.options?.computed === true) continue;
        changes.push({ rowId: cell.rowId, columnKey: cell.columnKey, value: matrix[rowOffset][colOffset] });
      }
    }
    await saveCellsBatch(changes);
  }

  async function deleteSelectedValues() {
    await saveCellsBatch(selectedCells().map((cell) => ({ ...cell, value: '' })));
  }

  async function setStyle(target, background) {
    const body = { ...target, background, clientId };
    const data = await api('/api/styles', { method: 'PUT', body: JSON.stringify(body) });
    state.styles = state.styles.filter((item) => item.styleKey !== data.style.styleKey);
    state.styles.push(data.style);
  }

  async function deleteStyle(target) {
    const data = await api('/api/styles', { method: 'DELETE', body: JSON.stringify({ ...target, clientId }) });
    state.styles = state.styles.filter((item) => item.styleKey !== data.styleKey);
  }

  async function applyColorToSelection(color) {
    const cells = selectedCells();
    for (const cell of cells) {
      await setStyle({ scope: 'cell', rowId: cell.rowId, columnKey: cell.columnKey }, color);
    }
    renderTable();
  }

  async function eraseSelection() {
    const cells = selectedCells();
    for (const cell of cells) {
      await deleteStyle({ scope: 'cell', rowId: cell.rowId, columnKey: cell.columnKey });
    }
    renderTable();
  }

  async function colorColumn(columnKey, color) {
    await setStyle({ scope: 'column', columnKey }, color);
    renderTable();
  }

  async function colorRow(rowId, color) {
    await setStyle({ scope: 'row', rowId }, color);
    renderTable();
  }

  async function eraseColumn(columnKey) {
    await deleteStyle({ scope: 'column', columnKey });
    renderTable();
  }

  async function eraseRow(rowId) {
    await deleteStyle({ scope: 'row', rowId });
    renderTable();
  }

  function openContextMenu(event, rowId, columnKey) {
    event.preventDefault();
    const column = colByKey(columnKey);
    state.context = { rowId, columnKey };
    if (rowId && columnKey) setSelection(rowId, columnKey);
    contextMenu.querySelectorAll('[data-action^="column"]').forEach((button) => {
      button.disabled = !isDistributorColumn(column);
    });
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.hidden = false;
  }

  function closeMenus() {
    contextMenu.hidden = true;
    filterMenu.hidden = true;
  }

  async function handleContextAction(action) {
    const context = state.context || {};
    const rowId = context.rowId || state.activeCell?.rowId;
    const columnKey = context.columnKey || state.activeCell?.columnKey;
    const column = colByKey(columnKey);
    closeMenus();
    if (action === 'row-above') return addRows(rowId, 'above', 1);
    if (action === 'row-below') return addRows(rowId, 'below', 1);
    if (action === 'row-20-below') return addRows(rowId, 'below', 20);
    if (action === 'row-delete') {
      if (!rowId || !confirm('Apagar esta linha?')) return null;
      await api(`/api/rows/${encodeURIComponent(rowId)}`, { method: 'DELETE', body: JSON.stringify({ clientId }) });
      state.rows = state.rows.filter((row) => row.id !== rowId);
      renderTable();
      return null;
    }
    if (!isDistributorColumn(column)) return null;
    if (action === 'column-before' || action === 'column-after') {
      const label = prompt('Nome da distribuidora:', 'Nova distribuidora');
      if (label === null) return null;
      await api('/api/columns', {
        method: 'POST',
        body: JSON.stringify({ anchorKey: columnKey, placement: action === 'column-before' ? 'before' : 'after', label, clientId })
      });
      return reloadSheet();
    }
    if (action === 'column-rename') {
      const label = prompt('Novo nome da distribuidora:', column.label);
      if (label === null) return null;
      await api(`/api/columns/${encodeURIComponent(columnKey)}/rename`, {
        method: 'POST',
        body: JSON.stringify({ label, clientId })
      });
      return reloadSheet();
    }
    if (action === 'column-left' || action === 'column-right') {
      await api(`/api/columns/${encodeURIComponent(columnKey)}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction: action === 'column-left' ? 'left' : 'right', clientId })
      });
      return reloadSheet();
    }
    if (action === 'column-delete') {
      if (!confirm(`Apagar a distribuidora "${column.label}"?`)) return null;
      await api(`/api/columns/${encodeURIComponent(columnKey)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      return reloadSheet();
    }
    return null;
  }

  function openFilter(columnKey, anchor) {
    const values = Array.from(new Set(state.rows.map((row) => (
      columnKey === WINNER_KEY ? computeWinner(row).label : valueOf(row, colByKey(columnKey))
    )))).sort((a, b) => String(a).localeCompare(String(b)));
    const current = state.filters[columnKey] || new Set(values);
    filterMenu.innerHTML = `
      <strong>Filtro: ${esc(colByKey(columnKey)?.label || columnKey)}</strong>
      <div class="filter-actions">
        <button type="button" data-filter-select="all">Selecionar tudo</button>
        <button type="button" data-filter-select="none">Selecionar nada</button>
      </div>
      <div class="filter-options">
        ${values.map((value) => `<label><input type="checkbox" value="${esc(value)}" ${current.has(value) ? 'checked' : ''}> ${esc(value || '(vazio)')}</label>`).join('')}
      </div>
      <div class="filter-actions">
        <button type="button" data-filter-apply="${esc(columnKey)}">Aplicar</button>
        <button type="button" data-filter-clear="${esc(columnKey)}">Limpar</button>
      </div>`;
    const rect = anchor.getBoundingClientRect();
    filterMenu.style.left = `${rect.left}px`;
    filterMenu.style.top = `${rect.bottom + 6}px`;
    filterMenu.hidden = false;
  }

  function exportCsv() {
    const columns = state.columns;
    const rows = getVisibleRows();
    const lines = [
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => valueOf(row, column)))
    ];
    const csv = lines
      .map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotacao-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadDiagnostics() {
    const [diagnostics, backups, google] = await Promise.all([
      api('/api/diagnostics'),
      api('/api/backups'),
      api('/api/google-sheets/status')
    ]);
    backupSelect.innerHTML = (backups.backups || [])
      .map((backup) => `<option value="${esc(backup.name)}">${esc(backup.name)} (${Math.round(backup.bytes / 1024)} KB)</option>`)
      .join('');
    diagnosticsOutput.textContent = JSON.stringify({ diagnostics, google, backups: backups.backups }, null, 2);
  }

  function bindEvents() {
    table.addEventListener('mousedown', async (event) => {
      const filterButton = event.target.closest('.filter-button');
      if (filterButton) {
        event.preventDefault();
        openFilter(filterButton.dataset.filterColumn, filterButton);
        return;
      }
      const header = event.target.closest('th[data-column-key]');
      if (header && (state.paintColor || state.eraser)) {
        event.preventDefault();
        const columnKey = header.dataset.columnKey;
        if (state.eraser) await eraseColumn(columnKey);
        else await colorColumn(columnKey, state.paintColor);
        return;
      }
      const rowHeader = event.target.closest('.row-index');
      if (rowHeader && (state.paintColor || state.eraser)) {
        event.preventDefault();
        const rowId = rowHeader.dataset.rowId;
        if (state.eraser) await eraseRow(rowId);
        else await colorRow(rowId, state.paintColor);
        return;
      }
      const cell = event.target.closest('td.sheet-cell');
      if (!cell || event.button !== 0) return;
      event.preventDefault();
      if (state.paintColor || state.eraser) {
        setSelection(cell.dataset.rowId, cell.dataset.columnKey, event.shiftKey);
        if (state.eraser) await eraseSelection();
        else await applyColorToSelection(state.paintColor);
        return;
      }
      if (state.editing) commitEdit().catch(console.error);
      state.dragging = true;
      setSelection(cell.dataset.rowId, cell.dataset.columnKey, event.shiftKey);
    });

    table.addEventListener('dblclick', (event) => {
      const cell = event.target.closest('td.sheet-cell');
      if (cell) beginEdit(cell.dataset.rowId, cell.dataset.columnKey);
    });

    table.addEventListener('contextmenu', (event) => {
      const cell = event.target.closest('td.sheet-cell');
      const header = event.target.closest('th[data-column-key]');
      if (cell) return openContextMenu(event, cell.dataset.rowId, cell.dataset.columnKey);
      if (header) return openContextMenu(event, state.activeCell?.rowId, header.dataset.columnKey);
      return null;
    });

    table.addEventListener('keydown', (event) => {
      if (!state.editing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit({ row: 1, col: 0 }).catch(console.error);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit({ row: 0, col: event.shiftKey ? -1 : 1 }).catch(console.error);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    }, true);

    document.addEventListener('mouseup', () => {
      state.dragging = false;
    });

    document.addEventListener('keydown', (event) => {
      if (isTextEntryTarget(event.target) || state.editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo().catch(console.error);
        else undo().catch(console.error);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo().catch(console.error);
        return;
      }
      if (!state.activeCell) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1, 0, event.shiftKey);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1, 0, event.shiftKey);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveActive(0, -1, event.shiftKey);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveActive(0, 1, event.shiftKey);
      } else if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEdit(state.activeCell.rowId, state.activeCell.columnKey);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        deleteSelectedValues().catch(console.error);
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        beginEdit(state.activeCell.rowId, state.activeCell.columnKey, event.key);
      }
    });

    document.addEventListener('paste', (event) => {
      if (isTextEntryTarget(event.target)) return;
      if (state.editing || !state.activeCell) return;
      const text = event.clipboardData?.getData('text/plain') || '';
      if (!text) return;
      event.preventDefault();
      pasteMatrix(text).catch(console.error);
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#contextMenu') && !event.target.closest('.filter-button') && !event.target.closest('#filterMenu')) {
        closeMenus();
      }
    });

    contextMenu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) handleContextAction(button.dataset.action).catch(console.error);
    });

    filterMenu.addEventListener('click', (event) => {
      const select = event.target.closest('[data-filter-select]');
      if (select) {
        const checked = select.dataset.filterSelect === 'all';
        filterMenu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = checked;
        });
        return;
      }
      const apply = event.target.closest('[data-filter-apply]');
      if (apply) {
        const values = Array.from(filterMenu.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
        state.filters[apply.dataset.filterApply] = new Set(values);
        filterMenu.hidden = true;
        renderTable();
        updatePresence(false);
        return;
      }
      const clear = event.target.closest('[data-filter-clear]');
      if (clear) {
        state.filters[clear.dataset.filterClear] = null;
        filterMenu.hidden = true;
        renderTable();
        updatePresence(false);
      }
    });

    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      renderTable();
      updatePresence(false);
    });

    document.querySelectorAll('.paint-swatch').forEach((button) => {
      button.addEventListener('click', () => {
        state.paintColor = button.dataset.color;
        state.eraser = false;
        eraserButton.classList.remove('is-active');
        document.querySelectorAll('.paint-swatch').forEach((item) => item.classList.toggle('is-active', item === button));
        if (selectedCells().length) applyColorToSelection(state.paintColor).catch(console.error);
      });
    });

    eraserButton.addEventListener('click', () => {
      state.eraser = !state.eraser;
      if (state.eraser) state.paintColor = null;
      eraserButton.classList.toggle('is-active', state.eraser);
      document.querySelectorAll('.paint-swatch').forEach((item) => item.classList.remove('is-active'));
      if (state.eraser && selectedCells().length) eraseSelection().catch(console.error);
    });

    undoButton.addEventListener('click', () => undo().catch(console.error));
    redoButton.addEventListener('click', () => redo().catch(console.error));
    exportCsvButton.addEventListener('click', exportCsv);

    rulesButton.addEventListener('click', () => {
      renderRules();
      rulesDialog.showModal();
    });
    addRuleButton.addEventListener('click', async () => {
      const data = await api('/api/rules', {
        method: 'POST',
        body: JSON.stringify({
          columnKey: ruleColumn.value,
          operator: ruleOperator.value,
          value: ruleValue.value,
          background: ruleBg.value,
          color: ruleColor.value,
          clientId
        })
      });
      state.rules.push(data.rule);
      ruleValue.value = '';
      renderRules();
      renderTable();
    });
    rulesList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-rule-delete]');
      if (!button) return;
      await api(`/api/rules/${encodeURIComponent(button.dataset.ruleDelete)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      state.rules = state.rules.filter((rule) => rule.id !== button.dataset.ruleDelete);
      renderRules();
      renderTable();
    });

    diagnosticsButton.addEventListener('click', async () => {
      diagnosticsDialog.showModal();
      await loadDiagnostics();
    });
    refreshDiagnosticsButton.addEventListener('click', () => loadDiagnostics().catch(console.error));
    googleExportButton.addEventListener('click', async () => {
      const data = await api('/api/google-sheets/export', { method: 'POST', body: JSON.stringify({ clientId }) });
      diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
    });
    googleImportButton.addEventListener('click', async () => {
      if (!confirm('Importar do Google Sheets vai substituir as linhas atuais da Cotacao V2. Continuar?')) return;
      const data = await api('/api/google-sheets/import', { method: 'POST', body: JSON.stringify({ clientId }) });
      diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
      await reloadSheet();
    });
    createBackupButton.addEventListener('click', async () => {
      const data = await api('/api/backups', { method: 'POST', body: JSON.stringify({ clientId }) });
      diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
      await loadDiagnostics();
    });
    restoreBackupButton.addEventListener('click', async () => {
      const name = backupSelect.value;
      if (!name || !confirm(`Restaurar ${name}? As linhas atuais serao substituidas.`)) return;
      const data = await api(`/api/backups/${encodeURIComponent(name)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ clientId })
      });
      diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
      await reloadSheet();
    });
  }

  updateUndoButtons();
  bindEvents();
  bootstrap().catch((error) => {
    console.error(error);
    status(error.message || 'Erro ao carregar', 'error');
  });
})();
