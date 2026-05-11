# 02 - Banco de dados

## O que esta parte do sistema faz

O banco guarda dados do WordPress e dos modulos internos. A migracao trouxe dados do HostGator para MySQL local em Docker.

## Servicos e arquivos envolvidos

- Container: `wimifarma-com-db`
- Imagem: `mysql:8.0`
- Volume local: `mysql/`
- Init SQL: `docker/mysql/init/01-create-databases.sql`
- Config web: `docker-compose.yml`
- Config app: `site/cashback/config.php`
- Config WordPress: `site/wp-config.php`

## Bancos existentes

- `wimifarma_wp`: WordPress, prefixo `wptl_`.
- `wimifarma_app`: modulos internos.

## Tabelas em `wimifarma_app`

Inventario real observado em 2026-05-10:

- `wf_users`: usuarios internos.
- `wf_clientes`: clientes do Cashback.
- `wf_atendentes`: atendentes.
- `wf_compras`: compras do Cashback.
- `wf_cashback_creditos`: creditos gerados.
- `wf_resgates`: resgates.
- `wf_resgate_itens`: relacao entre resgate e credito.
- `wf_settings`: configuracoes do Cashback.
- `wf_logs`: logs/auditoria geral.
- `wf_whatsapp_mensagens`: mensagens e campanhas.
- `wf_tarefas`: tarefas internas.
- `cotacao_blocos`: blocos de cotacao.
- `cotacao_fornecedores`: fornecedores por bloco.
- `cotacao_categorias`: categorias por bloco.
- `cotacao_itens`: itens cotados, status, ordem, observacoes e formatacao.
- `cotacao_precos`: precos por item e fornecedor.
- `cotacao_auditoria`: auditoria da cotacao.
- `cotacao_regras_formatacao`: regras visuais/formatacao.
- `cotacao_sync_estado`: estado de versao/filtros/sync.
- `cotacao_presencas`: presenca temporaria de usuarios na Cotacao, com client id, usuario, filtro atual, item/linha/coluna em foco e estado de edicao.
- `financeiro_fechamentos`: fechamento diario.
- `financeiro_sangrias`: sangrias por fechamento.
- `financeiro_maquininhas`: lancamentos de maquininha.
- `financeiro_pix`: lancamentos PIX.
- `financeiro_lancamentos`: lancamentos gerais.
- `financeiro_configuracoes`: configuracoes do modulo financeiro.
- `financeiro_auditoria`: auditoria financeira.
- `miauw_conversas`: conversas do Miauby.
- `miauw_mensagens`: mensagens do Miauby.
- `miauw_conhecimentos`: base de conhecimento.
- `miauw_memorias`: memorias internas.
- `miauw_configuracoes`: configuracoes.
- `miauw_alertas`: alertas inteligentes.
- `miauw_alerta_eventos`: eventos de alertas.
- `miauw_padroes`: padroes detectados.
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
- Cotacao: `site/cotacao/cotacao-funcoes.php`
- Financeiro: `site/financeiro/financeiro-funcoes.php`
- Tarefas: `site/tarefa/tarefa-funcoes.php`
- Miauby: `site/miauw/miauw-funcoes.php` e `site/miauw/miauw-intelligence.php`

Essa abordagem preserva compatibilidade na migracao, mas deve evoluir para migracoes versionadas.

## Regras de negocio que precisam ser preservadas

- `wf_cashback_creditos` depende de cliente/compra e controla saldo restante.
- `wf_resgate_itens` liga resgates a creditos consumidos.
- `cotacao_precos` depende de item e fornecedor.
- `cotacao_sync_estado` e chave para futura sincronizacao com planilhas.
- `cotacao_presencas` nao e historico permanente; registros antigos sao limpos automaticamente por atividade.
- `financeiro_*` precisa preservar auditoria e divergencias.
- `miauw_*` pode conter dados de conversa, memoria e diagnostico; tratar como sensivel.
- `wptl_options` guarda URLs do WordPress e pode causar redirects errados se alterado sem cuidado.

## Decisoes tecnicas ja tomadas

- Dois bancos separados: WordPress em `wimifarma_wp`; apps internos em `wimifarma_app`.
- O volume `mysql/` fica fora do Git.
- Dumps antigos ficam fora da raiz do projeto.
- A senha real do banco vem de `.env`.

## Riscos ao alterar

- Apagar `mysql/` perde dados locais se nao houver backup.
- Mudar prefixo `wptl_` quebra WordPress.
- Alterar `wptl_options.home` e `wptl_options.siteurl` sem planejar pode redirecionar para tunel ou dominio errado.
- Mudar colunas de cotacao sem preservar ordem/formatacao prejudica futura sincronizacao com Google Sheets.
- Alterar `cotacao_presencas` sem compatibilidade pode quebrar a indicacao de usuarios ativos e selecao remota na tela.

## Pendencias

- Criar migracoes versionadas.
- Documentar chaves estrangeiras logicas de cada modulo.
- Criar backup automatizado antes de deploy.
- Ajustar URLs definitivas do WordPress apos DNS/SSL.
- Definir IDs estaveis e fonte de verdade para Cotacao + Google Sheets.
- Definir motor robusto de conflito por campo para edicao simultanea forte na Cotacao.

## Evolucao futura

- Expandir este documento com diagramas por modulo quando a modelagem estabilizar.
- Adicionar scripts de backup/restore.
- Criar migrador com historico de versao.
- Criar testes de integridade para Cashback, Cotacao e Financeiro.
