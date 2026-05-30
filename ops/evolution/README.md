# Evolution API - Wimifarma

Template operacional para subir a Evolution API como transporte externo do Miauby WhatsApp.

Imagem atual do template: `evoapicloud/evolution-api:v2.3.0`. Em 2026-05-26, o VPS foi baixado de `v2.3.7` para `v2.3.6`, mas a imagem ainda ignorou `CONFIG_SESSION_PHONE_VERSION` e manteve erro `Invalid buffer`. A tentativa seguinte usou `v2.3.0`, que ainda respeita o pin de versao do WhatsApp Web.

Regras:

- nao versionar `.env`;
- nao publicar a API diretamente no Nginx Proxy Manager sem decisao explicita;
- manter `wimifarma-evolution-api` ligado na rede `wimifarma-com-network` para o bridge chamar `http://wimifarma-evolution-api:8080`;
- manter Postgres, Redis e instancias em volumes/pastas desta stack, fora do projeto principal.
- usar o manager embutido da propria API em `http://127.0.0.1:8080/manager` somente por acesso local/tunel SSH quando necessario; nao manter container manager separado.
- manter o workaround de pareamento da Evolution/Baileys: cache local, historico/contatos/chats/labels desligados e `CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198`, reduzindo erro de QR/codigo invalido durante login.

Fluxo no VPS:

```bash
cd /home/ubuntu/projetos/wimifarma-evolution-api
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/docker-compose.yml .
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/.env.example .env
# editar .env com segredos reais
docker compose up -d
curl -sS http://127.0.0.1:8080
```

Depois, no `.env` do Wimifarma principal, apontar:

```text
EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080
EVOLUTION_API_KEY=<AUTHENTICATION_API_KEY>
EVOLUTION_API_INSTANCE=wimifarma-cashback-test
```

Na Evolution API `v2.3.x`, o endpoint `POST /webhook/set/{instance}` aceitou o corpo com raiz `webhook`:

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

Manter `webhookByEvents=false`, porque o bridge recebe todos os eventos em `/miauw/whatsapp/webhook`.

Para erro de QR/codigo de pareamento invalido ou `Invalid buffer` nos logs do Baileys, preservar estas variaveis no `.env` real:

```text
CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true
DATABASE_SAVE_DATA_CHATS=false
DATABASE_SAVE_DATA_CONTACTS=false
DATABASE_SAVE_DATA_HISTORIC=false
DATABASE_SAVE_DATA_LABELS=false
CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198
```

## Monitoramento de timeouts do Baileys

Em 2026-05-30 foi observado timeout recorrente em `executeInitQueries`/`fetchProps` do Baileys, com a instancia ainda `open`. Esse erro costuma ser ruido de sincronizacao inicial do WhatsApp Web; nao reiniciar a stack inteira nem trocar a imagem enquanto o webhook continua recebendo `MESSAGES_UPSERT` e os envios seguem `sent`.

O script versionado abaixo confere tres coisas sem imprimir segredo: container rodando, `connectionState` da instancia e quantidade de timeouts recentes nos logs.

```bash
/home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
```

Padroes:

- `LOOKBACK=2h`
- `WARN_THRESHOLD=3`
- `CRITICAL_THRESHOLD=8`
- `STACK_DIR=/home/ubuntu/projetos/wimifarma-evolution-api`
- `MAIN_ENV=/home/ubuntu/projetos/wimifarma-com/.env`

Exemplo para janela diaria:

```bash
LOOKBACK=24h WARN_THRESHOLD=6 CRITICAL_THRESHOLD=12 \
  /home/ubuntu/projetos/wimifarma-com/ops/evolution/check-baileys-init-timeouts.sh
```

Interpretacao:

- `status=ok`: conexao aberta e timeouts abaixo do limite.
- `status=warn`: Evolution segue aberta, mas a quantidade recente subiu; monitorar e conferir se chegam mensagens reais.
- `status=critical`: container parado, conexao fora de `open`/`connected` ou timeouts acima do limite critico; verificar `messages.upsert` e, se estiver travado, reiniciar apenas `wimifarma-evolution-api`.

Restart operacional, quando realmente necessario:

```bash
cd /home/ubuntu/projetos/wimifarma-evolution-api
docker compose restart wimifarma-evolution-api
```
