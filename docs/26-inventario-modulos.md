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
- Login oficial por `core_users` quando `FINANCEIRO_AUTH_PROVIDER=core`.
- Rollback de login por MySQL existe apenas com `FINANCEIRO_AUTH_PROVIDER=mysql`.
- Rotas operacionais exigem usuario autenticado.
- Escritas de tela usam CSRF.
- Endpoints internos exigem `FINANCEIRO_INTERNAL_TOKEN`, `MIAUW_GUARDIAN_TOKEN`, `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_WHATSAPP_INTERNAL_TOKEN`, conforme ambiente.

### Tabelas MySQL envolvidas

MySQL e legado/rollback temporario, nao a fonte principal:

- `financeiro_fechamentos`;
- `financeiro_lancamentos`;
- `financeiro_sangrias`;
- `financeiro_maquininhas`;
- `financeiro_pix`;
- `financeiro_configuracoes`;
- `financeiro_auditoria`;
- `wf_users`, somente se rollback de auth for ligado;
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

- `site/financeiro/index.php`;
- `site/financeiro/login.php`;
- `site/financeiro/logout.php`;
- `site/financeiro/exportar.php`;
- `site/financeiro/bootstrap.php`;
- `site/financeiro/financeiro-funcoes.php`;
- `site/financeiro/app.js`;
- `site/financeiro/styles.css`;
- `site/financeiro/login-runner.js`.

Hoje estes arquivos PHP sao legado/fonte visual. A rota oficial passa pelo Node.

### Fluxos de escrita

- `save_day`: autosave do fechamento diario, responsavel e totais.
- `close_day`: fecha o dia como `fechado` ou `divergente`, conforme limite.
- `save_report_faturamento` e `save_report_faturamento_auto`: salva faturamento diario do relatorio.
- `save_sangria`: cria lancamento de sangria.
- `save_maquininha`: cria lancamento de maquininha/cartao/Pix de maquininha.
- `save_pix`: cria lancamento Pix.
- `cancel_lancamento`, `cancel_sangria`, `cancel_maquininha`, `cancel_pix`: cancelamentos logicos.
- `POST /api/internal/lancamentos`: escrita interna usada por Miauby/WhatsApp para `Pix CNPJ`, sangria e lancamentos controlados.
- `POST /api/internal/faturamentos`: escrita interna para faturamento diario.
- Importacao e espelho MySQL sao controlados por `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED` e `FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED`.

### Integracoes

- Core auth em `wimifarma_core`.
- Miauby interno usa endpoints internos para consultar/gravar financeiro.
- Miauby WhatsApp usa `cash-closing-status`, `lancamentos` e `faturamentos`.
- n8n chama o bridge WhatsApp para lembrete de fechamento de caixa as 18h; o bridge consulta o Financeiro.
- Exportacao CSV por `/financeiro/exportar.php`.

### Riscos

- Dinheiro precisa continuar em centavos inteiros no backend.
- Espelho MySQL pode divergir se ficar ligado por muito tempo.
- Fechamento, divergencia e `sem_movimento` afetam automacoes do WhatsApp.
- Endpoints internos de escrita precisam continuar tokenizados e idempotentes.
- Nao reativar tela antiga de auditoria para operador sem necessidade; auditoria deve continuar no banco.

### Proxima acao segura

Validar no VPS por dia/amostra: contagens, somatorios, fechamento, relatorio, exportacao, Pix CNPJ via Miauby e auditoria. Depois disso, desligar espelho MySQL em janela controlada.

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
  - `GET /cashback/api/internal/summary`.

### Permissoes e sessao

- Sessao propria `WFCASHBACK`.
- Login oficial por `core_users` quando `CASHBACK_AUTH_PROVIDER=core`.
- Rollback por MySQL existe com `CASHBACK_AUTH_PROVIDER=mysql`.
- Rotas operacionais exigem usuario autenticado.
- Escritas usam CSRF.
- Areas sensiveis como relatorio, exportacao e diagnostico usam senha operacional alem da sessao.
- Limitador de login usa `core_login_rate_limits` quando a auth e core.

### Tabelas MySQL envolvidas

MySQL e legado/importacao/espelho temporario:

- `wf_atendentes`;
- `wf_clientes`;
- `wf_compras`;
- `wf_cashback_creditos`;
- `wf_resgates`;
- `wf_resgate_itens`;
- `wf_settings`;
- `wf_whatsapp_mensagens`;
- `wf_logs`;
- `wf_users`, somente para rollback de auth.

### Tabelas Postgres oficiais

- `cashback_attendants`;
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

- `site/cashback/config.php`;
- `site/cashback/functions.php`;
- `site/cashback/auth.php`;
- `site/cashback/index.php`;
- `site/cashback/login.php`;
- `site/cashback/logout.php`;
- `site/cashback/dashboard.php`;
- `site/cashback/clientes.php`;
- `site/cashback/cliente-detalhe.php`;
- `site/cashback/compras.php`;
- `site/cashback/resgates.php`;
- `site/cashback/mensagens.php`;
- `site/cashback/relatorio.php`;
- `site/cashback/exportar.php`;
- `site/cashback/api-clientes.php`;
- `site/cashback/api-whatsapp-status.php`;
- `site/cashback/autoteste.php`;
- `site/cashback/diagnostico.php`;
- `site/cashback/styles.css`;
- `site/cashback/app.js`;
- `site/cashback/login-runner.js`.

Hoje estes arquivos PHP sao legado/fonte visual/fallback historico. A rota oficial passa pelo Node.

### Fluxos de escrita

- Criar/editar/inativar/excluir cliente.
- Criar compra, calcular cashback gerado e criar credito.
- Criar resgate, consumir creditos e gravar itens do resgate.
- Atualizar status de mensagens (`aberta`, `copiada`, `enviada`, `cancelada`).
- Criar/editar/inativar/excluir atendente.
- Atualizar configuracoes (`cashback_percent`, validade, manutencao e afins).
- Autoteste cria dados dentro de transacao controlada.
- Auditoria oficial em `cashback_audit_events`; espelho curto em `wf_logs` se `CASHBACK_LEGACY_MYSQL_LOGS_ENABLED=true`.
- Importacao/espelho MySQL por `CASHBACK_LEGACY_MYSQL_IMPORT_ENABLED`, `CASHBACK_LEGACY_MYSQL_MIRROR_ENABLED` e `CASHBACK_LEGACY_MYSQL_LOGS_ENABLED`.

### Integracoes

- Core auth em `wimifarma_core`.
- Home publica aponta o card `Cashback` para `/cashback/`.
- Miauby interno pode consultar resumo/status por endpoint interno tokenizado.
- Mensagens de WhatsApp do Cashback ainda sao operacionais/manuais dentro do modulo, nao o bridge Miauby WhatsApp.
- Relatorios/exportacao CSV.

### Riscos

- Compra, credito e resgate precisam ser transacionais para nao gerar saldo errado.
- Excluir fisicamente cliente/atendente e mais arriscado que inativar; validar se ainda precisa existir na UI.
- Espelho MySQL prolongado aumenta chance de divergencia.
- Telefone de cliente e mensagem WhatsApp sao dados sensiveis; nao expor em logs.
- Mudancas em percentual/validade alteram regra de negocio historica.

### Proxima acao segura

Validar `/cashback/health`, login, importacao, saldos por cliente, compra -> credito, resgate -> baixa, mensagens, CSV e autoteste no VPS. Depois, desligar espelho MySQL em janela pequena.

## Miauw interno

### Rota atual

- Rota publica interna: `/miauw/`, servida por PHP em `site/miauw`.
- Agente Node em sombra/corte controlado: `/miauw/agent/`, proxy para `wimifarma-miauw-agent:3100/miauw/agent/`.
- Bridge WhatsApp separado: `/miauw/whatsapp/`, proxy para `apps/miauw-whatsapp`. Ele nao substitui o Miauw interno, mas consome contexto e acoes dele.
- Fonte principal do Miauw interno ainda e MySQL `wimifarma_app` para conversas, treino, memorias, alertas e traces.
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
- `/miauw/agent/health`, `/status`, `/run`, `/stream`: endpoints do agente Node; `run` e `stream` exigem token interno.

### Permissoes e sessao

- Login PHP interno usa `core_users` por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`.
- Rollback MySQL fica opt-in por `WIMIFARMA_INTERNAL_AUTH_MYSQL_FALLBACK_ENABLED=true`.
- Chat exige usuario interno autenticado.
- `/miauw/diagnostico.php` e `/miauw/treino.php` exigem username `adm`, role `admin` ou role `gerente`.
- `api.php` exige sessao e CSRF para escrita/interacao do operador.
- Ponte Node/WhatsApp exige tokens internos (`MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`).
- Acoes fortes usam pendencia/confirmacao antes de escrever.

### Tabelas MySQL envolvidas

Fonte atual do Miauw interno:

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
- `wf_logs`, para registros curtos de revisao/treino e compatibilidade;
- `wf_tarefas`, ainda pode aparecer por tool/legado de tarefa quando fallback antigo estiver ativo.

### Tabelas Postgres relacionadas

- `core_users` e `core_login_rate_limits` no `wimifarma_core` para login.
- `miauw_whatsapp_channel_events` no Postgres do bridge WhatsApp para memoria curta multicanal principal.
- Tabelas dos modulos modernos acessados por endpoints internos, como `financeiro_*`, `cashback_*`, `codigos_*`, `cotacao_v2_*`, `gestao_*`, `tarefa_*`.
- Ainda nao existe banco dedicado `wimifarma_miauw` como fonte oficial do Miauw interno.

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
- Financeiro moderno por endpoints internos tokenizados.
- Cashback moderno por endpoint interno de resumo.
- Codigos moderno por endpoints internos tokenizados.
- Cotacao V2 por endpoints internos tokenizados.
- Gestao, Pedidos e Tarefa por tools/bridges controlados.
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

### Proxima acao segura

Criar `wimifarma_miauw`/`apps/miauw` em fases: primeiro schema Postgres e migrador idempotente de conversas, mensagens, treinos, memorias, alertas e traces; depois APIs de leitura; depois chat em sombra para `adm`; por ultimo corte de escrita, mantendo PHP como fallback ate paridade de voz, tools e diagnostico.

## Ordem recomendada para proximos inventarios

1. Gestao e Pedidos, por terem acoplamento financeiro e regras de boleto.
2. Tarefa, XP e Codigos, para documentar desligamento final dos espelhos MySQL.
3. Usuarios, para amarrar permissoes por modulo.
4. Cotacao, para registrar Google Sheets, tempo real e risco de sync.
5. WordPress/Home, se a meta virar remover MySQL por completo.
