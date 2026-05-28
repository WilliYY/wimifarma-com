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
| Tarefa | PHP procedural + MySQL | `wf_tarefas`, `wf_users`, `db()` | `apps/tarefa` Node.js + TypeScript + Postgres | 2 |
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
3. Criar `apps/tarefa` em sombra, com importador idempotente de `wf_tarefas` para Postgres.
4. Trocar `/tarefa/` para Node somente depois de contagem, amostras e smoke visual.
5. Repetir o padrao em Codigos.
6. Migrar XP com checksum de vendas/XP e preservacao de uploads.
7. Migrar Financeiro e Cashback com backup, checksums de totais e validacao por dia/cliente.
8. Migrar o Miauby interno em fases, junto do `apps/miauw-agent`.
9. Decidir se WordPress continua isolado em MySQL ou se o site publico sera substituido.

## Proxima fatia tecnica

A fatia mais segura apos a sombra de autenticacao e preparar `Tarefa` sem trocar a rota:

- criar banco/schema alvo `wimifarma_tarefa`;
- criar tabelas Postgres equivalentes a `wf_tarefas`, com `legacy_mysql_id`;
- criar importador idempotente MySQL -> Postgres;
- criar health/read-only API em Node;
- validar contagens e amostras;
- so depois apontar `/tarefa/` para Node.

Essa abordagem permite rollback simples: manter a rota PHP atual enquanto a nova base e o novo servico sao comparados.
