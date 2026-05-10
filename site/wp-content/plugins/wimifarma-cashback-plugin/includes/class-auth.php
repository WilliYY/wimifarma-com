<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Auth
{
    private $clients;
    private $cashback;

    public function __construct($clients, $cashback)
    {
        $this->clients  = $clients;
        $this->cashback = $cashback;
    }

    public function register_shortcodes()
    {
        add_shortcode('wfwc_login_form', array($this, 'render_login_shortcode'));
        add_shortcode('wfwc_client_lookup', array($this, 'render_client_lookup_shortcode'));
    }

    public function handle_portal_request()
    {
        wfwc_maybe_start_session();

        if ('POST' === strtoupper($_SERVER['REQUEST_METHOD'] ?? '')) {
            $action = sanitize_key(wp_unslash($_POST['wfwc_portal_action'] ?? ''));

            if ('login' === $action) {
                $this->process_login();
            }

            if ('logout' === $action) {
                $this->process_logout();
            }
        }

        if (!empty($_GET['wfwc_portal_logout'])) {
            $this->process_logout();
        }
    }

    public function render_login_shortcode($atts = array())
    {
        if (wfwc_can_access_portal()) {
            return '<div class="wfwc-public-box"><p>Voce ja esta autenticado no sistema.</p><a class="wfwc-btn" href="' . esc_url(home_url('/')) . '">Ir para o dashboard</a></div>';
        }

        ob_start();
        include WFWC_PLUGIN_DIR . 'public/public-login.php';
        return ob_get_clean();
    }

    public function render_client_lookup_shortcode($atts = array())
    {
        $allow_public = (bool) wfwc_get_setting('allow_public_lookup', 0);

        if (!wfwc_can_access_portal() && !$allow_public) {
            return '<div class="wfwc-public-box"><p>Esta consulta e restrita a equipe logada.</p>' . do_shortcode('[wfwc_login_form]') . '</div>';
        }

        $client  = null;
        $summary = array();
        $history = array();
        $error   = '';

        if ('POST' === $_SERVER['REQUEST_METHOD'] && !empty($_POST['wfwc_lookup_nonce'])) {
            if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wfwc_lookup_nonce'])), 'wfwc_public_lookup')) {
                $error = 'Nao foi possivel validar a consulta.';
            } else {
                $identifier = sanitize_text_field(wp_unslash($_POST['lookup_identifier'] ?? ''));
                $public_key = wfwc_sanitize_phone($identifier);

                if (!wfwc_can_access_portal() && $allow_public) {
                    if (!is_numeric($identifier) && !is_numeric($public_key)) {
                        $error = 'Na consulta publica, use telefone ou ID interno.';
                    } else {
                        $client = $this->clients->find_by_identifier(is_numeric($public_key) ? $public_key : $identifier);
                    }
                } else {
                    $client = $this->clients->find_by_identifier($identifier);
                }

                if ($client) {
                    $summary = $this->cashback->get_client_balances($client['id']);
                    $history = $this->clients->get_client_history($client['id']);
                } elseif (empty($error)) {
                    $error = 'Cliente nao encontrado com os dados informados.';
                }
            }
        }

        ob_start();
        include WFWC_PLUGIN_DIR . 'public/public-client-lookup.php';
        return ob_get_clean();
    }

    private function process_login()
    {
        if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wfwc_portal_login_nonce'] ?? '')), 'wfwc_portal_login')) {
            wfwc_set_admin_notice('Nao foi possivel validar o login.', 'error');
            wfwc_redirect(add_query_arg('login', 'failed', home_url('/')));
        }

        $username = sanitize_text_field(wp_unslash($_POST['portal_username'] ?? ''));
        $password = sanitize_text_field(wp_unslash($_POST['portal_password'] ?? ''));

        if ('' === $username || '' === $password) {
            wfwc_redirect(add_query_arg('login', 'empty', home_url('/')));
        }

        if (!wfwc_portal_login($username, $password)) {
            wfwc_redirect(add_query_arg('login', 'failed', home_url('/')));
        }

        wfwc_set_admin_notice('Login realizado com sucesso.', 'success');
        wfwc_redirect(home_url('/'));
    }

    private function process_logout()
    {
        wfwc_portal_logout();
        wfwc_redirect(home_url('/'));
    }
}
