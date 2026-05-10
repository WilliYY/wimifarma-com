<?php
if (!defined('ABSPATH')) {
    exit;
}

$start        = sanitize_text_field(wp_unslash($_GET['start'] ?? wp_date('Y-m-01')));
$end          = sanitize_text_field(wp_unslash($_GET['end'] ?? wp_date('Y-m-d')));
$stats        = $plugin->reports->get_dashboard_stats($start, $end);
$period_label = wfwc_format_datetime($start, false) . ' ate ' . wfwc_format_datetime($end, false);

$cards = array(
    array(
        'label' => 'Clientes ativos',
        'value' => number_format_i18n($stats['total_clients']),
        'hint'  => 'Base pronta para retorno',
        'tone'  => 'is-soft',
    ),
    array(
        'label' => 'Compras no periodo',
        'value' => number_format_i18n($stats['purchases']),
        'hint'  => 'Lancamentos do periodo filtrado',
        'tone'  => 'is-neutral',
    ),
    array(
        'label' => 'Cashback gerado',
        'value' => wfwc_format_currency($stats['generated']),
        'hint'  => 'Credito acumulado nas compras',
        'tone'  => 'is-primary',
    ),
    array(
        'label' => 'Cashback utilizado',
        'value' => wfwc_format_currency($stats['used']),
        'hint'  => 'Resgates feitos no balcao',
        'tone'  => 'is-soft',
    ),
    array(
        'label' => 'Cashback expirado',
        'value' => wfwc_format_currency($stats['expired']),
        'hint'  => 'Saldo perdido por validade',
        'tone'  => 'is-warning',
    ),
    array(
        'label' => 'Alertas pendentes',
        'value' => number_format_i18n($stats['pending_alerts']),
        'hint'  => 'Clientes para acompanhar',
        'tone'  => 'is-dark',
    ),
);
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Wimifarma Cashback</span>
            <h1>Operacao agil para o balcao da farmacia.</h1>
            <p>Consulte clientes em segundos, visualize saldos sem ruído e acesse o historico certo antes de registrar a proxima compra.</p>

            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-search-form wfwc-search-form-dark">
                <?php wfwc_render_route_hidden_page('wfwc-cashback'); ?>
                <label for="wfwc-dashboard-lookup">Busca rapida de cliente</label>
                <div class="wfwc-search-row">
                    <input id="wfwc-dashboard-lookup" type="search" name="lookup" data-wfwc-quick-search placeholder="Telefone, nome ou ID interno">
                    <button type="submit" class="button button-primary">Consultar saldo</button>
                </div>
                <small>Atalho do teclado: pressione / para focar a busca.</small>
            </form>

            <div class="wfwc-action-strip">
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients')); ?>">Novo cliente</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases')); ?>">Nova compra</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-cashback')); ?>">Consulta de cashback</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-reports')); ?>">Relatorios</a>
            </div>
        </div>

        <aside class="wfwc-command-side">
            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-period-card">
                <?php wfwc_render_route_hidden_page('wfwc-dashboard'); ?>
                <div class="wfwc-panel-header wfwc-panel-header-compact">
                    <div>
                        <span class="wfwc-kicker">Janela ativa</span>
                        <h2>Filtro do dashboard</h2>
                    </div>
                </div>

                <label>
                    <span>De</span>
                    <input type="date" name="start" value="<?php echo esc_attr($start); ?>">
                </label>
                <label>
                    <span>Ate</span>
                    <input type="date" name="end" value="<?php echo esc_attr($end); ?>">
                </label>
                <button type="submit" class="button button-primary">Atualizar visao</button>
            </form>

            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Periodo</span>
                    <strong><?php echo esc_html($period_label); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Alerta de expiracao</span>
                    <strong><?php echo esc_html(wfwc_get_setting('expiration_alert_days', '10,5')); ?> dias</strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Aniversariantes proximos</span>
                    <strong><?php echo esc_html(number_format_i18n(count($stats['upcoming_birthdays']))); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <?php echo wfwc_render_template('dashboard-cards.php', array('cards' => $cards)); ?>

    <div class="wfwc-grid wfwc-grid-2">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Equipe</span>
                    <h2>Destaques operacionais</h2>
                    <p>Quem mais puxou a operacao de cadastro e venda dentro do programa.</p>
                </div>
            </div>
            <div class="wfwc-stat-list">
                <div class="wfwc-stat-row">
                    <span>Atendente com mais cadastros</span>
                    <strong><?php echo esc_html($stats['top_client_attendant']['full_name'] ?? 'Sem dados'); ?></strong>
                </div>
                <div class="wfwc-stat-row">
                    <span>Cadastros no periodo</span>
                    <strong><?php echo esc_html($stats['top_client_attendant']['total_clients'] ?? '0'); ?></strong>
                </div>
                <div class="wfwc-stat-row">
                    <span>Maior volume em vendas</span>
                    <strong><?php echo esc_html($stats['top_sales_attendant']['full_name'] ?? 'Sem dados'); ?></strong>
                </div>
                <div class="wfwc-stat-row">
                    <span>Vendas no periodo</span>
                    <strong><?php echo isset($stats['top_sales_attendant']['total_sales']) ? esc_html(wfwc_format_currency($stats['top_sales_attendant']['total_sales'])) : 'R$ 0,00'; ?></strong>
                </div>
                <div class="wfwc-stat-row">
                    <span>Cashback gerado pela lideranca</span>
                    <strong><?php echo isset($stats['top_sales_attendant']['total_generated']) ? esc_html(wfwc_format_currency($stats['top_sales_attendant']['total_generated'])) : 'R$ 0,00'; ?></strong>
                </div>
            </div>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Relacionamento</span>
                    <h2>Aniversariantes proximos</h2>
                    <p>Lista curta para acao rapida de atendimento e campanha.</p>
                </div>
            </div>
            <?php if (empty($stats['upcoming_birthdays'])) : ?>
                <p class="wfwc-empty-state">Nenhum aniversariante nos proximos 15 dias.</p>
            <?php else : ?>
                <div class="table-responsive">
                    <table class="widefat striped wfwc-data-table">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Telefone</th>
                                <th>Data</th>
                                <th>Em</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($stats['upcoming_birthdays'] as $birthday) : ?>
                                <tr>
                                    <td><?php echo esc_html($birthday['full_name']); ?></td>
                                    <td><?php echo esc_html(wfwc_format_phone($birthday['phone'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_datetime($birthday['next_birthday'], false)); ?></td>
                                    <td><?php echo esc_html(absint($birthday['days_until'])); ?> dia(s)</td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </section>
    </div>

    <div class="wfwc-grid wfwc-grid-2">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Acompanhamento</span>
                    <h2>Alertas operacionais</h2>
                    <p>Leitura simples para saber o que acompanhar no fluxo do dia.</p>
                </div>
            </div>
            <ul class="wfwc-simple-list">
                <li>Expiracao automatica ativa via WP-Cron <strong>todos os dias</strong>.</li>
                <li>Janela de aviso configurada para <strong><?php echo esc_html(wfwc_get_setting('expiration_alert_days', '10,5')); ?> dias</strong>.</li>
                <li>Consulta de saldo e uso rapido no menu <strong>Cashback</strong>.</li>
                <li>Automacoes e webhooks centralizados em <strong>Configuracoes</strong>.</li>
            </ul>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Atalhos</span>
                    <h2>Acoes rapidas do balcão</h2>
                    <p>Rotas curtas para os movimentos mais frequentes da equipe.</p>
                </div>
            </div>
            <div class="wfwc-action-grid">
                <a class="wfwc-action-card" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients')); ?>">
                    <strong>Novo cliente</strong>
                    <span>Cadastrar cliente e vincular atendente responsavel.</span>
                </a>
                <a class="wfwc-action-card" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases')); ?>">
                    <strong>Registrar compra</strong>
                    <span>Lancar compra com uso e geracao de cashback.</span>
                </a>
                <a class="wfwc-action-card" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-cashback')); ?>">
                    <strong>Consultar saldo</strong>
                    <span>Ver saldo disponivel, expirando e historico.</span>
                </a>
                <a class="wfwc-action-card" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-logs')); ?>">
                    <strong>Revisar alertas</strong>
                    <span>Checar automacoes, retries e respostas dos webhooks.</span>
                </a>
            </div>
        </section>
    </div>
</div>
