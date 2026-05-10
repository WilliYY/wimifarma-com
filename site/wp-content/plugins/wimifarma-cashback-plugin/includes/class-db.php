<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_DB
{
    private $wpdb;

    public function __construct()
    {
        global $wpdb;
        $this->wpdb = $wpdb;
    }

    public static function activate()
    {
        self::create_tables();
        update_option(WFWC_OPTION_SETTINGS, array_merge(wfwc_default_settings(), (array) get_option(WFWC_OPTION_SETTINGS, array())));
        update_option('wfwc_db_version', WFWC_DB_VERSION);
    }

    public static function create_tables()
    {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $prefix          = $wpdb->prefix . 'wfwc_';

        $sql = "
        CREATE TABLE {$prefix}attendants (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            wp_user_id BIGINT UNSIGNED NULL,
            full_name VARCHAR(191) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            notes TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            created_by_user BIGINT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY status (status),
            KEY wp_user_id (wp_user_id),
            KEY full_name (full_name)
        ) {$charset_collate};

        CREATE TABLE {$prefix}clients (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            full_name VARCHAR(191) NOT NULL,
            phone VARCHAR(30) NULL,
            birth_date DATE NULL,
            notes TEXT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            attendant_id BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            created_by_user BIGINT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY phone (phone),
            KEY full_name (full_name),
            KEY status (status),
            KEY attendant_id (attendant_id)
        ) {$charset_collate};

        CREATE TABLE {$prefix}purchases (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            client_id BIGINT UNSIGNED NOT NULL,
            attendant_id BIGINT UNSIGNED NULL,
            gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            cashback_generated DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            cashback_used DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            net_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            purchase_date DATETIME NOT NULL,
            notes TEXT NULL,
            webhook_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL,
            created_by_user BIGINT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY client_id (client_id),
            KEY attendant_id (attendant_id),
            KEY purchase_date (purchase_date)
        ) {$charset_collate};

        CREATE TABLE {$prefix}cashback_credits (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            purchase_id BIGINT UNSIGNED NOT NULL,
            client_id BIGINT UNSIGNED NOT NULL,
            original_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            available_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            used_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            expired_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY client_id (client_id),
            KEY purchase_id (purchase_id),
            KEY status (status),
            KEY expires_at (expires_at)
        ) {$charset_collate};

        CREATE TABLE {$prefix}cashback_usages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            purchase_id BIGINT UNSIGNED NOT NULL,
            client_id BIGINT UNSIGNED NOT NULL,
            credit_id BIGINT UNSIGNED NOT NULL,
            attendant_id BIGINT UNSIGNED NULL,
            amount_used DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            purchase_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            used_at DATETIME NOT NULL,
            notes TEXT NULL,
            created_by_user BIGINT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY client_id (client_id),
            KEY purchase_id (purchase_id),
            KEY credit_id (credit_id),
            KEY used_at (used_at)
        ) {$charset_collate};

        CREATE TABLE {$prefix}logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            category VARCHAR(30) NOT NULL DEFAULT 'automation',
            event_type VARCHAR(60) NOT NULL,
            related_type VARCHAR(60) NULL,
            related_id BIGINT UNSIGNED NULL,
            reference_key VARCHAR(191) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'info',
            payload LONGTEXT NULL,
            response_code VARCHAR(20) NULL,
            response_body LONGTEXT NULL,
            created_by_user BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY category (category),
            KEY event_type (event_type),
            KEY related_type (related_type),
            KEY reference_key (reference_key),
            KEY status (status),
            KEY created_at (created_at)
        ) {$charset_collate};
        ";

        dbDelta($sql);
    }

    public function table($name)
    {
        return $this->wpdb->prefix . 'wfwc_' . $name;
    }

    public function get_wpdb()
    {
        return $this->wpdb;
    }

    public function insert_log($data)
    {
        $defaults = array(
            'category'        => 'automation',
            'event_type'      => 'generic',
            'related_type'    => null,
            'related_id'      => null,
            'reference_key'   => null,
            'status'          => 'info',
            'payload'         => null,
            'response_code'   => null,
            'response_body'   => null,
            'created_by_user' => get_current_user_id() ?: null,
            'created_at'      => wfwc_current_mysql_time(),
        );

        $data = array_merge($defaults, $data);

        $this->wpdb->insert(
            $this->table('logs'),
            $data,
            array('%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%d', '%s')
        );

        return (int) $this->wpdb->insert_id;
    }

    public function has_log_reference($reference_key)
    {
        if (empty($reference_key)) {
            return false;
        }

        $sql = $this->wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table('logs')} WHERE reference_key = %s",
            $reference_key
        );

        return (int) $this->wpdb->get_var($sql) > 0;
    }

    public function has_successful_log_reference($reference_key, $event_type = '')
    {
        if (empty($reference_key)) {
            return false;
        }

        $sql  = "SELECT COUNT(*) FROM {$this->table('logs')} WHERE reference_key = %s AND status = 'sent'";
        $args = array($reference_key);

        if (!empty($event_type)) {
            $sql   .= ' AND event_type = %s';
            $args[] = $event_type;
        }

        return (int) $this->wpdb->get_var($this->wpdb->prepare($sql, $args)) > 0;
    }

    public function count_event_logs_by_reference($reference_key, $event_type)
    {
        if (empty($reference_key) || empty($event_type)) {
            return 0;
        }

        $sql = $this->wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table('logs')}
            WHERE reference_key = %s
            AND event_type = %s
            AND status IN ('sent', 'failed', 'skipped')",
            $reference_key,
            $event_type
        );

        return (int) $this->wpdb->get_var($sql);
    }

    public function get_latest_log_by_reference($reference_key, $event_type = '')
    {
        if (empty($reference_key)) {
            return null;
        }

        $sql  = "SELECT * FROM {$this->table('logs')} WHERE reference_key = %s";
        $args = array($reference_key);

        if (!empty($event_type)) {
            $sql   .= ' AND event_type = %s';
            $args[] = $event_type;
        }

        $sql .= ' ORDER BY created_at DESC, id DESC LIMIT 1';

        return $this->wpdb->get_row($this->wpdb->prepare($sql, $args), ARRAY_A);
    }
}
