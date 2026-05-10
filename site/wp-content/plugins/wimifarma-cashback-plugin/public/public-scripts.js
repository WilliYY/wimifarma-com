(function () {
    document.addEventListener('DOMContentLoaded', function () {
        var fields = document.querySelectorAll('.wfwc-public-form input[type="text"]');

        fields.forEach(function (field) {
            field.addEventListener('blur', function () {
                field.value = field.value.trim();
            });
        });
    });
}());
