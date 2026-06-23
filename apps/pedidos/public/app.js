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

    function bindArrivalDaysInputs(root) {
        Array.prototype.slice.call((root || document).querySelectorAll('[data-arrival-days]')).forEach(function (input) {
            if (input.dataset.pedidosArrivalBound === '1') {
                return;
            }

            input.dataset.pedidosArrivalBound = '1';
            input.addEventListener('input', function () {
                var onlyNumbers = String(input.value || '').replace(/\D/g, '').slice(0, 3);
                if (input.value !== onlyNumbers) {
                    input.value = onlyNumbers;
                }
            });
            input.addEventListener('blur', function () {
                if (input.value !== '') {
                    input.value = String(Number.parseInt(input.value, 10));
                }
            });
        });
    }

    function bindDateInputs(root) {
        Array.prototype.slice.call((root || document).querySelectorAll('input[type="date"], input[type="month"]')).forEach(function (input) {
            if (input.dataset.pedidosDateBound === '1') {
                return;
            }

            input.dataset.pedidosDateBound = '1';
            input.addEventListener('click', function () {
                if (typeof input.showPicker === 'function') {
                    try {
                        input.showPicker();
                    } catch (error) {
                        // Some browsers only allow showPicker during direct user gestures.
                    }
                }
            });
        });
    }

    function formatDueDate(dateValue) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
        return match ? match[3] + '/' + match[2] + '/' + match[1] : '';
    }

    function calculateDueDate(days) {
        var baseMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(document.body.getAttribute('data-pedidos-today') || '');
        var now = new Date();
        var year = baseMatch ? Number(baseMatch[1]) : now.getFullYear();
        var month = baseMatch ? Number(baseMatch[2]) - 1 : now.getMonth();
        var day = baseMatch ? Number(baseMatch[3]) : now.getDate();
        var due = new Date(year, month, day + days, 12, 0, 0, 0);
        if (Number.isNaN(due.getTime()) || due.getFullYear() > 9999) {
            return '';
        }
        return [
            String(due.getFullYear()).padStart(4, '0'),
            String(due.getMonth() + 1).padStart(2, '0'),
            String(due.getDate()).padStart(2, '0')
        ].join('-');
    }

    function bindDueDaysInputs(root) {
        Array.prototype.slice.call((root || document).querySelectorAll('[data-due-days-group]')).forEach(function (group) {
            var daysInput = group.querySelector('[data-due-days]');
            var dateInput = group.querySelector('[data-due-date]');
            var preview = group.querySelector('[data-due-preview]');
            var invalidMessage = 'Informe um numero inteiro maior que zero.';

            if (!daysInput || !dateInput || !preview || group.dataset.pedidosDueBound === '1') {
                return;
            }
            group.dataset.pedidosDueBound = '1';

            function setPreview(message, state) {
                preview.textContent = message;
                preview.setAttribute('data-state', state);
            }

            function showCurrentDate() {
                var formatted = formatDueDate(dateInput.value);
                if (formatted) {
                    setPreview('Data definida: ' + formatted, 'manual');
                } else {
                    setPreview('Digite os dias para calcular a data.', 'hint');
                }
            }

            function updateFromDays() {
                var text = String(daysInput.value || '').trim();
                daysInput.setCustomValidity('');
                if (!text) {
                    showCurrentDate();
                    return;
                }

                if (!/^\d+$/.test(text)) {
                    daysInput.setCustomValidity(invalidMessage);
                    setPreview(invalidMessage, 'error');
                    return;
                }

                var days = Number(text);
                if (!Number.isSafeInteger(days) || days <= 0) {
                    daysInput.setCustomValidity(invalidMessage);
                    setPreview(invalidMessage, 'error');
                    return;
                }

                var calculated = calculateDueDate(days);
                if (!calculated) {
                    daysInput.setCustomValidity('O numero de dias gera uma data invalida.');
                    setPreview('O numero de dias gera uma data invalida.', 'error');
                    return;
                }

                dateInput.value = calculated;
                setPreview('Vencimento calculado: ' + formatDueDate(calculated), 'calculated');
            }

            daysInput.addEventListener('input', updateFromDays);
            dateInput.addEventListener('input', function () {
                daysInput.value = '';
                daysInput.setCustomValidity('');
                showCurrentDate();
            });
            updateFromDays();
        });
    }

    function bindOrderStatusInputs(form) {
        var registerInput = form.querySelector('[data-order-status-register]');
        var partialInputs = Array.prototype.slice.call(form.querySelectorAll('[data-order-status-partial]'));

        if (!registerInput || registerInput.dataset.pedidosStatusBound === '1') {
            return;
        }

        registerInput.dataset.pedidosStatusBound = '1';
        registerInput.addEventListener('change', function () {
            if (registerInput.checked) {
                partialInputs.forEach(function (input) {
                    input.checked = false;
                });
            }
        });

        partialInputs.forEach(function (input) {
            input.addEventListener('change', function () {
                if (input.checked) {
                    registerInput.checked = false;
                }
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

    function initOrderTotals() {
        var form = document.querySelector('[data-gestao-order-form]');
        var totalNode = document.querySelector('[data-order-total]');
        var addButton = document.querySelector('[data-add-order-item]');
        var list = document.querySelector('[data-order-items]');

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
        bindArrivalDaysInputs(form);
        bindOrderStatusInputs(form);
        document.addEventListener('gestao:money-change', refreshTotal);

        if (addButton) {
            addButton.addEventListener('click', function () {
                var count = Array.prototype.slice.call(list.querySelectorAll('[data-order-parcel]')).length + 1;
                var row = document.createElement('div');
                row.className = 'gestao-order-parcel';
                row.setAttribute('data-order-parcel', '');
                row.innerHTML = [
                    '<div class="gestao-order-parcel-head">',
                    '<strong>Parcela ',
                    String(count),
                    '</strong>',
                    '<small>Valor e vencimento</small>',
                    '<button type="button" class="gestao-icon-btn gestao-icon-btn-danger gestao-order-parcel-remove" title="Remover parcela" aria-label="Remover parcela" data-remove-order-item>&times;</button>',
                    '</div>',
                    '<label>',
                    '<span>Valor da parcela</span>',
                    '<input type="text" name="pedido_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>',
                    '</label>',
                    '<div class="gestao-due-entry" data-due-days-group>',
                    '<label>',
                    '<span>Vencimento em quantos dias?</span>',
                    '<input type="text" name="pedido_vencimento_dias[]" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Ex.: 30" data-due-days>',
                    '</label>',
                    '<p class="gestao-due-preview" data-due-preview data-state="hint" aria-live="polite">Digite os dias para calcular a data.</p>',
                    '<label class="gestao-due-manual">',
                    '<span>Ou escolha a data manualmente</span>',
                    '<input type="date" name="pedido_vencimento[]" data-due-date>',
                    '</label>',
                    '</div>'
                ].join('');
                list.appendChild(row);
                bindMoneyInputs(row);
                bindDateInputs(row);
                bindDueDaysInputs(row);
                row.querySelector('[data-remove-order-item]').addEventListener('click', function () {
                    row.remove();
                    refreshTotal();
                });
                row.querySelector('input').focus();
                refreshTotal();
            });
        }

        form.addEventListener('submit', function (event) {
            var total = moneyInputs().reduce(function (sum, input) {
                return sum + Math.max(0, parseMoney(input.value));
            }, 0);
            var arrivalInput = form.querySelector('[data-arrival-days]');

            if (total <= 0) {
                event.preventDefault();
                window.alert('Informe pelo menos um valor maior que zero.');
                var firstInput = moneyInputs()[0];
                if (firstInput) firstInput.focus();
                return;
            }

            if (arrivalInput && arrivalInput.value && !/^\d+$/.test(arrivalInput.value)) {
                event.preventDefault();
                window.alert('Na previsao de chegada, informe somente numeros de dias.');
                arrivalInput.focus();
            }
        });

        refreshTotal();
    }

    function initMoneyValidation() {
        Array.prototype.slice.call(document.querySelectorAll('form[data-require-money]')).forEach(function (form) {
            if (form.dataset.pedidosMoneyValidationBound === '1') {
                return;
            }
            form.dataset.pedidosMoneyValidationBound = '1';
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
            if (form.dataset.pedidosConfirmBound === '1') {
                return;
            }
            form.dataset.pedidosConfirmBound = '1';
            form.addEventListener('submit', function (event) {
                var message = form.getAttribute('data-confirm') || 'Confirmar acao?';

                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    function refreshDynamicBindings() {
        bindMoneyInputs(document);
        bindDateInputs(document);
        bindDueDaysInputs(document);
        initMoneyValidation();
        initConfirmations();
        initOrderEditPanels();
        initOrderCardCollapse();
        initHistoryReveal();
    }

    function initPedidosSearch() {
        var root = document.querySelector('[data-pedidos-search]');
        if (!root || root.dataset.pedidosSearchBound === '1') {
            return;
        }

        var input = root.querySelector('[data-pedidos-search-input]');
        var clearButton = root.querySelector('[data-pedidos-search-clear]');
        var status = root.querySelector('[data-pedidos-search-status]');
        var monthInput = document.querySelector('.gestao-month-filter input[name="mes"]');
        var waitingSlot = document.querySelector('[data-pedidos-results="waiting"]');
        var confirmedSlot = document.querySelector('[data-pedidos-results="confirmed"]');
        var historySlot = document.querySelector('[data-pedidos-results="history"]');
        var historyControls = document.querySelector('[data-pedidos-history-controls]');
        var waitingCount = document.querySelector('[data-pedidos-count="waiting"]');
        var confirmedCount = document.querySelector('[data-pedidos-count="confirmed"]');
        var historyCount = document.querySelector('[data-pedidos-count="history"]');

        if (!input || !waitingSlot || !confirmedSlot || !historySlot) {
            return;
        }

        var initial = {
            waiting: waitingSlot.innerHTML,
            confirmed: confirmedSlot.innerHTML,
            history: historySlot.innerHTML,
            historyControls: historyControls ? historyControls.innerHTML : '',
            historyInitial: historySlot.getAttribute('data-history-initial') || '6',
            waitingCount: waitingCount ? waitingCount.textContent : '',
            confirmedCount: confirmedCount ? confirmedCount.textContent : '',
            historyCount: historyCount ? historyCount.textContent : '',
            status: status ? status.textContent : ''
        };
        var timer = 0;
        var controller = null;

        function setSearching(isSearching) {
            root.classList.toggle('is-searching', isSearching);
        }

        function setStatus(text) {
            if (status) {
                status.textContent = text;
            }
        }

        function setCounts(counts) {
            if (waitingCount) waitingCount.textContent = String(counts.waiting || 0);
            if (confirmedCount) confirmedCount.textContent = String(counts.confirmed || 0);
            if (historyCount) historyCount.textContent = String(counts.history || 0);
        }

        function restore() {
            if (controller) {
                controller.abort();
                controller = null;
            }
            waitingSlot.innerHTML = initial.waiting;
            confirmedSlot.innerHTML = initial.confirmed;
            historySlot.innerHTML = initial.history;
            historySlot.setAttribute('data-history-initial', initial.historyInitial);
            delete historySlot.dataset.pedidosHistoryRevealBound;
            if (historyControls) historyControls.innerHTML = initial.historyControls;
            if (waitingCount) waitingCount.textContent = initial.waitingCount;
            if (confirmedCount) confirmedCount.textContent = initial.confirmedCount;
            if (historyCount) historyCount.textContent = initial.historyCount;
            if (clearButton) clearButton.hidden = true;
            setStatus(initial.status);
            setSearching(false);
            refreshDynamicBindings();
        }

        function applyResults(payload, query) {
            waitingSlot.innerHTML = payload.html && payload.html.waiting ? payload.html.waiting : '';
            confirmedSlot.innerHTML = payload.html && payload.html.confirmed ? payload.html.confirmed : '';
            historySlot.innerHTML = payload.html && payload.html.history ? payload.html.history : '';
            historySlot.setAttribute('data-history-initial', String(payload.historyInitial || 1));
            delete historySlot.dataset.pedidosHistoryRevealBound;
            if (historyControls) {
                historyControls.innerHTML = payload.html && payload.html.historyControls ? payload.html.historyControls : '';
            }
            setCounts(payload.counts || {});
            if (clearButton) clearButton.hidden = false;
            setStatus((payload.total || 0) + ' resultado(s) para "' + query + '".');
            setSearching(false);
            refreshDynamicBindings();
        }

        function runSearch() {
            var query = String(input.value || '').trim();
            window.clearTimeout(timer);

            if (!query) {
                restore();
                return;
            }

            timer = window.setTimeout(function () {
                if (controller) {
                    controller.abort();
                }

                controller = new AbortController();
                setSearching(true);
                setStatus('Buscando...');

                var url = new URL('/pedidos/api/search', window.location.origin);
                var month = monthInput ? monthInput.value : '';
                if (month) url.searchParams.set('mes', month);
                url.searchParams.set('busca', query);

                window.fetch(url.toString(), {
                    credentials: 'same-origin',
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json'
                    }
                })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error('search_failed');
                        }
                        return response.json();
                    })
                    .then(function (payload) {
                        if (String(input.value || '').trim() !== query) {
                            return;
                        }
                        applyResults(payload, query);
                    })
                    .catch(function (error) {
                        if (error && error.name === 'AbortError') {
                            return;
                        }
                        setSearching(false);
                        setStatus('Nao consegui buscar agora. A tela normal continua preservada.');
                    });
            }, 180);
        }

        root.dataset.pedidosSearchBound = '1';
        input.addEventListener('input', runSearch);
        if (clearButton) {
            clearButton.addEventListener('click', function () {
                input.value = '';
                input.focus();
                restore();
            });
        }
    }

    function initAccountCollapse() {
        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var trigger = card.querySelector('[data-account-toggle]');
            var id = card.getAttribute('data-account-id') || '';
            var key = 'gestao:account-collapsed:v2:' + id;

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

            trigger.addEventListener('click', function () {
                setCollapsed(!card.classList.contains('is-collapsed'));
            });
            trigger.addEventListener('keydown', function (event) {
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
                    if (trigger) trigger.setAttribute('aria-expanded', 'true');
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

    function initOrderEditPanels() {
        Array.prototype.slice.call(document.querySelectorAll('[data-order-edit-toggle]')).forEach(function (button) {
            var panelId = button.getAttribute('aria-controls') || '';
            var panel = panelId ? document.getElementById(panelId) : null;
            var card = panel ? panel.closest('[data-order-card-collapse]') : null;

            if (!panel || button.dataset.gestaoOrderEditBound === '1') {
                return;
            }

            function expandCard() {
                var collapseToggle = card ? card.querySelector('[data-order-collapse-toggle]') : null;
                var cardId = card ? card.getAttribute('data-order-card-id') || '' : '';
                var cardKind = card ? card.getAttribute('data-order-card-kind') || 'pedido' : 'pedido';
                var key = 'pedidos:order-card-collapsed:v3:' + cardKind + ':' + cardId;

                if (!card || !card.classList.contains('is-order-collapsed')) {
                    return;
                }

                card.classList.remove('is-order-collapsed');
                if (collapseToggle) {
                    collapseToggle.setAttribute('aria-expanded', 'true');
                    collapseToggle.setAttribute('aria-label', 'Recolher detalhes do pedido');
                    collapseToggle.setAttribute('title', 'Recolher detalhes do pedido');
                }
                try {
                    window.localStorage.setItem(key, '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            function setOpen(open) {
                if (open) {
                    expandCard();
                }
                panel.classList.toggle('is-open', open);
                button.classList.toggle('is-active', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');

                if (open) {
                    var input = panel.querySelector('input[name="fornecedor"], input[name="item_descricao"]');
                    if (input) input.focus();
                }
            }

            button.dataset.gestaoOrderEditBound = '1';
            button.addEventListener('click', function () {
                setOpen(!panel.classList.contains('is-open'));
            });
        });
    }

    function initOrderCardCollapse() {
        Array.prototype.slice.call(document.querySelectorAll('[data-order-card-collapse]')).forEach(function (card) {
            var toggle = card.querySelector('[data-order-collapse-toggle]');
            var id = card.getAttribute('data-order-card-id') || '';
            var kind = card.getAttribute('data-order-card-kind') || 'pedido';
            var key = 'pedidos:order-card-collapsed:v3:' + kind + ':' + id;

            if (!toggle || !id || toggle.dataset.pedidosCollapseBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                var label = collapsed ? 'Abrir detalhes do pedido' : 'Recolher detalhes do pedido';

                card.classList.toggle('is-order-collapsed', collapsed);
                toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                toggle.setAttribute('aria-label', label);
                toggle.setAttribute('title', label);
                if (collapsed) {
                    var editPanel = card.querySelector('[data-order-edit-panel]');
                    var editButton = card.querySelector('[data-order-edit-toggle]');
                    if (editPanel) editPanel.classList.remove('is-open');
                    if (editButton) {
                        editButton.classList.remove('is-active');
                        editButton.setAttribute('aria-expanded', 'false');
                    }
                }
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            toggle.dataset.pedidosCollapseBound = '1';
            try {
                var stored = window.localStorage.getItem(key);
                setCollapsed(stored === null ? true : stored === '1');
            } catch (error) {
                setCollapsed(true);
            }

            toggle.addEventListener('click', function () {
                setCollapsed(!card.classList.contains('is-order-collapsed'));
            });
            toggle.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                setCollapsed(!card.classList.contains('is-order-collapsed'));
            });
        });
    }

    function initHistoryReveal() {
        Array.prototype.slice.call(document.querySelectorAll('[data-history-reveal-panel]')).forEach(function (panel) {
            var list = panel.querySelector('[data-history-reveal-list]');
            var button = panel.querySelector('[data-history-reveal-more]');
            var status = panel.querySelector('[data-history-reveal-status]');

            if (!list || list.dataset.pedidosHistoryRevealBound === '1') {
                return;
            }

            var items = Array.prototype.slice.call(list.querySelectorAll('[data-history-reveal-item]'));
            var initial = Number.parseInt(list.getAttribute('data-history-initial') || '6', 10);
            var step = Number.parseInt(list.getAttribute('data-history-step') || '6', 10);
            var visible = Math.max(1, Number.isFinite(initial) ? initial : 6);
            step = Math.max(1, Number.isFinite(step) ? step : 6);
            visible = Math.min(visible, Math.max(items.length, 1));

            function update(animateFrom) {
                var visibleCount = Math.min(visible, items.length);
                var remaining = Math.max(0, items.length - visibleCount);

                items.forEach(function (item, index) {
                    var shouldShow = index < visibleCount;
                    var wasHidden = item.hidden;
                    item.hidden = !shouldShow;

                    if (shouldShow && wasHidden && index >= animateFrom) {
                        item.classList.add('is-history-revealed');
                        window.setTimeout(function () {
                            item.classList.remove('is-history-revealed');
                        }, 220);
                    }
                });

                if (status) {
                    status.textContent = visibleCount + ' de ' + items.length + ' visiveis';
                }

                if (button) {
                    button.hidden = remaining <= 0;
                    if (remaining > 0) {
                        button.textContent = 'Mostrar mais (' + Math.min(step, remaining) + ')';
                    }
                }
            }

            list.dataset.pedidosHistoryRevealBound = '1';
            update(Number.POSITIVE_INFINITY);

            if (!button) {
                return;
            }

            button.addEventListener('click', function () {
                var previousVisible = visible;
                visible = Math.min(items.length, visible + step);
                update(previousVisible);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindMoneyInputs(document);
            bindArrivalDaysInputs(document);
            bindDateInputs(document);
            bindDueDaysInputs(document);
            initTotals();
            initOrderTotals();
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
            initOrderEditPanels();
            initOrderCardCollapse();
            initHistoryReveal();
            initPedidosSearch();
        });
    } else {
        bindMoneyInputs(document);
        bindArrivalDaysInputs(document);
        bindDateInputs(document);
        bindDueDaysInputs(document);
        initTotals();
        initOrderTotals();
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
        initOrderEditPanels();
        initOrderCardCollapse();
        initHistoryReveal();
        initPedidosSearch();
    }
}());
