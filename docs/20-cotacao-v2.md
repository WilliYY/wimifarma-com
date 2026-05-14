# 20 - Cotacao V2

## O que esta parte do sistema faz

A Cotacao V2 substitui a planilha PHP antiga em `/cotacao/` por um servico dedicado para edicao colaborativa de cotacao de farmacia. A meta e chegar perto do comportamento do Google Sheets: linhas estaveis, save por celula, presenca ao vivo, filtros locais, regras condicionais explicitas e evolucao segura para conflito por campo.

## Arquivos, rotas e servicos envolvidos

Arquivos principais:

- `apps/cotacao/src/server.js`
- `apps/cotacao/public/app.js`
- `apps/cotacao/public/styles.css`
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
- `GET /cotacao/login.php`
- `POST /cotacao/login.php`
- `GET /cotacao/`
- `GET /cotacao/api/bootstrap`
- `POST /cotacao/api/rows`
- `POST /cotacao/api/rows/insert`
- `DELETE /cotacao/api/rows/:id`
- `PATCH /cotacao/api/cells`
- `PATCH /cotacao/api/cells/batch`
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
- `cotacao_v2_rules`: regras condicionais explicitas, incluindo `show_timestamp` para exibir no hover a data/hora de criacao da regra quando habilitado.
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
- Filtros de produto, categoria, ganhador e cor sao locais por tela e nao devem mover a visao de outro usuario.
- Filtros de `PRODUTO`, `CATEGORIA` e `Ganhador` devem ser acionados pelo icone do cabecalho, com selecionar tudo, limpar tudo e aplicacao local. O filtro de `Ganhador` mostra a contagem de linhas por resultado no formato `Nome (quantidade)` e lista primeiro vencedores individuais, depois empates e por ultimo `Sem vencedor`.
- Filtros de cor devem existir no mesmo menu dos filtros por valor para as colunas que possuem filtro.
- Ao editar uma linha que nao combina mais com filtro ativo, a tela deve manter a linha visivel ate o usuario alterar o filtro, evitando que a linha desapareca no meio da edicao.
- Texto longo deve quebrar linha dentro da celula e aumentar a altura da linha em vez de vazar ou ficar cortado.
- Clicar no cabecalho seleciona a coluna inteira; clicar no numero seleciona a linha inteira. Arrastar pelos cabecalhos deve ampliar a selecao para varias colunas ou varias linhas.
- Distribuidoras podem ser renomeadas com duplo clique no cabecalho e ter largura ajustada arrastando a borda do titulo. Ao clicar fora do titulo em edicao, o editor de renomeacao deve salvar/fechar antes de selecionar a nova celula.
- Apagar distribuidora e um fluxo normal da equipe: a coluna fica oculta e pode ser restaurada por desfazer/`Ctrl+Z` na mesma sessao.
- Presenca e temporaria; nao deve virar historico permanente.
- Nomes de presenca aparecem como animais aleatorios/deterministicos por aba para diferenciar usuarios sem expor o nome real na area principal.
- Login deve continuar aceitando os usuarios internos existentes de `wf_users`.
- Dados oficiais ainda podem estar no Google Sheets; import/export deve ser controlado e auditavel.
- Import/export Google Sheets deve preservar `cotacao_row_id` para manter linha estavel e evitar duplicacao silenciosa.
- Acoes de import e restore precisam de permissao clara antes de uso amplo; apagar distribuidora permanece no fluxo normal com desfazer na mesma sessao.

## Decisoes tecnicas ja tomadas

- A planilha PHP antiga deixou de ser o motor principal porque as tentativas de corrigir categorias historicas ainda deixavam risco de salto/travamento.
- A Cotacao V2 usa Node.js + Socket.IO para suportar tempo real sem polling pesado.
- Postgres foi escolhido para linhas JSONB, eventos e evolucao para conflito por campo.
- Redis foi escolhido para sessoes e presenca efemera.
- O Nginx Proxy Manager continua apontando para `wimifarma-com-web:80`; o Apache faz proxy interno para a Cotacao V2.
- A tela principal segue um visual denso de planilha operacional, parecido com a experiencia anterior aprovada pelo usuario, com topo compacto, abas locais, contador de linhas com dados, presenca ao vivo e exportacao CSV no navegador.
- A grade inicial usa colunas fixas de farmacia: `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, `Anb`, `Profarma`, `mauro`, `arthur`, `Santa`, `tom`, `cimed` e `Ganhador`.
- As colunas legadas `observacao` e `status` podem existir em bancos ja criados, mas ficam ocultas por `options.hidden=true` para nao poluir o layout validado.
- A interface deve ocupar a largura da tela como planilha, sem card envolvendo a grade; barra de rolagem aparece quando houver mais linhas/colunas do que o viewport comporta.
- As celulas usam fonte 20px e alinhamento central por padrao.
- O menu de contexto permite inserir/apagar linhas e inserir/apagar apenas colunas de distribuidoras.
- A paleta de cores grava estilo manual por linha, coluna ou celula em `cotacao_v2_styles`, pode ser aberta pelo botao do topo ou pelo menu de contexto e oferece faixas de tons do mais forte ao mais claro.
- Cor manual aplicada por linha/coluna/celula tem prioridade visual sobre tons padrao de distribuidora. O destaque automatico azul do menor preco fica por cima enquanto a celula estiver vencendo; quando deixar de vencer, a cor manual reaparece.
- Entre estilos manuais sobrepostos, o `updated_at` mais recente vence; assim, pintar uma coluna agora cobre cores antigas de celulas daquela coluna, mas uma cor de celula aplicada depois ainda pode se destacar.
- Aplicar cor ou borracha pela paleta e uma acao unica; apos salvar o estilo da selecao atual, o modo de pintura e desarmado para evitar colorir a proxima celula por acidente.
- A coluna `Ganhador` e a celula de menor preco recebem destaque visual automatico, sem depender de palavra em categoria.
- A insercao de linhas saiu dos botoes visiveis e ficou no menu de contexto. Colagem de planilha usa `Ctrl+V` e `PATCH /cotacao/api/cells/batch`.
- A tela usa `Ctrl+Z`/`Ctrl+Y` e botoes de desfazer/refazer para mudancas locais rastreaveis.
- `Ctrl+Z` tambem desfaz filtros locais; `Ctrl+C` copia a selecao como matriz TSV; `Ctrl+V` cola matriz normalizando texto e precos para o padrao da Cotacao.
- A tela usa controles compactos por icone para formatacao condicional e paleta de cores; a presenca do usuario aparece junto aos indicadores do topo e o campo de busca livre foi removido para reduzir ruido operacional.
- Regras condicionais podem marcar a opcao `Data/hora`; quando uma celula bater nessa regra, o hover mostra a data/hora de criacao da regra.
- O fim da rolagem da grade exibe `Adicionar 20 linhas` para continuar a cotacao sem voltar ao topo.
- `app.js` e `styles.css` sao servidos sem cache forte para que alteracoes de deploy aparecam imediatamente ao recarregar a Cotacao.
- O topo da Cotacao V2 deve permanecer compacto: `Wimifarma Cotacao`, `Home`, `Baixar` e `Sair`; o diagnostico saiu do menu principal da equipe.
- O diagnostico operacional continua disponivel por API interna e pode consultar health, presenca, eventos, Google Sheets e backups quando necessario.
- A Cotacao mantem heartbeat de presenca e recarregamento leve apos reconexao/retorno da aba para reduzir perda de sincronizacao depois de inatividade.
- O widget do Miauby e carregado dentro da Cotacao V2 para manter o assistente acessivel na operacao; o frontend pede JSON explicitamente e os endpoints do widget limpam saidas acidentais antes de responder JSON.
- A tela de login da Cotacao usa card mais compacto para nao cobrir demais o viewport.
- Backups da Cotacao V2 ficam no volume ignorado `cotacao-data/backups`, montado em `/app/backups`.

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

## Pendencias

- Validar conflito por campo visivel com dois usuarios reais e transformar em teste automatizado permanente.
- Evoluir diagnostico para medir latencia cliente-servidor em tempo real e listar eventos atrasados por usuario.
- Configurar credenciais reais do Google Sheets no VPS e validar import/export end-to-end com uma planilha controlada.
- Usar backup/revisao operacional antes de importar ou restaurar backup em dados reais.
- Criar testes automatizados permanentes com duas telas no pipeline.
- Evoluir a alca visual de preenchimento para drag-fill real, caso a equipe queira copiar padroes como no Sheets.
- Criar rotina agendada de backup/retencao fora do container, alem do backup manual da tela.
- Definir regra de historico: o usuario indicou que historico completo nao e prioridade porque os dados oficiais podem ser refeitos pelo sistema da farmacia/Sheets.

## Como pode evoluir

1. Consolidar a V2 com os campos atuais e testes de duas telas.
2. Adicionar conflito por campo e indicador de edicao simultanea.
3. Adicionar import/export Sheets com IDs estaveis.
4. Adicionar renomeacao/reordenacao auditada de distribuidoras, tipos de celula e validacao de dados.
5. Usar Miauby apenas como diagnostico/sugestao operacional, sem expor codigo e sem escrever dados ambiguos.
