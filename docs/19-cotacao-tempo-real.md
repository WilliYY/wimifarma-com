# 19 - Cotacao tempo real

## O que esta parte do sistema faz

Este documento registra a camada atual de sincronizacao e presenca ao vivo da Cotacao e o caminho para evoluir a ferramenta para um comportamento mais proximo do Google Sheets. A prioridade e evitar perda de dados, conflito silencioso e divergencia entre computadores.

## Estado atual em 2026-05-12

A Cotacao foi reestruturada como V2 em `apps/cotacao`, servida em `/cotacao/` por proxy interno do Apache para `wimifarma-cotacao-app:3000`.

A V2 usa:

- Node.js/Express para rotas e API;
- Socket.IO para presenca e eventos ao vivo;
- Postgres `wimifarma_cotacao` para linhas, colunas, eventos e regras;
- Redis para sessao e presenca temporaria;
- Core Postgres `core_users` para login unico.

As notas abaixo sobre polling PHP/MySQL ficam como historico da Cotacao legada. O documento principal da nova arquitetura e `docs/20-cotacao-v2.md`.

Na V2, `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum em categoria. Nao existe gatilho escondido por palavra para cor, prioridade, ordem, filtro ou alerta; destaque visual so pode vir de regra condicional explicita.

Em 2026-05-13, a V2 passou a manter heartbeat de presenca a cada poucos segundos, recarregamento leve quando a aba volta/reconecta e protecao para nao deixar uma linha sumir no meio da edicao quando ha filtro ou busca ativa. `Ctrl+Z` tambem desfaz busca/filtro local, sem sincronizar essa visao para outros usuarios.

Em 2026-05-14, a Cotacao PHP antiga foi removida do repositorio. As notas sobre polling PHP/MySQL abaixo permanecem como historico de migracao, mas a rota oficial `/cotacao/` depende somente da V2 em `apps/cotacao`.

Ainda em 2026-05-14, a Etapa 2 adicionou `GET /cotacao/api/events?after=<eventId>` na V2. O frontend usa essa rota para refresh automatico, reconnect e retorno de aba visivel, aplicando eventos simples de celula, lote, linha, estilo e regra sem baixar o snapshot inteiro. Eventos estruturais, cursor invalido ou excesso de eventos pedem snapshot completo por `/cotacao/api/bootstrap`, preservando recuperacao segura.

Na Etapa 3 do mesmo dia, as mutacoes simples tambem ficaram mais leves: salvar celula, colagem em lote, estilos, regras, linhas e colunas deixam de carregar o snapshot completo via `loadSheet()` e passam a validar apenas quote/linha/coluna necessarios. Isso preserva o mesmo canal de eventos e reduz o custo das acoes frequentes enquanto a tela caminha para comportamento mais proximo do Sheets.

Ainda em 2026-05-14, a Etapa 4 deixou o commit de celula otimista no frontend. Ao trocar de celula, a linha afetada atualiza imediatamente e o save segue em segundo plano; se houver erro real, a celula e revertida ou marcada sem recarregar a planilha inteira. Isso reduz a espera percebida entre clicar em outra celula e continuar digitando.

Na etapa seguinte de colaboracao visual, a presenca passou a ser desenhada na propria grade: quando outro usuario seleciona ou edita uma celula visivel, a celula recebe contorno colorido, etiqueta com o animal daquela aba e tooltip com coluna/linha. Esse indicador e apenas informativo; a regra operacional atual para a mesma celula e ultimo salvamento vence, com recuperacao pelo historico.

Depois disso, `Delete`/`Backspace` na selecao da V2 tambem passou a seguir o mesmo caminho otimista: a tela limpa as celulas imediatamente e envia lote em segundo plano.

O botao `Historico` da Cotacao V2 fica no topo, ao lado do contador de linhas com dados. Ele consulta `cotacao_v2_events` para a celula selecionada e permite restaurar um valor anterior por uma nova gravacao normal, mantendo auditoria.

Em 2026-05-15, a mesma logica otimista foi aplicada aos lotes visiveis da planilha: colagem, desfazer/refazer de lote e alca de preenchimento atualizam a grade localmente, salvam por `/cotacao/api/cells/batch` e redesenham apenas as linhas afetadas. Eventos remotos de celula/lote tambem evitam renderizacao completa quando nao ha mudanca estrutural. Cores copiadas pelo fill handle ou aplicadas/apagadas em selecoes grandes usam endpoints de estilo em lote para reduzir chamadas pequenas.

Em 2026-05-16, a aplicacao de eventos remotos durante edicao local foi reforcada: se uma aba esta editando uma celula e recebe `cell_updated` ou `cells_batch_updated` de outra aba, os valores entram no estado imediatamente, as linhas afetadas ficam marcadas para redesenho e a grade atualiza essas linhas ao encerrar a edicao. Isso evita que celulas calculadas, como `Ganhador`, e contadores fiquem visualmente atrasados. Lotes sem mudanca real tambem deixam de gerar eventos vazios na fila incremental.

Tambem em 2026-05-16, eventos estruturais leves deixaram de cair automaticamente em snapshot completo. Inserir linha, criar, renomear, mover, apagar, restaurar ou redimensionar distribuidora passam a carregar payload suficiente para a outra aba atualizar colunas localmente. O resize de coluna tambem deixou de recalcular a altura de todas as celulas a cada movimento do mouse; o auto-ajuste roda uma vez apos o fim do arrasto. As chamadas de `/cotacao/api/*`, incluindo `/cotacao/api/events`, tambem passaram a responder e ser buscadas com `no-store`, evitando `304` de cache que fazia o frontend cair em fallback pesado de snapshot.

Na revisao seguinte do mesmo dia, o resize de coluna deixou de usar o canal generico `columns:changed` e passou a emitir `column:resized`. Isso evita que abas ainda com JavaScript antigo recebam o evento generico e facam `/cotacao/api/bootstrap` completo ao soltar o mouse. O auto-ajuste apos o mouseup tambem ficou limitado aos inputs da coluna redimensionada, processado em pequenos lotes por frame.

Tambem em 2026-05-15, a navegacao de teclado durante edicao foi ajustada para uso operacional rapido: `Enter` salva a celula editada e desce exatamente uma linha. Em 2026-05-16, o editor voltou a priorizar edicao interna do texto: duplo clique e `F2` abrem a celula sem selecionar todo o conteudo, cliques dentro do editor posicionam o cursor e as setas movem o cursor dentro do texto. Na digitacao direta a partir de uma celula selecionada, as setas confirmam o valor e movem a selecao para a celula vizinha, sem alterar o comportamento de duplo clique/`F2`.

## Historico da Cotacao PHP legada

Antes da V2, a Cotacao PHP possuia:

- polling de sincronizacao por `sync_pull`;
- polling incremental por `sync_events_pull`, usando eventos em `cotacao_eventos` antes de recorrer a snapshot completo;
- filtros local-first por padrao, com `sync_filter` mantido apenas como compatibilidade/diagnostico enquanto `data-shared-filter-sync` nao for habilitado explicitamente;
- controle de versoes em `cotacao_sync_estado`;
- versao por item/campo em `cotacao_itens.versoes` e por preco em `cotacao_precos.versao`, base para conflito por campo;
- presenca ao vivo por `presence_ping`;
- indicador "1 pessoa usando" / "N pessoas usando";
- chips com usuarios ativos e local aproximado de trabalho;
- marca visual na celula onde outro usuario esta focado/editando quando a linha esta visivel;
- aviso textual quando outro usuario esta fora do filtro local atual.

Em 2026-05-11, foi validado por simulacao com duas sessoes autenticadas que:

- uma sessao cria uma linha e a outra recebe o item por `sync_pull`;
- edicao separada em `produto` e `categoria` preserva os dois campos, sem sobrescrita silenciosa;
- `presence_ping` retorna 2 usuarios ativos em sessoes diferentes;
- a linha temporaria de auditoria foi removida ao final do teste.

Tambem em 2026-05-11, a digitacao de categoria passou a usar debounce curto em `site/cotacao/app.js` para lista de categorias, filtro da grade e opcoes relacionadas. O objetivo e evitar que cada tecla force varredura completa da planilha e cause travadas perceptiveis.

Em nova auditoria de categoria no mesmo dia, foi identificado que a aba que salvava uma alteracao ainda podia receber depois um snapshot completo por `sync_pull`, porque saves locais nao atualizavam a versao conhecida de sync no frontend. Isso fazia a propria tela reaplicar dados que ela tinha acabado de gravar. O fluxo foi ajustado para atualizar a versao conhecida apos mutacoes locais, mantendo `presence_ping` fora desse avanco porque presenca nao e mudanca de dados da planilha.

Tambem foi removida a logica antiga de classes fixas para `urgente` e `encomenda`. Essas cores agora devem vir somente de `cotacao_regras_formatacao`, para evitar conflito entre regra condicional e CSS/JS legado. Quando o popover de categoria esta fechado, o frontend apenas memoriza categorias novas e nao reconstrui a lista visual escondida a cada save.

Na revisao seguinte, foi removido outro acoplamento antigo: escrever `encomenda` na categoria nao muda mais `prioridade`, nao registra `encomenda_registrada_em` automaticamente e `urgente`/`encomenda` nao entram mais no filtro de cor por palavra-chave. O campo categoria pode continuar sendo usado pela regra condicional configurada pelo usuario, mas alerta operacional do Miauby depende de prioridade explicita `encomenda`.

Miauby acompanha alertas operacionais da Cotacao, mas encomenda so vira alerta/comentario de balao quando a linha esta com prioridade explicita `encomenda` e passa de 1 dia sem baixa/pedido. Antes disso, a encomenda deve continuar como fluxo normal da Cotacao para evitar ruido operacional.

Na mesma auditoria local, o banco tinha 243 itens e 53 categorias, e a rota autenticada `/cotacao/` apareceu nos logs com cerca de 1,46 MB de HTML. Isso ainda funciona, mas indica que o proximo gargalo provavel sera peso inicial da tela/snapshot quando a planilha crescer.

Em 2026-05-11, a sincronizacao recebeu uma primeira fila de eventos em `cotacao_eventos`. Saves de linha, linhas criadas, cancelamentos, filtros e regras condicionais gravam eventos com `client_id`. O frontend tenta aplicar esses eventos incrementalmente e so volta para `sync_pull`/snapshot quando ha mudanca estrutural, atraso grande ou conflito local. Isso reduz reprocessamento pesado e impede que a propria aba reaplique a alteracao que acabou de salvar.

Tambem foi corrigido o fluxo de digitacao de categoria: enquanto o usuario esta escrevendo, inclusive `encomenda`, a tela atualiza formatacao e agenda o save, mas nao reaplica filtro ativo no meio da digitacao. Se houver filtro ativo, ele e reaplicado no `focusout`/fim da edicao. Essa regra evita que a linha pule para outra posicao ou seja escondida antes do usuario terminar.

Na validacao com Browser em 2026-05-11, foi encontrado outro caso de self-replay: uma linha nova ainda sem `item_id` podia salvar no banco e, antes de receber a resposta do proprio `save_row`, o snapshot/evento remoto podia reaparecer como outra linha vazia preenchida. O frontend agora identifica linha local pendente por ordem/produto/categoria, adia o sync remoto nesses casos e remove duplicatas visuais por `item_id` apos o save.

Em 2026-05-12, a categoria recebeu um reset mais duro para as palavras historicas `urgente` e `encomenda`. Regras ativas em `cotacao_regras_formatacao` que pintavam categoria por esses termos foram desativadas automaticamente por `cotacao_disable_legacy_category_trigger_rules()`, os defaults de novas categorias deixaram de incluir esses termos e as copias legadas na raiz (`site/app.js`, `site/api.php`, `site/cotacao-funcoes.php`) viraram shims para a implementacao real de `/cotacao/`. Em teste controlado no backend, salvar categoria `encomenda` e `urgente` manteve `prioridade=normal` e `encomenda_registrada_em` vazia.

Em 2026-05-12, o reset foi ampliado para `geral`, porque havia uma regra ativa de formatacao condicional em `cotacao_regras_formatacao` para `categoria contains geral`. A Cotacao tambem deixou de preencher categoria vazia com `geral` automaticamente e passou a preservar `ordem` de linhas existentes quando o save vem de uma edicao comum de celula. Snapshots/eventos remotos agora aguardam a edicao local terminar antes de reaplicar filtro ou reordenar DOM, evitando que uma linha suba para o topo enquanto o usuario digita.

Na correcao seguinte de 2026-05-12, a protecao foi reforcada no contrato entre frontend e backend. `site/cotacao/app.js` deixou de enviar `ordem` como campo alterado para linhas existentes, `site/cotacao/api.php` remove `ordem` de payloads legados de save comum e `site/cotacao/cotacao-funcoes.php` preserva a ordem anterior mesmo quando recebe `ordem=1`. O default de `cotacao_itens.categoria` tambem passou para vazio. Em teste dirigido no backend, salvar `urgente`, `encomenda`, `geral` e `cotacao` com payload legado manteve a ordem original e gerou eventos apenas com `changed_fields=categoria`.

Em 2026-05-12, a logica de filtro foi refeita para impedir que palavras de categoria virem comando remoto. O filtro de categoria/cor/vencedor passou a ser local-first por padrao: a tela continua sincronizando dados, presenca e edicoes, mas nao aplica automaticamente o filtro escolhido em outro computador. `sync_filter` permanece como compatibilidade e diagnostico, e `cotacao_sync_estado.filtro_categoria` e sanitizado para remover filtros legados `geral`, `urgente`, `encomenda` e `cotacao/cotação`.

Isso ainda nao e um motor completo estilo Google Sheets. A edicao simultanea forte agora depende de presenca visual clara, ultimo salvamento vencendo, historico de recuperacao e canal de tempo real eficiente.

## Arquivos, rotas e tabelas envolvidos

Arquivos:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`

Rotas/acoes:

- `/cotacao/`
- `/cotacao/socket.io/`
- `GET /cotacao/api/bootstrap`
- `GET /cotacao/api/events?after=<eventId>`
- `PATCH /cotacao/api/cells`
- `PATCH /cotacao/api/cells/batch`
- `PUT /cotacao/api/styles/batch`
- `DELETE /cotacao/api/styles/batch`
- `POST /cotacao/api/rows`
- `POST /cotacao/api/columns`

Tabelas:

- Postgres `cotacao_v2_quotes`
- Postgres `cotacao_v2_columns`
- Postgres `cotacao_v2_rows`
- Postgres `cotacao_v2_events`
- Postgres `cotacao_v2_rules`
- Postgres `cotacao_v2_styles`
- Redis para sessoes e presenca temporaria
- Core Postgres `core_users` para login

## Regras de negocio que precisam ser preservadas

- Cada item precisa manter ID estavel.
- Ordem, categoria, status, prioridade, observacao, vencedor e formatacao nao podem ser sobrescritos sem auditoria.
- Alteracao de categoria nao pode apagar produto, fornecedor, preco, observacao, vencedor nem formatacao de outra celula.
- Cores automaticas por categoria devem ser configuradas por regra condicional, nao por comportamento fixo escondido no codigo.
- `geral` nao deve ser preenchido automaticamente em categoria vazia durante edicao de celula.
- Edicao comum de categoria nao deve alterar `ordem` da linha.
- `geral`, `urgente`, `encomenda` e `cotacao/cotação` nao devem ser recriados como gatilho automatico de categoria, nem por regra condicional legada, nem por CSS/JS. Se a equipe quiser destacar esses fluxos novamente, criar campo/regra explicita revisada e documentada.
- Payload legado de save comum nao pode mudar `ordem`; reordenacao precisa ser fluxo explicito e documentado.
- Categoria nao deve alterar `prioridade` nem registrar encomenda automaticamente; prioridade so deve mudar quando o usuario ou uma funcao explicita salvar esse campo.
- Filtro de cor deve considerar cores salvas em `cor`/`cores`, nao palavras no texto da categoria.
- Precos por fornecedor devem continuar ligados a `item_id` e `fornecedor_id`.
- Filtro ativo nao pode esconder conflito de dados; se outro usuario estiver em linha fora do filtro, a interface deve indicar isso.
- Filtro de uma tela nao pode ser aplicado automaticamente em outra enquanto o modo local-first estiver ativo.
- Encomenda da Cotacao nao deve gerar alerta do Miauby antes de completar mais de 1 dia sem baixa/pedido e deve depender de prioridade explicita `encomenda`, nao de texto livre da categoria.
- Presenca e dado temporario; nao deve ser usada como historico permanente.
- A tela deve continuar funcional quando houver apenas um usuario, quando outro usuario fechar o navegador ou quando o ping falhar temporariamente.

## Decisoes tecnicas tomadas

- A primeira camada usa polling HTTP para reduzir risco e caber na arquitetura PHP/Apache atual.
- `cotacao_presencas` usa `client_id` por aba/sessao de navegador para distinguir duas abas do mesmo usuario.
- Presencas antigas sao limpas por tempo de atividade.
- A interface marca celulas remotas com classe CSS e cor por usuario, sem bloquear edicao por enquanto.
- `presence_ping` exige sessao e CSRF, como as demais acoes internas.
- Mutacoes locais, como `save_row`, `add_empty_rows`, `delete_row`, `sync_filter` e regras condicionais, devem chamar `rememberSyncState()` com o estado retornado pela API. Isso evita que a propria aba processe a mesma mudanca de novo via snapshot completo.
- Mutacoes locais tambem devem enviar `client_id`; eventos com o mesmo `client_id` devem ser ignorados pela propria aba.
- `sync_events_pull` deve ser tentado antes de `sync_pull` quando a aba ja conhece um `evento_id`. Se o servidor pedir `requires_snapshot`, o frontend volta para snapshot completo.
- Na V2, `GET /cotacao/api/events?after=<eventId>` cumpre esse papel incremental: quando a resposta vem com `requiresSnapshot`, o frontend chama `/cotacao/api/bootstrap`.
- Mutacoes simples da V2 devem evitar `loadSheet()`; use consultas pontuais para validar coluna visivel/editavel e linha ativa, deixando snapshot completo apenas para bootstrap, diagnostico e operacoes fortes.
- Commits simples de celula na V2 devem ser otimistas no frontend, atualizando a linha localmente e salvando em segundo plano; erro real nao deve exigir renderizacao completa da tabela.
- Operacoes em lote que so alteram celulas visiveis devem seguir o mesmo caminho otimista e atualizar apenas linhas afetadas. Render completo fica reservado para mudanca estrutural, fallback de snapshot, regras/estilos amplos ou recuperacao.
- A presenca visual na grade deve ser efemera e informativa: mostrar celula/linha/coluna de outros usuarios sem bloquear a edicao nem virar historico permanente.
- Presenca e filtro nao sao bloqueios. Filtros continuam locais por tela e duas pessoas podem trabalhar em linhas/celulas diferentes sem conflito; se duas pessoas salvarem a mesma celula, o ultimo salvamento vence e o historico da celula serve para recuperar o valor anterior.
- Apagamentos por `Delete`/`Backspace` seguem o mesmo modelo de ultima gravacao vencendo, com auditoria em evento.
- `presence_ping` continua sem avancar versao de sync local, porque presenca e temporaria e nao representa mudanca de dados.
- Filtro de categoria nao deve ser reaplicado a cada tecla dentro de uma celula de categoria. O filtro ativo so deve recalcular depois que a edicao termina.
- Na V2, quando a edicao faz a linha deixar de combinar com filtro/busca ativos, a linha editada permanece fixada visualmente ate o filtro ou a busca mudar. Isso evita a sensacao de perda de dados durante cotacao rapida.
- A aba deve renovar presenca por heartbeat e recarregar dados de forma leve apos reconexao/retorno de visibilidade, sem depender de `Ctrl+F5`.
- Linha nova local que ainda esta salvando nao deve ser reaplicada em outra linha pelo snapshot/evento remoto. Se o item remoto corresponder a uma linha local pendente, o sync deve aguardar a resposta do save; se ainda assim surgir duplicata visual, o DOM deve manter uma unica linha por `item_id`.
- `cotacao_add_category()` aceita `touchSync=false` quando chamada dentro de `cotacao_save_item()`, evitando dois toques de sync para um unico save de linha.
- As classes legadas `is-category-urgent` e `is-category-order` nao devem ser usadas para cor automatica; a origem correta e `cotacao_regras_formatacao`.
- As palavras `urgente` e `encomenda` tambem nao devem entrar como atalho escondido no filtro de cor. Regras legadas ativas para esses termos sao desativadas automaticamente; se a equipe quiser destacar esses fluxos novamente, isso deve ser redesenhado como regra explicita revisada.
- `encomenda` so tem significado operacional para idade da encomenda/Miauby quando salvo como prioridade explicita; como texto de categoria, e apenas categoria/formatacao condicional.
- Regras ativas de categoria com termo exato `urgente`, `urgencia`, `urgência` ou `encomenda` sao desativadas na inicializacao do schema para remover o comportamento antigo que fazia a tela saltar/travar.
- Regras ativas de categoria com termo `geral` tambem sao desativadas por `cotacao_disable_default_category_trigger_rules()`, porque `geral` e default historico e nao deve funcionar como gatilho visual escondido.
- Saves de linhas existentes nao enviam mais `ordem` como campo alterado por padrao; o backend preserva a ordem anterior quando receber `ordem` vazia/zero em edicao existente.
- Saves de linhas existentes tambem preservam `ordem` quando recebem payload legado com `ordem=1`; `changed_fields` remove `ordem` quando a ordem real nao mudou.
- Novas colunas/tabelas devem manter categoria default vazia, nao `geral`.
- Enquanto existe edicao local ativa ou save pendente, `sync_events_pull`/`sync_pull` nao reordenam a grade nem reaplicam filtro remoto; o snapshot fica pendente ate o fim da edicao.
- Filtros compartilhados ficam desabilitados por padrao no frontend. Para reativar em um fluxo futuro, `data-shared-filter-sync="1"` deve ser habilitado explicitamente e testado com duas telas antes de deploy.
- As copias antigas `site/app.js`, `site/api.php`, `site/cotacao-funcoes.php` e a pasta `site/cotacao` foram removidas em 2026-05-14. Nao recriar esses shims; a manutencao deve ocorrer em `apps/cotacao`.
- A troca imediata de linguagem/banco nao foi adotada como primeiro passo para a travada de categoria. O gargalo observado era compatível com recalculo de UI/filtros, entao a correcao inicial fica no frontend e no contrato de sync atual.
- Para chegar mais perto do Sheets, o proximo salto tecnico recomendado e um canal de eventos em tempo real, preferencialmente SSE ou WebSocket, com fila de eventos por celula/linha. Banco novo so deve entrar depois de medir gargalos reais de MySQL/PHP.

## Riscos ao alterar

- Reduzir demais o intervalo de polling pode aumentar carga no VPS.
- Achar que presenca impede sobrescrita seria perigoso: ela so mostra onde pessoas estao trabalhando. A recuperacao deve vir do historico/auditoria.
- Alterar seletor de celula/linha sem atualizar `app.js` pode quebrar marca remota.
- Sincronizar com Google Sheets sem IDs estaveis pode duplicar linhas ou sobrescrever valores.
- Tratar filtro como fonte de verdade pode causar divergencia entre computadores ou salto de linha; por isso filtros sao local-first por padrao.
- Reintroduzir cor fixa por nome de categoria pode duplicar comportamento e gerar resultado diferente da regra condicional configurada pelo usuario.
- Reativar regras antigas de `geral`/`urgente`/`encomenda`/`cotacao` em categoria pode reabrir o bug de salto/travamento; tratar esses termos como dados comuns ou criar regra nova com decisao registrada.
- Reintroduzir prioridade automatica por categoria pode fazer a linha saltar de posicao depois do save/sync.
- Rodar verificacoes paralelas que inicializam schema pode gerar lock/deadlock temporario no MySQL; preferir auditoria sequencial.

## Pendencias

- Validar com dois usuarios reais a regra de ultima gravacao vencendo e a recuperacao pelo historico.
- Expandir o log `cotacao_eventos` para diagnostico operacional e politicas de retencao.
- Avaliar Server-Sent Events ou WebSocket para reduzir delay.
- Medir em navegador real a digitacao de categoria com muitos itens/categorias apos o debounce e apos a correcao de reaplicacao de snapshot local.
- Reduzir peso inicial da tela autenticada quando a quantidade de itens crescer, com paginacao virtual ou carregamento incremental.
- Continuar reduzindo peso de `sync_pull`, agora usando `sync_events_pull` como caminho padrao e snapshot completo apenas como fallback.
- Criar tela de diagnostico de sync/presenca.
- Definir contrato Google Sheets: ID estavel, fonte de verdade por campo, sentido do sync e resolucao de conflito.
- Transformar o teste manual de duas sessoes em smoke test automatizado.
- Criar teste automatizado especifico para confirmar que digitar `urgente`/`encomenda` em categoria nao altera prioridade, nao registra encomenda e nao muda filtro no meio da edicao.
- Criar teste automatizado especifico para confirmar que digitar `geral` em categoria nao ativa regra antiga, nao preenche categoria sozinho e nao move a linha para o topo.
- Criar teste automatizado especifico para confirmar que um filtro aplicado em uma tela nao altera a visao de outra enquanto `data-shared-filter-sync` estiver desligado.

## Como pode evoluir

1. Presenca visual e filtros local-first por polling.
2. Ultima gravacao vencendo com historico de recuperacao por celula.
3. Fila de eventos de edicao com auditoria.
4. Canal tempo real dedicado, se necessario.
5. Integracao Google Sheets estruturada.
6. Miauby resumindo divergencias, itens travados, usuarios ativos e riscos de sync.
