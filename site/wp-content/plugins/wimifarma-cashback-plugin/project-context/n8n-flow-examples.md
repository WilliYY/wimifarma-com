# n8n Flow Examples

## Objetivo
Estes exemplos mostram como receber os webhooks do plugin, tratar deduplicacao e encaminhar a mensagem para um gateway de WhatsApp.

## Fluxo 1: Compra

### Sequencia sugerida
1. `Webhook`
   - Method: `POST`
   - Path: `wimifarma-purchase`

2. `IF` ou `Code`
   - Valida header `Authorization`
   - Opcionalmente rejeita requests sem token

3. `Data Store` ou `Code`
   - Checa se `reference` ja foi processada
   - Se sim, retorna 200 com `duplicate: true`

4. `Set`
   - Campos uteis:
     - `phone = {{$json.data.client_phone_digits}}`
     - `message = {{$json.message}}`
     - `reference = {{$json.reference}}`

5. `HTTP Request`
   - Envia a mensagem para o provedor de WhatsApp
   - Endpoint depende do gateway usado pela operacao

6. `Respond to Webhook`
   - Status: `200`
   - Body:

```json
{
  "status": "ok",
  "reference": "={{$json.reference}}"
}
```

## Fluxo 2: Expiracao

### Sequencia sugerida
1. `Webhook` path `wimifarma-expiration`
2. `IF` para validar token
3. `Data Store` para deduplicar por `reference`
4. `Set` para criar a mensagem
5. `HTTP Request` para gateway de WhatsApp
6. `Respond to Webhook` com 200

Mensagem personalizada no n8n:
```text
Ola {{$json.data.client_name}}, seu cashback de {{$json.data.expiring_amount_formatted}} expira em {{$json.data.expires_at_formatted}}.
```

## Fluxo 3: Aniversario

### Sequencia sugerida
1. `Webhook` path `wimifarma-birthday`
2. `IF` para validar token
3. `Data Store` para deduplicar por `reference`
4. `Set` para montar mensagem
5. `HTTP Request` para gateway
6. `Respond to Webhook` com 200

Mensagem personalizada no n8n:
```text
Feliz aniversario, {{$json.data.client_name}}. Conte com a Wimifarma.
```

## Deduplicacao no n8n

O ideal e salvar a `reference` em um `Data Store`, `Redis`, banco proprio ou planilha de controle.

Exemplo de regra:
- Se `reference` ja existir como `sent`, nao enviar novamente.
- Responder 200 para o WordPress mesmo assim.
- Motivo: o plugin pode fazer retry em falhas de rede e o n8n precisa ser idempotente.

## Exemplo generico de envio ao WhatsApp via HTTP Request

Este e um exemplo conceitual. Ajuste o endpoint e o body ao seu provedor real.

Metodo:
```text
POST
```

Body JSON:
```json
{
  "to": "={{$json.data.client_phone_digits}}",
  "type": "text",
  "text": {
    "body": "={{$json.message}}"
  }
}
```

Headers comuns:
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer SEU_TOKEN_DO_GATEWAY"
}
```

## Quando retornar erro para o plugin

Retorne erro quando:
- o gateway de WhatsApp falhar
- o token do gateway estiver invalido
- o n8n nao conseguir processar o evento

Se o n8n responder 4xx/5xx:
- o plugin vai registrar `failed`
- se configurado, vai agendar retry automatico

## Quando retornar sucesso para o plugin

Retorne 200 quando:
- a mensagem for enviada com sucesso
- ou quando a `reference` ja tiver sido processada e voce quiser apenas marcar como duplicado de forma segura
