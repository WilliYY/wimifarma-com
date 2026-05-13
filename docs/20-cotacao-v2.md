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
- `POST /cotacao/api/columns`
- `DELETE /cotacao/api/columns/:key`
- `POST /cotacao/api/rules`
- `DELETE /cotacao/api/rules/:id`
- `PUT /cotacao/api/styles`
- `/cotacao/socket.io/`

## Banco de dados

Postgres `wimifarma_cotacao`:

- `cotacao_v2_quotes`: cotacoes ativas.
- `cotacao_v2_columns`: colunas da grade, incluindo metadados `options` para detalhes visuais como colunas ocultas, tons de fornecedores e fallback de exibicao.
- `cotacao_v2_rows`: linhas com UUID, posicao, valores JSONB, versao e `deleted_at` para exclusao logica.
- `cotacao_v2_events`: eventos gerados por edicoes, linhas e regras.
- `cotacao_v2_rules`: regras condicionais explicitas.
- `cotacao_v2_styles`: estilos manuais por linha, coluna ou celula, usados pela paleta de cores da tela.

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
- Formatacao condicional so vale quando criada explicitamente em `cotacao_v2_rules`.
- Filtros de busca, categoria e ganhador sao locais por tela e nao devem mover a visao de outro usuario.
- Presenca e temporaria; nao deve virar historico permanente.
- Nomes de presenca aparecem como animais aleatorios/deterministicos por aba para diferenciar usuarios sem expor o nome real na area principal.
- Login deve continuar aceitando os usuarios internos existentes de `wf_users`.
- Dados oficiais ainda podem estar no Google Sheets; import/export deve ser controlado e auditavel.

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
- A paleta de cores grava estilo manual por linha, coluna ou celula em `cotacao_v2_styles`.
- A coluna `Ganhador` e a celula de menor preco recebem destaque visual automatico, sem depender de palavra em categoria.

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

## Riscos ao alterar

- Apagar `cotacao-data/` perde dados da Cotacao V2.
- Alterar o proxy Apache sem testar `/cotacao/socket.io/` pode quebrar presenca ao vivo.
- Recriar regra escondida por texto de categoria reabre o bug original.
- Criar sync com Google Sheets sem ID estavel pode duplicar linhas ou sobrescrever dados.
- Multiplicar instancias Node sem adaptador Socket.IO/Redis pode separar usuarios em salas diferentes.
- Permitir escrita manual ou remocao de colunas fixas pode quebrar import/export e rotinas futuras da farmacia.
- Cores manuais devem continuar independentes de regras de negocio; nao usar cor como estado operacional sem schema explicito.

## Pendencias

- Criar conflito por campo visivel ao usuario.
- Criar tela de diagnostico da fila de eventos, presenca e latencia.
- Criar import/export Google Sheets com IDs estaveis. Exportacao CSV rapida ja existe no navegador, limitada aos dados carregados/filtrados da tela.
- Criar fluxo de renomear/reordenar distribuidoras com permissao e auditoria.
- Criar testes automatizados permanentes com duas telas no pipeline.
- Criar borracha/remocao de estilo manual na paleta.
- Criar backup/restore do Postgres.
- Definir regra de historico: o usuario indicou que historico completo nao e prioridade porque os dados oficiais podem ser refeitos pelo sistema da farmacia/Sheets.

## Como pode evoluir

1. Consolidar a V2 com os campos atuais e testes de duas telas.
2. Adicionar conflito por campo e indicador de edicao simultanea.
3. Adicionar import/export Sheets com IDs estaveis.
4. Adicionar renomeacao/reordenacao auditada de distribuidoras, tipos de celula e validacao de dados.
5. Usar Miauby apenas como diagnostico/sugestao operacional, sem expor codigo e sem escrever dados ambiguos.
