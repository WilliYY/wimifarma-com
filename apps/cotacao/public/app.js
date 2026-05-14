(() => {
  const config = window.COTACAO_CONFIG || {};
  const basePath = config.basePath || '/cotacao';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

  const table = document.getElementById('sheetTable');
  const sheetWrap = document.getElementById('sheetWrap');
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
  const paletteToggleButton = document.getElementById('paletteToggleButton');
  const paintPalette = document.getElementById('paintPalette');
  const addRowsFooterButton = document.getElementById('addRowsFooterButton');
  const rulesDialog = document.getElementById('rulesDialog');
  const ruleColumn = document.getElementById('ruleColumn');
  const ruleOperator = document.getElementById('ruleOperator');
  const ruleValue = document.getElementById('ruleValue');
  const ruleBg = document.getElementById('ruleBg');
  const ruleTimestamp = document.getElementById('ruleTimestamp');
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
  let resizeGuide = null;
  let resizeBadge = null;

  const FIXED_KEYS = ['ean', 'produto', 'quantidade', 'categoria'];
  const WINNER_KEY = 'quem_ganhou';
  const FILTERABLE_KEYS = ['produto', 'categoria', WINNER_KEY];
  const RULE_OPERATORS = [
    ['contains', 'Contem'],
    ['equals', 'Igual'],
    ['starts', 'Comeca com']
  ];
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
    deltaInFlight: false,
    lastDeltaAt: null,
    search: '',
    filters: {
      produto: null,
      categoria: null,
      [WINNER_KEY]: null
    },
    colorFilters: {
      produto: null,
      categoria: null,
      [WINNER_KEY]: null
    },
    activeCell: null,
    anchorCell: null,
    selectedRange: null,
    selectionScope: null,
    editing: null,
    pendingCommit: null,
    dragging: false,
    resizing: null,
    fillDragging: null,
    fillPreviewRange: null,
    fillPreviewCell: null,
    headerDragging: null,
    renamingColumn: null,
    connectedOnce: false,
    heartbeatTimer: null,
    refreshTimer: null,
    pinnedRows: new Set(),
    searchBeforeFocus: '',
    context: null,
    paintColor: null,
    eraser: false,
    headerSelectTimer: null,
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

  function rememberEventId(value) {
    const eventId = Number(value || 0);
    if (Number.isFinite(eventId) && eventId > state.lastEventId) {
      state.lastEventId = eventId;
    }
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

  function clampColumnWidth(width) {
    const number = Number(width);
    if (!Number.isFinite(number)) return 160;
    return Math.max(84, Math.min(620, Math.round(number)));
  }

  function isTextEntryTarget(target) {
    const node = target instanceof Element ? target : null;
    if (!node) return false;
    if (node.closest('dialog')) return true;
    if (node.closest('.sheet-cell')) return false;
    return Boolean(node.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function pushHistory(action) {
    state.history.push(action);
    state.future = [];
    updateUndoButtons();
  }

  function cloneFilter(filter) {
    return filter ? Array.from(filter) : null;
  }

  function restoreFilter(values) {
    return Array.isArray(values) ? new Set(values) : null;
  }

  function clearPinnedRows() {
    state.pinnedRows.clear();
  }

  function valueOf(row, column) {
    if (!row || !column) return '';
    if (column.key === WINNER_KEY || column.options?.computed === true) {
      return computeWinner(row).label;
    }
    return String(row.values?.[column.key] ?? '');
  }

  function columnLabel(columnKey) {
    return colByKey(columnKey)?.label || columnKey;
  }

  function operatorLabel(operator) {
    if (operator === 'equals') return 'igual a';
    if (operator === 'starts') return 'comeca com';
    return 'contem';
  }

  function ruleColumnOptions(selectedKey = 'categoria') {
    return editableColumns()
      .map((column) => `<option value="${esc(column.key)}" ${column.key === selectedKey ? 'selected' : ''}>${esc(column.label)}</option>`)
      .join('');
  }

  function ruleOperatorOptions(selectedOperator = 'contains') {
    return RULE_OPERATORS
      .map(([value, label]) => `<option value="${esc(value)}" ${value === selectedOperator ? 'selected' : ''}>${esc(label)}</option>`)
      .join('');
  }

  function readRuleRow(row) {
    return {
      columnKey: row.querySelector('[data-rule-field="columnKey"]')?.value || 'categoria',
      operator: row.querySelector('[data-rule-field="operator"]')?.value || 'contains',
      value: row.querySelector('[data-rule-field="value"]')?.value || '',
      background: row.querySelector('[data-rule-field="background"]')?.value || '#fff7ed',
      showTimestamp: row.querySelector('[data-rule-field="showTimestamp"]')?.checked === true,
      color: '#111827',
      clientId
    };
  }

  function winnerOptionRank(value) {
    const text = String(value || '');
    if (text === 'Sem vencedor') return 2;
    if (text.startsWith('Empate:')) return 1;
    return 0;
  }

  function winnerFilterOptions() {
    const counts = new Map();
    state.rows.forEach((row) => {
      const label = computeWinner(row).label;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => winnerOptionRank(a.value) - winnerOptionRank(b.value) || a.value.localeCompare(b.value));
  }

  function filterOptions(columnKey) {
    if (columnKey === WINNER_KEY) return winnerFilterOptions();
    const column = colByKey(columnKey);
    const counts = new Map();
    state.rows.forEach((row) => {
      const value = valueOf(row, column);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => String(a.value).localeCompare(String(b.value)));
  }

  function normalizeColorValue(value) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
  }

  function colorFilterOptions(columnKey) {
    const column = colByKey(columnKey);
    if (!column) return [];
    const styles = styleMap();
    const counts = new Map();
    state.rows.forEach((row) => {
      const background = normalizeColorValue(mergedStyle(row, column, styles).background);
      const value = background || '__none__';
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => (a.value === '__none__' ? 1 : b.value === '__none__' ? -1 : a.value.localeCompare(b.value)));
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

  function rowMatchesView(row) {
    const term = state.search.trim().toLowerCase();
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
    const styles = styleMap();
    for (const key of FILTERABLE_KEYS) {
      const filter = state.colorFilters[key];
      if (!filter) continue;
      const column = colByKey(key);
      if (!column) continue;
      const value = normalizeColorValue(mergedStyle(row, column, styles).background) || '__none__';
      if (!filter.has(value)) return false;
    }
    return true;
  }

  function getVisibleRows() {
    return state.rows.filter((row) => {
      if (state.pinnedRows.has(row.id)) return true;
      return rowMatchesView(row);
    });
  }

  function rememberEditedRowInFilteredView(row) {
    if (!row || !hasActiveViewFilter()) return;
    if (!rowMatchesView(row)) {
      state.pinnedRows.add(row.id);
    }
  }

  function normalizePastedValue(column, value) {
    const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
    if (!text) return '';
    if (isDistributorColumn(column)) {
      const number = parsePrice(text);
      if (number !== null) {
        return number.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
      }
    }
    return text;
  }

  function selectedMatrixTsv() {
    if (!state.activeCell) return '';
    const rows = gridRows();
    const anchor = coordsFor((state.anchorCell || state.activeCell).rowId, (state.anchorCell || state.activeCell).columnKey, rows);
    const active = coordsFor(state.activeCell.rowId, state.activeCell.columnKey, rows);
    if (anchor.row < 0 || active.row < 0 || anchor.col < 0 || active.col < 0) return '';
    const startRow = Math.min(anchor.row, active.row);
    const endRow = Math.max(anchor.row, active.row);
    const startCol = Math.min(anchor.col, active.col);
    const endCol = Math.max(anchor.col, active.col);
    const lines = [];
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      const row = rows[rowIndex];
      const values = [];
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        values.push(valueOf(row, state.columns[colIndex]).replace(/\r?\n/g, ' '));
      }
      lines.push(values.join('\t'));
    }
    return lines.join('\n');
  }

  function applySearchValue(value) {
    state.search = String(value || '');
    if (searchInput) searchInput.value = state.search;
    clearPinnedRows();
    renderTable();
    updatePresence(false);
  }

  function applyFilterValue(columnKey, values, colorValues = null) {
    state.filters[columnKey] = restoreFilter(values);
    state.colorFilters[columnKey] = restoreFilter(colorValues);
    clearPinnedRows();
    renderTable();
    updatePresence(false);
  }

  function nonEmptyRowCount(rows = getVisibleRows()) {
    return rows.filter((row) => Object.values(row.values || {}).some((value) => String(value ?? '').trim() !== '')).length;
  }

  function hasActiveViewFilter() {
    if (String(state.search || '').trim()) return true;
    return FILTERABLE_KEYS.some((key) => state.filters[key] || state.colorFilters[key]);
  }

  function gridRows() {
    return hasActiveViewFilter() ? getVisibleRows() : state.rows;
  }

  function styleMap() {
    const map = new Map();
    state.styles.forEach((style) => map.set(style.styleKey, style));
    return map;
  }

  function ruleStyle(row, column) {
    for (const rule of state.rules.filter((item) => item.enabled !== false)) {
      const ruleColumnKey = rule.column_key || rule.columnKey;
      if (ruleColumnKey !== column.key) continue;
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
        const showTimestamp = rule.show_timestamp === true || rule.showTimestamp === true;
        return {
          background: rule.background,
          title: showTimestamp ? formatRuleTimestamp(rule) : ''
        };
      }
    }
    return {};
  }

  function formatRuleTimestamp(rule) {
    const raw = rule.created_at || rule.createdAt;
    if (!raw) return '';
    const date = new Date(raw);
    const formatted = Number.isNaN(date.getTime())
      ? String(raw)
      : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(date);
    return `Data/hora: ${formatted}`;
  }

  function mergedStyle(row, column, map) {
    const merged = { ...ruleStyle(row, column) };
    const candidates = [
      `column::${column.key}`,
      `row:${row.id}:`,
      `cell:${row.id}:${column.key}`
    ]
      .map((key, index) => ({ style: map.get(key), index }))
      .filter((item) => item.style)
      .sort((a, b) => {
        const left = Date.parse(a.style.updatedAt || a.style.updated_at || '') || 0;
        const right = Date.parse(b.style.updatedAt || b.style.updated_at || '') || 0;
        return left - right || a.index - b.index;
      });
    candidates.forEach(({ style }) => {
      if (style.background) merged.background = style.background;
    });
    return merged;
  }

  function clearEditingVisuals() {
    table.querySelectorAll('.sheet-input.is-editing').forEach((input) => {
      input.classList.remove('is-editing');
      input.readOnly = true;
      autosizeInput(input);
      input.blur();
    });
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

  function selectedCells(options = {}) {
    if (!state.activeCell) return [];
    const includeComputed = options.includeComputed === true;
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
        if (cell && (includeComputed || colByKey(cell.columnKey)?.options?.computed !== true)) {
          cells.push(cell);
        }
      }
    }
    return cells;
  }

  function selectedCellMatrix(rows = gridRows()) {
    if (!state.selectedRange) return [];
    const matrix = [];
    for (let rowIndex = state.selectedRange.startRow; rowIndex <= state.selectedRange.endRow; rowIndex += 1) {
      const line = [];
      for (let colIndex = state.selectedRange.startCol; colIndex <= state.selectedRange.endCol; colIndex += 1) {
        const row = rows[rowIndex];
        const column = state.columns[colIndex];
        line.push(row && column ? { row, column, rowIndex, colIndex } : null);
      }
      matrix.push(line);
    }
    return matrix;
  }

  function selectionContains(rowId, columnKey) {
    if (!rowId || !columnKey || !state.selectedRange) return false;
    const rows = gridRows();
    const coords = coordsFor(rowId, columnKey, rows);
    if (coords.row < 0 || coords.col < 0) return false;
    return coords.row >= state.selectedRange.startRow
      && coords.row <= state.selectedRange.endRow
      && coords.col >= state.selectedRange.startCol
      && coords.col <= state.selectedRange.endCol;
  }

  function setSelection(rowId, columnKey, extend = false) {
    const target = { rowId, columnKey };
    state.selectionScope = null;
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

  function selectColumn(columnKey) {
    selectColumnRange(columnKey, columnKey);
  }

  function selectColumnRange(anchorColumnKey, targetColumnKey) {
    const rows = gridRows();
    const anchorIndex = state.columns.findIndex((column) => column.key === anchorColumnKey);
    const targetIndex = state.columns.findIndex((column) => column.key === targetColumnKey);
    if (anchorIndex < 0 || targetIndex < 0 || !rows.length) return;
    const startCol = Math.min(anchorIndex, targetIndex);
    const endCol = Math.max(anchorIndex, targetIndex);
    state.selectionScope = startCol === endCol
      ? { type: 'column', columnKey: state.columns[startCol].key }
      : { type: 'column-range', startCol, endCol };
    state.anchorCell = { rowId: rows[0].id, columnKey: state.columns[anchorIndex].key };
    state.activeCell = { rowId: rows[rows.length - 1].id, columnKey: state.columns[targetIndex].key };
    state.selectedRange = {
      startRow: 0,
      endRow: rows.length - 1,
      startCol,
      endCol
    };
    updateSelectionClasses();
    updatePresence(false);
  }

  function selectRow(rowId) {
    selectRowRange(rowId, rowId);
  }

  function selectRowRange(anchorRowId, targetRowId) {
    const rows = gridRows();
    const anchorIndex = rows.findIndex((row) => row.id === anchorRowId);
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    if (anchorIndex < 0 || targetIndex < 0 || !state.columns.length) return;
    const startRow = Math.min(anchorIndex, targetIndex);
    const endRow = Math.max(anchorIndex, targetIndex);
    state.selectionScope = startRow === endRow
      ? { type: 'row', rowId: rows[startRow].id }
      : { type: 'row-range', startRow, endRow };
    state.anchorCell = { rowId: rows[anchorIndex].id, columnKey: state.columns[0].key };
    state.activeCell = { rowId: rows[targetIndex].id, columnKey: state.columns[state.columns.length - 1].key };
    state.selectedRange = {
      startRow,
      endRow,
      startCol: 0,
      endCol: state.columns.length - 1
    };
    updateSelectionClasses();
    updatePresence(false);
  }

  function updateSelectionClasses() {
    table.querySelectorAll('.is-selected, .is-active-cell, .is-selected-header, .is-selected-row, .is-fill-preview').forEach((node) => {
      node.classList.remove('is-selected', 'is-active-cell', 'is-selected-header', 'is-selected-row', 'is-fill-preview');
    });
    table.querySelectorAll('.fill-handle').forEach((node) => node.remove());
    selectedCells({ includeComputed: true }).forEach((cell) => {
      const td = table.querySelector(`[data-row-id="${cell.rowId}"][data-column-key="${cell.columnKey}"]`);
      if (td) td.classList.add('is-selected');
    });
    if (state.selectionScope?.type === 'column') {
      const header = table.querySelector(`th[data-column-key="${state.selectionScope.columnKey}"]`);
      if (header) header.classList.add('is-selected-header');
    } else if (state.selectionScope?.type === 'column-range') {
      for (let index = state.selectionScope.startCol; index <= state.selectionScope.endCol; index += 1) {
        const header = table.querySelector(`th[data-column-key="${state.columns[index]?.key}"]`);
        if (header) header.classList.add('is-selected-header');
      }
    }
    if (state.selectionScope?.type === 'row') {
      const rowHeader = table.querySelector(`.row-index[data-row-id="${state.selectionScope.rowId}"]`);
      if (rowHeader) rowHeader.classList.add('is-selected-row');
    } else if (state.selectionScope?.type === 'row-range') {
      const rows = gridRows();
      for (let index = state.selectionScope.startRow; index <= state.selectionScope.endRow; index += 1) {
        const rowHeader = table.querySelector(`.row-index[data-row-id="${rows[index]?.id}"]`);
        if (rowHeader) rowHeader.classList.add('is-selected-row');
      }
    }
    if (state.activeCell) {
      const active = table.querySelector(`[data-row-id="${state.activeCell.rowId}"][data-column-key="${state.activeCell.columnKey}"]`);
      if (active) {
        active.classList.add('is-active-cell');
        const handle = document.createElement('span');
        handle.className = 'fill-handle';
        active.appendChild(handle);
      }
    }
    updateFillPreviewClasses();
  }

  function clearFillPreview() {
    state.fillPreviewRange = null;
    state.fillPreviewCell = null;
    table.querySelectorAll('.is-fill-preview').forEach((node) => node.classList.remove('is-fill-preview'));
  }

  function updateFillPreviewClasses() {
    table.querySelectorAll('.is-fill-preview').forEach((node) => node.classList.remove('is-fill-preview'));
    const range = state.fillPreviewRange;
    if (!range) return;
    const rows = gridRows();
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row) continue;
      for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
        const column = state.columns[colIndex];
        if (!column) continue;
        const td = table.querySelector(`[data-row-id="${row.id}"][data-column-key="${column.key}"]`);
        if (td) td.classList.add('is-fill-preview');
      }
    }
  }

  function updateFillPreview(targetCell) {
    const nextRange = fillTargetRange(targetCell);
    const previous = state.fillPreviewRange;
    state.fillPreviewCell = nextRange ? targetCell : null;
    const sameRange = previous && nextRange
      && previous.startRow === nextRange.startRow
      && previous.endRow === nextRange.endRow
      && previous.startCol === nextRange.startCol
      && previous.endCol === nextRange.endCol;
    if (sameRange) return;
    state.fillPreviewRange = nextRange;
    updateFillPreviewClasses();
  }

  function markConflictCell(rowId, columnKey) {
    const td = table.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"]`);
    if (td) td.classList.add('has-conflict');
  }

  function updateRenderedCell(rowId, columnKey, value) {
    const input = table.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"] .sheet-input`);
    if (input && !input.classList.contains('is-editing')) {
      input.value = value;
      autosizeInput(input);
    }
  }

  function headerFilterButton(column) {
    if (!FILTERABLE_KEYS.includes(column.key)) return '';
    const active = state.filters[column.key] || state.colorFilters[column.key] ? ' is-active' : '';
    return `<button type="button" class="filter-button${active}" data-filter-column="${esc(column.key)}" title="Filtro" aria-label="Filtrar ${esc(column.label)}"></button>`;
  }

  function renderTable() {
    const visibleRows = getVisibleRows();
    const styles = styleMap();
    const colgroup = [
      '<col style="width:52px;min-width:52px;max-width:52px">',
      ...state.columns.map((column) => {
        const width = clampColumnWidth(column.width || 160);
        return `<col data-column-key="${esc(column.key)}" style="width:${width}px;min-width:${width}px;max-width:${width}px">`;
      })
    ].join('');
    const head = state.columns.map((column) => (
      `<th data-column-key="${esc(column.key)}" style="width:${clampColumnWidth(column.width || 160)}px">
        <span class="column-title">${esc(column.label)}</span>${headerFilterButton(column)}
        <button type="button" class="resize-handle" data-resize-column="${esc(column.key)}" aria-label="Redimensionar ${esc(column.label)}" title="Arraste para ajustar"></button>
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
          style.color ? `color:${style.color}` : '',
          `width:${clampColumnWidth(column.width || 160)}px`,
          `min-width:${clampColumnWidth(column.width || 160)}px`,
          `max-width:${clampColumnWidth(column.width || 160)}px`
        ].filter(Boolean).join(';');
        const title = style.title ? ` title="${esc(style.title)}"` : '';
        return `<td class="${classes}" data-row-id="${esc(row.id)}" data-column-key="${esc(column.key)}" style="${styleText}"${title}>
          <textarea class="sheet-input" readonly rows="1" wrap="soft" ${isComputed ? 'tabindex="-1"' : ''}>${esc(value)}</textarea>
        </td>`;
      }).join('');
      return `<tr data-row-id="${esc(row.id)}">
        <th class="row-index" data-row-id="${esc(row.id)}">${sourceIndex}</th>
        ${cells}
      </tr>`;
    }).join('');
    table.innerHTML = `<colgroup>${colgroup}</colgroup><thead><tr><th class="corner">#</th>${head}</tr></thead><tbody>${body}</tbody>`;
    rowCountBadge.textContent = `${nonEmptyRowCount(visibleRows)} linha(s) com dados`;
    autosizeSheetInputs();
    updateSelectionClasses();
    bindCellHover();
  }

  function autosizeInput(input) {
    if (!input || !input.isConnected) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(42, input.scrollHeight)}px`;
  }

  function scheduleAutosizeInput(input) {
    if (!input || input.dataset.autosizeQueued === '1') return;
    input.dataset.autosizeQueued = '1';
    window.requestAnimationFrame(() => {
      input.dataset.autosizeQueued = '';
      autosizeInput(input);
    });
  }

  function autosizeSheetInputs() {
    table.querySelectorAll('.sheet-input').forEach(autosizeInput);
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
    ruleColumn.innerHTML = ruleColumnOptions(ruleColumn.value || 'categoria');
    ruleOperator.innerHTML = ruleOperatorOptions(ruleOperator.value || 'contains');
    rulesList.innerHTML = state.rules.length
      ? state.rules.map((rule) => {
        const columnKey = rule.column_key || rule.columnKey || 'categoria';
        const operator = rule.operator || 'contains';
        const background = rule.background || '#fff7ed';
        return `<div class="rule-row" data-rule-id="${esc(rule.id)}">
          <label>Coluna
            <select data-rule-field="columnKey">${ruleColumnOptions(columnKey)}</select>
          </label>
          <label>Operador
            <select data-rule-field="operator">${ruleOperatorOptions(operator)}</select>
          </label>
          <label>Valor
            <input data-rule-field="value" type="text" value="${esc(rule.value || '')}">
          </label>
          <label>Fundo
            <input data-rule-field="background" type="color" value="${esc(background)}">
          </label>
          <label class="rule-check">
            <input data-rule-field="showTimestamp" type="checkbox" ${(rule.show_timestamp === true || rule.showTimestamp === true) ? 'checked' : ''}>
            <span>Data/hora</span>
          </label>
          <div class="rule-actions">
            <button type="button" class="rule-save" data-rule-save="${esc(rule.id)}">Salvar</button>
            <button type="button" class="rule-delete" data-rule-delete="${esc(rule.id)}">Apagar</button>
          </div>
        </div>`;
      }).join('')
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

  function applyRemoteCellUpdate(payload) {
    const row = rowById(payload.rowId);
    if (!row) return false;
    const key = cellKey(payload.rowId, payload.columnKey);
    if (state.editing && state.editing.rowId === payload.rowId && state.editing.columnKey === payload.columnKey) {
      state.conflicts.set(key, {
        currentValue: payload.value,
        attemptedValue: state.editing.input?.value || '',
        updatedAt: payload.updatedAt
      });
      status('Conflito visual nesta celula', 'warn');
      markConflictCell(payload.rowId, payload.columnKey);
      return false;
    }
    row.values = { ...(row.values || {}), [payload.columnKey]: payload.value };
    row.version = payload.version;
    state.conflicts.delete(key);
    if (state.editing) {
      updateRenderedCell(payload.rowId, payload.columnKey, payload.value);
      return false;
    }
    return true;
  }

  function applyRemoteCellsUpdate(cells) {
    let needsRender = false;
    (cells || []).forEach((cell) => {
      if (applyRemoteCellUpdate(cell)) needsRender = true;
    });
    return needsRender;
  }

  function applyRemoteRowsAdded(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    rows.forEach((row) => {
      if (!state.rows.some((item) => item.id === row.id)) state.rows.push(row);
    });
    state.rows.sort((a, b) => Number(a.position) - Number(b.position));
    return true;
  }

  function applyRemoteRowDeleted(rowId) {
    if (!rowId) return false;
    const before = state.rows.length;
    state.rows = state.rows.filter((row) => row.id !== rowId);
    if (state.activeCell?.rowId === rowId) {
      state.activeCell = null;
      state.anchorCell = null;
      state.selectedRange = null;
    }
    return state.rows.length !== before;
  }

  function applyRemoteStyleUpdated(style) {
    if (!style?.styleKey) return false;
    state.styles = state.styles.filter((item) => item.styleKey !== style.styleKey);
    state.styles.push(style);
    return true;
  }

  function applyRemoteStyleDeleted(styleKey) {
    if (!styleKey) return false;
    const before = state.styles.length;
    state.styles = state.styles.filter((item) => item.styleKey !== styleKey);
    return state.styles.length !== before;
  }

  function applyRemoteRuleChange(payload) {
    const mode = payload.mode || '';
    const rule = Array.isArray(payload.rules) ? payload.rules[0] : payload.rule;
    if ((mode === 'created' || mode === 'updated') && rule?.id) {
      state.rules = state.rules.filter((item) => String(item.id) !== String(rule.id));
      state.rules.push(rule);
      renderRules();
      return true;
    }
    if (mode === 'deleted' && payload.id) {
      state.rules = state.rules.filter((item) => String(item.id) !== String(payload.id));
      renderRules();
      return true;
    }
    return false;
  }

  function applyDeltaEvents(events) {
    let needsRender = false;
    for (const event of events || []) {
      rememberEventId(event.id);
      if (event.clientId === clientId) continue;
      const payload = event.payload || {};
      if (event.type === 'cell_updated') {
        if (applyRemoteCellUpdate({ ...payload, eventId: event.id, clientId: event.clientId })) needsRender = true;
      } else if (event.type === 'cells_batch_updated') {
        if (applyRemoteCellsUpdate(payload.cells || [])) needsRender = true;
      } else if (event.type === 'rows_added' || event.type === 'rows_inserted') {
        if (applyRemoteRowsAdded(payload.rows || [])) needsRender = true;
      } else if (event.type === 'row_deleted') {
        if (applyRemoteRowDeleted(payload.rowId || event.rowId)) needsRender = true;
      } else if (event.type === 'style_updated') {
        if (applyRemoteStyleUpdated(payload.style)) needsRender = true;
      } else if (event.type === 'style_deleted') {
        if (applyRemoteStyleDeleted(payload.styleKey)) needsRender = true;
      } else if (event.type === 'rule_created' || event.type === 'rule_updated') {
        if (applyRemoteRuleChange({ mode: event.type === 'rule_created' ? 'created' : 'updated', rules: [payload.rule] })) needsRender = true;
      } else if (event.type === 'rule_deleted') {
        if (applyRemoteRuleChange({ mode: 'deleted', id: payload.id })) needsRender = true;
      } else if (event.type === 'backup_created' || event.type === 'google_sheets_exported') {
        continue;
      } else {
        return false;
      }
    }
    if (needsRender && !state.editing) renderTable();
    return true;
  }

  function socketConnect() {
    if (state.socket || !window.io || !state.quote?.id) return;
    const socket = window.io({ path: `${basePath}/socket.io` });
    state.socket = socket;
    socket.on('connect', () => {
      socket.emit('join', { quoteId: state.quote.id, clientId });
      updatePresence(false);
      status('Sincronizado');
      if (state.connectedOnce && !state.editing) {
        syncEvents().catch(console.error);
      }
      state.connectedOnce = true;
      if (!state.heartbeatTimer) {
        state.heartbeatTimer = window.setInterval(() => updatePresence(), 10000);
      }
      if (!state.refreshTimer) {
        state.refreshTimer = window.setInterval(() => {
          if (!state.editing && document.visibilityState === 'visible') {
            syncEvents().catch(console.error);
          }
        }, 60000);
      }
    });
    socket.on('disconnect', () => {
      status('Reconectando...', 'busy');
    });
    socket.on('connect_error', () => {
      status('Reconectando...', 'busy');
    });
    socket.on('presence:update', (presence) => {
      state.presence = Array.isArray(presence) ? presence : [];
      renderPresence();
    });
    socket.on('cell:update', (payload) => {
      rememberEventId(payload.eventId);
      if (payload.clientId === clientId) return;
      if (applyRemoteCellUpdate(payload) && !state.editing) renderTable();
    });
    socket.on('cells:update', (payload) => {
      rememberEventId(payload.eventId);
      if (payload.clientId === clientId) return;
      const needsRender = applyRemoteCellsUpdate(payload.cells || []);
      if (needsRender && !state.editing) renderTable();
    });
    socket.on('rows:added', (payload) => {
      rememberEventId(payload.eventId);
      if (applyRemoteRowsAdded(payload.rows)) {
        renderTable();
      }
    });
    socket.on('row:deleted', (payload) => {
      rememberEventId(payload.eventId);
      if (applyRemoteRowDeleted(payload.rowId)) renderTable();
    });
    socket.on('columns:changed', (payload = {}) => {
      rememberEventId(payload.eventId);
      reloadSheet();
    });
    socket.on('rules:update', (payload = {}) => {
      rememberEventId(payload.eventId);
      if (!applyRemoteRuleChange(payload)) reloadSheet();
      else renderTable();
    });
    socket.on('sheet:reload', (payload = {}) => {
      rememberEventId(payload.eventId);
      reloadSheet();
    });
    socket.on('style:update', (payload) => {
      rememberEventId(payload.eventId);
      if (payload.clientId === clientId) return;
      if (applyRemoteStyleUpdated(payload.style)) renderTable();
    });
    socket.on('style:delete', (payload) => {
      rememberEventId(payload.eventId);
      if (payload.clientId === clientId) return;
      if (applyRemoteStyleDeleted(payload.styleKey)) renderTable();
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

  async function syncEvents(options = {}) {
    const fallback = options.fallback !== false;
    if (!state.quote?.id || state.deltaInFlight) return false;
    if (!state.lastEventId) {
      if (fallback) await reloadSheet();
      return false;
    }
    state.deltaInFlight = true;
    try {
      const data = await api(`/api/events?after=${encodeURIComponent(state.lastEventId)}`);
      if (data.requiresSnapshot) {
        if (fallback) await reloadSheet();
        return true;
      }
      const applied = applyDeltaEvents(data.events || []);
      if (!applied) {
        if (fallback) await reloadSheet();
        return true;
      }
      rememberEventId(data.latestEventId);
      state.lastDeltaAt = new Date().toISOString();
      return true;
    } catch (error) {
      console.warn('[cotacao] delta sync failed', error);
      if (fallback) await reloadSheet();
      return false;
    } finally {
      state.deltaInFlight = false;
    }
  }

  function updatePresence(editing = Boolean(state.editing)) {
    if (!state.socket?.connected || !state.quote?.id) return;
    state.socket.emit('presence:update', {
      rowId: state.activeCell?.rowId || null,
      columnKey: state.activeCell?.columnKey || null,
      filter: {
        search: state.search,
        produto: state.filters.produto ? Array.from(state.filters.produto) : null,
        categoria: state.filters.categoria ? Array.from(state.filters.categoria) : null,
        ganhador: state.filters[WINNER_KEY] ? Array.from(state.filters[WINNER_KEY]) : null,
        colors: Object.fromEntries(FILTERABLE_KEYS.map((key) => [key, state.colorFilters[key] ? Array.from(state.colorFilters[key]) : null]))
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
      rememberEditedRowInFilteredView(row);
      if (options.history !== false) {
        pushHistory({ type: 'cell', rowId, columnKey, before, after });
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
        rememberEditedRowInFilteredView(row);
      });
      if (options.history !== false && data.cells?.length) {
        pushHistory({
          type: 'batch',
          changes: data.cells.map((cell) => ({
            rowId: cell.rowId,
            columnKey: cell.columnKey,
            before: cell.previousValue,
            after: cell.value
          }))
        });
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

  async function beginEdit(rowId, columnKey, initialText = null) {
    if (state.editing && (state.editing.rowId !== rowId || state.editing.columnKey !== columnKey)) {
      await commitEdit();
    } else if (state.pendingCommit) {
      await state.pendingCommit;
    }
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
    autosizeInput(input);
    input.focus();
    if (initialText === null) input.select();
    updatePresence(true);
  }

  async function commitEdit(move = null) {
    if (!state.editing) {
      if (state.pendingCommit) await state.pendingCommit;
      return;
    }
    const editing = state.editing;
    state.editing = null;
    const input = editing.input;
    const value = input?.value ?? editing.originalValue;
    if (input) {
      input.readOnly = true;
      input.classList.remove('is-editing');
      autosizeInput(input);
      input.blur();
    }
    let commitPromise = null;
    commitPromise = (async () => {
      try {
        await setCellValue(editing.rowId, editing.columnKey, value);
        if (!state.editing) {
          clearEditingVisuals();
          updatePresence(false);
          if (move) moveActive(move.row, move.col, false);
        }
      } finally {
        if (state.pendingCommit === commitPromise) state.pendingCommit = null;
      }
    })();
    state.pendingCommit = commitPromise;
    await commitPromise;
  }

  function cancelEdit() {
    if (!state.editing) return;
    const editing = state.editing;
    state.editing = null;
    if (editing.input) {
      editing.input.value = editing.originalValue;
      editing.input.readOnly = true;
      editing.input.classList.remove('is-editing');
      editing.input.blur();
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
    } else if (action.type === 'column-delete') {
      await restoreDeletedColumn(action.columnKey);
    } else if (action.type === 'filter') {
      applyFilterValue(action.columnKey, action.before, action.beforeColor);
    } else if (action.type === 'search') {
      applySearchValue(action.before);
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
    } else if (action.type === 'column-delete') {
      await deleteColumn(action.columnKey, { history: false });
    } else if (action.type === 'filter') {
      applyFilterValue(action.columnKey, action.after, action.afterColor);
    } else if (action.type === 'search') {
      applySearchValue(action.after);
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
        changes.push({
          rowId: cell.rowId,
          columnKey: cell.columnKey,
          value: normalizePastedValue(column, matrix[rowOffset][colOffset])
        });
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
    if (state.selectionScope?.type === 'column') {
      await colorColumn(state.selectionScope.columnKey, color);
      return;
    }
    if (state.selectionScope?.type === 'column-range') {
      const targets = state.columns.slice(state.selectionScope.startCol, state.selectionScope.endCol + 1);
      for (const column of targets) {
        if (column) await setStyle({ scope: 'column', columnKey: column.key }, color);
      }
      renderTable();
      return;
    }
    if (state.selectionScope?.type === 'row') {
      await colorRow(state.selectionScope.rowId, color);
      return;
    }
    if (state.selectionScope?.type === 'row-range') {
      const rows = gridRows().slice(state.selectionScope.startRow, state.selectionScope.endRow + 1);
      for (const row of rows) {
        if (row) await setStyle({ scope: 'row', rowId: row.id }, color);
      }
      renderTable();
      return;
    }
    const cells = selectedCells();
    for (const cell of cells) {
      await setStyle({ scope: 'cell', rowId: cell.rowId, columnKey: cell.columnKey }, color);
    }
    renderTable();
  }

  async function eraseSelection() {
    if (state.selectionScope?.type === 'column') {
      await eraseColumn(state.selectionScope.columnKey);
      return;
    }
    if (state.selectionScope?.type === 'column-range') {
      const targets = state.columns.slice(state.selectionScope.startCol, state.selectionScope.endCol + 1);
      for (const column of targets) {
        if (column) await deleteStyle({ scope: 'column', columnKey: column.key });
      }
      renderTable();
      return;
    }
    if (state.selectionScope?.type === 'row') {
      await eraseRow(state.selectionScope.rowId);
      return;
    }
    if (state.selectionScope?.type === 'row-range') {
      const rows = gridRows().slice(state.selectionScope.startRow, state.selectionScope.endRow + 1);
      for (const row of rows) {
        if (row) await deleteStyle({ scope: 'row', rowId: row.id });
      }
      renderTable();
      return;
    }
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

  function fillTargetRange(targetCell) {
    if (!targetCell || !state.selectedRange) return null;
    const rows = gridRows();
    const target = coordsFor(targetCell.rowId, targetCell.columnKey, rows);
    const range = state.selectedRange;
    if (target.row < 0 || target.col < 0) return null;
    if (target.row > range.endRow) {
      return {
        startRow: range.endRow + 1,
        endRow: target.row,
        startCol: range.startCol,
        endCol: range.endCol
      };
    }
    if (target.row < range.startRow) {
      return {
        startRow: target.row,
        endRow: range.startRow - 1,
        startCol: range.startCol,
        endCol: range.endCol
      };
    }
    if (target.col > range.endCol) {
      return {
        startRow: range.startRow,
        endRow: range.endRow,
        startCol: range.endCol + 1,
        endCol: target.col
      };
    }
    if (target.col < range.startCol) {
      return {
        startRow: range.startRow,
        endRow: range.endRow,
        startCol: target.col,
        endCol: range.startCol - 1
      };
    }
    return null;
  }

  function fillSourceFor(targetRowIndex, targetColIndex, sourceMatrix) {
    const sourceRowCount = sourceMatrix.length;
    const sourceColCount = sourceMatrix[0]?.length || 0;
    if (!sourceRowCount || !sourceColCount || !state.selectedRange) return null;
    const rowOffset = Math.abs(targetRowIndex - state.selectedRange.startRow) % sourceRowCount;
    const colOffset = Math.abs(targetColIndex - state.selectedRange.startCol) % sourceColCount;
    return sourceMatrix[rowOffset]?.[colOffset] || null;
  }

  async function applyFillHandle(targetCell) {
    const targetRange = fillTargetRange(targetCell);
    if (!targetRange) return;
    const rows = gridRows();
    const sourceMatrix = selectedCellMatrix(rows);
    const styles = styleMap();
    const changes = [];
    const styleTargets = [];

    for (let rowIndex = targetRange.startRow; rowIndex <= targetRange.endRow; rowIndex += 1) {
      const targetRow = rows[rowIndex];
      if (!targetRow) continue;
      for (let colIndex = targetRange.startCol; colIndex <= targetRange.endCol; colIndex += 1) {
        const targetColumn = state.columns[colIndex];
        if (!targetColumn || targetColumn.options?.computed === true) continue;
        const source = fillSourceFor(rowIndex, colIndex, sourceMatrix);
        if (!source || source.column.options?.computed === true) continue;
        changes.push({
          rowId: targetRow.id,
          columnKey: targetColumn.key,
          value: normalizePastedValue(targetColumn, valueOf(source.row, source.column))
        });
        const background = normalizeColorValue(mergedStyle(source.row, source.column, styles).background);
        if (background) {
          styleTargets.push({ rowId: targetRow.id, columnKey: targetColumn.key, background });
        }
      }
    }

    if (!changes.length && !styleTargets.length) return;
    status('Preenchendo selecao...', 'busy');
    if (changes.length) await saveCellsBatch(changes);
    for (const target of styleTargets) {
      await setStyle({ scope: 'cell', rowId: target.rowId, columnKey: target.columnKey }, target.background);
    }
    status('Sincronizado');
    renderTable();
  }

  async function restoreDeletedColumn(columnKey) {
    const data = await api(`/api/columns/${encodeURIComponent(columnKey)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ clientId })
    });
    await reloadSheet();
    return data;
  }

  async function deleteColumn(columnKey, options = {}) {
    const column = colByKey(columnKey);
    if (!isDistributorColumn(column)) return null;
    const data = await api(`/api/columns/${encodeURIComponent(columnKey)}`, {
      method: 'DELETE',
      body: JSON.stringify({ clientId })
    });
    if (options.history !== false) {
      pushHistory({ type: 'column-delete', columnKey, label: column.label });
    }
    await reloadSheet();
    return data;
  }

  async function beginColumnRename(columnKey) {
    clearHeaderSelectTimer();
    if (state.renamingColumn) {
      await state.renamingColumn.finish(true);
    }
    const column = colByKey(columnKey);
    if (!isDistributorColumn(column)) return;
    const header = table.querySelector(`th[data-column-key="${columnKey}"]`);
    const label = header?.querySelector('.column-title');
    if (!header || !label || header.querySelector('.column-title-editor')) return;
    const editor = document.createElement('input');
    editor.className = 'column-title-editor';
    editor.value = column.label;
    editor.setAttribute('aria-label', `Renomear ${column.label}`);
    label.replaceWith(editor);
    ['mousedown', 'click', 'dblclick'].forEach((name) => {
      editor.addEventListener(name, (event) => event.stopPropagation());
    });
    editor.focus();
    editor.select();

    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      const nextLabel = editor.value.trim();
      try {
        if (save && nextLabel && nextLabel !== column.label) {
          status('Renomeando...', 'busy');
          const data = await api(`/api/columns/${encodeURIComponent(columnKey)}/rename`, {
            method: 'POST',
            body: JSON.stringify({ label: nextLabel, clientId })
          });
          column.label = data.column?.label || nextLabel;
          status('Sincronizado');
        }
      } finally {
        if (state.renamingColumn?.editor === editor) {
          state.renamingColumn = null;
        }
        renderTable();
      }
    };
    state.renamingColumn = { columnKey, editor, finish };

    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true).catch(console.error);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false).catch(console.error);
      }
    });
    editor.addEventListener('blur', () => finish(true).catch(console.error));
  }

  async function commitColumnRename(save = true) {
    if (!state.renamingColumn) return;
    await state.renamingColumn.finish(save);
  }

  function applyColumnWidth(columnKey, width) {
    const nextWidth = clampColumnWidth(width);
    const column = colByKey(columnKey);
    if (column) column.width = nextWidth;
    table.querySelectorAll(`[data-column-key="${columnKey}"]`).forEach((node) => {
      node.style.width = `${nextWidth}px`;
      node.style.minWidth = `${nextWidth}px`;
      node.style.maxWidth = `${nextWidth}px`;
    });
    const col = table.querySelector(`col[data-column-key="${columnKey}"]`);
    if (col) {
      col.style.width = `${nextWidth}px`;
      col.style.minWidth = `${nextWidth}px`;
      col.style.maxWidth = `${nextWidth}px`;
    }
    autosizeSheetInputs();
    return nextWidth;
  }

  function ensureResizeFeedback() {
    if (!resizeGuide) {
      resizeGuide = document.createElement('div');
      resizeGuide.className = 'column-resize-guide';
      document.body.appendChild(resizeGuide);
    }
    if (!resizeBadge) {
      resizeBadge = document.createElement('div');
      resizeBadge.className = 'column-resize-badge';
      resizeBadge.setAttribute('role', 'status');
      resizeBadge.setAttribute('aria-live', 'polite');
      document.body.appendChild(resizeBadge);
    }
    resizeGuide.hidden = false;
    resizeBadge.hidden = false;
  }

  function hideResizeFeedback() {
    if (resizeGuide) resizeGuide.hidden = true;
    if (resizeBadge) resizeBadge.hidden = true;
  }

  function updateResizeFeedback(columnKey, width, clientX) {
    if (!state.resizing) return;
    ensureResizeFeedback();
    const nextWidth = clampColumnWidth(width);
    state.resizing.currentWidth = nextWidth;
    const delta = nextWidth - state.resizing.startWidth;
    const header = table.querySelector(`th[data-column-key="${columnKey}"]`);
    const headerRect = header?.getBoundingClientRect();
    const wrapRect = sheetWrap?.getBoundingClientRect();
    const guideX = Math.round(headerRect?.right || clientX || state.resizing.startX);
    const guideTop = Math.max(0, Math.round(wrapRect?.top || headerRect?.top || 0));
    const guideBottom = Math.min(window.innerHeight, Math.round(wrapRect?.bottom || window.innerHeight));
    resizeGuide.style.left = `${guideX}px`;
    resizeGuide.style.top = `${guideTop}px`;
    resizeGuide.style.height = `${Math.max(48, guideBottom - guideTop)}px`;
    const badgeWidth = 132;
    const badgeLeft = Math.max(8, Math.min(guideX + 10, window.innerWidth - badgeWidth - 8));
    const badgeTopBase = headerRect?.top || wrapRect?.top || 8;
    resizeBadge.style.left = `${badgeLeft}px`;
    resizeBadge.style.top = `${Math.max(8, Math.round(badgeTopBase - 38))}px`;
    resizeBadge.textContent = `${nextWidth}px (${delta >= 0 ? '+' : ''}${delta}px)`;
  }

  function startColumnResize(event, columnKey) {
    const column = colByKey(columnKey);
    if (!column) return;
    event.preventDefault();
    event.stopPropagation();
    state.resizing = {
      columnKey,
      startX: event.clientX,
      startWidth: clampColumnWidth(column.width || event.target.closest('th')?.offsetWidth || 160),
      currentWidth: clampColumnWidth(column.width || event.target.closest('th')?.offsetWidth || 160)
    };
    document.body.classList.add('is-resizing-column');
    updateResizeFeedback(columnKey, state.resizing.currentWidth, event.clientX);
  }

  async function saveColumnWidth(columnKey, width) {
    await api(`/api/columns/${encodeURIComponent(columnKey)}/width`, {
      method: 'POST',
      body: JSON.stringify({ width: clampColumnWidth(width), clientId })
    });
  }

  function positionFloatingMenu(menu, x, y) {
    menu.hidden = false;
    const left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function openPalette(source) {
    if (!paintPalette) return;
    contextMenu.hidden = true;
    filterMenu.hidden = true;
    const rect = source?.getBoundingClientRect?.();
    const x = rect ? rect.left : Number(source?.x || 8);
    const y = rect ? rect.bottom + 8 : Number(source?.y || 8);
    positionFloatingMenu(paintPalette, x, y);
  }

  function openContextMenu(event, rowId, columnKey) {
    event.preventDefault();
    const column = colByKey(columnKey);
    state.context = { rowId, columnKey };
    if (paintPalette) paintPalette.hidden = true;
    if (rowId && columnKey && !selectionContains(rowId, columnKey)) setSelection(rowId, columnKey);
    contextMenu.querySelectorAll('[data-action^="column"]').forEach((button) => {
      button.disabled = !isDistributorColumn(column);
    });
    positionFloatingMenu(contextMenu, event.clientX, event.clientY);
  }

  function closeMenus() {
    contextMenu.hidden = true;
    filterMenu.hidden = true;
  }

  function clearPaintMode() {
    state.paintColor = null;
    state.eraser = false;
    if (eraserButton) eraserButton.classList.remove('is-active');
    document.querySelectorAll('.paint-swatch').forEach((item) => item.classList.remove('is-active'));
  }

  function clearHeaderSelectTimer() {
    if (!state.headerSelectTimer) return;
    window.clearTimeout(state.headerSelectTimer);
    state.headerSelectTimer = null;
  }

  function scheduleColumnSelection(columnKey) {
    clearHeaderSelectTimer();
    if (state.editing) commitEdit().catch(console.error);
    selectColumn(columnKey);
  }

  async function handleContextAction(action) {
    const context = state.context || {};
    const rowId = context.rowId || state.activeCell?.rowId;
    const columnKey = context.columnKey || state.activeCell?.columnKey;
    const column = colByKey(columnKey);
    closeMenus();
    if (action === 'row-above') return addRows(rowId, 'above', 1);
    if (action === 'row-below') return addRows(rowId, 'below', 1);
    if (!isDistributorColumn(column)) return null;
    if (action === 'column-before' || action === 'column-after') {
      const data = await api('/api/columns', {
        method: 'POST',
        body: JSON.stringify({ anchorKey: columnKey, placement: action === 'column-before' ? 'before' : 'after', clientId })
      });
      await reloadSheet();
      if (data.column?.key) await beginColumnRename(data.column.key);
      return null;
    }
    if (action === 'column-delete') {
      if (!confirm(`Apagar a distribuidora "${column.label}"?`)) return null;
      return deleteColumn(columnKey);
    }
    return null;
  }

  function openFilter(columnKey, anchor) {
    const options = filterOptions(columnKey);
    const values = options.map((option) => option.value);
    const current = state.filters[columnKey] || new Set(values);
    const colorOptions = colorFilterOptions(columnKey);
    const colorValues = colorOptions.map((option) => option.value);
    const currentColors = state.colorFilters[columnKey] || new Set(colorValues);
    filterMenu.innerHTML = `
      <strong>Filtro: ${esc(colByKey(columnKey)?.label || columnKey)}</strong>
      <span class="filter-section-title">Valores</span>
      <div class="filter-actions">
        <button type="button" data-filter-select="value-all">Selecionar tudo</button>
        <button type="button" data-filter-select="value-none">Selecionar nada</button>
      </div>
      <div class="filter-options">
        ${options.map((option) => {
          const label = option.value || '(vazio)';
          const text = columnKey === WINNER_KEY ? `${label} (${option.count})` : label;
          return `<label><input type="checkbox" data-filter-kind="value" value="${esc(option.value)}" ${current.has(option.value) ? 'checked' : ''}> ${esc(text)}</label>`;
        }).join('')}
      </div>
      <span class="filter-section-title">Cor</span>
      <div class="filter-actions">
        <button type="button" data-filter-select="color-all">Selecionar tudo</button>
        <button type="button" data-filter-select="color-none">Selecionar nada</button>
      </div>
      <div class="filter-options filter-color-options">
        ${colorOptions.map((option) => {
          const noColor = option.value === '__none__';
          const label = noColor ? `Sem cor (${option.count})` : `${option.value.toUpperCase()} (${option.count})`;
          const swatch = noColor
            ? '<span class="filter-color-swatch is-empty"></span>'
            : `<span class="filter-color-swatch" style="--filter-color:${esc(option.value)}"></span>`;
          return `<label><input type="checkbox" data-filter-kind="color" value="${esc(option.value)}" ${currentColors.has(option.value) ? 'checked' : ''}> ${swatch}<span>${esc(label)}</span></label>`;
        }).join('')}
      </div>
      <div class="filter-actions">
        <button type="button" data-filter-apply="${esc(columnKey)}">Aplicar</button>
        <button type="button" data-filter-clear="${esc(columnKey)}">Limpar</button>
      </div>`;
    const rect = anchor.getBoundingClientRect();
    filterMenu.hidden = false;
    const width = filterMenu.offsetWidth;
    const height = filterMenu.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8));
    filterMenu.style.left = `${left}px`;
    filterMenu.style.top = `${top}px`;
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
      if (event.target.closest('.column-title-editor')) return;
      if (state.renamingColumn) {
        await commitColumnRename(true);
      }
      const fillHandle = event.target.closest('.fill-handle');
      if (fillHandle && event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        if (state.editing) await commitEdit();
        state.fillDragging = true;
        clearFillPreview();
        document.body.classList.add('is-fill-dragging');
        return;
      }
      const filterButton = event.target.closest('.filter-button');
      if (filterButton) {
        event.preventDefault();
        openFilter(filterButton.dataset.filterColumn, filterButton);
        return;
      }
      const resizeHandle = event.target.closest('.resize-handle');
      if (resizeHandle) {
        startColumnResize(event, resizeHandle.dataset.resizeColumn);
        return;
      }
      const header = event.target.closest('th[data-column-key]');
      if (header && event.button === 0 && !(state.paintColor || state.eraser)) {
        event.preventDefault();
        state.headerDragging = { type: 'column', anchorKey: header.dataset.columnKey };
        scheduleColumnSelection(header.dataset.columnKey);
        return;
      }
      if (header && (state.paintColor || state.eraser)) {
        event.preventDefault();
        const columnKey = header.dataset.columnKey;
        const erase = state.eraser;
        const color = state.paintColor;
        clearPaintMode();
        if (erase) await eraseColumn(columnKey);
        else await colorColumn(columnKey, color);
        return;
      }
      const rowHeader = event.target.closest('.row-index');
      if (rowHeader && event.button === 0 && !(state.paintColor || state.eraser)) {
        event.preventDefault();
        if (state.editing) commitEdit().catch(console.error);
        state.headerDragging = { type: 'row', anchorRowId: rowHeader.dataset.rowId };
        selectRow(rowHeader.dataset.rowId);
        return;
      }
      if (rowHeader && (state.paintColor || state.eraser)) {
        event.preventDefault();
        const rowId = rowHeader.dataset.rowId;
        const erase = state.eraser;
        const color = state.paintColor;
        clearPaintMode();
        if (erase) await eraseRow(rowId);
        else await colorRow(rowId, color);
        return;
      }
      const cell = event.target.closest('td.sheet-cell');
      if (!cell || event.button !== 0) return;
      event.preventDefault();
      if (state.paintColor || state.eraser) {
        setSelection(cell.dataset.rowId, cell.dataset.columnKey, event.shiftKey);
        const erase = state.eraser;
        const color = state.paintColor;
        clearPaintMode();
        if (erase) await eraseSelection();
        else await applyColorToSelection(color);
        return;
      }
      if (state.editing) commitEdit().catch(console.error);
      state.dragging = true;
      setSelection(cell.dataset.rowId, cell.dataset.columnKey, event.shiftKey);
    });

    table.addEventListener('mouseover', (event) => {
      if (!state.headerDragging) return;
      const header = event.target.closest('th[data-column-key]');
      if (state.headerDragging.type === 'column' && header) {
        selectColumnRange(state.headerDragging.anchorKey, header.dataset.columnKey);
        return;
      }
      const rowHeader = event.target.closest('.row-index');
      if (state.headerDragging.type === 'row' && rowHeader) {
        selectRowRange(state.headerDragging.anchorRowId, rowHeader.dataset.rowId);
      }
    });

    table.addEventListener('dblclick', (event) => {
      const header = event.target.closest('th[data-column-key]');
      if (header) {
        event.preventDefault();
        event.stopPropagation();
        clearHeaderSelectTimer();
        beginColumnRename(header.dataset.columnKey).catch(console.error);
        return;
      }
      const cell = event.target.closest('td.sheet-cell');
      if (cell) beginEdit(cell.dataset.rowId, cell.dataset.columnKey).catch(console.error);
    });

    table.addEventListener('input', (event) => {
      if (event.target.classList?.contains('sheet-input')) scheduleAutosizeInput(event.target);
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

    document.addEventListener('mousemove', (event) => {
      if (state.fillDragging) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('td.sheet-cell');
        updateFillPreview(target ? { rowId: target.dataset.rowId, columnKey: target.dataset.columnKey } : null);
        return;
      }
      if (!state.resizing) return;
      const width = state.resizing.startWidth + event.clientX - state.resizing.startX;
      const nextWidth = applyColumnWidth(state.resizing.columnKey, width);
      updateResizeFeedback(state.resizing.columnKey, nextWidth, event.clientX);
    });

    document.addEventListener('mouseup', (event) => {
      if (state.resizing) {
        const { columnKey, currentWidth } = state.resizing;
        const width = currentWidth || colByKey(columnKey)?.width || 160;
        state.resizing = null;
        document.body.classList.remove('is-resizing-column');
        hideResizeFeedback();
        saveColumnWidth(columnKey, width).catch(console.error);
      }
      if (state.fillDragging) {
        state.fillDragging = null;
        document.body.classList.remove('is-fill-dragging');
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('td.sheet-cell');
        const targetCell = target
          ? { rowId: target.dataset.rowId, columnKey: target.dataset.columnKey }
          : state.fillPreviewCell;
        clearFillPreview();
        if (targetCell) applyFillHandle(targetCell).catch(console.error);
      }
      state.dragging = false;
      state.headerDragging = null;
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
      } else if (event.key === 'Enter') {
        event.preventDefault();
        moveActive(event.shiftKey ? -1 : 1, 0, false);
      } else if (event.key === 'F2') {
        event.preventDefault();
        beginEdit(state.activeCell.rowId, state.activeCell.columnKey).catch(console.error);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        deleteSelectedValues().catch(console.error);
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        beginEdit(state.activeCell.rowId, state.activeCell.columnKey, event.key).catch(console.error);
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

    document.addEventListener('copy', (event) => {
      if (isTextEntryTarget(event.target) || state.editing || !state.activeCell) return;
      const text = selectedMatrixTsv();
      if (!text) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', text);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (state.socket && !state.socket.connected) state.socket.connect();
        updatePresence();
        if (!state.editing) syncEvents().catch(console.error);
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#contextMenu') && !event.target.closest('.filter-button') && !event.target.closest('#filterMenu') && !event.target.closest('#paintPalette') && !event.target.closest('.paint-tools')) {
        closeMenus();
        if (paintPalette) paintPalette.hidden = true;
      }
    });

    contextMenu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'open-palette') {
        const rect = contextMenu.getBoundingClientRect();
        openPalette({ x: rect.right + 8, y: rect.top });
        return;
      }
      if (button.dataset.action === 'erase-color') {
        contextMenu.hidden = true;
        eraseSelection().catch(console.error);
        return;
      }
      handleContextAction(button.dataset.action).catch(console.error);
    });

    filterMenu.addEventListener('click', (event) => {
      const select = event.target.closest('[data-filter-select]');
      if (select) {
        const [kind, stateName] = String(select.dataset.filterSelect || '').split('-');
        const checked = stateName === 'all';
        filterMenu.querySelectorAll(`input[data-filter-kind="${kind}"]`).forEach((input) => {
          input.checked = checked;
        });
        return;
      }
      const apply = event.target.closest('[data-filter-apply]');
      if (apply) {
        const values = Array.from(filterMenu.querySelectorAll('input[data-filter-kind="value"]:checked')).map((input) => input.value);
        const colorValues = Array.from(filterMenu.querySelectorAll('input[data-filter-kind="color"]:checked')).map((input) => input.value);
        const columnKey = apply.dataset.filterApply;
        const before = cloneFilter(state.filters[columnKey]);
        const beforeColor = cloneFilter(state.colorFilters[columnKey]);
        state.filters[columnKey] = new Set(values);
        state.colorFilters[columnKey] = new Set(colorValues);
        filterMenu.hidden = true;
        clearPinnedRows();
        pushHistory({
          type: 'filter',
          columnKey,
          before,
          after: cloneFilter(state.filters[columnKey]),
          beforeColor,
          afterColor: cloneFilter(state.colorFilters[columnKey])
        });
        renderTable();
        updatePresence(false);
        return;
      }
      const clear = event.target.closest('[data-filter-clear]');
      if (clear) {
        const columnKey = clear.dataset.filterClear;
        const before = cloneFilter(state.filters[columnKey]);
        const beforeColor = cloneFilter(state.colorFilters[columnKey]);
        state.filters[columnKey] = null;
        state.colorFilters[columnKey] = null;
        filterMenu.hidden = true;
        clearPinnedRows();
        pushHistory({ type: 'filter', columnKey, before, after: null, beforeColor, afterColor: null });
        renderTable();
        updatePresence(false);
      }
    });

    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        state.searchBeforeFocus = state.search;
      });

      searchInput.addEventListener('input', () => {
        state.search = searchInput.value;
        clearPinnedRows();
        renderTable();
        updatePresence(false);
      });

      searchInput.addEventListener('change', () => {
        if (state.searchBeforeFocus !== state.search) {
          pushHistory({ type: 'search', before: state.searchBeforeFocus, after: state.search });
          state.searchBeforeFocus = state.search;
        }
      });

      searchInput.addEventListener('blur', () => {
        if (state.searchBeforeFocus !== state.search) {
          pushHistory({ type: 'search', before: state.searchBeforeFocus, after: state.search });
          state.searchBeforeFocus = state.search;
        }
      });
    }

    paletteToggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (paintPalette.hidden) openPalette(paletteToggleButton);
      else paintPalette.hidden = true;
    });

    addRowsFooterButton.addEventListener('click', async () => {
      await appendRows(20);
      status('Sincronizado');
      sheetWrap.scrollTo({ top: sheetWrap.scrollHeight, behavior: 'smooth' });
    });

    document.querySelectorAll('.paint-swatch').forEach((button) => {
      button.addEventListener('click', () => {
        state.paintColor = button.dataset.color;
        state.eraser = false;
        if (eraserButton) eraserButton.classList.remove('is-active');
        document.querySelectorAll('.paint-swatch').forEach((item) => item.classList.toggle('is-active', item === button));
        if (selectedCells().length) {
          const color = state.paintColor;
          clearPaintMode();
          applyColorToSelection(color)
            .then(() => {
              paintPalette.hidden = true;
            })
            .catch(console.error);
        } else {
          clearPaintMode();
        }
      });
    });

    if (eraserButton) {
      eraserButton.addEventListener('click', () => {
        state.eraser = true;
        state.paintColor = null;
        eraserButton.classList.add('is-active');
        document.querySelectorAll('.paint-swatch').forEach((item) => item.classList.remove('is-active'));
        if (selectedCells().length) {
          clearPaintMode();
          eraseSelection()
            .catch(console.error);
        }
      });
    }

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
          showTimestamp: ruleTimestamp?.checked === true,
          color: '#111827',
          clientId
        })
      });
      state.rules.push(data.rule);
      ruleValue.value = '';
      if (ruleTimestamp) ruleTimestamp.checked = false;
      renderRules();
      renderTable();
    });
    rulesList.addEventListener('click', async (event) => {
      const saveButton = event.target.closest('[data-rule-save]');
      if (saveButton) {
        const row = saveButton.closest('.rule-row');
        const data = await api(`/api/rules/${encodeURIComponent(saveButton.dataset.ruleSave)}`, {
          method: 'PATCH',
          body: JSON.stringify(readRuleRow(row))
        });
        state.rules = state.rules.map((rule) => (String(rule.id) === String(data.rule.id) ? data.rule : rule));
        renderRules();
        renderTable();
        return;
      }
      const deleteButton = event.target.closest('[data-rule-delete]');
      if (!deleteButton) return;
      await api(`/api/rules/${encodeURIComponent(deleteButton.dataset.ruleDelete)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      state.rules = state.rules.filter((rule) => String(rule.id) !== String(deleteButton.dataset.ruleDelete));
      renderRules();
      renderTable();
    });

    if (diagnosticsButton) {
      diagnosticsButton.addEventListener('click', async () => {
        diagnosticsDialog.showModal();
        await loadDiagnostics();
      });
    }
    if (refreshDiagnosticsButton) refreshDiagnosticsButton.addEventListener('click', () => loadDiagnostics().catch(console.error));
    if (googleExportButton) {
      googleExportButton.addEventListener('click', async () => {
        const data = await api('/api/google-sheets/export', { method: 'POST', body: JSON.stringify({ clientId }) });
        diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
      });
    }
    if (googleImportButton) {
      googleImportButton.addEventListener('click', async () => {
        if (!confirm('Importar do Google Sheets vai substituir as linhas atuais da Cotacao V2. Continuar?')) return;
        const data = await api('/api/google-sheets/import', { method: 'POST', body: JSON.stringify({ clientId }) });
        diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
        await reloadSheet();
      });
    }
    if (createBackupButton) {
      createBackupButton.addEventListener('click', async () => {
        const data = await api('/api/backups', { method: 'POST', body: JSON.stringify({ clientId }) });
        diagnosticsOutput.textContent = JSON.stringify(data, null, 2);
        await loadDiagnostics();
      });
    }
    if (restoreBackupButton) {
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
  }

  updateUndoButtons();
  bindEvents();
  bootstrap().catch((error) => {
    console.error(error);
    status(error.message || 'Erro ao carregar', 'error');
  });
})();
