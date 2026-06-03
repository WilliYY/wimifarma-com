# 20 - Cotacao V2

## O que esta parte do sistema faz

A Cotacao V2 substitui a planilha PHP antiga em `/cotacao/` por um servico dedicado para edicao colaborativa de cotacao de farmacia. A meta e chegar perto do comportamento do Google Sheets: linhas estaveis, save por celula, presenca ao vivo, filtros locais, regras condicionais explicitas, ultima gravacao vencendo e historico para recuperacao.

## Arquivos, rotas e servicos envolvidos

Arquivos principais:

- `apps/cotacao/src/server.js`
- `apps/cotacao/src/contracts/`
- `apps/cotacao/src/contracts/repeatable-actions.ts`
- `apps/cotacao/src/utils/normalizers.ts`
- `apps/cotacao/src/utils/styles.ts`
- `apps/cotacao/src/utils/winner.ts`
- `apps/cotacao/src/utils/sheets.ts`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg` (logo oficial SVG horizontal sincronizada com os demais modulos)
- `apps/cotacao/public/favicon.svg`
- `apps/cotacao/public/favicon.png`
- `apps/cotacao/package.json`
- `apps/cotacao/tsconfig.build.json`
- `apps/cotacao/Dockerfile`
- `docker-compose.yml`
- `docker/php/Dockerfile`

Servicos:

- `wimifarma-cotacao-app`: Node.js 22, Express e Socket.IO.
- `wimifarma-cotacao-db`: Postgres 17.
- `wimifarma-cotacao-redis`: Redis 7.
- `wimifarma-com-web`: Apache/PHP, faz proxy de `/cotacao/` e `/cotacao/socket.io/`.
- `wimifarma-core-db`: Postgres do core auth, usado pela Cotacao V2 para autenticar `core_users`.

Rotas:

- `GET /cotacao/health`
- `GET /cotacao/api/internal/search` para consulta interna do Miauby por token
- `POST /cotacao/api/internal/encomendas` para criar encomenda interna do Miauby por token
- `GET /cotacao/api/internal/encomenda-reminders/status` para diagnostico interno/tokenizado da automacao de encomendas, sem enviar WhatsApp
- `GET /cotacao/login.php`
- `POST /cotacao/login.php`
- `GET /cotacao/`
- `GET /cotacao/api/bootstrap`
- `GET /cotacao/api/events?after=<eventId>`
- `POST /cotacao/api/rows`
- `POST /cotacao/api/rows/insert`
- `DELETE /cotacao/api/rows/:id`
- `PATCH /cotacao/api/cells`
- `PATCH /cotacao/api/cells/batch`
- `PUT /cotacao/api/styles/batch`
- `DELETE /cotacao/api/styles/batch`
- `POST /cotacao/api/columns`
- `POST /cotacao/api/columns/:key/rename`
- `POST /cotacao/api/columns/:key/move`
- `DELETE /cotacao/api/columns/:key`
- `POST /cotacao/api/columns/:key/restore`
- `POST /cotacao/api/columns/:key/width`
- `POST /cotacao/api/rules`
- `PATCH /cotacao/api/rules/:id`
- `DELETE /cotacao/api/rules/:id`
- `PUT /cotacao/api/styles`
- `GET /cotacao/api/diagnostics`
- `GET /cotacao/api/google-sheets/status`
- `POST /cotacao/api/google-sheets/export`
- `POST /cotacao/api/google-sheets/import`
- `GET /cotacao/api/backups`
- `POST /cotacao/api/backups`
- `POST /cotacao/api/backups/:name/restore`
- `/cotacao/socket.io/`

## Banco de dados

Postgres `wimifarma_cotacao`:

- `cotacao_v2_quotes`: cotacoes ativas.
- `cotacao_v2_columns`: colunas da grade, incluindo metadados `options` para detalhes visuais como colunas ocultas, tons de fornecedores e fallback de exibicao.
- `cotacao_v2_rows`: linhas com UUID, posicao, valores JSONB, versao e `deleted_at` para exclusao logica.
- `cotacao_v2_events`: eventos gerados por edicoes, linhas e regras.
- `cotacao_v2_rules`: regras condicionais explicitas sempre com `target='cell'`, incluindo `show_timestamp` para exibir no hover a data/hora de criacao da regra quando habilitado.
- `cotacao_v2_styles`: estilos manuais por linha, coluna ou celula, usados pela paleta de cores da tela.
- `cotacao_v2_column_audit`: auditoria de renomeacao e reordenacao de colunas de distribuidoras.
- `cotacao_v2_encomenda_reminders`: lembretes operacionais criados quando uma linha contem `encomenda`, com cotacao, linha, texto original, produto/quantidade extraidos, data de deteccao, envio previsto, destinatarios mascarados, status (`pendente`, `enviado`, `erro`, `cancelado`, `resolvido`), tentativas e resultado do Miauby Whats. Importacoes Google Sheets e restores de backup recalculam esses lembretes para criar os faltantes e cancelar pendentes de linhas removidas.
- O worker de encomendas roda dentro do app da Cotacao. O endpoint interno `GET /cotacao/api/internal/encomenda-reminders/status` mostra se o worker esta habilitado, ultima varredura apos o boot, quantos lembretes estao vencidos agora, proximo pendente, ultima tentativa, ultimo erro e ultimo envio, sem telefone cru e sem processar lembrete.

Redis:

- sessoes web da Cotacao V2;
- presenca temporaria por usuario/aba/celula.

Core Postgres `wimifarma_core`:

- `core_users` e a origem unica de usuario/senha da Cotacao V2.

## Regras de negocio que precisam ser preservadas

- Cada linha tem UUID estavel.
- Cada save altera apenas uma celula.
- A edicao ativa da celula salva automaticamente no mesmo endpoint oficial `PATCH /cotacao/api/cells` apos 1,2 segundo sem digitacao, sem criar rascunho paralelo em `localStorage`/`sessionStorage` e sem duplicar linha/item.
- O status do topo deve diferenciar `Alteracoes nao salvas`, `Salvando...` e `Sincronizado`; se houver edicao ativa suja ou requisicao pendente, fechar/recarregar a aba deve acionar o aviso nativo do navegador.
- As colunas `EAN`, `PRODUTO`, `QUANTIDADE` e `CATEGORIA` sao fixas no contrato da farmacia e nao devem trocar de nome.
- Colunas de distribuidoras podem ser adicionadas ou removidas pela interface; colunas fixas e calculadas nao.
- `Ganhador` e calculado pelo menor preco numerico entre distribuidoras visiveis e nao aceita escrita manual.
- Categoria e texto comum.
- `geral`, `urgente`, `encomenda` e `cotacao` nao podem acionar cor, prioridade, ordem nem filtro por gatilho escondido.
- Excecao documentada de 2026-06-01: `encomenda` gera apenas um lembrete operacional persistido para o Miauby Whats no dia seguinte as 16h. Esse lembrete nao muda valores, fornecedor, ganhador, prioridade, cor ou posicao da linha. Desde 2026-06-02, importacao Google Sheets e restore de backup tambem reconciliam a tabela de lembretes depois da substituicao em massa. Se a Cotacao enviar destinatarios explicitos ao bridge WhatsApp, eles nao autorizam envio por si so: o Miauby valida cada numero contra allowlist e card `Cotacao`.
- O horario de 16h e calculado em `America/Sao_Paulo`. Se a palavra `encomenda` for salva depois da meia-noite, o lembrete fica para o dia seguinte dessa deteccao, nao para o dia anterior que o operador imaginou.
- Formatacao condicional so vale quando criada explicitamente em `cotacao_v2_rules`; regras criadas pela tela podem ser editadas ou apagadas no proprio modal.
- Formatacao condicional explicita deve pintar somente o fundo da celula da coluna-alvo que bateu com a regra; o texto da grade permanece preto/padrao para manter legibilidade.
- Regras condicionais antigas ou restauradas por backup com alvo de linha inteira sao normalizadas para `cell` na inicializacao da Cotacao, evitando pintura retroativa de EAN, produto, quantidade ou outras colunas.
- Filtros de produto, categoria, ganhador e cor sao locais por tela e nao devem mover a visao de outro usuario.
- Filtrar a planilha em uma tela nao causa conflito por si so: o filtro muda apenas a lista visivel daquela aba, enquanto os dados continuam sincronizados por evento/celula.
- Edicoes simultaneas em celulas diferentes devem conviver normalmente. Na mesma celula, a regra operacional atual e estilo Sheets: o ultimo salvamento vence. A tela compensa isso com presenca visual forte e historico de celula para recuperar o valor anterior.
- Filtros de `PRODUTO`, `CATEGORIA` e `Ganhador` devem ser acionados pelo icone do cabecalho, com selecionar tudo, limpar tudo e aplicacao local. O filtro de `Ganhador` mostra a contagem de linhas por resultado no formato `Nome (quantidade)` e lista primeiro vencedores individuais, depois empates e por ultimo `Sem vencedor`.
- Filtros de cor devem existir no mesmo menu dos filtros por valor para as colunas que possuem filtro.
- Ao editar uma linha que nao combina mais com filtro ativo, a tela deve manter a linha visivel ate o usuario alterar o filtro, evitando que a linha desapareca no meio da edicao.
- Texto longo deve quebrar linha dentro da celula e aumentar a altura da linha em vez de vazar ou ficar cortado.
- O auto-ajuste de altura durante a digitacao deve ser agendado por frame do navegador, para evitar recalcular layout da grade a cada tecla.
- Clicar no cabecalho seleciona a coluna inteira; clicar no numero seleciona a linha inteira. Arrastar pelos cabecalhos deve ampliar a selecao para varias colunas ou varias linhas.
- Distribuidoras podem ser renomeadas com duplo clique no cabecalho e ter largura ajustada arrastando a borda do titulo. Durante o ajuste de largura, a tela deve mostrar uma linha guia e uma etiqueta com a largura atual em pixels e a variacao desde o inicio do arraste. Ao clicar fora do titulo em edicao, o editor de renomeacao deve salvar/fechar antes de selecionar a nova celula.
- Apagar distribuidora e um fluxo normal da equipe: a coluna fica oculta e pode ser restaurada por desfazer/`Ctrl+Z` na mesma sessao.
- `Ctrl+Z`/desfazer deve seguir a ultima acao da sessao no mesmo historico: edicao de celula, digitacao direta de numero ou uma letra, colagem/lote, apagar conteudo, busca/filtro local, apagar distribuidora e pintura manual por celula, linha, coluna ou selecao. Durante a edicao ativa dentro da celula, o undo nativo do navegador continua valendo para o texto ainda nao salvo.
- `Ctrl+Y` ou `Ctrl+Shift+Z` deve refazer a mesma acao, incluindo pintura manual/borracha. Ao desfazer cores, a tela restaura os estilos manuais anteriores via APIs de estilo, sem mexer em regra condicional explicita.
- Presenca e temporaria; nao deve virar historico permanente.
- Nomes de presenca aparecem como animais aleatorios/deterministicos por aba para diferenciar usuarios sem expor o nome real na area principal.
- Quando outro usuario esta em uma celula visivel, a grade deve mostrar contorno colorido, etiqueta do animal e tooltip com coluna/linha; esse indicador nao bloqueia escrita.
- O botao `Historico`, ao lado do contador de linhas com dados, abre as alteracoes da celula selecionada a partir de `cotacao_v2_events` e permite restaurar o valor anterior por um save normal.
- O historico tambem pode mostrar eventos do lembrete de encomenda (`criado`, `atualizado`, `cancelado`, `enviado` ou `erro`) vinculados a linha; esses eventos nao sao restauraveis como valor de celula.
- O modal de formatacao condicional deve manter leitura operacional: criacao de regra em uma faixa compacta, lista de regras em linhas alinhadas e acoes visiveis sem quebrar o layout.
- Login deve continuar aceitando os usuarios internos sincronizados para `core_users`; se um usuario existir apenas em `wf_users`, rodar o migrador do core antes de liberar o acesso.
- Dados oficiais ainda podem estar no Google Sheets; import/export deve ser controlado e auditavel.
- Import/export Google Sheets deve preservar `cotacao_row_id` para manter linha estavel e evitar duplicacao silenciosa.
- Importar Google Sheets e restaurar backup exigem permissao forte (`adm`, role `admin` ou role `gerente`) alem de sessao e CSRF. Apagar/restaurar distribuidora permanece no fluxo normal com desfazer na mesma sessao.

## Decisoes tecnicas ja tomadas

- A planilha PHP antiga deixou de ser o motor principal porque as tentativas de corrigir categorias historicas ainda deixavam risco de salto/travamento.
- Em 2026-05-14, a planilha PHP antiga foi removida do repositorio junto com os shims `site/app.js`, `site/api.php` e `site/cotacao-funcoes.php`; a Cotacao V2 passou a carregar seus proprios ativos diretamente de `apps/cotacao/public`.
- A Cotacao V2 usa Node.js + Socket.IO para suportar tempo real sem polling pesado.
- Postgres foi escolhido para linhas JSONB, eventos, historico por celula e evolucao segura do sync.
- Redis foi escolhido para sessoes e presenca efemera.
- Em 2026-05-29, a Cotacao V2 removeu `mysql2`, pool MySQL, fallback `wf_users` e `depends_on` de `wimifarma-com-db`; o health mantem campos `mysql_*` apenas como compatibilidade, sempre indicando que MySQL nao e usado.
- O Nginx Proxy Manager continua apontando para `wimifarma-com-web:80`; o Apache faz proxy interno para a Cotacao V2.
- A tela principal segue um visual denso de planilha operacional, parecido com a experiencia anterior aprovada pelo usuario, com topo compacto, abas locais, contador de linhas com dados, presenca ao vivo e exportacao CSV no navegador.
- A grade inicial usa colunas fixas de farmacia: `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, `Anb`, `Profarma`, `mauro`, `arthur`, `Santa`, `tom`, `cimed` e `Ganhador`.
- As colunas legadas `observacao` e `status` podem existir em bancos ja criados, mas ficam ocultas por `options.hidden=true` para nao poluir o layout validado.
- A interface deve ocupar a largura da tela como planilha, sem card envolvendo a grade; barra de rolagem aparece quando houver mais linhas/colunas do que o viewport comporta.
- As celulas usam fonte 20px e alinhamento central por padrao.
- O menu de contexto fica enxuto para operacao rapida: inserir linha acima/abaixo, abrir cores, limpar cor e inserir/apagar apenas colunas de distribuidoras. Apagar linha, adicionar 20 linhas, renomear distribuidora e mover distribuidora nao aparecem no menu.
- A paleta de cores grava estilo manual por linha, coluna ou celula em `cotacao_v2_styles`, pode ser aberta pelo botao do topo ou pelo menu de contexto e oferece faixas de tons do mais forte ao mais claro.
- Cor manual aplicada por linha/coluna/celula tem prioridade visual sobre tons padrao de distribuidora. O destaque automatico azul do menor preco fica por cima enquanto a celula estiver vencendo; quando deixar de vencer, a cor manual reaparece.
- Entre estilos manuais sobrepostos, o `updated_at` mais recente vence; assim, pintar uma coluna agora cobre cores antigas de celulas daquela coluna, mas uma cor de celula aplicada depois ainda pode se destacar.
- Aplicar cor ou borracha pela paleta e uma acao unica; apos salvar o estilo da selecao atual, o modo de pintura e desarmado para evitar colorir a proxima celula por acidente.
- A coluna `Ganhador` e a celula de menor preco recebem destaque visual automatico, sem depender de palavra em categoria.
- A insercao simples de linhas saiu dos botoes visiveis e ficou no menu de contexto; adicionar 20 linhas fica no rodape da grade. Colagem de planilha usa `Ctrl+V` e `PATCH /cotacao/api/cells/batch`.
- A tela usa `Ctrl+Z`/`Ctrl+Y` e botoes de desfazer/refazer para mudancas locais rastreaveis, inclusive valores, lotes, filtros, colunas e cores manuais; `Enter` desce para a celula abaixo por padrao, e `F2` abre edicao da celula selecionada sem selecionar todo o texto. Quando a edicao comeca por digitacao direta, as setas salvam a celula e movem a selecao para cima, baixo, esquerda ou direita; quando a edicao comeca por duplo clique/`F2`, as setas continuam navegando dentro do texto.
- A navegacao por setas mantem a celula ativa visivel dentro da grade: ao chegar perto da borda superior/inferior ou lateral, o container da planilha acompanha a selecao, sem recarregar dados nem redesenhar a tabela inteira.
- `Ctrl+Z` tambem desfaz filtros locais e pintura manual/borracha; `Ctrl+C` copia a selecao como matriz TSV; `Ctrl+V` cola matriz normalizando texto e precos para o padrao da Cotacao.
- Desde 2026-06-01, `F4` repete a ultima acao util e segura na selecao atual, estilo Google Sheets. A lista repetivel e fechada e expansivel: valor nao vazio em celula, colagem sem celulas vazias, aplicar cor e limpar cor. Acoes destrutivas ou definitivas, como apagar valor por `Delete`, apagar distribuidora, cancelar, finalizar, enviar, importar/exportar Google Sheets e restore de backup, nao sao registradas para repeticao. O status da planilha informa sucesso, falta de acao anterior ou incompatibilidade com a selecao atual.
- Desde 2026-06-01, a celula em edicao ativa tem autosave com debounce de 1,2 segundo para reduzir perda ao fechar a aba. O texto digitado antes do autosave aparece como `Alteracoes nao salvas`; quando o autosave dispara, a celula usa a mesma persistencia por Postgres/evento/historico do save manual. Ao ocultar, recarregar ou fechar a aba, a tela tenta disparar o autosave e mostra aviso nativo enquanto houver texto ativo nao gravado ou requisicao pendente.
- `Delete`/`Backspace` sobre a selecao usa batch otimista no frontend: limpa a grade imediatamente, salva em segundo plano e refresca somente as linhas afetadas quando a selecao e pequena.
- A alca de preenchimento no canto da selecao pode ser arrastada para copiar o padrao de valores e cores visiveis da selecao para as celulas adjacentes, ignorando colunas calculadas, e mostra uma previa forte das celulas de destino durante o arrasto.
- A tela usa controles compactos por icone para formatacao condicional e paleta de cores; a presenca do usuario aparece junto aos indicadores do topo e o campo de busca livre foi removido para reduzir ruido operacional.
- O redimensionamento de coluna mostra feedback visual imediato com linha guia e etiqueta `px (+/-px)` para deixar claro quanto a coluna esta aumentando ou diminuindo.
- Regras condicionais podem marcar a opcao `Data/hora`; quando uma celula bater nessa regra, o hover mostra a data/hora de criacao da regra.
- O fim da rolagem da grade exibe `Adicionar 20 linhas` para continuar a cotacao sem voltar ao topo.
- `app.js` e `styles.css` sao servidos sem cache forte para que alteracoes de deploy aparecam imediatamente ao recarregar a Cotacao.
- O topo da Cotacao V2 deve permanecer compacto: `Wimifarma Cotacao`, `Home`, `Baixar` e `Sair`; o diagnostico saiu do menu principal da equipe.
- O botao `Sair` da Cotacao V2 encerra a sessao da Cotacao e redireciona para a home inicial `/`, nao para a tela de login.
- O diagnostico operacional continua disponivel por API interna e pode consultar health, presenca, eventos, Google Sheets e backups quando necessario.
- Desde a Etapa 1 de performance, o diagnostico tambem retorna `safety` e `performance`, incluindo fallback por bootstrap, status de sync incremental, tamanho estimado do snapshot, tempo de `loadSheet()` e existencia dos indices esperados.
- Desde a Etapa 2, o frontend usa `GET /cotacao/api/events?after=<eventId>` para refresh automatico, reconnect e retorno de aba visivel; eventos estruturais continuam caindo para `/cotacao/api/bootstrap`.
- Desde a Etapa 3, mutacoes simples nao devem chamar `loadSheet()` para validar tudo. Salvar celula, colagem em lote, estilos, regras, linhas e colunas usam consultas pontuais para quote/linha/coluna, mantendo snapshot completo apenas para bootstrap, diagnostico, backup, import/export Google Sheets e restore.
- Desde a Etapa 4, salvar uma celula simples deve ser otimista no frontend: a linha afetada atualiza imediatamente, o save segue em segundo plano e erro real reverte ou marca a celula sem redesenhar a tabela inteira. O `expectedValue` pode seguir no payload como auditoria, mas nao bloqueia o ultimo salvamento.
- Desde a Etapa 5, colagem, desfazer/refazer de lote e alca de preenchimento tambem usam lote otimista: a tela aplica os valores, salva por `PATCH /cotacao/api/cells/batch` e redesenha apenas as linhas afetadas. Outras abas aplicam eventos de celula/lote por linha quando nao ha mudanca estrutural.
- O autosave da celula ativa nao usa tabela de rascunho: ele persiste no banco oficial como um save normal de celula. Antes dessa mudanca, o valor digitado dentro do textarea ativo ficava apenas no DOM ate `Enter`, `Tab`, seta em modo grade ou clique em outra celula chamarem `commitEdit()`; fechar/recarregar a aba nesse intervalo apagava esse texto nao confirmado.
- Eventos remotos de celula/lote recebidos enquanto a aba esta editando outra celula sao aplicados ao estado e ficam pendentes para redesenho ao fim da edicao, preservando fluidez sem deixar `Ganhador`, contadores ou celulas dependentes visualmente atrasados. Lotes sem alteracao real nao criam evento vazio em `cotacao_v2_events`.
- Eventos estruturais leves de coluna e linha tambem devem evitar snapshot completo: inserir linha, criar, renomear, mover, apagar, restaurar e redimensionar distribuidora enviam payload incremental suficiente para atualizar a grade localmente. Import e restore continuam pedindo snapshot completo.
- As respostas de `/cotacao/api/*` sao `no-store` e o helper `api()` do frontend tambem usa `cache: 'no-store'`; `/cotacao/api/events` nao deve voltar `304`, porque isso mascara o delta como erro e empurra a tela para snapshot completo.
- Durante redimensionamento de coluna, a largura visual e aplicada em tempo real, mas o auto-ajuste de altura fica limitado a coluna alterada e e processado em pequenos lotes apos o mouseup, evitando travamento ao soltar o mouse. O Socket.IO usa `column:resized` para resize, nao `columns:changed`, para nao acionar bootstrap completo em abas antigas.
- Durante o carregamento inicial, a grade nao deve bloquear a tela ajustando a altura de todos os campos de uma vez. A tabela renderiza primeiro e o auto-ajuste geral roda em pequenos lotes por `requestAnimationFrame`, para reduzir segundos de tela vazia com `Carregando...`.
- O numero da linha da celula ativa recebe destaque visual verde forte no frontend, apenas localmente, para facilitar leitura no estilo Google Sheets sem gravar estado nem sincronizar esse destaque com outras abas.
- Estilos em lote usam `PUT/DELETE /cotacao/api/styles/batch`, mantendo `style_updated` singular para acoes simples e reduzindo varias requisicoes quando cores sao copiadas pelo fill handle ou aplicadas em selecoes grandes.
- A presenca recebida por Socket.IO passa a atualizar a grade em tempo real, marcando celulas de outros usuarios com cor deterministica por aba e tooltip de localizacao.
- A Cotacao mantem heartbeat de presenca e recarregamento leve apos reconexao/retorno da aba para reduzir perda de sincronizacao depois de inatividade.
- O widget do Miauby e carregado dentro da Cotacao V2 para manter o assistente acessivel na operacao; o frontend pede JSON explicitamente e os endpoints do widget limpam saidas acidentais antes de responder JSON.
- O mesmo widget pode iniciar uma ronda visual local com `pikachu-loop.webp`: o personagem sai do balao do Miauby, passeia pela tela, foge do mouse quando ele chega perto e volta ao widget. Esse efeito e apenas frontend, sem banco, API, Socket.IO ou sincronizacao de dados da Cotacao.
- A Fase 4 do Miauby usa endpoints internos tokenizados da Cotacao V2 para consultar linhas e criar encomendas sem depender da Cotacao PHP antiga.
- A tela de login da Cotacao usa card mais compacto para nao cobrir demais o viewport.
- Backups da Cotacao V2 ficam no volume ignorado `cotacao-data/backups`, montado em `/app/backups`.
- `docker-compose.yml` nao deve montar arquivos de `site/cotacao` em `wimifarma-cotacao-app`; qualquer ativo da Cotacao oficial precisa ficar em `apps/cotacao/public`.

## Roadmap TypeScript seguro

Em 2026-05-31 foi iniciada a Fase 0 da migracao da Cotacao para TypeScript. Essa fase e somente inventario e baseline: nao altera runtime, frontend, rotas, schema, Dockerfile, Compose, assets ou deploy.

Baseline da Fase 0:

- backend atual: `apps/cotacao/src/server.js`, com cerca de 3439 linhas;
- frontend atual: `apps/cotacao/public/app.js`, com cerca de 3481 linhas;
- comando local `npm run check` em `apps/cotacao` passou com `node --check src/server.js && node --check public/app.js`;
- VPS respondeu `GET /cotacao/health` com `ok=true`, `provider=core`, `mysqlDependency=false`, `coreReachable=true` e `usersSynced=true`;
- VPS respondeu `GET /cotacao/socket.io/socket.io.js` com HTTP 200;
- logs recentes de `wimifarma-cotacao-app` mostraram apenas inicializacao normal em `3000/cotacao`.

Auditoria operacional de 2026-06-02:

- checks locais em `apps/cotacao` passaram: `npm run check`, `npm run typecheck` e `npm run build:ts`;
- no VPS, a entrada oficial do Compose/Apache respondeu `http://127.0.0.1:3002/cotacao/health` com HTTP 200, `ok=true`, auth `core`, `mysql_auth=false`, `mysql_auth_fallback=false`, `coreReachable=true` e `usersSynced=true`;
- o proxy interno `wimifarma-com-web` respondeu `/cotacao/health` com HTTP 200 e `/cotacao/socket.io/socket.io.js` com HTTP 200; a consulta externa direta a `https://wimifarma.com.br/cotacao/health` caiu em uma camada publica Next com HTTP 404 e nao deve substituir o smoke local do VPS;
- o Postgres real tinha 1 cotacao, 13 colunas visiveis, 501 linhas ativas, 2 linhas removidas, 2 regras, 44 estilos, 1898 eventos, 22 eventos de auditoria de coluna e 2 lembretes de encomenda pendentes;
- os seis indices esperados de performance existiam (`events`, `quotes`, `columns`, `rows`, `rules` e `styles`);
- endpoints autenticados sem sessao (`/api/bootstrap`, `/api/events`, `/api/diagnostics`, `/api/google-sheets/status`, `/api/backups`) responderam 401, como esperado;
- endpoints internos da Cotacao exigem `X-Miauw-Internal-Token` ou `X-Internal-Token`; `Authorization: Bearer` nao e aceito nesse modulo. Com o header correto, `/api/internal/summary` retornou contagens reais e `/api/internal/search?q=encomenda` retornou 2 itens;
- logs recentes do app mostraram apenas inicializacao normal; logs do Postgres/Redis mostraram checkpoints/saves normais. Alguns erros de SQL em 2026-06-02 foram causados por comandos manuais de auditoria mal formatados e nao pelo app;
- `cotacao_v2_events` indicou 0 eventos com `payload.overwroteRemote=true` nos ultimos 7 dias.

Fases recomendadas:

1. Fase 1: adicionar tooling TypeScript sem trocar runtime de producao. Usar `tsconfig.json` conservador com `allowJs`, `noEmit` e sem obrigar checagem total dos JavaScripts no primeiro corte. `npm start` deve continuar chamando `node src/server.js`. Concluida em 2026-05-31 com `npm run typecheck` separado, devDependencies TypeScript e sem alteracao de frontend/Dockerfile.
2. Fase 2: criar contratos tipados separados para env, sessoes, rows/columns/styles/rules, eventos, DTOs das APIs e eventos Socket.IO, sem mexer no frontend oficial. Concluida em 2026-05-31 com `apps/cotacao/src/contracts/` e `tsconfig.json` incluindo `src/**/*.ts`; os contratos nao sao importados pelo runtime atual.
3. Fase 3: extrair helpers backend pequenos de `server.js` para `.ts` quando houver teste/check cobrindo o caminho, mantendo as rotas iguais. Iniciada em 2026-05-31 com `apps/cotacao/src/utils/normalizers.ts` e contrato de typecheck em `normalizers.contract.ts`, ainda sem importar no runtime.
3.5. Fase 3.5: compilar TypeScript em paralelo, sem trocar runtime. Concluida em 2026-05-31 com `tsconfig.build.json`, `npm run build:ts` e `apps/cotacao/dist/` ignorado pelo Git. `npm start` continua `node src/server.js`.
4. Fase 4: migrar grupos de rotas por dominio, com uma mudanca pequena por vez: auth/health, bootstrap/events, cells, rows, columns, styles/rules, Google Sheets e backups.
5. Fase 5: migrar Socket.IO e build/runtime para TypeScript compilado apenas depois de health, APIs e smoke visual estarem repetiveis no VPS.
6. Fase 6: avaliar `public/app.js` por ultimo. O frontend e grande e sensivel; antes disso, manter JS oficial e usar contratos/API para reduzir risco.

Contratos TypeScript da Fase 2:

- `common.ts`: ids, JSON, resultado padrao de API e envelope de evento.
- `domain.ts`: quote, coluna, linha, regra, estilo, evento, presenca e snapshot da planilha.
- `session.ts`: usuario/sessao da Cotacao e augment de `express-session`.
- `api.ts`: DTOs de health, bootstrap, eventos, celulas, linhas, colunas, estilos, regras, endpoints internos do Miauby, Google Sheets e backups.
- `socket.ts`: eventos cliente-servidor e servidor-cliente do Socket.IO.
- `env.ts`: variaveis de ambiente esperadas pela Cotacao.
- `index.ts`: barrel somente de tipos.

Esses arquivos sao uma rede de seguranca para as proximas fases. Eles nao mudam banco, API, Socket.IO, tela ou Docker enquanto `server.js` segue como entrada oficial.

Helpers TypeScript sombra da Fase 3:

- `utils/normalizers.ts`: copia tipada de helpers puros ja existentes em `server.js` para operador de regra, cor hex, booleano, cursor de eventos e tamanho JSON.
- `utils/styles.ts`: copia tipada dos normalizadores puros de alvo/payload de estilo manual, preservando as regras de `row`, `column`, `cell`, cor hex e `styleKey`.
- `utils/winner.ts`: copia tipada dos helpers puros de distribuidora, preco numerico e vencedor/empate da linha.
- `utils/sheets.ts`: copia tipada dos helpers puros de exportacao/importacao Google Sheets (`matrixFromSheet`, `rowsFromMatrix` e `isUuid`).
- `*.contract.ts`: exercitam os tipos desses helpers no `npm run typecheck`.

Enquanto nao houver build/runtime TypeScript, esses helpers nao devem ser importados por `server.js`; o corte para runtime vem em fase separada com rebuild e smoke.

Build paralelo da Fase 3.5:

- `npm run build:ts` em `apps/cotacao` compila JS/TS para `dist/`.
- `dist/` e apenas artefato local/CI, ignorado pelo Git.
- Esse build ainda nao copia CSS, SVG, PNG, favicon ou demais assets estaticos; portanto nao e artefato completo de producao.
- Nao usar `dist/server.js` em producao antes de uma fase de corte com rebuild, health, login, bootstrap, save de celula e Socket.IO validados.

Fluxos que nao podem quebrar em nenhuma fase:

- login manual e handoff `WFHOME_SSO` via `core_users`;
- `GET /cotacao/health`;
- endpoints internos do Miauby: `summary`, `search`, `encomendas`, `urgentes` e `cotacoes-rapidas`;
- `bootstrap`, `events`, save de celula, batch, linhas, colunas, estilos, regras e diagnostico;
- import/export Google Sheets e backup/restore;
- Socket.IO de presenca, celulas, lotes, linhas, colunas, regras, estilos e reload;
- frontend oficial em `apps/cotacao/public/app.js` e `styles.css`.

Gate minimo por fase:

- `npm run check` em `apps/cotacao`;
- health publico 200 no VPS;
- `/cotacao/socket.io/socket.io.js` 200 no VPS;
- logs do app sem erro novo;
- quando houver runtime change, validar login/bootstrap/save com usuario real e duas abas antes de cortar.

## Validacoes realizadas

Em 2026-05-12 foram validados localmente:

- build dos containers;
- `docker compose config --quiet`;
- `node --check` em `src/server.js` e `public/app.js`;
- `GET /cotacao/health`;
- `GET /cotacao/login.php`;
- login com usuario interno `adm`;
- `GET /cotacao/api/bootstrap`;
- `PATCH /cotacao/api/cells` salvando `geral`, `urgente`, `encomenda` e `cotacao` em categoria;
- `POST /cotacao/api/rules` e `DELETE /cotacao/api/rules/:id` para regra condicional explicita;
- `POST /cotacao/api/rows` com linhas temporarias de smoke, depois removidas do Postgres;
- `POST /cotacao/api/rows/insert` e `DELETE /cotacao/api/rows/:id`;
- `POST /cotacao/api/columns` e `DELETE /cotacao/api/columns/:key` em coluna temporaria de distribuidora;
- `PUT /cotacao/api/styles` em linha, coluna e celula temporarias;
- `GET /cotacao/socket.io/socket.io.js`.
- Em seguida, a interface foi ajustada visualmente e `node --check` passou em `apps/cotacao/src/server.js` e `apps/cotacao/public/app.js`.
- Teste automatizado com navegador validou duas abas com presenca, nomes de animais, menu de contexto, filtros, paleta, fonte 20px centralizada e destaque de menor preco em `Ganhador`.
- Em 2026-05-13, a tela foi evoluida com filtros por icone, remocao dos botoes `Adicionar linhas` e `Colar do Sheets`, colagem via `Ctrl+V`, desfazer/refazer, selecao multipla, menu de contexto ampliado, diagnostico, Google Sheets import/export e backup/restore.
- Em 2026-05-13, nova rodada corrigiu a operacao diaria: `Ctrl+C`, `Ctrl+Z` para busca/filtros, menu de filtro com posicionamento visivel, limpeza de estado de edicao ao trocar de celula, regra condicional apenas por fundo, Miauby na Cotacao, login compacto e heartbeat/reload leve apos inatividade.
- Em 2026-05-13, a formatacao condicional foi ajustada para pintar apenas a celula da coluna-alvo da regra, e a paleta de cores passou a flutuar acima da grade e abrir tambem pelo menu de contexto.
- Em 2026-05-13, regras condicionais passaram a ser editaveis pela tela, a paleta foi ampliada para 63 tons e desarma apos aplicar cor/borracha, o duplo clique de distribuidora prioriza renomeacao, o filtro de `Ganhador` exibe contagens e o widget do Miauby ganhou leitura JSON mais tolerante.
- Em 2026-05-13, os filtros passaram a cobrir `PRODUTO`, valor e cor; o filtro de `Ganhador` passou a ordenar vencedores individuais antes de empates e `Sem vencedor`; selecao de cabecalhos passou a arrastar por multiplas colunas/linhas; regra condicional ganhou opcao de hover com data/hora; cores manuais passaram a vencer tons padrao de distribuidora, enquanto o destaque azul automatico continua vencendo quando a celula e menor preco; o campo de busca livre e a borracha do topo foram removidos.
- Em 2026-05-14, a alca de preenchimento ficou maior e passou a copiar valores e cores da selecao para cima, baixo, esquerda ou direita, mantendo `Ganhador` e outras colunas calculadas sem escrita manual. Depois, ganhou uma previa visual forte da area marcada enquanto o usuario arrasta.
- Em 2026-05-14, o menu de contexto foi reduzido para retirar opcoes irrelevantes ou perigosas: `Adicionar 20 linhas abaixo`, `Apagar linha`, `Renomear distribuidora` e mover distribuidora para esquerda/direita.
- Em 2026-05-14, `Enter` passou a mover a selecao para a celula de baixo por padrao; quando a celula esta em edicao, `Enter` salva e desce.
- Em 2026-05-14, a Cotacao PHP antiga foi removida e os ativos usados pela V2 foram migrados para `apps/cotacao/public`; `docker-compose.yml` deixou de depender de `site/cotacao`.
- Em 2026-05-14, o redimensionamento de coluna ganhou linha guia e etiqueta de largura para o usuario enxergar a largura atual e a diferenca enquanto arrasta.
- Em 2026-05-14, a Etapa 1 de seguranca/performance adicionou indices aditivos para o snapshot atual e ampliou `/cotacao/api/diagnostics` com blocos `safety` e `performance`, mantendo `/cotacao/api/bootstrap` como fallback completo.
- Em 2026-05-14, a Etapa 2 criou `GET /cotacao/api/events?after=<eventId>` e passou o refresh automatico para delta incremental, aplicando eventos simples no frontend e usando bootstrap completo quando houver import, restore, mudanca de coluna ou cursor invalido.
- Em 2026-05-14, a Etapa 3 trocou `loadSheet()` em mutacoes simples por consultas leves de validacao, mantendo o mesmo retorno de API e o mesmo fluxo de eventos em tempo real.
- Em 2026-05-14, a Cotacao passou a normalizar regras condicionais antigas/restauradas para `target='cell'`, reforcando que uma regra de categoria pinta apenas a propria celula de categoria e nao a linha inteira.
- Em 2026-05-14, a digitacao em celulas passou a agendar o auto-ajuste de altura por `requestAnimationFrame`, reduzindo recalculo de layout enquanto o usuario digita.
- Em 2026-05-14, a Etapa 4 tornou a troca de celula mais fluida: commits simples de celula atualizam localmente, redesenham somente a linha afetada e salvam em segundo plano.
- Em 2026-05-14, a presenca visual estilo Sheets foi adicionada: celulas visiveis selecionadas/editadas por outras abas recebem contorno colorido, etiqueta do animal e tooltip com coluna/linha.
- Em 2026-05-14, `Delete`/`Backspace` sobre a selecao passou a usar limpeza otimista em lote e evita render completo em apagamentos simples.
- Em 2026-05-14, foi adotado o comportamento pedido de ultima gravacao vencendo na mesma celula, com botao `Historico` no topo para consultar eventos da celula selecionada e restaurar valor anterior.
- Em 2026-05-14, o modal de formatacao condicional foi reorganizado visualmente para reduzir a sensacao de cards baguncados e alinhar campos/acoes em linhas compactas.
- Em 2026-05-16, a Cotacao V2 do VPS foi restaurada apenas nas tabelas `cotacao_v2_*` a partir do Postgres preservado em `/home/ubuntu/projetos/wimifarma-com-runtime-disabled-2026-05-14-170039/cotacao-data/postgres`, depois que o volume ativo apareceu vazio. O estado restaurado usa o `quote_id` `c3f0cb73-435e-48f3-bc6f-42f2eb7d2b16`, com 178 linhas ativas, 11 linhas com dados, 15 colunas, 35 estilos, 2 regras e 672 eventos ate 2026-05-15 21:13 UTC. Os dumps SQL manuais da operacao ficaram em `/home/ubuntu/projetos/wimifarma-com/cotacao-data/manual-backups/`.
- Em 2026-05-16, o editor de celula foi ajustado para duplo clique/`F2` nao selecionar todo o conteudo existente: o usuario consegue posicionar cursor, selecionar trechos e usar setas dentro do texto sem apagar a celula inteira ao digitar. Depois, a digitacao direta foi separada desse modo de edicao: se o usuario comeca a escrever em uma celula selecionada, as setas confirmam o texto e navegam para a celula vizinha. O botao `Adicionar 20 linhas` tambem passou a adicionar as linhas novas no DOM de forma incremental, sem redesenhar a grade inteira.
- Em 2026-05-16, a sincronizacao de apagamentos em lote foi revisada: `Delete`/`Backspace` continua usando `/cotacao/api/cells/batch`, eventos remotos recebidos durante edicao local sao redesenhados ao sair da edicao, e lotes sem celula realmente alterada retornam `noop` sem criar evento incremental vazio.
- Em 2026-05-16, a sincronizacao de distribuidoras foi revisada para reduzir travamentos: eventos `column_*` sairam do grupo de snapshot obrigatorio, passaram a enviar coluna/ordem visivel no payload, e o frontend deixou de chamar `reloadSheet()` para resize, rename, criar/apagar/restaurar distribuidora quando o payload incremental e suficiente. A API da Cotacao tambem deixou de emitir ETag/cache condicional para evitar `304` em eventos incrementais.
- Em 2026-05-16, a linha ativa ganhou indicador local: o numero da linha onde esta a celula ativa fica verde forte, sem persistencia no banco e sem evento de sincronizacao.
- Em 2026-05-16, o resize foi refinado novamente: soltar a borda da coluna nao agenda mais autosize da planilha inteira e o servidor nao emite mais `columns:changed` para `column_resized`, usando `column:resized` para impedir recarregamento pesado em clientes antigos.
- Em 2026-05-16, o carregamento inicial foi suavizado: o frontend deixou de executar auto-ajuste de altura de todos os `textarea` de forma sincrona logo apos o bootstrap, passando a fatiar esse trabalho em frames para a grade aparecer mais rapido.

## Riscos ao alterar

- Apagar `cotacao-data/` perde dados da Cotacao V2.
- Alterar o proxy Apache sem testar `/cotacao/socket.io/` pode quebrar presenca ao vivo.
- Recriar regra escondida por texto de categoria reabre o bug original.
- Criar sync com Google Sheets sem ID estavel pode duplicar linhas ou sobrescrever dados.
- Multiplicar instancias Node sem adaptador Socket.IO/Redis pode separar usuarios em salas diferentes.
- Permitir escrita manual ou remocao de colunas fixas pode quebrar import/export e rotinas futuras da farmacia.
- Cores manuais devem continuar independentes de regras de negocio; nao usar cor como estado operacional sem schema explicito.
- Importar do Google Sheets sem revisar range/credencial pode substituir a cotacao ativa; usar backup antes de importar dados reais.
- Restore de backup sobrescreve linhas/colunas/regras/estilos da cotacao atual. Deve ser restrito e auditado antes de liberar para toda a equipe.
- Autosave, edicao de celula, colagem, precos, quantidades e fornecedores devem continuar no backend da Cotacao, nao em n8n. n8n pode monitorar ou avisar, mas nao deve gravar direto em `cotacao_v2_*`.
- A concorrencia atual usa contrato de ultimo salvamento vencendo; `expectedValue` fica no payload para auditoria/flag historica, nao para rejeitar o save. Se a equipe quiser bloqueio forte por versao, isso precisa de mudanca separada, teste com duas abas e plano de UX para conflito.
- Resize de coluna e renomeio rapido sao recursos operacionais frequentes; evitar adicionar confirmacoes ou modais nesse caminho.
- Como nao ha fallback PHP legado, falhas em `/cotacao/` devem ser investigadas no app Node, no proxy Apache ou nos servicos Postgres/Redis/MySQL de login.
- Indices novos da Cotacao devem ser aditivos e criados com `IF NOT EXISTS`; nao remover historico ou dados para tentar ganhar performance.

## Pendencias

- Validar com dois usuarios reais o fluxo completo de presenca visual, ultimo salvamento vencendo e restauracao pelo historico; transformar em teste automatizado permanente.
- Evoluir diagnostico para medir latencia cliente-servidor em tempo real e listar eventos atrasados por usuario.
- Configurar credenciais reais do Google Sheets no VPS e validar import/export end-to-end com uma planilha controlada.
- Usar backup/revisao operacional antes de importar ou restaurar backup em dados reais.
- Criar testes automatizados permanentes com duas telas no pipeline.
- Refinar o drag-fill com series automaticas no futuro, caso a equipe precise incrementar numeros/datas em vez de apenas copiar o padrao selecionado.
- Criar rotina agendada de backup/retencao fora do container, alem do backup manual da tela.
- Definir politica de retencao do historico de celula em `cotacao_v2_events` conforme o volume real de uso.
- Medir o endpoint delta no VPS com dados reais e confirmar que refresh automatico deixa de pressionar `/cotacao/api/bootstrap`.
- Medir no VPS a latencia percebida apos a Etapa 4, especialmente trocar de celula e digitar em sequencia com dados reais da equipe.

## Como pode evoluir

1. Consolidar a V2 com os campos atuais e testes de duas telas.
2. Consolidar presenca visual, historico de celula e testes de edicao simultanea.
3. Adicionar import/export Sheets com IDs estaveis.
4. Adicionar renomeacao/reordenacao auditada de distribuidoras, tipos de celula e validacao de dados.
5. Usar Miauby apenas como diagnostico/sugestao operacional, sem expor codigo e sem escrever dados ambiguos.
