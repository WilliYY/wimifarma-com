<?php
if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
} ?>
<div class="wps-wrap-menu">
	<nav class="wps-menu">
		<div class="wps-nav-menu <?php echo ( $_GET[ 'page' ] === 'wps-limit-login' && ! isset( $_GET[ 'tab' ] ) ) ? 'current' : ''; ?>">

            <?php
            if ( is_network_admin() ) {
	            $redirect = network_admin_url( 'settings.php?page=wps-limit-login' );
            } else {
	            $redirect = admin_url( 'options-general.php?page=wps-limit-login' );
            } ?>

			<a href="<?php echo esc_url( $redirect ); ?>">
				<i class="fal fa-sliders-h"></i> <?php _e( 'Configuration', 'wps-limit-login' ); ?>
			</a>
		</div>
		<div class="wps-nav-menu <?php echo ( $_GET[ 'page' ] === 'wps-limit-login' && isset( $_GET[ 'tab' ] ) && $_GET[ 'tab' ] === 'whitelist' ) ? 'current' : ''; ?>">

			<?php
			if ( is_network_admin() ) {
				$redirect = network_admin_url( 'settings.php?page=wps-limit-login&tab=whitelist' );
			} else {
				$redirect = admin_url( 'options-general.php?page=wps-limit-login&tab=whitelist' );
			} ?>

			<a href="<?php echo esc_url( $redirect ); ?>">
				<i class="fal fa-list-alt"></i> <?php _e( 'Whitelist', 'wps-limit-login' ); ?>
			</a>
		</div>
		<div class="wps-nav-menu <?php echo ( $_GET[ 'page' ] === 'wps-limit-login' && isset( $_GET[ 'tab' ] ) && $_GET[ 'tab' ] === 'blacklist' ) ? 'current' : ''; ?>">

			<?php
			if ( is_network_admin() ) {
				$redirect = network_admin_url( 'settings.php?page=wps-limit-login&tab=blacklist' );
			} else {
				$redirect = admin_url( 'options-general.php?page=wps-limit-login&tab=blacklist' );
			} ?>

			<a href="<?php echo esc_url( $redirect ); ?>">
				<i class="fas fa-list-alt"></i> <?php _e( 'Blacklist', 'wps-limit-login' ); ?>
			</a>
		</div>
		<div class="wps-nav-menu <?php echo ( $_GET[ 'page' ] === 'wps-limit-login' && isset( $_GET[ 'tab' ] ) && $_GET[ 'tab' ] === 'log' ) ? 'current' : ''; ?> last-child">

			<?php
			if ( is_network_admin() ) {
				$redirect = network_admin_url( 'settings.php?page=wps-limit-login&tab=log' );
			} else {
				$redirect = admin_url( 'options-general.php?page=wps-limit-login&tab=log' );
			} ?>

			<a href="<?php echo esc_url( $redirect ); ?>">
				<i class="fal fa-clipboard-list"></i> <?php _e( 'Log', 'wps-limit-login' ); ?>
			</a>
		</div>
        <div class="clearfix"></div>
	</nav>
</div>