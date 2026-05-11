# 15 - Logs e auditoria

## O que esta parte do sistema faz

Mapeia onde o sistema registra eventos, acoes e sinais de diagnostico.

## Arquivos, tabelas e servicos envolvidos

Logs de container:

- `docker compose logs wimifarma-com-web`
- `docker compose logs wimifarma-com-db`

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
- `site/cotacao/cotacao-funcoes.php`
- `site/financeiro/financeiro-funcoes.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-funcoes.php`

## Regras que precisam ser preservadas

- Acoes financeiras e de cotacao devem manter auditoria.
- Logs nao devem gravar senhas, tokens ou chaves.
- Eventos de Miauby devem preservar contexto suficiente para diagnostico sem expor segredos.
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
