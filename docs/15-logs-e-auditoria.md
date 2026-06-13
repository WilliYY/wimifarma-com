# 15 - Logs e auditoria

## O que esta parte do sistema faz

Mapeia onde o sistema registra eventos, acoes e sinais de diagnostico.

## Arquivos, tabelas e servicos envolvidos

Logs de container:

- `docker compose logs wimifarma-com-web`
- `docker compose logs wimifarma-com-db`
- `docker compose logs wimifarma-cashback-app`
- `docker compose logs wimifarma-cashback-db`
- `docker compose logs wimifarma-cotacao-app`
- `docker compose logs wimifarma-codigos-app`
- `docker compose logs wimifarma-financeiro-app`
- `docker compose logs wimifarma-financeiro-db`
- `docker compose logs wimifarma-usuarios-app`
- `docker compose logs wimifarma-miauw-agent`
- `docker compose logs wimifarma-miauw-whatsapp`

Tabelas de auditoria/log:

- `wf_logs`
- `cashback_audit_events`
- `cashback_migration_runs`
- `cotacao_auditoria`
- `financeiro_auditoria`
- `financeiro_audit_events`
- `login_senha_audit_events`
- `core_user_audit_events`
- `core_user_module_permissions`
- `gestao_audit_events`
- `gestao_supplier_orders`
- `codigos_audit_events`
- `pedidos_orders`
- `pedidos_confirmed_orders`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_tool_traces`
- `miauw_farmacia_popular_atualizacoes`
- `miauw_whatsapp_contacts`
- `miauw_whatsapp_events`
- `miauw_whatsapp_outbox`
- `miauw_whatsapp_confirmations`
- `miauw_whatsapp_error_logs`
- `wptl_loginizer_logs`

Arquivos:

- `site/cashback/functions.php`
- `apps/cashback/src/server.ts`
- `apps/codigos/src/server.ts`
- `apps/xp/src/server.ts`
- `apps/cotacao/src/server.js`
- `apps/financeiro/src/server.ts`
- `apps/usuarios/src/server.ts`
- `apps/login-senha/src/server.ts`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-whatsapp/src/server.ts`
- `site/financeiro/financeiro-funcoes.php`
- `apps/gestao/src/server.ts`
- `apps/pedidos/src/server.ts`
- `site/_legacy-disabled/2026-05-29/` (legado PHP arquivado, sem escrita ativa)
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-funcoes.php`

## Regras que precisam ser preservadas

- Acoes financeiras e de cotacao devem manter auditoria.
- Cashback registra login/falha/logout, criacao/edicao de cliente, compra, resgate, mensagens, atendentes, configuracoes e manutencao em `cashback_audit_events`; desde 2026-05-30 nao espelha mais logs em `wf_logs` e nao possui caminho `mysql2`. Historico antigo de importacoes permanece em `cashback_migration_runs`.
- O Financeiro nao exibe mais a aba/tela operacional de Auditoria no topo, mas deve continuar gravando `financeiro_audit_events` no Postgres.
- O Financeiro Node/Postgres registra auditoria oficial em `financeiro_audit_events`. Desde 2026-05-30 nao existe mais espelho runtime para `financeiro_auditoria` no MySQL; esse historico fica apenas como referencia/backup. Desde 2026-06-02, acoes operacionais principais do Financeiro (`criar/alterar/fechar/reabrir fechamento`, `salvar faturamento diario`, `criar/cancelar lancamento`) tambem gravam resumo sanitizado em `core_audit_logs`, permitindo que o modulo Usuarios mostre o responsavel por login sem expor payload financeiro bruto.
- Logs nao devem gravar senhas, tokens ou chaves.
- Gestao registra criacao de conta, criacao por Miauby, renomeacao, vencimento atualizado/removido, repeticao para o mes seguinte, ciclo de repeticao ligado/desligado, reordenacao manual do painel Mensal (`gestao_mensal_ordem_atualizada`), troca/cancelamento em lote por categoria, arquivamento de contas canceladas, adicao de item, ajuste de lancamento, registro/cancelamento de pagamento parcial, quitacao de item, cancelamento/reabertura de lancamento, reabertura/cancelamento de fatura, observacao editada e mudanca de status em `gestao_audit_events` e `core_audit_logs`. Desde 2026-05-30, Gestao nao espelha mais `wf_logs` e nao possui caminho `mysql2`. O log deve guardar resumo curto, nunca senha, token, observacao sensivel completa ou detalhe financeiro alem do necessario.
- Pedidos registra criacao, pagamento informado na criacao, registro manual de pedido ja recebido e pago, chegada confirmada, finalizacao no historico, reabertura por novo valor/juros ou reabertura da conta, correcao de valor/vencimento/nome de parcela, e cancelamento por categoria com eventos `pedidos_pedido_criado`, `pedidos_pedido_pago_criacao`, `pedidos_pedido_registro_manual`, `pedidos_chegada_confirmada`, `pedidos_pedido_finalizado`, `pedidos_pedido_reaberto`, `pedidos_valor_adicionado`, `pedidos_valor_atualizado`, `pedidos_pagamento_criado`, `pedidos_boleto_quitado` e compatibilidade `gestao_pedido_cancelado_categoria` quando cancelado a partir da Gestao. O pedido fica ligado a uma conta da categoria `Boleto`, entao pagamentos parciais/totais tambem seguem os eventos financeiros ja existentes. Desde 2026-06-13, `pedidos_valor_atualizado` pode registrar correcao de parcela ja paga sem alterar/cancelar pagamentos preservados. Desde 2026-05-29, login/acoes de Pedidos gravam auditoria curta em `core_audit_logs` e eventos internos em `gestao_audit_events`, sem espelho `wf_logs`.
- Codigos registra criacao de blocos, criacao de itens, edicao, reordenacao, exclusao logica e exclusao de tabela em `codigos_audit_events` e `core_audit_logs`; desde 2026-05-30 nao espelha mais `wf_logs`. Autosave pode gerar mais eventos de edicao, entao logs devem continuar curtos e sem segredos.
- XP registra criacao/edicao/inativacao de funcionarios, atualizacao do perfil ADM, lancamento e cancelamento de vendas em `xp_audit_events`, com resumo tambem em `core_audit_logs` quando aplicavel; desde 2026-05-30 nao espelha mais `wf_logs` e nao possui caminho `mysql2`. Logs devem guardar resumo curto, sem arquivo original, senha ou dado sensivel.
- Usuarios registra login/falha, criacao, atualizacao, desativacao, permissoes, vinculo XP e se o cofre administrativo de senha foi atualizado em `core_user_audit_events`, espelhando resumo curto em `core_audit_logs`. A tela de Usuarios consulta `core_audit_logs` para historico geral/por usuario e por isso consegue mostrar acoes de outros modulos quando o ator e gravado como `core_users.id`. Nunca registrar senha nova/antiga, token, hash de senha, payload bruto ou dados sensiveis desnecessarios.
- Login / Senha registra criacao, edicao, arquivamento, visualizacao de senha, copia de senha e copia de login em `login_senha_audit_events`, com `scope` do cofre, snapshot curto do ator e espelho seguro em `core_audit_logs`. A auditoria deve registrar qual acesso foi usado e quem usou, nunca o valor da senha.
- Eventos de Miauby devem preservar contexto suficiente para diagnostico sem expor segredos.
- Guardrails do Miauby v2 que reescrevem resposta por vazamento de bastidor devem registrar diagnostico invisivel com termos detectados, origem, versao do agente e versao da politica, sem salvar a resposta completa nem segredo.
- O painel `/miauw/diagnostico.php` mostra diagnosticos internos recentes em forma resumida e sanitizada, sem payload bruto nem stack trace.
- Revisar memoria/padrao no painel do Miauby registra `wf_logs` com `miauw_revisao_memoria` ou `miauw_revisao_padrao`, sem apagar o registro revisado.
- A Fase 4 do Miauby registra tools core por registry; criar encomenda na Cotacao V2 gera evento em `cotacao_v2_events` e tambem registra `wf_logs` quando chamado pelo PHP do Miauby.
- A Fase 5 do Miauby registra execucao em `miauw_tool_traces`, vinculando `trace_id`, conversa, usuario, ferramenta, status, risco, resumo sanitizado, duracao e se houve confirmacao. Payloads devem ser sanitizados e nunca guardar chaves, tokens, SQL cru ou stack trace completo.
- A Fase 8 liga o servico sombra do Miauby a `miauw_tool_traces` pelo PHP: `miauw_agent_shadow_compare` registra status, duracao, modelo, similaridade e previews sanitizados, sem guardar token, payload bruto, SQL ou stack trace.
- A Fase 9 registra `miauw_agent_node_reply` quando o Node vira resposta oficial para usuario liberado, incluindo duracao, modelo e trace do Node; se falhar, grava erro sanitizado e o PHP assume a resposta oficial.
- A Fase 10 adiciona versao de personalidade ao status/health do Miauby; regressao de voz deve ser tratada por eval (`npm run check:persona`) e por exemplos revisados, nao por trace com texto bruto sensivel.
- A Fase 11 inclui `tool_contract_version` nos retornos/traces do Node quando o PHP envia contratos de tools. Traces devem registrar somente versao, checksum/resumo e contagens, nunca o contrato bruto com payload externo.
- A Fase 12 inclui `read_tools_enabled` e `node_executable_tools` nos retornos/traces resumidos do Node. Guardar somente a lista curta de tools seguras e versoes; nao persistir payload bruto de contratos nem argumentos completos do operador.
- A Fase 13 registra chamadas da ponte PHP de leitura como `miauw_agent_node_read_tool` em `miauw_tool_traces`, com nome da tool, chaves dos argumentos, duracao e tamanho da resposta. Nao gravar token, payload bruto externo, SQL, stack trace ou dados completos do operador nesse trace.
- A Fase 14 registra chamadas da ponte PHP universal como `miauw_agent_node_tool_bridge`, com nome da tool, chaves dos argumentos, modo, risco, duracao, status e se a escrita ocorreu via PHP bridge. Acoes fortes devem aparecer como `confirmation_required`, sem payload bruto, token, SQL ou stack trace. Quando o Node for o motor oficial e pedir uma acao forte, o evento estruturado volta ao PHP para criar `pending_confirmation` na sessao real do operador antes de qualquer `confirmed`/`ok`.
- Comandos de Gestao pelo Miauby usam tool controlada `criar_conta_gestao`: primeiro geram trace de confirmacao, depois a Gestao grava `gestao_conta_criada_miauby` somente apos confirmacao humana. O trace/log nao deve guardar token interno nem payload bruto.
- A Fase 15 registra respostas locais do roteador de estilo como `miauw_style_router` em `miauw_tool_traces`, guardando apenas intent, versao de estilo e se veio do widget. O trace nao deve salvar mensagem completa, resposta completa, memoria bruta, token, SQL ou payload externo.
- A Fase 16 registra feedback/revisao do Treinador do Miauby em `wf_logs` como `miauw_treino_resposta` e `miauw_revisao_treino`; o conteudo completo fica em `miauw_treinos_respostas`, sanitizado e versionado, sem apagar pergunta/resposta original.
- A Fase 17 registra resposta local baseada em treino aprovado como `miauw_training_router` em `miauw_tool_traces`, salvando apenas score, intent, versao e flags seguras, sem payload bruto, segredo ou texto completo do operador.
- A Fase 19 registra transcricao de audio como `miauw_audio_transcribe` em `miauw_tool_traces`, guardando somente tamanho do arquivo temporario, tamanho do texto, modo, modelo e status sanitizado. O arquivo de audio nao e armazenado e a fala so vira mensagem depois que o usuario revisar e apertar `Enviar`.
- Acoes fortes do Miauby devem gerar trace `pending_confirmation`, depois `confirmed`/`cancelled` e somente entao `ok`/`error` quando houver execucao real.
- Falhas em acoes confirmadas do Miauby registram diagnostico invisivel automatico com `trace_id`, ferramenta, id da confirmacao, resumo sanitizado e chaves dos argumentos, alem do trace `error` em `miauw_tool_traces`. O painel `/miauw/diagnostico.php` mostra esses dados de forma resumida, sem token, SQL bruto, payload completo ou stack trace.
- Mudancas automaticas por jobs devem registrar origem quando possivel.
- O bridge WhatsApp deve registrar eventos externos em `miauw_whatsapp_events` com status, tentativa, motivo de ignorado, trace id e metadados sanitizados; a outbox registra envio/resposta sem telefone cru nem payload bruto. Quando o contato estiver vinculado a `core_users`, o bridge envia `user_context` com id/username para contexto, memoria e execucao confirmada, permitindo auditoria por usuario real em acoes como sangria. Audio e imagem de comprovante Pix devem guardar somente metadados/extracao sanitizada, nunca bytes ou URL/token de midia. Falhas de OCR Pix entram em `miauw_whatsapp_error_logs` com origem `pix_receipt_ocr` e resumo suficiente para correcao.

## Decisoes tecnicas ja tomadas

- Cada modulo importante tem suas tabelas de auditoria.
- Docker logs sao a primeira fonte para erros PHP/Apache/MySQL.
- Miauby possui estrutura propria de alertas/padroes.

## Riscos ao alterar

- Remover auditoria dificulta investigar divergencias.
- Logs excessivos podem vazar dados internos.
- Falta de correlacao entre usuario e acao prejudica suporte.

## Pendencias

- Padronizar formato de auditoria entre modulos.
- Criar tela unificada de diagnostico/logs.
- Definir retencao de logs.
- Criar alertas para falhas de jobs, OpenAI, DNS/SSL e banco.

## Evolucao futura

- Expandir IDs de correlacao por request para outros modulos alem do Miauby.
- Criar painel de saude do sistema.
- Integrar Miauby para resumir erros recorrentes.
- Exportar auditoria para CSV quando necessario.
