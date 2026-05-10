# Editable Settings Map

## Onde alterar percentual de cashback
- Tela: `Wimifarma Cashback > Configurações`
- Campo: `Percentual de cashback (%)`
- Opção salva: `wfwc_settings[cashback_percent]`

## Onde alterar validade
- Tela: `Wimifarma Cashback > Configurações`
- Campo: `Validade padrão (dias)`
- Opção salva: `wfwc_settings[cashback_expiration_days]`

## Onde alterar regra mínima de uso
- Tela: `Wimifarma Cashback > Configurações`
- Campo: `Multiplicador mínimo para uso`
- Opção salva: `wfwc_settings[cashback_redeem_multiplier]`

## Onde alterar dias de alerta
- Tela: `Wimifarma Cashback > Configurações`
- Campo: `Dias para alerta de expiração`
- Opção salva: `wfwc_settings[expiration_alert_days]`

## Onde alterar webhooks
- Tela: `Wimifarma Cashback > Configurações`
- Campos:
  - `purchase_webhook_url`
  - `birthday_webhook_url`
  - `expiration_webhook_url`
  - `webhook_token`
  - `webhook_retry_enabled`
  - `webhook_retry_attempts`
  - `webhook_retry_delay_minutes`

## Onde ativar ou desativar automações
- Tela: `Wimifarma Cashback > Configurações`
- Campos:
  - `enable_purchase_automation`
  - `enable_birthday_automation`
  - `enable_expiration_automation`

## Onde alterar mensagens base
- Tela: `Wimifarma Cashback > Configurações`
- Campos:
  - `message_purchase`
  - `message_birthday`
  - `message_expiration`

## Onde liberar consulta pública
- Tela: `Wimifarma Cashback > Configurações`
- Campo: `allow_public_lookup`

## Onde no código
- defaults: `includes/helpers.php`
- persistência: `update_option(WFWC_OPTION_SETTINGS, ...)`
- leitura: `wfwc_get_setting()` e `wfwc_get_settings()`
