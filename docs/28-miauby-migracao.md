# 28 - Migracao do Miauby e padronizacao de nome

## Objetivo

Este documento inicia a migracao completa do Miauby interno para Node.js, TypeScript e PostgreSQL, sem quebrar o que ja esta em operacao.

O nome de produto e interface deve ser `Miauby`. O prefixo tecnico `miauw` existe por historico em rotas, arquivos, tabelas, env vars e containers. Ele nao deve ser renomeado em massa. A troca precisa ser feita por compatibilidade: primeiro aliases, depois corte controlado, depois limpeza.

## Decisao de arquitetura

O alvo nao e um unico banco gigante e misturado. O alvo e uma plataforma unica de PostgreSQL para os cards se conversarem:

- `wimifarma_core` guarda usuarios, permissoes, vinculos, rate limit e auditoria central.
- Bancos/schemas de dominio continuam separados para reduzir dano em caso de bug: Cashback, Financeiro, Gestao/Pedidos, Tarefa, XP, Codigos, Cotacao e Miauby.
- Os modulos conversam por ids do core, endpoints internos tokenizados e eventos/auditoria, nao por leitura livre de tabela alheia.
- O futuro banco do Miauby interno deve ser `wimifarma_miauby`, com tabelas canonicas `miauby_*`.

Essa decisao atende o objetivo operacional de "um banco melhor para todos conversarem" sem transformar tudo em uma unica base acoplada e dificil de recuperar.

## Estado atual

### Miauby interno

- Rota canonica iniciada: `/miauby/`, com redirect seguro para `/miauw/` durante a transicao.
- Rota legada ainda obrigatoria: `/miauw/`.
- Arquivos atuais: `site/miauw`.
- Motor principal: PHP procedural.
- Auth: `core_users` por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`.
- Dados principais: MySQL `wimifarma_app`, tabelas `miauw_*`.
- Postgres sombra: `wimifarma_miauby`, criado por `wimifarma-miauby-db`, com migrador idempotente em `apps/miauby`.
- Node agent: `apps/miauw-agent`, publicado em `/miauw/agent/` e `/miauby/agent/`, ainda depende de ponte PHP para tools e contexto.
- Integracao com Gestao: ja usa endpoint interno tokenizado do app Node/Postgres; a tool `criar_conta_gestao` nao deve depender de `wf_logs` nem de tabela MySQL de Gestao.
- Escritas fortes: continuam com confirmacao humana e auditoria.
- Responsavel de acao: o PHP resolveu um helper central para identificar o operador por sessao logada, depois por `user_context` do WhatsApp vinculado, depois por nome manual. No Miauby interno, comandos usam automaticamente o usuario logado da sessao como responsavel padrao (`core_users.id`, `username`, `display_name`) e nao exigem que a pessoa informe o proprio nome; usuario comum nao pode registrar acao em nome de outro sem permissao validada. No WhatsApp, o responsavel vem do numero vinculado/allowlist. Financeiro/sangria usam o nome identificado pela sessao ou allowlist como responsavel visivel e gravam `usuario_id`/`actor_user_id`; se nada identificar, a acao continua pedindo confirmacao/dado em vez de gravar anonimo.

### Miauby WhatsApp

- Rota canonica iniciada: `/miauby/whatsapp/`.
- Rota legada ainda obrigatoria: `/miauw/whatsapp/`.
- App atual: `apps/miauw-whatsapp`.
- Stack atual: Node.js 22 + TypeScript + Postgres.
- Banco atual: `wimifarma_miauw_whatsapp`.
- Papel: transporte/bridge, fila, allowlist, outbox, n8n e memoria multicanal. Nao substitui sozinho o Miauby interno.
- Quando um numero esta vinculado a `core_users`, o bridge envia ao Miauby interno `id`, `username`, `display_name`, origem `whatsapp_link`, hash e mascara. O telefone cru continua cifrado apenas no bridge.

## Corte de tools legadas em 2026-05-30

O Miauby interno ainda roda em PHP, mas as tools de dominio foram isoladas dos fallbacks antigos que podiam ler ou gravar fora da fonte oficial moderna.

### O que mudou

- Cashback: `resumo_cashback` e `buscar_cliente` usam `GET /cashback/api/internal/summary` e `GET /cashback/api/internal/clients/search`, ambos no app Node/Postgres. Nao consultar `wf_compras`, `wf_clientes`, `wf_cashback_creditos` ou `wf_resgates`.
- Tarefa: `resumo_tarefas` e `criar_tarefa` usam `GET /tarefa/api/internal/summary` e `POST /tarefa/api/internal/tasks`, gravando em `tarefa_tasks` e `tarefa_audit_events`. Nao criar `wf_tarefas`.
- Cotacao: resumo, busca, encomenda, urgente e cotacao rapida usam endpoints internos da Cotacao V2 (`/api/internal/summary`, `/search`, `/encomendas`, `/urgentes`, `/cotacoes-rapidas`). Nao usar `cotacao_itens`, `cotacao_precos`, `cotacao_fornecedores` ou `cotacao_blocos`.
- Codigos: resumo e busca continuam por `/codigos/api/internal/summary` e `/codigos/api/internal/search`; se a ponte falhar, o Miauby nao cai em `wf_codigos_comissao`.
- Financeiro: resumo, lancamentos, sangria, faturamento diario e guardiao usam `/financeiro/api/internal/*`. Se faltar token/ponte, o Miauby nao grava no legado MySQL.
- Guardiao operacional: os scans de Financeiro e Cotacao agora consultam os endpoints internos modernos, sem SQL direto nos legados desses modulos.

### Regra operacional

Quando a ponte moderna estiver indisponivel, a resposta correta e avisar que o modulo moderno nao respondeu e pedir verificacao da tela oficial. Nao reativar fallback para MySQL antigo dentro do Miauby sem uma janela de rollback documentada.

### Endpoints adicionados nesta etapa

- `GET /cashback/api/internal/clients/search`
- `GET /tarefa/api/internal/summary`
- `POST /tarefa/api/internal/tasks`
- `GET /cotacao/api/internal/summary`
- `POST /cotacao/api/internal/urgentes`
- `POST /cotacao/api/internal/cotacoes-rapidas`

## Regra de nome

### Canonico novo

- Produto/interface: `Miauby`.
- O widget flutuante deve manter a foto inteira visivel no circulo, sem corte de borda, com borda laranja para diferenciar o acionador do chat.
- Futuro app interno: `apps/miauby`.
- Futuro banco: `wimifarma_miauby`.
- Futuras tabelas: `miauby_conversations`, `miauby_messages`, `miauby_training_examples`, `miauby_memories`, `miauby_alerts`, `miauby_patterns`, `miauby_tool_traces`, `miauby_settings`, `miauby_farmacia_popular_values`, `miauby_farmacia_popular_updates`, `miauby_audit_events`.
- Futuras env vars: `MIAUBY_*`.
- Futuras rotas canonicas: `/miauby/`, `/miauby/agent/`, `/miauby/whatsapp/`.

### Compatibilidade obrigatoria

Manter funcionando ate corte documentado:

- `/miauw/`;
- `/miauw/agent/`;
- `/miauw/whatsapp/`;
- `site/miauw`;
- `apps/miauw-agent`;
- `apps/miauw-whatsapp`;
- env vars `MIAUW_*`;
- tabelas `miauw_*`.

Durante a transicao, variaveis novas `MIAUBY_*` devem aceitar fallback para `MIAUW_*`. Rotas novas `/miauby/*` devem ser aliases ou redirects seguros para as rotas atuais, nunca substituicoes secas no primeiro passo.

## Inventario de dados a migrar

Fonte MySQL atual:

- `miauw_conversas`;
- `miauw_mensagens`;
- `miauw_conhecimentos`;
- `miauw_memorias`;
- `miauw_configuracoes`;
- `miauw_channel_events`, fallback da memoria multicanal;
- `miauw_farmacia_popular_valores`;
- `miauw_farmacia_popular_atualizacoes`;
- `miauw_tool_traces`;
- `miauw_treinos_respostas`;
- `miauw_alertas`;
- `miauw_padroes`;
- `miauw_alerta_eventos`;
- `wf_logs`, apenas como historico/compatibilidade do Miauby legado; nao e mais parte do contrato de auditoria da tool moderna de Gestao.

Fonte Postgres ja relacionada:

- `core_users`, `core_audit_logs`, `core_user_module_permissions` em `wimifarma_core`.
- `miauw_whatsapp_channel_events`, `miauw_whatsapp_contacts`, `miauw_whatsapp_outbox`, `miauw_whatsapp_confirmations`, `miauw_whatsapp_error_logs` em `wimifarma_miauw_whatsapp`.
- Dados dos modulos modernos consultados por endpoint interno: Financeiro, Cashback, Codigos, Cotacao, Gestao, Pedidos, Tarefa e XP. Para Gestao, manter apenas endpoint tokenizado e auditoria Postgres (`gestao_audit_events`/`core_audit_logs`) mais trace do Miauby.

## Schema alvo inicial

Primeira versao do `wimifarma_miauby`:

- `miauby_schema_migrations`: controle de migracoes idempotentes.
- `miauby_conversations`: conversa por usuario/canal, com `legacy_mysql_id`.
- `miauby_messages`: mensagens sanitizadas, tipo, papel, canal, latencia e `legacy_mysql_id`.
- `miauby_training_examples`: treino aprovado/pendente/rejeitado, versao e categoria.
- `miauby_memories`: memorias revisaveis, status, origem, resumo e metadados limpos.
- `miauby_knowledge`: conhecimentos operacionais curados.
- `miauby_alerts`: alertas ativos/arquivados.
- `miauby_alert_events`: eventos dos alertas.
- `miauby_patterns`: padroes revisaveis.
- `miauby_tool_traces`: traces sanitizados de tools.
- `miauby_settings`: configuracoes nao secretas.
- `miauby_farmacia_popular_values`: valores atuais.
- `miauby_farmacia_popular_updates`: historico de atualizacao.
- `miauby_audit_events`: auditoria propria do modulo.

Implementacao inicial de 2026-05-30:

- `apps/miauby/src/shadow-migrate.ts` cria `miauby_schema_migrations`, `miauby_migration_runs` e as tabelas `miauby_*` listadas acima.
- Cada tabela sombra recebe `legacy_mysql_id`, `legacy_source_key`, `source_table`, campos auxiliares de usuario/conversa/status, `content_preview`, `payload_sanitized`, `source_checksum`, `created_at`, `updated_at` e `migrated_at`; tabelas fonte sem `id` usam um identificador sintetico estavel para permitir upsert idempotente.
- O migrador redige chaves, tokens, senhas, payload bruto, SQL bruto, stack trace, telefone, WhatsApp, audio e midia antes de gravar no Postgres.
- A fonte oficial continua em `site/miauw`/MySQL ate validacao de paridade; esta fase nao muda rota, frontend, widget, treino, diagnostico ou engine.

Campos obrigatorios em todas as tabelas migradas:

- `id`;
- `legacy_mysql_id` quando vier de MySQL;
- `created_at`;
- `updated_at` quando aplicavel;
- `deleted_at` ou status quando houver arquivamento;
- `metadata` em JSONB somente com dado sanitizado.

Proibido migrar para Postgres:

- token;
- chave de API;
- payload bruto externo;
- SQL bruto;
- stack trace completo;
- telefone cru;
- audio/midia bruta.

## Plano fatiado

### Fase 0 - Nomenclatura segura

- Atualizar documentacao para usar `Miauby` como nome de produto.
- Manter `miauw` como prefixo tecnico legado nos paths existentes.
- Preparar lista de aliases antes de renomear arquivos.
- Nao trocar container, rota, banco ou env var em producao nesta fase.

### Fase 1 - Banco Postgres sombra

- Estado iniciado em 2026-05-30: `wimifarma-miauby-db` foi adicionado no Compose com credencial propria `MIAUBY_POSTGRES_PASSWORD`.
- Estado iniciado em 2026-05-30: `wimifarma-miauby-migrator` foi adicionado no profile `migration`.
- Estado iniciado em 2026-05-30: `apps/miauby` criou o migrador idempotente para `miauw_*` -> `miauby_*` com payload sanitizado.
- Preservar `legacy_mysql_id` e checksums por tabela.
- Rodar em modo sombra, sem mudar leitura oficial.

### Fase 2 - APIs de leitura em Node

- Estado iniciado em 2026-05-30: `wimifarma-miauby-app` roda `apps/miauby` em Node.js 22 + TypeScript + Express, somente na rede Docker.
- Estado iniciado em 2026-05-30: `/miauby/health` responde status seguro do servico sombra, sem segredo e sem proxy publico.
- Estado iniciado em 2026-05-30: `/miauby/api/internal/status` e `/miauby/api/internal/parity?sample=5` exigem token interno e comparam tabelas `miauby_*` contra `miauw_*` por contagem/checksum/amostra, sem retornar payload bruto.
- Estado iniciado em 2026-05-30: `/miauby/api/internal/readiness?sample=20` consolida health/paridade para pos-deploy e `/miauby/api/internal/context?limit=3` retorna apenas amostras sanitizadas de treino, memoria, conhecimento, alertas, padroes, traces e configuracoes.
- Validado em 2026-05-31 no VPS: apos rodar migracao sombra idempotente, `/miauby/api/internal/readiness?sample=10` respondeu `ok=true`, Postgres ok, paridade 12/12, zero divergencia de contagem/checksum/amostra, `write_enabled=false`, `route_cutover_enabled=false` e `public_proxy_enabled=false`. Desde 2026-06-02, a migracao/validacao deve ser rodada pelo `wimifarma-miauby-migrator` descartavel, nao dentro do app vivo.
- Estado iniciado em 2026-06-01: `apps/miauby` ganhou `/miauby/api/internal/cutover`, endpoint interno tokenizado e somente leitura que devolve o inventario de corte, fluxos bloqueantes, sequencia segura e rollback. Ele confirma explicitamente `write_enabled=false`, `route_cutover_enabled=false`, `public_proxy_enabled=false` e `node_direct_module_db_writes_enabled=false`.
- Estado iniciado em 2026-06-02: `apps/miauby` ganhou `/miauby/api/internal/canonical-context` e o alias `/miauby/api/internal/context-pack`, ambos internos/tokenizados, para compilar contexto de estilo/persona/tools a partir de `miauby_*` e de um registry Node tipado. Em 2026-06-02, a Etapa 5A consolidou esse pacote como read model canônico Node/Postgres, expondo `canonical_read_model.version=miauby-read-model-5a-2026-06-02`, treino aprovado, memorias/padroes aprovados, conhecimentos ativos/aprovados e contratos de tools, sempre com `write_enabled=false`, `writes_enabled_in_node=false`, `php_official_response=true`, sem payload bruto, sem chamada OpenAI e sem executar tools.
- Estado iniciado em 2026-06-02: a Etapa 5B preparou o adaptador interno de escrita do `apps/miauby`, ainda desligado. O migrador cria `miauby_write_intents` e `miauby_write_audit_events`; o app expoe `/miauby/api/internal/write-adapter`, `/miauby/api/internal/write-adapter/plan` e `/miauby/api/internal/write-adapter/dry-run`, todos internos/tokenizados. `MIAUBY_WRITES_ENABLED=false` e `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false` sao o padrao seguro, entao o Node nao grava conversas, mensagens, traces, treino, memorias, alertas, padroes nem configuracoes como fonte oficial, e nem registra dry-run sem liberacao explicita.
- Estado iniciado em 2026-06-02: a Etapa 5C ligou o caminho de shadow write/dry-run controlado. O PHP oficial pode, apenas quando `MIAUBY_WRITE_SHADOW_ENABLED=true` e usuario permitido em `MIAUBY_WRITE_SHADOW_ALLOWED_USERS`, enviar ao adaptador uma intencao sanitizada depois de gravar a mensagem em `miauw_mensagens`. O `wimifarma-miauby-app` registra somente em `miauby_write_intents`/`miauby_write_audit_events` quando `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true`; `MIAUBY_WRITES_ENABLED=false` continua impedindo escrita real, e idempotencia por chave/checksum diferencia duplicidade segura de divergencia.
- PHP continua dono da resposta oficial.

### Etapa 2026-06-01 - Inventario de corte sem troca de motor

Esta etapa inicia o modulo Miauby interno sem mexer no fluxo vivo. A decisao tecnica foi criar uma fonte interna de verdade para o plano de corte no proprio servico sombra, em vez de trocar rota, sessao ou banco.

O diagnostico atual e:

- `site/miauw/api.php?action=send` ainda grava conversa, mensagem do usuario, resposta do assistente, traces e memoria auxiliar em MySQL antes/depois de gerar a resposta.
- `apps/miauby` ainda e sombra/read-only: cria schema, copia `miauw_*` para `miauby_*`, compara paridade e retorna contexto sanitizado.
- `apps/miauw-agent` ja gera resposta Node em modo controlado, mas ainda depende de `agent-context.php`, `agent-tools.php` e `agent-actions.php` para contexto, tools e confirmacoes.
- Treino, diagnostico, memorias, alertas, padroes e Farmacia Popular continuam com telas/rotinas PHP.
- A troca segura deve comecar pela escrita de mensagens/traces e pela exportacao de contratos de tools, nao pela remocao do PHP.

Novo endpoint interno:

- `GET /miauby/api/internal/cutover`: exige `X-Miauby-Internal-Token`, `X-Miauw-Internal-Token` ou `X-Miauw-Guardian-Token`; retorna inventario de fluxos, tabelas `miauw_*` -> `miauby_*`, bloqueios fortes, sequencia segura e rollback. Nao retorna payload bruto, nao chama OpenAI, nao grava banco e nao habilita proxy publico.

Fluxos que continuam oficiais no PHP ate corte validado:

- `chat_messages`: `miauw_conversas`, `miauw_mensagens`, `miauw_tool_traces` e fallback `miauw_channel_events`.
- `training_review`: `miauw_treinos_respostas`.
- `memory_and_knowledge`: `miauw_memorias` e `miauw_conhecimentos`.
- `alerts_patterns`: `miauw_alertas`, `miauw_alerta_eventos`, `miauw_padroes` e `miauw_configuracoes`.
- `tool_contracts`: contexto e tools exportados por PHP para o agent Node/WhatsApp.
- `strong_actions`: preparo/execucao por `agent-actions.php`, sempre com confirmacao humana quando aplicavel.
- `farmacia_popular`: valores e historico ainda atualizados pela rotina PHP.

Etapa seguinte realizada em 2026-06-02: migrar para Node/Postgres uma leitura canonica de contexto/persona/tool contracts baseada em `miauby_*`, ainda sem escrita direta e ainda com PHP oficial.

### Etapa 2026-06-02 - Miauby Etapa 5A: contexto/persona/tools read-only em Node

Esta etapa entrega a leitura canonica do pacote de contexto sem trocar o motor oficial. O objetivo e permitir que o servico sombra monte, valide e exponha um pacote equivalente ao que o PHP envia hoje para o agente/WhatsApp, mas usando `miauby_*` como fonte de dados vivos.

Novo endpoint interno:

- `GET|POST /miauby/api/internal/canonical-context`: exige `X-Miauby-Internal-Token`, `X-Miauw-Internal-Token` ou `X-Miauw-Guardian-Token`; aceita `message`, `page_context`, `limit`, `tool`, `module` e `risk`; retorna `canonical_read_model`, `style_context`, `personality`, `tool_contracts`, datasets sanitizados e guardas de seguranca.
- `GET|POST /miauby/api/internal/context-pack`: alias do endpoint acima para consumidores futuros.

Regras preservadas:

- `site/miauw PHP` continua dono da resposta oficial, de `agent-context.php`, `agent-tools.php` e `agent-actions.php`.
- `apps/miauby` nao escreve em `miauby_*`, nao escreve em bancos de modulos, nao chama OpenAI e nao executa tool.
- O pacote retorna apenas preview sanitizado, checksum curto e metadados; `payload_sanitized` bruto nao sai da API.
- Treino entra no pacote somente quando `status`/`revisao_status` indicar aprovado.
- Memorias e padroes entram no contexto canonico somente quando revisados/aprovados; itens pendentes continuam visiveis apenas em contagem/diagnostico, nao como contexto de resposta.
- Conhecimentos entram quando estao ativos/aprovados. O endpoint tambem entende `ativo`/`active` quando a informacao vem do JSON sanitizado da sombra.
- `tool_contracts` e tipado no Node, mas `execution_owner` e `confirmation_owner` continuam `php`; `writes_enabled_in_node=false` para todas as tools.
- Desde 2026-06-03, `text_command_contracts` tambem entra no pacote canonico para registrar que comandos textuais treinados no Miauby WhatsApp devem virar variacoes textuais do Miauby interno quando fizer sentido. O interno nao exige prefixo `miauby`, nao processa midia e usa apenas texto manual, por exemplo `sangria 10 troco`, `pix cnpj 28,90 compra fornecedor`, `pedido anb 350`, `criar tarefa conferir caixa`, `minhas tarefas`, `concluir tarefa conferir caixa`, `cancelar tarefa conferir caixa` e `cotacao dipirona`. O pacote tambem expoe `identity_resolution`: `miauby_interno` resolve responsavel pela sessao logada, enquanto `miauby_whatsapp` resolve pelo numero vinculado/allowlist.
- Para Tarefas, o contrato textual compartilhado usa o app Tarefa como dono da escrita/leitura por endpoints tokenizados: `GET /tarefa/api/internal/tasks/visible`, `GET /tarefa/api/internal/users`, `POST /tarefa/api/internal/tasks`, `POST /tarefa/api/internal/tasks/private` e `POST /tarefa/api/internal/tasks/status`. Usuario comum cria tarefa privada para si por padrao e nao pode criar tarefa geral nem para outro usuario; ADM/admin pode direcionar tarefa e pedir visao ampliada. Consultar/concluir/cancelar por texto nunca escolhe sozinho quando ha varias candidatas: o Miauby lista opcoes agrupadas por escopo/usuario e guarda uma pendencia curta por sessao ou numero, aceitando numero, ordinal, grupo (`a geral`, `adm 1`, `minha 2`), usuario ou trecho do titulo. Concluir/cancelar ainda exige confirmacao humana depois da escolha. Datas simples no texto (`amanha 15h`, `sexta cedo`, `dd/mm`) viram `remind_at` somente para tarefa privada com usuario de destino.
- `channel_memory` multicanal ainda fica no bridge/PHP oficial ate fase propria de migracao.

Validacao esperada:

- `npm run check` e `npm run build` em `apps/miauby`.
- Migracao/validacao sombra antes do smoke, para garantir que `miauby_*` esta atualizado.
- `scripts/miauby-shadow-smoke.sh` deve validar health, readiness, contexto sanitizado, pacote canonico 5A, persona, treino aprovado, memorias/conhecimentos, contratos de tools, cutover e todos os flags read-only.

Etapa seguinte segura: ligar somente shadow write/dry-run controlado para o PHP oficial enviar intencoes sanitizadas ao adaptador, ainda sem trocar frontend, sem cortar o PHP oficial e sem habilitar escrita real.

### Etapa 2026-06-02 - Miauby Etapa 5B: adaptador de escrita desligado

Esta etapa prepara a trilha de escrita Node/Postgres sem tornar o Node dono de nenhuma escrita do chat interno. O PHP em `site/miauw` continua gravando oficialmente em MySQL `miauw_*`; `/miauby/` continua redirecionando para `/miauw/`; e o `apps/miauby` continua sem proxy publico.

Novas configuracoes:

- `MIAUBY_WRITES_ENABLED`: controla escrita real pelo adaptador. Deve ficar `false` nesta etapa.
- `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED`: controla se o endpoint de dry-run pode gravar apenas intencao/auditoria em `miauby_write_*`. Deve ficar `false` nesta etapa.
- `MIAUBY_WRITE_ADAPTER_AUDIT_ENABLED`: reservado para auditoria do adaptador; padrao `true`, mas sem efeito de escrita quando dry-run esta bloqueado.

Novos endpoints internos:

- `GET /miauby/api/internal/write-adapter`: status, flags, contratos tipados, tabelas de schema e garantias de rollback.
- `POST /miauby/api/internal/write-adapter/plan`: valida uma intencao, sanitiza payload, calcula checksum/idempotency key e devolve plano de rollback. Nao grava banco.
- `POST /miauby/api/internal/write-adapter/dry-run`: nesta etapa retorna bloqueio por env enquanto `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false`; quando liberado em etapa futura, devera gravar somente intencao/auditoria, sem escrever nas tabelas de dominio.

Contratos preparados:

- conversas e mensagens: `miauby_conversations`, `miauby_messages`;
- traces: `miauby_tool_traces`;
- treino, memorias, conhecimentos, alertas, eventos, padroes e configuracoes;
- Farmacia Popular: valores e historico de atualizacao.

Regras preservadas:

- resposta oficial continua PHP;
- escrita oficial continua PHP/MySQL `miauw_*`;
- `apps/miauby` nao executa tools;
- nenhuma escrita real e implementada em 5B, mesmo se alguem tentar ligar `MIAUBY_WRITES_ENABLED`;
- payloads de plano/dry-run sao sanitizados contra segredo, telefone, SQL, stack trace, audio e midia;
- idempotencia usa chave explicita ou checksum estavel do payload sanitizado;
- rollback imediato continua sendo `MIAUBY_WRITES_ENABLED=false` e `MIAUW_ENGINE=php`.

Validacao esperada:

- `npm run check` e `npm run build` em `apps/miauby`;
- `scripts/miauby-shadow-migrate.sh migrate` e `validate` para criar o schema 5B no Postgres;
- `scripts/miauby-shadow-smoke.sh` deve confirmar que `write_adapter.write_enabled=false`, o plano sanitiza telefone e o dry-run segue bloqueado por env.

### Etapa 2026-06-02 - Miauby Etapa 5C: shadow write/dry-run controlado

Esta etapa permite validar o caminho de escrita em sombra sem trocar a fonte oficial. O PHP continua gravando `miauw_conversas`/`miauw_mensagens` em MySQL e so depois envia uma intencao sanitizada para o adaptador Node/Postgres.

Novas configuracoes no PHP:

- `MIAUBY_WRITE_SHADOW_ENABLED`: liga/desliga o envio de intencoes dry-run pelo PHP. Padrao `false`.
- `MIAUBY_WRITE_SHADOW_ALLOWED_USERS`: allowlist de usuarios para shadow write. Padrao `adm`.
- `MIAUBY_WRITE_ADAPTER_INTERNAL_URL`: endpoint interno `/miauby/api/internal/write-adapter/dry-run`.
- `MIAUBY_WRITE_SHADOW_TIMEOUT_MS`: timeout curto para nao atrasar o chat se o Node falhar.

Configuracoes no `wimifarma-miauby-app`:

- `MIAUBY_WRITES_ENABLED=false`: obrigatorio; escrita real continua sem suporte.
- `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=true`: permite gravar apenas dry-run em `miauby_write_intents` e `miauby_write_audit_events`.
- `MIAUBY_WRITE_ADAPTER_AUDIT_ENABLED=true`: mantem auditoria do dry-run.

Regras preservadas:

- resposta oficial continua PHP;
- escrita oficial continua PHP/MySQL;
- `/miauw/` e `/miauby/` nao mudam de destino;
- nenhuma tabela de dominio `miauby_*` recebe escrita oficial nesta etapa;
- o payload enviado pelo PHP contem preview sanitizado, id legado MySQL e metadados limpos, sem telefone cru, segredo, SQL, stack trace, audio ou midia;
- falha no adaptador vira trace sanitizado `miauby_write_shadow_dry_run` e nao altera a resposta ao operador;
- idempotencia usa `php:mysql:miauw_mensagens:{id}`; reenvio igual vira duplicidade, reenvio com checksum diferente vira divergencia auditada.

Validacao esperada:

- `npm run check` e `npm run build` em `apps/miauby`;
- smoke do adaptador com dry-run bloqueado e, no VPS controlado, com dry-run habilitado;
- envio real do `adm` no chat PHP deve continuar respondendo pelo PHP e criar intencoes `dry_run_recorded` no Postgres do Miauby;
- divergencia deve parar o avanco da migracao ate investigacao, mas nao quebra o chat atual.

Rollback:

- `MIAUBY_WRITE_SHADOW_ENABLED=false` no PHP;
- `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false` no `wimifarma-miauby-app`;
- manter `MIAUBY_WRITES_ENABLED=false` e `MIAUW_ENGINE=php`.

### Etapa 2026-06-02 - Miauby Etapa 6A: corte de resposta por usuario adm

Esta etapa prepara o primeiro corte controlado do motor de resposta, sem transformar o Node em dono da escrita. O chat continua entrando por `site/miauw/api.php?action=send`; o PHP continua criando conversa, gravando mensagem do usuario e gravando mensagem do assistente em `miauw_mensagens`; a diferenca e que, para usuario liberado, o texto da resposta pode vir oficialmente do `wimifarma-miauw-agent`.

Novas/ajustadas configuracoes:

- `MIAUBY_ENGINE`: nome novo do motor, aceitando `php`, `node_shadow` ou `node`.
- `MIAUW_ENGINE`: fallback legado enquanto a transicao ainda usa prefixo tecnico antigo.
- `MIAUW_AGENT_ENGINE_ALLOWED_USERS`: allowlist do corte; deve comecar apenas com `adm`.

Regras preservadas:

- `/miauw/` continua sendo a rota do chat interno.
- `/miauby/` continua compatibilidade/redirect seguro enquanto o app oficial ainda nao foi cortado por rota.
- Escrita oficial continua `php_mysql`; o Node nao grava `miauby_messages` como fonte oficial.
- `MIAUBY_WRITES_ENABLED=false` continua obrigatorio.
- O dry-run 5C pode continuar registrando intencoes/auditoria em `miauby_write_intents`/`miauby_write_audit_events`.
- Falha do agent Node volta para resposta PHP no mesmo request e registra trace sanitizado.
- Usuarios fora da allowlist continuam com resposta PHP mesmo se `MIAUBY_ENGINE=node`.

Observabilidade:

- `miauw_agent_runtime_status()` informa `official_response_owner`, `write_owner`, `route_cutover_enabled`, `public_proxy_enabled`, `node_primary_active_for_user` e `node_failure_fallback_owner`.
- `scripts/miauby-node-cutover-smoke.sh node` valida dentro do VPS que `adm` esta elegivel para Node, usuario comum nao esta, a escrita segue PHP/MySQL, rota/proxy nao foram cortados e o fallback segue PHP.
- Para testar uma chamada real ao agent, usar `MIAUBY_NODE_CUTOVER_RUN_AGENT=true sh scripts/miauby-node-cutover-smoke.sh node`; isso chama a camada online e deve ser usado com criterio.
- `site/miauw/module-status.php` expoe um endpoint interno/tokenizado para conferir leitura de Cotacao, Financeiro, Gestao, Pedidos, Tarefas, Cashback, Codigos, XP, Usuarios e Miauby Whats sem payload bruto. O detalhe de uso fica em `docs/30-miauby-leitura-modulos.md`.
- Novos traces da ponte universal passam a registrar modulo e risco reais da tool chamada, preservando `writes_enabled_in_node=false`.

Rollback:

- Preferir `MIAUBY_ENGINE=php`; se a variavel nova nao existir no ambiente, voltar `MIAUW_ENGINE=php`.
- Recriar `wimifarma-com-web`.
- Se o agent Node tambem foi alterado, recriar `wimifarma-miauw-agent`.

### Etapa 2026-06-02 - Consumidor sombra do contexto Node

Esta etapa resolve o proximo bloqueio seguro sem ligar escrita, rota publica ou corte do PHP. O chat interno continua oficial em `site/miauw`, mas quando a comparacao sombra do agente roda para usuario liberado, o PHP tambem consulta o pacote canônico de contexto em `apps/miauby` e grava um trace sanitizado com versoes/contagens.

Novas configuracoes:

- `MIAUBY_CONTEXT_SHADOW_ENABLED`: liga/desliga a consulta sombra; fica `false` por padrao no Git.
- `MIAUBY_CONTEXT_INTERNAL_URL`: endpoint interno do pacote canônico, por padrao `http://wimifarma-miauby-app:4100/miauby/api/internal/canonical-context`.
- `MIAUBY_CONTEXT_SHADOW_TIMEOUT_MS`: timeout curto da consulta sombra, por padrao 2500 ms.
- `MIAUBY_INTERNAL_TOKEN` ou fallback para `MIAUW_AGENT_INTERNAL_TOKEN`/`MIAUW_GUARDIAN_TOKEN`: token interno para chamar `apps/miauby`.

Regras preservadas:

- A resposta oficial continua PHP.
- O agente Node continua recebendo o pacote PHP atual como contexto operacional.
- `apps/miauby` continua sem escrita direta: `write_enabled=false`, `writes_enabled_in_node=false`.
- `route_cutover_enabled=false` e `public_proxy_enabled=false` continuam corretos nesta fase.
- O trace `miauby_context_shadow_compare` registra apenas fonte, versoes, contagens, flags e duracao; nao grava payload bruto, segredo, SQL, telefone, audio ou midia.

Rollback:

- Desligar `MIAUBY_CONTEXT_SHADOW_ENABLED=false` e recriar `wimifarma-com-web`.
- Se o `apps/miauby` falhar, o erro fica em trace e a resposta PHP/agent sombra seguem sem usar o pacote Node.

Proxima etapa segura apos alguns testes do `adm`: trocar um consumidor controlado do WhatsApp ou do agent para ler o pacote Node como fonte primaria de contexto, ainda mantendo fallback PHP e ainda sem escrita direta.

### Etapa 2026-06-02 - Runtime Miauby sem MySQL direto

Esta etapa reduz o acoplamento operacional com MySQL sem desligar o PHP oficial nem perder a capacidade de validar a sombra.

O que mudou:

- `wimifarma-miauby-app` nao recebe mais `MYSQL_*` no Compose.
- `apps/miauby/src/server.ts` nao importa `mysql2` nem abre pool MySQL ao subir.
- `/miauby/api/internal/readiness` e `/miauby/api/internal/parity` usam o ultimo `validate` salvo em `miauby_migration_runs` para resumir contagens e divergencias.
- `scripts/miauby-shadow-migrate.sh` passou a construir e executar um `wimifarma-miauby-migrator` descartavel com `--no-deps`; esse migrador continua usando MySQL somente durante `migrate`/`validate`.

Regras preservadas:

- O PHP/MySQL `site/miauw` continua oficial para chat, treino, diagnostico, memoria, alertas e escrita.
- O Node/Postgres continua read-only: `write_enabled=false`, `route_cutover_enabled=false`, `public_proxy_enabled=false`.
- `mysql2` em `apps/miauby` fica justificado somente pelo migrador sombra, nao pelo app vivo.
- Para atualizar a paridade, rode `sh scripts/miauby-shadow-migrate.sh migrate` e depois `sh scripts/miauby-shadow-migrate.sh validate`; sem validate recente, readiness deve apontar snapshot ausente ou divergente em vez de fazer leitura MySQL ao vivo.

Rollback:

- Reativar `MYSQL_*` no servico `wimifarma-miauby-app` e restaurar versao anterior se for necessario voltar a paridade live MySQL por endpoint.
- O rollback normal do produto continua sendo manter `/miauby/` redirecionando para `/miauw/` e `MIAUW_ENGINE=php`.

### Fase 3 - Alias publico controlado

- Estado iniciado em 2026-05-31: `/miauby/` redireciona para `/miauw/` por `.htaccess`, preservando HTTPS publico, sem trocar motor, sessao, banco ou frontend.
- Estado iniciado em 2026-05-31: `/miauby/agent/` e `/miauby/whatsapp/` sao aliases Apache para os servicos Node ja existentes em `/miauw/agent/` e `/miauw/whatsapp/`.
- Estado iniciado em 2026-05-31: a home passou a divulgar `/miauby/` e `/miauby/whatsapp/`, mantendo `/miauw/*` vivo para compatibilidade e rollback.
- Inserir variaveis `MIAUBY_*` com fallback para `MIAUW_*`.
- Validar que links antigos continuam abrindo.
- Nao expor `wimifarma-miauby-app` ao publico nesta fase; suas rotas continuam internas e tokenizadas para paridade/readiness.

### Fase 4 - Chat em sombra

- Enviar conversas do usuario `adm` para o Node em sombra.
- Estado iniciado em 2026-05-31 no VPS: `MIAUW_ENGINE=node_shadow`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e `MIAUW_AGENT_SHADOW_ON_SEND=false`; somente `adm` forca comparacao Node sombra nos envios reais, a resposta oficial segue PHP, usuario comum nao tem sombra/latencia global e rollback imediato e voltar `MIAUW_ENGINE=php` e recriar `wimifarma-com-web`.
- Comparar resposta Node x PHP com trace sanitizado.
- Validar persona, treino, guardrails, latencia e ferramentas de leitura.
- Sem escrita direta no Node.

### Fase 5 - Tools por contrato

- Mover contracts de tools para fonte versionada em Postgres/Node.
- Cada tool deve declarar modulo, risco, permissao, entrada, saida, auditoria, efeito e executor.
- Escrita forte continua por endpoint interno do modulo dono, com confirmacao humana.
- Node nao deve abrir conexao direta para bancos de outros modulos quando existir endpoint interno.

### Fase 6 - Corte parcial do motor

- `MIAUBY_ENGINE=php|node_shadow|node` deve ser o nome novo.
- `MIAUW_ENGINE` fica como fallback durante transicao.
- Liberar `node` apenas para `adm`/usuarios listados.
- Rollback por env deve voltar ao PHP sem alterar banco.
- Estado iniciado em 2026-06-02: Etapa 6A preparou status por usuario, alias `MIAUBY_ENGINE` e smoke `scripts/miauby-node-cutover-smoke.sh`; escrita oficial continua PHP/MySQL.

### Fase 7 - Corte de escrita e diagnostico

- Migrar escrita de mensagens, treino, memorias, traces e alertas para `wimifarma_miauby`.
- PHP pode virar camada de compatibilidade temporaria.
- Confirmacoes e auditoria precisam ficar equivalentes antes de desligar MySQL.

### Fase 8 - Limpeza final

- Congelar escrita em `miauw_*`.
- Manter backup/dump e checksums.
- Remover fallback MySQL do Miauby interno.
- Renomear paths/containers somente depois que `/miauby/` estiver validado por alguns dias.
- Manter redirect `/miauw/` -> `/miauby/` por janela longa.

## Validacao obrigatoria por fase

- `GET /miauw/widget-status.php` ou futuro `/miauby/widget-status.php` responde sem expor segredo.
- `/miauw/diagnostico.php` e `/miauw/treino.php` continuam restritos.
- Evals locais `site/miauw/miauw-evals.php` passam.
- Health do Node agent passa.
- WhatsApp continua respondendo saudacoes locais e comandos com confirmacao.
- n8n de pedidos e fechamento de caixa continua visivel no painel WhatsApp.
- Confirmacoes de sangria, Pix CNPJ, pedidos e Gestao continuam auditadas.
- Amostra de conversas, mensagens, treinos, memorias, alertas e traces bate MySQL x Postgres.
- Nenhum log novo contem segredo, telefone cru, audio ou payload bruto.

## Ordem recomendada agora

1. Validar 5C com `adm` por envios reais e zero divergencia de dry-run.
2. Ativar/validar 6A com `MIAUBY_ENGINE=node` apenas para `adm`.
3. Observar latencia, confirmacoes, tools e traces por alguns dias.
4. Migrar escrita oficial para `wimifarma_miauby` somente depois do corte de resposta estar estavel.
5. Cortar por rota apenas depois de escrita Postgres validada.

## Cuidados de rollback

- Antes de cada fase com banco, fazer dump MySQL e Postgres.
- Nunca apagar `site/miauw` ate `/miauby/` estar validado e documentado.
- Nunca substituir env vars `MIAUW_*` sem fallback `MIAUBY_*`.
- Nunca remover tabela `miauw_*` sem congelamento, dump, checksum e janela de observacao.
- Se o Node falhar, o PHP atual deve continuar respondendo.
