# 05 - Comandos

## O que esta parte documenta

Comandos usados para operar, validar e auditar o projeto local e o VPS.

## Local - iniciar projeto

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

## Local - novo PC com Codex

Prompt curto para iniciar em outro computador:

```text
Puxe o projeto Wimifarma do GitHub em C:\Projetos\wimifarma-com e siga o AGENTS.md.
Repositorio: https://github.com/WilliYY/wimifarma-com.git
```

Fluxo esperado para o Codex:

```powershell
New-Item -ItemType Directory -Force C:\Projetos | Out-Null
if ((Test-Path C:\Projetos\wimifarma-com) -and -not (Test-Path C:\Projetos\wimifarma-com\.git)) {
    throw "A pasta C:\Projetos\wimifarma-com ja existe, mas nao e um repositorio Git. Verifique antes de continuar."
}
if (-not (Test-Path C:\Projetos\wimifarma-com)) {
    git clone https://github.com/WilliYY/wimifarma-com.git C:\Projetos\wimifarma-com
} else {
    cd C:\Projetos\wimifarma-com
    git fetch origin
    $status = git status --short
    git status --short --branch
    if ($status) {
        throw "Ha alteracoes locais. Nao fazer pull automatico antes de revisar."
    }
    git pull --ff-only origin main
}
cd C:\Projetos\wimifarma-com
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
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-cotacao-db
docker compose logs --tail=80 wimifarma-cotacao-redis
docker compose logs --tail=80 wimifarma-gestao-app
docker compose logs --tail=80 wimifarma-gestao-db
docker compose logs --tail=80 wimifarma-miauw-agent
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
docker exec wimifarma-com-web php -l /var/www/html/xp/bootstrap.php
docker exec wimifarma-com-web php -l /var/www/html/xp/xp-funcoes.php
docker exec wimifarma-com-web php -l /var/www/html/xp/index.php
docker exec wimifarma-com-web php -l /var/www/html/xp/login.php
docker exec wimifarma-com-web php -l /var/www/html/xp/health.php
```

## Local - Miauby agente Node

```powershell
cd C:\Projetos\wimifarma-com\apps\miauw-agent
npm.cmd run check
npm.cmd run build
cd C:\Projetos\wimifarma-com
docker compose up -d --no-deps --build wimifarma-miauw-agent wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/miauw/agent/health
curl.exe -i -X POST http://127.0.0.1:3002/miauw/agent/run -H "Content-Type: application/json" -d "{\"message\":\"teste\"}"
```

O `POST /miauw/agent/run` sem token deve recusar com 401 ou 503, dependendo da configuracao local do token. Nao colocar o token real em comandos versionados.

O adaptador PHP compara respostas quando `MIAUW_AGENT_SHADOW_ON_SEND=true` ou quando `MIAUW_ENGINE=node_shadow` para usuario liberado. Para corte controlado, use `MIAUW_ENGINE=node` com `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e rollback para `MIAUW_ENGINE=php`.

O perfil de voz atual pode ser ajustado por ambiente com `MIAUW_VOICE_PROFILE=miauby_padrao|miauby_curto|miauby_operacional`. O audio do chat usa `MIAUW_AUDIO_ENABLED=true` e `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`; microfone so abre pelo botao `Falar`, o audio temporario vira rascunho transcrito, e o usuario escolhe `Enviar` ou `Cancelar`.

## Local - Gestao Node/Postgres

```powershell
cd C:\Projetos\wimifarma-com\apps\gestao
npm.cmd run check
npm.cmd run build
cd C:\Projetos\wimifarma-com
docker compose up -d --no-deps --build wimifarma-gestao-app wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/gestao/health
docker exec wimifarma-gestao-db psql -U wimifarma_gestao -d wimifarma_gestao -c "\dt"
```

A Gestao oficial usa `apps/gestao` por proxy Apache em `/gestao/`. O MySQL continua sendo usado para `wf_users`, `wf_logs` e importacao unica do legado, mas contas novas ficam no Postgres `wimifarma_gestao`.

## Local - Miauby evals

```powershell
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
```

Esse runner valida intents, guardrails, registry e rotas de modelo do Miauby sem chamar OpenAI e sem executar escritas reais.

## Local - rotas rapidas

```powershell
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/wp-login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cotacao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/financeiro/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/gestao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/xp/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/tarefa/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/treino.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/tarefa/badge.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/agent/health
curl.exe -sS http://127.0.0.1:3002/gestao/health
curl.exe -sS http://127.0.0.1:3002/xp/health.php
```

## Local - home e Cotacao tempo real

```powershell
curl.exe -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl.exe -L --max-time 30 http://127.0.0.1:3002/tarefa/badge.php
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
docker exec wimifarma-gestao-db psql -U wimifarma_gestao -d wimifarma_gestao -c "\dt"
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
