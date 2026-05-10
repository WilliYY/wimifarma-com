<?php
/*
Plugin Name: Captcha Code
Description: Adds captcha to front-end forms.
Version: 3.31
Author: WebFactory Ltd
Author URI: https://www.webfactoryltd.com/
License: GPL2

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License, version 2, as
published by the Free Software Foundation.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

// include only file
if (!defined('ABSPATH')) {
    wp_die(esc_html__('Do not open this file directly.', 'captcha-code-authentication'));
}

define('WP_CAPTCHA_CODE_URL', plugin_dir_url(__FILE__));
define('WP_CAPTCHA_CODE_DIR', dirname(__FILE__));
define('WP_CAPTCHA_CODE_OPTIONS', 'wp_captcha_code_options');
define('WP_CAPTCHA_CODE_POINTERS_KEY', 'wp_captcha_code_pointers');

require_once WP_CAPTCHA_CODE_DIR . '/wf-flyout/wf-flyout.php';

class WP_Captcha_Code
{
  static $version;
  static $options;

  static function init()
  {
    self::$version = self::get_plugin_version();
    $options = self::load_options();

    if (!session_id()) {
      @session_start();
    }

    if (is_admin()) {
      new wf_flyout(__FILE__);

      add_action('admin_menu',  array(__CLASS__, 'admin_menu'));
      add_action('wp_before_admin_bar_render', array(__CLASS__, 'admin_bar'));
      add_action('admin_enqueue_scripts', array(__CLASS__, 'admin_enqueue_scripts'));
      add_action('admin_action_wp_captcha_code_install_wp301', array(__CLASS__, 'install_wp301'));
      add_filter('admin_footer_text', array(__CLASS__, 'admin_footer_text'));
      add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'plugin_action_links'));
      add_action('wp_ajax_wp_captcha_code_dismiss_pointers', array(__CLASS__, 'dismiss_pointers'));
    } else {
      if ($options['enabled'] == 'yes' && $options['show_login'] == 'yes') {
        add_action('login_form', array(__CLASS__, 'captcha_for_login'));
        add_filter('login_errors', array(__CLASS__, 'captcha_login_errors'));
        add_filter('login_redirect', array(__CLASS__, 'captcha_login_redirect'), 10, 3);
      }

      if ($options['enabled'] == 'yes' && $options['show_comments'] == 'yes') {
        add_action('comment_form_after_fields', array(__CLASS__, 'captcha_comment_form'), 1);
        add_action('comment_form_logged_in_after', array(__CLASS__, 'captcha_comment_form'), 1);
        add_filter('preprocess_comment', array(__CLASS__, 'captcha_comment_post'));
      }

      if ($options['enabled'] == 'yes' && $options['show_registration'] == 'yes') {
        add_action('register_form', array(__CLASS__, 'wp_captcha_register'));
        add_action('register_post', array(__CLASS__, 'captcha_register_post'), 10, 3);
        add_action('signup_extra_fields', array(__CLASS__, 'wp_captcha_register'));
        add_filter('wpmu_validate_user_signup', array(__CLASS__, 'captcha_register_validate'));
      }

      if ($options['enabled'] == 'yes' && $options['show_lost_password'] == 'yes') {
        add_action('lostpassword_form', array(__CLASS__, 'captcha_lostpassword'));
        add_action('lostpassword_post', array(__CLASS__, 'captcha_lostpassword_post'), 10, 3);
      }
    }
  } // init


  // add settings link to plugins page
  static function plugin_action_links($links)
  {
    $settings_link = '<a href="' . admin_url('options-general.php?page=captcha-code-authentication') . '" title="Configure Captcha">Configure Captcha</a>';
    $pro_link = '<a href="' . admin_url('options-general.php?page=captcha-code-authentication#get-pro') . '" title="Get PRO"><b>Get PRO</b></a>';

    array_unshift($links, $settings_link);
    array_unshift($links, $pro_link);

    return $links;
  } // plugin_action_links

  static function admin_enqueue_scripts($hook)
  {
    if ('settings_page_captcha-code-authentication' == $hook) {
      wp_enqueue_style('wp-jquery-ui-dialog');
      wp_enqueue_style('wp-captcha-code-admin', WP_CAPTCHA_CODE_URL . 'css/wp-captcha-code.css', array(), self::$version);

      wp_enqueue_script('jquery-ui-core');
      wp_enqueue_script('jquery-ui-position');
      wp_enqueue_script('jquery-effects-core');
      wp_enqueue_script('jquery-effects-blind');
      wp_enqueue_script('jquery-ui-dialog');

      $js_localize = array(
        'wp301_install_url' => add_query_arg(array('action' => 'wp_captcha_code_install_wp301', '_wpnonce' => wp_create_nonce('install_wp301'), 'rnd' => wp_rand()), admin_url('admin.php'))
      );

      wp_enqueue_script('wp-captcha-code-admin', WP_CAPTCHA_CODE_URL . 'js/wp-captcha-code.js', array('jquery'), self::$version, true);
      wp_localize_script('wp-captcha-code-admin', 'wp_captcha_code_vars', $js_localize);
    } else {
      $pointers = get_option(WP_CAPTCHA_CODE_POINTERS_KEY);

      if ($pointers) {
        $pointers['dismiss_pointer_nonce'] = wp_create_nonce('wp_captcha_code_dismiss_pointer');
        wp_enqueue_script('wp-pointer');
        wp_enqueue_style('wp-pointer');
        wp_localize_script('wp-pointer', 'wp_captcha_code_pointers', $pointers);
      }

      if ($pointers) {
        wp_enqueue_script('wp-captcha-code-pointers', WP_CAPTCHA_CODE_URL . 'js/wp-captcha-code-pointers.js', array('jquery'), self::$version, true);
      }
    }
  } // admin_enqueue_scripts

  static function reset_pointers()
  {
    $pointers = array();
    $pointers['welcome'] = array('target' => '#menu-settings', 'edge' => 'left', 'align' => 'right', 'content' => 'Thank you for installing the <b style="font-weight: 800; font-variant: small-caps;">Captcha</b> plugin! Please open <a href="' . admin_url('options-general.php?page=captcha-code-authentication') . '">Settings -> Captcha</a> to set up your captcha and website protection settings.');

    update_option(WP_CAPTCHA_CODE_POINTERS_KEY, $pointers);
  } // reset_pointers

  static function dismiss_pointers()
  {
    check_ajax_referer('wp_captcha_code_dismiss_pointer');

    if (!current_user_can('manage_options')) {
        wp_send_json_error(__('You are not allowed to run this action.', 'captcha-code-authentication'));
    }

    delete_option(WP_CAPTCHA_CODE_POINTERS_KEY);
  }

  static function is_plugin_page()
  {
    $current_screen = get_current_screen();

    if ($current_screen->id == 'settings_page_captcha-code-authentication') {
      return true;
    } else {
      return false;
    }
  } // is_plugin_page

  static function admin_footer_text($text)
  {
    if (!self::is_plugin_page()) {
      return $text;
    }

    $text = '<i class="wp-captcha-code-footer">Captcha Code v' . self::$version . ' <a href="' . self::generate_web_link('admin_footer') . '" title="Visit WP Captcha page for more info" target="_blank">WebFactory Ltd</a>. Please <a target="_blank" href="https://wordpress.org/support/plugin/captcha-code-authentication/reviews/#new-post" title="Rate the plugin">rate the plugin <span>★★★★★</span></a> to help us spread the word. Thank you 🙌 from the WebFactory team!</i>';

    return $text;
  } // admin_footer_text

  static function generate_web_link($placement = '', $page = '/', $params = array(), $anchor = '')
  {
    $base_url = 'https://getwpcaptcha.com';

    if ('/' != $page) {
      $page = '/' . trim($page, '/') . '/';
    }
    if ($page == '//') {
      $page = '/';
    }

    $parts = array_merge(array('utm_source' => 'captcha-code-authentication', 'utm_content' => $placement), $params);

    if (!empty($anchor)) {
      $anchor = '#' . trim($anchor, '#');
    }

    $out = $base_url . $page . '?' . http_build_query($parts, '', '&amp;') . $anchor;

    return $out;
  } // generate_web_link

  static function load_options()
  {
    $options = get_option(WP_CAPTCHA_CODE_OPTIONS, array());
    $change = false;

    if (!isset($options['meta'])) {
      $options['meta'] = array('first_version' => self::$version, 'first_install' => current_time('timestamp', true), 'pointer' => true);
      self::reset_pointers();
      $change = true;
    } else if(!array_key_exists('pointer', $options['meta'])){
      $options['meta']['pointer'] = true;
      self::reset_pointers();
      $change = true;
    }

    if (!isset($options['dismissed_notices'])) {
      $options['dismissed_notices'] = array();
      $change = true;
    }

    if (!isset($options['options'])) {
      $options['options'] = array();
      $options['options']['enabled'] = get_option('wpcaptcha_enable') !== false ? get_option('wpcaptcha_enable') : 'no';
      $options['options']['show_login'] = get_option('wpcaptcha_login') !== false ? get_option('wpcaptcha_login') : 'yes';
      $options['options']['show_registration'] = get_option('wpcaptcha_register') !== false ? get_option('wpcaptcha_register') : 'yes';
      $options['options']['show_lost_password'] = get_option('wpcaptcha_lost') !== false ? get_option('wpcaptcha_lost') : 'yes';
      $options['options']['show_comments'] = get_option('wpcaptcha_comments') !== false ? get_option('wpcaptcha_comments') : 'yes';
      $options['options']['show_logged_in'] = get_option('wpcaptcha_registered') !== false ? get_option('wpcaptcha_registered') : 'no';
      $options['options']['captcha_type'] = get_option('wpcaptcha_type') !== false ? get_option('wpcaptcha_type') : 'alphanumeric';
      $options['options']['captcha_letters'] = get_option('wpcaptcha_letters') !== false ? get_option('wpcaptcha_letters') : 'capital';
      $options['options']['total_no_of_characters'] = get_option('wpcaptcha_total_no_of_characters') !== false ? get_option('wpcaptcha_total_no_of_characters') : 3;

      $change = true;
    } else if (!isset($options['options']['enabled'])) {
      $options['options']['enabled'] = 'yes';
      $change = true;
    }

    if (isset($_POST['submit']) && isset($_POST['wpcatpcha_update_admin_options_nonce'])) {
      if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wpcatpcha_update_admin_options_nonce'])), 'wpcatpcha_update_admin_options')) {
        echo '<div id="message" class="updated fade">
                    <p><strong>' . esc_html__('Sorry, your nonce did not verify.', 'captcha-code-authentication') . '</strong></p>
                </div>';
      } else {
        if (isset($_POST['captcha_enabled'])) {
          $options['options']['enabled'] = sanitize_text_field(wp_unslash($_POST['captcha_enabled']));
        }

        if (isset($_POST['captcha_show_login'])) {
          $options['options']['show_login'] = sanitize_text_field(wp_unslash($_POST['captcha_show_login']));
        }

        if (isset($_POST['captcha_show_registration'])) {
          $options['options']['show_registration'] = sanitize_text_field(wp_unslash($_POST['captcha_show_registration']));
        }

        if (isset($_POST['captcha_show_lost_password'])) {
          $options['options']['show_lost_password'] = sanitize_text_field(wp_unslash($_POST['captcha_show_lost_password']));
        }

        if (isset($_POST['captcha_show_comments'])) {
          $options['options']['show_comments'] = sanitize_text_field(wp_unslash($_POST['captcha_show_comments']));
        }

        if (isset($_POST['captcha_show_logged_in'])) {
          $options['options']['show_logged_in'] = sanitize_text_field(wp_unslash($_POST['captcha_show_logged_in']));
        }

        if (isset($_POST['captcha_type'])) {
          $options['options']['captcha_type'] = sanitize_text_field(wp_unslash($_POST['captcha_type']));
        }

        if (isset($_POST['captcha_letters'])) {
          $options['options']['captcha_letters'] = sanitize_text_field(wp_unslash($_POST['captcha_letters']));
        }

        if (isset($_POST['total_no_of_characters'])) {
          $options['options']['total_no_of_characters'] = sanitize_text_field(wp_unslash($_POST['total_no_of_characters']));
        }

        $change = true;

        echo '<div id="message" class="updated fade">
                    <p><strong>' . esc_html__('Options saved.', 'captcha-code-authentication') . '</strong></p>
                </div>';
      }
    }


    if ($change) {
      update_option(WP_CAPTCHA_CODE_OPTIONS, $options, true);
    }

    self::$options = $options;
    return $options['options'];
  } // load_options

  static function get_options()
  {
    return self::$options['options'];
  } // get_options

  static function update_options($key, $data)
  {
    if (false === in_array($key, array('meta', 'dismissed_notices', 'options'))) {
      user_error('Unknown options key.', E_USER_ERROR);
      return false;
    }

    self::$options[$key] = $data;
    $tmp = update_option(WP_CAPTCHA_CODE_OPTIONS, self::$options);

    return $tmp;
  } // update_options

  static function get_plugin_version()
  {
    $plugin_data = get_file_data(__FILE__, array('version' => 'Version'), 'plugin');

    return $plugin_data['version'];
  } // get_plugin_version

  static function admin_menu()
  {
    add_options_page(
      esc_html('Captcha'),
      esc_html('Captcha'),
      'manage_options',
      'captcha-code-authentication',
      array(__CLASS__, 'options_page')
    );
  } // admin_menu

  // add admin bar menu and status
    static function admin_bar()
    {
        global $wp_admin_bar;
        $options = self::get_options();
        // only show to admins
        if (false === current_user_can('administrator') || false === apply_filters('captcha_code_show_admin_bar', true)) { //phpcs:ignore
            return;
        }

        if (isset($options['enabled']) && $options['enabled'] == 'yes') {
            $main_label = '<img style="height: 17px; margin-bottom: -4px; padding-right: 3px; filter: grayscale(100%);" src="' . WP_CAPTCHA_CODE_URL . 'images/wp-captcha-icon.png" alt="' . esc_attr__('Captcha is enabled', 'captcha-code-authentication') . '" title="' . esc_attr__('Captcha is enabled', 'captcha-code-authentication') . '" /> <span class="ab-label">' . esc_attr__('Captcha is', 'captcha-code-authentication') . ' <b style="font-weight: 700;">ON</b></span>';
        } else {
            $main_label = '<img style="height: 17px; margin-bottom: -4px; padding-right: 3px; filter: grayscale(100%);" src="' . WP_CAPTCHA_CODE_URL . 'images/wp-captcha-icon.png" alt="' . esc_attr__('Captcha is disabled', 'captcha-code-authentication') . '" title="' . esc_attr__('Captcha is disabled', 'captcha-code-authentication') . '" /> <span class="ab-label">' . esc_attr__('Captcha is', 'captcha-code-authentication') . ' <b style="font-weight: 700;">OFF</b></span>';
        }

        $wp_admin_bar->add_menu(array(
            'parent' => '',
            'id'     => 'captcha-code',
            'title'  => $main_label,
            'href'   => admin_url('options-general.php?page=captcha-code-authentication'),
            'meta'   => array('class' => '')
        ));
    } // admin_bar

  static function captcha_for_login()
  {
    echo '<p class="login-form-captcha">
                <label><b>' . esc_html__('Captcha', 'captcha-code-authentication') . ' </b> <span class="required">*</span></label>
                <div style="clear:both;"></div><div style="clear:both;"></div>';
    self::generate_captcha_image();

    if (isset($_GET['captcha']) && $_GET['captcha'] == 'confirm_error') { //phpcs:ignore
      echo '<label style="color:#FF0000;" id="capt_err">' . esc_html(sanitize_text_field($_SESSION['captcha_error'] ?? '')) . '</label><div style="clear:both;"></div>';;
      $_SESSION['captcha_error'] = '';
    }

    echo '<label>' . esc_html__('Type the text displayed above', 'captcha-code-authentication') . ':</label>
                <input id="captcha_code" name="captcha_code" size="15" type="text" tabindex="30" />
                </p>';
    return true;
  } // captcha_for_login

  static function captcha_login_errors($errors)
  {
    //phpcs:ignore since request can come from non-nonced source
    if (isset($_REQUEST['action']) && 'register' == sanitize_text_field($_REQUEST['action'])) { //phpcs:ignore
      return ($errors);
    }

    if (sanitize_text_field($_SESSION['captcha_code'] ?? '') != sanitize_text_field($_REQUEST['captcha_code'])) { //phpcs:ignore
      return $errors . '<label id="capt_err" for="captcha_code_error">' . esc_html__('Captcha confirmation error!', 'captcha-code-authentication') . '</label>';
    }
    return $errors;
  } // captcha_login_errors

  static function captcha_login_redirect($url)
  {
    /* Captcha mismatch */
    //phpcs:ignore since request can come from non-nonced source
    if (empty($_REQUEST['captcha_code']) || (isset($_SESSION['captcha_code']) && esc_html($_SESSION['captcha_code']) != sanitize_text_field($_REQUEST['captcha_code']))) { //phpcs:ignore
      $_SESSION['captcha_error'] = esc_html__('Incorrect captcha confirmation!', 'captcha-code-authentication');
      wp_clear_auth_cookie();
      $request_url = sanitize_text_field(wp_unslash($_SERVER["REQUEST_URI"] ?? ''));
      return $request_url . "/?captcha='confirm_error'";
    }
    /* Captcha match: take to the admin panel */ else {
      return home_url('/wp-admin/');
    }
  } // captcha_login_redirect

  static function captcha_comment_form()
  {
    $options = self::get_options();

    if (is_user_logged_in() && $options['show_logged_in'] == 'yes') {
      return true;
    }

    echo '<p class="comment-form-captcha">
            <label><b>' . esc_html__('Captcha', 'captcha-code-authentication') . ' </b><span class="required">*</span></label>
            <div style="clear:both;"></div><div style="clear:both;"></div>';
    self::generate_captcha_image();
    echo '<label>' . esc_html__('Type the text displayed above', 'captcha-code-authentication') . ':</label>
            <input id="captcha_code" name="captcha_code" size="15" type="text" />
            <div style="clear:both;"></div>
            </p>';

    remove_action('comment_form', 'captcha_comment_form');

    return true;
  } // captcha_comment_form

  static function captcha_comment_post($comment)
  {
    $options = self::get_options();

    if (is_user_logged_in() && $options['show_logged_in'] == 'yes') {
      return $comment;
    }

    // skip captcha for comment replies from the admin menu
    if (
      isset($_REQUEST['action']) && $_REQUEST['action'] == 'replyto-comment' &&
      (check_ajax_referer('replyto-comment', '_ajax_nonce', false) || check_ajax_referer('replyto-comment', '_ajax_nonce-replyto-comment', false))
    ) {
      // skip captcha
      return $comment;
    }

    // Skip captcha for trackback or pingback
    if ($comment['comment_type'] != '' && $comment['comment_type'] != 'comment') {
      // skip captcha
      return $comment;
    }

    // If captcha is empty
    if (empty($_REQUEST['captcha_code']))
      wp_die(esc_html__('CAPTCHA cannot be empty.', 'captcha-code-authentication'));

    // captcha was matched
    $captcha_code = sanitize_text_field($_SESSION['captcha_code'] ?? '');
    if ($captcha_code == $_REQUEST['captcha_code']) {
      return ($comment);
    } else {
      wp_die(esc_html__('Error: Incorrect CAPTCHA. Press your browser\'s back button and try again.', 'captcha-code-authentication'));
    }
  } // captcha_comment_post

  static function wp_captcha_register($default)
  {
    echo '<p class="register-form-captcha">
                <label><b>' . esc_html__('Captcha', 'captcha-code-authentication') . ' </b><span class="required">*</span></label>
                <div style="clear:both;"></div><div style="clear:both;"></div>';
    self::generate_captcha_image();
    echo '<label>' . esc_html__('Type the text displayed above', 'captcha-code-authentication') . ':</label>
                <input id="captcha_code" name="captcha_code" size="15" type="text" />
                </p>';
    return true;
  } // wp_captcha_register

  static function captcha_register_post($login, $email, $errors)
  {
    //phpcs:ignore since request can come from non-nonced source
    // If captcha is blank - add error
    if (isset($_REQUEST['captcha_code']) && "" ==  $_REQUEST['captcha_code']) { //phpcs:ignore
      $errors->add('captcha_blank', '<strong>' . esc_html__('ERROR', 'captcha-code-authentication') . '</strong>: ' . esc_html__('Please complete the CAPTCHA.', 'captcha-code-authentication'));
      return $errors;
    }

    if (isset($_REQUEST['captcha_code']) && ($_SESSION['captcha_code'] == $_REQUEST['captcha_code'])) { //phpcs:ignore
      // captcha was matched
    } else {
      $errors->add('captcha_wrong', '<strong>' . esc_html__('ERROR', 'captcha-code-authentication') . '</strong>: ' . esc_html__('That CAPTCHA was incorrect.', 'captcha-code-authentication'));
    }
    return ($errors);
  } // captcha_register_post

  static function captcha_register_validate($results)
  {
    //phpcs:ignore since request can come from non-nonced source
    if (isset($_REQUEST['captcha_code']) && "" ==  $_REQUEST['captcha_code']) { //phpcs:ignore
      $results['errors']->add('captcha_blank', '<strong>' . esc_html__('ERROR', 'captcha-code-authentication') . '</strong>: ' . esc_html__('Please complete the CAPTCHA.', 'captcha-code-authentication'));
      return $results;
    }

    if (isset($_REQUEST['captcha_code']) && ($_SESSION['captcha_code'] == $_REQUEST['captcha_code'])) { //phpcs:ignore
      // captcha was matched
    } else {
      $results['errors']->add('captcha_wrong', '<strong>' . esc_html__('ERROR', 'captcha-code-authentication') . '</strong>: ' . esc_html__('That CAPTCHA was incorrect.', 'captcha-code-authentication'));
    }
    return ($results);
  } // captcha_register_validate

  static function captcha_lostpassword($default)
  {
    echo '<p class="lost-form-captcha">
            <label><b>' . esc_html__('Captcha', 'captcha-code-authentication') . ' </b><span class="required">*</span></label>
            <div style="clear:both;"></div><div style="clear:both;"></div>';
    self::generate_captcha_image();
    echo '<label>' . esc_html__('Type the text displayed above', 'captcha-code-authentication') . ':</label>
            <input id="captcha_code" name="captcha_code" size="15" type="text" />
            </p>';
  } // captcha_lostpassword

  static function captcha_lostpassword_post()
  {
    //phpcs:ignore since request can come from non-nonced source
    if (isset($_REQUEST['user_login']) && "" == $_REQUEST['user_login']) //phpcs:ignore
      return;

    // If captcha doesn't entered
    if (empty($_REQUEST['captcha_code'])) { //phpcs:ignore
      wp_die(esc_html__('Please complete the CAPTCHA.', 'captcha-code-authentication'));
    }

    // Check entered captcha
    $captcha_code = sanitize_text_field($_SESSION['captcha_code'] ?? '');
    if (isset($_REQUEST['captcha_code']) && ($captcha_code == $_REQUEST['captcha_code'])) { //phpcs:ignore
      return;
    } else {
      wp_die(esc_html__('Error: Incorrect CAPTCHA. Press your browser\'s back button and try again.', 'captcha-code-authentication'));
    }
  } // captcha_lostpassword_post

  static function generate_captcha_image()
  {
    $image_width = 120;
    $image_height = 40;

    $options = self::get_options();

    $font = WP_CAPTCHA_CODE_DIR . '/css/monofont.ttf';

    if (!empty($options['captcha_type']) && $options['captcha_type'] == 'alphanumeric') {
      switch ($options['captcha_letters']) {
        case 'capital':
          $possible_letters = '23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          break;
        case 'small':
          $possible_letters = '23456789bcdfghjkmnpqrstvwxyz';
          break;
        case 'capitalsmall':
          $possible_letters = '23456789bcdfghjkmnpqrstvwxyzABCEFGHJKMNPRSTVWXYZ';
          break;
        default:
          $possible_letters = '23456789bcdfghjkmnpqrstvwxyz';
          break;
      }
    } elseif (!empty($options['captcha_type']) && $options['captcha_type'] == 'alphabets') {
      switch ($options['captcha_letters']) {
        case 'capital':
          $possible_letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          break;
        case 'small':
          $possible_letters = 'bcdfghjkmnpqrstvwxyz';
          break;
        case 'capitalsmall':
          $possible_letters = 'bcdfghjkmnpqrstvwxyzABCEFGHJKMNPRSTVWXYZ';
          break;
        default:
          $possible_letters = 'abcdefghijklmnopqrstuvwxyz';
          break;
      }
    } elseif (!empty($options['captcha_type']) && $options['captcha_type'] == 'numbers') {
      $possible_letters = '0123456789';
    } else {
      $possible_letters = '0123456789';
    }
    $random_dots = 0;
    $random_lines = 20;
    $captcha_text_color = "0x142864";
    $captcha_noice_color = "0x142864";

    $code = '';

    $i = 0;
    while ($i < $options['total_no_of_characters']) {
      $code .= substr($possible_letters, wp_rand(0, strlen($possible_letters) - 1), 1);
      $i++;
    }

    $font_size = $image_height * 0.75;
    $image = @imagecreate($image_width, $image_height);

    /* setting the background, text and noise colours here */
    imagecolorallocate($image, 255, 255, 255);

    $arr_text_color = self::captcha_hexrgb($captcha_text_color);
    $text_color = imagecolorallocate(
      $image,
      $arr_text_color['red'],
      $arr_text_color['green'],
      $arr_text_color['blue']
    );

    $arr_noice_color = self::captcha_hexrgb($captcha_noice_color);
    $image_noise_color = imagecolorallocate(
      $image,
      $arr_noice_color['red'],
      $arr_noice_color['green'],
      $arr_noice_color['blue']
    );

    /* generating the dots randomly in background */
    for ($i = 0; $i < $random_dots; $i++) {
      imagefilledellipse($image, wp_rand(0, $image_width), wp_rand(0, $image_height), 2, 3, $image_noise_color);
    }

    /* generating lines randomly in background of image */
    for ($i = 0; $i < $random_lines; $i++) {
      imageline($image, wp_rand(0, $image_width), wp_rand(0, $image_height), wp_rand(0, $image_width), wp_rand(0, $image_height), $image_noise_color);
    }

    /* create a text box and add 6 letters code in it */
    $textbox = imagettfbbox($font_size, 0, $font, $code);
    $x = ($image_width - $textbox[4]) / 2;
    $y = ($image_height - $textbox[5]) / 2;
    imagettftext($image, $font_size, 0, (int)$x, (int)$y, $text_color, $font, $code);

    ob_start();
    imagejpeg($image); //showing the image
    echo '<img src="data:image/png;base64,' . esc_html(base64_encode(ob_get_clean())) . '" width="100">';

    $_SESSION['captcha_code'] = $code;
  } // generate_captcha_image

  static function captcha_hexrgb($hexstr)
  {
    $int = hexdec($hexstr);

    return array(
      "red" => 0xFF & ($int >> 0x10),
      "green" => 0xFF & ($int >> 0x8),
      "blue" => 0xFF & $int
    );
  } // captcha_hexrgb

  static function create_select_options($options, $selected = null, $output = true)
  {
    $out = "\n";

    foreach ($options as $tmp) {
      if ((is_array($selected) && in_array($tmp['val'], $selected)) || $selected == $tmp['val']) {
        $out .= "<option selected=\"selected\" value=\"{$tmp['val']}\" " . (isset($tmp['class']) ? "class=\"{$tmp['class']}\"" : "") . ">{$tmp['label']}&nbsp;</option>\n";
      } else {
        $out .= "<option value=\"{$tmp['val']}\" " . (isset($tmp['class']) ? "class=\"{$tmp['class']}\"" : "") . ">{$tmp['label']}&nbsp;</option>\n";
      }
    }

    if ($output) {
      self::wp_kses_wf($out);
    } else {
      return $out;
    }
  } //  create_select_options

  static function options_page()
  {
    $options = self::get_options();

    // auto remove welcome pointer when options are opened
    $pointers = get_option(WP_CAPTCHA_CODE_POINTERS_KEY);
    if (isset($pointers['welcome'])) {
      unset($pointers['welcome']);
      update_option(WP_CAPTCHA_CODE_POINTERS_KEY, $pointers);
    }

    echo '<div class="wrap">';
    echo '<h1><img src="' . esc_url(WP_CAPTCHA_CODE_URL . '/images/wp-captcha-logo.png') . '" alt="WP Captcha PRO" title="WP Captcha PRO"></h1>';
    echo '<form method="post" action="">';
    echo '<div id="wp_captcha_code_settings">';
    wp_nonce_field('wpcatpcha_update_admin_options', 'wpcatpcha_update_admin_options_nonce');
    echo '<table class="form-table">';
    $captcha = array();
    $captcha[] = array('val' => 'builtin', 'label' => 'Built-in Captcha');
    $captcha[] = array('val' => 'icons', 'label' => 'Built-in Icon Captcha', 'class' => 'pro-option');
    $captcha[] = array('val' => 'recaptchav2', 'label' => 'Google reCAPTCHA v2', 'class' => 'pro-option');
    $captcha[] = array('val' => 'recaptchav3', 'label' => 'Google reCAPTCHA v3', 'class' => 'pro-option');
    $captcha[] = array('val' => 'hcaptcha', 'label' => 'hCaptcha', 'class' => 'pro-option');
    $captcha[] = array('val' => 'cloudflare', 'label' => 'Cloudflare Turnstile', 'class' => 'pro-option');

    echo '<tr valign="top">
                        <th scope="row"><label for="captcha_enabled">' . esc_html__('Enable Captcha Protection', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select name="captcha_enabled" id="captcha_enabled" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['enabled'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['enabled'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>';
    echo '<tr valign="top">
        <th scope="row"><label for="captcha">Captcha Type:</label></th>
        <td><select id="cc-captcha" name="">';
    self::create_select_options($captcha, 'builtin');
    echo '</select>';
    echo '</td></tr>';
    echo '<tr valign="top">
                        <th scope="row" style="width:260px;"><label for="captcha_letters">' . esc_html__('Select Captcha letters type', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select id="captcha_letters" name="captcha_letters" style="margin:0;">
                                <option value="capital" ' . ($options['captcha_letters'] == 'capital' ? 'selected="selected"' : '') . '>' . esc_html__('Capital letters only', 'captcha-code-authentication') . '</option>
                                <option value="small" ' . ($options['captcha_letters'] == 'small' ? 'selected="selected"' : '') . '>' . esc_html__('Small letters only', 'captcha-code-authentication') . '</option>
                                <option value="capitalsmall" ' . ($options['captcha_letters'] == 'capitalsmall' ? 'selected="selected"' : '') . '>' . esc_html__('Capital & Small letters', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="captcha_type">' . esc_html__('Select a Captcha type', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select id="captcha_type" name="captcha_type" style="margin:0;">
                                <option value="alphanumeric" ' . ($options['captcha_type'] == 'alphanumeric' ? 'selected="selected"' : '') . '>' . esc_html__('Alphanumeric', 'captcha-code-authentication') . '</option>
                                <option value="alphabets" ' . ($options['captcha_type'] == 'alphabets' ? 'selected="selected"' : '') . '>' . esc_html__('Alphabets only', 'captcha-code-authentication') . '</option>
                                <option value="numbers" ' . ($options['captcha_type'] == 'numbers' ? 'selected="selected"' : '') . '>' . esc_html__('Numbers only', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="total_no_of_characters">' . esc_html__('Total number of Captcha Characters', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select id="total_no_of_characters" name="total_no_of_characters" style="margin:0;width: 50px;">';
    for ($i = 3; $i <= 6; $i++) {
      echo '<option value="' . intval($i) . '" ';
      if ($options['total_no_of_characters'] == $i) echo 'selected="selected"';
      echo '>' . intval($i) . '</option>';
    }
    echo '</select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="stats">' . esc_html__('Stats', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <a href="#" class="button open-upsell" data-feature="cc-stats">Show Stats</a><p class="description">This is a <b>PRO</b> feature.</p></a>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="firewall">' . esc_html__('Firewall & Country Blocking', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <a href="#" class="button open-upsell" data-feature="cc-firewall">Configure Firewall</a><p class="description">This is a <b>PRO</b> feature.</p></a>
                        </td>
                    </tr>
                    <tr height="60">
                        <td>';
    submit_button();
    echo '</td>
                        <td></td>
                    </tr>
                </table>
                <h3>' . esc_html__('Display Options', 'captcha-code-authentication') . '</h3>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row" style="width:260px;"><label for="captcha_show_login">' . esc_html__("Enable Captcha for Login form", "captcha-code-authentication") . ':</label></th>
                        <td>
                            <select name="captcha_show_login" id="captcha_show_login" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['show_login'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['show_login'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="captcha_show_registration">' . esc_html__('Enable Captcha for Register form', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select name="captcha_show_registration" id="captcha_show_registration" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['show_registration'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['show_registration'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="captcha_show_lost_password">' . esc_html__('Enable Captcha for Lost Password form', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select name="captcha_show_lost_password" id="captcha_show_lost_password" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['show_lost_password'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['show_lost_password'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="captcha_show_comments">' . esc_html__('Enable Captcha for Comments form', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select name="captcha_show_comments" id="captcha_show_comments" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['show_comments'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['show_comments'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr valign="top">
                        <th scope="row"><label for="captcha_show_logged_in">' . esc_html__('Hide Captcha for logged in users', 'captcha-code-authentication') . ':</label></th>
                        <td>
                            <select name="captcha_show_logged_in" id="captcha_show_logged_in" style="width:75px;margin:0;">
                                <option value="yes" ' . ($options['show_logged_in'] == 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('Yes', 'captcha-code-authentication') . '</option>
                                <option value="no" ' . ($options['show_logged_in'] != 'yes' ? 'selected="selected"' : '') . '>' . esc_html__('No', 'captcha-code-authentication') . '</option>
                            </select>
                        </td>
                    </tr>
                    <tr height="60">
                        <td>';
    submit_button();
    echo '</td>
                        <td></td>
                    </tr>
                </table>';

    echo '</div>';

    echo '<div id="wp_captcha_code_sidebar">';
    echo '<div class="sidebar-box pro-ad-box">
                <p class="text-center"><a href="#" data-pro-feature="cc-sidebar-box-logo" class="open-pro-dialog">
                <img src="' . esc_url(WP_CAPTCHA_CODE_URL . '/images/wp-captcha-logo.png') . '" alt="WP Captcha PRO" title="WP Captcha PRO"></a><br><b>PRO version is here! Grab the launch discount.</b></p>
                <ul class="plain-list">
                    <li>7 Types of Captcha + GDPR Compatibility</li>
                    <li>Login Page Customization - Visual &amp; URL</li>
                    <li>Advanced Login Page Protection</li>
                    <li>Email Based Two Factor Authentication (2FA)</li>
                    <li>Advanced Firewall + Cloud Blacklists</li>
                    <li>Country Blocking (whitelist &amp; blacklist)</li>
                    <li>Temporary Access Links</li>
                    <li>Recovery URL - You Can Never Get Locked Out</li>
                    <li>Licenses &amp; Sites Manager (remote SaaS dashboard)</li>
                    <li>White-label Mode</li>
                    <li>Complete Codeless Plugin Rebranding</li>
                    <li>Email support from plugin developers</li>
                </ul>

                <p class="text-center"><a href="#" class="open-pro-dialog button button-buy" data-pro-feature="cc-sidebar-box">Get PRO Now</a></p>
                </div>';

    if (!defined('EPS_REDIRECT_VERSION') && !defined('WF301_PLUGIN_FILE')) {
      echo '<div class="sidebar-box pro-ad-box box-301">
                <h3 class="textcenter"><b>Problems with redirects?<br>Moving content around or changing posts\' URL?<br>Old URLs giving you problems?<br><br><u>Improve your SEO &amp; manage all redirects in one place!</u></b></h3>

                <p class="text-center"><a href="#" class="install-wp301">
                <img src="' . esc_url(WP_CAPTCHA_CODE_URL . '/images/wp-301-logo.png') . '" alt="WP 301 Redirects" title="WP 301 Redirects"></a></p>

                <p class="text-center"><a href="#" class="button button-buy install-wp301">Install and activate the <u>free</u> WP 301 Redirects plugin</a></p>

                <p><a href="https://wordpress.org/plugins/eps-301-redirects/" target="_blank">WP 301 Redirects</a> is a free WP plugin maintained by the same team as this WP Captcha plugin. It has <b>+250,000 users, 5-star rating</b>, and is hosted on the official WP repository.</p>
                </div>';
    }

    echo '<div class="sidebar-box" style="margin-top: 35px; margin-bottom: 35px;">
    <p>Need help? Ask on the <a href="https://wordpress.org/support/plugin/captcha-code-authentication/" target="_blank">support forum</a>. We\'ll answer ASAP!</p>
                <p>Please <a href="https://wordpress.org/support/plugin/captcha-code-authentication/reviews/#new-post" target="_blank">rate the plugin ★★★★★</a> to <b>keep it up-to-date &amp; maintained</b>. It only takes a second to rate. Thank you! 👋</p>
                </div>';
    echo '</div>';

    echo '</form>';

    echo ' <div id="wp-captcha-code-pro-dialog" style="display: none;" title="WP Captcha PRO is here!"><span class="ui-helper-hidden-accessible"><input type="text"/></span>

            <div class="center logo"><a href="https://getwpcaptcha.com/?ref=wp-captcha-code-free-pricing-table" target="_blank"><img src="' . esc_url(WP_CAPTCHA_CODE_URL . '/images/wp-captcha-logo.png') . '" alt="WP Captcha PRO" title="WP Captcha PRO"></a><br>

            <span>Grab the limited PRO <b>Launch Discount</b></span>
            </div>

            <table id="wp-captcha-code-pro-table">
            <tr>
            <td class="center">Personal License</td>
            <td class="center">Team License</td>
            <td class="center">Agency License</td>
            </tr>

            <tr class="prices">
            <td class="center"><span><del>$59</del> $49</span> <b>/year</b></td>
            <td class="center"><span><del>$119</del> $99</span> <b>/year</b></td>
            <td class="center"><span><del>$149</del> $119</span> <b>/year</b></td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span><b>1 Site License</b>  ($49 per site)</td>
            <td><span class="dashicons dashicons-yes"></span><b>5 Sites License</b>  ($20 per site)</td>
            <td><span class="dashicons dashicons-yes"></span><b>100 Sites License</b>  ($1.2 per site)</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>All Plugin Features</td>
            <td><span class="dashicons dashicons-yes"></span>All Plugin Features</td>
            <td><span class="dashicons dashicons-yes"></span>All Plugin Features</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>7 Types of Captcha</td>
            <td><span class="dashicons dashicons-yes"></span>7 Types of Captcha</td>
            <td><span class="dashicons dashicons-yes"></span>7 Types of Captcha</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>Advanced Firewall + Cloud Blacklists</td>
            <td><span class="dashicons dashicons-yes"></span>Advanced Firewall + Cloud Blacklists</td>
            <td><span class="dashicons dashicons-yes"></span>Advanced Firewall + Cloud Blacklists</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>Login Page Customization</td>
            <td><span class="dashicons dashicons-yes"></span>Login Page Customization</td>
            <td><span class="dashicons dashicons-yes"></span>Login Page Customization</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>Email Based 2FA</td>
            <td><span class="dashicons dashicons-yes"></span>Email Based 2FA</td>
            <td><span class="dashicons dashicons-yes"></span>Email Based 2FA</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>Temporary Access Links</td>
            <td><span class="dashicons dashicons-yes"></span>Temporary Access Links</td>
            <td><span class="dashicons dashicons-yes"></span>Temporary Access Links</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>Country Blocking</td>
            <td><span class="dashicons dashicons-yes"></span>Country Blocking</td>
            <td><span class="dashicons dashicons-yes"></span>Country Blocking</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-yes"></span>SaaS Dashboard</td>
            <td><span class="dashicons dashicons-yes"></span>SaaS Dashboard</td>
            <td><span class="dashicons dashicons-yes"></span>SaaS Dashboard</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-no"></span>White-label Mode</td>
            <td><span class="dashicons dashicons-yes"></span>White-label Mode</td>
            <td><span class="dashicons dashicons-yes"></span>White-label Mode</td>
            </tr>

            <tr>
            <td><span class="dashicons dashicons-no"></span>Full Plugin Rebranding</td>
            <td><span class="dashicons dashicons-no"></span>Full Plugin Rebranding</td>
            <td><span class="dashicons dashicons-yes"></span>Full Plugin Rebranding</td>
            </tr>

            <tr>
            <td><a class="button button-buy" data-href-org="https://getwpcaptcha.com/buy/?product=personal-yearly-launch&ref=pricing-table" href="https://getwpcaptcha.com/buy/?product=personal-yearly-launch&ref=pricing-table" target="_blank"><del>$59</del> $49 <small>/y</small><br>BUY NOW</a>
            <br>or <a class="button-buy" data-href-org="https://getwpcaptcha.com/buy/?product=personal-ltd-launch&ref=pricing-table" href="https://getwpcaptcha.com/buy/?product=personal-ltd-launch&ref=pricing-table" target="_blank">only <del>$99</del> $79 for a lifetime license</a></td>
            <td><a class="button button-buy" data-href-org="https://getwpcaptcha.com/buy/?product=team-yearly-launch&ref=pricing-table" href="https://getwpcaptcha.com/buy/?product=team-yearly-launch&ref=pricing-table" target="_blank"><del>$119</del> $99 <small>/y</small><br>BUY NOW</a></td>
            <td><a class="button button-buy" data-href-org="https://getwpcaptcha.com/buy/?product=agency-yearly-launch&ref=pricing-table" href="https://getwpcaptcha.com/buy/?product=agency-yearly-launch&ref=pricing-table" target="_blank"><del>$149</del> $119 <small>/y</small><br>BUY NOW</a></td>
            </tr>

            </table>

            <div class="center footer"><b>100% No-Risk Money Back Guarantee!</b> If you don\'t like the plugin over the next 7 days, we will happily refund 100% of your money. No questions asked! Payments are processed by our merchant of records - <a href="https://paddle.com/" target="_blank">Paddle</a>.</div>
          </div>';
    echo '</div>';
  } // options_page

  static function install_wp301()
  {
    check_ajax_referer('install_wp301');

    if (false === current_user_can('administrator')) {
      wp_die('Sorry, you have to be an admin to run this action.');
    }

    $plugin_slug = 'eps-301-redirects/eps-301-redirects.php';
    $plugin_zip = 'https://downloads.wordpress.org/plugin/eps-301-redirects.latest-stable.zip';

    @include_once ABSPATH . 'wp-admin/includes/plugin.php';
    @include_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
    @include_once ABSPATH . 'wp-admin/includes/plugin-install.php';
    @include_once ABSPATH . 'wp-admin/includes/file.php';
    @include_once ABSPATH . 'wp-admin/includes/misc.php';
    echo '<style>
		body{
			font-family: sans-serif;
			font-size: 14px;
			line-height: 1.5;
			color: #444;
		}
		</style>';

    echo '<div style="margin: 20px; color:#444;">';
    echo 'If things are not done in a minute <a target="_parent" href="' . esc_url(admin_url('plugin-install.php?s=301%20redirects%20webfactory&tab=search&type=term')) . '">install the plugin manually via Plugins page</a><br><br>';
    echo 'Starting ...<br><br>';

    wp_cache_flush();
    $upgrader = new Plugin_Upgrader();
    echo 'Check if WP 301 Redirects is already installed ... <br />';
    if (self::is_plugin_installed($plugin_slug)) {
      echo 'WP 301 Redirects is already installed! <br /><br />Making sure it\'s the latest version.<br />';
      $upgrader->upgrade($plugin_slug);
      $installed = true;
    } else {
      echo 'Installing WP 301 Redirects.<br />';
      $installed = $upgrader->install($plugin_zip);
    }
    wp_cache_flush();

    if (!is_wp_error($installed) && $installed) {
      echo 'Activating WP 301 Redirects.<br />';
      $activate = activate_plugin($plugin_slug);

      if (is_null($activate)) {
        echo 'WP 301 Redirects Activated.<br />';

        echo '<script>setTimeout(function() { top.location = "' . esc_url(admin_url('options-general.php?page=eps_redirects')) . '"; }, 1000);</script>';
        echo '<br>If you are not redirected in a few seconds - <a href="' . esc_url(admin_url('options-general.php?page=eps_redirects')) . '" target="_parent">click here</a>.';
      }
    } else {
      echo 'Could not install WP 301 Redirects. You\'ll have to <a target="_parent" href="' . esc_url(admin_url('plugin-install.php?s=301%20redirects%20webfactory&tab=search&type=term')) . '">download and install manually</a>.';
    }

    echo '</div>';
  } // install_wp301

  static function is_plugin_installed($slug)
  {
    if (!function_exists('get_plugins')) {
      require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }
    $all_plugins = get_plugins();

    if (!empty($all_plugins[$slug])) {
      return true;
    } else {
      return false;
    }
  } // is_plugin_installed

  static function wp_kses_wf($html)
  {
    add_filter('safe_style_css', function ($styles) {
      $styles_wf = array(
        'text-align',
        'margin',
        'color',
        'float',
        'border',
        'background',
        'background-color',
        'border-bottom',
        'border-bottom-color',
        'border-bottom-style',
        'border-bottom-width',
        'border-collapse',
        'border-color',
        'border-left',
        'border-left-color',
        'border-left-style',
        'border-left-width',
        'border-right',
        'border-right-color',
        'border-right-style',
        'border-right-width',
        'border-spacing',
        'border-style',
        'border-top',
        'border-top-color',
        'border-top-style',
        'border-top-width',
        'border-width',
        'caption-side',
        'clear',
        'cursor',
        'direction',
        'font',
        'font-family',
        'font-size',
        'font-style',
        'font-variant',
        'font-weight',
        'height',
        'letter-spacing',
        'line-height',
        'margin-bottom',
        'margin-left',
        'margin-right',
        'margin-top',
        'overflow',
        'padding',
        'padding-bottom',
        'padding-left',
        'padding-right',
        'padding-top',
        'text-decoration',
        'text-indent',
        'vertical-align',
        'width',
        'display',
      );

      foreach ($styles_wf as $style_wf) {
        $styles[] = $style_wf;
      }
      return $styles;
    });

    $allowed_tags = wp_kses_allowed_html('post');
    $allowed_tags['input'] = array(
      'type' => true,
      'style' => true,
      'class' => true,
      'id' => true,
      'checked' => true,
      'disabled' => true,
      'name' => true,
      'size' => true,
      'placeholder' => true,
      'value' => true,
      'data-*' => true,
      'size' => true,
      'disabled' => true
    );

    $allowed_tags['textarea'] = array(
      'type' => true,
      'style' => true,
      'class' => true,
      'id' => true,
      'checked' => true,
      'disabled' => true,
      'name' => true,
      'size' => true,
      'placeholder' => true,
      'value' => true,
      'data-*' => true,
      'cols' => true,
      'rows' => true,
      'disabled' => true,
      'autocomplete' => true
    );

    $allowed_tags['select'] = array(
      'type' => true,
      'style' => true,
      'class' => true,
      'id' => true,
      'checked' => true,
      'disabled' => true,
      'name' => true,
      'size' => true,
      'placeholder' => true,
      'value' => true,
      'data-*' => true,
      'multiple' => true,
      'disabled' => true
    );

    $allowed_tags['option'] = array(
      'type' => true,
      'style' => true,
      'class' => true,
      'id' => true,
      'checked' => true,
      'disabled' => true,
      'name' => true,
      'size' => true,
      'placeholder' => true,
      'value' => true,
      'selected' => true,
      'data-*' => true
    );

    $allowed_tags['optgroup'] = array(
      'type' => true,
      'style' => true,
      'class' => true,
      'id' => true,
      'checked' => true,
      'disabled' => true,
      'name' => true,
      'size' => true,
      'placeholder' => true,
      'value' => true,
      'selected' => true,
      'data-*' => true,
      'label' => true
    );

    $allowed_tags['a'] = array(
      'href' => true,
      'data-*' => true,
      'class' => true,
      'style' => true,
      'id' => true,
      'target' => true,
      'data-*' => true,
      'role' => true,
      'aria-controls' => true,
      'aria-selected' => true,
      'disabled' => true
    );

    $allowed_tags['div'] = array(
      'style' => true,
      'class' => true,
      'id' => true,
      'data-*' => true,
      'role' => true,
      'aria-labelledby' => true,
      'value' => true,
      'aria-modal' => true,
      'tabindex' => true
    );

    $allowed_tags['li'] = array(
      'style' => true,
      'class' => true,
      'id' => true,
      'data-*' => true,
      'role' => true,
      'aria-labelledby' => true,
      'value' => true,
      'aria-modal' => true,
      'tabindex' => true
    );

    $allowed_tags['span'] = array(
      'style' => true,
      'class' => true,
      'id' => true,
      'data-*' => true,
      'aria-hidden' => true
    );

    $allowed_tags['style'] = array(
      'class' => true,
      'id' => true,
      'type' => true,
      'style' => true
    );

    $allowed_tags['fieldset'] = array(
      'class' => true,
      'id' => true,
      'type' => true,
      'style' => true
    );

    $allowed_tags['link'] = array(
      'class' => true,
      'id' => true,
      'type' => true,
      'rel' => true,
      'href' => true,
      'media' => true,
      'style' => true
    );

    $allowed_tags['form'] = array(
      'style' => true,
      'class' => true,
      'id' => true,
      'method' => true,
      'action' => true,
      'data-*' => true,
      'style' => true
    );

    $allowed_tags['script'] = array(
      'class' => true,
      'id' => true,
      'type' => true,
      'src' => true,
      'style' => true
    );

    $allowed_tags['table'] = array(
      'class' => true,
      'id' => true,
      'type' => true,
      'cellpadding' => true,
      'cellspacing' => true,
      'border' => true,
      'style' => true
    );

    $allowed_tags['canvas'] = array(
      'class' => true,
      'id' => true,
      'style' => true
    );

    echo wp_kses($html, $allowed_tags);

    add_filter('safe_style_css', function ($styles) {
      $styles_wf = array(
        'text-align',
        'margin',
        'color',
        'float',
        'border',
        'background',
        'background-color',
        'border-bottom',
        'border-bottom-color',
        'border-bottom-style',
        'border-bottom-width',
        'border-collapse',
        'border-color',
        'border-left',
        'border-left-color',
        'border-left-style',
        'border-left-width',
        'border-right',
        'border-right-color',
        'border-right-style',
        'border-right-width',
        'border-spacing',
        'border-style',
        'border-top',
        'border-top-color',
        'border-top-style',
        'border-top-width',
        'border-width',
        'caption-side',
        'clear',
        'cursor',
        'direction',
        'font',
        'font-family',
        'font-size',
        'font-style',
        'font-variant',
        'font-weight',
        'height',
        'letter-spacing',
        'line-height',
        'margin-bottom',
        'margin-left',
        'margin-right',
        'margin-top',
        'overflow',
        'padding',
        'padding-bottom',
        'padding-left',
        'padding-right',
        'padding-top',
        'text-decoration',
        'text-indent',
        'vertical-align',
        'width'
      );

      foreach ($styles_wf as $style_wf) {
        if (($key = array_search($style_wf, $styles)) !== false) {
          unset($styles[$key]);
        }
      }
      return $styles;
    });
  } // is_plugin_installed

  static function activate()
  {
    self::reset_pointers();
  } // activate
} // WP_Captcha_Code

register_activation_hook(__FILE__, array('WP_Captcha_Code', 'activate'));
add_action('init', array('WP_Captcha_Code', 'init'));

