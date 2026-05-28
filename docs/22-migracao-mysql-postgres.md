# 22 - Migracao MySQL para PostgreSQL

## Objetivo

Este documento registra o inventario atual de uso de MySQL e o caminho seguro para migrar os modulos internos para PostgreSQL sem reescrever o projeto inteiro.

## Resumo executivo

Hoje o projeto ainda precisa de MySQL por dois motivos diferentes:

- WordPress: banco `wimifarma_wp`, prefixo `wptl_`. WordPress foi feito para MySQL/MariaDB; trocar por Postgres nao e uma migracao simples nem recomendada como ajuste pequeno. Para remover MySQL 100%, a decisao tecnica correta e substituir/desacoplar a parte WordPress ou manter um MySQL isolado so para WordPress ate essa troca.
- Apps internos: banco `wimifarma_app`, com usuarios, cashback, codigos, XP, financeiro, tarefas e Miauby PHP. Estes podem migrar por etapas para Postgres.

Cotacao V2, Gestao, Pedidos e Miauby WhatsApp ja guardam seus dados principais em Postgres, mas Cotacao/Gestao/Pedidos ainda usam MySQL para autenticar em `wf_users` e, em alguns casos, registrar `wf_logs`. Em 2026-05-28, a migracao iniciou duas fatias seguras: a memoria curta compartilhada do Miauby interno/WhatsApp passou a ter fonte principal no Postgres do bridge (`miauw_whatsapp_channel_events`), e o core de autenticacao entrou em modo sombra com `wimifarma_core`, sincronizando `wf_users` para `core_users` sem alterar login, sessao, permissao, frontend ou backend operacional.

## Uso atual de MySQL

Infraestrutura:

- `docker-compose.yml`: servico `wimifarma-com-db` com imagem `mysql:8.0`, volume `./mysql`, bancos `wimifarma_wp` e `wimifarma_app`.
- `docker/php/Dockerfile`: instala `mysqli` e `pdo_mysql` para WordPress e modulos PHP.
- `site/wp-config.php`: configura WordPress no MySQL `wimifarma_wp`.
- `site/cashback/config.php`: cria `PDO mysql:` para os modulos PHP internos.

Node/TypeScript ainda ligado a MySQL:

- `apps/cotacao/src/server.js`: usa `mysql2` para login em `wf_users`; dados da planilha ficam em Postgres.
- `apps/gestao/src/server.ts`: usa `mysql2` para login em `wf_users` e espelho curto em `wf_logs`; dados oficiais ficam em Postgres.
- `apps/pedidos/src/server.ts`: usa `mysql2` para login em `wf_users` e espelho curto em `wf_logs`; dados oficiais ficam em Postgres da Gestao.

PHP interno ainda ligado a MySQL:

- `site/cashback`: usuarios, clientes, compras, creditos, resgates, settings, logs e limitador de login.
- `site/codigos`: `wf_codigos_comissao` e `wf_codigos_blocos`.
- `site/tarefa`: `wf_tarefas`.
- `site/xp`: `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings`.
- `site/financeiro`: `financeiro_fechamentos`, `financeiro_sangrias`, `financeiro_maquininhas`, `financeiro_pix`, `financeiro_lancamentos`, `financeiro_configuracoes` e `financeiro_auditoria`.
- `site/miauw`: `miauw_conversas`, `miauw_mensagens`, `miauw_conhecimentos`, `miauw_memorias`, `miauw_configuracoes`, `miauw_alertas`, `miauw_alerta_eventos`, `miauw_padroes`, `miauw_tool_traces`, `miauw_treinos_respostas`, `miauw_farmacia_popular_valores` e `miauw_farmacia_popular_atualizacoes`. A tabela `miauw_channel_events` fica como fallback temporario da memoria multicanal; a fonte principal nova e `miauw_whatsapp_channel_events` no Postgres do bridge.

Legados MySQL que devem ser tratados como migracao/arquivo:

- `cotacao_*`: dados da Cotacao PHP antiga, sem escrita oficial nova.
- `gestao_contas`, `gestao_conta_itens`, `gestao_conta_pagamentos`: fonte de importacao/compatibilidade da Gestao antiga.
- tabelas antigas de campanha/WhatsApp em `wimifarma_app`, se nao houver uso atual confirmado.

## Banco alvo recomendado

Nao criar um unico banco gigante para tudo. Manter separacao por dominio:

- `wimifarma_core`: autenticacao compartilhada, sessoes compartilhadas quando existirem, auditoria geral e rate limit de login.
- `wimifarma_cashback`: clientes, compras, creditos, resgates e settings do Cashback.
- `wimifarma_financeiro`: caixa/financeiro PHP quando ele for migrado ou substituido.
- `wimifarma_xp`: funcionarios, vendas XP e configuracoes.
- `wimifarma_miauw`: chat, memoria, treino, alertas e traces do Miauby PHP.
- manter `wimifarma_cotacao`, `wimifarma_gestao` e `wimifarma_miauw_whatsapp` como ja existem.

Se a operacao preferir menos containers, esses schemas podem viver no mesmo servidor Postgres, mas com schemas/bancos separados e credenciais separadas por app.

## Plano de migracao

1. Criar o core em Postgres

- Modelar `core_users`, `core_audit_logs` e `core_login_rate_limits`.
- Migrar `wf_users`, preservando hash de senha, role, status e ids antigos em coluna `legacy_mysql_id`.
- Estado atual: `apps/core-auth` cria o schema em `wimifarma_core`, sincroniza usuarios de forma idempotente e possui validacao de contagem/campos. Esta etapa ainda e modo sombra.
- Estado atual da Cotacao: `COTACAO_CORE_AUTH_SHADOW_ENABLED=true` permite comparar logins bem-sucedidos contra `core_users` em paralelo, mas `auth.provider` permanece `mysql`; divergencias devem ser resolvidas antes de qualquer corte real.
- Estado atual da Gestao: `GESTAO_CORE_AUTH_SHADOW_ENABLED=true` permite comparar logins bem-sucedidos contra `core_users` em paralelo, preservando a regra de permissao `adm`/`admin`/`gerente`, mas `auth.provider` permanece `mysql`; divergencias devem ser resolvidas antes de qualquer corte real.
- Atualizar Cotacao, Gestao e Pedidos para autenticar no core Postgres e parar de depender de `wf_users`/`wf_logs`.
- So depois remover `mysql2` desses apps Node.

2. Migrar modulos PHP pequenos primeiro

- Comecar por `site/tarefa` e `site/codigos`, porque tem dominio menor.
- Criar adaptador Postgres separado em vez de trocar `site/cashback/config.php` de uma vez.
- Manter importador idempotente de MySQL para Postgres e uma janela de validacao por leitura comparada.

3. Migrar XP

- Migrar `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings`.
- Preservar caminhos de uploads, soft delete, `system_key='adm'`, venda em centavos e XP inteiro.
- Validar cards, trilha, configuracoes e ultimos lancamentos.

4. Migrar Financeiro e Cashback

- Financeiro e Cashback tem dados financeiros/cliente; migrar com backup, checksum de totais e validacao de saldos.
- Para Cashback, preservar relacao compra -> credito -> resgate.
- Para Financeiro, preservar fechamentos, divergencias, sangrias, maquininhas, PIX e auditoria.

5. Migrar Miauby PHP

- Migrar conversas, mensagens, memoria, treino, alertas e traces.
- Manter a memoria curta multicanal em `miauw_whatsapp_channel_events` como primeiro passo ja cortado para Postgres, removendo o fallback MySQL somente depois de observacao operacional.
- Cuidar para nao copiar payload bruto, segredo, telefone completo ou stack trace que ja nao deveria existir.
- Planejar corte junto com o `apps/miauw-agent`, porque parte do Miauby ja esta no Node.

6. Decidir WordPress

- Se a meta for zero MySQL, planejar a home/site publico fora do WordPress ou uma substituicao controlada.
- Enquanto WordPress existir, manter `wimifarma_wp` no MySQL e tratar como excecao isolada.
- Nao tentar trocar o banco do WordPress para Postgres por plugin/compatibilidade sem prova longa, backup e rollback.

## Cuidados tecnicos

- MySQL usa `ON DUPLICATE KEY`, `SHOW COLUMNS`, `DATETIME`, `ENUM`, `AUTO_INCREMENT` e sintaxes que nao migram 1:1 para Postgres.
- Dinheiro deve continuar em centavos inteiros.
- Usar FK/constraints e indices nos campos de filtro/join.
- Usar indices parciais para filas, soft delete e status ativos.
- Preservar ids legados em colunas `legacy_mysql_id` para reconciliacao.
- Fazer migracoes idempotentes: repetir o script nao pode duplicar dados.
- Fazer backup antes de cada corte e validar contagens, somatorios e amostras.
- Depois de cada modulo migrado, remover variaveis MySQL dele, dependencia `mysql2` quando aplicavel e atualizar docs.

## Ordem sugerida

1. Core de autenticacao/auditoria em Postgres: iniciado em modo sombra com `wimifarma-core-db` e `apps/core-auth`.
2. Cotacao/Gestao/Pedidos param de usar MySQL para login/log, somente depois de validacao repetida do core.
3. Tarefas.
4. Codigos.
5. XP.
6. Financeiro.
7. Cashback.
8. Miauby PHP.
9. Decisao sobre WordPress.

Essa ordem reduz risco porque remove primeiro a dependencia compartilhada (`wf_users`) e depois migra dominios cada vez mais sensiveis.
