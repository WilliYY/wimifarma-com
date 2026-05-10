<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Attendants
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

    public function get_attendants($args = array())
    {
        $defaults = array(
            'status' => '',
            'limit'  => 100,
        );

        $args  = array_merge($defaults, $args);
        $where = 'WHERE 1=1';

        if (!empty($args['status'])) {
            $where .= $this->wpdb->prepare(' AND status = %s', $args['status']);
        }

        $limit = max(1, absint($args['limit']));
        $sql   = "SELECT * FROM {$this->db->table('attendants')} {$where} ORDER BY full_name ASC LIMIT {$limit}";

        return $this->wpdb->get_results($sql, ARRAY_A);
    }

    public function get_active_attendants()
    {
        return $this->get_attendants(
            array(
                'status' => 'active',
                'limit'  => 500,
            )
        );
    }

    public function get_attendant($id)
    {
        $sql = $this->wpdb->prepare(
            "SELECT * FROM {$this->db->table('attendants')} WHERE id = %d",
            absint($id)
        );

        return $this->wpdb->get_row($sql, ARRAY_A);
    }

    public function handle_admin_save()
    {
        $this->security->verify_admin_post('wfwc_save_attendant', WFWC_Security::CAP_MANAGE);

        $id        = absint($_POST['attendant_id'] ?? 0);
        $full_name = sanitize_text_field(wp_unslash($_POST['full_name'] ?? ''));
        $status    = sanitize_key(wp_unslash($_POST['status'] ?? 'active'));
        $notes     = sanitize_textarea_field(wp_unslash($_POST['notes'] ?? ''));
        $wp_user   = absint($_POST['wp_user_id'] ?? 0);

        if (empty($full_name)) {
            wfwc_set_admin_notice('Informe o nome do atendente.', 'error');
            wfwc_redirect(wfwc_redirect_target('wfwc-attendants'));
        }

        if ($wp_user > 0 && !get_user_by('id', $wp_user)) {
            wfwc_set_admin_notice('O usuario WordPress selecionado nao existe mais.', 'error');
            wfwc_redirect(wfwc_redirect_target('wfwc-attendants', array('edit' => $id ?: null)));
        }

        $payload = array(
            'wp_user_id' => $wp_user ?: null,
            'full_name'  => $full_name,
            'status'     => in_array($status, array('active', 'inactive'), true) ? $status : 'active',
            'notes'      => $notes,
            'updated_at' => wfwc_current_mysql_time(),
        );

        if ($id > 0) {
            $updated = $this->wpdb->update($this->db->table('attendants'), $payload, array('id' => $id), null, array('%d'));

            if (false === $updated) {
                $this->security->log_sensitive_action('attendant_update_failed', array('attendant_id' => $id, 'full_name' => $full_name), 'failed');
                wfwc_set_admin_notice('Nao foi possivel atualizar o atendente. Nenhum dado foi removido.', 'error');
                wfwc_redirect(wfwc_redirect_target('wfwc-attendants', array('edit' => $id)));
            }

            $this->security->log_sensitive_action('attendant_updated', array('attendant_id' => $id, 'full_name' => $full_name));
            wfwc_set_admin_notice('Atendente atualizado com sucesso.', 'success');
        } else {
            $payload['created_at']      = wfwc_current_mysql_time();
            $payload['created_by_user'] = get_current_user_id();
            $inserted                   = $this->wpdb->insert($this->db->table('attendants'), $payload);

            if (false === $inserted) {
                $this->security->log_sensitive_action('attendant_create_failed', array('full_name' => $full_name), 'failed');
                wfwc_set_admin_notice('Nao foi possivel cadastrar o atendente. Tente novamente.', 'error');
                wfwc_redirect(wfwc_redirect_target('wfwc-attendants'));
            }

            $new_id = (int) $this->wpdb->insert_id;
            $this->security->log_sensitive_action('attendant_created', array('attendant_id' => $new_id, 'full_name' => $full_name));
            wfwc_set_admin_notice('Atendente cadastrado com sucesso.', 'success');
        }

        wfwc_redirect(wfwc_redirect_target('wfwc-attendants'));
    }
}
