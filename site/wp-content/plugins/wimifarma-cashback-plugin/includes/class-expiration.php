<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Expiration
{
    private $db;
    private $cashback;
    private $whatsapp;

    public function __construct($db, $cashback, $whatsapp)
    {
        $this->db       = $db;
        $this->cashback = $cashback;
        $this->whatsapp = $whatsapp;
    }

    public function process_daily_jobs()
    {
        $expired = $this->cashback->expire_due_credits();

        if (!empty($expired)) {
            $this->db->insert_log(
                array(
                    'event_type'    => 'expired_credits_job',
                    'status'        => 'info',
                    'payload'       => wp_json_encode($expired),
                    'response_body' => sprintf('%d crédito(s) expirado(s) no processamento diário.', count($expired)),
                )
            );
        }

        foreach (wfwc_parse_alert_days(wfwc_get_setting('expiration_alert_days', '10,5')) as $day) {
            $groups = $this->cashback->get_expiring_groups($day);

            foreach ($groups as $group) {
                $this->whatsapp->send_expiration_event(
                    $group['client_id'],
                    $day,
                    $group['expiring_amount'],
                    $group['expires_on']
                );
            }
        }
    }
}
