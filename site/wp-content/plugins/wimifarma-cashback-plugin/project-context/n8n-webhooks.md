# n8n Webhooks

## Visao geral
O plugin envia webhooks HTTP POST para URLs configuradas no painel WordPress.
Cada evento pode apontar para uma URL diferente do n8n.

Campos de configuracao no plugin:
- `purchase_webhook_url`
- `birthday_webhook_url`
- `expiration_webhook_url`
- `webhook_token`
- `webhook_retry_enabled`
- `webhook_retry_attempts`
- `webhook_retry_delay_minutes`

## Headers enviados

Obrigatorio:
```http
Content-Type: application/json
```

Opcional:
```http
Authorization: Bearer SEU_TOKEN
```

## Webhook de compra

Evento:
```text
purchase_registered
```

Reference:
```text
purchase-{purchase_id}
```

Uso recomendado no n8n:
- confirmar autenticacao
- verificar deduplicacao por `reference`
- montar mensagem
- enviar ao gateway de WhatsApp
- responder HTTP 200 para o WordPress

## Webhook de expiracao

Evento:
```text
cashback_expiration_alert
```

Reference:
```text
expiration-{client_id}-{days_to_expire}-{expires_at_sanitizado}
```

Uso recomendado no n8n:
- deduplicar por `reference`
- validar que existe telefone
- enviar lembrete

## Webhook de aniversario

Evento:
```text
client_birthday
```

Reference:
```text
birthday-{client_id}-{YYYYMMDD}
```

Uso recomendado no n8n:
- deduplicar por `reference`
- montar mensagem de aniversario
- enviar ao WhatsApp

## Estrutura do JSON recebido

```json
{
  "event": "purchase_registered",
  "source": "wimifarma-cashback",
  "sent_at": "2026-04-20 23:10:00",
  "message": "Obrigado pela compra, Ana. Voce recebeu R$ 5,00 de cashback e ele expira em 04/06/2026.",
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

## Significado dos campos

### event
Nome do evento de negocio.

### source
Identificador do sistema emissor.

### sent_at
Data/hora em que o WordPress tentou enviar o webhook.

### message
Mensagem pronta para WhatsApp, gerada pelo template configurado.

### reference
Chave unica do evento. Deve ser usada pelo n8n para deduplicacao.

### meta.attempt_number
Tentativa atual de envio.

### meta.max_attempts
Quantidade maxima de tentativas configuradas no plugin.

### meta.is_retry
`true` quando o webhook esta sendo reenviado apos falha.

### data
Dados especificos do evento.

## Resposta esperada pelo plugin

Ideal:
```http
HTTP/1.1 200 OK
Content-Type: application/json
```

Exemplo de body:
```json
{
  "status": "ok",
  "reference": "purchase-123",
  "provider_message_id": "abc123"
}
```

Qualquer resposta nao 2xx:
- entra como `failed` no plugin
- pode agendar retry automatico

## Como o n8n deve receber
1. Crie um node `Webhook` no n8n.
2. Configure metodo `POST`.
3. Copie a Production URL.
4. Cole a URL no campo correspondente dentro do plugin.
5. Se usar token, valide o header `Authorization` no proprio fluxo.

## Como o n8n deve enviar para WhatsApp
1. Receba o payload do plugin.
2. Use `message` ou monte outro texto com base em `data`.
3. Normalize `data.client_phone_digits`.
4. Chame o provedor via node `HTTP Request`.
5. Se o provedor responder com sucesso, devolva HTTP 200 para o WordPress.
6. Se falhar, devolva erro ou 5xx para permitir retry do plugin.
