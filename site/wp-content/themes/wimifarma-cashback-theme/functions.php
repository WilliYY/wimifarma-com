<?php
if (!defined('ABSPATH')) {
    exit;
}

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
        $theme_uri = get_template_directory_uri();

        $style_version = file_exists($theme_dir . '/style.css') ? (string) filemtime($theme_dir . '/style.css') : '1.2.0';
        $extra_version = file_exists($theme_dir . '/assets/css/theme.css') ? (string) filemtime($theme_dir . '/assets/css/theme.css') : '1.2.0';
        $script_version = file_exists($theme_dir . '/assets/js/theme.js') ? (string) filemtime($theme_dir . '/assets/js/theme.js') : '1.2.0';

        wp_enqueue_style('wfwc-theme-style', get_stylesheet_uri(), array(), $style_version);
        wp_enqueue_style('wfwc-theme-extra', $theme_uri . '/assets/css/theme.css', array('wfwc-theme-style'), $extra_version);
        wp_enqueue_style('wfwc-miauw-widget', home_url('/miauw/widget.css'), array(), '20260506a');
        wp_enqueue_script('wfwc-theme-script', $theme_uri . '/assets/js/theme.js', array(), $script_version, true);
        wp_enqueue_script('wfwc-miauw-widget', home_url('/miauw/widget.js'), array(), '20260506a', true);
        wp_add_inline_script('wfwc-theme-script', 'console.log("Wimifarma enqueue confirmou theme.js");', 'before');

        wp_localize_script(
            'wfwc-theme-script',
            'wfwcPortal',
            array(
                'restUrl'           => esc_url_raw(rest_url('wimifarma-cashback/v1/')),
                'homeUrl'           => esc_url_raw(home_url('/cashback/')),
                'clientsUrl'        => esc_url_raw(home_url('/cashback/dashboard.php#busca')),
                'cashbackUrl'       => esc_url_raw(home_url('/cashback/dashboard.php#resgate')),
                'purchasesUrl'      => esc_url_raw(home_url('/cashback/dashboard.php#resgate')),
                'reportsUrl'        => esc_url_raw(home_url('/cashback/relatorio.php')),
                'taskBadgeUrl'      => esc_url_raw(home_url('/tarefa/badge.php')),
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
