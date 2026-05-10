<?php
if (!defined('ABSPATH')) {
    exit;
}

$start        = sanitize_text_field(wp_unslash($_GET['start'] ?? wp_date('Y-m-01')));
$end          = sanitize_text_field(wp_unslash($_GET['end'] ?? wp_date('Y-m-d')));
$stats        = $plugin->reports->get_dashboard_stats($start, $end);
$rankings     = $plugin->reports->get_attendant_rankings($start, $end);
$period_label = wfwc_format_datetime($start, false) . ' ate ' . wfwc_format_datetime($end, false);
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Relatorios</span>
            <h1>Leitura executiva simples para a rotina da equipe.</h1>
            <p>Acompanhe produtividade, geracao de cashback e alertas da base sem perder tempo com telas pesadas.</p>

            <div class="wfwc-action-strip">
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-dashboard')); ?>">Dashboard</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-attendants')); ?>">Equipe</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-logs')); ?>">Logs</a>
            </div>
        </div>

        <aside class="wfwc-command-side">
            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-period-card">
                <?php wfwc_render_route_hidden_page('wfwc-reports'); ?>
                <div class="wfwc-panel-header wfwc-panel-header-compact">
                    <div>
                        <span class="wfwc-kicker">Filtro</span>
                        <h2>Periodo do ranking</h2>
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
                <button type="submit" class="button button-primary">Atualizar</button>
            </form>

            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Periodo</span>
                    <strong><?php echo esc_html($period_label); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Alertas pendentes</span>
                    <strong><?php echo esc_html(number_format_i18n($stats['pending_alerts'])); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <div class="wfwc-grid wfwc-grid-4">
        <div class="wfwc-metric-card is-neutral">
            <span>Compras</span>
            <strong><?php echo esc_html(number_format_i18n($stats['purchases'])); ?></strong>
        </div>
        <div class="wfwc-metric-card is-primary">
            <span>Cashback gerado</span>
            <strong><?php echo esc_html(wfwc_format_currency($stats['generated'])); ?></strong>
        </div>
        <div class="wfwc-metric-card is-soft">
            <span>Cashback usado</span>
            <strong><?php echo esc_html(wfwc_format_currency($stats['used'])); ?></strong>
        </div>
        <div class="wfwc-metric-card is-warning">
            <span>Cashback expirado</span>
            <strong><?php echo esc_html(wfwc_format_currency($stats['expired'])); ?></strong>
        </div>
    </div>

    <div class="wfwc-grid wfwc-grid-2">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Equipe</span>
                    <h2>Ranking de atendentes</h2>
                    <p>Visao direta de quem mais cadastrou, vendeu e gerou cashback no periodo.</p>
                </div>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>Atendente</th>
                            <th>Clientes cadastrados</th>
                            <th>Compras lancadas</th>
                            <th>Vendas</th>
                            <th>Cashback gerado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($rankings)) : ?>
                            <tr>
                                <td colspan="5" class="wfwc-empty-state">Sem dados para o periodo selecionado.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($rankings as $index => $row) : ?>
                                <tr class="<?php echo 0 === $index ? 'is-highlighted' : ''; ?>">
                                    <td><?php echo esc_html($row['full_name']); ?></td>
                                    <td><?php echo esc_html(number_format_i18n($row['total_clients'])); ?></td>
                                    <td><?php echo esc_html(number_format_i18n($row['total_purchases'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($row['total_sales'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($row['total_generated'])); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Relacionamento</span>
                    <h2>Aniversariantes e alertas</h2>
                    <p>Leitura curta para acao comercial, reativacao e acompanhamento da expiracao de saldo.</p>
                </div>
            </div>
            <?php if (empty($stats['upcoming_birthdays'])) : ?>
                <p class="wfwc-empty-state">Nenhum aniversariante proximo.</p>
            <?php else : ?>
                <ul class="wfwc-simple-list">
                    <?php foreach ($stats['upcoming_birthdays'] as $birthday) : ?>
                        <li>
                            <strong><?php echo esc_html($birthday['full_name']); ?></strong>
                            em <?php echo esc_html(wfwc_format_datetime($birthday['next_birthday'], false)); ?>
                            (<?php echo esc_html(absint($birthday['days_until'])); ?> dia(s))
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
            <div class="wfwc-note-box">
                <strong>Alertas pendentes</strong>
                <p><?php echo esc_html(number_format_i18n($stats['pending_alerts'])); ?> alerta(s) preparados conforme os dias configurados.</p>
            </div>
        </section>
    </div>
</div>
