# Wimifarma

Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle, com WordPress, modulos internos legados em PHP e modulos modernos em Node.js/TypeScript/Postgres rodando via Docker.

Estado base desta documentacao: 2026-05-10.

## Objetivo do sistema

O sistema centraliza a presenca web e ferramentas internas da Wimifarma:

- site WordPress principal em `site/`;
- Cashback para clientes, compras, creditos e resgates;
- Codigos para atalhos de itens com comissao diferente, com codigo, EAN e preco editaveis;
- Cotacao para controle de itens, fornecedores, precos e status de compras;
- Pedidos para recebimento de fornecedores, vencimento de boletos, pagamentos parciais e historico;
- Financeiro para fechamento, sangrias, PIX, maquininhas e rastreabilidade interna;
- Usuarios para logins individuais, permissoes por modulo, vinculo com XP e historico central;
- Gestao para contas a pagar manuais, itens de composicao, pagamentos parciais, vencimentos, categorias livres e total pago por mes;
- XP para gamificar vendas dos atendentes com cadastro de funcionarios, fotos, pontos e niveis;
- Tarefas internas;
- Miauby, assistente interno com integracao OpenAI e recursos de diagnostico.
- Miauby Whatsapp para acompanhar canal, webhook, fila, outbox, Evolution API, Meta Cloud API e automacoes n8n de smoke/watchdog, chegada de pedidos e fechamento de caixa por endpoint interno tokenizado.

O objetivo tecnico da migracao e sair de uma hospedagem HostGator limitada e evoluir em uma VPS mais flexivel, com Docker, controle de versao, deploy rastreavel e espaco para novos modulos.

Para novos cards/modulos, a regra e escolher a melhor estrutura tecnica pelo dominio antes da tela: linguagem/runtime, banco, tabelas, indices, sessao, permissao, auditoria, health e deploy. Cards com regra de negocio propria devem nascer como modulo proprio e integrar outros dominios por tabelas/APIs claras, nao por mistura visual dentro de outro modulo.

## Status atual

- Projeto local em `C:\Users\Thiesen\Desktop\wimifarma-com`.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- Docker Compose sobe `wimifarma-com-web`, `wimifarma-com-db`, `wimifarma-core-db`, `wimifarma-core-migrator`, `wimifarma-cashback-app`, `wimifarma-cashback-db`, `wimifarma-cotacao-app`, `wimifarma-cotacao-db`, `wimifarma-cotacao-redis`, `wimifarma-gestao-app`, `wimifarma-pedidos-app`, `wimifarma-tarefa-app`, `wimifarma-gestao-db`, `wimifarma-tarefa-db`, `wimifarma-xp-app`, `wimifarma-xp-db`, `wimifarma-codigos-app`, `wimifarma-codigos-db`, `wimifarma-financeiro-app`, `wimifarma-financeiro-db`, `wimifarma-usuarios-app`, `wimifarma-miauw-agent`, `wimifarma-miauw-whatsapp` e `wimifarma-miauw-whatsapp-db`.
- Banco local importado do HostGator no volume ignorado `mysql/`.
- `wimifarma_app` contem tabelas `wf_*`, `cotacao_*`, `financeiro_*`, legados `gestao_*` e `miauw_*`.
- `wimifarma_wp` contem WordPress com prefixo `wptl_`.
- O core compartilhado de autenticacao fica em Postgres `wimifarma_core`: `apps/core-auth` sincroniza `wf_users` para `core_users`, preservando id legado, hash, role e status. `apps/usuarios` usa esse mesmo core para criar logins novos, permissoes por modulo, vinculo com XP, vinculo seguro com allowlist do Miauby WhatsApp, delegacao de tarefa privada e auditoria central. Cotacao e Pedidos usam esse core como login unico, sem dependencia MySQL; Cashback, Gestao, Tarefa, XP, Codigos, Financeiro e Usuarios usam esse core como login principal, com fallback MySQL apenas como rollback opt-in onde ainda existir.
- A Cotacao V2 fica em `apps/cotacao`, usa Node.js/Express/Socket.IO, Postgres e Redis, e e publicada por proxy interno do Apache em `/cotacao/`.
- O login da Cotacao usa somente `core_users` no Postgres do core; o app nao possui mais `mysql2`, pool MySQL nem fallback `wf_users`. Os dados novos da planilha ficam em Postgres no volume ignorado `cotacao-data/`.
- A Gestao fica oficialmente em `apps/gestao`, usa Node.js/TypeScript/Express com Postgres dedicado `wimifarma_gestao`, e e publicada por proxy interno do Apache em `/gestao/`; o login usa `core_users` por `GESTAO_AUTH_PROVIDER=core`, com fallback `wf_users` desligado por padrao e disponivel apenas como rollback opt-in, alem de espelho temporario `wf_logs`. A tela principal usa linhas compactas em `Categoria / Nome / Valor / Pagar / Abrir` e mostra o painel `Mensal` ao lado da lista principal, com as contas de repeticao ativa reordenaveis por arrastar.
- Pedidos fica oficialmente em `apps/pedidos`, usa Node.js/TypeScript/Express, sessao propria `WFPEDIDOS` e rota/proxy separados em `/pedidos/`. Ele autentica somente em `core_users`, sem `mysql2`, pool MySQL, fallback `wf_users` ou variaveis `MYSQL_*` no Compose; as tabelas operacionais `pedidos_orders` e `pedidos_confirmed_orders` ficam no Postgres da Gestao para manter a integracao financeira com `Boleto`, permite editar fornecedor/valores/vencimentos por parcela com auditoria em Postgres e arquiva pedidos da tela sem apagar dados financeiros.
- Tarefa fica oficialmente em `apps/tarefa`, usa Node.js/TypeScript/Express, sessao propria `WFTAREFA`, Postgres dedicado `wimifarma_tarefa` e rota/proxy separados em `/tarefa/`. A tela foi preservada visualmente; o servico autentica pelo core Postgres com `TAREFA_AUTH_PROVIDER=core` por padrao, mantendo rollback por `.env` para `mysql`. Tarefas sem dono continuam publicas para todos; tarefas delegadas por `/usuarios/` usam `assigned_core_user_id`, aparecem somente para o usuario indicado e nao sao espelhadas no legado MySQL.
- A Cotacao PHP antiga foi removida; `site/cotacao` nao existe mais e os ativos da tela oficial ficam em `apps/cotacao/public`.
- Em 2026-05-29, a limpeza de legado arquivou PHPs e assets antigos comprovadamente inativos em `site/_legacy-disabled/2026-05-29/`, com acesso bloqueado por `.htaccess`. Foram preservados WordPress, Miauby PHP, helpers PHP ainda chamados pelo Miauby e assets montados pelos apps Node. O inventario fica em `docs/27-limpeza-legado.md`.
- Rotas de login dos modulos responderam HTTP 200 na auditoria local.
- `miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava configurada.
- No widget do Miauby, `api_ready` indica chave preenchida, nao chamada OpenAI validada. Se o chat cair no fallback, conferir logs/alertas internos para autenticacao, cota, modelo ou rede.
- WordPress respondeu HTTP 200 localmente, mas ficou lento no Docker Desktop Windows com plugins restaurados.
- DNS GoDaddy e Nginx Proxy Manager estavam em configuracao para `wimifarma.com`.
- Cache de pagina WordPress/SpeedyCache esta opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A rota publica `/` e servida por `site/home.php`, uma home independente do bootstrap do WordPress, com fundo visual em video em tela inteira preservando as cores originais sem overlay branco de clareamento, logo animada propria sem fundo, GIFs decorativos com movimento igual aos logins e cards inferiores de acesso aos modulos.
- A logo oficial foi atualizada em 2026-05-21 como SVG horizontal e esta sincronizada nos assets compartilhados de Cashback/Codigos/Gestao/Pedidos, Financeiro, Tarefa, Miauw e Cotacao V2. Em 2026-05-24, a home publica passou a usar `logo-wimifarma-home-animated.gif` como variacao animada sem fundo da marca.
- Em 2026-05-21, Home, Cashback, Codigos, Cotacao, Financeiro, Gestao, Pedidos, Tarefa e Miauw foram validados com navegador local e checks publicos: as telas de login e as telas internas autenticadas carregam a logo nova. O `/wp-login.php` permanece com o cabecalho padrao do WordPress, separado dos logins internos.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe contador vermelho de tarefas abertas quando houver pendencias.
- A home publica mostra no maximo cinco cards por linha no desktop, na ordem `Cashback`, `Cotacao`, `Pedidos`, `Financeiro`, `Tarefas`, `Codigos`, `XP`, `Gestao`, `Miauby`, `Miauby Whatsapp` e `Usuarios`: os dez primeiros fecham duas fileiras de cinco cards e `Usuarios` fica por ultimo na terceira fileira. `Pedidos` mostra badge com o total ainda em `Aguardando chegada`, o card `XP` usa moldura propria como borda/cantos por `border-image`, sem cortar a arte nem cobrir o texto, enquanto os demais cards seguem em grade compacta. Quando o navegador tem sessao ativa no XP ou em Usuarios e o login esta vinculado em `core_user_xp_links`, a home mostra acima da grade um mini-card do XP daquele usuario, lendo os totais atuais de `xp_sales` e atualizando por polling curto. No mobile os cards ficam em duas colunas para caber mais acessos por tela.
- O modulo `Cashback` fica oficialmente em `apps/cashback`, usa Node.js/TypeScript/Express com Postgres `wimifarma_cashback`, sessao propria `WFCASHBACK`, login por `core_users` e proxy Apache em `/cashback/`. A tela preserva o CSS/JS/assets de `site/cashback`; desde 2026-05-29, a paridade com `wf_clientes`, `wf_atendentes`, `wf_compras`, `wf_cashback_creditos`, `wf_resgates`, `wf_resgate_itens`, `wf_settings`, `wf_whatsapp_mensagens` e `wf_logs` foi validada e `CASHBACK_LEGACY_MYSQL_*` fica desligado por padrao, sem conexao ativa com MySQL no app.
- O modulo `Usuarios` fica oficialmente em `apps/usuarios`, usa Node.js/TypeScript/Express com Postgres core `wimifarma_core`, sessao propria `WFUSUARIOS`, login restrito a `adm` ou role `admin`, proxy Apache em `/usuarios/`, cria/desativa usuarios internos, registra permissoes por modulo em `core_user_module_permissions`, vincula login a funcionario XP em `core_user_xp_links`, cria tarefa privada no app Tarefa por endpoint interno e vincula numeros do Miauby WhatsApp por `core_user_whatsapp_links` sem gravar telefone cru no core.
- O modulo `Codigos` fica oficialmente em `apps/codigos`, usa Node.js/TypeScript/Express com Postgres `wimifarma_codigos`, sessao propria `WFCODIGOS`, login por `core_users` e proxy Apache em `/codigos/`. A tela preserva apenas CSS/JS de `site/codigos`; o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`. `wf_codigos_*` no MySQL fica como importacao/espelho/log temporario por flags `CODIGOS_LEGACY_MYSQL_*`. O Miauby prefere `/codigos/api/internal/summary` e `/codigos/api/internal/search` com token interno para ler a fonte Postgres; sem token, usa o espelho legado enquanto estiver ativo.
- O modulo `XP` fica oficialmente em `apps/xp`, usa Node.js/TypeScript/Express com Postgres `wimifarma_xp`, sessao propria `WFXP`, login por `core_users` e proxy Apache em `/xp/`. A tela preserva CSS/JS/assets/uploads de `site/xp`; o PHP antigo foi arquivado em `site/_legacy-disabled/2026-05-29/xp-php/`. `wf_xp_*` no MySQL fica como importacao/espelho temporario de rollback por flags `XP_LEGACY_MYSQL_*`.
- O modulo `Financeiro` fica oficialmente em `apps/financeiro`, usa Node.js/TypeScript/Express com Postgres `wimifarma_financeiro`, sessao propria `WFFINANCEIRO`, login por `core_users` e proxy Apache em `/financeiro/`. A tela preserva o CSS/JS/assets de `site/financeiro`; desde 2026-05-29, a paridade com `financeiro_*` no MySQL foi validada e `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED`/`FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED` ficam desligados por padrao, sem conexao ativa com MySQL no app.
- O modulo `Gestao` foi elevado para Node.js + TypeScript + Postgres: login restrito a `adm`, `admin` ou `gerente`, contas a pagar manuais em `gestao_accounts`, categoria livre com resumo lateral normalizado, lista operacional compacta, painel `Mensal` para contas com repeticao ativa e ordem manual salva, busca por nome/valor/categoria/datas com limite inicial de 10 e `Mostrar mais`, itens flexiveis em `gestao_account_items`, pagamentos parciais datados em `gestao_account_payments`, vencimento opcional por data com urgencia visual, status reversivel, extrato por conta com saldo/progresso, pagamento parcial por qualquer lancamento aberto, cancelamento/reabertura de lancamento sem apagar historico, exclusao da tela apenas por arquivamento de contas canceladas, reabertura de contas pagas, renomeacao por icone de lapis, repeticao do mes seguinte em ciclo liga/desliga sem copiar pagamentos, observacao editavel/minimizavel, detalhes abertos pelo botao `Abrir`, pagamentos/historico minimizaveis e bloco de notas lateral em `gestao_notepad_notes`, com auditoria em `gestao_audit_events` e espelho curto em `wf_logs`.
- O modulo `Pedidos` controla fornecedores em `/pedidos/`, separado da tela de Gestao. Ele usa `pedidos_orders` para pedidos registrados/aguardando chegada e `pedidos_confirmed_orders` para confirmados/historico, sempre vinculando valores, parcelas e pagamentos a uma conta da categoria `Boleto` em `gestao_accounts`. Cada parcela em `gestao_account_items` pode ter vencimento proprio (`due_at`), e a conta usa a menor data ativa como vencimento geral para ordenacao/resumo. Contas de pedidos nao entram em recategorizacao em lote para preservar esse controle. A tela carrega o widget do Miauby; pedidos novos podem marcar `Ja foi pago, so falta chegar` ou `Ja chegou, so pagar`, levando o segundo caso direto para `Confirmados`. A previsao de chegada do novo pedido e digitada como numero de dias (`2` = dois dias a partir de hoje) e o backend grava a data calculada em `expected_arrival_at`. O formulario de novo pedido fica separado em blocos de fornecedor, parcelas, entrega, status inicial e observacao, com total destacado no cabecalho sem mudar o fluxo de criacao. Cards em `Aguardando chegada` e `Confirmados` ficam minimizados por padrao ao clicar no resumo do card, mantendo status, saldo e a acao principal visiveis no modo reduzido (`Confirmar chegada` ou `Pago`), usam icone de lapis para editar fornecedor/valores/vencimentos e icone de excluir para arquivamento logico/auditoria; em 2026-05-25, esses cards e os cards-resumo do topo ficaram mais baixos/densos, com acao principal em botao curto alinhado a direita para caber mais pedidos por tela. Em 2026-05-26, o topo ganhou `Valor para chegar`, somando saldo aberto dos pedidos aguardando chegada, e `Valor boletos abertos`, somando o saldo aberto dos boletos confirmados. O vencimento do boleto e a data do pagamento parcial em Pedidos sao informados apenas por data, sem horario na interface. A URL antiga `/gestao/pedidos` redireciona para `/pedidos/`.
- O Financeiro mostra no topo apenas `Caixa`, `Relatorio` e `Sair`; a tela dedicada de Auditoria saiu da navegacao da equipe, mas `financeiro_audit_events` continua registrando alteracoes internas no Postgres. Caixa e Relatorio compartilham o mesmo fechamento diario: `Fechar sem movimento` no Relatorio marca `sem_movimento` como atalho do Caixa, sem bloquear a digitacao posterior de venda/faturamento.
- A Cotacao V2 substitui a interface antiga em `/cotacao/` para eliminar bugs de palavra-gatilho, salto de linha e travamento em categoria. Palavras como `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum; cor so vem de regra condicional criada explicitamente na tela.
- A Cotacao V2 usa linha com UUID estavel, save por celula, presenca ao vivo via Socket.IO/Redis, filtros locais por tela e eventos em Postgres. A primeira validacao confirmou login, bootstrap, save dessas palavras criticas e criacao/remocao de regra condicional explicita.
- A interface da Cotacao V2 foi aproximada do visual de planilha operacional: cabecalho compacto, abas locais, estatisticas no topo, CSV rapido e colunas fixas iniciais `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, fornecedores e `Ganhador`.
- A Cotacao V2 agora preenche a largura da tela como planilha, usa fonte 20px centralizada nas celulas, mostra usuarios ativos com nomes de animais por aba, permite menu de contexto para inserir linhas, colorir e inserir/apagar somente colunas de distribuidoras, possui paleta de cores para linhas/colunas/celulas e calcula o `Ganhador` pelo menor preco das distribuidoras.
- A Cotacao V2 removeu os botoes visiveis de adicionar linhas e colar planilha: inserir linhas fica no menu de contexto, adicionar em lote fica no rodape e colagem do Sheets usa `Ctrl+V`. A tela tambem possui desfazer/refazer, selecao multipla, `Enter` para descer uma celula, filtros por icone em `CATEGORIA` e `Ganhador`, backup/restore do Postgres e import/export Google Sheets controlado por variaveis de ambiente; o diagnostico operacional continua disponivel por API, mas saiu do menu principal da equipe.
- No editor de celula da Cotacao V2, duplo clique e `F2` entram em edicao sem selecionar todo o conteudo existente; o usuario consegue posicionar cursor, selecionar trechos e usar setas dentro do texto. Quando a edicao comeca por digitacao direta na celula selecionada, as setas confirmam o valor e navegam para a celula vizinha, mantendo o fluxo rapido de planilha. O rodape `Adicionar 20 linhas` adiciona linhas no DOM de forma incremental para evitar lag em planilhas maiores.
- A Cotacao V2 recebeu ajustes de operacao diaria: celulas quebram texto e aumentam altura para nao cortar conteudo, cabecalhos/linhas selecionam coluna/linha inteira, cabecalhos de distribuidoras aceitam duplo clique para renomear, larguras de coluna podem ser arrastadas pelo titulo, apagar distribuidora pode ser desfeito com `Ctrl+Z` na mesma sessao, e o fim da rolagem oferece `Adicionar 20 linhas`.
- A operacao diaria tambem cobre `Ctrl+C` em selecao de celulas, `Ctrl+Z`/`Ctrl+Y` para desfazer/refazer a ultima acao local de celula, lote, filtro, coluna ou pintura manual/borracha, colagem com normalizacao de texto/numeros, formato condicional editavel que pinta apenas a celula da coluna-alvo com texto preto, normalizacao de regras antigas/restauradas para alvo `cell`, paleta de cores flutuante pelo topo ou menu de contexto com tons do mais forte ao mais claro, manutencao da linha visivel durante edicao sob filtro e heartbeat/recarregamento leve apos inatividade.
- A Cotacao V2 agora filtra tambem por `PRODUTO` e por cor nas colunas filtraveis, ordena o filtro de `Ganhador` com vencedores individuais antes de empates e `Sem vencedor`, permite selecionar varias colunas/linhas arrastando pelos cabecalhos e mostra data/hora no hover de celulas que baterem em regra condicional com essa opcao marcada.
- A alca no canto da selecao da Cotacao V2 foi ampliada e permite arrastar para copiar valores e cores visiveis da selecao para celulas vizinhas.
- O modo de cor da Cotacao V2 e uma acao unica: depois de aplicar cor ou borracha na selecao atual, a tela desarma o modo para evitar colorir a proxima celula sem querer. O filtro de `Ganhador` mostra contagem por resultado, como `Anb (4)`.
- Os assets vivos da Cotacao V2 (`app.js` e `styles.css`) sao servidos sem cache forte para evitar que deploys rapidos fiquem presos no navegador.
- A Etapa 1 de performance da Cotacao V2 adicionou indices aditivos no Postgres e ampliou `/cotacao/api/diagnostics` com blocos `safety` e `performance`; `/cotacao/api/bootstrap` segue como fallback completo durante a evolucao do sync incremental.
- A Etapa 2 criou `GET /cotacao/api/events?after=<eventId>` e passou o refresh automatico da Cotacao para delta incremental, mantendo `/cotacao/api/bootstrap` como fallback quando houver evento estrutural, cursor invalido ou excesso de eventos.
- A Etapa 3 reduziu o custo das mutacoes simples da Cotacao V2: salvar celula, lote de celulas, estilos, regras, linhas e colunas usam consultas pontuais de validacao em vez de carregar o snapshot inteiro por `loadSheet()`.
- A digitacao em celulas agenda o auto-ajuste de altura por frame do navegador para reduzir recalculo de layout e suavizar a escrita em planilhas maiores.
- A Etapa 4 deixou a troca de celula mais fluida: saves de celula passam a ser otimistas no frontend, redesenhando somente a linha afetada enquanto a API confirma em segundo plano.
- A presenca ao vivo agora tambem aparece dentro da grade: quando outra pessoa seleciona ou edita uma celula visivel, a celula ganha contorno colorido, etiqueta do animal e tooltip com coluna/linha.
- Apagar conteudo com `Delete`/`Backspace` na Cotacao V2 tambem ficou otimista: a selecao limpa na hora e o save em lote confirma em segundo plano sem redesenhar a tabela inteira para um caso simples.
- Quando a aba esta editando uma celula e recebe eventos remotos de celula/lote, a Cotacao guarda as linhas afetadas e redesenha ao encerrar a edicao, evitando `Ganhador`, contadores ou celulas calculadas visualmente atrasadas.
- Redimensionar coluna, inserir linha, criar, renomear, apagar ou restaurar distribuidora nao deve mais forcar `/cotacao/api/bootstrap` na propria aba nem nas demais; esses fluxos usam payload incremental de evento e atualizacao local da grade.
- O redimensionamento de coluna usa evento Socket.IO dedicado `column:resized` e auto-ajuste apenas da coluna alterada, evitando que abas antigas disparem snapshot completo ao soltar o mouse.
- O carregamento inicial da Cotacao V2 renderiza a grade antes de fatiar o auto-ajuste de altura das celulas em frames, reduzindo a tela vazia com `Carregando...` quando ha muitas linhas/colunas.
- O numero da linha da celula ativa fica destacado em verde forte, facilitando localizar visualmente a linha atual sem alterar dados nem compartilhar esse destaque com outras telas.
- A alca de preenchimento, colagem e desfazer/refazer de lotes agora seguem o mesmo modelo otimista: aplicam localmente, salvam em lote e atualizam somente as linhas afetadas; estilos copiados ou aplicados em selecoes grandes usam `/cotacao/api/styles/batch`.
- Filtros continuam locais por navegador. Quando duas pessoas salvam a mesma celula, a Cotacao segue o comportamento estilo Sheets pedido pelo usuario: o ultimo salvamento vence, com presenca visual e historico de celula para recuperar valor anterior.
- O botao `Sair` da Cotacao V2 encerra a sessao da Cotacao e volta para a home inicial `/`, em vez de mandar para o login.
- O widget do Miauby voltou a carregar dentro da Cotacao V2, a tela de login foi compactada para ocupar menos a tela e os endpoints JSON limpam saida acidental antes de responder, evitando HTML misturado no login/chat.
- Na Cotacao V2, o widget do Miauby tambem pode soltar localmente o `pikachu-loop.webp` para uma ronda visual curta: ele sai do balao do Miauby, circula pela tela, desvia do mouse e volta ao widget, sem gravar estado nem mexer na sincronizacao da planilha.
- Pendencias/cuidados atuais da Cotacao V2: Google Sheets ainda precisa de credenciais reais no `.env` do VPS; restore/import sao acoes fortes e devem ser usados com backup/revisao; o `fill handle` ja copia padroes, mas series automaticas mais inteligentes ainda podem evoluir.
- Miauby possui `miauw_skill_registry()` para inventariar skills por modulo, risco, nivel, permissao, auditoria e executor antes de novas autonomias. Consultas de alertas e conhecimentos foram aliviadas para reduzir trabalho repetido.
- Miauby iniciou a Fase 1 do agente operacional v2: `MIAUW_AGENT_VERSION`, prompt/politica versionados, isolamento de bastidores tecnicos, guardrails finais contra mencoes a agente de desenvolvimento/fornecedor/chaves/prompts e status de versao no widget.
- Miauby iniciou a Fase 2 do agente operacional v2 com evals locais em `site/miauw/miauw-evals.php`, cobrindo guardrails, intents de Financeiro/Tarefas/Cotacao, rotas de modelo e registry de skills sem chamada online nem escrita real.
- Os guardrails finais tambem redigem fragmentos de chaves `sk-...` como credencial interna antes de mostrar texto ao operador.
- Miauby iniciou a Fase 3 com o painel restrito `/miauw/diagnostico.php`, reunindo status do agente/API, modelos, registry de skills, alertas, diagnosticos internos recentes e revisao segura de memorias/padroes.
- `miauw_memorias` e `miauw_padroes` agora possuem status de revisao (`pendente`, `aprovado`, `ignorado`); o painel marca revisao sem apagar dados.
- Miauby iniciou a Fase 4 do agente operacional v2: as tools core ficam registradas e cobrem sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- A consulta e criacao de encomenda na Cotacao pelo Miauby usam uma ponte interna com o servico Node da Cotacao V2, protegida por token, em vez de depender da Cotacao PHP antiga.
- Miauby iniciou a Fase 5 do agente operacional v2: `miauw_tool_traces` registra trace por conversa/request/tool, o painel `/miauw/diagnostico.php` mostra tools recentes e estatisticas de traces, o widget/chat exibe resposta digitando visualmente e acoes fortes exigem card de confirmacao antes de gravar.
- Miauby iniciou a Fase 6 do agente operacional v2: os evals locais foram ampliados para validar contrato da proxima camada, schemas das tools, dados obrigatorios antes de escrita, regra de nao inventar dados e confirmacao obrigatoria para escrita forte. O diagnostico tambem mostra um contrato seguro para a futura camada Node.js 22 + TypeScript com Agents SDK, sem trocar o motor atual ainda.
- Miauby iniciou a Fase 7 do agente operacional v2: `apps/miauw-agent` adiciona um servico Node.js 22 + TypeScript com `@openai/agents`, publicado internamente em `/miauw/agent/`, com health/status e endpoints internos `run`/`stream` protegidos por token. Ele roda em modo sombra, sem escrita real, enquanto o PHP segue dono do chat, sessoes, widget, confirmacoes e auditoria.
- Miauby iniciou a Fase 8 do agente operacional v2: o PHP ganhou adaptador para chamar o servico Node em sombra, comparar resposta oficial com resposta sombra e registrar trace seguro em `miauw_tool_traces`. A comparacao automatica por envio fica desligada por padrao (`MIAUW_AGENT_SHADOW_ON_SEND=false`) para nao impactar a operacao.
- Miauby iniciou a Fase 9 do agente operacional v2: existe `MIAUW_ENGINE=php|node_shadow|node` para cortar o motor com rollback por `.env`, `MIAUW_MAINTENANCE_MODE` bloqueia usuarios comuns durante testes e `adm` fica liberado por padrao para usar o Node como resposta oficial quando configurado.
- Miauby iniciou a Fase 10 do agente operacional v2: a personalidade do Miauby agora tem contrato versionado (`miauby-persona-2026-05-16`) no PHP, no diagnostico e no servico Node. O agente Node preserva tom de fiscal interno, humor curto, bordoes controlados e pedido minimo de contexto, e `apps/miauw-agent` possui `npm run check:persona` para evitar regressao para resposta generica.
- Miauby iniciou a Fase 11 do agente operacional v2: o PHP exporta contratos versionados das tools OpenAI a partir do registry e envia esse contexto ao servico Node em `run`/`stream`; o Node usa isso para responder com nocao das capacidades auditadas, mas continua sem escrita direta, com confirmacoes e execucao real ainda no PHP.
- Miauby iniciou a Fase 12 do agente operacional v2: o servico Node executa uma primeira tool real de leitura segura (`consultar_contrato_tool_miauby`) sobre os contratos enviados pelo PHP. Ela apenas consulta capacidades auditadas; escrita, confirmacao, sessao e auditoria de dados continuam no PHP.
- Miauby iniciou a Fase 13 do agente operacional v2: o servico Node executa tools reais de leitura baixa por uma ponte PHP interna tokenizada (`/miauw/agent-tools.php`) para Financeiro, Cashback, Codigos e Cotacao, com pre-leitura deterministica quando o pedido e claro. O Node continua sem credencial de banco e com `writes_enabled=false`; sangria, tarefas, encomendas e qualquer escrita forte seguem no fluxo PHP com confirmacao/auditoria.
- Miauby iniciou a Fase 14 do agente operacional v2: o servico Node passou a orquestrar todas as OpenAI tools exportadas pelo registry via ponte PHP universal. Leituras, diagnosticos e cliente mascarado executam pelo PHP auditado; `criar_tarefa` pode gravar como escrita de baixo risco com usuario logado; sangria, lancamentos, encomendas e demais acoes fortes retornam `confirmation_required`, sem escrita direta pelo Node. Desde 2026-05-26, quando esse retorno acontece com `MIAUW_ENGINE=node`, o Node devolve um evento estruturado e o PHP cria a confirmacao na sessao real do operador para exibir o card `Confirmar/Cancelar`.
- Miauby iniciou a Fase 15 do agente operacional v2: existe um roteador de estilo versionado (`miauby-style-router-2026-05-16`) para perguntas casuais, bastidor tecnico, saudacoes e ruido. O PHP exporta contexto de estilo e memorias/padroes aprovados ao Node; o Node responde localmente quando nao precisa gastar chamada online, evita listas em conversa solta e preserva a voz de gato fiscal sem virar catalogo de ferramentas.
- Miauby iniciou a Fase 16 do agente operacional v2: o chat ganhou feedback `Boa`/`Treinar`, o painel restrito `/miauw/treino.php` revisa exemplos de resposta, a tabela `miauw_treinos_respostas` preserva versoes sem apagar historico e exemplos aprovados entram no `style_context` enviado ao Node. O servico agente passou para `SERVICE_VERSION=0.10.0` e `PHASE=fase16-training-feedback`, ainda sem escrita direta no Node.
- Miauby iniciou a Fase 17 do agente operacional v2: exemplos aprovados viram um perfil compilado de voz/relevancia antes de chegar ao Node, perguntas repetidas pelo treino podem responder localmente sem chamada online, e o servico agente passou para `SERVICE_VERSION=0.11.0` e `PHASE=fase17-training-compiler`.
- Miauby iniciou a Fase 18 do agente operacional v2: o PHP exporta perfis versionados de voz/tom (`miauby_padrao`, `miauby_curto`, `miauby_operacional`) e um contrato de audio seguro (`text_only`, sem microfone, playback, transcricao ou gravacao). O Node passou para `SERVICE_VERSION=0.12.0` e `PHASE=fase18-voice-audio-readiness`, recebendo o perfil de voz no `style_context`; audio real continua desligado por padrao.
- Miauby ajustou a Fase 19 do agente operacional v2: o chat e o widget global usam botao `Falar` em fluxo estilo WhatsApp. O navegador grava audio temporario somente apos clique, o PHP transcreve com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, a tela mostra um rascunho local com player/duracao/transcricao, o texto entra no campo para revisao e o usuario decide `Enviar`, `Refazer` ou `Descartar audio`. A chave nao vai para o navegador, audio nao e armazenado no banco e escrita operacional por voz continua bloqueada.
- Miauby iniciou a Fase 20 do agente operacional v2: audio enviado aparece no chat/widget como player com ondas, sem mostrar a transcricao na bolha enviada; a transcricao segue internamente para contexto. Quando a mensagem veio por audio, o PHP gera resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts` e `MIAUW_SPEECH_VOICE=marin`, sem armazenar audio. Audios curtos demais sao bloqueados para reduzir transcricao inventada.
- Miauby iniciou a Fase 21 do agente operacional v2: o playback dos audios usa URL temporaria `blob:` permitida apenas em `media-src`, a resposta falada mostra o audio como principal e deixa a transcricao escondida por padrao, o TTS recebeu perfil de fala mais vivo e o diagnostico permite escolher voz base entre `marin`, `cedar`, `ash`, `coral` e `verse` sem mexer em segredo.
- O canal WhatsApp do Miauby iniciou como backend dedicado em `apps/miauw-whatsapp`, usando Node.js 22 + TypeScript e Postgres 17 proprio. O servico publica `/miauw/whatsapp/` por proxy Apache, recebe webhooks da Evolution API ou da Meta Cloud API oficial, usa allowlist, prefixo opcional, fila duravel, dedupe, anti-flood por remetente e global, pausa em erro temporario do transporte, painel operacional com login opcional por `.env`, favicon proprio do Miauby e outbox. O painel permite autorizar/bloquear remetentes no Postgres, ver/editar telefone completo na allowlist autenticada, ver o telefone completo resolvido na Sincronia recente logada, editar nome, liberar cards por contato, comparar mensagem recebida com resposta enviada e acompanhar/resolver erros abertos; fora dessas areas logadas, telefone continua mascarado. Contatos cadastrados aparecem minimizados para reduzir poluicao visual. Tambem exibe a demora total da resposta em 24h, latencia da IA e grafico simples de media/p95 por motor. O modo de IA pode ser `miauw`, `gemini` ou `hybrid`: no hibrido, conversa solta sem comando vai para Gemini com personalidade/instrucoes seguras; mensagens com `miauby` e, quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, comandos operacionais detectados como `sangria 10 Will` vao para o core Miauby/OpenAI com tools e guardrails. O core WhatsApp bloqueia tool quando o card detectado nao esta liberado para o telefone, considerando tambem o telefone real resolvido por `MIAUW_WHATSAPP_RECIPIENT_ALIASES` quando a Evolution entrega LID/alias. A allowlist compara DDI `55` e nono digito brasileiro para aceitar o mesmo numero com ou sem `9`; desconhecidos recebem apenas aviso interno, sem IA/core. Cache curto reduz repeticao; escritas fortes dependem de pendencia e confirmacao/auditoria do core, nunca de texto solto do Gemini. O repositorio mantem default seguro `MIAUW_WHATSAPP_ENABLED=false`; em producao o canal pode ser ativado por `.env` quando tokens/cifragem estiverem configurados. A stack separada da Evolution API tem template em `ops/evolution/` e roda no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`; para Meta, usar `MIAUW_WHATSAPP_PROVIDER=meta`.
- A allowlist do WhatsApp aceita numeros com ou sem DDI `55`, com espacos/pontuacao, com DDD completo ou apenas local de 8/9 digitos. Numeros locais usam `MIAUW_WHATSAPP_DEFAULT_DDD=44` por padrao e geram variantes com/sem nono digito; comparacao por sufixo exige pelo menos 8 digitos para nao liberar contato amplo por engano.
- Desde 2026-05-27, o bridge WhatsApp pode transcrever audios autorizados com Gemini e responder em audio por Gemini TTS quando as flags de audio estiverem ligadas. O padrao de voz usa `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr` e `MIAUW_WHATSAPP_AUDIO_TTS_STYLE` para uma leitura mais aguda/brilhante e levemente felina, sem clonagem de voz. O Git mantem audio desligado por padrao; o banco guarda metadados sanitizados e transcricao, nunca bytes de audio bruto.
- Desde 2026-05-27, o bridge WhatsApp pode ler foto, print, imagem encaminhada ou PDF/documento de comprovante Pix autorizado quando `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`. Ele baixa a midia somente em memoria, extrai dados com Gemini, confere o destino por CNPJ/chave Pix `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ` ou nome correlato em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES`, prepara um lancamento `Pix CNPJ` no Financeiro e exige confirmacao `Sim`/`Nao`; o banco nao guarda midia bruta nem URL/token. Antes de chamar OCR/Gemini, o contato precisa ter card `Financeiro` liberado. A flag manteve o nome `IMAGE` por compatibilidade, mas tambem cobre PDF/documento de comprovante; a leitura usa legenda/nome do arquivo como pista, reforca valor pago contra saldo/tarifa/limite e faz fallback deterministico para valor/data/hora quando o JSON vier incompleto. Correcao manual aceita `pix cnpj valor - nome - obs opcional` sem data/hora; nesse caso usa o momento atual.
- Confirmacoes por Evolution API usam texto simples por padrao: `Responda SIM para gravar ou NAO para cancelar`, sem mostrar codigo curto. Isso evita o caso em que `sendButtons` retorna ID de sucesso, mas o WhatsApp normal/linked device nao renderiza o box. Meta Cloud API pode continuar com botoes interativos; Evolution so deve usar botoes com `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS=true` apos teste real e agora essa variavel passa pelo Compose. Clique em botao ou `SIM`/`NAO` confirma somente pendencia ativa no Postgres, sem executar texto solto.
- Saudacoes simples no WhatsApp, como `oi`, `ola`, `teste` e `status`, respondem localmente sem Gemini/core para reduzir latencia; audios repetidos podem reaproveitar cache curto de TTS. O painel `Miauby Whatsapp` mostra uma area `n8n automacoes` com as rotinas planejadas e os destinatarios calculados pelos cards da allowlist.
- LIDs da Evolution configurados em `MIAUW_WHATSAPP_RECIPIENT_ALIASES` ficam ocultos e protegidos na allowlist editavel do painel WhatsApp; o operador edita o telefone real vinculado, e o n8n calcula destinatarios apenas pelos contatos reais autorizados.
- Quando uma mensagem chega por `@lid` configurado em `MIAUW_WHATSAPP_RECIPIENT_ALIASES`, o painel/permissoes continuam usando o telefone real resolvido, mas o transporte responde pelo endereco original do chat para a resposta aparecer no mesmo WhatsApp que enviou a mensagem.
- O backend WhatsApp possui endpoints internos para n8n/pos-deploy (`/miauw/whatsapp/internal/smoke-check` e `/miauw/whatsapp/internal/watchdog`) e recuperacao de outbox: pendencias recentes podem ser reenviadas automaticamente, enquanto pendencias antigas viram `dead` para nao disparar mensagem fora de contexto depois de queda ou deploy.
- O n8n tambem pode chamar `POST /miauw/whatsapp/internal/pedidos-arrival-check` todo dia as 17h. O bridge consulta Pedidos, envia os titulos em `Aguardando chegada` para contatos autorizados com card `Pedidos` e o painel mostra a rotina `Chegada de pedidos` com botao de pausar/ativar. Respostas como `cimed chegou` confirmam apenas a chegada pelo endpoint interno de Pedidos e deixam o boleto em `Confirmados` para pagar.
- O n8n tambem pode chamar `POST /miauw/whatsapp/internal/financeiro-cash-closing-reminder` todo dia as 18h. O bridge consulta Financeiro por `GET /financeiro/api/internal/cash-closing-status` e so envia lembrete para contatos autorizados com card `Financeiro` quando o caixa do dia ainda estiver aberto; se ja estiver `fechado`, `divergente` ou `sem_movimento`, nao envia nada.
- O n8n fica documentado como automacao externa em `docs/23-n8n-automacoes.md`, com template em `ops/n8n/`. Ele deve agendar e orquestrar alertas de Pedidos, Financeiro, deploy/checks e webhooks do Miauby, mas nao deve escrever direto nos bancos de negocio nem pular confirmacao/auditoria.
- O WhatsApp e o Miauby interno compartilham contexto pelo endpoint interno tokenizado `site/miauw/agent-context.php`: o bridge busca `style_context`, treino aprovado, perfil de voz e contratos de tools antes de chamar `wimifarma-miauw-agent`. Com isso, `miauby sangria ...` e comandos equivalentes usam o mesmo core do chat interno. Acoes fortes permitidas podem gerar uma pendencia no Postgres do bridge e uma confirmacao `Sim`/`Nao` no WhatsApp via `site/miauw/agent-actions.php`; a execucao vem desligada por padrao no repositorio e so deve ser ativada com allowlist e tools revisadas.
- Desde 2026-05-28, os dois canais tambem compartilham memoria curta sanitizada pelo Postgres do bridge WhatsApp, em `miauw_whatsapp_channel_events`, via `POST /miauw/whatsapp/internal/memory`. O PHP usa essa ponte por `MIAUW_CHANNEL_MEMORY_BRIDGE_URL` e mantem `site/miauw/agent-memory.php`/`miauw_channel_events` como fallback de compatibilidade. O interno grava mensagens/respostas, o WhatsApp grava turnos enviados sem travar a fila, e `agent-context.php` devolve `channel_memory` para Gemini/core manter continuidade. Essa memoria nao guarda telefone cru, payload bruto, audio/midia nem segredo.
- Miauby tambem entende comandos controlados da Gestao: `gestao` aponta para `/gestao/`, e aceita ordens como `gestao - titulo - 500 - categoria`, `gestao - 500 - titulo`, `gestao titulo 500` e categoria antes/depois; quando houver so nome + valor, usa categoria `geral`. Toda criacao prepara confirmacao humana antes de gravar pelo endpoint interno tokenizado da Gestao. Se um comando incompleto pedir correcao, uma nova mensagem iniciada por `gestao` substitui a pendencia anterior em vez de juntar prompts antigos.
- Miauby conhece o contexto do XP: `/xp/` e a trilha gamificada dos atendentes, R$ 1.000,00 em vendas gera 2.500 XP e "farmar aura no XP" e linguagem interna para incentivar venda real e lancamento correto, sem inventar ranking, nivel ou pontuacao.
- O painel restrito `/miauw/diagnostico.php` mostra falhas internas recentes do Miauby com `trace_id`, erro sanitizado, hash e contexto curto da ferramenta/confirmacao, permitindo investigar falhas automaticas sem expor segredo, SQL bruto ou stack trace ao operador.
- A navegacao superior do Miauby fica focada em Chat/Treino/Diagnostico/Sair; atalhos diretos para Cashback, Cotacao e Financeiro foram removidos para deixar o modulo mais limpo.
- O frontend de audio do Miauby tenta abrir o microfone por `getUserMedia()` mesmo quando o estado previo de permissao parece desatualizado; se o Chrome/Windows recusar, a mensagem indica recarregar/redefinir permissao ou revisar a permissao de microfone do sistema.
- Os headers de seguranca dos modulos internos permitem `microphone=(self)` para o audio do Miauby no proprio dominio, mantendo camera e geolocalizacao bloqueadas.
- O Miauby tem integracao documentada para WhatsApp via Evolution API ou Meta Cloud API: o transporte recebe mensagens por webhook e devolve respostas por API, mas o motor, permissoes, guardrails, confirmacoes e auditoria continuam no Miauby. A primeira versao deve usar allowlist de numeros e nao expor o numero publico do Cashback a respostas internas sem filtro.
- Miauby so alerta encomendas da Cotacao quando a linha esta com prioridade explicita `encomenda` e passou de 1 dia sem baixa/pedido; o comentario curto aparece no balao do widget em qualquer modulo onde o Miauby esteja carregado.
- A seguranca de base inclui CSRF nos formularios internos, headers de seguranca, bloqueio de `xmlrpc.php`, bloqueio de execucao em uploads versionados, limitador de login nos modulos PHP e na Cotacao V2, e varredura local de segredos por `scripts/check-secrets.ps1`.

Pontos ainda pendentes ficam registrados em `docs/06-pendencias.md`.

## Stack

- PHP 8.3 com Apache
- MySQL 8.0
- WordPress na raiz publica `site/`
- Modulos internos PHP remanescentes para Miauby e WordPress/tema; os modulos de operacao principais estao sendo cortados para Node.js/TypeScript/Postgres por dominio.
- Docker Compose
- Nginx Proxy Manager no VPS para publicar dominios
- OpenAI API usada pelo Miauby
- Node.js 22 + Express + Socket.IO para Cotacao V2
- Node.js 22 + TypeScript + Express para Cashback, Gestao, Pedidos, Tarefa, XP, Codigos, Financeiro e Usuarios
- Node.js 22 + TypeScript + Agents SDK para Miauby em modo sombra/corte controlado com adaptador PHP, tools Node por ponte PHP interna, contexto de treino aprovado, perfil compilado, perfis de voz/tom e audio por gravacao temporaria/transcricao confirmada, bolha/player de audio, resposta falada temporaria e seletor seguro de voz no diagnostico
- Node.js 22 + TypeScript para o bridge WhatsApp do Miauby via Evolution API ou Meta Cloud API
- PostgreSQL 17 para o core compartilhado de autenticacao
- PostgreSQL 17 para dados do Cashback
- PostgreSQL 17 para dados da Cotacao V2
- PostgreSQL 17 para dados do XP
- PostgreSQL 17 para dados de Codigos
- PostgreSQL 17 para dados do Financeiro
- PostgreSQL 17 dedicado para fila/eventos/outbox do Miauby WhatsApp
- Redis 7 para sessoes e presenca da Cotacao V2

## Instalar localmente

### Em outro PC com Codex

Se o projeto ainda nao existir nesse computador, peça ao Codex:

```text
Puxe o projeto Wimifarma do GitHub em C:\Users\Thiesen\Desktop\wimifarma-com e siga o AGENTS.md.
Repositorio: https://github.com/WilliYY/wimifarma-com.git
```

O comportamento esperado esta documentado em `AGENTS.md` e `docs/05-comandos.md`: clonar quando a pasta nao existe; se ela ja existir, fazer `git fetch`, conferir se nao ha alteracoes locais e so entao `git pull --ff-only origin main`. Segredos como `.env`, `config.local.php`, bancos e volumes nao vem do Git e precisam ser configurados por fonte segura da maquina/servidor.

1. Entrar na pasta do projeto:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
```

2. Criar o `.env` local a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

3. Editar `.env` com valores reais do ambiente local. Nunca versionar `.env`.

4. Opcionalmente configurar o Miauby por arquivo local:

```powershell
Copy-Item site\miauw\config.local.example.php site\miauw\config.local.php
```

Depois editar `site\miauw\config.local.php`. Esse arquivo tambem nao deve ser versionado.

## Como rodar

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas principais:

- `http://127.0.0.1:3002/cashback/login.php`
- `http://127.0.0.1:3002/cashback/health`
- `http://127.0.0.1:3002/codigos/login.php`
- `http://127.0.0.1:3002/cotacao/login.php`
- `http://127.0.0.1:3002/financeiro/login.php`
- `http://127.0.0.1:3002/usuarios/login.php`
- `http://127.0.0.1:3002/usuarios/health`
- `http://127.0.0.1:3002/gestao/login.php`
- `http://127.0.0.1:3002/gestao/health`
- `http://127.0.0.1:3002/pedidos/`
- `http://127.0.0.1:3002/pedidos/health`
- `http://127.0.0.1:3002/xp/login.php`
- `http://127.0.0.1:3002/xp/health`
- `http://127.0.0.1:3002/tarefa/login.php`
- `http://127.0.0.1:3002/tarefa/health`
- `http://127.0.0.1:3002/miauw/login.php`
- `http://127.0.0.1:3002/miauw/treino.php`
- `http://127.0.0.1:3002/miauw/diagnostico.php`
- `http://127.0.0.1:3002/miauw/widget-status.php`
- `http://127.0.0.1:3002/miauw/agent/health`
- `http://127.0.0.1:3002/miauw/whatsapp/`
- `http://127.0.0.1:3002/miauw/whatsapp/health`

## Comandos principais

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker compose logs --tail=80 wimifarma-cashback-app
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-pedidos-app
docker compose logs --tail=80 wimifarma-tarefa-app
docker compose logs --tail=80 wimifarma-miauw-agent
docker compose logs --tail=80 wimifarma-miauw-whatsapp
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
powershell -ExecutionPolicy Bypass -File scripts/check-secrets.ps1
cd apps/miauw-agent; npm.cmd run check:persona; cd ../..
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -sS http://127.0.0.1:3002/cashback/health
curl.exe -L --max-time 30 http://127.0.0.1:3002/gestao/login.php
curl.exe -sS http://127.0.0.1:3002/pedidos/health
curl.exe -sS http://127.0.0.1:3002/tarefa/health
curl.exe -sS http://127.0.0.1:3002/miauw/agent/health
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/health
curl.exe -sS http://127.0.0.1:3002/usuarios/health
curl.exe -sS http://127.0.0.1:3002/cotacao/health
curl.exe -sS http://127.0.0.1:3002/cotacao/api/diagnostics
curl.exe -sS http://127.0.0.1:3002/cotacao/api/google-sheets/status
```

Mais comandos ficam em `docs/05-comandos.md`.

## Estrutura de pastas

```text
.
|-- apps/
|   |-- cashback/            # Cashback Node.js/TypeScript/Postgres oficial
|   |-- cotacao/             # Cotacao V2 Node.js/Socket.IO
|   |-- gestao/              # Gestao Node.js/TypeScript/Postgres
|   |-- pedidos/             # Pedidos Node.js/TypeScript, separado de Gestao
|   |-- tarefa/              # Tarefa Node.js/TypeScript/Postgres
|   |-- xp/                  # XP Node.js/TypeScript/Postgres oficial
|   |-- codigos/             # Codigos Node.js/TypeScript/Postgres oficial
|   |-- financeiro/          # Financeiro Node.js/TypeScript/Postgres oficial
|   |-- usuarios/            # Usuarios Node.js/TypeScript no core Postgres
|   |-- miauw-agent/         # Miauby agente Node/TypeScript em sombra/corte controlado
|   `-- miauw-whatsapp/      # Bridge WhatsApp Node/TypeScript com painel operacional
|-- ops/
|   `-- evolution/           # Template da stack Evolution API separada
|-- cotacao-data/            # volumes Postgres/Redis ignorados pelo Git
|-- cashback-data/           # volume Postgres do Cashback ignorado pelo Git
|-- gestao-data/             # volume Postgres da Gestao ignorado pelo Git
|-- tarefa-data/             # volume Postgres do Tarefa ignorado pelo Git
|-- xp-data/                 # volume Postgres do XP ignorado pelo Git
|-- codigos-data/            # volume Postgres de Codigos ignorado pelo Git
|-- financeiro-data/         # volume Postgres do Financeiro ignorado pelo Git
|-- docker/
|   |-- php/Dockerfile
|   `-- mysql/init/
|-- docs/
|-- mysql/                  # volume local ignorado pelo Git
|-- site/
|   |-- home.php              # home publica estavel, fora do bootstrap WordPress
|   |-- cashback/             # legado/assets; rota oficial usa apps/cashback por proxy
|   |-- codigos/              # legado/assets; rota oficial usa apps/codigos por proxy
|   |-- financeiro/
|   |-- gestao/               # legado PHP; rota oficial usa apps/gestao por proxy
|   |-- miauw/
|   |-- xp/                   # modulo XP dos atendentes, com fotos validadas e trilha de niveis
|   |-- tarefa/               # legado PHP/assets historicos; rota oficial usa apps/tarefa por proxy
|   |-- wp-admin/
|   |-- wp-content/
|   |-- wp-includes/
|   `-- wp-config.php
|-- .env.example
|-- docker-compose.yml
|-- AGENTS.md
`-- README.md
```

## Variaveis de ambiente

Variaveis esperadas em `.env`:

```text
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
WIMIFARMA_DB_HOST
WIMIFARMA_DB_USER
WIMIFARMA_DB_PASSWORD
WIMIFARMA_WP_DB_NAME
WIMIFARMA_APP_DB_NAME
RSSSL_KEY
WP_AUTH_KEY
WP_SECURE_AUTH_KEY
WP_LOGGED_IN_KEY
WP_NONCE_KEY
WP_AUTH_SALT
WP_SECURE_AUTH_SALT
WP_LOGGED_IN_SALT
WP_NONCE_SALT
WP_CACHE
WIMIFARMA_PUBLIC_PAGE_CACHE
CODIGOS_GROUP_DELETE_PASSWORD
CODIGOS_POSTGRES_PASSWORD
CODIGOS_SESSION_SECRET
CODIGOS_AUTH_PROVIDER
CODIGOS_INTERNAL_TOKEN
CODIGOS_INTERNAL_BASE_URL
CODIGOS_LEGACY_MYSQL_IMPORT_ENABLED
CODIGOS_LEGACY_MYSQL_MIRROR_ENABLED
CODIGOS_LEGACY_MYSQL_LOGS_ENABLED
CASHBACK_POSTGRES_PASSWORD
CASHBACK_SESSION_SECRET
CASHBACK_AUTH_PROVIDER
CASHBACK_INTERNAL_TOKEN
CASHBACK_INTERNAL_BASE_URL
CASHBACK_LEGACY_MYSQL_IMPORT_ENABLED
CASHBACK_LEGACY_MYSQL_MIRROR_ENABLED
CASHBACK_LEGACY_MYSQL_LOGS_ENABLED
MIAUW_OPENAI_API_KEY
MIAUW_OPENAI_MODEL
MIAUW_GUARDIAN_TOKEN
MIAUW_AGENT_INTERNAL_TOKEN
MIAUW_AGENT_INTERNAL_BASE_URL
MIAUW_PHP_TOOL_BRIDGE_URL
MIAUW_AGENT_SHADOW_ON_SEND
MIAUW_AGENT_SHADOW_TIMEOUT_MS
MIAUW_ENGINE
MIAUW_AGENT_ENGINE_ALLOWED_USERS
MIAUW_MAINTENANCE_MODE
MIAUW_MAINTENANCE_ALLOWED_USERS
MIAUW_MAINTENANCE_MESSAGE
MIAUW_VOICE_PROFILE
MIAUW_AUDIO_ENABLED
MIAUW_TRANSCRIPTION_MODEL
MIAUW_SPEECH_MODEL
MIAUW_SPEECH_VOICE
MIAUW_REALTIME_MODEL
MIAUW_REALTIME_VOICE
MIAUW_WHATSAPP_ENABLED
MIAUW_WHATSAPP_POSTGRES_PASSWORD
MIAUW_WHATSAPP_WEBHOOK_TOKEN
MIAUW_WHATSAPP_INTERNAL_TOKEN
MIAUW_WHATSAPP_ENCRYPTION_KEY
MIAUW_WHATSAPP_HASH_SALT
MIAUW_WHATSAPP_ALLOWED_SENDERS
MIAUW_WHATSAPP_DASHBOARD_USER
MIAUW_WHATSAPP_DASHBOARD_PASSWORD
MIAUW_WHATSAPP_DASHBOARD_SESSION_TTL_MINUTES
MIAUW_WHATSAPP_DEFAULT_DDD
MIAUW_WHATSAPP_REQUIRE_PREFIX
MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX
MIAUW_WHATSAPP_PREFIX
MIAUW_WHATSAPP_GROUPS_ENABLED
MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND
MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE
MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY
MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS
MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS
MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE
MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS
MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS
MIAUW_WHATSAPP_AI_MODE
MIAUW_WHATSAPP_GEMINI_MODEL
MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS
MIAUW_WHATSAPP_GEMINI_TEMPERATURE_X100
MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET
MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED
MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED
MIAUW_WHATSAPP_AUDIO_REPLY_MODE
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_PROVIDER
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_MODEL
MIAUW_WHATSAPP_AUDIO_TTS_PROVIDER
MIAUW_WHATSAPP_AUDIO_TTS_MODEL
MIAUW_WHATSAPP_AUDIO_TTS_VOICE
MIAUW_WHATSAPP_AUDIO_TTS_STYLE
MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_TIMEOUT_MS
MIAUW_WHATSAPP_AUDIO_TTS_TIMEOUT_MS
MIAUW_WHATSAPP_AUDIO_MAX_BYTES
MIAUW_WHATSAPP_AUDIO_TTS_MAX_CHARS
MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED
MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ
MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES
MIAUW_WHATSAPP_PIX_RECEIPT_MIN_TARGET_SCORE_X100
MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL
MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_MAX_BYTES
MIAUW_WHATSAPP_PIX_RECEIPT_OCR_TIMEOUT_MS
MIAUW_WHATSAPP_CONTEXT_PACK
MIAUW_WHATSAPP_CONTEXT_URL
MIAUW_WHATSAPP_CONTEXT_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_CONTEXT_TIMEOUT_MS
MIAUW_WHATSAPP_ACTIONS_URL
MIAUW_WHATSAPP_ACTIONS_TIMEOUT_MS
MIAUW_WHATSAPP_CONFIRMATIONS_ENABLED
MIAUW_WHATSAPP_INTERACTIVE_CONFIRMATIONS
MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED
MIAUW_WHATSAPP_CONFIRMATION_TTL_MINUTES
MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST
MIAUW_WHATSAPP_ACTOR_USER_ID
MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS
MIAUW_WHATSAPP_RECIPIENT_ALIASES
MIAUW_WHATSAPP_PROVIDER
GEMINI_API_KEY
GEMINI_API_BASE_URL
EVOLUTION_API_BASE_URL
EVOLUTION_API_KEY
EVOLUTION_API_INSTANCE
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
META_WHATSAPP_APP_SECRET
META_WHATSAPP_GRAPH_API_VERSION
COTACAO_INTERNAL_TOKEN
COTACAO_INTERNAL_BASE_URL
GESTAO_INTERNAL_TOKEN
GESTAO_INTERNAL_BASE_URL
GESTAO_POSTGRES_PASSWORD
GESTAO_SESSION_SECRET
USUARIOS_SESSION_SECRET
USUARIOS_TAREFA_INTERNAL_BASE_URL
USUARIOS_TAREFA_INTERNAL_TOKEN
USUARIOS_MIAUW_WHATSAPP_INTERNAL_BASE_URL
USUARIOS_MIAUW_WHATSAPP_INTERNAL_TOKEN
USUARIOS_INTERNAL_HTTP_TIMEOUT_MS
PEDIDOS_SESSION_SECRET
PEDIDOS_CORE_AUTH_TIMEOUT_MS
TAREFA_POSTGRES_PASSWORD
TAREFA_SESSION_SECRET
TAREFA_AUTH_PROVIDER
TAREFA_INTERNAL_TOKEN
TAREFA_CORE_AUTH_SHADOW_ENABLED
TAREFA_LEGACY_MYSQL_IMPORT_ENABLED
TAREFA_LEGACY_MYSQL_MIRROR_ENABLED
TAREFA_LEGACY_MYSQL_LOGS_ENABLED
XP_POSTGRES_PASSWORD
XP_SESSION_SECRET
XP_AUTH_PROVIDER
XP_LEGACY_MYSQL_IMPORT_ENABLED
XP_LEGACY_MYSQL_MIRROR_ENABLED
XP_LEGACY_MYSQL_LOGS_ENABLED
COTACAO_POSTGRES_PASSWORD
COTACAO_SESSION_SECRET
COTACAO_BACKUP_DIR
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_RANGE
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE
```

Nao colocar valores reais no README, em commits ou em issues publicas.

## Arquivos fora do Git

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`
- `tarefa-data/`
- `cashback-data/`
- `xp-data/`
- `node_modules/`

## Deploy no VPS

O VPS atual usa Ubuntu/Oracle, PuTTY para terminal e WinSCP para arquivos. O Codex tambem pode executar deploy diretamente por SSH/plink com a chave local autorizada, entao nao e necessario enviar comando PuTTY equivalente ao usuario ao final.

Pasta observada no VPS:

```bash
/home/ubuntu/projetos/wimifarma-com
```

Essa deve ser a pasta oficial unica de deploy. Copias temporarias criadas durante a migracao, como `wimifarma-com-git`, `wimifarma-com-code-*` ou `wimifarma-com-runti*`, devem ser auditadas pelos mounts dos containers e arquivadas em `_arquivados-wimifarma/` antes de qualquer exclusao.

Quando o VPS estiver usando Git para este projeto, o fluxo padrao executado pelo Codex/operador sera:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
```

Antes do primeiro deploy do Cashback Node/Postgres no VPS, adicionar valores reais no `.env` para `CASHBACK_POSTGRES_PASSWORD`, `CASHBACK_SESSION_SECRET` e, se o Miauby for consultar resumo interno, `CASHBACK_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`. O app usa Postgres como fonte unica por padrao; `CASHBACK_LEGACY_MYSQL_IMPORT_ENABLED`, `CASHBACK_LEGACY_MYSQL_MIRROR_ENABLED` e `CASHBACK_LEGACY_MYSQL_LOGS_ENABLED` ficam `false` depois da validacao de 2026-05-29. Reativar essas flags exige rollback manual e credenciais MySQL no servico.

Antes do primeiro deploy da Cotacao V2 no VPS, adicionar valores reais no `.env` para `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET`.

Para o Miauby criar/consultar encomendas diretamente na Cotacao V2, manter `MIAUW_GUARDIAN_TOKEN` preenchido ou definir `COTACAO_INTERNAL_TOKEN` com token equivalente no `.env`; o Compose entrega esse segredo ao web/PHP e ao app Node sem versionar o valor.

Para testar o servico Miauby agente, manter `MIAUW_AGENT_INTERNAL_TOKEN` preenchido ou usar o fallback de `MIAUW_GUARDIAN_TOKEN`; `MIAUW_AGENT_INTERNAL_BASE_URL` aponta internamente para `http://wimifarma-miauw-agent:3100/miauw/agent` e `MIAUW_PHP_TOOL_BRIDGE_URL` aponta para `http://wimifarma-com-web/miauw/agent-tools.php`.

Para comparar respostas do PHP com o servico sombra em envios reais, ligar `MIAUW_AGENT_SHADOW_ON_SEND=true` e manter `MIAUW_AGENT_SHADOW_TIMEOUT_MS` com limite baixo o suficiente para nao atrapalhar a equipe. O padrao documentado fica `false`.

Para corte acelerado do Miauby, use `MIAUW_MAINTENANCE_MODE=true`, `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e escolha `MIAUW_ENGINE=node_shadow` ou `MIAUW_ENGINE=node`. Rollback rapido: voltar `MIAUW_ENGINE=php` e, se necessario, `MIAUW_MAINTENANCE_MODE=false`.

Para audio do Miauby, `MIAUW_AUDIO_ENABLED=true` libera o botao de fala no chat e no widget global. O fluxo atual grava audio temporario no navegador, envia para o PHP transcrever com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, mostra um rascunho local com player, duracao e transcricao, coloca o texto no campo e so manda ao Miauby quando o usuario apertar `Enviar`; depois de enviado, a bolha mostra o player/ondas e nao o texto transcrito. Quando a entrada veio por audio, o PHP pode gerar resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts`; a voz base vem de `MIAUW_SPEECH_VOICE` ou do seletor restrito em `/miauw/diagnostico.php`. O player usa `blob:` temporario liberado apenas em `media-src`, a transcricao da resposta fica escondida por padrao e o audio nao e gravado no banco/disco. Gravacoes curtas demais sao bloqueadas e `Refazer`/`Descartar audio` continuam limpando o rascunho. `MIAUW_REALTIME_MODEL` e `MIAUW_REALTIME_VOICE` ficam preservados para evolucao futura de conversa realtime.

Para o Miauby WhatsApp, `/miauw/whatsapp/` mostra o painel operacional seguro com canal, transporte, fila, outbox, allowlist editavel/minimizada, cards liberados por contato, sincronia recente, status de OCR Pix CNPJ, erros abertos com acao de resolver, graficos simples de latencia por motor e eventos recentes. A allowlist logada pode mostrar o telefone completo para correcao, e a Sincronia recente logada mostra o numero completo resolvido por alias para diferenciar LID da Evolution do telefone real; fora dessas areas, o painel continua mascarado. Em producao, proteger o painel com `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`; `/miauw/whatsapp/health` continua publico e sem segredo. O default do repositorio continua `MIAUW_WHATSAPP_ENABLED=false`; no VPS, ligar `MIAUW_WHATSAPP_ENABLED=true` apenas quando token de webhook/verificacao, cifragem, allowlist e transporte (`evolution` ou `meta`) estiverem revisados. Para comandos operacionais sem prefixo, manter `MIAUW_WHATSAPP_REQUIRE_PREFIX=false` e `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true` somente com allowlist/cards liberados e confirmacoes ativas.

Para Tarefa, manter `TAREFA_POSTGRES_PASSWORD`, `TAREFA_SESSION_SECRET` e `TAREFA_INTERNAL_TOKEN` no `.env` de cada ambiente. O corte oficial de `/tarefa/` usa `wimifarma-tarefa-app:3500` por proxy Apache; `TAREFA_AUTH_PROVIDER=core` usa `core_users` como login oficial por padrao e rollback rapido e voltar `TAREFA_AUTH_PROVIDER=mysql`. As flags `TAREFA_LEGACY_MYSQL_IMPORT_ENABLED`, `TAREFA_LEGACY_MYSQL_MIRROR_ENABLED` e `TAREFA_LEGACY_MYSQL_LOGS_ENABLED` controlam a janela MySQL de dados/rollback, nao o login oficial.

Para XP, `apps/xp` e `wimifarma-xp-app:3600` sao a rota oficial `/xp/` via proxy Apache. Manter `XP_POSTGRES_PASSWORD` e `XP_SESSION_SECRET` por ambiente; `XP_AUTH_PROVIDER=core` usa `core_users`, e rollback rapido de autenticacao e voltar `XP_AUTH_PROVIDER=mysql`. As flags `XP_LEGACY_MYSQL_IMPORT_ENABLED`, `XP_LEGACY_MYSQL_MIRROR_ENABLED` e `XP_LEGACY_MYSQL_LOGS_ENABLED` controlam importacao/espelho/log legado para rollback curto.

Para Codigos, `apps/codigos` e `wimifarma-codigos-app:3700` sao a rota oficial `/codigos/` via proxy Apache. Manter `CODIGOS_POSTGRES_PASSWORD` e `CODIGOS_SESSION_SECRET` por ambiente; `CODIGOS_AUTH_PROVIDER=core` usa `core_users`, e rollback rapido de autenticacao e voltar `CODIGOS_AUTH_PROVIDER=mysql`. `CODIGOS_INTERNAL_TOKEN` pode ficar igual ao `MIAUW_GUARDIAN_TOKEN` para o Miauby ler Codigos direto do Postgres por endpoint interno. As flags `CODIGOS_LEGACY_MYSQL_IMPORT_ENABLED`, `CODIGOS_LEGACY_MYSQL_MIRROR_ENABLED` e `CODIGOS_LEGACY_MYSQL_LOGS_ENABLED` controlam importacao/espelho/log legado para rollback curto.

Para Financeiro, `apps/financeiro` e `wimifarma-financeiro-app:3800` sao a rota oficial `/financeiro/` via proxy Apache. Manter `FINANCEIRO_POSTGRES_PASSWORD`, `FINANCEIRO_SESSION_SECRET` e, se quiser trocar a senha de reabertura, `FINANCEIRO_REOPEN_PASSWORD` por ambiente. `FINANCEIRO_AUTH_PROVIDER=core` usa `core_users`; rollback rapido de autenticacao e voltar `FINANCEIRO_AUTH_PROVIDER=mysql` junto das credenciais MySQL explicitas. `FINANCEIRO_INTERNAL_TOKEN` pode ficar igual ao `MIAUW_GUARDIAN_TOKEN` para o Miauby/WhatsApp gravar `Pix CNPJ` e faturamento por endpoints internos Node/Postgres. `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED` e `FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED` ficam `false` por padrao; ligar essas flags agora e rollback manual, nao operacao normal.

Para Usuarios, `apps/usuarios` e `wimifarma-usuarios-app:3900` sao a rota oficial `/usuarios/` via proxy Apache. Manter `USUARIOS_SESSION_SECRET` por ambiente; o app usa `CORE_POSTGRES_PASSWORD`, consulta o Postgres do XP para associar logins a funcionarios, chama Tarefa por `USUARIOS_TAREFA_INTERNAL_*` para delegar tarefa privada e chama Miauby WhatsApp por `USUARIOS_MIAUW_WHATSAPP_INTERNAL_*` para vincular/remover numeros da allowlist. O painel fica restrito a `adm` ou role `admin`.

Para usar import/export real com Google Sheets, preencher tambem `GOOGLE_SHEETS_SPREADSHEET_ID` e uma credencial de service account em `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`. Sem essas variaveis, a tela mostra o status como nao configurado e nao tenta sincronizar.

Depois do deploy, a home publica deve provar que esta na versao certa:

```bash
curl -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl -I https://wimifarma.com/home.php
```

O header esperado e `X-Served-By: wimifarma-static-home`. Se `home.php` der 404 no dominio publico, o VPS/proxy ainda esta servindo uma copia antiga ou outro container.

Portas importantes:

- container/proxy interno: `wimifarma-com-web:80`
- app interno Tarefa: `wimifarma-tarefa-app:3500`
- app interno XP: `wimifarma-xp-app:3600`
- app interno Codigos: `wimifarma-codigos-app:3700`
- app interno Financeiro oficial: `wimifarma-financeiro-app:3800`
- app interno Usuarios: `wimifarma-usuarios-app:3900`
- bind local do Compose: `127.0.0.1:3002`
- tunel local do PuTTY usado em testes: `127.0.0.1:13002`
- publico: `80/443` via Nginx Proxy Manager

Nao misturar essas portas ao configurar proxy, DNS ou WordPress.

## Documentacao

- `AGENTS.md`: manual obrigatorio para futuras conversas do Codex/agentes.
- `docs/00-visao-geral.md`: visao geral e mapa funcional.
- `docs/01-arquitetura.md`: arquitetura tecnica.
- `docs/02-banco-de-dados.md`: bancos, tabelas e cuidados.
- `docs/03-fluxos-do-sistema.md`: fluxos de usuario e operacao.
- `docs/04-padroes-de-codigo.md`: padroes existentes.
- `docs/05-comandos.md`: comandos locais, VPS, auditoria e Git.
- `docs/06-pendencias.md`: backlog tecnico encontrado.
- `docs/07-historico-de-decisoes.md`: decisoes tecnicas importantes.
- `docs/08-autenticacao-e-permissoes.md`: login, sessao, roles e riscos.
- `docs/09-deploy-e-ambiente.md`: VPS, DNS, proxy, portas e deploy.
- `docs/10-integracoes.md`: OpenAI, Farmacia Popular, GoDaddy, NPM e Google Sheets futuro.
- `docs/11-seguranca.md`: segredos, headers, CSRF, riscos e hardening.
- `docs/15-logs-e-auditoria.md`: logs, auditoria e diagnostico.
- `docs/16-testes.md`: validacoes atuais e evolucao de testes.
- `docs/17-performance.md`: performance, cache e cuidados WordPress.
- `docs/18-miauby-evolucao-generativa.md`: direcao para skills, padroes e autonomia segura do Miauby.
- `docs/19-cotacao-tempo-real.md`: presenca ao vivo, sync atual e caminho para colaboracao estilo Sheets.
- `docs/20-cotacao-v2.md`: arquitetura nova da Cotacao em Node.js, Postgres, Redis e WebSocket.
- `docs/21-miauby-whatsapp.md`: canal WhatsApp do Miauby, Evolution API, Meta Cloud API, painel, fila e seguranca.
- `docs/22-migracao-mysql-postgres.md`: inventario do uso restante de MySQL e plano gradual para migrar modulos internos para Postgres.
- `docs/23-n8n-automacoes.md`: plano de automacoes n8n sem virar backend de regras.
- `docs/24-modernizacao-modulos.md`: inventario dos modulos antigos e caminho para Node.js/TypeScript/Postgres.
- `docs/25-usuarios-permissoes.md`: modulo Usuarios, permissoes centrais, vinculo XP e caminho de enforcement.
- `docs/26-inventario-modulos.md`: ficha detalhada por modulo com rota, telas, permissoes, tabelas, escritas, integracoes e riscos.

Leia `AGENTS.md` antes de qualquer alteracao.
