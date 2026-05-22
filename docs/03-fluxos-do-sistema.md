# 03 - Fluxos do sistema

## O que esta parte documenta

Este documento descreve os fluxos reais encontrados no sistema e os cuidados para evoluir cada um.

## Fluxo de acesso

Entrada publica:

- `/`: home/portal independente em `site/home.php`, com fundo visual em tela inteira, logo oficial SVG atualizada, GIFs decorativos com movimento reaproveitado dos logins e cards inferiores de acesso aos modulos.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe badge vermelho quando houver tarefas abertas.
- O card `Pedidos` abre `/pedidos/`, ao lado de `Cotacao`, com badge de pedidos previstos para chegar hoje.
- O card `XP` abre `/xp/` e usa uma moldura visual propria, aplicada somente nesse card como `border-image` de borda/cantos para destacar a entrada sem cortar a arte nem cobrir o texto.
- O card `Gestao` abre o modulo administrativo de contas a pagar manuais; os demais cards seguem na grade da home em desktop.
- A home usa no maximo cinco cards por linha no desktop; `Codigos` e `Gestao` entram na segunda linha. No mobile, os cards de acesso ficam em duas colunas compactas para reduzir rolagem e mostrar mais modulos na primeira tela.

Identidade visual validada em 2026-05-21:

- Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw carregam a logo nova nas telas de login e nas telas internas autenticadas.
- Os SVGs ativos desses modulos batem com o mesmo hash da logo oficial nova.
- `/wp-login.php` e uma tela WordPress separada e continua podendo exibir o cabecalho/logo padrao do WordPress; isso nao e regressao dos modulos internos, salvo quando a tarefa pedir customizacao do login WordPress.

Rotas de login:

- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php` (Cotacao V2 em Node.js, autenticando em `wf_users`)
- `/financeiro/login.php`
- `/gestao/login.php`
- `/pedidos/`
- `/xp/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/wp-login.php`

Os modulos PHP reaproveitam funcoes comuns do Cashback, especialmente sessao, usuario atual, CSRF, escape HTML e conexao PDO. A Cotacao V2 usa sessao propria em Redis, mas valida usuario/senha contra a mesma tabela `wf_users`.

Arquivos envolvidos:

- `site/cashback/config.php`
- `site/cashback/functions.php`
- `site/*/bootstrap.php`
- `site/*/login.php`
- `site/*/logout.php`

## Fluxo Cashback

O Cashback cobre:

- cadastro e consulta de clientes;
- registro de compras;
- geracao de creditos;
- controle de validade;
- resgates;
- relatorios;
- mensagens/WhatsApp;
- logs e configuracoes.

Arquivos principais:

- `site/cashback/index.php`
- `site/cashback/dashboard.php`
- `site/cashback/clientes.php`
- `site/cashback/compras.php`
- `site/cashback/resgates.php`
- `site/cashback/relatorio.php`
- `site/cashback/functions.php`

Tabelas principais:

- `wf_clientes`
- `wf_compras`
- `wf_cashback_creditos`
- `wf_resgates`
- `wf_resgate_itens`
- `wf_settings`
- `wf_logs`

## Fluxo Codigos

O modulo Codigos guarda atalhos operacionais para itens com comissao diferente. A tela principal funciona como planilha simples, com campos sempre editaveis para `Código`, `EAN` e `Preço`, salvando automaticamente as mudancas.

Para evitar confusao operacional, a tela separa os itens em blocos por prefixo de EAN, mantendo `EAN 20` e `EAN 40` como blocos padrao. O botao `+` cria um novo bloco pelo backend em `wf_codigos_blocos` apenas quando o usuario informa manualmente o prefixo desejado, permitindo que o bloco continue existindo mesmo antes do primeiro item. Cada tabela possui uma linha nova no rodape; quando os tres campos estao preenchidos, o item e criado automaticamente no grupo correspondente. A tela usa faixa horizontal interna para criar tabelas lado a lado e aproveitar melhor as laterais do monitor, sem criar rolagem horizontal vazia no documento inteiro.

O login de Codigos segue o padrao visual vinho/rosa dos outros logins internos, mas preserva o fluxo proprio de sessao, CSRF e autenticacao em `wf_users`.

Arquivos principais:

- `site/codigos/index.php`
- `site/codigos/api.php`
- `site/codigos/codigos-funcoes.php`
- `site/codigos/styles.css`
- `site/codigos/app.js`

Tabela principal:

- `wf_codigos_comissao`
- `wf_codigos_blocos`

Regras a preservar:

- codigo, EAN e preco devem ser editaveis sem fluxo complexo;
- edicoes devem salvar automaticamente por `/codigos/api.php`, mantendo sessao e CSRF;
- editar uma linha nao deve mover sua posicao, salvo quando o EAN mudar para outro prefixo visual;
- reordenar deve ser feito arrastando o numero da linha dentro do mesmo grupo, persistindo `ordem`;
- novos itens entram no fim do grupo visual de EAN correspondente;
- EANs com prefixos diferentes devem ficar em tabelas separadas na tela; `20` e `40` aparecem por padrao, e outros prefixos devem ser criados pelo botao `+` via `/codigos/api.php` usando o numero informado pelo usuario, sem sequencia automatica;
- apagar pela tela deve fazer exclusao logica (`ativo=0`) para reduzir risco de perda acidental;
- apagar uma tabela inteira so e permitido para blocos numericos nao padrao, exige card de confirmacao, CSRF, sessao ativa e senha operacional `wimifarma`, com suporte a override por `CODIGOS_GROUP_DELETE_PASSWORD`;
- acoes de criar, editar e apagar registram `wf_logs`.

## Fluxo XP

O modulo XP gamifica vendas dos atendentes. A tela principal fica como fase de jogo com a trilha XP horizontal em zigue-zague, sem barra de rolagem visivel dentro da fase; o perfil ADM tambem aparece como jogador visual de teste no nivel 1. A aba `Configuracoes` concentra cadastro de funcionarios, upload de fotos, filtro de mes, resumo por XP, edicao e lancamentos diarios. A equipe cadastra funcionarios, sobe uma foto e lanca os valores do dia; o backend calcula automaticamente os pontos.

Arquivos principais:

- `site/xp/index.php`
- `site/xp/login.php`
- `site/xp/xp-funcoes.php`
- `site/xp/styles.css`
- `site/xp/app.js`
- `site/xp/assets/`
- `site/xp/uploads/funcionarios/`
- `site/xp/uploads/adm/`

Tabelas principais:

- `wf_xp_employees`
- `wf_xp_sales`
- `wf_xp_settings`
- `wf_users` para login
- `wf_logs` para auditoria

Regras a preservar:

- qualquer usuario interno autenticado pode visualizar a trilha XP;
- alimentar dados exige username `adm` ou role `admin`/`gerente`;
- a navegacao do XP separa `Trilha` de `Configuracoes`; formularios e historico operacional ficam fora da tela principal da fase para evitar poluicao visual;
- a aba `Configuracoes` prioriza leitura de XP e nao exibe cards de total de venda; valores monetarios ficam como entrada operacional para gerar XP;
- formularios usam CSRF e prepared statements;
- fotos aceitam apenas JPG, PNG ou WEBP, ate 3 MB, com dimensoes entre 80x80 e 6000x6000 px;
- a moldura ADM e usada no perfil/admin do XP, com foto propria salva separada dos funcionarios;
- as pastas `site/xp/uploads/funcionarios/` e `site/xp/uploads/adm/` precisam existir e ficar gravaveis pelo Apache/PHP no VPS;
- a pasta de uploads bloqueia listagem e execucao de scripts por `.htaccess`;
- R$ 1.000,00 em vendas gera 2.500 XP, gravado como inteiro no lancamento;
- o nivel 1 exige 30.000 XP para passar; os niveis seguintes ficam progressivamente mais dificeis e nao possuem limite fixo;
- a trilha usa `Bloco XP` nos niveis comuns, `Nivel 5` a cada multiplo de 5 e `nivel 10` a cada multiplo de 10;
- cancelar venda ou remover funcionario deve ser logico, sem apagar historico fisico.

## Fluxo Cotacao

O modulo de Cotacao V2 controla uma planilha interna de farmacia com EAN, produto, quantidade, categoria, distribuidoras e ganhador calculado. A rota `/cotacao/` e servida por Node.js/Express/Socket.IO via proxy do Apache, com dados em Postgres e presenca/sessao em Redis.

A colaboracao ao vivo acontece por WebSocket: a tela mostra usuarios ativos, foco remoto de celula e atualizacoes por celula. Filtros de busca/categoria ficam locais por tela para evitar que um computador mova a visao do outro.

Arquivos principais:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`

Tabelas principais:

- Postgres `cotacao_v2_quotes`
- Postgres `cotacao_v2_columns`
- Postgres `cotacao_v2_rows`
- Postgres `cotacao_v2_events`
- Postgres `cotacao_v2_rules`
- MySQL `wf_users` para login

Regras a preservar:

- ordem/posicao das linhas;
- categoria/fornecedor;
- observacoes;
- cores, estilos e formatacao;
- auditoria;
- status.
- presenca temporaria nao deve virar historico operacional permanente.
- filtros nao devem ser sincronizados automaticamente entre computadores.
- durante digitacao em categoria, texto nao pode virar comando escondido nem alterar ordem.
- `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum; destaque visual so por regra condicional explicita.
- colagem, alca de preenchimento e desfazer/refazer de lotes devem usar batch otimista e atualizar apenas linhas afetadas quando nao houver mudanca estrutural.
- A Cotacao PHP antiga foi removida; nao existe fluxo paralelo em `site/cotacao`.
- O Miauby deve consultar e criar encomendas na Cotacao pela ponte interna tokenizada da V2 (`/cotacao/api/internal/search` e `/cotacao/api/internal/encomendas`), nao por tabelas legadas da Cotacao PHP.

## Fluxo Financeiro

O Financeiro organiza fechamento diario e conciliacao interna.

Arquivos principais:

- `site/financeiro/index.php`
- `site/financeiro/exportar.php`
- `site/financeiro/financeiro-funcoes.php`
- `site/financeiro/app.js`

Tabelas principais:

- `financeiro_fechamentos`
- `financeiro_sangrias`
- `financeiro_maquininhas`
- `financeiro_pix`
- `financeiro_lancamentos`
- `financeiro_configuracoes`
- `financeiro_auditoria`

Regras a preservar:

- status de fechamento;
- totais conferidos;
- divergencias/sobra/falta;
- justificativas;
- auditoria interna.
- Caixa e Relatorio usam a mesma linha em `financeiro_fechamentos` para cada dia. O botao `Fechar sem movimento` do Relatorio e apenas um atalho para marcar `status='sem_movimento'`, igual ao Caixa, e nao deve travar a digitacao posterior de venda/faturamento. Se depois for informado faturamento em um dia sem movimento, o dia volta para `conferencia` e fica editavel no Caixa.

Interface:

- o topo do Financeiro mostra apenas `Caixa`, `Relatorio` e `Sair`;
- a view dedicada de Auditoria nao fica disponivel na navegacao operacional;
- os registros em `financeiro_auditoria` continuam sendo gravados para suporte e rastreabilidade.

## Fluxo Gestao

A Gestao organiza contas a pagar manuais em um servico Node.js + TypeScript com Postgres dedicado. A conta principal guarda titulo, categoria livre, competencia, status e total em centavos; os itens internos guardam a composicao do valor, permitindo lancamentos como salario, aumento, comissao, boleto e juros na mesma conta. Pagamentos ficam separados e datados para permitir pagar em partes ate quitar o saldo, inclusive vinculados a um lancamento especifico quando o operador quer pagar item por item.

Arquivos principais:

- `apps/gestao/src/server.ts`
- `apps/gestao/public/styles.css`
- `apps/gestao/public/app.js`
- `apps/gestao/public/login-runner.js`
- `site/gestao/` (legado PHP; rota oficial passa pelo proxy Apache para o Node)

Tabelas principais:

- Postgres `gestao_accounts`
- Postgres `gestao_account_items`
- Postgres `gestao_account_payments`
- Postgres `gestao_audit_events`
- Postgres `gestao_sessions`
- Postgres `gestao_notepad_notes`
- Postgres `gestao_supplier_orders` (legado; Pedidos novo usa tabelas proprias)
- Postgres `pedidos_orders`
- Postgres `pedidos_confirmed_orders`
- `wf_logs`

Regras a preservar:

- acesso restrito a usuario `adm`, role `admin` ou role `gerente`;
- formularios usam sessao `WFGESTAO` em Postgres e CSRF;
- `generated_at` e automatico na criacao da conta;
- `total_cents` e calculado pelos itens, nao digitado como fonte separada;
- a categoria e texto livre, com sugestoes apenas para acelerar digitacao;
- categorias iguais por escrita diferente sao agrupadas visualmente por normalizacao de acento/caixa/espaco, preservando o texto original salvo; o painel lateral mostra bolinhas com abertas em verde e fechadas em vermelho, e clicar em uma categoria filtra as abertas primeiro e depois as fechadas daquela categoria;
- o painel de categorias permite trocar a categoria de um grupo inteiro ou cancelar somente contas abertas daquele grupo, sem apagar contas fechadas nem historico;
- a lista principal sem filtro mostra contas abertas do mes e apenas as 3 ultimas fechadas como acesso rapido; o restante fica acessivel pelo filtro de categorias para evitar lista infinita de contas ja pagas;
- a busca fica abaixo dos resumos do mes e pesquisa contas/boletos por titulo, categoria, status, valor aproximado, saldo, vencimento, data de lancamento, data de pagamento, lancamentos e pagamentos; ela mostra 10 resultados primeiro, permite `Mostrar mais` e `Limpar`;
- a conta pode ter vencimento opcional com data/hora; contas pendentes com vencimento mais proximo sobem na lista e recebem aviso visual de vencido, vence hoje ou vence em poucos dias;
- cada conta aparece como extrato proprio: lancamentos/juros ficam juntos, pagamentos parciais ficam no historico da mesma conta, e saldo/progresso sao calculados sem misturar contas;
- pagamento parcial grava linha em `gestao_account_payments` com valor e data, abatendo o saldo da conta sem mexer nos itens lancados;
- quando o pagamento parcial e feito dentro de qualquer lancamento aberto, `gestao_account_payments.item_id` liga o pagamento ao item e o backend limita o valor ao menor saldo entre item e conta;
- confirmar restante registra um pagamento final apenas do saldo aberto, muda status para `pago`, grava `gestao_accounts.paid_at` e passa a somar no total mensal pago pelo pagamento;
- adicionar item depois do lancamento, como juros ou diferenca, aumenta o total e pode voltar uma conta paga para `pendente` se houver saldo;
- cancelar ou voltar para pendente nao apaga fisicamente a conta, seus itens nem seus pagamentos;
- contas pagas podem ser reabertas para ajuste e faturas podem ser canceladas sem exclusao fisica; pagamentos cancelados deixam de contar no total pago do mes;
- contas canceladas podem ser excluidas da tela individualmente ou por categoria filtrada; isso e arquivamento logico em `archived_at`/`archived_by`, nao delete fisico, e deixa a auditoria preservada;
- lancamentos e pagamentos individuais podem ser cancelados por status, mantendo historico visivel no extrato; lancamento cancelado pode ser reaberto, mas pagamentos que ja foram cancelados continuam apenas como historico ate o operador registrar novo pagamento;
- a conta pode ser renomeada depois de lancada para reaproveitar valor/composicao em outro nome sem mexer no historico financeiro;
- `Repetir mes que vem` funciona como ciclo liga/desliga: quando ativo, garante uma copia pendente na competencia seguinte, copiando categoria, observacao, vencimento avancado e itens ativos, mas sem copiar pagamentos, cancelamentos nem status pago; desligar o ciclo nao apaga copia ja criada para evitar perda acidental;
- a observacao da conta pode ser editada depois do lancamento e fica minimizada por padrao ate o operador abrir;
- os cards de conta ficam minimizados por padrao e podem ser abertos individualmente ao clicar no resumo da propria conta, mantendo o resumo e a barra de progresso visiveis sem botao extra de abrir/minimizar; dentro da conta, vencimento, pagamentos, observacao, historico e ajustes/pagamento tambem ficam em blocos recolhidos para reduzir poluicao visual;
- lancamentos pagos, lancamentos cancelados, pagamentos cancelados e eventos de auditoria aparecem no bloco `Historico`, fechado por padrao, em vez de poluir a area principal da conta;
- o bloco de notas lateral permite criar, editar e apagar lembretes administrativos por exclusao logica;
- acoes de login, criacao, adicao de item, pagamento e mudanca de status registram `gestao_audit_events` e resumo curto em `wf_logs`.
- o Miauby pode abrir a Gestao com o comando `gestao`/`abrir gestao` e preparar uma conta com ordens flexiveis como `gestao - titulo - valor - categoria`, `gestao - valor - titulo`, `gestao titulo valor` ou categoria antes/depois; se houver so nome + valor, a categoria vira `geral`, se faltar nome ou valor ele pergunta, e a gravacao so acontece depois de confirmacao humana pelo chat.

Modulo `Pedidos` em `/pedidos/`:

- o formulario `Pedidos feitos` registra fornecedor, uma ou mais parcelas com valor e vencimento proprio opcional apenas por data, previsao opcional de chegada como numero de dias, competencia, observacao e opcoes `Ja foi pago, so falta chegar` e `Ja chegou, so pagar`;
- a previsao de chegada de novo pedido e digitada como numero de dias, nao como data manual: `2` significa dois dias a partir do dia atual local, e o sistema grava a data calculada em `pedidos_orders.expected_arrival_at`;
- criar um pedido tambem cria uma conta vinculada em `gestao_accounts` com categoria `Boleto`; cada valor/parcela vira item em `gestao_account_items` com `due_at` proprio quando preenchido, e a menor data ativa alimenta `gestao_accounts.due_at` para ordenacao e resumo;
- o fluxo operacional fica separado da Gestao: `pedidos_orders` guarda pedidos feitos/aguardando chegada, e `pedidos_confirmed_orders` guarda confirmados e historico;
- contas vinculadas a pedidos ficam travadas na categoria `Boleto`; recategorizacao em lote e bloqueada quando a categoria contem pedidos para preservar o controle financeiro automatico;
- se o pedido ja foi pago na criacao, o pagamento entra imediatamente em `gestao_account_payments`, mas o pedido continua em `pedido` ate a chegada ser confirmada;
- se o pedido ja chegou na criacao, ele nasce em `Confirmados` para aguardar pagamento; se tambem ja estiver pago, nasce recebido e quitado em `Historico`;
- ao clicar em `Confirmar chegada`, o pedido vai para `Confirmados` quando ainda existe saldo ou direto para `Historico` quando ja estava quitado;
- `Confirmados` ordena os boletos pela menor data de vencimento ativa das parcelas primeiro e mostra alertas de vencido/urgente/atencao conforme a proximidade;
- pagamentos parciais, botao `Pago` e ajustes de juros/diferenca reutilizam `gestao_account_payments` e `gestao_account_items`, alimentando automaticamente o total mensal e a categoria `Boleto`; a data de pagamento parcial e informada apenas por data na interface;
- quando o pedido esta recebido e quitado, ele vai para `Historico` com datas de criacao, confirmacao, pagamento e finalizacao preservadas;
- cards em `Aguardando chegada` e `Confirmados` ficam minimizados por padrao e podem ser abertos ao clicar no resumo do proprio card, sem botao extra de `+/-`; no modo reduzido, mostram status compacto, saldo e acao principal (`Confirmar chegada` ou `Pago`), enquanto o icone de lapis abre a edicao de fornecedor/valores/vencimentos ativos com auditoria em `gestao_audit_events` e espelho em `wf_logs`;
- esses mesmos cards mostram icone de excluir para retirar da tela quando nao houver necessidade de registrar o boleto;
- remover valores ou excluir um pedido da tela nao apaga dados financeiros: valores viram `cancelado` quando permitido, e pedidos inteiros usam arquivamento logico em `gestao_accounts.archived_at`/`archived_by` mais lifecycle/cancelamento nas tabelas de Pedidos;
- a tela `/pedidos/` carrega o widget do Miauby como apoio operacional, sem transformar Pedidos em subview da Gestao;
- o badge da home consulta `/pedidos/api/badge` e mostra quantos pedidos em `pedidos_orders` tem previsao de chegada no dia;
- a URL antiga `/gestao/pedidos` redireciona para `/pedidos/` apenas por compatibilidade e nao deve receber novas features.

## Fluxo Tarefas

Modulo simples de tarefas internas.

Arquivos:

- `site/tarefa/index.php`
- `site/tarefa/tarefa-funcoes.php`
- `site/tarefa/app.js`

Tabela:

- `wf_tarefas`

Estados conhecidos:

- `aberta`
- `concluida`
- `cancelada`

Prioridades conhecidas:

- `alta`
- `normal`
- `baixa`

## Fluxo Miauby

Miauby e o assistente interno. Ele guarda conversas, memorias, conhecimentos, alertas, padroes e rotinas de Farmacia Popular.

Arquivos principais:

- `site/miauw/index.php`
- `site/miauw/diagnostico.php`
- `site/miauw/treino.php`
- `site/miauw/api.php`
- `site/miauw/widget-status.php`
- `site/miauw/widget-auth.php`
- `site/miauw/widget-alerts.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-farmacia-popular.php`
- `site/miauw/guardian-cron.php`
- `site/miauw/farmacia-popular-cron.php`

Tabelas principais:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_conhecimentos`
- `miauw_memorias`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_treinos_respostas`
- `miauw_farmacia_popular_valores`
- `miauw_farmacia_popular_atualizacoes`

Direcao de evolucao:

- evoluir por skills controladas, nao por acesso livre ao banco;
- usar `miauw_skill_registry()` como fonte de inventario das skills antes de novas tools;
- manter a Fase 4 registrada no registry: sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos;
- usar a ponte interna da Cotacao V2 para consultas/encomendas, protegida por token de ambiente;
- manter a Fase 5 com trace por conversa/tool em `miauw_tool_traces`, status no diagnostico, streaming visual no widget/chat e confirmacao humana para acoes fortes antes da escrita;
- manter a Fase 6/7/8 com evals locais para dados obrigatorios, schemas de tools, nao inventar dados, confirmacao de escrita forte, servico sombra e adaptador PHP validados antes do corte;
- preparar a proxima camada por contrato em `miauw_agent_next_phase_contract()`, sem trocar o fluxo PHP/widget ate os testes aprovarem;
- registrar padroes e memorias com revisao e auditoria;
- revisar memorias e padroes pelo painel restrito `/miauw/diagnostico.php`, marcando status sem apagar dados;
- treinar respostas pelo proprio chat com `Boa`/`Treinar`, revisar no painel restrito `/miauw/treino.php` e usar apenas exemplos aprovados no contexto do Miauby;
- preservar versoes de treino: aprovar, rejeitar ou superar sem excluir pergunta/resposta original;
- compilar treinos aprovados em perfil curto e responder localmente quando houver pergunta repetida/fortemente parecida, para reduzir custo e evitar conversa infinita por temas;
- aplicar perfil de voz/tom versionado no contexto do Miauby;
- permitir audio apenas pelo botao `Falar`, com microfone por clique, gravacao temporaria, transcricao revisavel e sem escrita operacional por voz;
- comandos de Gestao entram como tool controlada: leitura por resumo interno e escrita de conta a pagar com titulo, valor, categoria padrao `geral` quando o operador informar so nome + valor, endpoint interno tokenizado e confirmacao humana;
- em comandos de Gestao, uma nova mensagem que comeca por `gestao` sempre substitui pendencia incompleta anterior; complementos so sao usados quando a resposta nao inicia novo comando, evitando juntar prompts antigos com novos lancamentos;
- o formato de criacao aceita `gestao - titulo - 500 - categoria`, `gestao - 500 - titulo`, `gestao - titulo - 500`, `gestao titulo 500` e categoria antes/depois para reduzir erro operacional no celular;
- separar leitura, sugestao e escrita;
- documentacao especifica em `docs/18-miauby-evolucao-generativa.md`.

## WordPress

WordPress fica na raiz `site/` e usa `site/wp-config.php`.

Cuidados:

- A rota `/` esta interceptada por `site/.htaccess` e servida por `site/home.php` durante a estabilizacao da migracao.
- WordPress continua responsavel por `/wp-admin`, `/wp-login.php`, posts, paginas legadas e assets em `/wp-content`.
- O `/wp-login.php` nao segue automaticamente a identidade dos logins internos; em 2026-05-21 foi confirmado que ele permanecia com o cabecalho padrao do WordPress.
- `WP_HOME` e `WP_SITEURL` sao ajustados para localhost em desenvolvimento.
- Em producao, confirmar URLs finais depois do DNS/SSL.
- Plugins vindos do HostGator podem afetar performance.
- Cache deve ser ativado apenas depois de validar redirects e HTTPS.

## Decisoes tecnicas ja tomadas

- Modulos internos ficam dentro da raiz publica ao lado do WordPress.
- Modulos compartilham helpers de autenticacao e banco do Cashback.
- Cotacao V2 deve evoluir com sincronizacao estruturada, nao string solta.
- Home publica temporariamente desacoplada do WordPress para reduzir risco de cache/plugin quebrar a primeira tela.

## Riscos ao alterar

- Quebrar helpers comuns impacta todos os modulos.
- Mudar login/sessao sem teste pode bloquear todos os acessos internos.
- Mudar rotas publicas impacta Nginx, DNS e links existentes.
- Alterar Cotacao sem pensar em Sheets pode dificultar a evolucao principal desejada.

## Pendencias

- Mapear perfis e permissoes por modulo.
- Documentar APIs internas endpoint por endpoint.
- Criar testes de fluxo para login, status do Miauby e operacoes principais.

## Evolucao futura

- Criar docs por modulo quando cada fluxo ganhar mais regras.
- Adicionar diagnostico central com status de banco, API, proxy e jobs.
- Integrar Miauby para resumir pendencias, divergencias e alertas operacionais.
