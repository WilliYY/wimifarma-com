<?php
declare(strict_types=1);

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hostName = preg_replace('/:\d+$/', '', $host);
$publicHosts = array('wimifarma.com', 'www.wimifarma.com');
$isPublicHost = in_array($hostName, $publicHosts, true);
$baseUrl = $isPublicHost ? 'https://wimifarma.com' : '';
$assetRoot = '/wp-content/themes/wimifarma-cashback-theme';
$homeLogoUrl = wf_home_asset('assets/img/logo-wimifarma-home-animated.gif') . '?v=20260524-visible-transparent-logo';

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
        'name' => 'Tarefas',
        'label' => 'Operacao interna',
        'description' => 'Prioridades, historico e conclusoes.',
        'href' => '/tarefa/',
        'accent' => 'rose',
        'task_badge' => true,
    ),
    array(
        'name' => 'Códigos',
        'label' => 'Comissoes especiais',
        'description' => 'Codigo, EAN e preco em lista rapida.',
        'href' => '/codigos/',
        'accent' => 'teal',
    ),
    array(
        'name' => 'XP',
        'label' => 'Jogo dos atendentes',
        'description' => 'Niveis, fotos, XP e ranking mensal.',
        'href' => '/xp/',
        'accent' => 'gold',
        'xp_frame' => true,
    ),
    array(
        'name' => 'Gestao',
        'label' => 'Administrativo',
        'description' => 'Contas a pagar, pagos do mes e pendencias.',
        'href' => '/gestao/',
        'accent' => 'wine',
    ),
    array(
        'name' => 'Miauby',
        'label' => 'Assistente interno',
        'description' => 'Chat, treino e apoio operacional.',
        'href' => '/miauw/',
        'accent' => 'violet',
    ),
    array(
        'name' => 'Miauby Whatsapp',
        'label' => 'Canal e fila',
        'description' => 'Webhook, Evolution, eventos e outbox.',
        'href' => '/miauw/whatsapp/',
        'accent' => 'teal',
        'home_class' => 'is-whatsapp-card',
    ),
    array(
        'name' => 'Usuários',
        'label' => 'Acessos e auditoria',
        'description' => 'Logins, permissoes, XP e historico.',
        'href' => '/usuarios/',
        'accent' => 'blue',
        'home_class' => 'is-users-card',
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
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: clamp(320px, 32vw, 520px);
            max-width: 86vw;
            text-decoration: none;
            line-height: 0;
        }

        .wf-brand img {
            display: block;
            width: 100%;
            height: auto;
            aspect-ratio: 1560 / 622;
            filter: drop-shadow(0 10px 18px rgba(15, 23, 42, 0.22));
        }

        .wf-user-xp {
            display: flex;
            justify-content: flex-end;
            margin: 0 0 14px;
        }

        .wf-user-xp[hidden] {
            display: none;
        }

        .wf-user-xp-card {
            width: min(430px, 100%);
            min-height: 104px;
            display: grid;
            grid-template-columns: 74px minmax(0, 1fr);
            gap: 13px;
            align-items: center;
            padding: 12px 14px;
            border: 1px solid rgba(255, 211, 84, 0.76);
            border-radius: 8px;
            background:
                linear-gradient(135deg, rgba(44, 24, 92, 0.92), rgba(17, 24, 39, 0.88)),
                rgba(17, 24, 39, 0.88);
            color: #ffffff;
            text-decoration: none;
            box-shadow: 0 18px 34px rgba(15, 23, 42, 0.18);
            backdrop-filter: blur(6px);
        }

        .wf-user-xp-avatar {
            width: 64px;
            height: 64px;
            display: grid;
            place-items: center;
            border: 2px solid #facc15;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.12);
            color: #fef3c7;
            font-size: 0.85rem;
            font-weight: 950;
            overflow: hidden;
            box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.16);
        }

        .wf-user-xp-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .wf-user-xp-main {
            min-width: 0;
        }

        .wf-user-xp-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-width: 0;
        }

        .wf-user-xp-top strong {
            min-width: 0;
            overflow: hidden;
            color: #ffffff;
            font-size: 1.04rem;
            font-weight: 950;
            line-height: 1.1;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wf-user-xp-rank {
            flex: 0 0 auto;
            border-radius: 999px;
            padding: 5px 9px;
            background: #facc15;
            color: #431407;
            font-size: 0.76rem;
            font-weight: 950;
            line-height: 1;
        }

        .wf-user-xp-level {
            display: block;
            margin-top: 3px;
            color: #dbeafe;
            font-size: 0.8rem;
            font-weight: 850;
            line-height: 1.25;
        }

        .wf-user-xp-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
            margin-top: 8px;
            color: #fff7ed;
            font-size: 0.78rem;
            font-weight: 850;
        }

        .wf-user-xp-stats span {
            white-space: nowrap;
        }

        .wf-user-xp-bar {
            height: 10px;
            margin-top: 10px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.18);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
        }

        .wf-user-xp-fill {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #f59e0b, #fde047);
            box-shadow: 0 0 12px rgba(250, 204, 21, 0.45);
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

        .wf-card[data-accent="gold"] .wf-card-mark {
            background: #f59e0b;
        }

        .wf-card.is-xp-card {
            border: 14px solid transparent;
            border-image: url("/xp/assets/moldura-card-home.svg?v=20260522d") 104 / 26px / 5px stretch;
            background:
                linear-gradient(rgba(255, 253, 237, 0.95), rgba(255, 253, 237, 0.95)) padding-box,
                linear-gradient(135deg, rgba(255, 246, 199, 0.94), rgba(255, 253, 237, 0.98)) border-box;
            padding: 16px 18px 18px;
            box-shadow: 0 18px 38px rgba(120, 78, 6, 0.12);
        }

        .wf-card.is-xp-card::before,
        .wf-card.is-xp-card::after {
            content: "";
            position: absolute;
            z-index: 1;
            pointer-events: none;
        }

        .wf-card.is-xp-card::before {
            inset: 14px;
            border-radius: 7px;
            background: rgba(255, 253, 238, 0.58);
        }

        .wf-card.is-xp-card::after {
            display: none;
        }

        .wf-card.is-xp-card > * {
            position: relative;
            z-index: 2;
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

            .wf-user-xp {
                justify-content: center;
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

            .wf-user-xp-card {
                grid-template-columns: 58px minmax(0, 1fr);
                gap: 10px;
                min-height: 92px;
                padding: 10px 11px;
            }

            .wf-user-xp-avatar {
                width: 52px;
                height: 52px;
                border-radius: 15px;
            }

            .wf-user-xp-top strong {
                font-size: 0.94rem;
            }

            .wf-user-xp-stats {
                gap: 4px 10px;
                font-size: 0.72rem;
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

            .wf-card.is-xp-card {
                border-width: 11px;
                border-image-width: 20px;
                border-image-outset: 0;
                padding: 12px 12px 13px;
            }

            .wf-card.is-xp-card::before {
                inset: 11px;
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
                <img src="<?php echo wf_home_e($homeLogoUrl); ?>" alt="Wimifarma" width="1560" height="622">
            </a>
        </div>
    </header>

    <main class="wf-main">
        <div class="wf-shell">
            <h1 class="wf-visually-hidden">Wimifarma</h1>

            <section class="wf-user-xp" data-wf-xp-profile hidden aria-live="polite"></section>

            <section class="wf-modules" aria-label="Sistemas Wimifarma">
                <?php foreach ($modules as $module): ?>
                    <?php
                    $cardClasses = array('wf-card');
                    if (!empty($module['xp_frame'])) {
                        $cardClasses[] = 'is-xp-card';
                    }
                    if (!empty($module['home_class'])) {
                        $cardClasses[] = (string) $module['home_class'];
                    }
                    ?>
                    <a class="<?php echo wf_home_e(implode(' ', $cardClasses)); ?>" href="<?php echo wf_home_e(wf_home_url($module['href'])); ?>" data-accent="<?php echo wf_home_e($module['accent']); ?>">
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

        function initXpProfileCard() {
            var holder = document.querySelector('[data-wf-xp-profile]');

            if (!holder || !window.fetch) {
                return;
            }

            var endpoints = [
                '<?php echo wf_home_e(wf_home_url('/xp/api/me/xp-card')); ?>',
                '<?php echo wf_home_e(wf_home_url('/usuarios/api/me/xp-card')); ?>'
            ];
            var loading = false;

            function escapeHtml(value) {
                return String(value == null ? '' : value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            function formatNumber(value) {
                var number = Number(value || 0);
                if (!Number.isFinite(number)) {
                    number = 0;
                }
                return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number);
            }

            function initials(name, fallback) {
                var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
                if (!parts.length) {
                    return fallback || 'XP';
                }
                return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
            }

            function hide() {
                holder.hidden = true;
                holder.innerHTML = '';
            }

            function render(payload) {
                var xp = payload && payload.xp;
                if (!xp) {
                    hide();
                    return;
                }

                var progress = xp.progress || {};
                var percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
                var name = String(xp.name || (xp.is_admin ? 'ADM' : 'Funcionario'));
                var rank = xp.is_admin ? 'ADM' : '#' + formatNumber(xp.rank || 0);
                var photo = /^\/xp\/uploads\/(funcionarios|adm)\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(String(xp.photo_url || ''))
                    ? String(xp.photo_url)
                    : '';
                var avatar = photo
                    ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" loading="lazy" decoding="async">'
                    : '<span>' + escapeHtml(xp.is_admin ? 'ADM' : initials(name, 'XP')) + '</span>';

                holder.innerHTML =
                    '<a class="wf-user-xp-card" href="<?php echo wf_home_e(wf_home_url('/xp/')); ?>" aria-label="Abrir XP de ' + escapeHtml(name) + '">' +
                        '<div class="wf-user-xp-avatar">' + avatar + '</div>' +
                        '<div class="wf-user-xp-main">' +
                            '<div class="wf-user-xp-top"><strong>' + escapeHtml(name) + '</strong><span class="wf-user-xp-rank">' + escapeHtml(rank) + '</span></div>' +
                            '<span class="wf-user-xp-level">Nivel ' + escapeHtml(progress.level || 1) + ' -> ' + escapeHtml(progress.next_level || 2) + ' · ' + escapeHtml(percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })) + '%</span>' +
                            '<div class="wf-user-xp-stats"><span>Mes ' + escapeHtml(formatNumber(xp.month_xp)) + '</span><span>Total ' + escapeHtml(formatNumber(xp.total_xp)) + ' XP</span></div>' +
                            '<div class="wf-user-xp-bar" aria-hidden="true"><i class="wf-user-xp-fill" style="width: ' + escapeHtml(percent.toFixed(2)) + '%"></i></div>' +
                        '</div>' +
                    '</a>';
                holder.hidden = false;
            }

            function fetchEndpoint(index) {
                if (index >= endpoints.length) {
                    hide();
                    return Promise.resolve();
                }

                return fetch(endpoints[index], {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                }).then(function (response) {
                    if (response.status === 401 || response.status === 403 || response.status === 404) {
                        return fetchEndpoint(index + 1);
                    }
                    if (!response.ok) {
                        throw new Error('xp profile unavailable');
                    }
                    return response.json().then(function (payload) {
                        if (payload && payload.xp) {
                            render(payload);
                            return undefined;
                        }
                        return fetchEndpoint(index + 1);
                    });
                }).catch(function () {
                    return fetchEndpoint(index + 1);
                });
            }

            function load() {
                if (loading) {
                    return;
                }
                loading = true;
                fetchEndpoint(0).finally(function () {
                    loading = false;
                });
            }

            load();
            window.setInterval(load, 20000);
            window.addEventListener('focus', load);
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden) {
                    load();
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initTaskBadge();
                initOrderBadge();
                initXpProfileCard();
            });
        } else {
            initTaskBadge();
            initOrderBadge();
            initXpProfileCard();
        }
    }());
</script>
<script src="<?php echo wf_home_e(wf_home_url('/miauw/widget.js?v=20260517j')); ?>" defer></script>
</body>
</html>
