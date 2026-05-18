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

        function bindInput(input) {
            input.addEventListener('input', refreshTotal);
            input.addEventListener('blur', function () {
                var value = parseMoney(input.value);
                if (value > 0) {
                    input.value = value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
                refreshTotal();
            });
        }

        moneyInputs().forEach(bindInput);

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
                bindInput(row.querySelector('[data-money-input]'));
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initTotals();
            initConfirmations();
        });
    } else {
        initTotals();
        initConfirmations();
    }
}());
