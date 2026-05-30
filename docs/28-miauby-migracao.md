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

- Rota atual: `/miauw/`.
- Arquivos atuais: `site/miauw`.
- Motor principal: PHP procedural.
- Auth: `core_users` por `WIMIFARMA_INTERNAL_AUTH_PROVIDER=core`.
- Dados principais: MySQL `wimifarma_app`, tabelas `miauw_*`.
- Postgres sombra: `wimifarma_miauby`, criado por `wimifarma-miauby-db`, com migrador idempotente em `apps/miauby`.
- Node agent: `apps/miauw-agent`, publicado em `/miauw/agent/`, ainda depende de ponte PHP para tools e contexto.
- Integracao com Gestao: ja usa endpoint interno tokenizado do app Node/Postgres; a tool `criar_conta_gestao` nao deve depender de `wf_logs` nem de tabela MySQL de Gestao.
- Escritas fortes: continuam com confirmacao humana e auditoria.

### Miauby WhatsApp

- Rota atual: `/miauw/whatsapp/`.
- App atual: `apps/miauw-whatsapp`.
- Stack atual: Node.js 22 + TypeScript + Postgres.
- Banco atual: `wimifarma_miauw_whatsapp`.
- Papel: transporte/bridge, fila, allowlist, outbox, n8n e memoria multicanal. Nao substitui sozinho o Miauby interno.

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
- Proximas leituras a adicionar depois da paridade:
  - contexto de voz/persona compilado;
  - filtros por status/categoria;
  - contrato de tool em formato canonico;
  - diagnostico seguro.
- PHP continua dono da resposta oficial.

### Fase 3 - Alias publico controlado

- Publicar `/miauby/` como alias controlado de `/miauw/`.
- Publicar `/miauby/agent/` e `/miauby/whatsapp/` como aliases das rotas existentes.
- Inserir variaveis `MIAUBY_*` com fallback para `MIAUW_*`.
- Validar que links antigos continuam abrindo.

### Fase 4 - Chat em sombra

- Enviar conversas do usuario `adm` para o Node em sombra.
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

1. Fechar inventario detalhado dos modulos modernos em `docs/26-inventario-modulos.md`.
2. Criar schema/migrator sombra do `wimifarma_miauby`.
3. Colocar `apps/miauby` lendo Postgres sombra por API interna somente leitura.
4. Criar alias `/miauby/` sem remover `/miauw/`.
5. Migrar motor em sombra para `adm`.
6. Cortar por usuario, depois por rota.

## Cuidados de rollback

- Antes de cada fase com banco, fazer dump MySQL e Postgres.
- Nunca apagar `site/miauw` ate `/miauby/` estar validado e documentado.
- Nunca substituir env vars `MIAUW_*` sem fallback `MIAUBY_*`.
- Nunca remover tabela `miauw_*` sem congelamento, dump, checksum e janela de observacao.
- Se o Node falhar, o PHP atual deve continuar respondendo.
