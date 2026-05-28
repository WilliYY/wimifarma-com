(function () {
    'use strict';

    function initTaskMotion() {
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) {
            return;
        }

        Array.prototype.forEach.call(document.querySelectorAll('[data-task-row]'), function (row, index) {
            row.style.setProperty('--task-delay', Math.min(index * 22, 180) + 'ms');
        });
    }

    function setRowEditingState(row, editing) {
        row.classList.toggle('is-editing-task', editing);

        Array.prototype.forEach.call(row.querySelectorAll('[data-task-status-form] button[type="submit"]'), function (button) {
            button.disabled = editing;

            if (editing) {
                button.setAttribute('aria-disabled', 'true');
            } else {
                button.removeAttribute('aria-disabled');
            }
        });
    }

    function initEditGuards() {
        Array.prototype.forEach.call(document.querySelectorAll('.task-edit'), function (details) {
            var row = details.closest('[data-task-row]');

            if (!row) {
                return;
            }

            var sync = function () {
                setRowEditingState(row, details.open);
            };

            details.addEventListener('toggle', sync);
            sync();
        });

        document.addEventListener('submit', function (event) {
            var form = event.target;

            if (!form || !form.matches || !form.matches('[data-task-status-form]')) {
                return;
            }

            var row = form.closest('[data-task-row]');

            if (row && row.classList.contains('is-editing-task')) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    function initSubmitStates() {
        Array.prototype.forEach.call(document.querySelectorAll('form'), function (form) {
            form.addEventListener('submit', function (event) {
                if (form.dataset.taskSubmitting === '1') {
                    return;
                }

                event.preventDefault();
                form.dataset.taskSubmitting = '1';

                var actionInput = form.querySelector('input[name="action"]');
                var action = actionInput ? actionInput.value : '';
                var row = form.closest('[data-task-row]');
                var button = form.querySelector('button[type="submit"]');

                if (button) {
                    button.disabled = true;
                    button.classList.add('is-saving');
                }

                form.classList.add('is-submitting');

                if (row) {
                    if (action === 'complete') {
                        row.classList.add('is-completing');
                    } else if (action === 'cancel') {
                        row.classList.add('is-canceling');
                    } else if (action === 'reopen') {
                        row.classList.add('is-reopening');
                    } else if (action === 'update') {
                        row.classList.add('is-updating');
                    } else {
                        row.classList.add('is-working');
                    }
                }

                window.setTimeout(function () {
                    form.submit();
                }, 150);
            });
        });
    }

    function initHistoryClosed() {
        var history = document.querySelector('.task-history');

        if (!history) {
            return;
        }

        history.open = false;

        if (window.localStorage) {
            localStorage.removeItem('wimifarma.task.history.open');
        }
    }

    function init() {
        initTaskMotion();
        initEditGuards();
        initSubmitStates();
        initHistoryClosed();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
