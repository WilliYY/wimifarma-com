# 24 - Modernizacao dos modulos

## Objetivo

Registrar quais partes ainda usam modelo antigo e qual caminho seguro leva para Node.js, TypeScript e PostgreSQL sem quebrar a operacao atual.

Este documento e inventario/planejamento operacional. Atualizacoes de migracao devem registrar a rota oficial, a dependencia legada restante e o proximo passo seguro sem apagar rollback.

## Como ver o inventario

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
powershell -ExecutionPolicy Bypass -File scripts\audit-modernization.ps1
```

Para automacao ou comparacao:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\audit-modernization.ps1 -Json
```

No VPS/Linux:

```bash
cd /home/ubuntu/projetos/wimifarma-com
bash scripts/audit-modernization.sh
```

O script mostra:

- modulo;
- stack atual;
- dependencia legada;
- alvo tecnico;
- prioridade;
- arquivos escaneados;
- referencias legadas encontradas;
- proximo passo recomendado.

## Leitura atual

| Modulo | Estado atual | Legado principal | Alvo recomendado | Prioridade |
| --- | --- | --- | --- | --- |
| Cotacao | Node.js + Express + Postgres/Redis | `mysql2` para login `wf_users` | TypeScript + core auth Postgres | 1 |
| Gestao | Node.js + TypeScript + Postgres | `mysql2` para login/log/importacao | Postgres puro + core auth/auditoria | 1 |
| Pedidos | Node.js + TypeScript + Postgres da Gestao | `mysql2` para login/log | Postgres puro + core auth/auditoria | 1 |
| Tarefa | Node.js + TypeScript + Postgres | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 2 em corte |
| Codigos | Node.js + TypeScript + Postgres | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 3 em corte |
| XP | Node.js + TypeScript + Postgres | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 4 em corte |
| Financeiro | PHP oficial + Node.js/TypeScript/Postgres sombra | `financeiro_*` ainda fonte da tela PHP | Cortar `/financeiro/` para Node.js + TypeScript + Postgres apos paridade | 5 em sombra |
| Cashback | PHP procedural + MySQL | clientes, compras, creditos, resgates | `apps/cashback` Node.js + TypeScript + Postgres | 6 |
| Miauby interno | PHP + Node agent sombra | `miauw_*` em MySQL | Node agent + Postgres `wimifarma_miauw` | 7 |
| Miauby WhatsApp | Node.js + TypeScript + Postgres | sem MySQL operacional | manter/evoluir | moderno |
| Home publica | PHP desacoplado do WordPress | PHP simples, sem banco direto | manter ou trocar depois | baixo |
| WordPress | WordPress + MySQL | dependencia natural do WP | substituir/desacoplar se quiser zero MySQL | ultimo |

## Ordem segura

1. Observar Cotacao/Gestao/Pedidos em modo sombra no core auth sem divergencias.
2. Cortar autenticacao desses tres modulos para `core_users`, mantendo rollback por `.env`.
3. Validar Tarefa com `TAREFA_AUTH_PROVIDER=core` e legado MySQL desligado por flags.
4. Observar XP e Codigos em `/xp/` e `/codigos/` com health, login e checks de paridade antes de desligar flags legadas.
5. Validar Financeiro sombra com backup, checksums de totais e validacao por dia; depois cortar Financeiro ou iniciar Cashback.
6. Migrar o Miauby interno em fases, junto do `apps/miauw-agent`.
7. Decidir se WordPress continua isolado em MySQL ou se o site publico sera substituido.

## Proxima fatia tecnica

Tarefa ja foi cortado para `apps/tarefa` com Postgres dedicado:

- banco/schema alvo `wimifarma_tarefa`;
- tabela `tarefa_tasks` com `legacy_mysql_id`;
- importador idempotente MySQL -> Postgres;
- health em `/tarefa/health`;
- badge preservado em `/tarefa/badge.php`;
- auth oficial pode usar `core_users` por `TAREFA_AUTH_PROVIDER=core`;
- legado MySQL pode ser desligado por `TAREFA_LEGACY_MYSQL_IMPORT_ENABLED=false`, `TAREFA_LEGACY_MYSQL_MIRROR_ENABLED=false` e `TAREFA_LEGACY_MYSQL_LOGS_ENABLED=false`.

XP foi cortado para `apps/xp`:

- banco/schema alvo `wimifarma_xp`;
- tabelas `xp_employees`, `xp_sales`, `xp_settings`, `xp_audit_events` e `xp_sessions`;
- importador idempotente de `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings`;
- proxy Apache oficial em `/xp/`;
- frontend preservado por CSS/JS/assets de `site/xp` e uploads compartilhados;
- rollback por `XP_AUTH_PROVIDER=mysql` e flags `XP_LEGACY_MYSQL_*`.

Codigos foi cortado para `apps/codigos`:

- banco/schema alvo `wimifarma_codigos`;
- tabelas `codigos_items`, `codigos_groups`, `codigos_audit_events` e `codigos_sessions`;
- importador idempotente de `wf_codigos_comissao` e `wf_codigos_blocos`;
- proxy Apache oficial em `/codigos/`;
- endpoints internos tokenizados para o Miauby ler a fonte Postgres;
- frontend preservado por CSS/JS/login-runner de `site/codigos`;
- rollback por `CODIGOS_AUTH_PROVIDER=mysql` e flags `CODIGOS_LEGACY_MYSQL_*`.

Financeiro iniciou sombra em `apps/financeiro`:

- banco/schema alvo `wimifarma_financeiro`;
- tabelas `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events` e `financeiro_migration_runs`;
- importador idempotente de `financeiro_fechamentos`, `financeiro_lancamentos`, `financeiro_sangrias`, `financeiro_maquininhas`, `financeiro_pix`, `financeiro_configuracoes` e `financeiro_auditoria`;
- health em `wimifarma-financeiro-app:3800/financeiro/health`;
- endpoints internos tokenizados para resumo, checksum e sync manual;
- sem proxy Apache e sem troca de frontend enquanto a tela PHP for oficial.

A proxima fatia segura e validar a sombra do Financeiro no VPS com checksums por data/tipo e smoke dos fluxos de Caixa/Relatorio/Pix CNPJ. So depois escolher entre cortar `/financeiro/` para Node/Postgres ou iniciar Cashback.
