(function () {
    'use strict';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function initLoginRunners() {
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-login-runner]'));

        if (reducedMotion || nodes.length === 0) {
            return;
        }

        var pointer = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            active: false
        };

        var states = nodes.map(function (node, index) {
            return {
                node: node,
                x: clamp(window.innerWidth * (0.14 + (index * 0.18)), 18, Math.max(18, window.innerWidth - 160)),
                y: clamp(window.innerHeight * 0.62, 72, Math.max(72, window.innerHeight - 160)),
                vx: 0.62,
                vy: -0.22,
                phase: Math.random() * Math.PI * 2
            };
        });

        window.addEventListener('pointermove', function (event) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.active = true;
        }, { passive: true });

        var lastTick = performance.now();

        function tick(now) {
            var dt = Math.min(32, now - lastTick) / 16.67;
            lastTick = now;

            states.forEach(function (state, index) {
                var rect = state.node.getBoundingClientRect();
                var width = rect.width || 120;
                var height = rect.height || 120;
                var centerX = state.x + (width / 2);
                var centerY = state.y + (height / 2);
                var dx = centerX - pointer.x;
                var dy = centerY - pointer.y;
                var distance = Math.max(1, Math.hypot(dx, dy));

                if (pointer.active && distance < 220) {
                    var flee = (220 - distance) / 220;
                    state.vx += (dx / distance) * flee * 0.76;
                    state.vy += (dy / distance) * flee * 0.76;
                } else {
                    state.vx += Math.cos((now / 980) + state.phase) * 0.014 * dt;
                    state.vy += Math.sin((now / 1180) + state.phase + index) * 0.014 * dt;
                }

                state.vx = clamp(state.vx * 0.992, -2.1, 2.1);
                state.vy = clamp(state.vy * 0.992, -1.8, 1.8);
                state.x += state.vx * dt;
                state.y += state.vy * dt;

                var maxX = Math.max(12, window.innerWidth - width - 12);
                var maxY = Math.max(68, window.innerHeight - height - 12);

                if (state.x < 12 || state.x > maxX) {
                    state.vx *= -0.86;
                    state.x = clamp(state.x, 12, maxX);
                }

                if (state.y < 68 || state.y > maxY) {
                    state.vy *= -0.86;
                    state.y = clamp(state.y, 68, maxY);
                }

                state.node.style.setProperty('--login-runner-x', state.x.toFixed(1) + 'px');
                state.node.style.setProperty('--login-runner-y', state.y.toFixed(1) + 'px');
                state.node.style.setProperty('--login-runner-dir', state.vx < 0 ? '-1' : '1');
            });

            window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoginRunners);
    } else {
        initLoginRunners();
    }
}());
