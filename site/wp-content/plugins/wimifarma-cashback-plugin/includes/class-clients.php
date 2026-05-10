<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Clients
{
    private $db;
    private $security;
    private $wpdb;

    public function __construct($db, $security)
    {
        $this->db       = $db;
        $this->security = $security;
        $this->wpdb     = $db->get_wpdb();
    }

    public function get_clients($args = array())
    {
        $defaults = array(
            'search' => '',
            'status' => '',
            'limit'  => 100,
        );

        $args  = array_merge($defaults, $args);
        $where = 'WHERE 1=1';

        if (!empty($args['status'])) {
            $where .= $this->wpdb->prepare(' AND c.status = %s', $args['status']);
        }

        if (!empty($args['search'])) {
            $term  = '%' . $this->wpdb->esc_like($args['search']) . '%';
            $where .= $this->wpdb->prepare(' AND (c.full_name LIKE %s OR c.phone LIKE %s OR c.id = %d)', $term, $term, absint($args['search']));
        }

        $limit = max(1, absint($args['limit']));

        $sql = "
            SELECT c.*, a.full_name AS attendant_name
            FROM {$this->db->table('clients')} c
            LEFT JOIN {$this->db->table('attendants')} a ON a.id = c.attendant_id
            {$where}
            ORDER BY c.created_at DESC
            LIMIT {$limit}
        ";

        return $this->wpdb->get_results($sql, ARRAY_A);
    }

    public function search_clients($term, $limit = 20)
    {
        return $this->get_clients(
            array(
                'search' => sanitize_text_field($term),
                'limit'  => absint($limit),
            )
        );
    }

    public function get_client($id)
    {
        $sql = $this->wpdb->prepare(
            "SELECT c.*, a.full_name AS attendant_name
            FROM {$this->db->table('clients')} c
            LEFT JOIN {$this->db->table('attendants')} a ON a.id = c.attendant_id
            WHERE c.id = %d",
            absint($id)
        );

        return $this->wpdb->get_row($sql, ARRAY_A);
    }

    public function find_by_identifier($identifier)
    {
        $identifier = trim((string) $identifier);

        if ($identifier === '') {
            return null;
        }

        $phone = wfwc_sanitize_phone($identifier);

        if (is_numeric($identifier)) {
            $sql = $this->wpdb->prepare(
                "SELECT * FROM {$this->db->table('clients')} WHERE id = %d OR phone = %s ORDER BY id ASC LIMIT 1",
                absint($identifier),
                $phone
            );
        } else {
            $term = '%' . $this->wpdb->esc_like($identifier) . '%';
            $sql  = $this->wpdb->prepare(
                "SELECT * FROM {$this->db->table('clients')} WHERE full_name LIKE %s ORDER BY full_name ASC LIMIT 1",
                $term
            );
        }

        return $this->wpdb->get_row($sql, ARRAY_A);
    }

    public function get_client_history($client_id)
    {
        $client_id = absint($client_id);

        $purchases = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT p.*, a.full_name AS attendant_name
                FROM {$this->db->table('purchases')} p
                LEFT JOIN {$this->db->table('attendants')} a ON a.id = p.attendant_id
                WHERE p.client_id = %d
                ORDER BY p.purchase_date DESC
                LIMIT 50",
                $client_id
            ),
            ARRAY_A
        );

        $usages = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT u.*, a.full_name AS attendant_name
                FROM {$this->db->table('cashback_usages')} u
                LEFT JOIN {$this->db->table('attendants')} a ON a.id = u.attendant_id
                WHERE u.client_id = %d
                ORDER BY u.used_at DESC
                LIMIT 50",
                $client_id
            ),
            ARRAY_A
        );

        $credits = $this->wpdb->get_results(
            $this->wpdb->prepare(
                "SELECT * FROM {$this->db->table('cashback_credits')} WHERE client_id = %d ORDER BY expires_at ASC",
                $client_id
            ),
            ARRAY_A
        );

        return array(
            'purchases' => $purchases,
            'usages'    => $usages,
            'credits'   => $credits,
        );
    }

    public function handle_admin_save()
    {
        $this->security->verify_admin_post('wfwc_save_client', WFWC_Security::CAP_MANAGE);

        $id           = absint($_POST['client_id'] ?? 0);
        $full_name    = sanitize_text_field(wp_unslash($_POST['full_name'] ?? ''));
        $phone        = wfwc_sanitize_phone(wp_unslash($_POST['phone'] ?? ''));
        $birth_date   = wfwc_parse_date_for_storage(wp_unslash($_POST['birth_date'] ?? ''));
        $notes        = sanitize_textarea_field(wp_unslash($_POST['notes'] ?? ''));
        $status       = sanitize_key(wp_unslash($_POST['status'] ?? 'active'));
        $attendant_id = absint($_POST['attendant_id'] ?? 0);

        if (empty($full_name)) {
            wfwc_set_admin_notice('O nome do cliente e obrigatorio.', 'error');
            wfwc_redirect(wfwc_redirect_target('wfwc-clients'));
        }

        if ($attendant_id > 0 && !$this->attendant_exists($attendant_id)) {
            wfwc_set_admin_notice('O atendente selecionado nao existe mais. Atualize a tela e tente novamente.', 'error');
            wfwc_redirect(wfwc_redirect_target('wfwc-clients', array('edit' => $id ?: null, 'client_id' => $id ?: null)));
        }

        $data = array(
            'full_name'    => $full_name,
            'phone'        => $phone ?: null,
            'birth_date'   => $birth_date,
            'notes'        => $notes,
            'status'       => in_array($status, array('active', 'inactive'), true) ? $status : 'active',
            'attendant_id' => $attendant_id ?: null,
            'updated_at'   => wfwc_current_mysql_time(),
        );

        if ($id > 0) {
            $updated = $this->wpdb->update($this->db->table('clients'), $data, array('id' => $id), null, array('%d'));

            if (false === $updated) {
                $this->security->log_sensitive_action('client_update_failed', array('client_id' => $id, 'full_name' => $full_name), 'failed');
                wfwc_set_admin_notice('Nao foi possivel atualizar o cliente. Nenhum dado foi removido.', 'error');
                wfwc_redirect(wfwc_redirect_target('wfwc-clients', array('edit' => $id, 'client_id' => $id)));
            }

            $this->security->log_sensitive_action('client_updated', array('client_id' => $id, 'full_name' => $full_name));
            wfwc_set_admin_notice('Cliente atualizado com sucesso.', 'success');
        } else {
            $data['created_at']      = wfwc_current_mysql_time();
            $data['created_by_user'] = get_current_user_id();
            $inserted                = $this->wpdb->insert($this->db->table('clients'), $data);

            if (false === $inserted) {
                $this->security->log_sensitive_action('client_create_failed', array('full_name' => $full_name), 'failed');
                wfwc_set_admin_notice('Nao foi possivel cadastrar o cliente. Tente novamente.', 'error');
                wfwc_redirect(wfwc_redirect_target('wfwc-clients'));
            }

            $new_id = (int) $this->wpdb->insert_id;
            $this->security->log_sensitive_action('client_created', array('client_id' => $new_id, 'full_name' => $full_name));
            wfwc_set_admin_notice('Cliente cadastrado com sucesso.', 'success');
        }

        wfwc_redirect(wfwc_redirect_target('wfwc-clients'));
    }

    private function attendant_exists($attendant_id)
    {
        return (bool) $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT id FROM {$this->db->table('attendants')} WHERE id = %d",
                absint($attendant_id)
            )
        );
    }
}
