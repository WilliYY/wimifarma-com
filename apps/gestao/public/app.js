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
        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var button = card.querySelector('[data-account-toggle]');
            var id = card.getAttribute('data-account-id') || '';
            var key = 'gestao:account-collapsed:' + id;

            if (!button || !id || button.dataset.gestaoCollapseBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                card.classList.toggle('is-collapsed', collapsed);
                button.textContent = collapsed ? 'Abrir' : 'Minimizar';
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoCollapseBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) === '1');
            } catch (error) {
                setCollapsed(false);
            }

            button.addEventListener('click', function () {
                setCollapsed(!card.classList.contains('is-collapsed'));
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindMoneyInputs(document);
            initTotals();
            initMoneyValidation();
            initConfirmations();
            initAccountCollapse();
            initItemOptions();
        });
    } else {
        bindMoneyInputs(document);
        initTotals();
        initMoneyValidation();
        initConfirmations();
        initAccountCollapse();
        initItemOptions();
    }
}());
