# 21 - Miauby WhatsApp

## O que esta parte documenta

Este documento registra a primeira estrutura do canal WhatsApp do Miauby. A implementacao inicial cria um backend dedicado em Node.js/TypeScript, com Postgres 17 proprio, webhook para Evolution API, fila duravel, deduplicacao, allowlist, painel operacional e outbox. O repositorio nasce desligado por padrao; em producao, o canal pode ser ligado por `.env` quando token, cifragem e allowlist estiverem revisados.

## Componentes

- `apps/miauw-whatsapp`: servico Node.js 22 + TypeScript.
- `wimifarma-miauw-whatsapp`: container do bridge WhatsApp.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal.
- Apache publica `/miauw/whatsapp/` por proxy interno para `wimifarma-miauw-whatsapp:3400`.
- A home publica possui o card `Miauby Whatsapp`, apontando para `/miauw/whatsapp/`.
- Evolution API fica fora do Compose principal, com template em `ops/evolution/` e servico separado no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`.
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

- `GET /miauw/whatsapp/`: painel operacional seguro com canal, Evolution API, fila, outbox e eventos recentes, sem segredo ou telefone cru.
- `GET /miauw/whatsapp/health`: status seguro do servico.
- `GET /miauw/whatsapp/status`: status seguro do servico.
- `POST /miauw/whatsapp/webhook`: webhook da Evolution API.
- `POST /miauw/whatsapp/worker/run`: processamento manual protegido por token interno.

O webhook aceita token por `Authorization: Bearer`, `X-Miauw-Whatsapp-Token`, `X-Webhook-Token`, `X-Evolution-Webhook-Token` ou query `?token=...`, para compatibilidade com configuracoes diferentes da Evolution API.

## Regras iniciais

- O repositorio mantem o servico desligado por `MIAUW_WHATSAPP_ENABLED=false`; cada ambiente pode ligar por `.env`.
- Com o servico ligado, `MIAUW_WHATSAPP_WEBHOOK_TOKEN` e uma chave de cifragem precisam estar configurados.
- O painel `/miauw/whatsapp/` pode ficar publico porque mostra apenas status, contadores e telefones mascarados; nao adicionar segredos, payload bruto ou telefone completo nele.
- A primeira etapa usa allowlist por `MIAUW_WHATSAPP_ALLOWED_SENDERS`.
- Grupos ficam bloqueados por padrao.
- Prefixo `miauby` fica exigido por padrao.
- O canal responde no maximo uma vez por mensagem recebida.
- Rate limit por remetente fica ativo por minuto e por dia.
- O agente responde curto e sem tools/escritas diretas nesta primeira versao.
- Acoes fortes devem orientar confirmacao no sistema, nao executar por WhatsApp.

## Evolution API

A Evolution API nao deve ser colocada dentro de `apps/miauw-whatsapp`. Ela roda como transporte separado no VPS, com segredos e estado proprios. O template versionado fica em `ops/evolution/`; a pasta real do VPS fica em `/home/ubuntu/projetos/wimifarma-evolution-api`, com `.env`, instancias, Postgres e Redis fora do Git.

O manager operacional, quando necessario, deve ser acessado pelo manager embutido da API em `http://127.0.0.1:8080/manager` via acesso local/tunel. Nao manter container manager separado.

Para reduzir falhas de pareamento QR/codigo na Evolution/Baileys, a stack deve manter cache local, historico/contatos/chats/labels desligados e `CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198`. Esse ajuste evita sobrecarga e erros como `Invalid buffer` durante o login.

No `.env` do Wimifarma principal:

```text
EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080
EVOLUTION_API_INSTANCE=wimifarma-cashback-test
```

`EVOLUTION_API_KEY` deve receber o mesmo valor de `AUTHENTICATION_API_KEY` da stack Evolution.

Depois de conectar o numero por QR/codigo de pareamento, configurar o webhook da instancia para:

```text
https://wimifarma.com/miauw/whatsapp/webhook?token=<MIAUW_WHATSAPP_WEBHOOK_TOKEN>
```

Na Evolution API `v2.3.7` validada no VPS, `POST /webhook/set/{instance}` aceitou o corpo com a raiz `webhook`, nao o formato plano:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://wimifarma.com/miauw/whatsapp/webhook?token=<token>",
    "webhookByEvents": false,
    "webhookBase64": false,
    "events": ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"]
  }
}
```

`webhookByEvents` deve ficar `false`, para a Evolution nao anexar o nome do evento ao caminho do webhook.

O numero `+55 44 99739-4711` pode ser usado como teste se estiver sob controle da empresa, mas os remetentes autorizados ainda precisam entrar em `MIAUW_WHATSAPP_ALLOWED_SENDERS`.

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
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/
```

## Proximas etapas

1. Conectar o numero por QR/codigo de pareamento.
2. Configurar webhook da instancia.
3. Preencher `MIAUW_WHATSAPP_ALLOWED_SENDERS` com remetentes autorizados.
4. Testar com um remetente em allowlist e prefixo `miauby`.
5. Depois avaliar audio, midias e liberacao controlada sem prefixo.
