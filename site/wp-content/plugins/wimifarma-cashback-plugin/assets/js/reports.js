(function ($) {
    'use strict';

    $(function () {
        $('input[type="date"]').each(function () {
            if (!$(this).val()) {
                $(this).val(new Date().toISOString().slice(0, 10));
            }
        });
    });
}(jQuery));
