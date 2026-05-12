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
- `PATCH /cotacao/api/cells`
- `POST /cotacao/api/rules`
- `DELETE /cotacao/api/rules/:id`
- `/cotacao/socket.io/`

## Banco de dados

Postgres `wimifarma_cotacao`:

- `cotacao_v2_quotes`: cotacoes ativas.
- `cotacao_v2_columns`: colunas da grade.
- `cotacao_v2_rows`: linhas com UUID, posicao, valores JSONB e versao.
- `cotacao_v2_events`: eventos gerados por edicoes, linhas e regras.
- `cotacao_v2_rules`: regras condicionais explicitas.

Redis:

- sessoes web da Cotacao V2;
- presenca temporaria por usuario/aba/celula.

MySQL `wimifarma_app`:

- `wf_users` continua sendo a origem de usuario/senha para manter o login existente.

## Regras de negocio que precisam ser preservadas

- Cada linha tem UUID estavel.
- Cada save altera apenas uma celula.
- Categoria e texto comum.
- `geral`, `urgente`, `encomenda` e `cotacao` nao podem acionar cor, prioridade, ordem, filtro nem alerta por gatilho escondido.
- Formatacao condicional so vale quando criada explicitamente em `cotacao_v2_rules`.
- Filtros de busca/categoria sao locais por tela e nao devem mover a visao de outro usuario.
- Presenca e temporaria; nao deve virar historico permanente.
- Login deve continuar aceitando os usuarios internos existentes de `wf_users`.
- Dados oficiais ainda podem estar no Google Sheets; import/export deve ser controlado e auditavel.

## Decisoes tecnicas ja tomadas

- A planilha PHP antiga deixou de ser o motor principal porque as tentativas de corrigir categorias historicas ainda deixavam risco de salto/travamento.
- A Cotacao V2 usa Node.js + Socket.IO para suportar tempo real sem polling pesado.
- Postgres foi escolhido para linhas JSONB, eventos e evolucao para conflito por campo.
- Redis foi escolhido para sessoes e presenca efemera.
- O Nginx Proxy Manager continua apontando para `wimifarma-com-web:80`; o Apache faz proxy interno para a Cotacao V2.
- A primeira fatia mantem campos simples e editaveis: EAN, produto, quantidade, categoria, fornecedores, observacao e status.

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
- `GET /cotacao/socket.io/socket.io.js`.

## Riscos ao alterar

- Apagar `cotacao-data/` perde dados da Cotacao V2.
- Alterar o proxy Apache sem testar `/cotacao/socket.io/` pode quebrar presenca ao vivo.
- Recriar regra escondida por texto de categoria reabre o bug original.
- Criar sync com Google Sheets sem ID estavel pode duplicar linhas ou sobrescrever dados.
- Multiplicar instancias Node sem adaptador Socket.IO/Redis pode separar usuarios em salas diferentes.

## Pendencias

- Criar conflito por campo visivel ao usuario.
- Criar tela de diagnostico da fila de eventos, presenca e latencia.
- Criar import/export CSV ou Google Sheets.
- Criar colunas dinamicas de fornecedores.
- Criar testes automatizados com duas telas.
- Criar backup/restore do Postgres.
- Definir regra de historico: o usuario indicou que historico completo nao e prioridade porque os dados oficiais podem ser refeitos pelo sistema da farmacia/Sheets.

## Como pode evoluir

1. Consolidar a V2 com os campos atuais e testes de duas telas.
2. Adicionar conflito por campo e indicador de edicao simultanea.
3. Adicionar import/export Sheets com IDs estaveis.
4. Adicionar colunas dinamicas, tipos de celula e validacao de dados.
5. Usar Miauby apenas como diagnostico/sugestao operacional, sem expor codigo e sem escrever dados ambiguos.
