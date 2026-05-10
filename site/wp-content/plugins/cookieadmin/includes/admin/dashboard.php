<?php

namespace CookieAdmin\Admin;

if(!defined('COOKIEADMIN_VERSION') || !defined('ABSPATH')){
	die('Hacking Attempt');
}

class Dashboard{
	
	static function dashboard(){
		
		global $cookieadmin_lang, $cookieadmin_error, $cookieadmin_msg, $cookieadmin_settings;
		
		\CookieAdmin\Admin::header_theme(__('Dashboard', 'cookieadmin'));
		
		$view = get_option('cookieadmin_law', 'cookieadmin_gdpr');
		
		echo '
		<div class="cookieadmin_consent-wrap">
			<div class="cookieadmin-admin-row">
				<div class="cookieadmin-stats-block cookieadmin-is-block-25">
					<div class="cookieadmin-stats-name">'.esc_html__('Consent Banner', 'cookieadmin').'</div>
					<div class="cookieadmin-stats-number cookieadmin-green">'.esc_html__('Enabled', 'cookieadmin').'</div>
				</div>
				
				<div class="cookieadmin-stats-block cookieadmin-is-block-25">
					<div class="cookieadmin-stats-name">'.esc_html__('Consent Type', 'cookieadmin').'&nbsp;
						<div class="cookieadmin-block-link"><a href="'.esc_url(admin_url('admin.php?page=cookieadmin-consent')).'">['.esc_html__('Edit', 'cookieadmin').']</a></div>
					</div>
					<div class="cookieadmin-stats-number cookieadmin-uppercase">'.(!empty($view) && $view == 'cookieadmin_us' ? esc_html__('US State Laws', 'cookieadmin') : esc_html__('GDPR', 'cookieadmin')).'</div>
				</div>
				
				<div class="cookieadmin-stats-block cookieadmin-is-block-25">
					<div class="cookieadmin-stats-name">'.esc_html__('Google Consent Mode v2', 'cookieadmin').'&nbsp;
						<div class="cookieadmin-block-link"><a href="'.esc_url(admin_url('admin.php?page=cookieadmin-settings')).'">['.esc_html__('Edit', 'cookieadmin').']</a></div>
					</div>
					'.(!empty($cookieadmin_settings['google_consent_mode_v2']) ? '<div class="cookieadmin-stats-number cookieadmin-green">'.esc_html__('Enabled', 'cookieadmin').'</div>' : '<div class="cookieadmin-stats-number">'.esc_html__('Disabled', 'cookieadmin').'</div>').'
				</div>
				
				<div class="cookieadmin-stats-block cookieadmin-is-block-25">
					<div class="cookieadmin-stats-name">'.esc_html__('Auto Scan', 'cookieadmin').'&nbsp;
						<div class="cookieadmin-block-link"><a href="'.esc_url(admin_url('admin.php?page=cookieadmin-settings')).'">['.esc_html__('Edit', 'cookieadmin').']</a></div>
					</div>
					'.(!empty($cookieadmin_settings['cookieadmin_auto_scan']) ? '<div class="cookieadmin-stats-number cookieadmin-green">'.esc_html__('Enabled', 'cookieadmin').'</div>' : '<div class="cookieadmin-stats-number">'.esc_html__('Disabled', 'cookieadmin').'</div>').'
				</div>
				
				<div style="width:25%">
					
				</div>
			</div>
		</div>';
		
		\CookieAdmin\Admin::footer_theme();
	}
}