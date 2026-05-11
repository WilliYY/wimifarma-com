<?php
if ( ! function_exists( 'wimifarma_env' ) ) {
	function wimifarma_env( $name, $default = '' ) {
		$value = getenv( $name );
		if ( is_string( $value ) && trim( $value ) !== '' ) {
			return trim( $value );
		}

		if ( isset( $_ENV[ $name ] ) && is_string( $_ENV[ $name ] ) && trim( $_ENV[ $name ] ) !== '' ) {
			return trim( $_ENV[ $name ] );
		}

		if ( isset( $_SERVER[ $name ] ) && is_string( $_SERVER[ $name ] ) && trim( $_SERVER[ $name ] ) !== '' ) {
			return trim( $_SERVER[ $name ] );
		}

		return $default;
	}
}

//Begin Really Simple Security key
define('RSSSL_KEY', wimifarma_env( 'RSSSL_KEY', 'dev-rsssl-key-change-me' ));
//END Really Simple Security key

$wimifarma_forwarded_proto = strtolower( (string) ( $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '' ) );
$wimifarma_forwarded_ssl   = strtolower( (string) ( $_SERVER['HTTP_X_FORWARDED_SSL'] ?? '' ) );
$wimifarma_http_host       = strtolower( (string) ( $_SERVER['HTTP_HOST'] ?? '' ) );
$wimifarma_http_host_name  = preg_replace( '/:\d+$/', '', $wimifarma_http_host );
$wimifarma_public_hosts    = array( 'wimifarma.com', 'www.wimifarma.com' );
$wimifarma_is_public_host  = in_array( $wimifarma_http_host_name, $wimifarma_public_hosts, true );
$wimifarma_is_local_host   = in_array( $wimifarma_http_host, array( '127.0.0.1:3002', 'localhost:3002' ), true );

// Page cache is opt-in during migration. Stale SpeedyCache HTML can bypass
// WordPress filters and reintroduce http:// public assets on the home page.
$wimifarma_cache_env = $wimifarma_is_public_host
	? wimifarma_env( 'WIMIFARMA_PUBLIC_PAGE_CACHE', 'false' )
	: wimifarma_env( 'WP_CACHE', 'false' );
$wimifarma_cache_enabled = filter_var( $wimifarma_cache_env, FILTER_VALIDATE_BOOLEAN );
define( 'WP_CACHE', $wimifarma_cache_enabled ); // Added by SpeedyCache.

if ( $wimifarma_is_public_host && ! $wimifarma_cache_enabled && ! defined( 'DONOTCACHEPAGE' ) ) {
	define( 'DONOTCACHEPAGE', true );
}

if (
	in_array( 'https', array_map( 'trim', explode( ',', $wimifarma_forwarded_proto ) ), true )
	|| $wimifarma_forwarded_ssl === 'on'
	|| $wimifarma_is_public_host
) {
	$_SERVER['HTTPS']      = 'on';
	$_SERVER['SERVER_PORT'] = '443';

	if ( $wimifarma_is_public_host ) {
		$_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
		$_SERVER['HTTP_X_FORWARDED_SSL']   = 'on';
	}
}

/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', wimifarma_env( 'WIMIFARMA_WP_DB_NAME', 'wimifarma_wp' ) );

/** Database username */
define( 'DB_USER', wimifarma_env( 'WIMIFARMA_DB_USER', 'wimifarma_user' ) );

/** Database password */
define( 'DB_PASSWORD', wimifarma_env( 'WIMIFARMA_DB_PASSWORD', 'wimifarma_dev_pass' ) );

/** Database hostname */
define( 'DB_HOST', wimifarma_env( 'WIMIFARMA_DB_HOST', 'wimifarma-com-db' ) );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         wimifarma_env( 'WP_AUTH_KEY', 'dev-auth-key-change-me' ) );
define( 'SECURE_AUTH_KEY',  wimifarma_env( 'WP_SECURE_AUTH_KEY', 'dev-secure-auth-key-change-me' ) );
define( 'LOGGED_IN_KEY',    wimifarma_env( 'WP_LOGGED_IN_KEY', 'dev-logged-in-key-change-me' ) );
define( 'NONCE_KEY',        wimifarma_env( 'WP_NONCE_KEY', 'dev-nonce-key-change-me' ) );
define( 'AUTH_SALT',        wimifarma_env( 'WP_AUTH_SALT', 'dev-auth-salt-change-me' ) );
define( 'SECURE_AUTH_SALT', wimifarma_env( 'WP_SECURE_AUTH_SALT', 'dev-secure-auth-salt-change-me' ) );
define( 'LOGGED_IN_SALT',   wimifarma_env( 'WP_LOGGED_IN_SALT', 'dev-logged-in-salt-change-me' ) );
define( 'NONCE_SALT',       wimifarma_env( 'WP_NONCE_SALT', 'dev-nonce-salt-change-me' ) );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 *
 * At the installation time, database tables are created with the specified prefix.
 * Changing this value after WordPress is installed will make your site think
 * it has not been installed.
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/#table-prefix
 */
$table_prefix = 'wptl_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */

if ( $wimifarma_is_public_host ) {
	define( 'WP_HOME', 'https://wimifarma.com' );
	define( 'WP_SITEURL', 'https://wimifarma.com' );
	define( 'WP_CONTENT_URL', 'https://wimifarma.com/wp-content' );
	define( 'FORCE_SSL_ADMIN', true );
} elseif ( $wimifarma_is_local_host ) {
	define( 'WP_HOME', 'http://' . $wimifarma_http_host );
	define( 'WP_SITEURL', 'http://' . $wimifarma_http_host );
	define( 'DISABLE_WP_CRON', true );
}

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
