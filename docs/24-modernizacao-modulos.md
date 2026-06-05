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
| Cotacao | Node.js + Express + Postgres/Redis + core auth | sem dependencia MySQL no app | TypeScript em fases; Fase 3 helpers TS sombra sem troca de runtime | moderno |
| Gestao | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Pedidos | Node.js + TypeScript + Postgres da Gestao + core auth | sem dependencia MySQL no app | manter health/auditoria e validar rotinas n8n/Miauby | moderno |
| Tarefa | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Codigos | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| XP | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Financeiro | Node.js + TypeScript + Postgres oficial | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Usuarios | Node.js + TypeScript + Postgres core | sem MySQL operacional para usuarios novos | evoluir enforcement por modulo | moderno |
| Login / Senha | Node.js + TypeScript + Postgres dedicado | sem legado MySQL/PHP | cofre cifrado + permissao explicita + auditoria | moderno |
| Cashback | Node.js + TypeScript + Postgres + core auth | sem dependencia MySQL no app desde 2026-05-30 | Postgres puro + core auth/auditoria | moderno |
| Miauby interno | PHP + Node agent sombra + servico/migrador Postgres sombra + core auth | `miauw_*` oficial em MySQL, copia sanitizada em `wimifarma_miauby` com paridade interna | Node/TypeScript + Postgres `wimifarma_miauby`, com alias/fallback `miauw` ate corte | 7 |
| Miauby WhatsApp | Node.js + TypeScript + Postgres | sem MySQL operacional | manter/evoluir | moderno |
| Home publica | PHP desacoplado do WordPress | PHP simples, sem banco direto | manter ou trocar depois | baixo |
| WordPress | WordPress + MySQL | dependencia natural do WP | substituir/desacoplar se quiser zero MySQL | ultimo |

## Ordem segura

1. Cotacao, Gestao, Pedidos, Tarefa, Codigos, Cashback e Financeiro ja usam apenas `core_users`, sem fallback MySQL no codigo.
1.1. Cotacao deve migrar para TypeScript em fases pequenas: Fase 1 ja adicionou tooling/typecheck sem mudar runtime, Fase 2 ja criou contratos TS para dominio, APIs, sessao, env e Socket.IO, e Fase 3 segue com helpers TS sombra; proximas fases devem extrair mais helpers pequenos, preservando frontend e Socket.IO.
2. Manter rollback por `.env` somente onde ainda existir fallback, mas sem deixar MySQL como caminho normal de login. Pedidos, Gestao e Financeiro nao tem mais fallback MySQL no codigo.
2.1. Usar `/usuarios/` como painel central para criar logins novos, vincular XP e registrar permissoes por modulo antes de aplicar bloqueio em cada rota.
3. Validar Tarefa em Postgres puro no VPS: `/tarefa/health`, login, tarefas publicas/privadas, badge da home e Miauby sem `mysql2`.
4. XP e Codigos ja foram limpos em 2026-05-30; validar `/xp/health`, login, ranking, lancamentos, fotos e mini-card sem reintroduzir `mysql2`.
5. Observar Financeiro em `/financeiro/` como Postgres puro; se houver rollback, restaurar versao anterior e backup, depois repetir checksums por dia/tipo, Caixa, Relatorio, exportacao e contrato Pix CNPJ do Miauby.
6. Cashback esta em `/cashback/` sem `mysql2`, importador, espelho ou fallback MySQL; rollback exige restaurar commit/imagem anterior e backup, depois repetir saldos por cliente, CSV, mensagens e autoteste.
7. Migrar o Miauby interno em fases, junto do `apps/miauw-agent`, usando `Miauby` como nome canonico e mantendo `miauw` como compatibilidade tecnica ate validacao.
8. Decidir se WordPress continua isolado em MySQL ou se o site publico sera substituido.

## Proxima fatia tecnica

Direcao futura proposta: Next.js e Prisma foram registrados em 2026-05-30 como tecnologias que o usuario quer usar. Isso nao muda a migracao atual dos modulos ja cortados. O uso recomendado e comecar por piloto isolado, como novo site publico, painel novo ou modulo novo, mantendo Express + SQL direto nos modulos ja estabilizados ate haver decisao especifica, testes, rollback e validacao de frontend.

Tarefa ja foi cortado para `apps/tarefa` com Postgres dedicado:

- banco/schema alvo `wimifarma_tarefa`;
- tabela `tarefa_tasks` com `legacy_mysql_id`;
- health em `/tarefa/health`;
- badge preservado em `/tarefa/badge.php`;
- auth oficial usa somente `core_users`;
- sem `mysql2`, importador, espelho, fallback `wf_users`, `TAREFA_AUTH_PROVIDER` ou flags `TAREFA_LEGACY_MYSQL_*` desde 2026-05-30.

XP foi cortado para `apps/xp`:

- banco/schema alvo `wimifarma_xp`;
- tabelas `xp_employees`, `xp_sales`, `xp_settings`, `xp_audit_events` e `xp_sessions`;
- proxy Apache oficial em `/xp/`;
- frontend preservado por CSS/JS/assets de `site/xp` e uploads compartilhados;
- sem `mysql2`, importador, espelho, fallback `wf_users`, `XP_AUTH_PROVIDER` ou flags `XP_LEGACY_MYSQL_*` desde 2026-05-30.

Codigos foi cortado para `apps/codigos`:

- banco/schema alvo `wimifarma_codigos`;
- tabelas `codigos_items`, `codigos_groups`, `codigos_audit_events` e `codigos_sessions`;
- proxy Apache oficial em `/codigos/`;
- endpoints internos tokenizados para o Miauby ler a fonte Postgres;
- frontend preservado por CSS/JS/login-runner de `site/codigos`;
- sem `mysql2`, importador, espelho, fallback `wf_users`, `CODIGOS_AUTH_PROVIDER` ou flags `CODIGOS_LEGACY_MYSQL_*` desde 2026-05-30.

Financeiro foi cortado para `apps/financeiro`:

- banco/schema alvo `wimifarma_financeiro`;
- tabelas `financeiro_closings`, `financeiro_entries`, `financeiro_sangrias`, `financeiro_card_entries`, `financeiro_pix_entries`, `financeiro_settings`, `financeiro_audit_events`, `financeiro_migration_runs`, `financeiro_internal_idempotency` e sessoes `financeiro_sessions`;
- health em `wimifarma-financeiro-app:3800/financeiro/health`;
- proxy Apache oficial em `/financeiro/`;
- frontend preservado por `site/financeiro/styles.css`, `site/financeiro/app.js`, `site/financeiro/login-runner.js`, logo/favicon e assets montados no container Node;
- login oficial por `core_users`;
- endpoints internos tokenizados para resumo, dia, checksums por dia/tipo, auditoria recente, lancamentos, faturamentos e sync manual;
- sem `mysql2`, importador, espelho, fallback `wf_users`, `FINANCEIRO_AUTH_PROVIDER` ou flags `FINANCEIRO_LEGACY_MYSQL_*` desde 2026-05-30; rollback MySQL exige restaurar versao anterior e backup validado.

Cashback foi cortado para `apps/cashback`:

- banco/schema alvo `wimifarma_cashback`;
- tabelas `cashback_attendants`, `cashback_clients`, `cashback_purchases`, `cashback_credits`, `cashback_redemptions`, `cashback_redemption_items`, `cashback_settings`, `cashback_whatsapp_messages`, `cashback_audit_events`, `cashback_migration_runs` e `cashback_sessions`;
- proxy Apache oficial em `/cashback/`;
- frontend preservado por `site/cashback/styles.css`, `site/cashback/app.js`, `site/cashback/login-runner.js`, logo/favicon e GIFs montados no container Node;
- login unico por `core_users`;
- endpoints internos tokenizados para resumo/status por `CASHBACK_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`;
- sem `mysql2`, flags legadas de Cashback, importador, espelho ou fallback MySQL desde 2026-05-30; rollback MySQL exige restaurar commit/imagem anterior e backup.

Gestao esta cortada em `apps/gestao`:

- banco/schema alvo `wimifarma_gestao`;
- tabelas `gestao_accounts`, `gestao_account_items`, `gestao_account_payments`, `gestao_audit_events`, `gestao_notepad_notes`, `gestao_supplier_orders`, `gestao_schema_migrations` e `gestao_sessions`;
- proxy Apache oficial em `/gestao/`;
- login unico por `core_users`, restrito a `adm`, `admin` ou `gerente`;
- auditoria em `gestao_audit_events` e `core_audit_logs`;
- sem `mysql2`, flags `GESTAO_AUTH_*`, importador, espelho `wf_logs`, fallback `wf_users`, `depends_on` de MySQL ou variaveis `MYSQL_*` desde 2026-05-30; rollback MySQL exige restaurar commit/imagem anterior e backup.

Usuarios foi criado em `apps/usuarios`:

- rota/proxy oficial em `/usuarios/`;
- app Node.js 22 + TypeScript + Express;
- usa o Postgres core `wimifarma_core`;
- tabelas `core_user_module_permissions`, `core_user_xp_links`, `core_user_audit_events` e sessoes `usuarios_sessions`;
- login restrito a `adm` ou role `admin`;
- cria logins core novos com `legacy_mysql_id` negativo para nao conflitar com usuarios importados de `wf_users`;
- consulta `xp_employees` para vinculo logico entre login e funcionario XP.

Login / Senha foi criado em `apps/login-senha`:

- rota/proxy oficial em `/login-senha/`;
- app Node.js 22 + TypeScript + Express;
- banco/schema alvo `wimifarma_login_senha`;
- tabelas `login_senha_entries`, `login_senha_audit_events` e sessoes `login_senha_sessions`;
- login unico por `core_users`/`WFHOME_SSO`;
- permissao individual `login_senha` no painel Usuarios, default fechada para usuarios comuns;
- senhas cifradas por AES-256-GCM e auditoria sem valor de senha;
- sem legado MySQL/PHP, importador, espelho ou fallback.

A proxima fatia segura e validar Gestao e Cashback no VPS com `/gestao/health`, `/cashback/health`, login, fluxos principais e logs. Em paralelo, validar Usuarios com `/usuarios/health`, login admin, criacao/desativacao controlada, vinculo XP e auditoria. Depois, aplicar `core_user_module_permissions` em cada modulo existente por etapa, sem bloquear todos de uma vez.

## Miauby - proxima migracao grande

O Miauby interno e o proximo modulo de maior risco porque ainda concentra conversa, treino, memorias, alertas, traces e parte das tools em PHP/MySQL. A migracao deve seguir `docs/28-miauby-migracao.md`; a fase sombra ja tem Postgres, migrador idempotente e API interna de paridade somente leitura:

- nome de produto canonico: `Miauby`;
- prefixo tecnico legado preservado: `miauw`;
- alvo de banco: `wimifarma_miauby`, tabelas `miauby_*`;
- app/migrador sombra: `apps/miauby`, containers `wimifarma-miauby-migrator` e `wimifarma-miauby-app`;
- banco sombra: `wimifarma-miauby-db`, sem rota publica e sem efeito no frontend;
- API interna de paridade/leitura: `/miauby/health`, `/miauby/api/internal/status`, `/miauby/api/internal/parity?sample=5`, `/miauby/api/internal/readiness?sample=20` e `/miauby/api/internal/context?limit=3` apenas dentro da rede Docker;
- alias futuro: `/miauby/`, sem remover `/miauw/` no primeiro corte;
- env vars futuras `MIAUBY_*` com fallback para `MIAUW_*`;
- Node/TypeScript primeiro em sombra, depois corte por usuario;
- escrita forte sempre por confirmacao humana e endpoint interno do modulo dono.
