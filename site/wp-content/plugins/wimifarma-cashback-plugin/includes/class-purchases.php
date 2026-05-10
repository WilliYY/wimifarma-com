<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Purchases
{
    private $db;
    private $security;
    private $clients;
    private $attendants;
    private $cashback;
    private $whatsapp;
    private $wpdb;

    public function __construct($db, $security, $clients, $attendants, $cashback, $whatsapp)
    {
        $this->db         = $db;
        $this->security   = $security;
        $this->clients    = $clients;
        $this->attendants = $attendants;
        $this->cashback   = $cashback;
        $this->whatsapp   = $whatsapp;
        $this->wpdb       = $db->get_wpdb();
    }

    public function get_purchases($args = array())
    {
        $defaults = array(
            'client_id' => 0,
            'limit'     => 50,
        );
        $args     = array_merge($defaults, $args);
        $where    = 'WHERE 1=1';

        if (!empty($args['client_id'])) {
            $where .= $this->wpdb->prepare(' AND p.client_id = %d', absint($args['client_id']));
        }

        $limit = max(1, absint($args['limit']));

        $sql = "
            SELECT p.*, c.full_name AS client_name, a.full_name AS attendant_name
            FROM {$this->db->table('purchases')} p
            INNER JOIN {$this->db->table('clients')} c ON c.id = p.client_id
            LEFT JOIN {$this->db->table('attendants')} a ON a.id = p.attendant_id
            {$where}
            ORDER BY p.purchase_date DESC
            LIMIT {$limit}
        ";

        return $this->wpdb->get_results($sql, ARRAY_A);
    }

    public function register_purchase($data)
    {
        $client_id       = absint($data['client_id'] ?? 0);
        $attendant_id    = absint($data['attendant_id'] ?? 0);
        $gross_amount    = max(0, wfwc_to_decimal($data['gross_amount'] ?? 0));
        $cashback_to_use = max(0, wfwc_to_decimal($data['cashback_to_use'] ?? 0));
        $purchase_date   = wfwc_parse_date_for_storage($data['purchase_date'] ?? '', true);
        $notes           = sanitize_textarea_field($data['notes'] ?? '');

        if ($client_id <= 0 || !$this->clients->get_client($client_id)) {
            return array('success' => false, 'message' => 'Selecione um cliente valido.');
        }

        if ($attendant_id > 0 && !$this->attendants->get_attendant($attendant_id)) {
            return array('success' => false, 'message' => 'Selecione um atendente valido.');
        }

        if ($gross_amount <= 0) {
            return array('success' => false, 'message' => 'Informe um valor de compra valido.');
        }

        $purchase_date = $purchase_date ?: wfwc_current_mysql_time();
        $validation    = $this->cashback->validate_redemption($client_id, $gross_amount, $cashback_to_use);

        if (!$validation['valid']) {
            return array('success' => false, 'message' => $validation['message']);
        }

        $generated_amount = $this->cashback->calculate_generated_amount($gross_amount);
        $net_amount       = max(0, round($gross_amount - $cashback_to_use, 2));

        try {
            $this->wpdb->query('START TRANSACTION');

            $inserted = $this->wpdb->insert(
                $this->db->table('purchases'),
                array(
                    'client_id'          => $client_id,
                    'attendant_id'       => $attendant_id ?: null,
                    'gross_amount'       => $gross_amount,
                    'cashback_generated' => $generated_amount,
                    'cashback_used'      => $cashback_to_use,
                    'net_amount'         => $net_amount,
                    'purchase_date'      => $purchase_date,
                    'notes'              => $notes,
                    'webhook_status'     => 'pending',
                    'created_at'         => wfwc_current_mysql_time(),
                    'created_by_user'    => get_current_user_id(),
                )
            );

            if (!$inserted) {
                throw new RuntimeException('Nao foi possivel registrar a compra.');
            }

            $purchase_id = (int) $this->wpdb->insert_id;

            if ($cashback_to_use > 0) {
                $usage_result = $this->cashback->apply_redemption($client_id, $purchase_id, $attendant_id, $gross_amount, $cashback_to_use, $notes);

                if (empty($usage_result['success'])) {
                    throw new RuntimeException($usage_result['message']);
                }
            }

            $credit_result = $this->cashback->create_credit($client_id, $purchase_id, $generated_amount, $purchase_date);

            if (empty($credit_result['success'])) {
                throw new RuntimeException('Nao foi possivel gerar o credito de cashback.');
            }

            $this->wpdb->query('COMMIT');

            $webhook = $this->whatsapp->send_purchase_event($purchase_id);

            $this->wpdb->update(
                $this->db->table('purchases'),
                array('webhook_status' => $webhook['status'] ?? 'pending'),
                array('id' => $purchase_id),
                array('%s'),
                array('%d')
            );

            $this->security->log_sensitive_action(
                'purchase_registered',
                array(
                    'purchase_id'        => $purchase_id,
                    'client_id'          => $client_id,
                    'gross_amount'       => $gross_amount,
                    'cashback_generated' => $generated_amount,
                    'cashback_used'      => $cashback_to_use,
                )
            );

            return array(
                'success'            => true,
                'purchase_id'        => $purchase_id,
                'cashback_generated' => $generated_amount,
                'cashback_used'      => $cashback_to_use,
                'webhook'            => $webhook,
            );
        } catch (Exception $exception) {
            $this->wpdb->query('ROLLBACK');

            $this->security->log_sensitive_action(
                'purchase_registration_failed',
                array(
                    'client_id'    => $client_id,
                    'gross_amount' => $gross_amount,
                    'message'      => $exception->getMessage(),
                ),
                'failed'
            );

            return array(
                'success' => false,
                'message' => $exception->getMessage(),
            );
        }
    }

    public function handle_admin_save()
    {
        $this->security->verify_admin_post('wfwc_save_purchase', WFWC_Security::CAP_MANAGE);

        $result = $this->register_purchase(
            array(
                'client_id'       => wp_unslash($_POST['client_id'] ?? 0),
                'attendant_id'    => wp_unslash($_POST['attendant_id'] ?? 0),
                'gross_amount'    => wp_unslash($_POST['gross_amount'] ?? 0),
                'cashback_to_use' => wp_unslash($_POST['cashback_to_use'] ?? 0),
                'purchase_date'   => wp_unslash($_POST['purchase_date'] ?? ''),
                'notes'           => wp_unslash($_POST['notes'] ?? ''),
            )
        );

        if (empty($result['success'])) {
            wfwc_set_admin_notice($result['message'] ?? 'Nao foi possivel registrar a compra.', 'error');
            wfwc_redirect(wfwc_redirect_target('wfwc-purchases'));
        }

        $notice = sprintf(
            'Compra registrada com sucesso. Cashback gerado: %s.',
            wfwc_format_currency($result['cashback_generated'])
        );

        if (!empty($result['webhook']['status']) && 'sent' !== $result['webhook']['status']) {
            $notice .= ' Webhook: ' . ($result['webhook']['status'] ?? 'pendente') . '.';
        }

        wfwc_set_admin_notice($notice, 'success');
        wfwc_redirect(
            wfwc_redirect_target(
                'wfwc-purchases',
                array('client_id' => absint($_POST['client_id'] ?? 0))
            )
        );
    }
}
