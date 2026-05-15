# 15 - Logs e auditoria

## O que esta parte do sistema faz

Mapeia onde o sistema registra eventos, acoes e sinais de diagnostico.

## Arquivos, tabelas e servicos envolvidos

Logs de container:

- `docker compose logs wimifarma-com-web`
- `docker compose logs wimifarma-com-db`
- `docker compose logs wimifarma-cotacao-app`

Tabelas de auditoria/log:

- `wf_logs`
- `cotacao_auditoria`
- `financeiro_auditoria`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_farmacia_popular_atualizacoes`
- `wptl_loginizer_logs`

Arquivos:

- `site/cashback/functions.php`
- `site/codigos/codigos-funcoes.php`
- `apps/cotacao/src/server.js`
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

- Adicionar IDs de correlacao por request.
- Criar painel de saude do sistema.
- Integrar Miauby para resumir erros recorrentes.
- Exportar auditoria para CSV quando necessario.
