# Wimifarma

Projeto interno da Wimifarma migrado do HostGator para VPS Ubuntu/Oracle, com WordPress, modulos internos em PHP e Cotacao V2 em Node.js rodando via Docker.

Estado base desta documentacao: 2026-05-10.

## Objetivo do sistema

O sistema centraliza a presenca web e ferramentas internas da Wimifarma:

- site WordPress principal em `site/`;
- Cashback para clientes, compras, creditos e resgates;
- Codigos para atalhos de itens com comissao diferente, com codigo, EAN e preco editaveis;
- Cotacao para controle de itens, fornecedores, precos e status de compras;
- Financeiro para fechamento, sangrias, PIX, maquininhas e rastreabilidade interna;
- Gestao para contas a pagar manuais, itens de composicao, pagamentos parciais e total pago por mes;
- Tarefas internas;
- Miauby, assistente interno com integracao OpenAI e recursos de diagnostico.

O objetivo tecnico da migracao e sair de uma hospedagem HostGator limitada e evoluir em uma VPS mais flexivel, com Docker, controle de versao, deploy rastreavel e espaco para novos modulos.

## Status atual

- Projeto local em `C:\Projetos\wimifarma-com`.
- Repositorio GitHub: `https://github.com/WilliYY/wimifarma-com.git`.
- Docker Compose sobe `wimifarma-com-web`, `wimifarma-com-db`, `wimifarma-cotacao-app`, `wimifarma-cotacao-db`, `wimifarma-cotacao-redis`, `wimifarma-gestao-app`, `wimifarma-gestao-db` e `wimifarma-miauw-agent`.
- Banco local importado do HostGator no volume ignorado `mysql/`.
- `wimifarma_app` contem tabelas `wf_*`, `cotacao_*`, `financeiro_*`, legados `gestao_*` e `miauw_*`.
- `wimifarma_wp` contem WordPress com prefixo `wptl_`.
- A Cotacao V2 fica em `apps/cotacao`, usa Node.js/Express/Socket.IO, Postgres e Redis, e e publicada por proxy interno do Apache em `/cotacao/`.
- O login da Cotacao continua usando usuarios da tabela MySQL `wf_users`; os dados novos da planilha ficam em Postgres no volume ignorado `cotacao-data/`.
- A Gestao fica oficialmente em `apps/gestao`, usa Node.js/TypeScript/Express com Postgres dedicado `wimifarma_gestao`, e e publicada por proxy interno do Apache em `/gestao/`; o MySQL fica para autenticacao `wf_users`, logs e importacao de dados legados.
- A Cotacao PHP antiga foi removida; `site/cotacao` nao existe mais e os ativos da tela oficial ficam em `apps/cotacao/public`.
- Rotas de login dos modulos responderam HTTP 200 na auditoria local.
- `miauw/widget-status.php` respondeu `api_ready: true` quando a chave local estava configurada.
- No widget do Miauby, `api_ready` indica chave preenchida, nao chamada OpenAI validada. Se o chat cair no fallback, conferir logs/alertas internos para autenticacao, cota, modelo ou rede.
- WordPress respondeu HTTP 200 localmente, mas ficou lento no Docker Desktop Windows com plugins restaurados.
- DNS GoDaddy e Nginx Proxy Manager estavam em configuracao para `wimifarma.com`.
- Cache de pagina WordPress/SpeedyCache esta opt-in durante a migracao para evitar HTML publico antigo com assets `http://`.
- A rota publica `/` e servida por `site/home.php`, uma home independente do bootstrap do WordPress, com fundo visual em tela inteira, GIFs decorativos com movimento igual aos logins e cards inferiores de acesso aos modulos.
- O card de Tarefas consulta `site/tarefa/badge.php` e exibe contador vermelho de tarefas abertas quando houver pendencias.
- A home publica mostra no maximo cinco cards por linha no desktop; os cards de `Códigos` e `Gestao` entram na segunda linha, os cards foram elevados para abrir espaco visual, e no mobile os cards ficam compactos em duas colunas para caber mais acessos por tela.
- O modulo `site/codigos` guarda atalhos de comissao em `wf_codigos_comissao`, com blocos por prefixo de EAN persistidos em `wf_codigos_blocos`, autosave de `Codigo`, `EAN` e `Preco`, botao `+` com prefixo manual para criar o bloco desejado, tabelas em faixa horizontal sem gerar rolagem vazia no documento, reordenacao por arrastar o numero da linha, criacao de novas linhas no rodape de cada grupo, exclusao logica de itens apagados e exclusao protegida de tabelas nao padrao por senha de confirmacao.
- O login de Codigos segue o mesmo padrao visual vinho/rosa dos outros logins internos, preservando a autenticacao em `wf_users`.
- O modulo `Gestao` foi elevado para Node.js + TypeScript + Postgres: login restrito a `adm`, `admin` ou `gerente`, contas a pagar manuais em `gestao_accounts`, categoria livre, itens flexiveis em `gestao_account_items`, pagamentos parciais datados em `gestao_account_payments`, status reversivel, extrato por conta com saldo/progresso, juros ou diferencas como novos itens, auditoria em `gestao_audit_events` e espelho curto em `wf_logs`.
- O Financeiro mostra no topo apenas `Caixa`, `Relatorio` e `Sair`; a tela dedicada de Auditoria saiu da navegacao da equipe, mas a tabela `financeiro_auditoria` continua registrando alteracoes internas.
- A Cotacao V2 substitui a interface antiga em `/cotacao/` para eliminar bugs de palavra-gatilho, salto de linha e travamento em categoria. Palavras como `geral`, `urgente`, `encomenda` e `cotacao` sao texto comum; cor so vem de regra condicional criada explicitamente na tela.
- A Cotacao V2 usa linha com UUID estavel, save por celula, presenca ao vivo via Socket.IO/Redis, filtros locais por tela e eventos em Postgres. A primeira validacao confirmou login, bootstrap, save dessas palavras criticas e criacao/remocao de regra condicional explicita.
- A interface da Cotacao V2 foi aproximada do visual de planilha operacional: cabecalho compacto, abas locais, estatisticas no topo, CSV rapido e colunas fixas iniciais `EAN`, `PRODUTO`, `QUANTIDADE`, `CATEGORIA`, fornecedores e `Ganhador`.
- A Cotacao V2 agora preenche a largura da tela como planilha, usa fonte 20px centralizada nas celulas, mostra usuarios ativos com nomes de animais por aba, permite menu de contexto para inserir linhas, colorir e inserir/apagar somente colunas de distribuidoras, possui paleta de cores para linhas/colunas/celulas e calcula o `Ganhador` pelo menor preco das distribuidoras.
- A Cotacao V2 removeu os botoes visiveis de adicionar linhas e colar planilha: inserir linhas fica no menu de contexto, adicionar em lote fica no rodape e colagem do Sheets usa `Ctrl+V`. A tela tambem possui desfazer/refazer, selecao multipla, `Enter` para descer uma celula, filtros por icone em `CATEGORIA` e `Ganhador`, backup/restore do Postgres e import/export Google Sheets controlado por variaveis de ambiente; o diagnostico operacional continua disponivel por API, mas saiu do menu principal da equipe.
- No editor de celula da Cotacao V2, duplo clique e `F2` entram em edicao sem selecionar todo o conteudo existente; o usuario consegue posicionar cursor, selecionar trechos e usar setas dentro do texto. Quando a edicao comeca por digitacao direta na celula selecionada, as setas confirmam o valor e navegam para a celula vizinha, mantendo o fluxo rapido de planilha. O rodape `Adicionar 20 linhas` adiciona linhas no DOM de forma incremental para evitar lag em planilhas maiores.
- A Cotacao V2 recebeu ajustes de operacao diaria: celulas quebram texto e aumentam altura para nao cortar conteudo, cabecalhos/linhas selecionam coluna/linha inteira, cabecalhos de distribuidoras aceitam duplo clique para renomear, larguras de coluna podem ser arrastadas pelo titulo, apagar distribuidora pode ser desfeito com `Ctrl+Z` na mesma sessao, e o fim da rolagem oferece `Adicionar 20 linhas`.
- A operacao diaria tambem cobre `Ctrl+C` em selecao de celulas, `Ctrl+Z` para desfazer filtros locais, colagem com normalizacao de texto/numeros, formato condicional editavel que pinta apenas a celula da coluna-alvo com texto preto, normalizacao de regras antigas/restauradas para alvo `cell`, paleta de cores flutuante pelo topo ou menu de contexto com tons do mais forte ao mais claro, manutencao da linha visivel durante edicao sob filtro e heartbeat/recarregamento leve apos inatividade.
- A Cotacao V2 agora filtra tambem por `PRODUTO` e por cor nas colunas filtraveis, ordena o filtro de `Ganhador` com vencedores individuais antes de empates e `Sem vencedor`, permite selecionar varias colunas/linhas arrastando pelos cabecalhos e mostra data/hora no hover de celulas que baterem em regra condicional com essa opcao marcada.
- A alca no canto da selecao da Cotacao V2 foi ampliada e permite arrastar para copiar valores e cores visiveis da selecao para celulas vizinhas.
- O modo de cor da Cotacao V2 e uma acao unica: depois de aplicar cor ou borracha na selecao atual, a tela desarma o modo para evitar colorir a proxima celula sem querer. O filtro de `Ganhador` mostra contagem por resultado, como `Anb (4)`.
- Os assets vivos da Cotacao V2 (`app.js` e `styles.css`) sao servidos sem cache forte para evitar que deploys rapidos fiquem presos no navegador.
- A Etapa 1 de performance da Cotacao V2 adicionou indices aditivos no Postgres e ampliou `/cotacao/api/diagnostics` com blocos `safety` e `performance`; `/cotacao/api/bootstrap` segue como fallback completo durante a evolucao do sync incremental.
- A Etapa 2 criou `GET /cotacao/api/events?after=<eventId>` e passou o refresh automatico da Cotacao para delta incremental, mantendo `/cotacao/api/bootstrap` como fallback quando houver evento estrutural, cursor invalido ou excesso de eventos.
- A Etapa 3 reduziu o custo das mutacoes simples da Cotacao V2: salvar celula, lote de celulas, estilos, regras, linhas e colunas usam consultas pontuais de validacao em vez de carregar o snapshot inteiro por `loadSheet()`.
- A digitacao em celulas agenda o auto-ajuste de altura por frame do navegador para reduzir recalculo de layout e suavizar a escrita em planilhas maiores.
- A Etapa 4 deixou a troca de celula mais fluida: saves de celula passam a ser otimistas no frontend, redesenhando somente a linha afetada enquanto a API confirma em segundo plano.
- A presenca ao vivo agora tambem aparece dentro da grade: quando outra pessoa seleciona ou edita uma celula visivel, a celula ganha contorno colorido, etiqueta do animal e tooltip com coluna/linha.
- Apagar conteudo com `Delete`/`Backspace` na Cotacao V2 tambem ficou otimista: a selecao limpa na hora e o save em lote confirma em segundo plano sem redesenhar a tabela inteira para um caso simples.
- Quando a aba esta editando uma celula e recebe eventos remotos de celula/lote, a Cotacao guarda as linhas afetadas e redesenha ao encerrar a edicao, evitando `Ganhador`, contadores ou celulas calculadas visualmente atrasadas.
- Redimensionar coluna, inserir linha, criar, renomear, apagar ou restaurar distribuidora nao deve mais forcar `/cotacao/api/bootstrap` na propria aba nem nas demais; esses fluxos usam payload incremental de evento e atualizacao local da grade.
- O redimensionamento de coluna usa evento Socket.IO dedicado `column:resized` e auto-ajuste apenas da coluna alterada, evitando que abas antigas disparem snapshot completo ao soltar o mouse.
- O carregamento inicial da Cotacao V2 renderiza a grade antes de fatiar o auto-ajuste de altura das celulas em frames, reduzindo a tela vazia com `Carregando...` quando ha muitas linhas/colunas.
- O numero da linha da celula ativa fica destacado em verde forte, facilitando localizar visualmente a linha atual sem alterar dados nem compartilhar esse destaque com outras telas.
- A alca de preenchimento, colagem e desfazer/refazer de lotes agora seguem o mesmo modelo otimista: aplicam localmente, salvam em lote e atualizam somente as linhas afetadas; estilos copiados ou aplicados em selecoes grandes usam `/cotacao/api/styles/batch`.
- Filtros continuam locais por navegador. Quando duas pessoas salvam a mesma celula, a Cotacao segue o comportamento estilo Sheets pedido pelo usuario: o ultimo salvamento vence, com presenca visual e historico de celula para recuperar valor anterior.
- O botao `Sair` da Cotacao V2 encerra a sessao da Cotacao e volta para a home inicial `/`, em vez de mandar para o login.
- O widget do Miauby voltou a carregar dentro da Cotacao V2, a tela de login foi compactada para ocupar menos a tela e os endpoints JSON limpam saida acidental antes de responder, evitando HTML misturado no login/chat.
- Na Cotacao V2, o widget do Miauby tambem pode soltar localmente o `pikachu-loop.webp` para uma ronda visual curta: ele sai do balao do Miauby, circula pela tela, desvia do mouse e volta ao widget, sem gravar estado nem mexer na sincronizacao da planilha.
- Pendencias/cuidados atuais da Cotacao V2: Google Sheets ainda precisa de credenciais reais no `.env` do VPS; restore/import sao acoes fortes e devem ser usados com backup/revisao; o `fill handle` ja copia padroes, mas series automaticas mais inteligentes ainda podem evoluir.
- Miauby possui `miauw_skill_registry()` para inventariar skills por modulo, risco, nivel, permissao, auditoria e executor antes de novas autonomias. Consultas de alertas e conhecimentos foram aliviadas para reduzir trabalho repetido.
- Miauby iniciou a Fase 1 do agente operacional v2: `MIAUW_AGENT_VERSION`, prompt/politica versionados, isolamento de bastidores tecnicos, guardrails finais contra mencoes a agente de desenvolvimento/fornecedor/chaves/prompts e status de versao no widget.
- Miauby iniciou a Fase 2 do agente operacional v2 com evals locais em `site/miauw/miauw-evals.php`, cobrindo guardrails, intents de Financeiro/Tarefas/Cotacao, rotas de modelo e registry de skills sem chamada online nem escrita real.
- Os guardrails finais tambem redigem fragmentos de chaves `sk-...` como credencial interna antes de mostrar texto ao operador.
- Miauby iniciou a Fase 3 com o painel restrito `/miauw/diagnostico.php`, reunindo status do agente/API, modelos, registry de skills, alertas, diagnosticos internos recentes e revisao segura de memorias/padroes.
- `miauw_memorias` e `miauw_padroes` agora possuem status de revisao (`pendente`, `aprovado`, `ignorado`); o painel marca revisao sem apagar dados.
- Miauby iniciou a Fase 4 do agente operacional v2: as tools core ficam registradas e cobrem sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- A consulta e criacao de encomenda na Cotacao pelo Miauby usam uma ponte interna com o servico Node da Cotacao V2, protegida por token, em vez de depender da Cotacao PHP antiga.
- Miauby iniciou a Fase 5 do agente operacional v2: `miauw_tool_traces` registra trace por conversa/request/tool, o painel `/miauw/diagnostico.php` mostra tools recentes e estatisticas de traces, o widget/chat exibe resposta digitando visualmente e acoes fortes exigem card de confirmacao antes de gravar.
- Miauby iniciou a Fase 6 do agente operacional v2: os evals locais foram ampliados para validar contrato da proxima camada, schemas das tools, dados obrigatorios antes de escrita, regra de nao inventar dados e confirmacao obrigatoria para escrita forte. O diagnostico tambem mostra um contrato seguro para a futura camada Node.js 22 + TypeScript com Agents SDK, sem trocar o motor atual ainda.
- Miauby iniciou a Fase 7 do agente operacional v2: `apps/miauw-agent` adiciona um servico Node.js 22 + TypeScript com `@openai/agents`, publicado internamente em `/miauw/agent/`, com health/status e endpoints internos `run`/`stream` protegidos por token. Ele roda em modo sombra, sem escrita real, enquanto o PHP segue dono do chat, sessoes, widget, confirmacoes e auditoria.
- Miauby iniciou a Fase 8 do agente operacional v2: o PHP ganhou adaptador para chamar o servico Node em sombra, comparar resposta oficial com resposta sombra e registrar trace seguro em `miauw_tool_traces`. A comparacao automatica por envio fica desligada por padrao (`MIAUW_AGENT_SHADOW_ON_SEND=false`) para nao impactar a operacao.
- Miauby iniciou a Fase 9 do agente operacional v2: existe `MIAUW_ENGINE=php|node_shadow|node` para cortar o motor com rollback por `.env`, `MIAUW_MAINTENANCE_MODE` bloqueia usuarios comuns durante testes e `adm` fica liberado por padrao para usar o Node como resposta oficial quando configurado.
- Miauby iniciou a Fase 10 do agente operacional v2: a personalidade do Miauby agora tem contrato versionado (`miauby-persona-2026-05-16`) no PHP, no diagnostico e no servico Node. O agente Node preserva tom de fiscal interno, humor curto, bordoes controlados e pedido minimo de contexto, e `apps/miauw-agent` possui `npm run check:persona` para evitar regressao para resposta generica.
- Miauby iniciou a Fase 11 do agente operacional v2: o PHP exporta contratos versionados das tools OpenAI a partir do registry e envia esse contexto ao servico Node em `run`/`stream`; o Node usa isso para responder com nocao das capacidades auditadas, mas continua sem escrita direta, com confirmacoes e execucao real ainda no PHP.
- Miauby iniciou a Fase 12 do agente operacional v2: o servico Node executa uma primeira tool real de leitura segura (`consultar_contrato_tool_miauby`) sobre os contratos enviados pelo PHP. Ela apenas consulta capacidades auditadas; escrita, confirmacao, sessao e auditoria de dados continuam no PHP.
- Miauby iniciou a Fase 13 do agente operacional v2: o servico Node executa tools reais de leitura baixa por uma ponte PHP interna tokenizada (`/miauw/agent-tools.php`) para Financeiro, Cashback, Codigos e Cotacao, com pre-leitura deterministica quando o pedido e claro. O Node continua sem credencial de banco e com `writes_enabled=false`; sangria, tarefas, encomendas e qualquer escrita forte seguem no fluxo PHP com confirmacao/auditoria.
- Miauby iniciou a Fase 14 do agente operacional v2: o servico Node passou a orquestrar todas as OpenAI tools exportadas pelo registry via ponte PHP universal. Leituras, diagnosticos e cliente mascarado executam pelo PHP auditado; `criar_tarefa` pode gravar como escrita de baixo risco com usuario logado; sangria, lancamentos, encomendas e demais acoes fortes retornam `confirmation_required` e continuam sem escrita direta pelo Node.
- Miauby iniciou a Fase 15 do agente operacional v2: existe um roteador de estilo versionado (`miauby-style-router-2026-05-16`) para perguntas casuais, bastidor tecnico, saudacoes e ruido. O PHP exporta contexto de estilo e memorias/padroes aprovados ao Node; o Node responde localmente quando nao precisa gastar chamada online, evita listas em conversa solta e preserva a voz de gato fiscal sem virar catalogo de ferramentas.
- Miauby iniciou a Fase 16 do agente operacional v2: o chat ganhou feedback `Boa`/`Treinar`, o painel restrito `/miauw/treino.php` revisa exemplos de resposta, a tabela `miauw_treinos_respostas` preserva versoes sem apagar historico e exemplos aprovados entram no `style_context` enviado ao Node. O servico agente passou para `SERVICE_VERSION=0.10.0` e `PHASE=fase16-training-feedback`, ainda sem escrita direta no Node.
- Miauby iniciou a Fase 17 do agente operacional v2: exemplos aprovados viram um perfil compilado de voz/relevancia antes de chegar ao Node, perguntas repetidas pelo treino podem responder localmente sem chamada online, e o servico agente passou para `SERVICE_VERSION=0.11.0` e `PHASE=fase17-training-compiler`.
- Miauby iniciou a Fase 18 do agente operacional v2: o PHP exporta perfis versionados de voz/tom (`miauby_padrao`, `miauby_curto`, `miauby_operacional`) e um contrato de audio seguro (`text_only`, sem microfone, playback, transcricao ou gravacao). O Node passou para `SERVICE_VERSION=0.12.0` e `PHASE=fase18-voice-audio-readiness`, recebendo o perfil de voz no `style_context`; audio real continua desligado por padrao.
- Miauby ajustou a Fase 19 do agente operacional v2: o chat e o widget global usam botao `Falar` em fluxo estilo WhatsApp. O navegador grava audio temporario somente apos clique, o PHP transcreve com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, a tela mostra um rascunho local com player/duracao/transcricao, o texto entra no campo para revisao e o usuario decide `Enviar`, `Refazer` ou `Descartar audio`. A chave nao vai para o navegador, audio nao e armazenado no banco e escrita operacional por voz continua bloqueada.
- Miauby iniciou a Fase 20 do agente operacional v2: audio enviado aparece no chat/widget como player com ondas, sem mostrar a transcricao na bolha enviada; a transcricao segue internamente para contexto. Quando a mensagem veio por audio, o PHP gera resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts` e `MIAUW_SPEECH_VOICE=marin`, sem armazenar audio. Audios curtos demais sao bloqueados para reduzir transcricao inventada.
- Miauby iniciou a Fase 21 do agente operacional v2: o playback dos audios usa URL temporaria `blob:` permitida apenas em `media-src`, a resposta falada mostra o audio como principal e deixa a transcricao escondida por padrao, o TTS recebeu perfil de fala mais vivo e o diagnostico permite escolher voz base entre `marin`, `cedar`, `ash`, `coral` e `verse` sem mexer em segredo.
- O frontend de audio do Miauby tenta abrir o microfone por `getUserMedia()` mesmo quando o estado previo de permissao parece desatualizado; se o Chrome/Windows recusar, a mensagem indica recarregar/redefinir permissao ou revisar a permissao de microfone do sistema.
- Os headers de seguranca dos modulos internos permitem `microphone=(self)` para o audio do Miauby no proprio dominio, mantendo camera e geolocalizacao bloqueadas.
- Miauby so alerta encomendas da Cotacao quando a linha esta com prioridade explicita `encomenda` e passou de 1 dia sem baixa/pedido; o comentario curto aparece no balao do widget em qualquer modulo onde o Miauby esteja carregado.

Pontos ainda pendentes ficam registrados em `docs/06-pendencias.md`.

## Stack

- PHP 8.3 com Apache
- MySQL 8.0
- WordPress na raiz publica `site/`
- Modulos internos em PHP procedural
- Docker Compose
- Nginx Proxy Manager no VPS para publicar dominios
- OpenAI API usada pelo Miauby
- Node.js 22 + Express + Socket.IO para Cotacao V2
- Node.js 22 + TypeScript + Agents SDK para Miauby em modo sombra/corte controlado com adaptador PHP, tools Node por ponte PHP interna, contexto de treino aprovado, perfil compilado, perfis de voz/tom e audio por gravacao temporaria/transcricao confirmada, bolha/player de audio, resposta falada temporaria e seletor seguro de voz no diagnostico
- PostgreSQL 17 para dados da Cotacao V2
- Redis 7 para sessoes e presenca da Cotacao V2

## Instalar localmente

1. Entrar na pasta do projeto:

```powershell
cd C:\Projetos\wimifarma-com
```

2. Criar o `.env` local a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

3. Editar `.env` com valores reais do ambiente local. Nunca versionar `.env`.

4. Opcionalmente configurar o Miauby por arquivo local:

```powershell
Copy-Item site\miauw\config.local.example.php site\miauw\config.local.php
```

Depois editar `site\miauw\config.local.php`. Esse arquivo tambem nao deve ser versionado.

## Como rodar

```powershell
cd C:\Projetos\wimifarma-com
docker compose up -d --build
```

URL local principal:

- `http://127.0.0.1:3002/`

Rotas internas principais:

- `http://127.0.0.1:3002/cashback/login.php`
- `http://127.0.0.1:3002/codigos/login.php`
- `http://127.0.0.1:3002/cotacao/login.php`
- `http://127.0.0.1:3002/financeiro/login.php`
- `http://127.0.0.1:3002/gestao/login.php`
- `http://127.0.0.1:3002/gestao/health`
- `http://127.0.0.1:3002/tarefa/login.php`
- `http://127.0.0.1:3002/miauw/login.php`
- `http://127.0.0.1:3002/miauw/treino.php`
- `http://127.0.0.1:3002/miauw/diagnostico.php`
- `http://127.0.0.1:3002/miauw/widget-status.php`
- `http://127.0.0.1:3002/miauw/agent/health`

## Comandos principais

```powershell
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-com-db
docker compose logs --tail=80 wimifarma-cotacao-app
docker compose logs --tail=80 wimifarma-miauw-agent
docker exec wimifarma-com-web php -l /var/www/html/wp-config.php
docker exec wimifarma-com-web php /var/www/html/miauw/miauw-evals.php
cd apps/miauw-agent; npm.cmd run check:persona; cd ../..
curl.exe -L --max-time 30 http://127.0.0.1:3002/miauw/widget-status.php
curl.exe -L --max-time 30 http://127.0.0.1:3002/gestao/login.php
curl.exe -sS http://127.0.0.1:3002/miauw/agent/health
curl.exe -sS http://127.0.0.1:3002/cotacao/health
curl.exe -sS http://127.0.0.1:3002/cotacao/api/diagnostics
curl.exe -sS http://127.0.0.1:3002/cotacao/api/google-sheets/status
```

Mais comandos ficam em `docs/05-comandos.md`.

## Estrutura de pastas

```text
.
|-- apps/
|   |-- cotacao/             # Cotacao V2 Node.js/Socket.IO
|   |-- gestao/              # Gestao Node.js/TypeScript/Postgres
|   `-- miauw-agent/         # Miauby agente Node/TypeScript em sombra/corte controlado
|-- cotacao-data/            # volumes Postgres/Redis ignorados pelo Git
|-- gestao-data/             # volume Postgres da Gestao ignorado pelo Git
|-- docker/
|   |-- php/Dockerfile
|   `-- mysql/init/
|-- docs/
|-- mysql/                  # volume local ignorado pelo Git
|-- site/
|   |-- home.php              # home publica estavel, fora do bootstrap WordPress
|   |-- cashback/
|   |-- codigos/
|   |-- financeiro/
|   |-- gestao/               # legado PHP; rota oficial usa apps/gestao por proxy
|   |-- miauw/
|   |-- tarefa/
|   |-- wp-admin/
|   |-- wp-content/
|   |-- wp-includes/
|   `-- wp-config.php
|-- .env.example
|-- docker-compose.yml
|-- AGENTS.md
`-- README.md
```

## Variaveis de ambiente

Variaveis esperadas em `.env`:

```text
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
WIMIFARMA_DB_HOST
WIMIFARMA_DB_USER
WIMIFARMA_DB_PASSWORD
WIMIFARMA_WP_DB_NAME
WIMIFARMA_APP_DB_NAME
RSSSL_KEY
WP_AUTH_KEY
WP_SECURE_AUTH_KEY
WP_LOGGED_IN_KEY
WP_NONCE_KEY
WP_AUTH_SALT
WP_SECURE_AUTH_SALT
WP_LOGGED_IN_SALT
WP_NONCE_SALT
WP_CACHE
WIMIFARMA_PUBLIC_PAGE_CACHE
CODIGOS_GROUP_DELETE_PASSWORD
MIAUW_OPENAI_API_KEY
MIAUW_OPENAI_MODEL
MIAUW_GUARDIAN_TOKEN
MIAUW_AGENT_INTERNAL_TOKEN
MIAUW_AGENT_INTERNAL_BASE_URL
MIAUW_PHP_TOOL_BRIDGE_URL
MIAUW_AGENT_SHADOW_ON_SEND
MIAUW_AGENT_SHADOW_TIMEOUT_MS
MIAUW_ENGINE
MIAUW_AGENT_ENGINE_ALLOWED_USERS
MIAUW_MAINTENANCE_MODE
MIAUW_MAINTENANCE_ALLOWED_USERS
MIAUW_MAINTENANCE_MESSAGE
MIAUW_VOICE_PROFILE
MIAUW_AUDIO_ENABLED
MIAUW_TRANSCRIPTION_MODEL
MIAUW_SPEECH_MODEL
MIAUW_SPEECH_VOICE
MIAUW_REALTIME_MODEL
MIAUW_REALTIME_VOICE
COTACAO_INTERNAL_TOKEN
COTACAO_INTERNAL_BASE_URL
COTACAO_POSTGRES_PASSWORD
COTACAO_SESSION_SECRET
COTACAO_BACKUP_DIR
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_RANGE
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE
```

Nao colocar valores reais no README, em commits ou em issues publicas.

## Arquivos fora do Git

Nao versionar:

- `.env`
- `site/miauw/config.local.php`
- qualquer `config.local.php`
- `mysql/`
- `backups/`
- dumps `.sql`
- arquivos `.zip`
- cache WordPress
- `site/wp-content/endurance-page-cache/`
- plugins premium `*-pro`
- `site/wp-content/plugins/loginizer-security`
- relatorios gerados em `site/miauw/relatorios/`
- `node_modules/`

## Deploy no VPS

O VPS atual usa Ubuntu/Oracle, PuTTY para terminal e WinSCP para arquivos. O Codex tambem pode executar deploy diretamente por SSH/plink com a chave local autorizada, entao nao e necessario enviar comando PuTTY equivalente ao usuario ao final.

Pasta observada no VPS:

```bash
/home/ubuntu/projetos/wimifarma-com
```

Essa deve ser a pasta oficial unica de deploy. Copias temporarias criadas durante a migracao, como `wimifarma-com-git`, `wimifarma-com-code-*` ou `wimifarma-com-runti*`, devem ser auditadas pelos mounts dos containers e arquivadas em `_arquivados-wimifarma/` antes de qualquer exclusao.

Quando o VPS estiver usando Git para este projeto, o fluxo padrao executado pelo Codex/operador sera:

```bash
cd /home/ubuntu/projetos/wimifarma-com
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 wimifarma-com-web
docker compose logs --tail=80 wimifarma-cotacao-app
```

Antes do primeiro deploy da Cotacao V2 no VPS, adicionar valores reais no `.env` para `COTACAO_POSTGRES_PASSWORD` e `COTACAO_SESSION_SECRET`.

Para o Miauby criar/consultar encomendas diretamente na Cotacao V2, manter `MIAUW_GUARDIAN_TOKEN` preenchido ou definir `COTACAO_INTERNAL_TOKEN` com token equivalente no `.env`; o Compose entrega esse segredo ao web/PHP e ao app Node sem versionar o valor.

Para testar o servico Miauby agente, manter `MIAUW_AGENT_INTERNAL_TOKEN` preenchido ou usar o fallback de `MIAUW_GUARDIAN_TOKEN`; `MIAUW_AGENT_INTERNAL_BASE_URL` aponta internamente para `http://wimifarma-miauw-agent:3100/miauw/agent` e `MIAUW_PHP_TOOL_BRIDGE_URL` aponta para `http://wimifarma-com-web/miauw/agent-tools.php`.

Para comparar respostas do PHP com o servico sombra em envios reais, ligar `MIAUW_AGENT_SHADOW_ON_SEND=true` e manter `MIAUW_AGENT_SHADOW_TIMEOUT_MS` com limite baixo o suficiente para nao atrapalhar a equipe. O padrao documentado fica `false`.

Para corte acelerado do Miauby, use `MIAUW_MAINTENANCE_MODE=true`, `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`, `MIAUW_AGENT_ENGINE_ALLOWED_USERS=adm` e escolha `MIAUW_ENGINE=node_shadow` ou `MIAUW_ENGINE=node`. Rollback rapido: voltar `MIAUW_ENGINE=php` e, se necessario, `MIAUW_MAINTENANCE_MODE=false`.

Para audio do Miauby, `MIAUW_AUDIO_ENABLED=true` libera o botao de fala no chat e no widget global. O fluxo atual grava audio temporario no navegador, envia para o PHP transcrever com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, mostra um rascunho local com player, duracao e transcricao, coloca o texto no campo e so manda ao Miauby quando o usuario apertar `Enviar`; depois de enviado, a bolha mostra o player/ondas e nao o texto transcrito. Quando a entrada veio por audio, o PHP pode gerar resposta falada com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts`; a voz base vem de `MIAUW_SPEECH_VOICE` ou do seletor restrito em `/miauw/diagnostico.php`. O player usa `blob:` temporario liberado apenas em `media-src`, a transcricao da resposta fica escondida por padrao e o audio nao e gravado no banco/disco. Gravacoes curtas demais sao bloqueadas e `Refazer`/`Descartar audio` continuam limpando o rascunho. `MIAUW_REALTIME_MODEL` e `MIAUW_REALTIME_VOICE` ficam preservados para evolucao futura de conversa realtime.

Para usar import/export real com Google Sheets, preencher tambem `GOOGLE_SHEETS_SPREADSHEET_ID` e uma credencial de service account em `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE`. Sem essas variaveis, a tela mostra o status como nao configurado e nao tenta sincronizar.

Depois do deploy, a home publica deve provar que esta na versao certa:

```bash
curl -I -H "Host: wimifarma.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3002/
curl -I https://wimifarma.com/home.php
```

O header esperado e `X-Served-By: wimifarma-static-home`. Se `home.php` der 404 no dominio publico, o VPS/proxy ainda esta servindo uma copia antiga ou outro container.

Portas importantes:

- container/proxy interno: `wimifarma-com-web:80`
- bind local do Compose: `127.0.0.1:3002`
- tunel local do PuTTY usado em testes: `127.0.0.1:13002`
- publico: `80/443` via Nginx Proxy Manager

Nao misturar essas portas ao configurar proxy, DNS ou WordPress.

## Documentacao

- `AGENTS.md`: manual obrigatorio para futuras conversas do Codex/agentes.
- `docs/00-visao-geral.md`: visao geral e mapa funcional.
- `docs/01-arquitetura.md`: arquitetura tecnica.
- `docs/02-banco-de-dados.md`: bancos, tabelas e cuidados.
- `docs/03-fluxos-do-sistema.md`: fluxos de usuario e operacao.
- `docs/04-padroes-de-codigo.md`: padroes existentes.
- `docs/05-comandos.md`: comandos locais, VPS, auditoria e Git.
- `docs/06-pendencias.md`: backlog tecnico encontrado.
- `docs/07-historico-de-decisoes.md`: decisoes tecnicas importantes.
- `docs/08-autenticacao-e-permissoes.md`: login, sessao, roles e riscos.
- `docs/09-deploy-e-ambiente.md`: VPS, DNS, proxy, portas e deploy.
- `docs/10-integracoes.md`: OpenAI, Farmacia Popular, GoDaddy, NPM e Google Sheets futuro.
- `docs/11-seguranca.md`: segredos, headers, CSRF, riscos e hardening.
- `docs/15-logs-e-auditoria.md`: logs, auditoria e diagnostico.
- `docs/16-testes.md`: validacoes atuais e evolucao de testes.
- `docs/17-performance.md`: performance, cache e cuidados WordPress.
- `docs/18-miauby-evolucao-generativa.md`: direcao para skills, padroes e autonomia segura do Miauby.
- `docs/19-cotacao-tempo-real.md`: presenca ao vivo, sync atual e caminho para colaboracao estilo Sheets.
- `docs/20-cotacao-v2.md`: arquitetura nova da Cotacao em Node.js, Postgres, Redis e WebSocket.

Leia `AGENTS.md` antes de qualquer alteracao.
