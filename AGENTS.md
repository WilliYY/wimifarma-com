# AGENTS.md - Wimifarma

Este arquivo e a memoria operacional para Codex/agentes neste projeto. Atualize sempre que mudar arquitetura, deploy, banco, fluxo de trabalho ou decisoes importantes.

## Contexto atual

- Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle.
- O usuario acessa o VPS por PuTTY e arquivos por WinSCP.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- Em 2026-05-10 o repositorio estava publico e vazio; por isso segredos nao devem ser versionados.
- O projeto local fica em `C:\Projetos\wimifarma-com`.
- Backups/dumps antigos foram movidos para `C:\Projetos\wimifarma-com-backups-local-20260510`.

## Como rodar local

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas:

- `/cashback/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/miauw/widget-status.php`

## Stack e estrutura

- Docker Compose com `wimifarma-com-web` e `wimifarma-com-db`.
- PHP 8.3 + Apache.
- MySQL 8.0.
- WordPress na raiz `site/`.
- Modulos internos PHP puro:
  - `site/cashback`
  - `site/cotacao`
  - `site/financeiro`
  - `site/tarefa`
  - `site/miauw`
- Banco WordPress: `wimifarma_wp`, prefixo `wptl_`.
- Banco dos apps: `wimifarma_app`.

## Segredos

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- plugins premium `*-pro` e `loginizer-security`

O Miauby pode carregar a chave por:

- `site/miauw/config.local.php`, ou
- `MIAUW_OPENAI_API_KEY` no `.env`.

## Estado validado em 2026-05-10

- Containers sobem com Docker Compose.
- Banco local importado do HostGator para `mysql/`.
- `wimifarma_app` possui tabelas `wf_*`, `cotacao_*`, `financeiro_*` e `miauw_*`.
- `wimifarma_wp` possui tabelas WordPress `wptl_*`.
- `site/miauw/widget-status.php` respondeu `api_ready: true` quando `config.local.php` estava presente.
- `cashback/login.php`, `cotacao/login.php`, `financeiro/login.php`, `tarefa/login.php` e `miauw/login.php` responderam 200.
- `cotacao/api.php` respondeu 401 sem sessao, esperado.
- WordPress raiz e `wp-login.php` responderam 200, porem lentos no Docker Desktop Windows com plugins restaurados.
- WordPress local exigiu ajuste para `WP_HOME/WP_SITEURL` em `localhost:3002`.
- Cache WordPress/SpeedyCache foi desativado por padrao apenas em localhost para evitar travamento local.
- `endurance-page-cache.php`, mu-plugin especifico de HostGator, foi movido para quarentena fora do projeto.
- `.dockerignore` limita o contexto de build a `docker/php/Dockerfile`, evitando envio de `.env`, `mysql/` e backups ao Docker.

Se a lentidao do WordPress repetir no VPS Linux, investigar primeiro plugins/cache/tema antes de mudar DNS definitivo.

## Auditoria antes de encerrar qualquer alteracao

Rode:

```powershell
docker compose ps
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/widget-status.php
docker compose logs --tail=80 wimifarma-com-web
```

Quando mexer em front-end ou fluxo visivel, abrir no navegador e validar visualmente.

## Deploy no VPS

Depois de commitar e enviar para GitHub, no PuTTY:

```bash
cd /var/www/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

Se for primeiro clone:

```bash
sudo mkdir -p /var/www
cd /var/www
git clone https://github.com/WilliYY/wimifarma-com.git
cd wimifarma-com
cp .env.example .env
nano .env
docker compose up -d --build
```

## Direcao futura: Cotacao + Google Sheets

Objetivo do usuario: transformar a cotacao em uma ferramenta forte e poderosa, espelhada com Google Sheets.

Antes de implementar:

- Mapear tabelas `cotacao_*`.
- Definir ID estavel para cada item/linha.
- Definir fonte de verdade por campo.
- Criar auditoria de sync.
- Criar tratamento de conflito.
- Preservar formatacao importante da planilha.
- Criar job/cron de sincronizacao.
- Criar tela de diagnostico do sync.
- Usar Miauby para resumir divergencias e tarefas pendentes.

Evite construir sincronizacao por string solta. Use API estruturada do Google Sheets quando o conector/credencial estiver definido.

## Preferencias de trabalho

- O usuario quer commits ao final das alteracoes.
- O usuario quer receber o comando de PuTTY para atualizar o VPS.
- Antes de subir para GitHub publico, verificar segredos.
- Nao apagar backups/dados sem mover para local seguro ou confirmar.
- Preferir mudancas pequenas, validadas e documentadas.
