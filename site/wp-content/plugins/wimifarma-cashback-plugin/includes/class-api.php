<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_API
{
    private $db;
    private $security;
    private $clients;
    private $attendants;
    private $purchases;
    private $cashback;
    private $reports;
    private $whatsapp;
    private $wpdb;

    public function __construct($db, $security, $clients, $attendants, $purchases, $cashback, $reports, $whatsapp)
    {
        $this->db         = $db;
        $this->security   = $security;
        $this->clients    = $clients;
        $this->attendants = $attendants;
        $this->purchases  = $purchases;
        $this->cashback   = $cashback;
        $this->reports    = $reports;
        $this->whatsapp   = $whatsapp;
        $this->wpdb       = $db->get_wpdb();
    }

    public function register_routes()
    {
        register_rest_route(
            'wimifarma-cashback/v1',
            '/auth/status',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, 'auth_status'),
                'permission_callback' => '__return_true',
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/dashboard',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, 'dashboard'),
                'permission_callback' => array($this, 'can_view'),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/clients',
            array(
                array(
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => array($this, 'list_clients'),
                    'permission_callback' => array($this, 'can_view'),
                ),
                array(
                    'methods'             => WP_REST_Server::CREATABLE,
                    'callback'            => array($this, 'create_client'),
                    'permission_callback' => array($this, 'can_manage'),
                ),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/clients/search',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, 'search_clients'),
                'permission_callback' => array($this, 'can_view'),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/clients/(?P<id>\d+)/summary',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, 'client_summary'),
                'permission_callback' => array($this, 'can_view'),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/attendants',
            array(
                array(
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => array($this, 'list_attendants'),
                    'permission_callback' => array($this, 'can_view'),
                ),
                array(
                    'methods'             => WP_REST_Server::CREATABLE,
                    'callback'            => array($this, 'create_attendant'),
                    'permission_callback' => array($this, 'can_manage'),
                ),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/purchases',
            array(
                array(
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => array($this, 'list_purchases'),
                    'permission_callback' => array($this, 'can_view'),
                ),
                array(
                    'methods'             => WP_REST_Server::CREATABLE,
                    'callback'            => array($this, 'create_purchase'),
                    'permission_callback' => array($this, 'can_manage'),
                ),
            )
        );

        register_rest_route(
            'wimifarma-cashback/v1',
            '/whatsapp/today',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, 'whatsapp_today'),
                'permission_callback' => array($this, 'can_view'),
            )
        );
    }

    public function can_view()
    {
        return wfwc_can_access_portal();
    }

    public function can_manage()
    {
        return wfwc_can_manage_portal();
    }

    public function auth_status()
    {
        $user = null;

        if (is_user_logged_in()) {
            $current = wp_get_current_user();
            $user    = $current ? $current->display_name : null;
        } elseif (wfwc_portal_is_authenticated()) {
            $user = $_SESSION['wfwc_portal_user'] ?? 'adm';
        }

        return rest_ensure_response(
            array(
                'authenticated' => wfwc_can_access_portal(),
                'user'          => $user,
            )
        );
    }

    public function dashboard($request)
    {
        $start = sanitize_text_field((string) $request->get_param('start'));
        $end   = sanitize_text_field((string) $request->get_param('end'));
        $range = $this->reports->get_period_bounds($start, $end);
        $stats = $this->reports->get_dashboard_stats($start, $end);

        $total_spent = (float) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COALESCE(SUM(gross_amount), 0) FROM {$this->db->table('purchases')} WHERE purchase_date BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            )
        );

        $roi_ratio = (float) ($stats['generated'] ?? 0) > 0
            ? round(((float) ($stats['used'] ?? 0) / (float) $stats['generated']) * 100, 2)
            : 0.0;

        return rest_ensure_response(
            array(
                'metrics' => array(
                    'clients'            => (int) ($stats['total_clients'] ?? 0),
                    'purchases'          => (int) ($stats['purchases'] ?? 0),
                    'total_spent'        => $total_spent,
                    'total_spent_label'  => wfwc_format_currency($total_spent),
                    'cashback_generated' => (float) ($stats['generated'] ?? 0),
                    'generated_label'    => wfwc_format_currency($stats['generated'] ?? 0),
                    'cashback_used'      => (float) ($stats['used'] ?? 0),
                    'used_label'         => wfwc_format_currency($stats['used'] ?? 0),
                    'cashback_expired'   => (float) ($stats['expired'] ?? 0),
                    'expired_label'      => wfwc_format_currency($stats['expired'] ?? 0),
                    'roi_percent'        => $roi_ratio,
                    'roi_label'          => number_format_i18n($roi_ratio, 2) . '%',
                ),
                'top_client_attendant' => $stats['top_client_attendant'] ?? null,
                'top_sales_attendant'  => $stats['top_sales_attendant'] ?? null,
                'recent_purchases'     => $this->purchases->get_purchases(array('limit' => 10)),
                'recent_clients'       => $this->clients->get_clients(array('limit' => 8)),
            )
        );
    }

    public function list_clients($request)
    {
        $term    = sanitize_text_field((string) $request->get_param('search'));
        $clients = $this->clients->get_clients(
            array(
                'search' => $term,
                'limit'  => max(1, absint($request->get_param('limit') ?: 100)),
            )
        );

        foreach ($clients as &$client) {
            $client['phone_formatted'] = wfwc_format_phone($client['phone']);
            $client['balances']        = $this->cashback->get_client_balances($client['id']);
        }

        return rest_ensure_response($clients);
    }

    public function search_clients($request)
    {
        $term    = sanitize_text_field((string) $request->get_param('term'));
        $clients = $this->clients->search_clients($term, 8);

        foreach ($clients as &$client) {
            $client['phone_formatted'] = wfwc_format_phone($client['phone']);
            $client['balances']        = $this->cashback->get_client_balances($client['id']);
            $recent                    = $this->purchases->get_purchases(array('client_id' => $client['id'], 'limit' => 3));
            $client['recent_purchases'] = $recent;
            $client['last_purchase']    = !empty($recent) ? $recent[0] : null;
        }

        return rest_ensure_response($clients);
    }

    public function client_summary($request)
    {
        $client_id = absint($request['id']);
        $client    = $this->clients->get_client($client_id);

        if (!$client) {
            return new WP_Error('wfwc_client_not_found', 'Cliente nao encontrado.', array('status' => 404));
        }

        return rest_ensure_response(
            array(
                'client'   => $client,
                'balances' => $this->cashback->get_client_balances($client_id),
                'history'  => $this->clients->get_client_history($client_id),
            )
        );
    }

    public function create_client($request)
    {
        $params       = $request->get_json_params();
        $full_name    = sanitize_text_field((string) ($params['full_name'] ?? ''));
        $phone        = wfwc_sanitize_phone((string) ($params['phone'] ?? ''));
        $birth_date   = wfwc_parse_date_for_storage((string) ($params['birth_date'] ?? ''));
        $notes        = sanitize_textarea_field((string) ($params['notes'] ?? ''));
        $attendant_id = absint($params['attendant_id'] ?? 0);

        if ('' === $full_name) {
            return new WP_Error('wfwc_client_name', 'Informe o nome do cliente.', array('status' => 400));
        }

        if ($attendant_id > 0 && !$this->attendants->get_attendant($attendant_id)) {
            return new WP_Error('wfwc_client_attendant', 'Atendente responsavel nao encontrado.', array('status' => 400));
        }

        $inserted = $this->wpdb->insert(
            $this->db->table('clients'),
            array(
                'full_name'       => $full_name,
                'phone'           => $phone ?: null,
                'birth_date'      => $birth_date,
                'notes'           => $notes,
                'status'          => 'active',
                'attendant_id'    => $attendant_id ?: null,
                'created_at'      => wfwc_current_mysql_time(),
                'updated_at'      => wfwc_current_mysql_time(),
                'created_by_user' => get_current_user_id() ?: null,
            )
        );

        if (false === $inserted) {
            return new WP_Error('wfwc_client_create', 'Nao foi possivel cadastrar o cliente.', array('status' => 500));
        }

        $client_id = (int) $this->wpdb->insert_id;
        $this->security->log_sensitive_action('client_created_api', array('client_id' => $client_id, 'full_name' => $full_name));

        return rest_ensure_response(
            array(
                'success' => true,
                'client'  => $this->clients->get_client($client_id),
            )
        );
    }

    public function list_attendants($request)
    {
        $status = sanitize_key((string) $request->get_param('status'));
        $items  = $this->attendants->get_attendants(
            array(
                'status' => $status,
                'limit'  => max(1, absint($request->get_param('limit') ?: 200)),
            )
        );

        return rest_ensure_response($items);
    }

    public function create_attendant($request)
    {
        $params    = $request->get_json_params();
        $full_name = sanitize_text_field((string) ($params['full_name'] ?? ''));

        if ('' === $full_name) {
            return new WP_Error('wfwc_attendant_name', 'Informe o nome do atendente.', array('status' => 400));
        }

        $inserted = $this->wpdb->insert(
            $this->db->table('attendants'),
            array(
                'full_name'       => $full_name,
                'status'          => 'active',
                'notes'           => sanitize_textarea_field((string) ($params['notes'] ?? '')),
                'created_at'      => wfwc_current_mysql_time(),
                'updated_at'      => wfwc_current_mysql_time(),
                'created_by_user' => get_current_user_id() ?: null,
            )
        );

        if (false === $inserted) {
            return new WP_Error('wfwc_attendant_create', 'Nao foi possivel cadastrar o atendente.', array('status' => 500));
        }

        $attendant_id = (int) $this->wpdb->insert_id;
        $this->security->log_sensitive_action('attendant_created_api', array('attendant_id' => $attendant_id, 'full_name' => $full_name));

        return rest_ensure_response(
            array(
                'success'   => true,
                'attendant' => $this->attendants->get_attendant($attendant_id),
            )
        );
    }

    public function list_purchases($request)
    {
        $client_id = absint($request->get_param('client_id'));
        $limit     = max(1, absint($request->get_param('limit') ?: 20));
        $today     = (bool) $request->get_param('today');

        if ($today) {
            $start = wp_date('Y-m-d 00:00:00');
            $end   = wp_date('Y-m-d 23:59:59');
            $sql   = $this->wpdb->prepare(
                "SELECT p.*, c.full_name AS client_name, a.full_name AS attendant_name
                FROM {$this->db->table('purchases')} p
                INNER JOIN {$this->db->table('clients')} c ON c.id = p.client_id
                LEFT JOIN {$this->db->table('attendants')} a ON a.id = p.attendant_id
                WHERE p.purchase_date BETWEEN %s AND %s
                ORDER BY p.purchase_date DESC
                LIMIT %d",
                $start,
                $end,
                $limit
            );

            return rest_ensure_response($this->wpdb->get_results($sql, ARRAY_A));
        }

        return rest_ensure_response(
            $this->purchases->get_purchases(
                array(
                    'client_id' => $client_id,
                    'limit'     => $limit,
                )
            )
        );
    }

    public function create_purchase($request)
    {
        $params = $request->get_json_params();
        $result = $this->purchases->register_purchase(is_array($params) ? $params : array());

        if (empty($result['success'])) {
            return new WP_Error('wfwc_purchase_error', $result['message'] ?? 'Erro ao registrar compra.', array('status' => 400));
        }

        return rest_ensure_response($result);
    }

    public function whatsapp_today()
    {
        $start = wp_date('Y-m-d 00:00:00');
        $end   = wp_date('Y-m-d 23:59:59');

        $rows = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT
                    c.id AS client_id,
                    c.full_name,
                    c.phone,
                    SUM(p.cashback_generated) AS total_cashback,
                    SUM(p.gross_amount) AS total_spent,
                    MAX(p.purchase_date) AS last_purchase_date
                FROM {$this->db->table('purchases')} p
                INNER JOIN {$this->db->table('clients')} c ON c.id = p.client_id
                WHERE p.purchase_date BETWEEN %s AND %s
                GROUP BY c.id, c.full_name, c.phone
                ORDER BY last_purchase_date DESC",
                $start,
                $end
            ),
            ARRAY_A
        );

        $days = absint(wfwc_get_setting('cashback_expiration_days', 45));
        $data = array();

        foreach ($rows as $row) {
            $digits = $this->normalize_brazil_phone($row['phone']);

            if ('' === $digits) {
                continue;
            }

            $message = sprintf(
                'Voce recebeu %s de cashback na Wimifarma! Utilize em ate %d dias.',
                wfwc_format_currency($row['total_cashback']),
                $days
            );

            $data[] = array(
                'client_id'          => (int) $row['client_id'],
                'client_name'        => $row['full_name'],
                'phone'              => $digits,
                'total_cashback'     => (float) $row['total_cashback'],
                'total_cashback_label' => wfwc_format_currency($row['total_cashback']),
                'total_spent'        => (float) $row['total_spent'],
                'link'               => 'https://wa.me/' . $digits . '?text=' . rawurlencode($message),
                'message'            => $message,
            );
        }

        return rest_ensure_response(
            array(
                'count' => count($data),
                'items' => $data,
            )
        );
    }

    private function normalize_brazil_phone($phone)
    {
        $digits = wfwc_sanitize_phone($phone);

        if ('' === $digits) {
            return '';
        }

        if (0 === strpos($digits, '55') && (12 === strlen($digits) || 13 === strlen($digits))) {
            return $digits;
        }

        if (10 === strlen($digits) || 11 === strlen($digits)) {
            return '55' . $digits;
        }

        return '';
    }
}
