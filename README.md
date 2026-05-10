# wimifarma-com

Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle, rodando com Docker.

Estado base documentado em 2026-05-10.

## Stack

- PHP 8.3 com Apache
- MySQL 8.0
- WordPress na raiz de `site/`
- Modulos internos em PHP puro dentro de `site/`
- Docker Compose em `docker-compose.yml`

## Modulos principais

- `site/`: WordPress e raiz publica do dominio.
- `site/cashback/`: sistema de cashback/clientes/compras/resgates.
- `site/cotacao/`: sistema de cotacao. Deve evoluir para sincronizacao forte com Google Sheets.
- `site/financeiro/`: financeiro interno.
- `site/tarefa/`: tarefas internas.
- `site/miauw/`: Miauby, assistente interno com API OpenAI.

## Banco de dados

O Compose cria dois bancos:

- `wimifarma_wp`: WordPress, prefixo `wptl_`.
- `wimifarma_app`: modulos internos, incluindo cashback, cotacao, financeiro e Miauby.

No ambiente local atual, os dumps do HostGator ja foram importados no volume `mysql/`, que fica ignorado pelo Git.

## Rodar local

1. Configure os segredos locais:

```powershell
Copy-Item .env.example .env
```

Depois edite `.env` com as senhas reais do ambiente.

2. Configure o Miauby:

- Opcao A: criar `site/miauw/config.local.php` a partir de `site/miauw/config.local.example.php`.
- Opcao B: definir `MIAUW_OPENAI_API_KEY` no `.env`.

3. Suba os containers:

```powershell
docker compose up -d --build
```

4. Acesse:

- WordPress: http://127.0.0.1:3002/
- Cashback: http://127.0.0.1:3002/cashback/login.php
- Cotacao: http://127.0.0.1:3002/cotacao/login.php
- Financeiro: http://127.0.0.1:3002/financeiro/login.php
- Tarefas: http://127.0.0.1:3002/tarefa/login.php
- Miauby: http://127.0.0.1:3002/miauw/login.php

5. Verificacoes rapidas:

```powershell
docker compose ps
curl.exe -L http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -L http://127.0.0.1:3002/cashback/login.php
```

## Estado da auditoria em 2026-05-10

- Docker Compose subiu `wimifarma-com-db` e `wimifarma-com-web`.
- Banco local importado: `wimifarma_app` com 36 tabelas e `wimifarma_wp` com 21 tabelas.
- Dados principais encontrados: 1 usuario interno, 242 itens de cotacao e 286 mensagens do Miauby.
- `miauw/widget-status.php` respondeu `api_ready: true`.
- Login de Cashback, Cotacao, Financeiro, Tarefas e Miauby respondeu HTTP 200.
- `cotacao/api.php` respondeu HTTP 401 sem sessao, comportamento esperado.
- WordPress raiz e `wp-login.php` responderam HTTP 200, mas ficaram lentos no Docker Desktop Windows com a lista de plugins restaurada do HostGator.
- O mu-plugin `endurance-page-cache.php`, especifico de HostGator, foi colocado em quarentena fora do projeto.

Ponto de atencao: se a lentidao do WordPress tambem aparecer no VPS Linux, priorizar limpeza/revisao de plugins e cache antes de mudar DNS definitivo.

## Restaurar banco local se o volume sumir

Os backups foram movidos para fora da raiz do projeto:

```text
C:\Projetos\wimifarma-com-backups-local-20260510
```

Com os containers rodando e os arquivos de backup presentes nesse caminho, importe:

```powershell
docker run --rm -v "C:\Projetos\wimifarma-com-backups-local-20260510:/backups:ro" --network wimifarma-com-network mysql:8.0 sh -c "mysql -h wimifarma-com-db -uwimifarma_user -p$MYSQL_PASSWORD wimifarma_app < /backups/backup-hostgator-milen645-cashback-2026-05-09.sql"

docker run --rm -v "C:\Projetos\wimifarma-com-backups-local-20260510:/backups:ro" --network wimifarma-com-network mysql:8.0 sh -c "mysql -h wimifarma-com-db -uwimifarma_user -p$MYSQL_PASSWORD wimifarma_wp < /backups/backup-hostgator-milen645-wp357-2026-05-09.sql"
```

No Windows local, se a variavel nao estiver no shell, substitua `$MYSQL_PASSWORD` pela senha do `.env`.

## Segredos e arquivos fora do Git

Este repositorio esta publico no GitHub no momento em que este README foi criado. Mesmo sendo projeto interno, nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache do WordPress
- plugins premium `*-pro` e `loginizer-security`

O arquivo `.env.example` documenta as variaveis sem valores reais.

## Deploy no VPS via PuTTY

No servidor Ubuntu, depois que as alteracoes estiverem no GitHub:

```bash
cd /var/www/wimifarma-com
git pull origin main
cp -n .env.example .env
nano .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

Se for o primeiro deploy via Git:

```bash
sudo mkdir -p /var/www
cd /var/www
git clone https://github.com/WilliYY/wimifarma-com.git
cd wimifarma-com
cp .env.example .env
nano .env
docker compose up -d --build
```

Importante: o Compose publica o Apache em `127.0.0.1:3002`. Em producao, o dominio deve apontar para um proxy web no VPS, como Nginx/Caddy/Traefik, que encaminhe `wimifarma.com` para `127.0.0.1:3002`.

## DNS GoDaddy

Quando o VPS estiver validado:

- Registro `A` de `@` apontando para o IP publico do VPS.
- Registro `A` de `www` apontando para o IP publico do VPS, ou `CNAME www -> @`.
- TTL baixo durante migracao, por exemplo 600 segundos.
- Depois confirmar SSL/HTTPS no proxy do VPS antes de considerar finalizado.

## Direcao futura da cotacao

A area de cotacao deve virar uma ferramenta forte, com sincronizacao bidirecional e confiavel com Google Sheets:

- Importar e atualizar itens mantendo IDs estaveis.
- Detectar conflitos entre sistema e planilha.
- Registrar auditoria de cada alteracao.
- Permitir atualizacao em lote sem perder formatacao.
- Espelhar status, fornecedor, preco, observacoes e categorias.
- Ter jobs de sincronizacao e tela de diagnostico.
- Usar Miauby para resumir divergencias, pendencias e oportunidades.

Antes de implementar essa parte, mapear as tabelas `cotacao_*`, definir fonte de verdade por campo e escolher o mecanismo de autenticacao do Google Sheets.
