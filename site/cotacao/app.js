document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('sheet-grid');
    var csrf = document.querySelector('meta[name="wfwc-csrf"]');
    var csrfToken = csrf ? csrf.getAttribute('content') : '';
    var saveStatus = document.querySelector('[data-save-status]');
    var presenceSummary = document.querySelector('[data-presence-summary]');
    var presenceList = document.querySelector('[data-presence-list]');
    var categoryFilterValue = document.getElementById('category-filter-value');
    var categoryPopover = document.getElementById('category-filter-popover');
    var categoryOptionsBox = document.querySelector('[data-category-options]');
    var productColorPopover = document.getElementById('product-color-filter-popover');
    var winnerPopover = document.getElementById('winner-filter-popover');
    var winnerOptionsBox = document.querySelector('[data-winner-options]');
    var selectionSummary = document.querySelector('[data-selection-summary]');
    var selectionSummaryToggle = document.querySelector('[data-selection-summary-toggle]');
    var selectionSummaryValue = document.querySelector('[data-selection-summary-value]');
    var selectionSummaryMenu = document.querySelector('[data-selection-summary-menu]');
    var fontSizeIndicator = document.querySelector('[data-font-size-indicator]');
    var contextFontSizeInput = document.querySelector('[data-context-font-size-input]');
    var toolbarPalette = document.querySelector('[data-toolbar-palette]');
    var contextMenu = document.getElementById('sheet-context-menu');
    var conditionalPopover = document.getElementById('conditional-format-popover');
    var conditionalRulesScript = document.getElementById('conditional-rules-data');
    var saveTimers = new WeakMap();
    var supplierTimers = {};
    var categoryOptionsTimer = null;
    var gridFilterRefreshTimer = null;
    var winnerOptionsTimer = null;
    var undoStack = [];
    var redoStack = [];
    var isApplyingUndo = false;
    var lastRepeatAction = null;
    var activeRow = null;
    var activeCell = null;
    var anchorCell = null;
    var isSelectingCells = false;
    var sheetDragSelection = null;
    var suppressRowNumberClick = false;
    var contextSupplierHeader = null;
    var contextHeaderCell = null;
    var contextSourceCell = null;
    var contextSourceRow = null;
    var resizeState = null;
    var columnResizeGuide = null;
    var productColorFilterValue = '';
    var winnerFilterValue = '';
    var selectionSummaryMetric = 'sum';
    var knownCategoryValues = [];
    var fillHandle = null;
    var fillDragState = null;
    var isApplyingFilterHistory = false;
    var isApplyingRemoteSync = false;
    var syncKnownVersion = 0;
    var syncKnownDataVersion = 0;
    var syncKnownFilterVersion = 0;
    var syncKnownStructureVersion = 0;
    var syncClientId = '';
    var syncPulling = false;
    var syncFilterTimer = null;
    var syncPendingSnapshot = null;
    var syncReloading = false;
    var syncErrorCount = 0;
    var presenceTimer = null;
    var presencePinging = false;
    var presenceLast = null;
    var minFontSize = 8;
    var maxFontSize = 36;
    var defaultFontSize = 20;
    var conditionalRules = readConditionalRules();
    var conditionalDefaultColor = '#fef7e0';

    function removeCotacaoMarioRunner() {
        document.querySelectorAll('[data-cotacao-runner], .cotacao-screen-runner').forEach(function (runner) {
            runner.remove();
        });
    }

    removeCotacaoMarioRunner();

    if (!grid) {
        return;
    }

    productColorFilterValue = String(grid.dataset.syncFilterColor || '');
    winnerFilterValue = String(grid.dataset.syncFilterWinner || '');
    syncKnownVersion = Number(grid.dataset.syncVersion || 0);
    syncKnownDataVersion = Number(grid.dataset.syncDataVersion || 0);
    syncKnownFilterVersion = Number(grid.dataset.syncFilterVersion || 0);
    syncKnownStructureVersion = Number(grid.dataset.syncStructureVersion || 0);
    syncClientId = (function () {
        try {
            var key = 'wimifarma:cotacao:sync-client';
            var stored = sessionStorage.getItem(key);
            if (stored) {
                return stored;
            }

            var value = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2);
            sessionStorage.setItem(key, value);
            return value;
        } catch (error) {
            return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2);
        }
    })();

    document.querySelectorAll('form[data-no-enter-submit]').forEach(function (form) {
        form.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') {
                return;
            }

            var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
            if (tag !== 'textarea') {
                event.preventDefault();
            }
        });
    });

    function setStatus(text, state) {
        if (!saveStatus) {
            return;
        }

        saveStatus.textContent = text;
        saveStatus.dataset.state = state || '';
    }

    function hydrateColorSwatches() {
        document.querySelectorAll('.color-swatch').forEach(function (button) {
            var color = button.dataset.swatchColor
                || button.dataset.toolbarColor
                || button.dataset.contextColor
                || button.dataset.productColorOption
                || button.dataset.conditionalColor
                || '';

            color = String(color || '').trim().toLowerCase();

            if (!color || button.classList.contains('is-clear')) {
                return;
            }

            button.dataset.swatchColor = color;
            button.style.setProperty('--swatch-color', color);
            button.style.setProperty('background-color', color, 'important');
            button.style.setProperty('background-image', 'linear-gradient(135deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0) 46%, rgba(0, 0, 0, 0.18))', 'important');
        });
    }

    function sanitizeConditionalRule(rule) {
        rule = rule && typeof rule === 'object' ? rule : {};

        return {
            id: Number(rule.id || 0),
            column_key: String(rule.column_key || ''),
            column_index: Number(rule.column_index || 0),
            column_label: String(rule.column_label || ''),
            operator: String(rule.operator || 'contains'),
            term: String(rule.term || ''),
            background: String(rule.background || ''),
            text_color: String(rule.text_color || '')
        };
    }

    function readConditionalRules() {
        if (!conditionalRulesScript) {
            return [];
        }

        try {
            var parsed = JSON.parse(conditionalRulesScript.textContent || '[]');
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.map(sanitizeConditionalRule).filter(function (rule) {
                return rule.id > 0 && rule.column_key && rule.background;
            });
        } catch (error) {
            return [];
        }
    }

    function updateHistoryButtons() {
        var undoButton = document.querySelector('[data-history-undo]');
        var redoButton = document.querySelector('[data-history-redo]');

        if (undoButton) {
            undoButton.disabled = undoStack.length === 0;
        }

        if (redoButton) {
            redoButton.disabled = redoStack.length === 0;
        }
    }

    function capHistoryStack(stack) {
        while (stack.length > 160) {
            stack.shift();
        }
    }

    function pushUndo(action) {
        if (isApplyingUndo || !action) {
            return;
        }

        undoStack.push(action);
        capHistoryStack(undoStack);
        redoStack = [];
        updateHistoryButtons();
    }

    function applyFieldHistory(field, value) {
        if (!field || !document.contains(field)) {
            return false;
        }

        field.value = value == null ? '' : String(value);
        field.dataset.undoBefore = field.value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        autoGrow(field);
        return true;
    }

    function applyHistoryAction(action, direction) {
        var applied = false;
        var useBefore = direction === 'undo';

        if (action.type === 'field') {
            return applyFieldHistory(action.field, useBefore ? action.before : action.after);
        }

        if (action.type === 'filter') {
            return restoreFilterState(useBefore ? action.before : action.after);
        }

        if (action.type === 'row-insert') {
            return restoreInsertedRow(action, direction);
        }

        if (action.type === 'cell-color') {
            (action.cells || []).forEach(function (entry) {
                if (entry.cell && document.contains(entry.cell)) {
                    setCellColor(entry.cell, useBefore ? entry.before : entry.after, true, false);
                    applied = true;
                }
            });
            return applied;
        }

        if (action.type === 'cell-style') {
            (action.cells || []).forEach(function (entry) {
                if (entry.cell && document.contains(entry.cell)) {
                    setCellStyle(entry.cell, useBefore ? entry.before : entry.after, true, false);
                    applied = true;
                }
            });
            return applied;
        }

        if (action.type === 'cell-format') {
            (action.cells || []).forEach(function (entry) {
                if (entry.cell && document.contains(entry.cell)) {
                    var state = useBefore ? entry.before : entry.after;
                    setCellColor(entry.cell, (state && state.color) || '', true, false);
                    setCellStyle(entry.cell, (state && state.style) || {}, true, false);
                    applyConditionalFormattingForCell(entry.cell);
                    applied = true;
                }
            });
            return applied;
        }

        if (action.type === 'cells-clear') {
            (action.fields || []).forEach(function (entry) {
                var value = useBefore ? entry.before : (Object.prototype.hasOwnProperty.call(entry, 'after') ? entry.after : '');
                if (applyFieldHistory(entry.field, value)) {
                    applied = true;
                }
            });
            return applied;
        }

        if (action.type === 'fill') {
            (action.fields || []).forEach(function (entry) {
                var value = useBefore ? entry.before : (Object.prototype.hasOwnProperty.call(entry, 'after') ? entry.after : '');
                if (applyFieldHistory(entry.field, value)) {
                    applied = true;
                }
            });

            (action.formats || []).forEach(function (entry) {
                if (entry.cell && document.contains(entry.cell)) {
                    var state = useBefore ? entry.before : entry.after;
                    setCellColor(entry.cell, (state && state.color) || '', true, false);
                    setCellStyle(entry.cell, (state && state.style) || {}, true, false);
                    applyConditionalFormattingForCell(entry.cell);
                    applied = true;
                }
            });

            return applied;
        }

        return false;
    }

    function applyHistory(direction) {
        var source = direction === 'redo' ? redoStack : undoStack;
        var target = direction === 'redo' ? undoStack : redoStack;
        var action = source.pop();

        if (!action) {
            updateHistoryButtons();
            return false;
        }

        isApplyingUndo = true;
        var applied = false;

        try {
            applied = applyHistoryAction(action, direction);
        } finally {
            isApplyingUndo = false;
        }

        if (!applied) {
            updateHistoryButtons();
            return false;
        }

        target.push(action);
        capHistoryStack(target);
        updateHistoryButtons();
        setStatus(direction === 'redo' ? 'Refeito' : 'Desfeito', 'saved');
        return true;
    }

    function applyUndo() {
        return applyHistory('undo');
    }

    function applyRedo() {
        return applyHistory('redo');
    }

    function readFilterState() {
        return {
            category: categoryFilterValue ? String(categoryFilterValue.value || '') : '',
            productColor: String(productColorFilterValue || ''),
            winner: String(winnerFilterValue || '')
        };
    }

    function presenceCssValue(value) {
        value = String(value || '');
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }

        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function presenceColumnLabel(cell) {
        if (!cell) {
            return '';
        }

        var key = String(cell.dataset.colKey || '');
        if (key.indexOf('supplier-') === 0) {
            var priceInput = cell.querySelector('.price-input[data-supplier-name]');
            return priceInput ? String(priceInput.dataset.supplierName || '') : 'Fornecedor';
        }

        var header = grid.querySelector('thead th[data-col-index="' + presenceCssValue(cell.dataset.col || '') + '"]');
        if (header) {
            var label = header.querySelector('input') ? header.querySelector('input').value : header.textContent;
            return String(label || '').replace(/\s+/g, ' ').trim();
        }

        return key;
    }

    function currentPresencePayload() {
        var cell = activeCell || grid.querySelector('td.sheet-cell.is-active-cell');
        var row = cell ? cell.closest('tr.sheet-row') : activeRow;
        var filter = readFilterState();

        return {
            client_id: syncClientId,
            item_id: row ? Number(row.dataset.itemId || 0) : 0,
            row_order: row ? Number(row.dataset.rowOrder || 0) : 0,
            col_key: cell ? String(cell.dataset.colKey || '') : '',
            col_label: presenceColumnLabel(cell),
            categoria: filter.category || '',
            cor: filter.productColor || '',
            vencedor: filter.winner || '',
            editando: Boolean(cell && cell.classList.contains('is-editing-cell'))
        };
    }

    function presencePayloadKey(payload) {
        return JSON.stringify({
            item_id: payload.item_id || 0,
            row_order: payload.row_order || 0,
            col_key: payload.col_key || '',
            categoria: payload.categoria || '',
            cor: payload.cor || '',
            vencedor: payload.vencedor || '',
            editando: Boolean(payload.editando)
        });
    }

    function presenceCellForUser(user) {
        if (!user || !user.col_key) {
            return null;
        }

        var row = null;
        var itemId = Number(user.item_id || 0);
        if (itemId > 0) {
            row = grid.querySelector('tbody tr.sheet-row[data-item-id="' + itemId + '"]');
        }

        if (!row && user.row_order !== null && user.row_order !== undefined) {
            row = grid.querySelector('tbody tr.sheet-row[data-row-order="' + Number(user.row_order || 0) + '"]');
        }

        if (!row || row.hidden || row.style.display === 'none') {
            return null;
        }

        return row.querySelector('td.sheet-cell[data-col-key="' + presenceCssValue(user.col_key) + '"]');
    }

    function clearPresenceMarks() {
        grid.querySelectorAll('td.sheet-cell.is-remote-active, td.sheet-cell.is-remote-editing').forEach(function (cell) {
            cell.classList.remove('is-remote-active', 'is-remote-editing');
            cell.style.removeProperty('--remote-presence-color');
        });
    }

    function renderPresence(payload) {
        presenceLast = payload || presenceLast;
        var users = presenceLast && Array.isArray(presenceLast.users) ? presenceLast.users : [];
        var total = Number((presenceLast && presenceLast.total) || users.length || 1);
        var others = users.filter(function (user) {
            return !user.self;
        });

        if (presenceSummary) {
            presenceSummary.textContent = total === 1 ? '1 pessoa usando' : String(total) + ' pessoas usando';
        }

        if (presenceList) {
            presenceList.innerHTML = '';
            others.slice(0, 6).forEach(function (user) {
                var chip = document.createElement('span');
                var where = user.col_label ? String(user.col_label) : 'na planilha';
                var outOfFilter = presenceCellForUser(user) ? '' : ' fora do filtro atual';
                chip.className = 'presence-chip';
                chip.style.setProperty('--presence-color', String(user.color || '#2563eb'));
                chip.textContent = String(user.name || 'Usuario') + ' em ' + where + outOfFilter;
                presenceList.appendChild(chip);
            });
        }

        clearPresenceMarks();
        others.forEach(function (user) {
            var cell = presenceCellForUser(user);
            if (!cell) {
                return;
            }

            cell.classList.add('is-remote-active');
            cell.style.setProperty('--remote-presence-color', String(user.color || '#2563eb'));
            if (user.editing) {
                cell.classList.add('is-remote-editing');
            }
        });
    }

    function sendPresence(force) {
        if (presencePinging || !syncClientId || syncReloading) {
            return;
        }

        var payload = currentPresencePayload();
        var key = presencePayloadKey(payload);
        if (!force && sendPresence.lastKey === key) {
            return;
        }

        sendPresence.lastKey = key;
        presencePinging = true;
        api('presence_ping', payload).then(function (result) {
            if (result && result.presence) {
                renderPresence(result.presence);
            }
        }).catch(function () {
            if (presenceSummary) {
                presenceSummary.textContent = 'Presenca instavel';
            }
        }).finally(function () {
            presencePinging = false;
        });
    }

    function schedulePresencePing(delay) {
        clearTimeout(presenceTimer);
        presenceTimer = setTimeout(function () {
            sendPresence(false);
        }, delay || 120);
    }

    function filterStatesEqual(a, b) {
        a = a || {};
        b = b || {};
        return String(a.category || '') === String(b.category || '')
            && String(a.productColor || '') === String(b.productColor || '')
            && String(a.winner || '') === String(b.winner || '');
    }

    function recordFilterChange(before) {
        if (isApplyingFilterHistory) {
            return;
        }

        var after = readFilterState();
        if (!filterStatesEqual(before, after)) {
            pushUndo({ type: 'filter', before: before, after: after });
            queueSharedFilterSync(after);
            schedulePresencePing(180);
        }
    }

    function restoreFilterState(state) {
        state = state || {};
        isApplyingFilterHistory = true;
        try {
            if (categoryFilterValue) {
                categoryFilterValue.value = String(state.category || '');
            }
            productColorFilterValue = String(state.productColor || '');
            winnerFilterValue = String(state.winner || '');
            clearCellSelection();
            applyGridFilters({ status: false });
            updateProductColorOptions();
            updateWinnerOptions();
            renderCategoryOptions([]);
        } finally {
            isApplyingFilterHistory = false;
        }
        setStatus('Filtro restaurado', 'saved');
        if (!isApplyingRemoteSync) {
            queueSharedFilterSync(readFilterState());
        }
        schedulePresencePing(120);
        return true;
    }

    function autoGrow(field) {
        if (!field || !field.matches('textarea.sheet-input, textarea.winner-output')) {
            return;
        }

        var keepViewport = document.activeElement === field && grid && grid.contains(field);
        var beforeTop = keepViewport ? field.getBoundingClientRect().top : 0;
        var minHeight = field.classList.contains('sheet-input') ? 42 : 32;

        field.style.height = minHeight + 'px';
        field.style.height = Math.max(minHeight, field.scrollHeight) + 'px';

        if (keepViewport && document.contains(field)) {
            var delta = field.getBoundingClientRect().top - beforeTop;
            if (Math.abs(delta) > 1) {
                window.scrollBy(0, delta);
            }
        }
    }

    function autoGrowRow(row) {
        if (!row) {
            return;
        }

        row.querySelectorAll('textarea.sheet-input, textarea.winner-output').forEach(autoGrow);
    }

    function isExternalWidgetTarget(target) {
        return Boolean(target && target.closest && target.closest('.miauw-widget'));
    }

    function isSheetControlTarget(target) {
        return Boolean(target && target.closest && target.closest('.sheet-format-toolbar, .sheet-context-menu, .filter-popover, .conditional-format-popover, .selection-summary, .cotacao-nav, .sheet-heading-actions'));
    }

    function blurActiveSheetControl() {
        var active = document.activeElement;
        if (!active || active === document.body || !active.matches || !isSheetControlTarget(active)) {
            return;
        }

        if (active.matches('input, textarea, select, button')) {
            active.blur();
        }
    }

    function api(action, payload) {
        var body = new URLSearchParams();
        body.set('action', action);
        body.set('csrf_token', csrfToken);
        body.set('bloco', grid.dataset.block || 'cotacao-geral');

        Object.keys(payload || {}).forEach(function (key) {
            var value = payload[key];

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.keys(value).forEach(function (subKey) {
                    body.set(key + '[' + subKey + ']', value[subKey]);
                });
                return;
            }

            body.set(key, value == null ? '' : value);
        });

        return fetch('/cotacao/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: body.toString()
        }).then(function (response) {
            return response.text().then(function (text) {
                var json = null;

                try {
                    json = JSON.parse(text);
                } catch (error) {
                    if (response.status === 401 || text.indexOf('<!doctype') !== -1 || text.indexOf('<html') !== -1) {
                        throw new Error('Sessao expirada ou resposta invalida. Atualize a pagina e entre novamente.');
                    }

                    throw new Error('Resposta invalida do servidor.');
                }

                if (!response.ok || !json.ok) {
                    throw new Error(json.message || 'Nao foi possivel salvar.');
                }
                var localDataActions = {
                    save_row: true,
                    add_empty_rows: true,
                    delete_row: true,
                    add_category: true,
                    delete_category: true,
                    save_conditional_rule: true,
                    delete_conditional_rule: true,
                    sync_filter: true,
                    presence_ping: true
                };

                if (action !== 'sync_pull' && !localDataActions[action]) {
                    rememberSyncState(json.sync || json.state || (json.snapshot ? json.snapshot.state : null), {
                        deferUnappliedStructure: true
                    });
                }
                return json;
            });
        });
    }

    function rememberSyncState(state, options) {
        if (!state || typeof state !== 'object') {
            return;
        }
        options = options || {};

        if (options.deferUnappliedStructure && Number(state.estrutura_versao || 0) > syncKnownStructureVersion) {
            return;
        }

        if (!options.skipVersion) {
            syncKnownVersion = Math.max(syncKnownVersion, Number(state.versao || 0));
        }
        if (!options.skipData) {
            syncKnownDataVersion = Math.max(syncKnownDataVersion, Number(state.dados_versao || 0));
        }
        if (!options.skipFilter) {
            syncKnownFilterVersion = Math.max(syncKnownFilterVersion, Number(state.filtro_versao || 0));
        }
        if (!options.skipStructure) {
            syncKnownStructureVersion = Math.max(syncKnownStructureVersion, Number(state.estrutura_versao || 0));
        }
        grid.dataset.syncVersion = String(syncKnownVersion || 0);
        grid.dataset.syncDataVersion = String(syncKnownDataVersion || 0);
        grid.dataset.syncFilterVersion = String(syncKnownFilterVersion || 0);
        grid.dataset.syncStructureVersion = String(syncKnownStructureVersion || 0);
    }

    function syncFilterStateFromServer(state) {
        state = state || {};
        return {
            category: String(state.filtro_categoria || ''),
            productColor: String(state.filtro_cor || ''),
            winner: String(state.filtro_vencedor || '')
        };
    }

    function appendCsvToken(value, token) {
        token = String(token || '').trim();
        if (!token) {
            return String(value || '');
        }

        var tokens = String(value || '').split(',').map(function (part) {
            return part.trim();
        }).filter(Boolean);

        if (tokens.indexOf(token) === -1) {
            tokens.push(token);
        }

        return tokens.join(',');
    }

    function dirtyInfoForInput(input) {
        if (!input) {
            return null;
        }

        if (input.classList.contains('price-input')) {
            return { price: input.dataset.supplierId || '' };
        }

        var cell = input.closest ? input.closest('.sheet-cell') : null;
        var key = cell ? String(cell.dataset.colKey || '') : '';
        if (key) {
            return { field: key };
        }

        if (input.classList.contains('row-color-input')) {
            return { field: 'cor' };
        }
        if (input.classList.contains('row-colors-input')) {
            return { field: 'cores' };
        }
        if (input.classList.contains('row-styles-input')) {
            return { field: 'estilos' };
        }

        return null;
    }

    function mergeDirtyList(base, values) {
        var output = String(base || '');

        (Array.isArray(values) ? values : [values]).forEach(function (value) {
            output = appendCsvToken(output, value);
        });

        return output;
    }

    function mergeDirtyInfo(target, dirty) {
        target = target || { fields: [], prices: [] };
        if (!dirty) {
            return target;
        }

        if (dirty.field) {
            target.fields.push(dirty.field);
        }
        if (Array.isArray(dirty.fields)) {
            target.fields = target.fields.concat(dirty.fields);
        }
        if (dirty.price) {
            target.prices.push(dirty.price);
        }
        if (Array.isArray(dirty.prices)) {
            target.prices = target.prices.concat(dirty.prices);
        }

        return target;
    }

    function markRowDirty(row, dirty) {
        if (!row) {
            return;
        }

        row.dataset.syncDirty = '1';
        row.dataset.syncDirtyAt = String(Date.now());

        if (!dirty) {
            return;
        }

        row.dataset.syncDirtyFields = mergeDirtyList(row.dataset.syncDirtyFields || '', dirty.field || dirty.fields || []);
        row.dataset.syncDirtyPrices = mergeDirtyList(row.dataset.syncDirtyPrices || '', dirty.price || dirty.prices || []);
    }

    function markRowClean(row) {
        if (!row) {
            return;
        }

        delete row.dataset.syncDirty;
        delete row.dataset.syncDirtyAt;
        delete row.dataset.syncSaving;
        delete row.dataset.syncSavingAt;
        delete row.dataset.syncDirtyFields;
        delete row.dataset.syncDirtyPrices;
    }

    function hasLocalSheetEdit() {
        var active = document.activeElement;
        if (active && grid.contains(active) && active.matches('input, textarea') && active.readOnly === false) {
            return true;
        }

        return Array.prototype.some.call(grid.querySelectorAll('tbody tr[data-sync-dirty="1"], tbody tr[data-sync-saving="1"]'), function (row) {
            return !!row;
        });
    }

    function rowHasLocalSyncLock(row) {
        if (!row) {
            return false;
        }

        var active = document.activeElement;
        return row.dataset.syncDirty === '1'
            || row.dataset.syncSaving === '1'
            || Boolean(active && row.contains(active) && active.matches('input, textarea') && active.readOnly === false);
    }

    function activeSheetEditor() {
        var active = document.activeElement;
        if (!active || !grid || !grid.contains(active) || !active.matches || !active.matches('.sheet-input.is-editing')) {
            return null;
        }

        return active;
    }

    function rowHasActiveSheetEditor(row) {
        var editor = activeSheetEditor();
        return Boolean(editor && row && row.contains(editor));
    }

    function syncSnapshotVersion(snapshot) {
        return Number(snapshot && snapshot.state ? snapshot.state.versao || 0 : 0);
    }

    function syncSnapshotDataVersion(snapshot) {
        return Number(snapshot && snapshot.state ? snapshot.state.dados_versao || 0 : 0);
    }

    function syncSnapshotFilterVersion(snapshot) {
        return Number(snapshot && snapshot.state ? snapshot.state.filtro_versao || 0 : 0);
    }

    function syncSnapshotStructureVersion(snapshot) {
        return Number(snapshot && snapshot.state ? snapshot.state.estrutura_versao || 0 : 0);
    }

    function queuePendingSyncSnapshot(snapshot, structureChanged, options) {
        options = options || {};
        var nextVersion = syncSnapshotVersion(snapshot);

        if (!syncPendingSnapshot || nextVersion >= syncSnapshotVersion(syncPendingSnapshot.snapshot)) {
            syncPendingSnapshot = {
                snapshot: snapshot,
                structureChanged: Boolean(structureChanged) || Boolean(syncPendingSnapshot && syncPendingSnapshot.structureChanged),
                dataChanged: options.dataChanged !== false || Boolean(syncPendingSnapshot && syncPendingSnapshot.dataChanged),
                filterChanged: options.filterChanged !== false || Boolean(syncPendingSnapshot && syncPendingSnapshot.filterChanged)
            };
            return;
        }

        if (structureChanged) {
            syncPendingSnapshot.structureChanged = true;
        }
        if (options.dataChanged !== false) {
            syncPendingSnapshot.dataChanged = true;
        }
        if (options.filterChanged !== false) {
            syncPendingSnapshot.filterChanged = true;
        }
    }

    function queueSharedFilterSync(state) {
        if (isApplyingRemoteSync || !grid || syncReloading) {
            return;
        }

        clearTimeout(syncFilterTimer);
        syncFilterTimer = setTimeout(function () {
            var next = state || readFilterState();
            api('sync_filter', {
                categoria: next.category || '',
                cor: next.productColor || '',
                vencedor: next.winner || '',
                client_id: syncClientId
            }).catch(function (error) {
                setStatus(error.message, 'error');
            });
        }, 180);
    }

    function applyRemoteFilterState(state) {
        var next = syncFilterStateFromServer(state);
        var before = readFilterState();

        if (filterStatesEqual(before, next)) {
            return false;
        }

        isApplyingRemoteSync = true;
        try {
            if (categoryFilterValue) {
                categoryFilterValue.value = next.category;
            }
            productColorFilterValue = next.productColor;
            winnerFilterValue = next.winner;
            clearCellSelection();
            applyGridFilters({ status: false });
            updateProductColorOptions();
            updateWinnerOptions();
            renderCategoryOptions([]);
        } finally {
            isApplyingRemoteSync = false;
        }

        setStatus(next.category || next.productColor || next.winner ? 'Filtro sincronizado ao vivo' : 'Filtro geral sincronizado', 'saved');
        return true;
    }

    function setFieldValueSilently(field, value) {
        if (!field) {
            return;
        }

        value = value == null ? '' : String(value);
        if (field.value !== value) {
            field.value = value;
        }
        autoGrow(field);
    }

    function setRowJsonInput(row, selector, value) {
        var input = row.querySelector(selector);
        if (!input) {
            return;
        }

        if (!value || (typeof value === 'object' && !Object.keys(value).length)) {
            input.value = '';
            return;
        }

        input.value = typeof value === 'string' ? value : JSON.stringify(value);
    }

    function applyRemoteCellVisuals(row, colors, styles) {
        colors = colors && typeof colors === 'object' ? colors : {};
        styles = styles && typeof styles === 'object' ? styles : {};

        row.querySelectorAll('.sheet-cell').forEach(function (cell) {
            var key = cell.dataset.colKey || '';
            var color = String(colors[key] || '').trim().toLowerCase();
            cell.dataset.color = color;
            cell.style.backgroundColor = color || '';
            applyCellStyleDataset(cell, styles[key] || {});
            clearConditionalFormattingForCell(cell);
            cell.classList.remove('winner-price');
        });
    }

    function applyRemoteRow(row, item) {
        item = item || {};
        var itemId = Number(item.id || 0);
        enableDelete(row, itemId);
        setRowOrder(row, Number(item.ordem || 0) || computeRowOrder(row));
        row.dataset.lineEmpty = String(item.linha_vazia || '0') === '1' ? '1' : '0';
        row.dataset.color = String(item.cor || '');
        row.classList.remove('is-selected');

        var colorInput = row.querySelector('.row-color-input');
        if (colorInput) {
            colorInput.value = String(item.cor || '');
        }
        setRowJsonInput(row, '.row-colors-input', item.cores || {});
        setRowJsonInput(row, '.row-styles-input', item.estilos || {});

        setFieldValueSilently(row.querySelector('[name$="[ean]"]'), item.ean || '');
        setFieldValueSilently(row.querySelector('[name$="[produto]"]'), item.produto || '');
        setFieldValueSilently(row.querySelector('[name$="[quantidade]"]'), item.quantidade || '');
        setFieldValueSilently(row.querySelector('[name$="[categoria]"]'), item.categoria || '');

        row.querySelectorAll('.price-input').forEach(function (input) {
            var supplierId = String(input.dataset.supplierId || '');
            setFieldValueSilently(input, item.precos && Object.prototype.hasOwnProperty.call(item.precos, supplierId) ? item.precos[supplierId] : '');
        });

        applyRemoteCellVisuals(row, item.cores || {}, item.estilos || {});

        var winnerOutput = row.querySelector('.winner-output');
        if (winnerOutput) {
            winnerOutput.value = item.winner || 'Sem vencedor';
            autoGrow(winnerOutput);
        }

        if (item.winner_supplier_id) {
            var winnerInput = row.querySelector('.price-input[data-supplier-id="' + String(item.winner_supplier_id) + '"]');
            if (winnerInput) {
                winnerInput.closest('td')?.classList.add('winner-price');
            }
        }

        updateCategoryConditional(row, false);
        updateOrderRegisteredInfo(row, item.encomenda_registrada_em || '', item.encomenda_registrada_label || '', false);
        applyConditionalFormatting(row);
        autoGrowRow(row);
        prepareReadonly(row);
        markRowClean(row);
    }

    function ensureRowCapacity(targetCount) {
        var current = grid.querySelectorAll('tbody tr').length;
        if (current >= targetCount) {
            return;
        }

        addRows(targetCount - current);
    }

    function applyRemoteItems(items) {
        items = Array.isArray(items) ? items : [];
        items = items.slice().sort(function (a, b) {
            var orderA = Number(a && a.ordem || 0);
            var orderB = Number(b && b.ordem || 0);
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return Number(a && a.id || 0) - Number(b && b.id || 0);
        });
        ensureRowCapacity(Math.max(50, items.length + 10));

        var rows = Array.prototype.slice.call(grid.querySelectorAll('tbody tr'));
        var rowsById = {};
        var usedRows = new Set();
        var orderedRows = [];
        var skipped = false;
        rows.forEach(function (row) {
            var itemId = String(row.dataset.itemId || '');
            if (itemId) {
                rowsById[itemId] = row;
            }
        });

        items.forEach(function (item, index) {
            var row = rowsById[String(item.id || '')] || rows[index];
            if (row && (usedRows.has(row) || rowHasLocalSyncLock(row))) {
                row = rows.find(function (candidate) {
                    return !usedRows.has(candidate) && !rowHasLocalSyncLock(candidate);
                }) || row;
            }
            if (!row || rowHasLocalSyncLock(row)) {
                skipped = true;
                return;
            }
            applyRemoteRow(row, item);
            usedRows.add(row);
            orderedRows.push(row);
        });

        rows.forEach(function (row) {
            if (row && row.dataset.itemId && !rowHasLocalSyncLock(row) && !usedRows.has(row)) {
                clearRow(row);
                markRowClean(row);
            }
        });

        if (orderedRows.length) {
            var tbody = grid.querySelector('tbody');
            var anchor = Array.prototype.slice.call(tbody.querySelectorAll('tr')).find(function (row) {
                return !usedRows.has(row) && !rowHasLocalSyncLock(row);
            }) || null;

            orderedRows.forEach(function (row) {
                if (row && row.parentNode === tbody) {
                    tbody.insertBefore(row, anchor);
                }
            });

            renumberVisibleRows();
        }

        return { skipped: skipped };
    }

    function applyRemoteRules(rules) {
        if (!Array.isArray(rules)) {
            return;
        }

        conditionalRules = rules.map(sanitizeConditionalRule).filter(function (rule) {
            return rule.id > 0 && rule.column_key && rule.background;
        });
        renderConditionalRuleList();
        applyConditionalFormatting();
    }

    function applySyncSnapshot(snapshot, structureChanged, options) {
        if (!snapshot || typeof snapshot !== 'object') {
            return;
        }
        options = options || {};
        var dataChanged = options.dataChanged !== false;
        var filterChanged = options.filterChanged !== false;

        if (structureChanged) {
            if (hasLocalSheetEdit()) {
                queuePendingSyncSnapshot(snapshot, structureChanged, {
                    dataChanged: dataChanged,
                    filterChanged: filterChanged
                });
                setStatus('Atualizacao de colunas aguardando sua edicao...', 'waiting');
                return;
            }
            syncReloading = true;
            setStatus('Estrutura atualizada em outro computador. Recarregando...', 'saving');
            window.setTimeout(function () {
                window.location.reload();
            }, 350);
            return;
        }

        syncPendingSnapshot = null;
        var itemResult = { skipped: false };
        isApplyingRemoteSync = true;
        try {
            if (dataChanged) {
                itemResult = applyRemoteItems(snapshot.items || []);
                applyRemoteRules(snapshot.rules || []);
            }
            if (dataChanged && Array.isArray(snapshot.categories)) {
                renderCategoryOptions(snapshot.categories, true);
            }
            if (filterChanged) {
                applyRemoteFilterState(snapshot.state || {});
            }
            updateProductColorOptions();
            updateWinnerOptions();
            applyGridFilters({ status: false });
            renderPresence(presenceLast);
        } finally {
            isApplyingRemoteSync = false;
        }

        rememberSyncState(snapshot.state, {
            skipVersion: itemResult.skipped,
            skipData: itemResult.skipped
        });

        if (itemResult.skipped) {
            queuePendingSyncSnapshot(snapshot, false, {
                dataChanged: true,
                filterChanged: false
            });
            setStatus('Filtro sincronizado; dados aguardando sua edicao terminar', 'waiting');
            return;
        }

        setStatus(filterChanged && !dataChanged ? 'Filtro sincronizado ao vivo' : 'Cotacao sincronizada ao vivo', 'saved');
    }

    function flushPendingSyncSnapshot() {
        if (!syncPendingSnapshot || hasLocalSheetEdit()) {
            return;
        }

        var pending = syncPendingSnapshot;
        syncPendingSnapshot = null;
        var needsStructure = pending.structureChanged && syncSnapshotStructureVersion(pending.snapshot) > syncKnownStructureVersion;
        var needsData = pending.dataChanged !== false && syncSnapshotDataVersion(pending.snapshot) > syncKnownDataVersion;
        var needsFilter = pending.filterChanged !== false && syncSnapshotFilterVersion(pending.snapshot) > syncKnownFilterVersion;

        if (!needsStructure && !needsData && !needsFilter) {
            return;
        }

        applySyncSnapshot(pending.snapshot, needsStructure, {
            dataChanged: needsData,
            filterChanged: needsFilter
        });
    }

    function pullSync() {
        if (syncPulling || syncReloading || document.hidden) {
            return;
        }

        syncPulling = true;
        api('sync_pull', {
            known_version: syncKnownVersion,
            known_data_version: syncKnownDataVersion,
            known_filter_version: syncKnownFilterVersion,
            known_structure_version: syncKnownStructureVersion,
            client_id: syncClientId
        }).then(function (result) {
            syncErrorCount = 0;
            if (result.changed && result.snapshot) {
                applySyncSnapshot(result.snapshot, Boolean(result.structure_changed), {
                    dataChanged: result.data_changed !== false,
                    filterChanged: result.filter_changed !== false
                });
            } else {
                rememberSyncState(result.state);
                flushPendingSyncSnapshot();
            }
        }).catch(function (error) {
            syncErrorCount += 1;
            if (syncErrorCount >= 4) {
                setStatus((error && error.message ? error.message : 'Sincronia instavel') + ' Atualize a pagina se repetir.', 'error');
            }
            if (syncErrorCount >= 8 && !hasLocalSheetEdit()) {
                syncReloading = true;
                window.location.reload();
            }
        }).finally(function () {
            syncPulling = false;
        });
    }

    function startLiveSync() {
        var loop = function () {
            pullSync();
            sendPresence(true);
            window.setTimeout(loop, document.hidden ? 5000 : 1200);
        };

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                pullSync();
                sendPresence(true);
                flushPendingSyncSnapshot();
            }
        });
        window.addEventListener('focus', function () {
            pullSync();
            sendPresence(true);
            flushPendingSyncSnapshot();
        });
        window.addEventListener('online', function () {
            pullSync();
            sendPresence(true);
            flushPendingSyncSnapshot();
        });
        sendPresence(true);
        window.setTimeout(loop, 900);
    }

    function parseMoney(value) {
        value = String(value || '').trim();

        if (value === '') {
            return NaN;
        }

        if (value.indexOf(',') !== -1) {
            value = value.replace(/\./g, '').replace(',', '.');
        }

        value = value.replace(/[^0-9.-]/g, '');

        if (value === '' || value === '-' || value === '.' || value === '-.') {
            return NaN;
        }

        return Number(value);
    }

    function formatMoney(value) {
        return Number(value).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function cellDisplayValue(cell) {
        if (!cell) {
            return '';
        }

        var field = cell.querySelector('.sheet-input, .winner-output');
        if (!field) {
            return '';
        }

        return String('value' in field ? field.value : field.textContent || '').trim();
    }

    function numericValueFromCell(cell) {
        var text = cellDisplayValue(cell);
        if (text === '') {
            return NaN;
        }

        var value = parseMoney(text);
        return Number.isFinite(value) ? value : NaN;
    }

    function selectionSummaryStats() {
        var cells = selectedCells();
        var numericValues = [];
        var filledCount = 0;

        cells.forEach(function (cell) {
            var text = cellDisplayValue(cell);
            if (text !== '') {
                filledCount += 1;
            }

            var value = numericValueFromCell(cell);
            if (Number.isFinite(value)) {
                numericValues.push(value);
            }
        });

        var sum = numericValues.reduce(function (total, value) {
            return total + value;
        }, 0);

        return {
            selected: cells.length,
            filled: filledCount,
            numbers: numericValues.length,
            sum: sum,
            average: numericValues.length ? sum / numericValues.length : 0,
            min: numericValues.length ? Math.min.apply(Math, numericValues) : 0,
            max: numericValues.length ? Math.max.apply(Math, numericValues) : 0
        };
    }

    function summaryMetricLabel(metric, stats) {
        if (metric === 'average') {
            return 'Media: ' + formatMoney(stats.average);
        }

        if (metric === 'min') {
            return 'Min: ' + formatMoney(stats.min);
        }

        if (metric === 'max') {
            return 'Max: ' + formatMoney(stats.max);
        }

        if (metric === 'count') {
            return 'Contagem: ' + stats.filled;
        }

        if (metric === 'number-count') {
            return 'Numeros: ' + stats.numbers;
        }

        return 'Soma: ' + formatMoney(stats.sum);
    }

    function updateSelectionSummary() {
        if (!selectionSummary || !selectionSummaryValue || !selectionSummaryMenu) {
            return;
        }

        var stats = selectionSummaryStats();
        var shouldShow = stats.selected > 0 && stats.numbers > 0;
        selectionSummary.hidden = !shouldShow;

        if (!shouldShow) {
            selectionSummaryMenu.hidden = true;
            return;
        }

        if ((selectionSummaryMetric === 'average' || selectionSummaryMetric === 'min' || selectionSummaryMetric === 'max') && !stats.numbers) {
            selectionSummaryMetric = 'sum';
        }

        selectionSummaryValue.textContent = summaryMetricLabel(selectionSummaryMetric, stats);
        selectionSummary.querySelectorAll('[data-summary-metric]').forEach(function (button) {
            var metric = button.dataset.summaryMetric || 'sum';
            var value = button.querySelector('[data-summary-metric-value]');
            if (value) {
                value.textContent = summaryMetricLabel(metric, stats).split(': ').slice(1).join(': ');
            }
            button.classList.toggle('is-active', metric === selectionSummaryMetric);
        });
    }

    function clearWinnerClasses(row) {
        row.querySelectorAll('.winner-price').forEach(function (cell) {
            cell.classList.remove('winner-price');
        });
    }

    function updateRowWinner(row) {
        var prices = Array.prototype.slice.call(row.querySelectorAll('.price-input'));
        var winner = null;

        prices.forEach(function (input) {
            var value = parseMoney(input.value);

            if (!Number.isFinite(value) || value <= 0) {
                return;
            }

            if (!winner || value < winner.value) {
                winner = {
                    value: value,
                    id: input.dataset.supplierId || '',
                    name: input.dataset.supplierName || 'Cotacao',
                    input: input
                };
            }
        });

        clearWinnerClasses(row);
        var output = row.querySelector('.winner-output');

        if (!output) {
            return;
        }

        if (!winner) {
            output.value = 'Sem vencedor';
            autoGrow(output);
            return;
        }

        output.value = winner.name + ' - ' + formatMoney(winner.value);
        autoGrow(output);
        winner.input.closest('td').classList.add('winner-price');
    }

    function decimalBlur(event) {
        var input = event.target;
        if (!input.matches('[inputmode="decimal"]')) {
            return;
        }

        var value = input.value.trim();
        if (value === '') {
            var emptyRow = input.closest('tr');
            updateRowWinner(emptyRow);
            applyConditionalFormatting(emptyRow);
            scheduleRowSave(emptyRow, 850, dirtyInfoForInput(input));
            updateSelectionSummary();
            return;
        }

        var number = parseMoney(value);
        if (!Number.isFinite(number)) {
            return;
        }

        input.value = number.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        var row = input.closest('tr');
        updateRowWinner(row);
        applyConditionalFormatting(row);
        scheduleRowSave(row, 850, dirtyInfoForInput(input));
        updateSelectionSummary();
    }

    function valueOf(parent, selector) {
        var input = parent.querySelector(selector);
        return input ? input.value : '';
    }

    function numericRowOrder(row) {
        return row ? Number(row.dataset.rowOrder || 0) : 0;
    }

    function setRowOrder(row, order) {
        if (!row) {
            return 0;
        }

        order = Math.max(1, Math.round(Number(order || 0)));
        row.dataset.rowOrder = String(order);
        return order;
    }

    function computeRowOrder(row) {
        if (!row) {
            return 1;
        }

        var current = numericRowOrder(row);
        if (current > 0) {
            return current;
        }

        var previous = row.previousElementSibling;
        var previousOrder = 0;
        while (previous) {
            previousOrder = numericRowOrder(previous);
            if (previousOrder > 0) {
                break;
            }
            previous = previous.previousElementSibling;
        }

        var next = row.nextElementSibling;
        var nextOrder = 0;
        while (next) {
            nextOrder = numericRowOrder(next);
            if (nextOrder > 0) {
                break;
            }
            next = next.nextElementSibling;
        }

        if (previousOrder > 0 && nextOrder > previousOrder + 1) {
            return Math.floor((previousOrder + nextOrder) / 2);
        }

        if (previousOrder > 0) {
            return previousOrder + 1000;
        }

        if (nextOrder > 1000) {
            return nextOrder - 1000;
        }

        var rows = Array.prototype.slice.call(grid.querySelectorAll('tbody tr'));
        return (Math.max(0, rows.indexOf(row)) + 1) * 1000;
    }

    function allSupplierIds() {
        return Array.prototype.slice.call(grid.querySelectorAll('.supplier-heading'))
            .map(function (header) {
                return String(header.dataset.supplierId || '');
            })
            .filter(Boolean);
    }

    function rowPayload(row) {
        var prices = {};
        row.querySelectorAll('.price-input').forEach(function (input) {
            prices[input.dataset.supplierId] = input.value;
        });

        return {
            id: row.dataset.itemId || '',
            ean: valueOf(row, '[name$="[ean]"]'),
            produto: valueOf(row, '[name$="[produto]"]'),
            quantidade: valueOf(row, '[name$="[quantidade]"]'),
            categoria: valueOf(row, '[name$="[categoria]"]'),
            cor: row.dataset.color || valueOf(row, '.row-color-input'),
            cores: valueOf(row, '.row-colors-input'),
            estilos: valueOf(row, '.row-styles-input'),
            ordem: setRowOrder(row, computeRowOrder(row)),
            linha_vazia: row.dataset.lineEmpty || '0',
            campos: row.dataset.syncDirtyFields || '',
            precos_alterados: row.dataset.syncDirtyPrices || '',
            precos: prices
        };
    }

    function rowHasContent(payload) {
        if (payload.ean || payload.produto || payload.quantidade || payload.categoria) {
            return true;
        }

        return Object.keys(payload.precos || {}).some(function (key) {
            return String(payload.precos[key] || '').trim() !== '';
        });
    }

    function appendCsvTokens(current, tokens) {
        var map = {};
        String(current || '').split(',').forEach(function (token) {
            token = token.trim();
            if (token) {
                map[token] = true;
            }
        });
        (tokens || []).forEach(function (token) {
            token = String(token || '').trim();
            if (token) {
                map[token] = true;
            }
        });
        return Object.keys(map).join(',');
    }

    function enableDelete(row, itemId) {
        row.dataset.itemId = String(itemId);
        var idInput = row.querySelector('.row-id-input');

        if (idInput) {
            idInput.value = String(itemId);
        }
    }

    function saveRow(row) {
        var payload = rowPayload(row);
        var itemId = Number(payload.id || 0);
        var hasContent = rowHasContent(payload);
        var persistEmpty = row.dataset.persistEmpty === '1' || itemId > 0;

        payload.linha_vazia = hasContent ? '0' : '1';
        payload.campos = appendCsvTokens(payload.campos, ['ordem', 'linha_vazia']);

        if (!hasContent) {
            if (!persistEmpty) {
                markRowClean(row);
                return;
            }

            payload.ean = '';
            payload.produto = '';
            payload.quantidade = '';
            payload.categoria = '';
            payload.campos = 'ean,produto,quantidade,categoria,cor,cores,estilos,ordem,linha_vazia,prioridade,status,observacao';
            payload.precos_alterados = allSupplierIds().join(',');
        }

        if (hasContent && row.dataset.lineEmpty === '1') {
            payload.campos = appendCsvTokens(payload.campos, ['ean', 'produto', 'quantidade', 'categoria']);
        }

        if (!hasContent && itemId <= 0 && row.dataset.persistEmpty !== '1') {
            markRowClean(row);
            return;
        }

        setStatus('Salvando...', 'saving');
        var sentDirtyAt = Number(row.dataset.syncDirtyAt || Date.now());
        row.dataset.syncSaving = '1';
        row.dataset.syncSavingAt = String(sentDirtyAt);
        api('save_row', payload).then(function (result) {
            if (result.item_id) {
                enableDelete(row, result.item_id);
            }
            if (result.ordem) {
                setRowOrder(row, result.ordem);
            }
            row.dataset.lineEmpty = String(result.linha_vazia || payload.linha_vazia || '0') === '1' ? '1' : '0';
            delete row.dataset.persistEmpty;

            if (result.winner) {
                var winnerOutput = row.querySelector('.winner-output');
                if (winnerOutput) {
                    winnerOutput.value = result.winner;
                    autoGrow(winnerOutput);
                }
            }

            updateOrderRegisteredInfo(row, result.encomenda_registrada_em || '', result.encomenda_registrada_label || '');
            applyConditionalFormatting(row);

            if (Array.isArray(result.categories)) {
                scheduleCategoryOptionsRefresh(result.categories, true, 120);
            }

            setStatus('Salvo agora', 'saved');
            if (Number(row.dataset.syncDirtyAt || 0) <= sentDirtyAt) {
                markRowClean(row);
            } else {
                delete row.dataset.syncSaving;
                delete row.dataset.syncSavingAt;
            }
            flushPendingSyncSnapshot();
        }).catch(function (error) {
            delete row.dataset.syncSaving;
            delete row.dataset.syncSavingAt;
            setStatus(error.message, 'error');
        });
    }

    function scheduleRowSave(row, delay, dirty) {
        if (!row) {
            return;
        }

        if (saveTimers.has(row)) {
            clearTimeout(saveTimers.get(row));
        }

        setStatus('Alteracao pendente...', 'pending');
        markRowDirty(row, dirty);
        saveTimers.set(row, setTimeout(function () {
            saveTimers.delete(row);
            saveRow(row);
        }, delay || 850));
    }

    function inputsByColumn(row) {
        var map = {};
        row.querySelectorAll('.sheet-input').forEach(function (input) {
            map[String(input.dataset.col)] = input;
        });
        return map;
    }

    function nextRowIndex() {
        var current = Number(grid.dataset.nextRow || 0);
        grid.dataset.nextRow = String(current + 1);
        return current;
    }

    function renameRow(row, index, visualNumber) {
        row.dataset.rowIndex = String(index);
        row.querySelector('.row-number').textContent = String(visualNumber);
        row.querySelector('.row-number').classList.remove('is-selected');
        row.querySelectorAll('[name]').forEach(function (field) {
            field.name = field.name
                .replace(/rows\[\d+\]/g, 'rows[' + index + ']')
                .replace(/precos\[\d+\]/g, 'precos[' + index + ']');
        });
    }

    function prepareReadonly(row) {
        row.querySelectorAll('.sheet-input').forEach(function (input) {
            input.readOnly = true;
            input.classList.remove('is-editing');
        });
        row.querySelectorAll('.winner-output').forEach(function (input) {
            input.readOnly = true;
        });
    }

    function addRows(amount, options) {
        options = options || {};
        var tbody = grid.querySelector('tbody');
        var rows = tbody.querySelectorAll('tr');
        var template = rows[rows.length - 1];
        var createdRows = [];

        for (var i = 0; i < amount; i++) {
            var clone = template.cloneNode(true);
            var index = nextRowIndex();
            var visualNumber = tbody.querySelectorAll('tr').length + 1;

            renameRow(clone, index, visualNumber);
            clone.dataset.itemId = '';
            clone.dataset.color = '';
            delete clone.dataset.rowOrder;
            clone.dataset.lineEmpty = '0';
            clone.classList.remove('is-selected');
            clone.querySelectorAll('input, textarea').forEach(function (input) {
                input.value = '';
                autoGrow(input);
            });
            clone.querySelectorAll('.sheet-cell').forEach(function (cell) {
                cell.dataset.color = '';
                cell.style.backgroundColor = '';
                delete cell.dataset.orderRegisteredAt;
                delete cell.dataset.orderRegisteredLabel;
                cell.removeAttribute('title');
                setCellStyle(cell, {}, false, false);
                cell.classList.remove('is-cell-selected', 'is-active-cell', 'is-category-urgent', 'is-category-order', 'winner-price');
                clearConditionalFormattingForCell(cell);
            });
            clone.querySelectorAll('.winner-price').forEach(function (cell) {
                cell.classList.remove('winner-price');
            });
            clone.querySelector('.winner-output').value = 'Sem vencedor';
            autoGrow(clone.querySelector('.winner-output'));
            prepareReadonly(clone);
            applyConditionalFormatting(clone);
            tbody.appendChild(clone);
            if (options.persist) {
                clone.dataset.persistEmpty = '1';
                clone.dataset.lineEmpty = '1';
                setRowOrder(clone, computeRowOrder(clone));
                createdRows.push(clone);
            }
        }
        updateWinnerOptions();
        return createdRows;
    }

    function addPersistedRows(amount) {
        amount = Math.max(1, Math.min(50, Number(amount || 10)));
        closeEditingFields();
        setStatus('Adicionando ' + amount + ' linha(s)...', 'saving');

        return api('add_empty_rows', {
            amount: amount,
            client_id: syncClientId
        }).then(function (result) {
            if (result.snapshot) {
                applySyncSnapshot(result.snapshot, false, {
                    dataChanged: true,
                    filterChanged: false
                });
            } else {
                pullSync();
            }

            setStatus(amount + ' linha(s) adicionada(s)', 'saved');
            return result;
        }).catch(function (error) {
            setStatus(error && error.message ? error.message : 'Nao consegui adicionar as linhas.', 'error');
            throw error;
        });
    }

    function renumberVisibleRows() {
        var tbody = grid.querySelector('tbody');
        Array.prototype.slice.call(tbody.querySelectorAll('tr')).forEach(function (row, index) {
            renameRow(row, Number(row.dataset.rowIndex || index), index + 1);
        });
        updateFillHandle();
    }

    function insertRowRelative(row, position, record) {
        var tbody = grid.querySelector('tbody');
        var rows = tbody.querySelectorAll('tr');
        var template = row || activeRow || rows[rows.length - 1];

        if (!template) {
            setStatus('Nenhuma linha base encontrada.', 'waiting');
            return null;
        }

        var clone = template.cloneNode(true);
        renameRow(clone, nextRowIndex(), 0);
        clearRow(clone);
        prepareReadonly(clone);
        tbody.insertBefore(clone, position === 'above' ? template : template.nextSibling);
        clone.dataset.persistEmpty = '1';
        clone.dataset.lineEmpty = '1';
        setRowOrder(clone, computeRowOrder(clone));
        renumberVisibleRows();

        var firstCell = clone.querySelector('td.sheet-cell');
        if (firstCell) {
            selectCell(firstCell, false);
            firstCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        var action = {
            type: 'row-insert',
            row: clone,
            tbody: tbody,
            nextRow: clone.nextElementSibling
        };

        if (record !== false) {
            pushUndo(action);
        }

        setStatus(position === 'above' ? 'Linha criada acima' : 'Linha criada abaixo', 'saved');
        saveRow(clone);
        return clone;
    }

    function insertRowAbove(row, record) {
        return insertRowRelative(row, 'above', record);
    }

    function insertRowBelow(row, record) {
        return insertRowRelative(row, 'below', record);
    }

    function removeRowDom(row) {
        if (!row) {
            return false;
        }

        var fallbackCell = row.previousElementSibling ? row.previousElementSibling.querySelector('td.sheet-cell') : null;
        fallbackCell = fallbackCell || (row.nextElementSibling ? row.nextElementSibling.querySelector('td.sheet-cell') : null);
        row.remove();
        renumberVisibleRows();
        updateProductColorOptions();
        updateWinnerOptions();
        updateSelectionSummary();

        if (fallbackCell && document.contains(fallbackCell)) {
            selectCell(fallbackCell, false);
        }

        return true;
    }

    function deleteContextRow(row) {
        row = row || contextSourceRow || activeRow;

        if (!row) {
            setStatus('Nenhuma linha selecionada.', 'waiting');
            return;
        }

        var tbody = grid.querySelector('tbody');
        var rows = tbody ? tbody.querySelectorAll('tr') : [];
        var itemId = Number(row.dataset.itemId || 0);

        if (itemId && !window.confirm('Excluir esta linha da cotacao?')) {
            return;
        }

        if (!itemId) {
            if (rows.length <= 1) {
                clearRow(row);
                markRowClean(row);
                setStatus('Linha limpa', 'saved');
                return;
            }

            removeRowDom(row);
            setStatus('Linha removida', 'saved');
            return;
        }

        setStatus('Excluindo linha...', 'saving');
        api('delete_row', { id: itemId }).then(function (result) {
            if (result && Array.isArray(result.categories)) {
                renderCategoryOptions(result.categories, true);
            }
            if (rows.length <= 1) {
                clearRow(row);
                setStatus('Linha limpa', 'saved');
                flushPendingSyncSnapshot();
                return;
            }

            removeRowDom(row);
            setStatus('Linha excluida', 'saved');
            flushPendingSyncSnapshot();
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function restoreInsertedRow(action, direction) {
        var tbody = action.tbody || grid.querySelector('tbody');
        var row = action.row;
        if (!tbody || !row) {
            return false;
        }

        if (direction === 'undo') {
            if (!row.parentNode) {
                return false;
            }
            action.nextRow = row.nextElementSibling;
            row.remove();
            renumberVisibleRows();
            return true;
        }

        if (row.parentNode) {
            return false;
        }

        tbody.insertBefore(row, action.nextRow && document.contains(action.nextRow) ? action.nextRow : null);
        renumberVisibleRows();
        return true;
    }

    function selectedRows() {
        var selected = visibleRows().filter(function (row) {
            return row.classList.contains('is-selected');
        });
        if (selected.length) {
            return selected;
        }

        return activeRow && !activeRow.classList.contains('is-filtered-out') ? [activeRow] : [];
    }

    function visibleRows() {
        return Array.prototype.slice.call(grid.querySelectorAll('tbody tr:not(.is-filtered-out)'));
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function rememberCategories(categories) {
        knownCategoryValues = normalizeCategoryList(knownCategoryValues.concat(categories || []));
        return knownCategoryValues.slice();
    }

    function replaceKnownCategories(categories) {
        knownCategoryValues = normalizeCategoryList(categories || []);
        return knownCategoryValues.slice();
    }

    function normalizeCategoryList(categories) {
        var values = {};

        (categories || []).forEach(function (category) {
            category = String(category || '').trim();
            if (category !== '') {
                values[normalizeText(category)] = category;
            }
        });

        return Object.keys(values).sort().map(function (key) {
            return values[key];
        });
    }

    function seedKnownCategories() {
        var categories = [];

        if (categoryPopover && categoryPopover.dataset.allCategories) {
            try {
                var parsed = JSON.parse(categoryPopover.dataset.allCategories);
                if (Array.isArray(parsed)) {
                    categories = categories.concat(parsed);
                }
            } catch (error) {
                categories = categories;
            }
        }

        if (categoryOptionsBox) {
            categoryOptionsBox.querySelectorAll('.filter-option input[type="checkbox"]').forEach(function (input) {
                categories.push(input.value);
            });
        }

        replaceKnownCategories(categories);
    }

    function updateCategoryConditional(row, allowClientStamp) {
        if (!row) {
            return;
        }

        var input = row.querySelector('.category-input');
        var cell = input ? input.closest('.category-cell') : null;
        if (!cell) {
            return;
        }

        var text = normalizeText(input.value);
        var urgent = text.indexOf('urgente') !== -1 || text.indexOf('urgencia') !== -1;
        var order = text.indexOf('encomenda') !== -1;
        cell.classList.toggle('is-category-urgent', urgent);
        cell.classList.toggle('is-category-order', !urgent && order);
        updateOrderRegisteredInfo(row, '', '', Boolean(allowClientStamp));
    }

    function categoryIsOrder(value) {
        return normalizeText(value).indexOf('encomenda') !== -1;
    }

    function formatOrderRegisteredAt(value) {
        value = String(value || '').trim();
        if (!value) {
            return '';
        }

        var normalized = value.replace(' ', 'T');
        var date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', '');
    }

    function nowMysqlDateTime() {
        var date = new Date();
        var pad = function (value) {
            return String(value).padStart(2, '0');
        };

        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
            + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
    }

    function updateOrderRegisteredInfo(row, serverValue, serverLabel, allowClientStamp) {
        if (!row) {
            return;
        }

        var input = row.querySelector('.category-input');
        var cell = input ? input.closest('.category-cell') : null;
        if (!cell) {
            return;
        }

        if (!categoryIsOrder(input.value)) {
            delete cell.dataset.orderRegisteredAt;
            delete cell.dataset.orderRegisteredLabel;
            cell.removeAttribute('title');
            return;
        }

        var registeredAt = String(serverValue || cell.dataset.orderRegisteredAt || '').trim();
        if (!registeredAt && allowClientStamp) {
            registeredAt = nowMysqlDateTime();
        }

        if (!registeredAt) {
            return;
        }

        var label = String(serverLabel || '').trim() || formatOrderRegisteredAt(registeredAt);
        cell.dataset.orderRegisteredAt = registeredAt;
        cell.dataset.orderRegisteredLabel = label;
        cell.removeAttribute('title');
    }

    function parseCellColors(row) {
        var input = row.querySelector('.row-colors-input');
        if (!input || !input.value) {
            return {};
        }

        try {
            var parsed = JSON.parse(input.value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function writeCellColors(row, colors) {
        var input = row.querySelector('.row-colors-input');
        if (!input) {
            return;
        }

        var clean = {};
        Object.keys(colors || {}).forEach(function (key) {
            if (colors[key]) {
                clean[key] = colors[key];
            }
        });

        input.value = Object.keys(clean).length ? JSON.stringify(clean) : '';
    }

    function rememberRepeatAction(action) {
        if (!action || typeof action !== 'object') {
            lastRepeatAction = null;
            return;
        }

        lastRepeatAction = Object.assign({}, action);
    }

    function applyLastRepeatAction() {
        if (!lastRepeatAction) {
            setStatus('Nenhuma acao para repetir.', 'waiting');
            return false;
        }

        if (lastRepeatAction.type === 'color') {
            applyColorToSelectedCells(lastRepeatAction.color || '', { remember: false });
            return true;
        }

        if (lastRepeatAction.type === 'clear-format') {
            clearFormattingForSelectedCells({ remember: false });
            return true;
        }

        if (lastRepeatAction.type === 'font-size') {
            setSelectedFontSize(lastRepeatAction.size, { remember: false });
            return true;
        }

        if (lastRepeatAction.type === 'align') {
            alignSelectedCells(lastRepeatAction.align || 'left', { remember: false });
            return true;
        }

        return false;
    }

    function setCellColor(cell, color, save, record) {
        if (!cell || !cell.classList.contains('sheet-cell')) {
            return;
        }

        color = String(color || '').trim().toLowerCase();
        var before = cell.dataset.color || '';

        if (before === color) {
            return;
        }

        if (record !== false) {
            pushUndo({ type: 'cell-color', cells: [{ cell: cell, before: before, after: color }] });
        }

        cell.dataset.color = color;
        cell.style.backgroundColor = color || '';
        var row = cell.closest('tr');
        var key = cell.dataset.colKey || '';
        var colors = parseCellColors(row);

        if (key) {
            if (color) {
                colors[key] = color;
            } else {
                delete colors[key];
            }
            writeCellColors(row, colors);
        }

        if (save) {
            scheduleRowSave(row, 350, { field: 'cores' });
        }

        if (key === 'produto' && productColorFilterValue) {
            applyGridFilters({ status: false });
        }

        if (key === 'produto') {
            updateProductColorOptions();
        }

        applyConditionalFormattingForCell(cell);
    }

    function applyColorToSelectedCells(color, options) {
        options = options || {};
        var cells = selectedCells();
        if (!cells.length && activeCell) {
            cells = [activeCell];
        }

        if (!cells.length) {
            setStatus('Selecione uma celula.', 'waiting');
            return;
        }

        pushUndo({
            type: 'cell-color',
            cells: cells.map(function (cell) {
                return { cell: cell, before: cell.dataset.color || '', after: color };
            })
        });

        cells.forEach(function (cell) {
            setCellColor(cell, color, true, false);
        });

        if (options.remember !== false) {
            rememberRepeatAction({ type: 'color', color: color || '' });
        }

        setStatus('Cor aplicada', 'saved');
    }

    function clearFormattingForSelectedCells(options) {
        options = options || {};
        var cells = cellsForFormatting();
        if (!cells.length) {
            setStatus('Selecione uma celula.', 'waiting');
            return;
        }

        var changes = cells.map(function (cell) {
            return {
                cell: cell,
                before: {
                    color: cell.dataset.color || '',
                    style: readCellStyle(cell)
                },
                after: {
                    color: '',
                    style: {}
                }
            };
        }).filter(function (entry) {
            return entry.before.color !== '' || Object.keys(entry.before.style || {}).length > 0;
        });

        if (!changes.length) {
            setStatus('Sem formatacao manual para limpar', 'waiting');
            return;
        }

        pushUndo({ type: 'cell-format', cells: changes });
        changes.forEach(function (entry) {
            setCellColor(entry.cell, '', true, false);
            setCellStyle(entry.cell, {}, true, false);
            clearConditionalFormattingForCell(entry.cell);
        });

        updateFontSizeIndicator();
        updateProductColorOptions();
        if (options.remember !== false) {
            rememberRepeatAction({ type: 'clear-format' });
        }
        setStatus('Formatacao limpa', 'saved');
    }

    function parseCellStyles(row) {
        var input = row.querySelector('.row-styles-input');
        if (!input || !input.value) {
            return {};
        }

        try {
            var parsed = JSON.parse(input.value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function clampFontSize(value) {
        value = Number(value);
        if (!Number.isFinite(value)) {
            return defaultFontSize;
        }

        return Math.max(minFontSize, Math.min(maxFontSize, Math.round(value)));
    }

    function defaultFontSizeForCell(cell) {
        if (cell && cell.classList.contains('price-cell')) {
            return 20;
        }

        return defaultFontSize;
    }

    function defaultFontSizeForHeader(header) {
        return header && header.classList.contains('supplier-heading') ? 18 : 14;
    }

    function readHeaderStyle(header) {
        if (!header) {
            return {};
        }

        return normalizeCellStyle({
            bold: header.dataset.headerBold === '1',
            underline: header.dataset.headerUnderline === '1',
            size: header.dataset.headerFontSize || defaultFontSizeForHeader(header),
            align: header.dataset.headerAlign || ''
        });
    }

    function applyHeaderStyle(header, style) {
        if (!header) {
            return;
        }

        style = normalizeCellStyle(style);
        header.dataset.headerBold = style.bold ? '1' : '';
        header.dataset.headerUnderline = style.underline ? '1' : '';
        if (style.size) {
            header.dataset.headerFontSize = String(style.size);
            header.style.setProperty('--header-font-size', style.size + 'px');
        } else {
            delete header.dataset.headerFontSize;
            header.style.removeProperty('--header-font-size');
        }

        if (style.align) {
            header.dataset.headerAlign = style.align;
            header.style.setProperty('--header-align', style.align);
        } else {
            delete header.dataset.headerAlign;
            header.style.removeProperty('--header-align');
        }

        if (!style.bold) {
            delete header.dataset.headerBold;
        }
        if (!style.underline) {
            delete header.dataset.headerUnderline;
        }
    }

    function syncFontSizeInput(input, size) {
        if (!input) {
            return;
        }

        if (size === 'mix') {
            input.placeholder = '';
            input.value = String(defaultFontSize);
            input.dataset.mixed = '1';
            input.title = 'Selecao com tamanhos diferentes. Digite um numero para padronizar.';
            return;
        }

        input.placeholder = '';
        delete input.dataset.mixed;
        input.title = '';
        input.value = String(clampFontSize(size));
    }

    function normalizeCellStyle(style) {
        var clean = {};
        style = style && typeof style === 'object' ? style : {};

        if (style.bold) {
            clean.bold = 1;
        }

        if (style.underline) {
            clean.underline = 1;
        }

        var size = Number(style.size || 0);
        if (Number.isFinite(size) && size > 0) {
            clean.size = clampFontSize(size);
        }

        var align = String(style.align || '');
        if (['left', 'center', 'right'].indexOf(align) !== -1) {
            clean.align = align;
        }

        return clean;
    }

    function writeCellStyles(row, styles) {
        var input = row.querySelector('.row-styles-input');
        if (!input) {
            return;
        }

        var clean = {};
        Object.keys(styles || {}).forEach(function (key) {
            var style = normalizeCellStyle(styles[key]);
            if (Object.keys(style).length) {
                clean[key] = style;
            }
        });

        input.value = Object.keys(clean).length ? JSON.stringify(clean) : '';
    }

    function readCellStyle(cell) {
        return normalizeCellStyle({
            bold: cell.dataset.bold === '1',
            underline: cell.dataset.underline === '1',
            size: cell.dataset.fontSize,
            align: cell.dataset.align
        });
    }

    function applyCellStyleDataset(cell, style) {
        style = normalizeCellStyle(style);

        if (style.bold) {
            cell.dataset.bold = '1';
        } else {
            delete cell.dataset.bold;
        }

        if (style.underline) {
            cell.dataset.underline = '1';
        } else {
            delete cell.dataset.underline;
        }

        if (style.size) {
            cell.dataset.fontSize = String(style.size);
            cell.style.setProperty('--cell-font-size', style.size + 'px');
        } else {
            delete cell.dataset.fontSize;
            cell.style.removeProperty('--cell-font-size');
        }

        if (style.align) {
            cell.dataset.align = style.align;
        } else {
            delete cell.dataset.align;
        }
    }

    function stylesEqual(a, b) {
        return JSON.stringify(normalizeCellStyle(a)) === JSON.stringify(normalizeCellStyle(b));
    }

    function setCellStyle(cell, style, save, record) {
        if (!cell || !cell.classList.contains('sheet-cell')) {
            return;
        }

        style = normalizeCellStyle(style);
        var before = readCellStyle(cell);

        if (stylesEqual(before, style)) {
            return;
        }

        if (record !== false) {
            pushUndo({ type: 'cell-style', cells: [{ cell: cell, before: before, after: style }] });
        }

        applyCellStyleDataset(cell, style);

        var row = cell.closest('tr');
        var key = cell.dataset.colKey || '';
        var styles = parseCellStyles(row);

        if (key) {
            if (Object.keys(style).length) {
                styles[key] = style;
            } else {
                delete styles[key];
            }
            writeCellStyles(row, styles);
        }

        if (save) {
            scheduleRowSave(row, 350, { field: 'estilos' });
        }
    }

    function cellsForFormatting() {
        var cells = selectedCells();
        if (!cells.length && activeCell) {
            cells = [activeCell];
        }
        return cells;
    }

    function applyStyleTransformToSelected(transform) {
        var cells = cellsForFormatting();
        if (!cells.length) {
            setStatus('Selecione uma celula.', 'waiting');
            return;
        }

        var changes = cells.map(function (cell) {
            var before = readCellStyle(cell);
            var after = normalizeCellStyle(transform(before, cell));
            return { cell: cell, before: before, after: after };
        }).filter(function (entry) {
            return !stylesEqual(entry.before, entry.after);
        });

        if (!changes.length) {
            return;
        }

        pushUndo({ type: 'cell-style', cells: changes });
        changes.forEach(function (entry) {
            setCellStyle(entry.cell, entry.after, true, false);
        });
        setStatus('Formato aplicado', 'saved');
        updateFontSizeIndicator();
    }

    function toggleSelectedStyle(key) {
        if (contextHeaderCell && contextMenu && !contextMenu.hidden) {
            var headerStyle = readHeaderStyle(contextHeaderCell);
            if (headerStyle[key]) {
                delete headerStyle[key];
            } else {
                headerStyle[key] = 1;
            }
            applyHeaderStyle(contextHeaderCell, headerStyle);
        }

        var cells = cellsForFormatting();
        var enable = cells.some(function (cell) {
            return !readCellStyle(cell)[key];
        });

        applyStyleTransformToSelected(function (style) {
            style = Object.assign({}, style);
            if (enable) {
                style[key] = 1;
            } else {
                delete style[key];
            }
            return style;
        });
    }

    function changeSelectedFontSize(delta) {
        var base = selectedFontSizeForIndicator();
        if (base === 'mix') {
            base = fontSizeIndicator && fontSizeIndicator.value ? fontSizeIndicator.value : defaultFontSize;
        }
        setSelectedFontSize(clampFontSize(Number(base || defaultFontSize) + Number(delta || 0)));
    }

    function setSelectedFontSize(size, options) {
        options = options || {};
        size = clampFontSize(size);
        if (contextHeaderCell && contextMenu && !contextMenu.hidden) {
            var headerStyle = readHeaderStyle(contextHeaderCell);
            headerStyle.size = size;
            applyHeaderStyle(contextHeaderCell, headerStyle);
        }
        applyStyleTransformToSelected(function (style) {
            style = Object.assign({}, style);
            style.size = size;
            return style;
        });
        updateFontSizeIndicator();

        if (options.remember !== false) {
            rememberRepeatAction({ type: 'font-size', size: size });
        }
    }

    function selectedFontSizeForIndicator() {
        if (contextHeaderCell && contextMenu && !contextMenu.hidden) {
            return Number(readHeaderStyle(contextHeaderCell).size || defaultFontSizeForHeader(contextHeaderCell));
        }

        var cells = selectedCells();
        if (!cells.length && activeCell) {
            cells = [activeCell];
        }

        if (!cells.length) {
            return defaultFontSize;
        }

        var sizes = cells.map(function (cell) {
            return Number(readCellStyle(cell).size || defaultFontSizeForCell(cell));
        });
        var first = sizes[0];
        var same = sizes.every(function (size) {
            return size === first;
        });

        return same ? first : 'mix';
    }

    function updateFontSizeIndicator() {
        if (fontSizeIndicator) {
            var size = selectedFontSizeForIndicator();
            syncFontSizeInput(fontSizeIndicator, size);
            syncFontSizeInput(contextFontSizeInput, size);
        }

        updateSelectionSummary();
        updateFillHandle();
    }

    function alignSelectedCells(align, options) {
        options = options || {};
        if (contextHeaderCell && contextMenu && !contextMenu.hidden) {
            var headerStyle = readHeaderStyle(contextHeaderCell);
            headerStyle.align = align;
            applyHeaderStyle(contextHeaderCell, headerStyle);
        }

        applyStyleTransformToSelected(function (style) {
            style = Object.assign({}, style);
            style.align = align;
            return style;
        });

        if (options.remember !== false) {
            rememberRepeatAction({ type: 'align', align: align || 'left' });
        }
    }

    function colElement(colIndex) {
        return grid.querySelector('col[data-col-index="' + colIndex + '"]');
    }

    function colWidthStorageKey() {
        return 'wimifarma:cotacao:col-widths:' + (grid.dataset.block || 'cotacao-geral');
    }

    function setColumnWidth(colIndex, width) {
        width = Math.max(62, Math.min(820, Math.round(Number(width) || 0)));
        var col = colElement(colIndex);
        var header = grid.querySelector('thead th[data-col-index="' + colIndex + '"]');

        if (col) {
            col.style.width = width + 'px';
        }

        if (header) {
            header.style.width = width + 'px';
            header.style.minWidth = width + 'px';
        }

        return width;
    }

    function ensureColumnResizeGuide() {
        if (!columnResizeGuide) {
            columnResizeGuide = document.createElement('span');
            columnResizeGuide.className = 'column-resize-guide';
            columnResizeGuide.hidden = true;
            document.body.appendChild(columnResizeGuide);
        }

        return columnResizeGuide;
    }

    function updateColumnResizeGuide(header) {
        if (!header) {
            return;
        }

        var guide = ensureColumnResizeGuide();
        var headerRect = header.getBoundingClientRect();
        var wrap = grid.closest('.sheet-grid-wrap') || grid;
        var wrapRect = wrap.getBoundingClientRect();
        var top = Math.max(0, wrapRect.top);
        var bottom = Math.min(window.innerHeight, Math.max(wrapRect.bottom, headerRect.bottom));

        guide.hidden = false;
        guide.style.left = Math.round(headerRect.right - 1) + 'px';
        guide.style.top = Math.round(top) + 'px';
        guide.style.height = Math.max(48, Math.round(bottom - top)) + 'px';
    }

    function hideColumnResizeGuide() {
        if (columnResizeGuide) {
            columnResizeGuide.hidden = true;
        }
    }

    function loadColumnWidths() {
        try {
            var stored = JSON.parse(localStorage.getItem(colWidthStorageKey()) || '{}');
            Object.keys(stored).forEach(function (colIndex) {
                setColumnWidth(colIndex, stored[colIndex]);
            });
        } catch (error) {
            return;
        }
    }

    function saveColumnWidth(colIndex, width) {
        try {
            var stored = JSON.parse(localStorage.getItem(colWidthStorageKey()) || '{}');
            stored[colIndex] = Math.round(Number(width) || 0);
            localStorage.setItem(colWidthStorageKey(), JSON.stringify(stored));
        } catch (error) {
            return;
        }
    }

    function applyInitialCellVisuals() {
        grid.querySelectorAll('td.sheet-cell[data-color]').forEach(function (cell) {
            if (cell.dataset.color) {
                cell.style.backgroundColor = cell.dataset.color;
            }
        });

        grid.querySelectorAll('td.sheet-cell[data-font-size]').forEach(function (cell) {
            cell.style.setProperty('--cell-font-size', clampFontSize(cell.dataset.fontSize) + 'px');
        });
    }

    function columnTitle(colIndex) {
        var header = grid.querySelector('thead th[data-col-index="' + colIndex + '"]');
        if (!header) {
            return 'Coluna ' + String(Number(colIndex) + 1);
        }

        var input = header.querySelector('input');
        if (input && input.value.trim()) {
            return input.value.trim();
        }

        return header.textContent.replace(/\s+/g, ' ').trim() || 'Coluna ' + String(Number(colIndex) + 1);
    }

    function printableCellValue(cell) {
        var field = editableField(cell) || cell.querySelector('.winner-output, .sheet-input');
        if (field) {
            if ('value' in field) {
                return field.value;
            }

            return field.textContent || '';
        }

        return cell.textContent || '';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[char];
        });
    }

    function textColorForBackground(color) {
        var match = String(color || '').match(/^#([0-9a-f]{6})$/i);
        if (!match) {
            return '';
        }

        return '#202124';
    }

    function conditionalCellValue(cell) {
        var field = editableField(cell) || cell.querySelector('.winner-output, .sheet-input');
        if (field) {
            if ('value' in field) {
                return field.value;
            }

            return field.textContent || '';
        }

        return cell ? cell.textContent || '' : '';
    }

    function conditionalRuleMatches(value, rule) {
        var raw = String(value || '');
        var operator = String(rule.operator || 'contains');
        var term = String(rule.term || '');
        var text = normalizeText(raw);
        var needle = normalizeText(term);

        if (operator === 'empty') {
            return raw.trim() === '';
        }

        if (operator === 'not_empty') {
            return raw.trim() !== '';
        }

        if (!needle) {
            return false;
        }

        if (operator === 'not_contains') {
            return text.indexOf(needle) === -1;
        }

        if (operator === 'equals') {
            return text.trim() === needle.trim();
        }

        if (operator === 'starts_with') {
            return text.trim().indexOf(needle.trim()) === 0;
        }

        if (operator === 'ends_with') {
            text = text.trim();
            needle = needle.trim();
            return text.slice(-needle.length) === needle;
        }

        return text.indexOf(needle) !== -1;
    }

    function clearConditionalFormattingForCell(cell) {
        if (!cell) {
            return;
        }

        cell.classList.remove('is-conditional-format');
        cell.style.removeProperty('--conditional-bg');
        cell.style.removeProperty('--conditional-fg');
        delete cell.dataset.conditionalRule;
    }

    function applyConditionalFormattingForCell(cell) {
        if (!cell || !cell.classList.contains('sheet-cell')) {
            return;
        }

        clearConditionalFormattingForCell(cell);

        if (!conditionalRules.length || cell.dataset.color || cell.closest('tr')?.dataset.color) {
            return;
        }

        var key = cell.dataset.colKey || '';
        var value = conditionalCellValue(cell);
        if (key === 'categoria' && String(value || '').trim() === '') {
            return;
        }

        var matched = conditionalRules.find(function (rule) {
            return rule.column_key === key && conditionalRuleMatches(value, rule);
        });

        if (!matched || !matched.background) {
            return;
        }

        cell.classList.add('is-conditional-format');
        cell.dataset.conditionalRule = String(matched.id);
        cell.style.setProperty('--conditional-bg', matched.background);
        cell.style.setProperty('--conditional-fg', matched.text_color || textColorForBackground(matched.background) || '#202124');
    }

    function applyConditionalFormatting(scope) {
        if (!scope) {
            scope = grid;
        }

        if (scope.classList && scope.classList.contains('sheet-cell')) {
            applyConditionalFormattingForCell(scope);
            return;
        }

        scope.querySelectorAll('td.sheet-cell').forEach(applyConditionalFormattingForCell);
    }

    function conditionalPrintStyle(cell) {
        if (!cell || cell.dataset.color || !cell.classList.contains('is-conditional-format')) {
            return '';
        }

        var background = cell.style.getPropertyValue('--conditional-bg') || '';
        var color = cell.style.getPropertyValue('--conditional-fg') || '';
        var parts = [];

        if (background) {
            parts.push('background:' + background);
        }

        if (color) {
            parts.push('color:' + color);
        }

        return parts.join(';');
    }

    function conditionalColumnOptions() {
        var options = [];
        var seen = {};
        var firstRow = grid.querySelector('tbody tr');

        if (!firstRow) {
            return options;
        }

        firstRow.querySelectorAll('td.sheet-cell[data-col-key]').forEach(function (cell) {
            var key = cell.dataset.colKey || '';
            var index = Number(cell.dataset.col || 0);

            if (!key || seen[key]) {
                return;
            }

            seen[key] = true;
            options.push({
                key: key,
                index: index,
                label: columnTitle(index)
            });
        });

        return options;
    }

    function selectedConditionalColumnKey() {
        if (activeCell && activeCell.dataset.colKey) {
            return activeCell.dataset.colKey;
        }

        var selected = selectedCells();
        if (selected.length && selected[0].dataset.colKey) {
            return selected[0].dataset.colKey;
        }

        var header = grid.querySelector('thead th.is-column-selected[data-col-index]');
        if (header) {
            var cell = grid.querySelector('tbody td.sheet-cell[data-col="' + header.dataset.colIndex + '"][data-col-key]');
            if (cell) {
                return cell.dataset.colKey || '';
            }
        }

        return '';
    }

    function renderConditionalColumnOptions(selectedKey, lockColumn) {
        if (!conditionalPopover) {
            return;
        }

        var select = conditionalPopover.querySelector('[data-conditional-column]');
        if (!select) {
            return;
        }

        var options = conditionalColumnOptions();
        select.innerHTML = '';

        if (selectedKey && lockColumn) {
            options = options.filter(function (option) {
                return option.key === selectedKey;
            });
        }

        options.forEach(function (option) {
            var item = document.createElement('option');
            item.value = option.key;
            item.textContent = option.label;
            item.dataset.index = String(option.index);
            select.appendChild(item);
        });

        if (selectedKey && !options.some(function (option) { return option.key === selectedKey; })) {
            var fallback = document.createElement('option');
            fallback.value = selectedKey;
            fallback.textContent = selectedKey;
            fallback.dataset.index = '0';
            select.appendChild(fallback);
        }

        select.value = selectedKey || (options[0] ? options[0].key : '');
        select.disabled = Boolean(lockColumn && selectedKey);
    }

    function conditionalOperatorLabel(operator) {
        var option = conditionalPopover ? conditionalPopover.querySelector('[data-conditional-operator] option[value="' + operator + '"]') : null;
        return option ? option.textContent : operator;
    }

    function conditionalOperatorNeedsTerm(operator) {
        return ['empty', 'not_empty'].indexOf(operator) === -1;
    }

    function updateConditionalTermState() {
        if (!conditionalPopover) {
            return;
        }

        var operator = conditionalPopover.querySelector('[data-conditional-operator]')?.value || 'contains';
        var term = conditionalPopover.querySelector('[data-conditional-term]');
        var wrap = conditionalPopover.querySelector('[data-conditional-term-wrap]');
        var needsTerm = conditionalOperatorNeedsTerm(operator);

        if (wrap) {
            wrap.hidden = !needsTerm;
        }

        if (term) {
            term.disabled = !needsTerm;
            if (!needsTerm) {
                term.value = '';
            }
        }
    }

    function setConditionalColor(color) {
        if (!conditionalPopover) {
            return;
        }

        color = String(color || '');
        var input = conditionalPopover.querySelector('[data-conditional-color-value]');
        if (input) {
            input.value = color;
        }

        conditionalPopover.querySelectorAll('[data-conditional-color]').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.conditionalColor === color);
        });
    }

    function resetConditionalForm(columnKey) {
        if (!conditionalPopover) {
            return;
        }

        columnKey = columnKey || selectedConditionalColumnKey();
        conditionalPopover.querySelector('[data-conditional-id]').value = '';
        renderConditionalColumnOptions(columnKey, true);
        conditionalPopover.querySelector('[data-conditional-operator]').value = 'contains';
        conditionalPopover.querySelector('[data-conditional-term]').value = '';
        setConditionalColor(conditionalDefaultColor);
        setConditionalEditMode(false);
        updateConditionalTermState();
    }

    function setConditionalEditMode(isEditing) {
        if (!conditionalPopover) {
            return;
        }

        conditionalPopover.classList.toggle('is-editing', Boolean(isEditing));
        var saveButton = conditionalPopover.querySelector('[data-conditional-save]');
        if (saveButton) {
            saveButton.textContent = isEditing ? 'Atualizar condicao' : 'Salvar condicao';
        }
    }

    function describeConditionalRule(rule) {
        var label = rule.column_label || rule.column_key || 'Coluna';
        var text = label + ' - ' + conditionalOperatorLabel(rule.operator);

        if (conditionalOperatorNeedsTerm(rule.operator)) {
            text += ' "' + rule.term + '"';
        }

        return text;
    }

    function renderConditionalRuleList() {
        if (!conditionalPopover) {
            return;
        }

        var list = conditionalPopover.querySelector('[data-conditional-rule-list]');
        if (!list) {
            return;
        }

        list.innerHTML = '';

        if (!conditionalRules.length) {
            var empty = document.createElement('div');
            empty.className = 'conditional-empty';
            empty.textContent = 'Nenhuma condicao salva nesta cotacao.';
            list.appendChild(empty);
            return;
        }

        conditionalRules.forEach(function (rule) {
            var item = document.createElement('div');
            item.className = 'conditional-rule-item';
            item.dataset.ruleId = String(rule.id);

            var swatch = document.createElement('span');
            swatch.className = 'conditional-rule-swatch';
            swatch.style.setProperty('--rule-color', rule.background || '#fef7e0');

            var text = document.createElement('span');
            text.className = 'conditional-rule-text';
            text.title = describeConditionalRule(rule);
            text.textContent = describeConditionalRule(rule);

            var edit = document.createElement('button');
            edit.type = 'button';
            edit.dataset.conditionalEditRule = String(rule.id);
            edit.textContent = 'Editar';

            var del = document.createElement('button');
            del.type = 'button';
            del.dataset.conditionalDeleteRule = String(rule.id);
            del.textContent = 'Apagar';

            item.appendChild(swatch);
            item.appendChild(text);
            item.appendChild(edit);
            item.appendChild(del);
            list.appendChild(item);
        });
    }

    function positionConditionalPopover(button) {
        if (!conditionalPopover || !button) {
            return;
        }

        conditionalPopover.style.left = '0px';
        conditionalPopover.style.top = '0px';
        conditionalPopover.hidden = false;

        var rect = button.getBoundingClientRect();
        var panel = conditionalPopover.getBoundingClientRect();
        var left = Math.min(rect.left, window.innerWidth - panel.width - 10);
        var top = Math.min(rect.bottom + 8, window.innerHeight - panel.height - 10);

        conditionalPopover.style.left = Math.max(8, left) + 'px';
        conditionalPopover.style.top = Math.max(8, top) + 'px';
    }

    function openConditionalPopover(button) {
        if (!conditionalPopover) {
            return;
        }

        if (categoryPopover) {
            categoryPopover.hidden = true;
        }
        if (productColorPopover) {
            productColorPopover.hidden = true;
        }
        if (toolbarPalette) {
            toolbarPalette.hidden = true;
        }
        hideContextMenu();

        var selectedColumn = selectedConditionalColumnKey();
        if (!selectedColumn) {
            setStatus('Selecione uma coluna ou celula antes da condicao.', 'waiting');
            return;
        }

        resetConditionalForm(selectedColumn);
        renderConditionalRuleList();
        positionConditionalPopover(button);

        var term = conditionalPopover.querySelector('[data-conditional-term]');
        if (term && !term.disabled) {
            term.focus();
        }
    }

    function editConditionalRule(id) {
        if (!conditionalPopover) {
            return;
        }

        var rule = conditionalRules.find(function (item) {
            return Number(item.id) === Number(id);
        });

        if (!rule) {
            return;
        }

        renderConditionalColumnOptions(rule.column_key, false);
        conditionalPopover.querySelector('[data-conditional-id]').value = String(rule.id);
        conditionalPopover.querySelector('[data-conditional-column]').value = rule.column_key;
        conditionalPopover.querySelector('[data-conditional-operator]').value = rule.operator;
        conditionalPopover.querySelector('[data-conditional-term]').value = rule.term;
        setConditionalColor(rule.background);
        setConditionalEditMode(true);
        updateConditionalTermState();

        var term = conditionalPopover.querySelector('[data-conditional-term]');
        if (term && !term.disabled) {
            term.focus();
            term.select();
        }

        setStatus('Editando condicao', 'waiting');
    }

    function saveConditionalRule() {
        if (!conditionalPopover) {
            return;
        }

        var id = conditionalPopover.querySelector('[data-conditional-id]').value || '';
        var column = conditionalPopover.querySelector('[data-conditional-column]').value || '';
        var operator = conditionalPopover.querySelector('[data-conditional-operator]').value || 'contains';
        var term = conditionalPopover.querySelector('[data-conditional-term]').value || '';
        var color = conditionalPopover.querySelector('[data-conditional-color-value]').value || '';

        if (!column) {
            setStatus('Escolha uma coluna.', 'waiting');
            return;
        }

        if (conditionalOperatorNeedsTerm(operator) && !term.trim()) {
            setStatus('Informe o texto da condicao.', 'waiting');
            return;
        }

        if (!color) {
            setStatus('Escolha uma cor.', 'waiting');
            return;
        }

        setStatus('Salvando condicao...', 'saving');
        api('save_conditional_rule', {
            id: id,
            coluna_chave: column,
            operador: operator,
            termo: term,
            cor_fundo: color
        }).then(function (result) {
            conditionalRules = Array.isArray(result.rules) ? result.rules.map(sanitizeConditionalRule).filter(function (rule) {
                return rule.id > 0 && rule.column_key && rule.background;
            }) : [];
            renderConditionalRuleList();
            resetConditionalForm(column);
            applyConditionalFormatting();
            setStatus('Condicao salva', 'saved');
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function deleteConditionalRule(id) {
        if (!id || !window.confirm('Apagar esta condicao?')) {
            return;
        }

        setStatus('Apagando condicao...', 'saving');
        api('delete_conditional_rule', { id: id }).then(function (result) {
            conditionalRules = Array.isArray(result.rules) ? result.rules.map(sanitizeConditionalRule).filter(function (rule) {
                return rule.id > 0 && rule.column_key && rule.background;
            }) : [];
            renderConditionalRuleList();
            resetConditionalForm(selectedConditionalColumnKey());
            applyConditionalFormatting();
            setStatus('Condicao apagada', 'saved');
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function printableStyle(cell) {
        var style = readCellStyle(cell);
        var parts = [];
        var color = cell.dataset.color || '';

        if (color) {
            parts.push('background:' + color);
            var textColor = textColorForBackground(color);
            if (textColor) {
                parts.push('color:' + textColor);
            }
        } else {
            var conditional = conditionalPrintStyle(cell);
            if (conditional) {
                parts.push(conditional);
            }
        }

        if (style.bold) {
            parts.push('font-weight:700');
        }

        if (style.underline) {
            parts.push('text-decoration:underline');
        }

        if (style.size) {
            parts.push('font-size:' + style.size + 'px');
        }

        if (style.align) {
            parts.push('text-align:' + style.align);
        }

        return parts.join(';');
    }

    function printSelectedCells() {
        var cells = selectedCells();
        if (!cells.length && activeCell) {
            cells = [activeCell];
        }

        if (!cells.length) {
            setStatus('Selecione as celulas para imprimir.', 'waiting');
            return;
        }

        var selectedMap = {};
        var rowIndexes = [];
        var colIndexes = [];

        cells.forEach(function (cell) {
            var rowIndex = cellRowIndex(cell);
            var colIndex = cellColIndex(cell);
            selectedMap[rowIndex + ':' + colIndex] = cell;
            if (rowIndexes.indexOf(rowIndex) === -1) {
                rowIndexes.push(rowIndex);
            }
            if (colIndexes.indexOf(colIndex) === -1) {
                colIndexes.push(colIndex);
            }
        });

        rowIndexes.sort(function (a, b) { return a - b; });
        colIndexes.sort(function (a, b) { return a - b; });

        var html = '<section class="print-selection-output" aria-hidden="true">';
        html += '<div class="print-selection-head">';
        html += '<h1>Cotacao Geral - Wimifarma</h1>';
        html += '<p>' + escapeHtml(new Date().toLocaleString('pt-BR')) + ' &middot; ' + String(cells.length) + ' celula(s) marcada(s)</p>';
        html += '</div>';
        html += '<table><thead><tr><th>#</th>';
        colIndexes.forEach(function (colIndex) {
            html += '<th>' + escapeHtml(columnTitle(colIndex)) + '</th>';
        });
        html += '</tr></thead><tbody>';

        rowIndexes.forEach(function (rowIndex) {
            html += '<tr><th>' + escapeHtml(String(rowIndex + 1)) + '</th>';
            colIndexes.forEach(function (colIndex) {
                var cell = selectedMap[rowIndex + ':' + colIndex];
                if (!cell) {
                    html += '<td></td>';
                    return;
                }

                html += '<td style="' + escapeHtml(printableStyle(cell)) + '">' + escapeHtml(printableCellValue(cell)) + '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody></table></section>';

        var previous = document.querySelector('.print-selection-output');
        if (previous) {
            previous.remove();
        }

        document.body.insertAdjacentHTML('beforeend', html);
        document.body.classList.add('printing-selection');
        setStatus('Imprimindo celulas marcadas', 'saved');

        var cleanup = function () {
            document.body.classList.remove('printing-selection');
            var output = document.querySelector('.print-selection-output');
            if (output) {
                output.remove();
            }
            window.removeEventListener('afterprint', cleanup);
        };

        window.addEventListener('afterprint', cleanup);
        window.print();
        window.setTimeout(cleanup, 1200);
    }

    function sheetCellFrom(target) {
        var cell = target && target.closest ? target.closest('td.sheet-cell') : null;
        return cell && grid.contains(cell) ? cell : null;
    }

    function editableField(cell) {
        if (!cell) {
            return null;
        }

        var field = cell.querySelector('.sheet-input');
        if (!field || field.classList.contains('winner-output')) {
            return null;
        }

        return field;
    }

    function cellRowIndex(cell) {
        return visibleRows().indexOf(cell.closest('tr'));
    }

    function cellColIndex(cell) {
        return Number(cell.dataset.col || 0);
    }

    function selectedCells() {
        return Array.prototype.slice.call(grid.querySelectorAll('tbody td.sheet-cell.is-cell-selected'));
    }

    function clearActiveRowIndicator() {
        grid.querySelectorAll('tbody td.row-number.is-active-row-number').forEach(function (rowNumber) {
            rowNumber.classList.remove('is-active-row-number');
        });
    }

    function updateActiveRowIndicator() {
        clearActiveRowIndicator();

        if (!activeRow || !document.contains(activeRow) || activeRow.classList.contains('is-filtered-out')) {
            return;
        }

        var rowNumber = activeRow.querySelector('td.row-number');
        if (rowNumber) {
            rowNumber.classList.add('is-active-row-number');
        }
    }

    function clearCellSelection() {
        grid.querySelectorAll('tbody td.sheet-cell.is-cell-selected, tbody td.sheet-cell.is-active-cell, tbody td.sheet-cell.is-column-selected').forEach(function (cell) {
            cell.classList.remove('is-cell-selected', 'is-active-cell', 'is-column-selected');
        });
        grid.querySelectorAll('tbody tr.is-selected').forEach(function (row) {
            row.classList.remove('is-selected');
        });
        grid.querySelectorAll('thead th.is-column-selected').forEach(function (header) {
            header.classList.remove('is-column-selected');
        });
        clearActiveRowIndicator();
        updateFontSizeIndicator();
    }

    function markCell(cell, active) {
        if (!cell) {
            return;
        }

        cell.classList.add('is-cell-selected');
        cell.classList.toggle('is-active-cell', !!active);
        activeCell = cell;
        activeRow = cell.closest('tr');
    }

    function selectCell(cell, append) {
        if (!cell) {
            return;
        }

        if (!append) {
            clearCellSelection();
        }

        if (append && cell.classList.contains('is-cell-selected')) {
            cell.classList.remove('is-cell-selected', 'is-active-cell');
            activeCell = selectedCells()[0] || null;
            activeRow = activeCell ? activeCell.closest('tr') : null;
            updateActiveRowIndicator();
            updateFontSizeIndicator();
            schedulePresencePing(120);
            return;
        }

        grid.querySelectorAll('tbody td.sheet-cell.is-active-cell').forEach(function (current) {
            current.classList.remove('is-active-cell');
        });
        markCell(cell, true);
        anchorCell = cell;
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        schedulePresencePing(120);
    }

    function selectCellRange(start, end) {
        if (!start || !end) {
            return;
        }

        var startRow = cellRowIndex(start);
        var endRow = cellRowIndex(end);
        var startCol = cellColIndex(start);
        var endCol = cellColIndex(end);
        var minRow = Math.min(startRow, endRow);
        var maxRow = Math.max(startRow, endRow);
        var minCol = Math.min(startCol, endCol);
        var maxCol = Math.max(startCol, endCol);
        var rows = visibleRows();

        clearCellSelection();
        rows.forEach(function (row, rowIndex) {
            if (rowIndex < minRow || rowIndex > maxRow) {
                return;
            }

            row.querySelectorAll('td.sheet-cell').forEach(function (cell) {
                var col = cellColIndex(cell);
                if (col >= minCol && col <= maxCol) {
                    markCell(cell, cell === end);
                }
            });
        });
        activeCell = end;
        activeRow = end.closest('tr');
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        schedulePresencePing(120);
    }

    function cellBy(rowIndex, colIndex) {
        var rows = visibleRows();
        var row = rows[rowIndex];
        if (!row) {
            return null;
        }

        return row.querySelector('td.sheet-cell[data-col="' + colIndex + '"]');
    }

    function selectColumn(colIndex) {
        clearCellSelection();
        var first = null;
        visibleRows().forEach(function (row) {
            row.querySelectorAll('td.sheet-cell[data-col="' + colIndex + '"]').forEach(function (cell) {
                cell.classList.add('is-cell-selected', 'is-column-selected');
                first = first || cell;
            });
        });
        grid.querySelectorAll('thead th[data-col-index="' + colIndex + '"]').forEach(function (header) {
            header.classList.add('is-column-selected');
        });

        if (first) {
            activeCell = first;
            anchorCell = first;
            activeRow = first.closest('tr');
        }
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        schedulePresencePing(120);
    }

    function selectColumnRange(startCol, endCol) {
        startCol = Number(startCol);
        endCol = Number(endCol);

        if (!Number.isFinite(startCol) || !Number.isFinite(endCol)) {
            return;
        }

        var minCol = Math.min(startCol, endCol);
        var maxCol = Math.max(startCol, endCol);
        var first = null;
        var active = null;

        clearCellSelection();
        visibleRows().forEach(function (row) {
            row.querySelectorAll('td.sheet-cell').forEach(function (cell) {
                var col = cellColIndex(cell);
                if (col < minCol || col > maxCol) {
                    return;
                }

                cell.classList.add('is-cell-selected', 'is-column-selected');
                first = first || cell;
                if (col === endCol) {
                    active = active || cell;
                }
            });
        });

        grid.querySelectorAll('thead th[data-col-index]').forEach(function (header) {
            var col = Number(header.dataset.colIndex || 0);
            header.classList.toggle('is-column-selected', col >= minCol && col <= maxCol);
        });

        activeCell = active || first;
        anchorCell = first;
        activeRow = activeCell ? activeCell.closest('tr') : null;

        if (activeCell) {
            activeCell.classList.add('is-active-cell');
        }
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        schedulePresencePing(120);
    }

    function selectRowsRange(startRow, endRow) {
        startRow = Number(startRow);
        endRow = Number(endRow);

        if (!Number.isFinite(startRow) || !Number.isFinite(endRow)) {
            return;
        }

        var minRow = Math.min(startRow, endRow);
        var maxRow = Math.max(startRow, endRow);
        var first = null;
        var active = null;

        clearCellSelection();
        visibleRows().forEach(function (row, rowIndex) {
            if (rowIndex < minRow || rowIndex > maxRow) {
                return;
            }

            row.classList.add('is-selected');
            row.querySelectorAll('td.sheet-cell').forEach(function (cell) {
                cell.classList.add('is-cell-selected');
                first = first || cell;
                active = cell;
            });
        });

        activeCell = active || first;
        anchorCell = first;
        activeRow = activeCell ? activeCell.closest('tr') : null;

        if (activeCell) {
            activeCell.classList.add('is-active-cell');
        }
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        schedulePresencePing(120);
    }

    function selectAllCells() {
        clearCellSelection();
        var first = null;
        visibleRows().forEach(function (row) {
            row.querySelectorAll('td.sheet-cell').forEach(function (cell) {
                cell.classList.add('is-cell-selected');
                first = first || cell;
            });
        });
        grid.querySelectorAll('thead th[data-col-index], thead th.all-select-heading').forEach(function (header) {
            header.classList.add('is-column-selected');
        });

        if (first) {
            activeCell = first;
            anchorCell = first;
            activeRow = first.closest('tr');
        }
        updateActiveRowIndicator();
        updateFontSizeIndicator();
        setStatus('Edicao em massa: todas as celulas selecionadas', 'waiting');
        schedulePresencePing(120);
    }

    function closeEditingFields() {
        grid.querySelectorAll('.sheet-input.is-editing').forEach(exitEditField);
    }

    function closeSupplierEditors(exceptInput) {
        grid.querySelectorAll('.supplier-name-input').forEach(function (input) {
            if (input !== exceptInput) {
                if (!input.readOnly) {
                    finishSupplierEdit(input);
                }

                var header = input.closest('th');
                if (header) {
                    header.classList.remove('is-renaming');
                }

                if (document.activeElement === input) {
                    input.blur();
                }
            }
        });
    }

    function selectionBounds(cells) {
        cells = cells && cells.length ? cells : selectedCells();
        if (!cells.length) {
            return null;
        }

        var rows = cells.map(cellRowIndex);
        var cols = cells.map(cellColIndex);

        return {
            minRow: Math.min.apply(Math, rows),
            maxRow: Math.max.apply(Math, rows),
            minCol: Math.min.apply(Math, cols),
            maxCol: Math.max.apply(Math, cols)
        };
    }

    function cellsInRange(minRow, maxRow, minCol, maxCol) {
        var cells = [];

        for (var rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
            for (var colIndex = minCol; colIndex <= maxCol; colIndex++) {
                var cell = cellBy(rowIndex, colIndex);
                if (cell) {
                    cells.push(cell);
                }
            }
        }

        return cells;
    }

    function selectionClientRect(cells) {
        var rects = (cells || []).map(function (cell) {
            return cell.getBoundingClientRect();
        }).filter(function (rect) {
            return rect.width > 0 && rect.height > 0;
        });

        if (!rects.length) {
            return null;
        }

        return {
            top: Math.min.apply(Math, rects.map(function (rect) { return rect.top; })),
            right: Math.max.apply(Math, rects.map(function (rect) { return rect.right; })),
            bottom: Math.max.apply(Math, rects.map(function (rect) { return rect.bottom; })),
            left: Math.min.apply(Math, rects.map(function (rect) { return rect.left; }))
        };
    }

    function clearFillPreview() {
        grid.querySelectorAll('td.sheet-cell.is-fill-preview').forEach(function (cell) {
            cell.classList.remove('is-fill-preview');
        });
    }

    function ensureFillHandle() {
        if (fillHandle) {
            return fillHandle;
        }

        fillHandle = document.createElement('button');
        fillHandle.type = 'button';
        fillHandle.className = 'sheet-fill-handle';
        fillHandle.title = 'Arrastar para preencher';
        fillHandle.setAttribute('aria-label', 'Arrastar para preencher');
        fillHandle.hidden = true;
        document.body.appendChild(fillHandle);

        fillHandle.addEventListener('mousedown', function (event) {
            var sourceCells = selectedCells().filter(function (cell) {
                return Boolean(editableField(cell));
            });

            if (!sourceCells.length) {
                return;
            }

            fillDragState = {
                sourceCells: sourceCells,
                bounds: selectionBounds(sourceCells),
                rect: selectionClientRect(sourceCells),
                targetCells: [],
                direction: ''
            };
            fillHandle.hidden = true;

            event.preventDefault();
            event.stopPropagation();
        });

        return fillHandle;
    }

    function positionFillHandle() {
        var handle = ensureFillHandle();
        var cells = selectedCells();
        var base = activeCell && activeCell.classList.contains('is-cell-selected') ? activeCell : cells[cells.length - 1];

        if (!base || !editableField(base) || fillDragState) {
            handle.hidden = true;
            return;
        }

        var rect = base.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            handle.hidden = true;
            return;
        }

        handle.hidden = false;
        handle.style.left = Math.round(rect.right - 5) + 'px';
        handle.style.top = Math.round(rect.bottom - 5) + 'px';
    }

    function updateFillHandle() {
        if (!grid) {
            return;
        }

        window.requestAnimationFrame(positionFillHandle);
    }

    function fillCellsFromPointer(clientX, clientY) {
        if (!fillDragState || !fillDragState.bounds) {
            return { cells: [], direction: '' };
        }

        var target = document.elementFromPoint(clientX, clientY);
        var cell = sheetCellFrom(target);
        if (!cell) {
            return { cells: [], direction: '' };
        }

        var bounds = fillDragState.bounds;
        var row = cellRowIndex(cell);
        var col = cellColIndex(cell);
        var direction = '';
        var cells = [];
        var rect = fillDragState.rect;

        if (rect) {
            var candidates = [
                { direction: 'right', distance: clientX - rect.right },
                { direction: 'left', distance: rect.left - clientX },
                { direction: 'down', distance: clientY - rect.bottom },
                { direction: 'up', distance: rect.top - clientY }
            ].sort(function (a, b) {
                return b.distance - a.distance;
            });
            var candidate = candidates[0];

            if (candidate && candidate.distance > 4) {
                if (candidate.direction === 'down' && row > bounds.maxRow) {
                    direction = 'down';
                    cells = cellsInRange(bounds.maxRow + 1, row, bounds.minCol, bounds.maxCol);
                } else if (candidate.direction === 'up' && row < bounds.minRow) {
                    direction = 'up';
                    cells = cellsInRange(row, bounds.minRow - 1, bounds.minCol, bounds.maxCol);
                } else if (candidate.direction === 'right' && col > bounds.maxCol) {
                    direction = 'right';
                    cells = cellsInRange(bounds.minRow, bounds.maxRow, bounds.maxCol + 1, col);
                } else if (candidate.direction === 'left' && col < bounds.minCol) {
                    direction = 'left';
                    cells = cellsInRange(bounds.minRow, bounds.maxRow, col, bounds.minCol - 1);
                }
            }
        }

        if (!direction && row > bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol) {
            direction = 'down';
            cells = cellsInRange(bounds.maxRow + 1, row, bounds.minCol, bounds.maxCol);
        } else if (!direction && row < bounds.minRow && col >= bounds.minCol && col <= bounds.maxCol) {
            direction = 'up';
            cells = cellsInRange(row, bounds.minRow - 1, bounds.minCol, bounds.maxCol);
        } else if (!direction && col > bounds.maxCol && row >= bounds.minRow && row <= bounds.maxRow) {
            direction = 'right';
            cells = cellsInRange(bounds.minRow, bounds.maxRow, bounds.maxCol + 1, col);
        } else if (!direction && col < bounds.minCol && row >= bounds.minRow && row <= bounds.maxRow) {
            direction = 'left';
            cells = cellsInRange(bounds.minRow, bounds.maxRow, col, bounds.minCol - 1);
        }

        return {
            cells: cells.filter(function (targetCell) {
                return Boolean(editableField(targetCell));
            }),
            direction: direction
        };
    }

    function updateFillDrag(clientX, clientY) {
        var next = fillCellsFromPointer(clientX, clientY);
        clearFillPreview();
        next.cells.forEach(function (cell) {
            cell.classList.add('is-fill-preview');
        });
        fillDragState.targetCells = next.cells;
        fillDragState.direction = next.direction;
    }

    function formatFillValueForField(field, value) {
        if (!Number.isFinite(value)) {
            return '';
        }

        if (field && field.matches('[inputmode="decimal"]')) {
            return Number(value).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        return String(value);
    }

    function fillLaneEntries(sourceEntries, targetCell, direction) {
        var laneEntries = sourceEntries.filter(function (entry) {
            if (direction === 'down' || direction === 'up') {
                return cellColIndex(entry.cell) === cellColIndex(targetCell);
            }

            return cellRowIndex(entry.cell) === cellRowIndex(targetCell);
        });

        if (!laneEntries.length) {
            laneEntries = sourceEntries;
        }

        laneEntries.sort(function (a, b) {
            if (direction === 'down' || direction === 'up') {
                return cellRowIndex(a.cell) - cellRowIndex(b.cell);
            }

            return cellColIndex(a.cell) - cellColIndex(b.cell);
        });

        if (direction === 'up' || direction === 'left') {
            laneEntries.reverse();
        }

        return laneEntries;
    }

    function projectedFillValue(sourceEntries, targetCell, direction, ordinal) {
        var targetField = editableField(targetCell);
        var laneEntries = fillLaneEntries(sourceEntries, targetCell, direction);
        var numbers = laneEntries.map(function (entry) {
            return parseMoney(entry.value);
        });
        var allNumbers = numbers.length > 0 && numbers.every(Number.isFinite);

        if (allNumbers && numbers.length >= 2) {
            var step = numbers[numbers.length - 1] - numbers[numbers.length - 2];
            return formatFillValueForField(targetField, numbers[numbers.length - 1] + (step * (ordinal + 1)));
        }

        if (allNumbers && numbers.length === 1) {
            return formatFillValueForField(targetField, numbers[0]);
        }

        return laneEntries[ordinal % laneEntries.length].value;
    }

    function projectedFillFormat(sourceEntries, targetCell, direction, ordinal) {
        var laneEntries = fillLaneEntries(sourceEntries, targetCell, direction);
        var source = laneEntries[ordinal % laneEntries.length] || sourceEntries[0];

        return {
            color: (source && source.color) || '',
            style: normalizeCellStyle((source && source.style) || {})
        };
    }

    function applyFillDrag() {
        if (!fillDragState || !fillDragState.targetCells.length) {
            return false;
        }

        var sourceEntries = fillDragState.sourceCells.map(function (cell) {
            return {
                cell: cell,
                value: cellDisplayValue(cell),
                color: cell.dataset.color || '',
                style: readCellStyle(cell)
            };
        });

        if (!sourceEntries.length) {
            return false;
        }

        var laneCounters = {};
        var fieldChanges = [];
        var formatChanges = [];
        fillDragState.targetCells.forEach(function (cell) {
            var field = editableField(cell);
            if (!field) {
                return;
            }

            var laneKey = (fillDragState.direction === 'down' || fillDragState.direction === 'up')
                ? 'c' + cellColIndex(cell)
                : 'r' + cellRowIndex(cell);
            var ordinal = laneCounters[laneKey] || 0;
            laneCounters[laneKey] = ordinal + 1;

            var after = projectedFillValue(sourceEntries, cell, fillDragState.direction, ordinal);
            if (field.value !== after) {
                fieldChanges.push({ field: field, before: field.value, after: after });
            }

            var formatAfter = projectedFillFormat(sourceEntries, cell, fillDragState.direction, ordinal);
            var formatBefore = {
                color: cell.dataset.color || '',
                style: readCellStyle(cell)
            };

            if (formatBefore.color !== formatAfter.color || !stylesEqual(formatBefore.style, formatAfter.style)) {
                formatChanges.push({ cell: cell, before: formatBefore, after: formatAfter });
            }
        });

        if (!fieldChanges.length && !formatChanges.length) {
            return false;
        }

        pushUndo({ type: 'fill', fields: fieldChanges, formats: formatChanges });
        isApplyingUndo = true;
        try {
            fieldChanges.forEach(function (entry) {
                entry.field.value = entry.after;
                entry.field.dataset.undoBefore = entry.after;
                entry.field.dispatchEvent(new Event('input', { bubbles: true }));
                autoGrow(entry.field);
            });

            formatChanges.forEach(function (entry) {
                setCellColor(entry.cell, entry.after.color || '', true, false);
                setCellStyle(entry.cell, entry.after.style || {}, true, false);
                applyConditionalFormattingForCell(entry.cell);
            });
        } finally {
            isApplyingUndo = false;
        }

        setStatus('Preenchimento aplicado', 'saved');
        return true;
    }

    function keyMoveDelta(key) {
        return {
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0]
        }[key] || null;
    }

    function moveActiveCell(colDelta, rowDelta, extend) {
        if (!activeCell) {
            return false;
        }

        var next = cellBy(cellRowIndex(activeCell) + rowDelta, cellColIndex(activeCell) + colDelta);
        if (!next) {
            return false;
        }

        if (extend && anchorCell) {
            selectCellRange(anchorCell, next);
        } else {
            selectCell(next, false);
        }
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
    }

    function enterEditCell(cell, selectText) {
        var field = editableField(cell);
        if (!field) {
            return false;
        }

        field.readOnly = false;
        field.classList.add('is-editing');
        cell.classList.add('is-editing-cell');
        field.dataset.undoBefore = field.value;
        field.focus();

        if (selectText !== false) {
            field.select();
        } else if (typeof field.setSelectionRange === 'function') {
            try {
                var end = String(field.value || '').length;
                field.setSelectionRange(end, end);
            } catch (error) {
                // Alguns navegadores podem recusar selecao programatica logo apos liberar o textarea.
            }
        }

        schedulePresencePing(80);
        return true;
    }

    function exitEditField(field) {
        if (!field || !field.classList.contains('is-editing')) {
            return;
        }

        field.classList.remove('is-editing');
        field.readOnly = true;
        var cell = field.closest('td.sheet-cell');
        if (cell) {
            cell.classList.remove('is-editing-cell');
        }
        try {
            if (typeof field.setSelectionRange === 'function') {
                var end = String(field.value || '').length;
                field.setSelectionRange(end, end);
            }
        } catch (error) {
            // Alguns campos podem recusar selecao programatica.
        }
        if (document.activeElement === field) {
            field.blur();
        }
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
        autoGrow(field);
        schedulePresencePing(120);
    }

    function clearSelectedCells() {
        var fields = selectedCells().map(editableField).filter(Boolean);

        if (!fields.length) {
            return false;
        }

        pushUndo({
            type: 'cells-clear',
            fields: fields.map(function (field) {
                return { field: field, before: field.value, after: '' };
            })
        });

        isApplyingUndo = true;
        try {
            fields.forEach(function (field) {
                field.value = '';
                field.dataset.undoBefore = '';
                field.dispatchEvent(new Event('input', { bubbles: true }));
                autoGrow(field);
            });
        } finally {
            isApplyingUndo = false;
        }

        return true;
    }

    function pasteMatrix(target, text) {
        if (!target || !target.classList.contains('sheet-input')) {
            return false;
        }

        if (text.indexOf('\t') === -1 && text.indexOf('\n') === -1 && text.indexOf('\r') === -1) {
            return false;
        }

        var startRow = target.closest('tr');
        var rows = Array.prototype.slice.call(grid.querySelectorAll('tbody tr'));
        var rowIndex = rows.indexOf(startRow);
        var startCol = Number(target.dataset.col || 0);
        var matrix = text.replace(/\r/g, '').split('\n').filter(function (line, index, source) {
            return line !== '' || index < source.length - 1;
        }).map(function (line) {
            return line.split('\t');
        });
        var dirtyByRow = new Map();

        if (rowIndex + matrix.length > rows.length) {
            addRows(rowIndex + matrix.length - rows.length);
            rows = Array.prototype.slice.call(grid.querySelectorAll('tbody tr'));
        }

        matrix.forEach(function (cells, r) {
            var row = rows[rowIndex + r];
            var cols = inputsByColumn(row);

            cells.forEach(function (value, c) {
                var input = cols[String(startCol + c)];
                if (input) {
                    input.dataset.undoBefore = input.value;
                    input.value = value;
                    dirtyByRow.set(row, mergeDirtyInfo(dirtyByRow.get(row), dirtyInfoForInput(input)));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            updateRowWinner(row);
            updateCategoryConditional(row);
            applyConditionalFormatting(row);
            scheduleRowSave(row, 1100, dirtyByRow.get(row));
        });

        return true;
    }

    function clearRow(row) {
        row.dataset.itemId = '';
        row.dataset.color = '';
        delete row.dataset.rowOrder;
        row.dataset.lineEmpty = '0';
        delete row.dataset.persistEmpty;
        row.classList.remove('is-selected');
        row.querySelectorAll('.sheet-input').forEach(function (input) {
            input.value = '';
            autoGrow(input);
        });
        row.querySelectorAll('.sheet-cell').forEach(function (cell) {
            cell.dataset.color = '';
            cell.style.backgroundColor = '';
            delete cell.dataset.orderRegisteredAt;
            delete cell.dataset.orderRegisteredLabel;
            cell.removeAttribute('title');
            setCellStyle(cell, {}, false, false);
            cell.classList.remove('is-cell-selected', 'is-active-cell', 'is-category-urgent', 'is-category-order', 'winner-price');
            clearConditionalFormattingForCell(cell);
        });

        var winner = row.querySelector('.winner-output');
        if (winner) {
            winner.value = 'Sem vencedor';
            autoGrow(winner);
        }

        var idInput = row.querySelector('.row-id-input');
        if (idInput) {
            idInput.value = '';
        }

        var rowColor = row.querySelector('.row-color-input');
        if (rowColor) {
            rowColor.value = '';
        }

        var cellColors = row.querySelector('.row-colors-input');
        if (cellColors) {
            cellColors.value = '';
        }

        var cellStyles = row.querySelector('.row-styles-input');
        if (cellStyles) {
            cellStyles.value = '';
        }

        applyConditionalFormatting(row);
        updateProductColorOptions();
        updateWinnerOptions();
    }

    function toggleRowSelection(row) {
        if (!row) {
            return;
        }

        row.classList.toggle('is-selected');
    }

    function renameSupplier(input) {
        var supplierId = input.dataset.supplierId;
        var name = input.value.trim();

        if (!supplierId || !name) {
            return;
        }

        setStatus('Salvando distribuidora...', 'saving');
        api('rename_supplier', { fornecedor_id: supplierId, nome: name }).then(function () {
            input.dataset.supplierName = name;
            input.classList.remove('is-error');
            var header = input.closest('th');
            if (header) {
                header.dataset.supplierName = name;
                header.classList.remove('is-renaming');
            }

            document.querySelectorAll('.price-input[data-supplier-id="' + supplierId + '"]').forEach(function (priceInput) {
                priceInput.dataset.supplierName = name;
                var row = priceInput.closest('tr');
                updateRowWinner(row);
                applyConditionalFormatting(row);
            });
            updateWinnerOptions();
            setStatus('Distribuidora salva', 'saved');
        }).catch(function (error) {
            input.value = input.dataset.supplierName || input.value;
            input.classList.add('is-error');
            var header = input.closest('th');
            if (header) {
                header.classList.remove('is-renaming');
            }
            setStatus(error.message, 'error');
        });
    }

    function allowSupplierEdit(input) {
        if (!input) {
            return;
        }

        closeSupplierEditors(input);
        input.readOnly = false;
        input.classList.remove('is-error');
        var header = input.closest('th');
        if (header) {
            header.classList.add('is-renaming');
        }
        input.focus();
        input.select();
    }

    function finishSupplierEdit(input) {
        if (!input || input.readOnly) {
            return;
        }

        input.readOnly = true;
        var header = input.closest('th');
        if (header) {
            header.classList.remove('is-renaming');
        }
        if (document.activeElement === input) {
            input.blur();
        }
        renameSupplier(input);
    }

    function addSupplierColumn() {
        setStatus('Adicionando distribuidora...', 'saving');
        api('add_supplier', { nome: '' }).then(function (result) {
            setStatus(result.supplier && result.supplier.already_exists ? 'Distribuidora reativada' : 'Distribuidora adicionada', 'saved');
            window.location.reload();
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function removeSupplierWithConfirm(supplierId) {
        if (!supplierId) {
            return;
        }

        if (!window.confirm('Remover esta distribuidora da tela? Os dados ficam preservados no historico.')) {
            return;
        }

        api('delete_supplier', { fornecedor_id: supplierId }).then(function () {
            setStatus('Distribuidora removida', 'saved');
            window.location.reload();
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function positionMenu(menu, event) {
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.style.right = 'auto';
        menu.hidden = false;

        var rect = menu.getBoundingClientRect();
        var left = Math.min(event.clientX, window.innerWidth - rect.width - 10);
        var top = Math.min(event.clientY, window.innerHeight - rect.height - 10);
        menu.style.left = Math.max(8, left) + 'px';
        menu.style.top = Math.max(8, top) + 'px';
    }

    function hideContextMenu() {
        if (!contextMenu) {
            return;
        }

        contextMenu.hidden = true;
        contextMenu.dataset.contextMode = '';
        var colorPanel = contextMenu.querySelector('.context-color-panel');
        var colorButton = contextMenu.querySelector('[data-context-toggle-color]');
        if (colorPanel) {
            colorPanel.hidden = true;
        }
        if (colorButton) {
            colorButton.setAttribute('aria-expanded', 'false');
        }
    }

    function showContextMenu(event, mode) {
        if (!contextMenu) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        contextMenu.dataset.contextMode = mode || 'cell';
        contextMenu.querySelectorAll('[data-cell-menu]').forEach(function (cellMenu) {
            cellMenu.hidden = false;
        });
        contextMenu.querySelectorAll('[data-header-menu]').forEach(function (headerMenu) {
            headerMenu.hidden = !contextHeaderCell;
        });
        var colorPanel = contextMenu.querySelector('.context-color-panel');
        var colorButton = contextMenu.querySelector('[data-context-toggle-color]');
        if (colorPanel) {
            colorPanel.hidden = true;
        }
        if (colorButton) {
            colorButton.setAttribute('aria-expanded', 'false');
        }
        updateContextMenuActions();
        updateFontSizeIndicator();

        if (!contextMenu.querySelector('[data-cell-menu]:not([hidden]), [data-header-menu]:not([hidden])')) {
            hideContextMenu();
            return;
        }

        positionMenu(contextMenu, event);
    }

    function supplierIdForContext() {
        if (contextSupplierHeader) {
            return String(contextSupplierHeader.dataset.supplierId || '');
        }

        var source = contextSourceCell || activeCell;
        var price = source ? source.querySelector('.price-input') : null;
        return price ? String(price.dataset.supplierId || '') : '';
    }

    function activeSupplierCount() {
        return grid.querySelectorAll('thead .supplier-heading[data-supplier-id]').length;
    }

    function updateContextMenuActions() {
        if (!contextMenu) {
            return;
        }

        var deleteButton = contextMenu.querySelector('[data-context-delete-supplier]');
        var insertRowAboveButton = contextMenu.querySelector('[data-context-insert-row-above]');
        var insertRowButton = contextMenu.querySelector('[data-context-insert-row-below]');
        var deleteRowButton = contextMenu.querySelector('[data-context-delete-row]');
        var addSupplierButton = contextMenu.querySelector('[data-context-add-supplier]');
        var supplierId = supplierIdForContext();
        var mode = contextMenu.dataset.contextMode || 'cell';
        var hideRowActions = mode === 'header' || !!contextHeaderCell;
        var hideSupplierActions = mode === 'row';
        if (insertRowAboveButton) {
            insertRowAboveButton.hidden = hideRowActions;
            insertRowAboveButton.disabled = !(contextSourceRow || activeRow);
        }
        if (insertRowButton) {
            insertRowButton.hidden = hideRowActions;
            insertRowButton.disabled = !(contextSourceRow || activeRow);
        }
        if (deleteRowButton) {
            deleteRowButton.hidden = hideRowActions;
            deleteRowButton.disabled = !(contextSourceRow || activeRow);
        }
        if (addSupplierButton) {
            addSupplierButton.hidden = hideSupplierActions || (!!contextHeaderCell && !contextSupplierHeader);
        }
        if (deleteButton) {
            deleteButton.hidden = hideSupplierActions || !supplierId;
            deleteButton.disabled = !supplierId || activeSupplierCount() <= 1;
            deleteButton.title = supplierId ? 'Excluir esta distribuidora da tela' : 'Clique com o botao direito em uma coluna de distribuidora';
        }

        var actionsBox = contextMenu.querySelector('.context-sheet-actions');
        if (actionsBox) {
            actionsBox.hidden = !Array.prototype.some.call(actionsBox.querySelectorAll('button'), function (button) {
                return !button.hidden;
            });
        }
    }

    function categoryTermsFromValue(value) {
        return value.split(/[,+;|]/).map(function (term) {
            return normalizeText(term.trim());
        }).filter(Boolean);
    }

    function categoryTerms() {
        return categoryTermsFromValue(categoryFilterValue ? categoryFilterValue.value : '');
    }

    function categoryMatchesTerms(value, terms) {
        if (!terms.length) {
            return true;
        }

        var text = normalizeText(value);
        return terms.some(function (term) {
            return text.indexOf(term) !== -1;
        });
    }

    function categoryMatchesCurrentFilter(value) {
        var terms = categoryTerms();
        return categoryMatchesTerms(value, terms);
    }

    function categoryForRow(row) {
        var input = row ? row.querySelector('.category-input') : null;
        return input ? input.value.trim() : '';
    }

    function productColorForRow(row) {
        var cell = row ? row.querySelector('td.sheet-cell[data-col-key="produto"]') : null;
        return cell ? String(cell.dataset.color || '') : '';
    }

    function collectProductColors() {
        var colors = {};

        grid.querySelectorAll('tbody td.sheet-cell[data-col-key="produto"]').forEach(function (cell) {
            var color = String(cell.dataset.color || '').trim().toLowerCase();

            if (color) {
                colors[color] = (colors[color] || 0) + 1;
            }
        });

        return Object.keys(colors).sort(function (a, b) {
            return colors[b] - colors[a] || a.localeCompare(b);
        }).map(function (color) {
            return { color: color, count: colors[color] };
        });
    }

    function winnerSupplierForRow(row) {
        var input = row ? row.querySelector('td.winner-price .price-input') : null;
        return input ? String(input.dataset.supplierId || '') : '';
    }

    function winnerTextForRow(row) {
        var output = row ? row.querySelector('.winner-output') : null;
        return output ? String(output.value || output.textContent || '').trim() : '';
    }

    function supplierFilterOptions() {
        var options = [];
        var seen = {};

        grid.querySelectorAll('thead .supplier-heading[data-supplier-id]').forEach(function (header) {
            var id = String(header.dataset.supplierId || '');
            if (!id || seen[id]) {
                return;
            }

            seen[id] = true;
            var input = header.querySelector('.supplier-name-input');
            options.push({
                id: id,
                label: (input && input.value.trim()) || header.dataset.supplierName || ('Distribuidora ' + id)
            });
        });

        return options;
    }

    function collectWinnerCounts() {
        var counts = { sem: 0 };

        grid.querySelectorAll('tbody tr').forEach(function (row) {
            var winnerId = winnerSupplierForRow(row);
            var product = row.querySelector('.product-input')?.value.trim() || '';
            var hasPrices = Array.prototype.slice.call(row.querySelectorAll('.price-input')).some(function (input) {
                return String(input.value || '').trim() !== '';
            });

            if (winnerId) {
                counts[winnerId] = (counts[winnerId] || 0) + 1;
            } else if (product || hasPrices || normalizeText(winnerTextForRow(row)).indexOf('sem vencedor') !== -1) {
                counts.sem += 1;
            }
        });

        return counts;
    }

    function winnerMatchesFilter(row, filterValue) {
        if (!filterValue) {
            return true;
        }

        var winnerId = winnerSupplierForRow(row);
        if (filterValue === 'sem') {
            return !winnerId;
        }

        return winnerId === filterValue;
    }

    function updateWinnerOptions() {
        if (!winnerPopover || !winnerOptionsBox) {
            return;
        }

        var counts = collectWinnerCounts();
        var options = supplierFilterOptions();
        winnerOptionsBox.innerHTML = '';

        options.forEach(function (option) {
            var count = counts[option.id] || 0;
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'winner-filter-option';
            button.dataset.winnerFilterValue = option.id;
            button.classList.toggle('is-active', winnerFilterValue === option.id);
            button.textContent = option.label + ' (' + count + ')';
            button.addEventListener('click', function () {
                applyWinnerFilter(option.id);
            });
            winnerOptionsBox.appendChild(button);
        });

        var noWinner = document.createElement('button');
        noWinner.type = 'button';
        noWinner.className = 'winner-filter-option';
        noWinner.dataset.winnerFilterValue = 'sem';
        noWinner.classList.toggle('is-active', winnerFilterValue === 'sem');
        noWinner.textContent = 'Sem vencedor (' + (counts.sem || 0) + ')';
        noWinner.addEventListener('click', function () {
            applyWinnerFilter('sem');
        });
        winnerOptionsBox.appendChild(noWinner);
    }

    function scheduleWinnerOptionsRefresh(delay) {
        clearTimeout(winnerOptionsTimer);
        winnerOptionsTimer = setTimeout(function () {
            updateWinnerOptions();
        }, delay || 140);
    }

    function updateFilterButtons() {
        var categoryButton = document.querySelector('[data-open-category-filter]');
        var productColorButton = document.querySelector('[data-open-product-color-filter]');
        var winnerButton = document.querySelector('[data-open-winner-filter]');
        var active = categoryTerms().length > 0;
        if (categoryButton) {
            categoryButton.classList.toggle('is-active', active);
        }
        if (productColorButton) {
            productColorButton.classList.toggle('is-active', productColorFilterValue !== '');
        }
        if (winnerButton) {
            winnerButton.classList.toggle('is-active', winnerFilterValue !== '');
        }
    }

    function hasActiveGridFilter() {
        return categoryTerms().length > 0 || productColorFilterValue !== '' || winnerFilterValue !== '';
    }

    function applyGridFilters(options) {
        options = options || {};
        var terms = categoryTerms();
        var color = productColorFilterValue;
        var winner = winnerFilterValue;
        var visibleWithData = 0;
        var hasFilter = terms.length > 0 || color !== '' || winner !== '';
        var preserveEditing = options.preserveEditing !== false;
        var editor = preserveEditing ? activeSheetEditor() : null;
        var editorRow = editor ? editor.closest('tr') : null;
        var keepViewport = Boolean(editor && document.contains(editor));
        var beforeEditorTop = keepViewport ? editor.getBoundingClientRect().top : 0;

        grid.querySelectorAll('tbody tr').forEach(function (row) {
            var category = categoryForRow(row);
            var productColor = productColorForRow(row);
            var categoryOk = !terms.length || categoryMatchesTerms(category, terms);
            var colorOk = color === '' || productColor === color;
            var winnerOk = winnerMatchesFilter(row, winner);
            var visible = !hasFilter || (categoryOk && colorOk && winnerOk);
            var protectedByEdit = !visible && row === editorRow;

            if (protectedByEdit) {
                visible = true;
            }

            row.classList.toggle('is-filter-editing', protectedByEdit);
            row.classList.toggle('is-filtered-out', !visible);

            if (!visible) {
                row.classList.remove('is-selected');
                row.querySelectorAll('.is-cell-selected, .is-active-cell, .is-column-selected').forEach(function (cell) {
                    cell.classList.remove('is-cell-selected', 'is-active-cell', 'is-column-selected');
                });
            } else {
                if (!protectedByEdit) {
                    row.classList.remove('is-filter-editing');
                }
                if (category || productColor || row.querySelector('.product-input')?.value.trim()) {
                    visibleWithData += 1;
                }
            }
        });

        if (activeCell && (!document.contains(activeCell) || activeCell.closest('tr')?.classList.contains('is-filtered-out') || !activeCell.classList.contains('is-cell-selected'))) {
            activeCell = selectedCells()[0] || null;
            activeRow = activeCell ? activeCell.closest('tr') : null;
        }
        updateActiveRowIndicator();
        updateFilterButtons();
        updateSelectionSummary();

        if (options.status !== false) {
            if (hasFilter) {
                setStatus('Filtro: ' + visibleWithData + ' linha(s)', 'waiting');
            } else {
                setStatus('Filtro limpo', 'saved');
            }
        }

        if (keepViewport && document.contains(editor)) {
            var delta = editor.getBoundingClientRect().top - beforeEditorTop;
            if (Math.abs(delta) > 1) {
                window.scrollBy(0, delta);
            }
        }
    }

    function scheduleGridFilterRefresh(delay, options) {
        clearTimeout(gridFilterRefreshTimer);
        gridFilterRefreshTimer = setTimeout(function () {
            applyGridFilters(options || { status: false });
        }, delay || 180);
    }

    function applyCategoryFilter(value, options) {
        options = options || {};
        var before = readFilterState();
        if (categoryFilterValue) {
            categoryFilterValue.value = String(value || '').trim();
        }
        applyGridFilters(options);
        if (options.history !== false && options.status !== false) {
            recordFilterChange(before);
        }
    }

    function collectCategoryValues(extraCategories, replaceKnown) {
        var values = {};

        if (replaceKnown) {
            replaceKnownCategories(extraCategories || []);
        } else {
            rememberCategories(extraCategories || []);
        }

        grid.querySelectorAll('.category-input').forEach(function (input) {
            var category = input.value.trim();
            if (category !== '') {
                values[normalizeText(category)] = category;
            }
        });

        return Object.keys(values).sort().map(function (key) {
            return values[key];
        });
    }

    function currentCategorySearchTerm() {
        var search = categoryPopover ? categoryPopover.querySelector('[data-category-filter-search]') : null;
        return search ? search.value : '';
    }

    function categorySearchScore(category, term) {
        var value = normalizeText(category);
        term = normalizeText(term);

        if (!term) {
            return 0;
        }

        if (value === term) {
            return 1;
        }

        if (value.indexOf(term) === 0) {
            return 2;
        }

        if (value.split(/\s+/).some(function (part) {
            return part.indexOf(term) === 0;
        })) {
            return 3;
        }

        if (value.indexOf(term) !== -1) {
            return 4;
        }

        return 999;
    }

    function rankedCategoryOptions(categories, term) {
        term = normalizeText(term);
        if (!term) {
            return categories;
        }

        return categories.map(function (category) {
            return {
                category: category,
                score: categorySearchScore(category, term)
            };
        }).filter(function (entry) {
            return entry.score < 999;
        }).sort(function (a, b) {
            return a.score - b.score || normalizeText(a.category).localeCompare(normalizeText(b.category));
        }).map(function (entry) {
            return entry.category;
        });
    }

    function renderCategoryOptions(categories, replaceKnown, searchTerm) {
        if (!categoryOptionsBox || !Array.isArray(categories)) {
            return;
        }

        categories = collectCategoryValues(categories, replaceKnown);
        searchTerm = searchTerm == null ? currentCategorySearchTerm() : searchTerm;
        categories = rankedCategoryOptions(categories, searchTerm);
        categoryOptionsBox.innerHTML = '';

        if (!categories.length) {
            var empty = document.createElement('span');
            empty.className = 'filter-empty';
            empty.textContent = normalizeText(searchTerm) ? 'Nenhuma categoria parecida.' : 'Nenhuma categoria digitada ainda.';
            categoryOptionsBox.appendChild(empty);
            return;
        }

        categories.forEach(function (category) {
            var score = categorySearchScore(category, searchTerm);
            var label = document.createElement('label');
            label.className = 'filter-option';
            label.classList.toggle('is-best-match', normalizeText(searchTerm) !== '' && score === categorySearchScore(categories[0], searchTerm));

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = category;
            input.checked = categoryMatchesCurrentFilter(category);

            var text = document.createElement('span');
            text.textContent = category;

            label.appendChild(input);
            label.appendChild(text);
            categoryOptionsBox.appendChild(label);
        });
    }

    function scheduleCategoryOptionsRefresh(categories, replaceKnown, delay, searchTerm) {
        clearTimeout(categoryOptionsTimer);
        categoryOptionsTimer = setTimeout(function () {
            renderCategoryOptions(Array.isArray(categories) ? categories : [], replaceKnown, searchTerm);
        }, delay || 160);
    }

    function openCategoryPopover(button) {
        if (!categoryPopover || !button) {
            return;
        }

        if (winnerPopover) {
            winnerPopover.hidden = true;
        }
        if (conditionalPopover) {
            conditionalPopover.hidden = true;
        }
        renderCategoryOptions([]);
        categoryPopover.hidden = false;
        var rect = button.getBoundingClientRect();
        categoryPopover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 360)) + 'px';
        categoryPopover.style.top = Math.min(rect.bottom + 8, window.innerHeight - 320) + 'px';
        var search = categoryPopover.querySelector('[data-category-filter-search]');
        if (search) {
            search.value = '';
            filterCategoryOptions('');
            search.focus();
            search.select();
        }
    }

    function updateProductColorOptions() {
        if (!productColorPopover) {
            return;
        }

        var box = productColorPopover.querySelector('[data-product-color-options]');
        if (!box) {
            return;
        }

        var colors = collectProductColors();
        box.innerHTML = '';

        if (!colors.length) {
            var empty = document.createElement('span');
            empty.className = 'filter-empty';
            empty.textContent = 'Nenhuma cor aplicada em Produto.';
            box.appendChild(empty);
            return;
        }

        colors.forEach(function (entry) {
            var button = document.createElement('button');
            button.className = 'color-swatch product-color-filter-swatch';
            button.type = 'button';
            button.dataset.productColorOption = entry.color;
            button.dataset.swatchColor = entry.color;
            button.title = entry.count + ' produto(s)';
            button.setAttribute('aria-label', 'Filtrar cor ' + entry.color + ', ' + entry.count + ' produto(s)');
            button.style.setProperty('--swatch-color', entry.color);
            button.style.setProperty('background-color', entry.color, 'important');
            button.classList.toggle('is-active', entry.color === productColorFilterValue);
            button.addEventListener('click', function () {
                applyProductColorFilter(entry.color);
            });
            box.appendChild(button);
        });

        hydrateColorSwatches();
    }

    function openProductColorPopover(button) {
        if (!productColorPopover || !button) {
            return;
        }

        if (winnerPopover) {
            winnerPopover.hidden = true;
        }
        if (conditionalPopover) {
            conditionalPopover.hidden = true;
        }
        productColorPopover.hidden = false;
        var rect = button.getBoundingClientRect();
        productColorPopover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 300)) + 'px';
        productColorPopover.style.top = Math.min(rect.bottom + 8, window.innerHeight - 260) + 'px';
        updateProductColorOptions();
    }

    function openWinnerPopover(button) {
        if (!winnerPopover || !button) {
            return;
        }

        if (categoryPopover) {
            categoryPopover.hidden = true;
        }
        if (productColorPopover) {
            productColorPopover.hidden = true;
        }
        if (conditionalPopover) {
            conditionalPopover.hidden = true;
        }

        winnerPopover.hidden = false;
        var rect = button.getBoundingClientRect();
        winnerPopover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 320)) + 'px';
        winnerPopover.style.top = Math.min(rect.bottom + 8, window.innerHeight - 300) + 'px';
        updateWinnerOptions();
    }

    function applyProductColorFilter(color) {
        var before = readFilterState();
        productColorFilterValue = String(color || '');
        clearCellSelection();
        applyGridFilters();
        updateProductColorOptions();
        recordFilterChange(before);
        if (productColorPopover) {
            productColorPopover.hidden = true;
        }
    }

    function applyWinnerFilter(value) {
        var before = readFilterState();
        winnerFilterValue = String(value || '');
        clearCellSelection();
        applyGridFilters();
        updateWinnerOptions();
        recordFilterChange(before);
        if (winnerPopover) {
            winnerPopover.hidden = true;
        }
    }

    function filterCategoryOptions(term) {
        renderCategoryOptions([], false, term);
        if (categoryOptionsBox) {
            categoryOptionsBox.scrollTop = 0;
        }
    }

    seedKnownCategories();

    document.addEventListener('blur', decimalBlur, true);

    document.addEventListener('beforeinput', function (event) {
        var target = event.target;
        if (!target.matches('.sheet-input, .supplier-name-input')) {
            return;
        }

        target.dataset.undoBefore = target.value;
    });

    document.addEventListener('focusin', function (event) {
        var row = event.target.closest ? event.target.closest('tbody tr') : null;
        if (row && grid.contains(row)) {
            activeRow = row;
        }

        var cell = sheetCellFrom(event.target);
        if (cell) {
            activeCell = cell;
            anchorCell = anchorCell || cell;
            schedulePresencePing(120);
        }
    });

    document.addEventListener('focusout', function (event) {
        var wasSheetEditing = event.target.matches('.sheet-input.is-editing');
        var wasCategoryEditing = wasSheetEditing && event.target.classList.contains('category-input');

        if (wasSheetEditing) {
            exitEditField(event.target);
        }

        if (event.target.matches('.supplier-name-input')) {
            finishSupplierEdit(event.target);
        }

        if (wasCategoryEditing && hasActiveGridFilter()) {
            window.setTimeout(function () {
                applyGridFilters({ status: false, preserveEditing: false });
            }, 0);
        }

        if (wasSheetEditing || event.target.matches('.supplier-name-input')) {
            schedulePresencePing(160);
        }
    });

    document.addEventListener('input', function (event) {
        var target = event.target;

        if (!isApplyingUndo && target.matches('.sheet-input, .supplier-name-input')) {
            var before = Object.prototype.hasOwnProperty.call(target.dataset, 'undoBefore') ? target.dataset.undoBefore : target.value;
            if (before !== target.value) {
                pushUndo({ type: 'field', field: target, before: before, after: target.value });
                target.dataset.undoBefore = target.value;
            }
        }

        if (target.classList.contains('price-input')) {
            var priceRow = target.closest('tr');
            updateRowWinner(priceRow);
            applyConditionalFormatting(priceRow);
            if (winnerFilterValue) {
                scheduleGridFilterRefresh(140, { status: false });
            }
            scheduleWinnerOptionsRefresh(160);
        }

        if (target.classList.contains('category-input')) {
            updateCategoryConditional(target.closest('tr'), true);
            scheduleCategoryOptionsRefresh([], false, 180);
            if (hasActiveGridFilter()) {
                scheduleGridFilterRefresh(180, { status: false });
            }
        }

        autoGrow(target);

        if (target.classList.contains('sheet-input')) {
            var inputRow = target.closest('tr');
            if (target.classList.contains('product-input')) {
                updateProductColorOptions();
            }
            applyConditionalFormatting(inputRow);
            scheduleRowSave(inputRow, 850, dirtyInfoForInput(target));
            updateSelectionSummary();
            schedulePresencePing(650);
        }

        if (target.classList.contains('supplier-name-input') && !target.readOnly) {
            var id = target.dataset.supplierId;
            clearTimeout(supplierTimers[id]);
            supplierTimers[id] = setTimeout(function () {
                renameSupplier(target);
            }, 900);
        }
    });

    document.addEventListener('paste', function (event) {
        var text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
        var target = event.target;

        if (isExternalWidgetTarget(target)) {
            return;
        }

        if (!target.classList || !target.classList.contains('sheet-input')) {
            target = activeCell ? editableField(activeCell) : null;
        }

        if (pasteMatrix(target, text)) {
            event.preventDefault();
        }
    });

    document.addEventListener('keydown', function (event) {
        var target = event.target;
        if (isExternalWidgetTarget(target)) {
            return;
        }

        var controlTextTarget = isSheetControlTarget(target) && target.matches && target.matches('input, textarea, select');

        if (!controlTextTarget) {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
                if (applyRedo()) {
                    event.preventDefault();
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y') {
                if (applyRedo()) {
                    event.preventDefault();
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
                if (applyUndo()) {
                    event.preventDefault();
                }
                return;
            }
        }

        if (isSheetControlTarget(target)) {
            return;
        }

        var editing = target && target.matches && (target.matches('.sheet-input.is-editing') || (target.matches('.supplier-name-input') && !target.readOnly));

        if (event.key === 'F4' && !event.ctrlKey && !event.metaKey && !event.altKey && activeCell) {
            if (editing && target.matches && target.matches('.sheet-input.is-editing')) {
                exitEditField(target);
            }

            if (applyLastRepeatAction()) {
                event.preventDefault();
            }
            return;
        }

        if (editing && target.matches && target.matches('.sheet-input.is-editing')
            && (event.key === 'Delete' || event.key === 'Del' || event.key === 'Backspace')
            && !event.ctrlKey && !event.metaKey && !event.altKey) {
            var editingSheetCell = target.closest('td.sheet-cell');
            if (editingSheetCell && !editingSheetCell.classList.contains('is-cell-selected')) {
                selectCell(editingSheetCell, false);
            }
            return;
        }

        if (editing && event.key === 'Escape') {
            target.blur();
            event.preventDefault();
            return;
        }

        var editingMove = keyMoveDelta(event.key);
        if (editing && editingMove && target.matches('.sheet-input.is-editing') && !event.ctrlKey && !event.metaKey && !event.altKey) {
            var moveFromCell = target.closest('td.sheet-cell');
            if (moveFromCell) {
                activeCell = moveFromCell;
                exitEditField(target);
                if (moveActiveCell(editingMove[0], editingMove[1], event.shiftKey)) {
                    event.preventDefault();
                }
            }
            return;
        }

        if (editing && event.key === 'Enter' && !event.shiftKey) {
            var editingCell = target.closest('td.sheet-cell');
            if (editingCell) {
                activeCell = editingCell;
                exitEditField(target);
                moveActiveCell(0, 1, false);
                event.preventDefault();
            }
            return;
        }

        var rowNumber = target && target.closest ? target.closest('td.row-number') : null;
        if (rowNumber && grid.contains(rowNumber) && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggleRowSelection(rowNumber.closest('tr'));
            return;
        }

        if (editing || !activeCell) {
            return;
        }

        if (event.key === 'Enter') {
            if (moveActiveCell(0, event.shiftKey ? -1 : 1, false)) {
                event.preventDefault();
            }
            return;
        }

        if (event.key === 'F2') {
            if (enterEditCell(activeCell, false)) {
                event.preventDefault();
            }
            return;
        }

        if (event.key === 'Delete' || event.key === 'Del' || event.key === 'Backspace') {
            if (clearSelectedCells()) {
                event.preventDefault();
            }
            return;
        }

        var move = keyMoveDelta(event.key);

        if (move) {
            if (moveActiveCell(move[0], move[1], event.shiftKey)) {
                event.preventDefault();
            }
            return;
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            var field = editableField(activeCell);
            if (field) {
                var beforeValue = field.value;
                field.value = '';
                enterEditCell(activeCell, false);
                field.dataset.undoBefore = beforeValue;
                field.value = event.key;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                event.preventDefault();
            }
        }
    }, true);

    document.addEventListener('keyup', function (event) {
        var target = event.target;

        if (!target || !target.matches || !target.matches('.sheet-input')) {
            return;
        }

        if (event.key !== 'Delete' && event.key !== 'Del' && event.key !== 'Backspace') {
            return;
        }

        var row = target.closest('tr');
        if (!row || !grid.contains(row)) {
            return;
        }

        if (target.classList.contains('category-input')) {
            updateCategoryConditional(row, true);
            scheduleCategoryOptionsRefresh([], false, 180);
            if (hasActiveGridFilter()) {
                scheduleGridFilterRefresh(180, { status: false });
            }
        }

        applyConditionalFormatting(row);
        scheduleRowSave(row, 850, dirtyInfoForInput(target));
        updateSelectionSummary();
    }, true);

    document.addEventListener('click', function (event) {
        if (!event.target.closest || !event.target.closest('.supplier-name-input')) {
            closeSupplierEditors();
        }

        if (contextMenu && !contextMenu.hidden && !contextMenu.contains(event.target)) {
            hideContextMenu();
        }

        var rowNumber = event.target.closest ? event.target.closest('td.row-number') : null;
        if (rowNumber && grid.contains(rowNumber)) {
            if (suppressRowNumberClick) {
                suppressRowNumberClick = false;
                return;
            }

            var rowIndex = visibleRows().indexOf(rowNumber.closest('tr'));
            selectRowsRange(rowIndex, rowIndex);
            return;
        }

        if (categoryPopover && !categoryPopover.hidden && !categoryPopover.contains(event.target) && !event.target.closest('[data-open-category-filter]')) {
            categoryPopover.hidden = true;
        }

        if (productColorPopover && !productColorPopover.hidden && !productColorPopover.contains(event.target) && !event.target.closest('[data-open-product-color-filter]')) {
            productColorPopover.hidden = true;
        }

        if (winnerPopover && !winnerPopover.hidden && !winnerPopover.contains(event.target) && !event.target.closest('[data-open-winner-filter]')) {
            winnerPopover.hidden = true;
        }

        if (conditionalPopover && !conditionalPopover.hidden && !conditionalPopover.contains(event.target) && !event.target.closest('[data-open-conditional-format]')) {
            conditionalPopover.hidden = true;
        }

        if (toolbarPalette && !toolbarPalette.hidden && !toolbarPalette.contains(event.target) && !event.target.closest('[data-open-toolbar-palette]')) {
            toolbarPalette.hidden = true;
        }

        if (selectionSummaryMenu && !selectionSummaryMenu.hidden && !event.target.closest('[data-selection-summary]')) {
            selectionSummaryMenu.hidden = true;
        }
    });

    if (contextMenu) {
        contextMenu.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        contextMenu.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    }

    grid.addEventListener('mousedown', function (event) {
        if (event.button !== 0) {
            return;
        }

        var resizeHandle = event.target.closest('[data-resize-col]');
        if (resizeHandle) {
            var resizeHeader = resizeHandle.closest('th[data-col-index]');
            if (resizeHeader) {
                var resizeCol = colElement(resizeHeader.dataset.colIndex);
                resizeState = {
                    header: resizeHeader,
                    col: resizeCol,
                    colIndex: resizeHeader.dataset.colIndex,
                    startX: event.clientX,
                    startWidth: (resizeCol || resizeHeader).getBoundingClientRect().width,
                    currentWidth: resizeHeader.getBoundingClientRect().width
                };
                grid.classList.add('is-resizing');
                resizeHeader.classList.add('is-resize-active');
                updateColumnResizeGuide(resizeHeader);
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        if (event.target.closest('[data-open-category-filter], [data-open-product-color-filter], [data-open-winner-filter], [data-open-toolbar-palette], [data-open-conditional-format], [data-clear-formatting], [data-add-supplier-plus], [data-remove-last-supplier]')) {
            return;
        }

        var supplierInputTarget = event.target.closest('.supplier-name-input');
        if (supplierInputTarget && !supplierInputTarget.readOnly) {
            return;
        }

        var field = event.target.closest('.sheet-input.is-editing');
        if (field) {
            return;
        }

        var rowNumber = event.target.closest('td.row-number');
        if (rowNumber && grid.contains(rowNumber)) {
            closeEditingFields();
            closeSupplierEditors();
            var rowIndex = visibleRows().indexOf(rowNumber.closest('tr'));
            sheetDragSelection = { type: 'row', startRow: rowIndex };
            suppressRowNumberClick = true;
            selectRowsRange(rowIndex, rowIndex);
            event.preventDefault();
            return;
        }

        var header = event.target.closest('thead th[data-col-index]');
        if (header && grid.contains(header)) {
            if (event.target.closest('.filter-funnel')) {
                closeEditingFields();
                return;
            }

            closeEditingFields();
            closeSupplierEditors();
            sheetDragSelection = { type: 'column', startCol: Number(header.dataset.colIndex || 0) };
            selectColumn(Number(header.dataset.colIndex || 0));
            event.preventDefault();
            return;
        }

        var allHeader = event.target.closest('thead th.all-select-heading');
        if (allHeader && grid.contains(allHeader)) {
            closeEditingFields();
            closeSupplierEditors();
            selectAllCells();
            event.preventDefault();
            return;
        }

        var cell = sheetCellFrom(event.target);
        if (!cell) {
            return;
        }

        closeEditingFields();
        closeSupplierEditors();
        blurActiveSheetControl();
        event.preventDefault();
        if (event.shiftKey && anchorCell) {
            selectCellRange(anchorCell, cell);
        } else {
            selectCell(cell, event.ctrlKey || event.metaKey);
        }
        isSelectingCells = true;
    });

    grid.addEventListener('click', function (event) {
        var addSupplierButton = event.target.closest('[data-add-supplier-plus]');
        if (addSupplierButton && grid.contains(addSupplierButton)) {
            event.preventDefault();
            event.stopPropagation();
            addSupplierColumn();
            return;
        }

        var removeSupplierButton = event.target.closest('[data-remove-last-supplier]');
        if (removeSupplierButton && grid.contains(removeSupplierButton)) {
            event.preventDefault();
            event.stopPropagation();
            if (removeSupplierButton.disabled) {
                return;
            }
            removeSupplierWithConfirm(removeSupplierButton.dataset.supplierId || '');
            return;
        }
    });

    grid.addEventListener('mouseover', function (event) {
        if (sheetDragSelection && sheetDragSelection.type === 'column') {
            var header = event.target.closest('thead th[data-col-index]');
            if (header && grid.contains(header)) {
                selectColumnRange(sheetDragSelection.startCol, Number(header.dataset.colIndex || 0));
            }
            return;
        }

        if (sheetDragSelection && sheetDragSelection.type === 'row') {
            var rowNumber = event.target.closest('td.row-number');
            if (rowNumber && grid.contains(rowNumber)) {
                selectRowsRange(sheetDragSelection.startRow, visibleRows().indexOf(rowNumber.closest('tr')));
            }
            return;
        }

        if (!isSelectingCells || !anchorCell) {
            return;
        }

        var cell = sheetCellFrom(event.target);
        if (cell) {
            selectCellRange(anchorCell, cell);
        }
    });

    document.addEventListener('mousemove', function (event) {
        if (fillDragState) {
            updateFillDrag(event.clientX, event.clientY);
            event.preventDefault();
            return;
        }

        if (!resizeState) {
            return;
        }

        var width = Math.max(62, Math.min(720, resizeState.startWidth + event.clientX - resizeState.startX));
        resizeState.currentWidth = setColumnWidth(resizeState.colIndex, width);
        updateColumnResizeGuide(resizeState.header);
        event.preventDefault();
    });

    document.addEventListener('mouseup', function () {
        if (fillDragState) {
            applyFillDrag();
            fillDragState = null;
            clearFillPreview();
            updateFillHandle();
        }

        isSelectingCells = false;
        sheetDragSelection = null;
        window.setTimeout(function () {
            suppressRowNumberClick = false;
        }, 0);
        if (resizeState) {
            saveColumnWidth(resizeState.colIndex, resizeState.currentWidth || resizeState.startWidth);
            if (resizeState.header) {
                resizeState.header.classList.remove('is-resize-active');
            }
            grid.classList.remove('is-resizing');
            hideColumnResizeGuide();
            resizeState = null;
        }
    });

    grid.addEventListener('dblclick', function (event) {
        var supplierInput = event.target.closest('.supplier-name-input');
        if (supplierInput && grid.contains(supplierInput)) {
            allowSupplierEdit(supplierInput);
            return;
        }

        var cell = sheetCellFrom(event.target);
        if (cell) {
            enterEditCell(cell, false);
        }
    });

    grid.addEventListener('contextmenu', function (event) {
        var rowNumber = event.target.closest ? event.target.closest('tbody td.row-number') : null;
        if (rowNumber && grid.contains(rowNumber)) {
            var row = rowNumber.closest('tr');
            var rowIndex = visibleRows().indexOf(row);
            if (rowIndex >= 0) {
                selectRowsRange(rowIndex, rowIndex);
            }
            contextSupplierHeader = null;
            contextHeaderCell = null;
            contextSourceCell = row ? row.querySelector('td.sheet-cell') : activeCell;
            contextSourceRow = row || activeRow;
            showContextMenu(event, 'row');
            return;
        }

        var cell = sheetCellFrom(event.target);
        if (cell) {
            if (!cell.classList.contains('is-cell-selected')) {
                selectCell(cell, false);
            }
            contextSupplierHeader = null;
            contextHeaderCell = null;
            contextSourceCell = cell;
            contextSourceRow = cell.closest('tr');
            showContextMenu(event, 'cell');
            return;
        }

        var header = event.target.closest('thead th[data-col-index]');
        if (header && grid.contains(header)) {
            selectColumn(Number(header.dataset.colIndex || 0));
            contextHeaderCell = header;
            contextSupplierHeader = header.classList.contains('supplier-heading') ? header : null;
            contextSourceCell = null;
            contextSourceRow = activeRow;
            showContextMenu(event, 'header');
            return;
        }

        var allHeader = event.target.closest('thead th.all-select-heading');
        if (allHeader && grid.contains(allHeader)) {
            selectAllCells();
            contextSupplierHeader = null;
            contextHeaderCell = allHeader;
            contextSourceCell = null;
            contextSourceRow = activeRow;
            showContextMenu(event, 'header');
            return;
        }

        if (selectedCells().length || activeCell) {
            contextSupplierHeader = null;
            contextHeaderCell = null;
            contextSourceCell = activeCell;
            contextSourceRow = activeRow;
            showContextMenu(event, 'cell');
        }
    });

    document.addEventListener('contextmenu', function (event) {
        if (grid.contains(event.target) || isExternalWidgetTarget(event.target) || isSheetControlTarget(event.target)) {
            return;
        }

        var shell = event.target.closest ? event.target.closest('.cotacao-shell') : null;
        if (!shell) {
            return;
        }

        if (!selectedCells().length && !activeCell) {
            return;
        }

        contextSupplierHeader = null;
        contextHeaderCell = null;
        contextSourceCell = activeCell;
        contextSourceRow = activeRow;
        showContextMenu(event, 'cell');
    });

    contextMenu?.querySelector('[data-context-insert-row-below]')?.addEventListener('click', function () {
        hideContextMenu();
        insertRowBelow(contextSourceRow || activeRow);
    });

    contextMenu?.querySelector('[data-context-insert-row-above]')?.addEventListener('click', function () {
        hideContextMenu();
        insertRowAbove(contextSourceRow || activeRow);
    });

    contextMenu?.querySelector('[data-context-delete-row]')?.addEventListener('click', function () {
        hideContextMenu();
        deleteContextRow(contextSourceRow || activeRow);
    });

    contextMenu?.querySelector('[data-context-add-supplier]')?.addEventListener('click', function () {
        hideContextMenu();
        addSupplierColumn();
    });

    contextMenu?.querySelector('[data-context-delete-supplier]')?.addEventListener('click', function () {
        var supplierId = supplierIdForContext();
        hideContextMenu();
        removeSupplierWithConfirm(supplierId);
    });

    contextMenu?.querySelector('[data-context-toggle-color]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var panel = contextMenu.querySelector('.context-color-panel');
        if (!panel) {
            return;
        }
        panel.hidden = !panel.hidden;
        event.currentTarget.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    });

    contextMenu?.querySelectorAll('[data-context-color]').forEach(function (button) {
        button.addEventListener('click', function () {
            hideContextMenu();
            applyColorToSelectedCells(button.dataset.contextColor || '');
        });
    });

    document.querySelector('[data-history-undo]')?.addEventListener('click', function () {
        applyUndo();
    });

    document.querySelector('[data-history-redo]')?.addEventListener('click', function () {
        applyRedo();
    });

    document.querySelectorAll('[data-toolbar-color]').forEach(function (button) {
        button.addEventListener('click', function () {
            applyColorToSelectedCells(button.dataset.toolbarColor || '');
            if (toolbarPalette) {
                toolbarPalette.hidden = true;
            }
        });
    });

    document.querySelector('[data-open-toolbar-palette]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!toolbarPalette) {
            return;
        }

        toolbarPalette.hidden = !toolbarPalette.hidden;
    });

    document.querySelectorAll('[data-format-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
            toggleSelectedStyle(button.dataset.formatToggle || '');
        });
    });

    document.querySelectorAll('[data-format-size]').forEach(function (button) {
        button.addEventListener('click', function () {
            changeSelectedFontSize(Number(button.dataset.formatSize || 0));
        });
    });

    fontSizeIndicator?.addEventListener('change', function () {
        setSelectedFontSize(fontSizeIndicator.value);
    });

    fontSizeIndicator?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            setSelectedFontSize(fontSizeIndicator.value);
        }
    });

    document.querySelectorAll('[data-format-align]').forEach(function (button) {
        button.addEventListener('click', function () {
            alignSelectedCells(button.dataset.formatAlign || 'left');
        });
    });

    contextMenu?.querySelectorAll('[data-context-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
            hideContextMenu();
            toggleSelectedStyle(button.dataset.contextToggle || '');
        });
    });

    contextMenu?.querySelectorAll('[data-context-size]').forEach(function (button) {
        button.addEventListener('click', function () {
            changeSelectedFontSize(Number(button.dataset.contextSize || 0));
        });
    });

    contextFontSizeInput?.addEventListener('change', function () {
        setSelectedFontSize(contextFontSizeInput.value);
    });

    contextFontSizeInput?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            setSelectedFontSize(contextFontSizeInput.value);
        }
    });

    contextMenu?.querySelectorAll('[data-context-align]').forEach(function (button) {
        button.addEventListener('click', function () {
            hideContextMenu();
            alignSelectedCells(button.dataset.contextAlign || 'left');
        });
    });

    document.querySelector('[data-print-selected]')?.addEventListener('click', function () {
        printSelectedCells();
    });

    contextMenu?.querySelector('[data-context-print-selected]')?.addEventListener('click', function () {
        hideContextMenu();
        printSelectedCells();
    });

    document.querySelector('[data-open-conditional-format]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openConditionalPopover(event.currentTarget);
    });

    document.querySelector('[data-clear-formatting]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        clearFormattingForSelectedCells();
    });

    conditionalPopover?.querySelector('[data-conditional-close]')?.addEventListener('click', function () {
        conditionalPopover.hidden = true;
    });

    conditionalPopover?.querySelector('[data-conditional-save]')?.addEventListener('click', function () {
        saveConditionalRule();
    });

    conditionalPopover?.querySelector('[data-conditional-operator]')?.addEventListener('change', function () {
        updateConditionalTermState();
    });

    conditionalPopover?.querySelector('[data-conditional-term]')?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveConditionalRule();
        }
    });

    conditionalPopover?.querySelectorAll('[data-conditional-color]').forEach(function (button) {
        button.addEventListener('click', function () {
            setConditionalColor(button.dataset.conditionalColor || '');
        });
    });

    conditionalPopover?.querySelector('[data-conditional-rule-list]')?.addEventListener('click', function (event) {
        var edit = event.target.closest('[data-conditional-edit-rule]');
        if (edit) {
            event.preventDefault();
            event.stopPropagation();
            editConditionalRule(edit.dataset.conditionalEditRule);
            return;
        }

        var del = event.target.closest('[data-conditional-delete-rule]');
        if (del) {
            event.preventDefault();
            event.stopPropagation();
            deleteConditionalRule(del.dataset.conditionalDeleteRule);
        }
    });

    document.querySelector('[data-open-category-filter]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openCategoryPopover(event.currentTarget);
    });

    document.querySelector('[data-open-product-color-filter]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openProductColorPopover(event.currentTarget);
    });

    document.querySelector('[data-open-winner-filter]')?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openWinnerPopover(event.currentTarget);
    });

    categoryPopover?.querySelector('[data-category-filter-search]')?.addEventListener('input', function (event) {
        filterCategoryOptions(event.target.value);
    });

    categoryPopover?.querySelector('[data-category-filter-search]')?.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        var first = categoryOptionsBox ? categoryOptionsBox.querySelector('.filter-option input[type="checkbox"]') : null;
        if (first) {
            first.checked = true;
        }
        categoryPopover.querySelector('[data-category-apply]')?.click();
    });

    categoryPopover?.querySelector('[data-category-select-all]')?.addEventListener('click', function () {
        categoryOptionsBox?.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
            input.checked = true;
        });
    });

    categoryPopover?.querySelector('[data-category-clear]')?.addEventListener('click', function () {
        var before = readFilterState();
        var search = categoryPopover.querySelector('[data-category-filter-search]');
        if (search) {
            search.value = '';
        }

        if (categoryFilterValue) {
            categoryFilterValue.value = '';
        }

        filterCategoryOptions('');
        categoryOptionsBox?.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
            input.checked = false;
        });
        clearCellSelection();
        applyGridFilters();
        recordFilterChange(before);
        if (document.activeElement && categoryPopover.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        setStatus('Filtro de categoria limpo', 'saved');
    });

    categoryPopover?.querySelector('[data-category-apply]')?.addEventListener('click', function () {
        if (!categoryFilterValue) {
            return;
        }

        var boxes = Array.prototype.slice.call(categoryOptionsBox ? categoryOptionsBox.querySelectorAll('input[type="checkbox"]') : []);
        var checked = boxes.filter(function (input) {
            return input.checked;
        }).map(function (input) {
            return input.value;
        });
        var search = categoryPopover.querySelector('[data-category-filter-search]');
        var searchValue = search ? search.value.trim() : '';

        var nextCategoryFilter = '';
        if (searchValue !== '' && boxes.length && checked.length === boxes.length) {
            nextCategoryFilter = searchValue;
        } else if (boxes.length && checked.length === boxes.length) {
            nextCategoryFilter = '';
        } else if (checked.length) {
            nextCategoryFilter = checked.join(',');
        } else if (searchValue !== '') {
            nextCategoryFilter = searchValue;
        }

        clearCellSelection();
        applyCategoryFilter(nextCategoryFilter);
        categoryPopover.hidden = true;
        if (document.activeElement && categoryPopover.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    });

    productColorPopover?.querySelector('[data-product-color-clear]')?.addEventListener('click', function () {
        applyProductColorFilter('');
    });

    winnerPopover?.querySelector('[data-winner-clear]')?.addEventListener('click', function () {
        applyWinnerFilter('');
    });

    selectionSummaryToggle?.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (selectionSummaryMenu) {
            selectionSummaryMenu.hidden = !selectionSummaryMenu.hidden;
        }
    });

    selectionSummaryMenu?.addEventListener('click', function (event) {
        var button = event.target.closest('[data-summary-metric]');
        if (!button) {
            return;
        }

        event.preventDefault();
        selectionSummaryMetric = button.dataset.summaryMetric || 'sum';
        selectionSummaryMenu.hidden = true;
        updateSelectionSummary();
    });

    document.querySelectorAll('[data-add-rows]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (button.disabled) {
                return;
            }

            button.disabled = true;
            addPersistedRows(Number(button.dataset.addRows || 10)).finally(function () {
                button.disabled = false;
            });
        });
    });

    document.querySelector('[data-delete-selected]')?.addEventListener('click', function () {
        var selected = visibleRows().filter(function (row) {
            return row.classList.contains('is-selected');
        });

        if (!selected.length) {
            setStatus('Clique no numero da linha para selecionar.', 'waiting');
            return;
        }

        Promise.all(selected.map(function (row) {
            var itemId = Number(row.dataset.itemId || 0);
            if (!itemId) {
                clearRow(row);
                markRowClean(row);
                return Promise.resolve(null);
            }

            return api('delete_row', { id: itemId }).then(function (result) {
                clearRow(row);
                markRowClean(row);
                return result;
            });
        })).then(function (results) {
            var lastResult = (results || []).filter(Boolean).pop();
            if (lastResult && Array.isArray(lastResult.categories)) {
                renderCategoryOptions(lastResult.categories, true);
            }
            pullSync();
            setStatus('Linha(s) excluida(s)', 'saved');
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    });

    grid.querySelectorAll('.supplier-name-input').forEach(function (input) {
        input.readOnly = true;
    });

    window.addEventListener('scroll', updateFillHandle, true);
    window.addEventListener('resize', updateFillHandle);

    hydrateColorSwatches();
    loadColumnWidths();
    applyInitialCellVisuals();

    grid.querySelectorAll('tbody tr').forEach(function (row) {
        prepareReadonly(row);
        updateRowWinner(row);
        updateCategoryConditional(row);
        applyConditionalFormatting(row);
        autoGrowRow(row);
    });
    applyCategoryFilter(categoryFilterValue ? categoryFilterValue.value : '', { status: false });
    updateFontSizeIndicator();
    updateProductColorOptions();
    updateWinnerOptions();
    updateHistoryButtons();
    startLiveSync();
});
