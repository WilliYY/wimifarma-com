<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Cashback
{
    private $db;
    private $wpdb;

    public function __construct($db)
    {
        $this->db   = $db;
        $this->wpdb = $db->get_wpdb();
    }

    public function calculate_generated_amount($purchase_amount)
    {
        $percentage = (float) wfwc_get_setting('cashback_percent', 5);
        return round(((float) $purchase_amount * $percentage) / 100, 2);
    }

    public function calculate_expiration_date($purchase_date = '')
    {
        $days      = absint(wfwc_get_setting('cashback_expiration_days', 45));
        $timestamp = $purchase_date ? strtotime($purchase_date) : current_time('timestamp');

        return wp_date('Y-m-d H:i:s', strtotime('+' . $days . ' days', $timestamp));
    }

    public function get_client_balances($client_id)
    {
        $client_id = absint($client_id);
        $now       = current_time('mysql');
        $future    = wp_date('Y-m-d H:i:s', strtotime('+' . max(wfwc_parse_alert_days(wfwc_get_setting('expiration_alert_days', '10,5'))) . ' days', current_time('timestamp')));

        $sql = $this->wpdb->prepare(
            "SELECT
                COALESCE(SUM(original_amount), 0) AS total_generated,
                COALESCE(SUM(CASE WHEN status IN ('active','partial') AND expires_at >= %s THEN available_amount ELSE 0 END), 0) AS total_available,
                COALESCE(SUM(used_amount), 0) AS total_used,
                COALESCE(SUM(
                    CASE
                        WHEN status = 'expired' THEN expired_amount
                        WHEN status IN ('active','partial') AND expires_at < %s THEN available_amount + expired_amount
                        ELSE expired_amount
                    END
                ), 0) AS total_expired,
                COALESCE(SUM(CASE WHEN status IN ('active','partial') AND expires_at BETWEEN %s AND %s THEN available_amount ELSE 0 END), 0) AS soon_to_expire
            FROM {$this->db->table('cashback_credits')}
            WHERE client_id = %d",
            $now,
            $now,
            $now,
            $future,
            $client_id
        );

        $summary = $this->wpdb->get_row($sql, ARRAY_A);

        $next_expiration = $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT MIN(expires_at) FROM {$this->db->table('cashback_credits')}
                WHERE client_id = %d AND status IN ('active','partial') AND available_amount > 0 AND expires_at >= %s",
                $client_id,
                $now
            )
        );

        $summary['next_expiration'] = $next_expiration;
        $summary['total_generated'] = (float) ($summary['total_generated'] ?? 0);
        $summary['total_available'] = (float) ($summary['total_available'] ?? 0);
        $summary['total_used']      = (float) ($summary['total_used'] ?? 0);
        $summary['total_expired']   = (float) ($summary['total_expired'] ?? 0);
        $summary['soon_to_expire']  = (float) ($summary['soon_to_expire'] ?? 0);

        return $summary;
    }

    public function get_available_credits($client_id, $for_update = false)
    {
        $sql = $this->wpdb->prepare(
            "SELECT * FROM {$this->db->table('cashback_credits')}
            WHERE client_id = %d AND status IN ('active','partial') AND available_amount > 0 AND expires_at >= %s
            ORDER BY expires_at ASC, id ASC",
            absint($client_id),
            current_time('mysql')
        );

        if ($for_update) {
            $sql .= ' FOR UPDATE';
        }

        return $this->wpdb->get_results($sql, ARRAY_A);
    }

    public function get_credit_history($client_id)
    {
        return $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT * FROM {$this->db->table('cashback_credits')} WHERE client_id = %d ORDER BY created_at DESC",
                absint($client_id)
            ),
            ARRAY_A
        );
    }

    public function validate_redemption($client_id, $purchase_amount, $desired_amount)
    {
        $purchase_amount = (float) $purchase_amount;
        $desired_amount  = (float) $desired_amount;
        $multiplier      = (float) wfwc_get_setting('cashback_redeem_multiplier', 4);
        $balances        = $this->get_client_balances($client_id);
        $available       = (float) $balances['total_available'];
        $max_by_rule     = floor(($purchase_amount / max($multiplier, 1)) * 100) / 100;
        $maximum         = min($available, $max_by_rule);

        if ($desired_amount <= 0) {
            return array(
                'valid'      => true,
                'message'    => '',
                'maximum'    => $maximum,
                'available'  => $available,
                'multiplier' => $multiplier,
            );
        }

        if ($desired_amount > $available) {
            return array(
                'valid'      => false,
                'message'    => 'O valor solicitado é maior que o saldo disponível.',
                'maximum'    => $maximum,
                'available'  => $available,
                'multiplier' => $multiplier,
            );
        }

        if (($desired_amount * $multiplier) > $purchase_amount) {
            return array(
                'valid'      => false,
                'message'    => sprintf('Para usar %s de cashback, a compra precisa ser de no mínimo %s.', wfwc_format_currency($desired_amount), wfwc_format_currency($desired_amount * $multiplier)),
                'maximum'    => $maximum,
                'available'  => $available,
                'multiplier' => $multiplier,
            );
        }

        return array(
            'valid'      => true,
            'message'    => '',
            'maximum'    => $maximum,
            'available'  => $available,
            'multiplier' => $multiplier,
        );
    }

    public function create_credit($client_id, $purchase_id, $amount, $purchase_date)
    {
        $amount = round((float) $amount, 2);

        if ($amount <= 0) {
            return array(
                'success' => true,
                'credit_id' => 0,
            );
        }

        $now = wfwc_current_mysql_time();

        $inserted = $this->wpdb->insert(
            $this->db->table('cashback_credits'),
            array(
                'purchase_id'      => absint($purchase_id),
                'client_id'        => absint($client_id),
                'original_amount'  => $amount,
                'available_amount' => $amount,
                'used_amount'      => 0,
                'expired_amount'   => 0,
                'status'           => 'active',
                'expires_at'       => $this->calculate_expiration_date($purchase_date),
                'created_at'       => $now,
                'updated_at'       => $now,
            ),
            array('%d', '%d', '%f', '%f', '%f', '%f', '%s', '%s', '%s', '%s')
        );

        return array(
            'success'  => (bool) $inserted,
            'credit_id' => (int) $this->wpdb->insert_id,
        );
    }

    public function apply_redemption($client_id, $purchase_id, $attendant_id, $purchase_amount, $desired_amount, $notes = '')
    {
        $desired_amount = round((float) $desired_amount, 2);

        if ($desired_amount <= 0) {
            return array('success' => true, 'used' => 0);
        }

        $validation = $this->validate_redemption($client_id, $purchase_amount, $desired_amount);

        if (!$validation['valid']) {
            return array('success' => false, 'message' => $validation['message']);
        }

        $remaining = $desired_amount;
        $credits   = $this->get_available_credits($client_id, true);

        foreach ($credits as $credit) {
            if ($remaining <= 0) {
                break;
            }

            $available_in_credit = (float) $credit['available_amount'];
            $use_now             = min($remaining, $available_in_credit);
            $new_available       = round($available_in_credit - $use_now, 2);
            $new_used            = round(((float) $credit['used_amount']) + $use_now, 2);
            $new_status          = $new_available > 0 ? 'partial' : 'used';

            $updated = $this->wpdb->update(
                $this->db->table('cashback_credits'),
                array(
                    'available_amount' => $new_available,
                    'used_amount'      => $new_used,
                    'status'           => $new_status,
                    'updated_at'       => wfwc_current_mysql_time(),
                ),
                array('id' => absint($credit['id'])),
                array('%f', '%f', '%s', '%s'),
                array('%d')
            );

            if (false === $updated) {
                return array('success' => false, 'message' => 'Não foi possível atualizar os créditos do cliente.');
            }

            $usage_inserted = $this->wpdb->insert(
                $this->db->table('cashback_usages'),
                array(
                    'purchase_id'      => absint($purchase_id),
                    'client_id'        => absint($client_id),
                    'credit_id'        => absint($credit['id']),
                    'attendant_id'     => absint($attendant_id) ?: null,
                    'amount_used'      => $use_now,
                    'purchase_amount'  => round((float) $purchase_amount, 2),
                    'used_at'          => wfwc_current_mysql_time(),
                    'notes'            => sanitize_textarea_field($notes),
                    'created_by_user'  => get_current_user_id(),
                )
            );

            if (false === $usage_inserted) {
                return array('success' => false, 'message' => 'Nao foi possivel registrar o historico de uso do cashback.');
            }

            $remaining = round($remaining - $use_now, 2);
        }

        if ($remaining > 0) {
            return array('success' => false, 'message' => 'Não havia saldo suficiente para completar o uso do cashback.');
        }

        return array('success' => true, 'used' => $desired_amount);
    }

    public function expire_due_credits()
    {
        $now   = current_time('mysql');
        $items = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT * FROM {$this->db->table('cashback_credits')}
                WHERE status IN ('active','partial') AND available_amount > 0 AND expires_at < %s",
                $now
            ),
            ARRAY_A
        );

        foreach ($items as $item) {
            $new_expired = round(((float) $item['expired_amount']) + (float) $item['available_amount'], 2);
            $this->wpdb->update(
                $this->db->table('cashback_credits'),
                array(
                    'expired_amount'   => $new_expired,
                    'available_amount' => 0,
                    'status'           => 'expired',
                    'updated_at'       => wfwc_current_mysql_time(),
                ),
                array('id' => absint($item['id'])),
                array('%f', '%f', '%s', '%s'),
                array('%d')
            );
        }

        return $items;
    }

    public function get_expiring_groups($days)
    {
        $target_date = wp_date('Y-m-d', strtotime('+' . absint($days) . ' days', current_time('timestamp')));

        return $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT
                    c.client_id,
                    DATE(c.expires_at) AS expires_on,
                    SUM(c.available_amount) AS expiring_amount
                FROM {$this->db->table('cashback_credits')} c
                WHERE c.status IN ('active','partial') AND c.available_amount > 0 AND DATE(c.expires_at) = %s
                GROUP BY c.client_id, DATE(c.expires_at)
                ORDER BY c.expires_at ASC",
                $target_date
            ),
            ARRAY_A
        );
    }
}
