<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Birthday
{
    private $db;
    private $whatsapp;
    private $wpdb;

    public function __construct($db, $whatsapp)
    {
        $this->db       = $db;
        $this->whatsapp = $whatsapp;
        $this->wpdb     = $db->get_wpdb();
    }

    public function process_daily_jobs()
    {
        $today_md = wp_date('m-d', current_time('timestamp'));

        $clients = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT id FROM {$this->db->table('clients')}
                WHERE status = 'active' AND birth_date IS NOT NULL AND DATE_FORMAT(birth_date, '%%m-%%d') = %s",
                $today_md
            ),
            ARRAY_A
        );

        foreach ($clients as $client) {
            $this->whatsapp->send_birthday_event($client['id']);
        }
    }

    public function get_upcoming_birthdays($days = 15, $limit = 10)
    {
        $clients = $this->wpdb->get_results(
            "SELECT id, full_name, phone, birth_date FROM {$this->db->table('clients')} WHERE status = 'active' AND birth_date IS NOT NULL",
            ARRAY_A
        );

        $items = array();
        $today = current_time('timestamp');

        foreach ($clients as $client) {
            $birth_timestamp = strtotime($client['birth_date']);

            if (!$birth_timestamp) {
                continue;
            }

            $next = strtotime(wp_date('Y', $today) . '-' . wp_date('m-d', $birth_timestamp));

            if ($next < $today) {
                $next = strtotime('+1 year', $next);
            }

            $diff_days = (int) floor(($next - $today) / DAY_IN_SECONDS);

            if ($diff_days <= $days) {
                $client['next_birthday'] = wp_date('Y-m-d', $next);
                $client['days_until']    = $diff_days;
                $items[] = $client;
            }
        }

        usort(
            $items,
            static function ($a, $b) {
                return strcmp($a['next_birthday'], $b['next_birthday']);
            }
        );

        return array_slice($items, 0, absint($limit));
    }
}
