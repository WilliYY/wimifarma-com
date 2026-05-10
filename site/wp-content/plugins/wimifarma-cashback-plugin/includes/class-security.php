<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Security
{
    const CAP_VIEW     = 'view_wimifarma_cashback';
    const CAP_MANAGE   = 'manage_wimifarma_cashback';
    const CAP_SETTINGS = 'manage_wimifarma_cashback_settings';
    const CAP_REPORTS  = 'view_wimifarma_cashback_reports';
    const CAP_LOGS     = 'view_wimifarma_cashback_logs';

    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public static function install_roles()
    {
        $all_caps = array(
            self::CAP_VIEW     => true,
            self::CAP_MANAGE   => true,
            self::CAP_SETTINGS => true,
            self::CAP_REPORTS  => true,
            self::CAP_LOGS     => true,
            'read'             => true,
        );

        add_role('wimifarma_gerente', 'Gerente Wimifarma', $all_caps);

        add_role(
            'wimifarma_atendente',
            'Atendente Wimifarma',
            array(
                self::CAP_VIEW    => true,
                self::CAP_MANAGE  => true,
                self::CAP_REPORTS => true,
                'read'            => true,
            )
        );

        $administrator = get_role('administrator');

        if ($administrator) {
            foreach (array_keys($all_caps) as $capability) {
                $administrator->add_cap($capability);
            }
        }
    }

    public function ensure_roles()
    {
        self::install_roles();
    }

    public function assert_access($capability = self::CAP_VIEW)
    {
        if (current_user_can($capability) || wfwc_portal_is_authenticated()) {
            return;
        }

        wp_die(esc_html__('Voce nao tem permissao para acessar esta area.', 'wimifarma-cashback'));
    }

    public function verify_admin_post($action, $capability = self::CAP_MANAGE)
    {
        $this->assert_access($capability);
        check_admin_referer($action);
    }

    public function log_sensitive_action($action, $context = array(), $status = 'success')
    {
        $actor_id = get_current_user_id();

        if (!$actor_id && wfwc_portal_is_authenticated()) {
            $actor_id = null;
            $context['portal_user'] = $_SESSION['wfwc_portal_user'] ?? 'adm';
        }

        $this->db->insert_log(
            array(
                'category'      => 'security',
                'event_type'    => sanitize_key($action),
                'status'        => sanitize_key($status),
                'payload'       => wp_json_encode($context),
                'created_by_user' => $actor_id,
                'response_body' => $actor_id
                    ? sprintf('Usuario %d executou a acao.', $actor_id)
                    : 'Sessao do portal executou a acao.',
            )
        );
    }
}
