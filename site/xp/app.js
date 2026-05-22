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
        var summary = document.querySelector('[data-xp-player-summary]');

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

            if (card && card.offsetParent !== null) {
                card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function setSummaryText(selector, value) {
            if (!summary) {
                return;
            }

            var node = summary.querySelector(selector);
            if (node) {
                node.textContent = value || '';
            }
        }

        function showPlayerSummary(button) {
            if (!summary || !button) {
                return;
            }

            var progress = button.getAttribute('data-xp-player-progress') || '0';
            var required = button.getAttribute('data-xp-player-required') || '30.000';
            var percentValue = Number(button.getAttribute('data-xp-player-percent-value') || '0');
            var fill = Math.max(0, Math.min(100, percentValue));

            setSummaryText('[data-xp-summary-role]', button.getAttribute('data-xp-player-role') || 'Atendente XP');
            setSummaryText('[data-xp-summary-name]', button.getAttribute('data-xp-player-name') || 'Jogador');
            setSummaryText('[data-xp-summary-level]', button.getAttribute('data-xp-player-level') || 'Nivel 1 -> 2');
            setSummaryText('[data-xp-summary-progress]', progress + '/' + required + ' XP');
            setSummaryText('[data-xp-summary-month]', button.getAttribute('data-xp-player-month') || '0');
            setSummaryText('[data-xp-summary-total]', button.getAttribute('data-xp-player-total') || '0');
            setSummaryText('[data-xp-summary-percent]', button.getAttribute('data-xp-player-percent') || '0%');

            var bar = summary.querySelector('[data-xp-summary-bar]');
            if (bar) {
                bar.style.setProperty('--xp-fill-percent', String(fill) + '%');
            }

            summary.hidden = false;
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
                showPlayerSummary(button);
            });
        });

        document.querySelectorAll('[data-xp-player-summary-close]').forEach(function (button) {
            button.addEventListener('click', function () {
                if (summary) {
                    summary.hidden = true;
                }
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

        if (!document.body.classList.contains('is-settings-view') || window.location.hash) {
            return;
        }

        var resetToTop = function () {
            window.scrollTo(0, 0);
        };

        resetToTop();
        window.setTimeout(resetToTop, 60);
        window.setTimeout(resetToTop, 240);
        window.addEventListener('pageshow', resetToTop);
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
