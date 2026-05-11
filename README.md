# Wimifarma

Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle, com WordPress e modulos internos em PHP rodando via Docker.

Estado base desta documentacao: 2026-05-10.

## Objetivo do sistema

O sistema centraliza a presenca web e ferramentas internas da Wimifarma:

- site WordPress principal em `site/`;
- Cashback para clientes, compras, creditos e resgates;
- Cotacao para controle de itens, fornecedores, precos e status de compras;
- Financeiro para fechamento, sangrias, PIX, maquininhas e auditoria;
- Tarefas internas;
- Miauby, assistente interno com integracao OpenAI e recursos de diagnostico.

O objetivo tecnico da migracao e sair de uma hospedagem HostGator limitada e evoluir em uma VPS mais flexivel, com Docker, controle de versao, deploy rastreavel e espaco para novos modulos.

## Status atual

- Projeto local em `C:\Projetos\wimifarma-com`.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- Docker Compose sobe `wimifarma-com-web` e `wimifarma-com-db`.
- Banco local importado do HostGator no volume ignorado `mysql/`.
- `wimifarma_app` contem tabelas `wf_*`, `cotacao_*`, `financeiro_*` e `miauw_*`.
- `wimifarma_wp` contem WordPress com prefixo `wptl_`.
- Rotas de login dos modulos responderam HTTP 200 na auditoria local.
- `miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava configurada.
- WordPress respondeu HTTP 200 localmente, mas ficou lento no Docker Desktop Windows com plugins restaurados.
- DNS GoDaddy e Nginx Proxy Manager estavam em configuracao para `wimifarma.com`.
- Cache de pagina WordPress/SpeedyCache esta opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A rota publica `/` e servida por `site/home.php`, uma home independente do bootstrap do WordPress, com fundo visual em tela inteira, GIFs decorativos com movimento igual aos logins e cards inferiores de acesso aos modulos.

Pontos ainda pendentes ficam registrados em `docs/06-pendencias.md`.

## Stack

- PHP 8.3 com Apache
- MySQL 8.0
- WordPress na raiz publica `site/`
- Modulos internos em PHP procedural
- Docker Compose
- Nginx Proxy Manager no VPS para publicar dominios
- OpenAI API usada pelo Miauby

## Instalar localmente

1. Entrar na pasta do projeto:

```powershell
cd C:\Projetos\wimifarma-com
```

2. Criar o `.env` local a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

3. Editar `.env` com valores reais do ambiente local. Nunca versionar `.env`.

4. Opcionalmente configurar o Miauby por arquivo local:

```powershell
Copy-Item site\miauw\config.local.example.php site\miauw\config.local.php
```

Depois editar `site\miauw\config.local.php`. Esse arquivo tambem nao deve ser versionado.

## Como rodar

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas principais:

- `http://127.0.0.1:3002/cashback/login.php`
- `http://127.0.0.1:3002/cotacao/login.php`
- `http://127.0.0.1:3002/financeiro/login.php`
- `http://127.0.0.1:3002/tarefa/login.php`
- `http://127.0.0.1:3002/miauw/login.php`
- `http://127.0.0.1:3002/miauw/widget-status.php`

## Comandos principais

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
```

Mais comandos ficam em `docs/05-comandos.md`.

## Estrutura de pastas

```text
.
|-- docker/
|   |-- php/Dockerfile
|   `-- mysql/init/
|-- docs/
|-- mysql/                  # volume local ignorado pelo Git
|-- site/
|   |-- home.php              # home publica estavel, fora do bootstrap WordPress
|   |-- cashback/
|   |-- cotacao/
|   |-- financeiro/
|   |-- miauw/
|   |-- tarefa/
|   |-- wp-admin/
|   |-- wp-content/
|   |-- wp-includes/
|   `-- wp-config.php
|-- .env.example
|-- docker-compose.yml
|-- AGENTS.md
`-- README.md
```

## Variaveis de ambiente

Variaveis esperadas em `.env`:

```text
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
WIMIFARMA_DB_HOST
WIMIFARMA_DB_USER
WIMIFARMA_DB_PASSWORD
WIMIFARMA_WP_DB_NAME
WIMIFARMA_APP_DB_NAME
RSSSL_KEY
WP_AUTH_KEY
WP_SECURE_AUTH_KEY
WP_LOGGED_IN_KEY
WP_NONCE_KEY
WP_AUTH_SALT
WP_SECURE_AUTH_SALT
WP_LOGGED_IN_SALT
WP_NONCE_SALT
WP_CACHE
WIMIFARMA_PUBLIC_PAGE_CACHE
MIAUW_OPENAI_API_KEY
MIAUW_OPENAI_MODEL
MIAUW_GUARDIAN_TOKEN
```

Nao colocar valores reais no README, em commits ou em issues publicas.

## Arquivos fora do Git

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`

## Deploy no VPS

O VPS atual usa Ubuntu/Oracle, PuTTY para terminal e WinSCP para arquivos.

Pasta observada no VPS:

```bash
/home/ubuntu/projetos/wimifarma-com
```

Quando o VPS estiver usando Git para este projeto, o fluxo padrao sera:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

Depois do deploy, a home publica deve provar que esta na versao certa:

```bash
curl -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl -I https://wimifarma.com/home.php
```

O header esperado e `X-Served-By: wimifarma-static-home`. Se `home.php` der 404 no dominio publico, o VPS/proxy ainda esta servindo uma copia antiga ou outro container.

Portas importantes:

- container/proxy interno: `wimifarma-com-web:80`
- bind local do Compose: `127.0.0.1:3002`
- tunel local do PuTTY usado em testes: `127.0.0.1:13002`
- publico: `80/443` via Nginx Proxy Manager

Nao misturar essas portas ao configurar proxy, DNS ou WordPress.

## Documentacao

- `AGENTS.md`: manual obrigatorio para futuras conversas do Codex/agentes.
- `docs/00-visao-geral.md`: visao geral e mapa funcional.
- `docs/01-arquitetura.md`: arquitetura tecnica.
- `docs/02-banco-de-dados.md`: bancos, tabelas e cuidados.
- `docs/03-fluxos-do-sistema.md`: fluxos de usuario e operacao.
- `docs/04-padroes-de-codigo.md`: padroes existentes.
- `docs/05-comandos.md`: comandos locais, VPS, auditoria e Git.
- `docs/06-pendencias.md`: backlog tecnico encontrado.
- `docs/07-historico-de-decisoes.md`: decisoes tecnicas importantes.
- `docs/08-autenticacao-e-permissoes.md`: login, sessao, roles e riscos.
- `docs/09-deploy-e-ambiente.md`: VPS, DNS, proxy, portas e deploy.
- `docs/10-integracoes.md`: OpenAI, Farmacia Popular, GoDaddy, NPM e Google Sheets futuro.
- `docs/11-seguranca.md`: segredos, headers, CSRF, riscos e hardening.
- `docs/15-logs-e-auditoria.md`: logs, auditoria e diagnostico.
- `docs/16-testes.md`: validacoes atuais e evolucao de testes.
- `docs/17-performance.md`: performance, cache e cuidados WordPress.
- `docs/18-miauby-evolucao-generativa.md`: direcao para skills, padroes e autonomia segura do Miauby.

Leia `AGENTS.md` antes de qualquer alteracao.
