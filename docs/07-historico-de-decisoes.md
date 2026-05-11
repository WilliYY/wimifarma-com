# 07 - Historico de decisoes

Este documento registra decisoes tecnicas importantes. Sempre que uma decisao for tomada, alterada ou substituida, registre data aproximada, decisao, motivo, arquivos/modulos impactados e riscos futuros.

## 2026-05-10 - Migrar projeto do HostGator para VPS com Docker

Decisao:

- Rodar o projeto em VPS Ubuntu/Oracle usando Docker Compose.

Motivo:

- Ganhar flexibilidade, controle de ambiente, deploy rastreavel e possibilidade de evoluir modulos internos.

Impacto:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `site/`
- `mysql/`

Riscos/cuidados:

- Preservar dados importados.
- Validar performance no VPS.
- Nao publicar MySQL.

## 2026-05-10 - Separar banco WordPress e banco dos apps internos

Decisao:

- Usar `wimifarma_wp` para WordPress e `wimifarma_app` para Cashback, Cotacao, Financeiro, Tarefas e Miauby.

Motivo:

- Reduzir acoplamento entre WordPress e ferramentas internas.

Impacto:

- `site/wp-config.php`
- `site/cashback/config.php`
- `docker/mysql/init/01-create-databases.sql`

Riscos/cuidados:

- Manter prefixo `wptl_` no WordPress.
- Nao misturar tabelas novas no banco errado.

## 2026-05-10 - Manter segredos fora do Git

Decisao:

- Versionar `.env.example`, mas nao `.env`, `config.local.php`, `mysql/`, dumps, backups ou plugins premium.

Motivo:

- Repositorio GitHub estava publico no inicio da organizacao e o projeto contem dados internos.

Impacto:

- `.gitignore`
- `.dockerignore`
- `site/miauw/config.local.example.php`
- `README.md`
- `AGENTS.md`

Riscos/cuidados:

- Conferir `git status` e diffs antes de commits.
- Nunca colar chaves reais em documentacao.

## 2026-05-10 - Nginx Proxy Manager como entrada publica

Decisao:

- Usar Nginx Proxy Manager no VPS para receber `80/443` e encaminhar `wimifarma.com` para `wimifarma-com-web:80`.

Motivo:

- Facilitar SSL Let's Encrypt e hospedar varios projetos no mesmo VPS.

Impacto:

- Configuracao externa do Nginx Proxy Manager.
- Rede Docker `wimifarma-com-network`.
- DNS GoDaddy.

Riscos/cuidados:

- Nao usar `127.0.0.1:13002` no proxy.
- Garantir que NPM esteja na rede do projeto.
- Aguardar DNS antes de emitir SSL.

## 2026-05-10 - GoDaddy deve gerenciar DNS do dominio

Decisao:

- Usar nameservers padrao da GoDaddy e configurar registros DNS diretamente la.

Motivo:

- Simplificar migracao sem depender dos nameservers antigos da HostGator.

Impacto:

- Registros `A @`, `CNAME www`, NS e TXT existentes.

Riscos/cuidados:

- Remover registros conflitantes como `Parked`.
- Aguardar propagacao.
- Validar com `dig` antes de SSL.

## 2026-05-10 - Desativar cache WordPress em localhost

Decisao:

- Evitar cache local por padrao em `127.0.0.1:3002`/`localhost:3002`.

Motivo:

- WordPress ficou lento/travado no Docker Desktop Windows com plugins/cache restaurados.

Impacto:

- `site/wp-config.php`
- Plugins de cache, especialmente SpeedyCache.

Riscos/cuidados:

- Reavaliar cache em producao depois de HTTPS e URLs corretas.

## 2026-05-10 - Documentacao como memoria longa do projeto

Decisao:

- Criar `README.md`, `AGENTS.md` e documentos em `docs/` como fonte oficial de contexto para futuras conversas.

Motivo:

- O historico antigo do chat ficou indisponivel e o projeto precisa continuar sem depender dele.

Impacto:

- `README.md`
- `AGENTS.md`
- `docs/`

Riscos/cuidados:

- Docs desatualizados causam decisoes ruins. Atualizar junto com mudancas relevantes.

## 2026-05-11 - WordPress reconhece HTTPS atras do Nginx Proxy Manager

Decisao:

- Configurar `site/wp-config.php` para marcar a requisicao como HTTPS quando o proxy enviar `X-Forwarded-Proto: https` ou `X-Forwarded-SSL: on`.

Motivo:

- O Apache recebe trafego HTTP interno do Nginx Proxy Manager. Sem esse ajuste, o WordPress pode gerar assets com `http://`, causando mixed content e tela sem CSS/JS no navegador.

Impacto:

- `site/wp-config.php`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Manter o Proxy Host do Nginx Proxy Manager enviando os headers padrao.
- Validar o HTML publico com `curl` para confirmar links `https://` em CSS e JS.

## 2026-05-11 - Redirect HTTPS publico tambem protegido por .htaccess

Decisao:

- Adicionar `site/.htaccess` com redirect HTTP -> HTTPS para hosts publicos, respeitando `X-Forwarded-Proto: https` e ignorando localhost.

Motivo:

- Mesmo com Force SSL ligado no Nginx Proxy Manager, `http://wimifarma.com` ainda respondeu 200 em testes. A regra no Apache cobre esse caso sem afetar o acesso local `127.0.0.1:3002`.

Impacto:

- `site/.htaccess`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Nao remover a condicao de `X-Forwarded-Proto`, pois HTTPS externo chega como HTTP interno ao Apache.
- Validar `curl -I http://wimifarma.com` apos deploy; deve retornar 301 para HTTPS.
