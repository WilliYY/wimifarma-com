<?php
/**
 * Plugin Name: Wimifarma Cashback
 * Plugin URI: https://wimifarma.com
 * Description: Plataforma propria de cashback da Wimifarma para WordPress tradicional.
 * Version: 1.2.0
 * Author: Wimifarma
 * Text Domain: wimifarma-cashback
 */

if (!defined('ABSPATH')) {
    exit;
}

define('WFWC_VERSION', '1.2.0');
define('WFWC_DB_VERSION', '1.0.0');
define('WFWC_PLUGIN_FILE', __FILE__);
define('WFWC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WFWC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('WFWC_OPTION_SETTINGS', 'wfwc_settings');

require_once WFWC_PLUGIN_DIR . 'includes/helpers.php';

$wfwc_dependencies = array(
    'includes/class-db.php',
    'includes/class-security.php',
    'includes/class-attendants.php',
    'includes/class-clients.php',
    'includes/class-cashback.php',
    'includes/class-whatsapp.php',
    'includes/class-purchases.php',
    'includes/class-expiration.php',
    'includes/class-birthday.php',
    'includes/class-reports.php',
    'includes/class-api.php',
    'includes/class-auth.php',
);

foreach ($wfwc_dependencies as $wfwc_dependency) {
    require_once WFWC_PLUGIN_DIR . $wfwc_dependency;
}

final class WimiFarma_Cashback_Plugin
{
    private static $instance = null;

    public $db;
    public $security;
    public $attendants;
    public $clients;
    public $cashback;
    public $whatsapp;
    public $purchases;
    public $expiration;
    public $birthday;
    public $reports;
    public $api;
    public $auth;

    public static function instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    private function __construct()
    {
        $this->db         = new WFWC_DB();
        $this->security   = new WFWC_Security($this->db);
        $this->attendants = new WFWC_Attendants($this->db, $this->security);
        $this->clients    = new WFWC_Clients($this->db, $this->security);
        $this->cashback   = new WFWC_Cashback($this->db);
        $this->whatsapp   = new WFWC_Whatsapp($this->db, $this->clients, $this->attendants);
        $this->purchases  = new WFWC_Purchases($this->db, $this->security, $this->clients, $this->attendants, $this->cashback, $this->whatsapp);
        $this->expiration = new WFWC_Expiration($this->db, $this->cashback, $this->whatsapp);
        $this->birthday   = new WFWC_Birthday($this->db, $this->whatsapp);
        $this->reports    = new WFWC_Reports($this->db, $this->birthday);
        $this->api        = new WFWC_API($this->db, $this->security, $this->clients, $this->attendants, $this->purchases, $this->cashback, $this->reports, $this->whatsapp);
        $this->auth       = new WFWC_Auth($this->clients, $this->cashback);

        $this->register_hooks();
    }

    public static function activate()
    {
        WFWC_DB::activate();
        WFWC_Security::install_roles();
        self::schedule_events();
    }

    public static function deactivate()
    {
        self::clear_scheduled_events();
    }

    public static function uninstall()
    {
        self::clear_scheduled_events();
    }

    private function register_hooks()
    {
        add_action('init', array($this, 'bootstrap'));
        add_action('init', array($this->auth, 'handle_portal_request'), 1);
        add_action('admin_menu', array($this, 'register_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_public_assets'));
        add_action('admin_notices', array($this, 'render_admin_notice'));
        add_action('rest_api_init', array($this->api, 'register_routes'));
        add_action('wfwc_daily_cron', array($this, 'run_daily_jobs'));
        add_action('wfwc_retry_webhook_event', array($this->whatsapp, 'retry_webhook'), 10, 2);

        add_action('admin_post_wfwc_save_client', array($this->clients, 'handle_admin_save'));
        add_action('admin_post_nopriv_wfwc_save_client', array($this->clients, 'handle_admin_save'));
        add_action('admin_post_wfwc_save_attendant', array($this->attendants, 'handle_admin_save'));
        add_action('admin_post_nopriv_wfwc_save_attendant', array($this->attendants, 'handle_admin_save'));
        add_action('admin_post_wfwc_save_purchase', array($this->purchases, 'handle_admin_save'));
        add_action('admin_post_nopriv_wfwc_save_purchase', array($this->purchases, 'handle_admin_save'));
        add_action('admin_post_wfwc_save_settings', array($this, 'handle_settings_save'));
        add_action('admin_post_nopriv_wfwc_save_settings', array($this, 'handle_settings_save'));
    }

    public function bootstrap()
    {
        wfwc_maybe_start_session();
        $this->security->ensure_roles();
        $this->auth->register_shortcodes();
    }

    public function run_daily_jobs()
    {
        $this->expiration->process_daily_jobs();
        $this->birthday->process_daily_jobs();
    }

    public function register_admin_menu()
    {
        add_menu_page(
            'Wimifarma Cashback',
            'Wimifarma Cashback',
            WFWC_Security::CAP_VIEW,
            'wfwc-dashboard',
            array($this, 'render_dashboard_page'),
            'dashicons-money-alt',
            26
        );

        add_submenu_page('wfwc-dashboard', 'Dashboard', 'Dashboard', WFWC_Security::CAP_VIEW, 'wfwc-dashboard', array($this, 'render_dashboard_page'));
        add_submenu_page('wfwc-dashboard', 'Clientes', 'Clientes', WFWC_Security::CAP_MANAGE, 'wfwc-clients', array($this, 'render_clients_page'));
        add_submenu_page('wfwc-dashboard', 'Compras', 'Compras', WFWC_Security::CAP_MANAGE, 'wfwc-purchases', array($this, 'render_purchases_page'));
        add_submenu_page('wfwc-dashboard', 'Cashback', 'Cashback', WFWC_Security::CAP_MANAGE, 'wfwc-cashback', array($this, 'render_cashback_page'));
        add_submenu_page('wfwc-dashboard', 'Atendentes', 'Atendentes', WFWC_Security::CAP_MANAGE, 'wfwc-attendants', array($this, 'render_attendants_page'));
        add_submenu_page('wfwc-dashboard', 'Relatorios', 'Relatorios', WFWC_Security::CAP_REPORTS, 'wfwc-reports', array($this, 'render_reports_page'));
        add_submenu_page('wfwc-dashboard', 'Configuracoes', 'Configuracoes', WFWC_Security::CAP_SETTINGS, 'wfwc-settings', array($this, 'render_settings_page'));
        add_submenu_page('wfwc-dashboard', 'Logs de automacao', 'Logs de automacao', WFWC_Security::CAP_LOGS, 'wfwc-logs', array($this, 'render_logs_page'));
    }

    public function render_dashboard_page()
    {
        $this->render_admin_view('admin-dashboard.php', WFWC_Security::CAP_VIEW);
    }

    public function render_clients_page()
    {
        $this->render_admin_view('admin-clients.php', WFWC_Security::CAP_MANAGE);
    }

    public function render_purchases_page()
    {
        $this->render_admin_view('admin-purchases.php', WFWC_Security::CAP_MANAGE);
    }

    public function render_cashback_page()
    {
        $this->render_admin_view('admin-cashback.php', WFWC_Security::CAP_MANAGE);
    }

    public function render_attendants_page()
    {
        $this->render_admin_view('admin-attendants.php', WFWC_Security::CAP_MANAGE);
    }

    public function render_reports_page()
    {
        $this->render_admin_view('admin-reports.php', WFWC_Security::CAP_REPORTS);
    }

    public function render_settings_page()
    {
        $this->render_admin_view('admin-settings.php', WFWC_Security::CAP_SETTINGS);
    }

    public function render_logs_page()
    {
        $this->render_admin_view('admin-logs.php', WFWC_Security::CAP_LOGS);
    }

    private function render_admin_view($file, $capability)
    {
        $this->security->assert_access($capability);

        $path = WFWC_PLUGIN_DIR . 'admin/' . $file;

        if (!file_exists($path)) {
            wp_die(esc_html__('Arquivo administrativo nao encontrado.', 'wimifarma-cashback'));
        }

        $plugin = $this;
        include $path;
    }

    public function enqueue_admin_assets($hook)
    {
        if (false === strpos($hook, 'wfwc-')) {
            return;
        }

        $this->enqueue_cashback_assets();
    }

    private function enqueue_cashback_assets()
    {
        wp_enqueue_style('wfwc-admin', WFWC_PLUGIN_URL . 'assets/css/admin.css', array(), WFWC_VERSION);
        wp_enqueue_style('wfwc-forms', WFWC_PLUGIN_URL . 'assets/css/forms.css', array('wfwc-admin'), WFWC_VERSION);
        wp_enqueue_style('wfwc-dashboard', WFWC_PLUGIN_URL . 'assets/css/dashboard.css', array('wfwc-admin'), WFWC_VERSION);

        wp_enqueue_script('wfwc-admin', WFWC_PLUGIN_URL . 'assets/js/admin.js', array('jquery'), WFWC_VERSION, true);
        wp_enqueue_script('wfwc-clients', WFWC_PLUGIN_URL . 'assets/js/clients.js', array('wfwc-admin'), WFWC_VERSION, true);
        wp_enqueue_script('wfwc-cashback', WFWC_PLUGIN_URL . 'assets/js/cashback.js', array('wfwc-admin'), WFWC_VERSION, true);
        wp_enqueue_script('wfwc-reports', WFWC_PLUGIN_URL . 'assets/js/reports.js', array('wfwc-admin'), WFWC_VERSION, true);

        wp_localize_script(
            'wfwc-admin',
            'wfwcAdmin',
            array(
                'currencySymbol'    => 'R$',
                'redeemMultiplier'  => (float) wfwc_get_setting('cashback_redeem_multiplier', 4),
                'cashbackPercent'   => (float) wfwc_get_setting('cashback_percent', 5),
                'retryAttempts'     => (int) wfwc_get_setting('webhook_retry_attempts', 3),
                'retryDelayMinutes' => (int) wfwc_get_setting('webhook_retry_delay_minutes', 15),
            )
        );
    }

    public function enqueue_public_assets()
    {
        wp_enqueue_style('wfwc-public', WFWC_PLUGIN_URL . 'public/public-styles.css', array(), WFWC_VERSION);
        wp_enqueue_script('wfwc-public', WFWC_PLUGIN_URL . 'public/public-scripts.js', array('jquery'), WFWC_VERSION, true);

        if (is_front_page() && wfwc_can_access_portal()) {
            $this->enqueue_cashback_assets();
        }
    }

    public function render_admin_notice()
    {
        if (!is_admin()) {
            return;
        }

        $notice = wfwc_get_admin_notice();

        if (empty($notice['message'])) {
            return;
        }

        printf(
            '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
            esc_attr($notice['type']),
            esc_html($notice['message'])
        );
    }

    public function handle_settings_save()
    {
        $this->security->verify_admin_post('wfwc_save_settings', WFWC_Security::CAP_SETTINGS);

        $settings = array(
            'cashback_percent'             => min(100, max(0, wfwc_to_decimal(wp_unslash($_POST['cashback_percent'] ?? 5)))),
            'cashback_expiration_days'     => max(1, absint($_POST['cashback_expiration_days'] ?? 45)),
            'cashback_redeem_multiplier'   => max(1, absint($_POST['cashback_redeem_multiplier'] ?? 4)),
            'purchase_webhook_url'         => esc_url_raw(wp_unslash($_POST['purchase_webhook_url'] ?? '')),
            'birthday_webhook_url'         => esc_url_raw(wp_unslash($_POST['birthday_webhook_url'] ?? '')),
            'expiration_webhook_url'       => esc_url_raw(wp_unslash($_POST['expiration_webhook_url'] ?? '')),
            'webhook_token'                => sanitize_text_field(wp_unslash($_POST['webhook_token'] ?? '')),
            'webhook_retry_enabled'        => empty($_POST['webhook_retry_enabled']) ? 0 : 1,
            'webhook_retry_attempts'       => max(1, absint($_POST['webhook_retry_attempts'] ?? 3)),
            'webhook_retry_delay_minutes'  => max(1, absint($_POST['webhook_retry_delay_minutes'] ?? 15)),
            'message_purchase'             => sanitize_textarea_field(wp_unslash($_POST['message_purchase'] ?? '')),
            'message_birthday'             => sanitize_textarea_field(wp_unslash($_POST['message_birthday'] ?? '')),
            'message_expiration'           => sanitize_textarea_field(wp_unslash($_POST['message_expiration'] ?? '')),
            'enable_purchase_automation'   => empty($_POST['enable_purchase_automation']) ? 0 : 1,
            'enable_birthday_automation'   => empty($_POST['enable_birthday_automation']) ? 0 : 1,
            'enable_expiration_automation' => empty($_POST['enable_expiration_automation']) ? 0 : 1,
            'expiration_alert_days'        => implode(',', wfwc_parse_alert_days(wp_unslash($_POST['expiration_alert_days'] ?? '10,5'))),
            'allow_public_lookup'          => empty($_POST['allow_public_lookup']) ? 0 : 1,
        );

        update_option(WFWC_OPTION_SETTINGS, array_merge(wfwc_default_settings(), $settings));

        $this->security->log_sensitive_action('settings_updated', $settings);
        wfwc_set_admin_notice('Configuracoes salvas com sucesso.', 'success');
        wfwc_redirect(wfwc_redirect_target('wfwc-settings'));
    }

    public static function schedule_events()
    {
        if (!wp_next_scheduled('wfwc_daily_cron')) {
            wp_schedule_event(time() + 300, 'daily', 'wfwc_daily_cron');
        }
    }

    public static function clear_scheduled_events()
    {
        wp_clear_scheduled_hook('wfwc_daily_cron');
        wp_clear_scheduled_hook('wfwc_retry_webhook_event');
    }
}

function wfwc()
{
    return WimiFarma_Cashback_Plugin::instance();
}

register_activation_hook(__FILE__, array('WimiFarma_Cashback_Plugin', 'activate'));
register_deactivation_hook(__FILE__, array('WimiFarma_Cashback_Plugin', 'deactivate'));

wfwc();
