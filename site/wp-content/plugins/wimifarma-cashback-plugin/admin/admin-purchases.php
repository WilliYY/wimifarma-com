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

$clients          = $plugin->clients->get_clients(array('limit' => 500));
$attendants       = $plugin->attendants->get_active_attendants();
$purchases        = $plugin->purchases->get_purchases(array('client_id' => $selected_client_id, 'limit' => 80));
$selected_client  = $selected_client_id ? $plugin->clients->get_client($selected_client_id) : null;
$selected_summary = $selected_client ? $plugin->cashback->get_client_balances($selected_client_id) : array();
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Compras</span>
            <h1>Lancamento rapido com contexto de saldo antes da venda.</h1>
            <p>Selecione o cliente com busca rapida, visualize o saldo disponivel e conclua a compra com menos passos no balcao.</p>

            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-search-form">
                <?php wfwc_render_route_hidden_page('wfwc-purchases'); ?>
                <label for="wfwc-purchase-search">Selecionar cliente</label>
                <div class="wfwc-search-row">
                    <input id="wfwc-purchase-search" type="search" name="lookup" value="<?php echo esc_attr($lookup); ?>" data-wfwc-quick-search placeholder="Telefone, nome ou ID interno">
                    <button type="submit" class="button button-primary">Buscar cliente</button>
                    <a class="button" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases')); ?>">Limpar</a>
                </div>
            </form>
        </div>

        <aside class="wfwc-command-side">
            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Cliente atual</span>
                    <strong><?php echo esc_html($selected_client['full_name'] ?? 'Nenhum'); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Saldo disponivel</span>
                    <strong><?php echo esc_html($selected_client ? wfwc_format_currency($selected_summary['total_available'] ?? 0) : '-'); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Compras na tela</span>
                    <strong><?php echo esc_html(number_format_i18n(count($purchases))); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <?php if ($selected_client) : ?>
        <section class="wfwc-panel wfwc-client-focus">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Cliente selecionado</span>
                    <h2><?php echo esc_html($selected_client['full_name']); ?></h2>
                    <p><?php echo esc_html(wfwc_format_phone($selected_client['phone'])); ?> | Proximo vencimento <?php echo esc_html(wfwc_format_datetime($selected_summary['next_expiration'] ?? '', false)); ?></p>
                </div>
                <div class="wfwc-action-strip">
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-cashback', array('client_id' => absint($selected_client['id'])))); ?>">Ver saldo completo</a>
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('client_id' => absint($selected_client['id'])))); ?>">Abrir cadastro</a>
                </div>
            </div>

            <div class="wfwc-grid wfwc-grid-4">
                <div class="wfwc-metric-card is-primary">
                    <span>Saldo disponivel</span>
                    <strong><?php echo esc_html(wfwc_format_currency($selected_summary['total_available'] ?? 0)); ?></strong>
                    <small>Disponivel para uso agora</small>
                </div>
                <div class="wfwc-metric-card is-warning">
                    <span>Saldo expirando</span>
                    <strong><?php echo esc_html(wfwc_format_currency($selected_summary['soon_to_expire'] ?? 0)); ?></strong>
                    <small>Valor proximo do vencimento</small>
                </div>
                <div class="wfwc-metric-card is-soft">
                    <span>Saldo gerado</span>
                    <strong><?php echo esc_html(wfwc_format_currency($selected_summary['total_generated'] ?? 0)); ?></strong>
                    <small>Total acumulado do cliente</small>
                </div>
                <div class="wfwc-metric-card is-neutral">
                    <span>Proximo vencimento</span>
                    <strong><?php echo esc_html(wfwc_format_datetime($selected_summary['next_expiration'] ?? '', false)); ?></strong>
                    <small>Data mais proxima em aberto</small>
                </div>
            </div>
        </section>
    <?php endif; ?>

    <div class="wfwc-grid wfwc-grid-main">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Fluxo de lancamento</span>
                    <h2><?php echo $selected_client ? 'Registrar compra de ' . esc_html($selected_client['full_name']) : 'Registrar nova compra'; ?></h2>
                    <p>O sistema calcula cashback automaticamente e valida o uso minimo em tempo real.</p>
                </div>
            </div>
            <?php
            echo wfwc_render_template(
                'purchase-form.php',
                array(
                    'clients'            => $clients,
                    'attendants'         => $attendants,
                    'selected_client_id' => $selected_client_id,
                    'selected_summary'   => $selected_summary,
                )
            );
            ?>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Historico de lancamentos</span>
                    <h2>Ultimas compras</h2>
                    <p>Consulta rapida do que entrou recentemente para o cliente selecionado ou para a operacao toda.</p>
                </div>
                <span class="wfwc-counter"><?php echo esc_html(count($purchases)); ?> registro(s)</span>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Cliente</th>
                            <th>Compra</th>
                            <th>Usado</th>
                            <th>Gerado</th>
                            <th>Liquido</th>
                            <th>Atendente</th>
                            <th>Webhook</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($purchases)) : ?>
                            <tr>
                                <td colspan="8" class="wfwc-empty-state">Nenhuma compra registrada ainda.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($purchases as $item) : ?>
                                <tr>
                                    <td><?php echo esc_html(wfwc_format_datetime($item['purchase_date'])); ?></td>
                                    <td>
                                        <div class="wfwc-name-stack">
                                            <strong><?php echo esc_html($item['client_name']); ?></strong>
                                            <span><a href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('client_id' => absint($item['client_id'])))); ?>">Abrir cliente</a></span>
                                        </div>
                                    </td>
                                    <td><?php echo esc_html(wfwc_format_currency($item['gross_amount'])); ?></td>
                                    <td><?php echo esc_html(wfwc_empty_if_zero($item['cashback_used'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($item['cashback_generated'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($item['net_amount'])); ?></td>
                                    <td><?php echo esc_html($item['attendant_name'] ?: '-'); ?></td>
                                    <td><span class="wfwc-badge wfwc-badge-<?php echo esc_attr($item['webhook_status']); ?>"><?php echo esc_html($item['webhook_status']); ?></span></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</div>
