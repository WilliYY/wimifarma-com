(function () {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function initRunner() {
        var runner = document.querySelector('[data-login-runner]');
        if (!runner || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
            return;
        }

        var state = {
            x: window.innerWidth * 0.12,
            y: window.innerHeight * 0.58,
            vx: 0.72,
            vy: -0.2,
            phase: Math.random() * Math.PI * 2
        };

        var last = performance.now();

        function tick(now) {
            var dt = Math.min(32, now - last) / 16.67;
            last = now;

            state.vx += Math.cos((now / 900) + state.phase) * 0.014 * dt;
            state.vy += Math.sin((now / 1100) + state.phase) * 0.014 * dt;
            state.vx = clamp(state.vx * 0.992, -2, 2);
            state.vy = clamp(state.vy * 0.992, -1.4, 1.4);
            state.x += state.vx * dt;
            state.y += state.vy * dt;

            var rect = runner.getBoundingClientRect();
            var maxX = Math.max(12, window.innerWidth - rect.width - 12);
            var maxY = Math.max(12, window.innerHeight - rect.height - 12);

            if (state.x < 12 || state.x > maxX) {
                state.vx *= -0.9;
                state.x = clamp(state.x, 12, maxX);
            }

            if (state.y < 12 || state.y > maxY) {
                state.vy *= -0.9;
                state.y = clamp(state.y, 12, maxY);
            }

            runner.style.setProperty('--runner-x', state.x.toFixed(1) + 'px');
            runner.style.setProperty('--runner-y', state.y.toFixed(1) + 'px');
            runner.style.setProperty('--runner-dir', state.vx < 0 ? '-1' : '1');

            window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRunner);
    } else {
        initRunner();
    }
}());
