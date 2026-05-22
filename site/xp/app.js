(function () {
    function confirmDanger() {
        var buttons = document.querySelectorAll('[data-xp-confirm]');
        buttons.forEach(function (button) {
            button.addEventListener('click', function (event) {
                var message = button.getAttribute('data-xp-confirm') || 'Confirmar acao?';
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    function initPhotoPreview() {
        var inputs = document.querySelectorAll('[data-xp-photo-input]');
        inputs.forEach(function (input) {
            input.addEventListener('change', function () {
                var form = input.closest('form');
                var preview = form ? form.querySelector('[data-xp-photo-preview]') : null;
                var file = input.files && input.files[0] ? input.files[0] : null;

                if (!preview || !file || !file.type.match(/^image\/(jpeg|png|webp)$/)) {
                    if (preview) {
                        preview.hidden = true;
                        preview.innerHTML = '';
                    }
                    return;
                }

                var reader = new FileReader();
                reader.onload = function () {
                    preview.innerHTML = '<img alt="" src="' + String(reader.result).replace(/"/g, '&quot;') + '">';
                    preview.hidden = false;
                };
                reader.readAsDataURL(file);
            });
        });
    }

    function initTrackFocus() {
        var track = document.querySelector('[data-xp-track]');
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-xp-employee-card]'));

        function clearFocus() {
            document.querySelectorAll('.xp-level.is-highlighted').forEach(function (node) {
                node.classList.remove('is-highlighted');
            });
            cards.forEach(function (card) {
                card.classList.remove('is-focused');
            });
        }

        function focusEmployee(employeeId) {
            var card = document.querySelector('[data-xp-employee-card="' + employeeId + '"]');
            var player = document.querySelector('[data-xp-focus-employee="' + employeeId + '"]');
            var levelNode = player ? player.closest('[data-xp-level]') : null;

            if (!card && !levelNode) {
                return;
            }

            if (card && !levelNode) {
                var level = card.getAttribute('data-xp-employee-level');
                levelNode = document.querySelector('[data-xp-level="' + level + '"]');
            }

            clearFocus();

            if (card) {
                card.classList.add('is-focused');
            }

            if (levelNode) {
                levelNode.classList.add('is-highlighted');
                if (track) {
                    var left = levelNode.offsetLeft - Math.max(16, (track.clientWidth - levelNode.clientWidth) / 2);
                    track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
                }
            }

            if (card) {
                card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        cards.forEach(function (card) {
            card.addEventListener('click', function (event) {
                if (event.target.closest('form') || event.target.closest('details') || event.target.closest('button')) {
                    return;
                }
                focusEmployee(card.getAttribute('data-xp-employee-card'));
            });
        });

        document.querySelectorAll('[data-xp-focus-employee]').forEach(function (button) {
            button.addEventListener('click', function () {
                focusEmployee(button.getAttribute('data-xp-focus-employee'));
            });
        });

        if (cards.length > 0) {
            window.setTimeout(function () {
                focusEmployee(cards[0].getAttribute('data-xp-employee-card'));
            }, 220);
        }

        document.querySelectorAll('[data-xp-track-step]').forEach(function (button) {
            button.addEventListener('click', function () {
                if (!track) {
                    return;
                }

                var direction = Number(button.getAttribute('data-xp-track-step') || '1');
                var distance = Math.max(260, track.clientWidth * 0.72);
                track.scrollBy({ left: distance * direction, behavior: 'smooth' });
            });
        });
    }

    function initTabPosition() {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        if (document.body.classList.contains('is-settings-view') && !window.location.hash) {
            window.setTimeout(function () {
                window.scrollTo(0, 0);
            }, 0);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initTabPosition();
            confirmDanger();
            initPhotoPreview();
            initTrackFocus();
        });
    } else {
        initTabPosition();
        confirmDanger();
        initPhotoPreview();
        initTrackFocus();
    }
}());
