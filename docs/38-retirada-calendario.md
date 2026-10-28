# 38 - Retirada do Calendario

Em 2026-10-28, o modulo Calendario foi retirado a pedido do usuario.

- O card nao aparece na Home e o painel Usuarios nao oferece nem concede essa permissao.
- Miauby Interno/WhatsApp nao anunciam ferramentas, fazem consultas, montam relatorios ou monitoram esse modulo. Pedidos antigos recebem recusa controlada; horarios e datas dos outros dominios continuam funcionando.
- `/calendario`, `/calendario/` e todas as subrotas recebem HTTP 410 no Apache, incluindo APIs e health antigos.
- `wimifarma-calendario-app` e `wimifarma-calendario-db` sairam do Compose e da lista padrao do backup dos bancos ativos. Nao executar `docker compose down`, `--remove-orphans` ou limpeza global para esta retirada.
- O codigo e as artes mensais foram retirados de `apps/calendario`; a versao anterior permanece recuperavel pelo Git e pela imagem Docker anterior.

## Preservacao de dados

Nao apagar `calendario-data/postgres`, dumps, imagens de recuperacao nem registros historicos no core. O diretorio continua ignorado pelo Git. Nenhuma tabela ou anotacao foi excluida.

Antes de parar o banco no VPS, parar somente o app do Calendario, gerar dump customizado pelo proprio `pg_dump` do Postgres 17 e validar tamanho, `pg_restore --list` e SHA-256. Guardar dump e manifesto em uma pasta exclusiva sob `/home/ubuntu/projetos/_backups-wimifarma/calendario-retirado/`. Os containers aposentados ficam parados e com reinicio automatico desabilitado; dados e configuracao permanecem para recuperacao.

Para recuperar, restaurar o codigo/configuracao a partir do Git e da imagem preservada em janela autorizada, conferir o dump/volume e testar em ambiente isolado antes de reativar rotas. Nao restaurar o Compose inteiro sobre versoes posteriores.

## Validacao

- `node --test scripts/test-calendar-retirement.mjs`.
- Suites e typecheck de Miauby agente/WhatsApp, Miauby e Usuarios.
- Lint dos PHP/JavaScript alterados, evals do Miauby e teste da rotina de backup com Docker simulado.
- `docker compose config --quiet` e `apache2ctl -t` no ambiente suportado.
- Em producao: Home sem o card, contratos sem ferramenta Calendario, rotas antigas HTTP 410 e healths dos demais modulos HTTP 200.

O seletor de datas do Financeiro e o calendario usado no calculo de validades pertencem aos respectivos dominios e nao fazem parte do modulo retirado.
