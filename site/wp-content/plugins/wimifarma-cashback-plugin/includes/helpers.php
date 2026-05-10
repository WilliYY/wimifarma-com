<?php
if (!defined('ABSPATH')) {
    exit;
}

function wfwc_default_settings()
{
    return array(
        'cashback_percent'             => 5,
        'cashback_expiration_days'     => 45,
        'cashback_redeem_multiplier'   => 4,
        'purchase_webhook_url'         => '',
        'birthday_webhook_url'         => '',
        'expiration_webhook_url'       => '',
        'webhook_token'                => '',
        'webhook_retry_enabled'        => 1,
        'webhook_retry_attempts'       => 3,
        'webhook_retry_delay_minutes'  => 15,
        'message_purchase'             => 'Obrigado pela compra, {client_name}. Voce recebeu {cashback_generated_formatted} de cashback e ele expira em {expires_at_formatted}.',
        'message_birthday'             => 'Feliz aniversario, {client_name}. A equipe Wimifarma deseja um dia especial para voce.',
        'message_expiration'           => 'Ola, {client_name}. Seu cashback de {expiring_amount_formatted} expira em {expires_at_formatted}.',
        'enable_purchase_automation'   => 1,
        'enable_birthday_automation'   => 1,
        'enable_expiration_automation' => 1,
        'expiration_alert_days'        => '10,5',
        'allow_public_lookup'          => 0,
    );
}

function wfwc_get_settings()
{
    return array_merge(wfwc_default_settings(), (array) get_option(WFWC_OPTION_SETTINGS, array()));
}

function wfwc_get_setting($key, $default = null)
{
    $settings = wfwc_get_settings();
    return array_key_exists($key, $settings) ? $settings[$key] : $default;
}

function wfwc_to_decimal($value)
{
    if (is_float($value) || is_int($value)) {
        return round((float) $value, 2);
    }

    $value = trim((string) $value);
    $value = str_replace(array('R$', ' '), '', $value);

    if (false !== strpos($value, ',') && false !== strpos($value, '.')) {
        $value = str_replace('.', '', $value);
        $value = str_replace(',', '.', $value);
    } elseif (false !== strpos($value, ',')) {
        $value = str_replace(',', '.', $value);
    }

    return round((float) $value, 2);
}

function wfwc_format_currency($amount)
{
    return 'R$ ' . number_format((float) $amount, 2, ',', '.');
}

function wfwc_format_datetime($value, $include_time = true)
{
    if (empty($value)) {
        return '-';
    }

    $timestamp = strtotime((string) $value);

    if (!$timestamp) {
        return '-';
    }

    return $include_time ? wp_date('d/m/Y H:i', $timestamp) : wp_date('d/m/Y', $timestamp);
}

function wfwc_format_phone($phone)
{
    $digits = preg_replace('/\D+/', '', (string) $phone);

    if (strlen($digits) === 11) {
        return sprintf('(%s) %s-%s', substr($digits, 0, 2), substr($digits, 2, 5), substr($digits, 7));
    }

    if (strlen($digits) === 10) {
        return sprintf('(%s) %s-%s', substr($digits, 0, 2), substr($digits, 2, 4), substr($digits, 6));
    }

    return $phone ?: 'Sem telefone';
}

function wfwc_sanitize_phone($phone)
{
    return preg_replace('/\D+/', '', (string) $phone);
}

function wfwc_current_mysql_time()
{
    return current_time('mysql');
}

function wfwc_render_template($template, $data = array())
{
    $path = WFWC_PLUGIN_DIR . 'templates/' . ltrim($template, '/');

    if (!file_exists($path)) {
        return '';
    }

    ob_start();
    extract($data, EXTR_SKIP);
    include $path;
    return ob_get_clean();
}

function wfwc_set_admin_notice($message, $type = 'success')
{
    $user_id = get_current_user_id();

    if (!$user_id && wfwc_portal_is_authenticated()) {
        wfwc_maybe_start_session();
        $_SESSION['wfwc_portal_notice'] = array(
            'message' => (string) $message,
            'type'    => (string) $type,
        );
        return;
    }

    if (!$user_id) {
        return;
    }

    set_transient(
        'wfwc_admin_notice_' . $user_id,
        array(
            'message' => (string) $message,
            'type'    => (string) $type,
        ),
        MINUTE_IN_SECONDS * 5
    );
}

function wfwc_get_admin_notice()
{
    $user_id = get_current_user_id();

    if (!$user_id && wfwc_portal_is_authenticated()) {
        wfwc_maybe_start_session();
        $notice = isset($_SESSION['wfwc_portal_notice']) && is_array($_SESSION['wfwc_portal_notice'])
            ? $_SESSION['wfwc_portal_notice']
            : array();

        unset($_SESSION['wfwc_portal_notice']);

        return $notice;
    }

    if (!$user_id) {
        return array();
    }

    $key    = 'wfwc_admin_notice_' . $user_id;
    $notice = get_transient($key);

    if ($notice) {
        delete_transient($key);
    }

    return is_array($notice) ? $notice : array();
}

function wfwc_redirect($url)
{
    wp_safe_redirect($url);
    exit;
}

function wfwc_parse_date_for_storage($date, $with_time = false)
{
    $date = trim((string) $date);

    if (empty($date)) {
        return null;
    }

    $timestamp = strtotime($date);

    if (!$timestamp) {
        return null;
    }

    return $with_time ? wp_date('Y-m-d H:i:s', $timestamp) : wp_date('Y-m-d', $timestamp);
}

function wfwc_parse_alert_days($value)
{
    $days = array_filter(array_map('absint', array_map('trim', explode(',', (string) $value))));
    $days = array_values(array_unique(array_filter($days)));
    sort($days);

    return empty($days) ? array(10) : $days;
}

function wfwc_empty_if_zero($value)
{
    return (float) $value <= 0 ? '-' : wfwc_format_currency($value);
}

function wfwc_maybe_start_session()
{
    if (PHP_SESSION_ACTIVE === session_status() || headers_sent()) {
        return;
    }

    session_start();
}

function wfwc_portal_credentials()
{
    return array(
        'username' => 'adm',
        'password' => 'adm',
    );
}

function wfwc_portal_is_authenticated()
{
    wfwc_maybe_start_session();

    return !empty($_SESSION['wfwc_portal_auth']);
}

function wfwc_portal_login($username, $password)
{
    wfwc_maybe_start_session();

    $credentials = wfwc_portal_credentials();

    if (
        hash_equals($credentials['username'], (string) $username) &&
        hash_equals($credentials['password'], (string) $password)
    ) {
        $_SESSION['wfwc_portal_auth'] = 1;
        $_SESSION['wfwc_portal_user'] = $credentials['username'];

        return true;
    }

    return false;
}

function wfwc_portal_logout()
{
    wfwc_maybe_start_session();

    unset($_SESSION['wfwc_portal_auth'], $_SESSION['wfwc_portal_user']);
}

function wfwc_can_access_portal()
{
    return current_user_can(WFWC_Security::CAP_VIEW) || wfwc_portal_is_authenticated();
}

function wfwc_can_manage_portal()
{
    return current_user_can(WFWC_Security::CAP_MANAGE) || wfwc_portal_is_authenticated();
}

function wfwc_set_front_portal($enabled = true)
{
    $GLOBALS['wfwc_front_portal'] = (bool) $enabled;
}

function wfwc_is_front_portal()
{
    return !empty($GLOBALS['wfwc_front_portal']);
}

function wfwc_portal_views()
{
    return array(
        'dashboard',
        'clients',
        'purchases',
        'cashback',
        'attendants',
        'reports',
        'logs',
        'settings',
    );
}

function wfwc_page_to_view($page)
{
    $page = sanitize_key((string) $page);

    if (0 === strpos($page, 'wfwc-')) {
        $page = substr($page, 5);
    }

    return in_array($page, wfwc_portal_views(), true) ? $page : 'dashboard';
}

function wfwc_view_to_page($view)
{
    $view = sanitize_key((string) $view);

    return 'wfwc-' . (in_array($view, wfwc_portal_views(), true) ? $view : 'dashboard');
}

function wfwc_current_portal_view()
{
    return wfwc_page_to_view(wp_unslash($_GET['portal'] ?? 'dashboard'));
}

function wfwc_portal_url($view = 'dashboard', $args = array())
{
    $query = array_merge(
        array('portal' => wfwc_page_to_view($view)),
        array_filter(
            (array) $args,
            static function ($value) {
                return null !== $value && '' !== $value;
            }
        )
    );

    return add_query_arg($query, home_url('/'));
}

function wfwc_admin_page_url($page, $args = array())
{
    if (wfwc_is_front_portal()) {
        return wfwc_portal_url(wfwc_page_to_view($page), $args);
    }

    return add_query_arg(array_merge(array('page' => $page), $args), admin_url('admin.php'));
}

function wfwc_route_base_url()
{
    return wfwc_is_front_portal() ? home_url('/') : admin_url('admin.php');
}

function wfwc_render_route_hidden_page($page)
{
    $value = wfwc_is_front_portal() ? wfwc_page_to_view($page) : $page;
    $name  = wfwc_is_front_portal() ? 'portal' : 'page';

    printf('<input type="hidden" name="%1$s" value="%2$s">', esc_attr($name), esc_attr($value));
}

function wfwc_render_portal_form_fields($view = '')
{
    if (!wfwc_is_front_portal()) {
        return;
    }

    $view = $view ? wfwc_page_to_view($view) : wfwc_current_portal_view();

    printf('<input type="hidden" name="wfwc_front_portal" value="1">');
    printf('<input type="hidden" name="wfwc_portal_view" value="%s">', esc_attr($view));
}

function wfwc_redirect_target($page, $args = array())
{
    if (!empty($_POST['wfwc_front_portal'])) {
        $view = sanitize_key(wp_unslash($_POST['wfwc_portal_view'] ?? wfwc_page_to_view($page)));
        return wfwc_portal_url($view, $args);
    }

    return wfwc_admin_page_url($page, $args);
}
