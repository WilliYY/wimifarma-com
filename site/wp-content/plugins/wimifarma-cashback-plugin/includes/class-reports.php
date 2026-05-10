<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Reports
{
    private $db;
    private $birthday;
    private $wpdb;

    public function __construct($db, $birthday)
    {
        $this->db       = $db;
        $this->birthday = $birthday;
        $this->wpdb     = $db->get_wpdb();
    }

    public function get_period_bounds($start = '', $end = '')
    {
        $start_date = wfwc_parse_date_for_storage($start) ?: wp_date('Y-m-01');
        $end_date   = wfwc_parse_date_for_storage($end) ?: wp_date('Y-m-d');

        return array(
            'start' => $start_date . ' 00:00:00',
            'end'   => $end_date . ' 23:59:59',
        );
    }

    public function get_dashboard_stats($start = '', $end = '')
    {
        $range = $this->get_period_bounds($start, $end);

        $total_clients = (int) $this->wpdb->get_var("SELECT COUNT(*) FROM {$this->db->table('clients')} WHERE status = 'active'");
        $purchases     = (int) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->db->table('purchases')} WHERE purchase_date BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            )
        );
        $generated     = (float) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COALESCE(SUM(cashback_generated), 0) FROM {$this->db->table('purchases')} WHERE purchase_date BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            )
        );
        $used          = (float) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COALESCE(SUM(cashback_used), 0) FROM {$this->db->table('purchases')} WHERE purchase_date BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            )
        );
        $total_spent   = (float) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COALESCE(SUM(gross_amount), 0) FROM {$this->db->table('purchases')} WHERE purchase_date BETWEEN %s AND %s",
                $range['start'],
                $range['end']
            )
        );
        $expired       = (float) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT COALESCE(SUM(expired_amount), 0) FROM {$this->db->table('cashback_credits')} WHERE updated_at BETWEEN %s AND %s AND status = 'expired'",
                $range['start'],
                $range['end']
            )
        );

        $top_client_attendant = $this->wpdb->get_row(
            $this->wpdb->prepare(
                "SELECT a.full_name, COUNT(*) AS total_clients
                FROM {$this->db->table('clients')} c
                INNER JOIN {$this->db->table('attendants')} a ON a.id = c.attendant_id
                WHERE c.created_at BETWEEN %s AND %s
                GROUP BY c.attendant_id
                ORDER BY total_clients DESC
                LIMIT 1",
                $range['start'],
                $range['end']
            ),
            ARRAY_A
        );

        $top_sales_attendant = $this->wpdb->get_row(
            $this->wpdb->prepare(
                "SELECT a.full_name, COUNT(*) AS total_purchases, COALESCE(SUM(p.gross_amount), 0) AS total_sales, COALESCE(SUM(p.cashback_generated), 0) AS total_generated
                FROM {$this->db->table('purchases')} p
                LEFT JOIN {$this->db->table('attendants')} a ON a.id = p.attendant_id
                WHERE p.purchase_date BETWEEN %s AND %s
                GROUP BY p.attendant_id
                ORDER BY total_sales DESC
                LIMIT 1",
                $range['start'],
                $range['end']
            ),
            ARRAY_A
        );

        $pending_alerts = 0;
        foreach (wfwc_parse_alert_days(wfwc_get_setting('expiration_alert_days', '10,5')) as $day) {
            $groups = wfwc()->cashback->get_expiring_groups($day);
            $pending_alerts += count($groups);
        }

        $roi_percent = $generated > 0 ? round(($used / $generated) * 100, 2) : 0;

        return array(
            'total_clients'         => $total_clients,
            'purchases'             => $purchases,
            'total_spent'           => $total_spent,
            'generated'             => $generated,
            'used'                  => $used,
            'expired'               => $expired,
            'roi_percent'           => $roi_percent,
            'upcoming_birthdays'    => $this->birthday->get_upcoming_birthdays(15, 5),
            'top_client_attendant'  => $top_client_attendant,
            'top_sales_attendant'   => $top_sales_attendant,
            'pending_alerts'        => $pending_alerts,
            'range'                 => $range,
        );
    }

    public function get_attendant_rankings($start = '', $end = '')
    {
        $range = $this->get_period_bounds($start, $end);

        $sql = $this->wpdb->prepare(
            "SELECT
                a.id,
                a.full_name,
                COALESCE(c.total_clients, 0) AS total_clients,
                COALESCE(p.total_purchases, 0) AS total_purchases,
                COALESCE(p.total_sales, 0) AS total_sales,
                COALESCE(p.total_generated, 0) AS total_generated
            FROM {$this->db->table('attendants')} a
            LEFT JOIN (
                SELECT attendant_id, COUNT(*) AS total_clients
                FROM {$this->db->table('clients')}
                WHERE created_at BETWEEN %s AND %s
                GROUP BY attendant_id
            ) c ON c.attendant_id = a.id
            LEFT JOIN (
                SELECT attendant_id, COUNT(*) AS total_purchases, SUM(gross_amount) AS total_sales, SUM(cashback_generated) AS total_generated
                FROM {$this->db->table('purchases')}
                WHERE purchase_date BETWEEN %s AND %s
                GROUP BY attendant_id
            ) p ON p.attendant_id = a.id
            ORDER BY total_sales DESC, total_clients DESC, a.full_name ASC",
            $range['start'],
            $range['end'],
            $range['start'],
            $range['end']
        );

        return $this->wpdb->get_results($sql, ARRAY_A);
    }
}
