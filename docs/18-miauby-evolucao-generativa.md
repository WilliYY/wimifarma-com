# 18 - Miauby evolucao generativa

## O que esta parte documenta

Este documento registra a direcao tecnica para evoluir o Miauby como assistente interno generativo, com skills controladas, aprendizado de padroes e automacoes seguras. Ele nao declara funcionalidades prontas; separa o estado real encontrado do desenho recomendado para proximas etapas.

## Estado real atual

Miauby ja possui:

- conversa via `site/miauw/api.php`;
- configuracao OpenAI em `site/miauw/miauw-funcoes.php`;
- roteamento de modelos por tipo de pedido;
- tools controladas em `miauw_openai_tools()`;
- acoes controladas por `miauw_try_controlled_action()`;
- memoria operacional em `miauw_memorias`;
- base de conhecimento em `miauw_conhecimentos`;
- alertas e padroes em `miauw_alertas`, `miauw_alerta_eventos` e `miauw_padroes`;
- varredura operacional em `site/miauw/miauw-intelligence.php`;
- skills de consulta e escrita limitada em `site/miauw/miauw-skills.php`.
- em 2026-06-02, o widget global teve a bolha do Miauby levemente ampliada por variaveis CSS responsivas, mantendo offset do painel e do balao de recado para nao cobrir conteudo nem esmagar o mobile.
- em 2026-06-02, o enquadramento do avatar no widget global foi refinado com o derivado quadrado `site/miauw/miauby-avatar.jpeg`, gerado a partir de `site/miauw/miauby-novo.jpeg`: a imagem agora preenche melhor cabecalho e mensagens, sem alterar chat, audio, sessao ou backend. Em 2026-06-10, o botao flutuante passou a usar o video em loop `site/miauw/miauby-widget-loop.mp4` dentro de uma caixa quadrada arredondada, preservando o label `Miauby`, falas da Home, clique de abertura, painel, header/mensagens com avatar estatico, audio, sessao e backend; cache-bust `20260610-miauby-video`.
- em 2026-06-03, a Home autenticada passou a pedir falas curtas e ocasionais do widget global perto do botao flutuante. O `site/home.php` informa apenas `data-miauw-home-greeting`, nome exibido e chave curta de sessao; `site/miauw/widget.js` separa as falas em `HOME_SPEECH_CATEGORIES.greetings` e `HOME_SPEECH_CATEGORIES.jokes`, evita repetir a ultima categoria/frase por usuario em `localStorage`, usa primeiro nome quando o nome exibido e longo, guarda agenda em `sessionStorage` por usuario/sessao para respeitar refresh rapido, mostra a primeira fala apos 10 segundos e agenda a proxima fala a cada 10 segundos, mantendo cada balao visivel por 10 segundos. A agenda continua pausando por alguns minutos quando a pessoa interage com o widget. A primeira fala prioriza saudacao; piadas entram apenas em momentos leves da Home. Elas nao devem ser usadas em confirmacoes criticas, erros de sistema, alertas operacionais serios ou respostas de comando. O disparo e exclusivo da Home; outros modulos carregam o widget sem saudacao automatica porque nao emitem esses atributos.
- em 2026-06-02, a interface de alertas do widget global foi pausada por pedido operacional: sem aba `Alertas`, badge, lista, botao `Atualizar`, botao `Apagar` ou balao automatico de alerta no widget. `widget-status.php` e chamadas do widget para `api.php` tambem nao disparam varredura do guardiao; a fila/diagnostico de alertas continua preservada no backend e no Guardiao operacional do Miauby para uso futuro/rollback.

Nota de nomenclatura/migracao: `Miauby` e o nome canonico de produto. O prefixo tecnico `miauw` continua em rotas, arquivos, env vars e tabelas por compatibilidade ate a migracao documentada em `docs/28-miauby-migracao.md`.
- `miauw_skill_registry()` com metadados de modulo, nivel, risco, permissao, executor, entrada, saida, auditoria e efeitos.
- tool `diagnostico_skills` para o Miauby consultar o inventario de capacidades sem expor segredos.
- contador de alertas por `miauw_intelligence_active_alert_count()`, evitando carregar listas completas apenas para badges/status.
- busca de conhecimento em `miauw_knowledge_for()` com pre-filtro por termos relevantes antes do ranking, para manter o contexto generativo mais rapido conforme a memoria crescer.
- alerta de encomenda da Cotacao limitado a itens com mais de 1 dia sem baixa/pedido, com comentario operacional curto enviado aos baloes do widget em todos os modulos.
- widget com chamadas `Accept: application/json`, `X-Requested-With: XMLHttpRequest` e parser tolerante para recuperar payload JSON quando a resposta vier com aviso/ruido externo antes ou depois do objeto.
- endpoints JSON do widget (`widget-status.php`, `widget-auth.php`, `widget-alerts.php` e `api.php`) limpam buffer de saida antes de responder para evitar HTML/avisos misturados com JSON dentro da Cotacao V2.
- apos login pelo widget, o frontend confirma `widget-status.php` imediatamente para validar que o cookie de sessao foi preservado; se voltar anonimo, mostra erro claro de sessao/cookie.
- `config.local.php` so e carregado quando existe e esta legivel pelo PHP; se o arquivo local existir sem permissao de leitura, o Miauby deve continuar subindo usando variaveis do `.env` em vez de quebrar com erro fatal.
- `widget-status.php` diferencia chave configurada de chamada online validada: `api_ready` significa apenas chave preenchida e `api_status.validated=false` indica que a validacao real acontece quando o Miauby tenta responder.
- falhas da camada online do Miauby classificam autenticacao, cota, modelo e rede; o widget mostra uma mensagem curta para o operador e registra diagnostico interno sem expor chave, payload ou stack trace.
- Fase 1 do agente operacional v2 iniciada no backend PHP atual:
  - `MIAUW_AGENT_VERSION` e `MIAUW_AGENT_POLICY_VERSION`;
  - `miauw_agent_public_status()` exposto em `widget-status.php` e `api.php`;
  - prompt com isolamento operacional v2;
  - guardrail final para remover mencoes a agente de desenvolvimento, fornecedor de IA, chave, prompt e stack trace das respostas/historico exibidos ao operador;
  - assuntos tecnicos sao encaminhados como suporte tecnico interno, sem citar bastidores de desenvolvimento.
- Fase 2 do agente operacional v2 iniciada com `site/miauw/miauw-evals.php`, runner CLI de avaliacoes locais:
  - valida status/versao publica do agente;
  - valida guardrails contra bastidor tecnico e chaves `sk-...`;
  - valida sanitizacao de codigo/caminhos internos;
  - valida redirect de assuntos tecnicos para suporte tecnico interno;
  - valida registry essencial de skills;
  - valida rotas `fast`, `smart` e `boss`;
  - valida intents de lancamento financeiro, tarefa, encomenda e urgente de Cotacao;
  - nao chama OpenAI e nao executa escritas reais nos modulos.
- Fase 3 do agente operacional v2 iniciada com `/miauw/diagnostico.php`:
  - painel restrito a `admin`, `gerente` ou usuario `adm`;
  - mostra status publico do agente/API, modelos, registry de skills, alertas e diagnosticos internos recentes;
  - lista memorias e padroes pendentes para revisao;
  - aprovar/ignorar memoria ou padrao apenas marca `revisao_status` e registra `wf_logs`, sem apagar dados;
  - sanitiza textos do painel para reduzir risco de expor segredo, CPF, telefone, email ou bastidor tecnico.
- Fase 4 do agente operacional v2 iniciada:
  - `miauw_skill_core_tool_names()` define as tools core migradas;
  - registry cobre sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos;
  - `resumo_codigos` e `buscar_codigo_comissao` usam o endpoint interno tokenizado de `apps/codigos` (`/codigos/api/internal/...`) e nao caem mais no legado `wf_codigos_comissao`;
  - `registrar_sangria` encapsula lancamento financeiro como categoria `Sangria`;
  - `criar_tarefa` tambem virou OpenAI tool controlada, alem da acao local ja existente;
  - consulta de Cotacao usa a Cotacao V2 por `GET /cotacao/api/internal/search`;
  - criacao de encomenda usa a Cotacao V2 por `POST /cotacao/api/internal/encomendas`;
  - endpoints internos da Cotacao exigem token por `X-Miauw-Internal-Token` e ficam desativados sem token de ambiente.
- Fase 5 do agente operacional v2 iniciada:
  - `miauw_tool_traces` registra trace por conversa/request/tool, com status, risco, resumo sanitizado, duracao e confirmacao;
  - `/miauw/diagnostico.php` mostra estatisticas de traces das ultimas 24h e tools recentes;
  - `api.php?action=send` gera `trace_id` por mensagem e associa user/assistant/tool quando possivel;
  - acoes fortes locais e tools de escrita de alto risco ficam pendentes ate confirmacao humana;
  - o widget e a tela principal mostram resposta digitando visualmente e renderizam card de confirmacao com `Confirmar`/`Cancelar`.
- Fase 6 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase6`;
  - `miauw-evals.php` cobre contrato da proxima camada, schemas das tools, divergencia entre registry e tools online, dados incompletos sem escrita, Cotacao pedindo termo quando falta produto/EAN/categoria, prompt de nao inventar dados e confirmacao obrigatoria para escrita forte por risco;
  - `/miauw/diagnostico.php` mostra um contrato seguro da proxima camada, com Node.js 22 + TypeScript, Agents SDK, endpoint interno `/miauw/agent` e pontos que nao devem mudar agora;
  - `miauw_agent_next_phase_contract()` registra a ponte planejada para migrar o motor do Miauby sem quebrar PHP, sessoes, widget, registry, traces, confirmacoes e evals atuais.
- Fase 7 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase7`;
  - `apps/miauw-agent` cria o servico dedicado em Node.js 22 + TypeScript com `@openai/agents`;
  - o Apache publica `/miauw/agent/` por proxy interno para `wimifarma-miauw-agent:3100`;
  - `GET /miauw/agent/health` retorna somente resumo publico minimo, sem modelos, tools ou flags internas;
  - `GET /miauw/agent/status`, `POST /miauw/agent/run` e `POST /miauw/agent/stream` exigem token interno e rodam em modo sombra/controlado;
  - o servico possui uma tool de diagnostico segura e nao executa escrita real;
  - o PHP continua dono de login, sessoes, widget, registry, confirmacoes, tools auditadas e historico ate existir adaptador validado por evals.
- Fase 8 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase8`;
  - `site/miauw/miauw-funcoes.php` possui adaptador PHP para chamar `POST /miauw/agent/run` em modo sombra;
  - `api.php?action=send` pode comparar a resposta oficial PHP com a resposta sombra quando `MIAUW_AGENT_SHADOW_ON_SEND=true`;
  - a comparacao grava `miauw_agent_shadow_compare` em `miauw_tool_traces` com duracao, modelo, tamanho, similaridade, previews sanitizados e sem token;
  - por padrao `MIAUW_AGENT_SHADOW_ON_SEND=false`, entao o operador continua recebendo somente a resposta PHP, sem atraso extra;
  - `/miauw/diagnostico.php` mostra o estado do adaptador sombra e se ele esta em modo manual ou comparando no envio.
- Fase 9 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase9`;
  - `MIAUW_ENGINE` aceita `php`, `node_shadow` ou `node`;
  - `node_shadow` forca comparacao com o servico Node para usuarios liberados, sem trocar a resposta oficial;
  - `node` usa o servico Node como resposta oficial para usuarios liberados e volta ao PHP automaticamente se o Node falhar;
  - `MIAUW_AGENT_ENGINE_ALLOWED_USERS` libera o corte controlado apenas para usuarios listados, com `adm` como padrao;
  - `MIAUW_MAINTENANCE_MODE` bloqueia envio de usuarios comuns durante implantacao acelerada, mantendo `MIAUW_MAINTENANCE_ALLOWED_USERS=adm`;
  - `/miauw/diagnostico.php`, `widget-status.php` e `api.php` expõem status de motor/manutencao sem publicar token, URL interna bruta ou segredo.

- Fase 10 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase10`;
  - `MIAUW_AGENT_PERSONALITY_VERSION=miauby-persona-2026-05-16`;
  - `miauw_agent_personality_contract()` registra papel, voz, bordoes controlados, anti-padroes e proxima melhoria da personalidade;
  - o servico Node em `apps/miauw-agent` agora usa prompt de persona compacto, preservando humor curto, tom de fiscal interno, pedido minimo de contexto e regra de nao inventar dados;
  - `GET /miauw/agent/status` tokenizado expoe `personality_version` e `personality_features` sem segredo; o health publico fica enxuto para monitoramento;
  - `npm run check:persona` valida localmente o contrato da voz do Miauby sem chamar API online;
  - `/miauw/diagnostico.php` mostra o contrato da personalidade para orientar revisoes futuras.
- Fase 11 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase11`;
  - `miauw_agent_tool_contract_export()` exporta contratos versionados das tools OpenAI a partir do registry PHP, incluindo modulo, nivel, risco, confirmacao, dono da execucao, schema e resumo seguro;
  - o adaptador PHP envia `tool_contracts` em `POST /miauw/agent/run` e `POST /miauw/agent/stream`;
  - o servico Node aceita esses contratos como contexto operacional e informa `tool_contract_version`, mas continua com `writes_enabled=false`;
  - `/miauw/diagnostico.php` mostra resumo/checksum dos contratos de tools;
  - `site/miauw/miauw-evals.php` valida que os schemas batem com o registry, que nao existe schema solto e que a escrita Node segue bloqueada.
- Fase 12 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase12`;
  - o servico Node passou para `SERVICE_VERSION=0.6.0` e `PHASE=fase12-read-tool-execution`;
  - o Node registra no status tokenizado `node_executable_tools` com `diagnostico_miauby_agente` e `consultar_contrato_tool_miauby`;
  - `consultar_contrato_tool_miauby` executa no Node apenas leitura segura dos contratos enviados pelo PHP, com filtro por nome, modulo ou risco;
  - a resposta do Node informa `read_tools_enabled`, `node_executable_tools` e `tool_contract_version` para trace resumido no PHP;
  - `writes_enabled=false` continua obrigatorio: nenhuma escrita de modulo, confirmacao, sessao ou auditoria saiu do PHP.
- Fase 13 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase13`;
  - o servico Node passou para `SERVICE_VERSION=0.7.0` e `PHASE=fase13-php-read-tool-bridge`;
  - `site/miauw/agent-tools.php` adiciona uma ponte interna tokenizada para tools reais de leitura baixa, chamada pelo Node com `X-Miauw-Agent-Token`;
  - as primeiras tools migradas para execucao Node via ponte PHP sao `resumo_financeiro`, `resumo_cashback`, `resumo_codigos`, `buscar_codigo_comissao` e `buscar_cotacao`; as tools de Financeiro e Codigos consultam a fonte Postgres dos apps Node quando `FINANCEIRO_INTERNAL_TOKEN`/`CODIGOS_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` esta configurado;
  - para pedidos claramente direcionados a essas leituras, o Node faz pre-leitura deterministica pela ponte antes da resposta, alem de manter as tools disponiveis ao Agents SDK;
  - `buscar_cliente` fica fora da primeira leva por privacidade, mesmo sendo leitura, e toda escrita forte continua no PHP com confirmacao humana;
  - a ponte registra `miauw_agent_node_read_tool` em `miauw_tool_traces` com tool, chaves de argumentos, duracao e `writes_enabled=false`, sem payload bruto externo ou token.
- Fase 14 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase14`;
  - o servico Node passou para `SERVICE_VERSION=0.8.0` e `PHASE=fase14-php-all-tools-bridge`;
  - `site/miauw/agent-tools.php` virou ponte universal de tools para o Node, mantendo token interno e lista fechada vinda de `miauw_openai_tools()`;
  - o Node monta tools do Agents SDK dinamicamente a partir de `miauw_agent_tool_contract_export()`, evitando duplicar schema/risco/confirmacao no TypeScript;
  - leituras, diagnosticos, pesquisa controlada, Farmacia Popular e `buscar_cliente` mascarado podem ser orquestrados pelo Node, sempre executando no PHP;
  - `criar_tarefa` e a unica escrita de baixo risco liberada pela ponte PHP com usuario logado no payload interno;
  - sangria, lancamentos financeiros, encomendas e demais acoes fortes retornam `confirmation_required` pela ponte universal e nao gravam nada fora do fluxo de confirmacao da sessao PHP; apos confirmacao, o Financeiro grava por endpoint interno Node/Postgres quando o token interno esta configurado;
  - a ponte registra `miauw_agent_node_tool_bridge` em `miauw_tool_traces` com tool, chaves de argumentos, modo, risco, duracao e status, sem token, SQL, payload bruto externo ou stack trace.
- Fase 15 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase15`;
  - o servico Node passou para `SERVICE_VERSION=0.9.0` e `PHASE=fase15-style-router-memory`;
  - existe `MIAUW_AGENT_STYLE_VERSION=miauby-style-router-2026-05-16`;
  - `miauw_agent_style_route()` classifica mensagens em bastidor tecnico, pergunta ampla, saudacao, ruido, identidade, assunto fora da operacao, consulta operacional e acao forte;
  - perguntas casuais/de bastidor podem receber resposta local curta por `miauw_agent_try_style_reply()`, sem gastar chamada online nem tool;
  - `miauw_agent_style_context_export()` envia ao Node a rota, limite de palavras, regras duras, exemplos de voz e memorias/padroes apenas quando revisados como `aprovado`;
  - o Node respeita o contexto de estilo antes de chamar a camada online, aplica resposta local quando a rota permitir e poda listas/textos longos quando o contrato pedir conversa curta;
  - os evals cobrem que "qual sua api?" vira resposta viva com suporte tecnico interno, que "como faz um site?" pede objetivo sem tutorial numerado e que o contexto de estilo chega versionado.
- Fase 16 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase16`;
  - o servico Node passou para `SERVICE_VERSION=0.10.0` e `PHASE=fase16-training-feedback`;
  - o chat principal mostra feedback `Boa` e `Treinar` nos baloes do Miauby, enviando exemplos para revisao sem apagar mensagem original;
  - `/miauw/treino.php` e um painel restrito a `admin`, `gerente` ou usuario `adm`, com fila por status `pendente`, `aprovado`, `rejeitado` e `superado`;
  - `miauw_treinos_respostas` guarda pergunta, resposta original, resposta ideal, motivo, categoria, estilo, status e versao; revisoes novas criam versoes em vez de destruir historico;
  - `miauw_agent_style_context_export()` inclui exemplos aprovados de treino no contexto de estilo enviado ao Node, sem expor tabela, revisao ou bastidor ao operador;
  - `site/miauw/miauw-evals.php` cobre status da Fase 16, contrato de treino, fluxo versionado e contrato de tools em `fase16-training-feedback`.
- Fase 17 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase17`;
  - o servico Node passou para `SERVICE_VERSION=0.11.0` e `PHASE=fase17-training-compiler`;
  - `miauw_training_context_profile()` compila treinos aprovados em regras curtas de voz, confianca, categorias e estilos, reduzindo contexto bruto por tema;
  - `miauw_training_context_examples()` agora ranqueia exemplos por relevancia, coincidencia exata, termos sensiveis e rota de estilo;
  - `miauw_training_try_local_reply()` permite resposta local para pergunta repetida ou muito parecida com treino aprovado, sem chamada online, registrando trace `miauw_training_router`;
  - o Node aceita `training_profile` dentro do `style_context` e usa `perfil_treino_aprovado` no prompt, sem receber credencial de banco nem executar escrita direta;
  - `site/miauw/miauw-evals.php` cobre treino compilado, resposta local por treino e contrato de tools em `fase17-training-compiler`.
- Fase 18 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase18`;
  - o servico Node passou para `SERVICE_VERSION=0.12.0` e `PHASE=fase18-voice-audio-readiness`;
  - `miauw_agent_voice_profile_contract()` exporta perfis versionados de voz/tom (`miauby_padrao`, `miauby_curto`, `miauby_operacional`) para o `style_context`;
  - `miauw_agent_audio_contract()` prepara audio em modo seguro `text_only`, com microfone, playback, transcricao, TTS e armazenamento desligados;
  - `/miauw/treino.php` mostra o perfil de voz atual e avisa que audio segue sem microfone ou gravacao nesta fase;
  - o Node aceita `voice_profile` no `style_context`, inclui `perfil_voz_miauby`/`audio_miauby` no prompt e nao pode afirmar que ouviu/transcreveu/tocou audio quando o contrato estiver desligado;
  - `site/miauw/miauw-evals.php` cobre status Fase 18, contrato de voz/audio seguro, contexto de voz e contrato de tools em `fase18-voice-audio-readiness`.
- Fase 19 do agente operacional v2 ajustada para envio confirmado:
  - `MIAUW_AGENT_VERSION=2.0-fase19`;
  - o servico Node passou para `SERVICE_VERSION=0.14.0` e `PHASE=fase19-record-transcribe-confirm`;
  - `miauw_agent_audio_contract()` agora descreve audio por gravacao temporaria no navegador, transcricao com `MIAUW_TRANSCRIPTION_MODEL=gpt-4o-transcribe` e confirmacao humana antes de enviar, mantendo `storage_enabled=false`;
  - o chat principal e o widget global usam botao `Falar`; o navegador captura microfone somente apos clique, grava o trecho em `MediaRecorder`, envia para o PHP por `action=audio_transcribe`, exibe um rascunho local com player/duracao/transcricao e recebe texto editavel;
  - `widget-status.php` expoe `audio_contract` para o widget decidir quando mostrar o botao, e o frontend troca bloqueios de navegador por orientacao clara de permissao/HTTPS;
  - os headers internos permitem `microphone=(self)` para o audio do Miauby funcionar no proprio dominio, mantendo camera e geolocalizacao bloqueadas;
  - o frontend nao encerra a captura apenas porque `navigator.permissions` retornou estado antigo; ele tenta `getUserMedia()`, anexa o estado de permissao ao erro amigavel e reduz avisos repetidos de microfone bloqueado;
  - o PHP chama `https://api.openai.com/v1/audio/transcriptions` com a chave do servidor, sem expor segredo no navegador, e nao armazena o arquivo de audio;
  - audio so vira mensagem depois que o usuario revisar e apertar `Enviar`; `Refazer` grava outro audio, `Descartar audio` remove o rascunho e escrita operacional por voz segue bloqueada;
  - `site/miauw/miauw-evals.php` cobre status Fase 19, contrato de transcricao confirmada, modelo de transcricao e contrato de tools em `fase19-record-transcribe-confirm`.
- Fase 20 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase20`;
  - o servico Node passou para `SERVICE_VERSION=0.15.0` e `PHASE=fase20-voice-reply-audio-bubbles`;
  - o contrato de audio passou para `miauby-voice-reply-2026-05-17`, com `MIAUW_SPEECH_MODEL=gpt-4o-mini-tts` e `MIAUW_SPEECH_VOICE=marin`;
  - quando o usuario envia audio, o chat e o widget mostram a mensagem enviada como player/ondas, sem despejar a transcricao na bolha;
  - a transcricao continua indo como texto interno ao backend para manter contexto, historico textual, guardrails, confirmacoes e tools auditadas;
  - quando a entrada veio por audio, o PHP gera uma resposta falada por `/v1/audio/speech`, devolve o arquivo em memoria ao navegador e nao grava audio no banco ou disco;
  - gravacoes curtas demais sao bloqueadas no frontend e no PHP, e transcricoes grandes demais para poucos segundos sao recusadas para reduzir chute em audio de 1 segundo;
  - se a resposta falada falhar, o chat cai para texto normal sem executar escrita operacional por voz;
  - `site/miauw/miauw-evals.php` cobre status Fase 20, contrato de voz, bolha de audio, TTS, bloqueio de audio curto e contrato de tools em `fase20-voice-reply-audio-bubbles`.
- Fase 21 do agente operacional v2 iniciada:
  - `MIAUW_AGENT_VERSION=2.0-fase21`;
  - o servico Node passou para `SERVICE_VERSION=0.16.0` e `PHASE=fase21-voice-playback-profile-selector`;
  - o contrato de audio passou para `miauby-voice-playback-profile-2026-05-17`;
  - o CSP do Miauby e dos modulos internos permite `blob:`/`data:` somente em `media-src`, corrigindo playback dos players sem abrir script/frame/origem externa;
  - a resposta falada do Miauby aparece como audio principal e a transcricao fica escondida por padrao atras de `Ver texto`;
  - `miauw_agent_speech_voices()` limita vozes base a `marin`, `cedar`, `ash`, `coral` e `verse`;
  - `/miauw/diagnostico.php` permite salvar a voz base em `miauw_configuracoes.miauw_speech_voice`, sem versionar segredo e sem reiniciar container;
  - o prompt de TTS recebeu instrucoes fortes de fala real, ritmo, energia e regra para usar video/voz externa apenas como inspiracao geral autorizada, nunca como clonagem de pessoa/personagem;
  - `site/miauw/miauw-evals.php` cobre status Fase 21, seletor de voz, playback por blob, contrato de voz, TTS e export de tools em `fase21-voice-playback-profile-selector`.
- Complemento operacional da Fase 21:
  - o Miauby ganhou tools de Gestao no registry: `resumo_gestao` como leitura baixa e `criar_conta_gestao` como escrita forte;
  - comando `gestao`/`abrir gestao` aponta para `/gestao/`;
  - comando `gestao - titulo - valor - categoria`, `gestao - valor - titulo`, `gestao - titulo - valor` ou `gestao titulo valor` prepara uma conta a pagar, aceita categoria antes/depois e usa categoria `geral` quando houver so titulo + valor; se faltar titulo ou valor, pergunta antes;
  - se uma mensagem incompleta gerou orientacao de formato, o proximo prompt que comecar por `gestao` substitui a pendencia anterior em vez de concatenar textos antigos;
  - a escrita usa endpoint interno tokenizado da Gestao, sem credencial direta de Postgres no PHP e sem escrita direta pelo Node.
  - botoes de `Confirmar`/`Cancelar` em cards de confirmacao enviam comando silencioso para a API: o chat nao exibe nem grava `confirmar <id>`/`cancelar <id>` como fala do operador, mas continua registrando trace e resposta auditada da acao.
- Complemento XP/aura:
  - o Miauby recebeu contexto fixo sobre o modulo `/xp/`, regra R$ 1.000,00 = 2.500 XP, primeiro marco de 30.000 XP e papel do ADM como player de teste;
  - "farmar aura no XP" fica liberado como linguagem interna motivacional para venda real e lancamento correto;
  - o prompt, a base de conhecimento e o contexto enviado ao agente Node reforcam que o Miauby nao pode inventar ranking, nivel, foto, venda ou pontuacao sem dado do sistema ou do operador.
- Planejamento WhatsApp:
  - o Miauby iniciou o backend dedicado para WhatsApp em `apps/miauw-whatsapp`, com Node.js 22 + TypeScript, Postgres 17 proprio, webhook, fila, dedupe, allowlist e outbox;
  - o canal nasce desligado por `MIAUW_WHATSAPP_ENABLED=false` e so deve responder depois de configurar segredos, transporte WhatsApp e allowlist no VPS;
  - o Miauby pode responder por WhatsApp usando Evolution API ou Meta Cloud API como transporte, recebendo eventos por webhook e enviando respostas pela API de mensagem;
  - o transporte WhatsApp nao deve virar motor de IA nem dono de regra operacional; ele apenas entrega a mensagem ao Miauby e devolve a resposta autorizada;
  - o bridge WhatsApp agora busca `site/miauw/agent-context.php` para reutilizar o mesmo treino aprovado, perfil de voz, exemplos relevantes e contratos de tools do Miauby interno antes de chamar o agent;
  - `site/miauw/agent-actions.php` prepara comandos fortes permitidos do WhatsApp, como sangria e contas da Gestao, e o bridge guarda uma pendencia curta em Postgres para mostrar botoes `Sim`/`Nao`; a execucao so acontece com `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true`, tool na allowlist e pendencia valida;
  - a primeira etapa deve ser restrita a numeros autorizados, preferencialmente com prefixo `miauby`, ignorando clientes e grupos;
  - usar o numero publico do Cashback exige cuidado extra, porque clientes poderiam conversar com um assistente interno se nao houver allowlist;
  - Gemini ou outro provedor pode ser avaliado como backend configuravel do Miauby, mas precisa passar pelos mesmos contratos de persona, guardrails, tools, confirmacoes e traces.

## Arquivos, tabelas e servicos envolvidos

Arquivos:

- `site/miauw/api.php`
- `site/miauw/app.js`
- `site/miauw/agent-tools.php`
- `site/miauw/agent-actions.php`
- `site/miauw/diagnostico.php`
- `site/miauw/treino.php`
- `site/miauw/miauw-diagnostics.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-evals.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-system-map.php`
- `site/miauw/guardian-cron.php`
- `site/miauw/widget-status.php`
- `site/miauw/widget.js`
- `site/miauw/widget.css`
- `apps/miauw-agent/package.json`
- `apps/miauw-agent/scripts/check-persona.mjs`
- `apps/miauw-agent/src/server.ts`
- `apps/miauw-agent/Dockerfile`
- `apps/miauw-whatsapp/package.json`
- `apps/miauw-whatsapp/src/server.ts`
- `apps/miauw-whatsapp/Dockerfile`
- `apps/gestao/src/server.ts`
- `.env.example`
- `docker-compose.yml`

Tabelas:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_memorias`
- `miauw_conhecimentos`
- `miauw_alertas`
- `miauw_alerta_eventos`
- `miauw_padroes`
- `miauw_configuracoes`
- `miauw_tool_traces`
- `miauw_treinos_respostas`
- `miauw_whatsapp_contacts`
- `miauw_whatsapp_events`
- `miauw_whatsapp_outbox`

Integracoes:

- OpenAI Responses API;
- OpenAI Audio Transcriptions API para transcrever audio temporario do chat/widget antes do envio confirmado;
- OpenAI Audio Speech API para gerar resposta falada temporaria do Miauby quando a entrada veio por audio;
- seletor seguro de voz base no diagnostico do Miauby, persistido em `miauw_configuracoes`;
- Agents SDK no servico `wimifarma-miauw-agent`, ainda sem escrita real, com uso sombra ou corte controlado por `MIAUW_ENGINE` e leitura real via ponte PHP tokenizada;
- ponte interna da Gestao (`/gestao/api/internal/...`) para resumo e criacao confirmada de conta a pagar;
- rotinas locais dos modulos Cashback, Cotacao, Financeiro e Tarefas;
- Evolution API ou Meta Cloud API como transporte do canal WhatsApp do Miauby, com webhook tokenizado/assinado, allowlist de remetentes e envio de resposta por API estruturada;
- futuro Google Sheets para Cotacao.

## Regras de negocio que precisam ser preservadas

- Miauby nao deve ter acesso livre para executar SQL arbitrario.
- Toda escrita importante deve passar por ferramenta controlada, validada e auditavel.
- Memorias e padroes nao podem armazenar senhas, tokens, chaves, CPF/telefone sem necessidade ou dados sensiveis em texto solto.
- Revisao de memorias e padroes deve marcar status e manter historico; nao apagar dado automaticamente por clique operacional.
- Treino de resposta tambem deve ser revisado antes de virar contexto aprovado; exemplo ruim, incompleto ou sensivel deve ficar pendente/rejeitado, nunca aprovado automaticamente para todos.
- Revisar treino deve preservar versoes: quando algo aprovado muda, criar versao nova e marcar a anterior como `superado`, sem apagar a origem.
- Treino aprovado do Miauby interno tambem alimenta o WhatsApp quando a mensagem aciona o core por `miauby`; no caminho Gemini sem `miauby`, o bridge pode enviar apenas personalidade, perfil de voz, regras compiladas de treino, exemplos curtos aprovados e memoria curta sanitizada. O Gemini nao recebe pacote completo de tools nem dado operacional, e pedidos aleatorios fora da operacao devem ser recusados de forma curta em vez de virar resposta generica.
- Confirmacoes por WhatsApp nao substituem a seguranca do Miauby interno: elas precisam de pendencia no bridge, remetente autorizado, tool permitida, expiracao curta e execucao pelo endpoint PHP tokenizado.
- Respostas generativas devem separar fato real, inferencia e proximo passo.
- Balões do widget devem ser curtos, sem codigo, e usar o comentario do alerta quando existir. Para encomendas da Cotacao, comentar apenas quando passou de 1 dia.
- A autonomia deve ser gradual: primeiro diagnosticar, depois sugerir, depois executar apenas acoes pequenas com trilha de auditoria.
- Gestao e modulo financeiro critico: criar conta a pagar pelo Miauby e escrita forte, sempre exige confirmacao humana e auditoria. Consultar resumo da Gestao e leitura baixa.
- Cotacao + Sheets precisa de IDs estaveis e controle de conflito antes de qualquer automacao generativa de sync.
- WhatsApp deve ser tratado como canal externo nao autenticado por padrao: sem allowlist/prefixo/token validado, o Miauby nao deve consultar nem responder dados internos.

## Comandos textuais compartilhados

Desde 2026-06-03, todo comando textual criado ou melhorado no Miauby WhatsApp deve tambem virar base de treinamento/interpretacao para o Miauby interno quando fizer sentido operacional. O WhatsApp continua exigindo o acionamento `miauby` conforme configuracao de prefixo/allowlist; o chat interno do Miauby aceita o comando direto em texto, sem exigir a palavra `miauby`.

Regra por origem:

- WhatsApp: pode receber texto, audio transcrito e midia quando a feature existir. Comandos operacionais seguem allowlist, card liberado, usuario vinculado, idempotencia e confirmacao quando aplicavel.
- Miauby interno: trabalha apenas com texto. Ele nao deve ler imagem, foto, PDF, audio ou comprovante Pix; quando um fluxo do WhatsApp depender de midia, o interno aprende somente o fallback textual/manual.
- Responsavel no interno: vem automaticamente da sessao do usuario logado (`core_users.id`, `username`, `display_name`). O operador nao precisa digitar o proprio nome; se digitar outro responsavel, a permissao precisa ser validada antes de aceitar.
- Responsavel no WhatsApp: vem do numero vinculado/allowlist. Nome digitado diferente nao vence o vinculo do numero sem regra explicita/permissao.
- Ambos: devem registrar origem correta (`miauby_whatsapp` ou `miauby_interno`), usuario/responsavel resolvido, logs/historico e resposta curta no estilo Miauby.

Exemplos atuais por origem:

- Sangria no WhatsApp: `miauby sangria 10 troco`; no interno: `sangria 10 troco`.
- PIX CNPJ no WhatsApp: `miauby pix cnpj 28,90 sueli`; no interno: `pix cnpj 28,90 compra fornecedor` ou `registrar pix cnpj valor 28,90 observacao compra urgente`.
- Pedido no WhatsApp: `miauby pedido anb 350`; no interno: `pedido anb 350`.
- Tarefa no WhatsApp: `miauby criar tarefa conferir caixa`; no interno: `criar tarefa conferir caixa`.
- Cotacao no WhatsApp: `miauby cotacao dipirona`; no interno: `cotacao dipirona`.

Implementacao atual:

- `site/miauw/miauw-funcoes.php` exporta `identity_context`, `text_command_contracts` e `text_command_training` dentro de `miauw_agent_style_context_export()`, entao o PHP oficial, o agente Node e o bridge WhatsApp recebem a mesma regra curta.
- `apps/miauby/src/text-command-contracts.ts` registra o mesmo contrato no pacote canonico Node/Postgres read-only, exposto em `/miauby/api/internal/canonical-context`, com `identity_resolution` por origem.
- `apps/miauw-agent` consome `identity_context`/`user_context` e `text_command_training` no prompt. O bridge WhatsApp tambem inclui essas linhas no contexto do Gemini quando cair no modo conversa curta.
- Isso nao habilita escrita real no Node, nao muda `/miauw/`, nao remove PHP/MySQL do Miauby interno e nao implementa OCR/midia no chat interno.

## Decisoes tecnicas recomendadas

- Manter o registro formal de skills com nome, modulo, permissao exigida, schema de entrada, schema de saida, risco e funcao PHP executora.
- Separar skills em tres niveis:
  - leitura: consulta dados e gera resumo;
  - sugestao: detecta padroes e propoe proximo passo;
  - escrita: altera dados somente com validacao e auditoria.
- Usar `miauw_skill_registry()` antes de adicionar novas tools soltas.
- Usar `miauw_agent_tool_contract_export()` como ponte de schema para o Node; nao duplicar manualmente parametros, riscos ou confirmacoes no servico agente.
- Quando `MIAUW_ENGINE=node` estiver ativo e o Node pedir tool forte com `confirmation_required`, o servico deve devolver `tool_events` estruturados para o PHP criar a confirmacao na sessao real do operador. Nao confiar em texto solto de confirmacao vindo da ponte interna, porque isso nao grava a pendencia no navegador do usuario.
- Manter avaliacoes simples de skills em `site/miauw/miauw-evals.php`: exemplos de entrada, saida esperada e casos proibidos.
- Usar `miauw_padroes` como memoria operacional resumida, nao como caixa de texto infinito.
- Usar `miauw_treinos_respostas` para exemplos concretos de voz e resposta ideal, com pergunta/resposta original preservadas e aprovacao humana antes de entrar no contexto.
- Compilar treinos aprovados em perfil curto antes de enviar ao Node; nao transformar cada tema treinado em prompt permanente.
- Manter a tela de diagnostico do Miauby mostrando API, modelo, skills ativas, ultimos alertas, ultimos padroes e falhas recentes.
- A tela de diagnostico usa o status publico (`configured`, `validated`, `status`) e nao chama a OpenAI automaticamente. Um teste online explicito ainda pode ser adicionado depois.
- Preferir respostas operacionais e sem codigo para usuarios finais. Codigo, SQL, stack trace e comandos devem aparecer apenas em contexto tecnico autorizado.
- Medir latencia do widget e da API antes de aumentar contexto, modelos ou autonomia. Primeiro otimizar consultas, cache e tools controladas.
- Para WhatsApp, usar endpoints dedicados em `site/miauw/` em vez de reutilizar `api.php`, porque o fluxo nao tem sessao PHP/CSRF do operador e precisa de validacao propria. `agent-context.php` so exporta contexto tokenizado; `agent-tools.php` continua sendo a ponte auditada de tools.
- Manter resposta WhatsApp inicialmente textual e curta; audio, anexos e comandos de escrita devem vir depois de auditoria, testes e politica de privacidade.

## Riscos ao alterar

- Adicionar tool generativa sem schema pode criar escrita indevida no banco.
- Aprendizado automatico sem filtro pode cristalizar erro operacional.
- Aprovar treino ruim pode ensinar tom errado para assuntos amplos; revisar com exemplos curtos, vivos e sem dados sensiveis.
- `MIAUW_AUDIO_ENABLED=true` liga a interface de audio no chat, mas microfone so inicia por clique; sem HTTPS/navegador compativel ou chave configurada, o botao informa falha e o texto continua funcionando. Se o Chrome mostrar permissao ativa mas `getUserMedia()` ainda recusar, o problema pode estar em permissao do sistema operacional, pagina sem recarregar apos redefinir permissao ou outro app usando o microfone.
- Audio gravado no botao e temporario: deve virar rascunho transcrito para revisao, nunca arquivo persistido, mensagem automatica ou escrita operacional direta.
- Respostas longas demais no widget podem atrapalhar fluxo do funcionario.
- Aumentar contexto demais pode elevar custo e lentidao.
- Misturar comandos de financeiro, cotacao e cashback pode registrar dado no modulo errado.
- Otimizacoes de contexto podem esconder conhecimento antigo se o pre-filtro for estreito demais; manter fallback para conhecimentos recentes e revisar com exemplos reais.
- Conectar o numero publico de Cashback sem filtro pode expor o Miauby interno a clientes, grupos, spam e engenharia social.
- Provedores alternativos como Gemini podem ter comportamento, limites e politicas diferentes; antes de liberar em producao, comparar respostas em modo sombra e manter rollback para o motor atual.

## Pendencias

- Mapear todas as tools atuais de `miauw_openai_tools()` contra o registry e remover divergencias.
- Ampliar testes de exemplos para intents de alertas, cotacao rapida, memoria e ferramentas OpenAI registradas.
- Ampliar a tela administrativa de revisao com filtros por status/modulo e edicao controlada de memoria/padrao quando houver politica definida.
- Alimentar `/miauw/treino.php` com exemplos reais do adm por tema e transformar os melhores casos em evals fixos de voz.
- Validar a ponte PHP de leitura da Fase 13 com traces reais do `adm` e de funcionarios liberados.
- Ampliar a Fase 6/7/8/9/10/11/12/13 com mais cenarios reais coletados da operacao: alertas, memoria, Farmacia Popular, cashback, erros comuns de usuarios e exemplos bons/ruins de voz do Miauby.
- Criar metricas simples de tempo para `widget-status.php`, `api.php?action=send` e uso de conhecimentos.
- Avaliar `buscar_cliente` com revisao de privacidade antes de migrar para o Node.
- Migrar execucao real das tools de alto valor para o Node somente depois da ponte de leitura, preservando confirmacao e auditoria no PHP enquanto a escrita nao estiver duplicada com seguranca.
- Definir se o WhatsApp do Miauby usara numero separado ou o numero do Cashback com allowlist; nao conectar numero publico a respostas internas sem decisao operacional.
- Prototipar Evolution API em ambiente isolado, com webhook falso e envio para um numero autorizado, antes de mexer no VPS de producao.

## Como pode evoluir

- Fase 1: documentar tools atuais, criar registry e aplicar isolamento operacional/persona v2 sem trocar arquitetura. Em andamento/concluido parcialmente.
- Fase 2: adicionar testes de intents e respostas proibidas. Em andamento com runner CLI local.
- Fase 3: criar painel de diagnostico e revisao de memoria/padroes. Em andamento com painel restrito e revisao por status.
- Fase 4: migrar tools importantes para registry e executores controlados. Em andamento com sangria, tarefa, encomenda, resumo financeiro, consulta de Cotacao, cashback e codigos.
- Fase 5: adicionar streaming e rastreabilidade por conversa, incluindo log de tool usada e confirmacao para acoes fortes. Em andamento com streaming visual, traces estruturados e card de confirmacao.
- Fase 6: ampliar evals operacionais para regras proibidas, dados faltantes, nao inventar dados, schema/registry de tools e confirmacao de acoes destrutivas. Em andamento com runner local ampliado.
- Fase 7: criar o servico dedicado do Miauby em Node.js 22 + TypeScript com Agents SDK, preservando compatibilidade com o PHP atual ate os evals aprovarem a troca. Iniciada com servico sombra, health publico minimo e status detalhado tokenizado.
- Fase 8: criar adaptador PHP -> servico sombra, comparar respostas e traces em paralelo, e so depois planejar corte controlado do motor principal. Iniciada com adaptador desligado por padrao e traces de comparacao.
- Fase 9: ligar manutencao para usuarios comuns, usar `MIAUW_ENGINE=node_shadow|node` apenas para `adm`, validar traces e manter rollback por `.env`.
- Fase 10: preservar a personalidade do Miauby como contrato versionado no PHP/Node, com eval local para impedir resposta generica durante o corte para agente.
- Fase 11: exportar schemas de tools para o Node a partir do registry PHP e usar esse contrato no agente sem liberar escrita direta. Iniciada.
- Fase 12: executar no Node a primeira tool real de leitura segura sobre contratos auditados, mantendo escrita, confirmacao e rollback no PHP. Iniciada.
- Fase 13: migrar tools reais de leitura baixa para o Node por ponte PHP interna, mantendo banco, confirmacao, auditoria e escrita forte sob controle do PHP. Iniciada.
- Fase 16: criar o Treinador do Miauby no chat e painel restrito, usando exemplos aprovados como contexto versionado antes de audio, voz ou portabilidade externa. Iniciada.
- Fase 17: compilar treino aprovado em perfil curto, selecionar exemplos relevantes e responder localmente quando houver match forte para reduzir custo/latencia. Iniciada.
- Fase 18: versionar perfis de voz/tom e preparar contrato seguro de audio em `text_only`, sem microfone, TTS ou gravacao ate existir botao/consentimento/provedor validado. Iniciada.
- Fase 19: gravar audio temporario por botao, transcrever com OpenAI no PHP e exigir revisao humana com `Enviar`/`Cancelar` antes de virar mensagem. Iniciada.
- Fase futura WhatsApp: criar ponte Evolution API -> webhook Miauby -> resposta autorizada, primeiro com allowlist e texto, depois avaliando audio/provedores alternativos em modo sombra.
