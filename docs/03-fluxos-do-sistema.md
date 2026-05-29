# 03 - Fluxos do sistema

## O que esta parte documenta

Este documento descreve os fluxos reais encontrados no sistema e os cuidados para evoluir cada um.

## Fluxo de acesso

Entrada publica:

- `/`: home/portal independente em `site/home.php`, com fundo visual em tela inteira, logo animada propria da home sem fundo, GIFs decorativos com movimento reaproveitado dos logins e cards inferiores de acesso aos modulos.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe badge vermelho quando houver tarefas abertas.
- O card `Pedidos` abre `/pedidos/`, ao lado de `Cotacao`, com badge de pedidos previstos para chegar hoje.
- O card `XP` abre `/xp/` e usa uma moldura visual propria, aplicada somente nesse card como `border-image` de borda/cantos para destacar a entrada sem cortar a arte nem cobrir o texto.
- O card `Usuarios` abre `/usuarios/` para administrar logins, modulos, vinculo XP e historico central.
- O card `Gestao` abre o modulo administrativo de contas a pagar manuais; os demais cards seguem na grade da home em desktop.
- A home usa no maximo cinco cards por linha no desktop e a ordem dos acessos e: `Cashback`, `Cotacao`, `Pedidos`, `Financeiro`, `Tarefas`, `Codigos`, `XP`, `Gestao`, `Miauby`, `Miauby Whatsapp` e `Usuarios`, com `Usuarios` ao lado de `Miauby Whatsapp` no desktop. No mobile, os cards de acesso ficam em duas colunas compactas para reduzir rolagem e mostrar mais modulos na primeira tela.

Identidade visual validada em 2026-05-21:

- Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw carregam a logo nova nas telas de login e nas telas internas autenticadas.
- Os SVGs ativos desses modulos batem com o mesmo hash da logo oficial nova; a home publica pode usar o GIF animado sem fundo como variacao visual sem alterar a identidade dos modulos internos.
- `/wp-login.php` e uma tela WordPress separada e continua podendo exibir o cabecalho/logo padrao do WordPress; isso nao e regressao dos modulos internos, salvo quando a tarefa pedir customizacao do login WordPress.

Rotas de login:

- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php` (Cotacao V2 em Node.js, autenticando somente em `core_users`)
- `/financeiro/login.php`
- `/usuarios/login.php`
- `/gestao/login.php`
- `/pedidos/`
- `/xp/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/wp-login.php`

Os modulos PHP remanescentes reaproveitam helpers proprios do Miauby/WordPress quando necessario. Cashback, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro e Usuarios usam sessoes proprias nos seus servicos Node/Postgres, com rollback de autenticacao por variaveis de ambiente quando aplicavel. Cotacao V2 usa sessao propria em Redis.

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

- `apps/cashback/src/server.ts`
- `site/cashback/styles.css`
- `site/cashback/app.js`
- `site/cashback/login-runner.js`
- `site/cashback/logo-wimifarma.svg`
- `site/cashback/gato-hapy.gif`
- `site/cashback/mario.gif`

Tabelas principais:

- Postgres `cashback_clients`
- Postgres `cashback_attendants`
- Postgres `cashback_purchases`
- Postgres `cashback_credits`
- Postgres `cashback_redemptions`
- Postgres `cashback_redemption_items`
- Postgres `cashback_settings`
- Postgres `cashback_whatsapp_messages`
- Postgres `cashback_audit_events`
- Postgres `cashback_sessions`
- MySQL `wf_*` do Cashback apenas como importacao/espelho temporario de rollback por `CASHBACK_LEGACY_MYSQL_*`

Regras importantes:

- a rota oficial `/cashback/` e servida por `apps/cashback` via proxy Apache;
- o frontend visual permanece o mesmo de `site/cashback`, montado como assets no container Node;
- dinheiro fica em centavos inteiros no Postgres, exportado em CSV como valor decimal;
- a relacao compra -> credito -> resgate deve continuar preservada com consumo FIFO dos creditos;
- o resgate roda em transacao Postgres e bloqueia creditos ativos do cliente para evitar saldo duplicado;
- `/cashback/health` mostra storage Postgres, auth core e contagens de migracao;
- `/cashback/autoteste.php` cria compra/credito/resgate em transacao e desfaz tudo com rollback;
- `atendentes.php` redireciona para `relatorio.php#atendentes`, como no legado.

## Fluxo Usuarios

O modulo Usuarios administra os logins internos em `/usuarios/`. Ele e servido por `apps/usuarios` em Node.js + TypeScript, usa sessao propria `WFUSUARIOS`, autentica no Postgres core `core_users` e fica restrito a username `adm` ou role `admin`.

A tela permite criar usuario com senha, perfil e status, desativar usuario sem apagar fisicamente, escolher quais modulos ficam liberados, associar o login a um funcionario do XP e consultar o historico central de mudancas. A associacao com XP usa `core_user_xp_links` apontando logicamente para `xp_employees.id`; a fonte oficial de XP continua sendo o modulo XP.

O painel de Usuarios deve deixar claro que a fonte oficial e o Postgres core; quando um login veio de `wf_users`, a tela mostra isso como origem importada do MySQL em vez de expor o identificador tecnico cru.

O login de Usuarios usa o happy cat zanzando pela tela e fugindo do cursor como detalhe visual, sem interferir no formulario ou na sessao.

Tabelas principais:

- `core_users`
- `core_user_module_permissions`
- `core_user_xp_links`
- `core_user_audit_events`
- `usuarios_sessions`

Regras importantes:

- `Excluir` no painel preenche `core_users.active=false`, preservando auditoria.
- O usuario `adm` nao pode ser desativado pelo painel.
- Deve existir pelo menos um administrador ativo.
- Linhas ausentes em `core_user_module_permissions` preservam acesso legado; usuarios criados pelo painel ja recebem permissoes explicitas.

## Fluxo Codigos

O modulo Codigos guarda atalhos operacionais para itens com comissao diferente. A rota oficial `/codigos/` e servida por `apps/codigos` em Node.js + TypeScript com Postgres dedicado, preservando o mesmo frontend visual de `site/codigos`. A tela principal funciona como planilha simples, com campos sempre editaveis para `Codigo`, `EAN` e `Preco`, salvando automaticamente as mudancas.

Para evitar confusao operacional, a tela separa os itens em blocos por prefixo de EAN, mantendo `EAN 20` e `EAN 40` como blocos padrao. O botao `+` cria um novo bloco pelo backend em `codigos_groups` apenas quando o usuario informa manualmente o prefixo desejado, permitindo que o bloco continue existindo mesmo antes do primeiro item. Cada tabela possui uma linha nova no rodape; quando os tres campos estao preenchidos, o item e criado automaticamente no grupo correspondente. A tela usa faixa horizontal interna para criar tabelas lado a lado e aproveitar melhor as laterais do monitor, sem criar rolagem horizontal vazia no documento inteiro.

O login de Codigos segue o padrao visual vinho/rosa dos outros logins internos, mas o fluxo novo usa sessao `WFCODIGOS`, CSRF e `core_users` por `CODIGOS_AUTH_PROVIDER=core`. Rollback rapido de autenticacao e voltar `CODIGOS_AUTH_PROVIDER=mysql` e rebuildar `wimifarma-codigos-app`.

Arquivos principais:

- `apps/codigos/src/server.ts`
- `site/codigos/styles.css`
- `site/codigos/app.js`
- `site/codigos/login-runner.js`

Tabelas principais:

- Postgres `codigos_items`
- Postgres `codigos_groups`
- Postgres `codigos_audit_events`
- Postgres `codigos_sessions`
- MySQL `wf_codigos_comissao` e `wf_codigos_blocos` apenas como importacao/espelho temporario de rollback por `CODIGOS_LEGACY_MYSQL_*`

Regras a preservar:

- codigo, EAN e preco devem ser editaveis sem fluxo complexo;
- edicoes devem salvar automaticamente por `/codigos/api.php`, mantendo sessao e CSRF;
- a coluna `Codigo` deve mostrar a frase inteira visualmente, quebrando linha e aumentando a altura da linha/tabela quando o texto for longo;
- editar uma linha nao deve mover sua posicao, salvo quando o EAN mudar para outro prefixo visual;
- reordenar deve ser feito arrastando o numero da linha dentro do mesmo grupo, persistindo `ordem`;
- novos itens entram no fim do grupo visual de EAN correspondente;
- EANs com prefixos diferentes devem ficar em tabelas separadas na tela; `20` e `40` aparecem por padrao, e outros prefixos devem ser criados pelo botao `+` via `/codigos/api.php` usando o numero informado pelo usuario, sem sequencia automatica;
- apagar pela tela deve fazer exclusao logica (`ativo=0`) para reduzir risco de perda acidental;
- apagar uma tabela inteira so e permitido para blocos numericos nao padrao, exige card de confirmacao, CSRF, sessao ativa e senha operacional `wimifarma`, com suporte a override por `CODIGOS_GROUP_DELETE_PASSWORD`;
- acoes de criar, editar, reordenar e apagar registram `codigos_audit_events`; `wf_logs` fica apenas como espelho legado quando `CODIGOS_LEGACY_MYSQL_LOGS_ENABLED=true`.

## Fluxo XP

O modulo XP gamifica vendas dos atendentes. A tela principal fica como mapa de jogo com a trilha XP horizontal em zigue-zague, sem barra de rolagem visivel dentro da fase; o usuario pode segurar e puxar o mapa com o mouse para navegar lateralmente. O perfil ADM tambem aparece como jogador visual com nome `ADM` no nivel 1. A trilha mostra os niveis 1 a 20 enquanto a equipe estiver no inicio e, depois disso, usa uma janela curta ao redor do nivel mais alto para continuar dando sensacao de progressao infinita sem renderizar niveis demais. A escala visual da trilha no desktop deve ficar mais afastada, com pegadas em tamanho natural repetidas e recortadas entre cada nivel; o frontend mede a posicao dos blocos e ancora cada segmento de pegadas entre o bloco anterior e o proximo para reforcar a leitura de caminho. A aba `Configuracoes` concentra cadastro de funcionarios, upload de fotos, filtro de mes, resumo por XP, edicao, exclusao logica de usuarios/funcionarios e lancamentos diarios. A equipe cadastra funcionarios, sobe uma foto e lanca os valores do dia; o backend calcula automaticamente os pontos.

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

- Postgres `xp_employees`
- Postgres `xp_sales`
- Postgres `xp_settings`
- Postgres `core_users` para login
- Postgres `xp_audit_events` para auditoria

Regras a preservar:

- qualquer usuario interno autenticado pode visualizar a trilha XP;
- alimentar dados exige username `adm` ou role `admin`/`gerente`;
- o login do XP deve manter a logo oficial, o titulo `Entrar no XP`, a descricao e o formulario, sem o selo textual amarelo `Wimifarma XP`;
- a navegacao do XP separa `Trilha` de `Configuracoes`; formularios e historico operacional ficam fora da tela principal da fase para evitar poluicao visual;
- a Trilha exibe jogadores em avatares compactos nos niveis e em uma faixa resumida, sem acoes de editar/excluir; clicar em um jogador abre apenas o resumo de XP;
- a aba `Configuracoes` prioriza leitura de XP e nao exibe cards de total de venda; valores monetarios ficam como entrada operacional para gerar XP;
- os cards de funcionarios em `Configuracoes` e a faixa inferior de jogadores na `Trilha` devem exibir barra amarela preenchida conforme o percentual real para o proximo nivel;
- em `Ultimos lancamentos`, a observacao opcional salva em `xp_sales.note` deve aparecer no lancamento, e o XP do lancamento deve ser destacado por uma barra amarela compacta;
- formularios usam CSRF e prepared statements;
- fotos aceitam apenas JPG, PNG ou WEBP, ate 3 MB, com dimensoes entre 80x80 e 6000x6000 px;
- a moldura ADM e usada no perfil/admin do XP, com foto propria salva separada dos funcionarios; o ADM aparece como perfil protegido, pode ter nome/foto editados, pode receber XP e nao pode ser excluido pela tela;
- as molduras visiveis dos avatares do XP devem usar assets com transparencia real, sem canvas branco ao redor da arte;
- as pastas `site/xp/uploads/funcionarios/` e `site/xp/uploads/adm/` precisam existir e ficar gravaveis pelo Apache/PHP no VPS;
- a pasta de uploads bloqueia listagem e execucao de scripts por `.htaccess`;
- R$ 1.000,00 em vendas gera 2.500 XP, gravado como inteiro no lancamento;
- o nivel 1 exige 30.000 XP para passar; os niveis seguintes ficam progressivamente mais dificeis e nao possuem limite fixo;
- a trilha usa `Bloco XP` nos niveis comuns, `Nivel 5` a cada multiplo de 5 e `nivel 10` a cada multiplo de 10;
- cancelar venda ou excluir/remover usuario/funcionario deve ser logico, sem apagar historico fisico; o botao `Excluir usuario` tira o atendente da lista e da trilha, preservando os lancamentos antigos.
- o Miauby conhece o XP e pode usar "farmar aura no XP" como incentivo de jogo para vendas reais e lancamentos corretos, mas nao pode inventar ranking, pontuacao, foto, funcionario ou nivel sem dado vindo do sistema ou do usuario.

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
- Postgres `core_users` para login

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

- `apps/financeiro/src/server.ts`
- `site/financeiro/app.js`
- `site/financeiro/styles.css`
- `site/financeiro/login-runner.js`
- `site/financeiro` como legado/assets visuais.

Tabelas principais:

- `financeiro_closings`
- `financeiro_entries`
- `financeiro_sangrias`
- `financeiro_card_entries`
- `financeiro_pix_entries`
- `financeiro_settings`
- `financeiro_audit_events`
- `financeiro_internal_idempotency`
- MySQL `financeiro_*` apenas como importacao/espelho temporario de rollback.

Regras a preservar:

- status de fechamento;
- totais conferidos;
- divergencias/sobra/falta;
- justificativas;
- auditoria interna.
- Caixa e Relatorio usam a mesma linha em `financeiro_closings` para cada dia. O botao `Fechar sem movimento` do Relatorio e apenas um atalho para marcar `status='sem_movimento'`, igual ao Caixa, e nao deve travar a digitacao posterior de venda/faturamento. Se depois for informado faturamento em um dia sem movimento, o dia volta para `conferencia` e fica editavel no Caixa.

Interface:

- o topo do Financeiro mostra apenas `Caixa`, `Relatorio` e `Sair`;
- a view dedicada de Auditoria nao fica disponivel na navegacao operacional;
- os registros em `financeiro_audit_events` continuam sendo gravados no Postgres para suporte e rastreabilidade; `financeiro_auditoria` fica apenas como espelho legado quando o mirror MySQL estiver ligado.
- O Miauby WhatsApp pode preparar lancamento `Pix CNPJ` a partir de foto, print, imagem encaminhada ou PDF/documento de comprovante Pix quando a flag de OCR estiver ligada. O bridge valida remetente, card `Financeiro`, destino por CNPJ/chave Pix ou nome correlato, valor e pagador; data e horario sao usados quando a leitura trouxer, mas a correcao manual `pix cnpj valor - nome - obs opcional` tambem pode gravar usando o momento atual. Depois envia confirmacao `Sim`/`Nao`. Somente o `Sim` grava no Financeiro Node por endpoint interno tokenizado, com categoria `Pix CNPJ` e observacao sanitizada. `Nao`, destino divergente ou dado faltante nao gravam nada e pedem texto corrigido.
- O Financeiro Node/Postgres atende `/financeiro/`, preserva o frontend visual, expoe health/resumo/checksums internos e mantem MySQL apenas como importacao/espelho temporario durante a validacao do corte.

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
- a lista principal sem filtro mostra somente contas abertas do mes em linhas compactas com `Categoria`, `Nome`, `Valor`, `Pagar` e `Abrir`; contas pagas/canceladas ficam acessiveis pela busca ou pelo filtro de categorias para evitar lista infinita de historico;
- o painel `Mensal` fica ao lado da lista principal e mostra as contas da competencia atual com `Repetir mes que vem` ativo em estrutura compacta propria para evitar sobreposicao entre valor e botoes; ele soma o valor que sera levado para a proxima competencia, permite abrir o extrato completo e salva a ordem manual quando o operador arrasta as linhas com o mouse;
- a busca fica abaixo dos resumos do mes e pesquisa contas/boletos por titulo, categoria, status, valor aproximado, saldo, vencimento, data de lancamento, data de pagamento, lancamentos e pagamentos; ela mostra 10 resultados primeiro, permite `Mostrar mais` e `Limpar`;
- a conta pode ter vencimento opcional por data, sem campo de horario na interface; contas pendentes com vencimento mais proximo sobem na lista e recebem aviso visual de vencido, vence hoje ou vence em poucos dias;
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
- os cards de conta ficam compactos por padrao e podem ser abertos individualmente pelo botao `Abrir`, mantendo a lista fina para caber mais contas por tela; dentro da conta, vencimento, pagamentos, observacao, historico e ajustes/pagamento tambem ficam em blocos recolhidos para reduzir poluicao visual;
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
- cards em `Aguardando chegada` e `Confirmados` ficam minimizados por padrao e podem ser abertos ao clicar no resumo do proprio card, sem botao extra de `+/-`; no modo reduzido, mostram status compacto, saldo e acao principal (`Confirmar` para chegada ou `Pago`), enquanto o icone de lapis abre a edicao de fornecedor/valores/vencimentos ativos com auditoria em `gestao_audit_events` e espelho em `wf_logs`; o visual minimizado deve ser denso, com padding/chips/icones menores e botao principal curto alinhado a direita, sem virar barra larga;
- os cards-resumo do topo de Pedidos tambem devem usar altura compacta para ampliar a area visivel das colunas operacionais; `Boletos em aberto` continua sendo quantidade, `Valor para chegar` soma o saldo ainda nao pago dos pedidos aguardando chegada e `Valor boletos abertos` soma o saldo ainda nao pago dos boletos confirmados em aberto, sem duplicar valor em tabela paralela;
- em zoom alto ou viewport intermediario, Pedidos deve reorganizar a grade operacional para duas colunas antes de cair no mobile, evitando corte horizontal, sobreposicao de valores/botoes e quebra dos cards compactos;
- esses mesmos cards mostram icone de excluir para retirar da tela quando nao houver necessidade de registrar o boleto;
- remover valores ou excluir um pedido da tela nao apaga dados financeiros: valores viram `cancelado` quando permitido, e pedidos inteiros usam arquivamento logico em `gestao_accounts.archived_at`/`archived_by` mais lifecycle/cancelamento nas tabelas de Pedidos;
- a tela `/pedidos/` carrega o widget do Miauby como apoio operacional, sem transformar Pedidos em subview da Gestao;
- endpoints internos tokenizados de Pedidos permitem a rotina n8n/Miauby: `GET /pedidos/api/internal/arrival-summary` lista `Aguardando chegada`, e `POST /pedidos/api/internal/confirm-arrival` confirma chegada por `order_id` ou titulo de fornecedor; respostas WhatsApp como `cimed chegou` exigem card `Pedidos`, registram auditoria e nao marcam pagamento;
- o badge da home consulta `/pedidos/api/badge` e mostra quantos pedidos em `pedidos_orders` tem previsao de chegada no dia;
- a URL antiga `/gestao/pedidos` redireciona para `/pedidos/` apenas por compatibilidade e nao deve receber novas features.

## Fluxo Tarefas

Modulo simples de tarefas internas, servido por `apps/tarefa` em Node.js + TypeScript com Postgres dedicado.

Arquivos:

- `apps/tarefa/src/server.ts`
- `apps/tarefa/public/app.js`
- `apps/tarefa/public/styles.css`
- `site/tarefa/` como legado/fallback historico

Tabelas:

- Postgres `tarefa_tasks`
- Postgres `tarefa_audit_events`
- Postgres `tarefa_sessions`
- MySQL `wf_tarefas` como importacao/espelho temporario de rollback

Estados conhecidos:

- `aberta`
- `concluida`
- `cancelada`

Prioridades conhecidas:

- `alta`
- `normal`
- `baixa`

Regras:

- `/tarefa/badge.php` retorna apenas a contagem de tarefas abertas;
- criar, editar, concluir, cancelar e reabrir usam CSRF e sessao `WFTAREFA`;
- a tela visual deve continuar equivalente ao modulo antigo durante a migracao;
- `TAREFA_LEGACY_MYSQL_MIRROR_ENABLED=true` espelha novas escritas em `wf_tarefas` apenas para rollback curto, sem mudar a fonte oficial de verdade do Postgres.

## Fluxo Miauby

Miauby e o assistente interno. Ele guarda conversas, memorias, conhecimentos, alertas, padroes e rotinas de Farmacia Popular.

A navegacao superior do Miauby deve ficar focada no proprio modulo: Chat, Treino, Diagnostico e Sair conforme a tela/permissao. Nao recolocar atalhos diretos para Cashback, Cotacao ou Financeiro nesse topo sem pedido explicito.

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
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`

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
- `miauw_whatsapp_contacts`
- `miauw_whatsapp_events`
- `miauw_whatsapp_outbox`

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
- manter o WhatsApp como canal de transporte controlado: Evolution API ou Meta Cloud API entrega webhooks ao `apps/miauw-whatsapp`, o bridge valida token/assinatura/allowlist/prefixo/grupo, grava fila no Postgres dedicado, mostra status seguro em `/miauw/whatsapp/` e chama o agente para resposta curta, sem escrita forte direta pelo WhatsApp;
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
