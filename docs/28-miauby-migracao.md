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
- Node agent: `apps/miauw-agent`, publicado em `/miauw/agent/`, ainda depende de ponte PHP para tools e contexto.
- Escritas fortes: continuam com confirmacao humana e auditoria.

### Miauby WhatsApp

- Rota atual: `/miauw/whatsapp/`.
- App atual: `apps/miauw-whatsapp`.
- Stack atual: Node.js 22 + TypeScript + Postgres.
- Banco atual: `wimifarma_miauw_whatsapp`.
- Papel: transporte/bridge, fila, allowlist, outbox, n8n e memoria multicanal. Nao substitui sozinho o Miauby interno.

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
- `wf_logs`, apenas como historico/compatibilidade.

Fonte Postgres ja relacionada:

- `core_users`, `core_audit_logs`, `core_user_module_permissions` em `wimifarma_core`.
- `miauw_whatsapp_channel_events`, `miauw_whatsapp_contacts`, `miauw_whatsapp_outbox`, `miauw_whatsapp_confirmations`, `miauw_whatsapp_error_logs` em `wimifarma_miauw_whatsapp`.
- Dados dos modulos modernos consultados por endpoint interno: Financeiro, Cashback, Codigos, Cotacao, Gestao, Pedidos, Tarefa e XP.

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

- Adicionar `wimifarma-miauby-db` no Compose ou schema dedicado no Postgres ja existente, com credencial propria.
- Criar migrator idempotente para `miauw_*` -> `miauby_*`.
- Preservar `legacy_mysql_id` e checksums por tabela.
- Rodar em modo sombra, sem mudar leitura oficial.

### Fase 2 - APIs de leitura em Node

- Criar `apps/miauby` em Node.js 22 + TypeScript + Express.
- Expor health/status publicos sem segredo.
- Expor endpoints internos tokenizados para:
  - contexto de voz/persona;
  - treinos aprovados;
  - memorias revisadas;
  - alertas;
  - traces recentes;
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
3. Criar alias `/miauby/` sem remover `/miauw/`.
4. Colocar `apps/miauby` lendo Postgres sombra.
5. Migrar motor em sombra para `adm`.
6. Cortar por usuario, depois por rota.

## Cuidados de rollback

- Antes de cada fase com banco, fazer dump MySQL e Postgres.
- Nunca apagar `site/miauw` ate `/miauby/` estar validado e documentado.
- Nunca substituir env vars `MIAUW_*` sem fallback `MIAUBY_*`.
- Nunca remover tabela `miauw_*` sem congelamento, dump, checksum e janela de observacao.
- Se o Node falhar, o PHP atual deve continuar respondendo.
