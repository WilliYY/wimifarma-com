import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
function definition(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  if (start < 0) return '';
  const next = source.slice(start + 3).search(/^  (?:async )?function \w+\(/m);
  return source.slice(start, next < 0 ? source.length - 5 : start + 3 + next);
}

function fixture(api = async () => ({ eventId: 10, version: 2, cells: [] })) {
  const rows = new Map([['row', { id: 'row', values: { produto: 'Anterior' }, version: 1 }]]);
  let replacements = 0;
  const statuses = [];
  const input = { value: 'Rascunho atual', isConnected: true, classList: { remove() {} }, blur() {} };
  const elements = new Map();
  function element(tag) {
    return {
      tagName: tag.toUpperCase(), children: [], events: {}, value: '',
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); },
      insertBefore(child) { this.appendChild(child); },
      addEventListener(name, listener) { this.events[name] = listener; },
      setAttribute(name, value) { this[name] = value; },
      remove() {},
    };
  }
  const controls = element('div');
  const state = {
    editing: { rowId: 'row', columnKey: 'produto', input },
    rows: [...rows.values()], columns: [{ key: 'produto' }], styles: [], rules: [],
    pendingCellSaves: new Map(), pendingBatchSaves: 0, pendingCommit: null,
    deferredRemoteRowIds: new Set(), deferredRemoteFullRender: false,
    unsavedCellDrafts: new Map(), draftRecoveryItems: new Map(), cellEventIds: new Map(), localCellRevisions: new Map(), pendingRemoteCells: new Map(), pendingBatchCellSaves: new Map(),
    lastEventId: 5, highestObservedEventId: 5, localMutationVersion: 0,
    conflicts: new Map(),
  };
  const table = {
    set innerHTML(value) { replacements += 1; input.isConnected = false; },
    querySelector: () => ({ set outerHTML(value) { replacements += 1; input.isConnected = false; } }),
  };
  const sandbox = {
    state, table, api, clientId: 'local', saveStatus: { dataset: {}, parentNode: controls },
    sheetWrap: { before: child => elements.set(child.id, child) },
    document: { getElementById: id => elements.get(id), createElement: element },
    window: { setTimeout, clearTimeout, confirm: () => false }, console: { error() {}, warn() {} },
    rowById: id => rows.get(id), colByKey: key => state.columns.find(column => column.key === key), cellKey: (id, key) => `${id}:${key}`,
    setColumnsFromServer: columns => { state.columns = columns; return true; },
    status(text, mode = 'ok') { statuses.push(text); sandbox.saveStatus.dataset.mode = mode; }, markConflictCell() {}, updateRenderedCell() {}, renderPresence() {}, renderRules() {},
    rememberEditedRowInFilteredView() {}, updateSelectionClasses() {}, bindCellHover() {},
    scheduleSheetAutosize() {}, refreshSimilarProductHighlights() {}, updateRowCountBadge() {},
    styleMap: () => new Map(), getVisibleRows: () => [...rows.values()],
    clampColumnWidth: value => value, esc: value => String(value), headerFilterButton: () => '',
    renderRowHtml: () => '<tr></tr>', autosizeSheetInputs() {},
    historyStylesForTargets: () => [], styleTargetsFromKeys: () => [],
    applyRemoteStylesDeleted: keys => Boolean(keys.length),
    pushHistory() {}, rememberCellValueAction() {},
    flushDeferredRemoteRender() {},
    updatePresence() {}, scheduleActiveEditAutosave() {},
  };
  const names = ['rememberEventId', 'deferRemoteRender', 'renderTable', 'refreshRenderedRow',
    'refreshRenderedRows', 'applyLocalCellValue', 'hasPendingSaves', 'hasUnsavedWork', 'applyRemoteRowDeleted', 'applyRemoteColumnChange',
    'updateDraftRetryControl', 'updateDraftRecoveryPanel', 'discardUnsavedDraft', 'rememberUnsavedDraft', 'retryUnsavedDrafts',
    'updatePendingSaveStatus', 'setCellValue', 'saveCellsBatch', 'applyRemoteCellUpdate', 'reloadSheet',
    'activeEditPersistedValue', 'hasDirtyActiveEdit', 'clearEditAutosaveTimer', 'markActiveEditDirty', 'cancelEdit', 'clearDeferredRemoteRender'];
  vm.createContext(sandbox);
  vm.runInContext(names.map(definition).filter(Boolean).join('\n'), sandbox);
  return { sandbox, state, rows, input, elements, statuses, replacements: () => replacements };
}

test('redesenho completo e da linha preserva o campo ativo e adia o DOM', () => {
  const ui = fixture();
  ui.sandbox.renderTable();
  ui.sandbox.refreshRenderedRow('row');
  assert.equal(ui.replacements(), 0);
  assert.equal(ui.input.isConnected, true);
  assert.equal(ui.input.value, 'Rascunho atual');
  assert.equal(ui.state.deferredRemoteFullRender, true);
});

test('ACK que limpa estilo durante autosave preserva texto digitado em voo', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  const task = ui.sandbox.setCellValue('row', 'produto', '', { render: false });
  ui.input.value = 'Novo texto digitado';
  resolve({ eventId: 10, version: 2, clearedStyleKeys: ['cell:row:produto'] });
  await task;
  assert.equal(ui.replacements(), 0);
  assert.equal(ui.input.isConnected, true);
  assert.equal(ui.input.value, 'Novo texto digitado');
});

test('erro apos commit preserva rascunho em memoria e aviso ao sair', async () => {
  const ui = fixture(async () => { throw new Error('Sem rede'); });
  ui.state.editing = null;
  await assert.rejects(ui.sandbox.setCellValue('row', 'produto', 'Nao perder'), /Sem rede/);
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto')?.value, 'Nao perder');
  assert.equal(ui.rows.get('row').values.produto, 'Nao perder');
  assert.equal(ui.sandbox.hasUnsavedWork(), true);
});

test('evento antigo por celula nao desfaz ACK novo nem descarta outra coluna da linha', () => {
  const ui = fixture();
  ui.state.editing = null;
  ui.rows.get('row').values.produto = 'Novo';
  ui.state.cellEventIds.set('row:produto', 20);
  ui.sandbox.applyRemoteCellUpdate({ rowId: 'row', columnKey: 'produto', value: 'Velho', eventId: 10, version: 2 });
  assert.equal(ui.rows.get('row').values.produto, 'Novo');
  ui.sandbox.applyRemoteCellUpdate({ rowId: 'row', columnKey: 'categoria', value: 'Generico', eventId: 11, version: 1 });
  assert.equal(ui.rows.get('row').values.categoria, 'Generico');
});

test('socket e ACK nao avancam cursor confirmado do delta', () => {
  const ui = fixture();
  ui.sandbox.rememberEventId(30);
  assert.equal(ui.state.lastEventId, 5);
});

test('snapshot em voo nao substitui edicao que comecou depois da requisicao', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  ui.state.editing = null;
  const task = ui.sandbox.reloadSheet();
  ui.state.editing = { rowId: 'row', columnKey: 'produto', input: ui.input };
  resolve({ rows: [], columns: [], lastEventId: 30 });
  await task;
  assert.equal(ui.state.rows.length, 1);
  assert.equal(ui.state.lastEventId, 5);
});

test('lote de 1001 celulas envia duas partes sequenciais com ACK completo', async () => {
  const requests = [];
  const ui = fixture(async (path, options) => {
    const { changes } = JSON.parse(options.body);
    requests.push(changes.length);
    return { eventId: requests.length + 10, cells: changes.map(change => ({ ...change, previousValue: 'Anterior', version: 2 })) };
  });
  ui.state.editing = null;
  const changes = Array.from({ length: 1001 }, (_, index) => {
    const id = `row-${index}`;
    ui.rows.set(id, { id, values: { produto: 'Anterior' }, version: 1 });
    return { rowId: id, columnKey: 'produto', value: 'Novo' };
  });
  await ui.sandbox.saveCellsBatch(changes, { render: 'rows' });
  assert.deepEqual(requests, [1000, 1]);
  assert.equal(ui.rows.get('row-1000').values.produto, 'Novo');
});

test('ACK incompleto nao anuncia cauda do lote como salva e permite retry', async () => {
  const ui = fixture(async (path, options) => {
    const { changes } = JSON.parse(options.body);
    return { eventId: 10, cells: [{ ...changes[0], previousValue: 'Anterior', version: 2 }] };
  });
  ui.state.editing = null;
  ui.rows.set('second', { id: 'second', values: { produto: 'Anterior' }, version: 1 });
  await assert.rejects(ui.sandbox.saveCellsBatch([
    { rowId: 'row', columnKey: 'produto', value: 'Um' },
    { rowId: 'second', columnKey: 'produto', value: 'Dois' },
  ], { render: 'rows' }), /confirm/);
  assert.equal(ui.state.unsavedCellDrafts.has('row:produto'), false);
  assert.equal(ui.state.unsavedCellDrafts.get('second:produto')?.value, 'Dois');
});

test('retry manual envia o rascunho e remove pendencia apenas depois do ACK', async () => {
  let fail = true;
  const requests = [];
  const ui = fixture(async (path, options) => {
    requests.push(JSON.parse(options.body));
    if (fail) throw new Error('Sem rede');
    return { eventId: 12, version: 2 };
  });
  ui.state.editing = null;
  await assert.rejects(ui.sandbox.setCellValue('row', 'produto', 'Recuperar'), /Sem rede/);
  fail = false;
  await ui.sandbox.retryUnsavedDrafts();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].value, 'Recuperar');
  assert.equal(requests[1].expectedValue, 'Anterior');
  assert.equal(ui.state.unsavedCellDrafts.size, 0);
  assert.equal(ui.sandbox.hasUnsavedWork(), false);
});

test('evento recebido antes do ACK aguarda ordem por celula sem perder atualizacao mais nova', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  ui.state.editing = null;
  const task = ui.sandbox.setCellValue('row', 'produto', 'Local');
  ui.sandbox.applyRemoteCellUpdate({ rowId: 'row', columnKey: 'produto', value: 'Remoto posterior', eventId: 12, version: 3 });
  assert.equal(ui.rows.get('row').values.produto, 'Local');
  resolve({ eventId: 11, version: 2 });
  await task;
  assert.equal(ui.rows.get('row').values.produto, 'Remoto posterior');
  assert.equal(ui.rows.get('row').version, 3);
});

test('save novo aguarda lote em voo da mesma celula e preserva o valor mais recente', async () => {
  let resolveBatch;
  const ui = fixture((path) => path.endsWith('/batch')
    ? new Promise(done => { resolveBatch = done; })
    : Promise.resolve({ eventId: 15, version: 3 }));
  ui.state.editing = null;
  const batch = ui.sandbox.saveCellsBatch([{ rowId: 'row', columnKey: 'produto', value: 'Lote antigo' }], { optimistic: true, render: 'rows' });
  const newer = ui.sandbox.setCellValue('row', 'produto', 'Edicao nova');
  resolveBatch({ eventId: 14, cells: [{ rowId: 'row', columnKey: 'produto', value: 'Lote antigo', version: 2, previousValue: 'Anterior' }] });
  await Promise.all([batch, newer]);
  assert.equal(ui.rows.get('row').values.produto, 'Edicao nova');
  assert.equal(ui.rows.get('row').version, 3);
});

test('remocao da linha ativa preserva texto mas retry nao recria linha', async () => {
  let requests = 0;
  const ui = fixture(async () => { requests += 1; return {}; });
  ui.sandbox.applyRemoteRowDeleted('row');
  ui.rows.delete('row');
  await ui.sandbox.retryUnsavedDrafts();
  assert.equal(requests, 0);
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto')?.value, 'Rascunho atual');
});

test('retry de lote confirmado com resposta perdida aceita ACK noop sem evento novo', async () => {
  const ui = fixture(async () => ({ eventId: null, noop: true, cells: [{ rowId: 'row', columnKey: 'produto', value: 'Confirmado', version: 2 }] }));
  ui.state.editing = null;
  ui.rows.get('row').values.produto = 'Confirmado';
  ui.state.cellEventIds.set('row:produto', 10);
  ui.sandbox.rememberUnsavedDraft('row', 'produto', 'Confirmado', 'Anterior');
  await ui.sandbox.saveCellsBatch([{ rowId: 'row', columnKey: 'produto', value: 'Confirmado' }], { render: 'rows' });
  assert.equal(ui.state.unsavedCellDrafts.size, 0);
});

test('falha na segunda parte preserva somente a cauda sem reenfileirar parte confirmada', async () => {
  let calls = 0;
  const ui = fixture(async (path, options) => {
    calls += 1;
    const { changes } = JSON.parse(options.body);
    if (calls === 2) throw new Error('Sem rede');
    return { eventId: 10, cells: changes.map(change => ({ ...change, version: 2 })) };
  });
  ui.state.editing = null;
  const changes = Array.from({ length: 1001 }, (_, index) => {
    const id = `row-${index}`;
    ui.rows.set(id, { id, values: { produto: 'Anterior' }, version: 1 });
    return { rowId: id, columnKey: 'produto', value: 'Novo' };
  });
  await assert.rejects(ui.sandbox.saveCellsBatch(changes, { render: 'rows' }), /Sem rede/);
  assert.equal(ui.state.unsavedCellDrafts.size, 1);
  assert.equal(ui.state.unsavedCellDrafts.get('row-1000:produto')?.value, 'Novo');
  assert.equal(ui.rows.get('row-999').values.produto, 'Novo');
  assert.equal(ui.rows.get('row-1000').values.produto, 'Anterior');
});

test('cursor delta confirmado durante save nao descarta evento remoto ainda aguardando ACK', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  ui.state.editing = null;
  const task = ui.sandbox.setCellValue('row', 'produto', 'Local');
  ui.sandbox.applyRemoteCellUpdate({ rowId: 'row', columnKey: 'produto', value: 'Remoto', eventId: 12, version: 3 });
  ui.state.lastEventId = 12;
  resolve({ eventId: 11, version: 2 });
  await task;
  assert.equal(ui.rows.get('row').values.produto, 'Remoto');
});

test('orfao selecionavel nao bloqueia retry de rascunho valido e descarte exige confirmacao', async () => {
  const requests = [];
  const ui = fixture(async (path, options) => {
    requests.push(JSON.parse(options.body));
    return { eventId: 12, version: 2 };
  });
  ui.state.editing = null;
  ui.sandbox.rememberUnsavedDraft('removed', 'produto', '<produto a recuperar>', 'Anterior');
  ui.sandbox.rememberUnsavedDraft('row', 'produto', 'Salvar este', 'Anterior');
  ui.sandbox.updatePendingSaveStatus();
  const output = ui.state.draftRecoveryItems.get('removed:produto').output;
  assert.equal(output.tagName, 'TEXTAREA');
  assert.equal(output.readOnly, true);
  assert.equal(output.value, '<produto a recuperar>');
  assert.ok(ui.elements.get('draftRecoveryPanel'));
  await ui.sandbox.retryUnsavedDrafts();
  assert.deepEqual(requests.map(request => request.rowId), ['row']);
  assert.equal(ui.state.unsavedCellDrafts.size, 1);
  ui.sandbox.discardUnsavedDraft('removed:produto');
  assert.equal(ui.state.unsavedCellDrafts.size, 1);
  ui.sandbox.window.confirm = () => true;
  ui.sandbox.discardUnsavedDraft('removed:produto');
  assert.equal(ui.state.unsavedCellDrafts.size, 0);
  assert.equal(ui.sandbox.hasUnsavedWork(), false);
});

test('ACK de A apos digitar B e remover linha preserva rascunho B acessivel', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  const task = ui.sandbox.setCellValue('row', 'produto', 'A', { render: false });
  ui.input.value = 'B';
  ui.sandbox.applyRemoteRowDeleted('row');
  ui.rows.delete('row');
  resolve({ eventId: 11, version: 2 });
  await task;
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto')?.value, 'B');
  assert.equal(ui.state.draftRecoveryItems.get('row:produto').output.value, 'B');
});

test('tres saves A B C da mesma celula permanecem sequenciais apos A resolver', async () => {
  const requests = [];
  const ui = fixture((path, options) => new Promise(resolve => requests.push({ value: JSON.parse(options.body).value, resolve })));
  ui.state.editing = null;
  const first = ui.sandbox.setCellValue('row', 'produto', 'A');
  const second = ui.sandbox.setCellValue('row', 'produto', 'B');
  const third = ui.sandbox.setCellValue('row', 'produto', 'C');
  assert.deepEqual(requests.map(request => request.value), ['A']);
  requests[0].resolve({ eventId: 10, version: 2 });
  await new Promise(setImmediate);
  assert.deepEqual(requests.map(request => request.value), ['A', 'B']);
  requests[1].resolve({ eventId: 11, version: 3 });
  await new Promise(setImmediate);
  assert.deepEqual(requests.map(request => request.value), ['A', 'B', 'C']);
  requests[2].resolve({ eventId: 12, version: 4 });
  await Promise.all([first, second, third]);
  assert.equal(ui.rows.get('row').values.produto, 'C');
});

test('remocao da coluna ativa guarda rascunho selecionavel e mantem o campo conectado', () => {
  const ui = fixture();
  ui.sandbox.applyRemoteColumnChange({ type: 'column_deleted', columns: [] });
  assert.equal(ui.replacements(), 0);
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto')?.value, 'Rascunho atual');
  assert.equal(ui.state.draftRecoveryItems.get('row:produto').output.value, 'Rascunho atual');
});

test('save explicito B substitui rascunho A e ACK B elimina a pendencia antiga', async () => {
  const ui = fixture();
  ui.state.editing = null;
  ui.sandbox.rememberUnsavedDraft('row', 'produto', 'A', 'Anterior');
  await ui.sandbox.setCellValue('row', 'produto', 'B');
  assert.equal(ui.rows.get('row').values.produto, 'B');
  assert.equal(ui.state.unsavedCellDrafts.size, 0);
});

test('ACK de lote A preserva outro objeto de rascunho B criado durante voo', async () => {
  let resolve;
  const ui = fixture(() => new Promise(done => { resolve = done; }));
  const task = ui.sandbox.saveCellsBatch([{ rowId: 'row', columnKey: 'produto', value: 'A' }], { optimistic: true, render: 'rows' });
  ui.input.value = 'B';
  ui.sandbox.rememberUnsavedDraft('row', 'produto', 'B', 'Anterior');
  resolve({ eventId: 10, cells: [{ rowId: 'row', columnKey: 'produto', value: 'A', version: 2, previousValue: 'Anterior' }] });
  await task;
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto')?.value, 'B');
  assert.equal(ui.state.draftRecoveryItems.get('row:produto').output.value, 'B');
});

test('descartar apos timeout de COMMIT reconcilia snapshot sem inventar valor anterior', async () => {
  let snapshotTask;
  let resolveSnapshot;
  const ui = fixture((path) => path.endsWith('/bootstrap')
    ? new Promise(resolve => { resolveSnapshot = resolve; })
    : Promise.reject(new Error('Timeout depois de COMMIT')));
  ui.state.editing = null;
  await assert.rejects(ui.sandbox.setCellValue('row', 'produto', 'A'), /Timeout/);
  ui.sandbox.window.confirm = () => true;
  ui.sandbox.flushDeferredRemoteRender = () => { snapshotTask = ui.sandbox.reloadSheet(); };
  ui.sandbox.discardUnsavedDraft('row:produto');
  assert.equal(ui.rows.get('row').values.produto, 'A');
  assert.equal(ui.state.snapshotPending, true);
  assert.equal(ui.statuses.at(-1), 'Conferindo dados confirmados...');
  resolveSnapshot({ rows: [{ id: 'row', values: { produto: 'A' }, version: 2 }], columns: [{ key: 'produto' }], lastEventId: 20 });
  await snapshotTask;
  assert.equal(ui.state.rows[0].values.produto, 'A');
  assert.equal(ui.state.snapshotPending, false);
  assert.equal(ui.state.lastEventId, 20);
});

test('linha removida antes da proxima parte do lote preserva cauda e informa erro', async () => {
  let calls = 0;
  const ui = fixture(async (path, options) => {
    calls += 1;
    const { changes } = JSON.parse(options.body);
    ui.rows.delete('row-1000');
    return { eventId: 10, cells: changes.map(change => ({ ...change, version: 2 })) };
  });
  ui.state.editing = null;
  const changes = Array.from({ length: 1001 }, (_, index) => {
    const id = `row-${index}`;
    ui.rows.set(id, { id, values: { produto: 'Anterior' }, version: 1 });
    return { rowId: id, columnKey: 'produto', value: 'Novo' };
  });
  await assert.rejects(ui.sandbox.saveCellsBatch(changes, { render: 'rows' }), /removida/);
  assert.equal(calls, 1);
  assert.equal(ui.state.unsavedCellDrafts.size, 1);
  assert.equal(ui.state.unsavedCellDrafts.get('row-1000:produto')?.value, 'Novo');
});

for (const batch of [false, true]) {
  test(`ACK ${batch ? 'batch' : 'single'} de B limpa seu draft mesmo apos digitar C e Escape C`, async () => {
    let resolve;
    const ui = fixture(() => new Promise(done => { resolve = done; }));
    ui.input.value = 'B';
    ui.sandbox.rememberUnsavedDraft('row', 'produto', 'B', 'Anterior');
    const task = batch
      ? ui.sandbox.saveCellsBatch([{ rowId: 'row', columnKey: 'produto', value: 'B' }], { optimistic: true, render: 'rows' })
      : ui.sandbox.setCellValue('row', 'produto', 'B', { render: false });
    ui.input.value = 'C';
    ui.sandbox.markActiveEditDirty(ui.input);
    assert.equal(ui.sandbox.hasUnsavedWork(), true);
    resolve(batch
      ? { eventId: 10, cells: [{ rowId: 'row', columnKey: 'produto', value: 'B', previousValue: 'Anterior', version: 2 }] }
      : { eventId: 10, version: 2 });
    await task;
    assert.equal(ui.state.unsavedCellDrafts.size, 0);
    assert.equal(ui.input.value, 'C');
    assert.equal(ui.sandbox.hasUnsavedWork(), true);
    ui.state.editing.originalValue = 'B';
    ui.sandbox.cancelEdit();
    assert.equal(ui.state.unsavedCellDrafts.size, 0);
    assert.equal(ui.rows.get('row').values.produto, 'B');
    assert.equal(ui.sandbox.hasUnsavedWork(), false);
  });
}

test('falha de A apos digitar B e remover linha preserva objeto novo de rascunho B', async () => {
  let reject;
  const ui = fixture(() => new Promise((resolve, fail) => { reject = fail; }));
  const task = ui.sandbox.setCellValue('row', 'produto', 'A', { render: false });
  const rejected = assert.rejects(task, /Indisponivel/);
  ui.input.value = 'B';
  ui.sandbox.markActiveEditDirty(ui.input);
  ui.sandbox.applyRemoteRowDeleted('row');
  ui.rows.delete('row');
  const draftB = ui.state.unsavedCellDrafts.get('row:produto');
  reject(Object.assign(new Error('Indisponivel'), { status: 503 }));
  await rejected;
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto'), draftB);
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto').value, 'B');
  assert.equal(ui.state.draftRecoveryItems.get('row:produto').output.value, 'B');
});

test('intencao B aguardando fila substitui draft antigo A quando a linha e removida', async () => {
  let resolve;
  let requests = 0;
  const ui = fixture(() => { requests += 1; return new Promise(done => { resolve = done; }); });
  ui.state.editing = null;
  ui.sandbox.rememberUnsavedDraft('row', 'produto', 'A', 'Anterior');
  const first = ui.sandbox.setCellValue('row', 'produto', 'A');
  const second = ui.sandbox.setCellValue('row', 'produto', 'B');
  const rejected = assert.rejects(second, /removida/);
  ui.sandbox.applyRemoteRowDeleted('row');
  ui.rows.delete('row');
  resolve({ eventId: 10, version: 2 });
  await Promise.all([first, rejected]);
  assert.equal(requests, 1);
  assert.equal(ui.state.unsavedCellDrafts.get('row:produto').value, 'B');
});
