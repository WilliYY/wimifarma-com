<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="<?php echo esc_url(wfwc_theme_asset_url('assets/img/favicon.svg')); ?>">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<header class="site-header">
    <div class="wfwc-theme-shell">
        <a class="wfwc-site-brand" href="<?php echo esc_url(wfwc_home_url('/')); ?>" aria-label="Wimifarma">
            <img src="<?php echo esc_url(wfwc_theme_asset_url('assets/img/logo-wimifarma-official.svg')); ?>" alt="Wimifarma">
        </a>
    </div>
</header>
