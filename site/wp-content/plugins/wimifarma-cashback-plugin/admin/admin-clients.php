<?php
if (!defined('ABSPATH')) {
    exit;
}

$search               = sanitize_text_field(wp_unslash($_GET['s'] ?? ''));
$edit_id              = absint($_GET['edit'] ?? 0);
$selected_client_id   = absint($_GET['client_id'] ?? $edit_id);
$clients              = $plugin->clients->get_clients(array('search' => $search, 'limit' => 200));
$attendants           = $plugin->attendants->get_active_attendants();
$client               = $edit_id ? $plugin->clients->get_client($edit_id) : array();
$history_client       = $selected_client_id ? $plugin->clients->get_client($selected_client_id) : null;
$summary              = $history_client ? $plugin->cashback->get_client_balances($selected_client_id) : array();
$history              = $history_client ? $plugin->clients->get_client_history($selected_client_id) : array();
$selected_purchases   = !empty($history['purchases']) ? count($history['purchases']) : 0;
$selected_usages      = !empty($history['usages']) ? count($history['usages']) : 0;
$selected_next_expiry = !empty($summary['next_expiration']) ? wfwc_format_datetime($summary['next_expiration'], false) : '-';
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Base de clientes</span>
            <h1>Busca e consulta rapida para atendimento no balcao.</h1>
            <p>Encontre o cliente certo, veja saldo de relance e abra o historico sem perder tempo na operacao.</p>

            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-search-form">
                <?php wfwc_render_route_hidden_page('wfwc-clients'); ?>
                <label for="wfwc-client-search">Buscar cliente</label>
                <div class="wfwc-search-row">
                    <input id="wfwc-client-search" type="search" name="s" value="<?php echo esc_attr($search); ?>" data-wfwc-quick-search placeholder="Nome, telefone ou ID interno">
                    <button type="submit" class="button button-primary">Buscar</button>
                    <a class="button" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients')); ?>">Limpar</a>
                </div>
                <small>Atalho do teclado: pressione / para focar a busca.</small>
            </form>

            <div class="wfwc-action-strip">
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients')); ?>">Novo cadastro</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-cashback')); ?>">Consulta de cashback</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases')); ?>">Registrar compra</a>
            </div>
        </div>

        <aside class="wfwc-command-side">
            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Resultados exibidos</span>
                    <strong><?php echo esc_html(number_format_i18n(count($clients))); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Cliente em foco</span>
                    <strong><?php echo esc_html($history_client['full_name'] ?? 'Nenhum'); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Saldo em foco</span>
                    <strong><?php echo esc_html($history_client ? wfwc_format_currency($summary['total_available'] ?? 0) : '-'); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <?php if ($history_client) : ?>
        <section class="wfwc-panel wfwc-client-focus">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Cliente em foco</span>
                    <h2><?php echo esc_html($history_client['full_name']); ?></h2>
                    <p><?php echo esc_html(wfwc_format_phone($history_client['phone'])); ?> | Status <?php echo esc_html($history_client['status']); ?> | Atendente <?php echo esc_html($history_client['attendant_name'] ?: '-'); ?></p>
                </div>
                <div class="wfwc-action-strip">
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('edit' => absint($history_client['id']), 'client_id' => absint($history_client['id'])))); ?>">Editar cadastro</a>
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases', array('client_id' => absint($history_client['id'])))); ?>">Nova compra</a>
                    <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-cashback', array('client_id' => absint($history_client['id'])))); ?>">Painel de saldo</a>
                </div>
            </div>

            <div class="wfwc-grid wfwc-grid-4">
                <div class="wfwc-metric-card is-primary">
                    <span>Saldo disponivel</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['total_available'] ?? 0)); ?></strong>
                    <small>Valor pronto para uso</small>
                </div>
                <div class="wfwc-metric-card is-warning">
                    <span>Saldo expirando</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['soon_to_expire'] ?? 0)); ?></strong>
                    <small>Valor com vencimento proximo</small>
                </div>
                <div class="wfwc-metric-card is-soft">
                    <span>Movimentos no historico</span>
                    <strong><?php echo esc_html(number_format_i18n($selected_purchases + $selected_usages)); ?></strong>
                    <small><?php echo esc_html(number_format_i18n($selected_purchases)); ?> compras e <?php echo esc_html(number_format_i18n($selected_usages)); ?> usos</small>
                </div>
                <div class="wfwc-metric-card is-neutral">
                    <span>Proximo vencimento</span>
                    <strong><?php echo esc_html($selected_next_expiry); ?></strong>
                    <small>Data mais proxima em aberto</small>
                </div>
            </div>
        </section>
    <?php endif; ?>

    <div class="wfwc-grid wfwc-grid-main">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Cadastro</span>
                    <h2><?php echo $edit_id ? 'Editar cliente' : 'Novo cliente'; ?></h2>
                    <p>Formulário enxuto para registrar o cliente com atendente responsavel.</p>
                </div>
            </div>
            <?php
            echo wfwc_render_template(
                'client-form.php',
                array(
                    'client'     => $client,
                    'attendants' => $attendants,
                )
            );
            ?>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Consulta</span>
                    <h2>Base de clientes</h2>
                    <p>Saldo visivel na listagem para acelerar a triagem no balcao.</p>
                </div>
                <span class="wfwc-counter"><?php echo esc_html(count($clients)); ?> registro(s)</span>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Cliente</th>
                            <th>Atendente</th>
                            <th>Status</th>
                            <th>Saldo disponivel</th>
                            <th>Expirando</th>
                            <th>Criado em</th>
                            <th>Acoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($clients)) : ?>
                            <tr>
                                <td colspan="8" class="wfwc-empty-state">Nenhum cliente encontrado.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($clients as $item) : ?>
                                <?php
                                $balances  = $plugin->cashback->get_client_balances($item['id']);
                                $row_class = $selected_client_id === (int) $item['id'] ? 'wfwc-row-current' : '';
                                ?>
                                <tr class="<?php echo esc_attr($row_class); ?>">
                                    <td>#<?php echo esc_html($item['id']); ?></td>
                                    <td>
                                        <div class="wfwc-name-stack">
                                            <strong><?php echo esc_html($item['full_name']); ?></strong>
                                            <span><?php echo esc_html(wfwc_format_phone($item['phone'])); ?></span>
                                        </div>
                                    </td>
                                    <td><?php echo esc_html($item['attendant_name'] ?: '-'); ?></td>
                                    <td><span class="wfwc-badge wfwc-badge-<?php echo esc_attr($item['status']); ?>"><?php echo esc_html($item['status']); ?></span></td>
                                    <td><strong><?php echo esc_html(wfwc_format_currency($balances['total_available'] ?? 0)); ?></strong></td>
                                    <td><?php echo esc_html(wfwc_empty_if_zero($balances['soon_to_expire'] ?? 0)); ?></td>
                                    <td><?php echo esc_html(wfwc_format_datetime($item['created_at'])); ?></td>
                                    <td>
                                        <div class="wfwc-table-links">
                                            <a href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('edit' => absint($item['id']), 'client_id' => absint($item['id'])))); ?>">Editar</a>
                                            <a href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients', array('client_id' => absint($item['id'])))); ?>">Historico</a>
                                            <a href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases', array('client_id' => absint($item['id'])))); ?>">Nova compra</a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
    </div>

    <?php
    if ($history_client) {
        echo wfwc_render_template(
            'client-history.php',
            array(
                'client'  => $history_client,
                'summary' => $summary,
                'history' => $history,
            )
        );
    }
    ?>
</div>
