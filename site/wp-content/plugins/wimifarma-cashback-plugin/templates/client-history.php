<?php
$history = wp_parse_args(
    (array) $history,
    array(
        'purchases' => array(),
        'usages'    => array(),
        'credits'   => array(),
    )
);

$purchase_count   = count($history['purchases']);
$usage_count      = count($history['usages']);
$credit_count     = count($history['credits']);
$history_total    = $purchase_count + $usage_count;
$expiring_amount  = (float) ($summary['soon_to_expire'] ?? 0);
$next_expiration  = !empty($summary['next_expiration']) ? wfwc_format_datetime($summary['next_expiration'], false) : '-';
?>
<section class="wfwc-panel wfwc-history-shell">
    <div class="wfwc-panel-header">
        <div>
            <span class="wfwc-kicker">Historico completo</span>
            <h2><?php echo esc_html($client['full_name']); ?></h2>
            <p>Saldo e movimentos organizados para consulta rapida no retorno do cliente.</p>
        </div>
        <div class="wfwc-inline-stats">
            <div>
                <span>Compras</span>
                <strong><?php echo esc_html(number_format_i18n($purchase_count)); ?></strong>
            </div>
            <div>
                <span>Usos</span>
                <strong><?php echo esc_html(number_format_i18n($usage_count)); ?></strong>
            </div>
            <div>
                <span>Creditos</span>
                <strong><?php echo esc_html(number_format_i18n($credit_count)); ?></strong>
            </div>
        </div>
    </div>

    <div class="wfwc-grid wfwc-grid-4">
        <div class="wfwc-metric-card is-primary">
            <span>Saldo disponivel</span>
            <strong><?php echo esc_html(wfwc_format_currency($summary['total_available'] ?? 0)); ?></strong>
            <small>Valor liberado para uso</small>
        </div>
        <div class="wfwc-metric-card <?php echo $expiring_amount > 0 ? 'is-warning' : 'is-soft'; ?>">
            <span>Saldo expirando</span>
            <strong><?php echo esc_html(wfwc_format_currency($summary['soon_to_expire'] ?? 0)); ?></strong>
            <small>Foco de retorno imediato</small>
        </div>
        <div class="wfwc-metric-card is-soft">
            <span>Saldo utilizado</span>
            <strong><?php echo esc_html(wfwc_format_currency($summary['total_used'] ?? 0)); ?></strong>
            <small>Historico de resgates</small>
        </div>
        <div class="wfwc-metric-card is-neutral">
            <span>Proximo vencimento</span>
            <strong><?php echo esc_html($next_expiration); ?></strong>
            <small><?php echo esc_html(number_format_i18n($history_total)); ?> movimentos no historico</small>
        </div>
    </div>

    <div class="wfwc-grid wfwc-grid-2">
        <div class="wfwc-subpanel">
            <div class="wfwc-subpanel-header">
                <div>
                    <span class="wfwc-kicker">Compras</span>
                    <h3>Ultimos lancamentos</h3>
                </div>
                <span class="wfwc-counter"><?php echo esc_html(number_format_i18n($purchase_count)); ?></span>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Compra</th>
                            <th>Usado</th>
                            <th>Gerado</th>
                            <th>Atendente</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($history['purchases'])) : ?>
                            <tr>
                                <td colspan="5" class="wfwc-empty-state">Sem compras registradas.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($history['purchases'] as $purchase) : ?>
                                <tr>
                                    <td><?php echo esc_html(wfwc_format_datetime($purchase['purchase_date'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($purchase['gross_amount'])); ?></td>
                                    <td><?php echo esc_html(wfwc_empty_if_zero($purchase['cashback_used'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($purchase['cashback_generated'])); ?></td>
                                    <td><?php echo esc_html($purchase['attendant_name'] ?: '-'); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="wfwc-subpanel">
            <div class="wfwc-subpanel-header">
                <div>
                    <span class="wfwc-kicker">Usos</span>
                    <h3>Consumo de cashback</h3>
                </div>
                <span class="wfwc-counter"><?php echo esc_html(number_format_i18n($usage_count)); ?></span>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Valor usado</th>
                            <th>Compra base</th>
                            <th>Atendente</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($history['usages'])) : ?>
                            <tr>
                                <td colspan="4" class="wfwc-empty-state">Nenhum uso de cashback registrado.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($history['usages'] as $usage) : ?>
                                <tr>
                                    <td><?php echo esc_html(wfwc_format_datetime($usage['used_at'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($usage['amount_used'])); ?></td>
                                    <td><?php echo esc_html(wfwc_format_currency($usage['purchase_amount'])); ?></td>
                                    <td><?php echo esc_html($usage['attendant_name'] ?: '-'); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="wfwc-subpanel">
        <div class="wfwc-subpanel-header">
            <div>
                <span class="wfwc-kicker">Validade</span>
                <h3>Creditos e prazo</h3>
            </div>
            <span class="wfwc-counter"><?php echo esc_html(number_format_i18n($credit_count)); ?></span>
        </div>
        <div class="table-responsive">
            <table class="widefat striped wfwc-data-table">
                <thead>
                    <tr>
                        <th>Origem</th>
                        <th>Original</th>
                        <th>Disponivel</th>
                        <th>Usado</th>
                        <th>Expirado</th>
                        <th>Vence em</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($history['credits'])) : ?>
                        <tr>
                            <td colspan="7" class="wfwc-empty-state">Sem creditos de cashback para este cliente.</td>
                        </tr>
                    <?php else : ?>
                        <?php foreach ($history['credits'] as $credit) : ?>
                            <tr class="wfwc-credit-row wfwc-credit-row-<?php echo esc_attr($credit['status']); ?>">
                                <td>Compra #<?php echo esc_html($credit['purchase_id']); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($credit['original_amount'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($credit['available_amount'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($credit['used_amount'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($credit['expired_amount'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_datetime($credit['expires_at'], false)); ?></td>
                                <td><span class="wfwc-badge wfwc-badge-<?php echo esc_attr($credit['status']); ?>"><?php echo esc_html($credit['status']); ?></span></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</section>
