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
8. Negacao explicita fora dos termos da propria intencao retorna `blocked`; perguntas informativas sobre acoes de escrita retornam `ambiguous`. Nenhum dos dois estados pode cair no parser legado.
9. Pequenos erros de uma letra sao tolerados somente nos termos do comando e quando `Miauby` foi chamado. Singular/plural nao usa aproximacao para nao misturar intencoes diferentes.
10. Frases e sinonimos normalizados ficam em cache no processo. Datas relativas, quantidades naturais e valores brasileiros como `1.500,20` sao extraidos como contexto sem inventar nem reformatar dados.
11. Se o servico estiver indisponivel ou retornar `none`, usar o parser legado com a mensagem original.

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
