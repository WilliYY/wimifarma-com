# 27 - Limpeza de legado PHP/MySQL/WordPress

## O que foi analisado em 2026-05-29

Esta limpeza separou arquivos antigos que nao participam mais das rotas oficiais, preservando tudo em quarentena versionada para rollback manual. Nada de banco, dump, upload, cache sensivel ou volume Docker foi apagado.

Antes de mover arquivos, foram conferidos:

- proxies Apache e `docker-compose.yml`;
- imports/`require_once` entre PHPs;
- assets montados nos apps Node;
- health/login dos apps modernos;
- dependencias do Miauby interno;
- dependencias restantes de MySQL por flags de rollback/importacao.

## Continua ativo

- WordPress continua ativo em `site/wp-admin`, `site/wp-content`, `site/wp-includes` e `site/wp-config.php`.
- O favicon `W` do WordPress pode aparecer quando uma tela nao declara icone proprio e o navegador tenta `/favicon.ico`; por isso a raiz reescreve `/favicon.ico` para `/cashback/favicon.png`, e os modulos internos devem declarar favicon explicitamente.
- MySQL `wimifarma-com-db` continua ativo para WordPress e para legados/rollbacks ainda documentados.
- `site/miauw` continua ativo em PHP.
- `site/cashback/config.php` e `site/cashback/functions.php` continuam disponiveis para include por filesystem porque o Miauby usa esse bootstrap compartilhado; desde 2026-06-04 o `functions.php` local nao guarda mais regras operacionais de Cashback nem consultas `wf_*`. A conexao MySQL restante em `config.php` e para o Miauby PHP enquanto a escrita oficial do chat interno ainda nao foi cortada para Postgres.
- `site/financeiro/financeiro-funcoes.php` continua disponivel para include por filesystem como helper minimo do Miauby para normalizar datas; desde 2026-06-04 ele nao possui schema, leitura ou escrita MySQL.
- `site/tarefa` continua preservado como legado de referencia/fonte visual enquanto o Miauby ainda referencia o mapa dessa pasta, mas PHP direto por HTTP em `site/tarefa` fica bloqueado por `.htaccess`.
- Assets montados pelos apps Node continuam no lugar:
  - `site/cashback` assets;
  - `site/codigos/styles.css`, `site/codigos/app.js`, `site/codigos/login-runner.js`;
  - `site/xp/styles.css`, `site/xp/app.js`, `site/xp/login-runner.js`, `site/xp/assets`, `site/xp/uploads`;
  - `site/financeiro` assets.

## Arquivado no repositorio

Os itens abaixo foram movidos para `site/_legacy-disabled/2026-05-29/` e bloqueados por `site/_legacy-disabled/.htaccess`:

- `gestao/`: PHP/CSS/JS antigo da Gestao, pois `/gestao/` e servido por `apps/gestao`.
- `codigos-php/`: PHP antigo de Codigos, pois `/codigos/` e servido por `apps/codigos`; os assets ficaram em `site/codigos`.
- `xp-php/`: PHP antigo do XP, pois `/xp/` e servido por `apps/xp`; os assets/uploads ficaram em `site/xp`.
- `cashback-financeiro-php/`: financeiro antigo dentro de `site/cashback`, pois `/financeiro/` e servido por `apps/financeiro` e o Cashback Node redireciona rotas antigas de financeiro.

Em 2026-06-04, para reduzir confusao de manutencao futura, tambem foram movidos para `site/_legacy-disabled/2026-06-04/`:

- `cashback-php/`: telas, APIs e diagnosticos PHP antigos de Cashback que consultavam `wf_*`; `config.php` e `functions.php` originais foram preservados nessa quarentena para rollback manual, enquanto a pasta oficial `site/cashback` ficou so com assets e bootstrap compartilhado minimo.
- `financeiro-php/`: telas, exportacao, bootstrap e helper completo PHP/MySQL antigo do Financeiro; a pasta oficial `site/financeiro` ficou so com assets e um helper minimo `financeiro-funcoes.php` sem banco.

## Regras para proximas limpezas

- Nao apagar `site/_legacy-disabled` sem confirmacao explicita; ele e uma quarentena rastreavel.
- Nao remover MySQL enquanto WordPress, Miauby PHP ou flags de rollback/importacao ainda dependerem dele.
- Nao mover assets montados por `docker-compose.yml` sem atualizar o compose e validar o app Node afetado.
- Nao remover os `.htaccess` de `site/cashback`, `site/financeiro` e `site/tarefa` sem rollback deliberado e validado; eles impedem que os PHPs antigos voltem a servir UI se o proxy Apache for alterado errado.
- Nao remover WordPress core/plugins/tema sem antes confirmar plugins ativos e estrategia do site publico.
- No VPS, clones/runtimes antigos fora da pasta oficial devem ser movidos para `/home/ubuntu/projetos/_arquivados-wimifarma/AAAA-MM-DD/`, nunca apagados direto.
