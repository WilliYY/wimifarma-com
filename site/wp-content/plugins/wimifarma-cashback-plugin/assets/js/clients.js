(function ($) {
    'use strict';

    $(document).on('blur', 'input[name="phone"]', function () {
        $(this).val($(this).val().replace(/[^\d]/g, ''));
    });
}(jQuery));
