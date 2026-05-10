<?php
/*
Plugin Name: WPS Limit Login
Description: Limit connection attempts by IP address
Donate link: https://www.paypal.me/donateWPServeur
Author: WPServeur, NicolasKulka, wpformation
Author URI: https://wpserveur.net
Version: 1.5.9.2
Requires at least: 4.2
Tested up to: 6.8
Domain Path: languages
Text Domain: wps-limit-login
License: GPLv2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
*/

// don't load directly
if ( ! defined( 'ABSPATH' ) ) {
	die( '-1' );
}

// Plugin constants
define( 'WPS_LIMIT_LOGIN_VERSION', '1.5.9.2' );
define( 'WPS_LIMIT_LOGIN_FOLDER', 'wps-limit-login' );
define( 'WPS_LIMIT_LOGIN_BASENAME', plugin_basename( __FILE__ ) );
if ( ! defined( 'WPS_PUB_API_URL' ) ) {
	define( 'WPS_PUB_API_URL', 'https://www.wpserveur.net/wp-json/' );
}

define( 'WPS_LIMIT_LOGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WPS_LIMIT_LOGIN_DIR', plugin_dir_path( __FILE__ ) );

define( 'WPS_LIMIT_LOGIN_REMOTE_ADDR', 'REMOTE_ADDR' );

$wps_limit_login_my_error_shown       = false;
$wps_limit_login_just_lockedout       = false;
$wps_limit_login_notempty_credentials = false;

require_once WPS_LIMIT_LOGIN_DIR . 'autoload.php';

// register_activation_hook( __FILE__, array( '\WPS\WPS_Limit_Login\Plugin', 'activate' ) );

if ( ! function_exists( 'plugins_loaded_wps_limit_login_plugin' ) ) {
	add_action( 'plugins_loaded', 'plugins_loaded_wps_limit_login_plugin' );
	function plugins_loaded_wps_limit_login_plugin() {
		\WPS\WPS_Limit_Login\Plugin::get_instance();

		load_plugin_textdomain( 'wps-limit-login', false, basename( rtrim( dirname( __FILE__ ), '/' ) ) . '/languages' );
	}
}