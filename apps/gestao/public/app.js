(function () {
    function parseMoney(value) {
        var text = String(value || '').replace(/R\$/g, '').replace(/\s+/g, '').trim();

        if (!text) {
            return 0;
        }

        if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
            text = text.replace(/\./g, '').replace(',', '.');
        } else if (text.indexOf(',') !== -1) {
            text = text.replace(',', '.');
        }

        var parsed = Number.parseFloat(text);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(value) {
        return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function emitMoneyChange() {
        document.dispatchEvent(new CustomEvent('gestao:money-change'));
    }

    function bindMoneyInputs(root) {
        Array.prototype.slice.call((root || document).querySelectorAll('[data-money-input]')).forEach(function (input) {
            if (input.dataset.gestaoMoneyBound === '1') {
                return;
            }

            input.dataset.gestaoMoneyBound = '1';
            input.addEventListener('input', emitMoneyChange);
            input.addEventListener('blur', function () {
                var value = parseMoney(input.value);
                if (value > 0) {
                    input.value = value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
                emitMoneyChange();
            });
        });
    }

    function initTotals() {
        var form = document.querySelector('[data-gestao-form]');
        var totalNode = document.querySelector('[data-gestao-total]');
        var addButton = document.querySelector('[data-add-item]');
        var list = document.querySelector('[data-line-items]');

        if (!form || !totalNode || !list) {
            return;
        }

        function moneyInputs() {
            return Array.prototype.slice.call(form.querySelectorAll('[data-money-input]'));
        }

        function refreshTotal() {
            var total = moneyInputs().reduce(function (sum, input) {
                return sum + Math.max(0, parseMoney(input.value));
            }, 0);

            totalNode.textContent = 'Total ' + formatMoney(total);
        }

        bindMoneyInputs(form);
        document.addEventListener('gestao:money-change', refreshTotal);

        if (addButton) {
            addButton.addEventListener('click', function () {
                var row = document.createElement('div');
                row.className = 'gestao-line-item';
                row.innerHTML = [
                    '<label>',
                    '<span>Descricao do item</span>',
                    '<input type="text" name="item_descricao[]" maxlength="180" placeholder="Outro item">',
                    '</label>',
                    '<label>',
                    '<span>Valor</span>',
                    '<input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>',
                    '</label>'
                ].join('');
                list.appendChild(row);
                bindMoneyInputs(row);
                row.querySelector('input').focus();
                refreshTotal();
            });
        }

        form.addEventListener('submit', function (event) {
            var total = moneyInputs().reduce(function (sum, input) {
                return sum + Math.max(0, parseMoney(input.value));
            }, 0);

            if (total <= 0) {
                event.preventDefault();
                window.alert('Informe pelo menos um valor maior que zero.');
            }
        });

        refreshTotal();
    }

    function initMoneyValidation() {
        Array.prototype.slice.call(document.querySelectorAll('form[data-require-money]')).forEach(function (form) {
            form.addEventListener('submit', function (event) {
                var input = form.querySelector('[data-money-input]');

                if (input && parseMoney(input.value) <= 0) {
                    event.preventDefault();
                    window.alert('Informe um valor maior que zero.');
                    input.focus();
                }
            });
        });
    }

    function initConfirmations() {
        Array.prototype.slice.call(document.querySelectorAll('form[data-confirm]')).forEach(function (form) {
            form.addEventListener('submit', function (event) {
                var message = form.getAttribute('data-confirm') || 'Confirmar acao?';

                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    function initAccountCollapse() {
        function isInteractiveAccountTarget(target) {
            return target && target.closest && Boolean(target.closest('button, input, select, textarea, a, label, form'));
        }

        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var trigger = card.querySelector('[data-account-toggle]');
            var id = card.getAttribute('data-account-id') || '';
            var key = 'gestao:account-collapsed:v3:' + id;

            if (!trigger || !id || trigger.dataset.gestaoCollapseBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                card.classList.toggle('is-collapsed', collapsed);
                trigger.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            trigger.dataset.gestaoCollapseBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            trigger.addEventListener('click', function (event) {
                if (isInteractiveAccountTarget(event.target)) {
                    return;
                }

                setCollapsed(!card.classList.contains('is-collapsed'));
            });
            trigger.addEventListener('keydown', function (event) {
                if (event.target !== trigger) {
                    return;
                }

                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                setCollapsed(!card.classList.contains('is-collapsed'));
            });
        });
    }

    function initPaymentCollapse() {
        Array.prototype.slice.call(document.querySelectorAll('[data-payment-block]')).forEach(function (block) {
            var button = block.querySelector('[data-payment-toggle]');
            var id = block.getAttribute('data-payment-block-id') || '';
            var key = 'gestao:payments-collapsed:v2:' + id;

            if (!button || !id || button.dataset.gestaoPaymentBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                block.classList.toggle('is-collapsed', collapsed);
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoPaymentBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            button.addEventListener('click', function () {
                setCollapsed(!block.classList.contains('is-collapsed'));
            });
        });
    }

    function initBlockCollapse(selector, buttonSelector, keyPrefix) {
        Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(function (block) {
            var button = block.querySelector(buttonSelector);
            var id = block.getAttribute('data-history-block-id') ||
                block.getAttribute('data-note-block-id') ||
                block.getAttribute('data-due-block-id') ||
                block.getAttribute('data-adjust-block-id') ||
                '';
            var key = keyPrefix + ':' + id;

            if (!button || !id || button.dataset.gestaoBlockBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                block.classList.toggle('is-collapsed', collapsed);
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoBlockBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            button.addEventListener('click', function () {
                setCollapsed(!block.classList.contains('is-collapsed'));
            });
        });
    }

    function initItemOptions() {
        Array.prototype.slice.call(document.querySelectorAll('[data-item-row]')).forEach(function (row) {
            var button = row.querySelector('[data-item-toggle]');
            var itemId = row.getAttribute('data-item-id') || '';
            var key = 'gestao:item-open:' + itemId;

            if (!button || !itemId || button.dataset.gestaoItemBound === '1') {
                return;
            }

            function setOpen(open) {
                row.classList.toggle('is-open', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
                try {
                    window.localStorage.setItem(key, open ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoItemBound = '1';
            try {
                setOpen(window.localStorage.getItem(key) === '1');
            } catch (error) {
                setOpen(false);
            }

            button.addEventListener('click', function () {
                setOpen(!row.classList.contains('is-open'));
            });
        });
    }

    function initTitleEditors() {
        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var button = card.querySelector('[data-title-edit-toggle]');
            var panel = card.querySelector('[data-title-edit-panel]');

            if (!button || !panel || button.dataset.gestaoTitleBound === '1') {
                return;
            }

            function setOpen(open) {
                panel.classList.toggle('is-open', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open && card.classList.contains('is-collapsed')) {
                    card.classList.remove('is-collapsed');
                    var trigger = card.querySelector('[data-account-toggle]');
                    if (trigger) {
                        trigger.setAttribute('aria-expanded', 'true');
                    }
                }
            }

            button.dataset.gestaoTitleBound = '1';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(!panel.classList.contains('is-open'));
                if (panel.classList.contains('is-open')) {
                    var input = panel.querySelector('input[name="titulo"]');
                    if (input) input.focus();
                }
            });
        });
    }

    function initMonthlyDrag() {
        var list = document.querySelector('[data-monthly-sort-list]');
        if (!list || list.dataset.gestaoMonthlyDragBound === '1') {
            return;
        }

        var dragging = null;
        list.dataset.gestaoMonthlyDragBound = '1';

        function items() {
            return Array.prototype.slice.call(list.querySelectorAll('[data-monthly-item]'));
        }

        function csrfToken() {
            var meta = document.querySelector('meta[name="csrf-token"]');
            return meta ? meta.getAttribute('content') || '' : '';
        }

        function basePath() {
            return document.body.getAttribute('data-gestao-base-path') || '/gestao';
        }

        function closestItem(target) {
            return target && target.closest ? target.closest('[data-monthly-item]') : null;
        }

        function afterElement(y) {
            var candidates = items().filter(function (item) {
                return item !== dragging;
            });
            return candidates.reduce(function (closest, item) {
                var box = item.getBoundingClientRect();
                var offset = y - box.top - (box.height / 2);
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: item };
                }
                return closest;
            }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
        }

        function setSaving(saving) {
            list.classList.toggle('is-saving', saving);
        }

        function saveOrder() {
            var ids = items().map(function (item) {
                return item.getAttribute('data-monthly-account-id') || '';
            }).filter(Boolean);
            if (!ids.length) {
                return Promise.resolve();
            }
            setSaving(true);
            return window.fetch(basePath() + '/api/monthly-order', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken()
                },
                body: JSON.stringify({
                    competencia_mes: list.getAttribute('data-month') || '',
                    ids: ids
                })
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('Nao consegui salvar a ordem mensal.');
                }
                return response.json();
            }).then(function (payload) {
                if (!payload || payload.ok !== true) {
                    throw new Error(payload && payload.error ? payload.error : 'Nao consegui salvar a ordem mensal.');
                }
            }).catch(function (error) {
                window.alert(error.message || 'Nao consegui salvar a ordem mensal.');
            }).finally(function () {
                setSaving(false);
            });
        }

        list.addEventListener('dragstart', function (event) {
            var item = closestItem(event.target);
            if (!item) {
                return;
            }
            dragging = item;
            item.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.getAttribute('data-monthly-account-id') || '');
            }
        });

        list.addEventListener('dragover', function (event) {
            if (!dragging) {
                return;
            }
            event.preventDefault();
            var before = afterElement(event.clientY);
            if (before) {
                list.insertBefore(dragging, before);
            } else {
                list.appendChild(dragging);
            }
        });

        list.addEventListener('dragend', function () {
            if (!dragging) {
                return;
            }
            dragging.classList.remove('is-dragging');
            dragging = null;
            saveOrder();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindMoneyInputs(document);
            initTotals();
            initMoneyValidation();
            initConfirmations();
            initAccountCollapse();
            initPaymentCollapse();
            initBlockCollapse('[data-history-block]', '[data-history-toggle]', 'gestao:history-collapsed:v1');
            initBlockCollapse('[data-note-block]', '[data-note-toggle]', 'gestao:note-collapsed:v2');
            initBlockCollapse('[data-due-block]', '[data-due-toggle]', 'gestao:due-collapsed:v1');
            initBlockCollapse('[data-adjust-block]', '[data-adjust-toggle]', 'gestao:adjust-collapsed:v1');
            initItemOptions();
            initTitleEditors();
            initMonthlyDrag();
        });
    } else {
        bindMoneyInputs(document);
        initTotals();
        initMoneyValidation();
        initConfirmations();
        initAccountCollapse();
        initPaymentCollapse();
        initBlockCollapse('[data-history-block]', '[data-history-toggle]', 'gestao:history-collapsed:v1');
        initBlockCollapse('[data-note-block]', '[data-note-toggle]', 'gestao:note-collapsed:v2');
        initBlockCollapse('[data-due-block]', '[data-due-toggle]', 'gestao:due-collapsed:v1');
        initBlockCollapse('[data-adjust-block]', '[data-adjust-toggle]', 'gestao:adjust-collapsed:v1');
        initItemOptions();
        initTitleEditors();
        initMonthlyDrag();
    }
}());
