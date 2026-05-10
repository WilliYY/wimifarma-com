<?php
if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}
$wps_limit_login_white_list_ips = $this->get_option( 'wps_limit_login_whitelist' );
$wps_limit_login_white_list_ips = ( is_array( $wps_limit_login_white_list_ips ) && ! empty( $wps_limit_login_white_list_ips ) ) ? implode( "\n", $wps_limit_login_white_list_ips ) : '';

if ( isset( $_SERVER['REMOTE_ADDR'] ) ) {
	$ip = $_SERVER['REMOTE_ADDR'];
} ?>
<form action="<?php echo $this->get_wps_limit_login_options_page_uri() . '&tab=whitelist'; ?>" method="post">
	<?php wp_nonce_field( 'wps-limit-login-settings' ); ?>

    <div class="h2"><?php _e( 'Whitelist', 'wps-limit-login' ); ?></div>
    <p><?php _e( 'Sets a list of IP addresses that will have no attempt limit and will never be blocked. Be careful, you must put trusted IP addresses (example: the IP address of your home), you must never put the IP address of a public network (Internet cafe or other).', 'wps-limit-login' ); ?></p>
        <p><span class="wps-ip"><?php echo sprintf( __( 'Add your IP address (%s) to a whitelist.', 'wps-limit-login' ), esc_html( $ip ) ); ?></span></p>
    <p class="description"><?php _e( 'One IP range (88.88.88.86/90) or IP(88.88.88.86) per line', 'wps-limit-login' ); ?></p>
    <textarea name="wps_limit_login_whitelist_ips" id="wps_limit_login_whitelist_ips" rows="10" cols="50"
              placeholder="88.88.88.86&#x0a;88.88.88.90&#x0a;&#x0a;ou une plage&#x0a;88.88.88.86/90&#x0a;<?php _e( 'which will add all ip between 88.88.88.86 and 88.88.88.90 in the whitelist', 'wps-limit-login' ); ?>"><?php echo $wps_limit_login_white_list_ips; ?></textarea>

    <p class="submit">
        <button type="submit" name="update_options" id="submit" class="button button-primary btn-wps wps-save"><?php _e( 'Save' ); ?></button>
        <button class="button button-primary btn-wps wps-addip" data-ip="<?php esc_html_e( $ip ); ?>">Ajouter mon IP : <?php esc_html_e( $ip ); ?></button>
    </p>

    <script>
        jQuery(function ($) {
            $('.wps-addip').on( 'click', function ( event ) {
                event.preventDefault();
                $("#wps_limit_login_whitelist_ips").append('\n');
                $("#wps_limit_login_whitelist_ips").append( $(this).data('ip') );
            });
        });
    </script>
</form>