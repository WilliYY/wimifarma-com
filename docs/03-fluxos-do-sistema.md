# 03 - Fluxos do sistema

## O que esta parte documenta

Este documento descreve os fluxos reais encontrados no sistema e os cuidados para evoluir cada um.

## Fluxo de acesso

Rotas de login:

- `/cashback/login.php`
- `/cotacao/login.php`
- `/financeiro/login.php`
- `/tarefa/login.php`
- `/miauw/login.php`
- `/wp-login.php`

Os modulos internos reaproveitam funcoes comuns do Cashback, especialmente sessao, usuario atual, CSRF, escape HTML e conexao PDO.

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

## Fluxo Cotacao

O modulo de Cotacao controla blocos, itens, fornecedores, categorias, precos e status. Ele ja tem tabelas preparadas para controle de versao/sync, mas a integracao Google Sheets ainda nao esta implementada.

Arquivos principais:

- `site/cotacao/index.php`
- `site/cotacao/api.php`
- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/app.js`
- `site/cotacao/styles.css`

Tabelas principais:

- `cotacao_blocos`
- `cotacao_itens`
- `cotacao_fornecedores`
- `cotacao_categorias`
- `cotacao_precos`
- `cotacao_regras_formatacao`
- `cotacao_sync_estado`
- `cotacao_auditoria`

Regras a preservar:

- ordem dos itens;
- bloco/categoria/fornecedor;
- vencedor e preco vencedor;
- observacoes;
- cores, estilos e formatacao;
- auditoria;
- status e prioridade.

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

## WordPress

WordPress fica na raiz `site/` e usa `site/wp-config.php`.

Cuidados:

- `WP_HOME` e `WP_SITEURL` sao ajustados para localhost em desenvolvimento.
- Em producao, confirmar URLs finais depois do DNS/SSL.
- Plugins vindos do HostGator podem afetar performance.
- Cache deve ser ativado apenas depois de validar redirects e HTTPS.

## Decisoes tecnicas ja tomadas

- Modulos internos ficam dentro da raiz publica ao lado do WordPress.
- Modulos compartilham helpers de autenticacao e banco do Cashback.
- Cotacao deve evoluir com sincronizacao estruturada, nao string solta.

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
