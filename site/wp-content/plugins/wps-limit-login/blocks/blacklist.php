<?php

if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}

$wps_limit_login_black_list_ips = $this->get_option( 'wps_limit_login_blacklist' );
$wps_limit_login_black_list_ips = ( is_array( $wps_limit_login_black_list_ips ) && ! empty( $wps_limit_login_black_list_ips ) ) ? implode( "\n", $wps_limit_login_black_list_ips ) : ''; ?>
<form action="<?php echo $this->get_wps_limit_login_options_page_uri() . '&tab=blacklist'; ?>" method="post">
	<?php wp_nonce_field( 'wps-limit-login-settings' ); ?>

    <div class="h2"><?php _e( 'Blacklist', 'wps-limit-login' ); ?></div>
    <p><?php _e( 'Defines a list of IP addresses for which you want to completely block access to the login page.', 'wps-limit-login' ); ?></p>
    <p class="description"><?php _e( 'One IP range (88.88.88.86/90) or IP(88.88.88.86) per line', 'wps-limit-login' ); ?></p>
    <textarea name="wps_limit_login_blacklist_ips" rows="10" cols="50"
              placeholder="88.88.88.86&#x0a;88.88.88.90&#x0a;&#x0a;ou une plage&#x0a;88.88.88.86/90&#x0a;<?php _e( 'which will block all ip between 88.88.88.86 and 88.88.88.90', 'wps-limit-login' ); ?>"><?php echo $wps_limit_login_black_list_ips; ?></textarea>

    <p class="submit">
        <button type="submit" name="update_options" id="submit" class="button button-primary btn-wps wps-save"><?php _e( 'Save' ); ?></button>
    </p>
</form>