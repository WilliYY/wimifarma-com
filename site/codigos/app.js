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

        if (prefix === '20' || prefix === '40') {
            return prefix;
        }

        return 'outros';
    }

    function placeholderForGroup(group) {
        if (group === '20' || group === '40') {
            return group + ' 000';
        }

        return 'EAN';
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

    function moveRowToGroup(row, group) {
        var panel = document.querySelector('[data-code-group-panel="' + group + '"]');
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

    function init() {
        document.querySelectorAll('[data-code-row]').forEach(initRow);
        updateCounts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
        return;
    }

    init();
}());
