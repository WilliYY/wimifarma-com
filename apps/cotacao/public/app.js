(() => {
  const config = window.COTACAO_CONFIG || {};
  const basePath = config.basePath || '/cotacao';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const table = document.querySelector('#sheetTable');
  const saveStatus = document.querySelector('#saveStatus');
  const searchInput = document.querySelector('#searchInput');
  const categoryFilter = document.querySelector('#categoryFilter');
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

  const state = {
    quote: null,
    columns: [],
    rows: [],
    rules: [],
    presence: [],
    editing: null,
    activeViewCategory: '',
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
    state.quote = data.quote;
    state.columns = data.columns;
    state.rows = data.rows;
    state.rules = data.rules || [];
    state.presence = data.presence || [];
    render();
    socket.emit('join', { quoteId: state.quote.id, clientId });
    setStatus('Sincronizado');
  }

  function render() {
    renderRuleColumnOptions();
    renderCategoryFilter();
    renderStats();
    renderPresence();
    renderTable();
    renderRules();
  }

  function renderTable() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createHeaderCell({ label: '#', width: 58, key: 'row_index' }));
    state.columns.forEach((column) => {
      headerRow.appendChild(createHeaderCell(column));
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    state.rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.dataset.rowId = row.id;
      tr.classList.toggle('is-filtered', !rowMatchesFilters(row));
      applyConditionalStyle(tr, row);
      const number = document.createElement('td');
      number.className = 'row-index';
      number.textContent = String(index + 1);
      tr.appendChild(number);

      state.columns.forEach((column) => {
        const td = document.createElement('td');
        td.className = columnClass(column);
        td.style.width = `${column.width}px`;
        td.style.minWidth = `${column.width}px`;
        td.dataset.rowId = row.id;
        td.dataset.columnKey = column.key;
        const input = document.createElement('input');
        input.className = 'sheet-input';
        input.value = row.values?.[column.key] ?? '';
        input.dataset.rowId = row.id;
        input.dataset.columnKey = column.key;
        input.placeholder = columnPlaceholder(column);
        input.autocomplete = 'off';
        input.spellcheck = false;
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
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
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
    return th;
  }

  function columnClass(column) {
    const key = column.key || '';
    if (key === 'row_index') return 'col-index';
    if (key === 'quem_ganhou') return 'col-winner';
    if (key.startsWith('fornecedor_')) return `col-supplier col-${key.replaceAll('_', '-')}`;
    return `col-${key.replaceAll('_', '-')}`;
  }

  function columnPlaceholder(column) {
    return column.options?.fallback || '';
  }

  function rowMatchesFilters(row) {
    const search = searchInput.value.trim().toLowerCase();
    const category = (state.activeViewCategory || categoryFilter.value).trim().toLowerCase();
    const values = row.values || {};
    if (state.editing && state.editing.startsWith(`${row.id}:`)) {
      return true;
    }
    if (category && String(values.categoria || '').trim().toLowerCase() !== category) {
      return false;
    }
    if (!search) {
      return true;
    }
    return state.columns.some((column) => String(values[column.key] || '').toLowerCase().includes(search));
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

  function renderStats() {
    const withData = state.rows.filter((row) => {
      const values = row.values || {};
      return state.columns.some((column) => String(values[column.key] || '').trim() !== '');
    }).length;
    rowCountBadge.textContent = `${withData} linha(s) com dados`;
    viewTitle.textContent = state.activeViewCategory || 'Cotacao Geral';
    viewTabs.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.viewCategory === state.activeViewCategory);
    });
  }

  function scheduleSave(input) {
    const key = `${input.dataset.rowId}:${input.dataset.columnKey}`;
    clearTimeout(state.saveTimers.get(key));
    state.saveTimers.set(key, setTimeout(() => saveCell(input), 420));
    setStatus('Salvando...', 'saving');
  }

  async function saveCell(input) {
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
    applyConditionalStyle(tr, row);
  }

  function applyConditionalStyle(tr, row) {
    tr.style.background = '';
    tr.style.color = '';
    tr.querySelectorAll('td:not(.row-index)').forEach((td) => {
      td.style.background = '';
      td.style.color = '';
    });
    const rule = state.rules
      .filter((item) => item.enabled !== false)
      .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100))
      .find((item) => matchesRule(row.values?.[item.column_key], item));
    if (!rule) return;
    tr.querySelectorAll('td:not(.row-index)').forEach((td) => {
      td.style.background = rule.background;
      td.style.color = rule.color;
    });
  }

  function matchesRule(value, rule) {
    const text = String(value || '').trim().toLowerCase();
    const wanted = String(rule.value || '').trim().toLowerCase();
    if (!wanted) return false;
    if (rule.operator === 'equals') return text === wanted;
    if (rule.operator === 'starts') return text.startsWith(wanted);
    return text.includes(wanted);
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
      pill.textContent = item.clientId === clientId ? `${item.username} (voce)` : item.username;
      presenceList.appendChild(pill);
    });
    markRemoteCells();
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
          cell.dataset.remoteUser = item.username;
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
        category: categoryFilter.value
      }
    });
  }

  async function addRows(count = 10, rows = []) {
    try {
      setStatus('Adicionando linhas...', 'saving');
      const data = await api('/api/rows', {
        method: 'POST',
        body: JSON.stringify({ count, rows, clientId })
      });
      mergeRows(data.rows);
      renderStats();
      renderTable();
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
    return text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(';');
        const values = {};
        state.columns.forEach((column, index) => {
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
      const values = state.columns.map((column) => row.values?.[column.key] || '');
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
    state.columns.forEach((column) => {
      const option = document.createElement('option');
      option.value = column.key;
      option.textContent = column.label;
      ruleColumn.appendChild(option);
    });
    ruleColumn.value = 'categoria';
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

  document.querySelector('#addRowsButton').addEventListener('click', () => addRows(10));
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
    renderStats();
    applyRowUpdate(event.rowId);
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
