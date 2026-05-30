# 01 - Arquitetura

## O que esta parte do sistema faz

A arquitetura atual empacota o sistema migrado do HostGator em Docker. O container web serve WordPress, modulos PHP internos remanescentes e faz proxy para Cashback, Cotacao V2, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro, Usuarios, Miauby agente e Miauby WhatsApp. O novo `wimifarma-miauby-app` fica apenas na rede Docker como servico sombra somente leitura para validar Postgres contra PHP/MySQL, sem proxy publico. Os dados ficam separados entre MySQL legado/apps, Postgres do core de autenticacao, Postgres do Cashback, Postgres da Cotacao V2, Postgres da Gestao/Pedidos, Postgres da Tarefa, Postgres do XP, Postgres de Codigos, Postgres do Financeiro, Postgres sombra do Miauby interno, Postgres do WhatsApp do Miauby e Redis de sessoes/presenca.

A direcao de arquitetura para a proxima etapa e manter uma plataforma Postgres integrada por `wimifarma_core`, sem juntar todos os dominios em um banco unico acoplado. A migracao do Miauby interno deve criar `wimifarma_miauby`/`apps/miauby` por fases, mantendo `/miauw/` e `MIAUW_*` como compatibilidade ate o corte validado.

## Componentes envolvidos

```text
Usuario/Navegador
  -> DNS GoDaddy
  -> VPS Oracle/Ubuntu
  -> Nginx Proxy Manager (80/443)
  -> wimifarma-com-web:80 (Apache/PHP)
      -> WordPress e modulos PHP
      -> proxy /cashback/ para wimifarma-cashback-app:4000
      -> proxy /cotacao/ para wimifarma-cotacao-app:3000
      -> proxy /gestao/ para wimifarma-gestao-app:3200
      -> proxy /pedidos/ para wimifarma-pedidos-app:3300
      -> proxy /tarefa/ para wimifarma-tarefa-app:3500
      -> proxy /xp/ para wimifarma-xp-app:3600
      -> proxy /codigos/ para wimifarma-codigos-app:3700
      -> proxy /usuarios/ para wimifarma-usuarios-app:3900
      -> proxy /miauw/agent/ para wimifarma-miauw-agent:3100
      -> proxy /miauw/whatsapp/ para wimifarma-miauw-whatsapp:3400
  -> wimifarma-miauby-app:4100 (somente rede interna, sem proxy publico)
  -> wimifarma-com-db:3306 (MySQL)
  -> wimifarma-core-db:5432 (Postgres core auth)
  -> wimifarma-cashback-db:5432 (Postgres)
  -> wimifarma-cotacao-db:5432 (Postgres)
  -> wimifarma-cotacao-redis:6379 (Redis)
  -> wimifarma-gestao-db:5432 (Postgres)
  -> wimifarma-tarefa-db:5432 (Postgres)
  -> wimifarma-xp-db:5432 (Postgres)
  -> wimifarma-codigos-db:5432 (Postgres)
  -> wimifarma-financeiro-db:5432 (Postgres Financeiro)
  -> wimifarma-miauby-db:5432 (Postgres sombra do Miauby interno)
  -> wimifarma-miauw-whatsapp-db:5432 (Postgres)
```

Arquivos principais:

- `docker-compose.yml`
- `docker/php/Dockerfile`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`
- `apps/miauby/src/shadow-migrate.ts`
- `apps/miauby/src/server.ts`
- `ops/evolution/docker-compose.yml`
- `apps/cotacao/src/server.js`
- `apps/cashback/src/server.ts`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg`
- `apps/cotacao/public/favicon.svg`
- `apps/gestao/src/server.ts`
- `apps/gestao/public/`
- `apps/pedidos/src/server.ts`
- `apps/tarefa/src/server.ts`
- `apps/xp/src/server.ts`
- `apps/codigos/src/server.ts`
- `apps/financeiro/src/server.ts`
- `apps/usuarios/src/server.ts`
- `apps/tarefa/public/`
- `docker/mysql/init/01-create-databases.sql`
- `site/.htaccess`
- `site/home.php`
- `site/wp-config.php`
- `site/cashback/` (assets e helpers PHP ainda chamados pelo Miauby; rota oficial usa `apps/cashback`)
- `site/codigos/` (somente assets; rota oficial usa `apps/codigos`; PHP antigo arquivado)
- `site/xp/` (somente assets/uploads; rota oficial usa `apps/xp`; PHP antigo arquivado)
- `site/_legacy-disabled/2026-05-29/gestao/` (Gestao PHP antiga arquivada)
- `site/_legacy-disabled/2026-05-29/codigos-php/` (Codigos PHP antigo arquivado)
- `site/_legacy-disabled/2026-05-29/xp-php/` (XP PHP antigo arquivado)
- `site/_legacy-disabled/2026-05-29/cashback-financeiro-php/` (Financeiro antigo dentro de Cashback arquivado)
- `.env.example`

Containers:

- `wimifarma-com-web`: PHP 8.3 + Apache, monta `./site:/var/www/html`.
- `wimifarma-com-db`: MySQL 8.0, monta `./mysql:/var/lib/mysql`.
- `wimifarma-cashback-app`: Node.js 22 + TypeScript + Express oficial para `/cashback/`, `/cashback/health` e `/cashback/api/internal/*`.
- `wimifarma-cashback-db`: Postgres 17, monta `./cashback-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-cotacao-app`: Node.js 22 + Express + Socket.IO para `/cotacao/`.
- `wimifarma-cotacao-db`: Postgres 17, monta `./cotacao-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-cotacao-redis`: Redis 7, monta `./cotacao-data/redis:/data`.
- `wimifarma-gestao-app`: Node.js 22 + TypeScript + Express para `/gestao/`.
- `wimifarma-gestao-db`: Postgres 17, monta `./gestao-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-pedidos-app`: Node.js 22 + TypeScript + Express para `/pedidos/`, usando o Postgres da Gestao.
- `wimifarma-tarefa-app`: Node.js 22 + TypeScript + Express para `/tarefa/`.
- `wimifarma-tarefa-db`: Postgres 17, monta `./tarefa-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-xp-app`: Node.js 22 + TypeScript + Express para `/xp/`.
- `wimifarma-xp-db`: Postgres 17, monta `./xp-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-codigos-app`: Node.js 22 + TypeScript + Express para `/codigos/`.
- `wimifarma-codigos-db`: Postgres 17, monta `./codigos-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-financeiro-app`: Node.js 22 + TypeScript + Express oficial para `/financeiro/`, `/financeiro/health` e `/financeiro/api/internal/*`.
- `wimifarma-financeiro-db`: Postgres 17, monta `./financeiro-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-usuarios-app`: Node.js 22 + TypeScript + Express para `/usuarios/`, usando `wimifarma_core` para usuarios, permissoes, vinculos XP, auditoria e sessoes.
- `wimifarma-miauw-agent`: Node.js 22 + TypeScript + Agents SDK para `/miauw/agent/` em sombra/corte controlado.
- `wimifarma-miauw-whatsapp`: Node.js 22 + TypeScript para `/miauw/whatsapp/`, recebendo webhooks da Evolution API ou Meta Cloud API, exibindo painel operacional seguro e processando fila/outbox.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal WhatsApp do Miauby, monta `./miauw-whatsapp-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-miauby-db`: Postgres 17 sombra do Miauby interno, monta `./miauby-data/postgres:/var/lib/postgresql/data`.
- `wimifarma-miauby-migrator`: Node.js 22 + TypeScript em profile `migration`, copia `miauw_*` do MySQL para `miauby_*` sanitizado sem mudar a rota oficial `/miauw/`.
- `wimifarma-miauby-app`: Node.js 22 + TypeScript + Express para health/status/paridade interna somente leitura em `:4100`; nao tem proxy Apache, nao serve frontend e nao grava em `miauw_*` nem `miauby_*`.
- `wimifarma-evolution-api`: Evolution API v2 como transporte WhatsApp, em stack separada no VPS, ligada na rede `wimifarma-com-network` para o bridge chamar internamente.
- `wimifarma-evolution-postgres` e `wimifarma-evolution-redis`: persistencia propria da Evolution API, fora dos bancos do Wimifarma.

Rede Docker:

- `wimifarma-com-network`

## Portas e ambientes

- Docker interno: `wimifarma-com-web:80`
- Local Compose: `127.0.0.1:3002`
- Tunel PuTTY usado no Windows: `127.0.0.1:13002`
- Publico: `80/443` pelo Nginx Proxy Manager
- Nginx Proxy Manager admin observado no VPS: porta `81`
- Interno Cashback: `wimifarma-cashback-app:4000`
- Interno Cotacao V2: `wimifarma-cotacao-app:3000`
- Interno Gestao: `wimifarma-gestao-app:3200`
- Interno Pedidos: `wimifarma-pedidos-app:3300`
- Interno Tarefa: `wimifarma-tarefa-app:3500`
- Interno XP: `wimifarma-xp-app:3600`
- Interno Codigos: `wimifarma-codigos-app:3700`
- Interno Financeiro: `wimifarma-financeiro-app:3800`
- Interno Usuarios: `wimifarma-usuarios-app:3900`
- Interno Miauby agente: `wimifarma-miauw-agent:3100`
- Interno Miauby WhatsApp: `wimifarma-miauw-whatsapp:3400`
- Interno Miauby sombra leitura: `wimifarma-miauby-app:4100`
- Interno Evolution API para o bridge: `wimifarma-evolution-api:8080`

O proxy publico deve encaminhar para `http://wimifarma-com-web:80`. Nao apontar o Nginx Proxy Manager diretamente para `wimifarma-cashback-app` ou `wimifarma-cotacao-app`; o Apache ja publica `/cashback/`, `/cotacao/` e `/cotacao/socket.io/`.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-gestao-app`; o Apache publica `/gestao/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-pedidos-app`, `wimifarma-tarefa-app`, `wimifarma-xp-app`, `wimifarma-codigos-app`, `wimifarma-financeiro-app` ou `wimifarma-usuarios-app`; o Apache publica `/pedidos/`, `/tarefa/`, `/xp/`, `/codigos/`, `/financeiro/` e `/usuarios/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-miauw-agent`; o Apache publica `/miauw/agent/` internamente.
Tambem nao apontar o Nginx Proxy Manager diretamente para `wimifarma-miauw-whatsapp` nem para `wimifarma-evolution-api`; o Apache publica `/miauw/whatsapp/` internamente, e a Evolution API fica limitada a localhost/rede Docker ate decisao explicita.
Tambem nao apontar o Nginx Proxy Manager nem o Apache para `wimifarma-miauby-app`; ele e API sombra interna de paridade antes de qualquer alias `/miauby/`.

## Regras que precisam ser preservadas

- Nao publicar o MySQL para a internet.
- Nao mudar a porta `3002` sem atualizar docs, proxy local e comandos de auditoria.
- Nao configurar Nginx Proxy Manager apontando para `127.0.0.1:13002`; essa porta e apenas tunel local.
- Manter `mysql/` como volume persistente e ignorado pelo Git.
- Manter `cashback-data/` como volume persistente e ignorado pelo Git.
- Manter `cotacao-data/` como volume persistente e ignorado pelo Git.
- Manter `gestao-data/` como volume persistente e ignorado pelo Git.
- Manter `tarefa-data/` como volume persistente e ignorado pelo Git.
- Manter `xp-data/` como volume persistente e ignorado pelo Git.
- Manter `codigos-data/` como volume persistente e ignorado pelo Git.
- Manter `financeiro-data/` como volume persistente e ignorado pelo Git.
- Manter `miauw-whatsapp-data/` como volume persistente e ignorado pelo Git.
- Manter `miauby-data/` como volume persistente e ignorado pelo Git; ele e sombra de migracao e nao deve substituir `miauw_*` ate corte validado.
- Manter a Cotacao V2 em `/cotacao/` sem gatilhos escondidos por palavra de categoria.
- Manter o Cashback oficial em `/cashback/` via Node/Postgres; `site/cashback` e apenas legado/assets historico.
- Manter a Gestao oficial em `/gestao/` via Node/Postgres; o legado PHP de `site/gestao` esta arquivado em `site/_legacy-disabled/2026-05-29/gestao`.
- Manter `Pedidos` como modulo separado em `/pedidos/`, usando `apps/pedidos`, container `wimifarma-pedidos-app:3300`, sessao propria `WFPEDIDOS`, CSRF proprio e proxy Apache dedicado. A URL antiga `/gestao/pedidos` deve apenas redirecionar para `/pedidos/`.
- Manter `Tarefa` como modulo separado em `/tarefa/`, usando `apps/tarefa`, container `wimifarma-tarefa-app:3500`, sessao propria `WFTAREFA`, CSRF proprio e proxy Apache dedicado. `site/tarefa` fica legado/fallback historico.
- Manter o XP como modulo proprio em `/xp/`, usando `apps/xp`, container `wimifarma-xp-app:3600`, Postgres dedicado, sessao propria `WFXP`, CSRF proprio e proxy Apache dedicado; `site/xp` fica somente para assets/uploads.
- Manter Codigos como modulo proprio em `/codigos/`, usando `apps/codigos`, container `wimifarma-codigos-app:3700`, Postgres dedicado, sessao propria `WFCODIGOS`, CSRF proprio e proxy Apache dedicado; `site/codigos` fica somente para assets.
- Manter `/financeiro/` pelo proxy Apache para `apps/financeiro`; o espelho/import MySQL ja foi removido do runtime, entao validacoes devem focar Postgres oficial, login/sessao, fluxo de caixa/relatorio, CSV, Miauby Pix CNPJ e rollback por restauracao de versao/backup.
- Manter `/usuarios/` pelo proxy Apache para `apps/usuarios`; o modulo deve usar `wimifarma_core` como fonte de verdade, restringir administracao a `adm`/`admin`, guardar permissoes por modulo em tabela propria e vincular XP sem copiar dados do XP para outro banco.
- Para futuras telas/cards com dominio proprio, escolher explicitamente o melhor desenho tecnico antes de implementar: linguagem/runtime, banco, schema, indices, permissoes, auditoria, healthcheck, deploy e integracoes. Preferir rota/app/servico separados em vez de transformar a Gestao em concentrador de subviews.
- Cada modulo novo deve declarar sua fonte de verdade. Quando precisar alimentar outro dominio, integrar por tabelas/APIs estruturadas, nao por acoplamento visual ou reaproveitamento de tela.
- Manter o Miauby agente sem escrita real; quando `MIAUW_ENGINE=node`, liberar primeiro apenas usuarios configurados e preservar rollback imediato para `php`.
- Manter o migrador sombra `apps/miauby` sem efeito no frontend: ele pode criar/atualizar `miauby_*`, mas `/miauw/`, widget, treino, diagnostico e chat continuam no PHP ate validacao de paridade.
- Manter o Miauby WhatsApp como borda de transporte: Evolution API ou Meta Cloud API nao viram motor de IA, banco oficial nem executor de escrita forte. O servico usa Postgres dedicado, allowlist, dedupe, painel seguro e outbox; o repositorio fica desligado por padrao e cada ambiente liga por `.env`.

## Decisoes tecnicas ja tomadas

- PHP/Apache foi escolhido por compatibilidade com WordPress e modulos PHP migrados.
- MySQL 8.0 foi usado para manter compatibilidade com dados importados.
- `.dockerignore` reduz contexto de build para evitar enviar dados sensiveis e volume MySQL ao Docker.
- Cache de pagina WordPress/SpeedyCache fica desligado por padrao durante a migracao. Em hosts publicos, so deve ser ativado com `WIMIFARMA_PUBLIC_PAGE_CACHE=true` depois que HTTPS e assets estiverem validados.
- A rota publica `/` e servida por `site/home.php` via `.htaccess`, sem carregar WordPress, para estabilizar a primeira tela enquanto plugins/cache/tema do WordPress sao investigados. Em 2026-05-30, essa home ganhou um login inicial visual com sessao propria `WFHOME`, CSRF, credencial temporaria padrao `adm`/`adm`, override por ambiente e botao `Sair` antes dos cards.
- A logo oficial da marca fica versionada como SVG horizontal nos assets compartilhados dos modulos; a atualizacao de 2026-05-21 usa os mesmos nomes de arquivo para preservar rotas e cache controlado. A home publica usa uma variacao animada propria e sem fundo em `assets/img/logo-wimifarma-home-animated.gif`, sem substituir os SVGs dos modulos internos.
- A Cotacao V2 foi separada em servico Node.js para permitir WebSocket, Postgres, Redis e evolucao mais proxima do Google Sheets sem continuar remendando a planilha PHP antiga.
- Cashback foi cortado para `apps/cashback` com Node.js + TypeScript e Postgres dedicado `wimifarma_cashback`. A tela visual foi preservada por assets de `site/cashback`; depois da validacao de 2026-05-29, `wf_*` do Cashback fica apenas como referencia historica/backup. Em 2026-05-30, o app removeu `mysql2`, importador, espelho e fallback MySQL, e o Compose nao injeta credenciais nem flags MySQL no app.
- A Gestao foi separada em servico Node.js + TypeScript com Postgres dedicado porque e modulo administrativo critico; desde 2026-05-30 o login usa somente o core Postgres `core_users`, a auditoria fica em Postgres e o app nao possui `mysql2`, fallback `wf_users`, espelho `wf_logs` nem importador MySQL.
- Pedidos de fornecedores foi separado da Gestao em `apps/pedidos`, mas continua usando as tabelas financeiras `gestao_accounts`, `gestao_account_items` e `gestao_account_payments` para alimentar automaticamente os totais/categoria `Boleto` e reaproveitar o historico financeiro existente. A parte operacional fica em `pedidos_orders` e `pedidos_confirmed_orders`; vencimentos individuais de parcelas ficam em `gestao_account_items.due_at`, e `gestao_accounts.due_at` guarda a menor data ativa para resumo/ordenacao. Desde 2026-05-29, Pedidos autentica somente em `core_users`, audita em Postgres e nao depende mais de MySQL em runtime.
- Tarefa foi separado em `apps/tarefa` com Node.js + TypeScript e Postgres dedicado `wimifarma_tarefa`. A tela visual foi preservada e, desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, fallback `wf_users` nem flags MySQL; `wf_tarefas` fica apenas como referencia historica/backup.
- XP foi migrado para `apps/xp` com Node.js + TypeScript e Postgres dedicado `wimifarma_xp`. A tela visual foi preservada por assets/uploads de `site/xp`; o PHP antigo fica em `site/_legacy-disabled/2026-05-29/xp-php`. Desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, fallback `wf_users` nem flags MySQL.
- Codigos foi migrado para `apps/codigos` com Node.js + TypeScript e Postgres dedicado `wimifarma_codigos`. A tela visual foi preservada por assets de `site/codigos`; o PHP antigo fica em `site/_legacy-disabled/2026-05-29/codigos-php`.
- Financeiro foi cortado para `apps/financeiro` com Node.js + TypeScript e Postgres dedicado `wimifarma_financeiro`. A tela preserva os assets de `site/financeiro`, expoe health/resumo/checksums internos e, desde 2026-05-30, roda sem `mysql2`, importador, espelho ou fallback MySQL; `financeiro_*` no MySQL fica somente como referencia historica/backup.
- Usuarios foi criado em `apps/usuarios` com Node.js + TypeScript, sessao `WFUSUARIOS` e Postgres core `wimifarma_core`. O app nasce como painel central de criacao/desativacao de logins, permissoes por modulo, vinculo logico com `xp_employees` e historico em `core_user_audit_events`.
- O Miauby interno iniciou fase 1 em sombra com `apps/miauby`, `wimifarma-miauby-db` e `wimifarma-miauby-migrator`: o migrador cria tabelas `miauby_*`, preserva `legacy_mysql_id`, grava checksum e payload sanitizado, mas nao muda rota, UI, widget nem engine.
- O criterio para banco novo e: tabelas do dominio com FKs/constraints, dinheiro em centavos inteiros quando houver valor financeiro, indices em filtros/joins frequentes, indices parciais para filas/status, soft delete/arquivamento logico quando houver auditoria e migracao/compatibilidade documentada quando substituir tabela antiga.
- A Fase 7/8/9 do Miauby cria um servico Node.js 22 + TypeScript com Agents SDK, adaptador PHP de comparacao e corte por `MIAUW_ENGINE`. O PHP continua dono de login, sessoes, widget, confirmacoes, registry e auditoria.
- A Fase 17 do Miauby mantem o PHP como dono de treino/revisao e envia ao Node apenas contexto aprovado, versionado e compilado por relevancia; o servico agente continua sem credencial de banco e sem escrita direta.
- A Fase 19 do Miauby adiciona audio estilo WhatsApp no chat e no widget com botao explicito. O PHP transcreve o audio temporario no servidor para nao expor chave ao navegador; o audio nao e persistido, o texto fica revisavel antes do envio e voz nao executa escrita operacional direta.
- Palavras de categoria como `geral`, `urgente`, `encomenda` e `cotacao` nao devem aplicar cor, prioridade, ordem, filtro nem data operacional automaticamente; cor vem apenas de regra condicional explicita em `cotacao_v2_rules`.
- Em 2026-05-14, a Cotacao PHP antiga em `site/cotacao` e os shims de compatibilidade da raiz foram removidos. Os ativos usados por `/cotacao/` ficam versionados em `apps/cotacao/public`, e o Compose nao monta mais nada de `site/cotacao` no container Node.

## Riscos ao alterar

- Trocar nomes dos containers quebra referencias de rede e Nginx Proxy Manager.
- Alterar `site/wp-config.php` pode quebrar WordPress e redirects.
- Reativar cache de pagina antes de limpar `advanced-cache.php` e caches antigos pode servir HTML velho com assets `http://`.
- Remover a regra de `site/home.php` antes de validar a home WordPress pode trazer de volta a tela publica sem CSS/estrutura.
- Recriar o volume `mysql/` sem backup perde dados importados.
- Recriar `cashback-data/` sem backup perde clientes, compras, creditos, resgates, mensagens, auditoria e sessoes oficiais do Cashback Node/Postgres.
- Recriar `cotacao-data/` sem backup perde dados da Cotacao V2.
- Recriar `gestao-data/` sem backup perde contas, itens, pagamentos, auditoria e sessoes da Gestao.
- Recriar `tarefa-data/` sem backup perde tarefas, auditoria e sessoes do Tarefa Node/Postgres.
- Recriar `xp-data/` sem backup perde funcionarios, vendas, configuracoes, auditoria e sessoes do XP Node/Postgres.
- Recriar `codigos-data/` sem backup perde itens, blocos, auditoria e sessoes de Codigos Node/Postgres.
- Recriar `financeiro-data/` sem backup perde a fonte oficial atual do Financeiro em Postgres e o historico de importacao/checksum.
- Recriar `miauby-data/` sem backup perde a copia sombra usada para validar a migracao do Miauby interno; isso nao derruba `/miauw/`, mas apaga reconciliacao/checksums da fase 1.
- Rollback MySQL do Financeiro exige restaurar versao/imagem anterior e backup validado; antes de operar apos rollback, validar fechamentos, lancamentos, relatorio, CSV e integracao Pix CNPJ do Miauby WhatsApp.
- Reconstruir NPM sem conectar a rede `wimifarma-com-network` pode impedir o proxy de enxergar `wimifarma-com-web`.
- Recriar atalhos automaticos por nome de categoria na Cotacao pode conflitar com a formatacao condicional e causar saltos de linha/sync pesado.
- Alterar o proxy de `/cotacao/socket.io/` sem validar pode quebrar presenca e edicao ao vivo.
- Como nao existe mais fallback PHP legado para Cotacao, qualquer falha em `/cotacao/` deve ser tratada no proxy Apache/Node/Postgres/Redis da V2.
- Cashback depende do proxy Apache para `wimifarma-cashback-app`; falhas em `/cashback/` devem ser diagnosticadas no Node, Postgres do Cashback, core auth e proxy, nao no PHP legado nem no MySQL.
- A Gestao depende do proxy Apache para `wimifarma-gestao-app`; falhas em `/gestao/` devem ser diagnosticadas no Node, Postgres da Gestao, core Postgres e proxy, nao no PHP legado nem em MySQL.
- Tarefa depende do proxy Apache para `wimifarma-tarefa-app`; falhas em `/tarefa/` devem ser diagnosticadas no Node, Postgres da Tarefa, core Postgres de login e proxy, nao no PHP legado.
- Trocar o chat do Miauby para o servico sombra sem evals/comparacoes pode perder confirmacoes, traces ou permissoes atuais.

## Pendencias

- Persistir a conexao do Nginx Proxy Manager a `wimifarma-com-network` em Compose/config do VPS, se ela ainda estiver manual.
- Finalizar SSL do dominio `wimifarma.com` quando DNS propagar.
- Definir se o deploy definitivo no VPS sera por Git na pasta atual ou clone limpo com migracao controlada dos dados locais.

## Evolucao futura

- Criar um arquivo de deploy separado para producao se as necessidades do VPS divergirem do local.
- Adicionar healthchecks no Compose.
- Criar rotinas de backup automatico do MySQL.
- Criar rotinas de backup automatico do Postgres da Cotacao V2.
- Separar jobs/cron em container proprio quando Miauby e sincronizacao crescerem.
- Evoluir a Cotacao V2 com conflito por campo, diagnostico de sync e import/export Google Sheets.
