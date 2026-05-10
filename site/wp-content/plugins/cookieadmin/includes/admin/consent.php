<?php

namespace CookieAdmin\Admin;

if(!defined('COOKIEADMIN_VERSION') || !defined('ABSPATH')){
	die('Hacking Attempt');
}

class Consent{
	
	static function consent_form(){
		global $cookieadmin_lang, $cookieadmin_error, $cookieadmin_msg;
		
		$view = get_option('cookieadmin_law', 'cookieadmin_gdpr');		
		$policy = cookieadmin_load_policy();
		
		$templates = implode("", cookieadmin_load_consent_template($policy[$view], $view));
		
		$cookieadmin_requires_pro = \CookieAdmin\Admin::is_feature_available(1);
		
		$icons_grid = apply_filters('cookieadmin_reconsent_icons', '', $policy[$view]);

		//Start UI
		\CookieAdmin\Admin::header_theme(__('Consent Form', 'cookieadmin'));

		echo '
		<div class="cookieadmin_consent-wrap">
			<form action="" method="post" id="consent_submenu">
			
			<div class="cookieadmin_consent-contents">
				<div class="cookieadmin_consent_settings">
					<div class="cookieadmin-contents cookieadmin_consent">
					
						<div class="cookieadmin-setting">
							<label class="cookieadmin-title" for="cookieadmin_consent_type">'.esc_html__('Consent Type', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents">
								<select name="cookieadmin_consent_type" id="cookieadmin_consent_type">
									<option name="cookieadmin_gdpr" id="cookieadmin_gdpr" '.((!empty($view) && $view === 'cookieadmin_gdpr') ? 'selected' : '').' value="cookieadmin_gdpr">'.esc_html__('GDPR', 'cookieadmin').'</option>
									<option name="cookieadmin_us" id="cookieadmin_us" '.((!empty($view) && $view === 'cookieadmin_us') ? 'selected' : '').' value="cookieadmin_us">'.esc_html__('US State Laws', 'cookieadmin').'</option>
								</select>
							</div>
						</div>
						
						<div class="cookieadmin-setting cookieadmin_consent-expiry">
							<label class="cookieadmin-title" for="cookieadmin_consent_expiry">'.esc_html__('Consent Expiry', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents">
								<input type="number" name="cookieadmin_days" id="cookieadmin_consent_expiry" style="max-width:70px;" value="'.esc_attr($policy[$view]['cookieadmin_days']).'">
							</div>
						</div>
						
						<div class="cookieadmin-setting consent-layout">
							<label class="cookieadmin-title">'.esc_html__('Notice Type', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents">
								<span>
									<input name="cookieadmin_layout" type="radio" id="cookieadmin_layout_box" value="box">
									<label class="cookieadmin-input" for="cookieadmin_layout_box">'.esc_html__('Box', 'cookieadmin').'</label>
								</span>
								<span>
									<input name="cookieadmin_layout" type="radio" id="cookieadmin_layout_footer" value="footer">
									<label class="cookieadmin-input" for="cookieadmin_layout_footer">'.esc_html__('Footer', 'cookieadmin').'</label>
								</span>
								<span>
									<input name="cookieadmin_layout" type="radio" id="cookieadmin_layout_popup"  value="popup">
									<label for="cookieadmin_layout_popup">'.esc_html__('Popup', 'cookieadmin').'</label>
								</span>
							</div>
						</div>
						
						<div class="cookieadmin-setting consent-position">
							<label class="cookieadmin-title">'.esc_html__('Notice Position', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents">
								<span>
									<input class="cookieadmin_box_layout" id="cookieadmin_position_bottom_left" name="cookieadmin_position" type="radio" value="bottom_left" checked>
									<label class="cookieadmin_box_layout cookieadmin-input" for="cookieadmin_position_bottom_left">'.esc_html__('Bottom Left', 'cookieadmin').'</label>
								</span>
								<span>
									<input class="cookieadmin_box_layout" id="cookieadmin_position_bottom_right" name="cookieadmin_position" type="radio" value="bottom_right">
									<label class="cookieadmin_box_layout cookieadmin-input" for="cookieadmin_position_bottom_right">'.esc_html__('Bottom Right', 'cookieadmin').'</label>
								</span>
								<span>
									<input class="cookieadmin_box_layout" id="cookieadmin_position_top_left" name="cookieadmin_position" type="radio" value="top_left">
									<label class="cookieadmin_box_layout cookieadmin-input" for="cookieadmin_position_top_left">'.esc_html__('Top Left', 'cookieadmin').'</label>
								</span>
								<span>
									<input class="cookieadmin_box_layout" id="cookieadmin_position_top_right" name="cookieadmin_position" type="radio" value="top_right">
									<label class="cookieadmin_box_layout cookieadmin-input" for="cookieadmin_position_top_right">'.esc_html__('Top Right', 'cookieadmin').'</label>
								</span>
								<span>
									<input class="cookieadmin_foter_layout" id="cookieadmin_position_top" name="cookieadmin_position" type="radio" value="top" style="display:none;">
									<label class="cookieadmin_foter_layout cookieadmin-input" for="cookieadmin_position_top" style="display:none;">'.esc_html__('Top', 'cookieadmin').'</label>
								</span>
								<span>
									<input class="cookieadmin_foter_layout" id="cookieadmin_position_bottom" name="cookieadmin_position" type="radio" value="bottom" style="display:none;">
									<label class="cookieadmin_foter_layout" for="cookieadmin_position_bottom" style="display:none;">'.esc_html__('Bottom', 'cookieadmin').'</label>
								</span>
							</div>
						</div>
						
						<div class="cookieadmin-setting consent-modal-layout">
							<label class="cookieadmin-title">'.esc_html__('Preference Position', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents">
								<span>
									<input id="cookieadmin_modal_center" name="cookieadmin_modal" type="radio" value="center" checked>
									<label class="cookieadmin-input" for="cookieadmin_modal_center">'.esc_html__('Center', 'cookieadmin').'</label>
								</span>
								<span>
									<input id="cookieadmin_modal_side" name="cookieadmin_modal" type="radio" value="side">
									<label class="cookieadmin-input" for="cookieadmin_modal_side">'.esc_html__('Side', 'cookieadmin').'</label>
								</span>
								<span>
									<input id="cookieadmin_modal_down" name="cookieadmin_modal" type="radio" value="down">
									<label for="cookieadmin_modal_down">'.esc_html__('Draw down', 'cookieadmin').'</label>
								</span>
							</div>
						</div>
						
						<div class="cookieadmin-setting consent-notice">
							<label class="cookieadmin-title">'.esc_html__('Notice Section', 'cookieadmin').'</label>
							<div class="cookieadmin-setting-contents cookieadmin-vertical">
								<label for="cookieadmin_notice_title_layout">'.esc_html__('Title', 'cookieadmin').'</label>
								<input type="text" id="cookieadmin_notice_title_layout" name="cookieadmin_notice_title" style="width: 52vw;" value="'.esc_attr($policy[$view]['cookieadmin_notice_title']).'">
								<label for="cookieadmin_notice_layout" style="margin-top:20px;">'.esc_html__('Notice', 'cookieadmin').'</label>
								<textarea rows="5vh" cols="100vw" id="cookieadmin_notice_layout" name="cookieadmin_notice">'.esc_html($policy[$view]['cookieadmin_notice']).'</textarea>
								<div class="cookieadmin-setting-colors cookieadmin-setting-contents cookieadmin-horizontal">
									<div class="cookieadmin-setting-colors cookieadmin-vertical" >
										<label for="cookieadmin_notice_title_color">'.esc_html__('Title', 'cookieadmin').'</label>
										<div class="cookieadmin-color-holder cookieadmin-horizontal">
											<input type="color" id="cookieadmin_notice_title_color_box" name="cookieadmin_notice_title_color_box" value="'.esc_attr($policy[$view]['cookieadmin_notice_title_color']).'">
											<input type="text" id="cookieadmin_notice_title_color" name="cookieadmin_notice_title_color" value="'.esc_attr($policy[$view]['cookieadmin_notice_title_color']).'" class="cookieadmin-color-input">
										</div>
									</div>
									<div class="cookieadmin-setting-colors cookieadmin-vertical">
										<label for="cookieadmin_notice_color">'.esc_html__('Content', 'cookieadmin').'</label>
										<div class="cookieadmin-color-holder cookieadmin-horizontal">
											<input type="color" id="cookieadmin_notice_color_box" name="cookieadmin_notice_color_box" value="'.esc_attr($policy[$view]['cookieadmin_notice_color']).'">
											<input type="text" id="cookieadmin_notice_color" name="cookieadmin_notice_color" value="'.esc_attr($policy[$view]['cookieadmin_notice_color']).'" class="cookieadmin-color-input">
										</div>
									</div>
									<div class="cookieadmin-setting-colors cookieadmin-vertical">
										<label for="cookieadmin_consent_inside_bg_color">'.esc_html__('Background', 'cookieadmin').'</label>
										<div class="cookieadmin-color-holder cookieadmin-horizontal">
											<input type="color" id="cookieadmin_consent_inside_bg_color_box" name="cookieadmin_consent_inside_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_consent_inside_bg_color']).'">
											<input type="text" id="cookieadmin_consent_inside_bg_color" name="cookieadmin_consent_inside_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_consent_inside_bg_color']).'" class="cookieadmin-color-input">
										</div>
									</div>
									<div class="cookieadmin-setting-colors cookieadmin-vertical">
										<label for="cookieadmin_consent_inside_border_color">'.esc_html__('Border', 'cookieadmin').'</label>
										<div class="cookieadmin-color-holder cookieadmin-horizontal">
											<input type="color" id="cookieadmin_consent_inside_border_color_box" name="cookieadmin_consent_inside_border_color_box" value="'.esc_attr($policy[$view]['cookieadmin_consent_inside_border_color']).'">
											<input type="text" id="cookieadmin_consent_inside_border_color" name="cookieadmin_consent_inside_border_color" value="'.esc_attr($policy[$view]['cookieadmin_consent_inside_border_color']).'" class="cookieadmin-color-input">
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="cookieadmin-setting">
						<label class="cookieadmin-title">'.esc_html__('Buttons', 'cookieadmin').'</label>
						<div class="cookieadmin-buttons cookieadmin-setting-contents cookieadmin-horizontal">
							<div class="cookieadmin-button cookieadmin-vertical">
								<input id="cookieadmin_customize_btn" name="cookieadmin_customize_btn" style="max-width:130px;text-align:center;" value="'.esc_attr($policy[$view]['cookieadmin_customize_btn']).'">
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_customize_btn_color_box" name="cookieadmin_customize_btn_color_box" value="'.esc_attr($policy[$view]['cookieadmin_customize_btn_color']).'">
									<input type="text" id="cookieadmin_customize_btn_color" name="cookieadmin_customize_btn_color" value="'.esc_attr($policy[$view]['cookieadmin_customize_btn_color']).'" class="cookieadmin-color-input">
								</div>
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_customize_btn_bg_color_box" name="cookieadmin_customize_btn_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_customize_btn_bg_color']).'">
									<input type="text" id="cookieadmin_customize_btn_bg_color" name="cookieadmin_customize_btn_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_customize_btn_bg_color']).'" class="cookieadmin-color-input">
								</div>
							</div>
							<div class="cookieadmin-button cookieadmin-vertical">
								<input id="cookieadmin_reject_btn" name="cookieadmin_reject_btn" style="max-width:130px;text-align:center;" value="'.esc_attr($policy[$view]['cookieadmin_reject_btn']).'">
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_reject_btn_color_box" name="cookieadmin_reject_btn_color_box" value="'.esc_attr($policy[$view]['cookieadmin_reject_btn_color']).'">
									<input type="text" id="cookieadmin_reject_btn_color" name="cookieadmin_reject_btn_color" value="'.esc_attr($policy[$view]['cookieadmin_reject_btn_color']).'" class="cookieadmin-color-input">
								</div>
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_reject_btn_bg_color_box" name="cookieadmin_reject_btn_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_reject_btn_bg_color']).'">
									<input type="text" id="cookieadmin_reject_btn_bg_color" name="cookieadmin_reject_btn_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_reject_btn_bg_color']).'" class="cookieadmin-color-input">
								</div>
							</div>
							<div class="cookieadmin-button cookieadmin-vertical">
								<input id="cookieadmin_accept_btn" name="cookieadmin_accept_btn" style="max-width:130px;text-align:center;" value="'.esc_attr($policy[$view]['cookieadmin_accept_btn']).'">
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_accept_btn_color_box" name="cookieadmin_accept_btn_color_box" value="'.esc_attr($policy[$view]['cookieadmin_accept_btn_color']).'">
									<input type="text" id="cookieadmin_accept_btn_color" name="cookieadmin_accept_btn_color" value="'.esc_attr($policy[$view]['cookieadmin_accept_btn_color']).'" class="cookieadmin-color-input">
								</div>
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_accept_btn_bg_color_box" name="cookieadmin_accept_btn_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_accept_btn_bg_color']).'">
									<input type="text" id="cookieadmin_accept_btn_bg_color" name="cookieadmin_accept_btn_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_accept_btn_bg_color']).'" class="cookieadmin-color-input">
								</div>
							</div>
							<div class="cookieadmin-button cookieadmin-vertical">
								<input id="cookieadmin_save_btn" name="cookieadmin_save_btn" style="max-width:130px;text-align:center;" value="'.esc_attr($policy[$view]['cookieadmin_save_btn']).'">
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_save_btn_color_box" name="cookieadmin_save_btn_color_box" value="'.esc_attr($policy[$view]['cookieadmin_save_btn_color']).'">
									<input type="text" id="cookieadmin_save_btn_color" name="cookieadmin_save_btn_color" value="'.esc_attr($policy[$view]['cookieadmin_save_btn_color']).'" class="cookieadmin-color-input">
								</div>
								<div class="cookieadmin-color-holder cookieadmin-horizontal">
									<input type="color" id="cookieadmin_save_btn_bg_color_box" name="cookieadmin_save_btn_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_save_btn_bg_color']).'">
									<input type="text" id="cookieadmin_save_btn_bg_color" name="cookieadmin_save_btn_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_save_btn_bg_color']).'" class="cookieadmin-color-input">
								</div>
							</div>
						</div>
					</div>
					<div class="cookieadmin-setting consent-preference">
						<label class="cookieadmin-title">'.esc_html__('Preference Section', 'cookieadmin').'</label>
						<div class="cookieadmin-setting-contents cookieadmin-vertical">
							<label for="cookieadmin_preference_title_layout">'.esc_html__('Title', 'cookieadmin').'</label>
							<input type="text" id="cookieadmin_preference_title_layout" name="cookieadmin_preference_title" style="width: 52vw;" value="'.esc_html($policy[$view]['cookieadmin_preference_title']).'">
							<label for="cookieadmin_preference_layout" style="margin-top:20px;">'.esc_html__('Privacy Notice', 'cookieadmin').'</label>
							<textarea rows="8vh" cols="100vw" id="cookieadmin_preference_layout" name="cookieadmin_preference">'.esc_html($policy[$view]['cookieadmin_preference']).'</textarea>
							<div class="cookieadmin-setting-colors cookieadmin-setting-contents cookieadmin-horizontal">
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_preference_title_color">'.esc_html__('Title', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_preference_title_color_box" name="cookieadmin_preference_title_color_box" value="'.esc_attr($policy[$view]['cookieadmin_preference_title_color']).'">
										<input type="text" id="cookieadmin_preference_title_color" name="cookieadmin_preference_title_color" value="'.esc_attr($policy[$view]['cookieadmin_preference_title_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_details_wrapper_color">'.esc_html__('Content', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_details_wrapper_color_box" name="cookieadmin_details_wrapper_color_box" value="'.esc_attr($policy[$view]['cookieadmin_details_wrapper_color']).'">
										<input type="text" id="cookieadmin_details_wrapper_color" name="cookieadmin_details_wrapper_color" value="'.esc_attr($policy[$view]['cookieadmin_details_wrapper_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_cookie_modal_bg_color">'.esc_html__('Background', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_cookie_modal_bg_color_box" name="cookieadmin_cookie_modal_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_cookie_modal_bg_color']).'">
										<input type="text" id="cookieadmin_cookie_modal_bg_color" name="cookieadmin_cookie_modal_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_cookie_modal_bg_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_cookie_modal_border_color">'.esc_html__('Border', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_cookie_modal_border_color_box" name="cookieadmin_cookie_modal_border_color_box" value="'.esc_attr($policy[$view]['cookieadmin_cookie_modal_border_color']).'">
										<input type="text" id="cookieadmin_cookie_modal_border_color" name="cookieadmin_cookie_modal_border_color" value="'.esc_attr($policy[$view]['cookieadmin_cookie_modal_border_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
							</div>
							
							<div class="cookieadmin-setting-colors cookieadmin-setting-contents cookieadmin-horizontal" cookieadmin-pro-only="1">
								<div class="cookieadmin-setting-color cookieadmin-vertical">
									<label for="cookieadmin_links_color">'.esc_html__('Links', 'cookieadmin').wp_kses_post($cookieadmin_requires_pro).'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_links_color_box" name="cookieadmin_links_color_box" value="'.esc_attr($policy[$view]['cookieadmin_links_color']).'">
										<input type="text" id="cookieadmin_links_color" name="cookieadmin_links_color" value="'.esc_attr($policy[$view]['cookieadmin_links_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_slider_on_bg_color">'.esc_html__('Button Switch On', 'cookieadmin').wp_kses_post($cookieadmin_requires_pro).'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_slider_on_bg_color_box" name="cookieadmin_slider_on_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_slider_on_bg_color']).'">
										<input type="text" id="cookieadmin_slider_on_bg_color" name="cookieadmin_slider_on_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_slider_on_bg_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_slider_off_bg_color">'.esc_html__('Button Switch Off', 'cookieadmin').wp_kses_post($cookieadmin_requires_pro).'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_slider_off_bg_color_box" name="cookieadmin_slider_off_bg_color_box" value="'.esc_attr($policy[$view]['cookieadmin_slider_off_bg_color']).'">
										<input type="text" id="cookieadmin_slider_off_bg_color" name="cookieadmin_slider_off_bg_color" value="'.esc_attr($policy[$view]['cookieadmin_slider_off_bg_color']).'" class="cookieadmin-color-input">
									</div>
								</div>
							</div>
							
						</div>
					</div>
					
					<div class="cookieadmin-setting reconsent">
						<label class="cookieadmin-title">'.esc_html__('Re-consent Icon', 'cookieadmin').wp_kses_post($cookieadmin_requires_pro).'</label>
						<div class="cookieadmin-setting-contents cookieadmin-vertical" cookieadmin-pro-only="1">
						
							<div class="cookieadmin-setting-contents cookieadmin-reconsent-icons-grid">
								' . wp_kses($icons_grid, cookieadmin_kses_allowed_html()) . '
								<div class="cookieadmin-custom-reconsent-url">
									<input type="text" id="cookieadmin_reconsent_img_url" name="cookieadmin_reconsent_img_url" style="width: 50vw;" placeholder="'.esc_attr__('Insert custom icon url here', 'cookieadmin').'" value="'.(!empty($policy[$view]['cookieadmin_reconsent_img_url']) ? esc_attr($policy[$view]['cookieadmin_reconsent_img_url']) : '').'">
								</div>
								<div class="cookieadmin-reconsent-file-upload">
									<input type="button" class="button button-secondary" id="cookieadmin_upload_icon_btn" value="'.esc_attr__( 'Upload Icon', 'cookieadmin' ).'">
								</div>
							</div>
							
							<div class="cookieadmin-setting-contents cookieadmin-setting-colors cookieadmin-horizontal">
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_re_consent_bg_color">'.esc_html__('Background', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_re_consent_bg_color_box" name="cookieadmin_re_consent_bg_color_box" value="'.(!empty($policy[$view]['cookieadmin_re_consent_bg_color']) ? esc_attr($policy[$view]['cookieadmin_re_consent_bg_color']) : '#374FD4').'">
										<input type="text" id="cookieadmin_re_consent_bg_color" name="cookieadmin_re_consent_bg_color" value="'.(!empty($policy[$view]['cookieadmin_re_consent_bg_color']) ? esc_attr($policy[$view]['cookieadmin_re_consent_bg_color']) : '#374FD4').'" class="cookieadmin-color-input">
									</div>
								</div>
							</div>					
						</div>
					</div>
					<div class="cookieadmin-setting">
						<label class="cookieadmin-title">'.esc_html__('Policy Links', 'cookieadmin').wp_kses_post($cookieadmin_requires_pro).'</label>
						<div class="cookieadmin-setting-contents cookieadmin-vertical cookieadmin-policy-links" cookieadmin-pro-only="1">
							<div class="cookieadmin-policy-link cookieadmin-vertical">
									<label for="cookieadmin_privacy_policy">'.esc_html__('Privacy Policy', 'cookieadmin').'</label>
									<input type="text" id="cookieadmin_privacy_policy" name="cookieadmin_privacy_policy" style="width: 61vw;" placeholder="'.__('Insert Privacy Policy link here...', 'cookieadmin').'" value="'.(!empty($policy[$view]['cookieadmin_privacy_policy']) ? esc_attr($policy[$view]['cookieadmin_privacy_policy']) : '').'">
							</div>
							<div class="cookieadmin-policy-link cookieadmin-vertical">
									<label for="cookieadmin_cookie_policy">'.esc_html__('Cookie Policy', 'cookieadmin').'</label>
									<input type="text" id="cookieadmin_cookie_policy" name="cookieadmin_cookie_policy" style="width: 61vw;" placeholder="'.__('Insert Cookie Policy link here...', 'cookieadmin').'" value="'.(!empty($policy[$view]['cookieadmin_cookie_policy']) ? esc_attr($policy[$view]['cookieadmin_cookie_policy']) : '').'">
							</div>
							
							<div class="cookieadmin-vertical">
								<label for="cookieadmin_privacy_policy_visibility">'.esc_html__('Visiblity', 'cookieadmin').'</label>
								<div class="cookieadmin-horizontal cookieadmin-privacy-policy-visibility">
									<span>
										<input type="checkbox" id="cookieadmin_privacy_policy_banner" name="cookieadmin_privacy_policy_banner" '.(!empty($policy[$view]['cookieadmin_privacy_policy_banner']) ? 'checked' : '').'>
										<label for="cookieadmin_privacy_policy_banner">'.esc_html__('Banner', 'cookieadmin').'</label>
									</span>
									<span>
										<input type="checkbox" id="cookieadmin_privacy_policy_pref" name="cookieadmin_privacy_policy_pref" '.(!empty($policy[$view]['cookieadmin_privacy_policy_pref']) ? 'checked' : '').'>
										<label for="cookieadmin_privacy_policy_pref">'.esc_html__('Preference', 'cookieadmin').'</label>
									</span>
								</div>
							</div>
							
							<div class="cookieadmin-horizontal">
								<div class="cookieadmin-setting-colors cookieadmin-vertical">
									<label for="cookieadmin_policy_link_color">'.esc_html__('Link', 'cookieadmin').'</label>
									<div class="cookieadmin-color-holder cookieadmin-horizontal">
										<input type="color" id="cookieadmin_policy_link_color_box" name="cookieadmin_policy_link_color_box" value="'.(!empty($policy[$view]['cookieadmin_policy_link_color']) ? esc_attr($policy[$view]['cookieadmin_policy_link_color']) : '').'">
										<input type="text" id="cookieadmin_policy_link_color" name="cookieadmin_policy_link_color" value="'.(!empty($policy[$view]['cookieadmin_policy_link_color']) ? esc_attr($policy[$view]['cookieadmin_policy_link_color']) : '').'" class="cookieadmin-color-input">
									</div>
								</div>
							</div>					
						</div>
					</div>
					
					<div class="cookieadmin-setting cookieadmin-save-settings">
						<div class="cookieadmin-setting-contents">
							<input type="submit" name="cookieadmin_save_settings" class="cookieadmin-btn cookieadmin-btn-primary action" value="'.esc_html__('Save Settings', 'cookieadmin').'">
							<input type="button" id="cookieadmin_show_preview" name="cookieadmin_show_preview" class="cookieadmin-btn cookieadmin-btn-secondary" value="'.esc_html__('Show Preview', 'cookieadmin').'">
						<div>
					<div>
				</div>
			</div>
			';	
			wp_nonce_field('cookieadmin_admin_nonce', 'cookieadmin_security');
			echo '<br/>
			<br/>
			</form>
		</div>';
		\CookieAdmin\Admin::footer_theme();
		
		$allowed_tags = cookieadmin_kses_allowed_html();
		echo wp_kses($templates, $allowed_tags);
	}
	
	static function save_consent_form(){
		global $cookieadmin_lang, $cookieadmin_error, $cookieadmin_msg, $cookieadmin_settings, $cookieadmin_policies;
		// debug_print_backtrace();die;
		
		check_admin_referer('cookieadmin_admin_nonce', 'cookieadmin_security');
		
		if(!current_user_can('administrator')){
			wp_send_json_error(array('message' => __('Sorry, but you do not have permissions to perform this action', 'cookieadmin')));
		}
		
		$policy = cookieadmin_load_policy();
		
		$cookieadmin_consent_type = isset( $_REQUEST['cookieadmin_consent_type'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['cookieadmin_consent_type'] ) ) : '';
		
		if(!empty($cookieadmin_consent_type)){
			
			$laws = array('cookieadmin_gdpr' => '', 'cookieadmin_us' => '');
			
			$law = array_key_exists($cookieadmin_consent_type, $laws) ? $cookieadmin_consent_type : 'cookieadmin_gdpr';
			
			if(empty($cookieadmin_error)){
				update_option('cookieadmin_law', $law);
			}
		}
		
		$setting['cookieadmin_geo_tgt'] = (!empty($_REQUEST['cookieadmin_geo_tgt'])) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_geo_tgt'])) : 'www';
		
		$setting['cookieadmin_layout'] = (!empty($_REQUEST['cookieadmin_layout']) && in_array($_REQUEST['cookieadmin_layout'], array('box', 'footer', 'popup'))) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_layout'])) : (!empty($policy[$law]['cookieadmin_layout']) ? $policy[$law]['cookieadmin_layout'] : 'box');
		
		$setting['cookieadmin_position'] = (!empty($_REQUEST['cookieadmin_position']) && in_array($_REQUEST['cookieadmin_position'],  array('bottom_left', 'bottom_right', 'top_left', 'top_right', 'top', 'bottom'))) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_position'])) : (!empty($policy[$law]['cookieadmin_position']) ? $policy[$law]['cookieadmin_position'] : 'bottom_left');

		$setting['cookieadmin_modal'] = (isset($_REQUEST['cookieadmin_modal']) && in_array($_REQUEST['cookieadmin_modal'], array('center', 'side', 'down'))) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_modal'])) : (!empty($policy[$law]['cookieadmin_modal']) ? $policy[$law]['cookieadmin_modal'] : 'center');
		
		if($setting['cookieadmin_layout'] == 'popup'){
			$setting['cookieadmin_modal'] = 'center';
			unset($setting['cookieadmin_position']);
		}		

		$setting['cookieadmin_notice_title'] = !empty($_REQUEST['cookieadmin_notice_title']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_notice_title'])) : $policy[$law]['cookieadmin_notice_title'];
		$setting['cookieadmin_notice_title_color'] = !empty($_REQUEST['cookieadmin_notice_title_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_notice_title_color'])) : (!empty($policy[$law]['cookieadmin_notice_title_color']) ? $policy[$law]['cookieadmin_notice_title_color'] : '#000000');
		
		$setting['cookieadmin_notice'] = !empty($_REQUEST['cookieadmin_notice']) ? wp_kses(wp_unslash($_REQUEST['cookieadmin_notice']), cookieadmin_kses_allowed_html()) : $policy[$law]['cookieadmin_notice'];
		$setting['cookieadmin_notice_color'] = !empty($_REQUEST['cookieadmin_notice_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_notice_color'])) : (!empty($policy[$law]['cookieadmin_notice_color']) ? $policy[$law]['cookieadmin_notice_color'] : '#000000');
		
		$setting['cookieadmin_consent_inside_bg_color'] = !empty($_REQUEST['cookieadmin_consent_inside_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_consent_inside_bg_color'])) : (!empty($policy[$law]['cookieadmin_consent_inside_bg_color']) ? $policy[$law]['cookieadmin_consent_inside_bg_color'] : '#ffffff');
		$setting['cookieadmin_consent_inside_border_color'] = !empty($_REQUEST['cookieadmin_consent_inside_border_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_consent_inside_border_color'])) : (!empty($policy[$law]['cookieadmin_consent_inside_border_color']) ? $policy[$law]['cookieadmin_consent_inside_border_color'] : '#000000');
		
		$setting['cookieadmin_customize_btn'] = !empty($_REQUEST['cookieadmin_customize_btn']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_customize_btn'])) : (!empty($policy[$law]['cookieadmin_customize_btn']) ? $policy[$law]['cookieadmin_customize_btn'] : 'Customize');
		$setting['cookieadmin_customize_btn_color'] = !empty($_REQUEST['cookieadmin_customize_btn_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_customize_btn_color'])) : (!empty($policy[$law]['cookieadmin_customize_btn_color']) ? $policy[$law]['cookieadmin_customize_btn_color'] : '#ffffff');
		$setting['cookieadmin_customize_btn_bg_color'] = !empty($_REQUEST['cookieadmin_customize_btn_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_customize_btn_bg_color'])) : (!empty($policy[$law]['cookieadmin_customize_btn_bg_color']) ? $policy[$law]['cookieadmin_customize_btn_bg_color'] : '#0000ff');
		
		$setting['cookieadmin_reject_btn'] = !empty($_REQUEST['cookieadmin_reject_btn']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_reject_btn'])) : (!empty($policy[$law]['cookieadmin_reject_btn']) ? $policy[$law]['cookieadmin_reject_btn'] : 'Reject All');
		$setting['cookieadmin_reject_btn_color'] = !empty($_REQUEST['cookieadmin_reject_btn_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_reject_btn_color'])) : (!empty($policy[$law]['cookieadmin_reject_btn_color']) ? $policy[$law]['cookieadmin_reject_btn_color'] : '#ffffff');
		$setting['cookieadmin_reject_btn_bg_color'] = !empty($_REQUEST['cookieadmin_reject_btn_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_reject_btn_bg_color'])) : (!empty($policy[$law]['cookieadmin_reject_btn_bg_color']) ? $policy[$law]['cookieadmin_reject_btn_bg_color'] : '#ff0000');

		$setting['cookieadmin_accept_btn'] = !empty($_REQUEST['cookieadmin_accept_btn']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_accept_btn'])) : (!empty($policy[$law]['cookieadmin_accept_btn']) ? $policy[$law]['cookieadmin_accept_btn'] : 'Accept All');
		$setting['cookieadmin_accept_btn_color'] = !empty($_REQUEST['cookieadmin_accept_btn_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_accept_btn_color'])) : (!empty($policy[$law]['cookieadmin_accept_btn']) ? $policy[$law]['cookieadmin_accept_btn_color'] : '#ffffff');
		$setting['cookieadmin_accept_btn_bg_color'] = !empty($_REQUEST['cookieadmin_accept_btn_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_accept_btn_bg_color'])) : (!empty($policy[$law]['cookieadmin_accept_btn_bg_color']) ? $policy[$law]['cookieadmin_accept_btn_bg_color'] : '#00ff00');

		$setting['cookieadmin_save_btn'] = !empty($_REQUEST['cookieadmin_save_btn']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_save_btn'])) : (!empty($policy[$law]['cookieadmin_save_btn']) ? $policy[$law]['cookieadmin_save_btn'] : 'Save Preferences');
		$setting['cookieadmin_save_btn_color'] = !empty($_REQUEST['cookieadmin_save_btn_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_save_btn_color'])) : (!empty($policy[$law]['cookieadmin_save_btn_color']) ? $policy[$law]['cookieadmin_save_btn_color'] : '#ffffff');
		$setting['cookieadmin_save_btn_bg_color'] = !empty($_REQUEST['cookieadmin_save_btn_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_save_btn_bg_color'])) : (!empty($policy[$law]['cookieadmin_save_btn_bg_color']) ? $policy[$law]['cookieadmin_save_btn_bg_color'] : '#183833');

		$setting['cookieadmin_preference_title'] = !empty($_REQUEST['cookieadmin_preference_title']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_preference_title'])) : $policy[$law]['cookieadmin_preference_title'];
		$setting['cookieadmin_preference_title_color'] = !empty($_REQUEST['cookieadmin_preference_title_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_preference_title_color'])) : (!empty($policy[$law]['cookieadmin_preference_title_color']) ? $policy[$law]['cookieadmin_preference_title_color'] : '#000000');
		
		$setting['cookieadmin_preference'] = !empty($_REQUEST['cookieadmin_preference']) ? wp_kses(wp_unslash($_REQUEST['cookieadmin_preference']), cookieadmin_kses_allowed_html()) : $policy[$law]['cookieadmin_preference'];
		$setting['cookieadmin_details_wrapper_color'] = !empty($_REQUEST['cookieadmin_details_wrapper_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_details_wrapper_color'])) : (!empty($policy[$law]['cookieadmin_details_wrapper_color']) ? $policy[$law]['cookieadmin_details_wrapper_color'] : '#000000');
		
		$setting['cookieadmin_cookie_modal_bg_color'] = !empty($_REQUEST['cookieadmin_cookie_modal_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_cookie_modal_bg_color'])) : (!empty($policy[$law]['cookieadmin_cookie_modal_bg_color']) ? $policy[$law]['cookieadmin_cookie_modal_bg_color'] : '#ffffff');
		$setting['cookieadmin_cookie_modal_border_color'] = !empty($_REQUEST['cookieadmin_cookie_modal_border_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_cookie_modal_border_color'])) : (!empty($policy[$law]['cookieadmin_cookie_modal_border_color']) ? $policy[$law]['cookieadmin_cookie_modal_border_color'] : '#000000');

		$setting['cookieadmin_slider_off_bg_color'] = !empty($_REQUEST['cookieadmin_slider_off_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_slider_off_bg_color'])) : (!empty($policy[$law]['cookieadmin_slider_off_bg_color']) ? $policy[$law]['cookieadmin_slider_off_bg_color'] : '#808080');
		$setting['cookieadmin_slider_on_bg_color'] = !empty($_REQUEST['cookieadmin_slider_on_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_slider_on_bg_color'])) : (!empty($policy[$law]['cookieadmin_slider_on_bg_color']) ? $policy[$law]['cookieadmin_slider_on_bg_color'] : '#3582c4');
		$setting['cookieadmin_links_color'] = !empty($_REQUEST['cookieadmin_links_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_links_color'])) : (!empty($policy[$law]['cookieadmin_links_color']) ? $policy[$law]['cookieadmin_links_color'] : '#1863dc');
		
		// Set Reconsent Icons 
		$setting['cookieadmin_reconsent_icon'] = !empty($_REQUEST['cookieadmin_reconsent_icon']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_reconsent_icon'])) : '';
		$setting['cookieadmin_reconsent_img_url'] = !empty($_REQUEST['cookieadmin_reconsent_img_url']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_reconsent_img_url'])) : '';
		$setting['cookieadmin_re_consent_bg_color'] = !empty($_REQUEST['cookieadmin_re_consent_bg_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_re_consent_bg_color'])) : (!empty($policy[$law]['cookieadmin_re_consent_bg_color']) ? $policy[$law]['cookieadmin_re_consent_bg_color'] : '#374FD4');

		// Set Policy Links
		$setting['cookieadmin_privacy_policy'] = !empty($_REQUEST['cookieadmin_privacy_policy']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_privacy_policy'])) : '';
		$setting['cookieadmin_cookie_policy'] = !empty($_REQUEST['cookieadmin_cookie_policy']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_cookie_policy'])) : '';
		$setting['cookieadmin_privacy_policy_banner'] = !empty($_REQUEST['cookieadmin_privacy_policy_banner']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_privacy_policy_banner'])) : 0;
		$setting['cookieadmin_privacy_policy_pref'] = !empty($_REQUEST['cookieadmin_privacy_policy_pref']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_privacy_policy_pref'])) : 0;
		$setting['cookieadmin_policy_link_color'] = !empty($_REQUEST['cookieadmin_policy_link_color']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_policy_link_color'])) : '#cbba8d';
		
		$setting['cookieadmin_days'] = !empty($_REQUEST['cookieadmin_days']) ? sanitize_text_field(wp_unslash($_REQUEST['cookieadmin_days'])) : (!empty($policy[$law]['cookieadmin_days']) ? $policy[$law]['cookieadmin_days'] : '365');
		
		$policy[$law] = $setting;
		
		// Check for certain fields to be saved only if their values is not the same as default
		$cookieadmin_check_changes = array('cookieadmin_notice_title', 'cookieadmin_notice', 'cookieadmin_preference_title', 'cookieadmin_preference', 'reConsent_title', 'cookieadmin_customize_btn', 'cookieadmin_reject_btn', 'cookieadmin_accept_btn', 'cookieadmin_save_btn');
		
		foreach($cookieadmin_check_changes as $c_field){
			foreach($policy as $c_law => $c_val){
				if(!empty($c_val[$c_field]) && $c_val[$c_field] == $cookieadmin_policies[$c_law][$c_field]){
					unset($policy[$c_law][$c_field]);
				}
			}
		}
		
		update_option('cookieadmin_consent_settings', $policy);
		
		if(empty($cookieadmin_error)){
			$cookieadmin_msg = __('Settings saved successfully', 'cookieadmin');
		}
	}
}