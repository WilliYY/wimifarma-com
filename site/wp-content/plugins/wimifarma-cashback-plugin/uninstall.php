<?php
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

$tables = array(
    $wpdb->prefix . 'wfwc_cashback_usages',
    $wpdb->prefix . 'wfwc_cashback_credits',
    $wpdb->prefix . 'wfwc_purchases',
    $wpdb->prefix . 'wfwc_clients',
    $wpdb->prefix . 'wfwc_attendants',
    $wpdb->prefix . 'wfwc_logs',
);

foreach ($tables as $table) {
    $wpdb->query("DROP TABLE IF EXISTS {$table}");
}

delete_option('wfwc_settings');
delete_option('wfwc_db_version');

$roles = array('wimifarma_gerente', 'wimifarma_atendente');

foreach ($roles as $role_name) {
    remove_role($role_name);
}

$capabilities = array(
    'view_wimifarma_cashback',
    'manage_wimifarma_cashback',
    'manage_wimifarma_cashback_settings',
    'view_wimifarma_cashback_reports',
    'view_wimifarma_cashback_logs',
);

$administrator = get_role('administrator');

if ($administrator) {
    foreach ($capabilities as $capability) {
        $administrator->remove_cap($capability);
    }
}

$timestamp = wp_next_scheduled('wfwc_daily_cron');

while ($timestamp) {
    wp_unschedule_event($timestamp, 'wfwc_daily_cron');
    $timestamp = wp_next_scheduled('wfwc_daily_cron');
}
