# 05 - Comandos

## O que esta parte documenta

Comandos usados para operar, validar e auditar o projeto local e o VPS.

## Local - iniciar projeto

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

## Local - status e logs

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-cotacao-db
docker compose logs --tail=80 wimifarma-cotacao-redis
```

## Local - lint PHP

```powershell
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/functions.php
docker exec wimifarma-com-web php -l /var/www/html/financeiro/financeiro-funcoes.php
docker exec wimifarma-com-web php -l /var/www/html/miauw/miauw-funcoes.php
```

## Local - rotas rapidas

```powershell
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/wp-login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cotacao/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/financeiro/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/tarefa/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/login.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/tarefa/badge.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
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
