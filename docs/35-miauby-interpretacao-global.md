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
8. Negacao explicita fora dos termos da propria intencao retorna `blocked`; qualquer pergunta sobre uma acao de escrita retorna `ambiguous`, mesmo com ativacao `Miauby`. Nenhum dos dois estados pode cair no parser legado.
9. Pequenos erros de uma letra sao tolerados somente nos termos do comando e quando `Miauby` foi chamado. Singular/plural nao usa aproximacao para nao misturar intencoes diferentes.
10. No Falteiro, a camada semantica da prioridade ao dominio de ruptura quando `cotar` e `urgente` aparecem junto de sinais como `acabou`, `faltando`, `comprar`, `repor` ou `reposicao`; assim, a frase nao desvia para uma Cotacao urgente comum.
11. `apps/cotacao/src/falteiro-command.js` preserva produto/apresentacao, resolve categorias por conjuntos de conceitos e aliases contra o catalogo real, prefere a categoria composta mais especifica e bloqueia a escrita quando o contexto nao possui correspondencia unica.
12. Frases e sinonimos normalizados ficam em cache no processo. Datas relativas, quantidades naturais e valores brasileiros como `1.500,20` sao extraidos como contexto sem inventar nem reformatar dados.
13. Se o servico estiver indisponivel ou retornar `none`, usar o parser legado com a mensagem original.

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

Novos comandos devem adicionar uma especificacao ao registro central e testes de linguagem natural; nao devem adicionar combinacoes para cada ordem possivel.

## Integracao

- Miauby Interno consulta o interpretador depois de resolver respostas pendentes de selecao/confirmacao e antes de iniciar uma nova acao controlada.
- Miauby WhatsApp consulta o mesmo endpoint antes dos parsers locais e aplica a mesma decisao.
- A mensagem original permanece em auditoria. A mensagem canonica serve apenas para roteamento e extracao pelos parsers existentes.
- Permissoes, allowlists, identificacao do ator, CSRF, locks, transacoes e idempotencia permanecem nos donos atuais.

### Encomenda

- A intencao `criar_encomenda_cotacao` reconhece termos de Encomenda em qualquer posicao e preserva os comandos historicos de consulta.
- O parser PHP compartilhado pelos dois canais separa `produto`, `responsavel` (cliente), `telefone`, `quantidade`, `endereco`, `tipo_entrega`, `data_encomenda`, `horario`, `prioridade`, `referencia` e `observacao_livre`; numeros de dosagem/apresentacao nao viram telefone nem quantidade.
- Cliente e telefone sao opcionais. Produto e obrigatorio, e ambiguidade real pede somente esse dado.
- No WhatsApp, quando apenas o produto estiver faltando, o bridge preserva temporariamente cliente, telefone e contexto da Encomenda. A proxima resposta pode informar somente o produto; `cancelar` encerra a pendencia e um novo comando Miauby substitui o contexto antigo.
- Se a resposta da Cotacao falhar ou expirar depois da confirmacao, os dois canais preservam a mesma confirmacao para retry. O mesmo `request_id` e reutilizado, portanto uma resposta perdida depois do `COMMIT` nao cria outra Encomenda.
- O ator autenticado/vinculado e usado apenas para permissao e auditoria. Ele nunca substitui o cliente informado.
- A confirmacao gera chave idempotente enviada ao endpoint da Cotacao; retries da mesma confirmacao devolvem o registro original.
- O endpoint grava `quantidade` na coluna propria e compoe a categoria `Encomenda` apenas com os metadados realmente informados, preservando produto, marca, dosagem e apresentacao na coluna `produto`.

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
- Confirmacoes e idempotencia atuais permanecem obrigatorias.
- Suites PHP e TypeScript passam, inclusive exemplos antigos.
- `npm audit --omit=dev` fica sem vulnerabilidades conhecidas no Agent e no WhatsApp.
- Health dos servicos e smoke de producao ficam verdes depois do deploy.
