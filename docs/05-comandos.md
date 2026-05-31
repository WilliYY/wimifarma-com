# 05 - Comandos

## O que esta parte documenta

Comandos usados para operar, validar e auditar o projeto local e o VPS.

## Local - iniciar projeto

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --build
```

## Local - novo PC com Codex

Prompt minimo para continuar um chat quando o projeto ja esta neste PC:

```text
Use C:\Users\Thiesen\Desktop\wimifarma-com, siga o AGENTS.md e execute esta tarefa:
[ESCREVA A TAREFA]
```

Esse prompt e suficiente porque `AGENTS.md`, `README.md` e os documentos em `docs/` guardam o contexto atualizado do projeto, incluindo stack, modulos, deploy, regras de seguranca, XP, Codigos e decisoes recentes. O Codex ainda deve fazer `git fetch origin`, conferir `git status --short --branch` e ler os documentos obrigatorios antes de alterar arquivos.

Prompt curto para iniciar em outro computador ou quando nao tiver certeza se a pasta existe:

```text
Puxe o projeto Wimifarma do GitHub em C:\Users\Thiesen\Desktop\wimifarma-com e siga o AGENTS.md.
Repositorio: https://github.com/WilliYY/wimifarma-com.git
Tarefa: [ESCREVA A TAREFA]
```

Fluxo esperado para o Codex:

```powershell
New-Item -ItemType Directory -Force C:\Projetos | Out-Null
if ((Test-Path C:\Users\Thiesen\Desktop\wimifarma-com) -and -not (Test-Path C:\Users\Thiesen\Desktop\wimifarma-com\.git)) {
    throw "A pasta C:\Users\Thiesen\Desktop\wimifarma-com ja existe, mas nao e um repositorio Git. Verifique antes de continuar."
}
if (-not (Test-Path C:\Users\Thiesen\Desktop\wimifarma-com)) {
    git clone https://github.com/WilliYY/wimifarma-com.git C:\Users\Thiesen\Desktop\wimifarma-com
} else {
    cd C:\Users\Thiesen\Desktop\wimifarma-com
    git fetch origin
    $status = git status --short
    git status --short --branch
    if ($status) {
        throw "Ha alteracoes locais. Nao fazer pull automatico antes de revisar."
    }
    git pull --ff-only origin main
}
cd C:\Users\Thiesen\Desktop\wimifarma-com
Get-Content AGENTS.md | Select-Object -First 220
Get-Content README.md | Select-Object -First 220
Get-Content docs\05-comandos.md | Select-Object -First 220
```

Se `git status --short --branch` mostrar arquivos modificados antes do pull, nao sobrescrever automaticamente. Relatar ao usuario e pedir confirmacao.

Esse fluxo so puxa o codigo. Ele nao cria `.env`, nao copia `config.local.php`, nao baixa bancos/volumes e nao configura SSH do VPS. Para rodar localmente, configurar segredos por fonte segura e seguir a secao `Local - iniciar projeto`. Para deploy automatico pelo Codex, o outro PC precisa ter SSH/plink configurado para o VPS.

## Local - status e logs

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker compose logs --tail=80 wimifarma-cashback-app
docker compose logs --tail=80 wimifarma-cashback-db
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-cotacao-db
docker compose logs --tail=80 wimifarma-cotacao-redis
docker compose logs --tail=80 wimifarma-gestao-app
docker compose logs --tail=80 wimifarma-gestao-db
docker compose logs --tail=80 wimifarma-tarefa-app
docker compose logs --tail=80 wimifarma-tarefa-db
docker compose logs --tail=80 wimifarma-xp-app
docker compose logs --tail=80 wimifarma-xp-db
docker compose logs --tail=80 wimifarma-codigos-app
docker compose logs --tail=80 wimifarma-codigos-db
docker compose logs --tail=80 wimifarma-financeiro-app
docker compose logs --tail=80 wimifarma-financeiro-db
docker compose logs --tail=80 wimifarma-usuarios-app
docker compose logs --tail=80 wimifarma-miauw-agent
docker compose logs --tail=80 wimifarma-miauw-whatsapp
docker compose logs --tail=80 wimifarma-miauby-migrator
docker compose logs --tail=80 wimifarma-miauby-app
```

## Local - lint PHP

```powershell
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/functions.php
docker exec wimifarma-com-web php -l /var/www/html/financeiro/financeiro-funcoes.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/miauw-funcoes.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/miauw-diagnostics.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/diagnostico.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/treino.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/miauw-evals.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/agent-actions.php
```

Os PHPs antigos de XP, Codigos, Gestao e financeiro antigo dentro de Cashback ficam arquivados em `site/_legacy-disabled/2026-05-29/` e nao entram mais no lint operacional.

## Local - Miauby agente Node

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\miauw-agent
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-miauw-agent wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/miauw/agent/health
curl.exe -i -X POST http://127.0.0.1:3002/miauw/agent/run -H "Content-Type: application/json" -d "{\"message\":\"teste\"}"
```

O `POST /miauw/agent/run` sem token deve recusar com 401 ou 503, dependendo da configuracao local do token. Nao colocar o token real em comandos versionados.

O adaptador PHP compara respostas quando `MIAUW_AGENT_SHADOW_ON_SEND=true` ou quando `MIAUW_ENGINE=node_shadow` para usuario liberado. Para corte controlado, use `MIAUW_ENGINE=node` com `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e rollback para `MIAUW_ENGINE=php`.

O perfil de voz atual pode ser ajustado por ambiente com `MIAUW_VOICE_PROFILE=miauby_padrao|miauby_curto|miauby_operacional`. O audio do chat usa `MIAUW_AUDIO_ENABLED=true` e `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`; microfone so abre pelo botao `Falar`, o audio temporario vira rascunho transcrito, e o usuario escolhe `Enviar` ou `Cancelar`.

## Local - Miauby WhatsApp Bridge

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\miauw-whatsapp
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-miauw-whatsapp-db wimifarma-miauw-whatsapp wimifarma-com-web
docker exec wimifarma-com-web php -l /var/www/html/miauw/agent-context.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/agent-memory.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/agent-actions.php
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/health
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/
curl.exe -i -X POST http://127.0.0.1:3002/miauw/whatsapp/internal/memory -H "Content-Type: application/json" -d "{}"
curl.exe -i -X POST http://127.0.0.1:3002/miauw/agent-context.php -H "Content-Type: application/json" -d "{}"
curl.exe -i -X POST http://127.0.0.1:3002/miauw/agent-memory.php -H "Content-Type: application/json" -d "{}"
```

O bridge nasce com `MIAUW_WHATSAPP_ENABLED=false`. Antes de aceitar webhook real, configurar no `.env`: `MIAUW_WHATSAPP_WEBHOOK_TOKEN`, `MIAUW_WHATSAPP_ENCRYPTION_KEY`, `MIAUW_WHATSAPP_ALLOWED_SENDERS` e `MIAUW_WHATSAPP_PROVIDER`. Para Evolution, preencher `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_API_INSTANCE`. Para Meta Cloud API, preencher `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `META_WHATSAPP_APP_SECRET`.
O `POST /miauw/whatsapp/internal/memory`, `POST /miauw/agent-context.php` e `POST /miauw/agent-memory.php` sem token devem responder 401 ou 503; com token interno, entregam memoria/contexto compartilhado e nao devem ser testados colando segredo em comandos versionados. A fonte principal da memoria curta e o Postgres do bridge; o endpoint PHP fica como compatibilidade/fallback.

## Local - Miauby interno Postgres sombra

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\miauby
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-com-db wimifarma-miauby-db
sh scripts/miauby-shadow-migrate.sh migrate
sh scripts/miauby-shadow-migrate.sh validate
docker compose up -d --no-deps --build wimifarma-miauby-app
docker exec wimifarma-miauby-app wget -qO- http://127.0.0.1:4100/miauby/health
docker exec wimifarma-miauby-app sh -lc 'TOKEN="$MIAUW_AGENT_INTERNAL_TOKEN"; wget -qO- --header=x-miauby-internal-token:${TOKEN} "http://127.0.0.1:4100/miauby/api/internal/readiness?sample=20"'
docker exec wimifarma-miauby-app sh -lc 'TOKEN="$MIAUW_AGENT_INTERNAL_TOKEN"; wget -qO- --header=x-miauby-internal-token:${TOKEN} "http://127.0.0.1:4100/miauby/api/internal/context?limit=3"'
sh scripts/miauby-shadow-smoke.sh 20 3
docker exec wimifarma-miauby-db psql -U wimifarma_miauby -d wimifarma_miauby -c "\dt"
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -I http://127.0.0.1:3002/miauby/
curl.exe -I http://127.0.0.1:3002/miauby/agent/health
curl.exe -I http://127.0.0.1:3002/miauby/whatsapp/health
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
```

Esse migrador copia `miauw_*` para `miauby_*` em Postgres sombra, com `legacy_mysql_id`, checksum e `payload_sanitized`. O script `scripts/miauby-shadow-migrate.sh` prefere `docker compose exec -T wimifarma-miauby-app` quando o app ja esta rodando e usa `docker compose run --rm --no-deps` apenas como fallback, para nao tentar recriar `wimifarma-com-db` em VPS com containers antigos/labels de Compose diferentes. O `wimifarma-miauby-app` expoe apenas API interna de leitura, sem proxy publico: `/miauby/health` e publico dentro da rede Docker; `/miauby/api/internal/status`, `/miauby/api/internal/parity?sample=5`, `/miauby/api/internal/readiness?sample=20` e `/miauby/api/internal/context?limit=3` exigem `MIAUBY_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN` ou `MIAUW_AGENT_INTERNAL_TOKEN`. `readiness` consolida paridade/health para pos-deploy e `context` retorna apenas amostras sanitizadas, sem `payload_sanitized` bruto. O corte canonico seguro de 2026-05-31 publica `/miauby/` como redirect para `/miauw/` e aliases `/miauby/agent/` e `/miauby/whatsapp/` para os servicos Node atuais; isso nao troca widget, nao corta o PHP e nao deve gravar token, telefone cru, SQL bruto, stack trace, audio ou midia.

## Local - Cashback Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\cashback
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-cashback-db
docker compose up -d --no-deps --build wimifarma-cashback-app wimifarma-com-web
docker exec wimifarma-cashback-app wget -qO- http://127.0.0.1:4000/cashback/health
curl.exe -sS http://127.0.0.1:3002/cashback/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total}`n" http://127.0.0.1:3002/cashback/login.php
docker exec wimifarma-cashback-db psql -U wimifarma_cashback -d wimifarma_cashback -c "\dt"
```

O app `apps/cashback` atende a rota oficial `/cashback/` via proxy Apache. A fonte oficial e o Postgres `wimifarma_cashback`; desde 2026-05-30 o servico nao possui `mysql2`, importador, espelho, logs ou fallback MySQL. Rollback para MySQL exige restaurar commit/imagem anterior e backup validado, nao trocar `.env`. Endpoints internos sem token devem responder 401 ou 503; nao colar token real em comando versionado.

## Local - Core auth Postgres oficial

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\core-auth
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-core-db
docker compose run --rm wimifarma-core-migrator npm run migrate:users
docker compose run --rm wimifarma-core-migrator npm run validate:users
docker exec wimifarma-core-db psql -U wimifarma_core -d wimifarma_core -c "\dt"
curl.exe -sS http://127.0.0.1:3002/cotacao/health
```

Esta etapa cria/valida `core_users`, `core_audit_logs` e `core_login_rate_limits` em Postgres, sincronizando `wf_users` do MySQL. Cotacao, Gestao, Pedidos, Tarefa, Codigos, Cashback, XP e Financeiro usam somente `core_users`; Miauby PHP usa `core_users` oficialmente por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`. Fallback MySQL de autenticacao fica apenas como rollback opt-in onde ainda existir.

Gestao usa somente `core_users` desde 2026-05-30. O servico nao possui mais `GESTAO_AUTH_PROVIDER`, fallback `wf_users`, sombra MySQL, dependencia `mysql2`, espelho `wf_logs` nem variaveis `MYSQL_*` no Compose; `/gestao/health` deve mostrar `auth.provider=core`, `mysql_auth=false`, `mysql_auth_fallback=false` e `mysql_reachable=false`.

Pedidos usa somente `core_users` e Postgres. O servico nao possui mais `PEDIDOS_AUTH_PROVIDER`, fallback `wf_users`, sombra MySQL, dependencia `mysql2` nem variaveis `MYSQL_*` no Compose; `/pedidos/health` deve mostrar `auth.provider=core`, `mysql_dependency=false`, `mysql_auth=false` e `mysql_auth_fallback=false`.

Tarefa usa somente `core_users` e Postgres desde 2026-05-30. O servico nao possui mais `TAREFA_AUTH_PROVIDER`, sombra MySQL, dependencia `mysql2`, importador, espelho, fallback `wf_users` nem flags `TAREFA_LEGACY_MYSQL_*`; `/tarefa/health` deve mostrar `auth.provider=core` e `storage.provider=postgres`. Rollback MySQL exige restaurar versao anterior e backup validado.

## Local - Tarefa Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\tarefa
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-tarefa-db
docker compose up -d --no-deps --build wimifarma-tarefa-app wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/tarefa/health
curl.exe -sS http://127.0.0.1:3002/tarefa/badge.php
docker exec wimifarma-tarefa-db psql -U wimifarma_tarefa -d wimifarma_tarefa -c "\dt"
```

A rota `/tarefa/` e servida por `apps/tarefa` via proxy Apache. O servico autentica por `core_users` e usa `tarefa_tasks` no Postgres como fonte oficial. Desde 2026-05-30, nao ha importador, espelho, fallback `wf_users`, flags MySQL nem credenciais MySQL no app; rollback MySQL exige restaurar versao anterior e backup validado.

## Local - XP Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\xp
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-xp-db
docker compose up -d --no-deps --build wimifarma-xp-app wimifarma-com-web
docker exec wimifarma-xp-app wget -qO- http://127.0.0.1:3600/xp/health
curl.exe -sS http://127.0.0.1:3002/xp/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total}`n" http://127.0.0.1:3002/xp/login.php
docker exec wimifarma-xp-db psql -U wimifarma_xp -d wimifarma_xp -c "\dt"
```

O app `apps/xp` atende a rota oficial `/xp/` via proxy Apache. A fonte oficial e o Postgres `wimifarma_xp`; desde 2026-05-30 o servico nao possui `mysql2`, importador, espelho, logs ou fallback MySQL. Rollback MySQL exige restaurar versao anterior e backup validado. O frontend continua vindo de `site/xp` por volumes montados.

## Local - Codigos Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\codigos
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-codigos-db
docker compose up -d --no-deps --build wimifarma-codigos-app wimifarma-com-web
docker exec wimifarma-codigos-app wget -qO- http://127.0.0.1:3700/codigos/health
curl.exe -sS http://127.0.0.1:3002/codigos/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total}`n" http://127.0.0.1:3002/codigos/login.php
curl.exe -i http://127.0.0.1:3002/codigos/api/internal/summary
docker exec wimifarma-codigos-db psql -U wimifarma_codigos -d wimifarma_codigos -c "\dt"
```

O app `apps/codigos` atende a rota oficial `/codigos/` via proxy Apache. A fonte oficial e o Postgres `wimifarma_codigos`; desde 2026-05-30 o servico nao possui `mysql2`, importador, espelho, logs ou fallback MySQL. Rollback MySQL exige restaurar versao anterior e backup validado. O endpoint interno sem `X-Miauw-Internal-Token` deve responder 401 ou 503; nao colar token real em comando versionado.

## Local - Usuarios Node/Postgres core

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\usuarios
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-usuarios-app wimifarma-com-web
docker exec wimifarma-usuarios-app wget -qO- http://127.0.0.1:3900/usuarios/health
curl.exe -sS http://127.0.0.1:3002/usuarios/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total}`n" http://127.0.0.1:3002/usuarios/login.php
```

O app `apps/usuarios` atende `/usuarios/` via proxy Apache, usa `wimifarma_core` como fonte de verdade e consulta `wimifarma_xp` apenas para vinculo com funcionarios XP. Nao apagar fisicamente usuarios; o painel usa `active=false`.

## Local - Financeiro Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\financeiro
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d wimifarma-financeiro-db
docker compose up -d --no-deps --build wimifarma-financeiro-app wimifarma-com-web
docker exec wimifarma-financeiro-app wget -qO- http://127.0.0.1:3800/financeiro/health
curl.exe -sS http://127.0.0.1:3002/financeiro/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total}`n" http://127.0.0.1:3002/financeiro/login.php
docker exec wimifarma-financeiro-db psql -U wimifarma_financeiro -d wimifarma_financeiro -c "\dt"
```

O app `apps/financeiro` atende a rota oficial `/financeiro/` via proxy Apache, usa somente `core_users` e grava em Postgres `wimifarma_financeiro`. Desde 2026-05-30, nao ha `mysql2`, importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` nem flags `FINANCEIRO_LEGACY_MYSQL_*`; rollback MySQL exige restaurar versao anterior e backup validado. Endpoints `/financeiro/internal/*` e `/financeiro/api/internal/*` exigem `X-Miauw-Internal-Token` ou `X-Financeiro-Internal-Token`; nao colar token real em comando versionado.

## Local - Inventario de modernizacao

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
powershell -ExecutionPolicy Bypass -File scripts\audit-modernization.ps1
powershell -ExecutionPolicy Bypass -File scripts\audit-modernization.ps1 -Json
```

No VPS/Linux:

```bash
cd /home/ubuntu/projetos/wimifarma-com
bash scripts/audit-modernization.sh
```

Esse inventario mostra quais modulos ainda usam PHP/MySQL/WordPress, quais ja estao em Node/Postgres e qual e a proxima etapa segura para migrar para TypeScript + PostgreSQL.

## VPS - Evolution API para Miauby WhatsApp

Template versionado:

```powershell
ops\evolution\docker-compose.yml
ops\evolution\.env.example
```

Deploy no VPS em stack separada:

```bash
mkdir -p /home/ubuntu/projetos/wimifarma-evolution-api
cd /home/ubuntu/projetos/wimifarma-evolution-api
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/docker-compose.yml .
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/.env.example .env
# preencher segredos reais no .env antes de subir
docker compose up -d
curl -sS http://127.0.0.1:8080
```

No `.env` do projeto principal, apontar o bridge para a API interna:

```bash
EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080
EVOLUTION_API_INSTANCE=wimifarma-cashback-test
```

`EVOLUTION_API_KEY` deve ser o mesmo valor de `AUTHENTICATION_API_KEY` da stack Evolution, sem versionar.

## VPS - n8n automacoes

Template versionado:

```powershell
ops\n8n\docker-compose.yml
ops\n8n\.env.example
ops\n8n\workflows\pedidos-chegada-17h.json
ops\n8n\workflows\financeiro-fechamento-caixa-18h.json
```

Instalacao em stack separada no VPS:

```bash
mkdir -p /home/ubuntu/projetos/wimifarma-n8n
cd /home/ubuntu/projetos/wimifarma-n8n
cp /home/ubuntu/projetos/wimifarma-com/ops/n8n/docker-compose.yml .
cp /home/ubuntu/projetos/wimifarma-com/ops/n8n/.env.example .env
mkdir -p workflows
cp /home/ubuntu/projetos/wimifarma-com/ops/n8n/workflows/*.json workflows/
# preencher N8N_POSTGRES_PASSWORD, N8N_ENCRYPTION_KEY e MIAUW_GUARDIAN_TOKEN antes de subir
docker compose up -d
curl -sS http://127.0.0.1:5678
```

O n8n deve chamar endpoints internos tokenizados do Wimifarma. Nao usar workflow n8n para escrita direta em banco de negocio.

Importar/ativar as rotinas diarias:

```bash
cd /home/ubuntu/projetos/wimifarma-n8n
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/pedidos-chegada-17h.json
docker compose exec -T wimifarma-n8n n8n import:workflow --input=/workflows/financeiro-fechamento-caixa-18h.json
docker compose exec -T wimifarma-n8n n8n update:workflow --id=pedidos-chegada-17h --active=true
docker compose exec -T wimifarma-n8n n8n update:workflow --id=financeiro-fechamento-caixa-18h --active=true
docker compose restart wimifarma-n8n
```

Validar o backend sem enviar WhatsApp:

```bash
cd /home/ubuntu/projetos/wimifarma-com
docker compose exec -T wimifarma-miauw-whatsapp node -e "fetch('http://127.0.0.1:3400/miauw/whatsapp/internal/pedidos-arrival-check',{method:'POST',headers:{'content-type':'application/json','x-miauw-internal-token':process.env.MIAUW_GUARDIAN_TOKEN||process.env.MIAUW_WHATSAPP_INTERNAL_TOKEN},body:JSON.stringify({notify:'always',dry_run:true})}).then(r=>r.text()).then(t=>console.log(t))"
docker compose exec -T wimifarma-miauw-whatsapp node -e "fetch('http://127.0.0.1:3400/miauw/whatsapp/internal/financeiro-cash-closing-reminder',{method:'POST',headers:{'content-type':'application/json','x-miauw-internal-token':process.env.MIAUW_GUARDIAN_TOKEN||process.env.MIAUW_WHATSAPP_INTERNAL_TOKEN},body:JSON.stringify({notify:'always',dry_run:true})}).then(r=>r.text()).then(t=>console.log(t))"
```

## Local - Gestao Node/Postgres

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\gestao
npm.cmd run check
npm.cmd run build
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-gestao-app wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/gestao/health
docker exec wimifarma-gestao-db psql -U wimifarma_gestao -d wimifarma_gestao -c "\dt"
```

A Gestao oficial usa `apps/gestao` por proxy Apache em `/gestao/`. O app usa Postgres `wimifarma_gestao` e core `core_users` sem abrir conexao MySQL; `source_mysql_id` fica apenas como referencia historica importada.

## Local - Miauby evals

```powershell
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
```

Esse runner valida intents, guardrails, registry e rotas de modelo do Miauby sem chamar OpenAI e sem executar escritas reais.

## Local - seguranca

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-secrets.ps1
curl.exe -I http://127.0.0.1:3002/cotacao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code}`n" http://127.0.0.1:3002/xmlrpc.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code}`n" http://127.0.0.1:3002/wp-content/uploads/
```

O `xmlrpc.php` e a listagem de `wp-content/uploads/` devem responder 403 enquanto o hardening estiver ativo.

## Local - rotas rapidas

```powershell
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/wp-login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -sS http://127.0.0.1:3002/cashback/health
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cotacao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/financeiro/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/gestao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/xp/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/tarefa/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/treino.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/tarefa/badge.php
curl.exe -sS http://127.0.0.1:3002/tarefa/health
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/agent/health
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/whatsapp/
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/whatsapp/health
curl.exe -sS http://127.0.0.1:3002/gestao/health
curl.exe -sS http://127.0.0.1:3002/xp/health
curl.exe -o NUL -sS -w "legacy_disabled=%{http_code}`n" http://127.0.0.1:3002/_legacy-disabled/README.md
```

## Local - home e Cotacao tempo real

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\cotacao
npm.cmd run check
npm.cmd run typecheck
cd C:\Users\Thiesen\Desktop\wimifarma-com
curl.exe -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl.exe -L --max-time 30 http://127.0.0.1:3002/tarefa/badge.php
curl.exe -sS http://127.0.0.1:3002/tarefa/health
curl.exe -sS http://127.0.0.1:3002/cotacao/health
curl.exe -I -sS http://127.0.0.1:3002/cotacao/login.php
curl.exe -I -sS http://127.0.0.1:3002/cotacao/socket.io/socket.io.js
curl.exe -sS http://127.0.0.1:3002/cotacao/api/diagnostics
curl.exe -sS http://127.0.0.1:3002/cotacao/api/google-sheets/status
curl.exe -sS http://127.0.0.1:3002/cotacao/api/backups
```

A Cotacao V2 usa API JSON com sessao e CSRF em meta tag. Para validar edicao por celula sem navegador, primeiro autentique em `/cotacao/login.php`, extraia o CSRF da pagina `/cotacao/` e chame `PATCH /cotacao/api/cells` ou `PATCH /cotacao/api/cells/batch`.

## Banco - inventario

```powershell
docker exec wimifarma-com-db sh -c "mysql -u`$MYSQL_USER -p`$MYSQL_PASSWORD -N -B -e 'SHOW TABLES FROM wimifarma_app; SHOW TABLES FROM wimifarma_wp;'"
docker exec wimifarma-cotacao-db psql -U wimifarma_cotacao -d wimifarma_cotacao -c "\dt"
docker exec wimifarma-core-db psql -U wimifarma_core -d wimifarma_core -c "\dt"
docker exec wimifarma-gestao-db psql -U wimifarma_gestao -d wimifarma_gestao -c "\dt"
docker exec wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "\dt"
docker exec wimifarma-miauby-db psql -U wimifarma_miauby -d wimifarma_miauby -c "\dt"
```

## Git local

```powershell
git status --short --branch
git add README.md AGENTS.md docs
git commit -m "docs: document Wimifarma project context"
git push origin main
```

## VPS - deploy quando a pasta ja usar Git

O Codex pode executar estes comandos diretamente no VPS por SSH/plink com a chave local autorizada. Ao finalizar, basta relatar o que foi executado e validado; nao e necessario enviar um comando PuTTY equivalente ao usuario.

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
```

Para mudancas no servico Miauby agente, usar rebuild direcionado:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --no-deps --build wimifarma-miauw-agent wimifarma-com-web
docker compose ps
curl -I https://wimifarma.com/miauw/agent/health
docker compose logs --tail=80 wimifarma-miauw-agent
```

Para mudancas no bridge WhatsApp do Miauby, usar rebuild direcionado:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --no-deps --build wimifarma-miauw-whatsapp-db wimifarma-miauw-whatsapp wimifarma-com-web
docker compose ps
curl -I https://wimifarma.com/miauw/whatsapp/health
curl -I https://wimifarma.com/miauw/whatsapp/
docker exec wimifarma-com-web php -l /var/www/html/miauw/agent-context.php
docker compose logs --tail=80 wimifarma-miauw-whatsapp
```

Para mudancas no PHP/Apache e na Cotacao V2 ao mesmo tempo, usar rebuild direcionado:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull --ff-only origin main
docker compose up -d --no-deps --build wimifarma-com-web wimifarma-cotacao-app
docker compose ps
curl -sS http://127.0.0.1:3002/cotacao/health
curl -I http://127.0.0.1:3002/cotacao/login.php
curl -I http://127.0.0.1:3002/xmlrpc.php
```

Para mudancas no servico Gestao, usar rebuild direcionado e preservar os bancos existentes:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull --ff-only origin main
docker compose up -d wimifarma-gestao-db
docker compose up -d --no-deps --build wimifarma-gestao-app wimifarma-com-web
docker compose ps
curl -sS http://127.0.0.1:3002/gestao/health
docker compose logs --tail=80 wimifarma-gestao-app
docker compose logs --tail=80 wimifarma-com-web
```

Para mudancas no servico Financeiro, usar rebuild direcionado e preservar `financeiro-data/` e `mysql/`:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull --ff-only origin main
docker compose up -d wimifarma-financeiro-db
docker compose up -d --no-deps --build wimifarma-financeiro-app wimifarma-com-web
docker compose ps
curl -sS http://127.0.0.1:3002/financeiro/health
curl -I http://127.0.0.1:3002/financeiro/login.php
docker compose logs --tail=80 wimifarma-financeiro-app
docker compose logs --tail=80 wimifarma-com-web
```

## VPS - auditar e organizar pastas do projeto

Use quando o WinSCP mostrar varias pastas parecidas com `wimifarma-com`. A auditoria primeiro identifica qual pasta esta ativa nos containers; depois move copias paradas para quarentena, sem apagar dados.

```bash
cd /home/ubuntu/projetos
pwd
find . -maxdepth 1 -type d -name 'wimifarma-com*' -printf '%f\n' | sort
du -sh wimifarma-com* 2>/dev/null || true
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker inspect wimifarma-com-web --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker inspect wimifarma-cotacao-app --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

Se os mounts mostrarem que a pasta ativa correta ja e `/home/ubuntu/projetos/wimifarma-com`, arquive as copias antigas com cuidado:

```bash
cd /home/ubuntu/projetos
mkdir -p _arquivados-wimifarma/$(date +%F)
mv -n wimifarma-com-git _arquivados-wimifarma/$(date +%F)/ 2>/dev/null || true
mv -n wimifarma-com-code-* _arquivados-wimifarma/$(date +%F)/ 2>/dev/null || true
mv -n wimifarma-com-runti* _arquivados-wimifarma/$(date +%F)/ 2>/dev/null || true
find . -maxdepth 2 -type d -name 'wimifarma-com*' -printf '%p\n' | sort
```

Nao mover `wimifarma-com` se algum `docker inspect` apontar para ela. Nao apagar a quarentena sem backup e confirmacao.

## VPS - diagnosticar home publica

Use quando o dominio ainda mostrar a home antiga ou quando `https://wimifarma.com/home.php` retornar 404:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git fetch origin
git log -1 --oneline
git rev-parse HEAD
git rev-parse origin/main
ls -la site/home.php site/.htaccess
grep -n "wimifarma-static-home" site/home.php || true
grep -n "Wimifarma stable home" site/.htaccess || true
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
docker inspect wimifarma-com-web --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker exec wimifarma-com-web sh -lc 'ls -la /var/www/html/home.php /var/www/html/.htaccess && grep -n "wimifarma-static-home" /var/www/html/home.php && grep -n "Wimifarma stable home" /var/www/html/.htaccess && apache2ctl -t'
curl -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
docker exec nginx-proxy-manager-app-1 curl -I http://wimifarma-com-web/
```

O header esperado e `X-Served-By: wimifarma-static-home`. Se ele aparece no teste local do container mas nao aparece pelo dominio, revisar o Proxy Host do Nginx Proxy Manager.

## VPS - primeiro clone controlado

Nao substituir a pasta atual sem preservar `.env`, `mysql/`, `site/miauw/config.local.php` e backups.

```bash
cd /home/ubuntu/projetos
git clone https://github.com/WilliYY/wimifarma-com.git wimifarma-com-git
cd wimifarma-com-git
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
```

## VPS - checar portas

```bash
sudo ss -tulpn | grep -E ':80|:443|:3002|:81'
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

## VPS - checar proxy interno

```bash
docker network connect wimifarma-com-network nginx-proxy-manager-app-1 2>/dev/null || true
docker exec nginx-proxy-manager-app-1 curl -I http://wimifarma-com-web/
docker exec nginx-proxy-manager-app-1 curl http://wimifarma-com-web/miauw/widget-status.php
```

## DNS

```bash
dig wimifarma.com +short
dig www.wimifarma.com +short
dig @ns49.domaincontrol.com wimifarma.com +short
dig @ns49.domaincontrol.com www.wimifarma.com +short
```

## Regras e riscos

- Nunca rodar comandos destrutivos em `mysql/` sem backup.
- Nao usar `git reset --hard` ou checkout destrutivo sem pedido claro.
- Nao publicar portas do MySQL.
- Nao usar a porta `13002` no Nginx Proxy Manager.

## Evolucao futura

- Criar scripts `scripts/audit.ps1` e `scripts/audit-vps.sh`.
- Criar script de backup MySQL com data.
- Criar checklist de deploy com rollback.
