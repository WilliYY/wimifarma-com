# AGENTS.md - Wimifarma

Este arquivo e o manual obrigatorio para qualquer conversa futura do Codex/agentes neste projeto. Ele deve ser mantido atualizado sempre que arquitetura, banco, deploy, seguranca, fluxo de trabalho, integracoes ou regras importantes mudarem.

## Leitura obrigatoria antes de alterar arquivos

Antes de alterar qualquer arquivo, sempre ler:

- `AGENTS.md`
- `README.md`
- arquivos relevantes da pasta `docs/`

Para tarefas de arquitetura, banco, APIs, autenticacao, permissoes, seguranca, deploy, layout, modulos ou integracoes, leia primeiro o documento especifico em `docs/`.

## Regras permanentes

1. Antes de alterar qualquer arquivo, sempre ler `AGENTS.md`, `README.md` e os arquivos relevantes de `docs/`.
2. Nunca reescrever o projeto inteiro sem necessidade.
3. Fazer alteracoes pequenas, rastreaveis e reversiveis.
4. Preservar os padroes ja existentes no projeto, salvo quando houver motivo tecnico claro para alterar.
5. Nao versionar segredos, dumps, backups, volume MySQL, caches, relatorios gerados ou plugins premium ignorados pelo Git.
6. Nao apagar backups ou dados de migracao sem confirmacao clara; quando precisar limpar, mover para local seguro e registrar.
7. Atualizar a documentacao sempre que houver mudanca em:
   - arquitetura;
   - banco de dados;
   - APIs;
   - autenticacao;
   - permissoes;
   - regras de negocio;
   - seguranca;
   - deploy;
   - layout principal;
   - fluxos de usuario;
   - modulos internos;
   - integracoes externas;
   - comportamento importante do sistema.
8. Ao finalizar qualquer tarefa, informar:
   - arquivos alterados;
   - documentacao criada ou atualizada;
   - comandos executados;
   - testes, build ou lint realizados;
   - pendencias abertas;
   - riscos ou cuidados encontrados.

## Contexto atual

- Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle.
- O usuario acessa o VPS por PuTTY e os arquivos por WinSCP.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- O projeto local fica em `C:\Projetos\wimifarma-com`.
- No VPS, a pasta observada e `/home/ubuntu/projetos/wimifarma-com`.
- Backups/dumps antigos foram movidos para fora do projeto local em `C:\Projetos\wimifarma-com-backups-local-20260510`.
- Trate o repositorio como publico enquanto nao houver decisao diferente; nao exponha segredos em commits.

## Stack e estrutura

- Docker Compose com `wimifarma-com-web` e `wimifarma-com-db`.
- PHP 8.3 + Apache.
- MySQL 8.0.
- WordPress na raiz `site/`.
- Home publica da raiz `/` servida por `site/home.php` via `site/.htaccess` durante a estabilizacao da migracao; a primeira tela usa fundo visual em tela inteira, cards inferiores de acesso e GIFs decorativos com o mesmo padrao de movimento dos logins.
- Modulos internos PHP puro:
  - `site/cashback`
  - `site/cotacao`
  - `site/financeiro`
  - `site/tarefa`
  - `site/miauw`
- Banco WordPress: `wimifarma_wp`, prefixo `wptl_`.
- Banco dos apps: `wimifarma_app`.

## Portas e proxy

Nao misturar portas:

- `wimifarma-com-web:80`: destino correto dentro da rede Docker para o Nginx Proxy Manager.
- `127.0.0.1:3002`: porta local do Compose no VPS/local.
- `127.0.0.1:13002`: tunel local do PuTTY usado em testes no Windows.
- `80/443`: portas publicas do Nginx Proxy Manager.

O Proxy Host de `wimifarma.com` e `www.wimifarma.com` deve apontar para:

```text
scheme: http
forward hostname: wimifarma-com-web
forward port: 80
```

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
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`

Cache de pagina WordPress/SpeedyCache deve ficar opt-in durante a migracao:

- `WP_CACHE=false` por padrao;
- hosts publicos `wimifarma.com` e `www.wimifarma.com` so ativam page cache com `WIMIFARMA_PUBLIC_PAGE_CACHE=true`;
- se a home publica sair com assets `http://wimifarma.com/wp-content/...`, investigar e limpar `site/wp-content/advanced-cache.php`, `site/wp-content/cache/` e `site/wp-content/speedycache-config/`.

O Miauby pode carregar a chave por:

- `site/miauw/config.local.php`, ou
- `MIAUW_OPENAI_API_KEY` no `.env`.

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

## Auditoria antes de encerrar alteracoes

Rode pelo menos:

```powershell
docker compose ps
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php -l /var/www/html/cashback/config.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/cashback/login.php
curl.exe -L --max-time 30 -o NUL -w "status=%{http_code} time=%{time_total} url=%{url_effective}`n" http://127.0.0.1:3002/miauw/widget-status.php
docker compose logs --tail=80 wimifarma-com-web
```

Quando mexer em front-end ou fluxo visivel, abrir no navegador e validar visualmente.

## Estado validado em 2026-05-10

- Containers sobem com Docker Compose.
- Banco local importado do HostGator para `mysql/`.
- `wimifarma_app` possui tabelas `wf_*`, `cotacao_*`, `financeiro_*` e `miauw_*`.
- `wimifarma_wp` possui tabelas WordPress `wptl_*`.
- `site/miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava presente.
- `cashback/login.php`, `cotacao/login.php`, `financeiro/login.php`, `tarefa/login.php` e `miauw/login.php` responderam 200.
- `cotacao/api.php` respondeu 401 sem sessao, esperado.
- WordPress raiz e `wp-login.php` responderam 200, porem lentos no Docker Desktop Windows com plugins restaurados.
- WordPress local exigiu ajuste para `WP_HOME/WP_SITEURL` em `localhost:3002`.
- Cache WordPress/SpeedyCache ficou opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A home publica `/` ficou desacoplada do WordPress por `site/home.php` e regra em `site/.htaccess`, porque a primeira tela continuou quebrando visualmente mesmo com CSS/JS respondendo 200.
- `endurance-page-cache.php`, mu-plugin especifico de HostGator, foi movido para quarentena fora do projeto.
- `.dockerignore` limita o contexto de build a `docker/php/Dockerfile`, evitando envio de `.env`, `mysql/` e backups ao Docker.

Se a lentidao do WordPress repetir no VPS Linux, investigar primeiro plugins/cache/tema antes de mudar DNS definitivo.

Se o dominio publico continuar mostrando a home antiga com `wfwc-home-launchpad`, valide antes de refatorar:

- `https://wimifarma.com/home.php` deve existir e responder com `X-Served-By: wimifarma-static-home`.
- `/` deve responder com `X-Served-By: wimifarma-static-home`.
- Se `/home.php` retornar 404 no publico, o VPS/proxy nao esta servindo o commit atual ou esta apontando para outra pasta/container.
- Cache antigo de HostGator em `site/wp-content/endurance-page-cache/` nao deve ser versionado nem usado em producao.

## Deploy no VPS

Depois de commitar e enviar para GitHub, se o VPS ja estiver usando Git neste projeto:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
```

Se for primeiro clone em uma pasta nova:

```bash
cd /home/ubuntu/projetos
git clone https://github.com/WilliYY/wimifarma-com.git wimifarma-com-git
cd wimifarma-com-git
cp .env.example .env
nano .env
docker compose up -d --build
```

Antes de substituir a pasta atual do VPS por uma pasta clonada, preservar `.env`, `mysql/`, arquivos locais de configuracao e backups.

## Direcao futura: Cotacao + Google Sheets

Objetivo do usuario: transformar a cotacao em uma ferramenta forte, espelhada com Google Sheets.

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
- Evoluir Miauby por skills controladas, registry de ferramentas, auditoria e revisao de padroes; veja `docs/18-miauby-evolucao-generativa.md`.

Evite sincronizacao por string solta. Use API estruturada do Google Sheets quando conector/credencial estiver definido.

## Fluxo de trabalho esperado

- Ler contexto e documentacao antes de agir.
- Fazer uma auditoria curta antes de editar.
- Para problemas visuais apenas na home publica, verificar primeiro `site/home.php` e `site/.htaccess`; WordPress continua responsavel por `/wp-admin`, posts e rotas legadas.
- Alterar pouco por vez.
- Rodar validacoes proporcionais ao risco.
- Atualizar docs quando qualquer comportamento importante mudar.
- Ao final, se houve alteracao de arquivo, preparar commit e orientar o comando de PuTTY para atualizar o VPS.

## Relatorio final obrigatorio

Ao finalizar, responder em portugues com:

- arquivos alterados;
- documentacao criada/atualizada;
- comandos executados;
- testes/build/lint realizados;
- pendencias abertas;
- riscos/cuidados encontrados;
- comando sugerido para o PuTTY quando houver deploy.
