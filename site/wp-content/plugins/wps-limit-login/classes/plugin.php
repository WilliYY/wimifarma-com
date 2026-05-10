<?php

namespace WPS\WPS_Limit_Login;

if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}

class Plugin {

	use Singleton;

	public $default_options = array(
		/* Are we behind a proxy? */
		'wps_limit_login_client_type'        => WPS_LIMIT_LOGIN_REMOTE_ADDR,

		/* Lock out after this many tries */
		'wps_limit_login_allowed_retries'    => 3,

		/* Lock out for this many seconds */
		'wps_limit_login_lockout_duration'   => 1200, // 20 minutes

		/* Long lock out after this many lockouts */
		'wps_limit_login_allowed_lockouts'   => 2,

		/* Long lock out for this many seconds */
		'wps_limit_login_long_duration'      => 86400, // 24 hours,

		/* Reset failed attempts after this many seconds */
		'wps_limit_login_valid_duration'     => 43200, // 12 hours

		/* Also limit malformed/forged cookies? */
		'cookies'                            => true,

		/* Notify on lockout. Values: '', 'email' */
		'wps_limit_lockout_notify'           => '',

		/* If notify by email, do so after this number of lockouts */
		'wps_limit_login_notify_email_after' => 2,

		'wps_limit_login_whitelist'        => array(),
		'wps_limit_login_blacklist'        => array(),
		'wps_limit_login_show_credit_link' => true,
	);
	/**
	 * Admin options page slug
	 * @var string
	 */
	private $_options_page_slug = 'wps-limit-login';

	/**
	 * Errors messages
	 *
	 * @var array
	 */
	public $_errors = array();

	private bool $network_mode;
	private bool $allow_local_options;
	private bool $use_local_options;

	protected function init() {

		if ( is_multisite() ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$this->network_mode = is_multisite() && is_plugin_active_for_network( WPS_LIMIT_LOGIN_BASENAME );

		if ( $this->network_mode ) {
			$this->allow_local_options = get_site_option( 'wps_limit_login_allow_local_options', false );
			$this->use_local_options   = $this->allow_local_options && get_option( 'wps_limit_login_use_local_options', false );
		} else {
			$this->allow_local_options = true;
			$this->use_local_options   = true;
		}

		add_action( 'wp_login_failed', array( $this, 'wp_login_failed' ) );
		add_filter( 'wp_authenticate_user', array( $this, 'wp_authenticate_user' ), 99999, 2 );

		add_filter( 'shake_error_codes', array( $this, 'failure_shake' ) );
		add_action( 'login_head', array( $this, 'add_error_message' ) );
		add_action( 'login_errors', array( $this, 'fixup_error_messages' ) );

		if ( $this->network_mode ) {
			add_action( 'network_admin_menu', array( $this, 'network_admin_menu' ) );
		}

		if ( $this->allow_local_options ) {
			add_action( 'admin_menu', array( $this, 'admin_menu' ) );
		}

		// Add notices for XMLRPC request
		add_filter( 'xmlrpc_login_error', array( $this, 'xmlrpc_error_messages' ) );

		// Add notices to woocommerce login page
		add_action( 'wp_head', array( $this, 'add_wc_notices' ) );

		/*
		* This action should really be changed to the 'authenticate' filter as
		* it will probably be deprecated. That is however only available in
		* later versions of WP.
		*/
		add_action( 'wp_authenticate', array( $this, 'track_credentials' ), 10, 2 );
		add_action( 'authenticate', array( $this, 'authenticate_filter' ), 5, 3 );

		if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
			add_action( 'init', array( $this, 'check_xmlrpc_lock' ) );
		}

		add_action( 'wp_ajax_wps-limit-login-unlock', array( $this, 'ajax_unlock' ) );

		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_enqueue_scripts' ) );
		add_filter( 'wps_limit_login_whitelist_ip', array( $this, 'check_whitelist_ips' ), 10, 2 );
		add_filter( 'wps_limit_login_blacklist_ip', array( $this, 'check_blacklist_ips' ), 10, 2 );
		add_action( 'login_form', array( $this, 'login_form' ) );
		add_action( 'login_enqueue_scripts', array( $this, 'login_enqueue_scripts' ) );
		add_action( 'admin_init', array( $this, 'reinitialize' ) );

		add_action( 'admin_init', array( __CLASS__, 'load_plugin' ) );
		if ( is_multisite() ) {
			add_filter( 'network_admin_plugin_action_links_' . WPS_LIMIT_LOGIN_BASENAME, array(
				$this,
				'plugin_action_links'
			) );
		}
		add_filter( 'plugin_action_links_' . WPS_LIMIT_LOGIN_BASENAME, array( $this, 'plugin_action_links' ) );

		add_action( 'wp_dashboard_setup', array( $this, 'add_dashboard_widgets' ) );

		add_filter( 'admin_footer_text', array( __CLASS__, 'admin_footer_text' ), 1 );
		add_filter( 'admin_footer', array( __CLASS__, 'admin_footer' ) );
		add_action( 'wp_ajax_wpslimitlogin_rated', array( __CLASS__, 'wpslimitlogin_rated' ) );
		add_filter( 'wps_bidouille_not_display_pub_array', array( __CLASS__, 'wps_bidouille_not_display_pub_array' ) );
	}

	public function check_xmlrpc_lock() {
		if ( is_user_logged_in() || $this->is_ip_whitelisted() ) {
			return false;
		}

		if ( $this->is_ip_blacklisted() || ! $this->is_limit_login_ok() ) {
			status_header( 403, 'Forbidden' );
			exit;
		}
	}

	/**
	 * @param $allow
	 * @param $ip
	 *
	 * @return bool
	 */
	public function check_whitelist_ips( $allow, $ip ) {
		return $this->ip_in_range( $ip, (array) $this->get_option( 'wps_limit_login_whitelist' ) );
	}

	/**
	 * @param $allow
	 * @param $ip
	 *
	 * @return bool
	 */
	public function check_blacklist_ips( $allow, $ip ) {
		return $this->ip_in_range( $ip, (array) $this->get_option( 'wps_limit_login_blacklist' ) );
	}

	/**
	 * @param $ip
	 * @param $list
	 *
	 * @return bool
	 */
	public function ip_in_range( $ip, $list ) {
		foreach ( $list as $range ) {
			if ( strpos( $range, '/' ) !== false ) {
				// $range is in IP/NETMASK format
				list( $range, $netmask ) = explode( '/', $range, 2 );
				if ( strpos( $netmask, '.' ) !== false ) {
					// $netmask is a 255.255.0.0 format
					$netmask     = str_replace( '*', '0', $netmask );
					$netmask_dec = ip2long( $netmask );

					return ( ( ip2long( $ip ) & $netmask_dec ) == ( ip2long( $range ) & $netmask_dec ) );
				} else {
					// $netmask is a CIDR size block
					// fix the range argument
					$x = explode( '.', $range );
					while ( count( $x ) < 4 ) {
						$x[] = '0';
					}
					list( $a, $b, $c, $d ) = $x;
					$range     = sprintf( "%u.%u.%u.%u", empty( $a ) ? '0' : $a, empty( $b ) ? '0' : $b, empty( $c ) ? '0' : $c, empty( $d ) ? '0' : $d );
					$range_dec = ip2long( $range );
					$ip_dec    = ip2long( $ip );
					# Strategy 1 - Create the netmask with 'netmask' 1s and then fill it to 32 with 0s
					#$netmask_dec = bindec(str_pad('', $netmask, '1') . str_pad('', 32-$netmask, '0'));
					# Strategy 2 - Use math to create it
					$wildcard_dec = pow( 2, ( 32 - $netmask ) ) - 1;
					$netmask_dec  = ~$wildcard_dec;

					return ( ( $ip_dec & $netmask_dec ) == ( $range_dec & $netmask_dec ) );
				}
			} else {
				// range might be 255.255.*.* or 1.2.3.0-1.2.3.255
				if ( strpos( $range, '*' ) !== false ) { // a.b.*.* format
					// Just convert to A-B format by setting * to 0 for A and 255 for B
					$lower = str_replace( '*', '0', $range );
					$upper = str_replace( '*', '255', $range );
					$range = "$lower-$upper";
				}
				if ( strpos( $range, '-' ) !== false ) { // A-B format
					list( $lower, $upper ) = explode( '-', $range, 2 );
					$lower_dec = (float) sprintf( "%u", ip2long( $lower ) );
					$upper_dec = (float) sprintf( "%u", ip2long( $upper ) );
					$ip_dec    = (float) sprintf( "%u", ip2long( $ip ) );

					return ( ( $ip_dec >= $lower_dec ) && ( $ip_dec <= $upper_dec ) );
				}

				if ( $range === $ip ) {
					return true;
				}
			}

		}

		return false;
	}

	/**
	 * @param $error
	 *
	 * @return \IXR_Error
	 */
	public function xmlrpc_error_messages( $error ) {

		if ( ! class_exists( 'IXR_Error' ) ) {
			return $error;
		}

		if ( ! $this->is_limit_login_ok() ) {
			return new \IXR_Error( 403, $this->error_msg() );
		}

		$ip      = $this->get_address();
		$retries = $this->get_option( 'wps_limit_login_retries' );
		$valid   = $this->get_option( 'wps_limit_login_retries_valid' );

		/* Should we show retries remaining? */

		if ( ! is_array( $retries ) || ! is_array( $valid ) ) {
			/* no retries at all */
			return $error;
		}
		if ( ! isset( $retries[ $ip ] ) || ! isset( $valid[ $ip ] ) || time() > $valid[ $ip ] ) {
			/* no: no valid retries */
			return $error;
		}
		if ( ( $retries[ $ip ] % $this->get_option( 'wps_limit_login_allowed_retries' ) ) == 0 ) {
			/* no: already been locked out for these retries */
			return $error;
		}

		$remaining = max( ( $this->get_option( 'wps_limit_login_allowed_retries' ) - ( $retries[ $ip ] % $this->get_option( 'wps_limit_login_allowed_retries' ) ) ), 0 );

		return new \IXR_Error( 403, sprintf( _n( "<strong>%d</strong> attempt remaining.", "<strong>%d</strong> attempts remaining.", $remaining, 'wps-limit-login' ), $remaining ) );
	}

	/**
	 * Errors on WooCommerce account page
	 */
	public function add_wc_notices() {

		global $wps_limit_login_just_lockedout;

		if ( ! function_exists( 'is_account_page' ) || ! function_exists( 'wc_add_notice' ) ) {
			return false;
		}

		/*
		* During lockout we do not want to show any other error messages (like
		* unknown user or empty password).
		*/
		if ( empty( $_POST ) && ! $this->is_limit_login_ok() && ! $wps_limit_login_just_lockedout ) {
			if ( is_account_page() ) {
				wc_add_notice( $this->error_msg(), 'error' );
			}
		}

	}

	/**
	 * @param $user
	 * @param $username
	 * @param $password
	 *
	 * @return WP_Error | WP_User
	 */
	public function authenticate_filter( $user, $username, $password ) {

		if ( ! empty( $username ) && ! empty( $password ) ) {

			$ip = $this->get_address();

			// Check if ip is blacklisted
			if ( ! $this->is_ip_whitelisted( $ip ) && $this->is_ip_blacklisted( $ip ) ) {

				remove_filter( 'login_errors', array( $this, 'fixup_error_messages' ) );
				remove_filter( 'login_head', array( $this, 'add_error_message' ) );
				remove_filter( 'wp_login_failed', array( $this, 'wp_login_failed' ) );
				remove_filter( 'wp_authenticate_user', array( $this, 'wp_authenticate_user' ), 99999 );
				remove_filter( 'login_head', array( $this, 'add_error_message' ) );
				remove_filter( 'login_errors', array( $this, 'fixup_error_messages' ) );

				remove_filter( 'authenticate', 'wp_authenticate_username_password', 20 );
				remove_filter( 'authenticate', 'wp_authenticate_email_password', 20 );

				$user = new \WP_Error();
				$user->add( 'ip_blacklisted', __( '<strong>ERROR</strong>: Too many failed login attempts.', 'wps-limit-login' ) );

			} elseif ( $this->is_ip_whitelisted( $ip ) ) {

				remove_filter( 'wp_login_failed', array( $this, 'wp_login_failed' ) );
				remove_filter( 'wp_authenticate_user', array( $this, 'wp_authenticate_user' ), 99999 );
				remove_filter( 'login_head', array( $this, 'add_error_message' ) );
				remove_filter( 'login_errors', array( $this, 'fixup_error_messages' ) );

			}

		}

		return $user;
	}

	/**
	 * Enqueue css
	 */
	public static function admin_enqueue_scripts( $hook ) {

		if ( false === strpos( $hook, 'wps-limit-login' ) ) {
			return;
		}

		wp_enqueue_style( 'wps-limit-login-fa', WPS_LIMIT_LOGIN_URL . 'assets/fontawesome/web-fonts-with-css/fontawesome-all.min.css' );
		wp_enqueue_script( 'wps-limit-login-fa', WPS_LIMIT_LOGIN_URL . 'assets/fontawesome/fontawesome-all.min.js', array(), false, true );

		wp_enqueue_style( 'wps-limit-login', WPS_LIMIT_LOGIN_URL . 'assets/css/style.css' );

		wp_enqueue_style( 'plugin-install' );

		wp_enqueue_script( 'plugin-install' );
		wp_enqueue_script( 'updates' );
		add_thickbox();
	}

	/**
	 * Add admin options page
	 */
	public function network_admin_menu() {
		add_submenu_page( 'settings.php', 'WPS Limit Login', 'WPS Limit Login', 'manage_options', $this->_options_page_slug, array(
			$this,
			'options_page'
		) );
	}

	public function admin_menu() {
		add_options_page( 'WPS Limit Login', 'WPS Limit Login', 'manage_options', $this->_options_page_slug, array(
			$this,
			'options_page'
		) );
	}

	/**
	 * Get the correct options page URI
	 *
	 * @return mixed
	 */
	public function get_wps_limit_login_options_page_uri() {
		if ( is_network_admin() ) {
			return network_admin_url( 'settings.php?page=wps-limit-login' );
		}

		return menu_page_url( $this->_options_page_slug, false );
	}

	/**
	 * Get option by name
	 *
	 * @param $option_name
	 *
	 * @return null
	 */
	public function get_option( $option_name, $local = null ) {
		if ( is_null( $local ) ) {
			$local = $this->use_local_options;
		}

		$func  = $local ? 'get_option' : 'get_site_option';
		$value = $func( $option_name, null );

		if ( is_null( $value ) && isset( $this->default_options[ $option_name ] ) ) {
			$value = $this->default_options[ $option_name ];
		}

		return $value;
	}

	/**
	 * @param $option_name
	 * @param $value
	 * @param null $local
	 *
	 * @return mixed
	 */
	public function update_option( $option_name, $value, $local = null ) {
		if ( is_null( $local ) ) {
			$local = $this->use_local_options;
		}

		$func = $local ? 'update_option' : 'update_site_option';

		return $func( $option_name, $value );
	}

	/**
	 * @param $option_name
	 * @param $value
	 * @param null $local
	 *
	 * @return mixed
	 */
	public function add_option( $option_name, $value, $local = null ) {
		if ( is_null( $local ) ) {
			$local = $this->use_local_options;
		}

		$func = $local ? 'add_option' : 'add_site_option';

		return $func( $option_name, $value, '', 'no' );
	}

	/**
	 * Setup main options
	 */
	public function sanitize_options() {
		if ( $this->get_option( 'wps_limit_login_notify_email_after' ) > $this->get_option( 'wps_limit_login_allowed_lockouts' ) ) {
			$this->update_option( 'wps_limit_login_notify_email_after', $this->get_option( 'wps_limit_login_allowed_lockouts' ) );
		}

		if ( isset( $_POST['lockout_notify_email'] ) ) {
			$this->update_option( 'wps_limit_lockout_notify', 'email' );
		} else {
			$this->update_option( 'wps_limit_lockout_notify', '' );
		}

		$ctype = $this->get_option( 'wps_limit_login_client_type' );
		if ( $ctype != WPS_LIMIT_LOGIN_REMOTE_ADDR && $ctype != 'HTTP_X_FORWARDED_FOR' ) {
			$this->update_option( 'wps_limit_login_client_type', WPS_LIMIT_LOGIN_REMOTE_ADDR );
		}
	}

	/**
	 * Check if it is ok to login
	 *
	 * @return bool
	 */
	public function is_limit_login_ok() {

		$ip = $this->get_address();

		/* Check external whitelist filter */
		if ( $this->is_ip_whitelisted( $ip ) ) {
			return true;
		}

		/* lockout active? */
		$lockouts = $this->get_option( 'wps_limit_login_lockouts' );

		return ( ! is_array( $lockouts ) || ! isset( $lockouts[ $ip ] ) || time() >= $lockouts[ $ip ] );
	}

	/**
	 * Action when login attempt failed
	 *
	 * Increase nr of retries (if necessary). Reset valid value. Setup
	 * lockout if nr of retries are above threshold. And more!
	 *
	 * A note on external whitelist: retries and statistics are still counted and
	 * notifications done as usual, but no lockout is done.
	 *
	 * @param $username
	 *
	 * @return bool
	 */
	public function wp_login_failed( $username ) {

		$ip = $this->get_address();

		/* if currently locked-out, do not add to retries */
		$lockouts = $this->get_option( 'wps_limit_login_lockouts' );

		if ( ! is_array( $lockouts ) ) {
			$lockouts = array();
		}

		if ( isset( $lockouts[ $ip ] ) && time() < $lockouts[ $ip ] ) {
			return false;
		}

		/* Get the arrays with retries and retries-valid information */
		$retries = $this->get_option( 'wps_limit_login_retries' );
		$valid   = $this->get_option( 'wps_limit_login_retries_valid' );

		if ( ! is_array( $retries ) ) {
			$retries = array();
			$this->add_option( 'wps_limit_login_retries', $retries );
		}

		if ( ! is_array( $valid ) ) {
			$valid = array();
			$this->add_option( 'wps_limit_login_retries_valid', $valid );
		}

		/* Check validity and add one to retries */
		if ( isset( $retries[ $ip ] ) && isset( $valid[ $ip ] ) && time() < $valid[ $ip ] ) {
			$retries[ $ip ] ++;
		} else {
			$retries[ $ip ] = 1;
		}
		$valid[ $ip ] = time() + $this->get_option( 'wps_limit_login_valid_duration' );

		/* lockout? */
		if ( $retries[ $ip ] % $this->get_option( 'wps_limit_login_allowed_retries' ) != 0 ) {
			/*
			* Not lockout (yet!)
			* Do housecleaning (which also saves retry/valid values).
			*/
			$this->cleanup( $retries, null, $valid );

			return false;
		}

		$whitelisted = $this->is_ip_whitelisted( $ip );

		$retries_long = $this->get_option( 'wps_limit_login_allowed_retries' ) * $this->get_option( 'wps_limit_login_allowed_lockouts' );

		/*
		* Note that retries and statistics are still counted and notifications
		* done as usual for whitelisted ips , but no lockout is done.
		*/
		if ( $whitelisted ) {
			if ( $retries[ $ip ] >= $retries_long ) {
				unset( $retries[ $ip ] );
				unset( $valid[ $ip ] );
			}
		} else {
			global $wps_limit_login_just_lockedout;
			$wps_limit_login_just_lockedout = true;

			/* setup lockout, reset retries as needed */
			if ( $retries[ $ip ] >= $retries_long ) {
				/* long lockout */
				$lockouts[ $ip ] = time() + $this->get_option( 'wps_limit_login_long_duration' );
				unset( $retries[ $ip ] );
				unset( $valid[ $ip ] );
			} else {
				/* normal lockout */
				$lockouts[ $ip ] = time() + $this->get_option( 'wps_limit_login_lockout_duration' );
			}
		}

		$this->cleanup( $retries, $lockouts, $valid );

		$this->notify( $username );

		$wps_limit_lockouts_total = $this->get_option( 'wps_limit_lockouts_total' );
		if ( $wps_limit_lockouts_total === false || ! is_numeric( $wps_limit_lockouts_total ) ) {
			$this->add_option( 'wps_limit_lockouts_total', 1 );
		} else {
			$this->update_option( 'wps_limit_lockouts_total', $wps_limit_lockouts_total + 1 );
		}
	}

	/**
	 * Handle notification in event of lockout
	 *
	 * @param $user
	 *
	 * @return bool
	 */
	public function notify( $user ) {
		$args = explode( ',', $this->get_option( 'wps_limit_lockout_notify' ) );

		if ( empty( $args ) ) {
			return false;
		}

		foreach ( $args as $mode ) {
			switch ( trim( $mode ) ) {
				case 'email':
					$this->notify_email( $user );
					break;
			}
		}

		$this->notify_log( $user );
	}

	/**
	 * Email notification of lockout to admin (if configured)
	 *
	 * @param $user
	 *
	 * @return bool
	 */
	public function notify_email( $user ) {
		$ip          = $this->get_address();
		$whitelisted = $this->is_ip_whitelisted( $ip );

		$retries = $this->get_option( 'wps_limit_login_retries' );
		if ( ! is_array( $retries ) ) {
			$retries = array();
		}

		/* check if we are at the right nr to do notification */
		if ( isset( $retries[ $ip ] ) && ( ( $retries[ $ip ] / $this->get_option( 'wps_limit_login_allowed_retries' ) ) % $this->get_option( 'wps_limit_login_notify_email_after' ) ) != 0 ) {
			return false;
		}

		/* Format message. First current lockout duration */
		if ( ! isset( $retries[ $ip ] ) ) {
			/* longer lockout */
			$count    = $this->get_option( 'wps_limit_login_allowed_retries' )
			            * $this->get_option( 'wps_limit_login_allowed_lockouts' );
			$lockouts = $this->get_option( 'wps_limit_login_allowed_lockouts' );
			$time     = round( $this->get_option( 'wps_limit_login_long_duration' ) / 3600 );
			$when     = sprintf( _n( '%d hour', '%d hours', $time, 'wps-limit-login' ), $time );
		} else {
			/* normal lockout */
			$count    = $retries[ $ip ];
			$lockouts = floor( $count / $this->get_option( 'wps_limit_login_allowed_retries' ) );
			$time     = round( $this->get_option( 'wps_limit_login_lockout_duration' ) / 60 );
			$when     = sprintf( _n( '%d minute', '%d minutes', $time, 'wps-limit-login' ), $time );
		}

		$blogname = $this->use_local_options ? get_option( 'blogname' ) : get_site_option( 'site_name' );
		$blogname = htmlspecialchars_decode( $blogname, ENT_QUOTES );

		if ( $whitelisted ) {
			$subject = sprintf( __( "[%s - WPS Limit Login] Failed login attempts from whitelisted IP"
					, 'wps-limit-login' )
				, $blogname );
		} else {
			$subject = sprintf( __( "[%s - WPS Limit Login] Too many failed login attempts"
					, 'wps-limit-login' )
				, $blogname );
		}

		$message = sprintf( __( "%d failed login attempts (%d lockout(s)) from IP: %s"
				, 'wps-limit-login' ) . "\r\n\r\n"
			, $count, $lockouts, $ip );
		if ( $user != '' ) {
			$message .= sprintf( __( "Last user attempted: %s", 'wps-limit-login' )
			                     . "\r\n\r\n", $user );
		}
		if ( $whitelisted ) {
			$message .= __( "IP was NOT blocked because of external whitelist.", 'wps-limit-login' );
		} else {
			$message .= sprintf( __( "IP was blocked for %s", 'wps-limit-login' ), $when );
		}

		$admin_email = $this->use_local_options ? get_option( 'admin_email' ) : get_site_option( 'admin_email' );

		@wp_mail( $admin_email, $subject, $message );
	}

	/**
	 * Logging of lockout (if configured)
	 *
	 * @param $user_login
	 *
	 * @return bool
	 */
	public function notify_log( $user_login ) {

		if ( ! $user_login ) {
			return false;
		}

		$log = $option = $this->get_option( 'wps_limit_login_logged' );
		if ( ! is_array( $log ) ) {
			$log = array();
		}
		$ip = $this->get_address();

		/* can be written much simpler, if you do not mind php warnings */
		if ( ! isset( $log[ $ip ] ) ) {
			$log[ $ip ] = array();
		}

		if ( ! isset( $log[ $ip ][ $user_login ] ) ) {
			$log[ $ip ][ $user_login ] = array( 'counter' => 0 );
		} elseif ( ! is_array( $log[ $ip ][ $user_login ] ) ) {
			$log[ $ip ][ $user_login ] = array(
				'counter' => $log[ $ip ][ $user_login ],
			);
		}

		$log[ $ip ][ $user_login ]['counter'] ++;
		$log[ $ip ][ $user_login ]['date'] = time();

		if ( isset( $_POST['woocommerce-login-nonce'] ) ) {
			$gateway = 'WooCommerce';
		} elseif ( isset( $GLOBALS['wp_xmlrpc_server'] ) && is_object( $GLOBALS['wp_xmlrpc_server'] ) ) {
			$gateway = 'XMLRPC';
		} else {
			$gateway = 'WP Login';
		}

		$log[ $ip ][ $user_login ]['gateway'] = $gateway;

		if ( $option === false ) {
			$this->add_option( 'wps_limit_login_logged', $log );
		} else {
			$this->update_option( 'wps_limit_login_logged', $log );
		}
	}

	/**
	 * Check if IP is whitelisted.
	 *
	 * This function allow external ip whitelisting using a filter. Note that it can
	 * be called multiple times during the login process.
	 *
	 * Note that retries and statistics are still counted and notifications
	 * done as usual for whitelisted ips , but no lockout is done.
	 *
	 * Example:
	 * function my_ip_whitelist($allow, $ip) {
	 *    return ($ip == 'my-ip') ? true : $allow;
	 * }
	 * add_filter('wps_limit_login_whitelist_ip', 'my_ip_whitelist', 10, 2);
	 *
	 * @param null $ip
	 *
	 * @return bool
	 */
	public function is_ip_whitelisted( $ip = null ) {

		if ( is_null( $ip ) ) {
			$ip = $this->get_address();
		}

		$whitelisted = apply_filters( 'wps_limit_login_whitelist_ip', false, $ip );

		return ( $whitelisted === true );
	}

	public function is_ip_blacklisted( $ip = null ) {

		if ( is_null( $ip ) ) {
			$ip = $this->get_address();
		}

		$blacklisted = apply_filters( 'wps_limit_login_blacklist_ip', false, $ip );

		return ( $blacklisted === true );
	}

	/**
	 * Filter: allow login attempt? (called from wp_authenticate())
	 *
	 * @param $user WP_User
	 * @param $password
	 *
	 * @return \WP_Error
	 */
	public function wp_authenticate_user( $user, $password ) {

		if ( is_wp_error( $user ) ||
		     $this->check_whitelist_ips( false, $this->get_address() ) ||
		     $this->is_limit_login_ok()
		) {

			return $user;
		}

		$error = new \WP_Error();

		global $wps_limit_login_my_error_shown;
		$wps_limit_login_my_error_shown = true;

		if ( $this->is_ip_blacklisted( $this->get_address() ) ) {
			$error->add( 'ip_blacklisted', __( '<strong>ERROR</strong>: Too many failed login attempts.', 'wps-limit-login' ) );
		} else {
			// This error should be the same as in "shake it" filter below
			$error->add( 'too_many_retries', $this->error_msg() );
		}

		return $error;
	}

	/**
	 * Filter: add this failure to login page "Shake it!"
	 *
	 * @param $error_codes
	 *
	 * @return array
	 */
	public function failure_shake( $error_codes ) {
		$error_codes[] = 'too_many_retries';

		return $error_codes;
	}

	/**
	 * Keep track of if user or password are empty, to filter errors correctly
	 *
	 * @param $user
	 * @param $password
	 */
	public function track_credentials( $user, $password ) {
		global $wps_limit_login_notempty_credentials;

		$wps_limit_login_notempty_credentials = ( ! empty( $user ) && ! empty( $password ) );
	}

	/**
	 * Should we show errors and messages on this page?
	 *
	 * @return bool
	 */
	public function login_show_msg() {
		if ( isset( $_GET['key'] ) ) {
			/* reset password */
			return false;
		}

		$action = isset( $_REQUEST['action'] ) ? $_REQUEST['action'] : '';

		return ( $action != 'lostpassword' && $action != 'retrievepassword'
		         && $action != 'resetpass' && $action != 'rp'
		         && $action != 'register' );
	}

	/**
	 * Construct informative error message
	 *
	 * @return string
	 */
	public function error_msg() {
		$ip       = $this->get_address();
		$lockouts = $this->get_option( 'wps_limit_login_lockouts' );

		$msg = __( '<strong>ERROR</strong>: Too many failed login attempts.', 'wps-limit-login' ) . ' ';

		if ( ! is_array( $lockouts ) || ! isset( $lockouts[ $ip ] ) || time() >= $lockouts[ $ip ] ) {
			/* Huh? No timeout active? */
			$msg .= __( 'Please try again later.', 'wps-limit-login' );

			return $msg;
		}

		$when = ceil( ( $lockouts[ $ip ] - time() ) / 60 );
		if ( $when > 60 ) {
			$when = ceil( $when / 60 );
			$msg  .= sprintf( _n( 'Please try again in %d hour.', 'Please try again in %d hours.', $when, 'wps-limit-login' ), $when );
		} else {
			$msg .= sprintf( _n( 'Please try again in %d minute.', 'Please try again in %d minutes.', $when, 'wps-limit-login' ), $when );
		}

		return $msg;
	}

	/**
	 * Add a message to login page when necessary
	 */
	public function add_error_message() {
		global $error, $wps_limit_login_my_error_shown;

		if ( ! $this->login_show_msg() || $wps_limit_login_my_error_shown ) {
			return false;
		}

		$msg = $this->get_message();

		if ( $msg != '' ) {
			$wps_limit_login_my_error_shown = true;
			$error                          .= $msg;
		}

		return false;
	}

	/**
	 * Fix up the error message before showing it
	 *
	 * @param $content
	 *
	 * @return string
	 */
	public function fixup_error_messages( $content ) {
		global $wps_limit_login_just_lockedout, $wps_limit_login_notempty_credentials, $wps_limit_login_my_error_shown;

		if ( ! $this->login_show_msg() ) {
			return $content;
		}

		/*
		* During lockout we do not want to show any other error messages (like
		* unknown user or empty password).
		*/
		if ( ! $this->is_limit_login_ok() && ! $wps_limit_login_just_lockedout ) {
			return $this->error_msg();
		}

		/*
		* We want to filter the messages 'Invalid username' and
		* 'Invalid password' as that is an information leak regarding user
		* account names (prior to WP 2.9?).
		*
		* Also, if more than one error message, put an extra <br /> tag between
		* them.
		*/
		$msgs = explode( "<br />\n", $content );

		if ( strlen( end( $msgs ) ) == 0 ) {
			/* remove last entry empty string */
			array_pop( $msgs );
		}

		$count         = count( $msgs );
		$my_warn_count = $wps_limit_login_my_error_shown ? 1 : 0;

		if ( $wps_limit_login_notempty_credentials && $count > $my_warn_count ) {
			/* Replace error message, including ours if necessary */
			$content = __( '<strong>ERROR</strong>: Incorrect username or password.', 'wps-limit-login' ) . "<br />\n";

			if ( $wps_limit_login_my_error_shown || $this->get_message() ) {
				$content .= "<br />\n" . $this->get_message() . "<br />\n";
			}

			return $content;
		} elseif ( $count <= 1 ) {
			return $content;
		}

		$new = '';
		while ( $count -- > 0 ) {
			$new .= array_shift( $msgs ) . "<br />\n";
			if ( $count > 0 ) {
				$new .= "<br />\n";
			}
		}

		return $new;
	}

	public function fixup_error_messages_wc( \WP_Error $error ) {
		$error->add( 1, __( 'WC Error' ) );
	}

	/**
	 * Return current (error) message to show, if any
	 *
	 * @return string
	 */
	public function get_message() {
		/* Check external whitelist */
		if ( $this->is_ip_whitelisted() ) {
			return '';
		}

		/* Is lockout in effect? */
		if ( ! $this->is_limit_login_ok() ) {
			return $this->error_msg();
		}

		return $this->retries_remaining_msg();
	}

	/**
	 * Construct retries remaining message
	 *
	 * @return string
	 */
	public function retries_remaining_msg() {
		$ip      = $this->get_address();
		$retries = $this->get_option( 'wps_limit_login_retries' );
		$valid   = $this->get_option( 'wps_limit_login_retries_valid' );

		/* Should we show retries remaining? */

		if ( ! is_array( $retries ) || ! is_array( $valid ) ) {
			/* no retries at all */
			return '';
		}
		if ( ! isset( $retries[ $ip ] ) || ! isset( $valid[ $ip ] ) || time() > $valid[ $ip ] ) {
			/* no: no valid retries */
			return '';
		}
		if ( ( $retries[ $ip ] % $this->get_option( 'wps_limit_login_allowed_retries' ) ) == 0 ) {
			/* no: already been locked out for these retries */
			return '';
		}

		$remaining = max( ( $this->get_option( 'wps_limit_login_allowed_retries' ) - ( $retries[ $ip ] % $this->get_option( 'wps_limit_login_allowed_retries' ) ) ), 0 );

		return sprintf( _n( "<strong>%d</strong> attempt remaining.", "<strong>%d</strong> attempts remaining.", $remaining, 'wps-limit-login' ), $remaining );
	}

	/**
	 * Get correct remote address
	 *
	 * @param string $type_name
	 *
	 * @return string
	 */
	public function get_address( $type_name = '' ) {

		if ( isset( $_SERVER['REMOTE_ADDR'] ) ) {
			return $_SERVER['REMOTE_ADDR'];
		}

		return $type_name;
	}

	/**
	 * Clean up old lockouts and retries, and save supplied arrays
	 *
	 * @param null $retries
	 * @param null $lockouts
	 * @param null $valid
	 *
	 * @return bool
	 */
	public function cleanup( $retries = null, $lockouts = null, $valid = null ) {
		$now      = time();
		$lockouts = ! is_null( $lockouts ) ? $lockouts : $this->get_option( 'wps_limit_login_lockouts' );

		/* remove old lockouts */
		if ( is_array( $lockouts ) ) {
			foreach ( $lockouts as $ip => $lockout ) {
				if ( $lockout < $now ) {
					unset( $lockouts[ $ip ] );
				}
			}
			$this->update_option( 'wps_limit_login_lockouts', $lockouts );
		}

		/* remove retries that are no longer valid */
		$valid   = ! is_null( $valid ) ? $valid : $this->get_option( 'wps_limit_login_retries_valid' );
		$retries = ! is_null( $retries ) ? $retries : $this->get_option( 'wps_limit_login_retries' );
		if ( ! is_array( $valid ) || ! is_array( $retries ) ) {
			return false;
		}

		foreach ( $valid as $ip => $lockout ) {
			if ( $lockout < $now ) {
				unset( $valid[ $ip ] );
				unset( $retries[ $ip ] );
			}
		}

		/* go through retries directly, if for some reason they've gone out of sync */
		foreach ( $retries as $ip => $retry ) {
			if ( ! isset( $valid[ $ip ] ) ) {
				unset( $retries[ $ip ] );
			}
		}

		$this->update_option( 'wps_limit_login_retries', $retries );
		$this->update_option( 'wps_limit_login_retries_valid', $valid );
	}

	/**
	 * Render admin options page
	 */
	public function options_page() {
		$this->use_local_options = ! is_network_admin();
		$this->cleanup();

		if ( ! empty( $_POST ) ) {
			check_admin_referer( 'wps-limit-login-settings' );

			if ( false === strpos( $_POST['_wp_http_referer'], 'tab=whitelist' ) && false === strpos( $_POST['_wp_http_referer'], 'tab=blacklist' ) ) {

				if ( is_network_admin() ) {
					$this->update_option( 'wps_limit_login_allow_local_options', ! empty( $_POST['allow_local_options'] ) );
				} elseif ( $this->network_mode ) {
					$this->update_option( 'wps_limit_login_use_local_options', empty( $_POST['use_global_options'] ) );
				}

				/* Should we clear log? */
				if ( isset( $_POST['clear_log'] ) ) {

					$log      = $this->get_option( 'wps_limit_login_logged' );
					$lockouts = (array) $this->get_option( 'wps_limit_login_lockouts' );

					if ( ! empty( $log ) ) {
						foreach ( $log as $ip => $user_info ) {
							if ( empty( $lockouts[ $ip ] ) ) {
								unset( $log[ $ip ] );
							}
						}
					}

					$this->update_option( 'wps_limit_login_logged', $log );
					self::show_error( __( 'Cleared IP log', 'wps-limit-login' ) );
				}

				/* Should we reset counter? */
				if ( isset( $_POST['reset_total'] ) ) {
					$this->update_option( 'wps_limit_lockouts_total', 0 );
					self::show_error( __( 'Reset lockout count', 'wps-limit-login' ) );
				}

				/* Should we restore current lockouts? */
				if ( isset( $_POST['reset_current'] ) ) {
					$this->update_option( 'wps_limit_login_lockouts', array() );
					self::show_error( __( 'Cleared current lockouts', 'wps-limit-login' ) );
				}

				/* Should we update options? */
				if ( isset( $_POST['update_options'] ) ) {
					if ( isset ( $_POST['allowed_retries'] ) ) {
						$this->update_option( 'wps_limit_login_allowed_retries', (int) $_POST['allowed_retries'] );
					}
					if ( isset ( $_POST['lockout_duration'] ) ) {
						$this->update_option( 'wps_limit_login_lockout_duration', (int) $_POST['lockout_duration'] * 60 );
					}
					if ( isset ( $_POST['allowed_lockouts'] ) ) {
						$this->update_option( 'wps_limit_login_allowed_lockouts', (int) $_POST['allowed_lockouts'] );
					}
					if ( isset ( $_POST['long_duration'] ) ) {
						$this->update_option( 'wps_limit_login_long_duration', (int) $_POST['long_duration'] * 3600 );
					}
					if ( isset ( $_POST['valid_duration'] ) ) {
						$this->update_option( 'wps_limit_login_valid_duration', (int) $_POST['valid_duration'] * 3600 );
					}
					if ( isset ( $_POST['notify_email_after'] ) ) {
						$this->update_option( 'wps_limit_login_notify_email_after', (int) $_POST['notify_email_after'] );
					}

					$wps_limit_login_show_credit_link = ( ! empty( $_POST['show_credit_link'] ) ) ? $_POST['show_credit_link'] : '';
					$this->update_option( 'wps_limit_login_show_credit_link', $wps_limit_login_show_credit_link );

					$this->sanitize_options();

					self::show_error( __( 'Options saved.', 'wps-limit-login' ) );
				}
			} elseif ( false !== strpos( $_POST['_wp_http_referer'], 'tab=whitelist' ) ) {

				/* Should we update options? */
				if ( isset( $_POST['update_options'] ) ) {

					$wps_limit_login_white_list_ips = ( ! empty( $_POST['wps_limit_login_whitelist_ips'] ) ) ? explode( "\n", str_replace( "\r", "", stripslashes( $_POST['wps_limit_login_whitelist_ips'] ) ) ) : array();

					if ( ! empty( $wps_limit_login_white_list_ips ) ) {
						foreach ( $wps_limit_login_white_list_ips as $key => $ip ) {
							if ( '' == $ip ) {
								unset( $wps_limit_login_white_list_ips[ $key ] );
							}
						}
					}
					$this->update_option( 'wps_limit_login_whitelist', $wps_limit_login_white_list_ips );

					self::show_error( __( 'Options saved.', 'wps-limit-login' ) );
				}
			} elseif ( false !== strpos( $_POST['_wp_http_referer'], 'tab=blacklist' ) ) {

				/* Should we update options? */
				if ( isset( $_POST['update_options'] ) ) {

					$wps_limit_login_blacklist_ips = ( ! empty( $_POST['wps_limit_login_blacklist_ips'] ) ) ? explode( "\n", str_replace( "\r", "", stripslashes( $_POST['wps_limit_login_blacklist_ips'] ) ) ) : array();

					if ( ! empty( $wps_limit_login_blacklist_ips ) ) {
						foreach ( $wps_limit_login_blacklist_ips as $key => $ip ) {
							if ( '' == $ip ) {
								unset( $wps_limit_login_blacklist_ips[ $key ] );
							}
						}
					}
					$this->update_option( 'wps_limit_login_blacklist', $wps_limit_login_blacklist_ips );

					self::show_error( __( 'Options saved.', 'wps-limit-login' ) );
				}
			}
		}

		include_once( WPS_LIMIT_LOGIN_DIR . '/admin_page/options.php' );
	}

	public function ajax_unlock() {
		check_ajax_referer( 'wps-limit-login-unlock', 'nonce' );
		$ip = ( isset( $_POST['ip'] ) ) ? $_POST['ip'] : '';

		$lockouts = (array) $this->get_option( 'wps_limit_login_lockouts' );

		if ( isset( $lockouts[ $ip ] ) ) {
			unset( $lockouts[ $ip ] );
			$this->update_option( 'wps_limit_login_lockouts', $lockouts );
		}

		//save to log
		$user_login = ( isset( $_POST['username'] ) ) ? $_POST['username'] : '';
		$log        = $this->get_option( 'wps_limit_login_logged' );

		if ( isset( $log[ $ip ][ $user_login ] ) ) {
			if ( ! is_array( $log[ $ip ][ $user_login ] ) ) {
				$log[ $ip ][ $user_login ] = array(
					'counter' => $log[ $ip ][ $user_login ],
				);
			}
			$log[ $ip ][ $user_login ]['unlocked'] = true;

			$this->update_option( 'wps_limit_login_logged', $log );
		}

		wp_send_json_success();
	}

	/**
	 * Show error message
	 *
	 * @param $msg
	 *
	 * @return bool
	 */
	public static function show_error( $msg ) {
		if ( empty( $msg ) ) {
			return false;
		}

		echo '<div id="message" class="updated fade"><p>' . $msg . '</p></div>';
	}

	/**
	 * @param $log
	 *
	 * @return array
	 */
	public static function sorted_log_by_date( $log ) {
		$new_log = array();

		if ( ! is_array( $log ) || empty( $log ) ) {
			return $new_log;
		}

		foreach ( $log as $ip => $users ) {
			if ( empty( $users ) ) {
				continue;
			}

			foreach ( $users as $user_name => $info ) {
				if ( ! is_array( $info ) ) {
					continue;
				}

				$new_log[ $info['date'] ] = array(
					'ip'       => $ip,
					'username' => $user_name,
					'counter'  => $info['counter'],
					'gateway'  => ( isset( $info['gateway'] ) ) ? $info['gateway'] : '-',
					'unlocked' => ! empty( $info['unlocked'] ),
				);
			}
		}

		krsort( $new_log );

		return $new_log;
	}

	public function login_form() {
		$wps_limit_login_show_credit_link = $this->get_option( 'wps_limit_login_show_credit_link' );
		if ( $wps_limit_login_show_credit_link != 'true' && '1' != $wps_limit_login_show_credit_link ) {
			return false;
		}

		echo '<p class="wps-limit-login-credits"><img src="' . WPS_LIMIT_LOGIN_URL . 'assets/img/logo-icon-32.png' . '" /><br />' . __( 'Login form protected by', 'wps-limit-login' ) . ' <br /><a href="https://wordpress.org/plugins/wps-limit-login/" target="_blank">WPS Limit Login</a></p>';
	}

	public function login_enqueue_scripts() { ?>
        <style type="text/css">
            .login #login_error {
                background-color: #dc3232 !important;
                color: #fff;
                margin: 0 0 20px !important;
                border: 5px solid rgba(0, 0, 0, 0.2) !important;
                font-size: 16px;
            }

            .wps-limit-login-credits {
                text-align: center;
                position: fixed;
                bottom: 0;
                background: #303f4c;
                color: #fff;
                padding: 10px !important;
                width: 272px;
                display: block;
                margin: 0 auto !important;
                border-radius: 4px 4px 0px 0px;
                box-shadow: 0px 0px 3px #000;
                border: 1px solid #fff;
                border-bottom: 0;
                -webkit-box-sizing: border-box;
                -moz-box-sizing: border-box;
                box-sizing: border-box;
            }

            .wps-limit-login-credits a {
                color: #95be22;
            }

            .interim-login .wps-limit-login-credits {
                position: relative;
                margin-bottom: 15px !important;
                border-bottom: 1px solid #fff;
                border-radius: 4px;
            }

            @media screen and (max-height: 840px) {
                .wps-limit-login-credits {
                    position: relative;
                    margin-bottom: 15px !important;
                    border-bottom: 1px solid #fff;
                    border-radius: 4px;
                }
            }
        </style>
		<?php
	}

	/**
	 *
	 * Reinitialise settings plugins
	 *
	 * @return bool
	 */
	public function reinitialize() {
		if ( ! isset( $_GET['nonce'] ) || ! wp_verify_nonce( $_GET['nonce'], 'reinitialize' ) ) {
			return false;
		}

		if ( ! isset( $_GET['action'] ) || $_GET['action'] !== 'reinitialize' ) {
			return false;
		}

		foreach ( $this->default_options as $option => $value ) {
			if ( 'wps_limit_login_whitelist' === $option || 'wps_limit_login_blacklist' === $option ) {
				continue;
			}
			$this->update_option( $option, $value );
		}

		wp_redirect( admin_url( 'options-general.php?page=wps-limit-login' ) );
		exit;
	}

	public static function activate() {
		add_option( 'wps_limit_login_activated', 1 );
	}

	public static function load_plugin() {

		if ( is_admin() && get_option( 'wps_limit_login_activated' ) == 1 ) {

			delete_option( 'wps_limit_login_activated' );

			if ( is_multisite()
			     && is_super_admin()
			     && is_plugin_active_for_network( WPS_LIMIT_LOGIN_BASENAME ) ) {

				$redirect = network_admin_url( 'settings.php?page=wps-limit-login' );
			} else {
				$redirect = admin_url( 'options-general.php?page=wps-limit-login' );
			}

			wp_safe_redirect( $redirect );
			die;
		}
	}

	/**
	 * @param $links
	 *
	 * @return mixed
	 */
	public function plugin_action_links( $links ) {
		if ( is_network_admin() && is_plugin_active_for_network( WPS_LIMIT_LOGIN_BASENAME ) ) {
			array_unshift( $links, '<a href="' . network_admin_url( 'settings.php?page=wps-limit-login' ) . '">' . __( 'Settings' ) . '</a>' );
		} else {
			array_unshift( $links, '<a href="' . admin_url( 'options-general.php?page=wps-limit-login' ) . '">' . __( 'Settings' ) . '</a>' );
		}

		return $links;
	}

	public function dashboard_widget_function( $post, $callback_args ) {
		$log = $this->get_option( 'wps_limit_login_logged' );
		$log = Plugin::sorted_log_by_date( $log );

		if ( ! is_array( $log ) || empty( $log ) ) {
			_e( 'No lockouts yet', 'wps-limit-login' );

			return false;
		}

		_e( 'List of the last 5 lockouts:', 'wps-limit-login' );

		ob_start();

		$i = 0;
		foreach ( $log as $date => $user_info ) :
			if ( $i > 5 ) {
				break;
			}
			echo '<p>' . date_i18n( 'd/m/Y H:i:s', $date ) . ' - ' . esc_html( $user_info['ip'] ) . ' - ' . $user_info['username'] . ' (' . $user_info['counter'] . ' ' . _n( 'lockout', 'lockouts', $user_info['counter'], 'wps-limit-login' ) . ')' . '</p>';
			$i ++;
		endforeach; ?>

		<?php
		echo ob_get_clean();

		echo '<a class="button button-primary" href="' . admin_url( 'options-general.php?page=wps-limit-login&tab=log' ) . '">' . __( 'See all lockouts', 'wps-limit-login' ) . '</a>';

	}

	public function add_dashboard_widgets() {
		wp_add_dashboard_widget( 'wps_limit_logindashboard_widget', 'WPS Limit Login', array(
			$this,
			'dashboard_widget_function'
		) );
	}

	public static function admin_footer() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return false;
		}

		$current_screen = get_current_screen();

		if ( false === strpos( $current_screen->base, 'wps-limit' ) ) {
			return false;
		}

		echo "<script>
            jQuery( 'a.wc-rating-link' ).click( function() {
                jQuery.post( '" . admin_url( 'admin-ajax.php', 'relative' ) . "', { action: 'wpslimitlogin_rated', _ajax_nonce: jQuery( this ).data('nonce') } );
                jQuery( this ).parent().text( jQuery( this ).data( 'rated' ) );
            });</script>";
	}

	public static function admin_footer_text( $footer_text ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return $footer_text;
		}

		$current_screen = get_current_screen();

		if ( false === strpos( $current_screen->base, 'wps-limit' ) ) {
			return $footer_text;
		}

		if ( ! get_option( 'wpslimitlogin_admin_footer_text_rated' ) ) {
			$footer_text = sprintf(
				__( 'If you like %1$s please leave us a %2$s rating. A huge thanks in advance!', 'wps-limit-login' ),
				sprintf( '<strong>%s</strong>', esc_html__( 'WPS Limit Login', 'wps-limit-login' ) ),
				'<a href="https://wordpress.org/support/plugin/wps-limit-login/reviews?rate=5#new-post" target="_blank" class="wc-rating-link" data-nonce="' . wp_create_nonce( 'wpslimitloginrated' ) . '" data-rated="' . esc_attr__( 'Thanks :)', 'wps-limit-login' ) . '">&#9733;&#9733;&#9733;&#9733;&#9733;</a>'
			);
		}

		return $footer_text;
	}

	/**
	 * Triggered when clicking the rating footer.
	 */
	public static function wpslimitlogin_rated() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( - 1 );
		}

		check_ajax_referer( 'wpslimitloginrated' );

		update_option( 'wpslimitlogin_admin_footer_text_rated', 1 );
		wp_die();
	}

	/**
	 * @param $array
	 *
	 * @return array
	 */
	public static function wps_bidouille_not_display_pub_array( $array ) {
		$array[] = 'settings_page_wps-limit-login';

		return $array;
	}
}