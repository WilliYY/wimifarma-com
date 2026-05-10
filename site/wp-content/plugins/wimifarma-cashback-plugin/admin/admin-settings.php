<?php
if (!defined('ABSPATH')) {
    exit;
}

$settings = wfwc_get_settings();
?>
<div class="wrap wfwc-wrap">
    <div class="wfwc-page-header">
        <div>
            <h1>Configuracoes</h1>
            <p>Defina as regras centrais do programa, os webhooks do n8n, retry automatico e os textos padrao das automacoes.</p>
        </div>
    </div>

    <section class="wfwc-panel">
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wfwc-form">
            <input type="hidden" name="action" value="wfwc_save_settings">
            <?php wfwc_render_portal_form_fields('settings'); ?>
            <?php wp_nonce_field('wfwc_save_settings'); ?>

            <div class="wfwc-settings-grid">
                <div class="wfwc-subpanel">
                    <h2>Regras de negocio</h2>
                    <div class="wfwc-field-grid">
                        <label>
                            <span>Percentual de cashback (%)</span>
                            <input type="text" name="cashback_percent" value="<?php echo esc_attr($settings['cashback_percent']); ?>">
                        </label>
                        <label>
                            <span>Validade padrao (dias)</span>
                            <input type="number" name="cashback_expiration_days" value="<?php echo esc_attr($settings['cashback_expiration_days']); ?>" min="1">
                        </label>
                        <label>
                            <span>Multiplicador minimo para uso</span>
                            <input type="number" name="cashback_redeem_multiplier" value="<?php echo esc_attr($settings['cashback_redeem_multiplier']); ?>" min="1">
                        </label>
                        <label>
                            <span>Dias para alerta de expiracao</span>
                            <input type="text" name="expiration_alert_days" value="<?php echo esc_attr($settings['expiration_alert_days']); ?>" placeholder="10,5">
                        </label>
                    </div>
                </div>

                <div class="wfwc-subpanel">
                    <h2>Webhooks n8n</h2>
                    <div class="wfwc-field-stack">
                        <label>
                            <span>URL webhook compra</span>
                            <input type="url" name="purchase_webhook_url" value="<?php echo esc_attr($settings['purchase_webhook_url']); ?>" placeholder="https://seu-n8n/webhook/compra">
                        </label>
                        <label>
                            <span>URL webhook aniversario</span>
                            <input type="url" name="birthday_webhook_url" value="<?php echo esc_attr($settings['birthday_webhook_url']); ?>" placeholder="https://seu-n8n/webhook/aniversario">
                        </label>
                        <label>
                            <span>URL webhook expiracao</span>
                            <input type="url" name="expiration_webhook_url" value="<?php echo esc_attr($settings['expiration_webhook_url']); ?>" placeholder="https://seu-n8n/webhook/expiracao">
                        </label>
                        <label>
                            <span>Token / chave</span>
                            <input type="text" name="webhook_token" value="<?php echo esc_attr($settings['webhook_token']); ?>" placeholder="Bearer token ou chave do fluxo">
                        </label>
                        <div class="wfwc-field-grid">
                            <label>
                                <span>Tentativas maximas de retry</span>
                                <input type="number" name="webhook_retry_attempts" value="<?php echo esc_attr($settings['webhook_retry_attempts']); ?>" min="1">
                            </label>
                            <label>
                                <span>Intervalo entre retries (minutos)</span>
                                <input type="number" name="webhook_retry_delay_minutes" value="<?php echo esc_attr($settings['webhook_retry_delay_minutes']); ?>" min="1">
                            </label>
                        </div>
                    </div>
                </div>

                <div class="wfwc-subpanel">
                    <h2>Mensagens base</h2>
                    <div class="wfwc-field-stack">
                        <label>
                            <span>Mensagem apos compra</span>
                            <textarea name="message_purchase" rows="4"><?php echo esc_textarea($settings['message_purchase']); ?></textarea>
                        </label>
                        <label>
                            <span>Mensagem de aniversario</span>
                            <textarea name="message_birthday" rows="4"><?php echo esc_textarea($settings['message_birthday']); ?></textarea>
                        </label>
                        <label>
                            <span>Mensagem de expiracao</span>
                            <textarea name="message_expiration" rows="4"><?php echo esc_textarea($settings['message_expiration']); ?></textarea>
                        </label>
                        <p class="description">Tokens uteis: <code>{client_name}</code>, <code>{client_phone}</code>, <code>{purchase_amount_formatted}</code>, <code>{cashback_generated_formatted}</code>, <code>{expiring_amount_formatted}</code>, <code>{expires_at_formatted}</code>, <code>{attendant_name}</code>.</p>
                    </div>
                </div>

                <div class="wfwc-subpanel">
                    <h2>Controles gerais</h2>
                    <div class="wfwc-checkbox-stack">
                        <label><input type="checkbox" name="enable_purchase_automation" value="1" <?php checked((int) $settings['enable_purchase_automation'], 1); ?>> Ativar automacao apos compra</label>
                        <label><input type="checkbox" name="enable_birthday_automation" value="1" <?php checked((int) $settings['enable_birthday_automation'], 1); ?>> Ativar automacao de aniversario</label>
                        <label><input type="checkbox" name="enable_expiration_automation" value="1" <?php checked((int) $settings['enable_expiration_automation'], 1); ?>> Ativar alertas de expiracao</label>
                        <label><input type="checkbox" name="webhook_retry_enabled" value="1" <?php checked((int) $settings['webhook_retry_enabled'], 1); ?>> Ativar retry automatico de webhook</label>
                        <label><input type="checkbox" name="allow_public_lookup" value="1" <?php checked((int) $settings['allow_public_lookup'], 1); ?>> Permitir consulta publica pelo shortcode</label>
                    </div>
                    <div class="wfwc-note-box">
                        <strong>REST API pronta para integracao</strong>
                        <p><code><?php echo esc_html(rest_url('wimifarma-cashback/v1/clients/search')); ?></code></p>
                        <p><code><?php echo esc_html(rest_url('wimifarma-cashback/v1/clients/{id}/summary')); ?></code></p>
                        <p>Os webhooks enviados ao n8n incluem <code>meta.attempt_number</code>, <code>meta.max_attempts</code> e <code>reference</code> para rastreamento e deduplicacao.</p>
                    </div>
                </div>
            </div>

            <div class="wfwc-form-actions">
                <button type="submit" class="button button-primary button-large">Salvar configuracoes</button>
            </div>
        </form>
    </section>
</div>
