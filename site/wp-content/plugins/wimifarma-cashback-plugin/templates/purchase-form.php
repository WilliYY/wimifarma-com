<?php
$selected_summary = is_array($selected_summary) ? $selected_summary : array();
$available        = (float) ($selected_summary['total_available'] ?? 0);
?>
<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wfwc-form" data-wfwc-purchase-form data-available="<?php echo esc_attr($available); ?>">
    <input type="hidden" name="action" value="wfwc_save_purchase">
    <?php wfwc_render_portal_form_fields('purchases'); ?>
    <?php wp_nonce_field('wfwc_save_purchase'); ?>

    <div class="wfwc-field-stack">
        <label>
            <span>Cliente</span>
            <select name="client_id" required>
                <option value="">Selecione um cliente</option>
                <?php foreach ($clients as $client_item) : ?>
                    <option value="<?php echo esc_attr($client_item['id']); ?>" <?php selected((int) $selected_client_id, (int) $client_item['id']); ?>>
                        <?php echo esc_html('#' . $client_item['id'] . ' - ' . $client_item['full_name'] . ' - ' . wfwc_format_phone($client_item['phone'])); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>

        <div class="wfwc-field-grid">
            <label>
                <span>Valor da compra</span>
                <input type="text" name="gross_amount" value="" placeholder="0,00" required data-wfwc-purchase-amount>
            </label>
            <label>
                <span>% cashback</span>
                <input type="text" value="<?php echo esc_attr(number_format((float) wfwc_get_setting('cashback_percent', 5), 2, ',', '.')); ?>%" readonly>
            </label>
            <label>
                <span>Data da compra</span>
                <input type="datetime-local" name="purchase_date" value="<?php echo esc_attr(wp_date('Y-m-d\TH:i')); ?>">
            </label>
        </div>

        <div class="wfwc-field-grid">
            <label>
                <span>Atendente</span>
                <select name="attendant_id">
                    <option value="0">Selecione</option>
                    <?php foreach ($attendants as $attendant) : ?>
                        <option value="<?php echo esc_attr($attendant['id']); ?>"><?php echo esc_html($attendant['full_name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                <span>Cashback a usar</span>
                <input type="text" name="cashback_to_use" value="" placeholder="0,00" data-wfwc-desired-cashback>
                <small>Saldo disponivel atual: <?php echo esc_html(wfwc_format_currency($available)); ?></small>
            </label>
        </div>

        <div class="wfwc-note-box">
            <strong>Validacao automatica</strong>
            <p>Com a regra atual, o sistema so permite usar cashback se a compra for de no minimo <strong><?php echo esc_html(absint(wfwc_get_setting('cashback_redeem_multiplier', 4))); ?>x</strong> o valor informado.</p>
            <p>Cashback estimado nesta compra: <strong data-wfwc-generated-preview>R$ 0,00</strong></p>
            <p>Maximo permitido nesta compra: <strong data-wfwc-max-redeem>R$ 0,00</strong></p>
            <div class="wfwc-simulator-message" data-wfwc-simulator-message></div>
        </div>

        <label>
            <span>Observacao opcional</span>
            <textarea name="notes" rows="4"></textarea>
        </label>
    </div>

    <div class="wfwc-form-actions">
        <button type="submit" class="button button-primary">Registrar compra</button>
    </div>
</form>
