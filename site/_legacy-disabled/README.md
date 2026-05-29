# Legado desativado

Esta pasta guarda arquivos PHP antigos que foram retirados das rotas ativas em
2026-05-29 para reduzir confusao durante a migracao para Node.js, TypeScript e
Postgres.

Regras:

- Nao servir estes arquivos pela web.
- Nao mover de volta para `site/` sem rollback deliberado.
- Manter assets ainda montados pelos apps Node nos caminhos originais.
- Manter helpers ainda usados pelo Miauby nos caminhos originais.

## 2026-05-29

- `gestao/`: modulo PHP antigo completo. A rota oficial `/gestao/` usa
  `apps/gestao`.
- `codigos-php/`: PHP antigo de Codigos. Foram mantidos em `site/codigos` apenas
  `styles.css`, `app.js` e `login-runner.js`, que ainda sao montados pelo app
  Node.
- `xp-php/`: PHP antigo do XP. Foram mantidos em `site/xp` os assets, uploads,
  CSS e JS compartilhados pelo app Node.
- `cashback-financeiro-php/`: financeiro antigo que ficava dentro do Cashback.
  A rota oficial do Financeiro usa `apps/financeiro`.
