# Automation Rules

## Estrategia
O plugin nao envia WhatsApp diretamente.
Ele dispara webhooks para o n8n, e o n8n fica responsavel por validar, transformar e encaminhar a mensagem para o provedor de WhatsApp escolhido pela operacao.

## Envelope padrao
Todo webhook sai neste formato:

```json
{
  "event": "purchase_registered",
  "source": "wimifarma-cashback",
  "sent_at": "2026-04-20 23:10:00",
  "message": "Mensagem pronta para WhatsApp",
  "reference": "purchase-123",
  "meta": {
    "attempt_number": 1,
    "max_attempts": 3,
    "is_retry": false,
    "url_setting_key": "purchase_webhook_url",
    "message_template_key": "message_purchase",
    "related_type": "purchase",
    "related_id": 123,
    "site_url": "https://wimifarma.com/",
    "plugin_version": "1.1.0"
  },
  "data": {}
}
```

## Eventos existentes

### 1. purchase_registered
Quando dispara:
- apos o registro bem-sucedido de uma compra

Objetivo:
- agradecer pela compra
- informar cashback gerado
- reforcar validade

### 2. cashback_expiration_alert
Quando dispara:
- na rotina diaria
- quando houver saldo com vencimento exatamente na janela configurada

Objetivo:
- lembrar o cliente sobre saldo perto do vencimento
- apoiar campanhas de retorno

### 3. client_birthday
Quando dispara:
- na rotina diaria
- quando a data de nascimento do cliente coincide com a data corrente

Objetivo:
- relacionamento
- reativacao
- campanha sazonal

## Retry automatico
- Falhas de rede e respostas HTTP nao 2xx geram log `failed`.
- Se o retry estiver ativo, o plugin agenda novo envio via `wfwc_retry_webhook_event`.
- Configuracoes atuais:
  - `webhook_retry_enabled`
  - `webhook_retry_attempts`
  - `webhook_retry_delay_minutes`
- Logs auxiliares:
  - `webhook_retry_scheduled`
  - `webhook_retry_exhausted`

## Chave anti-duplicidade
- Cada webhook tem uma `reference` fixa.
- O plugin nao reenfileira como sucesso se ja houver log `sent` para a mesma `reference`.
- O n8n deve usar a mesma `reference` para deduplicar, principalmente quando houver retry automatico.

## Agendamento
- Hook diario: `wfwc_daily_cron`
- Hook de retry: `wfwc_retry_webhook_event`

## Habilitadores por configuracao
- `enable_purchase_automation`
- `enable_birthday_automation`
- `enable_expiration_automation`

## URLs configuraveis
- `purchase_webhook_url`
- `birthday_webhook_url`
- `expiration_webhook_url`

## Autenticacao
- Campo opcional: `webhook_token`
- Header enviado quando preenchido:
  - `Authorization: Bearer TOKEN`

## Referencias adicionais
- `n8n-webhooks.md`
- `n8n-flow-examples.md`
- `webhook-payload-examples.json`
