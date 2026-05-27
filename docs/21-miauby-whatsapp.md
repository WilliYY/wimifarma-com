# 21 - Miauby WhatsApp

## O que esta parte documenta

Este documento registra a primeira estrutura do canal WhatsApp do Miauby. A implementacao inicial cria um backend dedicado em Node.js/TypeScript, com Postgres 17 proprio, webhook para Evolution API ou Meta Cloud API, fila duravel, deduplicacao, allowlist, painel operacional e outbox. O repositorio nasce desligado por padrao; em producao, o canal pode ser ligado por `.env` quando token, cifragem e allowlist estiverem revisados.

## Componentes

- `apps/miauw-whatsapp`: servico Node.js 22 + TypeScript.
- `wimifarma-miauw-whatsapp`: container do bridge WhatsApp.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal.
- Apache publica `/miauw/whatsapp/` por proxy interno para `wimifarma-miauw-whatsapp:3400`.
- A home publica possui o card `Miauby Whatsapp`, apontando para `/miauw/whatsapp/`.
- Evolution API fica fora do Compose principal, com template em `ops/evolution/` e servico separado no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`; Meta Cloud API usa o mesmo bridge, sem stack local extra.
- `wimifarma-miauw-agent` continua sendo o motor de resposta do Miauby.

Fluxo:

```text
WhatsApp
  -> Evolution API ou Meta Cloud API
  -> POST /miauw/whatsapp/webhook
  -> Postgres dedicado: evento + fila
  -> roteador de IA do bridge
     -> Gemini para conversa simples, quando MIAUW_WHATSAPP_AI_MODE=hybrid e GEMINI_API_KEY existe
     -> wimifarma-miauw-agent /miauw/agent/run para comandos internos ou fallback
  -> outbox
  -> Evolution API /message/sendText/{instance} ou Meta /{phone_number_id}/messages
```

## Banco de dados

O canal usa Postgres dedicado porque o dominio precisa de fila robusta, deduplicacao, indices parciais, `JSONB` para metadados sanitizados e processamento seguro por `FOR UPDATE SKIP LOCKED`.

Tabelas criadas pelo servico:

- `miauw_whatsapp_contacts`: contatos autorizados/vistos, com telefone em hash e mascara.
- `miauw_whatsapp_events`: eventos recebidos, status da fila, dedupe por provider/instancia/message id, metadados sanitizados e identificadores cifrados.
- `miauw_whatsapp_outbox`: respostas geradas e tentativas de envio pelo transporte WhatsApp escolhido.

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
- `MIAUW_WHATSAPP_DASHBOARD_USER`
- `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`
- `MIAUW_WHATSAPP_DASHBOARD_SESSION_TTL_MINUTES=720`
- `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`
- `MIAUW_WHATSAPP_PREFIX=miauby`
- `MIAUW_WHATSAPP_GROUPS_ENABLED=false`
- `MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND=1`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=6`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=120`
- `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=700`
- `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=2200`
- `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=8`
- `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=2500`
- `MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS=60000`
- `MIAUW_WHATSAPP_AI_MODE=miauw`
- `MIAUW_WHATSAPP_GEMINI_MODEL=gemini-2.5-flash`
- `MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS=180`
- `MIAUW_WHATSAPP_GEMINI_TEMPERATURE_X100=35`
- `MIAUW_WHATSAPP_CONTEXT_PACK`
- `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS=90`
- `MIAUW_WHATSAPP_RECIPIENT_ALIASES`
- `MIAUW_WHATSAPP_AGENT_RUN_URL=http://wimifarma-miauw-agent:3100/miauw/agent/run`
- `MIAUW_WHATSAPP_PROVIDER=evolution`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_INSTANCE`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_GRAPH_API_VERSION=v23.0`

## Endpoints

- `GET /miauw/whatsapp/`: painel operacional seguro com canal, transporte, fila, outbox e eventos recentes, sem segredo ou telefone cru; quando `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` estao preenchidos, exige login por cookie assinado.
- `GET /miauw/whatsapp/login`: tela de login do painel, com o gato happy e favicon proprio do Miauby.
- `POST /miauw/whatsapp/login`: autentica o painel com usuario/senha do ambiente.
- `POST /miauw/whatsapp/logout`: encerra a sessao do painel.
- `GET /miauw/whatsapp/health`: status seguro do servico.
- `GET /miauw/whatsapp/status`: status seguro do servico, protegido pelo login do painel quando ele esta configurado.
- `GET /miauw/whatsapp/webhook`: verificacao `hub.challenge` da Meta Cloud API.
- `POST /miauw/whatsapp/webhook`: webhook da Evolution API ou Meta Cloud API.
- `POST /miauw/whatsapp/worker/run`: processamento manual protegido por token interno.

O webhook aceita token por `Authorization: Bearer`, `X-Miauw-Whatsapp-Token`, `X-Webhook-Token`, `X-Evolution-Webhook-Token` ou query `?token=...`, para compatibilidade com configuracoes diferentes da Evolution API. No modo Meta, `GET` usa `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `POST` deve usar `X-Hub-Signature-256` com `META_WHATSAPP_APP_SECRET`.

## Regras iniciais

- O repositorio mantem o servico desligado por `MIAUW_WHATSAPP_ENABLED=false`; cada ambiente pode ligar por `.env`.
- Com o servico ligado, `MIAUW_WHATSAPP_WEBHOOK_TOKEN` e uma chave de cifragem precisam estar configurados.
- O painel `/miauw/whatsapp/` deve ficar protegido por `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` nos ambientes operacionais. Health continua publico e sem segredo para smoke test.
- Mesmo protegido por login, o painel nao deve exibir segredos, payload bruto ou telefone completo.
- A primeira etapa usa allowlist por `MIAUW_WHATSAPP_ALLOWED_SENDERS`.
- Grupos ficam bloqueados por padrao.
- Prefixo `miauby` fica exigido por padrao no repositorio. Em ambiente operacional com allowlist revisada, ele pode ser desligado por `MIAUW_WHATSAPP_REQUIRE_PREFIX=false`; nesse modo, perguntas soltas de remetente autorizado entram no roteador, e `miauby ...` continua aceito como prefixo opcional.
- O canal responde no maximo uma vez por mensagem recebida.
- Rate limit por remetente fica ativo por minuto e por dia.
- Rate limit global de envio fica ativo por minuto, com intervalo minimo entre envios.
- Se o transporte responder erro temporario, timeout, `429` ou `5xx`, o bridge pausa novos envios por `MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS` antes de tentar de novo.
- O roteador responde localmente a mensagens simples como `oi`, `teste`, `status` e `ajuda`, sem chamar IA externa.
- Consultas internas podem usar o core Miauby com tools somente de leitura.
- Acoes fortes e dados sensiveis sao bloqueados localmente e devem orientar uso do sistema, nao executar por WhatsApp.

## Modo hibrido de IA

`MIAUW_WHATSAPP_AI_MODE` controla o motor de resposta:

- `miauw`: todas as respostas passam pelo `wimifarma-miauw-agent`, usando o core interno e a OpenAI configurada no Miauby.
- `gemini`: conversa curta passa pelo Gemini; mensagens que parecem comando interno continuam protegidas e podem ser roteadas ao core Miauby quando ele estiver configurado.
- `hybrid`: mensagens simples passam pelo Gemini quando `GEMINI_API_KEY` estiver preenchida; mensagens que parecem consulta interna, como `financeiro`, `pedidos`, `gestao`, `cotacao`, `tarefa`, `cashback`, `resumo`, `boleto` ou `pagamento`, vao para o `wimifarma-miauw-agent` com rota de leitura. Pedidos de escrita, como pagar, excluir, registrar, lancar, confirmar chegada ou editar, sao bloqueados no bridge.

O usuario pode forcar a rota em teste com `miauby gemini ...` ou `miauby interno ...`. Mesmo rota forcada passa pelo bloqueio de dado sensivel/escrita forte. Se o Gemini falhar no modo hibrido, o bridge cai para o core Miauby. O contexto enviado ao Gemini deve ser curto e sanitizado; nao enviar telefone completo, payload bruto, token, dados de cliente ou financeiro real. Respostas simples do Gemini podem ficar em cache curto por `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS`, sem payload bruto e sem dados operacionais.

O painel `/miauw/whatsapp/` mostra motor usado (`local`, `blocked`, `gemini`, `gemini_cache` ou `miauw`), motivo da rota e latencia de geracao antes do envio. Essa telemetria fica na `miauw_whatsapp_outbox` e usa apenas mascaras/hash.

Quando a Evolution/Baileys entregar remetente como LID/identificador longo em vez do telefone E.164, usar `MIAUW_WHATSAPP_RECIPIENT_ALIASES` no `.env` para mapear identificador recebido para telefone real autorizado, no formato `origem=destino`, separado por virgula quando houver mais de um. Essa configuracao fica fora do Git.

## Anti-flood e risco de bloqueio

Nao existe garantia tecnica de banimento zero, principalmente quando o transporte usa sessao WhatsApp Web/Baileys pela Evolution API. A postura operacional do Wimifarma deve ser conservadora:

- usar apenas remetentes em allowlist e com consentimento operacional claro;
- manter prefixo `miauby` exigido enquanto o canal estiver em estabilizacao; se desligar prefixo, limitar a allowlist, manter grupos bloqueados e monitorar o painel;
- bloquear grupos por padrao;
- responder somente a mensagens iniciadas pelo usuario autorizado;
- manter uma resposta por mensagem recebida;
- usar respostas curtas, sem campanhas, disparos em massa ou mensagens repetidas;
- respeitar pedidos para parar contato;
- preferir Meta Cloud API oficial quando o objetivo deixar de ser uso interno controlado e virar atendimento amplo.

Para o VPS em producao inicial, recomenda-se comecar ainda mais restrito que o default do repositorio: `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=60`, `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=2500`, `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=5500` e `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=7000`. Esses limites podem subir depois de alguns dias sem erro, bloqueio, report ou queda de qualidade.

## Evolution API

A Evolution API nao deve ser colocada dentro de `apps/miauw-whatsapp`. Ela roda como transporte separado no VPS, com segredos e estado proprios. O template versionado fica em `ops/evolution/`; a pasta real do VPS fica em `/home/ubuntu/projetos/wimifarma-evolution-api`, com `.env`, instancias, Postgres e Redis fora do Git.

Em 2026-05-26, o template foi fixado em `evoapicloud/evolution-api:v2.3.0` para uma nova tentativa de pareamento. A `v2.3.7` retornou `401 Unauthorized` e `Invalid buffer`; a `v2.3.6` tambem falhou com `Invalid buffer` porque ignorou `CONFIG_SESSION_PHONE_VERSION`. A `v2.3.0` ainda usa o pin `CONFIG_SESSION_PHONE_VERSION` ao iniciar o Baileys.

Em 2026-05-27, a instancia `wimifarma-business-no9-20260526190040` foi validada no VPS como `open`/conectada, com webhook apontando para `https://wimifarma.com/miauw/whatsapp/webhook?token=<MIAUW_WHATSAPP_WEBHOOK_TOKEN>` e eventos `QRCODE_UPDATED`, `CONNECTION_UPDATE` e `MESSAGES_UPSERT`.

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

Na Evolution API `v2.3.x` validada no VPS, `POST /webhook/set/{instance}` aceitou o corpo com a raiz `webhook`, nao o formato plano:

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

## Meta Cloud API

O mesmo bridge tambem aceita transporte oficial da Meta:

```text
MIAUW_WHATSAPP_PROVIDER=meta
META_WHATSAPP_ACCESS_TOKEN=<token permanente ou temporario da Meta>
META_WHATSAPP_PHONE_NUMBER_ID=<Phone Number ID>
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=<token escolhido para verificacao>
META_WHATSAPP_APP_SECRET=<App Secret para validar X-Hub-Signature-256>
META_WHATSAPP_GRAPH_API_VERSION=v23.0
```

Callback URL na Meta:

```text
https://wimifarma.com/miauw/whatsapp/webhook
```

O `GET /miauw/whatsapp/webhook` responde o desafio `hub.challenge` quando o `hub.verify_token` confere com `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`. O `POST /miauw/whatsapp/webhook` processa payload `whatsapp_business_account`, extrai `messages[]`, aplica allowlist/prefixo/rate limit e envia resposta por `/{META_WHATSAPP_PHONE_NUMBER_ID}/messages`.

Cuidados da Meta:

- o token de acesso e segredo e deve ficar apenas no `.env`;
- `META_WHATSAPP_APP_SECRET` deve ser preenchido para validar `X-Hub-Signature-256`;
- mensagens livres so sao apropriadas dentro da janela de atendimento iniciada pelo usuario; fora dela, a Meta exige templates aprovados;
- o numero precisa estar cadastrado no WhatsApp Business Platform/Cloud API. Numero ja usado no WhatsApp comum ou Business App pode precisar ser removido/migrado antes de funcionar como numero de API.

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

Quando o login do painel estiver ativo, `/miauw/whatsapp/` deve retornar a tela de login sem cookie e deve abrir o painel apos `POST /miauw/whatsapp/login` com credenciais do ambiente. `/miauw/whatsapp/health` deve continuar respondendo JSON publico.

## Proximas etapas

1. Conectar o numero por QR/codigo de pareamento.
2. Configurar webhook da instancia.
3. Preencher `MIAUW_WHATSAPP_ALLOWED_SENDERS` com remetentes autorizados.
4. Testar com um remetente em allowlist e prefixo `miauby`.
5. Depois avaliar audio, midias e liberacao controlada sem prefixo.
