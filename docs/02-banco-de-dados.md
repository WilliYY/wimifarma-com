# 02 - Banco de dados

## O que esta parte do sistema faz

O banco guarda dados do WordPress, dos modulos internos, do core de autenticacao, do Cashback, da Cotacao V2, da Gestao/Pedidos, da Tarefa, do XP, de Codigos, do Financeiro e de Usuarios. A migracao trouxe dados do HostGator para MySQL local em Docker; core auth, Cashback, Cotacao V2, Gestao/Pedidos, Tarefa, XP, Codigos, Financeiro, Usuarios, Miauby sombra e Miauby WhatsApp usam Postgres para os modulos que precisam de evolucao mais forte.

## Servicos e arquivos envolvidos

- Container: `wimifarma-com-db`
- Imagem: `mysql:8.0`
- Volume local: `mysql/`
- Container Cotacao V2: `wimifarma-cotacao-db`
- Imagem Cotacao V2: `postgres:17-alpine`
- Volume Cotacao V2: `cotacao-data/postgres/`
- Redis Cotacao V2: `wimifarma-cotacao-redis`, volume `cotacao-data/redis/`
- Container Core auth: `wimifarma-core-db`
- Imagem Core auth: `postgres:17-alpine`
- Volume Core auth: `core-data/postgres/`
- Container Cashback: `wimifarma-cashback-db`
- Imagem Cashback: `postgres:17-alpine`
- Volume Cashback: `cashback-data/postgres/`
- Container Gestao: `wimifarma-gestao-db`
- Imagem Gestao: `postgres:17-alpine`
- Volume Gestao: `gestao-data/postgres/`
- Container Tarefa: `wimifarma-tarefa-db`
- Imagem Tarefa: `postgres:17-alpine`
- Volume Tarefa: `tarefa-data/postgres/`
- Container XP: `wimifarma-xp-db`
- Imagem XP: `postgres:17-alpine`
- Volume XP: `xp-data/postgres/`
- Container Codigos: `wimifarma-codigos-db`
- Imagem Codigos: `postgres:17-alpine`
- Volume Codigos: `codigos-data/postgres/`
- Container Financeiro: `wimifarma-financeiro-db`
- Imagem Financeiro: `postgres:17-alpine`
- Volume Financeiro: `financeiro-data/postgres/`
- Container Miauby WhatsApp: `wimifarma-miauw-whatsapp-db`
- Imagem Miauby WhatsApp: `postgres:17-alpine`
- Volume Miauby WhatsApp: `miauw-whatsapp-data/postgres/`
- Container Miauby sombra: `wimifarma-miauby-db`
- Imagem Miauby sombra: `postgres:17-alpine`
- Volume Miauby sombra: `miauby-data/postgres/`
- Init SQL: `docker/mysql/init/01-create-databases.sql`
- Config web: `docker-compose.yml`
- Config app: `site/cashback/config.php`
- Config WordPress: `site/wp-config.php`

## Bancos existentes

- `wimifarma_wp`: WordPress, prefixo `wptl_`.
- `wimifarma_app`: modulos internos.
- `wimifarma_core`: autenticacao/auditoria compartilhada em Postgres.
- `wimifarma_cashback`: Cashback oficial em Postgres.
- `wimifarma_cotacao`: Cotacao V2 em Postgres.
- `wimifarma_gestao`: Gestao em Postgres.
- `wimifarma_tarefa`: Tarefa em Postgres.
- `wimifarma_xp`: XP em Postgres.
- `wimifarma_codigos`: Codigos em Postgres.
- `wimifarma_financeiro`: Financeiro oficial em Postgres.
- `wimifarma_miauw_whatsapp`: fila/eventos/outbox do canal WhatsApp do Miauby em Postgres.
- `wimifarma_miauby`: banco sombra do Miauby interno, com tabelas canonicas `miauby_*`. O prefixo `miauw_*` permanece oficial no PHP ate corte validado; ver `docs/28-miauby-migracao.md`.

O inventario de dependencias MySQL e o plano de migracao gradual para Postgres ficam em `docs/22-migracao-mysql-postgres.md`. A decisao mais importante: remover MySQL dos modulos internos e viavel por etapas, mas remover MySQL 100% exige tratar WordPress como excecao temporaria ou substituir/desacoplar a parte WordPress.

## Tabelas do core de autenticacao em Postgres

Criadas por `apps/core-auth/src/sync-users.ts`:

- `core_users`: usuarios internos sincronizados de `wf_users`, preservando hash, role, status, `legacy_mysql_id` e ids antigos.
- `core_audit_logs`: auditoria compartilhada curta para eventos de login/acoes dos apps Node.
- `core_login_rate_limits`: base compartilhada para limitadores de login dos modulos que usam `core_users`.
- `core_user_module_permissions`: permissoes por modulo administradas em `/usuarios/`.
- `core_user_xp_links`: vinculo logico entre login interno e funcionario em `xp_employees`, sem FK entre bancos.
- `core_user_whatsapp_links`: vinculo seguro entre login interno e contatos da allowlist do Miauby WhatsApp, guardando `contact_id`, mascara, nome, status e cards liberados, sem telefone cru.
- `core_user_audit_events`: historico central de criacao, atualizacao, desativacao, permissoes e vinculo XP do modulo Usuarios.
- `usuarios_sessions`: sessoes web do modulo Usuarios gerenciadas por `connect-pg-simple`.

Cotacao, Gestao, Pedidos, Tarefa, Codigos, Cashback, XP, Financeiro e Usuarios usam `core_users` como fonte unica de login, sem dependencia MySQL no app. Miauby PHP usa `core_users` como fonte principal, mantendo fallback MySQL apenas como rollback opt-in por variaveis de ambiente enquanto existir. Usuarios cria novos logins diretamente no core usando `legacy_mysql_id` negativo para evitar conflito com ids positivos vindos do MySQL legado.

## Tabelas do Cashback em Postgres

Criadas por `apps/cashback/src/server.ts`:

- `cashback_attendants`: atendentes importados de `wf_atendentes`, com `legacy_mysql_id`.
- `cashback_clients`: clientes importados de `wf_clientes`, com telefone, nascimento, status, atendente e `legacy_mysql_id`.
- `cashback_purchases`: compras do Cashback, com dinheiro em centavos, percentual em basis points, compra vinculada ao cliente/atendente e opcionalmente ao resgate.
- `cashback_credits`: creditos gerados, saldo restante, validade e status.
- `cashback_redemptions`: resgates de cashback com valor da compra, valor usado, cliente, atendente e usuario criador.
- `cashback_redemption_items`: relacao FIFO entre resgate e creditos consumidos.
- `cashback_settings`: configuracoes como percentual, validade, multiplicador de resgate e manutencao.
- `cashback_whatsapp_messages`: mensagens/campanhas do Cashback, status e datas de envio.
- `cashback_audit_events`: auditoria curta do modulo.
- `cashback_migration_runs`: historico da importacao idempotente MySQL -> Postgres.
- `cashback_sessions`: sessoes web do app Node (`WFCASHBACK`).

A fonte oficial apos o corte e o Postgres `wimifarma_cashback`. Desde 2026-05-30, o app Cashback nao possui `mysql2`, importador, espelho, log ou fallback MySQL; `wf_*` relacionado ao Cashback permanece apenas como referencia historica/backup para rollback por restauracao de versao anterior.

## Tabelas do Miauby WhatsApp em Postgres

Criadas por `apps/miauw-whatsapp/src/server.ts`:

- `miauw_whatsapp_contacts`: contatos vistos/autorizados, com telefone em hash, mascara e numero cifrado quando necessario para envio/edicao logada, sem telefone cru em texto aberto. Tambem guarda vinculo opcional com `core_users` por `linked_user_id`, `linked_username_snapshot`, `linked_by`, `linked_at` e `link_updated_at`.
- `miauw_whatsapp_events`: webhooks recebidos da Evolution API ou Meta Cloud API, dedupe por provider/instancia/message id, status da fila, tentativas, metadados sanitizados em `JSONB`, hash/mascara e identificadores cifrados para resposta. Midias como audio e imagem de comprovante Pix guardam somente referencia/metadados sanitizados, nunca bytes ou URL/token bruto.
- `miauw_whatsapp_outbox`: respostas pendentes/enviadas, status de envio, tentativas e id retornado pelo provedor quando houver.

O Postgres dedicado foi escolhido para esse dominio porque fila duravel, indices parciais, `JSONB`, locks transacionais e `FOR UPDATE SKIP LOCKED` reduzem risco de duplicidade e facilitam auditoria. Payload bruto externo, token, telefone cru, SQL e stack trace nao devem ser salvos.

## Tabelas sombra do Miauby interno em Postgres

Criadas por `apps/miauby/src/shadow-migrate.ts` no banco `wimifarma_miauby`:

- `miauby_schema_migrations`: controle das migracoes sombra aplicadas.
- `miauby_migration_runs`: historico de execucoes do migrador, modo, resumo e status.
- `miauby_conversations`: copia sanitizada de `miauw_conversas`.
- `miauby_messages`: copia sanitizada de `miauw_mensagens`.
- `miauby_training_examples`: copia sanitizada de `miauw_treinos_respostas`.
- `miauby_memories`: copia sanitizada de `miauw_memorias`.
- `miauby_knowledge`: copia sanitizada de `miauw_conhecimentos`.
- `miauby_alerts`: copia sanitizada de `miauw_alertas`.
- `miauby_alert_events`: copia sanitizada de `miauw_alerta_eventos`.
- `miauby_patterns`: copia sanitizada de `miauw_padroes`.
- `miauby_tool_traces`: copia sanitizada de `miauw_tool_traces`.
- `miauby_settings`: copia sanitizada de `miauw_configuracoes`.
- `miauby_farmacia_popular_values`: copia sanitizada de `miauw_farmacia_popular_valores`.
- `miauby_farmacia_popular_updates`: copia sanitizada de `miauw_farmacia_popular_atualizacoes`.

Essa fase preserva `legacy_mysql_id`, campos auxiliares de usuario/conversa/status, checksum e `payload_sanitized` em `JSONB`. O migrador redige chaves, tokens, senhas, payload bruto, SQL bruto, stack trace, telefone e midia. O PHP continua fonte oficial de `/miauw/` ate existir paridade validada.

## Tabelas da Cotacao V2 em Postgres

Criadas por `apps/cotacao/src/server.js`:

- `cotacao_v2_quotes`: cotacoes/planilhas ativas.
- `cotacao_v2_columns`: colunas configuraveis da grade.
- `cotacao_v2_rows`: linhas da planilha, com UUID estavel, posicao, valores JSONB e versao.
- `cotacao_v2_events`: eventos de edicao/importacao/regras para sincronizacao em tempo real.
- `cotacao_v2_rules`: regras de formatacao condicional explicitas, com `show_timestamp` para habilitar hover de data/hora da criacao da regra.
- `cotacao_v2_styles`: estilos manuais por linha, coluna ou celula.
- `cotacao_v2_column_audit`: historico de renomeacao/reordenacao de distribuidoras.

A Cotacao V2 autentica somente no core `core_users`, sem abrir conexao MySQL e sem fallback `wf_users`. Os dados da planilha nova ficam no Postgres. Redis guarda sessoes e presenca temporaria, nao historico.

## Tabelas da Gestao em Postgres

Criadas por `apps/gestao/src/server.ts`:

- `gestao_schema_migrations`: controle simples de migracoes/importacoes aplicadas.
- `gestao_accounts`: contas administrativas, com titulo, categoria livre, status, total em centavos, competencia, vencimento opcional (`due_at`), ciclo de repeticao para o proximo mes (`repeat_next_month`), ordem manual no painel Mensal (`monthly_sort_order`), origem de copia mensal (`repeated_from_account_id`), arquivamento de canceladas para ocultar da tela (`archived_at`, `archived_by`), datas e usuario criador.
- `gestao_account_items`: itens que formam o total da conta, como salario, aumento, comissao, boleto, parcela, juros, multa ou diferenca; cada item pode ter vencimento proprio em `due_at` quando nasce pelo modulo Pedidos, e pode ser cancelado e reaberto sem apagar historico.
- `gestao_account_payments`: pagamentos datados por conta, permitindo abater o saldo em partes, formar o extrato da conta e somar no mes correto; pagamentos podem ser gerais da conta ou vinculados a qualquer lancamento aberto por `item_id`, e tambem podem ser cancelados sem exclusao fisica.
- `gestao_audit_events`: auditoria interna do modulo, com acao, usuario e resumo sanitizado.
- `gestao_sessions`: sessoes web da Gestao gerenciadas por `connect-pg-simple`.
- `gestao_notepad_notes`: bloco de notas administrativo lateral, com edicao e exclusao logica por `deleted_at`.
- `pedidos_sessions`: sessoes web do modulo Pedidos gerenciadas por `connect-pg-simple`.
- `pedidos_orders`: pedidos registrados/aguardando chegada, vinculados por `account_id` a uma conta financeira da categoria `Boleto`.
- `pedidos_confirmed_orders`: pedidos que ja tiveram chegada confirmada, com `lifecycle` `confirmado`, `historico` ou `cancelado`, datas de confirmacao/finalizacao e usuario responsavel por cada etapa.
- `gestao_supplier_orders`: tabela legada de pedidos criados antes da separacao; fica preservada como compatibilidade/fonte de migracao para `pedidos_orders` e `pedidos_confirmed_orders`, nao como fonte nova da tela.

A Gestao autentica somente no core `core_users`, grava auditoria curta em `core_audit_logs` e eventos de dominio em `gestao_audit_events`; desde 2026-05-30 nao espelha `wf_logs`, nao usa `wf_users`, nao importa MySQL em runtime e nao possui `mysql2`. Pedidos usa o mesmo core como login unico, registra auditoria em `core_audit_logs` e `gestao_audit_events`, e nao escreve mais `wf_logs`. O dinheiro oficial da Gestao/Pedidos no Postgres usa centavos inteiros, nao decimal flutuante.

## Tabelas da Tarefa em Postgres

Criadas por `apps/tarefa/src/server.ts`:

- `tarefa_tasks`: tarefas internas com prioridade, titulo, descricao, status, datas de criacao/atualizacao/conclusao/cancelamento e `legacy_mysql_id` para reconciliacao com `wf_tarefas`. Tarefas privadas usam `assigned_core_user_id`, `assigned_username_snapshot`, `delegated_by` e `delegated_at` para aparecer somente ao usuario delegado.
- `tarefa_audit_events`: auditoria curta de criacao, edicao e mudanca de status.
- `tarefa_sessions`: sessoes web do modulo Tarefa gerenciadas por `connect-pg-simple`.

A fonte oficial apos o corte e `tarefa_tasks`. O MySQL `wf_tarefas` fica apenas como referencia historica/backup; desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` nem flags `TAREFA_LEGACY_MYSQL_*`. Tarefas privadas nunca devem ser espelhadas para `wf_tarefas`, porque o legado nao possui escopo por usuario.

## Tabelas de Codigos em Postgres

Criadas por `apps/codigos/src/server.ts`:

- `codigos_groups`: blocos visuais por prefixo de EAN, incluindo os padroes `20`, `40` e `outros`, com `legacy_mysql_id` para reconciliacao com `wf_codigos_blocos`.
- `codigos_items`: atalhos de itens com comissao diferente, com codigo, EAN, preco em centavos, grupo visual, ordem, exclusao logica e `legacy_mysql_id` para reconciliacao com `wf_codigos_comissao`.
- `codigos_audit_events`: auditoria curta de criacao, edicao, reordenacao, exclusao logica e exclusao de blocos.
- `codigos_sessions`: sessoes web do modulo Codigos gerenciadas por `connect-pg-simple`.

A fonte oficial apos o corte e o Postgres `wimifarma_codigos`. O MySQL `wf_codigos_comissao` e `wf_codigos_blocos` fica apenas como referencia historica/backup; desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` nem flags `CODIGOS_LEGACY_MYSQL_*`.

## Tabelas do Financeiro em Postgres

Criadas por `apps/financeiro/src/server.ts`:

- `financeiro_closings`: fonte oficial de fechamentos diarios, reconciliavel com `financeiro_fechamentos`, com valores financeiros em centavos e `legacy_mysql_id`.
- `financeiro_entries`: fonte oficial de lancamentos gerais, reconciliavel com `financeiro_lancamentos`, com categoria, valor, observacao, status e `legacy_mysql_id`.
- `financeiro_sangrias`: sangrias importadas/reconciliaveis de `financeiro_sangrias`, mantidas para paridade historica e relatorios.
- `financeiro_card_entries`: maquininha importada/reconciliavel de `financeiro_maquininhas`, mantida para paridade historica e relatorios.
- `financeiro_pix_entries`: PIX importado/reconciliavel de `financeiro_pix`, mantido para paridade historica e relatorios.
- `financeiro_settings`: configuracoes do modulo importadas de `financeiro_configuracoes`.
- `financeiro_audit_events`: auditoria oficial do Financeiro Node/Postgres, com usuario, acao, resumo e dados sanitizados em JSONB, reconciliavel com `financeiro_auditoria`.
- `financeiro_migration_runs`: historico de importacoes/checksums.
- `financeiro_internal_idempotency`: idempotencia de chamadas internas do Miauby/WhatsApp.
- `financeiro_sessions`: sessoes do app Node (`WFFINANCEIRO`).

A fonte oficial do Financeiro e o Postgres `wimifarma_financeiro`. Desde 2026-05-30, o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` nem flags `FINANCEIRO_LEGACY_MYSQL_*`; o MySQL `financeiro_*` fica como referencia historica/backup, e rollback exige restaurar versao anterior e backup validado.

## Tabelas em `wimifarma_app`

Inventario real observado em 2026-05-10:

- `wf_users`: usuarios internos.
- `wf_clientes`: historico/importacao antiga de clientes do Cashback; a escrita oficial nova usa Postgres `cashback_clients`.
- `wf_atendentes`: historico/importacao antiga de atendentes do Cashback; a escrita oficial nova usa Postgres `cashback_attendants`.
- `wf_compras`: historico/importacao antiga de compras do Cashback; a escrita oficial nova usa Postgres `cashback_purchases`.
- `wf_cashback_creditos`: historico/importacao antiga de creditos; a escrita oficial nova usa Postgres `cashback_credits`.
- `wf_resgates`: historico/importacao antiga de resgates; a escrita oficial nova usa Postgres `cashback_redemptions`.
- `wf_resgate_itens`: historico/importacao antiga da relacao entre resgate e credito; a escrita oficial nova usa Postgres `cashback_redemption_items`.
- `wf_settings`: historico/importacao antiga de configuracoes do Cashback; a escrita oficial nova usa Postgres `cashback_settings`.
- `wf_logs`: logs/auditoria geral e espelho temporario de modulos em corte.
- `wf_login_rate_limits`: limitador persistente legado dos logins PHP internos, mantido apenas para rollback MySQL; com `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`, o limitador oficial usa `core_login_rate_limits` no Postgres.
- `wf_whatsapp_mensagens`: historico/importacao antiga de mensagens e campanhas do Cashback; a escrita oficial nova usa Postgres `cashback_whatsapp_messages`.
- `wf_codigos_comissao`: legado historico/backup de Codigos; a escrita oficial nova usa Postgres `codigos_items`.
- `wf_codigos_blocos`: legado historico/backup dos blocos de Codigos; a escrita oficial nova usa Postgres `codigos_groups`.
- `wf_xp_employees`: referencia historica/backup de funcionarios do XP; a escrita oficial nova usa Postgres `xp_employees`.
- `wf_xp_sales`: referencia historica/backup de vendas do XP; a escrita oficial nova usa Postgres `xp_sales`.
- `wf_xp_settings`: referencia historica/backup de configuracoes do XP; a escrita oficial nova usa Postgres `xp_settings`.
- `wf_tarefas`: legado/importacao/espelho temporario da Tarefa; a escrita oficial nova usa Postgres `tarefa_tasks`.
- `cotacao_blocos`: blocos de cotacao.
- `cotacao_fornecedores`: fornecedores por bloco.
- `cotacao_categorias`: categorias por bloco.
- `cotacao_itens`: itens cotados, status, ordem, observacoes e formatacao.
- `cotacao_precos`: precos por item e fornecedor.
- `cotacao_auditoria`: auditoria da cotacao.
- `cotacao_regras_formatacao`: regras visuais/formatacao.
- `cotacao_sync_estado`: estado de versao/sync e filtros legados/diagnosticos; filtros da tela ficam local-first por padrao.
- `cotacao_eventos`: fila incremental de eventos da Cotacao, usada por `sync_events_pull` para evitar snapshot completo a cada alteracao.
- `cotacao_presencas`: presenca temporaria de usuarios na Cotacao, com client id, usuario, filtro atual, item/linha/coluna em foco e estado de edicao.
- `financeiro_fechamentos`: fechamento diario.
- `financeiro_sangrias`: sangrias por fechamento.
- `financeiro_maquininhas`: lancamentos de maquininha.
- `financeiro_pix`: lancamentos PIX.
- `financeiro_lancamentos`: lancamentos gerais.
- `financeiro_configuracoes`: configuracoes do modulo financeiro.
- `financeiro_auditoria`: auditoria financeira.
- `gestao_contas`: legado MySQL/importacao da Gestao PHP; a escrita oficial nova usa Postgres `gestao_accounts`.
- `gestao_conta_itens`: legado MySQL/importacao dos itens da Gestao PHP.
- `gestao_conta_pagamentos`: legado MySQL/importacao dos pagamentos da Gestao PHP.
- `miauw_conversas`: conversas do Miauby.
- `miauw_mensagens`: mensagens do Miauby.
- `miauw_conhecimentos`: base de conhecimento.
- `miauw_memorias`: memorias internas.
- `miauw_configuracoes`: configuracoes.
- `miauw_alertas`: alertas inteligentes.
- `miauw_alerta_eventos`: eventos de alertas.
- `miauw_padroes`: padroes detectados.
- `miauw_tool_traces`: rastreabilidade do Miauby por conversa/request/tool, incluindo status, risco, confirmacao e resumo sanitizado.
- `miauw_treinos_respostas`: exemplos de treino do Miauby coletados no chat e revisados por status/versao antes de entrar no contexto aprovado.
- `miauw_farmacia_popular_valores`: valores de referencia.
- `miauw_farmacia_popular_atualizacoes`: historico de atualizacao.

## Tabelas em `wimifarma_wp`

Inventario real observado em 2026-05-10:

- `wptl_commentmeta`
- `wptl_comments`
- `wptl_cookieadmin_consents`
- `wptl_cookieadmin_cookies`
- `wptl_links`
- `wptl_loginizer_logs`
- `wptl_options`
- `wptl_postmeta`
- `wptl_posts`
- `wptl_term_relationships`
- `wptl_term_taxonomy`
- `wptl_termmeta`
- `wptl_terms`
- `wptl_usermeta`
- `wptl_users`
- `wptl_wfwc_attendants`
- `wptl_wfwc_cashback_credits`
- `wptl_wfwc_cashback_usages`
- `wptl_wfwc_clients`
- `wptl_wfwc_logs`
- `wptl_wfwc_purchases`

## Criacao e atualizacao de schema

Alguns modulos criam ou ajustam tabelas automaticamente ao acessar funcoes:

- Cashback: `site/cashback/functions.php`
- Cotacao V2: `apps/cotacao/src/server.js`
- Financeiro: `apps/financeiro/src/server.ts`; `site/financeiro` fica como legado/assets visuais.
- Usuarios: `apps/usuarios/src/server.ts`
- Gestao: `apps/gestao/src/server.ts`
- XP: `apps/xp/src/server.ts`
- Tarefas: `apps/tarefa/src/server.ts`
- Codigos: `apps/codigos/src/server.ts`
- Miauby: `site/miauw/miauw-funcoes.php` e `site/miauw/miauw-intelligence.php`
- Miauby WhatsApp: `apps/miauw-whatsapp/src/server.ts`

Essa abordagem preserva compatibilidade na migracao, mas deve evoluir para migracoes versionadas.

## Regras de negocio que precisam ser preservadas

- `wf_cashback_creditos` depende de cliente/compra e controla saldo restante.
- `wf_resgate_itens` liga resgates a creditos consumidos.
- `core_login_rate_limits` e o limitador oficial dos logins PHP internos quando o auth core esta ativo; `wf_login_rate_limits` fica como rollback legado. Essas tabelas nao guardam usuario em texto puro na chave operacional, usam hashes para bloqueio e podem ser limpas sem afetar usuarios, sessoes ou historico financeiro.
- Codigos deve manter `codigo`, `ean` e `preco` editaveis por autosave; a separacao visual em blocos de EAN vem do prefixo de dois digitos do campo `ean`. `codigos_groups` guarda os blocos criados pela tela, inclusive vazios, com `EAN 20` e `EAN 40` como padrao. A reordenacao por arrastar usa `sort_order` dos itens dentro do grupo visual. Apagar pela tela marca `deleted_at` no Postgres e nao espelha mais para MySQL.
- `xp_employees` e a fonte de verdade dos funcionarios na trilha XP; remover pela tela marca `status='inativo'` e `deleted_at`, sem apagar vendas antigas. O ADM usa `system_key='adm'`, aparece como perfil protegido para receber XP, pode ter nome/foto editados e nao pode ser excluido pelos controles comuns de usuario.
- `xp_sales.amount_cents` guarda venda em centavos inteiros, `xp_sales.xp_points` guarda o XP calculado no momento do lancamento e `xp_sales.note` guarda a observacao opcional exibida em `Ultimos lancamentos`. A regra atual e R$ 1.000,00 = 2.500 XP; o nivel 1 exige 30.000 XP para passar e os niveis seguintes usam progressao crescente por `xp_required_for_next_level()`. O schema do XP garante indice para leituras por venda ativa, funcionario e mes.
- Vendas XP canceladas preenchem `deleted_at`/`deleted_by` e saem dos totais, preservando historico e logs.
- Fotos do XP ficam fora do banco em `site/xp/uploads/funcionarios/` ou `site/xp/uploads/adm/`; o banco guarda somente caminho relativo validado.
- `xp_settings.adm_photo_path` guarda a foto da moldura ADM, separada das fotos dos funcionarios.
- `cotacao_precos` depende de item e fornecedor.
- As tabelas antigas `cotacao_*` em MySQL ficam como legado historico da Cotacao PHP e nao devem receber nova logica de planilha.
- `cotacao_v2_rows.id` e o ID estavel de linha da Cotacao V2.
- `cotacao_v2_rows.values` guarda os campos da linha como JSONB; saves devem alterar apenas a celula enviada.
- `cotacao_v2_rules` e a unica origem de cor automatica da Cotacao V2.
- `cotacao_v2_rules.show_timestamp` controla apenas tooltip visual de data/hora; nao deve virar estado operacional nem gatilho de alerta.
- `cotacao_v2_styles` guarda cor manual e nao deve virar regra de negocio escondida.
- `cotacao_v2_column_audit` registra mudancas estruturais de distribuidoras; nao usar para colunas fixas.
- Import/export Google Sheets usa a coluna logica `cotacao_row_id` para preservar IDs estaveis no Postgres.
- `cotacao_sync_estado` e chave para futura sincronizacao com planilhas.
- `cotacao_sync_estado.filtro_categoria` nao deve ser tratado como fonte de verdade visual enquanto filtros local-first estiverem ativos; termos legados sao sanitizados pelo schema.
- `cotacao_itens.versoes` e `cotacao_precos.versao` guardam versoes por campo/preco e devem ser preservados para evoluir conflito por campo.
- `cotacao_eventos` nao substitui auditoria completa; ele e o caminho operacional para sincronizacao incremental entre abas/computadores.
- Regras de `cotacao_regras_formatacao` baseadas em categoria para os termos historicos `geral`, `urgente`, `urgencia`, `urgência`, `encomenda` e `cotacao/cotação` ficam inativas por seguranca; esses termos nao devem acionar cor/prioridade automaticamente.
- `cotacao_itens.categoria` deve ter default vazio. Categoria vazia nao deve virar `geral` automaticamente.
- Saves comuns de linhas existentes devem preservar `cotacao_itens.ordem`; reordenacao precisa ser acao explicita, nao efeito colateral de editar categoria.
- `cotacao_presencas` nao e historico permanente; registros antigos sao limpos automaticamente por atividade.
- Redis de presenca da Cotacao V2 tambem nao e historico permanente.
- `financeiro_*` precisa preservar auditoria e divergencias.
- `core_user_module_permissions` e a fonte central para liberar ou bloquear cards/modulos por usuario. Na primeira fase, linhas ausentes significam acesso legado preservado; usuarios criados pelo painel ja recebem linhas explicitas por modulo.
- `core_user_xp_links.xp_employee_id` aponta logicamente para `xp_employees.id`; nao criar FK entre bancos. O nome do funcionario fica como snapshot operacional para auditoria e leitura rapida.
- `core_user_audit_events` deve registrar mudancas de usuarios sem senha, token ou payload bruto. Excluir usuario no painel significa desativar (`active=false`), nao apagar fisicamente.
- `tarefa_tasks.status` aceita apenas `aberta`, `concluida` e `cancelada`; `priority` aceita `alta`, `normal` e `baixa`. Concluir/cancelar/reabrir nao apaga tarefa; apenas muda status, datas e auditoria.
- Em `financeiro_fechamentos`, `status='sem_movimento'` marca um dia sem venda/movimento e pode ser criado pelo Caixa ou pelo Relatorio. Esse status nao e bloqueio final: somente `fechado` e `divergente` travam edicao normal; quando o faturamento de um dia `sem_movimento` recebe valor positivo pelo Relatorio, o registro volta para `conferencia` e continua linkado ao Caixa.
- Comprovante Pix CNPJ lido pelo Miauby WhatsApp nao cria tabela nova: apos confirmacao `Sim`, entra por endpoint interno tokenizado do Financeiro Node como `financeiro_entries.category='Pix CNPJ'` no dia extraido, com observacao sanitizada contendo destino, pagador, horario e origem da leitura. Confirmacao `Nao`, destino divergente ou campos ausentes nao gravam nada.
- `gestao_accounts.total_cents` deve ser a soma dos itens ativos em `gestao_account_items.amount_cents`; contas novas salvam `generated_at` automaticamente e pagamentos ativos entram em `gestao_account_payments` com `paid_at` proprio.
- O total mensal pago da Gestao vem de `gestao_account_payments.amount_cents` ativo pelo intervalo de `paid_at`; `gestao_accounts.paid_at` representa a data de quitacao da conta inteira quando o saldo chega a zero.
- A Gestao permite adicionar itens depois do lancamento, como juros ou diferencas; isso aumenta `total_cents` e pode reabrir uma conta paga se o saldo voltar a existir. Pagamentos parciais nunca alteram o valor lancado: eles entram apenas em `gestao_account_payments`, abatendo o saldo.
- Pagamentos vinculados a `gestao_account_payments.item_id` tambem respeitam o saldo geral da conta para nao duplicar pagamento quando ja existe pagamento geral antigo.
- Cancelar fatura, lancamento ou pagamento deve marcar status/cancelamento, nao apagar fisicamente. Pagamentos cancelados nao contam no total pago do mes.
- O botao de quitacao da Gestao deve registrar somente o saldo restante como novo pagamento final, preservando no extrato os pagamentos anteriores e qualquer juros/adicao posterior.
- A Gestao nao deve apagar fisicamente contas; cancelamento ou reabertura muda status e registra `gestao_audit_events`/`core_audit_logs`, preservando itens e pagamentos lancados. Quando o operador "exclui" uma conta cancelada, o sistema apenas preenche `archived_at`/`archived_by` para tirar da tela e dos totais visiveis, mantendo a trilha no Postgres.
- Categoria da Gestao e texto livre, mas a tela agrupa por chave normalizada apenas na aplicacao: remove acentos, ignora maiusculas/minusculas e junta espacos/pontuacao. O texto original da categoria continua preservado em `gestao_accounts.category`; `aluguel`, `Aluguel` e `ALUGUEL` aparecem juntos, enquanto `boleto agua` e `boleto energia` continuam separados.
- Vencimento (`due_at`) e independente da competencia mensal e de `paid_at`; ele serve para ordenar urgencia e pode ser alterado ou removido sem recalcular o valor da conta.
- Repetir uma conta para o mes seguinte cria ou garante de forma idempotente novo registro em `gestao_accounts` com `status='pendente'`, nova `generated_at`, mesmos itens ativos em `gestao_account_items`, vencimento avancado em um mes quando houver `due_at`, nenhum pagamento em `gestao_account_payments` e `repeated_from_account_id` apontando para a origem; desligar o ciclo muda `repeat_next_month=false` sem apagar copia ja criada. A ordenacao manual do painel Mensal fica em `gestao_accounts.monthly_sort_order`, atualizada apenas por contas da competencia atual com `repeat_next_month=true`, sem alterar valor, status, itens ou pagamentos.
- Renomear uma conta altera apenas `gestao_accounts.title`, sem recalcular valores nem apagar itens, pagamentos ou auditoria.
- Pedidos de fornecedores nunca guardam dinheiro em tabela paralela: cada pedido cria uma `gestao_accounts` na categoria `Boleto`, as parcelas/valores entram em `gestao_account_items` com vencimento proprio opcional por parcela (`due_at`) e pagamentos parciais/totais entram em `gestao_account_payments`. Assim, o resumo mensal e a categoria `Boleto` da Gestao continuam sendo a fonte oficial do controle financeiro.
- Em Pedidos, `gestao_accounts.due_at` e mantido como vencimento geral derivado da menor `gestao_account_items.due_at` ativa. A ordenacao e os alertas de `Confirmados` usam essa data efetiva para que o boleto/parcela mais proximo apareca primeiro sem duplicar dinheiro em outra tabela.
- Contas vinculadas a `pedidos_orders` ou `pedidos_confirmed_orders` devem permanecer na categoria `Boleto`; a recategorizacao em lote bloqueia categorias que contem pedidos vinculados para nao quebrar os totais financeiros pedidos pelo fluxo.
- `pedidos_orders` controla a fila de pedidos feitos/aguardando chegada. Confirmar chegada preenche `moved_to_confirmed_at` e cria/atualiza o registro correspondente em `pedidos_confirmed_orders`.
- Quando um pedido e criado com `Ja chegou, so pagar`, `pedidos_orders.moved_to_confirmed_at` ja nasce preenchido e `pedidos_confirmed_orders` recebe o registro `confirmado` no mesmo fluxo transacional.
- `pedidos_confirmed_orders.lifecycle` controla a operacao depois da chegada: `confirmado` ja chegou e aguarda pagamento/saldo, `historico` significa recebido e quitado, e `cancelado` preserva o vinculo quando a conta vinculada e cancelada. Confirmar chegada de pedido ja pago move direto para `historico`.
- `pedidos_orders` alimenta o badge do card `Pedidos` na home via `/pedidos/api/badge`, contando todos os pedidos ainda em `Aguardando chegada`; `expected_arrival_at` continua disponivel no JSON apenas para compatibilidade e ordenacao. No formulario de criacao, a previsao e informada como numero de dias (`2` = hoje + 2 dias); o backend grava somente a data calculada em `expected_arrival_at`.
- Novos cards/modulos devem ter modelagem propria de banco antes da UI: entidade principal, tabela de historico/auditoria quando necessario, FKs, constraints, indices em joins/filtros, indices parciais para filas ou status ativos, e regra clara de qual tabela e fonte de verdade. Reaproveitar tabela de outro modulo so quando ela representar o mesmo fato de negocio; no caso de Pedidos, apenas o financeiro usa as tabelas da Gestao porque precisa alimentar `Boleto`.
- `miauw_*` pode conter dados de conversa, memoria e diagnostico; tratar como sensivel.
- `miauw_whatsapp_*` no Postgres dedicado contem eventos de transporte do WhatsApp; tratar como sensivel, manter identificadores cifrados, hash/mascara para auditoria e nunca guardar payload bruto externo, bytes de audio/imagem ou URL/token de midia.
- `miauw_memorias.revisao_status` e `miauw_padroes.revisao_status` controlam revisao no painel do Miauby com valores `pendente`, `aprovado` e `ignorado`; `reviewed_by` e `reviewed_at` preservam quem marcou a revisao e quando.
- Aprovar ou ignorar memoria/padrao nao apaga dados; apenas marca revisao e registra evento em `wf_logs`.
- `miauw_tool_traces.payload_json` deve guardar somente contexto sanitizado e limitado; nao colocar chave, token, senha, SQL cru, payload bruto externo ou stack trace completo.
- `miauw_tool_traces.requer_confirmacao` marca acoes fortes que precisaram de confirmacao humana antes da escrita real.
- `miauw_treinos_respostas` deve ser append/versionado: feedback do chat nasce pendente, revisao aprova/rejeita/supera, e ajuste de item ja aprovado cria nova versao em vez de apagar o exemplo original.
- So registros `miauw_treinos_respostas.status='aprovado'` podem entrar no contexto de estilo do Miauby; exemplos devem ser sanitizados e nao conter segredos, tokens, senha, CPF/telefone sem necessidade ou bastidor tecnico.
- A Fase 17 usa os registros aprovados para montar perfil compilado em memoria por request; isso nao cria nova tabela e nao apaga exemplos antigos.
- A Fase 18 adiciona perfis de voz/tom e contrato de audio apenas em codigo/configuracao; nao cria tabela nova, nao grava audio e nao armazena transcricao/TTS.
- `wptl_options` guarda URLs do WordPress e pode causar redirects errados se alterado sem cuidado.

## Decisoes tecnicas ja tomadas

- Dois bancos separados: WordPress em `wimifarma_wp`; apps internos em `wimifarma_app`.
- A Cotacao V2 adiciona Postgres separado (`wimifarma_cotacao`) para reduzir risco de remendos no MySQL/PHP antigo e permitir um motor mais proximo de planilha colaborativa.
- A Cotacao PHP antiga foi removida do repositorio em 2026-05-14; as tabelas `cotacao_*` em MySQL ficam apenas como legado historico/dados antigos, enquanto a planilha oficial usa `cotacao_v2_*` no Postgres.
- A Gestao adiciona Postgres separado (`wimifarma_gestao`) para contas administrativas criticas, pagamentos parciais, auditoria e sessoes; as tabelas MySQL `gestao_*` ficam como legado historico/backup fora do runtime do app.
- O volume `mysql/` fica fora do Git.
- O volume `cotacao-data/` fica fora do Git.
- O volume `gestao-data/` fica fora do Git.
- O volume `codigos-data/` fica fora do Git.
- O volume `financeiro-data/` fica fora do Git.
- O volume `miauw-whatsapp-data/` fica fora do Git.
- Dumps antigos ficam fora da raiz do projeto.
- A senha real do banco vem de `.env`.
- A Cotacao preserva regras antigas de formatacao no banco como historico, mas `cotacao_disable_legacy_category_trigger_rules()` desativa regras ativas por texto de categoria para `geral`/`urgente`/`encomenda`/`cotacao` durante `cotacao_ensure_schema()`.

## Riscos ao alterar

- Apagar `mysql/` perde dados locais se nao houver backup.
- Mudar prefixo `wptl_` quebra WordPress.
- Alterar `wptl_options.home` e `wptl_options.siteurl` sem planejar pode redirecionar para tunel ou dominio errado.
- Mudar colunas de cotacao sem preservar ordem/formatacao prejudica futura sincronizacao com Google Sheets.
- Alterar `cotacao_presencas` sem compatibilidade pode quebrar a indicacao de usuarios ativos e selecao remota na tela.
- Alterar `cotacao_eventos` sem compatibilidade pode forcar fallback frequente para snapshot completo e reintroduzir travadas na Cotacao.
- Reativar gatilhos de categoria para `geral`/`urgente`/`encomenda`/`cotacao` pode voltar a causar mudanca invisivel de estado e lag na planilha.
- Apagar `cotacao-data/` perde dados da Cotacao V2.
- Apagar `gestao-data/` perde dados oficiais da Gestao.
- Apagar `codigos-data/` perde dados oficiais de Codigos.
- Apagar `financeiro-data/` perde a fonte oficial atual do Financeiro em Postgres e o historico de importacao/checksum. Antes de qualquer limpeza, fazer backup e confirmar rollback.
- Apagar `miauw-whatsapp-data/` perde fila, eventos e outbox do canal WhatsApp do Miauby.
- Criar regras automáticas fora de `cotacao_v2_rules` reabre o bug de palavra-gatilho.

## Pendencias

- Criar migracoes versionadas.
- Documentar chaves estrangeiras logicas de cada modulo.
- Criar backup automatizado antes de deploy.
- Ajustar URLs definitivas do WordPress apos DNS/SSL.
- Definir IDs estaveis e fonte de verdade para Cotacao + Google Sheets.
- Definir motor robusto de conflito por campo para edicao simultanea forte na Cotacao V2.
- Criar backup/restore do Postgres da Cotacao V2.

## Evolucao futura

- Expandir este documento com diagramas por modulo quando a modelagem estabilizar.
- Adicionar scripts de backup/restore.
- Criar migrador com historico de versao.
- Criar testes de integridade para Cashback, Cotacao e Financeiro.
