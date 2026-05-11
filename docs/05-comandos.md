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
```

## Local - lint PHP

```powershell
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/functions.php
docker exec wimifarma-com-web php -l /var/www/html/cotacao/cotacao-funcoes.php
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
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
```

## Banco - inventario

```powershell
docker exec wimifarma-com-db sh -c "mysql -u`$MYSQL_USER -p`$MYSQL_PASSWORD -N -B -e 'SHOW TABLES FROM wimifarma_app; SHOW TABLES FROM wimifarma_wp;'"
```

## Git local

```powershell
git status --short --branch
git add README.md AGENTS.md docs
git commit -m "docs: document Wimifarma project context"
git push origin main
```

## VPS - deploy quando a pasta ja usar Git

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

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
