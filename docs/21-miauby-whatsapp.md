# 21 - Miauby WhatsApp

## O que esta parte documenta

Este documento registra a primeira estrutura do canal WhatsApp do Miauby. A implementacao inicial cria um backend dedicado em Node.js/TypeScript, com Postgres 17 proprio, webhook para Evolution API, fila duravel, deduplicacao, allowlist e outbox. O canal nasce desligado por padrao e so responde quando as variaveis de ambiente forem configuradas.

## Componentes

- `apps/miauw-whatsapp`: servico Node.js 22 + TypeScript.
- `wimifarma-miauw-whatsapp`: container do bridge WhatsApp.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal.
- Apache publica `/miauw/whatsapp/` por proxy interno para `wimifarma-miauw-whatsapp:3400`.
- Evolution API fica fora deste repositorio, como servico separado no VPS.
- `wimifarma-miauw-agent` continua sendo o motor de resposta do Miauby.

Fluxo:

```text
WhatsApp
  -> Evolution API
  -> POST /miauw/whatsapp/webhook
  -> Postgres dedicado: evento + fila
  -> wimifarma-miauw-agent /miauw/agent/run
  -> outbox
  -> Evolution API /message/sendText/{instance}
```

## Banco de dados

O canal usa Postgres dedicado porque o dominio precisa de fila robusta, deduplicacao, indices parciais, `JSONB` para metadados sanitizados e processamento seguro por `FOR UPDATE SKIP LOCKED`.

Tabelas criadas pelo servico:

- `miauw_whatsapp_contacts`: contatos autorizados/vistos, com telefone em hash e mascara.
- `miauw_whatsapp_events`: eventos recebidos, status da fila, dedupe por provider/instancia/message id, metadados sanitizados e identificadores cifrados.
- `miauw_whatsapp_outbox`: respostas geradas e tentativas de envio pela Evolution API.

O banco nao deve guardar payload bruto externo nem telefone cru. O servico guarda hash/mascara para auditoria e cifra os identificadores necessarios para responder.

## Variaveis

Principais variaveis:

- `MIAUW_WHATSAPP_ENABLED=false`
- `MIAUW_WHATSAPP_POSTGRES_PASSWORD`
- `MIAUW_WHATSAPP_WEBHOOK_TOKEN`
- `MIAUW_WHATSAPP_INTERNAL_TOKEN`
- `MIAUW_WHATSAPP_ENCRYPTION_KEY`
- `MIAUW_WHATSAPP_HASH_SALT`
- `MIAUW_WHATSAPP_ALLOWED_SENDERS`
- `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`
- `MIAUW_WHATSAPP_PREFIX=miauby`
- `MIAUW_WHATSAPP_GROUPS_ENABLED=false`
- `MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND=1`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=6`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=120`
- `MIAUW_WHATSAPP_AGENT_RUN_URL=http://wimifarma-miauw-agent:3100/miauw/agent/run`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_INSTANCE`

## Endpoints

- `GET /miauw/whatsapp/health`: status seguro do servico.
- `GET /miauw/whatsapp/status`: status seguro do servico.
- `POST /miauw/whatsapp/webhook`: webhook da Evolution API.
- `POST /miauw/whatsapp/worker/run`: processamento manual protegido por token interno.

O webhook aceita token por `Authorization: Bearer`, `X-Miauw-Whatsapp-Token`, `X-Webhook-Token`, `X-Evolution-Webhook-Token` ou query `?token=...`, para compatibilidade com configuracoes diferentes da Evolution API.

## Regras iniciais

- O servico nasce desligado por `MIAUW_WHATSAPP_ENABLED=false`.
- Com o servico ligado, `MIAUW_WHATSAPP_WEBHOOK_TOKEN` e uma chave de cifragem precisam estar configurados.
- A primeira etapa usa allowlist por `MIAUW_WHATSAPP_ALLOWED_SENDERS`.
- Grupos ficam bloqueados por padrao.
- Prefixo `miauby` fica exigido por padrao.
- O canal responde no maximo uma vez por mensagem recebida.
- Rate limit por remetente fica ativo por minuto e por dia.
- O agente responde curto e sem tools/escritas diretas nesta primeira versao.
- Acoes fortes devem orientar confirmacao no sistema, nao executar por WhatsApp.

## Evolution API

A Evolution API nao deve ser colocada dentro de `apps/miauw-whatsapp`. Ela roda como transporte separado no VPS, com segredos e estado proprios. Depois de conectar o numero por QR, configurar o webhook para:

```text
https://wimifarma.com/miauw/whatsapp/webhook?token=<MIAUW_WHATSAPP_WEBHOOK_TOKEN>
```

O numero `+55 44 9739-4711` pode ser usado como teste se estiver sob controle da empresa, mas os remetentes autorizados ainda precisam entrar em `MIAUW_WHATSAPP_ALLOWED_SENDERS`.

## Testes

Valide localmente o app:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\miauw-whatsapp
npm.cmd run check
npm.cmd run build
```

Com Docker ativo:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-miauw-whatsapp-db wimifarma-miauw-whatsapp wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/health
```

## Proximas etapas

1. Configurar segredos reais no `.env` do VPS.
2. Subir a Evolution API em servico separado.
3. Conectar o numero por QR.
4. Configurar webhook da instancia.
5. Testar com um remetente em allowlist e prefixo `miauby`.
6. Depois avaliar audio, midias e liberacao controlada sem prefixo.
