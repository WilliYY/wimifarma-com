<?php
if (!defined('ABSPATH')) {
    exit;
}

function wfwc_is_public_host()
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $host = preg_replace('/:\d+$/', '', $host);

    return in_array($host, array('wimifarma.com', 'www.wimifarma.com'), true);
}

function wfwc_public_https_url($url)
{
    if (!wfwc_is_public_host() || !is_string($url) || $url === '') {
        return $url;
    }

    return str_replace(
        array(
            'http://www.wimifarma.com',
            'https://www.wimifarma.com',
            'http://wimifarma.com',
        ),
        'https://wimifarma.com',
        $url
    );
}

function wfwc_home_url($path = '')
{
    if (!wfwc_is_public_host()) {
        return home_url($path);
    }

    $path = (string) $path;
    if ($path === '') {
        return 'https://wimifarma.com';
    }

    return 'https://wimifarma.com/' . ltrim($path, '/');
}

function wfwc_theme_asset_url($path = '')
{
    $base = wfwc_is_public_host()
        ? 'https://wimifarma.com/wp-content/themes/wimifarma-cashback-theme'
        : get_template_directory_uri();

    $path = (string) $path;
    if ($path === '') {
        return $base;
    }

    return $base . '/' . ltrim($path, '/');
}

function wfwc_best_offer_items()
{
    return array(
        array('label' => 'Leve 2 e pague menos', 'name' => 'Niquitin Adesivo 21mg', 'detail' => 'Com 7 adesivos', 'old_price' => 'R$ 116,39', 'price' => 'R$ 94,90', 'tone' => 'blue'),
        array('label' => 'Leve mais por menos', 'name' => 'Hyabak Solucao Oftalmica', 'detail' => 'Frasco 10ml', 'old_price' => 'R$ 73,19', 'price' => 'R$ 59,90', 'tone' => 'cyan'),
        array('label' => 'Oferta da semana', 'name' => 'Cimegripe', 'detail' => '20 capsulas', 'old_price' => 'R$ 11,89', 'price' => 'R$ 9,90', 'tone' => 'violet'),
        array('label' => '51% OFF', 'name' => 'Expec Tripla Acao', 'detail' => 'Xarope 120ml', 'old_price' => 'R$ 54,83', 'price' => 'R$ 26,89', 'tone' => 'amber'),
        array('label' => '23% OFF', 'name' => 'Muvinlax Limao', 'detail' => '20 saches 14g', 'old_price' => 'R$ 68,71', 'price' => 'R$ 52,71', 'tone' => 'green'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 06', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'rose'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 07', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'teal'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 08', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'indigo'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 09', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'gold'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 10', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'mint'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 11', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'blue'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 12', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'cyan'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 13', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'violet'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 14', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'amber'),
        array('label' => 'Melhor oferta', 'name' => 'Produto 15', 'detail' => 'Espaco para cadastrar oferta', 'old_price' => '', 'price' => 'Consulte', 'tone' => 'green'),
    );
}

function wfwc_best_offer_catalog_html($auto_place = false)
{
    $items = wfwc_best_offer_items();
    $section_attrs = $auto_place
        ? ' data-wfwc-best-offers-auto="1"'
        : '';

    ob_start();
    ?>
    <section class="wfwc-best-offers" data-wfwc-best-offers<?php echo $section_attrs; ?> aria-labelledby="wfwc-best-offers-title">
        <div class="wfwc-best-offers-head">
            <div>
                <span>Catalogo</span>
                <h2 id="wfwc-best-offers-title">Melhor oferta</h2>
            </div>
            <p>Selecao preparada para ofertas da farmacia.</p>
        </div>
        <div class="wfwc-best-offers-grid">
            <?php foreach ($items as $index => $item): ?>
                <?php
                $name = (string) ($item['name'] ?? ('Produto ' . ($index + 1)));
                $detail = (string) ($item['detail'] ?? '');
                $label = (string) ($item['label'] ?? 'Melhor oferta');
                $old_price = (string) ($item['old_price'] ?? '');
                $price = (string) ($item['price'] ?? 'R$ 0,00');
                $tone = preg_replace('/[^a-z0-9_-]/i', '', (string) ($item['tone'] ?? 'rose'));
                $slot = str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
                $whatsapp_text = rawurlencode('Ola, tenho interesse em ' . $name . ' da Melhor oferta.');
                ?>
                <article class="wfwc-offer-card" data-tone="<?php echo esc_attr($tone); ?>">
                    <span class="wfwc-offer-badge"><?php echo esc_html($label); ?></span>
                    <div class="wfwc-offer-visual" aria-hidden="true">
                        <span class="wfwc-offer-box"></span>
                        <strong><?php echo esc_html($slot); ?></strong>
                    </div>
                    <div class="wfwc-offer-body">
                        <?php if ($old_price !== ''): ?>
                            <span class="wfwc-offer-old"><?php echo esc_html($old_price); ?></span>
                        <?php endif; ?>
                        <strong class="wfwc-offer-price"><?php echo esc_html($price); ?></strong>
                        <h3><?php echo esc_html($name); ?></h3>
                        <p><?php echo esc_html($detail); ?></p>
                    </div>
                    <a class="wfwc-offer-action" href="<?php echo esc_url('https://wa.me/5544984134971?text=' . $whatsapp_text); ?>" target="_blank" rel="noopener">
                        Comprar
                    </a>
                </article>
            <?php endforeach; ?>
        </div>
    </section>
    <?php
    return (string) ob_get_clean();
}

add_shortcode(
    'wimifarma_melhor_oferta',
    static function () {
        return wfwc_best_offer_catalog_html(false);
    }
);

add_filter(
    'the_content',
    static function ($content) {
        if (
            is_admin()
            || !is_front_page()
            || !in_the_loop()
            || !is_main_query()
            || has_shortcode((string) $content, 'wimifarma_melhor_oferta')
            || strpos((string) $content, 'data-wfwc-best-offers') !== false
        ) {
            return $content;
        }

        return $content . "\n" . wfwc_best_offer_catalog_html(true);
    },
    30
);

function wfwc_public_https_output($buffer)
{
    return wfwc_public_https_url($buffer);
}

add_filter('home_url', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('site_url', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('content_url', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('includes_url', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('plugins_url', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('stylesheet_directory_uri', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('template_directory_uri', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('theme_file_uri', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('script_loader_src', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('style_loader_src', 'wfwc_public_https_url', PHP_INT_MAX);
add_filter('wp_redirect', 'wfwc_public_https_url', PHP_INT_MAX);

add_action(
    'init',
    static function () {
        if (
            !wfwc_is_public_host()
            || is_admin()
            || wp_doing_ajax()
            || (defined('REST_REQUEST') && REST_REQUEST)
        ) {
            return;
        }

        ob_start('wfwc_public_https_output');
    },
    0
);

add_action(
    'after_setup_theme',
    static function () {
        add_theme_support('title-tag');
        add_theme_support(
            'html5',
            array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script')
        );
    }
);

add_filter(
    'show_admin_bar',
    static function ($show) {
        return is_admin() ? $show : false;
    }
);

add_action(
    'send_headers',
    static function () {
        if (is_front_page() || is_page('login') || is_page('consulta-cashback')) {
            nocache_headers();
        }
    }
);

add_action(
    'wp_enqueue_scripts',
    static function () {
        $theme_dir = get_template_directory();
        $theme_uri = wfwc_theme_asset_url();

        $style_version = file_exists($theme_dir . '/style.css') ? (string) filemtime($theme_dir . '/style.css') : '1.2.0';
        $extra_version = file_exists($theme_dir . '/assets/css/theme.css') ? (string) filemtime($theme_dir . '/assets/css/theme.css') : '1.2.0';
        $script_version = file_exists($theme_dir . '/assets/js/theme.js') ? (string) filemtime($theme_dir . '/assets/js/theme.js') : '1.2.0';

        wp_enqueue_style('wfwc-theme-style', wfwc_theme_asset_url('style.css'), array(), $style_version);
        wp_enqueue_style('wfwc-theme-extra', $theme_uri . '/assets/css/theme.css', array('wfwc-theme-style'), $extra_version);
        wp_enqueue_style('wfwc-miauw-widget', wfwc_home_url('/miauw/widget.css'), array(), '20260610-miauby-video');
        wp_enqueue_script('wfwc-theme-script', $theme_uri . '/assets/js/theme.js', array(), $script_version, true);
        wp_enqueue_script('wfwc-miauw-widget', wfwc_home_url('/miauw/widget.js'), array(), '20260610-miauby-video', true);
        wp_add_inline_script('wfwc-theme-script', 'console.log("Wimifarma enqueue confirmou theme.js");', 'before');

        wp_localize_script(
            'wfwc-theme-script',
            'wfwcPortal',
            array(
                'restUrl'           => esc_url_raw(rest_url('wimifarma-cashback/v1/')),
                'homeUrl'           => esc_url_raw(wfwc_home_url('/cashback/')),
                'clientsUrl'        => esc_url_raw(wfwc_home_url('/cashback/dashboard.php#busca')),
                'cashbackUrl'       => esc_url_raw(wfwc_home_url('/cashback/dashboard.php#resgate')),
                'purchasesUrl'      => esc_url_raw(wfwc_home_url('/cashback/dashboard.php#resgate')),
                'reportsUrl'        => esc_url_raw(wfwc_home_url('/cashback/relatorio.php')),
                'taskBadgeUrl'      => esc_url_raw(wfwc_home_url('/tarefa/badge.php')),
                'taskBadgeInterval' => 15000,
                'cashbackPercent'   => function_exists('wfwc_get_setting') ? (float) wfwc_get_setting('cashback_percent', 5) : 5,
                'portalAuthorized'  => function_exists('wfwc_can_access_portal') ? wfwc_can_access_portal() : false,
                'expirationDays'    => function_exists('wfwc_get_setting') ? (int) wfwc_get_setting('cashback_expiration_days', 45) : 45,
            )
        );
    }
);

add_action(
    'wp_login_failed',
    static function ($username) {
        $referrer = wp_get_referer();

        if (!$referrer || false !== strpos($referrer, 'wp-login') || false !== strpos($referrer, 'wp-admin')) {
            return;
        }

        wp_safe_redirect(add_query_arg('login', 'failed', remove_query_arg('login', $referrer)));
        exit;
    }
);

add_filter(
    'authenticate',
    static function ($user, $username, $password) {
        if (!empty($username) && !empty($password)) {
            return $user;
        }

        $referrer = wp_get_referer();

        if ($referrer && false === strpos($referrer, 'wp-login') && false === strpos($referrer, 'wp-admin')) {
            wp_safe_redirect(add_query_arg('login', 'empty', remove_query_arg('login', $referrer)));
            exit;
        }

        return $user;
    },
    1,
    3
);
