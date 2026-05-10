<?php
if (!defined('ABSPATH')) {
    exit;
}

$lookup             = sanitize_text_field(wp_unslash($_GET['lookup'] ?? ''));
$selected_client_id = absint($_GET['client_id'] ?? 0);

if ($lookup !== '' && !$selected_client_id) {
    $found_client = $plugin->clients->find_by_identifier($lookup);
    if ($found_client) {
        $selected_client_id = absint($found_client['id']);
    }
}

$client              = $selected_client_id ? $plugin->clients->get_client($selected_client_id) : null;
$summary             = $client ? $plugin->cashback->get_client_balances($selected_client_id) : array();
$history             = $client ? $plugin->clients->get_client_history($selected_client_id) : array();
$history_count       = $client ? count($history['purchases']) + count($history['usages']) : 0;
$next_expiration     = $client ? wfwc_format_datetime($summary['next_expiration'] ?? '', false) : '-';
$selected_phone      = $client ? wfwc_format_phone($client['phone']) : '-';
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Consulta de cashback</span>
            <h1>Saldo claro, vencimento visivel e historico pronto para orientar o retorno.</h1>
            <p>Esta tela foi organizada para mostrar o que o balcao precisa decidir rapido: saldo disponivel, saldo expirando e contexto de uso.</p>

            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-search-form">
                <?php wfwc_render_route_hidden_page('wfwc-cashback'); ?>
                <label for="wfwc-cashback-search">Buscar cliente</label>
                <div class="wfwc-search-row">
                    <input id="wfwc-cashback-search" type="search" name="lookup" value="<?php echo esc_attr($lookup); ?>" data-wfwc-quick-search placeholder="Telefone, nome ou ID interno">
                    <button type="submit" class="button button-primary">Consultar</button>
                </div>
                <small>Atalho do teclado: pressione / para focar a busca.</small>
            </form>
        </div>

        <aside class="wfwc-command-side">
            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Cliente em foco</span>
                    <strong><?php echo esc_html($client['full_name'] ?? 'Nenhum'); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Saldo disponivel</span>
                    <strong><?php echo esc_html($client ? wfwc_format_currency($summary['total_available'] ?? 0) : '-'); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Vencimento mais proximo</span>
                    <strong><?php echo esc_html($next_expiration); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <?php if (!$client) : ?>
        <section class="wfwc-panel">
            <p class="wfwc-empty-state">Busque um cliente para visualizar saldo disponivel, saldo expirando, historico e simulacao de uso no retorno.</p>
        </section>
    <?php else : ?>
        <section class="wfwc-panel wfwc-client-focus">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Cliente em foco</span>
                    <h2><?php echo esc_html($client['full_name']); ?></h2>
                    <p><?php echo esc_html($selected_phone); ?> | Status <?php echo esc_html($client['status']); ?> | Atendimento orientado pelo saldo disponivel.</p>
                </div>
                <div class="wfwc-action-strip">
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases', array('client_id' => absint($client['id'])))); ?>">Registrar compra com uso</a>
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('client_id' => absint($client['id'])))); ?>">Abrir cadastro</a>
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('edit' => absint($client['id']), 'client_id' => absint($client['id'])))); ?>">Editar cliente</a>
                </div>
            </div>

            <div class="wfwc-grid wfwc-grid-4">
                <div class="wfwc-metric-card is-primary">
                    <span>Saldo disponivel</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['total_available'] ?? 0)); ?></strong>
                    <small>Valor liberado para retorno</small>
                </div>
                <div class="wfwc-metric-card is-warning">
                    <span>Saldo expirando</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['soon_to_expire'] ?? 0)); ?></strong>
                    <small>Foco comercial imediato</small>
                </div>
                <div class="wfwc-metric-card is-soft">
                    <span>Saldo utilizado</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['total_used'] ?? 0)); ?></strong>
                    <small>Historico de resgates</small>
                </div>
                <div class="wfwc-metric-card is-neutral">
                    <span>Historico de movimentos</span>
                    <strong><?php echo esc_html(number_format_i18n($history_count)); ?></strong>
                    <small>Compras e usos registrados</small>
                </div>
            </div>

            <div class="wfwc-grid wfwc-grid-2">
                <div class="wfwc-subpanel" data-wfwc-simulator data-available="<?php echo esc_attr((float) ($summary['total_available'] ?? 0)); ?>">
                    <div class="wfwc-subpanel-header">
                        <div>
                            <span class="wfwc-kicker">Simulacao</span>
                            <h3>Uso de cashback</h3>
                        </div>
                    </div>
                    <p>A regra atual exige compra minima de <strong><?php echo esc_html(absint(wfwc_get_setting('cashback_redeem_multiplier', 4))); ?>x</strong> o valor de cashback usado.</p>
                    <div class="wfwc-field-grid">
                        <label>
                            <span>Valor da compra</span>
                            <input type="text" data-wfwc-purchase-amount placeholder="0,00">
                        </label>
                        <label>
                            <span>Cashback desejado</span>
                            <input type="text" data-wfwc-desired-cashback placeholder="0,00">
                        </label>
                    </div>
                    <div class="wfwc-simulator-result">
                        <span>Maximo permitido nesta compra</span>
                        <strong data-wfwc-max-redeem>R$ 0,00</strong>
                    </div>
                    <div class="wfwc-simulator-message" data-wfwc-simulator-message></div>
                </div>

                <div class="wfwc-subpanel">
                    <div class="wfwc-subpanel-header">
                        <div>
                            <span class="wfwc-kicker">Leitura rapida</span>
                            <h3>Indicadores do cliente</h3>
                        </div>
                    </div>
                    <ul class="wfwc-simple-list">
                        <li>Telefone <strong><?php echo esc_html($selected_phone); ?></strong></li>
                        <li>Status <strong><?php echo esc_html($client['status']); ?></strong></li>
                        <li>Saldo gerado <strong><?php echo esc_html(wfwc_format_currency($summary['total_generated'] ?? 0)); ?></strong></li>
                        <li>Saldo expirado <strong><?php echo esc_html(wfwc_format_currency($summary['total_expired'] ?? 0)); ?></strong></li>
                        <li>Proximo vencimento <strong><?php echo esc_html($next_expiration); ?></strong></li>
                    </ul>
                </div>
            </div>
        </section>

        <?php echo wfwc_render_template('client-history.php', array('client' => $client, 'summary' => $summary, 'history' => $history)); ?>
    <?php endif; ?>
</div>
