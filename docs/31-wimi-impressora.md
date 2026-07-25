# Impressao termica do Cashback

## Estado atual

Desde 2026-07-25, o Cashback nao possui card `Wimi Impressora`, estacao web, agente local, instalador ou fila ativa de impressao.

O botao `Imprimir` abre somente o dialogo de impressao do navegador no computador em uso. A Bematech MP-4200 TH deve estar instalada no Windows e selecionada nesse dialogo.

## Fluxo

1. A operacao ou o voucher e confirmado no Postgres.
2. O comprovante protegido aparece na tela.
3. O usuario clica em `Imprimir`.
4. O navegador registra a solicitacao de impressao e abre `window.print()`.
5. O usuario escolhe a Bematech ou outra impressora disponivel no computador.

Abrir o dialogo nao comprova que o papel saiu fisicamente. A operacao de Cashback nao e recriada nem recalculada ao imprimir.

## Papel e layout

- rolo: 80 mm de largura por 40 m de comprimento;
- bloco externo: 76 mm;
- margens laterais: 2 mm;
- area interna util: 72 mm;
- altura: variavel conforme o conteudo;
- logo: 48 mm;
- comprovantes identificados mostram nome e codigo permanente do cliente;
- vouchers rapidos anonimos nao mostram cliente;
- o bloco financeiro mostra somente `Cashback gerado`.

## Historico preservado

As tabelas abaixo permanecem no Postgres apenas para auditoria e reversibilidade:

- `cashback_print_devices`;
- `cashback_print_pairing_tickets`;
- `cashback_print_jobs`.

Na inicializacao do Cashback:

- dispositivos ainda `active` passam para `revoked` e perdem o token;
- trabalhos `pending` ou `printing` passam para `cancelled`;
- trabalhos ja `printed`, `failed`, `uncertain` ou `cancelled` nao sao apagados.

Isso impede que um trabalho antigo seja impresso depois da retirada da estacao.

## Rotas retiradas

`/cashback/impressora.php` redireciona para o Balcao. As APIs antigas da estacao e do agente respondem HTTP `410 Gone`.

Uma futura integracao por porta local ou ponte controlada pelo Codex deve ser tratada como uma nova arquitetura, com autenticacao, idempotencia e teste fisico separados. Ela nao esta ativa nesta versao.
