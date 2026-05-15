# 03 - Fluxos do sistema

## O que esta parte documenta

Este documento descreve os fluxos reais encontrados no sistema e os cuidados para evoluir cada um.

## Fluxo de acesso

Entrada publica:

- `/`: home/portal independente em `site/home.php`, com fundo visual em tela inteira, logo, GIFs decorativos com movimento reaproveitado dos logins e cards inferiores de acesso aos modulos.
- O card de Tarefas consulta `/tarefa/badge.php` e exibe badge vermelho quando houver tarefas abertas.
- A home usa no maximo cinco cards por linha no desktop; `Códigos` entra como sexto card abaixo do Cashback.

Rotas de login:

- `/cashback/login.php`
- `/codigos/login.php`
- `/cotacao/login.php` (Cotacao V2 em Node.js, autenticando em `wf_users`)
- `/financeiro/login.php`
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

O modulo Codigos guarda atalhos operacionais para itens com comissao diferente. A tela principal funciona como uma tabela simples inspirada em planilha, com campos sempre editaveis para `Código`, `EAN` e `Preço`.

Arquivos principais:

- `site/codigos/index.php`
- `site/codigos/codigos-funcoes.php`
- `site/codigos/styles.css`
- `site/codigos/app.js`

Tabela principal:

- `wf_codigos_comissao`

Regras a preservar:

- codigo, EAN e preco devem ser editaveis sem fluxo complexo;
- novos itens entram no fim da lista;
- apagar pela tela deve fazer exclusao logica (`ativo=0`) para reduzir risco de perda acidental;
- acoes de criar, editar e apagar registram `wf_logs`.

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
- A Cotacao PHP antiga foi removida; nao existe fluxo paralelo em `site/cotacao`.

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
- auditoria.

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
- `site/miauw/api.php`
- `site/miauw/widget-status.php`
- `site/miauw/widget-auth.php`
- `site/miauw/widget-alerts.php`
- `site/miauw/miauw-funcoes.php`
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
- `miauw_farmacia_popular_valores`
- `miauw_farmacia_popular_atualizacoes`

Direcao de evolucao:

- evoluir por skills controladas, nao por acesso livre ao banco;
- usar `miauw_skill_registry()` como fonte de inventario das skills antes de novas tools;
- registrar padroes e memorias com revisao e auditoria;
- separar leitura, sugestao e escrita;
- documentacao especifica em `docs/18-miauby-evolucao-generativa.md`.

## WordPress

WordPress fica na raiz `site/` e usa `site/wp-config.php`.

Cuidados:

- A rota `/` esta interceptada por `site/.htaccess` e servida por `site/home.php` durante a estabilizacao da migracao.
- WordPress continua responsavel por `/wp-admin`, `/wp-login.php`, posts, paginas legadas e assets em `/wp-content`.
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
