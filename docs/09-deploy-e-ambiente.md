# 09 - Deploy e ambiente

## O que esta parte do sistema faz

Documenta como o projeto roda no local e no VPS, incluindo Docker, proxy, DNS, portas e cuidados de deploy.

## Ambientes conhecidos

Local Windows:

- Pasta: `C:\Users\Thiesen\Desktop\wimifarma-com`
- Acesso: `http://127.0.0.1:3002/`
- Docker Desktop

VPS Ubuntu/Oracle:

- Pasta oficial do projeto: `/home/ubuntu/projetos/wimifarma-com`
- Acesso por terminal: PuTTY
- Acesso automatizado do Codex: SSH/plink com chave local autorizada, para executar deploy diretamente e relatar o resultado sem mandar comando PuTTY equivalente ao usuario.
- Arquivos: WinSCP
- Proxy: Nginx Proxy Manager
- IP publico usado no DNS: `146.181.58.208`

Higiene de pastas no VPS:

- A pasta oficial e unica para deploy deve ser `/home/ubuntu/projetos/wimifarma-com`.
- Copias criadas durante migracao, como `wimifarma-com-git`, `wimifarma-com-code-*` ou `wimifarma-com-runti*`, devem ser tratadas como temporarias ate auditoria.
- Antes de mover qualquer pasta, conferir se ela nao e a origem montada nos containers atuais, se nao guarda `.env`, `mysql/`, `cotacao-data/`, backups ou `config.local.php` unicos.
- Pastas paradas devem ser movidas para uma quarentena de arquivo, como `/home/ubuntu/projetos/_arquivados-wimifarma/AAAA-MM-DD/`, e nao apagadas diretamente.
- Depois da organizacao, o WinSCP deve mostrar a operacao ativa concentrada em `wimifarma-com`, com copias antigas guardadas dentro de `_arquivados-wimifarma`.
- Em 2026-05-16, durante deploy do Miauby, o `wimifarma-com-db` foi encontrado em restart porque o `mysql/` oficial estava incompleto e sem `ibdata1`. O diretorio invalido foi movido para `/home/ubuntu/projetos/wimifarma-com/mysql-invalid-20260516113246`, e o `mysql/` oficial foi restaurado de `/home/ubuntu/projetos/wimifarma-com-runtime-disabled-2026-05-14-170039/mysql`. Preservar ambos ate decisao explicita.

## Arquivos e servicos envolvidos

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `apps/cashback/`
- `apps/cotacao/`
- `apps/core-auth/`
- `apps/gestao/`
- `apps/pedidos/`
- `apps/tarefa/`
- `apps/codigos/`
- `apps/financeiro/`
- `apps/usuarios/`
- `apps/miauw-agent/`
- `apps/miauw-whatsapp/`
- `ops/evolution/`
- `.env`
- `.env.example`
- `site/wp-config.php`
- `site/.htaccess`
- `site/home.php`
- `site/miauw/agent-context.php`
- `site/wp-content/mu-plugins/wimifarma-public-https.php`
- `site/wp-content/themes/wimifarma-cashback-theme/functions.php`
- `site/wp-content/themes/wimifarma-cashback-theme/header.php`
- `site/wp-content/themes/wimifarma-cashback-theme/front-page.php`
- `site/wp-content/advanced-cache.php`
- `site/wp-content/endurance-page-cache/`
- `site/wp-content/cache/`
- `site/wp-content/speedycache-config/`
- `cotacao-data/`
- `cashback-data/`
- `core-data/`
- `gestao-data/`
- `tarefa-data/`
- `xp-data/`
- `codigos-data/`
- `financeiro-data/`
- `miauw-whatsapp-data/`
- `/home/ubuntu/projetos/wimifarma-evolution-api` no VPS, com `.env`, Postgres, Redis e instancias da Evolution API fora do Git
- Nginx Proxy Manager externo a este repositorio
- GoDaddy DNS externo a este repositorio

## Portas

- `wimifarma-com-web:80`: porta interna correta para o proxy Docker.
- `wimifarma-cashback-app:4000`: servico interno oficial do Cashback, acessado pelo Apache por proxy reverso em `/cashback`.
- `wimifarma-cotacao-app:3000`: servico interno da Cotacao V2, acessado pelo Apache por proxy reverso em `/cotacao`.
- `wimifarma-gestao-app:3200`: servico interno da Gestao, acessado pelo Apache por proxy reverso em `/gestao`.
- `wimifarma-pedidos-app:3300`: servico interno de Pedidos, acessado pelo Apache por proxy reverso em `/pedidos`.
- `wimifarma-tarefa-app:3500`: servico interno de Tarefa, acessado pelo Apache por proxy reverso em `/tarefa`.
- `wimifarma-xp-app:3600`: servico interno oficial do XP, acessado pelo Apache por proxy reverso em `/xp`.
- `wimifarma-codigos-app:3700`: servico interno oficial de Codigos, acessado pelo Apache por proxy reverso em `/codigos`.
- `wimifarma-financeiro-app:3800`: servico interno oficial do Financeiro, acessado pelo Apache por proxy reverso em `/financeiro`.
- `wimifarma-usuarios-app:3900`: servico interno oficial de Usuarios, acessado pelo Apache por proxy reverso em `/usuarios`.
- `wimifarma-miauw-agent:3100`: servico interno do Miauby agente em modo sombra/corte controlado, acessado pelo Apache por proxy reverso em `/miauw/agent`.
- `wimifarma-miauw-whatsapp:3400`: servico interno do bridge WhatsApp do Miauby, acessado pelo Apache por proxy reverso em `/miauw/whatsapp`.
- `wimifarma-evolution-api:8080`: Evolution API interna para envio de mensagens do bridge, em stack separada; bind externo apenas em `127.0.0.1:8080`.
- `127.0.0.1:3002`: porta local publicada pelo Compose.
- `127.0.0.1:13002`: tunel PuTTY usado em testes.
- `80/443`: publico via Nginx Proxy Manager.
- `81`: painel Nginx Proxy Manager observado no VPS.

## Regras que precisam ser preservadas

- Nao expor MySQL publicamente.
- Nao usar porta de tunel no proxy publico.
- Manter o Nginx Proxy Manager enviando `X-Forwarded-Proto: https` para o Apache.
- Manter `site/wp-config.php` reconhecendo HTTPS atras do proxy para evitar CSS/JS com `http://`.
- Para hosts publicos `wimifarma.com` e `www.wimifarma.com`, manter `site/wp-config.php` forcando HTTPS e canonicalizando `WP_HOME`/`WP_SITEURL` para `https://wimifarma.com`.
- Manter `site/wp-content/mu-plugins/wimifarma-public-https.php` ativo para normalizar URLs publicas de tema/plugins para `https://wimifarma.com`.
- Manter a camada de normalizacao HTTPS no tema `wimifarma-cashback-theme`, porque a home depende do tema e pode continuar quebrada se algum arquivo runtime impedir o MU plugin de atuar.
- Manter cache de pagina WordPress/SpeedyCache desligado por padrao durante a migracao.
- Em hosts publicos, ativar page cache somente com `WIMIFARMA_PUBLIC_PAGE_CACHE=true` depois que o HTML publico nao contiver assets `http://wimifarma.com/...`.
- Quando aparecer home sem CSS/JS por mixed content, limpar ou mover `advanced-cache.php`, `cache/` e `speedycache-config/` antes de culpar tema ou proxy.
- Manter `site/.htaccess` redirecionando HTTP publico para HTTPS sem afetar `127.0.0.1:3002`.
- Manter `site/.htaccess` servindo `/` por `site/home.php` enquanto a home WordPress nao estiver validada em producao.
- `site/home.php` deve responder com header `X-Served-By: wimifarma-static-home`; se esse header nao aparecer no VPS, o proxy/container provavelmente nao esta servindo esta versao.
- `https://wimifarma.com/home.php` nao pode retornar 404 depois do deploy; se retornar, o commit com `site/home.php` nao chegou ao destino publico ou o proxy aponta para outra copia.
- `site/wp-content/endurance-page-cache/` e cache legado de HostGator e nao deve ser versionado nem preservado como fonte da home.
- Manter `docker/php/Dockerfile` com `AllowOverride All` para que o Apache leia `site/.htaccess`.
- Manter o proxy Apache de `/cashback/` para `wimifarma-cashback-app:4000`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. `site/cashback` preserva assets e helpers PHP ainda usados pelo Miauby; financeiro antigo dentro de Cashback fica arquivado em `site/_legacy-disabled/2026-05-29/cashback-financeiro-php/`.
- Manter o proxy Apache de `/cotacao/` para `wimifarma-cotacao-app:3000`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter o proxy Apache de `/gestao/` para `wimifarma-gestao-app:3200`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter o proxy Apache de `/pedidos/` para `wimifarma-pedidos-app:3300`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Pedidos e Gestao sao modulos separados. A rota antiga `/gestao/pedidos` e o endpoint antigo `/gestao/api/orders/badge` ficam somente como compatibilidade/redirecionamento para `/pedidos/` e `/pedidos/api/badge`.
- Manter o proxy Apache de `/tarefa/` para `wimifarma-tarefa-app:3500`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. O PHP legado em `site/tarefa` nao deve voltar a ser fonte oficial sem rollback deliberado.
- Manter o proxy Apache de `/xp/` para `wimifarma-xp-app:3600`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. `site/xp` fica apenas como assets/uploads; o PHP antigo fica em `site/_legacy-disabled/2026-05-29/xp-php/`.
- Manter o proxy Apache de `/codigos/` para `wimifarma-codigos-app:3700`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. `site/codigos` fica apenas como assets; o PHP antigo fica em `site/_legacy-disabled/2026-05-29/codigos-php/`.
- Manter o proxy Apache de `/financeiro/` para `wimifarma-financeiro-app:3800`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. O PHP legado em `site/financeiro` fica apenas como fallback historico/assets e nao deve voltar a ser fonte oficial sem rollback deliberado.
- Manter o proxy Apache de `/usuarios/` para `wimifarma-usuarios-app:3900`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`. O modulo usa `wimifarma_core` e nao deve ser publicado direto fora do Apache.
- Manter o proxy Apache de `/miauw/agent/` para `wimifarma-miauw-agent:3100`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`.
- Manter o proxy Apache de `/miauw/whatsapp/` para `wimifarma-miauw-whatsapp:3400`; o Nginx Proxy Manager continua apontando somente para `wimifarma-com-web:80`, e o painel `/miauw/whatsapp/` deve mostrar apenas dados seguros.
- Manter a Evolution API fora do Nginx Proxy Manager por padrao; usar API interna `http://wimifarma-evolution-api:8080` e porta local `127.0.0.1:8080` apenas para operacao controlada.
- Manter `.env` local em cada ambiente.
- Manter a pasta oficial do VPS como `/home/ubuntu/projetos/wimifarma-com`; nao voltar a operar a partir de clones temporarios depois da consolidacao.
- Definir `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET` no `.env` de cada ambiente antes de subir a Cotacao V2.
- Definir `CORE_POSTGRES_PASSWORD` no `.env` de cada ambiente antes de usar o core de autenticacao em Postgres. Antes de subir apps com provider `core`, rodar o migrador `wimifarma-core-migrator` para sincronizar `wf_users`.
- Para Cashback, definir `CASHBACK_POSTGRES_PASSWORD` e `CASHBACK_SESSION_SECRET` no `.env` de cada ambiente. O app usa `core_users` como login unico; nao ha `CASHBACK_AUTH_PROVIDER`, `mysql2`, importador, espelho, logs ou fallback MySQL desde 2026-05-30. `CASHBACK_INTERNAL_TOKEN` pode reutilizar `MIAUW_GUARDIAN_TOKEN` para o Miauby consultar endpoints internos; sem token, `/cashback/internal/*` e `/cashback/api/internal/*` devem recusar. Rollback MySQL exige restaurar commit/imagem anterior e backup validado.
- A Cotacao usa `core_users` como login unico desde 2026-05-29; o servico nao recebe mais variaveis MySQL nem `COTACAO_AUTH_PROVIDER`. Para rollback desse corte, voltar o commit ou imagem anterior e rebuildar `wimifarma-cotacao-app`, nao apenas trocar `.env`. `COTACAO_CORE_AUTH_TIMEOUT_MS` controla o timeout do Postgres do core.
- Definir `GESTAO_POSTGRES_PASSWORD` e `GESTAO_SESSION_SECRET` no `.env` de cada ambiente antes de subir a Gestao Node/Postgres.
- A Gestao usa `core_users` como login unico; desde 2026-05-30 nao ha `GESTAO_AUTH_PROVIDER`, `GESTAO_AUTH_MYSQL_FALLBACK_ENABLED`, `GESTAO_CORE_AUTH_SHADOW_ENABLED`, `mysql2`, importador ou espelho `wf_logs` no app. Rollback MySQL exige restaurar commit/imagem anterior e backup/importacao validada, nao trocar `.env`.
- Definir `PEDIDOS_SESSION_SECRET` no `.env` de cada ambiente antes de subir Pedidos; se faltar, o servico usa fallback operacional, mas producao deve ter segredo proprio.
- `PEDIDOS_INTERNAL_TOKEN` pode reutilizar `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN` para expor `GET /pedidos/api/internal/arrival-summary` e `POST /pedidos/api/internal/confirm-arrival` ao Miauby WhatsApp. Sem token, esses endpoints recusam e a rotina n8n de chegada de pedidos nao executa baixa.
- Pedidos usa `core_users` como login unico. O servico nao recebe mais `PEDIDOS_AUTH_PROVIDER`, `PEDIDOS_AUTH_MYSQL_FALLBACK_ENABLED`, `PEDIDOS_CORE_AUTH_SHADOW_ENABLED` nem variaveis `MYSQL_*`; opcionalmente ajustar apenas `PEDIDOS_CORE_AUTH_TIMEOUT_MS` para timeout do Postgres core. Rollback MySQL exigiria reintroduzir codigo/config em nova mudanca controlada.
- Definir `TAREFA_POSTGRES_PASSWORD` e `TAREFA_SESSION_SECRET` no `.env` de cada ambiente antes de subir Tarefa; se faltar, o servico usa fallback operacional, mas producao deve ter segredo proprio.
- Tarefa usa `core_users` como login unico e `wimifarma_tarefa` como fonte oficial. Desde 2026-05-30 nao ha `TAREFA_AUTH_PROVIDER`, `TAREFA_CORE_AUTH_SHADOW_ENABLED`, flags `TAREFA_LEGACY_MYSQL_*`, importador, espelho, fallback `wf_users` ou dependencia `mysql2`; `/tarefa/health` deve indicar `auth.provider=core` e `storage.provider=postgres`. Rollback MySQL exige restaurar versao anterior e backup validado.
- `TAREFA_INTERNAL_TOKEN` libera endpoints internos do Tarefa, incluindo criacao de tarefa privada por `/usuarios/`; pode reaproveitar `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN` se o ambiente ja usa um desses segredos. Sem token, tarefa privada por Usuarios recusa com `internal_token_not_configured`.
- Para XP, definir `XP_POSTGRES_PASSWORD` e `XP_SESSION_SECRET` no `.env` de cada ambiente. `XP_AUTH_PROVIDER=core` usa `core_users` como login oficial. `XP_LEGACY_MYSQL_IMPORT_ENABLED=false`, `XP_LEGACY_MYSQL_MIRROR_ENABLED=false` e `XP_LEGACY_MYSQL_LOGS_ENABLED=false` sao o padrao desde 2026-05-30; rollback MySQL exige religar flags/provedor e reintroduzir credenciais MySQL explicitamente.
- Para Codigos, definir `CODIGOS_POSTGRES_PASSWORD` e `CODIGOS_SESSION_SECRET` no `.env` de cada ambiente. `CODIGOS_AUTH_PROVIDER=core` usa `core_users` como login oficial. `CODIGOS_INTERNAL_TOKEN` pode reutilizar `MIAUW_GUARDIAN_TOKEN` para o Miauby consultar `/codigos/api/internal/summary` e `/codigos/api/internal/search` direto no Postgres; sem token, essas rotas recusam. `CODIGOS_LEGACY_MYSQL_IMPORT_ENABLED=false`, `CODIGOS_LEGACY_MYSQL_MIRROR_ENABLED=false` e `CODIGOS_LEGACY_MYSQL_LOGS_ENABLED=false` sao o padrao desde 2026-05-30; rollback MySQL exige religar flags/provedor e reintroduzir credenciais MySQL explicitamente.
- Para Financeiro, definir `FINANCEIRO_POSTGRES_PASSWORD`, `FINANCEIRO_SESSION_SECRET` e, quando necessario, `FINANCEIRO_REOPEN_PASSWORD` no `.env` de cada ambiente. `FINANCEIRO_AUTH_PROVIDER=core` usa `core_users` como login oficial; rollback de autenticacao exige voltar `FINANCEIRO_AUTH_PROVIDER=mysql` e reintroduzir credenciais MySQL. `FINANCEIRO_INTERNAL_TOKEN` pode reutilizar `MIAUW_GUARDIAN_TOKEN` para o Miauby/WhatsApp gravar por endpoints internos Node/Postgres; sem token, `/financeiro/api/internal/*` e `/financeiro/internal/*` devem recusar. `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED=false` e `FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED=false` sao o padrao desde 2026-05-29; ligar essas flags e rollback manual, nao deploy normal.
- Para Usuarios, definir `USUARIOS_SESSION_SECRET` no `.env` de cada ambiente e, se possivel, `USUARIOS_PASSWORD_VAULT_KEY` para o cofre administrativo de senhas redefinidas pelo ADM. O app usa `CORE_POSTGRES_PASSWORD` para gravar `core_users`, `core_user_module_permissions`, `core_user_xp_links`, `core_user_admin_passwords`, `core_user_whatsapp_links`, `core_user_audit_events` e `usuarios_sessions`, e usa `XP_POSTGRES_PASSWORD` para listar funcionarios do XP no vinculo. Para delegar tarefas privadas e vincular WhatsApp, configurar `USUARIOS_TAREFA_INTERNAL_BASE_URL`, `USUARIOS_TAREFA_INTERNAL_TOKEN`, `USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL`, `USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN` e, opcionalmente, `USUARIOS_INTERNAL_HTTP_TIMEOUT_MS`; quando os tokens especificos estiverem vazios, o app tenta reutilizar `TAREFA_INTERNAL_TOKEN`, `MIAUW_WHATSAPP_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN` ou `MIAUW_AGENT_INTERNAL_TOKEN`.
- Para comandos da Gestao pelo Miauby, manter `GESTAO_INTERNAL_TOKEN` preenchido nos servicos web e Gestao, ou usar `MIAUW_GUARDIAN_TOKEN` como fallback; o PHP chama `GESTAO_INTERNAL_BASE_URL` internamente e a Gestao rejeita `/gestao/api/internal/...` sem token.
- Para backup/restore da Cotacao V2, manter `COTACAO_BACKUP_DIR=/app/backups` e o volume `./cotacao-data/backups:/app/backups`.
- Para Google Sheets, configurar `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_RANGE` e credencial em `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`.
- A senha operacional para excluir tabelas inteiras em Codigos e `wimifarma` por padrao e pode ser trocada por `CODIGOS_GROUP_DELETE_PASSWORD` no `.env` de cada ambiente.
- Para o Miauby agente sombra, definir `MIAUW_AGENT_INTERNAL_TOKEN` ou manter `MIAUW_GUARDIAN_TOKEN` como fallback; o endpoint publico de health nao exige token, mas `run` e `stream` internos exigem.
- Para o Miauby WhatsApp, definir `MIAUW_WHATSAPP_POSTGRES_PASSWORD`, `MIAUW_WHATSAPP_WEBHOOK_TOKEN`, `MIAUW_WHATSAPP_ENCRYPTION_KEY`, `MIAUW_WHATSAPP_ALLOWED_SENDERS`, `MIAUW_WHATSAPP_PROVIDER`, `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` antes de usar webhook real. Com `MIAUW_WHATSAPP_PROVIDER=evolution`, preencher `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_API_INSTANCE`. Com `MIAUW_WHATSAPP_PROVIDER=meta`, preencher `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_APP_SECRET` e, se necessario, `META_WHATSAPP_GRAPH_API_VERSION`. O default versionado continua `MIAUW_WHATSAPP_ENABLED=false`; no VPS, a ativacao pode ser feita por `.env` e validada em `/miauw/whatsapp/health` e, com login, em `/miauw/whatsapp/login`.
- Para n8n no Miauby WhatsApp, preencher `MIAUW_WHATSAPP_N8N_ENABLED=true`, `MIAUW_WHATSAPP_N8N_BASE_URL`, `MIAUW_WHATSAPP_N8N_WEBHOOK_BASE_URL` e `MIAUW_WHATSAPP_N8N_WEBHOOK_SECRET` quando a stack estiver pronta. A rotina `Chegada de pedidos` usa `MIAUW_WHATSAPP_PEDIDOS_INTERNAL_BASE_URL` para consultar Pedidos, e o toggle de ativar/desativar fica no painel `/miauw/whatsapp/`.
- Para sincronizar Miauby WhatsApp com o Miauby interno, manter `MIAUW_WHATSAPP_CONTEXT_URL` apontando para `http://wimifarma-com-web/miauw/agent-context.php` e garantir que `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` esteja presente tambem no web/PHP e no bridge. Esse endpoint entrega treino/perfil/tools para o core, nao segredo nem escrita direta.
- Para confirmar acoes por WhatsApp, manter `MIAUW_WHATSAPP_ACTIONS_URL=http://wimifarma-com-web/miauw/agent-actions.php`. O Git deixa `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=false`; em producao, ligar apenas com allowlist revisada, `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST` curta e `MIAUW_WHATSAPP_ACTOR_USER_ID` apontando para um usuario interno de auditoria.
- Para a Evolution API no VPS, copiar `ops/evolution/docker-compose.yml` e `ops/evolution/.env.example` para `/home/ubuntu/projetos/wimifarma-evolution-api`, gerar segredos reais no `.env` local, subir com `docker compose up -d` e apontar o `.env` principal para `EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080`. Se precisar de interface de operacao, usar `http://127.0.0.1:8080/manager` por acesso local/tunel; nao subir container manager separado.
- Para comparar o PHP com o Miauby agente sombra em envios reais, ligar `MIAUW_AGENT_SHADOW_ON_SEND=true`; manter `false` por padrao para nao adicionar latencia no chat operacional.
- Para corte acelerado do Miauby, definir `MIAUW_ENGINE=node_shadow` ou `MIAUW_ENGINE=node`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm`, `MIAUW_MAINTENANCE_MODE=true` e `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`. Rollback: `MIAUW_ENGINE=php` e reiniciar `wimifarma-com-web`.
- Para audio do Miauby, manter `MIAUW_OPENAI_API_KEY` somente no `.env`, usar `MIAUW_AUDIO_ENABLED=true` e `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`. O botao depende de HTTPS/navegador com microfone e o PHP transcreve o audio temporario sem expor chave no browser; `MIAUW_REALTIME_MODEL`/`MIAUW_REALTIME_VOICE` ficam reservados para evolucao futura de playback/voz.
- Antes de deploy, fazer commit e push da alteracao. Por regra operacional atual, toda alteracao de arquivo deve ser commitada, enviada ao GitHub e publicada no VPS quando houver deploy aplicavel, salvo pedido explicito para nao publicar ou bloqueio tecnico relatado.
- Depois de deploy, rodar `docker compose ps`, logs dos servicos alterados e validar healths aplicaveis, como `http://127.0.0.1:3002/cashback/health`, `http://127.0.0.1:3002/cashback/login.php`, `http://127.0.0.1:3002/cotacao/health`, `http://127.0.0.1:3002/gestao/health`, `http://127.0.0.1:3002/pedidos/health`, `http://127.0.0.1:3002/pedidos/api/badge`, `http://127.0.0.1:3002/tarefa/health`, `http://127.0.0.1:3002/tarefa/badge.php`, `http://127.0.0.1:3002/xp/health`, `http://127.0.0.1:3002/codigos/health`, `http://127.0.0.1:3002/financeiro/health`, `http://127.0.0.1:3002/usuarios/health` e `http://127.0.0.1:3002/financeiro/login.php`.
- Quando o Codex estiver conduzindo o deploy, ele deve executar os comandos no VPS e informar comandos/validacoes realizados, sem precisar orientar o usuario a abrir PuTTY.

## Decisoes tecnicas ja tomadas

- Deploy deve ser rastreavel por Git quando o VPS estiver preparado.
- DNS deve ser gerenciado na GoDaddy.
- Nginx Proxy Manager deve concentrar SSL e dominios.
- O Compose atual publica web apenas em `127.0.0.1:3002`.
- WordPress precisa tratar `X-Forwarded-Proto: https` como HTTPS real, porque o Apache recebe HTTP interno do proxy.
- O WordPress tambem forca HTTPS para `wimifarma.com` e `www.wimifarma.com`, define `WP_CONTENT_URL` publico e usa um MU plugin para corrigir URLs que plugins/tema emitam como `http://`.
- O redirect HTTP -> HTTPS tambem fica protegido por `.htaccess` para cobrir casos em que o Force SSL do proxy nao aplicar como esperado.
- A raiz `/` e roteada para `site/home.php`, uma home independente do WordPress com CSS embutido, para evitar que cache/plugin/tema antigo quebre a primeira tela publica durante a migracao.
- O Apache do container habilita `AllowOverride All` em `/var/www/html` para permitir regras do WordPress e redirects do projeto.
- `WP_CACHE` e `advanced-cache.php` ficam opt-in durante a migracao. Em `wimifarma.com`/`www.wimifarma.com`, `site/wp-config.php` ignora `WP_CACHE=true` e so permite cache de pagina se `WIMIFARMA_PUBLIC_PAGE_CACHE=true`.
- O tema `wimifarma-cashback-theme` tambem normaliza URLs publicas para HTTPS, gera assets da home com helper proprio e usa buffer de saida no frontend publico como segunda camada contra mixed content.
- A Cotacao V2 roda fora do PHP/WordPress: Apache faz proxy de `/cotacao/` para Node, Node usa Postgres para dados vivos e Redis para sessoes/presenca.
- O core de autenticacao em Postgres usa `wimifarma-core-db` para `core_users`, `core_audit_logs` e `core_login_rate_limits`, e `wimifarma-core-migrator` sincroniza `wf_users`. Cotacao, Gestao, Pedidos, Tarefa e Cashback usam core sem fallback MySQL; Miauby PHP usa core por padrao, com fallback MySQL apenas como rollback opt-in onde existir.
- Cashback roda fora do PHP/WordPress: Apache faz proxy de `/cashback/` para Node, Node usa Postgres para clientes, atendentes, compras, creditos, resgates, mensagens, auditoria e sessoes; MySQL nao existe no codigo/dependencias do app desde 2026-05-30.
- A Gestao roda fora do PHP/WordPress: Apache faz proxy de `/gestao/` para Node, Node usa Postgres para contas, pagamentos, auditoria e sessoes, e nao abre conexao MySQL em runtime.
- Tarefa roda fora do PHP/WordPress: Apache faz proxy de `/tarefa/` para Node, Node usa Postgres para tarefas, auditoria e sessoes, e usa `core_users` como login unico. O app nao recebe MySQL no runtime normal.
- XP roda fora do PHP/WordPress: Apache faz proxy de `/xp/` para Node, Node usa Postgres para funcionarios, vendas, configuracoes, auditoria e sessoes. MySQL fica desligado no runtime normal e so volta em rollback manual com flags/provedor/credenciais explicitas.
- Codigos roda fora do PHP/WordPress: Apache faz proxy de `/codigos/` para Node, Node usa Postgres para itens, blocos EAN, auditoria e sessoes. MySQL fica desligado no runtime normal e so volta em rollback manual com flags/provedor/credenciais explicitas.
- Financeiro roda fora do PHP/WordPress: Apache faz proxy de `/financeiro/` para Node, Node usa Postgres para fechamentos, lancamentos, auditoria, idempotencia interna e sessoes; MySQL fica desligado por padrao e so volta em rollback manual com `FINANCEIRO_LEGACY_MYSQL_*` e credenciais explicitas.
- Usuarios roda fora do PHP/WordPress: Apache faz proxy de `/usuarios/` para Node, Node usa Postgres core para usuarios, permissoes, vinculo XP, vinculos seguros de WhatsApp, auditoria e sessoes, consulta o Postgres do XP apenas para listar funcionarios ativos e chama Tarefa/Miauby WhatsApp por endpoints internos tokenizados para delegacao privada e allowlist por usuario.
- Backups manuais da Cotacao V2 ficam em `cotacao-data/backups`, fora do Git.
- A Fase 7/8/9/10/11/12/13/14/15/16/17/18/19 do Miauby adiciona `wimifarma-miauw-agent`, o adaptador PHP sombra, o corte por `MIAUW_ENGINE`, o contrato versionado de personalidade, contratos de tools enviados do PHP ao Node, ponte PHP de tools, roteador de estilo/memoria aprovada, treinador, perfis de voz e audio por transcricao confirmada. O deploy de mudancas no servico deve rebuildar `wimifarma-miauw-agent` e `wimifarma-com-web`; mudancas so no adaptador PHP podem rebuildar apenas `wimifarma-com-web`.
- O bridge WhatsApp do Miauby adiciona `wimifarma-miauw-whatsapp` e `wimifarma-miauw-whatsapp-db`. Deploys desse canal devem rebuildar o bridge, garantir o Postgres dedicado e rebuildar `wimifarma-com-web` quando houver mudanca no proxy Apache.
- Quando o WhatsApp depender de `site/miauw/agent-context.php`, `site/miauw/agent-memory.php`, `site/miauw/agent-actions.php` ou da ponte `POST /miauw/whatsapp/internal/memory`, deploy deve rebuildar `wimifarma-com-web` junto do bridge para contexto, memoria e confirmacoes ficarem na mesma versao do codigo TypeScript. A memoria curta principal fica no Postgres do bridge; MySQL e endpoint PHP sao fallback de compatibilidade.

## Riscos ao alterar

- Fazer `git clone` por cima da pasta atual pode apagar volume/dados locais.
- Mover ou apagar uma pasta que ainda esteja montada por container ativo pode tirar o site do ar. Conferir mounts com `docker inspect` antes de arquivar.
- Arquivar uma pasta sem preservar `.env`, `mysql/`, `cotacao-data/` ou `config.local.php` pode perder configuracao ou dados locais unicos.
- Se o MySQL do VPS entrar em restart com `Failed to find valid data directory`, nao recriar volume vazio. Conferir se existe `ibdata1` no `mysql/` oficial e procurar copias preservadas antes de qualquer acao.
- Trocar nomes de container quebra proxy.
- Remover o proxy Apache de `/cotacao/` derruba a Cotacao oficial, porque nao existe mais fallback PHP legado.
- Remover o proxy Apache de `/gestao/` derruba a Gestao oficial; o legado `site/gestao` foi arquivado em `site/_legacy-disabled/2026-05-29/gestao` e nao e fallback operacional.
- Remover o proxy Apache de `/codigos/` derruba Codigos oficial; o PHP antigo esta arquivado e `site/codigos` guarda apenas assets.
- Remover o proxy Apache de `/miauw/agent/` nao derruba o chat PHP atual quando `MIAUW_ENGINE=php`, mas impede validar o agente Node do Miauby e quebra o motor `node`.
- Trocar DNS antes do app estar saudavel derruba o site.
- Ativar SSL forcado antes do certificado funcionar bloqueia acesso.
- Se o WordPress nao reconhecer HTTPS atras do proxy, ele gera assets `http://` e o navegador bloqueia CSS/JS por mixed content.
- Uma regra de HTTPS sem considerar `X-Forwarded-Proto` pode criar loop infinito atras do proxy.
- Se `AllowOverride` ficar desativado, o `.htaccess` sera ignorado e `http://wimifarma.com` podera continuar respondendo 200.
- Remover a canonicalizacao publica em `wp-config.php` pode fazer `www.wimifarma.com` ou assets do tema voltarem para `http://`.
- Remover o MU plugin de HTTPS publico pode permitir que plugins antigos voltem a emitir assets inseguros.
- Remover a normalizacao HTTPS do tema pode quebrar a home mesmo que outras rotas continuem funcionando.
- `advanced-cache.php` do SpeedyCache roda antes dos MU plugins quando `WP_CACHE` esta ligado; ele pode servir uma home antiga com URLs `http://` mesmo que o resto do WordPress ja esteja corrigido.
- Se `X-Served-By: wimifarma-static-home` nao aparecer na rota `/`, nao investigar CSS primeiro; validar `git log`, rebuild do container e destino do Nginx Proxy Manager.
- Se a rota publica ainda mostrar `wfwc-home-launchpad`, validar tambem se `site/wp-content/endurance-page-cache/` foi removido/ignorado no deploy.
- Apagar `cotacao-data/` remove dados da Cotacao V2. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `core-data/` remove a autenticacao/auditoria compartilhada em Postgres. Cotacao, Gestao, Pedidos, Cashback, Miauby PHP e os modulos Node com auth core param de autenticar; rollback MySQL so existe onde ainda estiver documentado e nao cobre mais Gestao.
- Apagar `cashback-data/` remove clientes, compras, creditos, resgates, mensagens, auditoria e sessoes oficiais do Cashback Node/Postgres. Fazer backup antes de qualquer limpeza ou troca de volume; `wf_*` no MySQL e apenas referencia historica, e nao recebe espelho do app atual.
- Apagar `gestao-data/` remove contas, itens, pagamentos, auditoria e sessoes da Gestao. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `tarefa-data/` remove tarefas, auditoria e sessoes do Tarefa Node/Postgres. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `xp-data/` remove funcionarios, vendas, configuracoes, auditoria e sessoes oficiais do XP Node/Postgres. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `codigos-data/` remove itens, blocos, auditoria e sessoes oficiais de Codigos Node/Postgres. Fazer backup antes de qualquer limpeza ou troca de volume.
- Apagar `financeiro-data/` remove a copia sombra/checksum do Financeiro. Fazer backup se ela ja tiver sido usada para validar migracao; enquanto `/financeiro/` estiver PHP, isso nao remove os dados oficiais do MySQL.
- Configurar credencial Google Sheets errada pode fazer import/export falhar ou atingir a planilha errada. Validar sempre com `/cotacao/api/google-sheets/status`.

## Pendencias

- Consolidar o VPS para operar somente em `/home/ubuntu/projetos/wimifarma-com` e arquivar copias antigas depois de auditoria de mounts/dados.
- Confirmar propagacao DNS definitiva nos principais resolvedores.
- Validar certificado Let's Encrypt para `wimifarma.com` e `www.wimifarma.com` apos cada mudanca de proxy.
- Validar se o HTML publico gera assets com `https://`.
- Validar no VPS que `/` responde por `site/home.php` antes de mexer novamente no tema WordPress.
- Remover caches runtime antigos do VPS para uma pasta de quarentena depois de backup/validacao.
- Limpar cache runtime do SpeedyCache no VPS apos o deploy da correcao de HTTPS/cache.
- Criar rotina de rollback.
- Criar rotina agendada e externa de backup para `cotacao-data/postgres` e `cotacao-data/backups` antes de colocar dados reais na Cotacao V2.
- Criar rotina agendada e externa de backup para `gestao-data/postgres` antes de uso amplo da Gestao administrativa.
- Criar checklist de corte progressivo por tool para liberar usuarios alem de `adm` depois dos evals e traces reais.

## Evolucao futura

- Criar script de deploy.
- Criar backup automatico antes de `docker compose up -d --build`.
- Separar Compose local/producao se as configuracoes divergirem.
- Adicionar monitoramento de uptime e validade SSL.
