(function () {
    var runner = document.querySelector('[data-login-runner]');

    if (!runner || !window.requestAnimationFrame) {
        return;
    }

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
        return;
    }

    var state = {
        x: window.innerWidth * 0.14,
        y: window.innerHeight * 0.62,
        vx: 0.7,
        vy: -0.36
    };

    var pointer = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        active: false
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    window.addEventListener('pointermove', function (event) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.active = true;
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
        pointer.active = false;
    }, { passive: true });

    var lastTick = performance.now();

    function tick(now) {
        var dt = Math.min(32, now - lastTick) / 16.67;
        var rect = runner.getBoundingClientRect();
        var width = rect.width || 140;
        var height = rect.height || 120;
        var centerX = state.x + width / 2;
        var centerY = state.y + height / 2;
        var dx = centerX - pointer.x;
        var dy = centerY - pointer.y;
        var distance = Math.max(1, Math.hypot(dx, dy));

        lastTick = now;

        if (pointer.active && distance < 230) {
            var flee = (230 - distance) / 230;
            state.vx += (dx / distance) * flee * 0.72;
            state.vy += (dy / distance) * flee * 0.72;
        } else {
            state.vx += Math.cos(now / 920) * 0.014 * dt;
            state.vy += Math.sin(now / 1080) * 0.014 * dt;
        }

        state.vx = clamp(state.vx * 0.992, -2.3, 2.3);
        state.vy = clamp(state.vy * 0.992, -1.8, 1.8);
        state.x += state.vx * dt;
        state.y += state.vy * dt;

        var maxX = Math.max(12, window.innerWidth - width - 12);
        var maxY = Math.max(64, window.innerHeight - height - 12);

        if (state.x < 12 || state.x > maxX) {
            state.vx *= -0.86;
            state.x = clamp(state.x, 12, maxX);
        }

        if (state.y < 64 || state.y > maxY) {
            state.vy *= -0.86;
            state.y = clamp(state.y, 64, maxY);
        }

        runner.style.setProperty('--login-runner-x', state.x.toFixed(1) + 'px');
        runner.style.setProperty('--login-runner-y', state.y.toFixed(1) + 'px');
        runner.style.setProperty('--login-runner-dir', state.vx < 0 ? '-1' : '1');

        window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
}());
