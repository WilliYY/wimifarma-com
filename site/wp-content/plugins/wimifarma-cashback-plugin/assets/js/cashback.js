(function ($) {
    'use strict';

    function sanitizeDecimal(value) {
        if (window.wfwcUtils) {
            return window.wfwcUtils.sanitizeDecimal(value);
        }
        var parsed = parseFloat(String(value || '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatCurrency(value) {
        if (window.wfwcUtils) {
            return window.wfwcUtils.formatCurrency(value);
        }
        return value;
    }

    function updateSimulator($scope) {
        if (!$scope.length) {
            return;
        }

        var available = parseFloat($scope.data('available') || 0);
        var multiplier = parseFloat((window.wfwcAdmin && window.wfwcAdmin.redeemMultiplier) || 4);
        var cashbackPercent = parseFloat((window.wfwcAdmin && window.wfwcAdmin.cashbackPercent) || 5);
        var purchaseAmount = sanitizeDecimal($scope.find('[data-wfwc-purchase-amount]').val());
        var desiredCashback = sanitizeDecimal($scope.find('[data-wfwc-desired-cashback]').val());
        var maxByRule = purchaseAmount / Math.max(multiplier, 1);
        var maxAllowed = Math.max(0, Math.min(available, maxByRule));
        var generatedCashback = Math.max(0, purchaseAmount * cashbackPercent / 100);
        var $max = $scope.find('[data-wfwc-max-redeem]');
        var $generated = $scope.find('[data-wfwc-generated-preview]');
        var $message = $scope.find('[data-wfwc-simulator-message]');

        $max.text(formatCurrency(maxAllowed));
        $generated.text(formatCurrency(generatedCashback));
        $message.removeClass('is-invalid');

        if (!desiredCashback) {
            $message.text('Informe um valor de cashback para validar esta compra.');
            return;
        }

        if (desiredCashback > available) {
            $message.addClass('is-invalid').text('O valor desejado é maior que o saldo disponível do cliente.');
            return;
        }

        if ((desiredCashback * multiplier) > purchaseAmount) {
            $message
                .addClass('is-invalid')
                .text('A compra atual não atende à regra mínima de ' + multiplier + 'x para este uso.');
            return;
        }

        $message.text('Uso permitido para esta compra.');
    }

    function bindScope($scope) {
        $scope.on('input', '[data-wfwc-purchase-amount], [data-wfwc-desired-cashback]', function () {
            updateSimulator($scope);
        });

        updateSimulator($scope);
    }

    $(function () {
        $('[data-wfwc-purchase-form], [data-wfwc-simulator]').each(function () {
            bindScope($(this));
        });
    });
}(jQuery));
