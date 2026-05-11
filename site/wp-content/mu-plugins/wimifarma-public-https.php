<?php
/**
 * Force canonical HTTPS URLs for public Wimifarma hosts.
 *
 * The production WordPress runs behind Nginx Proxy Manager. Some plugins build
 * asset URLs from the internal HTTP request, so this MU plugin normalizes the
 * public output to HTTPS as a final safety layer.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function wimifarma_public_https_host() {
	$host = strtolower( (string) ( $_SERVER['HTTP_HOST'] ?? '' ) );
	$host = preg_replace( '/:\d+$/', '', $host );

	return in_array( $host, array( 'wimifarma.com', 'www.wimifarma.com' ), true );
}

function wimifarma_public_https_url( $url ) {
	if ( ! wimifarma_public_https_host() || ! is_string( $url ) || $url === '' ) {
		return $url;
	}

	return str_replace(
		array(
			'http://www.wimifarma.com',
			'https://www.wimifarma.com',
			'http://wimifarma.com',
		),
		'https://wimifarma.com',
		$url
	);
}

function wimifarma_public_https_filter_url( $url ) {
	return wimifarma_public_https_url( $url );
}

add_filter( 'home_url', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'site_url', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'content_url', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'includes_url', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'plugins_url', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'stylesheet_directory_uri', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'template_directory_uri', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'theme_file_uri', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'script_loader_src', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'style_loader_src', 'wimifarma_public_https_filter_url', 999 );
add_filter( 'wp_redirect', 'wimifarma_public_https_filter_url', 999 );

add_action(
	'template_redirect',
	static function () {
		if ( is_admin() || ! wimifarma_public_https_host() ) {
			return;
		}

		ob_start( 'wimifarma_public_https_url' );
	},
	0
);
