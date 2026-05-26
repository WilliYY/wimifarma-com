# 10 - Integracoes

## O que esta parte do sistema faz

Mapeia integracoes externas existentes e planejadas.

## Integracoes existentes

### OpenAI / Miauby

Arquivos:

- `site/miauw/config.local.example.php`
- `site/miauw/bootstrap.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/api.php`
- `site/miauw/widget-status.php`
- `apps/miauw-agent/src/server.ts`

Variaveis/configuracoes:

- `MIAUW_OPENAI_API_KEY`
- `MIAUW_OPENAI_MODEL`
- `MIAUW_GUARDIAN_TOKEN`
- `MIAUW_AGENT_INTERNAL_TOKEN`
- `MIAUW_AGENT_INTERNAL_BASE_URL`
- `MIAUW_PHP_TOOL_BRIDGE_URL`
- `MIAUW_AGENT_SHADOW_ON_SEND`
- `MIAUW_AGENT_SHADOW_TIMEOUT_MS`
- `MIAUW_ENGINE`
- `MIAUW_AGENT_ENGINE_ALLOWED_USERS`
- `MIAUW_MAINTENANCE_MODE`
- `MIAUW_MAINTENANCE_ALLOWED_USERS`
- `MIAUW_MAINTENANCE_MESSAGE`
- `MIAUW_VOICE_PROFILE`
- `MIAUW_AUDIO_ENABLED`
- `MIAUW_TRANSCRIPTION_MODEL`
- `MIAUW_REALTIME_MODEL`
- `MIAUW_REALTIME_VOICE`
- `COTACAO_INTERNAL_TOKEN`
- `COTACAO_INTERNAL_BASE_URL`
- constantes opcionais em `site/miauw/config.local.php`

Status operacional:

- `site/miauw/widget-status.php` informa se a chave esta configurada, mas nao faz chamada online automaticamente.
- `api_ready=true` significa apenas que a credencial nao esta vazia nem parece placeholder.
- `api_status.validated=false` e esperado no status simples; a validacao real acontece quando `api.php?action=send` chama a Responses API.
- Erros da camada online devem ficar em diagnostico/log interno e aparecer para o operador como falha curta de configuracao, cota, modelo ou rede, sem expor chave ou payload.
- O status do widget/API tambem pode expor `agent_status`, com versao do Miauby e versao de politica operacional. Esse dado e informativo e nao valida a chamada online.
- A Fase 1 do Miauby v2 aplica guardrails para que respostas ao operador nao citem bastidores de desenvolvimento, fornecedor, chave, prompt ou stack trace; assuntos tecnicos devem virar suporte tecnico interno com tela, horario, acao feita e print.
- A Fase 2 do Miauby v2 adiciona `site/miauw/miauw-evals.php` para validar localmente intents, rotas de modelo, registry de skills e respostas proibidas sem chamar OpenAI nem executar escritas reais.
- Os guardrails finais tambem removem fragmentos de chaves `sk-...` de respostas ao operador, substituindo por credencial interna.
- A Fase 4 registra as tools core no registry e conecta o PHP do Miauby com a Cotacao V2 por endpoint interno tokenizado para consulta e criacao de encomenda.
- A Fase 5 registra traces estruturados de request/tool em `miauw_tool_traces`, mostra tools recentes no diagnostico, bloqueia escrita forte ate confirmacao humana e usa streaming visual no widget/chat. Streaming online real fica para uma futura separacao do Miauby em servico Node/TypeScript/Agents SDK.
- A Fase 6 amplia os evals locais para proteger a futura separacao: schemas de tools, divergencia registry/tools, dados obrigatorios, nao inventar dados, Cotacao sem produto/EAN/categoria e confirmacao de escrita forte por risco. O contrato da proxima camada fica em `miauw_agent_next_phase_contract()` e no diagnostico, sem mudar ainda o motor PHP atual.
- A Fase 7 cria `wimifarma-miauw-agent`, servico Node.js 22 + TypeScript com Agents SDK em `/miauw/agent/`. Ele possui health/status e endpoints internos `run` e `stream` protegidos por token, mas roda em modo sombra sem escrita real; o chat PHP atual continua sendo o caminho oficial.
- A Fase 8 adiciona o adaptador PHP para o servico sombra: quando `MIAUW_AGENT_SHADOW_ON_SEND=true`, `api.php?action=send` chama `POST /miauw/agent/run`, compara com a resposta oficial PHP e registra trace seguro. O padrao segue `false`, sem impacto no operador.
- A Fase 9 adiciona corte controlado por `MIAUW_ENGINE`: `php` mantem o motor antigo, `node_shadow` compara Node para usuarios liberados e `node` usa Node como resposta oficial para esses usuarios, com fallback automatico para PHP se o servico falhar. Durante implantacao acelerada, `MIAUW_MAINTENANCE_MODE=true` bloqueia usuarios comuns e libera `adm`.
- A Fase 10 adiciona contrato versionado da personalidade do Miauby (`miauby-persona-2026-05-16`) no PHP e no Node. O servico `/miauw/agent/health` informa `personality_version`, e `npm run check:persona` valida o prompt Node sem chamar a camada online.
- A Fase 11 adiciona contratos de tools exportados pelo PHP: `miauw_agent_tool_contract_export()` consolida registry, schemas, riscos e confirmacoes, e o adaptador envia `tool_contracts` ao servico Node. O Node usa isso como contexto, mas segue sem escrita direta e sem executar tools reais.
- A Fase 12 libera a primeira tool real executada no Node, `consultar_contrato_tool_miauby`, apenas para leitura dos contratos seguros enviados pelo PHP. O Node pode consultar nome/modulo/risco de tools auditadas, mas `writes_enabled=false` permanece e qualquer escrita/confirmacao/auditoria continua no PHP.
- A Fase 13 libera tools reais de leitura baixa no Node por ponte PHP interna tokenizada (`/miauw/agent-tools.php`). O Node chama Financeiro, Cashback, Codigos e Cotacao pelo PHP, com pre-leitura deterministica para pedidos claros e tools disponiveis ao Agents SDK; `buscar_cliente` e todas as escritas fortes continuam fora dessa primeira leva.
- A Fase 14 libera a ponte PHP universal para o Node orquestrar todas as tools exportadas pelo registry, mantendo execucao/auditoria no PHP, escrita direta Node bloqueada e acoes fortes retornando `confirmation_required`.
- A Fase 15 adiciona o roteador de estilo versionado: o PHP envia `style_context` ao Node com rota, limite de palavras, regras de voz, exemplos e memorias/padroes aprovados. Perguntas casuais, bastidor tecnico, saudacoes e ruido podem ser respondidos localmente sem chamada online nem tool, preservando a voz do Miauby e reduzindo custo/latencia.
- A Fase 16 adiciona o Treinador do Miauby: feedback do chat e revisao em `/miauw/treino.php` salvam exemplos versionados em `miauw_treinos_respostas`; somente exemplos aprovados entram no `style_context` enviado ao Node, que continua sem escrita direta.
- A Fase 17 adiciona o compilador de treino: o PHP seleciona exemplos aprovados por relevancia, gera `training_profile` compacto no `style_context` e pode responder localmente quando a pergunta bater forte com treino aprovado, sem chamada online.
- A Fase 18 adiciona perfis de voz/tom e contrato seguro de audio: o PHP envia `voice_profile` e `audio_contract` ao Node, mas o modo segue `text_only`, com microfone, transcricao, TTS, playback e armazenamento desligados ate uma fase propria com botao e consentimento.
- A Fase 19 usa audio estilo WhatsApp no chat principal e no widget global: o botao `Falar` captura microfone somente por clique, grava trecho temporario no navegador, envia para `site/miauw/api.php?action=audio_transcribe`, e o PHP chama `/v1/audio/transcriptions` com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe`, sem expor chave no navegador. O texto transcrito fica no campo para revisar, `Enviar` ou `Cancelar`; o audio nao e armazenado e voz nao executa escrita operacional direta. O frontend tenta `getUserMedia()` antes de concluir bloqueio para evitar falso negativo de permissao antiga no Chrome.

Tabelas:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_memorias`
- `miauw_conhecimentos`
- `miauw_alertas`
- `miauw_treinos_respostas`

### Farmacia Popular / Miauby

Arquivos:

- `site/miauw/miauw-farmacia-popular.php`
- `site/miauw/farmacia-popular-cron.php`

Tabelas:

- `miauw_farmacia_popular_valores`
- `miauw_farmacia_popular_atualizacoes`

### GoDaddy DNS

Uso:

- Gerenciar registros de `wimifarma.com`.

Estado conhecido:

- `A @` para IP do VPS.
- `CNAME www` para `wimifarma.com.`
- nameservers GoDaddy.

### Nginx Proxy Manager

Uso:

- Proxy e SSL para dominios no VPS.

Destino correto:

- `http://wimifarma-com-web:80`

## Integracoes planejadas

### WhatsApp / Miauby via Evolution API

Objetivo:

- permitir que o Miauby responda mensagens recebidas por WhatsApp, inicialmente como canal interno controlado para o usuario/equipe, sem abrir dados operacionais para clientes ou grupos.

Estado atual:

- backend dedicado iniciado em `apps/miauw-whatsapp`, Node.js 22 + TypeScript;
- Postgres 17 proprio em `wimifarma-miauw-whatsapp-db`, volume `miauw-whatsapp-data/`;
- Apache publica `/miauw/whatsapp/` por proxy interno para `wimifarma-miauw-whatsapp:3400`;
- `GET /miauw/whatsapp/health` mostra status seguro;
- `POST /miauw/whatsapp/webhook` recebe eventos da Evolution API;
- `POST /miauw/whatsapp/worker/run` processa fila manualmente com token interno;
- o canal nasce desligado por `MIAUW_WHATSAPP_ENABLED=false`.

Desenho:

- Evolution API roda como servico separado no VPS, com banco/cache proprios e segredos apenas no `.env`;
- uma instancia WhatsApp e conectada por QR Code/WhatsApp Web ou, em uma etapa mais formal, por WhatsApp Cloud API oficial;
- a Evolution API envia eventos de mensagem recebida por webhook para `https://wimifarma.com/miauw/whatsapp/webhook`;
- o endpoint valida token secreto, origem/evento, instancia, numero remetente, prefixo e tipo de conversa antes de chamar o Miauby;
- eventos aceitos entram em fila Postgres com dedupe por provider/instancia/message id;
- o Miauby continua sendo o motor de resposta e de permissao; a Evolution API deve ser apenas transporte de entrada/saida;
- a resposta volta pela API estruturada da Evolution API, por exemplo envio de texto para a mesma conversa.

Regras iniciais obrigatorias:

- comecar com allowlist de numeros autorizados, como o telefone do dono/equipe, e ignorar clientes, grupos e remetentes desconhecidos;
- opcionalmente exigir prefixo como `miauby` para ativar resposta automatica no WhatsApp;
- nao usar o numero publico de Cashback sem filtro, porque clientes poderiam acionar o assistente interno;
- manter acoes fortes bloqueadas ou retornando confirmacao humana auditada; WhatsApp nao deve virar atalho para sangria, contas, encomenda ou escrita sensivel sem fluxo proprio;
- registrar trace sanitizado com telefone mascarado, instancia, evento, tamanho da mensagem, status e latencia, sem guardar payload bruto externo nem token;
- se for usar Gemini ou outro provedor, encapsular como motor configuravel do Miauby, nao como resposta solta direto na Evolution API.

Cuidados sobre o numero:

- o numero `+55 44 9739-4711`, mostrado como Wimifarma Cash Back, so deve ser usado se estiver sob controle da empresa e se a equipe aceitar que ele funcione como canal automatizado;
- para teste, preferir uma instancia/numero separado ou uma allowlist rigorosa antes de conectar o numero usado com clientes;
- no modo WhatsApp Web/Baileys, a sessao depende da conexao autorizada por QR Code e pode exigir manutencao operacional;
- no modo WhatsApp Cloud API oficial, ha regras da Meta, configuracao propria e possivel custo por conversa.

Variaveis:

- `MIAUW_WHATSAPP_ENABLED`
- `MIAUW_WHATSAPP_WEBHOOK_TOKEN`
- `MIAUW_WHATSAPP_INTERNAL_TOKEN`
- `MIAUW_WHATSAPP_ENCRYPTION_KEY`
- `MIAUW_WHATSAPP_HASH_SALT`
- `MIAUW_WHATSAPP_ALLOWED_SENDERS`
- `MIAUW_WHATSAPP_REQUIRE_PREFIX`
- `MIAUW_WHATSAPP_PREFIX`
- `MIAUW_WHATSAPP_GROUPS_ENABLED`
- `MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_INSTANCE`

Status:

- backend do bridge criado e desligado por padrao;
- ainda falta configurar segredos reais, subir Evolution API separada, conectar QR da instancia e testar webhook real no VPS.

### Google Sheets / Cotacao

Objetivo:

- Espelhar Cotacao com planilha, mantendo sistema e Sheets coerentes.

Arquivos/tabelas candidatos:

- `apps/cotacao/src/server.js`
- `cotacao_v2_rows`
- `cotacao_v2_columns`
- `cotacao_v2_rules`
- `cotacao_v2_styles`
- `cotacao_v2_events`

Estado atual:

- A Cotacao V2 possui endpoints de status, export e import Google Sheets.
- A integracao depende de `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_RANGE` e credencial de service account no `.env`.
- O export inclui `cotacao_row_id` para preservar o ID estavel da linha.
- O import usa `cotacao_row_id` quando presente; sem IDs, trata o range como substituicao controlada da cotacao ativa.

### Miauby skills generativas

Objetivo:

- Evoluir Miauby para entender padroes operacionais e gerar sugestoes melhores, sem liberar acesso bruto ao banco ou escrita sem controle.

Arquivos candidatos:

- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-system-map.php`

Direcao:

- criar registry formal de skills;
- separar skills de leitura, sugestao e escrita;
- validar permissao, schema e auditoria por skill;
- revisar memorias e padroes antes de transformar em automacao.
- preservar isolamento operacional do Miauby v2 ao adicionar novas tools.
- manter `miauw-evals.php` atualizado sempre que novas intents/tools forem adicionadas.
- novas tools de escrita forte devem declarar risco no registry e passar pelo fluxo de confirmacao/traces antes da execucao.
- para Cotacao, usar somente a ponte interna da V2 (`COTACAO_INTERNAL_BASE_URL` + token), evitando qualquer escrita direta nas tabelas antigas removidas.
- ao migrar tools para o servico Node/TypeScript/Agents SDK, usar a ponte PHP universal tokenizada; o Node orquestra, mas PHP segue executando, auditando e validando risco.
- enquanto o servico Node nao executar confirmacoes da mesma sessao, manter PHP como dono de login, sessao, confirmacoes e escrita forte.
- usar traces `miauw_agent_shadow_compare` e `miauw_agent_node_reply` para medir divergencia, latencia e falhas durante o corte por `adm`.
- preservar a personalidade versionada do Miauby ao migrar tools para Node; respostas genericas, secas ou burocraticas devem virar caso de eval antes de liberar mais usuarios.
- consumir contratos exportados pelo PHP antes de migrar qualquer tool de escrita para o Node; `criar_tarefa` pode gravar via PHP bridge com usuario logado, mas acoes fortes devem retornar `confirmation_required`.
- para comportamento/persona, preferir evoluir `miauw_agent_style_route()`, memorias/padroes aprovados, exemplos aprovados em `miauw_treinos_respostas` e evals de voz antes de aumentar prompt longo; conversa casual nao deve listar tools nem expor bastidor.
- treinos aprovados devem virar perfil compacto e regras de estilo; nao enviar todo historico de treino para o Node.

Documento especifico:

- `docs/18-miauby-evolucao-generativa.md`

## Regras que precisam ser preservadas

- Nao salvar chaves externas no Git.
- Usar APIs estruturadas em vez de copiar/colar texto solto.
- Registrar auditoria quando integracoes alterarem dados importantes.
- Em Cotacao + Sheets, preservar IDs, ordem, status, precos, observacoes e formatacao.

## Decisoes tecnicas ja tomadas

- Miauby pode ler chave OpenAI do `.env` ou de `config.local.php`.
- Presenca de chave nao prova que a Responses API aceitou a credencial; diagnosticar falhas pelo log/alerta interno quando o chat cair no fallback.
- Cotacao nao deve receber sincronizacao improvisada fora dos endpoints estruturados da V2.
- Google Sheets deve preservar `cotacao_row_id` para reduzir duplicacao e perda de linha.
- DNS e proxy ficam fora do repositorio, mas suas decisoes devem ser documentadas.

## Riscos ao alterar

- Chaves expostas em commit.
- Integracao de Sheets sobrescrevendo dados de cotacao.
- Mudancas de DNS interrompendo acesso publico.
- Jobs sem token permitindo execucao publica indevida.

## Pendencias

- Configurar credencial real Google Sheets no VPS.
- Validar import/export em planilha controlada antes de usar dados reais.
- Definir modelo final de conflito para import simultaneo enquanto usuarios editam.
- Evoluir tela de diagnostico de integracoes com ultimos erros e latencia.
- Criar logs de execucao para jobs.

## Evolucao futura

- Criar `docs/10-integracoes/google-sheets-cotacao.md`.
- Criar camada de servicos para integracoes externas.
- Adicionar fila/job para sincronizacoes longas.
- Usar Miauby para resumo de divergencias e alertas.
