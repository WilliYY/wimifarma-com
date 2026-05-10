<?php
if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
} ?>

<div class="wrap wps-limit-login-page-settings">
	<?php include( WPS_LIMIT_LOGIN_DIR . 'blocks/title.php' ); ?>

    <p><?php _e( 'WPS Limit Login limits attempts to connect to your WordPress administration.', 'wps-limit-login' ); ?></p>

    <div class="wps-content-limit-login">
        <div class="wps-content-tab">
			<?php include( WPS_LIMIT_LOGIN_DIR . 'blocks/menu.php' ); ?>
            <div class="wps-tab">
				<?php
				if ( $_GET['page'] === 'wps-limit-login' && ! isset( $_GET['tab'] ) ) {
					include( WPS_LIMIT_LOGIN_DIR . 'blocks/settings.php' );
				}
				if ( $_GET['page'] === 'wps-limit-login' && isset( $_GET['tab'] ) && $_GET['tab'] === 'whitelist' ) {
					include( WPS_LIMIT_LOGIN_DIR . 'blocks/whitelist.php' );
				}
				if ( $_GET['page'] === 'wps-limit-login' && isset( $_GET['tab'] ) && $_GET['tab'] === 'blacklist' ) {
					include( WPS_LIMIT_LOGIN_DIR . 'blocks/blacklist.php' );
				}
				if ( $_GET['page'] === 'wps-limit-login' && isset( $_GET['tab'] ) && $_GET['tab'] === 'log' ) {
					include( WPS_LIMIT_LOGIN_DIR . 'blocks/log.php' );
				} ?>
            </div>
        </div>
    </div>
    <div class="wps-autopromo" id="plugin-filter">
	    <?php include( WPS_LIMIT_LOGIN_DIR . '/blocks/pub-wpserveur.php' ); ?>
		<?php include( WPS_LIMIT_LOGIN_DIR . '/blocks/pub.php' ); ?>
    </div>
</div>