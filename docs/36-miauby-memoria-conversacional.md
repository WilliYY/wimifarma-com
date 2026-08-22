# 36 - Memoria conversacional estruturada do Miauby

## Objetivo

Miauby Interno e Miauby WhatsApp compartilham memoria curta e estruturada para continuar uma conversa sem reenviar todo o historico ao modelo. Depois da ativacao inicial, frases como `qual e da Maria?`, `o segundo`, `cancela ela`, `sim` e `coloca tambem atenolol` podem aproveitar o contexto valido da mesma identidade. O Interno preserva a compatibilidade de comandos explicitos sem a palavra `Miauby`; o WhatsApp continua exigindo o prefixo para iniciar uma conversa.

Essa memoria auxilia a interpretacao. Ela nao substitui o banco do modulo, nao concede permissoes, nao executa escrita e nao torna `apps/miauby` dono do Miauby Interno.

## Donos e integracao

- `apps/miauw-agent/src/conversation-memory.ts` e o redutor deterministico e sem efeitos colaterais.
- `POST /miauw/agent/conversation/resolve` interpreta mensagem + estado; `POST /miauw/agent/conversation/effect` aplica efeitos estruturados devolvidos por um executor.
- `apps/miauw-whatsapp/src/conversation-state-store.ts` e o dono da persistencia curta e reutiliza `miauw_whatsapp_conversation_states` com `state_key='structured_conversation'`.
- O Interno continua em `site/miauw/api.php`; ele usa a ponte interna tokenizada do WhatsApp para ler e transicionar o mesmo contrato persistente.
- Confirmacoes, permissoes, validacoes, idempotencia e escritas continuam nos executores PHP/Node ja existentes.
- `apps/miauby` permanece migracao sombra e nao participa deste fluxo como fonte oficial.

Nao ha tabela nem migracao nova. `miauw_memorias` e `miauby_memories` nao podem guardar este contexto temporario.

## Contrato do estado

O payload persistido possui `active`, `channel`, `userId`, `conversationId`, `sessionId`, `currentTopic`, `lastIntent`, `lastFilters`, `recentEntities`, `lastCreatedEntity`, `pendingAction`, `pendingSelection`, `pendingQuestion`, `lastInteractionAt`, `expiresAt`, `version` e `revision`.

`recentEntities` guarda identificadores reais e metadados limitados. A frase original de `consultar_encomendas` e preservada para que produto, cliente, telefone, contexto e status nao sejam perdidos no roteamento. Ao responder sobre uma Encomenda selecionada, o canal consulta novamente a Cotacao pelo `row_id` UUID validado, antes de aplicar o limite da lista e incluindo o historico real quando necessario; texto memorizado nunca e considerado estado atual do modulo.

## Prioridade e referencias

1. Confirmacao ou recusa de `pendingAction` valido.
2. Selecao valida em `pendingSelection` ou resposta de `pendingQuestion`.
3. Intencao nova explicita, que troca o topico anterior.
4. Referencia a entidade recente ou a ultima entidade escolhida.
5. Continuacao segura do topico, como produtos adicionais no Falteiro.
6. Conversa ativa sem inferencia destrutiva.

Numeros isolados e ordinais so selecionam dentro de uma lista recente valida. Sao aceitos numero, `primeiro`, `segundo`, `terceiro`, `ultimo`, conteudo unico como `Maria` e referencias como `esse`, `essa`, `ele` e `ela`. Ambiguidade nao autoriza escrita.

Confirmacoes e recusas so valem quando ha uma acao pendente da mesma identidade. Confirmacoes reconhecem `sim`, `s`, `ss`, `pode`, `pode sim`, `confirmo`, `confirma`, `isso`, `isso mesmo`, `beleza`, `blz`, `ok`, `faz`, `manda` e `vai`. Recusas reconhecem `nao`, `n`, `deixa`, `deixa quieto`, `nao precisa`, `cancela`, `esquece` e `melhor nao`.

## Isolamento, expiracao e concorrencia

- Interno: identidade por `userId + conversationId + hash da sessao`.
- WhatsApp: identidade e armazenamento por hash salgado do contato autorizado.
- Um usuario, canal, conversa ou sessao diferente nao pode confirmar o estado de outro.
- `MIAUBY_CONVERSATION_TTL` controla a conversa, com padrao de 1800 segundos.
- `MIAUBY_PENDING_ACTION_TTL` controla a acao pendente, com padrao de 300 segundos e sempre menor ou igual ao TTL da conversa.
- `MIAUBY_WHATSAPP_CONTINUATION_WITHOUT_PREFIX` controla continuacoes sem prefixo no WhatsApp; allowlist e vinculo continuam obrigatorios.
- `encerra conversa`, `sair do miauby`, `limpa contexto` e `miauby encerra` apagam o contexto curto.

Cada transicao persistida usa transacao Postgres, `pg_advisory_xact_lock`, leitura `FOR UPDATE` e revisao do estado. Duas confirmacoes concorrentes da mesma pendencia resultam em um unico consumo.

## Compatibilidade e seguranca

Pendencias legadas de confirmacao, selecao, relatorio e coleta de campos sao resolvidas antes da memoria estruturada. Formatos antigos continuam validos. No WhatsApp, a continuacao sem `miauby` so e aceita para contato permitido com contexto ativo e nao vencido. Se o estado nao puder ser revalidado entre o webhook e o processamento, o canal pede uma nova mensagem com `Miauby` e nao entrega o texto sem prefixo ao parser operacional.

Uma referencia como `cancela ela` pode formar uma acao pendente, mas so e executada se existir executor oficial, autorizado e idempotente para aquele tipo. A Cotacao ainda nao possui cancelamento contextual seguro de Encomenda; nesse caso a confirmacao termina de forma fechada, informa a limitacao e nao altera linha alguma.

## Validacao obrigatoria

- consulta de Encomendas seguida de filtro por Maria;
- lista de tres itens seguida de `o segundo`, `2` e `o ultimo`;
- selecao seguida de `cancela ela` e depois `sim` ou `nao`;
- Falteiro com produtos adicionais sem repetir a ativacao;
- troca explicita de Falteiro para Encomendas;
- acao, lista ou conversa expirada sem reaproveitamento;
- identidade A pendente e identidade B dizendo `sim` sem execucao;
- duas confirmacoes concorrentes consumindo exatamente uma vez;
- reset explicito removendo entidades e pendencias.
