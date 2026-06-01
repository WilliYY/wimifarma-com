<?php
declare(strict_types=1);

require_once __DIR__ . '/home-sso-lib.php';

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$hostName = preg_replace('/:\d+$/', '', $host);
$publicHosts = array('wimifarma.com', 'www.wimifarma.com');
$isPublicHost = in_array($hostName, $publicHosts, true);
$baseUrl = $isPublicHost ? 'https://wimifarma.com' : '';
$assetRoot = '/wp-content/themes/wimifarma-cashback-theme';
$homeLogoUrl = wf_home_asset('assets/img/logo-wimifarma-home-animated.gif') . '?v=20260524-visible-transparent-logo';
$homeLoginLogoUrl = wf_home_asset('assets/img/logo-wimifarma.svg') . '?v=20260530-home-login';
$homeLoginPromoVideoUrl = wf_home_asset('assets/video/login-redirecionado.mp4') . '?v=20260601-login-redirect';
$homeLoginPromoUrl = 'https://wimifarma.com.br';
$homeLoginError = '';

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

function wf_home_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));

    return $https === 'on' || $https === '1' || $forwardedProto === 'https';
}

function wf_home_send_security_headers(): void
{
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(self), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';");
    if (wf_home_is_https()) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}

wf_home_send_security_headers();

function wf_home_redirect(string $path = '/'): void
{
    header('Location: ' . wf_home_url($path), true, 302);
    exit;
}

function wf_home_bubble_style(int $index): string
{
    $size = 1.5 + (mt_rand(0, 520) / 100);
    $distance = 7 + (mt_rand(0, 520) / 100);
    $position = -5 + (mt_rand(0, 11000) / 100);
    $time = 4 + (mt_rand(0, 320) / 100);
    $delay = -1 * (1 + (mt_rand(0, 520) / 100));

    return sprintf(
        '--size:%.2frem;--distance:%.2frem;--position:%.2f%%;--time:%.2fs;--delay:%.2fs;',
        $size,
        $distance,
        $position,
        $time,
        $delay
    );
}

session_name('WFHOME');
session_set_cookie_params(array(
    'lifetime' => 0,
    'path' => '/',
    'secure' => wf_home_is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
));

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if (!isset($_SESSION['wf_home_csrf']) || !is_string($_SESSION['wf_home_csrf'])) {
    $_SESSION['wf_home_csrf'] = bin2hex(random_bytes(16));
}

if (isset($_GET['sair'])) {
    $_SESSION = array();
    wf_home_sso_clear(wf_home_is_https());
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
    wf_home_redirect('/');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && (string) ($_POST['wf_home_action'] ?? '') === 'login') {
    $postedCsrf = (string) ($_POST['wf_home_csrf'] ?? '');
    $user = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $expectedUser = (string) (getenv('WIMIFARMA_HOME_LOGIN_USER') ?: 'adm');
    $expectedPassword = (string) (getenv('WIMIFARMA_HOME_LOGIN_PASSWORD') ?: 'adm');

    if (!hash_equals((string) $_SESSION['wf_home_csrf'], $postedCsrf)) {
        $homeLoginError = 'Sessao expirada. Atualize e tente de novo.';
    } elseif (hash_equals($expectedUser, $user) && hash_equals($expectedPassword, $password)) {
        session_regenerate_id(true);
        $_SESSION['wf_home_authenticated'] = true;
        $_SESSION['wf_home_user'] = $user;
        $_SESSION['wf_home_csrf'] = bin2hex(random_bytes(16));
        wf_home_sso_issue($user, wf_home_is_https());
        wf_home_redirect('/');
    } else {
        $homeLoginError = 'Login ou senha invalidos.';
    }
}

$homeAuthenticated = !empty($_SESSION['wf_home_authenticated']);
if ($homeAuthenticated && !empty($_SESSION['wf_home_user']) && is_string($_SESSION['wf_home_user'])) {
    wf_home_sso_issue($_SESSION['wf_home_user'], wf_home_is_https());
}

if (!$homeAuthenticated):
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Entrar - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="<?php echo wf_home_e(wf_home_asset('assets/img/favicon.svg')); ?>">
    <link rel="preload" as="image" href="<?php echo wf_home_e($homeLoginLogoUrl); ?>">
    <style>
        * {
            box-sizing: border-box;
        }

        @property --footer-background {
            syntax: "<color>";
            inherits: true;
            initial-value: #0e8fa0;
        }

        @property --footer-ink {
            syntax: "<color>";
            inherits: true;
            initial-value: rgba(4, 55, 64, 0.2);
        }

        html {
            min-height: 100%;
            overflow-x: hidden;
            background: #06b6d4;
        }

        body {
            min-height: 100vh;
            margin: 0;
            display: grid;
            grid-template-rows: minmax(0, 1fr) 4.9rem auto;
            grid-template-areas: "main" "." "footer";
            overflow-x: hidden;
            background:
                radial-gradient(circle at 28% 20%, rgba(255, 241, 196, 0.16), transparent 24rem),
                radial-gradient(circle at 72% 18%, rgba(237, 85, 101, 0.18), transparent 22rem),
                linear-gradient(145deg, #06b6d4 0%, #0891b2 52%, #0e7490 100%);
            color: #f8fafc;
            font-family: "Segoe UI", "Open Sans", Arial, sans-serif;
        }

        .wf-login-main {
            grid-area: main;
            min-height: 0;
            display: grid;
            place-items: center;
            padding: clamp(18px, 4vh, 36px) 18px 0;
        }

        .wf-login-layout {
            position: relative;
            width: min(1180px, calc(100vw - 44px));
            min-height: min(530px, calc(100vw - 44px));
            display: grid;
            place-items: center;
        }

        .wf-login-ring {
            position: relative;
            z-index: 2;
            width: min(530px, calc(100vw - 44px));
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wf-login-ring i {
            position: absolute;
            inset: 0;
            border: 2px solid rgba(255, 255, 255, 0.82);
            transition: border-color 0.5s ease, filter 0.5s ease, border-width 0.5s ease;
        }

        .wf-login-ring i:nth-child(1) {
            border-radius: 38% 62% 63% 37% / 41% 44% 56% 59%;
            animation: wf-login-spin 6s linear infinite;
        }

        .wf-login-ring i:nth-child(2) {
            border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
            animation: wf-login-spin 4s linear infinite;
        }

        .wf-login-ring i:nth-child(3) {
            border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
            animation: wf-login-spin-reverse 10s linear infinite;
        }

        .wf-login-ring:hover i,
        .wf-login-ring:focus-within i {
            border-width: 6px;
            border-color: var(--clr);
            filter: drop-shadow(0 0 20px var(--clr));
        }

        .wf-login-card {
            position: absolute;
            width: min(306px, 74vw);
            min-height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .wf-login-logo {
            width: min(238px, 66vw);
            height: auto;
            max-height: 80px;
            display: block;
            object-fit: contain;
            filter: brightness(0) invert(1) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
        }

        .wf-login-only {
            margin-top: -8px;
            color: #ffe4ec;
            font-size: 0.9rem;
            font-weight: 850;
            letter-spacing: 0.03em;
        }

        .wf-login-title {
            margin: 0;
            color: #ffffff;
            font-size: clamp(1.58rem, 4.6vw, 1.92rem);
            font-weight: 950;
            line-height: 1;
            text-align: center;
        }

        .wf-login-input {
            width: 100%;
            display: block;
            border: 2px solid rgba(255, 255, 255, 0.88);
            border-radius: 999px;
            padding: 11px 18px;
            background: rgba(255, 255, 255, 0.04);
            color: #ffffff;
            font: inherit;
            font-size: 1.08rem;
            font-weight: 800;
            outline: none;
            box-shadow: none;
        }

        .wf-login-input::placeholder {
            color: rgba(255, 255, 255, 0.72);
        }

        .wf-login-input:focus {
            border-color: #fff172;
            box-shadow: 0 0 0 4px rgba(255, 241, 114, 0.12);
        }

        .wf-login-submit {
            width: 100%;
            border: 0;
            border-radius: 999px;
            padding: 12px 18px;
            background: linear-gradient(45deg, #ed5565, #fff172);
            color: #3b0717;
            font: inherit;
            font-size: 1.08rem;
            font-weight: 950;
            cursor: pointer;
            box-shadow: 0 18px 34px rgba(237, 85, 101, 0.22);
            transition: transform 160ms ease, filter 160ms ease;
        }

        .wf-login-submit:hover,
        .wf-login-submit:focus-visible {
            transform: translateY(-2px);
            filter: saturate(1.08);
            outline: 0;
        }

        .wf-login-error {
            width: 100%;
            margin: 0;
            border: 1px solid rgba(255, 255, 255, 0.34);
            border-radius: 999px;
            padding: 9px 14px;
            background: rgba(237, 85, 101, 0.16);
            color: #fff1f2;
            font-size: 0.84rem;
            font-weight: 850;
            text-align: center;
        }

        .wf-login-links {
            width: 100%;
            display: flex;
            justify-content: center;
            gap: 10px;
            color: rgba(255, 255, 255, 0.74);
            font-size: 0.82rem;
            font-weight: 800;
            text-align: center;
        }

        .wf-login-promo {
            position: absolute;
            top: 50%;
            left: calc(50% + min(25vw, 285px));
            z-index: 1;
            width: clamp(240px, 22vw, 420px);
            display: grid;
            gap: 10px;
            align-items: center;
            color: #ffffff;
            text-decoration: none;
            transform: translateY(-50%);
        }

        .wf-login-promo-video {
            width: 100%;
            height: auto;
            display: block;
            border: 2px solid rgba(255, 255, 255, 0.54);
            border-radius: 26px;
            background: #130d2b;
            box-shadow: 0 24px 54px rgba(8, 3, 24, 0.34);
            overflow: hidden;
        }

        .wf-login-promo-link {
            justify-self: center;
            border-radius: 999px;
            padding: 7px 14px;
            background: rgba(255, 255, 255, 0.13);
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.83rem;
            font-weight: 900;
            line-height: 1.2;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
            backdrop-filter: blur(6px);
        }

        .wf-login-promo:hover .wf-login-promo-video,
        .wf-login-promo:focus-visible .wf-login-promo-video {
            border-color: rgba(255, 241, 114, 0.9);
            box-shadow: 0 28px 62px rgba(8, 3, 24, 0.42), 0 0 0 4px rgba(255, 241, 114, 0.16);
        }

        .wf-login-promo:focus-visible {
            outline: 0;
        }

        .wf-login-footer {
            z-index: 1;
            --footer-background: #0e8fa0;
            --footer-ink: rgba(4, 55, 64, 0.22);
            position: relative;
            grid-area: footer;
            min-height: 13.85rem;
            display: grid;
            overflow: visible;
            background: var(--footer-background);
            isolation: isolate;
        }

        .wf-login-bubbles {
            position: absolute;
            top: -5.6rem;
            left: -3rem;
            right: -3rem;
            height: 8.5rem;
            overflow: visible;
            filter: url("#wf-login-blob");
            pointer-events: none;
        }

        .wf-login-bubbles::before {
            content: "";
            position: absolute;
            left: -2rem;
            right: -2rem;
            bottom: -0.35rem;
            height: 4.8rem;
            background: var(--footer-background);
            border-radius: 999px 999px 0 0;
        }

        .wf-login-bubble {
            position: absolute;
            left: var(--position, 50%);
            bottom: 1.2rem;
            background: var(--footer-background);
            border-radius: 100%;
            animation:
                wf-bubble-size var(--time, 4s) ease-in infinite var(--delay, 0s),
                wf-bubble-move var(--time, 4s) ease-in infinite var(--delay, 0s);
            transform: translate(-50%, 0);
        }

        .wf-login-footer-content {
            position: relative;
            z-index: 2;
            display: grid;
            grid-template-columns: minmax(0, 0.95fr) minmax(150px, 0.5fr) minmax(0, 1.08fr);
            gap: clamp(1.8rem, 4vw, 4rem);
            align-items: start;
            width: 100%;
            margin-top: -1px;
            padding: 2.35rem max(2rem, calc((100vw - 1120px) / 2)) 1.55rem;
            background: transparent;
            color: #210915;
        }

        .wf-login-footer-content::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            opacity: 0.16;
            background-image:
                radial-gradient(circle at 18% 40%, transparent 0 2.2rem, var(--footer-ink) 2.24rem 2.34rem, transparent 2.38rem),
                radial-gradient(circle at 52% 24%, transparent 0 3rem, var(--footer-ink) 3.05rem 3.18rem, transparent 3.22rem),
                radial-gradient(circle at 82% 42%, transparent 0 2.6rem, var(--footer-ink) 2.65rem 2.76rem, transparent 2.8rem);
            background-size: 18rem 9rem, 24rem 11rem, 20rem 10rem;
        }

        .wf-login-footer-content b,
        .wf-login-footer-content a,
        .wf-login-footer-content p,
        .wf-login-footer-content span {
            color: #270817;
            text-decoration: none;
        }

        .wf-login-footer-content b {
            display: block;
            color: #210814;
            font-size: 0.82rem;
            letter-spacing: 0.18em;
            line-height: 1.2;
            text-transform: uppercase;
        }

        .wf-login-footer-content p {
            margin: 0;
            font-size: 0.9rem;
            font-weight: 750;
            line-height: 1.58;
        }

        .wf-login-footer-groups,
        .wf-login-footer-content > div:has(> .wf-login-footer-image) {
            display: none;
        }

        .wf-login-footer-brand {
            display: grid;
            align-content: start;
            gap: 0.9rem;
            max-width: 22rem;
        }

        .wf-login-footer-logo {
            width: min(210px, 72vw);
            height: auto;
            display: block;
            filter: brightness(0) invert(1) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.16));
        }

        .wf-login-whatsapp {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.55rem;
            width: fit-content;
            min-height: 42px;
            border-radius: 999px;
            padding: 0 1.35rem;
            background: #ffffff;
            color: #1f2937;
            font-size: 0.86rem;
            font-weight: 900;
            text-decoration: none;
            box-shadow: 0 16px 30px rgba(70, 5, 25, 0.16);
            transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .wf-login-whatsapp:hover,
        .wf-login-whatsapp:focus-visible {
            transform: translateY(-2px);
            box-shadow: 0 22px 34px rgba(70, 5, 25, 0.2);
            outline: 0;
        }

        .wf-login-whatsapp svg,
        .wf-login-footer-contact svg,
        .wf-login-whatsapp-float svg {
            flex: 0 0 auto;
        }

        .wf-login-whatsapp svg {
            color: #21b85b;
            filter: drop-shadow(0 2px 4px rgba(33, 184, 91, 0.18));
        }

        .wf-login-footer-nav {
            display: grid;
            align-content: start;
            gap: 0.68rem;
        }

        .wf-login-footer-nav a {
            display: block;
            width: fit-content;
            font-weight: 850;
        }

        .wf-login-footer-contact {
            display: grid;
            align-content: start;
            gap: 0.68rem;
            max-width: 29rem;
        }

        .wf-login-footer-contact-row {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            font-weight: 780;
            line-height: 1.42;
        }

        .wf-login-footer-contact-row span {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .wf-login-footer-contact-row svg {
            color: #ffd23f;
            margin-top: 0.08rem;
        }

        .wf-login-footer-note {
            border-top: 1px solid rgba(39, 8, 23, 0.16);
            max-width: 27rem;
            padding-top: 0.68rem;
        }

        .wf-login-footer-image {
            display: none;
        }

        .wf-login-footer-image + p {
            display: none;
        }

        .wf-login-whatsapp-float {
            position: fixed;
            right: 1.65rem;
            bottom: 1.35rem;
            z-index: 4;
            width: 58px;
            height: 58px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.72);
            background:
                radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.38), transparent 0 25%),
                linear-gradient(145deg, #2fed76 0%, #1ebc59 54%, #0f9f49 100%);
            color: #ffffff;
            box-shadow: 0 18px 36px rgba(21, 128, 61, 0.36), inset 0 -6px 14px rgba(6, 95, 70, 0.22);
            text-decoration: none;
            transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .wf-login-whatsapp-float:hover,
        .wf-login-whatsapp-float:focus-visible {
            transform: translateY(-3px) scale(1.03);
            box-shadow: 0 22px 42px rgba(21, 128, 61, 0.44), inset 0 -6px 14px rgba(6, 95, 70, 0.2);
            outline: 0;
        }

        .wf-login-runner {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 4;
            width: clamp(70px, 8vw, 118px);
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 18px 26px rgba(16, 4, 28, 0.24));
            transform: translate3d(var(--login-runner-x, 14vw), var(--login-runner-y, 58vh), 0) scaleX(var(--login-runner-dir, 1));
            will-change: transform;
        }

        .wf-login-svg-filter {
            position: fixed;
            top: 100vh;
            left: 0;
            width: 0;
            height: 0;
        }

        @keyframes wf-login-spin {
            to {
                transform: rotate(360deg);
            }
        }

        @keyframes wf-login-spin-reverse {
            from {
                transform: rotate(360deg);
            }
            to {
                transform: rotate(0deg);
            }
        }

        @keyframes wf-bubble-size {
            0%, 75% {
                width: var(--size, 4rem);
                height: var(--size, 4rem);
            }
            100% {
                width: 0;
                height: 0;
            }
        }

        @keyframes wf-bubble-move {
            0% {
                bottom: 0.7rem;
            }
            100% {
                bottom: var(--distance, 10rem);
            }
        }

        @media (max-width: 1080px) {
            .wf-login-promo {
                display: none;
            }
        }

        @media (max-width: 720px) {
            .wf-login-main {
                padding-top: 24px;
            }

            .wf-login-card {
                width: min(300px, 78vw);
                gap: 13px;
            }

            .wf-login-footer-content {
                grid-template-columns: 1fr;
                gap: 1.35rem;
                place-items: center;
                padding: 2.2rem 1.15rem 3.55rem;
                text-align: center;
            }

            .wf-login-footer-brand,
            .wf-login-footer-nav,
            .wf-login-footer-contact {
                justify-items: center;
                width: 100%;
            }

            .wf-login-footer-contact-row {
                justify-content: center;
                flex-wrap: wrap;
                gap: 0.45rem;
            }

            .wf-login-footer-content p,
            .wf-login-footer-contact-row span {
                max-width: min(19.5rem, calc(100vw - 2.3rem));
            }

            .wf-login-whatsapp-float {
                right: 1rem;
                bottom: 1rem;
                width: 52px;
                height: 52px;
            }

            .wf-login-runner {
                width: 72px;
            }
        }

        @media (max-width: 420px) {
            .wf-login-ring {
                width: min(360px, calc(100vw - 34px));
            }

            .wf-login-card {
                width: min(276px, 76vw);
                gap: 10px;
            }

            .wf-login-logo {
                width: min(214px, 64vw);
                max-height: 68px;
            }

            .wf-login-input,
            .wf-login-submit {
                padding: 10px 16px;
                font-size: 0.98rem;
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
</head>
<body>
    <main class="wf-login-main">
        <div class="wf-login-layout">
            <form class="wf-login-ring" method="post" action="<?php echo wf_home_e(wf_home_url('/')); ?>" autocomplete="off" novalidate>
                <i style="--clr:#00ff0a;" aria-hidden="true"></i>
                <i style="--clr:#ff0057;" aria-hidden="true"></i>
                <i style="--clr:#fffd44;" aria-hidden="true"></i>
                <div class="wf-login-card">
                    <img class="wf-login-logo" src="<?php echo wf_home_e($homeLoginLogoUrl); ?>" alt="Wimifarma" width="1560" height="622">
                    <span class="wf-login-only">Apenas funcion&aacute;rios</span>
                    <h1 class="wf-login-title">Login</h1>
                    <?php if ($homeLoginError !== ''): ?>
                        <p class="wf-login-error"><?php echo wf_home_e($homeLoginError); ?></p>
                    <?php endif; ?>
                    <input type="hidden" name="wf_home_action" value="login">
                    <input type="hidden" name="wf_home_csrf" value="<?php echo wf_home_e((string) $_SESSION['wf_home_csrf']); ?>">
                    <input class="wf-login-input" type="text" name="username" placeholder="Login" autocomplete="username" required autofocus>
                    <input class="wf-login-input" type="password" name="password" placeholder="Senha" autocomplete="current-password" required>
                    <button class="wf-login-submit" type="submit">Entrar</button>
                    <div class="wf-login-links" aria-hidden="true">
                        <span>Wimifarma</span>
                        <span>&middot;</span>
                        <span>Acesso interno</span>
                    </div>
                </div>
            </form>
            <a class="wf-login-promo" href="<?php echo wf_home_e($homeLoginPromoUrl); ?>" aria-label="Abrir wimifarma.com.br">
                <video class="wf-login-promo-video" src="<?php echo wf_home_e($homeLoginPromoVideoUrl); ?>" autoplay muted loop playsinline preload="metadata"></video>
                <span class="wf-login-promo-link">wimifarma.com.br</span>
            </a>
        </div>
    </main>

    <footer class="wf-login-footer">
        <div class="wf-login-bubbles" aria-hidden="true">
            <?php for ($i = 0; $i < 128; $i++): ?>
                <span class="wf-login-bubble" style="<?php echo wf_home_e(wf_home_bubble_style($i)); ?>"></span>
            <?php endfor; ?>
        </div>
        <div class="wf-login-footer-content">
            <div class="wf-login-footer-brand">
                <img class="wf-login-footer-logo" src="<?php echo wf_home_e($homeLoginLogoUrl); ?>" alt="Wimifarma">
                <p>Atendimento local pelo WhatsApp para medicamentos, Farmacia Popular e entrega.</p>
                <a class="wf-login-whatsapp" href="https://wa.me/5544984134971" target="_blank" rel="noopener">
                    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M16.04 3.2c-7.05 0-12.78 5.67-12.78 12.65 0 2.23.6 4.41 1.73 6.32L3.2 28.8l6.82-1.78a12.9 12.9 0 0 0 6.02 1.5c7.05 0 12.78-5.67 12.78-12.65S23.09 3.2 16.04 3.2Zm0 23.1c-1.88 0-3.72-.5-5.33-1.44l-.38-.22-4.05 1.06 1.08-3.9-.25-.4a10.33 10.33 0 0 1-1.63-5.55c0-5.75 4.74-10.43 10.56-10.43S26.6 10.1 26.6 15.85 21.86 26.3 16.04 26.3Zm5.78-7.82c-.32-.16-1.88-.92-2.17-1.03-.29-.1-.5-.16-.71.16-.21.31-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.56-.94-.83-1.58-1.86-1.76-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.61-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.22 3.36 5.38 4.71.75.32 1.34.51 1.8.65.76.24 1.45.21 1.99.13.61-.09 1.88-.76 2.14-1.5.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.61-.37Z"/>
                    </svg>
                    <span>Chamar no WhatsApp</span>
                </a>
            </div>
            <nav class="wf-login-footer-nav" aria-label="Navegacao">
                <b>Navegacao</b>
                <a href="<?php echo wf_home_e(wf_home_url('/')); ?>">Farmacia Popular</a>
                <a href="<?php echo wf_home_e(wf_home_url('/')); ?>">Sobre</a>
                <a href="https://wa.me/5544984134971" target="_blank" rel="noopener">Contato</a>
            </nav>
            <div class="wf-login-footer-contact">
                <b>Atendimento</b>
                <div class="wf-login-footer-contact-row">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/>
                        <circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <span>Avenida Minas Gerais, 2263 - Ivate, Parana</span>
                </div>
                <div class="wf-login-footer-contact-row">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v2.25a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.4 2 2 0 0 1 4.11 1.2h2.25a2 2 0 0 1 2 1.72c.12.9.33 1.79.62 2.63a2 2 0 0 1-.45 2.11L7.58 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.84.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>
                    </svg>
                    <span>(44) 98413-4971</span>
                </div>
                <p class="wf-login-footer-note">Pedidos e disponibilidade sempre sob confirmacao da equipe.</p>
            </div>
        </div>
    </footer>
    <a class="wf-login-whatsapp-float" href="https://wa.me/5544984134971" target="_blank" rel="noopener" aria-label="Chamar no WhatsApp">
        <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M16.04 3.2c-7.05 0-12.78 5.67-12.78 12.65 0 2.23.6 4.41 1.73 6.32L3.2 28.8l6.82-1.78a12.9 12.9 0 0 0 6.02 1.5c7.05 0 12.78-5.67 12.78-12.65S23.09 3.2 16.04 3.2Zm0 23.1c-1.88 0-3.72-.5-5.33-1.44l-.38-.22-4.05 1.06 1.08-3.9-.25-.4a10.33 10.33 0 0 1-1.63-5.55c0-5.75 4.74-10.43 10.56-10.43S26.6 10.1 26.6 15.85 21.86 26.3 16.04 26.3Zm5.78-7.82c-.32-.16-1.88-.92-2.17-1.03-.29-.1-.5-.16-.71.16-.21.31-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.56-.94-.83-1.58-1.86-1.76-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.61-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.22 3.36 5.38 4.71.75.32 1.34.51 1.8.65.76.24 1.45.21 1.99.13.61-.09 1.88-.76 2.14-1.5.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.61-.37Z"/>
        </svg>
    </a>
    <img class="wf-login-runner" src="<?php echo wf_home_e(wf_home_url('/cashback/gato-hapy.gif')); ?>" alt="" aria-hidden="true" data-login-runner>
    <svg class="wf-login-svg-filter" aria-hidden="true" focusable="false">
        <defs>
            <filter id="wf-login-blob">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"></feGaussianBlur>
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob"></feColorMatrix>
            </filter>
        </defs>
    </svg>
    <script>
        (function () {
            'use strict';

            function clamp(value, min, max) {
                return Math.max(min, Math.min(max, value));
            }

            function initLoginRunners() {
                var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-login-runner]'));

                if (nodes.length === 0 || !window.requestAnimationFrame) {
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
                        x: clamp(window.innerWidth * (0.12 + index * 0.18), 18, Math.max(18, window.innerWidth - 150)),
                        y: clamp(window.innerHeight * 0.6, 78, Math.max(78, window.innerHeight - 140)),
                        vx: index % 2 === 0 ? 0.58 : -0.66,
                        vy: index % 2 === 0 ? -0.28 : 0.34,
                        phase: Math.random() * Math.PI * 2
                    };
                });

                function place(state) {
                    state.node.style.setProperty('--login-runner-x', state.x.toFixed(1) + 'px');
                    state.node.style.setProperty('--login-runner-y', state.y.toFixed(1) + 'px');
                    state.node.style.setProperty('--login-runner-dir', state.vx < 0 ? '-1' : '1');
                }

                states.forEach(place);
                if (reducedMotion) {
                    return;
                }

                window.addEventListener('pointermove', function (event) {
                    pointer.x = event.clientX;
                    pointer.y = event.clientY;
                    pointer.active = true;
                }, { passive: true });

                window.addEventListener('pointerleave', function () {
                    pointer.active = false;
                });

                var lastTick = performance.now();

                function tick(now) {
                    var dt = Math.min(32, now - lastTick) / 16.67;
                    lastTick = now;

                    states.forEach(function (state, index) {
                        var rect = state.node.getBoundingClientRect();
                        var width = rect.width || 100;
                        var height = rect.height || 96;
                        var centerX = state.x + width / 2;
                        var centerY = state.y + height / 2;
                        var dx = centerX - pointer.x;
                        var dy = centerY - pointer.y;
                        var distance = Math.max(1, Math.hypot(dx, dy));

                        if (pointer.active && distance < 210) {
                            var flee = (210 - distance) / 210;
                            state.vx += (dx / distance) * flee * 0.72;
                            state.vy += (dy / distance) * flee * 0.72;
                        } else {
                            state.vx += Math.cos(now / 900 + state.phase) * 0.014 * dt;
                            state.vy += Math.sin(now / 1100 + state.phase + index) * 0.014 * dt;
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

                        place(state);
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
    </script>
</body>
</html>
<?php
exit;
endif;

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
        'href' => '/miauby/',
        'accent' => 'violet',
    ),
    array(
        'name' => 'Miauby Whatsapp',
        'label' => 'Canal e fila',
        'description' => 'Webhook, Evolution, eventos e outbox.',
        'href' => '/miauby/whatsapp/',
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
            opacity: 1;
            filter: none;
        }

        .wf-backdrop::after {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
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
            justify-content: space-between;
            gap: 18px;
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

        .wf-home-logout {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            border: 1px solid rgba(255, 255, 255, 0.78);
            border-radius: 999px;
            padding: 0 18px;
            background: rgba(255, 255, 255, 0.16);
            color: #ffffff;
            font-size: 0.9rem;
            font-weight: 900;
            text-decoration: none;
            text-shadow: 0 1px 10px rgba(15, 23, 42, 0.3);
            box-shadow: 0 12px 24px rgba(15, 23, 42, 0.1);
            backdrop-filter: blur(8px);
        }

        .wf-home-logout:hover,
        .wf-home-logout:focus-visible {
            background: rgba(168, 15, 67, 0.88);
            outline: 0;
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
                flex-direction: column;
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

            .wf-header-inner {
                gap: 8px;
            }

            .wf-home-logout {
                min-height: 36px;
                padding: 0 15px;
                font-size: 0.8rem;
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
    <link rel="stylesheet" href="<?php echo wf_home_e(wf_home_url('/miauw/widget.css?v=20260530-avatar')); ?>">
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
            <a class="wf-home-logout" href="<?php echo wf_home_e(wf_home_url('/?sair=1')); ?>">Sair</a>
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
                            <em class="wf-card-badge is-calm" data-wf-order-badge hidden aria-label="Pedidos aguardando chegada"></em>
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
                var rawCount = payload && typeof payload.awaiting_arrival !== 'undefined'
                    ? payload.awaiting_arrival
                    : (payload && typeof payload.count !== 'undefined' ? payload.count : (payload && payload.arriving_today));
                var count = Number(rawCount || 0);
                if (!Number.isFinite(count) || count < 0) {
                    count = 0;
                }

                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.toggle('is-calm', count === 0);
                badge.setAttribute('aria-label', count === 1 ? '1 pedido aguardando chegada' : String(count) + ' pedidos aguardando chegada');
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
<script src="<?php echo wf_home_e(wf_home_url('/miauw/widget.js?v=20260530-avatar')); ?>" defer></script>
</body>
</html>
