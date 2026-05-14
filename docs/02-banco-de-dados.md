# 02 - Banco de dados

## O que esta parte do sistema faz

O banco guarda dados do WordPress, dos modulos internos e da Cotacao V2. A migracao trouxe dados do HostGator para MySQL local em Docker; a Cotacao V2 usa Postgres separado para a nova planilha em tempo real.

## Servicos e arquivos envolvidos

- Container: `wimifarma-com-db`
- Imagem: `mysql:8.0`
- Volume local: `mysql/`
- Container Cotacao V2: `wimifarma-cotacao-db`
- Imagem Cotacao V2: `postgres:17-alpine`
- Volume Cotacao V2: `cotacao-data/postgres/`
- Redis Cotacao V2: `wimifarma-cotacao-redis`, volume `cotacao-data/redis/`
- Init SQL: `docker/mysql/init/01-create-databases.sql`
- Config web: `docker-compose.yml`
- Config app: `site/cashback/config.php`
- Config WordPress: `site/wp-config.php`

## Bancos existentes

- `wimifarma_wp`: WordPress, prefixo `wptl_`.
- `wimifarma_app`: modulos internos.
- `wimifarma_cotacao`: Cotacao V2 em Postgres.

## Tabelas da Cotacao V2 em Postgres

Criadas por `apps/cotacao/src/server.js`:

- `cotacao_v2_quotes`: cotacoes/planilhas ativas.
- `cotacao_v2_columns`: colunas configuraveis da grade.
- `cotacao_v2_rows`: linhas da planilha, com UUID estavel, posicao, valores JSONB e versao.
- `cotacao_v2_events`: eventos de edicao/importacao/regras para sincronizacao em tempo real.
- `cotacao_v2_rules`: regras de formatacao condicional explicitas, com `show_timestamp` para habilitar hover de data/hora da criacao da regra.
- `cotacao_v2_styles`: estilos manuais por linha, coluna ou celula.
- `cotacao_v2_column_audit`: historico de renomeacao/reordenacao de distribuidoras.

A Cotacao V2 autentica no MySQL `wf_users`, mas os dados da planilha nova ficam no Postgres. Redis guarda sessoes e presenca temporaria, nao historico.

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
- Cotacao V2: `apps/cotacao/src/server.js`
- Financeiro: `site/financeiro/financeiro-funcoes.php`
- Tarefas: `site/tarefa/tarefa-funcoes.php`
- Miauby: `site/miauw/miauw-funcoes.php` e `site/miauw/miauw-intelligence.php`

Essa abordagem preserva compatibilidade na migracao, mas deve evoluir para migracoes versionadas.

## Regras de negocio que precisam ser preservadas

- `wf_cashback_creditos` depende de cliente/compra e controla saldo restante.
- `wf_resgate_itens` liga resgates a creditos consumidos.
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
- `miauw_*` pode conter dados de conversa, memoria e diagnostico; tratar como sensivel.
- `wptl_options` guarda URLs do WordPress e pode causar redirects errados se alterado sem cuidado.

## Decisoes tecnicas ja tomadas

- Dois bancos separados: WordPress em `wimifarma_wp`; apps internos em `wimifarma_app`.
- A Cotacao V2 adiciona Postgres separado (`wimifarma_cotacao`) para reduzir risco de remendos no MySQL/PHP antigo e permitir um motor mais proximo de planilha colaborativa.
- A Cotacao PHP antiga foi removida do repositorio em 2026-05-14; as tabelas `cotacao_*` em MySQL ficam apenas como legado historico/dados antigos, enquanto a planilha oficial usa `cotacao_v2_*` no Postgres.
- O volume `mysql/` fica fora do Git.
- O volume `cotacao-data/` fica fora do Git.
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
