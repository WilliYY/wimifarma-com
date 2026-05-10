<?php
/**
 * Fired when the plugin is uninstalled.
 */

// If uninstall not called from WordPress, then exit
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

if ( is_multisite() ) {

	$blogs = $wpdb->get_results( "SELECT blog_id FROM {$wpdb->blogs}", ARRAY_A );
	delete_site_option( 'wps_limit_lockout_notify' );
	delete_site_option( 'wps_limit_login_show_credit_link' );
	delete_site_option( 'wps_limit_login_allow_local_options' );
	delete_site_option( 'wps_limit_login_use_local_options' );
	delete_site_option( 'wps_limit_login_allowed_retries' );
	delete_site_option( 'wps_limit_login_lockout_duration' );
	delete_site_option( 'wps_limit_login_valid_duration' );
	delete_site_option( 'wps_limit_login_allowed_lockouts' );
	delete_site_option( 'wps_limit_login_long_duration' );
	delete_site_option( 'wps_limit_login_notify_email_after' );
	delete_site_option( 'wps_limit_login_whitelist' );
	delete_site_option( 'wps_limit_login_blacklist' );
	delete_site_option( 'wps_limit_login_retries' );
	delete_site_option( 'wps_limit_login_retries_valid' );
	delete_site_option( 'wps_limit_login_logged' );
	delete_site_option( 'wps_limit_lockouts_total' );
	delete_site_option( 'wps_limit_login_lockouts' );

	if ( $blogs ) {

		foreach ( $blogs as $blog ) {
			switch_to_blog( $blog['blog_id'] );
			delete_option( 'wps_limit_lockout_notify' );
			delete_option( 'wps_limit_login_show_credit_link' );
			delete_option( 'wps_limit_login_allow_local_options' );
			delete_option( 'wps_limit_login_use_local_options' );
			delete_option( 'wps_limit_login_allowed_retries' );
			delete_option( 'wps_limit_login_lockout_duration' );
			delete_option( 'wps_limit_login_valid_duration' );
			delete_option( 'wps_limit_login_allowed_lockouts' );
			delete_option( 'wps_limit_login_long_duration' );
			delete_option( 'wps_limit_login_notify_email_after' );
			delete_option( 'wps_limit_login_whitelist' );
			delete_option( 'wps_limit_login_blacklist' );
			delete_option( 'wps_limit_login_retries' );
			delete_option( 'wps_limit_login_retries_valid' );
			delete_option( 'wps_limit_login_logged' );
			delete_option( 'wps_limit_lockouts_total' );
			delete_option( 'wps_limit_login_lockouts' );

			//info: optimize table
			$GLOBALS['wpdb']->query( "OPTIMIZE TABLE `" . $GLOBALS['wpdb']->prefix . "options`" );
			restore_current_blog();
		}
	}

} else {
	delete_option( 'wps_limit_lockout_notify' );
	delete_option( 'wps_limit_login_show_credit_link' );
	delete_option( 'wps_limit_login_allow_local_options' );
	delete_option( 'wps_limit_login_use_local_options' );
	delete_option( 'wps_limit_login_allowed_retries' );
	delete_option( 'wps_limit_login_lockout_duration' );
	delete_option( 'wps_limit_login_valid_duration' );
	delete_option( 'wps_limit_login_allowed_lockouts' );
	delete_option( 'wps_limit_login_long_duration' );
	delete_option( 'wps_limit_login_notify_email_after' );
	delete_option( 'wps_limit_login_whitelist' );
	delete_option( 'wps_limit_login_blacklist' );
	delete_option( 'wps_limit_login_retries' );
	delete_option( 'wps_limit_login_retries_valid' );
	delete_option( 'wps_limit_login_logged' );
	delete_option( 'wps_limit_lockouts_total' );
	delete_option( 'wps_limit_login_lockouts' );

	//info: optimize table
	$GLOBALS['wpdb']->query( "OPTIMIZE TABLE `" . $GLOBALS['wpdb']->prefix . "options`" );
}