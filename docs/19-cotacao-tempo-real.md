# 19 - Cotacao tempo real

## O que esta parte do sistema faz

Este documento registra a camada atual de sincronizacao e presenca ao vivo da Cotacao e o caminho para evoluir a ferramenta para um comportamento mais proximo do Google Sheets. A prioridade e evitar perda de dados, conflito silencioso e divergencia entre computadores.

## Estado real atual

A Cotacao ja possui:

- polling de sincronizacao por `sync_pull`;
- compartilhamento de filtro por `sync_filter`;
- controle de versoes em `cotacao_sync_estado`;
- presenca ao vivo por `presence_ping`;
- indicador "1 pessoa usando" / "N pessoas usando";
- chips com usuarios ativos e local aproximado de trabalho;
- marca visual na celula onde outro usuario esta focado/editando quando a linha esta visivel;
- aviso textual quando outro usuario esta fora do filtro atual.

Isso ainda nao e um motor completo estilo Google Sheets. A edicao simultanea forte ainda depende de conflito por campo, fila de eventos e canal de tempo real mais eficiente.

## Arquivos, rotas e tabelas envolvidos

Arquivos:

- `site/cotacao/index.php`
- `site/cotacao/app.js`
- `site/cotacao/api.php`
- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/styles.css`

Rotas/acoes:

- `/cotacao/`
- `POST /cotacao/api.php` com `action=sync_pull`
- `POST /cotacao/api.php` com `action=sync_filter`
- `POST /cotacao/api.php` com `action=presence_ping`

Tabelas:

- `cotacao_blocos`
- `cotacao_itens`
- `cotacao_fornecedores`
- `cotacao_precos`
- `cotacao_categorias`
- `cotacao_regras_formatacao`
- `cotacao_sync_estado`
- `cotacao_presencas`
- `cotacao_auditoria`

## Regras de negocio que precisam ser preservadas

- Cada item precisa manter ID estavel.
- Ordem, categoria, status, prioridade, observacao, vencedor e formatacao nao podem ser sobrescritos sem auditoria.
- Precos por fornecedor devem continuar ligados a `item_id` e `fornecedor_id`.
- Filtro ativo nao pode esconder conflito de dados; se outro usuario estiver em linha fora do filtro, a interface deve indicar isso.
- Presenca e dado temporario; nao deve ser usada como historico permanente.
- A tela deve continuar funcional quando houver apenas um usuario, quando outro usuario fechar o navegador ou quando o ping falhar temporariamente.

## Decisoes tecnicas tomadas

- A primeira camada usa polling HTTP para reduzir risco e caber na arquitetura PHP/Apache atual.
- `cotacao_presencas` usa `client_id` por aba/sessao de navegador para distinguir duas abas do mesmo usuario.
- Presencas antigas sao limpas por tempo de atividade.
- A interface marca celulas remotas com classe CSS e cor por usuario, sem bloquear edicao por enquanto.
- `presence_ping` exige sessao e CSRF, como as demais acoes internas.

## Riscos ao alterar

- Reduzir demais o intervalo de polling pode aumentar carga no VPS.
- Achar que presenca resolve conflito de escrita seria perigoso: ela so mostra onde pessoas estao trabalhando.
- Alterar seletor de celula/linha sem atualizar `app.js` pode quebrar marca remota.
- Sincronizar com Google Sheets sem IDs estaveis pode duplicar linhas ou sobrescrever valores.
- Tratar filtro como fonte de verdade pode causar divergencia entre computadores.

## Pendencias

- Criar conflito por campo com versao anterior/atual.
- Criar log de eventos de edicao para auditoria fina.
- Avaliar Server-Sent Events ou WebSocket para reduzir delay.
- Criar tela de diagnostico de sync/presenca.
- Definir contrato Google Sheets: ID estavel, fonte de verdade por campo, sentido do sync e resolucao de conflito.
- Criar testes com dois usuarios/sessoes e filtros diferentes.

## Como pode evoluir

1. Presenca visual e filtros compartilhados por polling.
2. Conflito por campo com aviso antes de sobrescrever.
3. Fila de eventos de edicao com auditoria.
4. Canal tempo real dedicado, se necessario.
5. Integracao Google Sheets estruturada.
6. Miauby resumindo divergencias, itens travados, usuarios ativos e riscos de sync.
