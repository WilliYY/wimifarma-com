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

    function initTrackDrag(track) {
        if (!track || !window.PointerEvent) {
            return;
        }

        var isPointerDown = false;
        var isDragging = false;
        var startX = 0;
        var startScrollLeft = 0;
        var activePointerId = null;
        var lastDragAt = 0;
        var dragThreshold = 6;

        function isInteractiveTarget(target) {
            return !!(target && target.closest && target.closest('a, button, input, select, textarea, label, details, summary'));
        }

        function finishDrag() {
            if (isDragging) {
                lastDragAt = Date.now();
            }

            isPointerDown = false;
            isDragging = false;
            activePointerId = null;
            track.classList.remove('is-drag-ready');
            track.classList.remove('is-dragging');
        }

        track.addEventListener('pointerdown', function (event) {
            if (event.button !== 0 || isInteractiveTarget(event.target)) {
                return;
            }

            isPointerDown = true;
            isDragging = false;
            startX = event.clientX;
            startScrollLeft = track.scrollLeft;
            activePointerId = event.pointerId;
            track.classList.add('is-drag-ready');

            if (track.setPointerCapture) {
                track.setPointerCapture(event.pointerId);
            }
        });

        track.addEventListener('pointermove', function (event) {
            if (!isPointerDown || event.pointerId !== activePointerId) {
                return;
            }

            var deltaX = event.clientX - startX;
            if (!isDragging && Math.abs(deltaX) < dragThreshold) {
                return;
            }

            isDragging = true;
            track.classList.add('is-dragging');
            track.scrollLeft = startScrollLeft - deltaX;
            event.preventDefault();
        });

        track.addEventListener('pointerup', finishDrag);
        track.addEventListener('pointercancel', finishDrag);
        track.addEventListener('lostpointercapture', finishDrag);

        track.addEventListener('click', function (event) {
            if (Date.now() - lastDragAt < 140) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    function initTrackPaths(track) {
        if (!track || !window.requestAnimationFrame) {
            return;
        }

        var scheduled = false;

        function pathAnchor(level) {
            var art = level.querySelector('.xp-level-art');
            var label = level.querySelector('.xp-level-node strong');
            var artRect = art ? art.getBoundingClientRect() : level.getBoundingClientRect();
            var labelRect = label ? label.getBoundingClientRect() : artRect;
            var isTop = level.offsetTop < ((level.parentElement ? level.parentElement.clientHeight : 0) / 2);

            return {
                x: artRect.left + (artRect.width / 2),
                y: isTop
                    ? labelRect.bottom + 4
                    : artRect.top + Math.max(6, artRect.height * 0.12)
            };
        }

        function updateTrackPaths() {
            scheduled = false;

            Array.prototype.forEach.call(track.querySelectorAll('.xp-path'), function (path) {
                var level = path.closest('[data-xp-level]');
                var previousLevel = level ? level.previousElementSibling : null;

                if (!level || !previousLevel) {
                    return;
                }

                var levelRect = level.getBoundingClientRect();
                var start = pathAnchor(previousLevel);
                var end = pathAnchor(level);
                var deltaX = end.x - start.x;
                var deltaY = end.y - start.y;
                var width = Math.max(1, Math.sqrt((deltaX * deltaX) + (deltaY * deltaY)));
                var angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

                path.style.setProperty('--xp-path-left', Math.round(start.x - levelRect.left) + 'px');
                path.style.setProperty('--xp-path-top', Math.round(start.y - levelRect.top) + 'px');
                path.style.setProperty('--xp-path-width', Math.round(width) + 'px');
                path.style.setProperty('--xp-path-angle', angle.toFixed(2) + 'deg');
                path.classList.add('is-positioned');
            });
        }

        function scheduleTrackPaths() {
            if (scheduled) {
                return;
            }

            scheduled = true;
            window.requestAnimationFrame(updateTrackPaths);
        }

        scheduleTrackPaths();
        window.setTimeout(scheduleTrackPaths, 120);
        window.setTimeout(scheduleTrackPaths, 420);
        window.addEventListener('resize', scheduleTrackPaths);

        if (window.ResizeObserver) {
            var observer = new ResizeObserver(scheduleTrackPaths);
            observer.observe(track);
        }

        Array.prototype.forEach.call(track.querySelectorAll('img'), function (image) {
            if (!image.complete) {
                image.addEventListener('load', scheduleTrackPaths, { once: true });
            }
        });
    }

    function initTrackFocus() {
        var track = document.querySelector('[data-xp-track]');
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-xp-employee-card]'));
        var summary = document.querySelector('[data-xp-player-summary]');

        initTrackDrag(track);
        initTrackPaths(track);

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
