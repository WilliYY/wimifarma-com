# 02 - Banco de dados

## O que esta parte do sistema faz

O banco guarda dados do WordPress, dos modulos internos, da Cotacao V2 e da Gestao. A migracao trouxe dados do HostGator para MySQL local em Docker; Cotacao V2 e Gestao usam Postgres separados para os modulos que precisam de evolucao mais forte.

## Servicos e arquivos envolvidos

- Container: `wimifarma-com-db`
- Imagem: `mysql:8.0`
- Volume local: `mysql/`
- Container Cotacao V2: `wimifarma-cotacao-db`
- Imagem Cotacao V2: `postgres:17-alpine`
- Volume Cotacao V2: `cotacao-data/postgres/`
- Redis Cotacao V2: `wimifarma-cotacao-redis`, volume `cotacao-data/redis/`
- Container Gestao: `wimifarma-gestao-db`
- Imagem Gestao: `postgres:17-alpine`
- Volume Gestao: `gestao-data/postgres/`
- Init SQL: `docker/mysql/init/01-create-databases.sql`
- Config web: `docker-compose.yml`
- Config app: `site/cashback/config.php`
- Config WordPress: `site/wp-config.php`

## Bancos existentes

- `wimifarma_wp`: WordPress, prefixo `wptl_`.
- `wimifarma_app`: modulos internos.
- `wimifarma_cotacao`: Cotacao V2 em Postgres.
- `wimifarma_gestao`: Gestao em Postgres.

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

A Gestao autentica no MySQL `wf_users`, espelha resumo curto em `wf_logs` e importa uma vez dados legados `gestao_*` do MySQL quando essas tabelas existirem. O dinheiro oficial da Gestao no Postgres usa centavos inteiros, nao decimal flutuante.

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
- `wf_login_rate_limits`: limitador persistente dos logins PHP internos por hash de `IP + usuario`, com contagem de falhas, janela temporal e bloqueio temporario.
- `wf_whatsapp_mensagens`: mensagens e campanhas.
- `wf_codigos_comissao`: atalhos de itens com comissao diferente, com codigo, EAN, preco, ordem e exclusao logica.
- `wf_codigos_blocos`: blocos visuais do modulo Codigos por prefixo de EAN, permitindo manter blocos vazios ate o primeiro item ser cadastrado.
- `wf_xp_employees`: funcionarios/atendentes do modulo XP, com nome, caminho da foto validada, status, `system_key` opcional para players fixos do sistema e exclusao logica.
- `wf_xp_sales`: vendas lancadas para o XP, com valor em centavos, pontos inteiros, data, funcionario, usuario criador, observacao opcional e cancelamento logico.
- `wf_xp_settings`: configuracoes simples do XP, como a foto da moldura ADM.
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
- Financeiro: `site/financeiro/financeiro-funcoes.php`
- Gestao: `apps/gestao/src/server.ts`
- XP: `site/xp/xp-funcoes.php`
- Tarefas: `site/tarefa/tarefa-funcoes.php`
- Miauby: `site/miauw/miauw-funcoes.php` e `site/miauw/miauw-intelligence.php`

Essa abordagem preserva compatibilidade na migracao, mas deve evoluir para migracoes versionadas.

## Regras de negocio que precisam ser preservadas

- `wf_cashback_creditos` depende de cliente/compra e controla saldo restante.
- `wf_resgate_itens` liga resgates a creditos consumidos.
- `wf_login_rate_limits` nao guarda usuario em texto puro; usa hashes para chave operacional do limitador, preserva o IP usado no bloqueio para diagnostico e pode ser limpo sem afetar usuarios, sessoes ou historico financeiro.
- `wf_codigos_comissao` deve manter `codigo`, `ean` e `preco` editaveis por autosave; a separacao visual em blocos de EAN vem do prefixo de dois digitos do campo `ean`. `wf_codigos_blocos` guarda os blocos criados pela tela, inclusive vazios, com `EAN 20` e `EAN 40` como padrao. A reordenacao por arrastar usa a coluna `ordem` dos itens dentro do grupo visual. Apagar pela tela marca `ativo=0` e `apagado_em`, preservando o registro para auditoria basica.
- `wf_xp_employees` e a fonte de verdade dos funcionarios na trilha XP; remover pela tela marca `status='inativo'` e `deleted_at`, sem apagar vendas antigas. O ADM usa `system_key='adm'`, aparece como player fixo de teste para receber XP, e nao deve ser editado/excluido pelos controles comuns de usuario.
- `wf_xp_sales.amount_cents` guarda venda em centavos inteiros, `wf_xp_sales.xp_points` guarda o XP calculado no momento do lancamento e `wf_xp_sales.note` guarda a observacao opcional exibida em `Ultimos lancamentos`. A regra atual e R$ 1.000,00 = 2.500 XP; o nivel 1 exige 30.000 XP para passar e os niveis seguintes usam progressao crescente por `xp_required_for_next_level()`. O schema do XP garante indice aditivo `idx_xp_sales_active_employee_date` para leituras por venda ativa, funcionario e mes.
- Vendas XP canceladas preenchem `deleted_at`/`deleted_by` e saem dos totais, preservando historico e logs.
- Fotos do XP ficam fora do banco em `site/xp/uploads/funcionarios/` ou `site/xp/uploads/adm/`; o banco guarda somente caminho relativo validado.
- `wf_xp_settings.adm_photo_path` guarda a foto da moldura ADM, separada das fotos dos funcionarios.
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
- Em `financeiro_fechamentos`, `status='sem_movimento'` marca um dia sem venda/movimento e pode ser criado pelo Caixa ou pelo Relatorio. Esse status nao e bloqueio final: somente `fechado` e `divergente` travam edicao normal; quando o faturamento de um dia `sem_movimento` recebe valor positivo pelo Relatorio, o registro volta para `conferencia` e continua linkado ao Caixa.
- `gestao_accounts.total_cents` deve ser a soma dos itens ativos em `gestao_account_items.amount_cents`; contas novas salvam `generated_at` automaticamente e pagamentos ativos entram em `gestao_account_payments` com `paid_at` proprio.
- O total mensal pago da Gestao vem de `gestao_account_payments.amount_cents` ativo pelo intervalo de `paid_at`; `gestao_accounts.paid_at` representa a data de quitacao da conta inteira quando o saldo chega a zero.
- A Gestao permite adicionar itens depois do lancamento, como juros ou diferencas; isso aumenta `total_cents` e pode reabrir uma conta paga se o saldo voltar a existir. Pagamentos parciais nunca alteram o valor lancado: eles entram apenas em `gestao_account_payments`, abatendo o saldo.
- Pagamentos vinculados a `gestao_account_payments.item_id` tambem respeitam o saldo geral da conta para nao duplicar pagamento quando ja existe pagamento geral antigo.
- Cancelar fatura, lancamento ou pagamento deve marcar status/cancelamento, nao apagar fisicamente. Pagamentos cancelados nao contam no total pago do mes.
- O botao de quitacao da Gestao deve registrar somente o saldo restante como novo pagamento final, preservando no extrato os pagamentos anteriores e qualquer juros/adicao posterior.
- A Gestao nao deve apagar fisicamente contas; cancelamento ou reabertura muda status e registra `gestao_audit_events` e `wf_logs`, preservando itens e pagamentos lancados. Quando o operador "exclui" uma conta cancelada, o sistema apenas preenche `archived_at`/`archived_by` para tirar da tela e dos totais visiveis, mantendo a trilha no Postgres.
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
- `pedidos_orders.expected_arrival_at` alimenta o badge do card `Pedidos` na home via `/pedidos/api/badge`, contando somente pedidos aguardando chegada previstos para o dia local. No formulario de criacao, a previsao e informada como numero de dias (`2` = hoje + 2 dias); o backend grava somente a data calculada em `expected_arrival_at`.
- Novos cards/modulos devem ter modelagem propria de banco antes da UI: entidade principal, tabela de historico/auditoria quando necessario, FKs, constraints, indices em joins/filtros, indices parciais para filas ou status ativos, e regra clara de qual tabela e fonte de verdade. Reaproveitar tabela de outro modulo so quando ela representar o mesmo fato de negocio; no caso de Pedidos, apenas o financeiro usa as tabelas da Gestao porque precisa alimentar `Boleto`.
- `miauw_*` pode conter dados de conversa, memoria e diagnostico; tratar como sensivel.
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
- A Gestao adiciona Postgres separado (`wimifarma_gestao`) para contas administrativas criticas, pagamentos parciais, auditoria e sessoes; as tabelas MySQL `gestao_*` ficam como legado/importacao.
- O volume `mysql/` fica fora do Git.
- O volume `cotacao-data/` fica fora do Git.
- O volume `gestao-data/` fica fora do Git.
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
