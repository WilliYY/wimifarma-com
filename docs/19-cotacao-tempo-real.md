# 19 - Cotacao tempo real

## O que esta parte do sistema faz

Este documento registra a camada atual de sincronizacao e presenca ao vivo da Cotacao e o caminho para evoluir a ferramenta para um comportamento mais proximo do Google Sheets. A prioridade e evitar perda de dados, conflito silencioso e divergencia entre computadores.

## Estado real atual

A Cotacao ja possui:

- polling de sincronizacao por `sync_pull`;
- polling incremental por `sync_events_pull`, usando eventos em `cotacao_eventos` antes de recorrer a snapshot completo;
- compartilhamento de filtro por `sync_filter`;
- controle de versoes em `cotacao_sync_estado`;
- versao por item/campo em `cotacao_itens.versoes` e por preco em `cotacao_precos.versao`, base para conflito por campo;
- presenca ao vivo por `presence_ping`;
- indicador "1 pessoa usando" / "N pessoas usando";
- chips com usuarios ativos e local aproximado de trabalho;
- marca visual na celula onde outro usuario esta focado/editando quando a linha esta visivel;
- aviso textual quando outro usuario esta fora do filtro atual.

Em 2026-05-11, foi validado por simulacao com duas sessoes autenticadas que:

- uma sessao cria uma linha e a outra recebe o item por `sync_pull`;
- edicao separada em `produto` e `categoria` preserva os dois campos, sem sobrescrita silenciosa;
- `presence_ping` retorna 2 usuarios ativos em sessoes diferentes;
- a linha temporaria de auditoria foi removida ao final do teste.

Tambem em 2026-05-11, a digitacao de categoria passou a usar debounce curto em `site/cotacao/app.js` para lista de categorias, filtro da grade e opcoes relacionadas. O objetivo e evitar que cada tecla force varredura completa da planilha e cause travadas perceptiveis.

Em nova auditoria de categoria no mesmo dia, foi identificado que a aba que salvava uma alteracao ainda podia receber depois um snapshot completo por `sync_pull`, porque saves locais nao atualizavam a versao conhecida de sync no frontend. Isso fazia a propria tela reaplicar dados que ela tinha acabado de gravar. O fluxo foi ajustado para atualizar a versao conhecida apos mutacoes locais, mantendo `presence_ping` fora desse avanco porque presenca nao e mudanca de dados da planilha.

Tambem foi removida a logica antiga de classes fixas para `urgente` e `encomenda`. Essas cores agora devem vir somente de `cotacao_regras_formatacao`, para evitar conflito entre regra condicional e CSS/JS legado. Quando o popover de categoria esta fechado, o frontend apenas memoriza categorias novas e nao reconstrui a lista visual escondida a cada save.

Na revisao seguinte, foi removido outro acoplamento antigo: escrever `encomenda` na categoria nao muda mais `prioridade`, nao registra `encomenda_registrada_em` automaticamente e `urgente`/`encomenda` nao entram mais no filtro de cor por palavra-chave. O campo categoria pode continuar sendo usado pela regra condicional configurada pelo usuario, mas alerta operacional do Miauby depende de prioridade explicita `encomenda`.

Miauby acompanha alertas operacionais da Cotacao, mas encomenda so vira alerta/comentario de balao quando a linha esta com prioridade explicita `encomenda` e passa de 1 dia sem baixa/pedido. Antes disso, a encomenda deve continuar como fluxo normal da Cotacao para evitar ruido operacional.

Na mesma auditoria local, o banco tinha 243 itens e 53 categorias, e a rota autenticada `/cotacao/` apareceu nos logs com cerca de 1,46 MB de HTML. Isso ainda funciona, mas indica que o proximo gargalo provavel sera peso inicial da tela/snapshot quando a planilha crescer.

Em 2026-05-11, a sincronizacao recebeu uma primeira fila de eventos em `cotacao_eventos`. Saves de linha, linhas criadas, cancelamentos, filtros e regras condicionais gravam eventos com `client_id`. O frontend tenta aplicar esses eventos incrementalmente e so volta para `sync_pull`/snapshot quando ha mudanca estrutural, atraso grande ou conflito local. Isso reduz reprocessamento pesado e impede que a propria aba reaplique a alteracao que acabou de salvar.

Tambem foi corrigido o fluxo de digitacao de categoria: enquanto o usuario esta escrevendo, inclusive `encomenda`, a tela atualiza formatacao e agenda o save, mas nao reaplica filtro ativo no meio da digitacao. Se houver filtro ativo, ele e reaplicado no `focusout`/fim da edicao. Essa regra evita que a linha pule para outra posicao ou seja escondida antes do usuario terminar.

Na validacao com Browser em 2026-05-11, foi encontrado outro caso de self-replay: uma linha nova ainda sem `item_id` podia salvar no banco e, antes de receber a resposta do proprio `save_row`, o snapshot/evento remoto podia reaparecer como outra linha vazia preenchida. O frontend agora identifica linha local pendente por ordem/produto/categoria, adia o sync remoto nesses casos e remove duplicatas visuais por `item_id` apos o save.

Isso ainda nao e um motor completo estilo Google Sheets. A edicao simultanea forte ainda depende de conflito por campo visivel ao usuario e canal de tempo real mais eficiente, como SSE ou WebSocket.

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
- `POST /cotacao/api.php` com `action=sync_events_pull`
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
- `cotacao_eventos`
- `cotacao_presencas`
- `cotacao_auditoria`

## Regras de negocio que precisam ser preservadas

- Cada item precisa manter ID estavel.
- Ordem, categoria, status, prioridade, observacao, vencedor e formatacao nao podem ser sobrescritos sem auditoria.
- Alteracao de categoria nao pode apagar produto, fornecedor, preco, observacao, vencedor nem formatacao de outra celula.
- Cores automaticas por categoria devem ser configuradas por regra condicional, nao por comportamento fixo escondido no codigo.
- Categoria nao deve alterar `prioridade` nem registrar encomenda automaticamente; prioridade so deve mudar quando o usuario ou uma funcao explicita salvar esse campo.
- Filtro de cor deve considerar cores salvas em `cor`/`cores`, nao palavras no texto da categoria.
- Precos por fornecedor devem continuar ligados a `item_id` e `fornecedor_id`.
- Filtro ativo nao pode esconder conflito de dados; se outro usuario estiver em linha fora do filtro, a interface deve indicar isso.
- Encomenda da Cotacao nao deve gerar alerta do Miauby antes de completar mais de 1 dia sem baixa/pedido e deve depender de prioridade explicita `encomenda`, nao de texto livre da categoria.
- Presenca e dado temporario; nao deve ser usada como historico permanente.
- A tela deve continuar funcional quando houver apenas um usuario, quando outro usuario fechar o navegador ou quando o ping falhar temporariamente.

## Decisoes tecnicas tomadas

- A primeira camada usa polling HTTP para reduzir risco e caber na arquitetura PHP/Apache atual.
- `cotacao_presencas` usa `client_id` por aba/sessao de navegador para distinguir duas abas do mesmo usuario.
- Presencas antigas sao limpas por tempo de atividade.
- A interface marca celulas remotas com classe CSS e cor por usuario, sem bloquear edicao por enquanto.
- `presence_ping` exige sessao e CSRF, como as demais acoes internas.
- Mutacoes locais, como `save_row`, `add_empty_rows`, `delete_row`, `sync_filter` e regras condicionais, devem chamar `rememberSyncState()` com o estado retornado pela API. Isso evita que a propria aba processe a mesma mudanca de novo via snapshot completo.
- Mutacoes locais tambem devem enviar `client_id`; eventos com o mesmo `client_id` devem ser ignorados pela propria aba.
- `sync_events_pull` deve ser tentado antes de `sync_pull` quando a aba ja conhece um `evento_id`. Se o servidor pedir `requires_snapshot`, o frontend volta para snapshot completo.
- `presence_ping` continua sem avancar versao de sync local, porque presenca e temporaria e nao representa mudanca de dados.
- Filtro de categoria nao deve ser reaplicado a cada tecla dentro de uma celula de categoria. O filtro ativo so deve recalcular depois que a edicao termina.
- Linha nova local que ainda esta salvando nao deve ser reaplicada em outra linha pelo snapshot/evento remoto. Se o item remoto corresponder a uma linha local pendente, o sync deve aguardar a resposta do save; se ainda assim surgir duplicata visual, o DOM deve manter uma unica linha por `item_id`.
- `cotacao_add_category()` aceita `touchSync=false` quando chamada dentro de `cotacao_save_item()`, evitando dois toques de sync para um unico save de linha.
- As classes legadas `is-category-urgent` e `is-category-order` nao devem ser usadas para cor automatica; a origem correta e `cotacao_regras_formatacao`.
- As palavras `urgente` e `encomenda` tambem nao devem entrar como atalho escondido no filtro de cor. Se o usuario quiser cor automatica, a regra deve estar cadastrada em formatacao condicional.
- `encomenda` so tem significado operacional para idade da encomenda/Miauby quando salvo como prioridade explicita; como texto de categoria, e apenas categoria/formatacao condicional.
- A troca imediata de linguagem/banco nao foi adotada como primeiro passo para a travada de categoria. O gargalo observado era compatível com recalculo de UI/filtros, entao a correcao inicial fica no frontend e no contrato de sync atual.
- Para chegar mais perto do Sheets, o proximo salto tecnico recomendado e um canal de eventos em tempo real, preferencialmente SSE ou WebSocket, com fila de eventos por celula/linha. Banco novo so deve entrar depois de medir gargalos reais de MySQL/PHP.

## Riscos ao alterar

- Reduzir demais o intervalo de polling pode aumentar carga no VPS.
- Achar que presenca resolve conflito de escrita seria perigoso: ela so mostra onde pessoas estao trabalhando.
- Alterar seletor de celula/linha sem atualizar `app.js` pode quebrar marca remota.
- Sincronizar com Google Sheets sem IDs estaveis pode duplicar linhas ou sobrescrever valores.
- Tratar filtro como fonte de verdade pode causar divergencia entre computadores.
- Reintroduzir cor fixa por nome de categoria pode duplicar comportamento e gerar resultado diferente da regra condicional configurada pelo usuario.
- Reintroduzir prioridade automatica por categoria pode fazer a linha saltar de posicao depois do save/sync.
- Rodar verificacoes paralelas que inicializam schema pode gerar lock/deadlock temporario no MySQL; preferir auditoria sequencial.

## Pendencias

- Criar conflito por campo com versao anterior/atual.
- Expandir o log `cotacao_eventos` para conflito por campo visivel ao usuario e diagnostico operacional.
- Avaliar Server-Sent Events ou WebSocket para reduzir delay.
- Medir em navegador real a digitacao de categoria com muitos itens/categorias apos o debounce e apos a correcao de reaplicacao de snapshot local.
- Reduzir peso inicial da tela autenticada quando a quantidade de itens crescer, com paginacao virtual ou carregamento incremental.
- Continuar reduzindo peso de `sync_pull`, agora usando `sync_events_pull` como caminho padrao e snapshot completo apenas como fallback.
- Criar tela de diagnostico de sync/presenca.
- Definir contrato Google Sheets: ID estavel, fonte de verdade por campo, sentido do sync e resolucao de conflito.
- Transformar o teste manual de duas sessoes em smoke test automatizado.

## Como pode evoluir

1. Presenca visual e filtros compartilhados por polling.
2. Conflito por campo com aviso antes de sobrescrever.
3. Fila de eventos de edicao com auditoria.
4. Canal tempo real dedicado, se necessario.
5. Integracao Google Sheets estruturada.
6. Miauby resumindo divergencias, itens travados, usuarios ativos e riscos de sync.
