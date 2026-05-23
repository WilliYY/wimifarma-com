# 20 - Cotacao V2

## O que esta parte do sistema faz

A Cotacao V2 substitui a planilha PHP antiga em `/cotacao/` por um servico dedicado para edicao colaborativa de cotacao de farmacia. A meta e chegar perto do comportamento do Google Sheets: linhas estaveis, save por celula, presenca ao vivo, filtros locais, regras condicionais explicitas, ultima gravacao vencendo e historico para recuperacao.

## Arquivos, rotas e servicos envolvidos

Arquivos principais:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
- `apps/cotacao/public/assets/`
- `apps/cotacao/public/logo-wimifarma.svg` (logo oficial SVG horizontal sincronizada com os demais modulos)
- `apps/cotacao/public/favicon.svg`
- `apps/cotacao/public/favicon.png`
- `apps/cotacao/package.json`
- `apps/cotacao/Dockerfile`
- `docker-compose.yml`
- `docker/php/Dockerfile`

Servicos:

- `wimifarma-cotacao-app`: Node.js 22, Express e Socket.IO.
- `wimifarma-cotacao-db`: Postgres 17.
- `wimifarma-cotacao-redis`: Redis 7.
- `wimifarma-com-web`: Apache/PHP, faz proxy de `/cotacao/` e `/cotacao/socket.io/`.
- `wimifarma-com-db`: MySQL, usado pela Cotacao V2 somente para autenticar `wf_users`.

Rotas:

- `GET /cotacao/health`
- `GET /cotacao/api/internal/search` para consulta interna do Miauby por token
- `POST /cotacao/api/internal/encomendas` para criar encomenda interna do Miauby por token
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

Redis:

- sessoes web da Cotacao V2;
- presenca temporaria por usuario/aba/celula.

MySQL `wimifarma_app`:

- `wf_users` continua sendo a origem de usuario/senha para manter o login existente.

## Regras de negocio que precisam ser preservadas

- Cada linha tem UUID estavel.
- Cada save altera apenas uma celula.
- As colunas `EAN`, `PRODUTO`, `QUANTIDADE` e `CATEGORIA` sao fixas no contrato da farmacia e nao devem trocar de nome.
- Colunas de distribuidoras podem ser adicionadas ou removidas pela interface; colunas fixas e calculadas nao.
- `Ganhador` e calculado pelo menor preco numerico entre distribuidoras visiveis e nao aceita escrita manual.
- Categoria e texto comum.
- `geral`, `urgente`, `encomenda` e `cotacao` nao podem acionar cor, prioridade, ordem, filtro nem alerta por gatilho escondido.
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
- Presenca e temporaria; nao deve virar historico permanente.
- Nomes de presenca aparecem como animais aleatorios/deterministicos por aba para diferenciar usuarios sem expor o nome real na area principal.
- Quando outro usuario esta em uma celula visivel, a grade deve mostrar contorno colorido, etiqueta do animal e tooltip com coluna/linha; esse indicador nao bloqueia escrita.
- O botao `Historico`, ao lado do contador de linhas com dados, abre as alteracoes da celula selecionada a partir de `cotacao_v2_events` e permite restaurar o valor anterior por um save normal.
- O modal de formatacao condicional deve manter leitura operacional: criacao de regra em uma faixa compacta, lista de regras em linhas alinhadas e acoes visiveis sem quebrar o layout.
- Login deve continuar aceitando os usuarios internos existentes de `wf_users`.
- Dados oficiais ainda podem estar no Google Sheets; import/export deve ser controlado e auditavel.
- Import/export Google Sheets deve preservar `cotacao_row_id` para manter linha estavel e evitar duplicacao silenciosa.
- Acoes de import e restore precisam de permissao clara antes de uso amplo; apagar distribuidora permanece no fluxo normal com desfazer na mesma sessao.

## Decisoes tecnicas ja tomadas

- A planilha PHP antiga deixou de ser o motor principal porque as tentativas de corrigir categorias historicas ainda deixavam risco de salto/travamento.
- Em 2026-05-14, a planilha PHP antiga foi removida do repositorio junto com os shims `site/app.js`, `site/api.php` e `site/cotacao-funcoes.php`; a Cotacao V2 passou a carregar seus proprios ativos diretamente de `apps/cotacao/public`.
- A Cotacao V2 usa Node.js + Socket.IO para suportar tempo real sem polling pesado.
- Postgres foi escolhido para linhas JSONB, eventos, historico por celula e evolucao segura do sync.
- Redis foi escolhido para sessoes e presenca efemera.
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
- A tela usa `Ctrl+Z`/`Ctrl+Y` e botoes de desfazer/refazer para mudancas locais rastreaveis; `Enter` desce para a celula abaixo por padrao, e `F2` abre edicao da celula selecionada sem selecionar todo o texto. Quando a edicao comeca por digitacao direta, as setas salvam a celula e movem a selecao para cima, baixo, esquerda ou direita; quando a edicao comeca por duplo clique/`F2`, as setas continuam navegando dentro do texto.
- A navegacao por setas mantem a celula ativa visivel dentro da grade: ao chegar perto da borda superior/inferior ou lateral, o container da planilha acompanha a selecao, sem recarregar dados nem redesenhar a tabela inteira.
- `Ctrl+Z` tambem desfaz filtros locais; `Ctrl+C` copia a selecao como matriz TSV; `Ctrl+V` cola matriz normalizando texto e precos para o padrao da Cotacao.
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
