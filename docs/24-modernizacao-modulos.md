# 24 - Modernizacao dos modulos

## Objetivo

Registrar quais partes ainda usam modelo antigo e qual caminho seguro leva para Node.js, TypeScript e PostgreSQL sem quebrar a operacao atual.

Este documento e inventario/planejamento operacional. Atualizacoes de migracao devem registrar a rota oficial, a dependencia legada restante e o proximo passo seguro sem apagar rollback.

Para uma ficha mais profunda por modulo, com rotas, telas, permissoes, tabelas MySQL, arquivos PHP, fluxos de escrita, integracoes e riscos, use tambem `docs/26-inventario-modulos.md`.

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
| Cotacao | Node.js + Express + Postgres/Redis + core auth | sem dependencia MySQL no app | evoluir TypeScript quando houver janela segura | moderno |
| Gestao | Node.js + TypeScript + Postgres + core auth | `mysql2` para rollback opt-in de login, log e importacao | Postgres puro + core auth/auditoria | 1 |
| Pedidos | Node.js + TypeScript + Postgres da Gestao + core auth | sem dependencia MySQL no app | manter health/auditoria e validar rotinas n8n/Miauby | moderno |
| Tarefa | Node.js + TypeScript + Postgres + core auth | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 2 em corte |
| Codigos | Node.js + TypeScript + Postgres | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 3 em corte |
| XP | Node.js + TypeScript + Postgres | MySQL legado opcional por flags de rollback/import/log | Postgres puro + core auth/auditoria | 4 em corte |
| Financeiro | Node.js + TypeScript + Postgres oficial | MySQL legado desligado por padrao; rollback manual | Postgres puro + core auth/auditoria | moderno |
| Usuarios | Node.js + TypeScript + Postgres core | sem MySQL operacional para usuarios novos | evoluir enforcement por modulo | moderno |
| Cashback | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Miauby interno | PHP + Node agent sombra + core auth | `miauw_*` em MySQL e prefixo tecnico legado | Node/TypeScript + Postgres `wimifarma_miauby`, com alias/fallback `miauw` ate corte | 7 |
| Miauby WhatsApp | Node.js + TypeScript + Postgres | sem MySQL operacional | manter/evoluir | moderno |
| Home publica | PHP desacoplado do WordPress | PHP simples, sem banco direto | manter ou trocar depois | baixo |
| WordPress | WordPress + MySQL | dependencia natural do WP | substituir/desacoplar se quiser zero MySQL | ultimo |

## Ordem segura

1. Observar Gestao com `core_users` como login padrao e fallback MySQL desligado; Cotacao e Pedidos ja usam apenas `core_users`.
2. Manter rollback por `.env` onde ainda existir fallback, mas sem deixar MySQL como caminho normal de login. Pedidos nao tem mais fallback MySQL no codigo.
2.1. Usar `/usuarios/` como painel central para criar logins novos, vincular XP e registrar permissoes por modulo antes de aplicar bloqueio em cada rota.
3. Validar Tarefa com `TAREFA_AUTH_PROVIDER=core` como default e desligar legado MySQL de dados por flags depois de paridade.
4. Observar XP e Codigos em `/xp/` e `/codigos/` com health, login e checks de paridade antes de desligar flags legadas.
5. Observar Financeiro em `/financeiro/` sem espelho MySQL ativo; se houver rollback, religar flags/credenciais e repetir checksums por dia/tipo, Caixa, Relatorio, exportacao e contrato Pix CNPJ do Miauby.
6. Cashback esta em `/cashback/` sem `mysql2`, importador, espelho ou fallback MySQL; rollback exige restaurar commit/imagem anterior e backup, depois repetir saldos por cliente, CSV, mensagens e autoteste.
7. Migrar o Miauby interno em fases, junto do `apps/miauw-agent`, usando `Miauby` como nome canonico e mantendo `miauw` como compatibilidade tecnica ate validacao.
8. Decidir se WordPress continua isolado em MySQL ou se o site publico sera substituido.

## Proxima fatia tecnica

Tarefa ja foi cortado para `apps/tarefa` com Postgres dedicado:

- banco/schema alvo `wimifarma_tarefa`;
- tabela `tarefa_tasks` com `legacy_mysql_id`;
- importador idempotente MySQL -> Postgres;
- health em `/tarefa/health`;
- badge preservado em `/tarefa/badge.php`;
- auth oficial usa `core_users` por `TAREFA_AUTH_PROVIDER=core` por padrao;
- legado MySQL pode ser desligado por `TAREFA_LEGACY_MYSQL_IMPORT_ENABLED=false`, `TAREFA_LEGACY_MYSQL_MIRROR_ENABLED=false` e `TAREFA_LEGACY_MYSQL_LOGS_ENABLED=false`.

XP foi cortado para `apps/xp`:

- banco/schema alvo `wimifarma_xp`;
- tabelas `xp_employees`, `xp_sales`, `xp_settings`, `xp_audit_events` e `xp_sessions`;
- importador idempotente de `wf_xp_employees`, `wf_xp_sales` e `wf_xp_settings`;
- proxy Apache oficial em `/xp/`;
- frontend preservado por CSS/JS/assets de `site/xp` e uploads compartilhados;
- `XP_LEGACY_MYSQL_*` fica desligado por padrao desde 2026-05-30; rollback MySQL exige religar flags/provedor e reintroduzir credenciais explicitamente.

Codigos foi cortado para `apps/codigos`:

- banco/schema alvo `wimifarma_codigos`;
- tabelas `codigos_items`, `codigos_groups`, `codigos_audit_events` e `codigos_sessions`;
- importador idempotente de `wf_codigos_comissao` e `wf_codigos_blocos`;
- proxy Apache oficial em `/codigos/`;
- endpoints internos tokenizados para o Miauby ler a fonte Postgres;
- frontend preservado por CSS/JS/login-runner de `site/codigos`;
- `CODIGOS_LEGACY_MYSQL_*` fica desligado por padrao desde 2026-05-30; rollback MySQL exige religar flags/provedor e reintroduzir credenciais explicitamente.

Financeiro foi cortado para `apps/financeiro`:

- banco/schema alvo `wimifarma_financeiro`;
- tabelas `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events`, `financeiro_migration_runs`, `financeiro_internal_idempotency` e sessoes `financeiro_sessions`;
- importador idempotente de `financeiro_fechamentos`, `financeiro_lancamentos`, `financeiro_sangrias`, `financeiro_maquininhas`, `financeiro_pix`, `financeiro_configuracoes` e `financeiro_auditoria`;
- health em `wimifarma-financeiro-app:3800/financeiro/health`;
- proxy Apache oficial em `/financeiro/`;
- frontend preservado por `site/financeiro/styles.css`, `site/financeiro/app.js`, `site/financeiro/login-runner.js`, logo/favicon e assets montados no container Node;
- login oficial por `core_users` com `FINANCEIRO_AUTH_PROVIDER=core`;
- endpoints internos tokenizados para resumo, dia, checksums por dia/tipo, auditoria recente, lancamentos, faturamentos e sync manual;
- `FINANCEIRO_LEGACY_MYSQL_IMPORT_ENABLED=false` e `FINANCEIRO_LEGACY_MYSQL_MIRROR_ENABLED=false` por padrao desde 2026-05-29 apos paridade validada; import/espelho MySQL so deve voltar em rollback manual com credenciais explicitas.

Cashback foi cortado para `apps/cashback`:

- banco/schema alvo `wimifarma_cashback`;
- tabelas `cashback_attendants`, `cashback_clients`, `cashback_purchases`, `cashback_credits`, `cashback_redemptions`, `cashback_redemption_items`, `cashback_settings`, `cashback_whatsapp_messages`, `cashback_audit_events`, `cashback_migration_runs` e `cashback_sessions`;
- proxy Apache oficial em `/cashback/`;
- frontend preservado por `site/cashback/styles.css`, `site/cashback/app.js`, `site/cashback/login-runner.js`, logo/favicon e GIFs montados no container Node;
- login unico por `core_users`;
- endpoints internos tokenizados para resumo/status por `CASHBACK_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`;
- sem `mysql2`, flags legadas de Cashback, importador, espelho ou fallback MySQL desde 2026-05-30; rollback MySQL exige restaurar commit/imagem anterior e backup.

Usuarios foi criado em `apps/usuarios`:

- rota/proxy oficial em `/usuarios/`;
- app Node.js 22 + TypeScript + Express;
- usa o Postgres core `wimifarma_core`;
- tabelas `core_user_module_permissions`, `core_user_xp_links`, `core_user_audit_events` e sessoes `usuarios_sessions`;
- login restrito a `adm` ou role `admin`;
- cria logins core novos com `legacy_mysql_id` negativo para nao conflitar com usuarios importados de `wf_users`;
- consulta `xp_employees` para vinculo logico entre login e funcionario XP.

A proxima fatia segura e validar Cashback no VPS com `/cashback/health`, login, contagens importadas, saldos, compras, resgates, exportacao e mensagens. Em paralelo, validar Usuarios com `/usuarios/health`, login admin, criacao/desativacao controlada, vinculo XP e auditoria. Depois, aplicar `core_user_module_permissions` em cada modulo existente por etapa, sem bloquear todos de uma vez.

## Miauby - proxima migracao grande

O Miauby interno e o proximo modulo de maior risco porque ainda concentra conversa, treino, memorias, alertas, traces e parte das tools em PHP/MySQL. A migracao deve seguir `docs/28-miauby-migracao.md`:

- nome de produto canonico: `Miauby`;
- prefixo tecnico legado preservado: `miauw`;
- alvo de banco: `wimifarma_miauby`, tabelas `miauby_*`;
- alias futuro: `/miauby/`, sem remover `/miauw/` no primeiro corte;
- env vars futuras `MIAUBY_*` com fallback para `MIAUW_*`;
- Node/TypeScript primeiro em sombra, depois corte por usuario;
- escrita forte sempre por confirmacao humana e endpoint interno do modulo dono.
