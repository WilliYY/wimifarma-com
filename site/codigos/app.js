(function () {
    var SAVE_DELAY_MS = 650;
    var apiUrl = '/codigos/api.php';
    var draggedRow = null;
    var pointerDrag = null;

    function normalizePrice(value) {
        var text = String(value || '').replace(/[^\d,.-]/g, '').trim();

        if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) {
            text = text.replace(/\./g, '').replace(',', '.');
        } else {
            text = text.replace(',', '.');
        }

        var number = Number.parseFloat(text);
        if (!Number.isFinite(number) || number < 0) {
            return '';
        }

        return number.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function field(row, name) {
        return row.querySelector('[name="' + name + '"]');
    }

    function rowPayload(row) {
        return JSON.stringify({
            id: field(row, 'id') ? field(row, 'id').value.trim() : '',
            codigo: field(row, 'codigo') ? field(row, 'codigo').value.trim() : '',
            ean: field(row, 'ean') ? field(row, 'ean').value.trim() : '',
            preco: field(row, 'preco') ? field(row, 'preco').value.trim() : ''
        });
    }

    function isNewRow(row) {
        return row.hasAttribute('data-new-row');
    }

    function isRowReady(row) {
        return ['codigo', 'ean', 'preco'].every(function (name) {
            var input = field(row, name);
            return input && input.value.trim() !== '';
        });
    }

    function setStatus(row, text, state) {
        var status = row.querySelector('[data-save-status]');
        if (!status) {
            return;
        }

        status.textContent = text;
        status.className = 'codes-save-status';
        if (state) {
            status.classList.add('is-' + state);
        }
    }

    function groupFromEan(ean) {
        var digits = String(ean || '').replace(/\D+/g, '');
        var prefix = digits.slice(0, 2);

        if (/^\d{2}$/.test(prefix)) {
            return prefix;
        }

        return 'outros';
    }

    function placeholderForGroup(group) {
        if (/^\d{2}$/.test(group)) {
            return group + ' 000';
        }

        return 'EAN';
    }

    function labelForGroup(group) {
        if (/^\d{2}$/.test(group)) {
            return 'EAN ' + group;
        }

        return 'Outros';
    }

    function canDeleteGroup(group) {
        return /^\d{2}$/.test(group) && group !== '20' && group !== '40';
    }

    function normalizeGroupInput(value) {
        var digits = String(value || '').replace(/\D+/g, '');
        return digits.slice(0, 2);
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

    function groupTitleHtml(group, label, countText) {
        var actions = '<div class="codes-sheet-title-actions">'
            + '<span data-code-group-count="' + escapeHtml(group) + '">' + escapeHtml(countText || '0 item(ns)') + '</span>';

        if (canDeleteGroup(group)) {
            actions += '<button type="button" class="codes-btn codes-btn-table-delete" data-delete-code-group="' + escapeHtml(group) + '" data-delete-code-group-label="' + escapeHtml(label) + '">Excluir tabela</button>';
        }

        actions += '</div>';

        return '<div class="codes-sheet-title"><h2>' + escapeHtml(label) + '</h2>' + actions + '</div>';
    }

    function buildFormData(row, action) {
        var data = new FormData(row);
        data.set('action', action);
        return data;
    }

    function csrfToken() {
        var input = document.querySelector('input[name="csrf_token"]');
        return input ? input.value : '';
    }

    function postFormData(data) {
        return window.fetch(apiUrl, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: data
        }).then(function (response) {
            return response.json().catch(function () {
                return { ok: false, message: 'Resposta invalida do servidor.' };
            }).then(function (payload) {
                if (!response.ok || !payload.ok) {
                    throw new Error(payload.message || 'Nao consegui salvar.');
                }

                return payload;
            });
        });
    }

    function request(row, action) {
        return postFormData(buildFormData(row, action));
    }

    function ensureDeleteButton(row) {
        var actions = row.querySelector('.codes-row-actions');
        if (!actions || actions.querySelector('[data-confirm-delete]')) {
            return;
        }

        var button = document.createElement('button');
        button.type = 'submit';
        button.name = 'action';
        button.value = 'delete';
        button.className = 'codes-btn codes-btn-danger';
        button.setAttribute('data-confirm-delete', '');
        button.setAttribute('formnovalidate', '');
        button.textContent = 'Apagar';
        actions.appendChild(button);
    }

    function resetNewRow(row, group) {
        row.classList.add('codes-row-new');
        row.classList.remove('is-dirty', 'is-saving', 'is-saved', 'is-error');
        row.setAttribute('data-new-row', '');
        row.setAttribute('data-code-group', group);
        row.dataset.lastPayload = '';
        row.dataset.saveTimer = '';

        var id = field(row, 'id');
        var action = field(row, 'action');
        var ean = field(row, 'ean');
        var number = row.querySelector('.codes-row-number');

        if (id) {
            id.value = '';
        }
        if (action) {
            action.value = 'create';
        }
        if (number) {
            number.textContent = '+';
            number.classList.remove('codes-row-drag-handle');
            number.removeAttribute('data-drag-handle');
            number.removeAttribute('title');
        }

        ['codigo', 'ean', 'preco'].forEach(function (name) {
            var input = field(row, name);
            if (input) {
                input.value = '';
            }
        });

        if (ean) {
            ean.placeholder = placeholderForGroup(group);
        }

        row.querySelectorAll('[data-confirm-delete]').forEach(function (button) {
            button.remove();
        });

        setStatus(row, 'Novo', 'muted');
    }

    function makeSavedRow(row, item) {
        var id = field(row, 'id');
        var action = field(row, 'action');

        row.removeAttribute('data-new-row');
        row.classList.remove('codes-row-new', 'is-dirty', 'is-saving', 'is-error');
        row.classList.add('is-saved');
        row.setAttribute('data-code-group', item.group);

        if (id) {
            id.value = String(item.id || '');
        }
        if (action) {
            action.value = 'update';
        }
        if (field(row, 'codigo')) {
            field(row, 'codigo').value = item.codigo || '';
        }
        if (field(row, 'ean')) {
            field(row, 'ean').value = item.ean || '';
        }
        if (field(row, 'preco')) {
            field(row, 'preco').value = item.preco || '';
        }

        var number = row.querySelector('.codes-row-number');
        if (number) {
            number.classList.add('codes-row-drag-handle');
            number.setAttribute('data-drag-handle', '');
            number.setAttribute('title', 'Arraste para mudar a ordem');
        }

        ensureDeleteButton(row);
        initDrag(row);
        setStatus(row, 'Salvo', 'saved');
        row.dataset.lastPayload = rowPayload(row);
    }

    function createPanel(group) {
        var existing = document.querySelector('[data-code-group-panel="' + group + '"]');
        if (existing) {
            return existing;
        }

        var board = document.querySelector('.codes-sheet-board');
        if (!board) {
            return null;
        }

        var label = labelForGroup(group);
        var panel = document.createElement('section');
        panel.className = 'codes-sheet-panel';
        panel.setAttribute('aria-label', label);
        panel.setAttribute('data-code-group-panel', group);

        panel.innerHTML = ''
            + groupTitleHtml(group, label, '0 item(ns)')
            + '<div class="codes-sheet-scroll">'
            + '<div class="codes-sheet" role="table" aria-label="' + escapeHtml(label) + '">'
            + '<div class="codes-sheet-head" role="row">'
            + '<span>#</span><span>CODIGO</span><span>EAN</span><span>PRECO</span><span>STATUS</span>'
            + '</div>'
            + '<form method="post" class="codes-row codes-row-new" role="row" data-code-row data-new-row data-code-group="' + escapeHtml(group) + '">'
            + '<input type="hidden" name="csrf_token" value="' + escapeHtml(csrfToken()) + '">'
            + '<input type="hidden" name="action" value="create">'
            + '<input type="hidden" name="id" value="">'
            + '<span class="codes-row-number">+</span>'
            + '<label><span>Codigo</span><input type="text" name="codigo" maxlength="180" placeholder="Novo codigo" required></label>'
            + '<label><span>EAN</span><input type="text" name="ean" maxlength="80" placeholder="' + escapeHtml(placeholderForGroup(group)) + '" required></label>'
            + '<label><span>Preco</span><input type="text" name="preco" inputmode="decimal" data-price-input placeholder="0,00" required></label>'
            + '<div class="codes-row-actions"><span class="codes-save-status is-muted" data-save-status>Novo</span></div>'
            + '</form>'
            + '</div>'
            + '</div>';

        var addButton = board.querySelector('[data-focus-group-adder]');
        board.insertBefore(panel, addButton || null);

        var newRow = panel.querySelector('[data-code-row]');
        if (newRow) {
            initRow(newRow);
        }
        updateCounts();

        return panel;
    }

    function focusNewRow(panel) {
        var input = panel ? panel.querySelector('[data-new-row] [name="codigo"]') : null;
        if (input) {
            input.focus();
        }
    }

    function groupAdderInput() {
        return document.querySelector('[data-new-group-input]');
    }

    function createGroupFromInput(input) {
        if (!input) {
            return;
        }

        var rawValue = input.value.trim();
        var group = normalizeGroupInput(rawValue);

        if (group.length !== 2 || rawValue === '') {
            input.focus();
            input.classList.add('is-error');
            input.title = 'Digite dois numeros para criar o bloco. Exemplo: 50.';
            return;
        }

        input.classList.remove('is-error');
        input.title = '';
        input.disabled = true;

        var data = new FormData();
        data.set('action', 'create_group');
        data.set('csrf_token', csrfToken());
        data.set('group', group);

        postFormData(data).then(function (payload) {
            var groupKey = payload.group && payload.group.key ? payload.group.key : group;
            input.value = '';

            var panel = createPanel(groupKey);
            if (panel) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                focusNewRow(panel);
            }
        }).catch(function (error) {
            input.classList.add('is-error');
            input.title = error.message;
            input.focus();
        }).finally(function () {
            input.disabled = false;
        });
    }

    function moveRowToGroup(row, group) {
        var panel = document.querySelector('[data-code-group-panel="' + group + '"]') || createPanel(group);
        if (!panel) {
            return;
        }

        var sheet = panel.querySelector('.codes-sheet');
        var newRow = sheet ? sheet.querySelector('[data-new-row]') : null;
        if (!sheet) {
            return;
        }

        sheet.insertBefore(row, newRow || null);
    }

    function clearDropMarkers() {
        document.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (row) {
            row.classList.remove('is-drop-before', 'is-drop-after');
        });
    }

    function shouldDropBefore(row, clientY) {
        if (isNewRow(row)) {
            return true;
        }

        var rect = row.getBoundingClientRect();
        return clientY < rect.top + (rect.height / 2);
    }

    function targetRowFromPoint(clientX, clientY) {
        var element = document.elementFromPoint(clientX, clientY);
        return element ? element.closest('[data-code-row]') : null;
    }

    function finishPointerDrag() {
        if (!pointerDrag) {
            return;
        }

        var state = pointerDrag;
        pointerDrag = null;

        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', cancelPointerDrag);

        if (state.row) {
            state.row.classList.remove('is-dragging');
        }
        draggedRow = null;
        clearDropMarkers();
    }

    function cancelPointerDrag() {
        finishPointerDrag();
    }

    function handlePointerMove(event) {
        if (!pointerDrag) {
            return;
        }

        var target = targetRowFromPoint(event.clientX, event.clientY);
        var fromPanel = pointerDrag.panel;
        var toPanel = target ? target.closest('[data-code-group-panel]') : null;

        clearDropMarkers();
        pointerDrag.target = null;

        if (!target || target === pointerDrag.row || !fromPanel || fromPanel !== toPanel) {
            return;
        }

        pointerDrag.target = target;
        pointerDrag.before = shouldDropBefore(target, event.clientY);
        target.classList.add(pointerDrag.before ? 'is-drop-before' : 'is-drop-after');
    }

    function handlePointerUp() {
        if (!pointerDrag) {
            return;
        }

        var state = pointerDrag;
        var target = state.target;
        var panel = state.panel;

        if (target && panel) {
            target.parentElement.insertBefore(state.row, state.before ? target : target.nextSibling);
            renumberPanel(panel);
            persistPanelOrder(panel);
        }

        finishPointerDrag();
    }

    function renumberPanel(panel) {
        var index = 1;

        panel.querySelectorAll('[data-code-row]').forEach(function (row) {
            var number = row.querySelector('.codes-row-number');
            if (!number) {
                return;
            }

            if (isNewRow(row)) {
                number.textContent = '+';
                return;
            }

            number.textContent = String(index);
            index += 1;
        });

        var count = panel.querySelector('[data-code-group-count]');
        if (count) {
            count.textContent = String(index - 1) + ' item(ns)';
        }
    }

    function updateCounts(total) {
        document.querySelectorAll('[data-code-group-panel]').forEach(renumberPanel);

        var totalNode = document.querySelector('[data-total-count]');
        if (totalNode && typeof total !== 'undefined') {
            totalNode.textContent = String(total);
        }
    }

    function cloneBlankRowFrom(row, group) {
        var clone = row.cloneNode(true);
        resetNewRow(clone, group);
        row.after(clone);
        initRow(clone);
    }

    function saveRow(row, options) {
        var opts = options || {};
        var payload = rowPayload(row);

        window.clearTimeout(Number(row.dataset.saveTimer || 0));

        if (!isRowReady(row)) {
            if (isNewRow(row) || opts.force) {
                setStatus(row, 'Preencha', 'muted');
            }
            return;
        }

        if (!opts.force && payload === row.dataset.lastPayload) {
            setStatus(row, 'Salvo', 'saved');
            return;
        }

        var originalGroup = row.getAttribute('data-code-group') || groupFromEan(field(row, 'ean').value);
        var wasNew = isNewRow(row);
        row.classList.add('is-saving');
        row.classList.remove('is-error', 'is-saved');
        setStatus(row, 'Salvando', 'saving');

        request(row, 'save').then(function (payload) {
            if (wasNew) {
                cloneBlankRowFrom(row, originalGroup);
            }

            makeSavedRow(row, payload.item);
            if (payload.item.group !== originalGroup) {
                moveRowToGroup(row, payload.item.group);
            }
            updateCounts(payload.total);
        }).catch(function (error) {
            row.classList.remove('is-saving', 'is-saved');
            row.classList.add('is-error');
            setStatus(row, 'Erro', 'error');
            row.title = error.message;
        });
    }

    function persistPanelOrder(panel) {
        var ids = [];
        panel.querySelectorAll('[data-code-row]:not([data-new-row])').forEach(function (row) {
            var id = field(row, 'id');
            if (id && id.value.trim() !== '') {
                ids.push(id.value.trim());
            }
        });

        if (ids.length < 1) {
            return;
        }

        var data = new FormData();
        data.set('action', 'reorder');
        data.set('csrf_token', csrfToken());
        data.set('group', panel.getAttribute('data-code-group-panel') || '');
        data.set('ids', JSON.stringify(ids));

        panel.classList.add('is-reordering');
        postFormData(data).then(function () {
            panel.classList.remove('is-reordering', 'is-reorder-error');
        }).catch(function () {
            panel.classList.remove('is-reordering');
            panel.classList.add('is-reorder-error');
        });
    }

    function initDrag(row) {
        var handle = row.querySelector('[data-drag-handle]');
        if (!handle || isNewRow(row) || row.dataset.dragReady === '1') {
            return;
        }

        row.dataset.dragReady = '1';
        row.draggable = true;

        handle.addEventListener('pointerdown', function (event) {
            if (event.button !== 0 || isNewRow(row)) {
                return;
            }

            pointerDrag = {
                row: row,
                panel: row.closest('[data-code-group-panel]'),
                target: null,
                before: true
            };
            draggedRow = row;
            row.classList.add('is-dragging');

            document.addEventListener('pointermove', handlePointerMove);
            document.addEventListener('pointerup', handlePointerUp);
            document.addEventListener('pointercancel', cancelPointerDrag);
            event.preventDefault();
        });

        row.addEventListener('dragstart', function (event) {
            if (isNewRow(row) || !event.target.closest('[data-drag-handle]')) {
                event.preventDefault();
                return;
            }

            draggedRow = row;
            row.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', field(row, 'id') ? field(row, 'id').value : '');
            }
        });

        row.addEventListener('dragend', function () {
            row.classList.remove('is-dragging');
            draggedRow = null;
            clearDropMarkers();
        });
    }

    function initDropTarget(row) {
        row.addEventListener('dragover', function (event) {
            if (!draggedRow || draggedRow === row) {
                return;
            }

            var fromPanel = draggedRow.closest('[data-code-group-panel]');
            var toPanel = row.closest('[data-code-group-panel]');
            if (!fromPanel || !toPanel || fromPanel !== toPanel) {
                return;
            }

            event.preventDefault();
            clearDropMarkers();

            var rect = row.getBoundingClientRect();
            var before = event.clientY < rect.top + (rect.height / 2);
            row.classList.add(before ? 'is-drop-before' : 'is-drop-after');
        });

        row.addEventListener('dragleave', function () {
            row.classList.remove('is-drop-before', 'is-drop-after');
        });

        row.addEventListener('drop', function (event) {
            if (!draggedRow || draggedRow === row) {
                return;
            }

            var fromPanel = draggedRow.closest('[data-code-group-panel]');
            var toPanel = row.closest('[data-code-group-panel]');
            if (!fromPanel || !toPanel || fromPanel !== toPanel) {
                return;
            }

            event.preventDefault();

            var sheet = row.parentElement;
            var rect = row.getBoundingClientRect();
            var before = isNewRow(row) || event.clientY < rect.top + (rect.height / 2);
            sheet.insertBefore(draggedRow, before ? row : row.nextSibling);
            clearDropMarkers();
            renumberPanel(toPanel);
            persistPanelOrder(toPanel);
        });
    }

    function scheduleSave(row) {
        row.classList.add('is-dirty');
        setStatus(row, 'Editando', 'muted');
        window.clearTimeout(Number(row.dataset.saveTimer || 0));
        row.dataset.saveTimer = String(window.setTimeout(function () {
            saveRow(row);
        }, SAVE_DELAY_MS));
    }

    function deleteRow(row) {
        var id = field(row, 'id');
        if (!id || id.value.trim() === '') {
            resetNewRow(row, row.getAttribute('data-code-group') || '20');
            return;
        }

        if (!window.confirm('Apagar este codigo da lista?')) {
            return;
        }

        row.classList.add('is-saving');
        setStatus(row, 'Apagando', 'saving');

        request(row, 'delete').then(function (payload) {
            var panel = row.closest('[data-code-group-panel]');
            row.remove();
            if (panel) {
                renumberPanel(panel);
            }
            updateCounts(payload.total);
        }).catch(function (error) {
            row.classList.remove('is-saving');
            row.classList.add('is-error');
            setStatus(row, 'Erro', 'error');
            row.title = error.message;
        });
    }

    function deleteDialog() {
        return document.querySelector('[data-group-delete-dialog]');
    }

    function setDeleteError(message) {
        var dialog = deleteDialog();
        var error = dialog ? dialog.querySelector('[data-group-delete-error]') : null;
        if (!error) {
            return;
        }

        if (!message) {
            error.hidden = true;
            error.textContent = '';
            return;
        }

        error.hidden = false;
        error.textContent = message;
    }

    function closeDeleteDialog() {
        var dialog = deleteDialog();
        if (!dialog) {
            return;
        }

        dialog.hidden = true;
        dialog.dataset.group = '';
        dialog.dataset.groupLabel = '';
        var password = dialog.querySelector('[data-group-delete-password]');
        if (password) {
            password.value = '';
        }
        setDeleteError('');
    }

    function openDeleteDialog(button) {
        var group = button.getAttribute('data-delete-code-group') || '';
        if (!canDeleteGroup(group)) {
            return;
        }

        var dialog = deleteDialog();
        if (!dialog) {
            return;
        }

        var label = button.getAttribute('data-delete-code-group-label') || labelForGroup(group);
        dialog.dataset.group = group;
        dialog.dataset.groupLabel = label;

        var labelNode = dialog.querySelector('[data-group-delete-label]');
        if (labelNode) {
            labelNode.textContent = label;
        }

        var password = dialog.querySelector('[data-group-delete-password]');
        if (password) {
            password.value = '';
        }

        setDeleteError('');
        dialog.hidden = false;
        if (password) {
            password.focus();
        }
    }

    function confirmDeleteGroup() {
        var dialog = deleteDialog();
        if (!dialog || dialog.hidden) {
            return;
        }

        var group = dialog.dataset.group || '';
        var password = dialog.querySelector('[data-group-delete-password]');
        var confirmButton = dialog.querySelector('[data-confirm-group-delete]');
        var panel = document.querySelector('[data-code-group-panel="' + group + '"]');

        if (!canDeleteGroup(group)) {
            setDeleteError('Este bloco nao pode ser apagado.');
            return;
        }

        if (!password || password.value.trim() === '') {
            setDeleteError('Digite a senha para confirmar.');
            if (password) {
                password.focus();
            }
            return;
        }

        var data = new FormData();
        data.set('action', 'delete_group');
        data.set('csrf_token', csrfToken());
        data.set('group', group);
        data.set('password', password.value);

        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Excluindo...';
        }
        setDeleteError('');

        postFormData(data).then(function (payload) {
            if (panel) {
                panel.remove();
            }
            updateCounts(payload.total);
            closeDeleteDialog();
        }).catch(function (error) {
            setDeleteError(error.message || 'Nao consegui excluir a tabela.');
            if (password) {
                password.focus();
                password.select();
            }
        }).finally(function () {
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Excluir tabela';
            }
        });
    }

    function initRow(row) {
        row.dataset.lastPayload = rowPayload(row);
        initDrag(row);
        initDropTarget(row);

        row.querySelectorAll('[data-price-input]').forEach(function (input) {
            input.addEventListener('blur', function () {
                var formatted = normalizePrice(input.value);
                if (formatted !== '' && formatted !== input.value) {
                    input.value = formatted;
                    scheduleSave(row);
                }
            });
        });

        row.addEventListener('input', function () {
            scheduleSave(row);
        });

        row.addEventListener('submit', function (event) {
            event.preventDefault();

            if (event.submitter && event.submitter.matches('[data-confirm-delete]')) {
                deleteRow(row);
                return;
            }

            saveRow(row, { force: true });
        });

        row.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveRow(row, { force: true });
            }
        });
    }

    function initAddGroupButton() {
        document.querySelectorAll('[data-add-code-group]').forEach(function (button) {
            button.addEventListener('click', function () {
                var localInput = button.closest('[data-group-adder]');
                createGroupFromInput(localInput ? localInput.querySelector('[data-new-group-input]') : groupAdderInput());
            });
        });

        document.querySelectorAll('[data-new-group-input]').forEach(function (input) {
            input.addEventListener('input', function () {
                input.value = normalizeGroupInput(input.value);
                input.classList.remove('is-error');
            });

            input.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    createGroupFromInput(input);
                }
            });
        });

        document.querySelectorAll('[data-focus-group-adder]').forEach(function (button) {
            button.addEventListener('click', function () {
                var input = groupAdderInput();
                if (input) {
                    input.focus();
                }
            });
        });
    }

    function initDeleteGroupDialog() {
        document.addEventListener('click', function (event) {
            var deleteButton = event.target.closest('[data-delete-code-group]');
            if (deleteButton) {
                event.preventDefault();
                openDeleteDialog(deleteButton);
                return;
            }

            if (event.target.closest('[data-cancel-group-delete]')) {
                event.preventDefault();
                closeDeleteDialog();
                return;
            }

            if (event.target.closest('[data-confirm-group-delete]')) {
                event.preventDefault();
                confirmDeleteGroup();
            }
        });

        document.addEventListener('keydown', function (event) {
            var dialog = deleteDialog();
            if (!dialog || dialog.hidden) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeDeleteDialog();
            }

            if (event.key === 'Enter' && event.target && typeof event.target.matches === 'function' && event.target.matches('[data-group-delete-password]')) {
                event.preventDefault();
                confirmDeleteGroup();
            }
        });
    }

    function init() {
        document.querySelectorAll('[data-code-row]').forEach(initRow);
        initAddGroupButton();
        initDeleteGroupDialog();
        updateCounts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
        return;
    }

    init();
}());
