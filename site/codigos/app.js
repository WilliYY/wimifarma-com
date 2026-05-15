(function () {
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

    function initPriceInputs() {
        document.querySelectorAll('[data-price-input]').forEach(function (input) {
            input.addEventListener('blur', function () {
                var formatted = normalizePrice(input.value);
                if (formatted !== '') {
                    input.value = formatted;
                }
            });
        });
    }

    function initRows() {
        document.querySelectorAll('[data-code-row]').forEach(function (row) {
            row.addEventListener('input', function () {
                row.classList.add('is-dirty');
            });

            row.addEventListener('keydown', function (event) {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    var save = row.querySelector('button[value="update"], button[value="create"]');
                    if (save) {
                        event.preventDefault();
                        save.click();
                    }
                }
            });
        });
    }

    function initDeleteConfirm() {
        document.querySelectorAll('[data-confirm-delete]').forEach(function (button) {
            button.addEventListener('click', function (event) {
                if (!window.confirm('Apagar este codigo da lista?')) {
                    event.preventDefault();
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initPriceInputs();
            initRows();
            initDeleteConfirm();
        });
        return;
    }

    initPriceInputs();
    initRows();
    initDeleteConfirm();
}());
