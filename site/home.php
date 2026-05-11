<?php
declare(strict_types=1);

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hostName = preg_replace('/:\d+$/', '', $host);
$publicHosts = array('wimifarma.com', 'www.wimifarma.com');
$isPublicHost = in_array($hostName, $publicHosts, true);
$baseUrl = $isPublicHost ? 'https://wimifarma.com' : '';
$assetRoot = '/wp-content/themes/wimifarma-cashback-theme';

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
    ),
    array(
        'name' => 'Miauby',
        'label' => 'Assistente interno',
        'description' => 'Alertas, diagnosticos e apoio operacional.',
        'href' => '/miauw/',
        'accent' => 'violet',
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
    <link rel="preload" as="image" href="<?php echo wf_home_e(wf_home_asset('assets/img/logo-wimifarma-official.svg')); ?>">
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
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .wf-header {
            border-bottom: 1px solid #d9e1ec;
            background: rgba(255, 255, 255, 0.96);
        }

        .wf-shell {
            width: min(1180px, calc(100% - 40px));
            margin: 0 auto;
        }

        .wf-header-inner {
            min-height: 78px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
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

        .wf-nav {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 8px;
        }

        .wf-nav a {
            min-height: 38px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 14px;
            border: 1px solid #d9e1ec;
            border-radius: 8px;
            background: #ffffff;
            color: #334155;
            font-size: 0.94rem;
            font-weight: 700;
            text-decoration: none;
        }

        .wf-main {
            flex: 1;
            padding: 42px 0 54px;
        }

        .wf-hero {
            display: grid;
            grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
            align-items: center;
            gap: 34px;
        }

        .wf-hero-copy {
            display: grid;
            gap: 18px;
            align-content: center;
        }

        .wf-kicker {
            width: fit-content;
            margin: 0;
            padding: 8px 10px;
            border: 1px solid #c7d2fe;
            border-radius: 8px;
            background: #eef2ff;
            color: #334155;
            font-size: 0.78rem;
            font-weight: 800;
            text-transform: uppercase;
        }

        .wf-title {
            margin: 0;
            color: #0f172a;
            font-size: 3.7rem;
            line-height: 0.95;
            letter-spacing: 0;
        }

        .wf-summary {
            max-width: 620px;
            margin: 0;
            color: #475569;
            font-size: 1.08rem;
            line-height: 1.55;
        }

        .wf-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 4px;
        }

        .wf-button {
            min-height: 46px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 18px;
            border-radius: 8px;
            border: 1px solid #0f172a;
            background: #0f172a;
            color: #ffffff;
            font-weight: 800;
            text-decoration: none;
        }

        .wf-button.is-secondary {
            border-color: #d9e1ec;
            background: #ffffff;
            color: #0f172a;
        }

        .wf-stage {
            position: relative;
            min-height: 420px;
            border: 1px solid #d9e1ec;
            border-radius: 8px;
            overflow: hidden;
            background: #ffffff;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
        }

        .wf-stage video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.42;
        }

        .wf-stage-panel {
            position: absolute;
            inset: auto 22px 22px 22px;
            min-height: 112px;
            display: grid;
            gap: 8px;
            align-content: center;
            padding: 18px;
            border: 1px solid rgba(217, 225, 236, 0.9);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(5px);
        }

        .wf-stage-panel strong {
            font-size: 1.12rem;
            color: #0f172a;
        }

        .wf-stage-panel span {
            color: #475569;
            line-height: 1.45;
        }

        .wf-runner {
            position: absolute;
            height: auto;
            pointer-events: none;
            filter: drop-shadow(0 16px 24px rgba(15, 23, 42, 0.18));
        }

        .wf-runner.is-nyan {
            width: min(42%, 330px);
            left: 9%;
            top: 24%;
            animation: wf-float-a 7s ease-in-out infinite;
        }

        .wf-runner.is-duck {
            width: min(23%, 170px);
            right: 17%;
            top: 30%;
            animation: wf-float-b 7.5s ease-in-out infinite;
        }

        .wf-runner.is-dragon {
            width: min(20%, 150px);
            right: 13%;
            bottom: 32%;
            animation: wf-float-c 6.5s ease-in-out infinite;
        }

        .wf-modules {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 14px;
            margin-top: 28px;
        }

        .wf-card {
            min-height: 186px;
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            gap: 10px;
            padding: 18px;
            border: 1px solid #d9e1ec;
            border-radius: 8px;
            background: #ffffff;
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

        .wf-footer {
            border-top: 1px solid #d9e1ec;
            background: #ffffff;
        }

        .wf-footer-inner {
            min-height: 58px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            color: #64748b;
            font-size: 0.92rem;
        }

        @keyframes wf-float-a {
            0%, 100% {
                transform: translate3d(0, 0, 0);
            }

            50% {
                transform: translate3d(18px, -14px, 0);
            }
        }

        @keyframes wf-float-b {
            0%, 100% {
                transform: translate3d(0, 0, 0) rotate(-2deg);
            }

            50% {
                transform: translate3d(-14px, 12px, 0) rotate(2deg);
            }
        }

        @keyframes wf-float-c {
            0%, 100% {
                transform: translate3d(0, 0, 0) rotate(1deg);
            }

            50% {
                transform: translate3d(12px, 10px, 0) rotate(-2deg);
            }
        }

        @media (max-width: 1040px) {
            .wf-header-inner {
                align-items: flex-start;
                flex-direction: column;
                padding: 16px 0;
            }

            .wf-nav {
                justify-content: flex-start;
            }

            .wf-hero {
                grid-template-columns: 1fr;
            }

            .wf-stage {
                min-height: 360px;
            }

            .wf-modules {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }

        @media (max-width: 640px) {
            .wf-shell {
                width: min(100% - 24px, 1180px);
            }

            .wf-main {
                padding: 28px 0 38px;
            }

            .wf-title {
                font-size: 2.45rem;
            }

            .wf-summary {
                font-size: 1rem;
            }

            .wf-actions,
            .wf-nav {
                width: 100%;
            }

            .wf-button,
            .wf-nav a {
                width: 100%;
            }

            .wf-stage {
                min-height: 320px;
            }

            .wf-stage-panel {
                inset: auto 12px 12px 12px;
                padding: 14px;
            }

            .wf-runner.is-nyan {
                width: 62%;
                left: 5%;
                top: 24%;
            }

            .wf-runner.is-duck {
                width: 34%;
                right: 8%;
                top: 36%;
            }

            .wf-runner.is-dragon {
                width: 30%;
                right: 12%;
                bottom: 34%;
            }

            .wf-modules {
                grid-template-columns: 1fr;
            }

            .wf-footer-inner {
                align-items: flex-start;
                flex-direction: column;
                padding: 16px 0;
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
    <header class="wf-header">
        <div class="wf-shell wf-header-inner">
            <a class="wf-brand" href="<?php echo wf_home_e(wf_home_url('/')); ?>" aria-label="Wimifarma">
                <img src="<?php echo wf_home_e(wf_home_asset('assets/img/logo-wimifarma-official.svg')); ?>" alt="Wimifarma" width="236" height="72">
            </a>
            <nav class="wf-nav" aria-label="Acessos rapidos">
                <?php foreach ($modules as $module): ?>
                    <a href="<?php echo wf_home_e(wf_home_url($module['href'])); ?>"><?php echo wf_home_e($module['name']); ?></a>
                <?php endforeach; ?>
            </nav>
        </div>
    </header>

    <main class="wf-main">
        <div class="wf-shell">
            <section class="wf-hero" aria-labelledby="wf-home-title">
                <div class="wf-hero-copy">
                    <p class="wf-kicker">Portal interno</p>
                    <h1 id="wf-home-title" class="wf-title">Wimifarma</h1>
                    <p class="wf-summary">Ferramentas internas para atendimento, compras, financeiro, tarefas e apoio operacional em um ambiente unico.</p>
                    <div class="wf-actions" aria-label="Principais acessos">
                        <a class="wf-button" href="<?php echo wf_home_e(wf_home_url('/cashback/')); ?>">Abrir Cashback</a>
                        <a class="wf-button is-secondary" href="<?php echo wf_home_e(wf_home_url('/cotacao/')); ?>">Abrir Cotacao</a>
                    </div>
                </div>

                <div class="wf-stage" aria-hidden="true">
                    <video autoplay muted loop playsinline preload="metadata">
                        <source src="<?php echo wf_home_e(wf_home_asset('assets/video/looping.mp4')); ?>" type="video/mp4">
                    </video>
                    <img class="wf-runner is-nyan" src="<?php echo wf_home_e(wf_home_asset('assets/img/nyan.gif')); ?>" alt="">
                    <img class="wf-runner is-duck" src="<?php echo wf_home_e(wf_home_asset('assets/img/pato.gif')); ?>" alt="">
                    <img class="wf-runner is-dragon" src="<?php echo wf_home_e(wf_home_asset('assets/img/toothless.gif')); ?>" alt="">
                    <div class="wf-stage-panel">
                        <strong>Central Wimifarma</strong>
                        <span>Acesso rapido aos sistemas usados na rotina da equipe.</span>
                    </div>
                </div>
            </section>

            <section class="wf-modules" aria-label="Sistemas Wimifarma">
                <?php foreach ($modules as $module): ?>
                    <a class="wf-card" href="<?php echo wf_home_e(wf_home_url($module['href'])); ?>" data-accent="<?php echo wf_home_e($module['accent']); ?>">
                        <i class="wf-card-mark" aria-hidden="true"></i>
                        <h2><?php echo wf_home_e($module['name']); ?></h2>
                        <span><?php echo wf_home_e($module['label']); ?></span>
                        <p><?php echo wf_home_e($module['description']); ?></p>
                        <b>Entrar</b>
                    </a>
                <?php endforeach; ?>
            </section>
        </div>
    </main>

    <footer class="wf-footer">
        <div class="wf-shell wf-footer-inner">
            <span>Wimifarma</span>
            <span>Portal interno</span>
        </div>
    </footer>
</div>
<script src="<?php echo wf_home_e(wf_home_url('/miauw/widget.js')); ?>" defer></script>
</body>
</html>
