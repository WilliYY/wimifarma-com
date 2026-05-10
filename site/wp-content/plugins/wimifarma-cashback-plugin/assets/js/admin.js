(function ($) {
    'use strict';

    function sanitizeDecimal(value) {
        var normalized = String(value || '')
            .replace(/[^\d,.-]/g, '')
            .replace(/\.(?=.*\.)/g, '')
            .replace(',', '.');

        var parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(Number(value || 0));
    }

    function focusQuickSearch() {
        var field = document.querySelector('[data-wfwc-quick-search]');

        if (!field) {
            return;
        }

        field.focus();
        field.select();
    }

    window.wfwcUtils = {
        sanitizeDecimal: sanitizeDecimal,
        formatCurrency: formatCurrency
    };

    $(document).on('blur', 'input[type="text"][data-wfwc-money]', function () {
        var value = sanitizeDecimal($(this).val());
        $(this).val(value.toFixed(2).replace('.', ','));
    });

    document.addEventListener('keydown', function (event) {
        var tagName = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
        var isTypingField = /input|textarea|select/.test(tagName) || event.target.isContentEditable;

        if (event.key === '/' && !isTypingField) {
            event.preventDefault();
            focusQuickSearch();
        }
    });
}(jQuery));
