<?php
declare(strict_types=1);

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hostName = preg_replace('/:\d+$/', '', $host);
$publicHosts = array('wimifarma.com', 'www.wimifarma.com');
$isPublicHost = in_array($hostName, $publicHosts, true);
$baseUrl = $isPublicHost ? 'https://wimifarma.com' : '';
$assetRoot = '/wp-content/themes/wimifarma-cashback-theme';
$homeLogoUrl = wf_home_asset('assets/img/logo-wimifarma-official.svg') . '?v=20260521-logo';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Served-By: wimifarma-static-home');

function wf_home_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function wf_home_url(string $path): string
{
    global $baseUrl;

    return $baseUrl . '/' . ltrim($path, '/');
}

function wf_home_asset(string $path): string
{
    global $assetRoot;

    return wf_home_url($assetRoot . '/' . ltrim($path, '/'));
}

$modules = array(
    array(
        'name' => 'Cashback',
        'label' => 'Clientes e resgates',
        'description' => 'Cadastro, compras, creditos e relatorios.',
        'href' => '/cashback/',
        'accent' => 'blue',
    ),
    array(
        'name' => 'Cotacao',
        'label' => 'Compras e fornecedores',
        'description' => 'Itens, precos, status e comparacao.',
        'href' => '/cotacao/',
        'accent' => 'green',
    ),
    array(
        'name' => 'Pedidos',
        'label' => 'Fornecedores e boletos',
        'description' => 'Chegadas, vencimentos e pagamentos.',
        'href' => '/pedidos/',
        'accent' => 'wine',
        'order_badge' => true,
    ),
    array(
        'name' => 'Financeiro',
        'label' => 'Fechamento diario',
        'description' => 'Caixa, sangrias, PIX e auditoria.',
        'href' => '/financeiro/',
        'accent' => 'amber',
    ),
    array(
        'name' => 'Gestao',
        'label' => 'Administrativo',
        'description' => 'Contas a pagar, pagos do mes e pendencias.',
        'href' => '/gestao/',
        'accent' => 'wine',
    ),
    array(
        'name' => 'Tarefas',
        'label' => 'Operacao interna',
        'description' => 'Prioridades, historico e conclusoes.',
        'href' => '/tarefa/',
        'accent' => 'rose',
        'task_badge' => true,
    ),
    array(
        'name' => 'Miauby',
        'label' => 'Assistente interno',
        'description' => 'Chat, treino e apoio operacional.',
        'href' => '/miauw/',
        'accent' => 'violet',
    ),
    array(
        'name' => 'Códigos',
        'label' => 'Comissoes especiais',
        'description' => 'Codigo, EAN e preco em lista rapida.',
        'href' => '/codigos/',
        'accent' => 'teal',
    ),
);
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="<?php echo wf_home_e(wf_home_asset('assets/img/favicon.svg')); ?>">
    <link rel="preload" as="image" href="<?php echo wf_home_e($homeLogoUrl); ?>">
    <style>
        * {
            box-sizing: border-box;
        }

        html {
            min-height: 100%;
            background: #f6f8fb;
        }

        body {
            min-height: 100%;
            margin: 0;
            color: #111827;
            background: #f6f8fb;
            font-family: "Segoe UI", Arial, sans-serif;
            overflow-x: hidden;
        }

        a {
            color: inherit;
        }

        .wf-page {
            position: relative;
            min-height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr;
            isolation: isolate;
            overflow-x: hidden;
        }

        .wf-backdrop {
            position: fixed;
            inset: 0;
            z-index: -2;
            overflow: hidden;
            background: #d9ecfb;
        }

        .wf-backdrop video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.78;
            filter: saturate(1.06);
        }

        .wf-backdrop::after {
            content: "";
            position: absolute;
            inset: 0;
            background:
                linear-gradient(180deg, rgba(246, 248, 251, 0.2), rgba(246, 248, 251, 0.9) 68%, rgba(246, 248, 251, 0.96)),
                linear-gradient(90deg, rgba(246, 248, 251, 0.76), rgba(246, 248, 251, 0.18) 48%, rgba(246, 248, 251, 0.76));
        }

        .wf-header {
            position: relative;
            z-index: 3;
            padding: 28px 0 12px;
        }

        .wf-shell {
            width: min(1180px, calc(100% - 40px));
            margin: 0 auto;
        }

        .wf-header-inner {
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }

        .wf-brand {
            display: inline-flex;
            align-items: center;
            width: 236px;
            max-width: 58vw;
            text-decoration: none;
        }

        .wf-brand img {
            display: block;
            width: 100%;
            height: auto;
        }

        .wf-main {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: flex-end;
            padding: 20px 0 clamp(188px, 20vh, 260px);
        }

        .wf-visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        .wf-runners {
            position: fixed;
            inset: 0;
            z-index: 1;
            pointer-events: none;
            overflow: hidden;
        }

        .wf-runner {
            position: absolute;
            left: 0;
            top: 0;
            height: auto;
            pointer-events: none;
            opacity: 0.98;
            filter: drop-shadow(0 16px 24px rgba(15, 23, 42, 0.18));
            transform: translate3d(var(--wf-runner-x, 16vw), var(--wf-runner-y, 58vh), 0) scaleX(var(--wf-runner-dir, 1));
            will-change: transform;
        }

        .wf-runner.is-nyan {
            width: clamp(178px, 21vw, 340px);
        }

        .wf-runner.is-duck {
            width: clamp(112px, 12vw, 190px);
        }

        .wf-runner.is-dragon {
            width: clamp(62px, 7vw, 122px);
        }

        .wf-modules {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 14px;
        }

        .wf-card {
            position: relative;
            min-height: 186px;
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            gap: 10px;
            padding: 18px;
            border: 1px solid #d9e1ec;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(5px);
            text-decoration: none;
            box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05);
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }

        .wf-card:hover,
        .wf-card:focus-visible {
            transform: translateY(-3px);
            border-color: #94a3b8;
            box-shadow: 0 20px 42px rgba(15, 23, 42, 0.09);
            outline: 0;
        }

        .wf-card-mark {
            width: 36px;
            height: 8px;
            border-radius: 999px;
            background: #2563eb;
        }

        .wf-card[data-accent="green"] .wf-card-mark {
            background: #16a34a;
        }

        .wf-card[data-accent="amber"] .wf-card-mark {
            background: #d97706;
        }

        .wf-card[data-accent="rose"] .wf-card-mark {
            background: #e11d48;
        }

        .wf-card[data-accent="violet"] .wf-card-mark {
            background: #7c3aed;
        }

        .wf-card[data-accent="teal"] .wf-card-mark {
            background: #0f766e;
        }

        .wf-card[data-accent="wine"] .wf-card-mark {
            background: #a80f43;
        }

        .wf-card h2 {
            margin: 0;
            color: #0f172a;
            font-size: 1.35rem;
            line-height: 1.15;
            letter-spacing: 0;
        }

        .wf-card span {
            color: #64748b;
            font-size: 0.88rem;
            font-weight: 800;
        }

        .wf-card p {
            margin: 0;
            color: #475569;
            font-size: 0.96rem;
            line-height: 1.42;
        }

        .wf-card b {
            color: #0f172a;
            font-size: 0.9rem;
        }

        .wf-card-badge {
            position: absolute;
            top: 14px;
            right: 14px;
            min-width: 32px;
            height: 28px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 0 9px;
            background: #dc2626;
            color: #ffffff;
            font-size: 0.82rem;
            font-style: normal;
            font-weight: 950;
            line-height: 1;
            box-shadow: 0 10px 22px rgba(220, 38, 38, 0.26);
        }

        .wf-card-badge[hidden] {
            display: none;
        }

        .wf-card-badge.is-calm {
            background: #16a34a;
            box-shadow: 0 10px 22px rgba(22, 163, 74, 0.22);
        }

        @media (max-width: 1040px) {
            .wf-header-inner {
                justify-content: center;
            }

            .wf-modules {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }

        @media (max-width: 640px) {
            .wf-shell {
                width: min(100% - 18px, 1180px);
            }

            .wf-main {
                padding: 16px 0 84px;
            }

            .wf-runner.is-nyan {
                width: clamp(150px, 52vw, 260px);
            }

            .wf-runner.is-duck {
                width: clamp(94px, 30vw, 150px);
            }

            .wf-runner.is-dragon {
                width: clamp(54px, 19vw, 92px);
            }

            .wf-modules {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .wf-card {
                min-height: 148px;
                gap: 7px;
                padding: 13px 12px;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
            }

            .wf-card:hover,
            .wf-card:focus-visible {
                transform: translateY(-2px);
            }

            .wf-card-mark {
                width: 30px;
                height: 7px;
            }

            .wf-card h2 {
                font-size: clamp(1rem, 6vw, 1.18rem);
                line-height: 1.08;
                overflow-wrap: anywhere;
            }

            .wf-card span {
                font-size: 0.72rem;
                line-height: 1.18;
            }

            .wf-card p {
                display: -webkit-box;
                min-height: 2.2em;
                overflow: hidden;
                color: #526174;
                font-size: 0.76rem;
                line-height: 1.18;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }

            .wf-card b {
                font-size: 0.78rem;
            }

            .wf-card-badge {
                top: 10px;
                right: 10px;
                min-width: 26px;
                height: 24px;
                padding: 0 7px;
                font-size: 0.72rem;
            }
        }

        @media (max-width: 360px) {
            .wf-modules {
                gap: 8px;
            }

            .wf-card {
                min-height: 132px;
                padding: 11px 10px;
            }

            .wf-card p {
                display: none;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
    <link rel="stylesheet" href="<?php echo wf_home_e(wf_home_url('/miauw/widget.css')); ?>">
</head>
<body>
<div class="wf-page">
    <div class="wf-backdrop" aria-hidden="true">
        <video autoplay muted loop playsinline preload="metadata">
            <source src="<?php echo wf_home_e(wf_home_asset('assets/video/looping.mp4')); ?>" type="video/mp4">
        </video>
    </div>

    <div class="wf-runners" aria-hidden="true">
        <img class="wf-runner is-nyan" data-wf-runner="nyan" src="<?php echo wf_home_e(wf_home_asset('assets/img/nyan.gif')); ?>" alt="">
        <img class="wf-runner is-duck" data-wf-runner="duck" src="<?php echo wf_home_e(wf_home_asset('assets/img/pato.gif')); ?>" alt="">
        <img class="wf-runner is-dragon" data-wf-runner="dragon" src="<?php echo wf_home_e(wf_home_asset('assets/img/toothless.gif')); ?>" alt="">
    </div>

    <header class="wf-header">
        <div class="wf-shell wf-header-inner">
            <a class="wf-brand" href="<?php echo wf_home_e(wf_home_url('/')); ?>" aria-label="Wimifarma">
                <img src="<?php echo wf_home_e($homeLogoUrl); ?>" alt="Wimifarma" width="236" height="72">
            </a>
        </div>
    </header>

    <main class="wf-main">
        <div class="wf-shell">
            <h1 class="wf-visually-hidden">Wimifarma</h1>

            <section class="wf-modules" aria-label="Sistemas Wimifarma">
                <?php foreach ($modules as $module): ?>
                    <a class="wf-card" href="<?php echo wf_home_e(wf_home_url($module['href'])); ?>" data-accent="<?php echo wf_home_e($module['accent']); ?>">
                        <i class="wf-card-mark" aria-hidden="true"></i>
                        <?php if (!empty($module['task_badge'])): ?>
                            <em class="wf-card-badge" data-wf-task-badge hidden aria-label="Tarefas abertas"></em>
                        <?php endif; ?>
                        <?php if (!empty($module['order_badge'])): ?>
                            <em class="wf-card-badge is-calm" data-wf-order-badge hidden aria-label="Pedidos para chegar hoje"></em>
                        <?php endif; ?>
                        <h2><?php echo wf_home_e($module['name']); ?></h2>
                        <span><?php echo wf_home_e($module['label']); ?></span>
                        <p><?php echo wf_home_e($module['description']); ?></p>
                        <b>Entrar</b>
                    </a>
                <?php endforeach; ?>
            </section>
        </div>
    </main>
</div>
<script>
    (function () {
        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function initHomeRunners() {
            var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-wf-runner]'));

            if (reducedMotion || nodes.length === 0) {
                return;
            }

            var pointer = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                active: false
            };

            var startingPoints = {
                nyan: { x: 0.12, y: 0.26, vx: 0.58, vy: -0.28 },
                duck: { x: 0.62, y: 0.34, vx: -0.66, vy: 0.34 },
                dragon: { x: 0.74, y: 0.58, vx: 0.58, vy: -0.28 }
            };

            var states = nodes.map(function (node, index) {
                var kind = node.getAttribute('data-wf-runner') || 'runner';
                var start = startingPoints[kind] || {
                    x: 0.16 + (index * 0.18),
                    y: 0.58 - (index * 0.2),
                    vx: index % 2 === 0 ? 0.58 : -0.66,
                    vy: index % 2 === 0 ? -0.28 : 0.34
                };

                return {
                    node: node,
                    x: clamp(window.innerWidth * start.x, 18, Math.max(18, window.innerWidth - 160)),
                    y: clamp(window.innerHeight * start.y, 72, Math.max(72, window.innerHeight - 160)),
                    vx: start.vx,
                    vy: start.vy,
                    phase: Math.random() * Math.PI * 2
                };
            });

            window.addEventListener('pointermove', function (event) {
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                pointer.active = true;
            }, { passive: true });

            window.addEventListener('pointerleave', function () {
                pointer.active = false;
            }, { passive: true });

            window.addEventListener('blur', function () {
                pointer.active = false;
            });

            var lastTick = performance.now();

            function tick(now) {
                var dt = Math.min(32, now - lastTick) / 16.67;
                lastTick = now;

                states.forEach(function (state, index) {
                    var rect = state.node.getBoundingClientRect();
                    var width = rect.width || 140;
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
                        state.vx += Math.cos((now / 900) + state.phase) * 0.014 * dt;
                        state.vy += Math.sin((now / 1100) + state.phase + index) * 0.014 * dt;
                    }

                    state.vx = clamp(state.vx * 0.992, -2.25, 2.25);
                    state.vy = clamp(state.vy * 0.992, -1.9, 1.9);
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

                    state.node.style.setProperty('--wf-runner-x', state.x.toFixed(1) + 'px');
                    state.node.style.setProperty('--wf-runner-y', state.y.toFixed(1) + 'px');
                    state.node.style.setProperty('--wf-runner-dir', state.vx < 0 ? '-1' : '1');
                });

                window.requestAnimationFrame(tick);
            }

            window.requestAnimationFrame(tick);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initHomeRunners);
        } else {
            initHomeRunners();
        }
    }());
</script>
<script>
    (function () {
        function initTaskBadge() {
            var badge = document.querySelector('[data-wf-task-badge]');

            if (!badge || !window.fetch) {
                return;
            }

            fetch('<?php echo wf_home_e(wf_home_url('/tarefa/badge.php')); ?>', {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('badge unavailable');
                }

                return response.json();
            }).then(function (payload) {
                var open = Number(payload && payload.open ? payload.open : 0);

                if (!Number.isFinite(open) || open <= 0) {
                    badge.hidden = true;
                    return;
                }

                badge.textContent = open > 99 ? '99+' : String(open);
                badge.setAttribute('aria-label', open === 1 ? '1 tarefa aberta' : String(open) + ' tarefas abertas');
                badge.hidden = false;
            }).catch(function () {
                badge.hidden = true;
            });
        }

        function initOrderBadge() {
            var badge = document.querySelector('[data-wf-order-badge]');

            if (!badge || !window.fetch) {
                return;
            }

            fetch('<?php echo wf_home_e(wf_home_url('/pedidos/api/badge')); ?>', {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('order badge unavailable');
                }

                return response.json();
            }).then(function (payload) {
                var count = Number(payload && payload.arriving_today ? payload.arriving_today : 0);
                if (!Number.isFinite(count) || count < 0) {
                    count = 0;
                }

                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.toggle('is-calm', count === 0);
                badge.setAttribute('aria-label', count === 1 ? '1 pedido para chegar hoje' : String(count) + ' pedidos para chegar hoje');
                badge.hidden = false;
            }).catch(function () {
                badge.hidden = true;
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initTaskBadge();
                initOrderBadge();
            });
        } else {
            initTaskBadge();
            initOrderBadge();
        }
    }());
</script>
<script src="<?php echo wf_home_e(wf_home_url('/miauw/widget.js?v=20260517j')); ?>" defer></script>
</body>
</html>
