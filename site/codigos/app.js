(function () {
    var SAVE_DELAY_MS = 650;
    var apiUrl = '/codigos/api.php';

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

    function request(row, action) {
        return window.fetch(apiUrl, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: buildFormData(row, action)
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

        ensureDeleteButton(row);
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
            moveRowToGroup(row, payload.item.group);
            updateCounts(payload.total);
        }).catch(function (error) {
            row.classList.remove('is-saving', 'is-saved');
            row.classList.add('is-error');
            setStatus(row, 'Erro', 'error');
            row.title = error.message;
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
