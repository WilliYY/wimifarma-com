<?php

if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}

$wps_limit_lockout_notify = explode( ',', $this->get_option( 'wps_limit_lockout_notify' ) );
$email_checked            = in_array( 'email', $wps_limit_lockout_notify ) ? ' checked ' : '';

$wps_limit_login_show_credit_link = $this->get_option( 'wps_limit_login_show_credit_link' );
$show_credit_link                 = '';
if ( 'true' == $wps_limit_login_show_credit_link || '1' == $wps_limit_login_show_credit_link ) {
	$show_credit_link = 'checked';
} ?>
<div class="h2"><?php _e( 'Configuration', 'wps-limit-login' ); ?></div>
<form action="<?php echo $this->get_wps_limit_login_options_page_uri(); ?>" method="post">
	<?php wp_nonce_field( 'wps-limit-login-settings' ); ?>
	<?php if ( is_network_admin() ) : ?>
        <p>
            <input type="checkbox"
	       name="allow_local_options" <?php echo $this->get_option( 'wps_limit_login_allow_local_options' ) ? 'checked' : '' ?>
                   value="1"/> <?php esc_html_e( 'Let network sites use their own settings', 'wps-limit-login' ); ?></p>
		<p class="description"><?php esc_html_e( 'If disabled, the global settings will be forcibly applied to the entire network.', 'wps-limit-login' ) ?></p>
	<?php elseif ( $this->network_mode ): ?>
        <p><input type="checkbox"
	       name="use_global_options" <?php echo $this->get_option( 'wps_limit_login_use_local_options' ) ? '' : 'checked' ?>
                  value="1" class="use_global_options"/> <?php _e( 'Use global settings', 'wps-limit-login' ); ?></p>
		<script>
            jQuery(function ($) {
                var first = true;
                $('.use_global_options').change(function () {
                    var form = $(this).siblings('table');
                    form.stop();

                    if (this.checked)
                        first ? form.hide() : form.fadeOut();
                    else
                        first ? form.show() : form.fadeIn();

                    first = false;
                }).change();
            });
		</script>
	<?php endif ?>

	<p>
        <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_allowed_retries' ) ); ?>"
	       name="allowed_retries"/> <?php _e( 'allowed retries', 'wps-limit-login' ); ?> <?php _e( 'for a period of', 'wps-limit-login' ); ?>
	    <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_lockout_duration' ) / 60 ); ?>"
	       name="lockout_duration"/> <?php _e( 'minutes', 'wps-limit-login' ); ?>
	</p>
    <p>
        <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_valid_duration' ) / 3600 ); ?>"
               name="valid_duration"/> <?php _e( 'hours until retries are reset', 'wps-limit-login' ); ?>
    </p>
    <p>
	    <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_allowed_lockouts' ) ); ?>"
	       name="allowed_lockouts"/> <?php _e( 'lockouts increase lockout time to', 'wps-limit-login' ); ?>
	    <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_long_duration' ) / 3600 ); ?>"
	       name="long_duration"/> <?php _e( 'hours', 'wps-limit-login' ); ?>
    </p>
	<p>
        <input type="checkbox" name="lockout_notify_email" id="lockout_notify_email" <?php echo $email_checked; ?>
	       value="email"/> <label
		for="lockout_notify_email"><?php _e( 'Email to admin after', 'wps-limit-login' ); ?></label>
	    <input type="number" value="<?php echo( $this->get_option( 'wps_limit_login_notify_email_after' ) ); ?>"
	       name="notify_email_after"/> <?php _e( 'lockouts', 'wps-limit-login' ); ?>
    </p>
    <div class="wps-credit">
        <div class="h2"><?php _e( 'Show Credit Link?', 'wps-limit-login' ); ?></div>
        <p><?php _e( 'By default, WPS Limit Login will display the following message on the login form:', 'wps-limit-login' ); ?></p>
        <blockquote>
            <?php _e( 'Login form protected by', 'wps-limit-login' ); ?>
            <a href="https://wordpress.org/plugins/wps-limit-login/" target="_blank">WPS Limit Login</a>
        </blockquote>
        <?php _e( 'This helps others know about the plugin so they can protect their blogs as well if they like. However, you can disable this message if you prefer.', 'wps-limit-login' ); ?>
        <p>
            <input type="checkbox" name="show_credit_link" id="show_credit_link" <?php echo $show_credit_link; ?>
                  value="true"/> <label
                for="show_credit_link"><?php _e( 'Show credit link', 'wps-limit-login' ); ?></label>
        </p>
    </div>
    <p class="submit">
        <button type="submit" name="update_options" id="submit" class="button button-primary btn-wps wps-save"><?php _e( 'Save' ); ?></button>

        <a href="<?php echo add_query_arg( 'action', 'reinitialize', wp_nonce_url( admin_url( 'options-general.php?page=wps-limit-login' ), 'reinitialize', 'nonce' ) ); ?>"
           class="button btn-wps wps-reinit"><?php _e( 'Reset the original settings', 'wps-limit-login' ); ?></a>
    </p>
</form>