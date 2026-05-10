<?php
$allow_public = (bool) wfwc_get_setting('allow_public_lookup', 0);
?>
<div class="wfwc-public-shell">
    <div class="wfwc-public-box">
        <h2>Consulta de cashback Wimifarma</h2>
        <p><?php echo $allow_public ? 'Informe o nome, telefone ou ID interno para consultar o saldo.' : 'Consulta interna para equipe autorizada.'; ?></p>

        <form method="post" class="wfwc-public-form">
            <?php wp_nonce_field('wfwc_public_lookup', 'wfwc_lookup_nonce'); ?>
            <label>
                <span>Identificador</span>
                <input type="text" name="lookup_identifier" placeholder="Nome, telefone ou ID" required>
            </label>
            <button type="submit" class="wfwc-btn">Consultar cashback</button>
        </form>

        <?php if (!empty($error)) : ?>
            <div class="wfwc-public-alert is-error"><?php echo esc_html($error); ?></div>
        <?php endif; ?>
    </div>

    <?php if (!empty($client)) : ?>
        <div class="wfwc-public-box">
            <h3><?php echo esc_html($client['full_name']); ?></h3>
            <div class="wfwc-public-metrics">
                <div>
                    <span>Saldo disponível</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['total_available'] ?? 0)); ?></strong>
                </div>
                <div>
                    <span>Saldo gerado</span>
                    <strong><?php echo esc_html(wfwc_format_currency($summary['total_generated'] ?? 0)); ?></strong>
                </div>
                <div>
                    <span>Próximo vencimento</span>
                    <strong><?php echo esc_html(wfwc_format_datetime($summary['next_expiration'] ?? '', false)); ?></strong>
                </div>
            </div>

            <h4>Últimas compras</h4>
            <table class="wfwc-public-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Compra</th>
                        <th>Cashback gerado</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($history['purchases'])) : ?>
                        <tr>
                            <td colspan="3">Nenhuma compra encontrada.</td>
                        </tr>
                    <?php else : ?>
                        <?php foreach (array_slice($history['purchases'], 0, 10) as $purchase) : ?>
                            <tr>
                                <td><?php echo esc_html(wfwc_format_datetime($purchase['purchase_date'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($purchase['gross_amount'])); ?></td>
                                <td><?php echo esc_html(wfwc_format_currency($purchase['cashback_generated'])); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</div>
