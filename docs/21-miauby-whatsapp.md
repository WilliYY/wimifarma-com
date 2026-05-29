# 21 - Miauby WhatsApp

## O que esta parte documenta

Este documento registra a primeira estrutura do canal WhatsApp do Miauby. A implementacao inicial cria um backend dedicado em Node.js/TypeScript, com Postgres 17 proprio, webhook para Evolution API ou Meta Cloud API, fila duravel, deduplicacao, allowlist, painel operacional e outbox. O repositorio nasce desligado por padrao; em producao, o canal pode ser ligado por `.env` quando token, cifragem e allowlist estiverem revisados.

Desde 2026-05-27, o bridge tambem pode receber audio de WhatsApp, transcrever com Gemini e, quando habilitado, responder com audio gerado por Gemini TTS. Audio bruto nao e salvo no banco: o evento guarda apenas metadados sanitizados e a transcricao textual usada pelo roteador.

Desde 2026-05-27, o bridge tambem pode ler foto, print, imagem encaminhada ou PDF/documento de comprovante Pix de remetente autorizado, validar o destino por CNPJ/chave Pix ou nome correlato configurado e preparar um lancamento `Pix CNPJ` no Financeiro com confirmacao `Sim`/`Nao`. A midia e baixada apenas em memoria no worker, enviada ao Gemini para extracao estruturada e descartada; o banco guarda somente metadados sanitizados e o comando/pendencia gerados. Correcoes manuais podem usar `pix cnpj valor - nome - obs opcional` sem data/hora.

## Componentes

- `apps/miauw-whatsapp`: servico Node.js 22 + TypeScript.
- `wimifarma-miauw-whatsapp`: container do bridge WhatsApp.
- `wimifarma-miauw-whatsapp-db`: Postgres 17 dedicado ao canal.
- Apache publica `/miauw/whatsapp/` por proxy interno para `wimifarma-miauw-whatsapp:3400`.
- A home publica possui o card `Miauby Whatsapp`, apontando para `/miauw/whatsapp/`.
- Evolution API fica fora do Compose principal, com template em `ops/evolution/` e servico separado no VPS em `/home/ubuntu/projetos/wimifarma-evolution-api`; Meta Cloud API usa o mesmo bridge, sem stack local extra.
- `wimifarma-miauw-agent` continua sendo o motor de resposta do Miauby.

Fluxo:

```text
WhatsApp
  -> Evolution API ou Meta Cloud API
  -> POST /miauw/whatsapp/webhook
  -> Postgres dedicado: evento + fila
     -> se for audio autorizado: baixa midia do transporte, transcreve e descarta bytes
     -> se for foto, print, PDF/documento de comprovante Pix autorizado: baixa midia, extrai campos e descarta bytes
  -> roteador de IA do bridge
     -> Gemini para conversa simples, quando MIAUW_WHATSAPP_AI_MODE=hybrid e GEMINI_API_KEY existe
     -> site/miauw/agent-context.php para buscar treino/perfil/tools compartilhados do Miauby interno
     -> site/miauw/agent-actions.php para preparar/executar acoes confirmadas liberadas por allowlist
     -> wimifarma-miauw-agent /miauw/agent/run para comandos internos ou fallback
  -> outbox
  -> Evolution API /message/sendText, /sendButtons ou /sendWhatsAppAudio, ou Meta text/interactive/audio
  -> Postgres do bridge registra memoria curta sanitizada sem bloquear a fila
```

## Banco de dados

O canal usa Postgres dedicado porque o dominio precisa de fila robusta, deduplicacao, indices parciais, `JSONB` para metadados sanitizados e processamento seguro por `FOR UPDATE SKIP LOCKED`.

Tabelas criadas pelo servico:

- `miauw_whatsapp_contacts`: contatos autorizados/vistos, com telefone em hash, mascara e numero cifrado quando necessario para comparar allowlist, inclusive variacoes brasileiras com/sem nono digito.
- `miauw_whatsapp_events`: eventos recebidos, status da fila, dedupe por provider/instancia/message id, metadados sanitizados e identificadores cifrados.
- `miauw_whatsapp_outbox`: respostas geradas e tentativas de envio pelo transporte WhatsApp escolhido, incluindo metadados sanitizados quando a resposta planejada foi audio.
- `miauw_whatsapp_contact_modules`: cards/modulos liberados por contato autorizado, como Cashback, Cotacao, Pedidos, Financeiro, Gestao, Tarefas, XP, Codigos e Miauby.
- `miauw_whatsapp_error_logs`: falhas sanitizadas de fila, envio e HTTP, com origem, severidade, trace curto, mascara do contato, resumo e contexto limpo para diagnostico.
- `miauw_whatsapp_channel_events`: memoria curta compartilhada entre Miauby interno e WhatsApp, com resumo sanitizado de entrada/saida, canal, motor, status, trace, hash/mascara do contato e metadados limpos.

O banco nao deve guardar payload bruto externo, telefone cru em texto aberto ou bytes de audio/midia. O servico guarda hash/mascara para auditoria e cifra os identificadores necessarios para responder; o painel logado pode decifrar o telefone apenas na area de edicao da allowlist. Para audio, foto, print, imagem e PDF/documento, `payload_summary.media` guarda apenas tipo, provider, chave/id da midia e sinais como mime/duracao/tamanho quando disponiveis; a midia e baixada do transporte somente durante o processamento, enviada ao Gemini para transcricao/extracao e descartada em memoria.

Confirmacoes por WhatsApp usam tambem `miauw_whatsapp_confirmations`, com remetente em hash/mascara, tool, resumo, `command_payload` sanitizado, status, expiracao e trace. Essa tabela guarda apenas a pendencia operacional necessaria para o botao `Sim`/`Nao`; payload bruto da Evolution/Meta continua fora do banco e telefone completo fica somente cifrado quando necessario.

O contexto compartilhado entre Miauby interno e WhatsApp usa como fonte principal a tabela Postgres `miauw_whatsapp_channel_events`, exposta pelo endpoint interno tokenizado `POST /miauw/whatsapp/internal/memory`. O PHP chama essa ponte por `MIAUW_CHANNEL_MEMORY_BRIDGE_URL`; se o bridge estiver indisponivel, `site/miauw/agent-memory.php` e a tabela MySQL `miauw_channel_events` seguem como fallback de compatibilidade. A memoria guarda apenas resumo sanitizado de entrada/saida, canal, motor, status, trace, hash/mascara do contato e metadados limpos. O chat interno grava os turnos ao responder; o worker WhatsApp grava a ida/volta apos envio sem bloquear a fila. Essa memoria nao deve guardar telefone cru, payload bruto do transporte, audio, midia, token ou SQL.

## Variaveis

Principais variaveis:

- `MIAUW_WHATSAPP_ENABLED=false`
- `MIAUW_WHATSAPP_POSTGRES_PASSWORD`
- `MIAUW_WHATSAPP_WEBHOOK_TOKEN`
- `MIAUW_WHATSAPP_INTERNAL_TOKEN`
- `MIAUW_WHATSAPP_ENCRYPTION_KEY`
- `MIAUW_WHATSAPP_HASH_SALT`
- `MIAUW_WHATSAPP_ALLOWED_SENDERS`
- `MIAUW_WHATSAPP_DASHBOARD_USER`
- `MIAUW_WHATSAPP_DASHBOARD_PASSWORD`
- `MIAUW_WHATSAPP_DASHBOARD_SESSION_TTL_MINUTES=720`
- `MIAUW_WHATSAPP_DEFAULT_DDD=44`
- `MIAUW_WHATSAPP_REQUIRE_PREFIX=true`
- `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=false`
- `MIAUW_WHATSAPP_PREFIX=miauby`
- `MIAUW_WHATSAPP_GROUPS_ENABLED=false`
- `MIAUW_WHATSAPP_MAX_REPLIES_PER_INBOUND=1`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=6`
- `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=120`
- `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=700`
- `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=2200`
- `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=8`
- `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=2500`
- `MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS=60000`
- `MIAUW_WHATSAPP_AI_MODE=miauw`
- `MIAUW_WHATSAPP_GEMINI_MODEL=gemini-2.5-flash`
- `MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS=220`
- `MIAUW_WHATSAPP_GEMINI_TEMPERATURE_X100=35`
- `MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET=0`
- `MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED=false`
- `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=false`
- `MIAUW_WHATSAPP_AUDIO_REPLY_MODE=voice_on_voice`
- `MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_PROVIDER=gemini`
- `MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_MODEL=gemini-2.5-flash`
- `MIAUW_WHATSAPP_AUDIO_TTS_PROVIDER=gemini`
- `MIAUW_WHATSAPP_AUDIO_TTS_MODEL=gemini-2.5-flash-preview-tts`
- `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr`
- `MIAUW_WHATSAPP_AUDIO_TTS_STYLE=voz aguda, brilhante e brincalhona de gato curioso; humana e clara, levemente felina, sem imitar pessoa real, sem cantar, sem miar demais e sem ficar grave ou masculina`
- `MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_TIMEOUT_MS=30000`
- `MIAUW_WHATSAPP_AUDIO_TTS_TIMEOUT_MS=30000`
- `MIAUW_WHATSAPP_AUDIO_MAX_BYTES=10000000`
- `MIAUW_WHATSAPP_AUDIO_TTS_MAX_CHARS=700`
- `MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS=900`
- `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=false`
- `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ=07676534000181`
- `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES=W Y Yoshiura Willian Produtos Farmaceuticos E Perfumaria,Yoshiura Willian,Wimifarma`
- `MIAUW_WHATSAPP_PIX_RECEIPT_MIN_TARGET_SCORE_X100=70`
- `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL=gemini-2.5-flash`
- `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_MAX_BYTES=10000000`
- `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_TIMEOUT_MS=30000`
- `MIAUW_WHATSAPP_CONTEXT_PACK`
- `MIAUW_WHATSAPP_CONTEXT_URL=http://wimifarma-com-web/miauw/agent-context.php`
- `MIAUW_WHATSAPP_CONTEXT_CACHE_TTL_SECONDS=60`
- `MIAUW_WHATSAPP_CONTEXT_TIMEOUT_MS=3500`
- `MIAUW_WHATSAPP_GEMINI_CONTEXT_TIMEOUT_MS=1200`
- `MIAUW_WHATSAPP_MEMORY_TIMEOUT_MS=2500`
- `MIAUW_WHATSAPP_MEMORY_RECENT_DAYS=2`
- `MIAUW_CHANNEL_MEMORY_BRIDGE_URL=http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp/internal/memory`
- `MIAUW_CHANNEL_MEMORY_BRIDGE_TIMEOUT_MS=650`
- `MIAUW_WHATSAPP_ACTIONS_URL=http://wimifarma-com-web/miauw/agent-actions.php`
- `MIAUW_WHATSAPP_ACTIONS_TIMEOUT_MS=8000`
- `MIAUW_WHATSAPP_CONFIRMATIONS_ENABLED=true`
- `MIAUW_WHATSAPP_INTERACTIVE_CONFIRMATIONS=true`
- `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS=false`
- `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=false`
- `MIAUW_WHATSAPP_CONFIRMATION_TTL_MINUTES=15`
- `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST=registrar_sangria,criar_lancamento_financeiro,criar_conta_gestao`
- `MIAUW_WHATSAPP_ACTOR_USER_ID=1`
- `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS=90`
- `MIAUW_WHATSAPP_RECIPIENT_ALIASES`
- `MIAUW_WHATSAPP_AGENT_RUN_URL=http://wimifarma-miauw-agent:3100/miauw/agent/run`
- `MIAUW_WHATSAPP_N8N_ENABLED=false`
- `MIAUW_WHATSAPP_N8N_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_BASE_URL`
- `MIAUW_WHATSAPP_N8N_WEBHOOK_SECRET`
- `MIAUW_WHATSAPP_AUTOMATION_NOTIFY_COOLDOWN_MINUTES=15`
- `MIAUW_WHATSAPP_WATCHDOG_LOOKBACK_MINUTES=30`
- `MIAUW_WHATSAPP_WATCHDOG_STUCK_MINUTES=2`
- `MIAUW_WHATSAPP_WATCHDOG_SLOW_TOTAL_MS=30000`
- `MIAUW_WHATSAPP_SMOKE_CHECK_TIMEOUT_MS=6000`
- `MIAUW_WHATSAPP_OUTBOX_RECOVERY_BATCH_SIZE=3`
- `MIAUW_WHATSAPP_OUTBOX_RECOVERY_MAX_AGE_MINUTES=30`
- `MIAUW_WHATSAPP_PROVIDER=evolution`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_INSTANCE`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_GRAPH_API_VERSION=v23.0`

## Endpoints

- `GET /miauw/whatsapp/`: painel operacional seguro com canal, transporte, fila, outbox, allowlist, status de OCR Pix CNPJ, n8n automacoes, demora de resposta e eventos recentes, sem segredo nem payload bruto; quando `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` estao preenchidos, exige login por cookie assinado. A allowlist do painel logado mostra e edita o telefone completo decifrado para operacao.
- `GET /miauw/whatsapp/login`: tela de login do painel, com a foto atual do Miauby e favicon proprio.
- `POST /miauw/whatsapp/login`: autentica o painel com usuario/senha do ambiente.
- `POST /miauw/whatsapp/logout`: encerra a sessao do painel e volta para a home `/`.
- `POST /miauw/whatsapp/allowlist`: autoriza um remetente no Postgres a partir do painel, salvando apenas hash/mascara/numero cifrado, nome curto opcional e cards liberados.
- `POST /miauw/whatsapp/allowlist/update`: edita nome, troca numero digitado novamente e ajusta os cards liberados do contato.
- `POST /miauw/whatsapp/allowlist/block`: bloqueia um contato salvo no Postgres e faz esse bloqueio vencer sobre a allowlist fixa do ambiente.
- `POST /miauw/whatsapp/allowlist/allow`: reautoriza um contato salvo no Postgres.
- `POST /miauw/whatsapp/errors/resolve`: marca erro aberto como resolvido no painel, depois que a correcao operacional/codigo foi feita.
- `GET /miauw/whatsapp/health`: status seguro do servico.
- `GET /miauw/whatsapp/status`: status seguro do servico, protegido pelo login do painel quando ele esta configurado.
- `GET /miauw/whatsapp/webhook`: verificacao `hub.challenge` da Meta Cloud API.
- `POST /miauw/whatsapp/webhook`: webhook da Evolution API ou Meta Cloud API.
- `POST /miauw/whatsapp/worker/run`: processamento manual protegido por token interno.
- `POST /miauw/whatsapp/internal/memory`: endpoint interno tokenizado da memoria curta compartilhada. Aceita `record`, `record_batch` e `recent`; grava/consulta `miauw_whatsapp_channel_events` no Postgres do bridge e deve receber somente texto resumido/sanitizado, hash/mascara e metadados limpos.
- `POST /miauw/whatsapp/internal/smoke-check`: endpoint interno tokenizado para n8n/pos-deploy. Roda checks de health do bridge, proxy Apache, core Miauby, Gestao, Pedidos, Cotacao, widget e conexao Evolution; aceita `notify=never|problems|always` no JSON ou query. Quando notifica, envia apenas para contatos reais autorizados com card `Miauby`, respeitando cooldown e bloqueando LIDs protegidos.
- `POST /miauw/whatsapp/internal/watchdog`: endpoint interno tokenizado para n8n/monitoramento. Verifica fila travada, outbox `pending/sending`, falhas recentes, respostas lentas, envios `sent` sem id do provedor, pausa do transporte e conversas que receberam `sent` mas ficaram com nova mensagem sem resposta; aceita `notify=never|problems|always`.
- `POST /miauw/agent-context.php`: endpoint PHP interno, protegido por `MIAUW_AGENT_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN`, usado pelo bridge para exportar `style_context`, treino aprovado, perfil de voz, `channel_memory` e contratos de tools do Miauby interno antes de chamar o agent.
- `POST /miauw/agent-memory.php`: endpoint PHP interno de compatibilidade, protegido pelo mesmo token. Ele tenta usar a ponte Postgres do bridge e cai para `miauw_channel_events` no MySQL somente se a ponte estiver indisponivel. Aceita `record`, `record_batch` e `recent`; deve receber somente texto resumido/sanitizado, hash/mascara e metadados limpos.
- `POST /miauw/agent-actions.php`: endpoint PHP interno, protegido pelo mesmo token, usado pelo bridge para preparar acoes fortes permitidas e executar somente depois de confirmacao pendente no WhatsApp.

O webhook aceita token por `Authorization: Bearer`, `X-Miauw-Whatsapp-Token`, `X-Webhook-Token`, `X-Evolution-Webhook-Token` ou query `?token=...`, para compatibilidade com configuracoes diferentes da Evolution API. No modo Meta, `GET` usa `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `POST` deve usar `X-Hub-Signature-256` com `META_WHATSAPP_APP_SECRET`.

## Regras iniciais

- O repositorio mantem o servico desligado por `MIAUW_WHATSAPP_ENABLED=false`; cada ambiente pode ligar por `.env`.
- Com o servico ligado, `MIAUW_WHATSAPP_WEBHOOK_TOKEN` e uma chave de cifragem precisam estar configurados.
- O painel `/miauw/whatsapp/` deve ficar protegido por `MIAUW_WHATSAPP_DASHBOARD_USER` e `MIAUW_WHATSAPP_DASHBOARD_PASSWORD` nos ambientes operacionais. Health continua publico e sem segredo para smoke test.
- Mesmo protegido por login, o painel nao deve exibir segredos nem payload bruto. Telefone completo so pode aparecer na edicao da allowlist, porque essa tela exige login do painel e CSRF; status publico, health, logs recentes e sincronias continuam com mascara/hash.
- A allowlist fixa por `MIAUW_WHATSAPP_ALLOWED_SENDERS` continua sendo a base por ambiente. O painel tambem permite autorizar/bloquear contatos no Postgres; bloqueio salvo no Postgres vence sobre a allowlist fixa, e autorizacao salva no Postgres permite adicionar remetentes sem editar `.env`. A comparacao de numero aceita equivalencia operacional com/sem DDI brasileiro `55` e com/sem o nono digito depois do DDD, para evitar bloqueio indevido quando Evolution/Baileys entrega formatos diferentes. O cadastro aceita formatos como `44997641531`, `44 99764 1531`, `997641531` e `97641531`; se faltar DDD, o bridge usa `MIAUW_WHATSAPP_DEFAULT_DDD`, e se faltar DDI o bridge normaliza para `55` por padrao operacional do Brasil. Numeros de outro pais devem ser cadastrados completos.
- Cada contato salvo no Postgres pode ter cards/modulos liberados. Ao pedir `miauby menu`, `miauby cards` ou equivalente, o bridge retorna apenas os cards autorizados para aquele telefone, considerando hash direto, alias da Evolution e equivalencia operacional com/sem DDI `55`. O bridge tambem bloqueia chamadas do core/tools quando o card detectado na mensagem ou na tool retornada nao esta liberado para o telefone.
- Grupos ficam bloqueados por padrao.
- Remetente fora da allowlist nao chama Gemini nem core Miauby. Quando envia texto individual, o bridge registra o evento como `ignored/sender_not_allowed` e manda no maximo um aviso curto a cada alguns minutos dizendo que o Miauby e interno e so responde numeros permitidos.
- Prefixo `miauby` fica exigido por padrao no repositorio. Em ambiente operacional com allowlist revisada, ele pode ser desligado por `MIAUW_WHATSAPP_REQUIRE_PREFIX=false`; nesse modo, conversa solta sem comando vai para Gemini com personalidade/instrucoes seguras. Se `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, comandos operacionais detectados, como `sangria 10 Will`, tambem acionam o core Miauby/API com tools e confirmacao. Mensagens com `miauby` em qualquer posicao continuam acionando o core.
- O canal responde no maximo uma vez por mensagem recebida.
- Rate limit por remetente fica ativo por minuto e por dia.
- Rate limit global de envio fica ativo por minuto, com intervalo minimo entre envios.
- Se o transporte responder erro temporario, timeout, `429` ou `5xx`, o bridge pausa novos envios por `MIAUW_WHATSAPP_PROVIDER_PAUSE_ON_ERROR_MS` antes de tentar de novo.
- O roteador separa conversa solta de comando interno pela palavra `miauby`.
- Sem `miauby`, conversa simples usa Gemini e nao chama API interna. Comandos operacionais sem prefixo so chamam o core quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, o remetente esta em allowlist, o card esta liberado e a acao ainda exige pendencia/confirmacao.
- Com `miauby`, o core Miauby pode usar tools/ponte interna conforme guardrails; escritas fortes seguem dependentes de confirmacao/auditoria e nao devem ser tratadas como texto solto executavel.
- Antes de chamar o core, o bridge busca contexto compartilhado no PHP para usar o mesmo treino aprovado, perfil de voz, padroes, memoria curta multicanal e contratos de tools do Miauby interno. Se essa busca falhar, o bridge segue com contexto minimo e nao libera escrita direta.
- Depois de enviar resposta no WhatsApp, o worker tenta gravar memoria curta direto no Postgres do bridge. Erro nessa etapa registra diagnostico, mas nao deixa mensagem travada nem cria reenvio.
- Quando `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true`, o bridge pode preparar acoes fortes permitidas em `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ALLOWLIST`, guardar uma pendencia por remetente, expirar pendencias antigas e pedir `Sim`/`Nao` sem expor codigo curto ao usuario. Sem pendencia valida, `sim`, `nao`, `confirmar` ou `cancelar` sao apenas texto e nao executam escrita.
- Dados sensiveis continuam bloqueados localmente antes de chamar Gemini/core.
- Saudacoes simples como `oi`, `ola`, `teste`, `status` e `ajuda` respondem localmente, de forma super curta, sem chamar Gemini/core para reduzir latencia. Pedidos claramente fora do Miauby, como receita/bolo, filme, piada ou assunto amplo sem relacao operacional, tambem podem ser bloqueados localmente com resposta curta antes de gastar Gemini. O comando `miauby n8n` tambem responde localmente com as automacoes previstas e o que depende dos cards liberados para aquele numero.
- Audio fica desligado por padrao no Git. Quando `MIAUW_WHATSAPP_AUDIO_INPUT_ENABLED=true`, audio individual de remetente autorizado e baixado do transporte apenas no worker, limitado por `MIAUW_WHATSAPP_AUDIO_MAX_BYTES`, transcrito pelo Gemini e descartado. A transcricao segue o mesmo roteador: conversa simples vai para Gemini; comando operacional detectado chama o core/tools conforme permissao quando o ambiente permite comandos sem prefixo.
- Quando `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=true`, o bridge pode gerar audio de resposta. O modo `voice_on_voice` responde em audio somente quando a entrada veio por audio; `always` tenta audio para toda resposta sem botao; `never` desliga. Confirmacoes continuam por botoes/texto, nao por audio. Respostas faladas repetidas podem ser reaproveitadas em memoria por `MIAUW_WHATSAPP_AUDIO_TTS_CACHE_TTL_SECONDS`.
- Com `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`, foto, print, imagem encaminhada ou PDF/documento individual de remetente autorizado pode ser tratado como comprovante Pix. O destino precisa bater com o CNPJ/chave Pix `MIAUW_WHATSAPP_PIX_RECEIPT_CNPJ` ou com um nome correlato configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES`; assim, comprovantes sem CNPJ visivel ainda podem passar se o nome da empresa for reconhecido. O contato precisa ter card `Financeiro` liberado e a gravacao continua exigindo pendencia `Sim`/`Nao`. Se faltar valor ou pagador, ou se o destino nao bater por CNPJ/chave/nome, o bridge nao grava e pede os dados corrigidos por texto. Data/hora extraidas entram no lancamento; na correcao manual sem data/hora, o sistema usa o momento atual.

## Modo hibrido de IA

`MIAUW_WHATSAPP_AI_MODE` controla o motor de resposta:

- `miauw`: todas as respostas passam pelo `wimifarma-miauw-agent`, usando o core interno e a OpenAI configurada no Miauby.
- `gemini`: conversa curta passa pelo Gemini; mensagens que parecem comando interno continuam protegidas e podem ser roteadas ao core Miauby quando ele estiver configurado.
- `hybrid`: conversa solta passa pelo Gemini quando `GEMINI_API_KEY` estiver preenchida; mensagens com `miauby`, como `miauby faca sangria`, `miauby pedidos resumo` ou `sangria tal dia miauby`, vao para o `wimifarma-miauw-agent` com tools e guardrails. Quando `MIAUW_WHATSAPP_ALLOW_COMMANDS_WITHOUT_PREFIX=true`, comandos operacionais detectados sem `miauby`, como `sangria 10 Will`, tambem vao para o core, sem pular card liberado nem confirmacao.

No caminho do core, `apps/miauw-whatsapp` chama `site/miauw/agent-context.php` por POST interno tokenizado. O pacote retornado e cacheado por poucos segundos e inclui o mesmo `style_context` que o chat interno usa, com treino aprovado, perfil de voz, exemplos relevantes, memoria curta multicanal, contrato de personalidade e `tool_contracts` exportados do registry PHP. Isso evita dois Miaubys com personalidade/capacidades diferentes. No caminho Gemini, apenas a personalidade, perfil de voz, padroes, regras de treino aprovado, exemplos curtos e memoria curta entram como contexto sanitizado para conversa solta; contratos de tools e dados operacionais continuam fora desse caminho.

Quando confirmacoes por WhatsApp estiverem ligadas no ambiente, o bridge tenta primeiro `site/miauw/agent-actions.php` para comandos deterministas como financeiro/sangria e Gestao. Se o PHP preparar uma acao forte permitida, o bridge grava a pendencia em `miauw_whatsapp_confirmations` e pede `Sim`/`Nao` por texto simples na Evolution ou botoes interativos na Meta Cloud API. A Evolution so deve usar `/message/sendButtons/{instance}` quando `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS=true` estiver testado no numero real, porque a API pode aceitar botoes sem renderizar no WhatsApp normal. Ao clicar `Sim` ou responder `sim` com uma pendencia ativa, o bridge chama `agent-actions.php` em modo `execute`; ao clicar `Nao` ou responder `nao`, cancela sem gravar. A confirmacao continua auditada pelo PHP/bridge, e as escritas do Financeiro devem passar pelos endpoints internos tokenizados do app Node/Postgres quando `FINANCEIRO_INTERNAL_TOKEN` ou `MIAUW_GUARDIAN_TOKEN` estiver configurado.

Com `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=false`, o WhatsApp volta ao comportamento conservador: acoes fortes podem ser entendidas, mas a resposta orienta usar o Miauby interno/sistema para confirmar.

Se o Gemini falhar no modo hibrido, o bridge cai para o core Miauby apenas como fallback tecnico. O contexto enviado ao Gemini deve ser curto e sanitizado; nao enviar telefone completo, payload bruto, token, dados de cliente ou financeiro real. O prompt base do bridge preserva identidade/persona do Miauby, evita inventar horario, saldo, pedido ou dado operacional, pede somente o menor dado faltante e orienta `miauby menu`/card correto quando o assunto precisa do core. O Gemini nao deve desenvolver pedidos aleatorios fora da operacao, como `quero bolo`; nesses casos responde curto que foge do Miauby e oferece os cards da Wimifarma. Para baixa latencia e respostas completas com Gemini 2.5, usar `MIAUW_WHATSAPP_GEMINI_THINKING_BUDGET=0` e `MIAUW_WHATSAPP_GEMINI_MAX_OUTPUT_TOKENS` suficiente. Respostas simples do Gemini podem ficar em cache curto por `MIAUW_WHATSAPP_REPLY_CACHE_TTL_SECONDS`, sem payload bruto e sem dados operacionais.

## Audio no WhatsApp

O audio do WhatsApp usa Gemini em duas etapas independentes:

1. Entrada: o bridge guarda somente referencia sanitizada da midia recebida. No processamento da fila, ele baixa a midia via Evolution `/chat/getBase64FromMediaMessage/{instance}` ou via Media API da Meta, envia para `MIAUW_WHATSAPP_AUDIO_TRANSCRIBE_MODEL` e usa apenas a transcricao para seguir no roteador.
2. Saida: se `MIAUW_WHATSAPP_AUDIO_REPLY_ENABLED=true`, a resposta textual ja validada vira fala por `MIAUW_WHATSAPP_AUDIO_TTS_MODEL`. `MIAUW_WHATSAPP_AUDIO_TTS_VOICE=Zephyr` e `MIAUW_WHATSAPP_AUDIO_TTS_STYLE` orientam uma voz mais aguda, brilhante e levemente felina para o Miauby, sem clonagem de voz ou imitacao de pessoa real. Quando o Gemini devolve PCM, o bridge empacota como WAV antes de enviar. Se envio de audio falhar, cai para texto pelo mesmo transporte e registra `provider_reply_fallback` em `miauw_whatsapp_error_logs`.

O audio nao substitui guardrails. Escritas fortes seguem exigindo pendencia e confirmacao; mensagens de audio sem dados suficientes devem pedir o menor dado faltante; `sim/nao` por audio so tem efeito se a transcricao encontrar uma pendencia valida.

O painel `/miauw/whatsapp/` mostra motor usado (`local`, `blocked`, `gemini`, `gemini_cache` ou `miauw`), motivo da rota, latencia de geracao antes do envio e demora total entre recebimento do evento e envio pelo transporte. Essa telemetria fica na `miauw_whatsapp_outbox`/consulta com `miauw_whatsapp_events` e usa mascaras/hash fora da edicao da allowlist. O painel tambem mostra graficos simples de media/p95 por motor, uma visao de sincronia recente comparando mensagem recebida e resposta enviada, allowlist minimizada por padrao com telefone completo editavel, e uma area de erros abertos alimentada por `miauw_whatsapp_error_logs`.

O painel tambem mostra `n8n automacoes`: Pedidos e boletos, Financeiro, Deploy/checks e Miauby + n8n. O destino de cada rotina e calculado pelos cards liberados para contatos autorizados reais; LIDs da Evolution protegidos por alias nao entram como destinatarios. n8n apenas orquestra/agendeia, enquanto permissao, dados, escrita forte e auditoria continuam no backend Wimifarma. Para operacao atual, n8n deve chamar os endpoints internos `smoke-check` e `watchdog`; o bridge calcula os destinatarios com card `Miauby`, manda alerta apenas quando `notify` permitir, registra auditoria em `miauw_whatsapp_error_logs` e aplica cooldown para nao floodar a equipe. O worker tambem recupera outbox `pending` recente em lote pequeno e expira pendencias antigas por `MIAUW_WHATSAPP_OUTBOX_RECOVERY_MAX_AGE_MINUTES`, evitando mensagens velhas fora de contexto depois de queda/redeploy.

Desde 2026-05-29, o smoke-check executa os checks de health/proxy/core/Evolution em paralelo para nao somar todos os timeouts em uma chamada do n8n. O watchdog so considera `queued`/`pending` como travado quando `next_attempt_at` ja venceu; mensagens aguardando backoff normal nao devem gerar alerta. Se o transporte estiver em pausa por erro temporario, o worker falha rapido o envio e agenda retry com backoff, em vez de ficar bloqueado em `processing`/`sending` ate a recuperacao reprocessar a mesma mensagem.

Quando a Evolution/Baileys entregar remetente como LID/identificador longo em vez do telefone E.164, usar `MIAUW_WHATSAPP_RECIPIENT_ALIASES` no `.env` para mapear identificador recebido para telefone real autorizado, no formato `origem=destino`, separado por virgula quando houver mais de um. Essa configuracao fica fora do Git. Exemplo: se o painel tem `5544984134971`, mas o evento chega como `234668507005157@lid`, configurar `234668507005157=5544984134971`. A checagem de cards liberados deve considerar o identificador recebido e o telefone alias-resolvido, para que o mesmo contato mantenha permissoes de comandos internos no WhatsApp. No painel, esses LIDs ficam ocultos e protegidos contra edicao, bloqueio ou reautorizacao manual; o operador deve ajustar apenas o telefone real vinculado.

## Comprovante Pix CNPJ por midia

O fluxo de comprovante Pix por midia e opcional e desligado no Git. Quando `MIAUW_WHATSAPP_PIX_RECEIPT_IMAGE_ENABLED=true`, o bridge aceita foto, print, imagem encaminhada ou PDF/documento de remetente em allowlist, baixa a midia somente no worker, envia ao Gemini configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_OCR_MODEL` e espera um JSON com comprovante Pix, CNPJ/chave destino, nome destino, pagador, valor, data, horario, instituicao, texto OCR compacto e confianca. A flag manteve `IMAGE` no nome por compatibilidade com ambientes ja configurados, mas o comportamento cobre tambem PDF/documento.

Para gravar, todos estes pontos precisam passar:

- a mensagem veio de contato autorizado;
- o contato tem card `Financeiro` liberado;
- a midia foi identificada como comprovante Pix;
- o destino bate por CNPJ extraido, chave Pix extraida ou nome correlato configurado em `MIAUW_WHATSAPP_PIX_RECEIPT_DESTINATION_ALIASES` com score minimo `MIAUW_WHATSAPP_PIX_RECEIPT_MIN_TARGET_SCORE_X100`;
- existem valor e pagador com confianca suficiente; data e horario entram quando extraidos, mas nao bloqueiam a correcao manual curta;
- `MIAUW_WHATSAPP_CONFIRMED_ACTIONS_ENABLED=true` no ambiente e `criar_lancamento_financeiro` esta na allowlist de tools confirmaveis.

Quando passa, o bridge transforma a extracao em comando interno `pix cnpj R$ valor - pagador - obs ...`, chama `site/miauw/agent-actions.php` para preparar a acao e envia uma confirmacao `Sim`/`Nao`. Com Meta Cloud API, botoes interativos podem ser usados. Com Evolution API, o padrao e texto simples (`Responda SIM para gravar ou NAO para cancelar`) porque `sendButtons` pode retornar sucesso sem renderizar no WhatsApp normal/linked device; botoes na Evolution so devem ser ligados com `MIAUW_WHATSAPP_EVOLUTION_INTERACTIVE_CONFIRMATIONS=true` apos teste real. `Sim` grava no Financeiro Node/Postgres como lancamento `Pix CNPJ` por endpoint interno tokenizado; `Nao` cancela e orienta escrever os dados corrigidos no formato curto `pix cnpj 50,00 - Nome - obs opcional`. O typo `pix cpnj` tambem e aceito.

Midia de grupo continua bloqueada enquanto `MIAUW_WHATSAPP_GROUPS_ENABLED=false`. Se a rotina de comprovantes estiver em grupo, a postura recomendada e encaminhar o comprovante para o Miauby individual ou criar um numero/instancia separado, porque habilitar grupos amplia muito o risco de resposta indevida.

## Anti-flood e risco de bloqueio

Nao existe garantia tecnica de banimento zero, principalmente quando o transporte usa sessao WhatsApp Web/Baileys pela Evolution API. A postura operacional do Wimifarma deve ser conservadora:

- usar apenas remetentes em allowlist e com consentimento operacional claro;
- manter prefixo `miauby` exigido enquanto o canal estiver em estabilizacao; se desligar prefixo e liberar comandos sem prefixo, limitar a allowlist, manter grupos bloqueados e monitorar o painel para garantir que apenas conversa solta va ao Gemini e comandos internos virem confirmacao auditada;
- bloquear grupos por padrao;
- responder somente a mensagens iniciadas pelo usuario autorizado;
- manter uma resposta por mensagem recebida;
- usar respostas curtas, sem campanhas, disparos em massa ou mensagens repetidas;
- respeitar pedidos para parar contato;
- preferir Meta Cloud API oficial quando o objetivo deixar de ser uso interno controlado e virar atendimento amplo.

Para o VPS em producao inicial, recomenda-se comecar ainda mais restrito que o default do repositorio: `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_USER_RATE_LIMIT_PER_DAY=60`, `MIAUW_WHATSAPP_GLOBAL_RATE_LIMIT_PER_MINUTE=3`, `MIAUW_WHATSAPP_MIN_REPLY_DELAY_MS=2500`, `MIAUW_WHATSAPP_MAX_REPLY_DELAY_MS=5500` e `MIAUW_WHATSAPP_SEND_MIN_INTERVAL_MS=7000`. Esses limites podem subir depois de alguns dias sem erro, bloqueio, report ou queda de qualidade.

## Diagnostico rapido quando nao responde

Se `/miauw/whatsapp/health` estiver OK, mas o WhatsApp nao responder, primeiro verifique se a mensagem entrou na fila:

```bash
cd /home/ubuntu/projetos/wimifarma-com
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT created_at, event_type, status, ignore_reason, sender_phone_mask, left(body_text,80) FROM miauw_whatsapp_events ORDER BY created_at DESC LIMIT 8;"
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT o.created_at, o.sent_at, o.status, o.reply_engine, o.route_reason, o.reply_latency_ms, ROUND(EXTRACT(EPOCH FROM (o.sent_at - e.created_at)) * 1000)::int AS total_response_ms FROM miauw_whatsapp_outbox o JOIN miauw_whatsapp_events e ON e.id = o.event_id ORDER BY o.created_at DESC LIMIT 8;"
docker compose exec -T wimifarma-miauw-whatsapp-db psql -U wimifarma_miauw_whatsapp -d wimifarma_miauw_whatsapp -c "SELECT created_at, source, severity, phone_mask, left(error_summary,120), left(message_preview,120) FROM miauw_whatsapp_error_logs WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 8;"
```

Se o evento aparecer como `ignored/sender_not_allowed`, o numero nao passou na allowlist. O bridge compara hash direto, numero cifrado, alias da Evolution e variacoes brasileiras com/sem `55` e com/sem nono digito; se ainda bloquear, editar o telefone completo no painel e conferir se os cards necessarios estao liberados para aquele contato.

Se aparecer apenas `connection.update` com `missing_sender` e nenhum `messages.upsert`, o bridge nao recebeu texto; normalmente a trava esta no transporte Evolution/Baileys, nao na IA. Conferir a conexao e webhook:

```bash
cd /home/ubuntu/projetos/wimifarma-com
# usar EVOLUTION_API_KEY e EVOLUTION_API_INSTANCE do .env local, sem colar segredo no terminal compartilhado
curl -sS -H "apikey: $EVOLUTION_API_KEY" "http://127.0.0.1:8080/instance/connectionState/$EVOLUTION_API_INSTANCE"
curl -sS -H "apikey: $EVOLUTION_API_KEY" "http://127.0.0.1:8080/webhook/find/$EVOLUTION_API_INSTANCE"
```

Em 2026-05-27 foi observado um caso em que a Evolution mostrava `state=open`, mas so enviava `connection.update` e nenhuma mensagem. Reiniciar apenas o container da Evolution preservou a sessao e destravou `messages.upsert`:

```bash
cd /home/ubuntu/projetos/wimifarma-evolution-api
docker compose restart wimifarma-evolution-api
```

Depois do restart, mandar uma mensagem curta de teste e acompanhar a tabela `miauw_whatsapp_events`. Quando voltar a aparecer `messages.upsert` seguido de `replied` e outbox `sent`, o canal voltou.

## Evolution API

A Evolution API nao deve ser colocada dentro de `apps/miauw-whatsapp`. Ela roda como transporte separado no VPS, com segredos e estado proprios. O template versionado fica em `ops/evolution/`; a pasta real do VPS fica em `/home/ubuntu/projetos/wimifarma-evolution-api`, com `.env`, instancias, Postgres e Redis fora do Git.

Em 2026-05-26, o template foi fixado em `evoapicloud/evolution-api:v2.3.0` para uma nova tentativa de pareamento. A `v2.3.7` retornou `401 Unauthorized` e `Invalid buffer`; a `v2.3.6` tambem falhou com `Invalid buffer` porque ignorou `CONFIG_SESSION_PHONE_VERSION`. A `v2.3.0` ainda usa o pin `CONFIG_SESSION_PHONE_VERSION` ao iniciar o Baileys.

Em 2026-05-27, a instancia `wimifarma-business-no9-20260526190040` foi validada no VPS como `open`/conectada, com webhook apontando para `https://wimifarma.com/miauw/whatsapp/webhook?token=<MIAUW_WHATSAPP_WEBHOOK_TOKEN>` e eventos `QRCODE_UPDATED`, `CONNECTION_UPDATE` e `MESSAGES_UPSERT`.

Nao atualizar a Evolution API em producao direto para `latest` ou release candidate. Qualquer upgrade deve ser feito primeiro em stack/pasta separada, com backup do Postgres/Redis/instancias, validando manager, `connectionState=open`, webhook, `MESSAGES_UPSERT`, envio de texto e botoes. So promover depois de teste real com o numero/instancia de teste.

O manager operacional, quando necessario, deve ser acessado pelo manager embutido da API em `http://127.0.0.1:8080/manager` via acesso local/tunel. Nao manter container manager separado.

Para reduzir falhas de pareamento QR/codigo na Evolution/Baileys, a stack deve manter cache local, historico/contatos/chats/labels desligados e `CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198`. Esse ajuste evita sobrecarga e erros como `Invalid buffer` durante o login.

No `.env` do Wimifarma principal:

```text
EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080
EVOLUTION_API_INSTANCE=wimifarma-cashback-test
```

`EVOLUTION_API_KEY` deve receber o mesmo valor de `AUTHENTICATION_API_KEY` da stack Evolution.

Depois de conectar o numero por QR/codigo de pareamento, configurar o webhook da instancia para:

```text
https://wimifarma.com/miauw/whatsapp/webhook?token=<MIAUW_WHATSAPP_WEBHOOK_TOKEN>
```

Na Evolution API `v2.3.x` validada no VPS, `POST /webhook/set/{instance}` aceitou o corpo com a raiz `webhook`, nao o formato plano:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://wimifarma.com/miauw/whatsapp/webhook?token=<token>",
    "webhookByEvents": false,
    "webhookBase64": false,
    "events": ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"]
  }
}
```

`webhookByEvents` deve ficar `false`, para a Evolution nao anexar o nome do evento ao caminho do webhook.

O numero `+55 44 99739-4711` pode ser usado como teste se estiver sob controle da empresa, mas os remetentes autorizados ainda precisam entrar em `MIAUW_WHATSAPP_ALLOWED_SENDERS`.

## Meta Cloud API

O mesmo bridge tambem aceita transporte oficial da Meta:

```text
MIAUW_WHATSAPP_PROVIDER=meta
META_WHATSAPP_ACCESS_TOKEN=<token permanente ou temporario da Meta>
META_WHATSAPP_PHONE_NUMBER_ID=<Phone Number ID>
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=<token escolhido para verificacao>
META_WHATSAPP_APP_SECRET=<App Secret para validar X-Hub-Signature-256>
META_WHATSAPP_GRAPH_API_VERSION=v23.0
```

Callback URL na Meta:

```text
https://wimifarma.com/miauw/whatsapp/webhook
```

O `GET /miauw/whatsapp/webhook` responde o desafio `hub.challenge` quando o `hub.verify_token` confere com `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`. O `POST /miauw/whatsapp/webhook` processa payload `whatsapp_business_account`, extrai `messages[]`, aplica allowlist/prefixo/rate limit e envia resposta por `/{META_WHATSAPP_PHONE_NUMBER_ID}/messages`.

Cuidados da Meta:

- o token de acesso e segredo e deve ficar apenas no `.env`;
- `META_WHATSAPP_APP_SECRET` deve ser preenchido para validar `X-Hub-Signature-256`;
- mensagens livres so sao apropriadas dentro da janela de atendimento iniciada pelo usuario; fora dela, a Meta exige templates aprovados;
- o numero precisa estar cadastrado no WhatsApp Business Platform/Cloud API. Numero ja usado no WhatsApp comum ou Business App pode precisar ser removido/migrado antes de funcionar como numero de API.

## Testes

Valide localmente o app:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com\apps\miauw-whatsapp
npm.cmd run check
npm.cmd run build
```

Com Docker ativo:

```powershell
cd C:\Users\Thiesen\Desktop\wimifarma-com
docker compose up -d --no-deps --build wimifarma-miauw-whatsapp-db wimifarma-miauw-whatsapp wimifarma-com-web
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/health
curl.exe -sS http://127.0.0.1:3002/miauw/whatsapp/
```

Quando o login do painel estiver ativo, `/miauw/whatsapp/` deve retornar a tela de login sem cookie e deve abrir o painel apos `POST /miauw/whatsapp/login` com credenciais do ambiente. `/miauw/whatsapp/health` deve continuar respondendo JSON publico.

## Proximas etapas

1. Conectar o numero por QR/codigo de pareamento.
2. Configurar webhook da instancia.
3. Preencher `MIAUW_WHATSAPP_ALLOWED_SENDERS` com remetentes autorizados.
4. Testar com um remetente em allowlist e prefixo `miauby`.
5. Depois avaliar audio, midias e liberacao controlada sem prefixo.
