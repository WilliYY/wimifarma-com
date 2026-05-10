<?php

if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}

$wps_limit_lockouts_total = $this->get_option( 'wps_limit_lockouts_total', 0 );
$lockouts                 = $this->get_option( 'wps_limit_login_lockouts' );
$lockouts_now             = is_array( $lockouts ) ? count( $lockouts ) : 0; ?>

<div class="h2"><?php _e( 'Statistics', 'wps-limit-login' ); ?></div>
<form action="<?php echo $this->get_wps_limit_login_options_page_uri() . '&tab=log'; ?>" method="post">
	<?php
    wp_nonce_field( 'wps-limit-login-settings' );
    if ( $wps_limit_lockouts_total > 0 ) : ?>
        <p>
            <?php printf( _n( '%d lockout since last reset', '%d lockouts since last reset', $wps_limit_lockouts_total, 'wps-limit-login' ), $wps_limit_lockouts_total ); ?>
        </p>
        <?php
    else :
        echo '<p>' . __( 'No lockouts yet', 'wps-limit-login' ) . '</p>';
    endif;
    if ( $lockouts_now > 0 ) : ?>
        <p>
            <?php printf( _n( '%d IP is currently blocked from trying to log in', '%d IP are currently blocked from trying to log in', $lockouts_now, 'wps-limit-login' ), $lockouts_now ); ?><br />
        </p>
        <?php
    endif;
    if ( $wps_limit_lockouts_total > 0 ) : ?>
        <button class="button btn-wps wps-reinit" name="reset_total" type="submit"><?php _e( 'Reset Counter', 'wps-limit-login' ) . ' (' . $wps_limit_lockouts_total . ')'; ?></button>
        <?php
    endif;
    if ( $lockouts_now > 0 ) : ?>
        <button class="button btn-wps wps-reset-lockouts" name="reset_current" type="submit"><?php _e( 'Restore Lockouts', 'wps-limit-login' ) . ' (' . $lockouts_now . ')'; ?></button
        <?php
    endif; ?>
</form>
<?php
$log = $this->get_option( 'wps_limit_login_logged' );
$log = \WPS\WPS_Limit_Login\Plugin::sorted_log_by_date( $log );

$lockouts = (array) $this->get_option( 'wps_limit_login_lockouts' ); ?>
<div class="wps-credit">
    <div class="h2" id="wps_lockout_log"><?php _e( 'Lockout log', 'wps-limit-login' ); ?></div>
	<?php if ( is_array( $log ) && ! empty( $log ) ) : ?>
        <p><?php _e( 'You can unlock an IP address individually (by clicking on "Unlock" red button).', 'wps-limit-login' ); ?></p>
    <?php else : ?>
        <p><?php _e( 'No lockouts yet', 'wps-limit-login' ); ?></p>
    <?php endif; ?>
</div>

<?php if ( is_array( $log ) && ! empty( $log ) ) : ?>
    <form action="<?php echo $this->get_wps_limit_login_options_page_uri() . '&tab=log'; ?>" method="post">
        <?php wp_nonce_field( 'wps-limit-login-settings' ); ?>
        <input type="hidden" value="true" name="clear_log"/>
        <p class="submit">
            <button class="button btn-wps wps-clear" name="submit" type="submit"><?php _e( 'Clear Log', 'wps-limit-login' ); ?></button>
        </p>
    </form>

    <div class="wps-limit-login-log">
        <table class="form-table">
            <tr class="hide-mobile">
                <th scope="col"><?php _e( 'Date', 'wps-limit-login' ); ?></th>
                <th scope="col"><?php _ex( 'IP', "Internet address", 'wps-limit-login' ); ?></th>
                <th scope="col"><?php _e( 'Users' ); ?></th>
                <th scope="col"><?php _e( 'Gateway', 'wps-limit-login' ); ?></th>
                <th>
            </tr>

            <?php foreach ( $log as $date => $user_info ) : ?>
                <tr>
                    <td class="limit-login-date"><span class="display-mobile"><?php _e( 'Date', 'wps-limit-login' ) . ' : '; ?></span><?php echo date_i18n( 'F d, Y H:i', $date ); ?></td>
                    <td class="limit-login-ip"><span class="display-mobile"><?php echo _x( 'IP', "Internet address", 'wps-limit-login' ) . ' : '; ?></span><?php echo esc_html( $user_info['ip'] ); ?></td>
                    <td class="limit-login-max"><span class="display-mobile"><?php _e( 'Users' ) . ' : '; ?></span><?php echo $user_info['username'] . ' (' . $user_info['counter'] . ' ' . _n( 'lockout', 'lockouts', $user_info['counter'], 'wps-limit-login' ) . ')' ?></td>
                    <td class="limit-login-gateway"><span class="display-mobile"><?php _e( 'Gateway', 'wps-limit-login' ) . ' : '; ?></span><?php echo $user_info['gateway']; ?></td>
                    <?php if ( ! empty( $lockouts[ $user_info['ip'] ] ) && $lockouts[ $user_info['ip'] ] > time() ) : ?>
                        <td class="wps_unlock"><a href="#" class="button wps-limit-login-unlock"
                                                  data-ip="<?php echo esc_attr( $user_info['ip'] ) ?>"
                                                  data-username="<?php echo esc_attr( $user_info['username'] ) ?>"><?php _e( 'Unlock', 'wps-limit-login' ); ?></a></td>
                    <?php else : ?>
                        <td class="wps_unlocked"><span><?php _e( 'Unlocked', 'wps-limit-login' ); ?></span></td>
                    <?php endif ?>
                </tr>
                <?php
            endforeach; ?>

        </table>
    </div>
    <script>jQuery(function ($) {
        $('.wps-limit-login-log .wps-limit-login-unlock').click(function () {
            var btn = $(this);

            if (btn.hasClass('disabled'))
                return false;
            btn.addClass('disabled');

            $.post(ajaxurl, {
                action: 'wps-limit-login-unlock',
                nonce: '<?php echo wp_create_nonce( 'wps-limit-login-unlock' ) ?>',
                ip: btn.data('ip'),
                username: btn.data('username')
            })
                .done(function (data) {
                    if (data === true)
                        btn.fadeOut(function () {
                            $(this).parent().removeClass('wps_unlock').addClass('wps_unlocked');
                            $(this).parent().html('<?php echo '<span>' . __( 'Unlocked', 'wps-limit-login' ) . '</span>'; ?>')
                        });
                    else
                        fail();
                }).fail(fail);

            function fail() {
                alert('Connection error');
                btn.removeClass('disabled');
            }

            return false;
        });
    })</script>
<?php endif; ?>