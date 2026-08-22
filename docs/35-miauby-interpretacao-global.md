# 35 - Interpretacao global de comandos do Miauby

## Objetivo

Centralizar a interpretacao dos comandos do Miauby Interno e do Miauby WhatsApp para que intencao e parametros sejam reconhecidos na mensagem inteira, sem depender da posicao das palavras, de maiusculas/minusculas ou de uma lista de permutacoes de regex.

Os formatos antigos continuam validos. A camada nova nao executa ferramentas, nao consulta bancos de modulos e nao confirma operacoes: ela somente produz uma interpretacao estruturada e uma mensagem canonica para os parsers e validadores existentes.

## Contrato

O endpoint interno `POST /miauw/agent/interpret` recebe:

- `message`: texto original;
- `channel`: `internal` ou `whatsapp`.

E retorna:

- `status`: `resolved`, `ambiguous`, `blocked` ou `none`;
- `intent` e `module`;
- `confidence`, entre 0 e 1;
- `evidence`: sinais da intencao encontrados na frase;
- `entities`: valores monetarios, datas, horarios, quantidades, dosagens, categorias e referencias de usuario encontradas por contexto;
- `canonical_message`: comando e dados em uma forma compativel com os parsers existentes;
- `missing`: somente os dados obrigatorios ausentes que podem ser identificados sem consultar o modulo;
- `clarification`: pergunta curta quando houver empate ou risco de executar a intencao errada.

## Regras de interpretacao

1. Normalizar Unicode, acentos e caixa apenas para comparar. Preservar o texto original dos valores extraidos.
2. Aceitar `miauby` em qualquer caixa e posicao como palavra de ativacao, sem incluir essa palavra nos dados.
3. Avaliar a frase inteira. Cada intencao possui grupos de sinais, sinonimos, sinais negativos e um comando canonico; a ordem dos sinais nao altera a pontuacao.
4. Extrair entidades por tipo e intervalo no texto antes de montar a mensagem canonica. Palavras da intencao e conectivos estruturais nao viram titulo, produto, observacao ou nome.
5. Nao inventar categoria, usuario, data, quantidade ou valor. Validacoes dependentes de banco continuam no modulo dono do dado.
6. Intencoes de escrita exigem confianca maior que consultas. Empate proximo entre intencoes potencialmente destrutivas retorna `ambiguous` e pede somente a informacao necessaria.
7. O interpretador nao chama OpenAI e nao executa tools. O PHP continua dono da confirmacao e da escrita; o WhatsApp continua usando confirmacoes idempotentes.
8. Negacao explicita da acao retorna `blocked`; no Falteiro, restricoes negativas contextuais como `nao e urgente` ou `nao pegar validade curta` permanecem na mensagem canonica. Qualquer pergunta sobre uma acao de escrita retorna `ambiguous`, mesmo com ativacao `Miauby`. Nenhum desses estados pode cair no parser legado.
9. Pequenos erros de uma letra sao tolerados somente nos termos do comando e quando `Miauby` foi chamado. Singular/plural nao usa aproximacao para nao misturar intencoes diferentes.
10. No Falteiro, a camada semantica da prioridade ao dominio de ruptura quando `cotar` e `urgente` aparecem junto de sinais como `acabou`, `zerou`, `estoque baixo`, `vai acabar`, `comprar`, `repor` ou `reposicao`; assim, a frase nao desvia para uma Cotacao urgente comum.
11. `apps/cotacao/src/falteiro-command.js` preserva no produto identidade, dosagem, apresentacao, embalagem e marca obrigatoria; resolve categorias oficiais contra o catalogo real e agrega na categoria estado do estoque, quantidade de compra, prazo, preco, preferencia, demanda e observacao.
12. Apresentacao e quantidade de compra sao separadas por contexto, nao apenas pelo numero. Demanda geral segue para Falteiro; pedido ou reserva para pessoa identificada segue para Encomenda. Categoria oficial ambigua ou inexistente falha fechada.
13. Frases e sinonimos normalizados ficam em cache no processo. Datas relativas, quantidades naturais e valores brasileiros como `1.500,20` sao extraidos como contexto sem inventar nem reformatar dados.
14. Se o servico estiver indisponivel ou retornar `none`, usar o parser legado com a mensagem original; os detectores de contingencia dos dois canais reconhecem tambem os sinais de estoque baixo.

## Comandos cobertos

O registro inicial cobre as familias operacionais existentes:

- Falteiro e consultas da Cotacao;
- encomenda, cotacao urgente, cotacao rapida e planilha de cotacao;
- sangria, PIX CNPJ, lancamento, faturamento diario e fechamento/reabertura/consulta do caixa;
- criar, listar, consultar, concluir e cancelar tarefas;
- criar, listar chegada e cancelar pedidos;
- criar conta da Gestao;
- relatorios e resumos por modulo;
- calendario e demais consultas registradas nos contratos de tools.
- emissao direta e idempotente de Cashback rapido.

Novos comandos devem adicionar uma especificacao ao registro central e testes de linguagem natural; nao devem adicionar combinacoes para cada ordem possivel.

## Integracao

- Miauby Interno consulta o interpretador depois de resolver respostas pendentes de selecao/confirmacao e antes de iniciar uma nova acao controlada.
- Miauby WhatsApp consulta o mesmo endpoint antes dos parsers locais e aplica a mesma decisao.
- A mensagem original permanece em auditoria. A mensagem canonica serve apenas para roteamento e extracao pelos parsers existentes.
- Permissoes, allowlists, identificacao do ator, CSRF, locks, transacoes e idempotencia permanecem nos donos atuais.

### Falteiro em lote

- A intencao `registrar_falteiro` preserva na mensagem canonica virgulas, ponto e virgulas e quebras de linha para o parser autoritativo da Cotacao.
- Uma mensagem pode produzir de um a 50 itens. A intencao global e herdada sem exigir `falta` em cada segmento, mas produto, categoria e contexto sao calculados separadamente; acima do limite, a mensagem inteira e recusada sem escrita.
- Dosagem, concentracao, volume, apresentacao, quantidade da embalagem e marca obrigatoria continuam no produto. Contexto operacional segue para `Categoria`; sem contexto, a categoria fica vazia.
- Categoria oficial e validada contra o catalogo real. Um erro simples no produto so e corrigido quando ha correspondencia unica em produtos ja conhecidos; ambiguidade preserva o texto recebido.
- O endpoint valida o lote inteiro antes da escrita, exige linhas vazias suficientes, usa lock e `FOR UPDATE`, e grava todos os itens ou nenhum. `detected_count` precisa ser igual a `created_count`.
- A idempotencia e auditada por `(source, request_id, item_index)`. Um retry devolve o mesmo conjunto e cada segmento gera exatamente um registro.

### Encomenda

- A intencao `criar_encomenda_cotacao` reconhece termos de Encomenda em qualquer posicao, incluindo pedido/reserva/separacao em linguagem natural, e preserva os comandos historicos de consulta.
- O parser PHP compartilhado pelos dois canais analisa a mensagem inteira e separa `produto`, `responsavel` (cliente), `telefone`, `quantidade`, `endereco`, `tipo_entrega`, `data_encomenda`, `horario`, `prioridade`, `referencia` e `observacao_livre`; dosagem, marca obrigatoria e apresentacao ficam no produto, enquanto preferencia de marca e quantidade do pedido ficam no contexto.
- Cliente e telefone sao opcionais. Produto e obrigatorio, e ambiguidade real pede somente esse dado.
- No WhatsApp, quando apenas o produto estiver faltando, o bridge preserva temporariamente cliente, telefone e contexto da Encomenda. A proxima resposta pode informar somente o produto; `cancelar` encerra a pendencia e um novo comando Miauby substitui o contexto antigo.
- Se a resposta da Cotacao falhar ou expirar depois da confirmacao, os dois canais preservam a mesma confirmacao para retry. O mesmo `request_id` e reutilizado, portanto uma resposta perdida depois do `COMMIT` nao cria outra Encomenda.
- O ator autenticado/vinculado e usado apenas para permissao e auditoria. Ele nunca substitui o cliente informado.
- A confirmacao gera chave idempotente enviada ao endpoint da Cotacao; retries da mesma confirmacao devolvem o registro original.
- O endpoint grava novas Encomendas somente nas colunas `produto` e `categoria`. A categoria comeca por `Encomenda` e preserva, em partes separadas por ` | `, todo contexto util realmente informado. O contrato legado continua aceito na API, mas e normalizado para as mesmas duas colunas.

### Cashback rapido

- A intencao `criar_cashback_rapido` reconhece `cashback` ou `cash back` em qualquer posicao/caixa e separa o valor da compra de telefone, CPF e codigo do cliente. Consulta, historico, relatorio e saldo nao podem virar emissao.
- O valor e obrigatorio. Nome, telefone, CPF, observacao e codigo permanente do cliente sao opcionais e chegam como entidades separadas; telefone e CPF nunca podem ser usados como valor monetario.
- Interno e WhatsApp reutilizam `POST /cashback/api/internal/miauby/quick-vouchers`, protegido por token. O endpoint revalida ator e permissao, calcula o percentual configurado, usa o mesmo lock/sorteio de cinco digitos e a mesma validade de seis meses do Balcao.
- A chave derivada de canal e mensagem/evento torna retry idempotente. Repetir o mesmo evento devolve o voucher original, sem criar outro cliente, codigo ou XP.
- Sem cliente identificavel, a emissao permanece anonima e nao gera XP. Com codigo do cliente, nome ou telefone valido, o backend vincula/reutiliza o cliente e aplica a regra atual de +250 XP de forma idempotente. CPF e observacao isolados nao inventam identidade nem sao gravados em campo inadequado.
- Este comando e uma acao local deterministica de risco medio e nao abre confirmacao adicional. No Miauby Interno, a resposta confiavel abre o dialogo local do navegador. No WhatsApp, o voucher e gerado, mas a resposta informa que a impressao deve ser aberta no Cashback ou no Miauby Interno; o WhatsApp nao afirma que imprimiu.

## Memoria conversacional

A interpretacao de uma mensagem nova permanece sem efeitos colaterais. A continuacao entre mensagens usa o redutor estruturado e deterministico descrito em `docs/36-miauby-memoria-conversacional.md`; ele guarda somente estado curto, entidades com IDs reais e pendencias expiraveis. O modulo oficial continua sendo consultado antes de exibir dado atual ou executar uma acao.

## Testes

Para cada familia, cobrir:

- comando antes, no meio e depois dos dados;
- variacoes de caixa e acento;
- conectivos naturais;
- preservacao de valores, dosagens, datas, quantidades e nomes;
- remocao das palavras da intencao nos valores;
- formatos legados;
- ausencia de falso positivo conversacional;
- ambiguidade bloqueada para acoes fortes;
- negacao explicita bloqueada sem confundir expressoes como `nao tem mais`;
- pergunta informativa sem execucao acidental;
- typo conservador somente com ativacao explicita;
- fallback quando o endpoint nao estiver disponivel.

## Criterios de aceite

- Interno e WhatsApp recebem a mesma intencao e mensagem canonica para a mesma frase.
- Nenhuma escrita nova ocorre no interpretador.
- Confirmacoes existentes permanecem nas acoes que as exigem; a emissao direta de Cashback rapido e a excecao documentada e depende de idempotencia, permissao e auditoria no backend.
- Suites PHP e TypeScript passam, inclusive exemplos antigos.
- `npm audit --omit=dev` fica sem vulnerabilidades conhecidas no Agent e no WhatsApp.
- Health dos servicos e smoke de producao ficam verdes depois do deploy.
