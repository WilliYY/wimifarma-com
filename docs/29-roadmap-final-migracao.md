# 29 - Auditoria geral e roadmap final da migracao

## Objetivo

Registrar o estado do projeto em 2026-06-02, os checks executados, os riscos ainda abertos e a ordem segura para finalizar a migracao sem quebrar modulos em producao.

Este documento deve ser lido junto de:

- `AGENTS.md`;
- `README.md`;
- `docs/22-migracao-mysql-postgres.md`;
- `docs/24-modernizacao-modulos.md`;
- `docs/26-inventario-modulos.md`;
- `docs/28-miauby-migracao.md`.

## Resultado da auditoria de 2026-06-02

### Local

Validacoes executadas em `C:\Users\Thiesen\Desktop\wimifarma-com`:

- `git status --short --branch`: branch `main` limpa e alinhada com `origin/main`.
- `scripts/check-secrets.ps1`: nenhum segredo obvio encontrado em arquivos versionados.
- `scripts/audit-modernization.ps1`: confirmou os modulos operacionais em Node/Postgres e os bloqueios restantes em Miauby interno, WordPress e migradores.
- `npm run check` em `apps/core-auth`, `apps/cashback`, `apps/cotacao`, `apps/gestao`, `apps/pedidos`, `apps/tarefa`, `apps/xp`, `apps/codigos`, `apps/financeiro`, `apps/usuarios`, `apps/miauw-agent`, `apps/miauw-whatsapp` e `apps/miauby`: todos passaram.
- `npm run build` nos apps TypeScript e `npm run typecheck`/`npm run build:ts` na Cotacao: todos passaram.
- `npm audit --omit=dev --audit-level=high` em todos os apps: zero vulnerabilidades altas reportadas.
- Varredura de pendencias textuais em codigo (`TODO|FIXME|HACK|BUG|XXX`): sem pendencia acionavel; o unico match foi falso positivo em texto de produto `AZITRO SUSP (TODOS)`.

Observacao: o Docker nao esta disponivel nesta maquina local Windows, entao a validacao de Compose/containers foi feita no VPS oficial.

### VPS

Validacoes executadas em `/home/ubuntu/projetos/wimifarma-com`:

- `docker compose config --quiet`: passou.
- `docker compose ps` e `docker ps -a`: os containers principais estavam `Up`; `wimifarma-cotacao-db` e `wimifarma-cotacao-redis` tambem estavam `Up` via `docker ps`, apesar de nao aparecerem na lista de servicos do Compose atual por diferenca de labels/deploy antigo.
- Health publico via Apache local `127.0.0.1:3002`: `/`, `/cashback/health`, `/codigos/health`, `/cotacao/health`, `/financeiro/health`, `/gestao/health`, `/pedidos/health`, `/tarefa/health`, `/usuarios/health`, `/xp/health`, `/miauw/agent/health`, `/miauw/whatsapp/health`, `/miauby/agent/health` e `/miauby/whatsapp/health` responderam HTTP 200.
- Logs dos apps principais nos ultimos 45 minutos filtrados por erro/falha fatal: sem ocorrencia retornada.
- Readiness interna do `wimifarma-miauby-app`: HTTP 200, `ok=true`, `mode=shadow_readiness`, paridade 12/12 tabelas, zero divergencia de contagem/amostra e flags seguras (`write_enabled=false`, `route_cutover_enabled=false`, `public_proxy_enabled=false`).

Observacao operacional: `docker compose ps -a` mostrou dois containers antigos em estado `Created` (`9c26d1fff654_wimifarma-usuarios-app` e `c1a93d26bef8_wimifarma-miauw-agent`). Eles nao parecem estar servindo trafego porque existem containers oficiais homonimos `Up`; limpar isso deve ser uma tarefa separada, conferindo labels, mounts e logs antes de remover qualquer container.

## Diagnostico

O projeto esta saudavel nos checks automaticos e na saude dos containers. Nao apareceu bug imediato de build, tipo, dependencia alta, segredo versionado, health publico ou erro recente de runtime.

O que ainda impede dizer "migracao 100% finalizada":

1. Miauby interno ainda tem o chat oficial em `site/miauw` PHP/MySQL.
2. `apps/miauby` ja esta forte em sombra Node/Postgres, mas ainda esta corretamente sem escrita, sem corte de rota e sem proxy publico.
3. `apps/core-auth` ainda guarda o sincronizador/importador MySQL por seguranca historica de usuarios.
4. `apps/miauby` ainda tem `mysql2` por causa do migrador sombra, nao por causa do app vivo.
5. WordPress ainda usa MySQL por natureza do proprio WordPress.

Resumo pratico: os modulos internos operacionais ja estao modernos. O grande bloqueio real agora e cortar o Miauby interno com calma; depois vem decidir o futuro do WordPress/site publico para zerar MySQL de verdade.

## Roadmap para finalizar a migracao 100%

### Fase 0 - Baseline antes de cada corte

Antes de cada etapa de corte:

- confirmar `git status` limpo;
- rodar `scripts/check-secrets.ps1`;
- rodar `npm run check` nos apps tocados;
- rodar build do app tocado;
- validar `docker compose config --quiet` no VPS;
- validar health dos endpoints envolvidos;
- fazer backup/dump dos bancos que a fase pode afetar;
- documentar rollback por env/commit.

### Fase 1 - Miauby interno Etapa 5B: adaptador de escrita desligado

Objetivo: preparar o Node/Postgres para escrever conversas, mensagens, traces, memorias e eventos, mas com escrita desligada por variavel de ambiente.

Estado em 2026-06-02: iniciado em `apps/miauby` com adaptador interno desligado. Foram preparados contratos tipados, plano de idempotencia, endpoints internos tokenizados de status/plano/dry-run, flags seguras (`MIAUBY_WRITES_ENABLED=false`, `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false`) e schema de intencao/auditoria criado pelo migrador (`miauby_write_intents`, `miauby_write_audit_events`). Nenhuma escrita real foi habilitada e `/miauw/` continua oficial.

Regras:

- nao trocar `/miauw/`;
- nao trocar resposta oficial;
- nao ligar `write_enabled`;
- nao executar tools pelo `apps/miauby`;
- nao remover PHP;
- nao remover MySQL;
- criar apenas contratos, schema, idempotencia, logs/auditoria e dry-run.
- manter `MIAUBY_WRITES_ENABLED=false` e `MIAUBY_WRITE_ADAPTER_DRY_RUN_ENABLED=false` ate a Etapa 5C.

Validacao esperada:

- `apps/miauby` check/build;
- migrador sombra `migrate` e `validate`;
- readiness 12/12 sem divergencia;
- smoke do pacote canonico;
- smoke do adaptador 5B confirmando status bloqueado, plano sanitizado e dry-run bloqueado por env;
- teste de rollback com escrita ainda desligada.

### Fase 2 - Miauby interno Etapa 5C: shadow write/dry-run

Objetivo: o PHP oficial continua gravando no MySQL, mas o Node recebe a intencao de escrita em modo sombra, compara payload sanitizado e registra divergencia sem afetar usuario.

Regras:

- se houver divergencia, parar e corrigir;
- manter `route_cutover_enabled=false`;
- manter `public_proxy_enabled=false`;
- manter resposta final do PHP.

### Fase 3 - Miauby interno Etapa 6: corte controlado por usuario

Objetivo: liberar o motor Node oficial apenas para `adm` ou usuarios listados, mantendo rollback imediato por env.

Ordem segura:

1. Node usa contexto canonico como fonte primaria com fallback PHP.
2. Resposta Node oficial somente para `adm`.
3. Escrita ainda por PHP ou por adaptador Node com flag por usuario.
4. Comparar voz, latencia, tools, confirmacoes e diagnostico por alguns dias.

### Fase 4 - Miauby interno Etapa 7: escrita oficial em Postgres

Objetivo: `wimifarma_miauby` vira fonte oficial para conversas, mensagens, treino, memorias, alertas e traces.

Regras:

- congelar escrita nova em `miauw_*` somente depois de backup e delta final;
- manter alias/rollback `/miauw/`;
- manter dumps e checksums;
- manter confirmacoes humanas para escrita forte;
- nunca gravar telefone cru, midia, audio bruto, segredo, SQL bruto ou stack trace completo.

### Fase 5 - Remover dependencia MySQL do core-auth

Quando todos os usuarios estiverem estaveis em `core_users` e nao houver mais necessidade de importacao legado:

- arquivar/desligar `apps/core-auth/src/sync-users.ts`;
- remover `mysql2` de `apps/core-auth`;
- remover variaveis MySQL do fluxo normal do core;
- manter dump historico de `wf_users`.

### Fase 6 - Decidir WordPress/site publico

Se o objetivo for "100% sem MySQL", WordPress precisa sair ou virar excecao temporaria.

Opcoes:

- Manter WordPress: migracao interna fica 100%, mas MySQL continua existindo isolado para WordPress.
- Trocar site publico: criar site novo fora do WordPress, preferencialmente depois do corte do Miauby. Next.js e Prisma podem entrar aqui como piloto seguro, usando Postgres e deploy com rollback.

Nao tentar converter WordPress para Postgres por plugin sem prova longa, backup e rollback. O caminho mais limpo para zero MySQL e substituir o site publico.

### Fase 7 - Descomissionar MySQL

Somente depois de Miauby interno e WordPress resolvidos:

- rodar auditoria final de `mysql2`, `mysqli`, `pdo_mysql`, `MYSQL_*` e `wimifarma-com-db`;
- exportar dumps finais;
- congelar bancos antigos;
- remover containers/variaveis/dependencias MySQL que sobrarem;
- atualizar docs e runbooks;
- validar todos os health checks por alguns dias.

## Ordem recomendada agora

1. Miauby interno Etapa 5B: adaptador de escrita desligado em Node/Postgres.
2. Miauby interno Etapa 5C: shadow write/dry-run.
3. Miauby interno corte por usuario `adm`.
4. Miauby interno escrita oficial em Postgres.
5. Remover sincronizador MySQL do core-auth.
6. Decidir WordPress: manter como excecao ou substituir por site novo.
7. Se substituir WordPress, iniciar piloto Next.js/Prisma/Postgres.
8. Auditoria final e retirada do MySQL.

## Prompt para a proxima conversa

```text
Estamos no projeto C:\Users\Thiesen\Desktop\wimifarma-com, repositorio https://github.com/WilliYY/wimifarma-com.

Siga obrigatoriamente AGENTS.md, README.md e docs/29-roadmap-final-migracao.md. Para Miauby, leia tambem docs/28-miauby-migracao.md e docs/22-migracao-mysql-postgres.md.

Quero iniciar a proxima etapa segura da migracao 100%: Miauby interno Etapa 5B.

Objetivo da etapa: criar/preparar no apps/miauby um adaptador de escrita Node/Postgres desligado por variavel de ambiente, com contratos tipados, idempotencia, auditoria e rollback, mas sem trocar a resposta oficial do PHP, sem trocar /miauw/, sem habilitar escrita real, sem remover MySQL e sem quebrar o chat atual.

Antes de alterar arquivos:
- leia AGENTS.md, README.md e docs relevantes;
- mapeie os pontos atuais de escrita do Miauby PHP em site/miauw;
- proponha a menor primeira fatia;
- implemente apenas essa fatia;
- valide check/build/health/readiness;
- atualize documentacao;
- commit/push e deploy apenas se aplicavel.

Nao quebre nada e valide cada etapa.
```
