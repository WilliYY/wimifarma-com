# 15 - Logs e auditoria

## O que esta parte do sistema faz

Mapeia onde o sistema registra eventos, acoes e sinais de diagnostico.

## Arquivos, tabelas e servicos envolvidos

Logs de container:

- `docker compose logs wimifarma-com-web`
- `docker compose logs wimifarma-com-db`
- `docker compose logs wimifarma-cotacao-app`
- `docker compose logs wimifarma-miauw-agent`

Tabelas de auditoria/log:

- `wf_logs`
- `cotacao_auditoria`
- `financeiro_auditoria`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_tool_traces`
- `miauw_farmacia_popular_atualizacoes`
- `wptl_loginizer_logs`

Arquivos:

- `site/cashback/functions.php`
- `site/codigos/codigos-funcoes.php`
- `apps/cotacao/src/server.js`
- `apps/miauw-agent/src/server.ts`
- `site/financeiro/financeiro-funcoes.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-funcoes.php`

## Regras que precisam ser preservadas

- Acoes financeiras e de cotacao devem manter auditoria.
- O Financeiro nao exibe mais a aba/tela operacional de Auditoria no topo, mas deve continuar gravando `financeiro_auditoria`.
- Logs nao devem gravar senhas, tokens ou chaves.
- Códigos registra criacao de blocos, criacao de itens, edicao, reordenacao e exclusao logica em `wf_logs`; autosave pode gerar mais eventos de edicao, entao os logs devem continuar sem segredos.
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
- Acoes fortes do Miauby devem gerar trace `pending_confirmation`, depois `confirmed`/`cancelled` e somente entao `ok`/`error` quando houver execucao real.
- Mudancas automaticas por jobs devem registrar origem quando possivel.

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
