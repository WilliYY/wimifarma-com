# 22 - Migracao MySQL para PostgreSQL

## Objetivo

Este documento registra o inventario atual de uso de MySQL e o caminho seguro para migrar os modulos internos para PostgreSQL sem reescrever o projeto inteiro.

## Resumo executivo

Hoje o projeto ainda precisa de MySQL por dois motivos diferentes:

- WordPress: banco `wimifarma_wp`, prefixo `wptl_`. WordPress foi feito para MySQL/MariaDB; trocar por Postgres nao e uma migracao simples nem recomendada como ajuste pequeno. Para remover MySQL 100%, a decisao tecnica correta e substituir/desacoplar a parte WordPress ou manter um MySQL isolado so para WordPress ate essa troca.
- Apps internos: banco `wimifarma_app`, com usuarios, cashback, financeiro, legados de Codigos/XP/Tarefa e Miauby PHP. Estes podem migrar por etapas para Postgres.

Cotacao V2, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro, Cashback e Miauby WhatsApp ja guardam seus dados principais em Postgres. Em 2026-05-28, a memoria curta compartilhada do Miauby interno/WhatsApp passou a ter fonte principal no Postgres do bridge (`miauw_whatsapp_channel_events`), e o core de autenticacao entrou em Postgres `wimifarma_core`, sincronizando `wf_users` para `core_users`. Em 2026-05-29, a Cotacao e Pedidos removeram a dependencia MySQL do login e passaram a usar somente `core_users`; Tarefa passou a usar core auth por default. Em 2026-05-30, Cashback, Gestao, Tarefa, Codigos, XP e Financeiro removeram `mysql2`, fallback `wf_users`, espelho/log MySQL, importador MySQL e variaveis/flags MySQL do runtime. Miauby PHP passou a `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core` e o Miauby interno ganhou Postgres sombra `wimifarma_miauby` com migrador e API interna somente leitura em `apps/miauby` para copiar `miauw_*` sanitizado, sem mudar a rota oficial. Em 2026-06-02, a Etapa 5A consolidou a leitura canonica Node/Postgres de contexto/persona/treino aprovado/memorias/conhecimentos/tools por `canonical_read_model`, mantendo PHP como resposta e escrita oficiais. A Etapa 5B preparou schema e contratos de escrita futura (`miauby_write_intents`, `miauby_write_audit_events`, endpoints internos de write-adapter). A Etapa 5C adicionou shadow write/dry-run: o PHP oficial pode enviar intencoes sanitizadas de mensagens ja gravadas no MySQL para `apps/miauby`, que registra apenas dry-run/auditoria quando `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true`; `MIAUBY_WRITES_ENABLED=false` continua bloqueando escrita real e MySQL `miauw_*` segue como fonte oficial. Tambem em 2026-06-02, o runtime `wimifarma-miauby-app` deixou de abrir MySQL: readiness/parity usa o ultimo `validate` salvo em `miauby_migration_runs`, e o MySQL fica restrito ao migrador manual `wimifarma-miauby-migrator`. WordPress segue MySQL por enquanto.

## Uso atual de MySQL

Infraestrutura:

- `docker-compose.yml`: servico `wimifarma-com-db` com imagem `mysql:8.0`, volume `./mysql`, bancos `wimifarma_wp` e `wimifarma_app`.
- `docker/php/Dockerfile`: instala `mysqli` e `pdo_mysql` para WordPress e modulos PHP.
- `site/wp-config.php`: configura WordPress no MySQL `wimifarma_wp`.
- `site/cashback/config.php`: helper legado usado por includes do Miauby; a rota oficial do Cashback usa `apps/cashback`, e PHP direto nessa pasta fica bloqueado por `.htaccess`.

Node/TypeScript com MySQL removido do runtime:

- `apps/cotacao/src/server.js`: usa `core_users` como login unico, sem `mysql2`, sem pool MySQL e sem fallback `wf_users`; dados da planilha ficam em Postgres.
- `apps/pedidos/src/server.ts`: usa `core_users` como login unico, sem `mysql2`, sem pool MySQL, sem fallback `wf_users` e sem espelho `wf_logs`; dados oficiais ficam em Postgres da Gestao e auditoria em `core_audit_logs`/`gestao_audit_events`.

Node/TypeScript com MySQL removido do runtime:

- `apps/gestao/src/server.ts`: usa `core_users` como login unico e `core_audit_logs`/`gestao_audit_events` para auditoria; desde 2026-05-30 nao possui `mysql2`, fallback `wf_users`, espelho `wf_logs`, importador MySQL nem variaveis MySQL no Compose; dados oficiais ficam em Postgres.
- Ponte Miauby -> Gestao: a consulta/criacao de contas usa somente endpoints internos tokenizados da Gestao (`/gestao/api/internal/*`); o contrato `criar_conta_gestao` audita em `gestao_audit_events`, `core_audit_logs` e `miauw_tool_traces`, sem `wf_logs`.
- `apps/tarefa/src/server.ts`: usa Postgres `wimifarma_tarefa` para dados, `core_users` como login unico e auditoria em Postgres; desde 2026-05-30 nao possui `mysql2`, importador, espelho, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` nem flags `TAREFA_LEGACY_MYSQL_*`.
- `apps/xp/src/server.ts`: usa Postgres `wimifarma_xp` para XP oficial, `core_users` para login unico e auditoria em Postgres/core; desde 2026-05-30 nao possui `mysql2`, importador, espelho, fallback `wf_users`, `XP_AUTH_PROVIDER` nem flags `XP_LEGACY_MYSQL_*`.
- `apps/codigos/src/server.ts`: usa Postgres `wimifarma_codigos` para Codigos oficial, `core_users` para login unico e auditoria em Postgres/core; desde 2026-05-30 nao possui `mysql2`, importador, espelho, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` nem flags `CODIGOS_LEGACY_MYSQL_*`.
- `apps/financeiro/src/server.ts`: usa Postgres `wimifarma_financeiro` como fonte oficial de `/financeiro/`, `core_users` para login e endpoints internos tokenizados para Miauby/WhatsApp. Desde 2026-05-30 nao possui `mysql2`, importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` nem flags `FINANCEIRO_LEGACY_MYSQL_*`.
- `apps/cashback/src/server.ts`: usa Postgres `wimifarma_cashback` como fonte oficial de `/cashback/`, `core_users` para login unico e endpoints internos tokenizados. Desde 2026-05-30 nao possui `mysql2`, importador, espelho, logs nem fallback MySQL; o Compose nao injeta flags ou credenciais MySQL no app.

PHP interno ainda ligado a MySQL:

- `site/cashback`: fonte de assets visuais e helpers PHP ainda chamados pelo Miauby (`config.php`/`functions.php`); a rota oficial `/cashback/` usa `apps/cashback`, PHP direto nessa pasta fica bloqueado por `.htaccess`, e `wf_*` do Cashback no MySQL fica somente como referencia historica/rollback manual. O financeiro antigo dentro de Cashback foi arquivado em `site/_legacy-disabled/2026-05-29/cashback-financeiro-php/`.
- `site/codigos`: somente fonte dos assets visuais; a rota oficial `/codigos/` usa `apps/codigos` e o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`.
- `site/tarefa`: legado de referencia/fonte visual com PHP direto bloqueado por `.htaccess`; a rota oficial `/tarefa/` usa `apps/tarefa`, e `wf_tarefas` fica somente como referencia historica/backup.
- `site/xp`: somente fonte dos assets/uploads compartilhados; a rota oficial `/xp/` usa `apps/xp` e o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/xp-php/`.
- `site/financeiro`: assets visuais e helper `financeiro-funcoes.php` ainda chamado pelo Miauby, com PHP direto bloqueado por `.htaccess`; a rota oficial `/financeiro/` usa `apps/financeiro`, e as tabelas `financeiro_*` no MySQL ficam como referencia historica/rollback manual.
- `site/miauw`: login reaproveita o core Postgres do Cashback; `miauw_conversas`, `miauw_mensagens`, `miauw_conhecimentos`, `miauw_memorias`, `miauw_configuracoes`, `miauw_alertas`, `miauw_alerta_eventos`, `miauw_padroes`, `miauw_tool_traces`, `miauw_treinos_respostas`, `miauw_farmacia_popular_valores` e `miauw_farmacia_popular_atualizacoes` seguem como fonte oficial em MySQL. A integracao com Gestao moderna nao le MySQL: usa endpoint interno tokenizado do app Node/Postgres. A tabela `miauw_channel_events` fica como fallback temporario da memoria multicanal; a fonte principal nova e `miauw_whatsapp_channel_events` no Postgres do bridge. Desde 2026-05-30, `apps/miauby` copia esses dados para `wimifarma_miauby` em modo sombra, com payload sanitizado, para preparar a futura troca sem quebrar `/miauw/`.

Legados MySQL que devem ser tratados como migracao/arquivo:

- `cotacao_*`: dados da Cotacao PHP antiga, sem escrita oficial nova.
- `gestao_contas`, `gestao_conta_itens`, `gestao_conta_pagamentos`: fonte de importacao/compatibilidade da Gestao antiga.
- tabelas antigas de campanha/WhatsApp em `wimifarma_app`, se nao houver uso atual confirmado.

## Banco alvo recomendado

A meta operacional e todos os cards conversarem em uma unica plataforma de Postgres, usando `wimifarma_core` como eixo de usuarios, permissoes e auditoria. Isso nao deve virar um unico banco gigante e misturado: manter separacao por dominio reduz risco de bug, facilita rollback e deixa cada modulo dono das proprias regras.

- `wimifarma_core`: autenticacao compartilhada, sessoes compartilhadas quando existirem, auditoria geral e rate limit de login.
- `wimifarma_cashback`: clientes, compras, creditos, resgates e settings do Cashback.
- `wimifarma_financeiro`: caixa/financeiro oficial em Node/Postgres.
- `wimifarma_tarefa`: tarefas, auditoria e sessoes do modulo Tarefa.
- `wimifarma_xp`: funcionarios, vendas XP e configuracoes.
- `wimifarma_codigos`: itens de comissao diferente, blocos EAN, auditoria e sessoes do modulo Codigos.
- `wimifarma_miauby`: banco sombra do chat, memoria, treino, alertas e traces do Miauby interno. A fase atual copia `miauw_*` para `miauby_*` por migrador idempotente e compara contagens/checksums por API interna somente leitura; `miauw_*` continua oficial ate corte validado.
- manter `wimifarma_cotacao`, `wimifarma_gestao` e `wimifarma_miauw_whatsapp` como ja existem.

Se a operacao preferir menos containers, esses schemas podem viver no mesmo servidor Postgres, mas com schemas/bancos separados e credenciais separadas por app.

## Plano de migracao

1. Criar o core em Postgres

- Modelar `core_users`, `core_audit_logs`, `core_login_rate_limits`, permissoes centrais e o cofre administrativo `core_user_admin_passwords`.
- Migrar `wf_users`, preservando hash de senha, role, status e ids antigos em coluna `legacy_mysql_id`.
- Estado atual: `apps/core-auth` cria o schema em `wimifarma_core`, sincroniza usuarios de forma idempotente e possui validacao de contagem/campos.
- Estado atual da Cotacao: usa `core_users` como login unico; `COTACAO_AUTH_PROVIDER`, `COTACAO_AUTH_MYSQL_FALLBACK_ENABLED` e sombra MySQL foram removidos do Compose e nao devem ser usados para rollback.
- Estado atual da Gestao: usa `core_users` como login unico, preservando a regra de permissao `adm`/`admin`/`gerente`; rollback MySQL exige restaurar commit/imagem anterior e backup/importacao validada. A ponte do Miauby para Gestao tambem esta cortada para endpoint interno tokenizado e auditoria Postgres, sem `wf_logs`.
- Estado atual de Pedidos: usa `core_users` como login unico, preservando a regra de permissao `adm`/`admin`/`gerente` e a sessao `WFPEDIDOS`; `PEDIDOS_AUTH_PROVIDER`, fallback `wf_users`, sombra MySQL, `mysql2`, `depends_on` de `wimifarma-com-db` e variaveis `MYSQL_*` foram removidos.
- Estado atual de Tarefa: usa `core_users` como login unico, preservando a sessao `WFTAREFA` e a mesma tela; rollback MySQL exige restaurar versao anterior e backup validado, nao trocar `.env`.
- Cotacao, Gestao, Pedidos, Tarefa e Cashback ja nao dependem de MySQL no app Node; observar health/login e manter o migrador do core como fonte de sincronizacao de usuarios.

2. Migrar modulos PHP pequenos primeiro

- Tarefa ja foi migrado para `apps/tarefa` com Postgres dedicado e suporte a auth oficial pelo core Postgres, mantendo `site/tarefa` apenas como legado de referencia/fonte visual com PHP direto bloqueado por `.htaccess`.
- XP foi migrado para `apps/xp`, Postgres dedicado, login unico por core e proxy `/xp/`; em 2026-05-30 o importador/espelho idempotente de `wf_xp_*` foi removido do runtime depois do corte para Postgres.
- Codigos foi migrado para `apps/codigos`, Postgres dedicado, login unico por core, proxy `/codigos/` e endpoints internos tokenizados para o Miauby. Em 2026-05-30, o importador/espelho idempotente de `wf_codigos_*` foi removido do runtime depois do corte para Postgres.
- Financeiro foi cortado para `apps/financeiro`, com proxy `/financeiro/`, sessao `WFFINANCEIRO`, login por `core_users`, frontend preservado pelos assets de `site/financeiro` e endpoints internos tokenizados. A paridade com MySQL foi validada e em 2026-05-30 o espelho/import/fallback MySQL foi removido do runtime.
- Em 2026-05-30, Tarefa, Codigos e XP removeram o caminho MySQL do codigo, pacote, `.env.example` e Compose. Rollback MySQL nesses modulos exige restaurar versao anterior e backup validado.

3. Validar cortes pequenos

- Estado atual: `apps/xp` cria `xp_employees`, `xp_sales`, `xp_settings` e `xp_audit_events`; desde 2026-05-30 nao ha importacao, espelho ou log MySQL no runtime.
- Estado atual: `apps/codigos` ja cria `codigos_items`, `codigos_groups` e `codigos_audit_events`; a importacao/espelho/log MySQL fica desligada por padrao apos validacao inicial de paridade.
- Estado atual: `apps/financeiro` ja cria `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events`, `financeiro_migration_runs`, `financeiro_internal_idempotency` e sessoes `financeiro_sessions`. Depois da validacao de 2026-05-29, em 2026-05-30 o runtime removeu `mysql2`, importador, espelho e fallback MySQL; rollback exige restaurar versao anterior e backup validado.
- Preservar caminhos de uploads, soft delete, `system_key='adm'`, venda em centavos e XP inteiro.
- Preservar em Codigos autosave, blocos por prefixo de EAN, reordenacao, exclusao logica e senha de exclusao de tabela.
- Validar cards, trilha, configuracoes, ultimos lancamentos, Codigos e leitura do Miauby por `CODIGOS_INTERNAL_TOKEN` depois de cada deploy, mantendo as flags legadas desligadas no runtime normal.
- Financeiro foi validado por contagem, somatorios em centavos, categorias, amostras por dia, rotas autenticadas, Relatorio, CSV, endpoints internos e dry-run n8n antes da remocao do espelho MySQL.

4. Validar Financeiro e Cashback

- Financeiro ja esta em Node/Postgres sem `mysql2`, espelho, importador ou fallback MySQL; manter backup e checksums por dia/tipo para auditoria operacional.
- Cashback ja esta em Node/Postgres; em 2026-05-29 foram validados contagens, relacao compra -> credito -> resgate, somatorios em centavos, saldo disponivel, mensagens WhatsApp, ids legados, sequencias e integridade referencial. Depois dessa validacao, em 2026-05-30 o caminho dormente `mysql2` foi removido do app e do pacote.
- Para Financeiro, preservar fechamentos, divergencias, sangrias, maquininhas, PIX e auditoria.

5. Migrar dados e motor do Miauby PHP

- Migrar conversas, mensagens, memoria, treino, alertas e traces.
- Criar e validar o alvo novo como `wimifarma_miauby`/`miauby_*`, mantendo rotas/env/tabelas `miauw` como compatibilidade ate o corte validado.
- Estado atual: `wimifarma-miauby-db`, `wimifarma-miauby-migrator` e `wimifarma-miauby-app` existem no Compose; `apps/miauby` cria schema, copia registros por `legacy_mysql_id`, grava checksum, redige dados sensiveis em `payload_sanitized` e expoe status/paridade interna tokenizada sem proxy publico. Em 2026-06-02, tambem cria `miauby_write_intents` e `miauby_write_audit_events`; na Etapa 5C esses registros podem receber apenas intencoes dry-run vindas do PHP oficial apos a gravacao MySQL, com idempotencia e divergencia por checksum. O app vivo continua com escrita real bloqueada. O app vivo usa apenas Postgres; comparacao contra MySQL ocorre somente quando o migrador/validador manual roda e grava o resumo em `miauby_migration_runs`.
- Manter a memoria curta multicanal em `miauw_whatsapp_channel_events` como primeiro passo ja cortado para Postgres, removendo o fallback MySQL somente depois de observacao operacional.
- Cuidar para nao copiar payload bruto, segredo, telefone completo ou stack trace que ja nao deveria existir.
- Planejar corte junto com o `apps/miauw-agent`, porque parte do Miauby ja esta no Node.

6. Decidir WordPress

- Se a meta for zero MySQL, planejar a home/site publico fora do WordPress ou uma substituicao controlada.
- Enquanto WordPress existir, manter `wimifarma_wp` no MySQL e tratar como excecao isolada.
- Nao tentar trocar o banco do WordPress para Postgres por plugin/compatibilidade sem prova longa, backup e rollback.

## Cuidados tecnicos

- MySQL usa `ON DUPLICATE KEY`, `SHOW COLUMNS`, `DATETIME`, `ENUM`, `AUTO_INCREMENT` e sintaxes que nao migram 1:1 para Postgres.
- Dinheiro deve continuar em centavos inteiros.
- Usar FK/constraints e indices nos campos de filtro/join.
- Usar indices parciais para filas, soft delete e status ativos.
- Preservar ids legados em colunas `legacy_mysql_id` para reconciliacao.
- Fazer migracoes idempotentes: repetir o script nao pode duplicar dados.
- Fazer backup antes de cada corte e validar contagens, somatorios e amostras.
- Depois de cada modulo migrado, remover variaveis MySQL dele, dependencia `mysql2` quando aplicavel e atualizar docs.

## Ordem sugerida

1. Core de autenticacao/auditoria em Postgres: ativo com `wimifarma-core-db` e `apps/core-auth`.
2. Cotacao, Gestao, Pedidos, Tarefa, Codigos e Cashback ja usam `core_users` sem fallback MySQL; Miauby PHP usa core por default e fallback MySQL apenas como rollback opt-in onde ainda existir.
3. Tarefa, Codigos e XP ja estao em Node/Postgres sem dependencia MySQL e com login unico no core.
4. Gestao: Node/Postgres oficial sem `mysql2`/espelho/fallback desde 2026-05-30; rollback exige restaurar commit/imagem anterior e backup.
5. Financeiro: Node/Postgres oficial sem `mysql2`/espelho/fallback desde 2026-05-30; rollback exige restaurar versao anterior e backup.
5.1. Cashback: Node/Postgres oficial sem `mysql2`/espelho/fallback desde 2026-05-30; rollback exige restaurar commit/imagem anterior e backup.
6. Miauby PHP, seguindo `docs/28-miauby-migracao.md`.
7. Decisao sobre WordPress.

Essa ordem reduz risco porque remove primeiro a dependencia compartilhada (`wf_users`) e depois migra dominios cada vez mais sensiveis.

O inventario operacional da modernizacao fica em `docs/24-modernizacao-modulos.md` e pode ser gerado por `scripts/audit-modernization.ps1`. O detalhamento por modulo, incluindo rotas, telas, tabelas, escritas, integracoes e riscos, fica em `docs/26-inventario-modulos.md`.
