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

## 2026-05-11 - Apache deve permitir .htaccess no document root

Decisao:

- Configurar o Dockerfile para habilitar `AllowOverride All` em `/var/www/html`.

Motivo:

- O projeto depende de `site/.htaccess` para redirects HTTPS e regras WordPress. Se o Apache ignorar `.htaccess`, `http://wimifarma.com` pode continuar respondendo 200 e o navegador abrir a home como "Nao seguro".

Impacto:

- `docker/php/Dockerfile`
- `site/.htaccess`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Regras em `.htaccess` passam a valer no container; validar contra loops e manter excecao para localhost.

## 2026-05-11 - Hosts publicos devem forcar HTTPS no WordPress

Decisao:

- Configurar `site/wp-config.php` para tratar `wimifarma.com` e `www.wimifarma.com` como HTTPS e canonicalizar `WP_HOME`/`WP_SITEURL` para `https://wimifarma.com`.
- Definir `WP_CONTENT_URL` e `FORCE_SSL_ADMIN` para os hosts publicos.
- Adicionar um MU plugin para normalizar URLs publicas de tema/plugins para `https://wimifarma.com`.
- Canonicalizar `www.wimifarma.com` para `https://wimifarma.com` tambem no `.htaccess`.

Motivo:

- Mesmo com DNS, SSL e redirect funcionando, o HTML publico ainda podia sair com CSS/JS/imagens em `http://wimifarma.com/wp-content/...` quando o WordPress nao recebia ou nao reconhecia corretamente os headers do proxy. Isso quebrava o layout por mixed content.

Impacto:

- `site/.htaccess`
- `site/wp-config.php`
- `site/wp-content/mu-plugins/wimifarma-public-https.php`
- `docs/09-deploy-e-ambiente.md`

Riscos/cuidados:

- Esta regra e especifica para os hosts publicos. Manter excecao local para `127.0.0.1:3002` e `localhost:3002`.
- Se novos dominios publicos forem adicionados ao mesmo WordPress, incluir explicitamente na lista ou revisar a canonicalizacao.
- O MU plugin faz substituicao exata apenas dos dominios publicos conhecidos; nao usar para corrigir outros dominios sem revisar.

## 2026-05-11 - Page cache publico fica opt-in durante estabilizacao HTTPS

Decisao:

- Manter `WP_CACHE=false` por padrao durante a migracao.
- Em `wimifarma.com` e `www.wimifarma.com`, permitir cache de pagina somente se `WIMIFARMA_PUBLIC_PAGE_CACHE=true`.
- Definir `DONOTCACHEPAGE` para hosts publicos quando o cache estiver desligado.

Motivo:

- A home publica continuou retornando HTML com assets `http://wimifarma.com/wp-content/...` mesmo depois das correcoes de HTTPS. Como `advanced-cache.php` do SpeedyCache roda antes dos MU plugins quando `WP_CACHE` esta ativo, ele pode servir HTML estatico antigo e quebrar apenas a tela inicial por mixed content.

Impacto:

- `site/wp-config.php`
- `.env.example`
- `AGENTS.md`
- `README.md`
- `docs/01-arquitetura.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/11-seguranca.md`
- `docs/17-performance.md`

Riscos/cuidados:

- O VPS pode ter `advanced-cache.php`, `cache/` e `speedycache-config/` ignorados pelo Git; limpar ou mover esses arquivos runtime apos o deploy.
- Reativar cache publico somente depois de validar que a home nao possui assets `http://wimifarma.com/...`.
- Se houver necessidade de performance antes disso, medir primeiro e documentar a estrategia de cache.

## 2026-05-11 - Tema da home tambem normaliza URLs publicas para HTTPS

Decisao:

- Adicionar helpers HTTPS no tema `wimifarma-cashback-theme`.
- Gerar URLs de assets e links da home por helpers do tema.
- Adicionar filtros de URL e buffer de saida no frontend publico para substituir `http://wimifarma.com`/`www` por `https://wimifarma.com`.

Motivo:

- A home publica continuou visualmente quebrada e o HTML ainda continha assets `http://wimifarma.com/...` mesmo sem o header de SpeedyCache. Como a tela afetada e a home do tema, a correcao precisa existir tambem dentro do tema carregado pela pagina, nao apenas no MU plugin.

Impacto:

- `site/wp-content/themes/wimifarma-cashback-theme/functions.php`
- `site/wp-content/themes/wimifarma-cashback-theme/header.php`
- `site/wp-content/themes/wimifarma-cashback-theme/front-page.php`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Manter a correcao restrita aos hosts publicos `wimifarma.com` e `www.wimifarma.com`.
- Validar depois do deploy com `curl` que a home nao possui assets `http://wimifarma.com/...`.
- Se o erro persistir apos o deploy, o proxy pode estar apontando para outra pasta/container ou o VPS pode nao ter recebido o commit correto.

## 2026-05-11 - Raiz publica servida por home independente do WordPress

Decisao:

- Servir a rota `/` por `site/home.php` via `site/.htaccess`.
- Manter WordPress para `/wp-admin`, `/wp-login.php`, paginas legadas e assets, mas tirar a primeira tela publica do bootstrap WordPress durante a estabilizacao da migracao.

Motivo:

- A home publica continuou visualmente quebrada mesmo com CSS/JS respondendo 200, HTTPS ajustado e cache de pagina opt-in.
- Como apenas a primeira tela estava afetada, uma home independente com CSS embutido reduz a superficie de falha sem reescrever os modulos internos.

Impacto:

- `site/home.php`
- `site/.htaccess`
- `README.md`
- `AGENTS.md`
- `docs/01-arquitetura.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Se `X-Served-By: wimifarma-static-home` nao aparecer na rota `/`, o VPS/proxy nao esta servindo esta versao.
- A home WordPress original continua no tema, mas fica fora da rota publica raiz enquanto a regra estiver ativa.
- Para voltar a home ao WordPress, remover a regra de `site/home.php` somente apos validar cache, HTTPS e layout em producao.

## 2026-05-11 - Cache legado de HostGator nao deve ficar versionado

Decisao:

- Remover `site/wp-content/endurance-page-cache/_index.html` do Git.
- Ignorar `site/wp-content/endurance-page-cache/`.
- Tratar `https://wimifarma.com/home.php` retornando 404 como sinal de deploy/proxy desatualizado antes de novas refatoracoes visuais.

Motivo:

- O arquivo continha HTML estatico antigo da home WordPress quebrada, incluindo `wfwc-home-launchpad` e assets legados.
- A home corrigida esta em `site/home.php`; se o arquivo nao existe no dominio publico, o VPS ainda nao esta servindo o commit atual ou o Nginx Proxy Manager aponta para outra copia.

Impacto:

- `.gitignore`
- `site/wp-content/endurance-page-cache/_index.html`
- `AGENTS.md`
- `README.md`
- `docs/05-comandos.md`
- `docs/06-pendencias.md`
- `docs/09-deploy-e-ambiente.md`
- `docs/17-performance.md`

Riscos/cuidados:

- Nao apagar caches runtime do VPS sem preservar backup/quarentena quando houver duvida.
- Depois do deploy, validar `X-Served-By: wimifarma-static-home` em `/` e `/home.php`.
- Se o header aparecer no container mas nao no dominio, corrigir Nginx Proxy Manager em vez de mexer no tema.

## 2026-05-11 - Home publica reduzida para fundo visual e cards

Decisao:

- Remover da home standalone o hero textual, botoes principais, navegacao superior e painel central.
- Usar o video de cenario como fundo de tela inteira.
- Manter apenas logo e cards inferiores de acesso aos modulos.
- Fazer os tres GIFs decorativos se moverem pela tela e se afastarem suavemente do ponteiro, reaproveitando o padrao de movimento usado nos logins.

Motivo:

- O usuario decidiu que a home publica deve ser mais visual e servir como entrada simples para os sistemas internos, sem blocos explicativos redundantes.

Impacto:

- `site/home.php`
- `README.md`
- `AGENTS.md`
- `docs/03-fluxos-do-sistema.md`
- `docs/07-historico-de-decisoes.md`

Riscos/cuidados:

- Validar desktop e mobile, porque os GIFs ficam em posicao fixa e nao podem cobrir permanentemente os cards.
- Manter `prefers-reduced-motion` respeitado.
- Se novos elementos forem adicionados na home, preservar a regra de nao recriar o hero textual removido nesta decisao.

## 2026-05-11 - Miauby deve evoluir por skills controladas

Decisao:

- Registrar a direcao de evolucao do Miauby em `docs/18-miauby-evolucao-generativa.md`.
- Tratar novas capacidades generativas como skills com schema, permissao, auditoria e testes, antes de liberar automacao de escrita.

Motivo:

- O usuario quer que Miauby entenda padroes e seja mais generativo, mas isso precisa evoluir sem risco de escrita incorreta no banco ou aprendizado de padroes ruins.

Impacto:

- `docs/18-miauby-evolucao-generativa.md`
- `docs/10-integracoes.md`
- `docs/06-pendencias.md`

Riscos/cuidados:

- Nao adicionar tools soltas sem registry.
- Separar leitura, sugestao e escrita.
- Revisar memorias e padroes aprendidos antes de transformar em automacao.
