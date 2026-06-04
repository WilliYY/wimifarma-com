# 26 - Inventario detalhado de modulos

## Objetivo

Este documento registra o inventario operacional antes de novas migracoes ou cortes. A ficha de cada modulo deve responder:

- rota atual;
- telas e endpoints;
- permissao e sessao;
- tabelas MySQL envolvidas;
- fonte oficial atual;
- arquivos PHP/legados relevantes;
- fluxos de escrita;
- integracoes;
- riscos e cuidados para a proxima etapa.

Use este inventario junto com `docs/22-migracao-mysql-postgres.md` e `docs/24-modernizacao-modulos.md`. Quando um modulo mudar de rota, banco, auth, escrita ou integracao, atualize este documento.

Nota de navegacao: os modulos internos devem exibir `Home` para voltar a `/` sem encerrar sessao. O botao visual `Sair` fica apenas na Home principal; rotas de logout dos modulos podem existir por compatibilidade, mas nao devem aparecer como acao de navegacao.

## Limpeza de legado em 2026-05-29

Legados comprovadamente fora das rotas oficiais foram movidos para `site/_legacy-disabled/2026-05-29/` e bloqueados por `.htaccess`: Gestao PHP antiga, PHP antigo de Codigos, PHP antigo de XP e financeiro antigo dentro de Cashback. Em 2026-06-04, as telas/APIs/diagnosticos PHP antigos de Cashback e o Financeiro PHP antigo foram movidos para `site/_legacy-disabled/2026-06-04/`, deixando nas pastas oficiais apenas assets e helpers minimos ainda chamados pelo Miauby. Continuam ativos WordPress, Miauby PHP, `site/tarefa` e assets montados pelos apps Node. Em 2026-05-31, `site/cashback`, `site/financeiro` e `site/tarefa` ganharam `.htaccess` local bloqueando PHP direto por HTTP, para que essas pastas nao virem fallback operacional caso o proxy Node seja alterado errado. O inventario da limpeza fica em `docs/27-limpeza-legado.md`.

## Modelo de ficha

```text
Modulo:
Rota oficial:
Stack/fonte atual:
Telas:
Permissoes:
Tabelas MySQL:
Tabelas Postgres:
Arquivos legados:
Fluxos de escrita:
Integracoes:
Riscos:
Proxima acao segura:
```

## Financeiro

### Rota atual

- Rota publica oficial: `/financeiro/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/financeiro/` para `wimifarma-financeiro-app:3800/financeiro/`.
- App oficial: `apps/financeiro`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_financeiro`.
- Assets visuais montados do legado: `site/financeiro/styles.css`, `site/financeiro/app.js`, `site/financeiro/login-runner.js`, logo/favicon e `site/financeiro/assets`.

### Telas e endpoints

- `/financeiro/login.php`: login do modulo.
- `/financeiro/` ou `/financeiro/index.php`: tela `Caixa`, com fechamento diario.
- `/financeiro/?view=relatorio`: tela `Relatorio`, com faturamento diario e fechamento sem movimento.
- `/financeiro/exportar.php`: exportacao CSV.
- `/financeiro/logout.php`: encerra sessao.
- `/financeiro/health` e `/financeiro/health.php`: health do app.
- Endpoints internos tokenizados:
  - `GET /financeiro/api/internal/summary`;
  - `GET /financeiro/api/internal/day`;
  - `GET /financeiro/api/internal/cash-closing-status`;
  - `GET /financeiro/api/internal/checksums`;
  - `GET /financeiro/api/internal/audit/recent`;
  - `POST /financeiro/api/internal/lancamentos`;
  - `POST /financeiro/api/internal/faturamentos`;
  - `POST /financeiro/internal/sync`.

### Permissoes e sessao

- Sessao propria `WFFINANCEIRO`.
- Login oficial somente por `core_users`.
- Desde 2026-06-02, o app respeita `core_user_module_permissions` para `module_key='financeiro'`: linha explicita `can_access=false` bloqueia o modulo; ausencia de linha preserva acesso legado; o usuario `adm` continua como recuperacao segura.
- Nao ha rollback/fallback MySQL de login no codigo atual; rollback exige restaurar versao anterior e backup validado.
- Rotas operacionais exigem usuario autenticado.
- Escritas de tela usam CSRF.
- Endpoints internos exigem `FINANCEIRO_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`, conforme ambiente.

### Tabelas MySQL envolvidas

MySQL e legado historico/backup, nao a fonte principal:

- `financeiro_fechamentos`;
- `financeiro_lancamentos`;
- `financeiro_sangrias`;
- `financeiro_maquininhas`;
- `financeiro_pix`;
- `financeiro_configuracoes`;
- `financeiro_auditoria`;
- `wf_users`, apenas como origem historica sincronizada para `core_users`;
- `wf_logs`, apenas como historico/compatibilidade indireta quando aplicavel.

### Tabelas Postgres oficiais

- `financeiro_closings`;
- `financeiro_entries`;
- `financeiro_sangrias`;
- `financeiro_card_entries`;
- `financeiro_pix_entries`;
- `financeiro_settings`;
- `financeiro_audit_events`;
- `financeiro_migration_runs`;
- `financeiro_internal_idempotency`;
- tabela de sessao criada pelo store do Express.

### Arquivos PHP/legados relevantes

- `site/financeiro/financeiro-funcoes.php`, helper minimo sem banco para o Miauby;
- `site/_legacy-disabled/2026-06-04/financeiro-php/`, PHP antigo completo arquivado;
- `site/financeiro/app.js`;
- `site/financeiro/styles.css`;
- `site/financeiro/login-runner.js`.

Hoje estes arquivos PHP sao legado/fonte visual. A rota oficial passa pelo Node.

### Fluxos de escrita

- `save_day`: autosave do fechamento diario, responsavel e totais.
- `close_day`: fecha o dia como `fechado` ou `divergente`, conforme limite; o backend aceita a acao real do botao mesmo se uma pagina antiga ainda enviar `save_day` junto.
- `save_report_faturamento` e `save_report_faturamento_auto`: salva faturamento diario do relatorio.
- `close_empty` e `close_report_empty_day`: marcam `sem_movimento` somente quando o dia nao tem lancamento ativo nem valor/faturamento ja salvo.
- `save_sangria`: cria lancamento de sangria.
- `save_maquininha`: cria lancamento de maquininha/cartao/Pix de maquininha.
- `save_pix`: cria lancamento Pix.
- `cancel_lancamento`, `cancel_sangria`, `cancel_maquininha`, `cancel_pix`: cancelamentos logicos.
- `POST /api/internal/lancamentos`: escrita interna usada por Miauby/WhatsApp para `Pix CNPJ`, sangria e lancamentos controlados.
- `POST /api/internal/faturamentos`: escrita interna para faturamento diario.
- Desde 2026-05-30, o runtime nao possui importacao/espelho MySQL, `mysql2`, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` ou flags `FINANCEIRO_LEGACY_MYSQL_*`.

### Integracoes

- Core auth em `wimifarma_core`.
- Miauby interno usa endpoints internos para consultar/gravar financeiro.
- Miauby WhatsApp usa `cash-closing-status`, `lancamentos` e `faturamentos`.
- n8n chama o bridge WhatsApp para lembrete de fechamento de caixa as 18h; o bridge consulta o Financeiro.
- Exportacao CSV por `/financeiro/exportar.php`.

### Riscos

- Dinheiro precisa continuar em centavos inteiros no backend.
- Rollback para MySQL exige restaurar versao anterior e backup validado; nao existe mais flag de religamento no runtime atual.
- Fechamento, divergencia e `sem_movimento` afetam automacoes do WhatsApp.
- Endpoints internos de escrita precisam continuar tokenizados e idempotentes.
- Nao reativar tela antiga de auditoria para operador sem necessidade; auditoria deve continuar no banco.

### Proxima acao segura

Validar no VPS por dia/amostra: contagens, somatorios, fechamento, relatorio, exportacao, Pix CNPJ via Miauby e auditoria. O espelho MySQL ja foi removido; rollback exige restaurar versao anterior e backup validado.

## Cashback

### Rota atual

- Rota publica oficial: `/cashback/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/cashback/` para `wimifarma-cashback-app:4000/cashback/`.
- App oficial: `apps/cashback`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_cashback`.
- Assets visuais montados do legado: `site/cashback/styles.css`, `site/cashback/app.js`, `site/cashback/login-runner.js`, logos, favicon e GIFs.

### Telas e endpoints

- `/cashback/login.php`: login.
- `/cashback/dashboard.php`: tela principal com busca, cadastro, compra e resgate.
- `/cashback/clientes.php`: lista/edicao de clientes.
- `/cashback/cliente-detalhe.php`: detalhe do cliente.
- `/cashback/compras.php`: historico/registro de compras.
- `/cashback/resgates.php`: resgates de credito.
- `/cashback/mensagens.php`: mensagens/WhatsApp manual.
- `/cashback/relatorio.php`: relatorios, configuracoes e atendentes.
- `/cashback/manutencao.php`: modo manutencao.
- `/cashback/diagnostico.php`, `/diagnostico-publico.php`, `/autoteste.php`: diagnostico e autoteste.
- `/cashback/exportar.php`: exportacao.
- `/cashback/api-clientes.php`: busca JSON de clientes.
- `/cashback/api-whatsapp-status.php`: atualiza status de mensagem.
- `/cashback/health` e `/cashback/health.php`: health.
- Endpoints internos tokenizados:
  - `GET /cashback/internal/migration-status`;
  - `GET /cashback/api/internal/summary`, com periodo opcional;
  - `GET /cashback/api/internal/clients/search`, busca segura para Miauby sem ler `wf_clientes`.

### Permissoes e sessao

- Sessao propria `WFCASHBACK`.
- Login unico por `core_users`.
- Nao ha fallback MySQL de autenticacao no app desde 2026-05-30.
- Rotas operacionais exigem usuario autenticado.
- Escritas usam CSRF.
- Relatorio, exportacao e diagnostico nao usam senha operacional extra; basta a sessao autenticada do Cashback. O modo manutencao tambem e liberado por usuario ja logado, sem senha fixa.
- Limitador de login usa `core_login_rate_limits` quando a auth e core.

### Tabelas MySQL envolvidas

MySQL e legado historico. Desde 2026-05-30 nao ha importacao, espelho, log, fallback de auth nem dependencia `mysql2` no app Cashback; essas tabelas ficam apenas para reconciliacao/backup e rollback por restauracao de versao anterior:

- `wf_atendentes`;
- `wf_clientes`;
- `wf_compras`;
- `wf_cashback_creditos`;
- `wf_resgates`;
- `wf_resgate_itens`;
- `wf_settings`;
- `wf_whatsapp_mensagens`;
- `wf_logs`;
- `wf_users`, apenas como origem historica do core auth.

### Tabelas Postgres oficiais

- `cashback_attendants` (com `core_user_id` para vincular atendente ao login core responsavel por operacoes);
- `cashback_clients`;
- `cashback_purchases`;
- `cashback_credits`;
- `cashback_redemptions`;
- `cashback_redemption_items`;
- `cashback_settings`;
- `cashback_whatsapp_messages`;
- `cashback_audit_events`;
- `cashback_migration_runs`;
- tabela de sessao criada pelo store do Express.

### Arquivos PHP/legados relevantes

- `site/cashback/config.php`, bootstrap compartilhado ainda usado pelo Miauby PHP;
- `site/cashback/functions.php`, helpers minimos de auth/core/CSRF/formato/schema para o Miauby, sem regra operacional de Cashback;
- `site/_legacy-disabled/2026-06-04/cashback-php/`, PHP antigo de tela/API/diagnostico arquivado;
- `site/cashback/styles.css`;
- `site/cashback/app.js`;
- `site/cashback/login-runner.js`.

Hoje estes arquivos PHP sao legado/helper/fonte visual com execucao web direta bloqueada por `.htaccess`. A rota oficial passa pelo Node.

### Fluxos de escrita

- Criar/editar/inativar/excluir cliente.
- Criar compra, calcular cashback gerado e criar credito vinculado a compra; novo credito expira sempre 45 dias apos `cashback_purchases.purchased_at::date`.
- Criar resgate, marcando creditos vencidos antes da escrita, consumir somente creditos ativos dentro da validade e gravar itens do resgate.
- Compra, Compra Cashback e resgate manual registram `cashback_purchases.attendant_id`/`cashback_redemptions.attendant_id` pelo usuario logado da sessao core, via `cashback_attendants.core_user_id`; o seletor Atendente aparece preenchido/travado para a operacao e postagem manual de outro `atendente_id` nao troca o responsavel.
- Atualizar status de mensagens (`aberta`, `copiada`, `enviada`, `cancelada`, `expirado_da_fila`).
- Listar mensagens de expiracao apenas para creditos ativos com saldo, ainda nao vencidos e dentro da janela configurada, agrupando por cliente e data exata de vencimento para respeitar compras diferentes; ao vencer, o credito sai da lista pelo status `expirado`, sem apagar cliente nem credito historico.
- Listar recompra para clientes com saldo ativo e sem compra recente com uma pendencia por cliente e ultima compra; a pendencia fica visivel por ate 14 dias e depois sai da fila principal com status `expirado_da_fila`. `Excluir da fila` usa `cancelada` como arquivamento manual e ambos bloqueiam retorno imediato, sem apagar cliente, saldo ou historico.
- Em `/cashback/mensagens.php`, o bloco `Todos Whats` fica recolhido por padrao e, ao abrir, mostra somente os 10 registros salvos mais recentes.
- Na navegacao superior do Cashback, o atalho `Home` fica por ultimo para manter o fluxo operacional primeiro.
- Criar/editar/inativar/excluir atendente.
- Atualizar configuracoes (`cashback_percent`, alertas, manutencao e afins); a validade de novos creditos e regra fixa de 45 dias por compra.
- Autoteste cria dados dentro de transacao controlada.
- Auditoria oficial em `cashback_audit_events`.
- Escritas nao sao espelhadas em MySQL; a trilha oficial fica em Postgres.

### Integracoes

- Core auth em `wimifarma_core`.
- Home publica aponta o card `Cashback` para `/cashback/`.
- Miauby interno consulta resumo/status e busca de cliente por endpoint interno tokenizado do Cashback Node/Postgres; se a ponte moderna falhar, ele nao cai em `wf_compras`, `wf_clientes`, `wf_cashback_creditos` ou `wf_resgates`.
- Mensagens de WhatsApp do Cashback ainda sao operacionais/manuais dentro do modulo, nao o bridge Miauby WhatsApp.
- Relatorios/exportacao CSV.

### Riscos

- Compra, credito e resgate precisam ser transacionais para nao gerar saldo errado.
- Excluir fisicamente cliente/atendente e mais arriscado que inativar; validar se ainda precisa existir na UI.
- Rollback para MySQL exige restaurar commit/imagem anterior e backup; nao existe mais chave de `.env` que religue o caminho no Cashback atual.
- Telefone de cliente e mensagem WhatsApp sao dados sensiveis; nao expor em logs.
- Mudancas em percentual alteram regra de negocio historica; a validade de novos creditos deve permanecer fixa em 45 dias por compra.
- Em 2026-05-29, a validacao de corte bateu 89 clientes, 4 atendentes, 45 compras, 45 creditos, 7 resgates, 7 itens de resgate, 7 settings e 171 mensagens entre Postgres e MySQL; somatorios de compras, creditos, saldo disponivel, resgates e itens fecharam em centavos; sequencias e integridade referencial ficaram OK. A diferenca de `wf_logs` era de 11 eventos de Pedidos/XP gravados depois da importacao, nao de Cashback.

### Proxima acao segura

Concluido em 2026-05-30: caminho `mysql2` dormente removido do Cashback. Proxima acao e manter backup/health, validar login, saldos, compras, resgates, mensagens e CSV apos deploy.

## Gestao

### Rota atual

- Rota publica oficial: `/gestao/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/gestao/` para `wimifarma-gestao-app:3200/gestao/`.
- App oficial: `apps/gestao`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_gestao`.
- Desde 2026-05-30, nao ha dependencia MySQL no app: sem `mysql2`, sem importador legado, sem fallback `wf_users`, sem espelho `wf_logs`, sem `depends_on` de MySQL e sem variaveis `MYSQL_*` no servico.
- A URL antiga `/gestao/pedidos` redireciona para `/pedidos/`; Pedidos nao deve voltar a ser subview da Gestao.

### Telas e endpoints

- `/gestao/login.php`: login.
- `/gestao/` e `/gestao/index.php`: tela administrativa de contas, itens, pagamentos, busca e painel mensal.
- Desde 2026-06-01, a lista compacta abre detalhes ao clicar na linha inteira, sem botao separado `Abrir`; contas com `Repetir mes que vem` ativo aparecem primeiro e recebem simbolo de repeticao.
- `/gestao/logout.php`: encerra sessao.
- `/gestao/health`: health com auth core unico e Postgres.
- `GET /gestao/api/internal/summary`: resumo interno para Miauby/rotinas.
- `POST /gestao/api/internal/accounts`: criacao interna tokenizada de conta a pagar pelo Miauby.
- `POST /gestao/api/monthly-order`: ordenacao manual do painel mensal.
- `GET /gestao/api/orders/badge`: compatibilidade de badge de pedidos.

### Permissoes e sessao

- Sessao propria `WFGESTAO`.
- Login oficial e unico por `core_users`.
- Permissao operacional restrita a `adm`, role `admin` ou role `gerente`.
- Nao ha fallback MySQL no codigo atual; rollback MySQL exige restaurar commit/imagem anterior e backup/importacao validada.
- Escritas de tela usam CSRF.
- Endpoints internos exigem token por header interno, incluindo `X-Miauw-Internal-Token` ou token especifico da Gestao.

### Tabelas MySQL envolvidas

Legado/rollback, nao fonte principal:

- `gestao_contas`;
- `gestao_conta_itens`;
- `gestao_conta_pagamentos`;
- `wf_users`/`wf_logs` ficam apenas como historico/compatibilidade do MySQL legado, fora do runtime da Gestao.

### Tabelas Postgres oficiais

- `gestao_accounts`;
- `gestao_account_items`;
- `gestao_account_payments`;
- `gestao_audit_events`;
- `gestao_notepad_notes`;
- `gestao_supplier_orders`;
- `gestao_schema_migrations`;
- tabela de sessao criada pelo store do Express.

### Arquivos legados/relevantes

- `apps/gestao/src/server.ts`;
- `apps/gestao/public/styles.css`;
- `apps/gestao/public/app.js`;
- `apps/gestao/public/login-runner.js`;
- `site/_legacy-disabled/2026-05-29/gestao-php/`, arquivo historico bloqueado.

### Fluxos de escrita

- Criar conta manual com titulo, categoria, competencia, itens e observacao.
- Adicionar, editar, cancelar, reabrir e quitar itens.
- Registrar e cancelar pagamentos parciais/totais.
- Puxar contas pendentes de competencias anteriores para a visao do mes selecionado ate pagamento/cancelamento, sem alterar a competencia original; pagamentos datados no mes compoem o total pago do mes.
- Reabrir, cancelar, arquivar e marcar conta como paga.
- Alterar vencimento, categoria, observacao e nome.
- Repetir conta para mes seguinte e ordenar painel mensal.
- Criar conta via Miauby por endpoint interno, com auditoria e confirmacao quando aplicavel.
- Sincronizar status de contas vinculadas a Pedidos sem recategorizar boletos de pedidos.

### Integracoes

- Core auth e `core_audit_logs` em `wimifarma_core`.
- Pedidos usa as tabelas da Gestao para boleto, parcelas e pagamentos.
- Miauby interno cria/consulta contas por endpoint interno tokenizado da Gestao; o contrato da tool `criar_conta_gestao` audita em `gestao_audit_events`, `core_audit_logs` e `miauw_tool_traces`, sem `wf_logs`.
- Financeiro/Miauby podem usar resumo para diagnosticos.
- Home publica aponta `Gestao` para `/gestao/`.

### Riscos

- Gestao e Pedidos compartilham contas de boletos; uma mudanca em `gestao_accounts` pode quebrar pedidos.
- Categoria `Boleto` de pedidos deve continuar protegida contra recategorizacao em lote.
- Fallback MySQL prolongado pode gerar divergencia em logs/importacao.
- Dinheiro precisa continuar em centavos inteiros.
- Repeticao mensal e arquivamento devem preservar auditoria.

### Proxima acao segura

Concluido em 2026-05-30: dependencia `mysql2`, importacao antiga, fallback `wf_users`, espelho `wf_logs` e envs `GESTAO_AUTH_*` removidos da Gestao. No corte complementar de 2026-05-30, o contrato do Miauby para `criar_conta_gestao` tambem deixou de referenciar `wf_logs`. Proxima acao e validar `/gestao/health`, login, contas, itens, pagamentos, Pedidos vinculados e comando Miauby no VPS.

## Pedidos

### Rota atual

- Rota publica oficial: `/pedidos/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/pedidos/` para `wimifarma-pedidos-app:3300/pedidos/`.
- App oficial: `apps/pedidos`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_gestao`, compartilhado com Gestao para contas de boleto.
- Nao ha dependencia MySQL no app de Pedidos.

### Telas e endpoints

- `/pedidos/login.php`: login.
- `/pedidos/` e `/pedidos/index.php`: tela de fornecedores, novo pedido, aguardando chegada, confirmados e historico.
- `/pedidos/logout.php`: encerra sessao.
- `/pedidos/health`: health com `mysql_dependency=false`.
- `GET /pedidos/api/badge`: total de pedidos em `Aguardando chegada`, usado pela home.
- `GET /pedidos/api/internal/arrival-summary`: lista pedidos aguardando chegada para Miauby WhatsApp/n8n, com valor total, previsao, `created_at` do pedido e ordenacao pelos mais antigos.
- `POST /pedidos/api/internal/confirm-arrival`: confirma chegada por titulo/fornecedor via automacao autorizada.
- `POST /pedidos/api/internal/create-order`: cria pedido por comando do Miauby Whats, revalidando token interno, `actor_user_id`, permissao do usuario no core e idempotencia por mensagem.
- `GET /pedidos/api/internal/cancel-candidates`: lista candidatos em `Aguardando chegada` para cancelamento por Miauby WhatsApp/Miauby interno, revalidando `actor_user_id`, permissao core e retornando se existe financeiro vinculado.
- `POST /pedidos/api/internal/cancel-order`: cancela/arquiva logicamente pedido ainda em `Aguardando chegada`, com token interno, `actor_user_id`, idempotencia, auditoria e preservacao de pagamentos/financeiro.

### Permissoes e sessao

- Sessao propria `WFPEDIDOS`.
- Login oficial por `core_users`, sem fallback MySQL.
- Permissao operacional restrita a `adm`, role `admin` ou role `gerente`.
- Escritas de tela usam CSRF.
- Endpoints internos exigem `PEDIDOS_INTERNAL_TOKEN` ou `X-Miauw-Internal-Token`.

### Tabelas MySQL envolvidas

- Nenhuma dependencia MySQL runtime no app de Pedidos.
- Dados historicos antigos podem existir no MySQL por causa da Gestao antiga, mas nao sao fonte oficial do modulo.

### Tabelas Postgres oficiais

- `pedidos_orders`;
- `pedidos_confirmed_orders`;
- `pedidos_internal_idempotency`;
- `gestao_accounts`;
- `gestao_account_items`;
- `gestao_account_payments`;
- `gestao_audit_events`;
- `pedidos_sessions`.

### Arquivos legados/relevantes

- `apps/pedidos/src/server.ts`;
- `apps/pedidos/public/styles.css`;
- `apps/pedidos/public/app.js`;
- `apps/pedidos/public/login-runner.js`;
- rota antiga `/gestao/pedidos` apenas redireciona para `/pedidos/`.

### Fluxos de escrita

- Criar pedido com fornecedor, parcelas, vencimentos, previsao de chegada, competencia, status inicial e observacao.
- Criar pedido ja pago, ja recebido ou `Chegou e pago - Registrar`, movendo para Confirmados/Historico conforme status.
- `Chegou e pago - Registrar` reutiliza o mesmo fluxo seguro de pago + recebido: cria a conta `Boleto`, itens, um unico pagamento total, registro em `pedidos_confirmed_orders` com lifecycle `historico` e auditoria de registro manual.
- Criar pedido pelo Miauby Whats com mensagens como `miauby pedido anb 350`, `miauby pedido anb 350 chegada amanha`, `miauby pedido anb 350 ja pago so chegar`, `miauby pedido anb 350 ja chegou so pagar`, `miauby pedido anb 350 chegou e pago registrar` ou parcelas `miauby pedido anb em 2 parcelas 200 10/06 e 150 20/06`; o bridge exige allowlist/card `Pedidos`, vinculo com usuario e resposta curta, e o app Pedidos evita duplicidade por `pedidos_internal_idempotency`.
- Consultar pedidos aguardando chegada por Miauby WhatsApp ou Miauby interno com `pedidos`, `ver pedidos`, `o que falta chegar` e variacoes; a resposta lista um pedido por linha, sem consultar historico/finalizados.
- Cancelar pedido aguardando chegada por Miauby WhatsApp ou Miauby interno com `cancelar pedido anb`, `cancelar pedido 350`, `nao precisa mais do pedido da anb` e variacoes; quando ha varios candidatos, o Miauby guarda escolha pendente por numero/texto e depois exige confirmacao final. Pedido com financeiro vinculado avisa antes da confirmacao. A execucao usa `cancel-order`, nao apaga financeiro e nao alcança historico/finalizados.
- Marcar pedido em Aguardando chegada como ja pago, gravando somente o saldo aberto em `gestao_account_payments` e mantendo a chegada pendente.
- Confirmar chegada, com movimento para Confirmados ou Historico se ja estava pago.
- Editar fornecedor.
- Adicionar parcela/valor, editar valor, remover valor da tela por arquivamento logico.
- Registrar pagamento parcial/total e atualizar saldo.
- Atualizar vencimento do boleto.
- Arquivar pedido da tela mantendo historico e auditoria.
- Confirmar chegada via Miauby/n8n apenas com token interno e titulo validado.

### Integracoes

- Home publica usa `/pedidos/api/badge`.
- Gestao recebe contas, itens e pagamentos vinculados.
- Miauby WhatsApp/n8n chama `arrival-summary` e `confirm-arrival` para rotina diaria de chegada; a mensagem usa `pedidos_orders.created_at` para exibir quando o pedido foi registrado e ha quanto tempo esta parado.
- Miauby WhatsApp tambem chama `create-order`, `cancel-candidates` e `cancel-order` para criar, consultar e cancelar pedidos por texto operacional. Esse fluxo nao passa pelo Gemini, nao aceita comando ambiguo sem escolha/confirmacao e nao grava quando fornecedor/valor/permissao estiverem faltando.
- Miauby interno usa os mesmos endpoints tokenizados para `pedidos`, `o que falta chegar` e `cancelar pedido ...`, usando a sessao do usuario logado como responsavel padrao.
- Financeiro/Gestao consomem efeitos dos pagamentos por categoria `Boleto`.
- Widget do Miauby aparece na tela.

### Riscos

- Contagem da home precisa refletir apenas `Aguardando chegada`.
- Parcelas removidas nao podem apagar historico pago/auditado.
- Confirmacao por automacao deve bater fornecedor/titulo com seguranca para evitar confirmar pedido errado.
- Cancelamento por texto nunca deve escolher sozinho quando houver mais de um pedido parecido; a pendencia de escolha deve expirar e a confirmacao final deve ser obrigatoria.
- Pedido ja pago/financeiro vinculado pode ser arquivado/cancelado logicamente, mas pagamentos e historico financeiro nao podem ser apagados.
- Valores e saldos precisam continuar em centavos.
- Mudancas em `gestao_account_items` afetam vencimento e resumo de boletos.

### Proxima acao segura

Manter Pedidos como Postgres puro; validar badge, n8n de chegada, edicao de parcelas e sincronizacao com Gestao antes de qualquer limpeza em tabelas antigas da Gestao.

## Tarefa

### Rota atual

- Rota publica oficial: `/tarefa/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/tarefa/` para `wimifarma-tarefa-app:3500/tarefa/`.
- App oficial: `apps/tarefa`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_tarefa`.
- MySQL `wf_tarefas` fica apenas como referencia historica/backup. Desde 2026-05-30 o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` nem flags `TAREFA_LEGACY_MYSQL_*`.

### Telas e endpoints

- `/tarefa/login.php`: login.
- `/tarefa/` e `/tarefa/index.php`: tela de tarefas por prioridade/status.
- `/tarefa/logout.php`: encerra sessao.
- `/tarefa/health`: health com contagens Postgres.
- `/tarefa/api/badge` e `/tarefa/badge.php`: total de tarefas abertas para home.
- `GET /tarefa/api/internal/summary`: resumo interno de tarefas publicas para Miauby.
- `POST /tarefa/api/internal/tasks`: cria tarefa publica por ponte interna Node/Postgres.
- `POST /tarefa/api/internal/tasks/private`: cria tarefa privada por fluxo interno tokenizado do app Tarefa/Miauby, revalidando usuario ativo/com acesso no app Tarefa, e pode aceitar `remind_at` opcional.
- `GET /tarefa/api/internal/users`: lista usuarios ativos com acesso ao modulo, para resolver destino de comandos do Miauby sem consultar tabela diretamente.
- `GET /tarefa/api/internal/tasks/visible`: lista tarefas abertas que o usuario identificado pode ver, separando tarefa privada do ADM, tarefa propria e tarefa geral; ADM/admin pode pedir visao ampliada.
- `POST /tarefa/api/internal/tasks/status`: altera status para `concluida` ou `cancelada` por comando interno/WhatsApp apos confirmacao, revalidando visibilidade e permissao.
- Desde 2026-06-01, ADM/admin na tela `/tarefa/` pode escolher o usuario que vera a tarefa. Usuarios comuns continuam vendo tarefas publicas e as privadas atribuidas ao proprio `core_users.id`; ADM/admin ve todas.
- Lembretes Miauby ficam em `tarefa_reminders`. O worker do app Tarefa busca lembretes vencidos, chama `POST /miauw/whatsapp/internal/task-reminder`, registra tentativas/resultado em Postgres e grava auditoria. O bridge WhatsApp so envia para contato permitido, vinculado ao usuario e com card `tarefas` liberado. Se o dono da tarefa mudar, lembrete agendado antigo e cancelado ou recriado para o novo dono. Desde 2026-06-03, a tabela tambem separa `kind` (`manual`, `assignment_created`, `assignment_followup`) e `dedupe_key`: tarefa privada criada/atribuida gera aviso inicial, tarefa ainda aberta gera acompanhamento diario no dia seguinte, e lembrete manual dispara no dia/horario escolhido. O worker nao reprocessa tentativa recente em andamento e o bridge bloqueia repeticao pelo mesmo `reminder_id`/`dedupe_key`, para evitar flood no WhatsApp.
- A tela `/tarefa/` deve mostrar usuarios pelo nome exibido em `core_users.display_name` no seletor `Quem vai ver`, com login apenas como fallback. O formulario do lembrete Miauby separa visualmente dia e horario, mas continua gravando/atualizando `tarefa_reminders.remind_at` no backend.

### Permissoes e sessao

- Sessao propria `WFTAREFA`.
- Login oficial somente por `core_users`.
- Rollback por MySQL exige restaurar versao anterior e backup validado.
- Escritas de tela usam CSRF.
- Endpoints internos exigem `TAREFA_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`.
- `tasks/private`, `tasks/visible` e `tasks/status` revalidam `actor_user_id`/usuario de destino no core antes de tocar em tarefa privada.
- O envio de lembrete usa `TAREFA_MIAUW_WHATSAPP_INTERNAL_BASE_URL` e `TAREFA_MIAUW_WHATSAPP_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`; sem token/transporte/contato liberado o lembrete fica registrado como falha, sem quebrar a tarefa.

### Tabelas MySQL envolvidas

Legado historico/backup:

- `wf_tarefas`;
- `wf_users`, apenas como origem historica sincronizada para `core_users`;
- `wf_logs`, apenas historico antigo.

### Tabelas Postgres oficiais

- `tarefa_tasks`;
- `tarefa_reminders`, incluindo tipo do aviso (`kind`) e chave idempotente (`dedupe_key`);
- `tarefa_audit_events`;
- `tarefa_sessions`.

### Arquivos legados/relevantes

- `apps/tarefa/src/server.ts`;
- `apps/tarefa/public/styles.css`;
- `apps/tarefa/public/app.js`;
- `apps/tarefa/public/login-runner.js`;
- `site/tarefa`, legado de referencia/fonte visual com execucao web direta de PHP bloqueada por `.htaccess`.

### Fluxos de escrita

- Criar tarefa normal visivel para todos.
- Criar tarefa publica via Miauby por `POST /tarefa/api/internal/tasks`, com auditoria em Postgres e sem gravar `wf_tarefas`; somente ADM/admin pode criar geral por comando.
- Criar tarefa privada para um usuario especifico pelo modulo Tarefa ou por comando ADM/admin no Miauby; usuario comum cria privada para si por padrao.
- Editar titulo, descricao e prioridade.
- Concluir, reabrir ou cancelar tarefa.
- Concluir/cancelar por Miauby usa `POST /tarefa/api/internal/tasks/status`, exige confirmacao humana, cancela lembrete pendente quando o status deixa de ser `aberta` e grava auditoria.
- Registrar auditoria em Postgres/core sem espelho MySQL.

### Integracoes

- Home publica usa badge de tarefas abertas.
- Usuarios fornece permissoes por modulo e nomes exibidos do core; a criacao de tarefa privada fica no modulo Tarefa.
- Miauby interno e Miauby WhatsApp criam, listam, consultam, concluem e cancelam tarefas por endpoints internos tokenizados do app Tarefa; nao gravam nem consultam `wf_tarefas`. O parser textual aceita data/hora simples para `remind_at` de tarefa privada e guarda uma pendencia de escolha quando consultar/concluir/cancelar encontra varias tarefas parecidas.
- Miauby interno usa a sessao logada como responsavel padrao. Miauby WhatsApp usa o numero vinculado/allowlist e exige card `Tarefas`.
- Core auth centraliza login.

### Riscos

- Tarefa privada nao pode vazar para usuarios sem vinculo.
- Rollback agora depende de restaurar versao anterior e backup, entao validar VPS antes de promover para `main`.
- Badge da home deve continuar contando tarefas abertas corretas.
- Escrita via Miauby precisa preservar autor e auditoria.
- Busca textual para consultar/concluir/cancelar pode achar varias tarefas parecidas; nesse caso o Miauby deve listar opcoes agrupadas por escopo/usuario e nao alterar nada ate a pessoa escolher. Concluir/cancelar ainda exige confirmacao humana depois da escolha.

### Proxima acao segura

Validar no VPS `/tarefa/health`, login, criacao/edicao/status, tarefas privadas, badge da home e Miauby criando/consultando tarefas. Depois repetir o mesmo corte cuidadoso em Codigos ou XP.

## XP

### Rota atual

- Rota publica oficial: `/xp/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/xp/` para `wimifarma-xp-app:3600/xp/`.
- App oficial: `apps/xp`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_xp`.
- MySQL `wf_xp_*` fica apenas como referencia historica/backup. Desde 2026-05-30 o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `XP_AUTH_PROVIDER` nem flags `XP_LEGACY_MYSQL_*`.

### Telas e endpoints

- `/xp/login.php`: login.
- `/xp/` e `/xp/index.php`: trilha, ranking e configuracoes.
- `/xp/logout.php`: encerra sessao.
- `/xp/health`: health com Postgres/core/legado.
- `/xp/internal/migration-status`: status de migracao.
- `/xp/api/me/xp-card`: mini-card do XP do usuario logado para home/Usuarios.

### Permissoes e sessao

- Sessao propria `WFXP`.
- Login oficial somente por `core_users`.
- Rollback por MySQL exige restaurar versao anterior e backup validado.
- Escritas de tela usam CSRF.
- Cadastro/configuracao deve ficar restrito a operadores autorizados.

### Tabelas MySQL envolvidas

Legado/rollback:

- `wf_xp_employees`;
- `wf_xp_sales`;
- `wf_xp_settings`;
- `wf_users`, apenas como origem historica sincronizada para `core_users`;
- `wf_logs`, apenas como historico antigo.

### Tabelas Postgres oficiais

- `xp_employees`;
- `xp_sales`;
- `xp_settings`;
- `xp_audit_events`;
- `xp_sessions`.

### Arquivos legados/relevantes

- `apps/xp/src/server.ts`;
- assets/uploads compartilhados de `site/xp`;
- PHP antigo de XP arquivado em `site/_legacy-disabled/2026-05-29/xp-php/`.

### Fluxos de escrita

- Atualizar perfil/foto ADM.
- Cadastrar funcionario com foto validada.
- Editar/inativar funcionario.
- Lancar venda, calcular XP e gravar observacao.
- Cancelar lancamento de XP.
- Atualizar configuracoes e renderizar trilha/ranking.
- Expor mini-card vinculado por `core_user_xp_links`.

### Integracoes

- Usuarios vincula login a funcionario XP por `core_user_xp_links`.
- Home publica consome `/xp/api/me/xp-card` quando existe sessao vinculada.
- Miauby conhece o contexto de XP para motivacao operacional, sem inventar pontuacao.
- Uploads de foto ficam preservados em caminho compartilhado.

### Riscos

- `system_key='adm'` e foto ADM sao especiais e nao devem ser excluidos sem regra propria.
- XP precisa continuar inteiro e dinheiro em centavos.
- Rollback agora depende de restaurar versao anterior e backup, entao validar VPS antes de seguir para outro corte.
- Mini-card da home depende do vinculo correto usuario -> funcionario.

### Proxima acao segura

Validar no VPS `/xp/health`, login, ranking, lancamentos, fotos, mini-card da home e vinculos em Usuarios. Depois seguir para Financeiro/Miauby sem reintroduzir MySQL no XP.

## Codigos

### Rota atual

- Rota publica oficial: `/codigos/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/codigos/` para `wimifarma-codigos-app:3700/codigos/`.
- App oficial: `apps/codigos`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres `wimifarma_codigos`.
- MySQL `wf_codigos_*` fica apenas como referencia historica/backup. Desde 2026-05-30 o app nao possui `mysql2`, importador, espelho, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` nem flags `CODIGOS_LEGACY_MYSQL_*`.

### Telas e endpoints

- `/codigos/login.php`: login.
- `/codigos/` e `/codigos/index.php`: tela de codigos de comissao e blocos EAN.
- `/codigos/logout.php`: encerra sessao.
- `/codigos/health`: health com Postgres/core/legado.
- `/codigos/api/internal/summary`: resumo interno tokenizado.
- `/codigos/api/internal/search`: busca interna tokenizada para Miauby.
- `/codigos/internal/migration-status`: status/health de compatibilidade.
- `/codigos/api.php`: compatibilidade de post do frontend.

### Permissoes e sessao

- Sessao propria `WFCODIGOS`.
- Login oficial somente por `core_users`.
- Rollback por MySQL exige restaurar versao anterior e backup validado.
- Escritas de tela usam CSRF.
- Endpoints internos exigem token por `X-Codigos-Internal-Token` ou `X-Miauw-Internal-Token`.

### Tabelas MySQL envolvidas

Legado/rollback:

- `wf_codigos_comissao`;
- `wf_codigos_blocos`;
- `wf_users`, apenas como origem historica sincronizada para `core_users`;
- `wf_logs`, apenas historico antigo.

### Tabelas Postgres oficiais

- `codigos_groups`;
- `codigos_items`;
- `codigos_audit_events`;
- `codigos_sessions`.

### Arquivos legados/relevantes

- `apps/codigos/src/server.ts`;
- `site/codigos/styles.css`;
- `site/codigos/app.js`;
- `site/codigos/login-runner.js`;
- PHP antigo de Codigos arquivado em `site/_legacy-disabled/2026-05-29/codigos-php/`.

### Fluxos de escrita

- Criar bloco/grupo.
- Criar, editar, apagar logicamente e reordenar codigo.
- Apagar bloco e seus codigos por soft delete.
- Auditoria oficial em `codigos_audit_events`.

### Integracoes

- Miauby interno consulta resumo/busca por endpoint interno tokenizado.
- Core auth centraliza login.
- Home publica aponta `Codigos` para `/codigos/`.

### Riscos

- Busca do Miauby deve usar Postgres oficial; se endpoint/token falhar, responder indisponibilidade em vez de cair no MySQL legado.
- Reordenacao e exclusao de bloco precisam preservar dados para auditoria.
- EAN/codigo/preco nao podem ser truncados visualmente nem no banco.
- Rollback agora depende de restaurar versao anterior e backup, entao validar VPS antes de seguir para outro corte.

### Proxima acao segura

Validar no VPS `/codigos/health`, login, leitura do Miauby via token, busca e reordenacao. Depois repetir o mesmo corte cuidadoso em XP.

## Usuarios

### Rota atual

- Rota publica oficial: `/usuarios/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/usuarios/` para `wimifarma-usuarios-app:3900/usuarios/`.
- App oficial: `apps/usuarios`, Node.js 22 + TypeScript + Express.
- Fonte oficial: Postgres core `wimifarma_core`.
- Consulta Postgres `wimifarma_xp` para vinculo e mini-card de XP.

### Telas e endpoints

- `/usuarios/login.php`: login admin.
- `/usuarios/` e `/usuarios/index.php`: painel de usuarios, permissoes, XP, allowlist WhatsApp e auditoria.
- Bloco `Senha ADM`: mostra/copiar senha definida no painel quando houver registro cifrado; senhas antigas por hash exigem redefinicao.
- Desde 2026-06-02, o card expandido de edicao usa painel visual compacto: perfil/senha/XP alinhados sem esticar selects, status `Ativo` ao lado do cofre ADM, modulos em grade mais densa e acao `Desativar usuario` como botao secundario vermelho. Essa mudanca e apenas frontend e nao altera permissoes, CSRF, sessao, senha ou auditoria.
- `/usuarios/logout.php`: encerra sessao.
- `/usuarios/health`: health do core e alcance do XP.
- `/usuarios/api/me/xp-card`: mini-card XP do usuario logado.

### Permissoes e sessao

- Sessao propria do app Usuarios.
- Login restrito a username `adm` ou role `admin`.
- Escritas usam CSRF.
- Novos usuarios recebem `legacy_mysql_id` negativo para nao conflitar com ids importados de `wf_users`.
- No cadastro, o backend aceita nome com espaco/acento e normaliza para login seguro (`Joao Silva` -> `joao.silva`) antes de gravar `core_users.username` e `username_normalized`.
- Permissoes por modulo ficam em `core_user_module_permissions`.
- Senhas criadas/trocadas pelo ADM ficam cifradas em `core_user_admin_passwords`; o login continua usando o hash em `core_users`.

### Tabelas MySQL envolvidas

- Nenhum MySQL operacional para usuarios novos.
- `core_users.source='mysql:wf_users'` indica origem historica de usuario importado, nao dependencia runtime.

### Tabelas Postgres oficiais

- `core_users`;
- `core_audit_logs`;
- `core_login_rate_limits`;
- `core_user_module_permissions`;
- `core_user_xp_links`;
- `core_user_admin_passwords`;
- `core_user_audit_events`;
- `core_user_whatsapp_links`;
- tabela de sessao criada pelo store do Express.

### Arquivos legados/relevantes

- `apps/usuarios/src/server.ts`;
- `apps/usuarios/public/styles.css`;
- `apps/usuarios/public/login-runner.js`;
- `apps/usuarios/public/assets/gato-hapy.gif`.

### Fluxos de escrita

- Criar usuario core.
- Alterar role, senha, status e permissoes por modulo.
- Desativar usuario.
- Vincular/desvincular funcionario XP.
- Vincular/desvincular numeros do Miauby WhatsApp por ponte interna, sem gravar telefone cru no core.
- Registrar auditoria central de alteracoes.

### Integracoes

- XP por `xp_employees` e `xp_sales`.
- Miauby WhatsApp por `/miauw/whatsapp/internal/allowlist/link-user` e unlink.
- Home publica e modulos podem usar permissoes por modulo em etapa futura.

### Riscos

- Permissao por modulo ainda precisa ser aplicada gradualmente em cada app; nao bloquear todos de uma vez.
- Usuario admin/adm nao deve ficar sem acesso a Usuarios.
- Telefones precisam continuar mascarados/hash no core.
- Tarefas privadas precisam filtrar por usuario no modulo Tarefa.

### Proxima acao segura

Validar login admin, criacao/desativacao, vinculo XP e allowlist; tarefas privadas devem ser validadas no modulo Tarefa. Depois aplicar enforcement de `core_user_module_permissions` modulo por modulo.

## Cotacao

### Rota atual

- Rota publica oficial: `/cotacao/`.
- Proxy Apache: `docker/php/Dockerfile` envia `/cotacao/` para `wimifarma-cotacao-app:3000/cotacao/`.
- App oficial: `apps/cotacao`, Node.js 22 + Express + Socket.IO, com tooling TypeScript, contratos estaticos em `apps/cotacao/src/contracts/` e helpers TS sombra em `apps/cotacao/src/utils/`.
- Fonte oficial: Postgres `wimifarma_cotacao` e Redis `wimifarma-cotacao-redis`.
- Nao ha dependencia MySQL no app; a migracao futura e para TypeScript, nao para trocar banco.

### Telas e endpoints

- `/cotacao/login.php`: login.
- `/cotacao/` e `/cotacao/index.php`: planilha colaborativa.
- `/cotacao/logout.php`: encerra sessao.
- `/cotacao/health`: health com Postgres, Redis e auth.
- `/cotacao/api/bootstrap`: carga inicial da planilha.
- `/cotacao/api/events`: delta de eventos.
- `/cotacao/api/cells/:rowId/:columnKey/history`: historico de celula.
- APIs de linhas, colunas, estilos, regras, Google Sheets, backups e diagnosticos.
- `GET /cotacao/api/internal/summary`: resumo interno da Cotacao V2 para Miauby/guardiao.
- `GET /cotacao/api/internal/search`: busca interna tokenizada para Miauby.
- `POST /cotacao/api/internal/encomendas`: criacao interna tokenizada de encomenda/urgencia.
- `POST /cotacao/api/internal/urgentes`: criacao interna tokenizada de item urgente.
- `POST /cotacao/api/internal/cotacoes-rapidas`: criacao interna tokenizada de cotacao rapida, criando distribuidora V2 quando necessario.
- Socket.IO em `/cotacao/socket.io`.
- O app da Cotacao tambem agenda e envia lembretes de encomenda para `/miauw/whatsapp/internal/cotacao-encomenda-reminder` quando uma linha contem `encomenda`, sem alterar a planilha. Erro sem destinatario configurado encerra o lembrete como erro final; transporte indisponivel ou pausado reagenda por `next_attempt_at` com atraso conservador.

### Permissoes e sessao

- Sessao em Redis com prefixo `cotacao:sess:`.
- Login oficial por `core_users`, sem fallback MySQL.
- Escritas HTTP usam CSRF.
- Socket.IO usa sessao/autenticacao do app.
- Endpoints internos exigem token por `X-Miauw-Internal-Token` ou `X-Internal-Token`.

### Tabelas MySQL envolvidas

- Nenhuma dependencia MySQL runtime no app.
- `cotacao_*` antigos no MySQL devem ser tratados como historico da Cotacao PHP antiga, nao fonte oficial.

### Tabelas Postgres oficiais

- `cotacao_v2_quotes`;
- `cotacao_v2_columns`;
- `cotacao_v2_rows`;
- `cotacao_v2_events`;
- `cotacao_v2_rules`;
- `cotacao_v2_styles`;
- `cotacao_v2_column_audit`;
- `cotacao_v2_encomenda_reminders`.

### Arquivos legados/relevantes

- `apps/cotacao/src/server.js`;
- `apps/cotacao/src/contracts/`;
- `apps/cotacao/src/utils/`;
- `apps/cotacao/public/app.js`;
- `apps/cotacao/public/styles.css`;
- `apps/cotacao/public/assets`;
- Cotacao PHP antiga foi removida/arquivada; nao reintroduzir.

### Fluxos de escrita

- Editar celula com eventos e historico.
- Adicionar/inserir/remover linhas.
- Criar, renomear, mover, remover/restaurar e redimensionar colunas.
- Aplicar/remover estilos unitarios ou em lote.
- Repetir a ultima acao segura com `F4` apenas na tela da planilha: valor nao vazio, colagem sem celulas vazias, aplicar cor e limpar cor; a compatibilidade e revalidada contra a selecao atual.
- Criar/editar/remover regras.
- Importar/exportar Google Sheets.
- Criar/restaurar backups.
- Criar encomenda por endpoint interno do Miauby.
- Criar urgente e cotacao rapida por endpoints internos do Miauby, sempre em `cotacao_v2_*`.
- Atualizar presenca em tempo real via Redis/Socket.IO.

### Integracoes

- Core auth em `wimifarma_core`.
- Redis para sessao, presenca e Socket.IO.
- Google Sheets por credenciais de ambiente.
- Miauby consulta busca/encomendas por endpoint interno tokenizado.
- Widget do Miauby e efeitos visuais locais.

### Riscos

- Concorrencia em tempo real e historico de eventos exigem cuidado com ordem e delta.
- Undo/redo e estilos em lote precisam manter paridade com comportamento de planilha.
- O atalho `F4` nao deve registrar acoes destrutivas/definitivas nem executar quando a selecao atual for incompativel.
- Google Sheets pode falhar por token/cota; nao pode travar a planilha local.
- Migrar para TypeScript deve ser incremental para nao quebrar Socket.IO.
- Criacao de planilha/bloco antigo pelo Miauby fica bloqueada ate existir endpoint moderno equivalente; nao reintroduzir `cotacao_blocos`.

### Proxima acao segura

Manter Postgres/Redis como fonte oficial e seguir migracao JS -> TypeScript por bordas: contratos de payload e primeiros helpers sombra ja existem; proximo passo seguro e extrair mais helpers pequenos do backend, depois handlers de escrita e Socket.IO.

## Miauby interno (legado tecnico `miauw`)

### Rota atual

- Nome de produto/canonico: Miauby.
- Prefixo tecnico legado ainda ativo: `miauw`.
- Rota publica interna atual: `/miauw/`, servida por PHP em `site/miauw`.
- Futuro alias/canonico planejado: `/miauby/`, mantendo `/miauw/` como compatibilidade ate corte completo.
- Agente Node em sombra/corte controlado: `/miauw/agent/`, proxy para `wimifarma-miauw-agent:3100/miauw/agent/`.
- Bridge WhatsApp separado: `/miauw/whatsapp/`, proxy para `apps/miauw-whatsapp`. Ele nao substitui o Miauby interno, mas consome contexto e acoes dele.
- Fonte principal do Miauby interno ainda e MySQL `wimifarma_app` para conversas, treino, memorias, alertas e traces.
- Fase sombra: `apps/miauby`, `wimifarma-miauby-db`, `wimifarma-miauby-migrator` e `wimifarma-miauby-app` copiam `miauw_*` para `miauby_*` em Postgres com payload sanitizado e comparam paridade por API interna somente leitura, sem alterar `/miauw/`.
- Memoria curta multicanal tem ponte principal no Postgres do bridge WhatsApp; `miauw_channel_events` em MySQL fica como fallback.

### Telas e endpoints

- `/miauw/login.php`: login interno.
- `/miauw/`: chat principal.
- `/miauw/api.php`: API do chat e acoes do frontend.
- `/miauw/treino.php`: revisao de treino/respostas.
- `/miauw/diagnostico.php`: diagnostico, memorias, padroes, traces e status.
- `/miauw/widget-status.php`: status publico controlado do widget.
- `/miauw/widget-alerts.php`: alertas do widget.
- `/miauw/widget-auth.php`: estado de auth do widget.
- `/miauw/agent-context.php`: contexto para Node/WhatsApp, protegido por token interno.
- `/miauw/agent-tools.php`: ponte de tools para o Node, protegida por token interno.
- `/miauw/agent-actions.php`: prepara/executa acoes fortes para WhatsApp depois de confirmacao, protegida por token interno.
- `/miauw/agent-memory.php`: ponte de memoria de compatibilidade.
- `/miauw/miauw-evals.php`: eval local do Miauby.
- `/miauw/farmacia-popular-cron.php` e `/miauw/guardian-cron.php`: rotinas internas.
- `/miauw/agent/health` e `/miauby/health`: resumo publico minimo do agente Node. `/miauw/agent/status`, `/run` e `/stream`: endpoints internos detalhados/controlados que exigem token interno.
- `wimifarma-miauby-app:4100/miauby/health`: health interno do Postgres sombra do Miauby, sem segredo.
- `wimifarma-miauby-app:4100/miauby/api/internal/status`: status interno tokenizado das tabelas `miauby_*`.
- `wimifarma-miauby-app:4100/miauby/api/internal/parity?sample=5`: paridade interna tokenizada de contagens e checksums contra `miauw_*`, sem retornar payload bruto.
- `wimifarma-miauby-app:4100/miauby/api/internal/readiness?sample=20`: resumo tokenizado de health/paridade para pos-deploy, sem proxy publico.
- `wimifarma-miauby-app:4100/miauby/api/internal/context?limit=3`: amostras tokenizadas e sanitizadas de treino, memoria, conhecimento, alertas, padroes, traces e configuracoes, sem `payload_sanitized` bruto.
- `wimifarma-miauby-app:4100/miauby/api/internal/cutover`: inventario interno tokenizado do corte PHP -> Node/Postgres, com fluxos, bloqueios, sequencia segura e rollback; somente leitura, sem habilitar rota publica nem escrita.

### Permissoes e sessao

- Login PHP interno usa `core_users` por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`.
- Rollback MySQL fica opt-in por `WIMIFARMA_INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED=true`.
- Chat exige usuario interno autenticado.
- `/miauw/diagnostico.php` e `/miauw/treino.php` exigem username `adm`, role `admin` ou role `gerente`.
- `api.php` exige sessao e CSRF para escrita/interacao do operador.
- Ponte Node/WhatsApp exige tokens internos (`MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`).
- Acoes fortes usam pendencia/confirmacao antes de escrever.

### Tabelas MySQL envolvidas

Fonte atual do Miauby interno:

- `miauw_conversas`;
- `miauw_mensagens`;
- `miauw_conhecimentos`;
- `miauw_memorias`;
- `miauw_configuracoes`;
- `miauw_channel_events` como fallback;
- `miauw_farmacia_popular_valores`;
- `miauw_farmacia_popular_atualizacoes`;
- `miauw_tool_traces`;
- `miauw_treinos_respostas`;
- `miauw_alertas`;
- `miauw_padroes`;
- `miauw_alerta_eventos`;
- `wf_logs`, para registros curtos de revisao/treino e compatibilidade do Miauby legado, nao para tools modernas de modulos.

### Tabelas Postgres relacionadas

- `core_users` e `core_login_rate_limits` no `wimifarma_core` para login.
- `miauw_whatsapp_channel_events` no Postgres do bridge WhatsApp para memoria curta multicanal principal.
- Tabelas dos modulos modernos acessadas indiretamente por endpoints internos, como `financeiro_*`, `cashback_*`, `codigos_*`, `cotacao_v2_*`, `gestao_*`, `tarefa_*`. O Miauby nao deve ler/gravar diretamente `wf_tarefas`, `wf_compras`, `wf_clientes`, `wf_codigos_comissao`, `financeiro_*` legado MySQL ou `cotacao_*` antigo; quando endpoint/token moderno falhar, deve responder indisponibilidade em vez de cair no legado.
- Existe banco dedicado `wimifarma_miauby` em modo sombra, ainda sem ser fonte oficial do Miauby interno.
- Durante a migracao, manter as tabelas canonicas `miauby_*` preenchidas pelo migrador e, se necessario, criar views/aliases de compatibilidade somente depois de validacao.

### Arquivos PHP relevantes

- `site/miauw/bootstrap.php`;
- `site/miauw/index.php`;
- `site/miauw/api.php`;
- `site/miauw/login.php`;
- `site/miauw/logout.php`;
- `site/miauw/treino.php`;
- `site/miauw/diagnostico.php`;
- `site/miauw/miauw-funcoes.php`;
- `site/miauw/miauw-skills.php`;
- `site/miauw/miauw-intelligence.php`;
- `site/miauw/miauw-personality.php`;
- `site/miauw/miauw-diagnostics.php`;
- `site/miauw/miauw-farmacia-popular.php`;
- `site/miauw/miauw-system-map.php`;
- `site/miauw/miauw-web-research.php`;
- `site/miauw/agent-context.php`;
- `site/miauw/agent-tools.php`;
- `site/miauw/agent-actions.php`;
- `site/miauw/agent-memory.php`;
- `site/miauw/widget*.php`, `widget.js`, `widget.css`;
- `apps/miauw-agent/src/server.ts`.
- `apps/miauby/src/shadow-migrate.ts`.
- `apps/miauby/src/server.ts`.

### Fluxos de escrita

- `api.php?action=send`: grava mensagem do usuario, gera resposta, grava resposta, trace e memoria.
- `api.php?action=audio_transcribe`: recebe audio temporario, transcreve e retorna texto para revisao; nao deve persistir bytes.
- `api.php?action=train_feedback`: cria sugestao de treino a partir do chat.
- `api.php?action=clear_conversation`: arquiva/limpa conversa do usuario.
- `treino.php`: aprova, rejeita ou ajusta exemplos em `miauw_treinos_respostas`.
- `diagnostico.php`: revisa memoria/padrao, registra status e logs.
- `miauw_intelligence_*`: cria/atualiza alertas, padroes e eventos.
- `miauw_trace_record`: registra traces em `miauw_tool_traces`.
- `miauw_memory_store`: grava memorias aprovaveis/sanitizadas.
- `agent-actions.php`: prepara e executa acoes fortes para WhatsApp depois de pendencia confirmada.
- Tools podem criar tarefa, conta de Gestao, encomenda/urgencia/cotacao, lancamento financeiro ou faturamento, sempre passando por regra de confirmacao quando risco exige.
- `farmacia-popular-cron.php`: atualiza valores e historico de Farmacia Popular.

### Integracoes

- OpenAI/Responses API, transcricao e TTS por configuracao `MIAUW_*`.
- `apps/miauw-agent` como motor Node em sombra/corte controlado.
- Miauby WhatsApp consome `agent-context.php`, `agent-actions.php` e `agent-memory.php`.
- Financeiro moderno por endpoints internos tokenizados, incluindo guardiao financeiro.
- Cashback moderno por endpoints internos de resumo e busca de cliente.
- Codigos moderno por endpoints internos tokenizados.
- Cotacao V2 por endpoints internos tokenizados para resumo, busca, encomenda, urgente e cotacao rapida.
- Gestao, Pedidos e Tarefa por tools/bridges controlados; tarefas publicas e privadas usam `tarefa_tasks` no Postgres.
- Widget global carregado na home/modulos.
- Farmacia Popular por rotina dedicada.

### Riscos

- Ainda ha muita regra em PHP procedural e MySQL; migrar tudo de uma vez e alto risco.
- `miauw-skills.php` mistura leitura, parse de intent e escrita; separar por dominio antes de cortar para Node.
- Treino/persona/memoria influenciam respostas; migracao precisa preservar voz e guardrails.
- Acoes fortes precisam manter confirmacao humana e auditoria.
- Traces e diagnosticos nao podem gravar token, SQL bruto, payload completo, telefone cru, audio ou midia.
- O widget depende de caminhos PHP atuais; trocar rota sem compatibilidade quebra varios modulos.
- O Node agent ainda orquestra via PHP bridge; nao deve ganhar escrita direta sem contrato, token e auditoria.
- Renomear `miauw` para `miauby` direto em arquivos, env vars, tabelas ou rotas quebraria dependencias; fazer por alias e fallback.

### Proxima acao segura

Continuar `wimifarma_miauby`/`apps/miauby` em fases: o schema Postgres, o migrador idempotente, a API interna somente leitura de paridade e o inventario de corte ja existem em sombra; depois validar `/miauby/api/internal/cutover` no VPS, expor leituras canonicas de contexto/persona/tool contracts ao engine em sombra; depois chat em sombra para `adm`; por ultimo corte de escrita, mantendo PHP como fallback ate paridade de voz, tools e diagnostico.

## Status dos inventarios e proxima rodada

Inventarios detalhados ja registrados neste documento:

- Financeiro;
- Cashback;
- Gestao;
- Pedidos;
- Tarefa;
- XP;
- Codigos;
- Usuarios;
- Cotacao;
- Miauby interno.

Proxima rodada segura:

1. Validar no VPS Financeiro sem `mysql2`/fallback/espelho, incluindo health, login, Caixa, Relatorio, CSV, endpoints internos e Pix CNPJ.
2. Iniciar a trilha do Miauby interno em `docs/28-miauby-migracao.md`, sem quebrar `/miauw/`.
3. Inventariar WordPress/Home somente quando a decisao for remover MySQL 100% do site publico.
