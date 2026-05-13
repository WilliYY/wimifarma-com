(() => {
  const config = window.COTACAO_CONFIG || {};
  const basePath = config.basePath || '/cotacao';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const table = document.querySelector('#sheetTable');
  const saveStatus = document.querySelector('#saveStatus');
  const searchInput = document.querySelector('#searchInput');
  const categoryFilter = document.querySelector('#categoryFilter');
  const winnerFilter = document.querySelector('#winnerFilter');
  const presenceCount = document.querySelector('#presenceCount');
  const presenceList = document.querySelector('#presenceList');
  const rowCountBadge = document.querySelector('#rowCountBadge');
  const viewTitle = document.querySelector('#viewTitle');
  const exportCsvButton = document.querySelector('#exportCsvButton');
  const viewTabs = [...document.querySelectorAll('.view-tab[data-view-category]')];
  const importDialog = document.querySelector('#importDialog');
  const importText = document.querySelector('#importText');
  const rulesDialog = document.querySelector('#rulesDialog');
  const rulesList = document.querySelector('#rulesList');
  const ruleColumn = document.querySelector('#ruleColumn');
  const ruleOperator = document.querySelector('#ruleOperator');
  const ruleValue = document.querySelector('#ruleValue');
  const ruleBg = document.querySelector('#ruleBg');
  const ruleColor = document.querySelector('#ruleColor');
  const contextMenu = document.querySelector('#contextMenu');
  const paintSwatches = [...document.querySelectorAll('.paint-swatch')];

  const state = {
    quote: null,
    columns: [],
    rows: [],
    rules: [],
    styles: [],
    presence: [],
    editing: null,
    activeViewCategory: '',
    paintColor: '',
    context: null,
    saveTimers: new Map()
  };

  const clientId = getClientId();
  const socket = window.io({ path: `${basePath}/socket.io` });

  function getClientId() {
    const key = 'wimifarma-cotacao-client-id';
    const current = localStorage.getItem(key);
    if (current) return current;
    const created = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    localStorage.setItem(key, created);
    return created;
  }

  function setStatus(text, type = '') {
    saveStatus.textContent = text;
    saveStatus.classList.toggle('is-saving', type === 'saving');
    saveStatus.classList.toggle('is-error', type === 'error');
  }

  async function api(path, options = {}) {
    const response = await fetch(`${basePath}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Falha na cotacao.');
    }
    return data;
  }

  async function bootstrap() {
    setStatus('Carregando...', 'saving');
    const data = await api('/api/bootstrap', { method: 'GET', headers: {} });
    applyBootstrap(data);
    render();
    socket.emit('join', { quoteId: state.quote.id, clientId });
    setStatus('Sincronizado');
  }

  async function reloadSheet() {
    const data = await api('/api/bootstrap', { method: 'GET', headers: {} });
    applyBootstrap(data);
    render();
  }

  function applyBootstrap(data) {
    state.quote = data.quote;
    state.columns = data.columns || [];
    state.rows = data.rows || [];
    state.rules = data.rules || [];
    state.styles = data.styles || [];
    state.presence = data.presence || [];
  }

  function render() {
    renderRuleColumnOptions();
    renderCategoryFilter();
    renderWinnerFilter();
    renderStats();
    renderPresence();
    renderTable();
    renderRules();
  }

  function renderTable() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createHeaderCell({ label: '#', width: 58, key: 'row_index', locked: true }));
    state.columns.forEach((column) => {
      headerRow.appendChild(createHeaderCell(column));
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    state.rows.forEach((row, index) => {
      const winner = computeWinner(row);
      const tr = document.createElement('tr');
      tr.dataset.rowId = row.id;
      tr.classList.toggle('is-filtered', !rowMatchesFilters(row));

      const number = document.createElement('td');
      number.className = 'row-index';
      number.textContent = String(index + 1);
      number.dataset.rowId = row.id;
      number.addEventListener('contextmenu', (event) => openContextMenu(event, { rowId: row.id }));
      number.addEventListener('click', () => {
        if (state.paintColor) paintStyle('row', { rowId: row.id });
      });
      tr.appendChild(number);

      state.columns.forEach((column) => {
        const td = document.createElement('td');
        td.className = columnClass(column);
        td.style.width = `${column.width}px`;
        td.style.minWidth = `${column.width}px`;
        td.dataset.rowId = row.id;
        td.dataset.columnKey = column.key;
        td.classList.toggle('is-winning-price', winner.keys.includes(column.key));
        td.addEventListener('contextmenu', (event) => openContextMenu(event, { rowId: row.id, columnKey: column.key }));
        td.addEventListener('click', (event) => {
          if (!state.paintColor || event.target.closest('input')) return;
          paintStyle('cell', { rowId: row.id, columnKey: column.key });
        });

        const input = document.createElement('input');
        input.className = 'sheet-input';
        input.value = cellValue(row, column, winner);
        input.dataset.rowId = row.id;
        input.dataset.columnKey = column.key;
        input.placeholder = columnPlaceholder(column);
        input.autocomplete = 'off';
        input.spellcheck = false;

        if (isComputedColumn(column)) {
          input.readOnly = true;
          input.tabIndex = -1;
          input.classList.add('is-readonly');
        } else {
          input.addEventListener('focus', () => {
            state.editing = `${row.id}:${column.key}`;
            emitPresence(row.id, column.key, true);
          });
          input.addEventListener('blur', () => {
            state.editing = null;
            emitPresence(row.id, column.key, false);
            saveCell(input);
          });
          input.addEventListener('input', () => scheduleSave(input));
        }
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      applyRowVisuals(tr, row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    markRemoteCells();
  }

  function createHeaderCell(column) {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.className = columnClass(column);
    th.style.width = `${column.width}px`;
    th.style.minWidth = `${column.width}px`;
    th.dataset.columnKey = column.key;
    if (isDistributorColumn(column)) {
      th.title = 'Botao direito para adicionar ou apagar distribuidora. Escolha uma cor e clique para pintar.';
    }
    th.addEventListener('contextmenu', (event) => openContextMenu(event, { columnKey: column.key }));
    th.addEventListener('click', () => {
      if (state.paintColor && isDistributorColumn(column)) {
        paintStyle('column', { columnKey: column.key });
      }
    });
    applyElementStyle(th, styleFor('column', null, column.key));
    return th;
  }

  function columnClass(column) {
    const key = column.key || '';
    if (key === 'row_index') return 'col-index';
    if (key === 'quem_ganhou') return 'col-winner';
    if (isDistributorColumn(column)) return `col-supplier col-${key.replaceAll('_', '-')}`;
    return `col-${key.replaceAll('_', '-')}`;
  }

  function isDistributorColumn(column) {
    const key = column?.key || '';
    return column
      && column.locked !== true
      && (column.options?.kind === 'distributor' || key.startsWith('fornecedor_') || key.startsWith('distribuidora_'));
  }

  function isComputedColumn(column) {
    return column?.options?.computed === true || column?.key === 'quem_ganhou';
  }

  function distributorColumns() {
    return state.columns.filter(isDistributorColumn);
  }

  function columnPlaceholder(column) {
    if (isComputedColumn(column)) return computeWinnerLabelFallback();
    return column.options?.fallback || '';
  }

  function computeWinnerLabelFallback() {
    return 'Sem vencedor';
  }

  function cellValue(row, column, winner = computeWinner(row)) {
    if (isComputedColumn(column)) return winner.label;
    return row.values?.[column.key] ?? '';
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
      if (price === best) {
        winners.push(column);
      }
    });
    if (!winners.length) {
      return { label: 'Sem vencedor', keys: [], price: null };
    }
    if (winners.length > 1) {
      return {
        label: `Empate: ${winners.map((column) => column.label).join(', ')}`,
        keys: winners.map((column) => column.key),
        price: best
      };
    }
    return { label: winners[0].label, keys: [winners[0].key], price: best };
  }

  function parsePrice(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d,.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null;
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function rowMatchesFilters(row) {
    const search = searchInput.value.trim().toLowerCase();
    const category = (state.activeViewCategory || categoryFilter.value).trim().toLowerCase();
    const winner = winnerFilter.value.trim().toLowerCase();
    const values = row.values || {};
    if (state.editing && state.editing.startsWith(`${row.id}:`)) {
      return true;
    }
    if (category && String(values.categoria || '').trim().toLowerCase() !== category) {
      return false;
    }
    if (winner && computeWinner(row).label.trim().toLowerCase() !== winner) {
      return false;
    }
    if (!search) {
      return true;
    }
    return state.columns.some((column) => String(cellValue(row, column)).toLowerCase().includes(search));
  }

  function renderCategoryFilter() {
    const current = categoryFilter.value;
    const categories = [...new Set(state.rows
      .map((row) => String(row.values?.categoria || '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    categoryFilter.innerHTML = '<option value="">Todas</option>';
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categoryFilter.appendChild(option);
    });
    categoryFilter.value = categories.includes(current) ? current : '';
  }

  function renderWinnerFilter() {
    const current = winnerFilter.value;
    const winners = [...new Set(state.rows.map((row) => computeWinner(row).label).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    winnerFilter.innerHTML = '<option value="">Todos</option>';
    winners.forEach((winner) => {
      const option = document.createElement('option');
      option.value = winner;
      option.textContent = winner;
      winnerFilter.appendChild(option);
    });
    winnerFilter.value = winners.includes(current) ? current : '';
  }

  function renderStats() {
    const withData = state.rows.filter((row) => {
      const values = row.values || {};
      return state.columns
        .filter((column) => !isComputedColumn(column))
        .some((column) => String(values[column.key] || '').trim() !== '');
    }).length;
    rowCountBadge.textContent = `${withData} linha(s) com dados`;
    viewTitle.textContent = state.activeViewCategory || 'Cotacao Geral';
    viewTabs.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.viewCategory === state.activeViewCategory);
    });
  }

  function scheduleSave(input) {
    if (input.readOnly) return;
    const key = `${input.dataset.rowId}:${input.dataset.columnKey}`;
    clearTimeout(state.saveTimers.get(key));
    state.saveTimers.set(key, setTimeout(() => saveCell(input), 360));
    setStatus('Salvando...', 'saving');
  }

  async function saveCell(input) {
    if (input.readOnly) return;
    const rowId = input.dataset.rowId;
    const columnKey = input.dataset.columnKey;
    const row = state.rows.find((item) => item.id === rowId);
    if (!row) return;
    const nextValue = input.value;
    const currentValue = row.values?.[columnKey] ?? '';
    if (String(currentValue) === String(nextValue)) {
      setStatus('Sincronizado');
      return;
    }
    try {
      const data = await api('/api/cells', {
        method: 'PATCH',
        body: JSON.stringify({ rowId, columnKey, value: nextValue, clientId })
      });
      row.values = { ...(row.values || {}), [columnKey]: nextValue };
      row.version = data.version;
      row.updatedAt = data.updatedAt;
      if (columnKey === 'categoria') {
        renderCategoryFilter();
      }
      if (isDistributorColumn(state.columns.find((column) => column.key === columnKey))) {
        renderWinnerFilter();
      }
      renderStats();
      applyRowUpdate(rowId);
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function applyRowUpdate(rowId) {
    const row = state.rows.find((item) => item.id === rowId);
    const tr = table.querySelector(`tr[data-row-id="${cssEscape(rowId)}"]`);
    if (!row || !tr) return;
    tr.classList.toggle('is-filtered', !rowMatchesFilters(row));
    state.columns.forEach((column) => {
      if (!isComputedColumn(column)) return;
      const input = tr.querySelector(`input[data-column-key="${cssEscape(column.key)}"]`);
      if (input) input.value = cellValue(row, column);
    });
    applyRowVisuals(tr, row);
  }

  function applyRowVisuals(tr, row) {
    const rule = matchingRule(row);
    const winner = computeWinner(row);
    const rowStyle = styleFor('row', row.id);
    const indexCell = tr.querySelector('.row-index');
    resetElementStyle(indexCell);
    applyElementStyle(indexCell, rowStyle);

    tr.querySelectorAll('td[data-column-key]').forEach((td) => {
      const columnKey = td.dataset.columnKey;
      td.classList.toggle('is-winning-price', winner.keys.includes(columnKey));
      resetElementStyle(td);
      if (rule) {
        applyElementStyle(td, { background: rule.background, color: rule.color });
      }
      applyElementStyle(td, styleFor('column', null, columnKey));
      applyElementStyle(td, rowStyle);
      applyElementStyle(td, styleFor('cell', row.id, columnKey));
    });
  }

  function matchingRule(row) {
    return state.rules
      .filter((item) => item.enabled !== false)
      .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100))
      .find((item) => matchesRule(row.values?.[item.column_key], item));
  }

  function matchesRule(value, rule) {
    const text = String(value || '').trim().toLowerCase();
    const wanted = String(rule.value || '').trim().toLowerCase();
    if (!wanted) return false;
    if (rule.operator === 'equals') return text === wanted;
    if (rule.operator === 'starts') return text.startsWith(wanted);
    return text.includes(wanted);
  }

  function styleFor(scope, rowId = null, columnKey = null) {
    const key = `${scope}:${rowId || ''}:${columnKey || ''}`;
    return state.styles.find((style) => style.styleKey === key);
  }

  function resetElementStyle(element) {
    if (!element) return;
    element.style.removeProperty('background');
    element.style.removeProperty('color');
  }

  function applyElementStyle(element, style) {
    if (!element || !style) return;
    if (style.background) element.style.setProperty('background', style.background, 'important');
    if (style.color) element.style.setProperty('color', style.color, 'important');
  }

  function upsertStyle(style) {
    const index = state.styles.findIndex((item) => item.styleKey === style.styleKey);
    if (index === -1) {
      state.styles.push(style);
    } else {
      state.styles[index] = style;
    }
  }

  async function paintStyle(scope, { rowId = null, columnKey = null }) {
    if (!state.paintColor) return;
    try {
      const data = await api('/api/styles', {
        method: 'PUT',
        body: JSON.stringify({
          scope,
          rowId,
          columnKey,
          background: state.paintColor,
          color: '',
          clientId
        })
      });
      upsertStyle(data.style);
      renderTable();
      setStatus('Cor aplicada');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function renderPresence() {
    const unique = new Map();
    state.presence.forEach((item) => unique.set(item.clientId, item));
    const total = Math.max(1, unique.size);
    presenceCount.textContent = `${total} ${total === 1 ? 'pessoa usando' : 'pessoas usando'}`;
    presenceList.innerHTML = '';
    unique.forEach((item) => {
      const pill = document.createElement('span');
      pill.className = 'presence-pill';
      const animal = animalNameFor(item.clientId || item.username);
      pill.textContent = item.clientId === clientId ? `${animal} (voce)` : animal;
      pill.title = item.username || '';
      presenceList.appendChild(pill);
    });
    markRemoteCells();
  }

  function animalNameFor(seed) {
    const adjectives = ['Azul', 'Verde', 'Dourado', 'Veloz', 'Calmo', 'Esperto', 'Rosa', 'Prata'];
    const animals = ['Capivara', 'Tucano', 'Onca', 'Arara', 'Lobo', 'Panda', 'Raposa', 'Tamandua', 'Gato', 'Coruja'];
    const hash = hashText(String(seed || 'anonimo'));
    return `${animals[hash % animals.length]} ${adjectives[Math.floor(hash / animals.length) % adjectives.length]}`;
  }

  function hashText(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
  }

  function markRemoteCells() {
    table.querySelectorAll('.cell-remote').forEach((cell) => {
      cell.classList.remove('cell-remote');
      delete cell.dataset.remoteUser;
    });
    state.presence
      .filter((item) => item.clientId !== clientId && item.rowId && item.columnKey)
      .forEach((item) => {
        const cell = table.querySelector(`td[data-row-id="${cssEscape(item.rowId)}"][data-column-key="${cssEscape(item.columnKey)}"]`);
        if (cell) {
          cell.classList.add('cell-remote');
          cell.dataset.remoteUser = animalNameFor(item.clientId || item.username);
        }
      });
  }

  function emitPresence(rowId = null, columnKey = null, editing = false) {
    if (!state.quote) return;
    socket.emit('presence:update', {
      rowId,
      columnKey,
      editing,
      filter: {
        search: searchInput.value,
        category: categoryFilter.value,
        winner: winnerFilter.value
      }
    });
  }

  async function addRows(count = 20, rows = []) {
    try {
      setStatus('Adicionando linhas...', 'saving');
      const data = await api('/api/rows', {
        method: 'POST',
        body: JSON.stringify({ count, rows, clientId })
      });
      mergeRows(data.rows);
      renderCategoryFilter();
      renderWinnerFilter();
      renderStats();
      renderTable();
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function insertRows(anchorRowId, placement) {
    if (!anchorRowId) return;
    try {
      setStatus('Inserindo linha...', 'saving');
      const data = await api('/api/rows/insert', {
        method: 'POST',
        body: JSON.stringify({ anchorRowId, placement, count: 1, clientId })
      });
      mergeRows(data.rows);
      renderStats();
      renderTable();
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function deleteRow(rowId) {
    if (!rowId || !confirm('Apagar esta linha?')) return;
    try {
      setStatus('Apagando linha...', 'saving');
      await api(`/api/rows/${encodeURIComponent(rowId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      state.rows = state.rows.filter((row) => row.id !== rowId);
      renderCategoryFilter();
      renderWinnerFilter();
      renderStats();
      renderTable();
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function addDistributorColumn(anchorKey, placement) {
    const suggested = `Distribuidora ${distributorColumns().length + 1}`;
    const label = prompt('Nome da distribuidora', suggested);
    if (label === null) return;
    try {
      setStatus('Criando distribuidora...', 'saving');
      await api('/api/columns', {
        method: 'POST',
        body: JSON.stringify({ anchorKey, placement, label, clientId })
      });
      await reloadSheet();
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function deleteDistributorColumn(columnKey) {
    const column = state.columns.find((item) => item.key === columnKey);
    if (!isDistributorColumn(column) || !confirm(`Apagar a distribuidora "${column.label}" da tela?`)) return;
    try {
      setStatus('Apagando distribuidora...', 'saving');
      await api(`/api/columns/${encodeURIComponent(columnKey)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      await reloadSheet();
      setStatus('Sincronizado');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function mergeRows(rows) {
    const known = new Set(state.rows.map((row) => row.id));
    rows.forEach((row) => {
      if (!known.has(row.id)) {
        state.rows.push(row);
      }
    });
    state.rows.sort((a, b) => Number(a.position) - Number(b.position));
  }

  function parseImport(text) {
    const importColumns = state.columns.filter((column) => !isComputedColumn(column));
    return text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(';');
        const values = {};
        importColumns.forEach((column, index) => {
          values[column.key] = parts[index] || '';
        });
        return values;
      });
  }

  function visibleRows() {
    return state.rows.filter((row) => rowMatchesFilters(row));
  }

  function downloadCsv() {
    const headers = state.columns.map((column) => column.label);
    const lines = [headers.map(csvValue).join(';')];
    visibleRows().forEach((row) => {
      const values = state.columns.map((column) => cellValue(row, column));
      lines.push(values.map(csvValue).join(';'));
    });
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotacao-wimifarma-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvValue(value) {
    const text = String(value ?? '');
    return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function renderRuleColumnOptions() {
    ruleColumn.innerHTML = '';
    state.columns
      .filter((column) => !isComputedColumn(column))
      .forEach((column) => {
        const option = document.createElement('option');
        option.value = column.key;
        option.textContent = column.label;
        ruleColumn.appendChild(option);
      });
    ruleColumn.value = state.columns.some((column) => column.key === 'categoria') ? 'categoria' : ruleColumn.value;
  }

  function renderRules() {
    rulesList.innerHTML = '';
    if (!state.rules.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhuma regra criada.';
      rulesList.appendChild(empty);
      return;
    }
    state.rules.forEach((rule) => {
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = `<span><strong>${escapeHtml(rule.value)}</strong> em ${escapeHtml(labelFor(rule.column_key))}</span>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Excluir';
      button.addEventListener('click', () => deleteRule(rule.id));
      row.appendChild(button);
      rulesList.appendChild(row);
    });
  }

  function labelFor(columnKey) {
    return state.columns.find((column) => column.key === columnKey)?.label || columnKey;
  }

  async function addRule() {
    try {
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
      renderTable();
      renderRules();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function deleteRule(id) {
    try {
      await api(`/api/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientId })
      });
      state.rules = state.rules.filter((rule) => rule.id !== id);
      renderTable();
      renderRules();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function openContextMenu(event, target) {
    event.preventDefault();
    state.context = target;
    const column = state.columns.find((item) => item.key === target.columnKey);
    contextMenu.querySelectorAll('[data-action^="row-"]').forEach((button) => {
      button.disabled = !target.rowId;
    });
    contextMenu.querySelectorAll('[data-action^="column-"]').forEach((button) => {
      button.disabled = !isDistributorColumn(column);
    });
    contextMenu.hidden = false;
    const width = contextMenu.offsetWidth || 230;
    const height = contextMenu.offsetHeight || 220;
    contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - width - 8)}px`;
    contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - height - 8)}px`;
  }

  function hideContextMenu() {
    contextMenu.hidden = true;
    state.context = null;
  }

  function handleContextAction(action) {
    const context = state.context || {};
    hideContextMenu();
    if (action === 'row-above') insertRows(context.rowId, 'above');
    if (action === 'row-below') insertRows(context.rowId, 'below');
    if (action === 'row-delete') deleteRow(context.rowId);
    if (action === 'column-before') addDistributorColumn(context.columnKey, 'before');
    if (action === 'column-after') addDistributorColumn(context.columnKey, 'after');
    if (action === 'column-delete') deleteDistributorColumn(context.columnKey);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  document.querySelector('#addRowsButton').addEventListener('click', () => addRows(20));
  document.querySelector('#addTwentyRowsButton').addEventListener('click', () => addRows(20));
  document.querySelector('#importButton').addEventListener('click', () => importDialog.showModal());
  document.querySelector('#rulesButton').addEventListener('click', () => rulesDialog.showModal());
  exportCsvButton.addEventListener('click', downloadCsv);
  viewTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.activeViewCategory = button.dataset.viewCategory || '';
      categoryFilter.value = '';
      renderStats();
      renderTable();
      emitPresence();
    });
  });
  document.querySelector('#confirmImport').addEventListener('click', () => {
    const rows = parseImport(importText.value);
    importDialog.close();
    importText.value = '';
    if (rows.length) addRows(rows.length, rows);
  });
  document.querySelector('#addRuleButton').addEventListener('click', addRule);
  searchInput.addEventListener('input', () => {
    renderTable();
    emitPresence();
  });
  categoryFilter.addEventListener('change', () => {
    state.activeViewCategory = categoryFilter.value;
    renderStats();
    renderTable();
    emitPresence();
  });
  winnerFilter.addEventListener('change', () => {
    renderStats();
    renderTable();
    emitPresence();
  });
  paintSwatches.forEach((button) => {
    button.addEventListener('click', () => {
      const color = button.dataset.color || '';
      state.paintColor = state.paintColor === color ? '' : color;
      paintSwatches.forEach((item) => item.classList.toggle('is-active', item === button && state.paintColor));
    });
  });
  contextMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    handleContextAction(button.dataset.action);
  });
  document.addEventListener('click', (event) => {
    if (!contextMenu.hidden && !event.target.closest('#contextMenu')) {
      hideContextMenu();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideContextMenu();
  });

  socket.on('connect', () => {
    if (state.quote) {
      socket.emit('join', { quoteId: state.quote.id, clientId });
    }
  });
  socket.on('presence:update', (presence) => {
    state.presence = Array.isArray(presence) ? presence : [];
    renderPresence();
  });
  socket.on('rows:added', (event) => {
    if (event.clientId === clientId) return;
    mergeRows(event.rows || []);
    renderCategoryFilter();
    renderWinnerFilter();
    renderStats();
    renderTable();
  });
  socket.on('row:deleted', (event) => {
    if (event.clientId === clientId) return;
    state.rows = state.rows.filter((row) => row.id !== event.rowId);
    renderCategoryFilter();
    renderWinnerFilter();
    renderStats();
    renderTable();
  });
  socket.on('cell:update', (event) => {
    if (event.clientId === clientId) return;
    const row = state.rows.find((item) => item.id === event.rowId);
    if (!row) return;
    row.values = { ...(row.values || {}), [event.columnKey]: event.value };
    row.version = event.version;
    row.updatedAt = event.updatedAt;
    const editKey = `${event.rowId}:${event.columnKey}`;
    if (state.editing !== editKey) {
      const input = table.querySelector(`input[data-row-id="${cssEscape(event.rowId)}"][data-column-key="${cssEscape(event.columnKey)}"]`);
      if (input) input.value = event.value;
    }
    if (event.columnKey === 'categoria') {
      renderCategoryFilter();
    }
    if (isDistributorColumn(state.columns.find((column) => column.key === event.columnKey))) {
      renderWinnerFilter();
    }
    renderStats();
    applyRowUpdate(event.rowId);
  });
  socket.on('style:update', (event) => {
    if (event.style) {
      upsertStyle(event.style);
      renderTable();
    }
  });
  socket.on('columns:changed', (event) => {
    if (event.clientId === clientId) return;
    reloadSheet().catch((error) => setStatus(error.message, 'error'));
  });
  socket.on('rules:update', (event) => {
    if (event.mode === 'created' && Array.isArray(event.rules)) {
      event.rules.forEach((rule) => {
        if (!state.rules.some((current) => current.id === rule.id)) {
          state.rules.push(rule);
        }
      });
    }
    if (event.mode === 'deleted') {
      state.rules = state.rules.filter((rule) => rule.id !== event.id);
    }
    renderTable();
    renderRules();
  });
  socket.on('connect_error', () => setStatus('Reconectando tempo real...', 'saving'));

  bootstrap().catch((error) => setStatus(error.message, 'error'));
})();
