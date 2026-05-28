# 24 - Modernizacao dos modulos

## Objetivo

Registrar quais partes ainda usam modelo antigo e qual caminho seguro leva para Node.js, TypeScript e PostgreSQL sem quebrar a operacao atual.

Esta etapa e inventario/planejamento operacional. Ela nao troca rotas, nao remove PHP, nao corta MySQL e nao altera dados.

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
| Tarefa | Node.js + TypeScript + Postgres | `mysql2` para login/log/importacao/espelho curto | Postgres puro + core auth/auditoria | 2 em validacao |
| Codigos | PHP procedural + MySQL | `wf_codigos_comissao`, `wf_codigos_blocos` | `apps/codigos` Node.js + TypeScript + Postgres | 3 |
| XP | PHP procedural + MySQL | `wf_xp_employees`, `wf_xp_sales`, `wf_xp_settings` | `apps/xp` Node.js + TypeScript + Postgres | 4 |
| Financeiro | PHP procedural + MySQL | `financeiro_*` | `apps/financeiro` Node.js + TypeScript + Postgres | 5 |
| Cashback | PHP procedural + MySQL | clientes, compras, creditos, resgates | `apps/cashback` Node.js + TypeScript + Postgres | 6 |
| Miauby interno | PHP + Node agent sombra | `miauw_*` em MySQL | Node agent + Postgres `wimifarma_miauw` | 7 |
| Miauby WhatsApp | Node.js + TypeScript + Postgres | sem MySQL operacional | manter/evoluir | moderno |
| Home publica | PHP desacoplado do WordPress | PHP simples, sem banco direto | manter ou trocar depois | baixo |
| WordPress | WordPress + MySQL | dependencia natural do WP | substituir/desacoplar se quiser zero MySQL | ultimo |

## Ordem segura

1. Observar Cotacao/Gestao/Pedidos em modo sombra no core auth sem divergencias.
2. Cortar autenticacao desses tres modulos para `core_users`, mantendo rollback por `.env`.
3. Observar Tarefa em Node/Postgres com contagens, badge, login, tela e espelho MySQL temporario.
4. Repetir o padrao em Codigos.
5. Migrar XP com checksum de vendas/XP e preservacao de uploads.
6. Migrar Financeiro e Cashback com backup, checksums de totais e validacao por dia/cliente.
7. Migrar o Miauby interno em fases, junto do `apps/miauw-agent`.
8. Decidir se WordPress continua isolado em MySQL ou se o site publico sera substituido.

## Proxima fatia tecnica

Tarefa ja foi cortado para `apps/tarefa` com Postgres dedicado:

- banco/schema alvo `wimifarma_tarefa`;
- tabela `tarefa_tasks` com `legacy_mysql_id`;
- importador idempotente MySQL -> Postgres;
- health em `/tarefa/health`;
- badge preservado em `/tarefa/badge.php`;
- espelho MySQL temporario por `TAREFA_LEGACY_MYSQL_MIRROR_ENABLED=true`.

A proxima fatia segura e `Codigos`: criar `apps/codigos`, importar `wf_codigos_comissao` e `wf_codigos_blocos`, validar contagens/amostras e so entao trocar a rota.
