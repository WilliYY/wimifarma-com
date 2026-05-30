# 22 - Migracao MySQL para PostgreSQL

## Objetivo

Este documento registra o inventario atual de uso de MySQL e o caminho seguro para migrar os modulos internos para PostgreSQL sem reescrever o projeto inteiro.

## Resumo executivo

Hoje o projeto ainda precisa de MySQL por dois motivos diferentes:

- WordPress: banco `wimifarma_wp`, prefixo `wptl_`. WordPress foi feito para MySQL/MariaDB; trocar por Postgres nao e uma migracao simples nem recomendada como ajuste pequeno. Para remover MySQL 100%, a decisao tecnica correta e substituir/desacoplar a parte WordPress ou manter um MySQL isolado so para WordPress ate essa troca.
- Apps internos: banco `wimifarma_app`, com usuarios, cashback, financeiro, legados de Codigos/XP/Tarefa e Miauby PHP. Estes podem migrar por etapas para Postgres.

Cotacao V2, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro, Cashback e Miauby WhatsApp ja guardam seus dados principais em Postgres. Em 2026-05-28, a memoria curta compartilhada do Miauby interno/WhatsApp passou a ter fonte principal no Postgres do bridge (`miauw_whatsapp_channel_events`), e o core de autenticacao entrou em Postgres `wimifarma_core`, sincronizando `wf_users` para `core_users`. Em 2026-05-29, a Cotacao e Pedidos removeram a dependencia MySQL do login e passaram a usar somente `core_users`; Gestao continua com core principal e fallback MySQL apenas como rollback opt-in; Tarefa passou a default `TAREFA_AUTH_PROVIDER=core`; Cashback foi cortado para `apps/cashback` com `CASHBACK_AUTH_PROVIDER=core` e, depois de validar paridade, desligou `CASHBACK_LEGACY_MYSQL_*` por padrao; Miauby PHP passou a `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`. XP, Codigos e Financeiro tambem usam core como login oficial. Financeiro teve paridade validada e `FINANCEIRO_LEGACY_MYSQL_*` fica desligado por padrao; WordPress segue MySQL por enquanto.

## Uso atual de MySQL

Infraestrutura:

- `docker-compose.yml`: servico `wimifarma-com-db` com imagem `mysql:8.0`, volume `./mysql`, bancos `wimifarma_wp` e `wimifarma_app`.
- `docker/php/Dockerfile`: instala `mysqli` e `pdo_mysql` para WordPress e modulos PHP.
- `site/wp-config.php`: configura WordPress no MySQL `wimifarma_wp`.
- `site/cashback/config.php`: legado/fallback historico do PHP; a rota oficial do Cashback usa `apps/cashback`.

Node/TypeScript com MySQL removido do runtime:

- `apps/cotacao/src/server.js`: usa `core_users` como login unico, sem `mysql2`, sem pool MySQL e sem fallback `wf_users`; dados da planilha ficam em Postgres.
- `apps/pedidos/src/server.ts`: usa `core_users` como login unico, sem `mysql2`, sem pool MySQL, sem fallback `wf_users` e sem espelho `wf_logs`; dados oficiais ficam em Postgres da Gestao e auditoria em `core_audit_logs`/`gestao_audit_events`.

Node/TypeScript ainda ligado a MySQL:

- `apps/gestao/src/server.ts`: usa `core_users` como login principal e `core_audit_logs` para auditoria curta; `mysql2` fica para rollback opt-in de login em `wf_users`, espelho temporario `wf_logs` e importacao legado; dados oficiais ficam em Postgres.
- `apps/tarefa/src/server.ts`: usa Postgres `wimifarma_tarefa` para dados e `core_users` como login oficial por default; `mysql2` fica dormente para rollback manual, mas `TAREFA_LEGACY_MYSQL_*` fica desligado por padrao e o Compose nao injeta credenciais MySQL no app.
- `apps/xp/src/server.ts`: usa Postgres `wimifarma_xp` para XP oficial e `core_users` para login; `mysql2` fica dormente para rollback manual, mas `XP_LEGACY_MYSQL_*` fica desligado por padrao e o Compose nao injeta credenciais MySQL no app.
- `apps/codigos/src/server.ts`: usa Postgres `wimifarma_codigos` para Codigos oficial e `core_users` para login; `mysql2` fica dormente para rollback manual, mas `CODIGOS_LEGACY_MYSQL_*` fica desligado por padrao e o Compose nao injeta credenciais MySQL no app.
- `apps/financeiro/src/server.ts`: usa Postgres `wimifarma_financeiro` como fonte oficial de `/financeiro/`, `core_users` para login e endpoints internos tokenizados para Miauby/WhatsApp. O caminho `mysql2` fica dormente para rollback manual; `FINANCEIRO_LEGACY_MYSQL_*` fica desligado por padrao e o Compose nao injeta credenciais MySQL no app.
- `apps/cashback/src/server.ts`: usa Postgres `wimifarma_cashback` como fonte oficial de `/cashback/`, `core_users` para login e endpoints internos tokenizados. O caminho `mysql2` de importacao/espelho/log existe apenas como rollback manual; `CASHBACK_LEGACY_MYSQL_*` fica desligado por padrao e o Compose nao injeta mais credenciais MySQL no app.

PHP interno ainda ligado a MySQL:

- `site/cashback`: fonte de assets visuais e helpers PHP ainda chamados pelo Miauby (`config.php`/`functions.php`); a rota oficial `/cashback/` usa `apps/cashback`, e `wf_*` do Cashback no MySQL fica somente como referencia historica/rollback manual. O financeiro antigo dentro de Cashback foi arquivado em `site/_legacy-disabled/2026-05-29/cashback-financeiro-php/`.
- `site/codigos`: somente fonte dos assets visuais; a rota oficial `/codigos/` usa `apps/codigos` e o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`.
- `site/tarefa`: legado/fallback historico; a rota oficial `/tarefa/` usa `apps/tarefa`, e `wf_tarefas` fica como fonte de importacao/espelho temporario.
- `site/xp`: somente fonte dos assets/uploads compartilhados; a rota oficial `/xp/` usa `apps/xp` e o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/xp-php/`.
- `site/financeiro`: legado/fonte de assets visuais do Financeiro; a rota oficial `/financeiro/` usa `apps/financeiro`, e as tabelas `financeiro_*` no MySQL ficam como referencia historica/rollback manual.
- `site/miauw`: login reaproveita o core Postgres do Cashback; `miauw_conversas`, `miauw_mensagens`, `miauw_conhecimentos`, `miauw_memorias`, `miauw_configuracoes`, `miauw_alertas`, `miauw_alerta_eventos`, `miauw_padroes`, `miauw_tool_traces`, `miauw_treinos_respostas`, `miauw_farmacia_popular_valores` e `miauw_farmacia_popular_atualizacoes` seguem em MySQL. A tabela `miauw_channel_events` fica como fallback temporario da memoria multicanal; a fonte principal nova e `miauw_whatsapp_channel_events` no Postgres do bridge.

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
- `wimifarma_miauby`: chat, memoria, treino, alertas e traces do Miauby interno, com `miauw_*` tratado como prefixo tecnico legado durante a transicao.
- manter `wimifarma_cotacao`, `wimifarma_gestao` e `wimifarma_miauw_whatsapp` como ja existem.

Se a operacao preferir menos containers, esses schemas podem viver no mesmo servidor Postgres, mas com schemas/bancos separados e credenciais separadas por app.

## Plano de migracao

1. Criar o core em Postgres

- Modelar `core_users`, `core_audit_logs` e `core_login_rate_limits`.
- Migrar `wf_users`, preservando hash de senha, role, status e ids antigos em coluna `legacy_mysql_id`.
- Estado atual: `apps/core-auth` cria o schema em `wimifarma_core`, sincroniza usuarios de forma idempotente e possui validacao de contagem/campos.
- Estado atual da Cotacao: usa `core_users` como login unico; `COTACAO_AUTH_PROVIDER`, `COTACAO_AUTH_MYSQL_FALLBACK_ENABLED` e sombra MySQL foram removidos do Compose e nao devem ser usados para rollback.
- Estado atual da Gestao: `GESTAO_AUTH_PROVIDER=core` usa `core_users` como login principal, preservando a regra de permissao `adm`/`admin`/`gerente`; fallback `wf_users` so volta quando `GESTAO_AUTH_MYSQL_FALLBACK_ENABLED=true` for definido explicitamente.
- Estado atual de Pedidos: usa `core_users` como login unico, preservando a regra de permissao `adm`/`admin`/`gerente` e a sessao `WFPEDIDOS`; `PEDIDOS_AUTH_PROVIDER`, fallback `wf_users`, sombra MySQL, `mysql2`, `depends_on` de `wimifarma-com-db` e variaveis `MYSQL_*` foram removidos.
- Estado atual de Tarefa: `TAREFA_AUTH_PROVIDER=core` e o default de login oficial em `core_users`, preservando a sessao `WFTAREFA` e a mesma tela. `TAREFA_AUTH_PROVIDER=mysql` e rollback direto; `TAREFA_CORE_AUTH_SHADOW_ENABLED=true` continua disponivel para comparacao em ambientes que ainda usem MySQL.
- Cotacao e Pedidos ja nao dependem de MySQL no app Node; observar health/login e manter o migrador do core como fonte de sincronizacao de usuarios.
- Para Gestao, observar producao com `auth.provider=core`, corrigir qualquer uso real do fallback MySQL e so depois remover `mysql2`/espelho `wf_logs` do app.

2. Migrar modulos PHP pequenos primeiro

- Tarefa ja foi migrado para `apps/tarefa` com Postgres dedicado e suporte a auth oficial pelo core Postgres, mantendo `site/tarefa` como legado/fallback historico.
- XP foi migrado para `apps/xp`, Postgres dedicado, login por core e proxy `/xp/`, mantendo importador/espelho idempotente de `wf_xp_*` para rollback curto.
- Codigos foi migrado para `apps/codigos`, Postgres dedicado, login por core, proxy `/codigos/` e endpoints internos tokenizados para o Miauby, mantendo importador/espelho idempotente de `wf_codigos_*` para rollback curto.
- Financeiro foi cortado para `apps/financeiro`, com proxy `/financeiro/`, sessao `WFFINANCEIRO`, login por `core_users`, frontend preservado pelos assets de `site/financeiro` e endpoints internos tokenizados. A paridade com MySQL foi validada e o espelho/import fica desligado por padrao.
- Em 2026-05-30, Tarefa, XP e Codigos tiveram as flags legadas desligadas por padrao no codigo, `.env.example` e Compose. O Compose tambem deixou de injetar credenciais MySQL nesses apps; rollback MySQL agora exige religar flags/provedor e reintroduzir variaveis MySQL explicitamente.

3. Validar cortes pequenos

- Estado atual: `apps/xp` ja cria `xp_employees`, `xp_sales`, `xp_settings` e `xp_audit_events`; a importacao/espelho/log MySQL fica desligada por padrao apos validacao inicial de paridade.
- Estado atual: `apps/codigos` ja cria `codigos_items`, `codigos_groups` e `codigos_audit_events`; a importacao/espelho/log MySQL fica desligada por padrao apos validacao inicial de paridade.
- Estado atual: `apps/financeiro` ja cria `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events`, `financeiro_migration_runs`, `financeiro_internal_idempotency` e sessoes `financeiro_sessions`. Depois da validacao de 2026-05-29, `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED` e `FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED` ficam `false` por padrao; reativar import/espelho exige rollback manual com credenciais MySQL explicitas.
- Preservar caminhos de uploads, soft delete, `system_key='adm'`, venda em centavos e XP inteiro.
- Preservar em Codigos autosave, blocos por prefixo de EAN, reordenacao, exclusao logica e senha de exclusao de tabela.
- Validar cards, trilha, configuracoes, ultimos lancamentos, Codigos e leitura do Miauby por `CODIGOS_INTERNAL_TOKEN` depois de cada deploy, mantendo as flags legadas desligadas no runtime normal.
- Financeiro foi validado por contagem, somatorios em centavos, categorias, amostras por dia, rotas autenticadas, Relatorio, CSV, endpoints internos e dry-run n8n antes de desligar o espelho MySQL.

4. Validar Financeiro e Cashback

- Financeiro ja esta em Node/Postgres com espelho/import MySQL desligado por padrao; manter backup e checksums por dia/tipo para auditoria operacional.
- Cashback ja esta em Node/Postgres; em 2026-05-29 foram validados contagens, relacao compra -> credito -> resgate, somatorios em centavos, saldo disponivel, mensagens WhatsApp, ids legados, sequencias e integridade referencial. Depois dessa validacao, `CASHBACK_LEGACY_MYSQL_IMPORT_ENABLED`, `CASHBACK_LEGACY_MYSQL_MIRROR_ENABLED` e `CASHBACK_LEGACY_MYSQL_LOGS_ENABLED` passaram a `false` por padrao.
- Para Financeiro, preservar fechamentos, divergencias, sangrias, maquininhas, PIX e auditoria.

5. Migrar dados e motor do Miauby PHP

- Migrar conversas, mensagens, memoria, treino, alertas e traces.
- Criar o alvo novo como `wimifarma_miauby`/`miauby_*`, mantendo rotas/env/tabelas `miauw` como compatibilidade ate o corte validado.
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
2. Cotacao e Pedidos ja usam `core_users` sem fallback MySQL; Gestao, Tarefa, Cashback Node e Miauby PHP usam core por default e fallback MySQL apenas como rollback opt-in onde ainda existir.
3. Tarefa, XP e Codigos: ja cortados para Node/Postgres e login core por default, com flags legadas desligadas por padrao e sem credenciais MySQL no Compose.
4. Gestao e Miauby interno: reduzir os ultimos pontos de acoplamento a `wimifarma_app` por endpoints internos/Postgres antes de tentar desligar MySQL do container principal.
5. Financeiro e Cashback: Node/Postgres oficiais com espelhos MySQL desligados por default desde 2026-05-29 apos paridade validada.
6. Miauby PHP, seguindo `docs/28-miauby-migracao.md`.
7. Decisao sobre WordPress.

Essa ordem reduz risco porque remove primeiro a dependencia compartilhada (`wf_users`) e depois migra dominios cada vez mais sensiveis.

O inventario operacional da modernizacao fica em `docs/24-modernizacao-modulos.md` e pode ser gerado por `scripts/audit-modernization.ps1`. O detalhamento por modulo, incluindo rotas, telas, tabelas, escritas, integracoes e riscos, fica em `docs/26-inventario-modulos.md`.
